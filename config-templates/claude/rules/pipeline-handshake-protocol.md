---
paths:
  - "_bmad/bmm/workflows/4-implementation/**"
  - ".claude/skills/party-to-pipeline/**"
  - ".claude/hooks/pipeline-*.js"
  - ".claude/hooks/pipeline-*.test.js"
  - ".context-db/scripts/init-db.js"
  - "scripts/pipeline-config.json"
  - ".claude/skills/pipeline-window-control/**"
  - ".claude/skills/pipeline-subwindow/**"
---

# Pipeline ACK Handshake Protocol — party-to-pipeline v4.0.0

> **建立**: 2026-05-04 / **paths-scoped**: 2026-05-16(原 always-on 232 行降級為 lazy-load,只在編輯 pipeline 相關檔案時觸發)
> **適用**: party-to-pipeline self-contained orchestrator scripts (orchestrator.ps1 + 3 worker.ps1 + stop-report.ps1)
> **嚴重等級**: HIGH (與 skill-tool-invocation-mandatory 並列;原 toolkit-mirror-immediate-sync 已 FROZEN 2026-05-05 per single-engine-mode.md)

---

## 1. 為何需要本 Rule

party-to-pipeline v4.0.0 改版引入「中控 - 子視窗雙向 ACK handshake」流程,取代舊版輪詢 DB + signal file 設計。新流程涉:

- IPC 三 file (task / status / ack) 原子寫入
- Stop hook (stop-report.ps1) 自動寫 evidence-based status
- 中控驗證 evidence + 寫 ack
- 子視窗等 ack 後倒數 5 秒 graceful close
- 三重 confirm 子視窗已關 (PID + tracker + ack mtime)

**本 rule 規範這些 artifact 的 schema、order、生命週期,確保中控 / 子視窗 / Stop hook 三方 contract 一致**。

---

## 2. Applies When

任何涉及以下檔案 / 行為時:

- Edit `.claude/skills/party-to-pipeline/scripts/*.ps1`
- Edit `.claude/hooks/pipeline-*.js` (相關 Stop hook)
- Edit `scripts/pipeline-config.json` 的 `handshake` section
- Edit `.context-db/scripts/init-db.js` 的 `stories.task_track` 或 `workflow_executions.evidence_json` 欄位
- 新建 `.claude/ipc/{StoryId}__{Timestamp}/` 內檔案
- 設計新 worker / orchestrator 變體

---

## 3. IPC Schema 契約

### 3.1 IPC dir 命名

```
.claude/ipc/{StoryId}__{Timestamp}/
```

- `{StoryId}` = Story ID (如 `td-pipeline-...`)
- `{Timestamp}` = `yyyyMMdd-HHmmss` (orchestrator 啟動時刻)
- 三段唯一鍵 (R5 對策) — 避免並發 / retry 衝突

### 3.2 task-{phase}.json (中控 → 子視窗)

```json
{
  "phase": "create-story",
  "story_id": "...",
  "task_track": "main",
  "complexity": "M",
  "model_id": "claude-opus-5[1m]",
  "effort": "max",
  "attempt": 1,
  "ipc_dir": "/abs/path/...",
  "_created": "2026-05-04T01:30:00+08:00"
}
```

### 3.3 status-{phase}.json (Stop hook → 中控)

```json
{
  "phase": "create-story",
  "status": "completed",        // completed | failed | partial
  "evidence": {
    "task_track": "main",
    "db_status": "ready-for-dev",
    "tasks_backfilled": true,
    "file_list_count": 5,
    "files_changed": ["..."],
    "session_id": "...",
    "phase": "create-story"
  },
  "error": "",
  "session_id": "...",
  "timestamp": "2026-05-04T01:30:30+08:00"
}
```

### 3.4 ack-{phase}.json (中控 → 子視窗)

```json
{
  "phase": "create-story",
  "ok": true,                     // true | false
  "message": "Validation passed, ready to close",
  "next_phase": "dev-story",      // empty if last phase
  "timestamp": "2026-05-04T01:31:00+08:00"
}
```

### 3.5 system-{phase}.txt (worker → claude)

純文字,worker 透過 `claude --append-system-prompt-file` 注入。包含 Story DB context + protocol-template.md 全文。

### 3.6 D1 中控指示注入(whp-6,`$userTask` 前綴,非獨立 IPC 檔)

不透過 IPC dir 內新檔案傳遞(§3.1-3.5 四類皆非此),而是 4 支 `worker-{create,dev,review,general}.ps1` 組裝 `$userTask` 時呼叫 `node .context-db/scripts/read-worker-directives.js --run-id <run_id>`,將 `worker_messages` 表內待送 `controller-to-worker` 訊息以 `[中控指示 seq=N type=T]` banner **前綴**(prepend)併入 —— **順序強制**:此前綴必須位於既有 ultrathink 附加段**之前**,確保 ultrathink directive 仍是 `$userTask` 最後一段(BR-008/BR-010/BR-011)。查無待送指示 / DB 不可用等異常一律 fail-open(exit 0 靜默,不影響原 `$userTask` 組裝),僅參數解析失敗才 exit 3。同一 transaction 內讀取 + 標記 `delivered`,防重複注入。

---

### 3.7 `reported` 寫入端契約 + L2 通道(whp-8,2026-08-02)

> 補 §3.3 status 生命週期的一個空隙:`stop-report.ps1` 寫 `status-{phase}.json` 之外,同一 `$runId` 區塊內**另有**一個獨立於心跳的 CAS statement,把 `worker_runs.lifecycle` 從 `running`/`revising` 推進至 `reported`(`reported_at` 蓋當前 turn 時間戳)。此欄位在 whp-8 之前**從未被任何程式寫入**(全庫實測 17 筆 `worker_runs` 全數 `abandoned`,`reported_at`/`ack_at`/`notify_count` 皆為 0)。

**寫入端契約**(`.context-db/scripts/worker-lifecycle-advance.cjs`,`stop-report.ps1` `require()` 呼叫):

- CAS `WHERE run_id=@runId AND lifecycle IN ('running','revising')` — 非此二態時 0 rows affected,`reported_at` 保持不變(冪等,已 `awaiting-review`/`approved`/`closed` 的 run 重跑心跳不受影響)
- 獨立 try/catch,失敗記 `LIFECYCLE-WRITE-FAILED`(區別於既有 `DB-WRITE-FAILED`),不影響心跳與 `worker_handoffs` 既有寫入
- **`.context-db/scripts/` 下用 `.cjs` 副檔名**(非 `.js`)—— 該目錄 `package.json` 宣告 `"type":"module"`,一般 `.js` 會被當 ES module 解析,`stop-report.ps1` 的 `require('__LIFECYCLE_MODULE__')` 會拋 `"module is not defined in ES module scope"`。此為 whp-8 dev 階段真實踩到的缺陷:vitest 對模組本身的隔離單元測試(直接 `import`)完全測不出,因其繞過了 `require()` 的實際路徑解析;唯有 `smoke-test.ps1` 端到端 spawn `stop-report.ps1` 才捕捉到(見 Group 13)。任何未來在 `.context-db/scripts/` 新增、且會被 CommonJS `require()` 消費的模組,務必比照用 `.cjs`。

**L2 通道**(`.claude/hooks/worker-notify-inject.js`,`UserPromptSubmit` 第 5 顆 hook):

- 讀 `worker_runs`/`worker_handoffs`/`guardian_heartbeat` 唯讀彙整六類待辦(🔔 待確認 / 🔍 待驗證 / 🚪 待關窗 / 🔴 需注意 / ⚠ 流程異常 / 👁 守護心跳),`PIPELINE_RUN_ID` 存在即先於開 DB 前 exit(worker 子視窗零污染,同 `ctrl-channel-inject.js` 排除範式)
- 5 筆明細上限 + 800 字元封頂(對齊既有 chain 已 9454 字元逼近 10,000 官方上限的既有 debt)
- `notify_count >= ackEscalateAfterRounds`(`pipeline-config.json` `workerProtocol`,whp-8 新增,預設 3)或存在 `流程異常` 時,額外填 `systemMessage`(UserPromptSubmit 唯一對使用者可見欄位)

---

### 3.8 D2 有界等待輪詢契約(whp-11,2026-08-02)

> 補 §3.7 的另一半空隙:`reported` 寫入端契約描述的是「本輪 turn 正常結束」的路徑。D2 是**在該路徑之前**插入的一個有界輪詢分支 —— 若中控剛好在 turn 結束前後那個時間窗內寫好待送指示,Stop hook 會偵測到並改回應 `decision:"block"`,讓同一視窗的同一 turn **續轉**而非結束,省下一次視窗來回(SSoT §20.1)。

**寫入端契約**(`stop-report.ps1`,委派 `.context-db/scripts/worker-directive-poll.cjs` 的 `peekPending`/`stampKnocked`/`buildKnockDecision`/`resolveGraceSec` 四個純函式):

- **執行時機**:`$statusValue` 定案後、**首次** `Write-IpcStatus` 呼叫之前 —— 命中時該檔案本輪**必不存在**(§5 F16)
- **輪詢節奏**:立即首查(無前置 sleep)+ 固定間隔重查,上限 `workerProtocol.hookGraceSec` 秒(config 缺鍵預設 120,超出 `[0,300]` 夾住並記 `D2-GRACE-CLAMPED` log)。`0` 是**完全退場開關**:即使當下有 pending 指示也不查,直接視為未命中(零成本,非「零秒視窗但仍查一次」)
- **命中**(`decision:"block"`):`stampKnocked` 標記 `worker_messages.knocked_at`(迴圈上界,同一則指示至多敲門一次,**不改** `state`/`delivered_via`)→ 呼叫 `Invoke-DbHeartbeat -SuppressLifecycleAdvance`(心跳/`worker_handoffs` 仍寫,**但不**推進 `lifecycle`)→ stdout 印出 `buildKnockDecision` 產出的 JSON → **必 `exit 0`**(官方契約:`exit 2` 會丟棄 stdout 改把 stderr 當錯誤回饋)
- **未命中**:原路徑不變 —— 落回既有 `Write-IpcStatus` + 未抑制的 `Invoke-DbHeartbeat`(§3.7 CAS 正常推進至 `reported`)
- **只敲門不推內容**:敲門文字只含「有幾則、`msg_id`、去哪讀」(`read-worker-directives.js --run-id`),**不含**指示 `body` —— 內容仍由 worker 主動讀 DB 取得,與 D1 共用同一份四步協議(見 `.claude/skills/party-to-pipeline/scripts/protocol-template.md` §D2 敲門)
- **fail-open**:任何輪詢失敗(DB 不可達 / 模組載入失敗)或 `PIPELINE_RUN_ID` 未設定(整個分支不執行,log 無任何 `D2-POLL` 字樣)一律 `exit 0`,不影響既有 `status-$phase.json` 落地;失敗記 `D2-POLL-FAILED run_id=...` log(區別於 §3.7 既有的 `DB-WRITE-FAILED`/`LIFECYCLE-WRITE-FAILED`)

---

### 3.9 慢環敲門契約(whp-12,2026-08-02)

> §3.8 的 D2 是**快環**:它只在 turn 結束前後那個時間窗內命中。revise 迴圈的常態節奏(worker 回報 → 中控**讀完報告** → 裁決 → 寫指示)必然錯過該窗 —— 指示寫好時 worker 早已 idle、`hookGraceSec` 早已逾時。**慢環**補的正是這一段:對已 idle 的 worker console 注入一行 ASCII 文字 + 一個 Enter,在**原視窗原 session** 觸發新 turn。
>
> 它走的仍是 SSoT §20 的 **T1**(TUI 收到輸入),是 **D3(人親自打字)的程式化版本**,不是第四條通道 —— Win32 層一個合成按鍵與一個真人按鍵是同一件事。所有 hook 皆為被動事件回呼,idle session 沒有事件可觸發,故 T2 在此無解。

**兩層交付**(分層唯一理由是 `ccb-4-ctrl-notify-knock` 消費同一份實作):

| 層 | 檔案 | 職責 |
|:--|:--|:--|
| 原語(收件端中立) | `console-knock.ps1` | 參數只有 `-TargetPid` + `-Text`;零 domain 表查詢(靜態守護),`ccb-4` 原樣複用 |
| worker 域包裝 | `knock-worker.ps1` + `.context-db/scripts/knock-worker-ops.js` | 判活 → lifecycle 白名單 → peek → 敲門 → stamp |

**契約要點**:

- **目標取 `wrapper_pid` 而非 `claude_pid`**:`AttachConsole` 接受任何已附著於該 console 的 PID,而 4-Tuple 判活(`judgeLiveness()`)驗的就是 `wrapper_pid` 的 CommandLine —— 取同一個 PID 使「判活的對象」與「注入的對象」是同一件事,不留兩者分歧的縫隙
- **lifecycle 白名單** `reported` / `awaiting-review` / `revising`:敲門的場景是 worker 已回報。此白名單同時是 mid-turn 注入的正常路徑防線(`running` 不在其中)
- **與 D2 共用 `worker_messages.knocked_at` 迴圈上界**:`peekPending` 的 `knocked_at IS NULL` 使兩環物理互斥,不新增第二個欄位
- **只敲門不推內容**:文字逐字取自 `buildKnockDecision().reason`(與 D2 同源),故 `protocol-template.md` §D2 那節兩環通用,**收件端零改動**
- **stamp 在注入成功之後**(與 D2 相反):D2 輸出 decision 即等於送達,慢環的送達是 `WriteConsoleInput` 回傳成功。先 stamp 後失敗會永久吃掉該指示的一次敲門預算
- **送出鍵必須與文字分批寫入**:同批送出時 TUI 會把整串連同結尾的 `\r` 判為一次貼上,`\r` 成為內容而非按鍵(whp-12 PoC 實證)。間隔由 `-SubmitDelayMs` 控制,預設 250ms
- **fail-open / fail-closed 分野**:DB 不可讀 → `exit 0` 不敲(不敲門無害);判活探測不可用 → `exit 2` 零注入(對未驗證的 PID 注入等於對陌生 console 打字)。與 `close-worker.ps1` 的 `WHP6-E07` 同理
- **kill switch** `workerProtocol.knockEnabled`(預設 `true`),消費端在 `resolveKnockEnabled()`
- **稽核**:每次呼叫於 `logs/console-knock.log` 留恰一行(時間戳 `+08:00` / target PID / outcome / 文字),成功與失敗路徑皆寫

---

### 3.10 中控域敲門契約(ccb-4,2026-08-03)

> §3.9 的敲門原語當初被設計成**對收件端中立**,具名理由就是「`ccb-4` 要消費同一份實作」。本節記其兌現:`knock-controller.ps1` 是原語的**第二個消費端**,`console-knock.ps1` **逐字不改**(`git diff --stat` 為空是該卡驗收項)。兩個包裝共用原語、共用 F17 紀律,差異全在 domain 判準。

| 面向 | `knock-worker.ps1`(whp-12) | `knock-controller.ps1`(ccb-4) |
|:---|:---|:---|
| 目標來源 | `worker_runs.wrapper_pid` | `controller_windows.console_pid`(以 `last_seen_at` 最新者為準) |
| 判活 | **4-Tuple**(`judgeLiveness()`) | **2-Tuple**:PID 在活行程 map + `CommandLine` 與 `console_cmdline` case-insensitive **相等** |
| 為何不共用判活 | — | 4-Tuple 的 Tuple 3/4 檢查 `ipc_dir` 與 `worker-{suffix}.ps1`,兩者皆 worker 專屬 token,中控視窗不存在;等價守衛是「命令列是否仍是綁定當下登記的那條」(同一個防 PID 重用目的,換一個對中控成立的判準) |
| 迴圈/速率上界 | `worker_messages.knocked_at` | `controller_windows.last_knock_at` + `ctrlChannel.knockMinIntervalSec` |
| 文字 | 取自 `buildKnockDecision().reason` | `[ctrl-channel] {N} unread message(s) -- run read_ctrl_messages to read and sign off`。**純 ASCII 故不含軌名** —— 6 個 canonical 軌名皆 CJK,而原語在任何 Win32 呼叫前就拒絕 `> 0x7E`;收件視窗本就知道自己是哪一軌 |
| kill switch | `workerProtocol.knockEnabled` | `ctrlChannel.knockEnabled` |

**共通不變量**(與 §3.9 逐字相同,不因 domain 不同而放寬):stamp 在注入**成功之後**(先 stamp 後失敗會永久吃掉該次敲門預算)· DB 不可讀 → fail-**open**(exit 0 不敲) / 判活探測不可用 → fail-**closed**(exit 2 零注入)· 只敲門不推內容(留言 body 一律由收件端自己 `read_ctrl_messages` 取回)· 每次呼叫留恰一行稽核。

行為 SOP(何時該敲 / 何時不必 / post 後流程)見 `phycool-ctrl-channel` skill,本節只記契約骨架。

---

## 4. Mandatory Order

```
中控 orchestrator.ps1                   子視窗 worker-{phase}.ps1
    │
    │ Step 1: Clear-IpcStage(Phase)
    │ Step 2: Write-TaskFile (atomic)
    │ Step 3: Start-Process worker
    │  ──────────────────────────►  Step 4: Read task
    │                                Step 5: claude --model X (interactive)
    │                                  │ (BMAD workflow + tasks-backfill)
    │                                  │
    │                                Step 6: claude turn end → Stop hook auto-fire
    │                                                       │
    │                                       [stop-report.ps1]
    │                                            │ env guard
    │                                            │ collect evidence
    │                                            │ atomic Write-StatusFile
    │  ◄──────────────────────────────────────────┘
    │ Step 7: Wait-StatusFile (max 1800s)
    │ Step 8: Confirm-StageResult (DB target / tasks ✅ / file_list)
    │ Step 9: Write-AckFile (atomic, ok=true/false)
    │  ──────────────────────────►  Step 10: Wait-AckFile (max 60s)
    │                                Step 11a (ok=true): Start-Countdown 5s
    │                                Step 11b (ok=false): stderr feedback, retry
    │                                Step 12: Update-Tracker(closed)
    │                                Step 13: ps1 exit (claude already dead)
    │ Step 14: Wait-WindowClosed (triple-confirm)
    │   ├ PID dead? ✓
    │   ├ tracker.closed_at written? ✓
    │   └ ack file mtime > worker start time? ✓
    │ Step 15: Update-Tracker(status=closed)
    │ Step 16: Proceed to next phase
    ▼
```

**violation = breaking contract**:

- 跳過 Step 1 Clear-IpcStage → retry 殘留 ack 誤判
- Step 4 之前 worker 修改 task file → 違反 read-only 契約
- Step 6 之前 agent 主動寫 status / ack → 與 Stop hook 雙寫
- Step 8 跳過驗證直接 ack → 失去 evidence-based 保護
- Step 10 不等 ack 直接 exit → 失去雙向確認
- Step 14 不做三重 confirm 直接進下一階段 → 殘留進程

---

## 5. FORBIDDEN

| # | 禁止 | 原因 |
|:-:|:-----|:----|
| F1 | IPC dir 不含 timestamp 段 (e.g. `.claude/ipc/{StoryId}/`) | R5 — 並發 / retry 衝突 |
| F2 | task / status / ack file 命名不含 `-{phase}` suffix | 多 phase 共用 dir 但 file 衝突 |
| F3 | Stop hook 不寫 atomic (直接 Out-File 而非 tempfile + Move-Item) | R2 — Windows 檔案鎖 race |
| F4 | 中控讀 status 不做 retry (直接 ConvertFrom-Json fail throw) | R2 — JSON 半寫 parse 失敗 |
| F5 | stop-report.ps1 缺 env guard `PHYCOOL_ORCHESTRATOR_MODE` check | 非 orchestrator session 誤觸 |
| F6 | stop-report.ps1 註冊 settings.json Stop hook 順位錯位 (非第 2 位) | R1 — 順位影響 evidence 完整性 |
| F7 | worker 跳過 wait ack 直接 exit | 失去雙向確認 |
| F8 | 中控不做三重 confirm closed | 視窗未關殘留進程 |
| F9 | task_track 欄位 NULL 但 worker 不處理 fallback | 數據不一致風險 |
| F10 | retry (dev-story-fix-Rn) 重用 ack file (不清前次) | R7 — 殘留誤判 |
| F11 | ACK 規則注入 prompt (不透過 protocol-template.md) | R8 — 32K cmdline limit |
| F12 | handshake.enabled flag 永久 disable 但仍嘗試走 ACK 流程 | 設計矛盾 |
| F13 | 子視窗 agent 主動寫 status / ack file | 與 Stop hook + 中控雙寫衝突 |
| F14 | orchestrator.ps1 內部呼叫 claude-launcher-interactive | v4.0.0 self-contained 設計違反 |
| F15 | (whp-6)D1 指示注入置於 ultrathink 附加段**之後**,或以 append 而非 prepend 方式組裝 | ultrathink 需保持 `$userTask` 最後一段(BR-008/BR-010/BR-011);D1 banner 前綴反轉會使 ultrathink 失效 |
| F16 | (whp-11)D2 命中時寫 `status-{phase}.json` 或推進 `worker_runs.lifecycle` | 命中不是 turn 結束(`worker-lifecycle-judgment.md` §5 Q6:該檔是 turn 結束的唯一合法信號);推進 lifecycle 等於偽造一次已結束的 turn,且會讓下一則指示的迴圈上界判斷(`knocked_at`)與 `reported_at` 語意矛盾 |
| F17 | (whp-12;**ccb-4 擴及 `knock-controller.ps1` / `knock-controller-ops.js`**)在 `console-knock.ps1` / `knock-worker.ps1` / `knock-controller.ps1` / `knock-controller-ops.js` 內加入任何行程終止、關窗、或視窗焦點操作 | 敲門是**純加法**通知(使用者硬裁定②③:機制只通知不殺)。加入終止原語會讓「敲門」與「關窗」兩條路徑的授權邊界混同 —— 關窗有 `close-worker.ps1` 的五項前置 + CAS 終態把關,敲門沒有,也不該有;焦點操作則會把焦點從使用者當下的工作搶走,違背背景通知的定位。三類皆有 smoke Group 16 靜態守護(T-WHP12-03/04),且守護不對註解開例外 —— 連說明文字都不得寫出那些 API 名稱 |

---

## 6. Self-Check (執行前 / Edit 前 5 題)

1. **本次變更是否破壞 IPC schema 契約?(task / status / ack 任一 shape 改變)**
2. **Stop hook 順位是否仍在 settings.json Stop chain 第 2 位?**
3. **Atomic write (tempfile + Move-Item -Force) 是否仍套用所有 IPC 寫入?**
4. **Triple-confirm closed (PID + tracker + ack mtime) 是否仍是中控 advancement 條件?**
5. **handshake.enabled flag 與本次變更的相容性?**

---

## 7. Schema 變更

### 7.1 stories 表新增欄位 (init-db.js)

```sql
ALTER TABLE stories
ADD COLUMN task_track TEXT DEFAULT 'main'
  CHECK (task_track IN ('main','side'));
```

- `main` = PhyCool SaaS 業務 code
- `side` = toolkit / 環境 / 工作流升級

### 7.2 workflow_executions 表新增欄位

```sql
ALTER TABLE workflow_executions
ADD COLUMN evidence_json TEXT NULL;
```

NULLABLE — 舊紀錄不需 backfill。新 ACK 流程結束後寫入 status.json 完整 evidence。

---

## 8. Migration 路徑

新 schema 對既有 DB 安全套用:

```bash
node .context-db/scripts/init-db.js  # idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS
```

既有 stories 紀錄 `task_track` 自動填 `'main'` (DEFAULT)。Story-by-story 確認後,可手動 UPDATE 為 `'side'` (適用 epic-governance / td-token-decrease-* 等)。

---

## 9. Mode C General-Task IPC 變體(party-to-pipeline v5.3.0)

Mode C(主視窗直控通用任務,詳 `.claude/skills/party-to-pipeline/references/general-task-mode.md`)使用**簡化 IPC 契約**,與 §3-§4 三檔 ACK 流程刻意不同:

| 項目 | BMAD 三階段(§3-4) | Mode C general |
|------|------------------|----------------|
| IPC 檔 | task / status / ack 三檔 + system | task-general.json + prompt-general.txt + system-general.txt + status-general.json(**無 ack 檔**) |
| 中控 | orchestrator.ps1(Confirm-StageResult + Write-AckFile) | **主對話視窗親自**(dispatch-general.ps1 薄手只 spawn + 有界確認 + 摘要) |
| worker 收尾 | Wait-AckFile → countdown → self-kill | **🔴 已退場(2026-08-01 whp-2)**:`close_mode=auto`(worker watchdog 於 status 落地後 kill claude)/ `controller`(dispatcher lingering grace → `Stop-WorkerSafe`)兩種收尾模式**皆已封存**,連同 gt-smoke-001 當初據以建立此設計的「必機械收尾」前提一併作廢——使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」後,**視窗永不自動關閉**,`generalTask.close_mode`/`close_delay_sec` 讀取邏輯已無消費者(死碼封存,見 `worker-general.ps1` whp-2 標記段)。**(2026-08-01 whp-6 已落地)** 關窗一律走 `.claude/skills/party-to-pipeline/scripts/close-worker.ps1`(中控唯一程式化關窗途徑,C2 五項前置 + C3 4-Tuple 判活 + C4 CAS 終態先於 taskkill),原「whp-6 將提供」預告已兌現 |
| evidence | db_status / tasks_backfilled / file_list | files_changed / report_path / report_exists(stop-report.ps1 v1.1.0 general 分支) |
| 驗證 | phaseTargetStatus 機械驗證 | 主視窗 G3 審查 V1-V5(git diff + 報告實質比對) |

**FORBIDDEN 對應調整**:
- **F7(worker 跳過 wait ack)對 Mode C by-design 豁免** —— 無 orchestrator 寫 ack,worker 不再自行關窗(視窗永不自動關閉,見上表)
- **F8(中控三重 confirm)** —— 🔴 **已退場(2026-08-01 whp-2)**:原「dispatcher hybrid wait(進程退出 OR status + lingering grace)」等待迴圈已全數封存,`dispatch-general.ps1` 改為**有界確認即退出**(`dispatchConfirmSec` 預設 60s,見到 `claude.exe` 子行程或逾時但 wrapper PID 存活即退出,不再等待視窗關閉);**「主視窗隨時可 `Stop-WorkerSafe`」一句已作廢** —— `Stop-WorkerSafe` 函式本體仍在 `shared-utils.ps1`,但薄手已無任何呼叫端,不得繞道呼叫它自動關窗(對齊 `worker-lifecycle-judgment.md` FORBIDDEN)
- F1(IPC dir 三段唯一鍵)/ F2(-{phase} suffix)/ F3(atomic write)/ F5(env guard)/ F13(agent 禁手寫 status)對 Mode C **照常適用**(phase=`general`)
- 任務報告檔必在 **IPC dir 外**(generalTask.report_dir)—— worker agent 以 Write 工具寫入,IPC artifacts 仍由 wrapper / Stop hook 專管(F6 精神不變)

**v5.4.0 擴大適用(v5.16+ 收尾機制已由 whp-2 取代,見上表)**:BMAD 三階段(create-story / dev-story / code-review)**E2 預設亦走本 §9 dispatch 薄手變體**(evidence = db_status / tasks_backfilled;檔案 ack 由 DB 握手鏈 `reported → ack_worker_run → gate_worker_run → close-worker` 取代)。§3.1-§3.5/§4 檔案式 ACK 流程僅存於 E1 orchestrator 批次路徑 —— **該路徑已於 2026-08-03 🔒 FROZEN**(party-to-pipeline v5.24.0):worker 側 `Wait-AckFile`(v5.4.0 移除)與自關機制(whp-2 封存)相繼退場後,`orchestrator.ps1` 的 `Wait-WindowClosed` 必然逾時並走 `Stop-WorkerSafe` 強殺(orchestrator.ps1:325-329),牴觸使用者硬裁定②③「只通知不殺」;§3.1-§3.5/§4 自此為**歷史契約**(僅供解凍改造參考),現行握手契約 = §3.6-§3.10 + party-to-pipeline `references/ack-handshake.md`(DB 閉環)。

---

## 10. Related Rules

- `.claude/rules/skill-tool-invocation-mandatory.md` SUPREME — Skill 升版必走 Skill tool
- `.claude/rules/skill-sync-gate.md` — Skill 與 code 同步閘門
- ~~`.claude/rules/toolkit-mirror-immediate-sync.md`~~ — **FROZEN 2026-05-05** per `single-engine-mode.md`(toolkit 鏡像 sync 機制停用,規則本身已刪)
- ~~`.claude/rules/dual-repo-push-discipline.md`~~ — **retired 2026-05-16**,整合至 `.claude/rules/single-engine-mode.md` §FROZEN Future-Unfreeze SOP
- `.claude/rules/constitutional-standard.md` — Code Verification + Backend Contract Mandate

---

## 11. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.8.1** | **2026-08-03** | **§9 E1 現況校正(party-to-pipeline v5.24.0 握手閉環 SOP 補全配套)**。原句「§3-§4 完整 ACK 流程僅存於 E1 orchestrator 批次路徑(該路徑不受 whp-2 影響,仍走原 ACK handshake)」對「不受影響」的陳述已失真 —— E1 程式碼確實未被 whp-2 修改,但其握手**對手端**(worker `Wait-AckFile` v5.4.0 移除 + 自關 whp-2 封存)已全數退場,ack 檔無人讀、`Wait-WindowClosed` 必逾時走 `Stop-WorkerSafe` 強殺(orchestrator.ps1:325-329),等於每階段必然 force-kill,牴觸使用者硬裁定②③。改記 E1 🔒 FROZEN(2026-08-03),§3.1-§3.5/§4 降為歷史契約,現行契約指向 §3.6-§3.10 + party-to-pipeline `references/ack-handshake.md` v2.0.0(DB 閉環)。配套 `worker-lifecycle-judgment.md` §1 同句同步。走 `Skill(skill="cc-config-author")`。 |
| **1.8.0** | **2026-08-03** | **`ccb-4-ctrl-notify-knock` Rule Sync**。新增 §3.10「中控域敲門契約」—— §3.9 的原語當初刻意設計成對收件端中立(參數只有 `-TargetPid` + `-Text`,零 domain 查詢),具名理由就是「`ccb-4` 要消費同一份實作」,本節記其兌現。以對照表記兩個包裝的 domain 差異(目標來源 `worker_runs.wrapper_pid` vs `controller_windows.console_pid` / **4-Tuple vs 2-Tuple 判活** —— 後者不複用 `judgeLiveness()` 的理由是其 Tuple 3/4 檢查 `ipc_dir` 與 `worker-{suffix}.ps1` 兩個 worker 專屬 token,中控視窗不存在 / 迴圈上界欄位 / **敲門文字純 ASCII 故不含 CJK 軌名** / 各自的 kill switch),並明列不因 domain 不同而放寬的共通不變量(stamp 在注入成功之後 · DB 不可讀 fail-open vs 判活探測不可用 fail-closed · 只敲門不推內容 · 恰一行稽核)。F17 由具名 2 支腳本擴及 **4 支**(新增 `knock-controller.ps1` / `knock-controller-ops.js`,兩者皆有靜態斷言把關,守護同樣不對註解開例外)。行為 SOP 歸 `phycool-ctrl-channel` skill,本 rule 只記契約骨架,不重複維護。走 `Skill(skill="cc-config-author")`。 |
| **1.7.0** | **2026-08-02** | **`whp-12-knock-console-inject` Rule Sync(Task T5.1)**。新增 §3.9「慢環敲門契約」—— §3.8 的 D2 是快環,只在 turn 結束前後那個時間窗內命中;revise 迴圈的常態節奏(中控讀完報告才裁決)必然錯過該窗,慢環補的正是這一段。記錄:兩層交付(收件端中立原語 `console-knock.ps1` / worker 域包裝 `knock-worker.ps1` + `knock-worker-ops.js`,分層唯一理由是 `ccb-4` 消費同一份實作)· 目標取 `wrapper_pid` 使判活對象與注入對象同一 · lifecycle 白名單 · 與 D2 共用 `knocked_at` 迴圈上界 · 文字與 D2 同源故收件端零改動 · stamp 在注入成功之後(與 D2 相反,理由已記)· **送出鍵必須與文字分批寫入**(同批送出時 TUI 判為貼上,`\r` 成內容而非按鍵 —— PoC 實證)· fail-open/fail-closed 分野 · kill switch · 稽核 log。新增 F17(禁在兩支新 script 內加入終止 / 關窗 / 焦點操作,附 smoke Group 16 靜態守護與「守護不對註解開例外」之說明)。走 `Skill(skill="cc-config-author")`。 |
| **1.6.0** | **2026-08-02** | **`whp-11-d2-inline-revise` Rule Sync(Task T12)**。新增 §3.8「D2 有界等待輪詢契約」—— 補 §3.7 的另一半空隙:`reported` 寫入端契約描述的是 turn 正常結束路徑,D2 是在其之前插入的有界輪詢分支(命中即 `decision:"block"`,同視窗同 turn 續轉,不寫 `status-{phase}.json`、不推進 `lifecycle`)。記錄執行時機(`$statusValue` 定案後、首次 `Write-IpcStatus` 之前)/ 輪詢節奏(立即首查 + 固定間隔至 `hookGraceSec`,`0` 為完全退場開關)/ 命中與未命中兩分支行為 / fail-open 契約(`D2-POLL-FAILED` log,區別於既有 `DB-WRITE-FAILED`)。新增 F16(D2 命中時寫 status 檔或推進 lifecycle 之禁令)。走 `Skill(skill="cc-config-author")`。 |
| **1.5.0** | **2026-08-02** | **`whp-8-report-ack-notify` Rule Sync(Task T5.3)**。新增 §3.7「`reported` 寫入端契約 + L2 通道」—— `worker_runs.lifecycle` 首次可達 `reported`(`stop-report.ps1` 內獨立 CAS statement,`worker-lifecycle-advance.cjs`)+ `.claude/hooks/worker-notify-inject.js`(`UserPromptSubmit` 第 5 顆 hook)六類待辦彙整。記錄一個真實踩到的缺陷:`.context-db/scripts/` 下 CommonJS 模組須用 `.cjs` 副檔名(該目錄 `package.json` 宣告 `"type":"module"`),否則 `require()` 拋 `"module is not defined in ES module scope"`——vitest 隔離單元測試測不出,唯 `smoke-test.ps1` 端到端 spawn 才捕捉到。走 `Skill(skill="cc-config-author")`。 |
| **1.4.0** | **2026-08-01** | **`whp-6-directive-delivery-and-close` Skill Sync(Task 6.6)**。新增 §3.6「D1 中控指示注入」—— 非獨立 IPC 檔,而是 4 支 worker-*.ps1 組裝 `$userTask` 時前綴 `[中控指示 seq=N type=T]` banner(順序強制在 ultrathink 附加段之前,fail-open,同 transaction 內標記 delivered)。新增 F15(D1 順序反轉禁令)。§9 worker 收尾表格與 FORBIDDEN 調整段落的「whp-6 將提供 close-worker.ps1」預告改為「已落地」現況陳述。走 `Skill(skill="cc-config-author")`。 |
| **1.3.0** | **2026-08-01** | **§9 worker 收尾對照表 + F8 現況校正(whp-2-no-autoclose-liveness BR-014)**:使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」正式落地,原「worker 收尾」列(`close_mode=auto` watchdog / `controller` dispatcher lingering→`Stop-WorkerSafe`)已標為**退場**,連同其立論前提(gt-smoke-001「必機械收尾」)一併作廢;新增「本卡至 `whp-6` 前無任何程式化關窗途徑,關窗僅限使用者手動」明文。F8 由「dispatcher hybrid wait + 4-Tuple tracker,主視窗隨時可 `Stop-WorkerSafe`」改為「有界確認即退出(`dispatchConfirmSec`),禁繞道呼叫 `Stop-WorkerSafe`」。E1 orchestrator 批次路徑不受影響(仍走原 ACK handshake)。配套 `worker-lifecycle-judgment.md` 同日同步更新(4-Tuple liveness 定義 + guardian 30/10/10 執行者變更 + turn 結束判準由「視窗自關」改「IPC status 檔出現」)。 |
| **1.2.2** | **2026-07-25** | §3.2 範例 payload `model_id` 過時字串校正:`claude-opus-4-8[1m]` → `claude-opus-5[1m]`(對齊 `scripts/pipeline-config.json` phaseModelMapping 現值 —— Claude Code CLI `/model` picker 現行 Opus 分層已是 Opus 5;純示例修正,無 schema / 行為變更。CLI 2.1.219 live-verified: `claude-opus-5[1m]` → `modelUsage.contextWindow=1000000`。配套 party-to-pipeline v5.9.0 model 名單對齊)。 |
| **1.2.1** | **2026-07-16** | §3.2 範例 payload `model_id` 過時字串校正:`claude-opus-4-7[1m]` → `claude-opus-4-8[1m]`(對齊 `scripts/pipeline-config.json` phaseModelMapping 現值;純示例修正,無 schema / 行為變更。配套 party-to-pipeline v5.7.0 model 名單對齊)。 |
| **1.2.0** | **2026-06-06** | **§9 擴大適用(v5.4.0 薄手統一)**:BMAD 三階段 E2 預設同走 dispatch 薄手變體(無 ack;worker-create/dev/review v1.1.0 close watchdog 收尾,Wait-AckFile 死碼移除 — `logs/party-pipeline-tracker.json` 142/143 killed 實證 ACK 優雅關窗從未在生產走通);§3-§4 完整 ACK 流程僅存 E1 orchestrator 批次路徑。 |
| **1.1.0** | **2026-06-05** | **§9 Mode C General-Task IPC 變體新增**(party-to-pipeline v5.3.0)— 無 ack 簡化契約對照表 + F7 by-design 豁免 + F8 由 dispatcher hybrid wait + 4-Tuple tracker 取代 + evidence shape(report_path / report_exists)+ 主視窗親自驗證取代 orchestrator Confirm-StageResult。原 §9 Related Rules → §10、§10 Version History → §11。同日 v5.3.1 補:close_mode `auto`(worker watchdog 約五秒自動關窗 + 子視窗顯示收尾訊息)/ `controller`(中控關窗)雙收尾模式,auto 失敗 dispatcher 備援。 |
| **1.0.0** | **2026-05-04** | 初版建立。對齊 party-to-pipeline v4.0.0 改版。IPC schema 契約 + Mandatory Order 16 步 + 14 條 FORBIDDEN + Self-Check 5 題 + Schema 變更 (stories.task_track + workflow_executions.evidence_json) + Migration 路徑。觸發背景:2026-05-04 user 入口文檔 `claude token減量策略研究分析/party-to-pipeline改版/party-to-pipeline改版.md` 6 階段願景。 |
