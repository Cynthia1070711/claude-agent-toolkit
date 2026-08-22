# Architecture & Scripts (party-to-pipeline v5.1.0 L3)

> 自帶 Self-Contained Orchestrator scripts + 流程圖 + Phase 4 完整參數 + §9 詳細規範 + 與其他 Skill 關係。
>
> **v5.4.0 定位變更 → (2026-08-03 v5.24.0)E1 🔒 FROZEN**:本檔所述 orchestrator.ps1 三階段委派 = E1 批次黑箱,**已凍結禁用** — worker 側 `Wait-AckFile`(v5.4.0 移除)與自關機制(whp-2 封存)相繼退場後,其 §9.7 `Wait-WindowClosed` 必然逾時並走 `Stop-WorkerSafe` 強殺(orchestrator.ps1:325-329),牴觸使用者「只通知不殺」硬裁定;解凍前置 = 重接 DB 閉環(現行握手見 [ack-handshake.md](ack-handshake.md))。E2 預設走 `dispatch-general.ps1 -Phase {phase}` 薄手直連(詳 [main-controlled-mode.md](main-controlled-mode.md) + [general-task-mode.md](general-task-mode.md))。**(2026-08-01 whp-2)** E2 路徑的 worker 收尾機制(曾以 close watchdog 取代 ACK 流程,tracker 142/143 killed 實證舊儀式為死碼)本身也已退場 — **視窗永不自動關閉**,薄手改為有界確認即退出,詳見 [main-controlled-mode.md](main-controlled-mode.md) §1/§4.5 與 [`worker-lifecycle-judgment.md`](../../../rules/worker-lifecycle-judgment.md)。

---

## Self-Contained Scripts 架構 (v4.0.0)

```
.claude/skills/party-to-pipeline/
├── SKILL.md                         # 中控 SOP 規範 L2
├── references/                      # L3 progressive disclosure (本檔所在)
│   ├── architecture-and-scripts.md
│   ├── ack-handshake.md
│   ├── main-side-track.md
│   ├── integration-and-routing.md
│   └── orchestrator-awareness.md
└── scripts/
    ├── orchestrator.ps1             # 中控主腳本 (主對話視窗執行)
    ├── worker-create.ps1            # Create 階段子視窗
    ├── worker-dev.ps1               # Dev 階段子視窗
    ├── worker-review.ps1            # Review 階段子視窗
    ├── shared-utils.ps1             # 共用 helpers (Logger / IPC / DB / handshake)
    ├── stop-report.ps1              # Stop hook (子視窗 turn 結束寫 IPC status)
    ├── protocol-template.md         # 子視窗 prompt 注入的 ACK protocol 規範
    ├── smoke-test.ps1               # 138 case / 13 group smoke (T1.1-T5.7 部分覆蓋 + whp-2 no-auto-close + whp-8 lifecycle CAS)
    ├── pipeline-guardian.ps1        # (v5.15.0 NEW · whp-7) 集中式無狀態守護常駐單例宿主
    ├── ensure-guardian.ps1          # (v5.15.0 NEW · whp-7) 守護冪等單例保證 + 自癒
    ├── preflight-dispatch.ps1       # (v5.16.0 NEW · whp-4) dispatch 前 5 項檢查,首個 BLOCK 即停
    ├── register-run.ps1             # (v5.16.0 NEW · whp-4) worker_runs 登記(Register/Confirm 雙模式)
    ├── close-worker.ps1             # (v5.18.0 NEW · whp-6) 中控唯一程式化關窗途徑(C1/C5/C6/C7/C8;C2/C3/C4 委派 .context-db/scripts/close-worker-ops.js)
    ├── console-knock.ps1            # (v5.21.0 NEW · whp-12) 慢環敲門原語(收件端中立 · 只有 -TargetPid + -Text · self-respawn 隔離)
    ├── knock-worker.ps1             # (v5.21.0 NEW · whp-12) 敲門 worker 域包裝(判活/白名單/peek/敲門/stamp;決策委派 .context-db/scripts/knock-worker-ops.js)
    └── knock-controller.ps1         # (v5.22.0 NEW · ccb-4) 敲門中控域包裝(canonical/判活/速率/未讀計數;決策委派 .context-db/scripts/knock-controller-ops.js)
```

> `.context-db/scripts/read-worker-directives.js`(D1 讀取器,whp-6)、`.context-db/scripts/close-worker-ops.js`(C2/C3/C4 原子單位,whp-6)、`.context-db/scripts/knock-worker-ops.js`(慢環敲門決策層,whp-12)與 `.context-db/scripts/knock-controller-ops.js`(中控域敲門決策層,ccb-4)不置於本目錄樹(不屬 `.claude/skills/party-to-pipeline/scripts/`,而是 `.context-db/scripts/` 的通用 Node CLI),由 4 支 `worker-{phase}.ps1`、`close-worker.ps1` 與 `knock-worker.ps1` 各自 `& node` 呼叫,詳 D1 讀取器契約見 [pipeline-subwindow](../../pipeline-subwindow/SKILL.md)、關窗判準見 [pipeline-window-control](../../pipeline-window-control/SKILL.md)。

> `dispatch-general.ps1`(E2 薄手中控腳本,現行預設路徑)未列於本樹狀圖(既有落差,非本次新增)—— 詳見流程圖章節與 §9.1。

> `.claude/hooks/worker-notify-inject.js`(L2 送達端,whp-8)與 `.context-db/scripts/worker-lifecycle-advance.cjs`(`reported` 寫入端,whp-8)同樣不置於本目錄樹:前者為 `UserPromptSubmit` 第 5 顆 hook(讀取 `worker_runs`/`worker_handoffs`/`guardian_heartbeat` 六類待辦,唯讀,見 `.claude/settings.json`),後者為 `stop-report.ps1` 於 `$runId` 區塊內 `require()` 的獨立 CAS 模組(`.context-db/scripts/` 下必用 `.cjs` 副檔名 —— 該目錄 `package.json` 宣告 `"type":"module"`,一般 `.js` 會被當 ES module 解析,`require()` 拋 `"module is not defined in ES module scope"`;此為 whp-8 dev 階段真實踩到的缺陷,由 smoke-test.ps1 Group 13 端到端 spawn 才捕捉到,vitest 對模組本身的隔離單元測試測不出)。

| 元件 | 角色 |
|:-----|:----|
| **orchestrator.ps1** | **(🔒 FROZEN 2026-08-03,禁派發)** 舊 E1:串接 3 階段 worker + 檔案式 ACK + Wait-WindowClosed(現況必然 force-kill,見頂端定位)|
| **worker-{phase}.ps1** | 子視窗(互動模式 claude):讀 task + D1 中控指示前綴 → `claude --session-id {run_id}` 跑 BMAD workflow → 每 turn Stop hook 心跳;**視窗永不自動關閉**(whp-2),關窗由中控 `close-worker.ps1` |
| **shared-utils.ps1** | 共用 helper:Logger / 路徑 / 原子寫 JSON / IPC primitives / DB I/O / phaseModelMapping / handshake config |
| **stop-report.ps1** | Stop hook (settings.json 註冊),子視窗 turn 結束自動觸發,蒐集 evidence (DB status + tasks ✅ + file_list + git diff),原子寫 status-{phase}.json。(whp-8) `$runId` 區塊內、心跳 UPDATE 與 `worker_handoffs` UPSERT 之後,另跑一個獨立 CAS statement 把 `worker_runs.lifecycle` 從 `running`/`revising` 推進至 `reported`(`worker-lifecycle-advance.cjs`),失敗獨立記 `LIFECYCLE-WRITE-FAILED`(不影響心跳/handoff 的既有寫入)。**(whp-11,D2)** `$statusValue` 定案後、首次 `Write-IpcStatus` 前插入一個有界輪詢分支(委派 `.context-db/scripts/worker-directive-poll.cjs` 的 `peekPending`/`stampKnocked`/`buildKnockDecision`/`resolveGraceSec`):立即首查 + 固定間隔重查至 `workerProtocol.hookGraceSec` 秒(預設 120,`[0,300]` 夾住,`0`=完全退場)。命中即回 `decision:"block"` 敲門(只帶則數 `x{N}` + 全部 `msg_id` + 讀取指令,不推內容 — whp-11 CR 對齊 BR-012),同視窗同 turn 續轉,**不**寫 status 檔、**不**推進 lifecycle,仍呼叫 `Invoke-DbHeartbeat -SuppressLifecycleAdvance` 保留心跳證據;未命中原路徑不變。詳 `.claude/rules/pipeline-handshake-protocol.md` §3.8。 |
| **protocol-template.md** | 注入子視窗 system prompt 的 worker 協議規範(D1/D2 指示處理 4 步協議 + 收尾警語「待中控確認 · 勿關閉」;經 `--append-system-prompt-file` 避開 32K cmdline limit)|
| **smoke-test.ps1** | 189 case / 15 group 集成驗證 (Hard-Block patterns / Conflict Matrix / Greedy / Git mutex / 4-Tuple / Update-Tracker / whp-4 registration-DB dual-write / whp-2 no-auto-close / whp-6 resume+close / whp-8 lifecycle CAS + notify / whp-11 preflight carve-out Group 14 + D2 bounded-wait Group 15;suite-start 自動清掃殘留 smoke-% 種子列 — whp-11 CR) |
| **preflight-dispatch.ps1** | (whp-4) dispatch 前 5 項檢查(STORY_STATE / NON_TERMINAL_RUN / PREV_PHASE_CLOSED / MIGRATION_WINDOW / UNREAD_MESSAGES),首個 BLOCK 即停,`-Json` 機器可讀輸出;`NON_TERMINAL_LIFECYCLES` 動態 import 自 `reap-worker-runs.js`(禁重宣告) |
| **register-run.ps1** | (whp-4) `worker_runs` 登記:`-Mode Register` INSERT 佔位列(`lifecycle=dispatching`)+ 呼叫 `Ensure-Guardian`(fail-open);`-Mode Confirm` merge 回填 `wrapper_pid`/`cmd_line`/`window_title`(`lifecycle→running`)。皆透過 `upsert-worker-run.js` CLI 寫入,不自行開 SQLite 連線 |
| **pipeline-guardian.ps1** | (whp-7) 住在所有子視窗外面的常駐守護,雙節奏 tick(快 30s 存活偵測 + 慢 600s 30/10/10 停滯偵測)持續回答「視窗還在不在 / 回報有沒有人收 / 有沒有卡住」,只回報只提醒,絕不 kill、絕不關窗、絕不派發。`-Once` / `-DryRun` / `-Status`(唯讀,不取鎖)三旗標。判定邏輯全在 `.context-db/scripts/guardian-tick.js`(純函式,**64 tests** 覆蓋 26 條 BR)。tick log 於該輪 tick 拋錯時標 `DEGRADED` 並附 `last_error`(慢 tick 不寫心跳,若不標則錯誤在 DB 與 log 兩面同時消失)。 |
| **ensure-guardian.ps1** | (whp-7) 冪等單例保證 + 自癒,每次 dispatch 呼叫皆安全(恆 exit 0,非關鍵路徑不擋派發)。存活判定為**雙判準**:先讀 `logs/pipeline-guardian.pid` 並比對 CommandLine(防 PID 重用),pid 檔失效時再以行程掃描複驗(`Find-LiveGuardianPid`,排除 `-Status` 唯讀查詢)並回寫 pid 檔 —— 防 stale pid 檔把自癒退化成每次 dispatch 的空轉 spawn 迴圈(BR-G01 禁刪檔故無法靠清檔恢復)。 |
| **close-worker.ps1** | (whp-6) 中控唯一程式化關窗途徑。C1 入口 / C5 `taskkill /T /F /PID`(僅此一次,不重試)/ C6 `closeConfirmSec` 有界確認窗 / C7 `CLOSE_RESULT:` 機讀輸出(最後一行 stdout)/ C8 `-DryRun` 顯示意圖。C2(五項前置,含 `run_mode='inline'` 首項排除)/ C3(4-Tuple 判活,複用 `reap-worker-runs.js` `judgeLiveness()`)/ C4(CAS 終態寫入,先於 C5 taskkill)委派 `.context-db/scripts/close-worker-ops.js`,不自建第二套判活邏輯。關窗判準/五前置細節見 [pipeline-window-control](../../pipeline-window-control/SKILL.md)。 |
| **read-worker-directives.js**(`.context-db/scripts/`) | (whp-6,D1)4 支 `worker-{create,dev,review,general}.ps1` 於組裝 `$userTask` 時各自呼叫,讀 `worker_messages` 待送 `controller-to-worker` 指示、以 `[中控指示 seq=N type=T]` banner 前綴併入(prepend,確保 ultrathink 附加段仍在最後)、同一 transaction 內標記 `delivered`。查無待送指示 / DB 不可用等 4 種異常一律 fail-open(exit 0 靜默),僅參數解析失敗才 exit 3。worker 端 4 步處理協議(讀 DB 全文 / 先執行指示 / 回寫回覆 / 標記 consumed)見 `protocol-template.md`/`general-protocol-template.md`「中控指示處理協議」章節 + [pipeline-subwindow](../../pipeline-subwindow/SKILL.md)。 |
| **console-knock.ps1** | (whp-12)**慢環敲門原語**,對收件端中立。參數只有 `-TargetPid` + `-Text`(ASCII-only),零 domain 表查詢 —— 這是 `ccb-4-ctrl-notify-knock`(中控↔中控通知)能原樣複用它的前提,靜態守護在 smoke Group 16。母分支只做守衛 + self-respawn 隔離子進程 + 讀結果檔 + 寫稽核 log(`logs/console-knock.log`,成功與失敗路徑各恰一行);`-Isolated` 子進程才做 console 附著與 input buffer 寫入(隔離是結構性必要:呼叫端已有 console 時附著必失敗,而中控主視窗絕不可對自己解除附著)。**送出鍵與文字分兩批寫入**(`-SubmitDelayMs` 預設 250ms)—— 同批送出時 claude TUI 會把整串連同結尾的 `\r` 判為一次貼上,Enter 不生效(whp-12 PoC 實證)。零終止 / 零關窗 / 零焦點操作(`pipeline-handshake-protocol.md` F17)。 |
| **knock-controller.ps1** | (ccb-4)敲門的 **中控域包裝** —— 與 `knock-worker.ps1` 是同一支原語的兩個消費端,這正是 `console-knock.ps1` 當初被設計成收件端中立的用途兌現(**逐字不改**,`git diff --stat` 為空是該卡的驗收項之一)。差異在 domain 判準:目標取自 `controller_windows` registry(非 `worker_runs`),判活是 **2-Tuple**(`console_pid` 在活行程 map + `CommandLine` 與登記值相等)而非 worker 的 4-Tuple —— 後者的 Tuple 3/4 檢查 `ipc_dir` 與 `worker-{suffix}.ps1`,兩者都是 worker 專屬 token,中控視窗不存在。敲門文字純 ASCII 故**不含 CJK 軌名**(收件視窗本就知道自己是哪一軌)。決策全數委派 `.context-db/scripts/knock-controller-ops.js`(同 DD-1 分層),最後一行 stdout 為機讀 JSON。速率上界 `ctrlChannel.knockMinIntervalSec` / kill switch `ctrlChannel.knockEnabled`。行為紀律與 SOP 見 [phycool-ctrl-channel](../../phycool-ctrl-channel/SKILL.md)。 |
| **knock-worker.ps1** | (whp-12)敲門的 **worker 域包裝**。判活(委派 `judgeLiveness()`)→ lifecycle 白名單(`reported`/`awaiting-review`/`revising`)→ `peekPending` 取待送指示 → 呼叫原語 → **成功後**才 `stampKnocked`(先 stamp 後失敗會永久吃掉該指示的一次敲門預算)。敲門文字逐字取自 `buildKnockDecision().reason`,與 D2 快環同源,故收件端協議零改動。決策全數委派 `.context-db/scripts/knock-worker-ops.js`(同 `close-worker.ps1` 的 DD-1 分層);`KNOCK_RESULT:` 機讀輸出為最後一行 stdout。kill switch `workerProtocol.knockEnabled`。契約全文見 `pipeline-handshake-protocol.md` §3.9。 |

---

## 流程圖 (v4.0.0 · E1 路徑,🔒 FROZEN 2026-08-03 — 現行 E2 閉環圖見 [ack-handshake.md §2](ack-handshake.md))

```
主控端 (Opus 主對話視窗)
  │
  ├─ Phase 0: Mode Detection
  │   ├─ 解析使用者輸入是否提及 Story ID
  │   ├─ 有 Story ID → search_stories DB 查 stub 完整度
  │   ├─ 4 條件全滿足 → 提示 Mode B 候選
  │   └─ 否則 → 預設 Mode A
  │
  ├═══ Mode A (Party Mode 預設) ═══════════════════
  │  Phase 1: /bmad:core:workflows:party-mode → 多 Agent 收斂 (允許讀 2-3 file, AC 草案)
  │  Phase 2: 建立 Story 框架 (DB upsert status=backlog + task_track)
  │  Phase 3: 使用者確認框架
  │
  ├═══ Mode B (Skip Mode) ════════════════════════
  │  (跳過 Phase 1-3 — stub 已建)
  │
  └─ Phase 4: 委派自帶 orchestrator.ps1【🔒 FROZEN — 現行改 dispatch-general.ps1 -Phase 逐階段】
      → powershell .claude/skills/party-to-pipeline/scripts/orchestrator.ps1 -StoryId {id}
      → 中控串接 3 階段子視窗,每階段 ACK handshake(檔案式,已退場)

        ↓ 子視窗 (每階段獨立 context, phaseModelMapping 解析 model)

  worker-create.ps1 → claude(現行 Opus 分層 [1m] effort=max)互動模式(現值見 pipeline-config.json phaseModelMapping.create-story)
    → BMAD create-story workflow → DB status=ready-for-dev → Stop hook → status.json
    → (E1 歷史)中控驗證 → ack.json → 倒數 5 秒 → close【已退場;現行 = reported → ack → gate → close-worker】

  worker-dev.ps1 → claude(現行 Sonnet 分層 [1m] effort=max)互動模式(2026-07-19 裁定 dev 全階段改 sonnet;現值見 pipeline-config.json phaseModelMapping.dev-story)
    → BMAD dev-story → tasks-backfill-verify → DB status=review → Stop hook → ...
    → (CR 退件 → dev-story-fix-Rn,effort 升 max,自動 retry 1 次)

  worker-review.ps1 → claude(現行 Opus 分層 [1m] effort=max)互動模式(現值見 pipeline-config.json phaseModelMapping.code-review)
    → BMAD code-review → 9 維審計 → Skill Sync Check → tasks-backfill-verify
    → bug-fix-verification → DB status=done → Stop hook → ...
```

---

## Phase 4: 委派 orchestrator.ps1 完整參數(E1 🔒 FROZEN 歷史參數,禁派發;現行入口 = `dispatch-general.ps1`)

```bash
# 主對話視窗執行 (替代舊版 story-pipeline-interactive.ps1 呼叫)
powershell -Command "Set-Location '{ProjectRoot}'; & './.claude/skills/party-to-pipeline/scripts/orchestrator.ps1' -StoryId '{story-id}'"

# 完整參數版
powershell -Command "Set-Location '{ProjectRoot}'; & './.claude/skills/party-to-pipeline/scripts/orchestrator.ps1' -StoryId '{story-id}' -Track auto -MaxRetries 1 -AckTimeoutSec 90 -AckWaitSec 60 -CountdownSec 5"

# 跳階段 / DryRun
.\orchestrator.ps1 -StoryId '...' -DryRun         # 預覽 phase / model / 不執行
.\orchestrator.ps1 -StoryId '...' -SkipDev        # 跳過 dev-story
.\orchestrator.ps1 -StoryId '...' -SkipReview     # 跳過 code-review

# Multi-Story batch dispatch (v5.0.0)
.\orchestrator.ps1 -StoryIds A,B,C                # 多 Story Conflict Matrix + Greedy Schedule-Batches
.\orchestrator.ps1 -StoryIds A,B,C -DryRun        # 預覽 Conflict Matrix Decision Tree
```

| 參數 | 預設 | 說明 |
|:----|:----|:----|
| `-StoryId` | (必填,單 Story 模式) | Story ID (如 `td-pipeline-...`) |
| `-StoryIds` | (v5.0.0,多 Story 模式) | 逗號分隔 Story IDs,啟動 Conflict Matrix |
| `-Track` | `auto` | `main` / `side` / `auto` (從 DB 讀 task_track) |
| `-DryRun` | false | 預覽不執行 |
| `-SkipCreate` / `-SkipDev` / `-SkipReview` | false | 跳階段 |
| `-MaxRetries` | 1 | dev/review 失敗 retry 次數 |
| `-AckTimeoutSec` | 90 | status 等待逾時 |
| `-AckWaitSec` | 60 | 子視窗等 ack 逾時 |
| `-CountdownSec` | 5 | graceful close 倒數秒數 |
| `-WorkerTimeoutSec` | 1800 | worker 整體 timeout (30min) |

---

## §9 Self-Contained Scripts 詳細規範

### 9.1 環境變數契約

worker.ps1 啟動 claude 前設定:

| Env | 用途 |
|:----|:----|
| `PHYCOOL_ORCHESTRATOR_MODE=1` | stop-report.ps1 識別 orchestrator 模式 |
| `PIPELINE_STORY_ID` | Story ID |
| `PIPELINE_PHASE` | create-story / dev-story / code-review |
| `PIPELINE_IPC_DIR` | IPC dir 絕對路徑 |
| `PIPELINE_TASK_TRACK` | main / side |
| `PIPELINE_RUN_ID` | (whp-4)`worker_runs.run_id`(= `--session-id` = claude session id)。stop-report.ps1 心跳與 `Update-Tracker` DB 雙寫皆以此 gate;無值時兩者皆靜默跳過 DB 寫入(向後相容既有非本協議呼叫端) |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` | Bash tool 用 PowerShell |
| `CLAUDE_CODE_EFFORT_LEVEL` | default / max (機會性嘗試,主機制走 system prompt directive,詳 [orchestrator-awareness.md §15](orchestrator-awareness.md)) |

### 9.2 IPC 結構

```
.claude/ipc/{StoryId}__{Timestamp}/   # 三段唯一鍵 (避免並發衝突 R5)
├── task-create-story.json     # 中控寫,worker 讀
├── status-create-story.json   # Stop hook 寫,中控讀 (含 evidence)
├── ack-create-story.json      # 中控寫,worker 讀
├── system-create-story.txt    # claude --append-system-prompt-file
├── task-dev-story.json
├── ... (dev-story 同上 3 + 1)
├── task-code-review.json
└── ... (code-review 同上 3 + 1)
```

### 9.3 R1 對策 — Stop hook 鏈順位

`stop-report.ps1` 註冊在 `.claude/settings.json` Stop hook 鏈**第 2 順位**(pipeline-heartbeat 之後 / log-session 之前):
- timeout 1500ms
- 內含 env guard `if (-not $env:PHYCOOL_ORCHESTRATOR_MODE) { exit 0 }`
- 全程 try/catch fail-open (任何 error → silent exit 0)

### 9.4 R2 對策 — Atomic write 防 race

shared-utils.ps1 `Write-AtomicJson`:
1. 寫 `$Path.tmp`
2. `Move-Item -Path $tmp -Destination $Path -Force` (NTFS rename atomic)

`Read-JsonRetry`:
1. 3-retry,200ms backoff
2. parse 失敗視為「未寫完」,繼續輪詢

### 9.5 R3 對策 — Bounded wait + fallback(E1 🔒 FROZEN 歷史)

`Wait-StatusFile` 預設 timeout 1800s (30min)。逾時:
1. 中控檢 DB status 是否到 phase target
2. 是 → 合成 partial status 繼續 ack 流程
3. 否 → kill worker + retry (MaxRetries 1 次)

### 9.6 R4 對策 — 完全獨立架構

party-to-pipeline 自帶 orchestrator/worker scripts,**完全獨立**於 claude-launcher-interactive。改版失敗 → git revert party-to-pipeline 即回退,不影響 claude-launcher-interactive baseline。

### 9.7 三重 confirm 子視窗已關 (`Wait-WindowClosed`)(E1 🔒 FROZEN 歷史 — whp-2 後 worker 永不自關,此 confirm 必逾時走 force-kill;現行關窗 = `close-worker.ps1`)

| Layer | 檢查 | 說明 |
|:---:|:----|:----|
| 1 | PID 死亡 | `$Proc.HasExited` |
| 2 | tracker.closed_at 已寫 | `party-pipeline-tracker.json` 該 entry 含 closed_at |
| 3 | ack file 已被讀 | ack-{phase}.json mtime > 子視窗 start time |

PID 死 + (tracker OR ack mtime) → 確認;單 PID 死 → 接受 (warn);全失敗 30s → force taskkill。

> v5.0.0 強化為 **Quad-Confirm** (4-Tuple Identity 防 Windows PID 重用)。詳 `scripts/shared-utils.ps1` T5.5 helpers + `.claude/rules/parallel-batch-conflict-isolation.md` SUPREME(原 `parallel-worker-identity.md` retired,機制併入)。

### 9.8 handshake.enabled flag (R7 對策)(E1 🔒 FROZEN 歷史 — 現行握手為 DB 閉環,無此 flag 消費場景)

`scripts/pipeline-config.json` 新增:

```json
"handshake": {
  "enabled": true,
  "timeout_sec": 90,
  "ack_wait_sec": 60,
  "countdown_sec": 5,
  "fallback_to_legacy": true
}
```

`shared-utils.ps1::Get-HandshakeConfig` 讀此值,fail safe 預設 enabled=false。

---

## §10 與其他 Skill 的關係 (v4.0.0 修正)

| Skill | 角色 | 關係 |
|-------|------|------|
| **party-to-pipeline (本 Skill)** | 自帶 dispatch 薄手 + 4 worker + guardian + close/knock + DB 閉環 handshake | self-contained,主流程(E1 orchestrator 🔒 FROZEN)|
| ~~`claude-launcher-interactive`~~ | 互動模式 launcher (story-pipeline-interactive.ps1) | **RETIRED 2026-07-28**(claude-launcher 三胞胎,見 CLAUDE.md §2 註記)|
| `pipeline-window-control` | 關窗判準 / close-worker C1-C8 細節 / check-zombie | 中控關窗前置條件 SSoT |
| `tasks-backfill-verify` | tasks ✅ 回填驗證 | worker scripts 強制要求子視窗 agent 執行 |
| `bug-fix-verification` | review_findings DB 同步 | worker-review.ps1 強制要求 |
| `saas-to-skill` | Skill Sync (Mode B) | worker-review.ps1 強制要求子視窗 agent 走 |
| ~~`toolkit-mirror-sync`~~ | toolkit 鏡像同步 | **RETIRED 2026-05**(single-engine-mode FROZEN)|
| `phycool-ctrl-channel` | 中控⇄中控聊天室 + 3 通知掛點 + knock-controller | 跨軌溝通 SSoT(worker 子視窗零注入)|
| `multi-track-orchestration` | 中控行為紀律 SOP-1~7(GATE 判讀 / 派發序列 / commit 波) | 與本 Skill 機制面互補 |
| `bmad:core:workflows:party-mode` | 多 Agent 討論 | Phase 1 強制調用 |
