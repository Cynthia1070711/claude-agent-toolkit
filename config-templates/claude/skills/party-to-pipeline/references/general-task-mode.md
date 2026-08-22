# General-Task Mode (Mode C) — Party-to-Pipeline v5.3.0 L3

> 主視窗直控通用任務模式(**第三任務來源維度**)。與 Mode A(Party 討論建 Story)/ Mode B(stub 直派)正交並列;執行控制固定走 **E2 主對話中控哲學的徹底版** —— 連單階段 orchestrator 都不用,主視窗直接對接 worker。
>
> **建立背景**(2026-06-05 Party Mode 收斂 + 使用者裁定):需要「子視窗互動模式執行**一般任務**(不走 BMAD workflow),完成回報主視窗 → 主視窗審查 → commit → 推下一個任務」的中控迴圈,且明確要求**不委派 orchestrator.ps1**(黑箱問題,對齊 [main-controlled-mode.md §10](main-controlled-mode.md) D3/D14/D2 實證)—— 100% 掌握每個任務狀態。

---

## §1 定位與分界

### 三任務來源 × 執行控制(正交維度)

| 維度 | 選項 |
|------|------|
| 任務來源 | Mode A(Party 討論建 Story)/ Mode B(Story stub 直派)/ **Mode C(非 Story 通用任務)** |
| 執行控制 | **E2 主視窗薄手直控(預設;v5.4.0 起 Story 三階段同走 dispatch `-Phase`)** / E1(orchestrator.ps1 黑箱,批次備選) |

### 分界矩陣(防 Mode C 變成繞 Story 的後門)

| 場景 | 該走 | 理由 |
|------|------|------|
| SaaS production 功能 code(需 AC / 測試 / CR) | Mode A/B + E2 | Story 治理不可繞過(SKILL.md F14) |
| XS/S 微任務(主視窗自己做更快) | quick-dev Fast Path | 開子視窗反而浪費 |
| **批次校正 / 文檔工程 / 環境配置 / 腳本雜項 —— 量大、同質、不需 Story 儀式、但需隔離 context + 中控品管** | **Mode C** | 本模式設計目標 |
| 需真實 Chrome 狀態(cookie / login)驗證的任務 | 主視窗親自 | worker 沙盒限制(F6) |

---

## §2 架構(薄手,不是腦)

```
主視窗(= 唯一中控,主對話 agent)
  │ G1: dispatch-general.ps1(run_in_background)…… 薄手:零決策 / 零驗證 / 零重試 / 零 ACK
  │      ├ 解析 model preset → 建 IPC dir {TaskId}__{ts}/ → prompt 複製進 IPC(防 CJK cmdline 截斷)
  │      ├ Start-Process 可見子視窗 [GT] {TaskId} → worker-general.ps1(-TaskId -IpcDir 純 ASCII 參數)
  │      ├ Update-Tracker 'running'(4-Tuple:story_id + ipc_dir + pid + cmd_line)
  │      └ (2026-08-01 whp-2)有界確認即退出:見到 claude.exe 子行程,或逾時但 wrapper PID 仍存活 → 摘要 → exit(不再等待視窗關閉)
  │
  │ 子視窗:claude --model {指定} 互動 YOLO(--chrome 沙盒 + workers-mcp.json strict)
  │      執行任務(單 turn 自主推進)→ 寫任務報告 → turn 結束
  │      → Stop hook(stop-report.ps1 general 分支)寫 status-general.json
  │      → (2026-08-01 whp-2)印收尾警語(視窗刻意保持開啟 / 關窗須由中控走完握手 / 使用者可自行關閉)→ **視窗永不自動關閉**
  │      ※ 無 Wait-AckFile —— Mode C 砍掉 ACK,worker 不等任何人;舊版 `generalTask.close_mode`(auto/controller 雙模式收尾)
  │        已隨 watchdog 一併封存(死碼,見 `worker-general.ps1` whp-2 標記段),gt-smoke-001 當初「必須機械收尾」的前提已被
  │        使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」推翻 —— 關窗現為純人工動作
  │
  ├─ G2: task-notification(dispatcher 退出)
  ├─ G3: 主視窗親自審查 V1-V5(git diff + 報告檔 —— 不賭 IPC)
  ├─ G4: pathspec commit + log_workflow
  └─ G5: 下一任務(或 V5 缺口分流)
```

**「100% 掌握」四落點**:① status / git diff 任務進行中主視窗隨時可 Read;② PID 在 tracker(4-Tuple 防 PID 重用),`worker_runs.health_flag` 由 `pipeline-guardian.ps1` 常駐守護(見 [main-controlled-mode.md §4.5](main-controlled-mode.md))標記停滯供中控裁決(**guardian 零 kill**,擊殺仍是人的決策);③ timeout 已無等待迴圈(dispatch 有界確認即退出,§3);④ 失敗重派 feedback 由主視窗撰寫(取代從未真正啟用的 ack reject 迴圈,`pipeline-config.json` handshake.enabled=false / D2)。

> **v5.4.0 薄手統一(2026-08-01 whp-2 起收尾機制已更新,見上方)**:本薄手同時服務 **Story 三階段** —— `-Phase create-story|dev-story|code-review` 直連 worker-create/dev/review(同一套「視窗永不自動關閉」收尾;舊版 close watchdog 收尾與 tracker 142/143 killed 實證的 ACK 死碼皆為歷史)。orchestrator.ps1 退守 E1 批次黑箱專用(不受影響)。**整個體系 = 1 腦(主視窗)+ 1 手(dispatch)+ 4 worker + 1 常駐守護(pipeline-guardian.ps1)。**

---

## §3 中控迴圈 G0-G5(主視窗 SOP)

```
G0 規劃(一次):讀任務來源文檔 → 列任務序列 → 逐任務草擬 prompt(§7 模板)
G1 派發:dispatch-general.ps1(run_in_background)
   ※ 嚴格序列:前一任務 G4 完成才派下一個(單 worker;並行需另行評估 F13 SPAWN_DELAY ≥10s)
   ※ 他軌並行造成的 dirty tree 屬正常 —— dispatcher 以 baseline 差集隔離,毋須強求 clean tree
G2 通知:background task 完成 → 主視窗收 GENERAL TASK RESULT 摘要
G3 審查:V1-V5(§5)
G4 提交:git commit -- {本任務檔案路徑}(pathspec 精準)+ log_workflow 留痕
G5 推進:V5 分流處理缺口 → 回 G1 下一任務
```

### dispatch-general.ps1 參數

| 參數 | 預設 | 說明 |
|:----|:----|:----|
| `-TaskId` | (必填) | ASCII slug(`[a-zA-Z0-9._-]+`),如 `gt-0605-pdfqueue` |
| `-PromptFile` | (必填) | 任務 prompt 檔(任意路徑,內容會複製進 IPC) |
| `-Model` | (必填) | preset(`opus-5` / `sonnet-5` / `fable-5`;legacy `opus-4.8` / `sonnet-4.6` / `sonnet-4.6-1m`)或 raw model id passthrough |
| `-Track` | `side` | main / side(Mode C 僅作 evidence 標記) |
| `-TimeoutSec` | 0 = config `default_timeout_sec`(3600) | 任務上限;到點只回報不殺 |
| `-ReportPath` | `{report_dir}/{TaskId}-report.md` | 任務報告檔路徑 |
| `-DryRun` | off | 只印解析結果(model_id / 路徑),不啟動 |
| `-Phase` | `general` | (v5.4.0)`create-story` / `dev-story`(`-fix-R1/R2`)/ `code-review`(`-R1/R2`)→ 直連對應 BMAD worker;此時 `-TaskId` = StoryId(有 `-StoryId` 別名),`-PromptFile` / `-Model` 免填(worker 依 Story DB + phaseModelMapping 自解析),Track/Complexity 自 DB 帶出 |

### 使用範例(主視窗 run_in_background)

```powershell
# Mode C 通用任務
powershell -ExecutionPolicy Bypass -File .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 `
  -TaskId gt-0605-m07-fix -PromptFile logs/gt-0605-m07-prompt.txt -Model opus-5

# (v5.4.0) Story 三階段直連(E2 預設;逐階段:create → 主視窗驗證 commit → dev → … → review)
powershell -ExecutionPolicy Bypass -File .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 `
  -StoryId {story-id} -Phase create-story
```

Exit codes(2026-08-01 whp-2 起):`0` spawned & wrapper PID alive at hand-off(不論是否見到 `claude.exe` 子行程)/ `1` pre-flight BLOCK 或 spawn 失敗(含確認窗內即結束的異常case)。**`2`(timeout/lingering)已隨等待迴圈一併退場,不再由此路徑產生**。

### worker 停滯處置(主視窗)

薄手已無等待迴圈,timeout/lingering 判斷完全移交 `pipeline-guardian.ps1` 常駐守護執行(詳 [main-controlled-mode.md §4.5](main-controlled-mode.md) + [`worker-lifecycle-judgment.md`](../../../rules/worker-lifecycle-judgment.md) SUPREME)。中控裁決依 `worker_runs.health_flag`/`requires_attention` 三選一(續等/喚醒/重派),**不得**繞道呼叫 `Stop-WorkerSafe` 自行關窗(該函式保留供 `whp-6` `close-worker.ps1` 顯式人工授權流程使用)。

---

## §4 Model / Effort / Ultrathink(三重注入)

| 機制 | 落點 | 來源 |
|------|------|------|
| Model presets | `pipeline-config.json` generalTask.presets;raw id passthrough;**不剝 `[1m]`**(對比 worker-dev.ps1:50 會剝) | 使用者補充 #1 |
| 收尾模式(2026-08-01 whp-2,取代 v5.3.1 雙模式) | 舊版 `generalTask.close_mode`(`auto` watchdog / `controller` 中控 grace)已封存 —— **視窗永不自動關閉**,子視窗 turn 末僅印收尾警語(視窗刻意保持開啟 / 關窗須中控走完握手 / 使用者可自行關閉),`close_delay_sec` 讀取邏輯已無消費者 | 使用者硬裁定(2026-07-26)②「取消 worker 子視窗自動關閉」 |
| effort=max 固定 | `CLAUDE_CODE_EFFORT_LEVEL=max` env(機會性,GitHub #50099)+ userTask 尾端 directive(reliable 主機制) | 使用者補充 #2;克隆 worker-dev.ps1:97-108 雙保險 |
| ultrathink | worker 無條件 append「本任務必用最大思考深度 ultrathink」+ prompt 模板自帶 | 使用者補充 #3 |

---

## §5 主視窗審查 V1-V5(G3,取代 BMAD code-review)

| # | 審查項 | 機制 |
|---|--------|------|
| V1 | **WORKER_FILES 全量 file:line 對照任務目標**(摘要已差集隔離他軌髒檔;通常 < 20 檔,全量不抽樣) | 主視窗 Read git diff |
| V2 | **報告宣稱 vs diff 實質比對**(報告說完成 X → diff 必有 X;防假完成) | 33% false positive 教訓 |
| V3 | **軌道隔離檢查**:WORKER_FILES 出現他軌檔案 → 即刻 STOP 分析,還原處置 | 多 AGENT 並行核心風險 |
| V4 | `check-hygiene.ps1` + 繁中掃描(動文檔時 `check-traditional-chinese.cjs`) | 既有工具鏈 |
| V5 | **缺口三分流**(移植 [main-controlled-mode.md §6](main-controlled-mode.md)):a) worker 漏步驟 → 補派帶 feedback 新 worker;b) 執行不完整 → 重派;c) 少數缺口 → 主視窗親自補(智能判斷,可 ACCEPTED defer) | E2 實證範式 |

**status 早寫邊界**:stop-report 同 phase 只寫一次(dedup),若子視窗 turn 意外早收,status 定格 —— 主視窗以摘要的 `report_exists` + WORKER_FILES 數一眼識破,走 V5-b 重派,**不依賴 status 字段本身**。

---

## §6 IPC 契約(Mode C 變體)

```
.claude/ipc/{TaskId}__{Timestamp}/
├── task-general.json      # dispatcher 寫(task_id / model_id / effort / report_path / timeout / baseline_files)
├── prompt-general.txt     # dispatcher 寫(任務 prompt 全文,UTF-8 No-BOM)
├── system-general.txt     # worker 寫(TASK META + general-protocol-template.md 全文)
└── status-general.json    # Stop hook 寫(evidence: files_changed / report_exists / report_path / session_id)
```

- **無 ack-general.json**(by design —— worker 不等 ACK,自行關窗;`pipeline-handshake-protocol.md` F7 對 Mode C 豁免)
- 任務報告檔在 **IPC 外**(`report_dir`,worker agent 以 Write 工具寫入 —— 不違反 F4 禁碰 IPC)
- evidence shape(general 分支):`{task_track, db_status:"n/a-general", files_changed[], report_path, report_exists, session_id, phase}`

---

## §7 標準 prompt 模板(G0 草擬用)

```
{Skill 調用,如 /module-conformance-loop} ultrathink
我們是{軌道名}:
1. 集合所有專家讀取 {追蹤/紀律文檔路徑} 了解任務概況後,接續執行【{單一任務範圍,如:某功能模組}】。
2. 依業界 SaaS 做法 > 推薦建議方式,自動推進不中斷,僅完成本任務範圍即停。
3. 與他軌並行:禁動他軌檔案;需協調事項寫留言區({留言區路徑})。
4. 禁 git commit/push —— 由中控(主視窗)統一審查後 commit。
5. 完成後寫任務報告至 {ReportPath}。
{(選配)涉 DB 操作的任務加:[MUST LOAD] 先載入 Skill: pipeline-subwindow(DB query/write 黃金路徑)}
ultrathink
```

> 模板第 3-5 點與 general-protocol-template.md(system prompt)雙保險 —— prompt 層使用者可見、protocol 層機械注入。

---

## §8 FORBIDDEN(Mode C 專屬,worker 側 8 條見 general-protocol-template.md)

| # | 禁止(主視窗側) | 原因 |
|:-:|:----|:----|
| FC1 | Mode C 用於 SaaS production 功能 code | 繞過 Story 治理(= SKILL.md F14) |
| FC2 | 審查跳過 V2 報告 vs diff 比對,只讀報告點頭 | 防假完成的唯一不可偽造證據是 diff |
| FC3 | commit 用 `git add .` / 不帶 pathspec | 多軌並行 index 污染(2026-06-03 實證事故) |
| FC4 | 並行 dispatch 多 worker 不評估 F13 SPAWN_DELAY ≥10s | API bot detection ban 風險 |
| FC5 | 任務完成不 log_workflow / 不留報告檔 | 三個月後沒人知道這批 commit 哪來的 |

---

## §9 Self-Check(主視窗 G1 dispatch 前 5 題)

1. **本任務是否屬 §1 分界矩陣的 Mode C 適用場景?**(SaaS production code → STOP,走 Story)
2. **前一任務 G4(審查 + commit)完成了嗎?**(序列紀律)
3. **prompt 是否含:單一任務範圍 + 禁 commit + 他軌隔離 + 報告路徑?**(§7 模板 5 要素)
4. **TaskId 是 ASCII slug 且未與進行中任務重複?**
5. **-Model 選對了嗎?**(複雜分析 opus-5 / 一般執行 sonnet-5(現行 Sonnet,一律 [1m])/ 最難長程任務 fable-5(~2× opus 成本,opt-in)/ legacy opus-4.8 / sonnet-4.6 仍可用)

---

## §10 治理底線

- 每任務完成:`log_workflow`(workflow_executions)+ 任務報告檔留存(report_dir)
- 報告檔屬中控軌產出,隨任務 commit 入版控(pathspec 含入)
- Mode C 不寫 stories 表(非 Story);若任務執行中發現需要 Story 級治理的工作 → 報告 Blockers 交主視窗,走 Mode A/B

---

## §11 通訊模型與全情境流程(2026-06-06 固化 · 使用者裁定)

### 11.1 與 MCP 的類比(像,但關鍵不同)

| | MCP | 本體系(dispatch + worker) |
|---|---|---|
| 相似 | 標準化契約、跨進程邊界、能力工具化 | 同 |
| 訊息模式 | 同步 RPC:結果直接灌進主視窗 context | **非同步檔案信箱**:雙方不直接通話,各自讀寫約定位置 |
| Token 後果 | 工具回傳多大,主視窗 context 吃多大 | 子視窗工作過程**不進**主視窗 context,主視窗只選擇性取用產物 |

### 11.2 Context Token 帳本(不過載的根本原因)

主視窗與子視窗是**兩個完全獨立的 Claude session**,各有 context window,互不滲透:

- 主視窗每任務支出:prompt 檔 ~300 + dispatch ~100 + 摘要 ~400 + Read 報告 ~500-1500 + diff 審查 1-5k + commit ~200 ≈ **2-8k token/任務**(50 任務 ≈ 100-400k,主視窗 1M 充裕)
- 子視窗:全新 session 從零開始(不繼承主對話),工作過程再大都與主視窗無關,視窗關閉即蒸發
- 鎖死機制:報告強制短格式 + 摘要 WORKER_FILES 差集(主視窗只審本任務 diff)
- 代價即特性:子視窗不知道主對話內容 —— 需要的脈絡必須在 G0 寫進 prompt(任務指令自含)

### 11.3 八通道總表(誰寫 → 誰讀)

| # | 通道 | 寫入者 | 讀取者 | 內容 |
|---|------|--------|--------|------|
| 1 | prompt-{phase}.txt(IPC) | 中控原稿,dispatcher 複製 | worker → claude 啟動指令 | 任務指令全文(general;BMAD 由 worker 自建 prompt) |
| 2 | task-{phase}.json(IPC) | dispatcher | worker | model / 報告路徑 / baseline / story 參數 |
| 3 | system-{phase}.txt(IPC) | worker 組裝 | claude(system prompt) | 身分 / 紀律 / REPORT_PATH / CLOSE_MODE(2026-08-01 whp-2 起恆為 `never-auto`,單純告知 agent 視窗不會自動關;BMAD:Story context + protocol) |
| 4 | status-{phase}.json(IPC) | **Stop hook 自動**(turn 結束瞬間) | `pipeline-guardian.ps1`(存活/停滯偵測)+ dispatcher(有界確認窗內若已存在則反映於摘要) | 狀態 / files_changed / report_exists(BMAD:db_status / tasks_backfilled) |
| 5 | 任務報告 .md(IPC 外) | 子視窗 agent 最後動作 | **中控 Read** | 摘要 / 變更檔案 / 決策 / blockers(BMAD 對應物 = Story DB 欄位) |
| 6 | git working tree | 子視窗實際工作 | 中控 diff 審查 | 變更實質(唯一不可偽造的證據) |
| 7 | tracker.json | dispatcher('running')+ worker('closed') | 中控 | 4-Tuple 身分(隨時可殺可辨識) |
| 8 | dispatcher stdout 摘要 | dispatcher 結束時 | **中控**(harness 通知送達) | OUTCOME / STATUS / WORKER_FILES 差集 |

**核心理解**:「回報」不是子視窗主動傳訊(它不知道中控存在)—— 是把產物放在約定位置(5+6),Stop hook 拍快照(4),dispatcher 斷氣時把摘要(8)透過 harness 通知送進中控對話。**信箱模式,非通話模式。**

### 11.4 情境 A:標準成功流(2026-08-01 whp-2 起 · 視窗永不自動關閉)

```
中控                          dispatcher(背景)             子視窗
①寫 prompt 檔
②背景啟動 dispatcher ───────→ ③建 IPC + baseline 髒檔快照
                              ④Start-Process 可見視窗(-NoExit)→ ⑤worker 讀參數 + 註冊 CTRL_CLOSE_EVENT + 啟動 claude
                              ⑥有界確認(dispatchConfirmSec,   ⑦claude 自主執行任務(獨立 context)
                                預設60s):見 claude.exe 子行程   ⑧最後動作:寫任務報告檔
                                或逾時但 wrapper PID 存活即可   ⑨輸出收尾警語(視窗刻意保持開啟/關窗須中控走完握手/
                                    │                            使用者可自行關閉)→ turn 結束,視窗續存
                                    │                         ⑩Stop hook 自動寫 status.json(agent 不經手)
                              ⑪印摘要(NOTICE:視窗不會自動關閉)
                              → exit(不等待視窗關閉)
⑫harness 通知叫醒中控 ←───────┘
⑬中控隨時 Read status/report/git diff(視窗仍開啟,無時間壓力)
⑭G3 審查(V1-V5)→ pathspec commit → 下一任務(視窗留待人工檢視/關閉)
```

逐段:①② 任務指令自含,背景啟動後對話立即解放;③-⑤ 機械準備 + 開可見視窗(`-NoExit` 使 script exit 後視窗不消失)+ 4-Tuple 登記(此刻起 guardian 開始存活偵測);⑥ 薄手唯一的等待窗口,解析後**立即退出、不等視窗關閉**;⑦-⑨ 子視窗在自己的獨立 context 自主工作,完成前必寫報告、末句印收尾警語(非倒數關窗);⑩ turn 一結束 Stop hook 機械拍證據快照(防造假),`pipeline-guardian.ps1` 常駐守護接手後續存活/停滯偵測;⑪⑫ dispatcher 印摘要後斷氣(worker 進程與其視窗完全不受影響,繼續存在),harness 以其死訊敲醒中控;⑬⑭ 中控比對「報告宣稱 vs diff 實質」,通過才 commit、推下一棒 —— **視窗留在桌面供隨時查驗,不因推進下一任務而消失**。

### 11.5 情境 B(🔴 已退場):舊 controller 收尾模式

> **2026-08-01 whp-2**:原「controller 模式(中控 grace 後 `Stop-WorkerSafe` 關閉)」與情境 A 舊版的「auto watchdog」同屬**已封存的收尾機制**,`generalTask.close_mode` 讀取邏輯已無消費者。**兩種模式合併為單一現況**:視窗永不自動關閉(見上方情境 A),`close_mode`/`close_delay_sec` 兩鍵仍存在於 config(供未來 `whp-6` 參考)但目前不影響任何行為。

### 11.6 情境 C:使用者手動關閉視窗(唯一合法關窗途徑)

`whp-6` `close-worker.ps1` 落地前,**關窗僅限使用者手動操作**(點視窗 X / 工作管理員 / 右鍵關閉)。worker 已註冊 `CTRL_CLOSE_EVENT` handler(whp-1 R2 已驗證範式,3/3 可靠、本機實測 4.6s 寬限期):使用者關閉時會印警語 + 寫 marker(`user-closed-{phase}.marker`,位於該 run 的 IPC dir)供中控事後查驗「這個 run 是被人關的,非正常完成」。**中控不得繞道呼叫 `Stop-WorkerSafe` 自動關窗**(對齊 `worker-lifecycle-judgment.md` FORBIDDEN;該函式本體保留供 `whp-6` 未來的顯式人工授權流程使用)。

### 11.7 情境 D:審查發現問題 → 接續/補充(溝通核心)

**子視窗關閉 = 它的 session context 蒸發,不能「叫住」它;但全部價值產出已落在檔案系統 —— 檔案現場即交接書:**

```
中控審查發現缺口
  ├ 小缺口(改幾行)──→ D1:中控親自補(最快)→ commit
  ├ 需重做/補充 ─────→ D2:派「新」子視窗,prompt 帶 feedback:
  │    「前輪任務報告在 {路徑},已完成 {X},diff 中 {file:line} 有以下問題:…
  │      請讀取報告與現場後僅修正這幾點,完成後更新報告。」
  │    → 新子視窗讀報告 + code 現場 ~30 秒重建脈絡 → 走完整 11.4 流程 → 中控再審
  └ 報告標 Blockers(子視窗自己發現需中控決策的事)
       → 中控裁決 → 裁決結果寫進下一輪 prompt → D2
```

報告格式強制「變更檔案 / 關鍵決策 / Blockers」的原因:**它是寫給下一棒(中控或新子視窗)的交接文件**。(進階備援:status.json 存有子視窗 session_id,理論可 `claude --resume` 復活原 session;目前刻意不用 —— 新視窗 + 檔案現場更乾淨、無歷史包袱,已實證。)

### 11.8 情境 E:worker 長時間未完成(2026-08-01 whp-2 · 取代舊版 Timeout/exit 2)

薄手在有界確認窗(`dispatchConfirmSec`)解析後即退出,**已無等待 timeout 的概念**,`-TimeoutSec`/`phaseTimeouts` 對此路徑不再影響返回時機。長時間未完成的判別完全交給 `pipeline-guardian.ps1` 常駐守護(30/10/10 per-run 檔案活動探測,§4.5):連續 2 輪(20min)零變動只寫 `health_flag='stalled-suspect'`,**guardian 零 kill**。中控看到旗標後三選一裁決:續等(可能只是長任務或長思考)/ 喚醒(提醒使用者查看視窗)/ 重派(視缺口走 11.7 D2,前提是使用者已手動關閉舊視窗)。(處置權刻意留給中控 —— E1 黑箱「等 30 分鐘自動殺 + 盲目重試」的反面。)

### 11.9 情境 F:啟動失敗

worker 啟動 claude 失敗 → 自寫 status=failed(含錯誤訊息)→ `exit 1`(**不強殺自己**,`-NoExit` 使視窗續存供人工查看錯誤)→ dispatcher 摘要 STATUS=failed → 中控讀 `logs/claude-{id}-{phase}-err-*.log` 查因 → 修復後重派。

> **一句話總結**:中控與子視窗之間沒有任何即時通話 —— 指令靠 prompt 檔送入,成果靠報告檔 + git 現場留下,完成靠 Stop hook 快照宣告,叫醒中控靠 dispatcher 斷氣,接續靠新視窗讀交接書。每一段都不佔對方的 context,這就是不會過載的根本原因。**(2026-08-01 whp-2)視窗本身不再是流程的一部分**——它純粹是留給人看的證據現場,不參與任何自動化判斷。

---

## §12 Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.0** | **2026-08-01** | **worker 收尾機制全面更新(whp-2-no-autoclose-liveness AC9)**:使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」正式落地 —— §2 架構圖 / §3 exit codes + timeout 處置 / §4 收尾模式表格行 / §8 通道表 CLOSE_MODE+status 欄 / §11.4-§11.9 全部情境流程圖改寫,反映:(a) 舊 `close_mode` auto/controller 雙模式與 watchdog 皆已封存,視窗永不自動關閉;(b) 薄手終止條件改「有界確認即退出」,無等待迴圈,exit code 2 不再產生;(c) 30/10/10 停滯判別全數移交 `pipeline-guardian.ps1` 常駐守護(guardian 零 kill,中控三選一裁決);(d) 手動關閉為 `whp-6` 前唯一合法途徑,新增 `CTRL_CLOSE_EVENT` handler 印警語 + 寫 marker。舊版情境 B(controller 模式)整節標退場。Version History 以上條目屬歷史敘述不改寫。frontmatter version/updated/last-synced-epic 同步 bump(見主 SKILL.md)。 |
| **1.2.0** | **2026-07-25** | **Model 名單對齊 Claude Code CLI 現行 `/model` picker**:§3 `-Model` 參數表 + 使用範例 + §9 Self-Check Q5 三處 `opus-4.8` → **`opus-5`**(CLI 現行 Opus 分層已更名;`legacy opus-4.8` 保留可用,對齊既有 `sonnet-4.6` 降級先例)。CLI 2.1.219 live-verified:`claude-opus-5[1m]` → `contextWindow=1000000`。對齊 `pipeline-config.json generalTask.presets` 新增 `opus-5` + party-to-pipeline SKILL.md v5.9.0。 |
| **1.1.0** | **2026-06-06** | ① **§11 通訊模型與全情境流程固化**(使用者裁定):MCP 類比 / Context Token 帳本 / 八通道總表 / 情境 A-F 流程圖(原 §11 Version History → §12)。② **v5.4.0 薄手統一**:§1 執行控制改「E2 主視窗薄手直控預設(Story 三階段同走 dispatch -Phase)」、§2 加統一 callout(1 腦 + 1 手 + 4 worker)、§3 參數表加 -Phase + Story 用法範例。背景:tracker 142/143 BMAD worker killed 實證 ACK 優雅關窗為死碼,orchestrator.ps1 退守 E1。 |
| **1.0.0** | **2026-06-05** | 初版建立。party-to-pipeline v5.3.0 Mode C —— 2026-06-05 Party Mode 全專家收斂 + 使用者 5 點補充裁定(model 可選 3 presets / effort max 固定 / ultrathink 三重注入 / 去 orchestrator 主視窗直控 / 模組校正序列場景)。新增 dispatch-general.ps1(薄手)+ worker-general.ps1(克隆 worker-dev 骨架,砍 Story/BMAD/ACK,不剝 [1m])+ general-protocol-template.md + stop-report.ps1 v1.1.0 general 分支 + pipeline-config.json generalTask 段。零改 orchestrator.ps1 / shared-utils.ps1(Stop-WorkerSafe scriptSuffix default 分支天然支援 general)。 |
