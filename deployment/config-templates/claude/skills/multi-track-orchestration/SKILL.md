---
name: multi-track-orchestration
description: >
  Use when 擔任多軌並行 Story pipeline 中控(主控/中控視窗),需判斷執行載體(dispatch 子視窗
  vs 手動軌)、規劃任務樹狀圖與派發順序、跑派發迴圈、判讀 GATE 六證據鏈、拿捏 commit 波時機、
  協調跨視窗凍結窗、或處理派發異常時。提供 SOP-1~7 中控行為紀律,蒸餾自規格 SSoT
  claude token減量策略研究分析/AGENT溝通管道/流水帳文檔DB化/00-多軌協作SOP固化與追蹤載體DB化設計報告.md
  (v1.1.0)§二。與 party-to-pipeline(機制:scripts/IPC/參數/worker 生命週期)互補,本 skill
  只管中控行為判準(何時判載體/派發序列決策/證據判讀/commit波時機/凍結窗協調/異常決策樹),
  不重述機制實作。觸發詞:多軌,派發,GATE,凍結窗,commit 波,手動軌。
version: 1.1.0
updated: 2026-08-01
created: 2026-07-28
author: CC-SONNET
disable-model-invocation: false
user-invocable: true
watches:
  - glob: "claude token減量策略研究分析/AGENT溝通管道/流水帳文檔DB化/00-多軌協作SOP固化與追蹤載體DB化設計報告.md"
    domain: multi-track-orchestration
triggers:
  - 多軌
  - 派發
  - GATE
  - 凍結窗
  - commit 波
  - 手動軌
  - 中控
  - dispatch loop
  - GATE 證據鏈
  - 交纏檔
---

# Multi-Track Orchestration — 多軌中控協作行為紀律(Discipline 型)

> **規格 SSoT**:`claude token減量策略研究分析/AGENT溝通管道/流水帳文檔DB化/00-多軌協作SOP固化與追蹤載體DB化設計報告.md`(v1.1.0)§二 SOP 草案 v1.0(2026-07-28 使用者 D1-D6 全數依推薦核可)。
> **邊界**(AC3 核心):party-to-pipeline 管機制(scripts / 模式 / 參數 / IPC 契約),**multi-track-orchestration 管中控行為紀律(判準 / 序列 / 證據判讀 / 決策)**。詳 §邊界矩陣。

---

## SOP-1 角色拓撲與執行載體判定

四層角色責任邊界:

```
使用者(裁定者)── 裁定 scope/方向/例外;就寢=手動軌暫停,dispatch 軌自動續推
  ├─ 中控視窗(1 個/軌):規劃樹狀圖、派發、GATE、commit、對帳、報告 — 不寫業務碼
  ├─ 手動軌視窗(使用者開):執行「大改 pipeline 核心」卡,逐階段 BMAD,一次一卡
  └─ worker 子視窗(dispatch):單階段單卡,禁 commit、禁問使用者
```

**執行載體判定準則**:卡片會大改 party-to-pipeline 核心(worker scripts / `stop-report.ps1` / `settings.json` hook 面 / UserPromptSubmit)→ 🔴 手動軌;否則 dispatch。判定寫入卡片 `pipeline_notes`,create-story workflow 開工必讀。

派發前必先核對本卡是否落在「pipeline 機制自身正在被改」範圍(判準與 worktree 分流見 `memory/feedback_check_pipeline_machinery_not_under_construction_before_dispatch.md`,本節不重述)。

---

## SOP-2 規劃:任務樹狀圖 + DB 雙層

1. **樹狀圖 = 使用者推進順序索引**(格式規範見 `execution-tree-doc-sop.md`,本節不重述:≤100 行 / 編號清單 / done 不列清單只記總數)。
2. **DB `pipeline_notes` = 執行載體 + 交疊 + 協調契約 SSoT**(workflows 讀這裡,不讀樹狀圖)。
3. **排序規則**(2026-07-28 使用者裁定):優先順序為主鍵;依賴已放行者在前;同級內以**解鎖槓桿**(該卡 done 後可解鎖的下游卡數)排序。
4. **建卡四項必註記**:執行載體 / 依賴 / **跨卡交疊矩陣(四面,見下)** / 規格 SSoT 指標。
5. **L+ 卡先拆 S/M 子卡再派**;母卡 = 收口傘卡,background 頂端列「🧩 拆卡狀態」。

### 交疊矩陣必查四面(**施工面零交疊 ≠ 可並行**)

拆卡當下只比對 `file_list` 交集會漏掉三種更隱蔽的耦合。四面缺一即可能在派發後才炸:

| 面向 | 問法 | 漏掉的後果 |
|------|------|-----------|
| 施工面 | 兩卡 `file_list` 有交集嗎? | 同檔並行改動,後者覆蓋前者 |
| **驗證面** | A 卡 AC 的驗證命令,是否跑到 B 卡要改的工具? | B 改完 A 的驗收基準就變了 —— A 的 AC 可能變成不可能達成 |
| **載入面** | 該卡改的 rule / workflow step,是否會被另一卡的 workflow 階段載入? | 對方 agent 讀到半改版本,行為不可預期 |
| **自跑面** | 該卡改的東西,是否是 pipeline **每個階段自己會跑**的工具(Depth Gate / 對帳 script / hook)? | 同期任何階段的執行結果都不可信 |

**衝突分級**(誰先誰 rebase)見 `parallel-batch-conflict-isolation.md`,本節只管「有沒有漏看某一面」。判定結果四面皆須寫入雙方 `pipeline_notes`,並由中控控管派發順序 —— worker 不做跨卡協調判斷。

---

## SOP-3 派發迴圈(事件驅動,禁輪詢)

```
GATE 通過
  → 1. 查手動軌狀態(固定第一步 — 見 Iron Law 1;判準見下方三條)
  → 2. F13 間隔 ≥10s(見 KB-workflow-001)
  → 3. dispatch-general.ps1 -Phase X detached(env 帶軌身分)
  → 4. 掛 Monitor(雙條件:status 檔存在 ∧ wrapper PID gone;GONE_NO_STATUS = 異常態)
  → 5. 中控轉做其他工作,事件到達再動
```

### 手動軌狀態判定(三條判準 · 2026-08-01 實證後補)

手動軌是使用者另開的視窗、**不走 dispatch**,中控收不到任何 harness 事件 —— 它的狀態只能主動查。三條判準缺一即誤判:

1. **用 lifecycle 時間戳,不用 `pipeline_notes` regex**。以 regex 掃 `[手動視窗]` 標記會命中**協調契約條文本身**(契約內文引用了標記格式範本),雙向誤判:偽陽性使中控無謂停派,偽陰性使中控在對方開工中派發。權威判準是 `SELECT status, create_started_at, create_completed_at, started_at, completed_at`。
2. **兩面都查:開工 **與** 完工**。只查「有沒有開工」時,對方完工後中控的認知會永遠停在最後一次查詢的瞬間。且 **`status` 不足以單獨判定** —— create 階段無 auto-promotion 規則,對方 create 已完工 20 分鐘 `status` 仍可能是 `backlog`。
3. **完工標記要讀內文,不只判存在**。手動軌常在標記內明載凍結範圍(如「本階段只讀不改 pipeline 核心檔,中控派發不需凍結;凍結窗自 dev 開工起算」)—— 只判標記存在會對整個階段做出不必要的凍結假設。

**禁輪詢**:中控不得心跳式檢查 worker 進度,一律等 Monitor 事件通知。**但這條只約束 dispatch worker** —— 手動軌無事件可等,派發前後主動查 DB 不算輪詢。

**Monitor 異常分支**(silence ≠ success):timeout 未觸發不代表 worker 已死 — 查 DB `updated_at` + IPC status 檔 + 子視窗實際輸出三層證據後再決定續等或介入(完整判別正解 + 30/10/10 活動探測時間表見 `worker-lifecycle-judgment.md` §3/§3.5,本節不重述機制)。禁憑 timeout 殺 worker(對照 KB-workflow-001 錯誤做法「同時執行兩個腳本零間隔」導致 429 rate limit 的相同投機病灶)。

**併發上限**實測 4-5 worker 穩定;模型分層走 `pipeline-config.json` SSoT(create/review = opus 層、dev = sonnet 層,本節不重述字面版本)。

---

## SOP-4 GATE 證據鏈(每階段收尾必查,DB done ≠ turn 結束)

| # | 證據 | 來源 | 判讀紀律 |
|:-:|------|------|---------|
| 1 | status 檔 `status=completed` + `error=""` | `.claude/ipc/{id}__*/status-{phase}.json` | 缺此檔 = turn 未結束,禁派下一棒 |
| 2 | DB 狀態機:status/agent/started_at/completed_at | `stories` 表(lifecycle I1-I9) | 任一應寫未寫 = 當場補,不得跳過 |
| 3 | tasks 零 ⬜(排除圖例行) | tasks 欄 | ⬜ 存在 → 讀內容判「誠實延後(帶證據+收尾條件)」vs「未完」,兩者處置不同 |
| 4 | wrapper PID 消亡(視窗自關) | tasklist | **不消亡不派下一棒** |
| 5 | 紅旗判讀 | test_count 異常 / agent 誤標 / 巨量 file_list | 不阻斷 GATE,**註記交 CR 對抗裁決**,禁自行吸收或無視 |
| 6 | 高風險卡加深 | PRAGMA 實表 / import 對帳 / 凍結標頭 / curl 活體 | 依卡性質加驗,不可一律略過 |

六項缺一不可,禁抽驗省略任一項(見 Iron Law 3)。

**`WORKER_FILES` 是 baseline 差集,不是歸屬證明**:dispatch 摘要的該欄以「派發時 baseline → 收工時工作區」差集產生,**無法區分「本 worker 改的」與「同期他軌改的」**。有並行工作時必逐檔查證再納入 commit:`git diff -- <path>` 看內容具名歸誰、`stat` 看 mtime 落在誰的執行窗內、對照對方 `file_list`。實證:一次 dev 收工的 12 個 `WORKER_FILES` 中有 2 個屬手動軌(其中一個是對方 T1 要改的 config,diff 內含對方 story_id 具名註解)。照單全收 = 把他軌未完成的變更 commit 進本卡。

**同理反向**:`PRE_EXISTING_DIRTY` 也不等於「與本卡無關」—— 它只表示「派發前就 dirty」,若中控在派發後才 commit 了某檔,該檔會落在這欄卻其實是本卡上一階段的產物。

---

## SOP-5 commit 機制(本次里程碑缺陷修正後定版)

worker 不 commit,中控負責兩種波:

1. **階段間小波(必做 — 本次里程碑漏做的修正條款)**:每卡 CR 過 GATE 後,**立即**以該卡 DB `file_list` 為 pathspec commit 該卡範疇,**不等收官**。本次里程碑實證缺陷:中控漏做此波,9 卡程式碼堆積至使用者指出才補(見 Iron Law 2)。
2. **共享狀態收斂波**:推進地圖 / reviews README / F8 排除檔,由中控定期併入(`sprint-status.yaml` 已凍結 2026-07-28,不再需要收斂)。

**commit 前固定三件**:`check-hygiene.ps1` → `gitnexus_detect_changes`(risk 註記)→ `pre-audit-mandate.md` §3.5 五題自答(本節不重述五題內容)。

**一律 pathspec**(`git commit -- <路徑>`),禁 `git add .`;跨卡交疊檔(如 `server.js` 型共用核心檔)歸「共用核心」主題波,commit 訊息註記歸屬。

**堆積補救(fallback)**:以各卡 DB `file_list` 做權威歸屬 → 主題波分割 → 未歸屬檔逐一查 diff 判定,禁掃入他軌檔。

**手動軌自行 commit 其卡**;交纏時以「HEAD + 僅本卡變更」重建 blob + staged diff grep 零他軌碼驗證。

**與手動軌並行期間 dev 階段改為單獨 commit(不等 CR 合波)**。常態是 dev+CR 合波(CR 需 review 未 commit 的變更),但當手動軌同時在改動時,留著 dev 變更會讓對方 `git status` 混入我方檔案,其 CR 難辨歸屬 —— 此時 dev 過 GATE 即單獨 commit,把工作區還原成「只剩對方的變更」。判準:**開始並行的那一刻起,commit 粒度服從「讓對方看得清自己」而非「合波好看」**。

**手動軌完工但未 commit 時中控可代 commit**,兩個前提:(a) 對方該階段已完工(時間戳為準)且檔案 mtime 顯示無人正在編輯;(b) commit message 註明代管與零修改。時機價值在於 **clean tree 是對方下一階段的前置**(dirty tree 導致 dev 卡死有實證)。代 commit 後於 ctrl channel 告知,並聲明後續階段仍由對方自行 commit。

---

## SOP-6 跨視窗協調契約(手動軌 ↔ 中控)

- **開工/完工標記**寫入該卡 `pipeline_notes`(`[手動視窗] {phase} 開工/完工 @ ts`);中控每次派發前查(SOP-3 第 1 步)。
- **核心檔凍結窗**:手動軌動 pipeline 機制檔期間,中控停派;完工標記 = 解凍。
- **收尾三點式留言**(驗證缺口/交纏處置/流程判斷)→ 中控簽收進 `pipeline_notes` + F8 排除檔併入下一波。
- **Phase 2+ 取代機制**:本節人工標記逐步由 ctrl channel(`post_ctrl_message`/`read_ctrl_messages`)取代,MCP tool 規格與呼叫方式見 `phycool-ctrl-channel` skill,本節不重述;過渡期兩者並存,以 `pipeline_notes` 為準。

---

## SOP-7 異常處理手冊(7 種,本次里程碑全部實戰過)

| # | 異常 | 處置 |
|:-:|------|------|
| 1 | Monitor timeout 無事件 | 查 status 檔 + DB + PID 實況 → 重掛雙條件 Monitor;禁殺 worker |
| 2 | worker 誠實延後(環境限制如子視窗無 Chrome) | 留 ⬜ + 證據 + 收尾條件 → CR 裁決 → 主視窗/使用者視窗補驗後翻 ✅ |
| 3 | 紅旗(test_count=0 等) | 不擋 GATE,註記入 CR 對抗驗證 |
| 4 | 憑證不足的能力判定 | 直接調用工具實測(禁 raw port / 推測);失敗逾時 → 誠實記錄 + 收尾條件,不強關 |
| 5 | 中控自身違規 | 自陳 → `log-rule-violation.js` → 流程修正固化(如「派發前查手動軌標記」) |
| 6 | MCP 常駐行程載不到新 tools | 記錄「下 session 自然驗證」;禁繞過單一寫入路徑直寫 SQLite |
| 7 | 交纏檔(手動軌 commit 與中控波次重疊) | 以「HEAD + 僅本卡變更」重建 blob + staged diff grep 零他軌碼(見 SOP-5) |

---

## Discipline Pressure Test(skill-builder v3.2.0 §6 · Discipline 強度)

### Iron Laws(5 條)

**Iron Law 1 — 派發任何 worker 前必查手動軌狀態,且以 lifecycle 時間戳為準(判準三條見 SOP-3)**
- Evidence:`context_entries id=7499`(2026-07-28)— 中控於 bwu-1 dev 凍結窗(23:56~00:31)內派發 whp-5/7/9 三卡波未查標記,實害未發生但自陳修正。`id=7732` + `id=7745`(2026-08-01)— 中控以 regex 掃 `pipeline_notes` 誤命中契約範本字串;且只查「開工」未查「完工」,對手動軌 create 狀態**誤判 25 分鐘**,並據此對另一張 dispatch 卡下達當下已多餘的約束。對方完工標記內文其實已寫明「本階段不需凍結」,中控未讀
- Consequence if violated:手動軌與 dispatch worker 同時改動每事件重讀的核心檔,worker 讀到半改版本 → 回報路徑自我損毀。**反向誤判同樣有害** —— 造成無謂停派、或對他軌下達基於錯誤前提的約束

**Iron Law 2 — 每卡 CR 過 GATE 後立即以該卡 file_list pathspec commit,不等收官**
- Evidence:`00-多軌協作SOP固化與追蹤載體DB化設計報告.md:20` — 本次里程碑自陳缺陷:中控漏做階段間 commit 波,9 卡程式碼堆積至使用者指出才補
- Consequence if violated:未 commit 範圍持續膨脹,卡界線模糊化,回滾或並行卡衝突時無法以 file_list 精準切割歸屬

**Iron Law 3 — 每階段 GATE 收尾必逐項核對六證據鏈,不得抽驗省略任一項**
- Evidence:`memory/feedback_backend_track_run_full_stage_gate_evidence.md` — 後台軌漏驗 `started_at`(I2),3 個 dev 卡有 2 卡漏
- Consequence if violated:lifecycle invariants I1-I9 狀態機出現不對稱缺口,下一階段 worker 或下個對話視窗讀到不完整狀態,誤判階段已完成或誤重跑

**Iron Law 4 — Monitor timeout / 表面停滯訊號不得作為殺 worker 的充分理由**
- Evidence:`memory/feedback_dispatch_timeout_not_worker_hung.md` + `memory/feedback_backend_track_no_force_kill_executing_worker.md` — 後台軌多次以 CPU 低 / timeout 投機判殺仍在正常工作的 worker
- Consequence if violated:正常執行中的 worker 被強制終止,已投入工作浪費 + 需重新派發,且可能在半寫入狀態留下損壞的 DB/IPC 殘留

**Iron Law 5 — 跨卡交疊分析必涵蓋四面(施工/驗證/載入/自跑),不得只比對 `file_list`**
- Evidence:2026-08-01 bwu 母卡收口拆卡 — 中控判定三張子卡「施工面零交疊,可並行」,實際執行中**連續發現三個未預見耦合**:(a) bwu-9 的 AC5 驗證命令要跑 `test-spec-audit.js`,而那正是 bwu-8 要改的檔且其 AC6 會擴大判定 → A 的驗收基準被 B 改動(驗證面);(b) bwu-9 要改的 `create-story-enrichment.md` 會被任何卡的 create 階段載入(載入面);(c) bwu-8 要改的 `run-depth-gate.js` 是**所有** create 階段都會跑的閘門(自跑面)
- Consequence if violated:並行卡在派發後才發現互斥,已投入執行需重跑;最壞情況是 A 卡的 AC 在 B 卡改完後變成**不可能達成**,而 A 已被判 done —— 該卡的驗收從此不可重現

### Combined Pressure Test(2 組,三維交叉)

**Test 1 — 凍結標記查詢被跳過**
```
Pressure 1(時間): 中控排程顯示下一波"應該"已可派發,手動軌剛開工才 5 分鐘
Pressure 2(路徑依賴): 前 10 次派發都沒查凍結標記也沒出事(id=7499「實害未發生」)
Pressure 3(合理化): 「反正手動軌通常不會動我要派的這幾張卡的檔案,先派了應該沒事」

Iron Law violated: Law 1
Detection signal: dispatch 前 transcript 缺「查手動軌最新標記」步驟輸出;pipeline_notes 無對應查詢紀錄
```

**Test 2 — commit 波被延後到收官**
```
Pressure 1(時間): 使用者即將就寢,中控想在離線前多推進幾卡而非停下來 commit
Pressure 2(路徑依賴): 上次也是收官時一次 commit,程式碼沒丟過
Pressure 3(合理化): 「反正最後都會一次 commit,現在中斷去 commit 會打斷派發節奏」/「等收官一次 commit 效率更高」

Iron Law violated: Law 2
Detection signal: git status 顯示連續 ≥2 卡 GATE 已通過但對應 file_list 範圍仍未 commit
```

**Test 3 — 交疊分析停在 `file_list` 比對**
```
Pressure 1(時間): 拆卡當下已花大量 context 做 debt 逐項驗證,交疊分析想快速帶過
Pressure 2(路徑依賴): 前幾次「file_list 無交集」的並行判斷都沒出事
Pressure 3(合理化): 「這幾張卡改的目錄完全不同,一看就沒衝突」

Iron Law violated: Law 5
Detection signal: 拆卡產出的 pipeline_notes 只寫「施工面零交疊」,無驗證面/載入面/自跑面的逐項結論;
                  或並行派發後才在對方 AC 的驗證命令中發現它依賴本卡要改的工具
```

### Rationalization Table(verbatim 來源,禁虛構)

| # | Rationalization(Agent 說的/自陳的) | 真實根因 | 對應 Iron Law | Source |
|:-:|------|------|:-:|------|
| 1 | 「派發前未查手動軌開工標記」 | 路徑依賴:前面多次沒查也沒出事 | Law 1 | `context_entries id=7499` |
| 2 | 「9 卡程式碼堆積至使用者指出才補」 | 中控漏做階段間小波,誤以為收官一次 commit 即可 | Law 2 | `00-多軌協作SOP固化與追蹤載體DB化設計報告.md:20` |
| 3 | 「只驗 status/completed_at/dev_agent/test_count/tasks」(漏 started_at) | 抽驗代替逐項,未完整跑 §4 整列證據鏈 | Law 3 | `memory/feedback_backend_track_run_full_stage_gate_evidence.md` |
| 4 | 「CPU 15.2(35min)+ dispatch timeout exit 2 + updated_at 未變」判 hung | 誤把「dispatch 放棄等待」當「worker 已死」,未查 IPC/子視窗實際輸出 | Law 4 | `memory/feedback_dispatch_timeout_not_worker_hung.md` |
| 5 | 「DB 交付物 done 即可關窗」 | 誤把「DB done」當「turn 結束」,worker 仍在收尾 | Law 4 | `memory/feedback_backend_track_no_force_kill_executing_worker.md` |
| 6 | 「手動軌 `pipeline_notes` 有 `[手動視窗]` 標記,所以它在進行中」 | regex 命中的是協調契約**條文本身**(內文引用了標記格式範本),非真實標記 | Law 1 | `context_entries id=7732` |
| 7 | 「我查過了,手動軌已開工,狀態就是進行中」 | 只查開工未查完工;手動軌不走 dispatch 無事件通知,中控認知會凍結在最後一次查詢的瞬間 | Law 1 | `context_entries id=7745` |
| 8 | 「這三張卡的 `file_list` 沒有交集,可以並行」 | 只比對施工面,漏掉驗證面/載入面/自跑面三種隱蔽耦合 | Law 5 | 2026-08-01 bwu 收口拆卡(一輪內連漏三次) |
| 9 | 「dispatch 摘要的 `WORKER_FILES` 列了這些檔,那就是本卡的產出」 | 該欄是 baseline 差集,無法區分本 worker 與同期他軌的變更 | Law 3 | 2026-08-01 bwu-8 dev(12 檔中 2 檔屬手動軌) |

### Red Flags(四類可偵測訊號)

| 類型 | 訊號 |
|------|------|
| **語言訊號** | 「應該沒事」「反正最後會一次 commit」「效率更高」「看起來卡住了」「目錄不同一看就沒衝突」 |
| **行為訊號** | dispatch 前無查詢動作;殺 worker 前無查 DB updated_at / IPC status;查手動軌只跑 grep / 只看 `status` 欄而未讀 `*_completed_at` |
| **輸出格式訊號** | GATE 回報缺 6 項證據其中之一卻仍標記「PASS」;commit 訊息無 pathspec(`git add .`);交疊結論只有「施工面零交疊」一句 |
| **缺失步驟訊號** | CR 過 GATE 後 git status 仍顯示該卡 file_list 範圍為 dirty;連續派發間隔 < 10 秒;`WORKER_FILES` 直接抄進 commit 而無逐檔 diff/mtime 查證 |
| **時間差訊號**(新) | 中控敘述的手動軌狀態,與該卡 `updated_at` 相差超過一個階段的時長 —— 代表認知已凍結在舊快照 |

---

## 邊界矩陣(AC3 — 與 party-to-pipeline 逐段對照,零重複)

> **邊界句**:party-to-pipeline 管機制(scripts / 模式 / 參數 / IPC 契約),multi-track-orchestration 管中控行為紀律(判準 / 序列 / 證據判讀 / 決策)。

| SOP 節 | party-to-pipeline 既有(本 skill 禁重述) | 本 skill 寫什麼(行為紀律) |
|:--|:--|:--|
| SOP-1 | Mode A/B/C 偵測、E1/E2 執行控制、`-Phase` 參數 | 四層角色責任邊界 + 執行載體判定準則 |
| SOP-2 | 無 | 樹狀圖 vs DB 雙層分工 + 排序規則 + 建卡四項必註記 + **交疊矩陣四面判準** |
| SOP-3 | F13 ≥10s、`dispatch-general.ps1` 旗標、v5.12.0 signal-driven wait | 五步迴圈順序 + 禁輪詢(僅約束 dispatch worker)+ Monitor 異常分支判讀 + **手動軌狀態判定三判準**(時間戳 / 兩面 / 讀內文) |
| SOP-4 | IPC status schema、`main-controlled-mode` 證據項、**`WORKER_FILES` 差集如何產生** | 六證據鏈缺一不可的判讀紀律 + 紅旗不阻斷改交 CR 對抗裁決 + **差集非歸屬證明,並行時須逐檔 diff/mtime 查證** |
| SOP-5 | F15 worker 禁 commit、pathspec 要求 | 兩種波的時機(階段間小波 = CR 過 GATE 立即)+ 堆積補救以 file_list 權威歸屬 + **並行手動軌時 dev 改單獨 commit / 代 commit 兩前提** |
| SOP-6 | 無(ctrl channel 已有 MCP tool 規格) | 標記時機 + 凍結窗開關語意;MCP 用法引用 `phycool-ctrl-channel` |
| SOP-7 | 各缺陷散在 references 與 rules | 異常 → 處置決策樹單一入口表 |

Party-to-pipeline → 本 skill 反向 cross-ref 見其 SKILL.md(見本 Story T5.3)。

---

## 相鄰規則 cross-ref(不重述其內容)

- `worker-lifecycle-judgment.md` §3 三層判別 / §3.5 30/10/10 活動探測 — SOP-3 Monitor 異常分支的完整機制細節
- `memory/feedback_check_pipeline_machinery_not_under_construction_before_dispatch.md` — SOP-1 執行載體判定中「pipeline 機制自身正在被改」的判準與 worktree 分流
- `pre-audit-mandate.md` §3.5 commit 五題自答 — SOP-5 commit 前第三件事的完整題目
- `execution-tree-doc-sop.md` — SOP-2 樹狀圖章節格式規範(≤100 行 / 編號清單)
- `parallel-batch-conflict-isolation.md` — SOP-2 建卡第 3 項「跨 epic 檔案交疊矩陣」的 5 軸衝突分級
- `phycool-ctrl-channel` skill — SOP-6 Phase 2+ MCP tool 規格
- `docs/knowledge-base/troubleshooting/workflow/pipeline-concurrent-startup.md`(KB-workflow-001)— SOP-3 F13 間隔條款的事故錨點

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.0** | **2026-08-01** | **補入 5 條實戰紀律(全部來自 2026-08-01 bwu 母卡收口 session 中控自身犯過的錯,非推演)**。①②(Law 1 兩個失效模式)SOP-3 新增「手動軌狀態判定」三條判準 —— 用 lifecycle 時間戳非 `pipeline_notes` regex(regex 會命中協調契約條文本身)、開工與完工兩面都查(手動軌無 harness 事件,認知會凍結在最後一次查詢)、完工標記要讀內文(常載明凍結範圍)。實證:對手動軌 create 狀態誤判 25 分鐘,並據此對另一張 dispatch 卡下達當下已多餘的約束。③ **新增 Iron Law 5** + SOP-2「交疊矩陣必查四面」表 —— 施工/驗證/載入/自跑,實證一輪內連漏三面(A 卡 AC 驗證命令跑到 B 卡要改的工具 / 要改的 rule 被他卡 create 載入 / 要改的是所有 create 都跑的 Depth Gate)。④ SOP-4 補「`WORKER_FILES` 是 baseline 差集不是歸屬證明」+ 反向的 `PRE_EXISTING_DIRTY` 同理,實證 12 檔中 2 檔屬手動軌。⑤ SOP-5 補「與手動軌並行期間 dev 改單獨 commit」+「手動軌完工未 commit 時中控代 commit 的兩前提」。配套:Iron Laws 4→5 條、Combined Pressure Test 2→3 組、Rationalization Table 5→9 列、Red Flags 新增「時間差訊號」類。Memory:`context_entries id=7732` / `id=7745`。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **1.0.2** | **2026-07-28** | **tdb-2-sprint-status-freeze-refs BR-010**:SOP-5 §2「共享狀態收斂波」移除 sprint-status.yaml(該檔已凍結,不再需要中控收斂)。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| 1.0.1 | 2026-07-28 | **code-review 修復**:SOP-3 派發迴圈五步與 SOP-6 對其首步的交叉引用,編號由圈圈數字改為純數字(`1.`~`5.` / `第 1 步`),對齊 `memory/feedback_no_circled_numbers_use_plain_digits.md`(2026-06-10 使用者 feedback,明文「僅規範**新產出**」;本 skill 為 2026-07-28 新建故適用)。另修 SOP-1 末句誤引:「pipeline 機制自身正在被改」的判準原指向 `worker-lifecycle-judgment.md`,但該 rule 全文對「機制自身 / `stop-report.ps1` / `settings.json` / `UserPromptSubmit`」零命中(其範疇為 worker 完成/異常判別),已改指正確來源 `memory/feedback_check_pipeline_machinery_not_under_construction_before_dispatch.md` 並補入相鄰規則 cross-ref 清單。條文語意零變更,SOP 七節結構與各表列數不變。走 `Skill(skill="skill-builder")` Mode B。 |
| 1.0.0 | 2026-07-28 | 初版建立。SOP-1~7 機械化自 `00-多軌協作SOP固化與追蹤載體DB化設計報告.md`(v1.1.0)§二,含本次里程碑三項實證修正條款(階段間 commit 小波必做 / 樹狀圖排序規則 / 異常手冊 7 種)。Discipline 強度 Pressure Test:4 Iron Laws + 2 Combined Pressure Test + 5-row Rationalization Table + 4 類 Red Flags。與 party-to-pipeline 邊界矩陣 7 格逐項對照零重複。Story:`tdb-3-sop-skill`。 |
