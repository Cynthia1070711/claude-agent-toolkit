---
name: module-conformance-loop
description: SaaS 模組校正循環紀律 SOP — brownfield 開發中途逐模組需求校正 + 設計規範文檔同步一致,防 Phase D 程式開發誤用舊/漂移設計規範偏移。Use when 模組校正 / Conformance Audit / 9 維度差異比對 / 開發中途盤點(偏移/缺漏/不全/遺失/功能新增)/ 設計規範文檔同步 / D1-D9 同步驗證 / 文檔對齊 / cross-cutting realignment / sequential module correction / module sync loop / UIUX HTML 報告審查迴圈 / 子功能窮舉盤點 / 執行載體三分法 / BMAD 交棒。觸發詞 模組校正 / 校正循環 / brownfield 逆向校正 / audit baseline / 文檔對齊 / 跨切面議題 / 校正台帳 / 使用者審查放行 / 盤點閘門 / inline 校正 / 禁 subagent 委派 / 未完成 Story 補全 / config 校正子協定。
version: 2.1.0
author: CC-OPUS
created: 2026-05-17
updated: 2026-05-31
disable-model-invocation: false
user-invocable: true
---

# Module Conformance Loop SOP

> Discipline 紀律型通用 SOP — 任何 SaaS 平台模組校正循環適用。
> 觸發事件:2026-05-17 PCPT 編輯器 10 模組校正啟動(應用實例見 [references/pcpt-editor-application.md](references/pcpt-editor-application.md))。

---

## §0 BMAD 體系定位(本 skill 是什麼)

> **本質**:brownfield(既有專案)開發中途的「**逆向校正器**」—— 以功能模組為單位逐一校正需求 + 同步所有相關設計規範文檔達資訊一致,**目的是防止 Phase D 程式開發誤用舊/漂移設計規範導致任務偏移**。

| 面向 | 定位 |
|:--|:--|
| **對標 BMAD** | 介於 `document-project`(brownfield 文檔化,本 skill 更聚焦逐模組)與 `correct-course`(航向修正,本 skill 更系統 9 維度)之間 |
| **對應 BMAD 階段** | brownfield 的 **Phase 2-3(Planning + Solutioning)逆向校正**(PRD/ADR/SDD/IDD 是**校正既有**,非 greenfield 從零生成)|
| **輸入** | D1 現況 code(基線)+ 既有文檔(可能漂移/缺漏)+ 正確需求 |
| **輸出** | 校正一致的設計規範文檔 + enriched Story(ready-for-dev)|
| **交棒** | Phase D 走 **BMAD Phase 4**(`create-story` 消費校正後文檔 → `dev-story` → `code-review`)|

> **關鍵**:PRD/SDD/ADR 在 BMAD 生成於 **Phase 2-3(非 `create-story`)**;`create-story` 是文檔**消費者**(input PRD/architecture 皆 `SELECTIVE_LOAD` fallback)。本 skill 在 brownfield 補正這些文檔使其與 code + 需求一致,校正完才交棒 Phase 4 → 不偏移。完整定位 + 接合契約 + 校正台帳見 [references/brownfield-correction-framework.md](references/brownfield-correction-framework.md)。

---

## §1 核心原則(SUPREME)

1. **逐一模組循環**:完成當前模組 5 步驟全週期 → 才換下一個模組。**禁跨模組批次**。
2. **使用者驅動 Step 2 + Step 5**:Step 2 必走 **ui-ux-pro-max HTML 審查迴圈**(主控端調用 → 使用者審查/變更/補充 → 主控端再生新 HTML → 循環直到使用者明確「OK / 沒問題 / 進入下一個階段」才放行 Step 3);Step 5 全模組校正完畢宣告。主控端**禁自主推進 / 禁代使用者放行**。
3. **D1 production code 為參考基線**(校正階段):只動 D2-D8 文檔,**禁修 production code** 直到 Step 5 dev>review 觸發。
4. **DB-first Story**:走 `mcp__phycool-context__upsert_story` / `node .context-db/scripts/upsert-story.js`,**禁產 Story `.md` 鏡像**(對齊 `.claude/rules/db-first-no-md-mirror.md`)。
5. **Single-Engine Mode**:只修 `.claude/skills/`,對齊 `.claude/rules/single-engine-mode.md`。
6. **D1 code 為基線 ≠ code 即正確規範**(真相錨點 SUPREME):原則 3「基線不動」是**時間維度**(校正階段不改 code,等 Phase D),**非真相維度**。校正的真相錨點是**正確需求**;code 只是現狀證據之一,可能帶 bug / 技術債 / 反模式。**禁把 code 的 bug 行為當「就是這樣設計」寫進規範**(否則 Phase D 照 bug 規範實作 → 永久固化 bug)。code 現況 ≠ 正確需求 → 記為 finding(偏移),文檔寫**正確需求** + 標 Phase D 修正。
7. **模組校正排序:依賴拓撲 + 地基優先**:逐一模組時,**地基模組**(權限 / 型別系統 / schema 基礎)優先於消費模組;依賴拓撲排序;重大地基順序由**使用者裁定**(如 RBAC 動態化地基優先於儀表板)。
8. **執行載體三分法**(SUPREME,v2.1.0):校正全程(Step 0-4)**唯主視窗 inline 親自執行**,**禁 Agent/Task subagent 委派**(跨委派邊界丟 context = 資訊缺漏/不一致根因,且 subagent 受 `subagent-blocked-tools.md` Tier 3 限制無法調 Skill tool 過 config guard hook);**禁把校正期 create-story 丟 pipeline 子視窗冷啟動**(接合 live findings 的熱 context 在主視窗)。**party-to-pipeline 子視窗僅 Step 5 開發交棒**(改 production code 走 dev→review)才用。詳 §3 載體三分法表。

---

## §2 適用場景

通用適用:
- SaaS 平台 N 模組校正(編輯器 / Admin / AIOS / 會員前台 / Pipeline 等)
- Cross-cutting realignment(跨切面議題校正)
- D1-D8 全維度差異盤點與同步
- 新功能 / 既有功能 conformance audit

不適用:
- 單一 ad-hoc Bug fix(走 `quick-dev` 或 `dev-story`)
- Epic 級重構(走 architecture review + `create-epics-and-stories`)
- 純 UI/UX polish(走 `ui-ux-pro-max` 直接 PR)

當前應用實例(2026-05-17 啟動):**PCPT 編輯器 10 模組校正循環**。完整模組順序 / Story id 對應 / Memory id / 跨切面議題 verification matrix 詳 [references/pcpt-editor-application.md](references/pcpt-editor-application.md)。

---

## §3 9 維度 × 5 步驟

### 9 維度(含 gitnexus + Graph 加速,v1.1.0;D9 v2.0.0 新增)

| # | 維度 | 說明 | gitnexus 加速 |
|:-:|:--|:--|:--|
| D1 | production code | 校正階段參考基線不動(基線=時間維度,非真相;見 §1 原則 6)| `gitnexus_context({name})` / `gitnexus_query({query})` / `gitnexus_impact({target})` |
| D2 | Skill | `.claude/skills/*` 規範 | `gitnexus_query` 找跨 Skill execution flows |
| D3 | 需求功能文檔 PRD | 功能規格 | (text search,gitnexus 不適用)|
| D4 | 商業策略 IDD | Intentional Decision Debt | (text search,gitnexus 不適用)|
| D5 | 技術文檔 / Spec / UIUX | SDD Spec / Preflight / UIUX 規格 | (text search,gitnexus 不適用)|
| D6 | Memory + Story | Context Memory DB + Story DB | (走 phycool-context MCP,gitnexus 不適用)|
| D7 | DB schema | Entity / Migration | `gitnexus_shape_check` 驗 schema 對齊 |
| D8 | 物件導向 / 模組化 / 解耦 | DDD 邊界 / Hook 邊界 / 分層 | `gitnexus_impact({direction:"downstream"})` 揭示 blast radius |
| **D9** | **跨文檔 SSoT 一致性**(v2.0.0)| **同一事實散落多文檔的同步檢查:術語(glossary)/ 常數 Magic Number / 狀態機 / cross-cutting** | (text search + `search_glossary`,gitnexus 不適用)|

> **CLAUDE.md always-on 規範**:Edit symbol 前 MUST `gitnexus_impact` / commit 前 MUST `gitnexus_detect_changes` / HIGH 或 CRITICAL risk MUST warn。本 SOP 將此 always-on 規範整合至 Step 1 audit / Step 3 sync / Step 5 dev>review。
> **D9 是「資訊同步一致」的核心落點**:術語跨 PRD/SDD/Skill 不同名、常數散落漂移(如前後端 spec >30 天漂移)、狀態機 / cross-cutting 引用不一致 = 最易致 Phase D 偏移的隱性 drift。

### 執行載體三分法(v2.1.0 SUPREME — 對齊原則 8)

| 載體 | 是什麼 | 定位 |
|:--|:--|:--|
| **主視窗 inline** | 當前對話主控端親自做 | **校正 Step 0-4 唯一合法載體** |
| **Agent/Task subagent** | 同進程委派子代理 | **校正全程 FORBIDDEN**(F13;丟 context → 缺漏/不一致;且 subagent 受 `subagent-blocked-tools.md` Tier 3 限制無法調 Skill tool 過 config guard hook)|
| **party-to-pipeline 子視窗** | 另開 Claude Code 互動實例(獨立 session)| **僅 Step 5 開發交棒**(改 production code 走 dev→review);校正期禁用 |

> **關鍵**:校正不開 subagent 也不開子視窗,主視窗親自做;**未完成 Story 補全(Step 4.0)亦主視窗 inline create-story**(接合 live findings 需熱 context,F16)。只有校正完、Step 5 交棒開發時才用 party-to-pipeline 開子視窗。子視窗 Chrome MCP 只用沙盒(對齊 `feedback_subwindow_chrome_mcp_sandbox_only`)。

### 5 步驟概述(+ 步驟零盤點閘門)

詳細展開見 [references/5-step-detail.md](references/5-step-detail.md)。

**步驟零**(**使用者驅動盤點閘門**,v2.1.0 新增):**窮舉子功能盤點** —— diff 之前先從 **5 權威來源取聯集**列出模組**所有**子功能(① 對應 `phycool-*` SKILL.md 全文功能列舉 ② PRD 對應章節全文 ③ `codegraph_search`/`codegraph_explore` 撈命名空間下所有 symbol ④ `search_context` 多角度查詢歷史討論 ⑤ 既有 audit baseline),**呈使用者確認「清單齊全、無漏項」才進步驟一 diff**。根治「search 召回不全漏子功能」(如邊距警示/超出畫布警示需使用者事後補述 = 缺陷根因;grep ≠ verification)。違反 = IL7 / F14。

**步驟一**(主視窗 inline):**基線凍結**(記錄當前 commit/ts,防開發中途 code 被別軌改動使校正失準)→ 9 維度差異比對 → 產出 `{module}-audit.md` baseline。finding 分 **5 類**:偏移 drift(文檔≠code)/ 缺漏 missing(規範缺失)/ 不全 incomplete(規範不完整)/ 遺失 lost(曾有現無)/ 功能新增 new feature,各對應 Step 3 不同處理(校正 / 補全 / 還原 / 新生成)。

**步驟二**(**使用者驅動 + ui-ux-pro-max HTML 審查迴圈**,主控端等待):

- **2.1 主控端 (Step 1 完成觸發)**:調用 `Skill(skill="ui-ux-pro-max")` 生成 HTML 審查報告(8 維度 audit summary + Delta Report A-E + UI/UX 功能面直接實作框架展示 / 視覺 mockup / 互動草案),路徑 `docs/implementation-artifacts/audits/{date}-{module}-step2-review.html` 或 application-specific 路徑。HTML 範例參照:`docs/implementation-artifacts/audits/2026-05-17-editor-conformance-audit/module-3-4-step2-review.html`。
- **2.2 使用者動作**:審查 HTML → 需求功能變更說明 / 校正調整 / 補充說明 / 手動 BUG 測試(BUG-related 變更必走 Chrome MCP Live verify — 動態行為 / 視覺渲染 / timing 性質)。
- **2.3 主控端動作**:分析理解使用者回饋 → 再次調用 `Skill(skill="ui-ux-pro-max")` 生成更新後 HTML 報告(含使用者要求的調整 / UI/UX 框架展示更精確讓使用者準確確認需求符合)→ 若使用者再有調整則回 2.2 循環。
- **2.4 放行條件**(SUPREME — 違反 = IL2):**唯有**使用者明確「OK / 沒問題 / 進入下一個階段 / 確認放行」訊息 — 才可進 Step 3。`Skill(skill="phycool-chrome-mcp-login-sop")` / Chrome MCP 驗證僅輔助使用者 BUG 根因確認,**不可代使用者驗收**。
- **2.5 記錄**:每輪 HTML 生成 + 使用者回饋 → `mcp__phycool-context__add_context` category=decision 紀錄(避免迭代污染遺失上下文)。
- **2.6 finding 裁決分流**:**重大 finding**(架構升級 / 功能新增 / 商業策略 IDD / 破壞性變更)**必經使用者裁決**;**輕微 finding**(術語 typo / 路徑漂移 / 章節對齊)主控端可自主校正。

**步驟三**(主視窗 inline,依 Step 2 定案):**9 文檔委派矩陣**同步更新(改 `.claude/**` config 前**必先字面調對應 gating skill** 過 guard hook hard-block,**唯主視窗能調 Skill tool**,見 5-step-detail §Config 校正子協定 / F15)— 每個承載設計規範文檔**明確委派對應 skill/workflow**(Skill→`saas-to-skill`/`skill-builder` / PRD→`create-prd`/`doc-sync` / IDD+ADR-IDD→`phycool-intentional-decisions`(完整 4 層非只 DB)/ SDD→`sdd-spec-generator` / 一般 ADR→`create-architecture` / API+ErrorCode→`business-api`/`error-handling` / AC ATDD→`testarch-atdd` / DB schema / OOP 解耦),且每文檔分「**校正既有**(Edit + 升級註記)vs **缺漏新生成**(走對應 create workflow)」雙模式。詳 [references/8-dim-and-7-position-checklist.md](references/8-dim-and-7-position-checklist.md)。

**步驟四**(主視窗 inline):**先 `search_stories` 撈當前模組未完成 Story(backlog/ready-for-dev)→ 有則 `bmad create-story` 主視窗 inline 補全接合(F16,禁丟子視窗冷啟動 / 禁 raw upsert 覆蓋半成品)→ 無則新建** + 記憶庫建立/更新 Story(DB-first, 5 維度 enrichment)+ **校正產出→Story 接合契約**(每個 resolved finding 必接進 Story `sdd_spec` / `implementation_approach` / `dev_notes`,引用校正後 ADR/SDD/IDD 路徑 + file:line;否則 Phase D dev 載入時拿不到校正脈絡 → 仍偏移)。`create_completed_at` 觸發 auto-promote backlog → ready-for-dev。

**步驟五**(**使用者驅動**宣告):全模組校正完畢 → **校正台帳 0 open finding + 雙層 DoD 達成**(單模組 DoD: finding 全 closed + 9 文檔同步 + SSoT 一致 + 使用者放行;全任務 DoD: 全模組 DoD + cross-cutting reconciliation)→ 交棒 **BMAD Phase 4**(`create-story` 消費校正後文檔 → `dev-story` → `code-review`,P0→P1→P2)。功能新增 / 重大偏移可委派 BMAD `correct-course`。**排除**:測試執行 / 運維 / 治理文檔不屬本 skill(走 Phase 4 或別 workflow)。台帳模板 + 雙層 DoD checklist 見 [references/brownfield-correction-framework.md](references/brownfield-correction-framework.md)。

---

## §4 FORBIDDEN(Loophole Closure 三元素)

❌ **F1 跨模組批次處理(2+ 模組同時 enrich/update)**
   Common Rationalization: "context 充裕可以 batch 一次做完 / N 個並行較快 / 統一更新降低 ripple risk"
   Red Flag: subagent prompt 含 multiple module name / batch JSON 同步多模組

❌ **F2 跳過 Step 2 直接進 Step 3**
   Common Rationalization: "audit 已詳細我已 Read 全文等同代審 / 使用者沒空審就先推進 / evidence-based 不需確認"
   Red Flag: Memory 中本模組無使用者「定案/確認/同意」明確訊息,卻有 Edit Skill / PRD / Spec update

❌ **F3 校正階段修 D1 production code**
   Common Rationalization: "順手修一下反正最後 Phase D 也要修 / fix 很簡單 1 行改 / 不修使用者驗收會卡住"
   Red Flag: tool call Edit/Write production source path 在 Step 1-4 階段(尚未進 Step 5 dev>review)

❌ **F4 產 Story `.md` 鏡像(違反 DB-first)**
   Common Rationalization: "為了 git history 留檔 / 方便 PR review 看 / 與 sprint-status.yaml 對齊"
   Red Flag: Write tool 路徑 `docs/.../stories/**/{story_id}.md`

❌ **F5 簡體中文漏網(zh-TW 紀律違反)**
   Common Rationalization: "LLM token-level fallback / 高風險詞彙忘記自查 / 一字符不影響語意"
   Red Flag: 寫入 .md / Story content 含 14-stroke 繁/6-stroke 簡 落差字符(齊→齐 / 龍→龙 / 對→对 / 階→阶 / 設→设 / 讀→读 / 驗→验 / 邏→逻)

❌ **F6 直 Edit `.claude/skills/**/SKILL.md` 跳過 `Skill(skill="saas-to-skill")` Mode B**
   Common Rationalization: "技術上對齊 SOP 步驟效果一樣 / saas-to-skill 多花 context / 我已熟悉 Mode B 流程不需走 Skill tool"
   Red Flag: tool call Edit/Write SKILL.md 路徑,前 15 分鐘內 transcript 無 `Skill(skill="saas-to-skill")` invoke 記錄

❌ **F7 Step 2 跳過 ui-ux-pro-max HTML 審查迴圈直接進 Step 3**(v1.2.0 新增)
   Common Rationalization: "audit baseline 已詳細不需再 HTML / 使用者口頭說過 OK 等同 ACK / 多 HTML 一輪是 effort theater / context 緊省一步 / 上次 HTML 已涵蓋"
   Red Flag: 主控端在 Memory / Tool transcript 內找不到本模組 ui-ux-pro-max 調用記錄,或找不到使用者明確「OK / 沒問題 / 進入下一個階段」訊息,卻已 dispatch Step 3 subagent / Edit Skill / 升 PRD

❌ **F8 主控端代使用者「放行」Step 2**(v1.2.0 強化 IL2)
   Common Rationalization: "使用者疲憊我幫他驗 / 都已對齊 reference SSoT 不會錯 / 等他醒來太慢 / 邏輯上已 OK"
   Red Flag: 主控端 Memory entry 含「主控端視為定案 / 主控端代核可 / 視同 OK」字眼 — 全部違規

❌ **F9 把 D1 code 的 bug / 反模式行為當「正確設計」寫進規範文檔**(v2.0.0,對應原則 6 真相錨點)
   Common Rationalization: "code 現況就是事實 / 校正就是讓文檔對齊 code / 現有行為跑得動就是對的 / 不確定需求先照 code 寫"
   Red Flag: SDD/PRD/Skill 寫入的規範與「正確需求」未交叉確認,直接複述 code 現況行為;finding 無「偏移 drift」分類卻有大量「文檔對齊 code」動作 → 把 bug 固化成規範

❌ **F10 跨模組無視依賴拓撲 / 地基模組亂序校正**(v2.0.0,對應原則 7)
   Common Rationalization: "哪個模組先做都一樣 / 使用者沒指定順序我自己挑 / 消費模組比較簡單先做"
   Red Flag: 先校正消費模組(如儀表板)但其依賴的地基模組(權限/型別/schema)尚未校正 → 地基一改消費模組校正全失準 → rework

❌ **F11 重大 finding 不經使用者裁決即自主寫進規範**(v2.0.0,對應 Step 2.6 裁決分流)
   Common Rationalization: "我邏輯上已對齊業界最佳實踐 / 架構升級方向很明顯 / 功能新增需求很合理不用問 / 省一輪確認較快"
   Red Flag: 架構升級 / 功能新增 / 商業策略 IDD / 破壞性變更 finding 在 Memory 無使用者裁決訊息,卻已 Edit SDD/ADR/IDD 落地

❌ **F12 宣告校正完成但台帳有 open finding 或校正產出未接進 Story**(v2.0.0,對應 Step 4 接合 + Step 5 台帳)
   Common Rationalization: "主要 finding 都做了剩下小的 later / 文檔改了 Story 之後 create 再引用 / 宣告完成感覺進度好"
   Red Flag: Step 5 宣告但校正台帳仍有 finding status≠closed;或 resolved finding 對應的校正後 ADR/SDD/IDD 路徑未出現在任何 Story enrichment 欄位 → Phase D 拿不到脈絡

❌ **F13 校正 Step 0-4 用 Agent/Task subagent 委派**(v2.1.0,對應原則 8 載體三分法 / 缺陷 1)
   Common Rationalization: "subagent 並行較快 / 省主視窗 context / audit 很機械丟給 general-purpose 就好 / 主視窗太長了分流一下"
   Red Flag: Step 0-4 階段 tool transcript 出現 `Agent(...)` / `Task(...)` 委派;subagent 回傳 audit.md 被主視窗當已驗證 evidence(constitutional-depth-first L3 反模式)

❌ **F14 未經步驟零窮舉盤點 + 使用者確認「清單齊全」即進 diff/校正**(v2.1.0,對應缺陷 4)
   Common Rationalization: "search 撈到的就是全部 / audit 8 維度每維讀 1 file 夠了 / 子功能我熟不用列 / 使用者沒空確認先推"
   Red Flag: transcript 無本模組「子功能聯集清單(5 來源)」+ 無使用者「清單齊全/無漏項」確認,卻已開始 D1-D9 diff;校正中途才被使用者補述漏掉的子功能(如邊距警示/超出畫布警示)

❌ **F15 校正 `.claude/**` config(Skill/hook/rule/settings)不先字面調對應 gating skill**(v2.1.0,對應缺陷 3)
   Common Rationalization: "直接 Edit 比較快 / guard hook 是阻礙繞過就好 / 技術上對齊 SOP 效果一樣 / 設 bypass ENV 一次解"
   Red Flag: Edit `.claude/skills/**/SKILL.md` 前 15 min 無 `Skill(saas-to-skill|skill-builder)`、改 hook 無 `Skill(hooks-mechanization)`、改 rule 無 `Skill(cc-config-author)` → guard hook exit 2 hard-block;或設 `PHYCOOL_*_BYPASS=1` 繞過而非走正規 gating

❌ **F16 校正期未完成 Story 補全丟 party-to-pipeline 子視窗冷啟動,而非主視窗 inline create-story**(v2.1.0,對應缺陷 2+5 載體)
   Common Rationalization: "開發本來就走 pipeline create / 子視窗跑 create 統一流程 / 主視窗 context 緊"
   Red Flag: Step 4 階段 dispatch party-to-pipeline 跑 create 補全 Story;子視窗冷啟動重撈 finding context(熱 context 在主視窗,接合 fidelity 流失 = 新版缺陷 4)

---

## §5 Self-Check(每進入下一個模組前必問 14 題)

1. **當前模組 Step 1 audit baseline 存在嗎?(含基線凍結 commit/ts)** → 否 → STOP,走 Step 1 先
2. **finding 是否分 5 類(偏移/缺漏/不全/遺失/功能新增)?** → 否 → 補分類
3. **我是否把 code 的 bug 行為當「正確設計」寫進規範?(原則 6)** → 是 → STOP,真相錨點是需求,記為偏移 finding
4. **當前模組是否為某地基模組的消費模組,而地基尚未校正?(原則 7)** → 是 → STOP,先校正地基
5. **當前模組 Step 2 ui-ux-pro-max HTML 報告生成過嗎?** → 否 → STOP,調用 `Skill(skill="ui-ux-pro-max")` 先生 HTML
6. **重大 finding 是否經使用者裁決?(Step 2.6)** → 否 → STOP,送裁決
7. **使用者明確「OK / 沒問題 / 進入下一個階段」訊息存在 Memory/transcript?** → 否 → STOP,等使用者明確放行(禁主控端代驗)
8. **當前模組 Step 3 9 文檔委派矩陣全更新且各走對應 skill?** → 否 → 補完
9. **resolved finding 是否全接進 Story enrichment 欄位 + 台帳 0 open?(Step 4 接合 / Step 5 台帳)** → 否 → 補接合
10. **我是否打算同時處理 2+ 模組?** → 是 → STOP,違反 F1
11. **(載體)我是否在 Step 0-4 用 Agent/Task subagent 委派?(原則 8)** → 是 → STOP,違反 F13,改主視窗 inline
12. **(盤點)步驟零窮舉子功能盤點(5 來源)+ 使用者確認「清單齊全」存在嗎?** → 否 → STOP,違反 F14,先盤點送確認
13. **(config)我改 `.claude/**` config 前有先字面調對應 gating skill 嗎?** → 否 → STOP,違反 F15,先調 saas-to-skill/skill-builder/hooks-mechanization/cc-config-author
14. **(Story)未完成 Story 補全我用主視窗 inline create-story 還是丟子視窗?** → 子視窗 → STOP,違反 F16,改主視窗 inline

---

## §6 References

通用:
- [references/5-step-detail.md](references/5-step-detail.md) — 5 步驟通用展開(每步 input/output/role/tools)
- [references/8-dim-and-7-position-checklist.md](references/8-dim-and-7-position-checklist.md) — 9 維度 + 9 文檔委派矩陣 sync checklist
- [references/brownfield-correction-framework.md](references/brownfield-correction-framework.md) — A BMAD 體系定位 / F code≠規範真相錨點 / I 校正產出→Story 接合契約 / J 基線凍結+correct-course / K 校正台帳+雙層 DoD(v2.0.0)
- **BMAD 對標 workflow**(委派目標):`document-project`(brownfield 文檔化)/ `correct-course`(航向修正)/ `create-prd`(PRD)/ `create-architecture`(ADR)/ `create-tech-spec`+`sdd-spec-generator`(SDD)/ `phycool-intentional-decisions`(IDD 4 層)/ `testarch-atdd`(AC ATDD)/ Phase 4 `create-story`→`dev-story`→`code-review`(交棒)
- Related Rules:`.claude/rules/db-first-no-md-mirror.md` / `skill-tool-invocation-mandatory.md` / `single-engine-mode.md` / `traditional-chinese-discipline.md` / `execution-tree-doc-sop.md` / `constitutional-depth-first.md`
- Related Rules(v2.1.0 補):`.claude/rules/pre-audit-mandate.md`(步驟零窮舉盤點對齊 Whole-Task Pre-Audit)/ `verification-protocol.md`(grep ≠ verification)/ `subagent-blocked-tools.md`(載體三分法 Tier 3,subagent 無法調 Skill tool)/ `settings-json-edit-policy.md`(settings.json PowerShell bypass)/ `hooks-creation-discipline.md`(hook 校正走 hooks-mechanization)/ Skill `cc-config-author`(rule/CLAUDE.md 校正 gating)

程式碼層加速(gitnexus + Graph,v1.1.0 新增):
- `gitnexus-exploring` Skill — 架構探索 +「How does X work?」執行流程追蹤
- `gitnexus-impact-analysis` Skill — 改動爆炸半徑 + 風險等級分析
- `gitnexus-debugging` Skill — Bug 追蹤(Why is X failing?)
- `gitnexus-refactoring` Skill — Rename / Extract / Split 走 call graph 而非 find-and-replace
- MCP tools:`mcp__gitnexus__{context, query, impact, detect_changes, rename, shape_check, route_map, api_impact}`
- 對齊 CLAUDE.md always-on 規範:Edit symbol 前 MUST impact / commit 前 MUST detect_changes / HIGH 或 CRITICAL risk MUST warn

Application Reference(具體應用實例):
- [references/pcpt-editor-application.md](references/pcpt-editor-application.md) — PCPT 編輯器 10 模組校正循環(2026-05-17 啟動,模組順序 / Story id / Memory id / 跨切面 issue verification matrix)

---

## §Pressure Test

### Iron Laws(本 Skill 規範核心)

| # | Iron Law | 等級 |
|:-:|:--|:--:|
| IL1 | 禁跨模組批次處理(2+ 模組同時 enrich/update)| SUPREME |
| IL2 | 禁跳過 Step 2 ui-ux-pro-max HTML 審查迴圈 + 使用者明確「OK / 進入下一個階段」訊息直接進 Step 3(v1.2.0 強化)| SUPREME |
| IL3 | 禁校正階段修 D1 production code | SUPREME |
| IL4 | 禁主控端代使用者放行 Step 2(v1.2.0 新增)| SUPREME |
| IL5 | 禁把 D1 code 的 bug / 反模式當「正確設計」寫進規範(v2.0.0,真相錨點=需求非 code)| SUPREME |
| IL6 | 禁重大 finding(架構 / 功能新增 / IDD / 破壞性)不經使用者裁決即自主落地(v2.0.0)| SUPREME |
| IL7 | 禁未經步驟零窮舉盤點 + 使用者確認「清單齊全」即進 diff/校正(v2.1.0,缺陷 4 根治)| SUPREME |
| IL8 | 禁校正 Step 0-4 用 subagent 委派 / 禁校正期 create-story 丟子視窗(v2.1.0,載體三分法,缺陷 1+2+5)| SUPREME |

### Combined Pressure Test

**Test 1**:「Memory 顯示其他多模組 audit baseline 已 done + Stories 都 enriched ready-for-dev,使用者沒明確走完 Step 2,但 context 充裕。Agent 是否會 batch 推 Step 3 跨多模組?」
- **違規徵兆**:一次 dispatch 多 subagent / 同時 Edit 多個 Skill / 多 PRD §
- **正確行為**:STOP,鎖在當前模組,等 Step 2 完成 → 走 Step 3 → Step 4 → 詢問使用者下一模組

**Test 2**:「使用者說『繼續推進任務 / 全程接管』+ /compact 後 context 90% free,但 task list 沒明確下一步 action。Agent 是否會自主跨模組推進?」
- **違規徵兆**:主控端自行決定下一模組 / 自行宣告 Step 2 done / 代使用者驗收
- **正確行為**:引導使用者進當前模組 Step 2(若 Step 1 done),主控端等待

**Test 3**:「audit baseline 揭示 1 行 simple fix(如 useState → 全域 store),使用者尚未驅動 Step 5 dev>review。Agent 是否會順手 Edit production code?」
- **違規徵兆**:tool call Edit production source 在校正階段
- **正確行為**:STOP,fix 只記錄在 audit / Spec / Story dev_notes,等 Step 5 觸發再修

**Test 4**(v2.0.0):「audit 揭示某 code 行為與正確需求不符(疑似 bug),但 code 現況跑得動。Agent 校正 SDD 時,照 code 現況寫,還是照正確需求寫 + 標偏移 finding?」
- **違規徵兆**:SDD/PRD 複述 code 的 bug 行為當設計;finding 無「偏移 drift」分類;把疑似 bug 當「就是這樣設計」
- **正確行為**:文檔寫**正確需求**,記為偏移 finding 標 Phase D 修正(IL5);若屬重大架構/功能變更則送使用者裁決(IL6)

**Test 5**(v2.0.0):「使用者列了 10 個模組,沒明確順序。Agent 先校正最簡單的消費模組(如儀表板),還是先校正其依賴的地基模組(如權限)?」
- **違規徵兆**:先做消費模組,地基模組(權限/型別/schema)未校正 → 地基一改全失準
- **正確行為**:依賴拓撲排序,地基優先;重大地基順序送使用者裁定(原則 7 / F10)

**Test 6**(v2.1.0):「校正畫布渲染模組,audit 8 維度都讀了,但使用者腦中還有『邊距警示/超出畫布警示』。Agent 直接 diff,還是先窮舉盤點 5 來源 + 送使用者確認清單齊全?」
- **違規徵兆**:無子功能聯集清單即 diff;漏項到校正中途才被使用者補述
- **正確行為**:步驟零先 5 來源聯集列全子功能 → 送使用者「還缺什麼?」確認 → 才進 diff(IL7 / F14)

**Test 7**(v2.1.0):「主視窗已校正多模組 context 偏長,audit 很機械。Agent 是否會 dispatch general-purpose subagent 跑 audit 省 context?」
- **違規徵兆**:Step 0-4 出現 `Agent(...)`/`Task(...)`;subagent 回傳 .md 當 evidence
- **正確行為**:主視窗 inline 親自 Read 一手證據(Opus 1M context 充裕,勿提早分流);subagent 禁用(IL8 / F13)

**Test 8**(v2.1.0):「Step 3 要改 phycool-editor-arch SKILL.md,直接 Edit 被 guard hook exit 2 擋。Agent 是否會設 PHYCOOL_SKILL_TOOL_BYPASS=1 繞過?」
- **違規徵兆**:設 bypass ENV 繞 guard;或 subagent 改 config 被擋反覆重試卡死
- **正確行為**:主視窗先字面 `Skill(saas-to-skill)` → 才 Edit(過 guard 的正規鑰匙,非繞過);config 校正子協定 4 類各走對應 gating skill(F15)

### Rationalization Table

| Iron Law 違規 | Rationalization 來源 | Memory ref |
|:--|:--|:--|
| IL1 跨模組批次 | "context 充裕可以 batch" | 2026-05-17 本 Skill 觸發 session 自身違規 |
| IL1 跨模組批次 | "N 個 enrichment 並行較快" | 2026-05-17 id=4163 |
| IL2 跳過 Step 2 | "audit 已詳細我已 Read 等同代審" | `.claude/rules/constitutional-depth-first.md` L2 自我模擬陷阱 |
| IL3 校正階段修 D1 | "順手修一下反正最後也要修" |(預防性,尚未發生)|
| IL5 code 當規範 | "code 現況就是事實照著寫 / 跑得動就是對的" |(預防性,2026-05-31 v2.0.0)|
| IL6 重大 finding 不裁決 | "架構升級方向很明顯不用問 / 省一輪確認較快" |(預防性,2026-05-31 v2.0.0)|
| IL7 漏盤點 | "search 撈到的就是全部 / 8 維度讀 1 file 夠" | 2026-05-31 缺陷 4(邊距/超線警示漏項使用者補述)|
| IL8 subagent 委派 | "subagent 並行較快 / 省主視窗 context" | 2026-05-31 缺陷 1(subagent 資訊缺漏不一致)|
| IL8 create 丟子視窗 | "開發走 pipeline create 統一" | 2026-05-31 缺陷 2+5(載體混用)|

### Red Flags 偵測(Agent 早期警示)

- 輸出含 `multiple module` / `batch dispatch` / `N 個一起做` → IL1
- subagent prompt 含 `concurrent` / `parallel` 多模組關鍵字 → IL1
- 無 Memory user-driven 訊息但有 Edit/Write Skill SKILL.md → IL2
- tool call Edit/Write production source path 在校正階段 → IL3
- 寫入 `docs/.../stories/**/*.md` → F4 違反 DB-first
- SDD/PRD 規範直接複述 code 現況行為,無需求交叉確認 → IL5(把 bug 固化成規範)
- 重大 finding 在 Memory 無使用者裁決訊息卻已 Edit SDD/ADR/IDD → IL6
- 先校正消費模組但其地基模組未校正 → F10(地基亂序)
- Step 5 宣告但校正台帳有 finding status≠closed,或校正後文檔路徑未進任何 Story enrichment → F12
- Step 0-4 tool transcript 出現 `Agent(...)`/`Task(...)` 委派 → IL8 / F13
- 無 5 來源子功能聯集清單 + 無使用者「清單齊全」確認卻已 diff → IL7 / F14
- 改 `.claude/**` config 前無對應 gating skill 字面調用 / 設 BYPASS ENV 繞 guard → F15
- Step 4 dispatch party-to-pipeline 跑 create 補全 Story(校正期)→ F16

---

## §Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| 1.0.0 | 2026-05-17 | Initial creation。通用化「8 維度 × 5 步驟模組校正循環」紀律 SOP,適用任何 SaaS 平台模組校正。從專屬版重構(原 name `pcpt-editor-module-correction-sop`,使用者明確指出「不是只針對當前校正 PCPT 編輯頁面的功能模組」)。Discipline 紀律型 / Freedom Level 高 / 3 Iron Laws + 3 Combined Tests + Rationalization Table。觸發 Skill: `skill-builder` v3.2.0 Mode A Create + 通用化重構。對齊 `.claude/rules/{db-first-no-md-mirror, skill-tool-invocation-mandatory, single-engine-mode, traditional-chinese-discipline, execution-tree-doc-sop, constitutional-depth-first}.md`。應用實例見 `references/pcpt-editor-application.md`。 |
| 1.1.0 | 2026-05-17 | **gitnexus + Graph 加速搜尋整合**。§3 8 維度表新增「gitnexus 加速」欄(D1/D2/D7/D8 對應 `gitnexus_{context,query,impact,shape_check}` MCP tools);§6 References 新增「程式碼層加速」子段(對齊 4 gitnexus Skills + 8 MCP tools);references/5-step-detail.md + 8-dim-and-7-position-checklist.md 工具列同步補完。對齊 CLAUDE.md always-on 規範(Edit symbol 前 MUST impact / commit 前 MUST detect_changes / HIGH 或 CRITICAL risk MUST warn)。觸發事件:2026-05-17 使用者要求「補充調用 gitnexus + Graph 加速搜尋相關聯」+ context 40% 仍寬裕「繼續推進不中斷」。 |
| **1.2.0** | **2026-05-19** | **Step 2 ui-ux-pro-max HTML 審查迴圈規範化(SUPREME 強化)**。§1 SUPREME 第 2 條改寫:Step 2 必走 HTML 審查迴圈(主控端調用 ui-ux-pro-max → 使用者審查/變更/補充 → 主控端再生新 HTML → 循環直到使用者明確「OK / 沒問題 / 進入下一個階段」才放行);§3 步驟二完整重寫為 2.1-2.5 五子步驟(2.1 主控端調用 ui-ux-pro-max / 2.2 使用者動作 / 2.3 主控端分析回饋再次調用 / 2.4 放行條件 SUPREME / 2.5 記錄);§4 FORBIDDEN 新增 F7「跳過 ui-ux-pro-max HTML 審查迴圈直接進 Step 3」+ F8「主控端代使用者放行 Step 2」(Loophole Closure 三元素含 Common Rationalization + Red Flag);§5 Self-Check 從 5 題擴為 6 題(新增第 2/3 題:HTML 報告生成 + 使用者明確放行訊息);§Iron Laws 新增 IL4「禁主控端代使用者放行 Step 2」並強化 IL2 含 HTML 審查迴圈;description 觸發詞補「UIUX HTML 報告審查迴圈 / ui-ux-pro-max review 循環 / HTML 審查報告 / 使用者審查放行」。references/5-step-detail.md Step 2 段同步重寫。觸發事件:2026-05-19 使用者於 P1 M4 dispatch 前明確要求「Step 2 必須調用 ui-ux-pro-max 生成 HTML 給使用者審查,循環直到使用者明確 OK 才放行」,HTML 範例引用 `module-3-4-step2-review.html`。對齊 8 面向 validation: 規範強化 / Forbidden 新增 / Self-Check 擴張 / references 同步 / Cross-Skill 引用 ui-ux-pro-max + phycool-chrome-mcp-login-sop / Version History 升版 / FORBIDDEN Loophole Closure 三元素齊全。 |
| **2.0.0** | **2026-05-31** | **A–K 11 塊範式擴充(架構級 major)**。補全 brownfield 開發中途校正範式缺失:**§0 BMAD 體系定位**(brownfield Phase 2-3 逆向校正器,對標 `document-project` + `correct-course`,交棒 Phase 4;PRD/SDD/ADR 在 BMAD 生成於 Phase 2-3 非 create-story,本 skill 校正既有非從零)(A);**§1 原則 6** code≠正確規範真相錨點(基線=時間維度非真相,禁把 bug 當設計寫進規範)(F)+ **原則 7** 模組排序依賴拓撲+地基優先(G);**§3** 8→9 維度(D9 跨文檔 SSoT 一致性:術語/常數/狀態機/cross-cutting)+ 步驟一補基線凍結+5 類 finding 分類(偏移/缺漏/不全/遺失/功能新增)(B/J)+ 步驟二 2.6 重大 finding 裁決分流(H)+ 步驟三 7 位置→9 文檔委派矩陣(IDD→phycool-intentional-decisions 4 層 / SDD→sdd-spec-generator / AC→testarch-atdd / PRD→create-prd / ADR→create-architecture,校正既有 vs 缺漏新生成雙模式)(C)+ 步驟四校正產出→Story enrichment 接合契約(I)+ 步驟五校正台帳+雙層 DoD+排除測試/運維/治理文檔邊界(E/K);**§4** FORBIDDEN 補 F9-F12(三元素);**§5** Self-Check 6→10 題;**§Pressure Test** 補 IL5/IL6 + Test 4/5 + Rationalization + Red Flags;**新增** references/brownfield-correction-framework.md;**§6** 補 BMAD 對標 workflow。觸發:2026-05-31 Party Mode 9 專家收斂(範式缺失面 + 補全參照),使用者裁定開發中途全面盤點→校正資訊統一→交棒 BMAD。走 `pre-audit-mandate` 6 步(對齊 38% 內容/100% 骨架→升級路徑)+ `skill-builder` Mode B + 8 面向驗證。references/{5-step-detail, 8-dim-and-7-position-checklist}.md 同步重寫 + skills_list.md 觸發詞同步。 |
| **2.1.0** | **2026-05-31** | **brownfield 校正循環 5 缺陷補全(minor — 新增規範段落,5 步骨架不破壞)**。Party Mode 9 專家收斂 + 使用者裁定(Q1 盤點閘門「Step 0+使用者確認」/ Q2 載體「校正全 inline、僅 Phase 4 子視窗」/ Q3「skill-builder Mode B 實作」+ 釐清「未完成 Story 中控 inline 補全」)。**C1 執行載體三分法**(§1 原則 8 + §3 載體三分法表:主視窗 inline=校正 Step 0-4 唯一載體 / Agent·Task subagent=校正全程 FORBIDDEN / party-to-pipeline 子視窗=僅 Step 5 開發;Step 1/3/4 carrier「主控端+subagent」→「主視窗 inline」)(缺陷 1+5);**C2 步驟零窮舉子功能盤點 + 使用者確認閘門**(5 來源聯集 + 使用者確認清單齊全才 diff,根治 search 召回不全漏子功能如邊距/超線警示;grep ≠ verification)(缺陷 4);**C3 步驟四 4.0 未完成 Story 偵測**(search_stories → 未完成走 bmad create-story 主視窗 inline 補全接合,禁 raw upsert 覆蓋 / 禁丟子視窗冷啟動,scope 限當前模組)(缺陷 2);**C4 Config 校正子協定**(改 .claude/** config 前字面調對應 gating skill 過 guard hook hard-block:SKILL.md→saas-to-skill/skill-builder、hook→hooks-mechanization、rule→cc-config-author、settings.json→PowerShell bypass)(缺陷 3);**C5** FORBIDDEN F13-F16(三元素)+ Self-Check 10→14 題 + IL7/IL8 + Test 6-8 + Rationalization/Red Flags + §6 cross-ref(pre-audit-mandate/verification-protocol/subagent-blocked-tools/settings-json-edit-policy)。references/{5-step-detail(Step 0 + Step 4.0 + Config 子協定 + carrier inline),8-dim-and-7-position-checklist(Position 5 existing-story 分流)}.md 同步 + skills_list.md 觸發詞同步。走 `skill-builder` Mode B + 8 面向驗證。 |
