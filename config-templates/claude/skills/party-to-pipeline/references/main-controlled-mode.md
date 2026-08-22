# Main-Controlled Mode (E2) — Party-to-Pipeline v5.2.0 L3

> 主對話視窗親自當中控的 Phase 4 執行子模式(**預設首要模式**)。與 Mode A/B(任務來源維度)正交。對應 [architecture-deep-dive.md §1.1](architecture-deep-dive.md) User 原始設計直覺 + `claude-launcher-interactive` 主視窗手動 launcher 範式復原。
>
> **新預設原因**: 本 session(2026-05-28 ecc-emergence A/B)實證 E1 orchestrator 黑箱在 D3/D14/D2 3 個 open 缺陷下不可靠,E2 主對話中控解決所有 + 不依賴 worker IPC。

---

## §1 核心理念

E2 主對話中控 = 主對話(Opus)親自當中控,**逐階段 dispatch 單一 worker** + **每階段親自驗證回填證據** + **階段間 commit clean tree** + **三階段全完成抽樣 3 項 file:line 驗證** → commit。

對應 [architecture-deep-dive.md §1.1](architecture-deep-dive.md) User 原始設計直覺:
> 「子視窗開完整 claude code 互動模式執行任務 → 任務完畢回報中控 → 自動關閉 → **中控檢查 → commit → 推下個任務**,中控可 kill 子視窗 + 辨識哪個子視窗」

---

## §2 E1 vs E2 對比

| | **E1 Orchestrator-Controlled**(黑箱 · **🔒 FROZEN 2026-08-03**,詳 [ack-handshake.md §8](ack-handshake.md)) | **E2 Main-Controlled**(主對話中控 · **唯一現行模式**) |
|---|---|---|
| 啟動方式 | 主對話一次 `orchestrator.ps1 -StoryId X`(不帶 -Skip) | 主對話分階段 `dispatch-general.ps1 -StoryId X -Phase {phase}`(v5.4.0 薄手直連;舊式 orchestrator -Skip 殼退場) |
| 中控者 | `orchestrator.ps1` 自動串 3 階段 | 主對話 agent(Opus)親自 |
| 階段間可見性 | ❌ 黑箱(跑完才通知主對話) | ✅ 每階段完成即通知主對話 |
| 階段間介入 | ❌ 無 | ✅ 主對話親自 gate + commit + 決策 |
| 任務開始/結束時間驗證 | ❌ orchestrator 只檢 DB status target | ✅ 主對話親自驗 lifecycle invariant |
| tasks 回填驗證 | ❌ 無 | ✅ 主對話親自驗 + 三層語意分析 |
| worker hang 處理 | 等 1800s timeout(成本高) | 即時可見,主對話介入 |
| review 後 ⬜ 處理 | 無分析 | 3 情境分析(A/B/C) |
| 抽樣驗證(防假回填) | ❌ 無 | ✅ 隨機抽 3 項 file:line |
| **適用** | 批次/簡單 S-M/低風險/可信任務 | **預設使用**;特別適合 L/XL/前端 CR/需介入/複雜 Story |

> **(whp-6)`-Resume` switch**:`dispatch-general.ps1 -StoryId X -Phase {phase} -Resume` 於 Register 前查該 Story 最近一筆已有 `session_id` 的 `worker_runs` 列,找到則改帶 `--resume <session_id>` 啟動 claude(取代 `--session-id` 開新會話)並將 `resumed_from_run_id` 回填至新 run 列;查無前次會話 / `workerProtocol.resumeEnabled=false` 時 fail-open 退回一般 `--session-id` 全新會話。用於階段內失敗重派或需要延續前次對話上下文的場景,`-DryRun -Resume` 可唯讀預覽是否會找到可延續的會話而不觸發真實派發。

---

## §3 E2 逐階段 SOP

```
【前置 Phase 0-3(與現有 Mode A/B 相同)】
Mode A(Party Mode 討論建 Story) 或 Mode B(stub 已建)
→ Story upsert status=backlog + task_track

【Phase 4 E2 主對話逐階段中控 — 每階段走同一條握手閉環(v5.24.0;完整節點手冊見 ack-handshake.md)】

每階段(create-story → dev-story → code-review)重複 1-8;模型由 phaseModelMapping 決定
(現行 create/review = Opus 分層 [1m] max、dev = Sonnet 分層 [1m] max;SSoT: pipeline-config.json):

1. 派發前:preflight-dispatch.ps1 -StoryId X -Phase {phase} 五檢查 PASS
   (含 PREV_PHASE_CLOSED 上一階段已達終態 + UNREAD_MESSAGES 本軌必讀留言)
2. 派發:dispatch-general.ps1 -StoryId X -Phase {phase} [-ControllerTrack 軌別]
   └ register(dispatching)→ spawn worker-{phase}.ps1(D1 前綴中控指示)→ confirm(running)
     → 薄手有界確認即退出(≤ dispatchConfirmSec;視窗永不自動關閉,續留供人工檢視)
3. 中控不空等(§4.6 三紀律)— 去做別的事或結束 turn;guardian 常駐觀測(§4.5)
4. worker 完成 → Stop hook 寫 IPC status-{phase}.json + CAS lifecycle=reported
   → 中控下次 prompt 由 worker-notify-inject 注入「待確認」
   (序列依賴且無其他工作:必掛 Monitor persistent,§4.6 ② — 通知捷徑,非判定依據)
5. ★ GATE 六證據鏈(§4)逐項驗;review 階段另做 §5 三層語意 + §6 三情境分析 + §7 抽樣 3 項
6. 簽收 + 裁決:ack_worker_run(reported → awaiting-review)→ gate_worker_run:
   ├ approved → 7
   ├ revise → 指示自動入 worker_messages → D2 快環 / knock-worker.ps1 慢環敲門原視窗續作 → 回 4
   └ rejected → lifecycle=failed → 分析後重派(preflight 擋殘留;-Resume 可延續會話)
7. 關窗:close-worker.ps1 -RunId(CAS closed 先於 taskkill;誰派發誰關)
8. 階段 COMMIT 波(§3.5 commit pre-check → pathspec commit → clean tree)→ 下一階段回 1
   ★ 關鍵: clean tree 後才進 dev(解 B dev dirty-tree 卡死根因)
   worker-review.ps1 子視窗 Chrome MCP 限沙盒(見 §9 worker prompt 沙盒指示)
```

> **(v5.24.0 校正)** 舊版流程止於「GATE 階段檢查」,握手後半段(ack / gate / close-worker)只存在於 rules 而未載入本 SOP,正是中控漏走簽收與關窗、或誤用舊機制的成因之一。dispatcher process exit 的 task-notification **只代表派發確認**(有界確認即退出),不代表 worker 完成 — worker 完成的通知落點是上方節點 4。

---

## §4 中控驗證「回填證據」項(判斷任務正確執行的依據)

對齊 [`story-lifecycle-invariants`](../../../../.claude/rules/story-lifecycle-invariants.md) I1-I9:

| 階段 | 開始時間 | 結束時間 | agent | tasks 回填 | DB status | 額外項 |
|---|---|---|---|---|---|---|
| **create** | `create_started_at` | `create_completed_at` | `create_agent` (I5) | AC/SDD | ready-for-dev (I1) | (L/XL)`sdd_spec` |
| **dev** | `started_at` (I2) | `completed_at` (I3) | `dev_agent` (I6) | tasks ✅/⬜ + file_list | review (I3) | `test_count` |
| **review** | `review_started_at` (I8/I9) | `review_completed_at` (I4) | `review_agent` (I7) | tasks 含 CR 痕跡 | done (I4) | `cr_score` + `cr_summary` |

**主控端中控就是機械檢查這些不變量** — E1 黑箱只看 status target,E2 看完整證據鏈。

---

## §4.5 Worker 活動探測 30/10/10(停滯判別時間表 · 2026-07-04 使用者裁定 · 2026-08-01 whp-2 起由 `pipeline-guardian.ps1` 常駐守護執行)

> dispatch 薄手已無 timeout 等待迴圈(見下方),**worker 停滯判別與本表執行者現皆為 `pipeline-guardian.ps1`**(住在所有子視窗外面的常駐單例,雙節奏 tick),非中控人工或 dispatch script 自身。worker 停滯與否以「**檔案活動**」為證據(per-run scope,非全 repo git dirty)— 防誤判仍正常執行中的 worker。完整判定邏輯(4-Tuple liveness + 30/10/10 + 三選一裁決)已收斂至 [`worker-lifecycle-judgment.md`](../../../rules/worker-lifecycle-judgment.md) SUPREME §1/§3.5 為唯一權威定義,本節僅摘要與該 rule 的關係,**不重複維護時間表細節以免兩處漂移**。

**摘要**:guardian 快 tick(30s)持續做存活偵測;慢 tick(600s)對 `lifecycle∈{running,revising}` 的 run 做 per-run 檔案活動快照比對,連續 2 輪(20min)零變動只寫 `worker_runs.health_flag='stalled-suspect'`,**guardian 零 kill / 零關窗原語**(使用者硬裁定③);中控依此旗標三選一裁決(續等/喚醒/重派)。判定邏輯實作於 `.context-db/scripts/guardian-tick.js`(26 BR,64 tests)。`Ensure-Guardian` 冪等自癒,已接線於 `register-run.ps1 -Mode Register`。

**首例應用**(2026-07-04,建立本範式時仍為 dispatch script 自身邏輯,歷史脈絡保留):後台軌 L1 CR worker(dispatch 16:38 → 17:13 薄手 timeout exit 2,worker 存活續跑且差集已見 7 檔產出)— 中控依本範式啟動背景活動探測續等,未投機殺。

**(2026-08-01 whp-2 · 取代 2026-07-25 v2.1.0 部分機械化描述)**:薄手(`dispatch-general.ps1`)的等待迴圈(含 `Get-ActivityFingerprint` repo-wide 指紋)已全數退場,終止條件改為**有界確認即退出**(`dispatchConfirmSec` 預設 60s,§1 已述)。30/10/10 判定完全移交上方所述的 guardian 常駐守護,不再有「dispatch 自己記快照」這回事。`pcpt-preview-modal-zoom-controls` dev-story 曾因固定 timeout 早於 worker 完成先行退出而零觀察者(2026-07-25 事故,觸發 v2.1.0 部分機械化)— 該根因已隨本次「視窗永不自動關閉 + guardian 常駐」的架構改動一併消除:guardian 不受任何單次 dispatch 呼叫的生命週期限制。

---

## §4.6 dispatch 後中控的等待紀律(正常完成路徑 · 2026-08-03 實測教訓固化)

> §4.5 管的是**異常路徑**(停滯 / 消失,guardian 負責);本節管**正常路徑** —— dispatch 之後、worker 回報之前,中控該做什麼。
>
> **這一節存在的理由**:whp-2 把薄手的等待迴圈全數移除(有界確認即退出),whp-8 的 L2 通知掛在 `UserPromptSubmit`。兩者交集處留下一句沒寫的話 —— 「那中控自己要做什麼」。2026-08-03 中控在此空白處自行發明了輪詢,連續兩次失敗,才回頭發現**閉環本來就是完整的**,缺的只是這條紀律。

### 三條紀律

**① dispatch 後不空等 —— 去做下一件事,或結束 turn。**

通知的正常路徑是 `worker-notify-inject.js`(whp-8,`UserPromptSubmit` 第 5 顆 hook):worker 完成 → Stop hook 推進 `lifecycle=reported` → guardian 遞增 `notify_count` → **中控下次送出 prompt 時**自動注入「🔔 待確認 N 筆」。這條路徑**是完整的**,前提是中控會繼續活動 —— 而 E2 本來就假設中控 dispatch 完接著推別的事。空等會讓這個假設失效,然後看起來像是架構斷了。

**② 序列依賴且無其他可推進項時,結束 turn 前必掛 `Monitor` + `persistent: true`(v5.24.1 由「例外工具」升級為 MUST)。**

適用判準:「下一步完全依賴本卡完成、且中控確無其他可推進項」—— 此時①的「去做下一件事」不存在,「結束 turn」等於把喚醒完全外包給使用者回來打字。終止條件**必須同時涵蓋完成與異常**(IPC `status-{phase}.json` 出現 / wrapper PID 消失但無 status 檔)—— 只監看成功信號時,worker 崩潰與 worker 仍在跑的外顯完全相同,靜默會被誤讀為順利。有其他可推進項時仍不掛,回到①。

升級實證(2026-08-03 22:18-22:34):bwu-12 dev worker 22:18:44 `reported`,通知鏈全數正確運作(guardian `notify_count=2` + `worker-notify-inject` 於下個 prompt 送達),但中控 21:12 dispatch 後依①結束 turn 且**未掛 Monitor**(當時序列依賴成立 —— 下一步 CR 完全依賴本卡),使用者離開 → `reported` 停等 16 分鐘直到使用者回來,使用者觀感即「握手斷訊」。**機制零斷點,行為漏用②**。機制面互補(guardian 催辦時對 idle 中控敲門)見 `ccb-5-pending-ack-controller-knock`。

**③ 禁以 Bash `run_in_background` 開長迴圈等 worker。**

2026-08-03 實測兩次皆被中止:第一次可歸因於設定矛盾(迴圈 3600s vs 該工具 timeout 上限 600s),**第二次設定已對齊仍在約 2 分鐘被中止,原因未查明** —— 此處只記錄實測結果,不對機制做超出證據的推論。同期 `Monitor` + `persistent` 實測穩定並於 worker 回報當下成功送達。

### 判定權威不變

`Monitor` 只是通知捷徑,**不是判定依據**:它響了不代表可跳過 GATE 六證據鏈(§4),它沒響也不代表 worker 沒完成(查 `worker_runs` + IPC status 才算)。判定 worker 狀態的權威永遠是 [`worker-lifecycle-judgment.md`](../../../rules/worker-lifecycle-judgment.md) §1 的 4-Tuple + IPC status 檔。

### FORBIDDEN

| 禁止 | Common Rationalization | Red Flag |
|:-----|:----------------------|:---------|
| dispatch 後在同一 turn 內空等 worker(不做其他事、不結束 turn) | 「下一步要等它,我先盯著」 | transcript 出現連續 sleep / 輪詢 / 反覆查同一個 IPC 路徑,期間零實質產出 |
| 以 Bash `run_in_background` 長迴圈作為等待機制 | 「掛背景又不佔前台,被殺也無害頂多重掛」 | 同一等待目標重掛 ≥ 2 次;或迴圈設計時長 > 該工具 timeout 上限 |
| 因「沒收到通知」即判定架構有缺口並著手改機制 | 「worker 完成卻沒人通知我,這是斷鏈」 | 提出改 guardian / 加推送管道之前,未先查 `worker_runs` 握手鏈是否其實已走完 `reported → ack → closed` |
| **(v5.24.1)** 序列依賴且無其他可推進項時,結束 turn 前未掛 `Monitor`(persistent) | 「§4.6 說不空等,結束 turn 就對了;通知下個 prompt 自然會到」 | dispatch 後收尾訊息只寫「您下次送出 prompt 時會收到通知」而無 Monitor 掛載;`reported` 後 `ack_at` 長時間 NULL 且中控零活動(2026-08-03 22:18-22:34 實證,16 分鐘停等) |

> 🔴 第三條的觸發實例即本節來源:2026-08-03 中控因空等而未收到通知,將其誤診為「worker→中控缺推送管道」,已著手設計 guardian 敲門新卡;經使用者反問「閉環不是已經完成了嗎」後查證 —— 當日 `ccb-4` 與 `bwu-12` 兩張卡的握手鏈**皆完整走完** `dispatch → reported → ack → closed`(`close_source=ControllerAfterHandshake`)。**架構零缺口,偏離的是中控行為**。差一步就為了修正自己製造的問題而增加架構複雜度。

---

## §5 任務清單三層語意

| 標記 | 含義 | E2 中控判讀 |
|---|---|---|
| **✅✅** | dev ✅ + **review 再審核加勾** → 雙重驗證 | 完整通過(最高品質) |
| **✅** | 只 dev 勾,review **沒審核** | review 漏審該項(不完整,應促 review 補審) |
| **⬜** | dev 沒做(或子視窗無法執行) | 依 §6 情境 A/B/C 處理 |

---

## §6 review 完成後沒回填項目 3 情境分析

| 情境 | 條件 | 推斷 | 處理 |
|---|---|---|---|
| **A** | tasks 全沒回填 + **時間齊全** | tasks-backfill-verify 步驟被遺漏(任務做了但回填跳過) | 派 review 子視窗**調用 tasks-backfill-verify SKILL 補回填**(不是重做 review,只補 SKILL 調用步驟) |
| **B** | **時間其一不齊** + tasks 全沒回填 | review 階段沒完整執行 | 派 review 子視窗**重做** |
| **C** | 時間齊全 + tasks **大多回填** + **少數 ⬜** | 該少數項目子視窗無法執行 | **主對話視窗(主控端)親自執行** |

### 情境 C 範例(`ecc-emergence-governance` 本 session 實證)

| ⬜ 項 | 主控端執行結果 |
|---|---|
| 1.3 normRejectKey 單元測試 | ✅ **補實作**(entry guard + 8 測試 PASS) |
| 2.4 like/reject CLI 獨立測試 | ✅ **ACCEPTED defer**(需 DB fixture,間接測已覆蓋,列入 follow-up) |
| 5.4 Chrome MCP live verify | ✅ **ACCEPTED defer**(延至下個 Story 一併 live verify) |

**主控端執行 = 智能判斷處理**: 補實作 / 評估後 ACCEPTED defer + 列入 follow-up(非機械補)。

---

## §7 最終抽樣 3 項 file:line 驗證(防假回填)

三階段全完成 + commit 前:
1. 主對話從 tasks 清單**隨機抽 3 個 ✅✅ 項目**
2. 對每項讀對應 file:line 確認**實作真實存在**(防「✅ 有勾但 code 不存在」假回填)
3. 抽樣無問題 → commit
4. 抽樣有偽 ✅ → 標 ⬜ + finding,回情境 C 處理

### 範例(B 本 session 抽樣)

| 抽樣項 | file:line | 驗證結果 |
|---|---|---|
| 1.1 normRejectKey | upsert-instinct.js:47-53 | ✅ 函式存在 · 對齊 AC1 spec |
| 2.1 cmdLike | upsert-instinct.js:250-262 | ✅ LIKE_DELTA=0.05+clamp+ledger 完整 |
| 2.2 cmdReject | upsert-instinct.js:265-283 | ✅ reject_count 累加 + verifier_status=rejected |

---

## §8 E1/E2 選擇矩陣(何時用哪個)

| 場景 | 推薦 | 理由 |
|---|---|---|
| **一切場景(含批次)** | **E2** | **E1 已 🔒 FROZEN(2026-08-03)** — 檔案式 ACK 在 whp-2 後每階段必然 force-kill(見 [ack-handshake.md §8](ack-handshake.md));批次需求改 E2 逐卡序列(一次一視窗) |
| 複雜 Story(L/XL) | E2 | 階段間風險高,主對話可隨時介入 |
| 前端 UI Story(需 Chrome live verify) | E2 | 主對話可應答 Chrome 授權,worker 卡(對齊 [`feedback_subwindow_chrome_mcp_sandbox_only`](../../../../.claude/projects/${PROJECT_SLUG}/memory/feedback_subwindow_chrome_mcp_sandbox_only.md)) |
| 高風險任務(改 SUPREME rule/SKILL/Schema) | E2 | 階段間 gate 可阻止錯誤擴散 |

---

## §9 worker prompt Chrome 沙盒指示(配套修補)

對應 [`memory/feedback_subwindow_chrome_mcp_sandbox_only`](../../../../.claude/projects/${PROJECT_SLUG}/memory/feedback_subwindow_chrome_mcp_sandbox_only.md)(A CR worker 2 次 30min timeout 根因)。

### 注入位置

- `scripts/protocol-template.md`(worker prompt 共用範本)
- `scripts/worker-review.ps1`(review 階段 prompt 構建)

### 必加指示文字

```
⚠️ Chrome MCP 沙盒限制(子視窗 YOLO 模式):
- 本子視窗以 --dangerously-skip-permissions 啟動,**無人應答互動授權**
- **必用沙盒模式**: claude-in-chrome MCP(新 sandbox instance · 無使用者狀態 · 不需授權)
- **禁連真實 Chrome**: chrome-devtools MCP port 9222(連使用者日常 Chrome 會卡互動授權請求 → worker turn 永不結束 → orchestrator 30min timeout)
- 若需真實 Chrome 狀態(cookie/login)的驗證,改主視窗親自做(主視窗可應答授權)
```

### 實作落實時機

本 SKILL v5.2.0 已記錄指示文字。實際注入 `protocol-template.md` / `worker-review.ps1` 屬 pipeline scripts 修改,走 `hooks-mechanization` 或本 SKILL 後續落實。

---

## §10 解決 architecture-deep-dive.md 既有 open 缺陷

| 缺陷 | 嚴重度 | E2 解法 |
|---|---|---|
| **D3** code-review opus thinking loop/stall | HIGH (open) | 主對話介入避 worker hang; 若需重做,主對話判斷而非黑箱 retry |
| **D14** claude session hang detection 缺 progress signal | HIGH (open → **緩解**) | 主對話每階段即時可見,不等 1800s deadline;**§4.5 30/10/10 檔案活動探測**給出可操作的停滯判準(連續 20min 零檔案活動才裁定停滯) |
| **D2** handshake.enabled=false 名存實亡 | MEDIUM (open → **關閉 2026-08-03**) | E1 連同該 flag 一併 🔒 FROZEN;現行握手 = DB 閉環(`worker_runs.lifecycle`,見 [ack-handshake.md](ack-handshake.md)),無 handshake.enabled 消費場景 |

---

## §11 本 session 實證(2026-05-28 ecc-emergence A/B)

| 場景 | E1 結果 | E2 結果 |
|---|---|---|
| **A CR**(前端 UI L) | worker 卡 Chrome 授權 2×30min timeout,FAILED | 主對話親自 CR,score 92 done(commit `386147c4`) |
| **B dev**(dirty tree) | 2×30min timeout,0 產出 | clean tree 後 6.8min 成功 |
| **B review**(前端 UI) | worker timeout 30min,**DB done 靠 STATE_DRIFT fallback 救援(運氣)** | E2 抓到 dev `started_at=null` invariant + 抽樣 3 項 file:line 真實 + 補 ⬜ 1.3(commit `8f6304a8` + `7f9a24e5`) |

**關鍵實證**: B review worker timeout 但 DB done — E1 黑箱靠 STATE_DRIFT fallback 救(運氣),E2 主對話直接驗 DB 證據 + 抽樣防假回填 = **不賭 worker IPC** 的核心價值。

---

## §12 Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.1** | **2026-08-03** | **§4.6 ② 升級 MUST(party-to-pipeline v5.24.1)**:「例外工具」→「序列依賴且無其他可推進項時,結束 turn 前必掛 Monitor persistent」+ 適用判準 + 22:18-22:34 bwu-12 實證段(機制零斷點、行為漏用②)+ FORBIDDEN 第 4 列;§3 節點 4 措辭同步。機制面互補卡 `ccb-5-pending-ack-controller-knock` 已建。 |
| **1.3.0** | **2026-08-03** | **§3 逐階段 SOP 改寫為握手閉環 10 節點版(party-to-pipeline v5.24.0)**。舊版流程止於「GATE 階段檢查」,握手後半段(`ack_worker_run` / `gate_worker_run` / `close-worker.ps1` / revise 迴圈)只存在於 rules 而未載入本 SOP — 中控漏走簽收與關窗、或走回舊機制的成因之一;「主對話 ← task-notification 通知(dispatcher process exit)」的舊語意一併校正(dispatcher exit 只是派發確認,worker 完成通知落點 = `worker-notify-inject` 下次 prompt 注入)。§2 表頭 + §8 選擇矩陣:E1 標 🔒 FROZEN(2026-08-03,理由見 ack-handshake.md §8),批次場景改 E2 逐卡序列;§10 D2(handshake.enabled 名存實亡)標關閉 — E1 連同該 flag 一併凍結,現行握手為 DB 閉環。走 `Skill(skill="skill-builder")` Mode B。 |
| **1.2.0** | **2026-07-04** | **§4.5 Worker 活動探測 30/10/10 範式新增**(使用者裁定):dispatch 後 T0+30min 首檢記錄檔案活動快照(僅記錄不判殺)→ 每 10min 複查檔案變動(有變動 = worker 正常執行,重置計數)→ 連續 2 輪(20min)零變動中控才 kill → 分析檢查 → 重新發配;完成信號(IPC status / claude gone)任一時點轉 §4 GATE。防誤刪執行中 worker(後台軌歷史 force-kill 反模式根治的操作化)。含 5 操作要點(快照指紋 / 排除中控自編輯路徑 / 腳本只回報不殺 / 長思考誤判排除 / 與三層判別關係)。§10 D14 標 open → 緩解。首例:2026-07-04 後台軌 L1 CR worker(timeout exit 2 後依範式續等)。 |
| **1.1.0** | **2026-06-06** | **v5.4.0 薄手統一**:§3 E2 SOP 三階段 dispatch 從 `orchestrator.ps1 -Skip` 單階段殼改為 `dispatch-general.ps1 -Phase {phase}` 薄手直連(零驗證零 ACK,主視窗唯一的腦);§2 E2 啟動方式同步。背景:tracker 142/143 BMAD worker killed 實證 orchestrator ACK 優雅關窗為死碼,worker 接 close watchdog(status+5s 自動關窗)。orchestrator.ps1 退守 E1 批次黑箱專用。 |
| **1.0.0** | **2026-05-28** | 初版建立。party-to-pipeline v5.2.0 升版 — E2 主對話中控設為 Phase 4 預設首要執行模式。對應 architecture-deep-dive §1.1 User 原始設計直覺復原(claude-launcher-interactive 主視窗手動 launcher 範式)。本 session(2026-05-28 ecc-emergence A/B)實戰驗證 E2 必要性 — A CR Chrome timeout / B dev dirty tree 卡死 / B review timeout 但 STATE_DRIFT 救援 — 全部佐證 E2 不依賴 worker IPC 的核心價值。包含: §1 核心理念 + §2 E1/E2 對比 + §3 逐階段 SOP + §4 中控驗證證據項(對齊 lifecycle invariants I1-I9)+ §5 三層任務語意(✅✅/✅/⬜)+ §6 review 後 3 情境分析(A/B/C)+ §7 最終抽樣 3 項 file:line + §8 E1/E2 選擇矩陣 + §9 worker Chrome 沙盒指示 + §10 解決既有 open 缺陷 D3/D14/D2 + §11 本 session 實證證據。零改 orchestrator.ps1 核心(-Skip 已支援逐階段)。 |
