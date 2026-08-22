# 5 Step Detail — 通用模組校正循環

> 來源:`module-conformance-loop` SKILL.md §3 5 步驟概述展開。
> 通用範本,具體應用見 [pcpt-editor-application.md](pcpt-editor-application.md)。

---

## Step 0: 窮舉子功能盤點 + 使用者確認閘門(**使用者驅動** · v2.1.0 新增)

> **根治缺陷 4**(資訊缺漏):audit 從 search 結果起手會召回不全,漏掉「該有但沒被搜到」的子功能(如畫布渲染的邊距警示 / 超出畫布警示,使用者事後補述才發現)。`verification-protocol.md`:**grep ≠ verification**。對齊 `pre-audit-mandate.md` Whole-Task Pre-Audit。

### Role / Tools
- **主視窗 inline**(主控端親自,禁 subagent):從 5 來源窮舉子功能 → 列聯集清單
- **使用者**:確認「清單齊全、無漏項」或補充
- **Tools**:Read(SKILL.md / PRD 全文)/ `codegraph_search` / `codegraph_explore`(命名空間 symbol)/ `mcp__phycool-context__search_context`(多角度)/ Glob

### 5 來源窮舉(取聯集,非單一 search)
| # | 來源 | 動作 | 為何不可省 |
|:-:|:--|:--|:--|
| ① | 對應 `phycool-*` SKILL.md **全文** | Read description + body 功能列舉 | editor-arch 字面就列 boundaryWarning/SafeArea — 搜不到是因沒讀全文 |
| ② | PRD 對應章節**全文** | Read 整 §(非關鍵字 grep)| 需求意圖完整子功能清單 |
| ③ | code 命名空間所有 symbol | `codegraph_search`/`codegraph_explore` 撈 `*Warning`/`*Overlay`/`*Guide` 等 | 漏的東西搜不到(不知道要搜它),靠 symbol 窮舉補 |
| ④ | Memory 歷史討論 | `search_context` **多角度查詢**(multi-modal sweep,非單一 query)| 之前討論過的功能(如超線提醒)散在多 entry |
| ⑤ | 既有 audit baseline | 交叉比對 | 避免與前模組 audit 不一致 |

### 確認閘門(SUPREME — 違反 = IL7 / F14)
1. 主視窗輸出**子功能聯集清單**(每項標來源 + 是否已有規範)
2. 呈使用者:「本模組子功能清單如下,**還缺什麼嗎?**」
3. **唯有**使用者確認「齊全 / 無漏項 / 就這些」才進 Step 1 diff
4. 使用者補充的子功能 → 加入清單 → 才往下

### Output
- `{module}-subfeature-inventory.md`(或併入 audit baseline header)+ 來源標註
- 使用者確認 marker(Memory category=decision)
- Step 1 diff scope = 確認後的完整子功能清單(無漏項)

### Self-Check(進 Step 1 前必答 3 題)
- [ ] 5 來源每源都查了?(尤其 ① SKILL.md 全文 + ③ codegraph symbol)
- [ ] 聯集清單呈使用者且取得「齊全」確認?
- [ ] 使用者補充項已納入?

---

## Step 1: 9 維度差異比對(audit baseline)

### Role / Tools
- **主視窗 inline**(主控端親自,**禁 subagent** — v2.1.0 原則 8;跨委派邊界丟 context = 缺漏/不一致根因,subagent 受 `subagent-blocked-tools.md` Tier 3 限制):依步驟零確認的完整子功能清單,**親自**深度 Read 9 維度資料源 + 對照 → 產出 audit baseline `.md`
- **Tools**:Read / Grep / Glob / mcp__phycool-context__* / **mcp__gitnexus__{context, query, impact, detect_changes, shape_check, route_map}**(D1 程式碼 / D8 解耦 必走 gitnexus 加速取 call graph + blast radius;對齊 CLAUDE.md always-on 規範)/ Bash(讀 schema 等)

### Input
- 目標功能模組名
- **步驟零確認的完整子功能清單**(diff scope 錨點,無漏項)+ 模組相關 file:line evidence
- **基線凍結**(v2.0.0):記錄當前 `{baseline_commit, baseline_ts}` 寫 audit baseline header + Memory,防開發中途 code 漂移使校正失準(詳 brownfield-correction-framework.md J)

### 9 維度比對

| # | 維度 | 通用資料源 |
|:-:|:--|:--|
| D1 | production code | 主程式碼目錄(各專案不同)|
| D2 | Skill | `.claude/skills/*` 相關 SKILL.md + references |
| D3 | 需求功能文檔 PRD | `docs/.../functional-specs/` |
| D4 | 商業策略 IDD | `mcp__phycool-context__search_intentional_decisions` + ADR |
| D5 | 技術文檔 / Spec / UIUX | SDD Spec / Preflight Contract / UIUX 規格 |
| D6 | Memory + Story | `mcp__phycool-context__search_context` + `search_stories` + `search_tech` |
| D7 | DB schema | `.claude/skills/phycool-context-memory/references/db-schema.md` + Migration + Models |
| D8 | OOP / 模組化 / 解耦 | Store 邊界 / Hook 邊界 / Service-Repo-Controller 分層 / DDD 聚合 |
| D9 | 跨文檔 SSoT 一致性(v2.0.0)| 術語(glossary)/ 常數 Magic Number / 狀態機 / cross-cutting |

### Output
- `{audit-output-path}/{module}-audit.md`(目錄路徑由 application context 決定)+ 基線凍結 header
- Delta Report A-E(差異 / 不同步 / 未實作 / 邊界 / 偏差)+ file:line evidence
- **finding 分 5 類**(v2.0.0):偏移 drift / 缺漏 missing / 不全 incomplete / 遺失 lost / 功能新增 new feature,各標類型 + Phase D blast radius(`gitnexus_impact`)
- **真相錨點**(原則 6):code 現況 ≠ 正確需求時,文檔寫**正確需求**標偏移 finding,禁把 bug 當設計
- 同步更新 `cross-cutting-issues.md` + `summary.md`(若多模組 audit project)

### Self-Check
- [ ] **diff scope = 步驟零確認的完整子功能清單(逐項 cover,非「每維讀 1 file」)?**
- [ ] 9 維度每維每子功能 Read 實際內容?
- [ ] 結論均附 file:line evidence?
- [ ] Cross-validate 7 維度同 term 一致性?(對齊 `.claude/rules/constitutional-depth-first.md` L1)

---

## Step 2: 使用者審查 + 手動 BUG 測試 + 定案(**使用者驅動 + ui-ux-pro-max HTML 審查迴圈** v1.2.0 強化)

### Role / Tools
- **使用者**:驅動審查 + 測試 + 變更說明 + 補充 + 明確放行
- **主控端**(被動 + ui-ux-pro-max 報告生成):**生成 HTML 報告** + 等待 + 必要時 Chrome / Browser MCP 驗證 BUG 根因 + 紀錄定案至 Memory
- **Tools**: `Skill(skill="ui-ux-pro-max")`(HTML 報告生成,UI/UX 功能面框架展示)/ `Skill(skill="phycool-chrome-mcp-login-sop")`(BUG 根因 Live verify)/ `mcp__phycool-context__add_context`(每輪回饋紀錄)

### Input
- Step 1 audit baseline `{module}-audit.md`
- `dashboard.html`(若有)視覺 review
- prod-like dev server

### 子流程(2.1 - 2.5)

#### 2.1 主控端動作(Step 1 完成觸發)
1. 調用 `Skill(skill="ui-ux-pro-max")` 生成 Step 2 HTML 審查報告
2. HTML 內容必含:
   - 8 維度 audit summary(對齊 D1-D8 結果)
   - Delta Report A-E(差異 / 不同步 / 未實作 / 邊界 / 偏差)+ file:line evidence
   - **UI / UX 功能面直接實作框架展示**(視覺 mockup / 互動草案 / wireframe / live HTML prototype 讓使用者準確確認需求)
   - 嚴重度色階 / 條目級操作按鈕(接受 / 變更 / 補充)
3. HTML 路徑:`docs/implementation-artifacts/audits/{date}-{module}-step2-review.html`(application-specific 可調整路徑)
4. 範本參照:`docs/implementation-artifacts/audits/2026-05-17-editor-conformance-audit/module-3-4-step2-review.html`

#### 2.2 使用者動作
1. 開瀏覽器審查 HTML 報告
2. 對照 audit Delta Report A-E
3. 對照 `dashboard.html` 嚴重度色階(若多模組 audit project)
4. 開瀏覽器手動測試當前功能 → 紀錄 BUG / 功能異動 / 變更需求
5. 對主控端明確說明:「以下接受 / 以下變更 / 以下 follow-up」/「需要再調整 X 段」/「補充 Y 規格」

#### 2.3 主控端動作(分析使用者回饋)
1. 分析理解使用者回饋(需求功能變更 / 校正調整 / 補充說明)
2. 再次調用 `Skill(skill="ui-ux-pro-max")` 生成更新後 HTML 報告
   - 加入使用者要求的調整(UI/UX 功能面框架展示更精確)
   - 標註「v2 / v3 / ...」版本(每輪 supersede 前版)
3. 若使用者再有調整 → 回 2.2 子循環
4. **循環直到** 2.4 放行條件滿足為止

#### 2.4 放行條件(SUPREME — 違反 = IL2 / IL4)
**唯有**使用者明確訊息(任一即可)才可放行進 Step 3:
- 「OK」/「OK 了」/「都 OK」
- 「沒問題」/「沒有問題」
- 「進入下一個階段」/「下一階段」
- 「確認放行」/「批准」/「同意執行」
- 「Step 3 / Step 3 開始」明確指示

**禁止視為放行的情境**(IL4 違反):
- ❌ 使用者沉默(主控端不可詮釋為「默許」)
- ❌ 主控端「邏輯上已對齊 SSoT」自我說服
- ❌ 主控端「等不到使用者醒來就先推」
- ❌ Chrome MCP / phycool-chrome-mcp-login-sop 驗證 BUG 根因 = 輔助使用者確認,**不可代驗收**

#### 2.5 記錄(每輪 HTML 生成 + 使用者回饋)
- `mcp__phycool-context__add_context` category=decision
- title: `{module} Step 2 HTML 審查 v{N} — 使用者回饋紀錄`
- content: 含 HTML 路徑 + 使用者具體回饋 + 主控端理解 + 下輪預計調整
- tags: `["decision", "{epic}", "{module}", "step-2-html-review", "v{N}"]`

#### 2.6 finding 裁決分流(v2.0.0)
- **重大 finding 必經使用者裁決**:架構升級 / 功能新增 / 商業策略 IDD / 破壞性變更(對齊 IL6 / F11)
- **輕微 finding 主控端可自主**:術語 typo / 路徑漂移 / 章節對齊
- 重大 finding 裁決結果記入校正台帳「裁決者」欄(brownfield-correction-framework.md K)

### Output
- N 個 HTML 報告版本(v1, v2, ..., 最終 vN 含使用者放行 marker)
- N 個 Memory entry(每輪審查紀錄)
- 最終 Memory entry:`{module} Step 2 使用者定案 — 接受 X / 變更 Y / follow-up Z(放行訊息引用)`
- 主控端取得明確 Step 3 範圍

### FORBIDDEN
- ❌ **F7**:跳過 ui-ux-pro-max HTML 審查迴圈直接進 Step 3(對齊 SKILL §4 F7 Loophole Closure)
- ❌ **F8**:主控端代使用者「驗收」/「審查通過」/「視為放行」(對齊 SKILL §4 F8 / IL4)
- ❌ 跳過每輪 Memory 紀錄(2.5)— context 切換 / compact 後失傳

### Self-Check(進 Step 3 前必答 4 題)
- [ ] 本模組是否至少 1 次調用 `Skill(skill="ui-ux-pro-max")` 生成 Step 2 HTML?
- [ ] HTML 含 UI/UX 功能面直接實作框架展示(非純文字 audit summary)?
- [ ] 使用者明確訊息「OK / 沒問題 / 進入下一個階段 / 確認放行」存在 Memory or transcript?
- [ ] Step 3 範圍與最終 HTML(vN)+ 使用者放行訊息完全對齊?

---

---

## Step 3: 9 文檔委派矩陣同步更新(依 Step 2 定案)

### Role / Tools
- **主視窗 inline**(主控端親自,**禁 subagent** — v2.1.0 原則 8):規劃 + 執行 9 文檔委派矩陣 update + cross-ref 一致性。**改 `.claude/**` config 必走下方 §Config 校正子協定**(唯主視窗能字面調 Skill tool 過 guard hook;subagent 調不了 = 缺陷 3 根因)

### 9 文檔委派矩陣 Checklist
詳 [8-dim-and-7-position-checklist.md](8-dim-and-7-position-checklist.md) 委派矩陣總表。每文檔分「校正既有 vs 缺漏新生成」雙模式;真相錨點 = 正確需求(原則 6)。

| # | 設計規範文檔 | 委派 skill/workflow | SUPREME 規範 |
|:-:|:--|:--|:--|
| 1 | Skill | `saas-to-skill`(phycool-*)/ `skill-builder`(通用)Mode B | `skill-tool-invocation-mandatory.md` |
| 2 | 需求 PRD | `create-prd` / `doc-sync`(校正既有 Edit functional-specs § cross-ref)| - |
| 3 | IDD + ADR-IDD | **`phycool-intentional-decisions` 完整 4 層**(非只 add_intentional_decision)| `skill-idd-sync-gate.md` |
| 4 | SDD / 一般 ADR / AC | **`sdd-spec-generator`**(⚠️ 手動)+ 一般 ADR `create-architecture` + AC `testarch-atdd` | `spec-timeliness.md` |
| 5 | API + Error Code | `business-api` / `error-handling`(OpenAPI / E-{MODULE}{SEQ})| - |
| 6 | UIUX 規格 | `design-system` / `ui-ux-pro-max`(Step 2 已含)| front-end-spec |
| 7 | Memory + Story | `add_context` + `add_tech` + `upsert-story` | `db-first-no-md-mirror.md` |
| 8 | DB schema | Migration + PRAGMA verify + **`mcp__gitnexus__shape_check`**(v1.1.0)| DB Schema-First Mandate |
| 9 | OOP / 解耦 | Skill FORBIDDEN + Story dev_notes + **`mcp__gitnexus__impact({direction:"downstream"})`**(v1.1.0,HIGH/CRITICAL warn)| 跨 Skill SSoT |

### §Config 校正子協定(v2.1.0 — 根治缺陷 3:改 config 被 guard hook 擋)

校正觸及 `.claude/**` 開發環境配置時,**主視窗必先字面調用對應 gating skill 才 Edit**,否則 guard hook hard-block(exit 2)。**subagent 無法調 Skill tool → 必主視窗 inline**(原則 8)。

| 要改的 config | 擋你的 guard hook | 過 hook 鑰匙(先字面調用)|
|:--|:--|:--|
| `.claude/skills/**/SKILL.md` + `references/*.md` | `skill-tool-invocation-guard.js`(exit 2)| `Skill(saas-to-skill)`(phycool-*)/ `Skill(skill-builder)`(通用)|
| `.claude/hooks/*.js` | `hooks-skill-invocation-guard.js`(exit 2)| `Skill(hooks-mechanization)` |
| `.claude/rules/*.md` / `CLAUDE.md` |(cross-ref advisory)| `Skill(cc-config-author)` |
| `.claude/settings.json` | `config-protection.js`(攔截 Edit/Write)| PowerShell `[System.IO.File]::WriteAllText` bypass(對齊 `settings-json-edit-policy.md`,`permissions.deny` 除外)|

> ❌ 禁設 `PHYCOOL_*_BYPASS=1` 繞過 guard 而非走正規 gating skill(F15);bypass ENV 僅緊急用。
> ❌ 禁把 config 校正丟 subagent(調不了 Skill tool 必被擋,反覆重試卡死 = 缺陷 3 觀測現象)。

### Output
- 9 文檔委派全 update + cross-ref consistent + 各走對應 skill(非裸 Edit/add_*)
- Skill version bump + Version History
- Memory + Story 對齊
- 8 面向 validation PASS(對齊 saas-to-skill Mode B §5.4)

---

## Step 4: 記憶庫建立/更新 Story(DB-first)

### Role / Tools
- **主視窗 inline**(主控端親自,**禁 subagent / 禁丟子視窗** — v2.1.0 原則 8):撰寫 Story 5 維度 enrichment(AC ATDD / Tasks Phase / dev_notes / DoD / SDD Spec)。**校正期 create-story 接合 live findings 需熱 context,丟子視窗冷啟動 = 新版缺陷 4**(F16)

### Step 4.0:未完成 Story 偵測分流(v2.1.0 — 根治缺陷 2)

DB 常已有當前模組的**半成品 Story**(status≠done)。Step 4 開頭必先偵測分流,**禁 raw upsert 覆蓋半成品**:

```
mcp__phycool-context__search_stories(當前模組關鍵字)
  ├─ 查無 → 原 upsert-story 新建流程(下方 Action)
  ├─ 查有 backlog(stub 未 enrich)→ 主視窗 inline `bmad:bmm:workflows:create-story` 補全 → ready-for-dev
  └─ 查有 ready-for-dev 但內容 stale(基於漂移前文檔)→ 主視窗 inline create-story 重 enrich 接合校正後 findings
```

- **載體**:主視窗 inline create-story(F16,禁丟 party-to-pipeline 子視窗冷啟動 — 接合 live findings 需熱 context)
- **Scope 護欄**:只補**屬當前校正模組**的未完成 Story;他 epic 遺留 backlog 不在本模組 scope(越界 = IL1 跨模組)
- **bmad create-story vs raw upsert**:backlog/stale 走完整 `bmad create-story`(5 維度 enrichment + AC ATDD + 接合契約);純欄位微調才 raw upsert

### Input
- Step 3 7 位置更新後的全部 context
- 模組特定 audit + Skill + IDD + DB schema 對齊

### Action
0. **校正產出→Story 接合契約**(v2.0.0):每個 resolved finding 必接進 Story enrichment 欄位(偏移/不全→`sdd_spec`+`dev_notes` file:line;功能新增→`implementation_approach` Phase+`sdd_spec`;商業策略→`dev_notes` 引用 IDD-{TYPE}-{NNN};schema→`implementation_approach`)。否則 Phase D dev 拿不到校正脈絡 → 仍偏移(F12)。映射表詳 brownfield-correction-framework.md I。
1. 寫 `_tmp_enrich_{story-id}.json` to `.context-db/`
2. `node .context-db/scripts/upsert-story.js .context-db/_tmp_enrich_{story-id}.json`
3. Cleanup temp JSON
4.(M+ complexity)SDD Spec 走 `sdd-spec-generator`(⚠️ disable-model-invocation,需使用者手動)`docs/implementation-artifacts/specs/epic-{epic}/{story-id}-spec.md`
5. `create_completed_at` 設定 → 觸發 auto-promote backlog → ready-for-dev

### Output
- Story status=ready-for-dev(I1-I9 invariants PASS,對齊 `story-lifecycle-invariants.md`)
- SDD Spec(若 M+)
- file_list / required_skills / risk_assessment / rollback_plan / monitoring_plan 完整

---

## Step 5: 全模組校正完畢 → dev > review(使用者宣告)

### Role / Tools
- **使用者**:宣告全模組校正完畢
- **主控端 + party-to-pipeline 子視窗**(此為**開發交棒**,改 production code,故子視窗合法 — 對比校正期 Step 0-4 禁子視窗):觸發 dev-story → code-review pipeline(P0 → P1 → P2 priority)。Story 已於 Step 4 補成 ready-for-dev,子視窗 create stage 僅輕量驗證不重做接合

### Input
- 全模組 audit baseline 全 done + 全 Step 2-4 全完成
- **校正台帳 0 open finding + 雙層 DoD 達成**(v2.0.0,詳 brownfield-correction-framework.md K)
- All Stories ready-for-dev(校正產出已接合 enrichment)

### Action
- **交棒 BMAD Phase 4**(v2.0.0):本 skill 校正完畢 → 交棒 `create-story`(消費校正後文檔)→ `dev-story` → `code-review`。**本 skill 不自己做開發**(校正 ≠ 實作)。
- **Pre-dispatch**(v1.1.0):`mcp__gitnexus__detect_changes` 確認當前所有 Stories 改動 scope + `mcp__gitnexus__impact` 對 P0 stories 跑 blast radius(HIGH 或 CRITICAL 必 warn 使用者)
- 走 `Skill(skill="party-to-pipeline")` Mode B(stub 已建場景)dispatch Pipeline(P0 → P1 → P2)
- 每個 Story 完整 dev-story → code-review workflow + Skill Sync Gate + tasks-backfill-verify
- **功能新增 / 重大偏移** finding 牽涉既定 epic/PRD 大改 → 委派 BMAD `correct-course`(產出 sprint-change-proposal)
- **排除**:測試執行 / 運維 / 治理文檔不屬本 skill,走 Phase 4 dev-story 或別 workflow

### Output
- 全 Stories done(status=done)+ CR Report PASS
- Memory + sprint-status.yaml 全 sync

---

## Step Transitions(模組換手協議)

```
完成當前模組 Step 4(Story ready-for-dev)→
1. 更新 Epic 推進地圖(對齊 .claude/rules/execution-tree-doc-sop.md v1.1 ≤ 100 行)
2. 更新 session handoff 文檔
3. Memory add_context category=session(本模組校正完成 summary)
4. 詢問使用者:「下一個模組是 {default-next-in-list} 嗎?或要跳序?」
5. 等使用者明確指定下一個模組 → 進入該模組 Step 1
```

**禁止**:主控端自行進入下一個模組 Step 1(違反「使用者驅動 Step 2 + 模組換手」)。
