---
paths:
  - ".claude/skills/party-to-pipeline/**"
  - ".claude/hooks/worker-kill-guard.js"
---

# Worker Lifecycle Judgment — party-to-pipeline 子視窗完成/異常判別 (SUPREME)

> **嚴重等級**: SUPREME(對齊 `constitutional-depth-first` Anti-Speculation / `pre-audit-mandate`)
> **建立**: 2026-06-12
> **觸發事件**: m0-11 create dispatch,中控用「CPU 低 + dispatch timeout」投機判 worker hung,殺了 2 次**其實正常工作**的 worker。使用者連續 3 次糾正:「子視窗是真的有在跑,為什麼這樣判斷??依照 party-to-pipeline 規範是如何判別子視窗異常的?」

---

## 1. Core Principle

> **dispatch script 的 timeout ≠ worker hung ≠ worker 死亡。** worker(claude 互動視窗)是**獨立進程**;dispatch 薄手 timeout 只是「dispatch 放棄等待」,worker 仍繼續跑。**(2026-08-01 whp-2 起)視窗永不自動關閉** — 4 支 worker script 的 close watchdog 與自殺收尾已全數退場(封存為註解,見 `party-to-pipeline/scripts/worker-*.ps1` whp-2 標記段),沒有任何機制會**自動**關閉 worker 視窗;kill 與關窗永遠是人的決策(使用者手動,或中控呼叫 `close-worker.ps1` —— whp-6 起唯一程式化關窗途徑,見 §4)。判別 worker 完成/異常**只看 DB 證據 + IPC status 檔 + 子視窗實際輸出**,**絕禁用 CPU / dispatch timeout 投機判 hung 殺進程**,也**絕不能拿「視窗是否已關閉」當完成判準**(視窗預期永遠開著)。
>
> **Liveness 判定 = 4-Tuple 行為判定,禁止以 `lifecycle` 欄位判活。** 判活邏輯(`.context-db/scripts/reap-worker-runs.js` `judgeLiveness()`,whp-3 已落地,BR-016)依序檢查 4 個 Tuple,任一 fail 即判 `alive:false`:(1) `worker_runs.wrapper_pid` 存在且 > 0(否則 `not-registered`);(2) 該 PID 對應到系統上活的行程(`Get-CimInstance Win32_Process` 掃描,否則 `window-gone`);(3) 該行程 `CommandLine` 含這筆 run 的 `ipc_dir`(case-insensitive,否則 `pid-reused` — 防 Windows PID 重用誤判);(4) `CommandLine` 含對應 phase 的 `worker-{suffix}.ps1`(否則 `cmdline-mismatch`)。DB 的 `lifecycle` 欄位(`dispatching`/`running`/`revising`/`reported`/`abandoned`/`done-exited`)是**狀態機標記**,反映的是「最後一次觀測到的階段」而非「此刻是否存活」— 兩者可能不同步(如 worker 剛被使用者關閉但 DB 尚未 reap),**judgeLiveness() 的 4-Tuple 現場探測結果才是判活的唯一權威來源**。
>
> **(2026-08-01 whp-2 · 取代 2026-07-25 §3.5 部分機械化)** E2 薄手路徑(`dispatch-general.ps1`)的終止條件現為**有界確認即退出**(`dispatchConfirmSec` 預設 60s:見到 `claude.exe` 子行程,或逾時但 wrapper PID 仍存活,即印摘要並退出)— **不再進入任何等待視窗關閉的迴圈**(舊版 signal-driven adaptive wait + `lingering→Stop-WorkerSafe` 備援分支已全數退場,封存見 `dispatch-general.ps1` whp-2 標記段)。等視窗關閉在「取消自動關閉」後即是死鎖:主視窗被本次 dispatch tool call 阻塞的同時,唯一能授權關窗的也是主視窗(SSoT §18.2)。`phaseTimeouts` / `-TimeoutSec` 對此路徑已不再影響返回時機。**30/10/10 停滯偵測職責已全數移交 `pipeline-guardian.ps1` 常駐守護**(whp-7 done,見 §3.5)。E1 orchestrator 批次路徑當時未被修改;**(2026-08-03 補)該路徑已判定 🔒 FROZEN** —— worker 側 Wait-AckFile 與自關退場後,其 `Wait-WindowClosed` 必逾時走 `Stop-WorkerSafe` 強殺(orchestrator.ps1:325-329),牴觸「只通知不殺」硬裁定;禁止派發使用,詳 `pipeline-handshake-protocol.md` §9 + party-to-pipeline `references/ack-handshake.md` §8。
>
> **(2026-06-14 強化 · 後台軌專屬反模式根治,歷史脈絡保留)DB deliverable done(`create_completed_at` / `completed_at` / `status=ready-for-dev|review`)≠ turn 結束。** worker 寫完 DB 仍在跑收尾(summary / Depth Gate 顯示),**此時 force-kill = 殺還在執行的 worker**(交付物雖在 DB 無損,但屬反模式 + 可能觸發重啟再執行浪費)。**預設不 force-kill —— 對齊前台軌(前台軌從不殺 worker)。** 中控驗 DB 交付物 done 後,**改以 IPC `status-{phase}.json` 出現(turn 結束的唯一信號,視窗本身不再是判準)才 dispatch 下一階段**(**一次一視窗序列,禁同 story 兩階段視窗並行**)。**禁「DB done 即並行 dispatch 下一階段」**(DB done≠turn 結束,IPC status 檔未出現=turn 未結束=仍執行)。**只有後台軌曾(a)自動殺執行中 worker(b)未等 turn 真正結束即開下一階段並行,二者皆後台軌專屬缺陷,須根治對齊前台軌。**(本段「等視窗自關」的原始語意已於 whp-2 後改為「等 IPC status 檔出現」,見 §4/§5 現行條文;歷史事故原委見 §6。)

party-to-pipeline `references/main-controlled-mode.md` 明文:
- **§10 D14**: claude session hang detection **缺 progress signal = 已知 open 缺陷**(無可靠程式化 hang 信號)
- **§11**: 「worker timeout 但 DB done」是**常態** → 不賭 worker IPC,**驗 DB**

---

## 2. Applies When

任何以下情境必走 §3 判別流程:

- dispatch worker(`dispatch-general.ps1`)後判別「完成 / 未完成 / 異常」
- 考慮殺 worker(`Stop-Process` claude PID / `Stop-WorkerSafe`)
- dispatch 回報 `STATUS: unknown` / `OUTCOME: spawned-pending-guardian`(逾 `dispatchConfirmSec` 未見 `claude.exe`,wrapper 仍存活)/ `OUTCOME: exited-during-confirm` / `OUTCOME: worker-reported-failed`
  - ⚠️ **`OUTCOME: timeout` 與 `exit 2` 自 whp-2(2026-08-01)起 E2 薄手路徑已不再產生**(§1),若仍見到請確認是否誤讀 E1 `orchestrator.ps1` 批次路徑或直呼 `preflight-dispatch.ps1`(該腳本 `exit 2` = bad arguments,語意不同)
- `worker_runs.health_flag='stalled-suspect'` / `requires_attention=1` 被 guardian 標記(§3.5)

---

## 3. 三層判別正解(取代 CPU/timeout 投機)

| 層 | 證據 | 判讀 |
|:--|:--|:--|
| **① DB 證據(主)** | `updated_at` 是否在 dispatch 啟動後更新 / `create_completed_at` / `status` | worker 寫 DB = 有進展 / 完成 |
| **② IPC status 檔** | `.claude/ipc/{id}__{ts}/status-{phase}.json` 出現 + `status:completed` | worker 完成標誌 |
| **③ 子視窗輸出(人可見)** | 看子視窗實際畫面(互動模式人可見,§10) | worker 跑到哪一步 |

**dispatch timeout 後 worker PID 仍 ALIVE → 「續等」**(worker 進程獨立存活,視窗永不自動關閉,監看 ① ② 即可判斷進度/完成),**勿殺**。

---

## 3.5 Worker 活動探測 30/10/10 時間表(2026-07-04 使用者裁定 · 2026-08-01 whp-2 起由 `pipeline-guardian.ps1` 常駐守護執行)

> 補既有規範「續等要等到何時才可介入」的空白。以「**檔案活動**」為 worker 仍在工作的證據(worker 實質工作必寫檔:code / report / spec / skill / DB)。**執行者已從「dispatch script 自身的等待迴圈」移交至「住在所有子視窗外面的常駐單例」**:`pipeline-guardian.ps1`(whp-7 done,全生命週期持有 lock file 為唯一互斥機制,雙節奏 tick — 快 30s 存活偵測 / 慢 600s 本表所述停滯偵測),判定邏輯集中於純函式 `.context-db/scripts/guardian-tick.js`(26 條 BR,64 tests)。dispatch script 端(`dispatch-general.ps1`)自身已無任何 30/10/10 相關程式碼(§1 已述,adaptive wait 於 whp-2 全數封存)。
>
> **僅適用 `lifecycle` 為 `running`/`revising` 的 run**(guardian `NON_TERMINAL_LIFECYCLES` 掃描範圍);`dispatching` 幽靈列 / `reported` / `abandoned` / `done-exited` 走各自獨立的 reaper/通知邏輯,不歸本表管。

| 時點 | 動作 |
|:--|:--|
| T0 dispatch | 薄手有界確認即退出(`dispatchConfirmSec` 預設 60s,見 §1);guardian 快 tick(30s)持續對該 run 做存活偵測(4-Tuple,§1) |
| **guardian 慢 tick(600s)首輪** | 對 `lifecycle ∈ {running, revising}` 的 run **記錄檔案活動快照**(`checkScopeActive` — **per-run scope**:該 run 的 `work_root` + `ipc_dir` + 已知變更檔集合,**非全 repo git dirty** — 舊版 repo-wide 指紋在多軌並行時他軌寫入會使本 run 永遠「看似有活動」,停滯測不出來,SSoT G17 違規,已於 whp-2 隨 `Get-ActivityFingerprint` 一併刪除)— **僅記錄,不判殺** |
| 每輪慢 tick(600s)複查 | 快照比對:有變動 → worker 正常執行,重置計數;無變動 → 計 1 輪(`writeStallIncrement`) |
| **連續 2 輪(20min)零變動** | guardian **只寫** `worker_runs.health_flag='stalled-suspect'` + `requires_attention=1`,**零 kill / 零關窗原語**(使用者硬裁定③,鐵則)。中控三選一裁決(**續等**:worker 可能長思考中未寫檔,排除誤判 / **喚醒**:提醒使用者查看該視窗實際畫面 / **重派**:使用者已明確判斷放棄本輪,親自關窗後重新 dispatch — kill 與關窗仍是人的決策,guardian 不代勞) |
| 任一時點完成信號 | IPC `status-{phase}.json` 出現 → 轉 GATE 驗證(視窗本身**不再**是完成信號來源,§1) |

`Ensure-Guardian`(冪等,每次 dispatch 呼叫即自癒,恆 exit 0)已接線於 `register-run.ps1 -Mode Register`,fail-open 不阻擋派發。守護的存在本身**只回報不殺** — kill 決策永遠由中控做。

---

## 4. FORBIDDEN

- ❌ **CPU 低判 hung** — claude 互動視窗絕大部分時間等 LLM API(網路 I/O wait),本地 CPU 本就極低,CPU 低 ≠ hung
- ❌ **dispatch timeout 當 worker 死** — dispatch 薄手 timeout 只是放棄等待,worker 進程獨立存活(視窗永不自動關閉,§1),**續等**是正解選項
- ❌ **未驗 DB 證據(① ②)即殺 worker** — 殺前必查 `updated_at` / IPC status 檔
- ❌ **沒讀對應 reference 就執行 party-to-pipeline 關鍵動作** — dispatch / 殺 worker / worktree 前必讀 `main-controlled-mode.md` / `worktree-parallel-mode.md`(避免沒理解 skill 原理就投機,如誤把 dispatch timeout 當 worker 死、誤解 worktree 適用)
- ❌ **自創 hang 信號**(CPU / timeout / DB 未變)當證據 — D14 明文無可靠 hang 信號,只能驗 DB + 人看
- ❌ **以 DB `lifecycle` 欄位單獨判活**(2026-08-01 whp-2 BR-013)— `lifecycle` 是最後觀測到的狀態機標記,可能與此刻現場不同步;判活**必走 §1 4-Tuple 行為判定**(`judgeLiveness()` 現場探測 PID + CommandLine),`lifecycle` 僅供 guardian/reaper 掃描範圍過濾用,不可單獨作為「這個 worker 現在還活著」的證據
- ❌ **(2026-06-14 後台軌專屬反模式,歷史脈絡保留)DB `create_completed_at` / `completed_at` / `status` done 就 force-kill** — DB-done **早於** turn 結束(worker 寫 DB 後仍在收尾 summary);**無 IPC status 檔 = turn 未經 Stop hook 結束 = worker 仍執行**,此時殺 = 殺還在執行的 worker(+ 可能觸發重啟再執行)。**前台軌從不殺 worker,後台軌須對齊** — 預設 `續等`,**驗 DB 交付物 done 後**等 IPC `status-{phase}.json` 出現(turn 結束的唯一信號)才 dispatch 下一階段**,非必要不 force-kill**(視窗本身**不再**是判準,§1)
- ❌ **(2026-06-14 二次糾正,2026-08-01 whp-2 更新判準)DB done(status=ready-for-dev|review)即 dispatch 下一階段 worker,未等當前階段 turn 真正結束** — DB done **≠** turn 結束(視窗仍可能在跑收尾;whp-2 起視窗更是**永不自動關閉**,故「等視窗關閉」已非合法判準)。**唯一合法信號 = IPC `status-{phase}.json` 出現**;此檔未出現即開下一階段 = 同 story 兩視窗並行執行,使用者須手動關閉舊視窗善後。**前台軌一次一視窗序列(等 turn 結束才開下一階段),後台軌須對齊**。正解:DB done → 不殺 + poll `status-{phase}.json` 出現 → 才 dispatch 下一階段
- ❌ **(2026-07-04 建立 · 2026-08-01 whp-2 起執行者改為 guardian)未經 §3.5 30/10/10 活動探測(或同等 per-run 檔案活動證據)即判 worker 停滯而 kill** — 連續 2 輪(20min)零變動只讓 guardian 寫 `health_flag='stalled-suspect'`,**guardian 本身不 kill**;中控據此裁決前仍必答 §5 Self-Check(排除長思考未寫檔誤判)。Common Rationalization:「已經超時很久了,不會再有產出」/「檔案好久沒動了(但只看了一次)」。Red Flag:未查 `worker_runs.health_flag`/`requires_attention` 即 kill,或用 repo-wide git dirty(而非 per-run scope)判活動
- ❌ **(2026-08-01 whp-2)直接呼叫 `Stop-WorkerSafe` 關閉正在執行的 worker 視窗** — `dispatch-general.ps1` 已無任何呼叫端(舊 `lingering` 分支已封存,§1);`Stop-WorkerSafe` 函式本體保留於 `shared-utils.ps1`,**不得**繞道呼叫它自動關窗(違反使用者硬裁定②③)。**(2026-08-01 whp-6)關窗一律走 `.claude/skills/party-to-pipeline/scripts/close-worker.ps1`**(C2 五項前置 + C3 4-Tuple 判活複用 `judgeLiveness()` + C4 CAS 終態先於 taskkill,詳 `pipeline-window-control` Skill)—— 原「未來供 whp-6 使用」的預告已兌現,不再是 forward reference
- ❌ **(2026-08-01 whp-6)繞過 `worker-kill-guard.js` 的 lifecycle 判定直接下 `taskkill`/`Stop-Process`** — hook 現為條件式 hard-block(非純 advisory):能從 DB 查得目標 run 的 `lifecycle ∈ {running, revising}` 時一律 `exit 2` 阻擋(與 §1 4-Tuple `judgeLiveness()` 互補,非重複判活);`lifecycle=approved` 以降其餘態放行;DB 不可用 / 無法從命令列解析出 PID・run_id 時 fail-open 退回 advisory(不誤擋)。緊急情況人工確認後可設環境變數 `PHYCOOL_KILLGUARD_BYPASS=1` 逃生口,**僅供緊急排障,勿常態使用**——常態繞過等同讓 §1-§5 的判別紀律失去機械防線

---

## 5. Self-Check(殺 worker / dispatch 下一階段前必答)

1. **DB `updated_at` 是否在 dispatch 啟動後更新?**(worker 寫入跡象)→ 是 → 別殺,worker 在工作
2. **IPC `status-{phase}.json` 是否出現?**(完成標誌)→ 是 → worker 完成,改驗 DB 證據
3. **dispatch timeout 是否只是「放棄等待」而非 worker 死?**(§1 4-Tuple 判定 worker PID 仍 ALIVE?)→ 是 → 續等
4. **我是否看了子視窗實際輸出?**(互動模式人可見,視窗永不自動關閉故隨時可看)→ 否 → 先看再判
5. **我是否讀過 `main-controlled-mode.md` §4/§10/§11?**(判別正解)→ 否 → 先讀
6. **(dispatch 下一階段前)IPC `status-{phase}.json` 是否已出現?**(turn 結束的唯一合法信號 — **視窗是否關閉不是判準**,whp-2 起視窗預期永不自關)→ 否 → STOP,等 `status-{phase}.json` 出現才 dispatch 下一階段(**禁同 story 兩視窗並行**;DB done≠turn 結束)
7. **(判停滯裁決前)`worker_runs.health_flag`/`requires_attention` 是否已由 guardian 標記 `stalled-suspect`?**(連續 2 輪 20min per-run 零變動,guardian 只寫旗標不 kill,§3.5)→ 否 → STOP,續等,勿自行用 repo-wide git dirty 或人工計時取代 guardian 判定

任一未驗 → **STOP**,別殺 / 別未見 `status-{phase}.json` 就開下一階段。

---

## 6. Incident Record

- **2026-06-12 m0-11 create**: 中控 dispatch create-story worker,用「CPU 15.2(35min)+ dispatch timeout exit 2 + DB updated_at 未變 + 無 status 檔」投機判 worker hung,殺第一個 worker(PID 35748,可能也快完成)。重試第二個(PID 20852)被使用者打斷改純觀察 → 22:15 worker **自己正常完成**(`status=completed`,dev_notes 13414→7907 重整)+ watchdog 自關。使用者連續 3 次糾正,揭露「dispatch timeout ≠ worker hung」+「驗 DB 不賭 timeout」。配套 2B hook `worker-kill-guard.js`(殺 worker 機械攔截)+ 2A `dispatch-general.ps1` timeout 查 DB 強化。
- **2026-06-14 einvoice 子卡1 create(+ 本 session create/dev/CR 多輪通病)**: 中控對**每個** worker 在 dispatch 薄手 `timeout exit 2` + DB `create_completed_at`/`status` done 後即 Stop-WorkerSafe force-kill,**誤把「DB 交付物 done」當「可關窗許可」**(違反本規則 §3「PID ALIVE → 續等 · 勿殺」既有條文)。einvoice 子卡1 create worker(PID 33820)被殺時 **IPC `status-create-story.json` 不存在(turn 未結束)= 仍在執行**,使用者當場抓到「子視窗不是還在執行嗎?為什麼關掉?」並揭露關鍵差異:「**只有後台軌會自動殺還在執行的 worker + 重啟子視窗再執行,前台軌不會**」。根因:DB deliverable done **早於** turn 結束(worker 寫完 DB 仍在收尾)。交付物本身無損(DB 已 done)但 force-kill executing worker 屬反模式 + 後台軌專屬缺陷。修正:§1 + §4 強化「預設不 force-kill,對齊前台軌讓 worker 自然 self-close;驗 DB 推進即可」。See `memory/feedback_backend_track_no_force_kill_executing_worker.md`。
- **2026-06-14 二次糾正(doc-database-schema-v5 create→dev)**: create DB done(status=ready-for-dev)後,中控**未等 create 視窗自關**(PID 34808 仍 ALIVE + IPC `status-create-story.json` absent = turn 未結束 = 仍執行)即 dispatch dev-story,造成 create + dev 同 story 兩視窗並行;dev dispatch fail exit1 + 使用者**手動關閉 dev 視窗**並糾正:「為什麼每次都沒有等到子視窗結束就接續開啟下一個視窗...create 子視窗還在執行還沒自動關閉為什麼就開 dev...等 create 視窗結束後才能開始 dev...前台軌都很正常為什麼後台軌問題這麼多」。根因:本 session 自寫的 §1「驗 DB done 即推進下一階段(短暫並行無妨)」條文錯誤——把前次「不殺」修正**錯誤延伸成「並行」**。修正:§1 + §4 + §5 Q6 改為「DB done → 不殺 + poll 等視窗自關(PID gone / IPC status)→ 才 dispatch 下一階段,一次一視窗序列禁並行」。See `memory/feedback_backend_track_wait_window_close_before_next_phase.md`。

- **2026-07-04 30/10/10 範式建立(vision-nav-htmx-1 L1 CR worker)**: L1 CR worker dispatch 16:38 → 17:13 薄手 timeout exit 2,worker 存活續跑且差集已見 7 檔產出(SDD resync + Skill Sync + report 準備)。使用者裁定固化「30 分首檢記錄檔案快照(僅檢查不判殺)→ 每 10 分複查檔案變動 → 連續 2 輪無變動中控才刪除視窗 → 分析檢查 → 重新發配」為標準時間表,防誤刪執行中薄手/worker。落地:本 rule §3.5 + §4 FORBIDDEN + §5 Q7 + `party-to-pipeline` v5.6.0 `main-controlled-mode.md` §4.5。**(2026-08-01 whp-2 起執行者已改為 `pipeline-guardian.ps1`,見下條)**。

- **2026-08-01 whp-2-no-autoclose-liveness(取消自動關窗 + liveness 4-Tuple 化)**: 使用者硬裁定(2026-07-26)「取消 worker 子視窗自動關閉」+「所有機制只通知不殺」正式落地 — 4 支 worker script 的 close watchdog 與自殺收尾、`dispatch-general.ps1` 的 signal-driven adaptive wait 與 `lingering→Stop-WorkerSafe` 備援分支、`Get-ActivityFingerprint`(repo-wide 指紋,SSoT G17 違規)五個區塊全數封存(BR-012,註解保留原文,非物理刪除)。本次連動修正本 rule 五處與現行行為矛盾的敘述(原 §1/§3/§4 三處「watchdog 自關」措辭):(1) 新增 §1 4-Tuple liveness 精確定義(`judgeLiveness()`,whp-3 已落地,禁止單以 `lifecycle` 欄位判活);(2) §3.5 30/10/10 執行者由「中控人工/dispatch script」明訂改為 `pipeline-guardian.ps1` 常駐守護(whp-7 已落地),範圍限 `running`/`revising`,指紋改 per-run scope;(3) 停滯裁決由「kill 視窗」改為「續等/喚醒/重派」三選一,guardian 零 kill;(4) §4/§5「等視窗自關才能 dispatch 下一階段」的判準改為「等 IPC `status-{phase}.json` 出現」(視窗永不自動關閉後,原判準已不成立);(5) 新增 FORBIDDEN 條款禁止繞道呼叫 `Stop-WorkerSafe`(函式本體保留供 `whp-6` 用)。§6 本節以上歷史記錄之原始敘述保留不動(歷史事實,對齊 `cross-ref-discipline.md` §3.3)。

- **2026-08-03 party-to-pipeline v5.24.0(E1 FROZEN + 握手閉環 SOP 補全)**: DB 比對確認 whp 13/13 + ccb 子卡 4/4 done、生產 run `4815a818`(bwu-12 create)完整走過 `reported → ack → closed(ControllerAfterHandshake)`後,判定 E1 orchestrator 檔案式 ACK 🔒 FROZEN(本 rule §1 同步),`references/ack-handshake.md` 重寫為 DB 閉環 SOP v2.0.0 — 消除「skill 文檔仍以舊機制為現行敘述」這一中控重複走回舊機制的根源。

- **2026-08-01 whp-6-directive-delivery-and-close(close-worker.ps1 落地,填補 whp-2 留下的關窗空窗)**: whp-2 移除自動關窗後,§1 曾寫「kill 與關窗永遠是人的決策(中控走完握手或使用者手動)」—— 此為過渡期措辭,尚無任何程式化關窗途徑。本卡新增 `.claude/skills/party-to-pipeline/scripts/close-worker.ps1`(C2 五項前置 + C3 4-Tuple 判活複用 `judgeLiveness()` + C4 CAS 終態先於 taskkill)為中控唯一程式化關窗途徑,並將 `.claude/hooks/worker-kill-guard.js` 由純 advisory 升級為 `lifecycle ∈ {running,revising}` 條件式 hard-block(`PHYCOOL_KILLGUARD_BYPASS=1` 逃生口)。同步修正 §1/§4/§7 三處先前預告「未來供 whp-6 使用」的 forward reference,兌現為現行事實。

---

## 7. Related

- `.claude/skills/party-to-pipeline/references/main-controlled-mode.md` — §4 驗 DB 證據 / §10 D14 無 hang 信號 / §11 worker timeout 但 DB done
- `.claude/rules/pipeline-handshake-protocol.md` — IPC status 檔 schema + §9 關窗契約(close_mode 退場現況)
- `.claude/hooks/worker-kill-guard.js` — 殺 worker 機械攔截(v2,whp-6:`lifecycle ∈ {running,revising}` 條件式 hard-block,非純 advisory;`PHYCOOL_KILLGUARD_BYPASS=1` 逃生口;paths Write 不觸發兜底 per Bug #23478)
- `.claude/skills/party-to-pipeline/scripts/close-worker.ps1` — whp-6 起唯一 controller-authorized 程式化關窗途徑(C2/C3/C4 委派 `.context-db/scripts/close-worker-ops.js`)
- `.claude/rules/constitutional-depth-first.md` — Anti-Speculation Mandate(本 rule 為其「worker 判別」特化)
- `.context-db/scripts/reap-worker-runs.js` `judgeLiveness()` / `probeLiveProcesses()` — §1 4-Tuple liveness 判定的權威實作(BR-016)
- `.context-db/scripts/guardian-tick.js` — §3.5 30/10/10 停滯偵測 + per-run 指紋範圍的權威實作(26 BR,64 tests)
- `.claude/skills/party-to-pipeline/scripts/worker-*.ps1` / `dispatch-general.ps1` — whp-2 封存標記段(watchdog / adaptive wait / lingering / Get-ActivityFingerprint 五區塊原文 + 回退指引)
