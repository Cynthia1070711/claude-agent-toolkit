# Handshake 閉環 — 現行雙向握手 SOP(DB 版 · party-to-pipeline v5.24.0 L3)

> **(2026-08-03 v5.24.0 全面改寫)** 本檔由 v4.0.0「檔案式 ACK」(task/status/ack 三檔 + Wait-AckFile + 倒數 5 秒自關 + Wait-WindowClosed 三重 confirm)重寫為 whp epic(whp-1~12,DB 全數 done)+ ccb epic(ccb-1~4 done)落地後的 **DB 閉環 SOP**。這是中控派發子視窗時的**唯一現行範式**;舊檔案式 ACK 僅存於 E1 `orchestrator.ps1`,該路徑已 🔒 FROZEN(§8)。
>
> **分工邊界**:線上契約逐條細節(IPC schema / D1/D2/慢環/中控敲門)SSoT 在 `.claude/rules/pipeline-handshake-protocol.md` §3.6-§3.10;中控行為紀律(何時派發 / GATE 判讀 / 異常決策)在 `multi-track-orchestration` skill;跨軌聊天室在 `phycool-ctrl-channel` skill。本檔講**閉環全貌與節點操作**,不重複三者。

---

## §1 生命週期狀態機(`worker_runs.lifecycle` — 握手鏈 SSoT)

```
dispatching → running ⇄ revising → reported → awaiting-review → approved → closed
                                       ▲            │(revise 裁決 → 回 revising)
                                       └────────────┤(rejected → failed)
異常終態:abandoned(guardian/reaper 判定視窗已消失且無人收尾)
```

| 轉移 | 誰推進 | 實作證據 |
|:---|:---|:---|
| (無)→ `dispatching` | `register-run.ps1 -Mode Register`(dispatch-general 內)| `upsert-worker-run.js` INSERT;`run_id` = claude `--session-id`(DB 列 / session / transcript 三方一鍵)|
| `dispatching → running` | `register-run.ps1 -Mode Confirm` | 回填 `wrapper_pid` / `cmd_line` / `window_title` |
| `running/revising → reported` | **worker Stop hook**(`stop-report.ps1`,turn 正常結束)| `worker-lifecycle-advance.cjs` 獨立 CAS(rule §3.7)|
| `reported → awaiting-review` | **中控 `ack_worker_run`**(簽收)| `worker-protocol-ops.js:169` CAS `WHERE lifecycle='reported'` |
| `awaiting-review → approved / revising / failed` | **中控 `gate_worker_run`**(裁決)| `worker-protocol-ops.js:232+`;`revise` 同 transaction 清 `reported_at`/`ack_at`/`notify_count` + `worker_handoffs.gate_result` 重置 `pending` + 自動寫一則 controller-to-worker 指示;`rejected` → `gate_result='rejected'` + `lifecycle='failed'` |
| `approved → closed` | **中控 `close-worker.ps1 -RunId`** | `close-worker-ops.js` C4 CAS 終態(`close_source=ControllerAfterHandshake`)**先於** C5 taskkill |

🔴 **判活與 lifecycle 分離**:判活唯一權威 = 4-Tuple `judgeLiveness()` 現場探測(`worker-lifecycle-judgment.md` §1),`lifecycle` 只是最後觀測到的狀態機標記,禁單獨判活。

**生產實證**(2026-08-03 bwu-12 create,run `4815a818`):`reported_at 19:34:11 → ack_at 19:36:12(ack_by=CC-OPUS)→ closed_at 19:37:59(close_source=ControllerAfterHandshake)`,`notify_count=1` — 全鏈可運作。

---

## §2 全閉環流程圖(E2 現行預設)

```
中控主視窗                                     worker 子視窗
  │
  │ 0. preflight-dispatch.ps1 五檢查(§3.1)
  │ 1. dispatch-general.ps1 -StoryId X -Phase Y [-ControllerTrack 軌別] [-Resume]
  │    ├ register(lifecycle=dispatching)+ Ensure-Guardian(冪等自癒)
  │    ├ spawn 子視窗 ─────────────────►  worker-{phase}.ps1
  │    ├ confirm(→ running,回填 PID/cmdline)  ├ D1:read-worker-directives.js 前綴中控指示
  │    └ 有界確認即退出(≤ dispatchConfirmSec)   ├ claude --session-id {run_id} 互動模式
  │ 2. 中控不空等(main-controlled-mode §4.6)     │   BMAD workflow;每 turn Stop hook 心跳
  │    guardian 常駐觀測:快 30s 存活 /            │  (turn_count / files_modified / workflow_invoked)
  │    慢 600s 30/10/10 停滯,只寫旗標零 kill      ├ turn 結束:D2 有界輪詢(hookGraceSec)
  │                                             │   命中 → decision:"block" 同視窗續轉
  │ ◄─ 3. worker 完成:寫 IPC status-{phase}.json + CAS lifecycle=reported
  │ 4. 通知落地:guardian notify_count++ → 中控下次 prompt 由
  │    worker-notify-inject.js 注入「待確認 N 筆」
  │   (序列依賴且無其他工作:必掛 Monitor persistent — 通知捷徑,非判定依據)
  │ 5. GATE 六證據鏈(§3.3)
  │ 6. ack_worker_run(reported → awaiting-review)
  │ 7. gate_worker_run 裁決:
  │    ├ approved → 8
  │    ├ revise → 指示入 worker_messages → D2 快環 / knock-worker.ps1 慢環敲門
  │    │          原視窗續作 → 回 3(lifecycle 回 revising)
  │    └ rejected → failed → 分析後重派(preflight 擋殘留;-Resume 可延續會話)
  │ 8. close-worker.ps1 -RunId(C4 CAS closed 先於 C5 taskkill;誰派發誰關)
  │ 9. 階段 commit 波(pathspec + clean tree)
  │ 10. 下一階段回 0(PREV_PHASE_CLOSED 檢查上一階段已達終態)
```

---

## §3 中控節點手冊

### 3.1 派發前:`preflight-dispatch.ps1` 五檢查(首 BLOCK 即停)

`STORY_STATE`(status 符合該 phase 前置)/ `NON_TERMINAL_RUN`(防同 story 雙視窗;窄後門 `REVISE_REVIVE` = `revising` + `-Resume` + 原視窗 4-Tuple 判死)/ `PREV_PHASE_CLOSED`(前一階段達 `closed/failed/abandoned` 終態 — 不嚴格要求 closed,failed/abandoned 不永久死鎖管線)/ `MIGRATION_WINDOW` / `UNREAD_MESSAGES`(本軌必讀 ctrl-channel 話題)。

### 3.2 派發:`dispatch-general.ps1`

`-StoryId X -Phase create-story|dev-story(-fix-Rn)|code-review(-Rn) [-ControllerTrack 軌別] [-Resume] [-Worktree]`(Mode C 通用任務同一薄手,`-TaskId` + `-PromptFile`)。終止條件 = **有界確認即退出**(`dispatchConfirmSec`;`OUTCOME` 行只回報派發狀態,**不代表 worker 完成**,`exit 2 = timeout` 已不存在)。

### 3.3 GATE 六證據鏈(worker 回報後、簽收前)

| # | 證據 | 來源 |
|:-:|:---|:---|
| 1 | IPC `status-{phase}.json` `status=completed` + `error=""` | Stop hook |
| 2 | `workflow_invoked=true`(子視窗真跑了 BMAD workflow)| `worker_handoffs.evidence_json`(`workflow-invoked-detect.js` 三態)|
| 3 | `evidence_incomplete=0` | `worker_runs` 欄位 |
| 4 | DB status 達 phase target(backlog→ready-for-dev→review→done)+ agent 欄位 | `stories` 表 |
| 5 | 起訖時間戳齊備(lifecycle invariants I1-I9)| `stories` 表 |
| 6 | 產出欄位非空(per phase:AC / SDD / tasks / file_list / test_count / cr_score...)| `stories` 表 |

詳細判準:`multi-track-orchestration` skill(GATE 六證據鏈 SOP)+ [main-controlled-mode.md §4](main-controlled-mode.md)。

### 3.4 簽收與裁決(MCP tools · CAS 語意)

- `ack_worker_run({run_id})`:`reported → awaiting-review`。非 `reported` 態回 **casRejection(合法零列結果,非 error)** — 重複簽收 / 太早簽收都不會壞資料。
- `gate_worker_run({run_id, verdict})`:僅 `awaiting-review` 可裁決。`approved` / `revise`(自動寫指示 + 重置握手欄位,worker 二輪交付可再裁)/ `rejected`(→ `failed`)。
- 待簽收佇列:`search_worker_runs({pending_ack:true})`(最久未簽排最前)。

### 3.5 關窗:`close-worker.ps1`(中控唯一程式化關窗途徑)

五項前置(C2,含 gate approved)→ 4-Tuple 判活(C3)→ **CAS 終態先寫後殺**(C4 → C5)→ 有界確認(C6,`closeConfirmSec`)。exit `0` = 成功(含「PID 已死視為使用者自關」)/ `1` = CAS 落空或逾時 / `2` = 前置未過、PID 重用 ABORT、或判活探測不可用(**fail-closed** — 關窗是全鏈唯一必須 fail-closed 的路徑)。**誰派發誰負責關**;繞道 taskkill 會被 `worker-kill-guard.js` 對 `lifecycle∈{running,revising}` 條件式 hard-block。

### 3.6 commit 波

每階段握手走完 + 關窗後,`git commit -- <pathspec>` 小波入庫;clean tree 才進下一階段。

---

## §4 revise 迴圈 — 中控 → worker 指示三通道

| 通道 | 時機 | 機制 |
|:---|:---|:---|
| **D1 開工注入** | worker 下次 spawn / `-Resume` 時 | `read-worker-directives.js` 於 `$userTask` **前綴** banner(ultrathink 保持最後段);同 transaction 標 `delivered` |
| **D2 快環** | worker turn 即將結束的 `hookGraceSec` 窗內 | Stop hook 輪詢命中 → `decision:"block"` 同視窗同 turn 續轉(不寫 status 檔、不推進 lifecycle)|
| **慢環敲門** | worker 已 idle(D2 窗已過)| `knock-worker.ps1`:4-Tuple 判活 → lifecycle 白名單(`reported`/`awaiting-review`/`revising`)→ `console-knock.ps1` 原語注入一行 ASCII + Enter(分兩批寫入)→ **成功後**才 stamp `knocked_at` |

三通道**只敲門不推內容** — 指示 body 一律由 worker 自己讀 DB(`read-worker-directives.js --run-id`)。契約全文:rule §3.6 / §3.8 / §3.9。

---

## §5 通知面矩陣(誰通知誰 · 全部「只送信號不推內容」)

| 方向 | 機制 | 落點 |
|:---|:---|:---|
| worker → 中控 | Stop hook CAS `reported` → guardian 首次通知(`notify_count`)→ `worker-notify-inject.js`(UserPromptSubmit 第 5 顆)六類待辦注入;`notify_count ≥ ackEscalateAfterRounds` 升級 `systemMessage` | 中控下次 prompt |
| 守護 → 中控 | `pipeline-guardian.ps1` 快 30s 存活 / 慢 600s 30/10/10 停滯 → 只寫 `health_flag='stalled-suspect'` + `requires_attention`,**零 kill 零關窗**;中控三選一裁決(續等 / 喚醒 / 重派)| `worker_runs` 旗標 + notify 注入 |
| 中控 → worker | §4 三通道 | worker 視窗 |
| 中控 ⇄ 中控 | ctrl-channel 4 MCP tools + 3 掛點(UserPromptSubmit / PostToolUse / Stop)+ `knock-controller.ps1` idle 敲門 | SSoT:`phycool-ctrl-channel` skill(本檔不重複)|

**等待紀律**(dispatch 後、通知前):[main-controlled-mode.md §4.6](main-controlled-mode.md) 三條 — 不空等 / 序列依賴且無其他工作時**必掛** `Monitor` persistent(v5.24.1)/ 禁 Bash `run_in_background` 長迴圈。**「沒收到通知」≠ 架構缺口** — 先查 `worker_runs` 握手鏈是否其實已走完 `reported → ack → closed`。

---

## §6 config 鍵速查(`scripts/pipeline-config.json`)

| 鍵 | 現值 | 用途 |
|:---|:---:|:---|
| `workerProtocol.dispatchConfirmSec` | 60 | 薄手有界確認上限 |
| `workerProtocol.hookGraceSec` | 120 | D2 快環輪詢窗(`[0,300]` 夾住,`0` = 完全退場)|
| `workerProtocol.resumeEnabled` | true | `-Resume` 延續前次會話 |
| `workerProtocol.autoCloseEnabled` | false | whp-2 緊急回退旗標(預設關 = 視窗永不自關)|
| `workerProtocol.ackEscalateAfterRounds` | 3 | 通知升級 `systemMessage` 門檻 |
| `workerProtocol.knockEnabled` / `ctrlChannel.knockEnabled` | true | worker 域 / 中控域敲門 kill switch |
| `workerProtocol.closeConfirmSec` | 15 | 關窗有界確認 |

---

## §7 FORBIDDEN(閉環層)

| # | 禁止 | 原因 |
|:-:|:---|:---|
| H1 | 跳過 `ack_worker_run` / `gate_worker_run`,以「DB status 已達標」即視為完成直接關窗或推進下一階段 | 失去 `reported → awaiting-review → approved` 證據鏈;`close-worker` C2 會拒、preflight `PREV_PHASE_CLOSED` 會擋,繞過 = 製造殭屍列 |
| H2 | 以 `close-worker.ps1` 以外途徑程式化關窗(`Stop-WorkerSafe` / `taskkill` / `Stop-Process` 直呼)| `worker-kill-guard.js` hard-block;使用者硬裁定「只通知不殺」 |
| H3 | dispatch 後空等 / 輪詢 / Bash 背景長迴圈等 worker | §4.6 三紀律;通知路徑本就完整,前提是中控繼續活動 |
| H4 | 「沒收到通知」即判定架構有缺口並著手改機制 | 先查握手鏈;2026-08-03 實例:`ccb-4` 與 `bwu-12` 皆已完整走完 `dispatch → reported → ack → closed`,偏離的是中控行為 |
| H5 | worker agent 自寫 IPC status 檔或自行推進 `lifecycle` | Stop hook 專管;D2 命中亦不推進(rule F16)|

---

## §8 E1 檔案式 ACK — 🔒 FROZEN(2026-08-03)

E1 `orchestrator.ps1` 是舊檔案式 ACK(task/status/ack 三檔 + `Write-AckFile` + `Wait-WindowClosed` 三重 confirm)的**唯一殘存消費端**。凍結理由(evidence-based):

1. **worker 側配對機制已全數退場**:`Wait-AckFile` 於 v5.4.0 移除(`logs/party-pipeline-tracker.json` 142/143 killed 實證該儀式從未在生產走通)、自關 watchdog 於 whp-2 封存 — E1 寫出的 ack 檔無人讀,視窗永不自關。
2. **因此 `Wait-WindowClosed` 必然逾時 → `Stop-WorkerSafe` 強殺**(`orchestrator.ps1:325-329`;另 `:285` 驗證失敗路徑同樣強殺)— 每一階段**必然**以 force-kill 收尾,直接牴觸使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉 + 所有機制只通知不殺」。
3. **舊 ACK 復辟已被明文否決**:`claude token減量策略研究分析/Claude智能中控自動化排程/雙向握手協議機制.md` §4.1-§4.3 已否決方向(硬性裁決,不再重議),§4.3 即「舊 ACK handshake 完整復辟」。

**凍結語意**:`orchestrator.ps1` 檔案保留不刪(對齊 single-engine-mode FROZEN 慣例);**禁止任何派發使用**(含 `-StoryIds` 批次 — 批次需求改 E2 逐卡序列);解凍前置 = 將 E1 收尾鏈重接本檔 §1-§5 DB 閉環。歷史契約與 shape 範例:rule §3.1-§3.5 / §4 + [architecture-deep-dive.md](architecture-deep-dive.md)。

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.0.0** | **2026-08-03** | **全檔重寫:檔案式 ACK → DB 閉環 SOP**。v4.0.0 內容(16 步流程圖 + evidence/ack JSON shape + 三重 confirm + handshake.enabled flag)退場為 §8 FROZEN 摘要;主體改為 whp/ccb 落地後現行閉環:§1 lifecycle 狀態機(轉移表 + 實證 run `4815a818`)+ §2 全閉環流程圖 + §3 中控節點手冊(preflight 五檢查 / dispatch / GATE 六證據鏈 / ack / gate / close-worker / commit 波)+ §4 revise 三通道(D1/D2/慢環)+ §5 通知面矩陣 + §6 config 速查 + §7 FORBIDDEN H1-H5 + §8 E1 FROZEN 判定(三點證據)。觸發:2026-08-03 使用者指示「將完整 SOP 範式補全更新到 party-to-pipeline,避免中控派發子視窗時又使用舊機制」;DB 比對 whp 13/13 done + ccb 子卡 4/4 done + tdb 6/6 done。 |
| 1.x | 2026-05-04 ~ 2026-08-02 | v4.0.0 檔案式 ACK 原文(16 步 + shapes + 三重 confirm)— 全文見 git 歷史與 rule §3.1-§3.5 / §4 |
