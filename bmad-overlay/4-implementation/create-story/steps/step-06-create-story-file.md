---
name: 'step-06-create-story-file'
description: 'Create comprehensive story file with Skills, DB change detection, Doc impact, KB scan, Debt Registry Pull'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-06-create-story-file.md'
nextStepFile: '{workflow_path}/steps/step-06.5-depth-gate.md'
---

# Step 6: Create Comprehensive Story File

**Goal:** Create the ultimate developer guide story file with all PhyCool-specific enrichments.

---

## AVAILABLE STATE

- `{story_key}`, `{epic_num}` — from Step 1
- `{epics_content}`, `{prd_content}`, `{architecture_content}` — from Step 2
- `{codebase_analysis}` — from Step 3
- `{memory_context}` — from Step 0

---

## STATE VARIABLES (set in this step)

- `{required_skills}` — 需要載入的 Skills 列表
- `{has_db_changes}` — 是否有 DB Schema 變更 (true/false)
- `{doc_impact_list}` — 受影響文檔列表

---

## EXECUTION SEQUENCE

> **CRITICAL:** 📝 CREATE ULTIMATE STORY FILE — The developer's master implementation guide!

> **CRITICAL:** NEVER leave placeholder text like `{variable}` in final output — all must be replaced with actual values!

### 0. SDD Spec Gate (M/L/XL Mandatory — BEFORE story file creation)

> **CRITICAL:** 🔒 SDD SPEC GATE — M/L/XL complexity Stories MUST have SDD Spec BEFORE creating story file.
> **CRITICAL:** This gate is NON-NEGOTIABLE. No domain exception, no Self-Contained exception, no "AC already has BR" exception.

1. Check `{db_story}.complexity` — if S → skip this gate
2. If M/L/XL → Check `docs/implementation-artifacts/specs/epic-{epic_num}/{story_key}-spec.md` exists
3. **If Spec exists:** Read and verify it follows `sdd-spec-template.md` structure (§1-§8 sections)
4. **If Spec does NOT exist:** Execute sdd-spec-generator flow:
   a. Read `.claude/skills/sdd-spec-generator/SKILL.md` (full)
   b. Read `.claude/skills/sdd-spec-generator/references/sdd-spec-template.md` (template)
   c. Follow skill Steps 1-5 to produce `{story_key}-spec.md`
   d. **DO NOT manually write a spec file — follow the skill's template and quality gates**
5. Set `{spec_path}` = `docs/implementation-artifacts/specs/epic-{epic_num}/{story_key}-spec.md`
6. Verify Spec has Business Rules table with testable input → expected output per BR

**FORBIDDEN:**
- ❌ Skipping this gate for "infrastructure domain" stories
- ❌ Hand-writing a spec file instead of following sdd-spec-generator flow
- ❌ Using "Self-Contained" or "AC already has BR" as skip justification

---

### 0.5. SPEC Kernel (D0) — M/L/XL Mandatory

> **CRITICAL:** 🎯 D0 SPEC KERNEL — M/L/XL Story 在展開細節前先釘 5 欄 kernel，提前識別 XL 風險 + 範圍蔓延。蒸餾自 BMAD v6.8.0 bmad-spec kernel（取神捨形，非複製 BMAD 格式）。

1. Check `{db_story}.complexity` — if S → 選填（建議至少填 Problem + Success signal，Constraints/Non-goals 可省）
2. M/L/XL → 必填 template `## SPEC Kernel` 表 5 欄：
   - **Problem**: 一句話描述要解決的問題（對照 step-02 artifact business intent）
   - **Capabilities**: 交付後系統能做什麼（條列，對照 AC）
   - **Constraints**: 技術/業務/合規約束（對照 IDD / ADR / step-04 architecture）
   - **Non-goals**: 明確不做什麼（劃範圍邊界，防 scope creep）
   - **Success signal**: 可量測成功信號 + **驗證指令**（測試命令 / 驗收腳本 / 可量測 DOM 斷言）
3. **Non-goals 拆卡風險提示**: 若 Non-goals 反映本 Story 實際涵蓋多個獨立可交付單元 → 對齊「L 以上先拆 story」通則，建議回 sprint-planning 拆卡再 create

**FORBIDDEN:**
- ❌ Success signal 寫描述性陳述（「正常運作」「功能完整」「正確顯示」）— 必須含可執行驗證命令或可量測斷言
- ❌ M/L/XL Story Non-goals 留空（範圍邊界未劃 = XL 風險未識別）

---

### 1. Initialize Story Content

1. Set `{epic_num}` = extracted epic_num
2. Initialize in-memory story content from `template.md`'s section structure (no file write — DB-first; sections are assembled here and written to the DB payload in `step-07-finalize.md` Step 4)

---

### 2. Fill Story 資訊 Metadata Table

> **CRITICAL:** 🏷️ STORY METADATA — Must fill ALL fields in `## Story 資訊` table!

Extract and fill Story 資訊 table fields:
- `{story_key}`: Full story identifier (e.g., "bf-26-1-payment-deadline-tab")
- `{epic_name}`: Epic title from epics document
- `{priority}`: P0/P1/P2/P3 from epics or PRD
- `{story_type}`: Feature / Tech Debt / Bug Fix / Enhancement
- `{complexity}`: XS (1 SP) / S (2 SP) / M (3-5 SP) / L (8 SP) / XL (13+ SP)
- `{source_reference}`: Origin of this story
- `{dependencies}`: Other stories this depends on
- `{date}`: Current system date (YYYY-MM-DD format, Taiwan UTC+8)

Fill Agent tracking fields:
- Create Agent: Record the current LLM model name (e.g., "Claude Sonnet 4.6")
- Create完成時間: Execute `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"` to get Taiwan time
- DEV Agent / DEV完成時間 / Review Agent / Review完成時間: Set to "—"

**CONTENT ASSEMBLY:** Compose story header fields in-memory — feeds `step-07-finalize.md` Step 4 DB payload (`source_file: "context-db://stories/{story_key}"`, not a `.md` path)

---

### 3. Skills Analysis

> **CRITICAL:** 🔧 REQUIRED SKILLS ANALYSIS — Reference Skills catalog!

1. Load Skills catalog from: `{project-root}/.claude/skills/skills_list.md`
2. Match story content keywords against trigger keywords in the loaded Skills catalog
   - **Do NOT hardcode skill mappings** — skills_list.md is the single source of truth
3. For each matched Skill, note WHY it's needed based on story content
4. Store matched Skills as `{required_skills}` list

Compose `## Required Skills` section content (in-memory, feeds `required_skills` DB field):
```markdown
## Required Skills

> dev-story 和 code-review 執行時，必須先載入以下 Skills。

- {skill_name} - {reason}
```

If `{required_skills}` is empty: Write note "此 Story 無需特定技術規範 Skill。"

---

### 4. Database Change Detection (TD-18)

> **CRITICAL:** 🗄️ DATABASE CHANGE DETECTION — Scan story for database schema changes.

Scan story tasks, AC, and technical requirements for keywords:
`Migration, Entity, DbSet, DbContext, 欄位, 欄位新增, 欄位調整, 欄位刪除, ALTER TABLE, 新增資料表, FK, Foreign Key, 外鍵, 索引, Index, EF Core, ApplicationUser 屬性, Model 變更, Schema, Navigation Property, HasOne, WithMany, DeleteBehavior`

Set `{has_db_changes}` = true if ANY keyword found.

**If `{has_db_changes}` == true AND `/phycool-sqlserver` NOT in `{required_skills}`:**
- Auto-add `/phycool-sqlserver` to `{required_skills}` with reason "Story 涉及資料庫 Schema 變更"
- Append to the in-memory `## Required Skills` section content
- Output: 🗄️ 偵測到資料庫變更 — 自動加入 /phycool-sqlserver Skill

**If `{has_db_changes}` == true:**
1. Write into Dev Notes section:
   ```markdown
   ### ⚠️ 資料庫變更注意事項
   本 Story 涉及資料庫 Schema 變更，dev-story 執行時需注意：
   1. 建立 Migration 後，執行 `dotnet ef database update` 套用至本機 DB
   2. 完成前驗證：`dotnet ef migrations has-pending-model-changes` 返回 "No changes"
   3. 參考 `/phycool-sqlserver` Skill 的 Migration 規範
   ```
2. Append DB Migration Verification AC (with next available AC number):
   ```markdown
   ### AC-N: 資料庫 Migration 驗證
   - [ ] EF Core Migration 已建立並命名符合規範
   - [ ] `dotnet ef database update` 執行成功
   - [ ] `dotnet ef migrations has-pending-model-changes` 返回 "No changes"
   - [ ] ModelSnapshot 正確反映所有 Model 變更
   ```

---

### 5. Document Impact Detection (TD-29)

> **CRITICAL:** 📄 DOCUMENT IMPACT DETECTION — Identify docs that may need updating after implementation.

Initialize `{doc_impact_list}` = empty list.

Scan story content for keywords per rule:

| Rule | Keywords | Target Doc |
|------|---------|-----------|
| #1 (DB Schema) | reuse `{has_db_changes}` | `docs/.../database-schema.md` |
| #2 (Service/Hub) | Service, Controller, Hub, Middleware, DI 註冊, AddScoped, AddTransient | `docs/.../platform-services.md` |
| #3 (Auth/Payment) | OAuth, JWT, Identity, ECPay, Payment, Subscription, 退款, Webhook | `docs/.../auth-payment.md` |
| #4 (PDF Engine) | PDF, QuestPDF, PdfWorker, PdfGenerator, 佇列, Circuit Breaker | `docs/.../pdf-worker.md` |
| #5 (Canvas/Editor) | Canvas, Fabric.js, CanvasJson, EditorStore, Zustand, 畫布 | `docs/.../editor-canvas.md` |
| #6 (Security) | CSP, CSRF, XSS, Auth, SecurityHeaders, RBAC, 權限 | `docs/.../security-spec.md` |
| #7 (Error Codes) | ErrorCode, error_code, 錯誤碼, PhyCoolException | `docs/.../error-codes.md` |
| #8 (Testing) | Playwright, E2E, TestFixture, WebApplicationFactory, 測試策略 | `docs/.../testing-strategy.md` |

**If `{doc_impact_list}` is NOT empty:**
- Append to Dev Notes:
  ```markdown
  ### 文檔影響提醒
  > 本 Story 的變更可能影響以下文檔，開發完成後建議確認是否需同步更新：
  - [ ] `{path}` — {reason}
  ```
- Output: 📄 已注入文檔影響提醒至 Dev Notes（N 份文檔）

If empty: Silent skip.

---

### 6. Knowledge Base Scan (TD-31)

Scan KB for known issues related to this story's skills/domain; inject links into Dev Notes.

Set `{kb_troubleshooting_path}` = `{project-root}/docs/knowledge-base/troubleshooting`

**If directory exists:**
1. Extract Required Skills from story content
2. Map skills to KB domains (same table as dev-story step-02b)
3. For EACH mapped domain:
   - Glob-scan `docs/knowledge-base/troubleshooting/{domain}/*.md` (exclude `_template.md`)
   - Read frontmatter: keywords, related_skills, occurrences, severity, status, id, title
   - If `status == "resolved-by-skill"` → skip
   - Compare keywords against story AC/Tasks/title text
   - If ≥2 keywords match → mark as relevant
4. If relevant KB entries found:
   - Append to Dev Notes:
     ```markdown
     ### 已知問題參考 (Knowledge Base)
     開發前建議閱讀以下已知問題，避免重複踩坑：
     - [{id}: {title}](...) — occurrences: {n}, severity: {s}
     ```
   - Output: 📚 已注入 N 個知識庫已知問題連結至 Dev Notes
5. If no relevant entries: Silent skip.

---

### 7. Codebase Analysis Section

**If `{codebase_analysis}` is available:**

Compose `## 程式碼現況分析` section content (in-memory) with:
- 相關現有檔案 (existing_files)
- 可重用的抽象/工具 (reusable_abstractions)
- 已有部分實作的任務 (partial_implementations)
- 注意事項 (conflicts)
- 建議實作方式 (recommended_approach)

**If `{codebase_analysis}` is NOT available:** Write note "程式碼分析未發現相關現有實作，此為全新功能開發。"

**Background Code Evidence (Mandatory):**

> **MANDATE:** After writing 程式碼現況分析, go BACK to `## Background` section and embed
> `{codebase_snippets}` from Step 3. Background MUST contain at least ONE code snippet
> with `file:line` reference showing the current state of relevant code.

Insert a `### 程式碼現況` sub-heading within Background with the snippets. Format:

```markdown
### 程式碼現況

**`FileName.ext:L123-145`** — {purpose}
```language
// actual code
```
```

If `{codebase_snippets}` is "全新功能" → still embed the pattern reference snippet.

---

### 7.5 測試規格產出(Test Specification Production)

> **CRITICAL:** 🧪 TEST SPEC PRODUCTION — 將 `testing_strategy` 從「必填卻無產出指令」升級為「具名測試案例表」。**產表不產檔**：本步驟絕不建立 / 修改 / 刪除任何測試原始檔（見 7.5.5 FORBIDDEN 首條理由）。

**位置理由**：本步驟需要 §7 掃出的既有 fixture / archetype 清單（Fixture 欄需引用具名既有資產），且必須早於 §9.5 品質閘門（供其讀取校驗）。

#### 7.5.0 分級 Gate（非互動 — 全依 DB 現值自動判定）

1. 讀 `{db_story}.complexity`
2. **`S` / `XS`** → 完全跳過 7.5.1-7.5.6，`testing_strategy` 維持既有自由格式行為不變（不產表、不改寫任何既有內容）。輸出：`ℹ️ §7.5 skipped — complexity=S/XS`
3. **`M` / `L` / `XL`** → 繼續執行 7.5.1-7.5.6

> 判定**全自動依 DB 現值決定，禁止引入任何 `<ask>` 或使用者提問**（`IDD-STR-003` forbidden #1「請勿強制所有 Epic 都走 create-story workflow 互動式流程」+ 子視窗 protocol F1 YOLO — worker 無 user 可問）。

#### 7.5.1 具名測試案例表 Schema（七欄必填 + 選填第八欄）

寫入 `testing_strategy` 的 markdown 表格，表頭至少含以下七欄（選填第八欄 `Pattern`）：

| 欄位 | 必填 | 內容規範 |
|------|:---:|---------|
| `Case` | ✅ | `{BR_ID}_{Scenario}_{ExpectedResult}` — 命名規範**引用** `dev-story/steps/step-06-author-tests.md:30` 既有定義，**不另立新命名法**。BR id 去分隔符後需 ≥2 段底線（如 `BR001_DiscountAbove50_ReturnsValidationError`；`BR001_Works` 因段數不足視為不合法） |
| `BR` | ✅ | 本案例驗證的 BR id，如 `BR-004` |
| `Level` | ✅ | 僅能是 `unit` \| `integration` \| `E2E` 三者之一 |
| `Fixture` | ✅ | 具名既有資產（如 `CustomWebApplicationFactory` / `TestcontainersWebApplicationFactory` / `BusinessLogicTestsArchetype` / `TestAccountSeeder A1-A5` / `ScenarioFactory`）或 `N/A — pure function`；禁空白或非具名描述 |
| `Input` | ✅ | 具體輸入值，非描述性文字 |
| `Expected` | ✅ | 具體預期輸出 / HTTP 狀態碼 / 錯誤碼 |
| `RED→GREEN` | ✅ | 雙向皆具體，判準見 7.5.2 |
| `Pattern` | ⬜ | 命中 `test-spec-pattern-catalog.md` 時填 `[Pattern: {ID}]`，見 7.5.4 |

**BR 覆蓋要求**：`acceptance_criteria` 中每個 `[Verifies: BR-XXX]` 標記出現的 BR id，`testing_strategy` 表格必含 ≥1 列對映（比對前 id 正規化：轉大寫 + 去除非英數字元，使 `BR-001` 對得上案例名 `BR001_…`）。

#### 7.5.2 紅綠雙向判準（直接引用，不自創）

`RED→GREEN` 欄位的雙向判準**直接引用** `.claude/skills/verification-before-completion/SKILL.md` §Key Patterns：

> `Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)`

RED 側 = revert 該案例對應修改後必然出現的失敗現象；GREEN 側 = 修改存在時必然通過的斷言。範例：`RED: 回 200（無版本檢查）/ GREEN: 回 409`。**禁**「會通過」「應該正常」等模糊敘述。

#### 7.5.3 冪等三分支（讀 DB 現值自動判定）

依 `testing_strategy` 當前 DB 值自動判定分支：

```
已含合格表（滿足 7.5.1 七欄 + BR-003 案例名格式）
  → 驗證模式：既有 Case cell 逐字不變（byte-identical），僅追加未覆蓋 BR 的新列
非空但為散文（未滿足 7.5.1 結構）
  → 升級模式：輸出結構化表，原散文原文以 <details> 區塊或寫入 dev_notes 完整保留（逐字可 grep 命中）
NULL / 空
  → 產出模式：產出完整表
```

**案例名一經產出即為契約**：重跑只增不改名 — `Case` 值一經寫入，後續任何重跑不得 rename / 移除既有列，只能新增未覆蓋 BR 的列。下游 `bwu-3` 的 dev/review 對帳完全依賴此穩定性（連跑兩次，案例名集合須滿足 `S1 ⊆ S2`）。

#### 7.5.4 Pattern-first 子步

產表前先比對 `.claude/skills/phycool-testing-patterns/references/test-spec-pattern-catalog.md`（若檔案不存在或讀取失敗 → **降級為「未命中」續行，不得中斷 workflow**）：

- **命中** → 該案例列帶 `[Pattern: {ID}]` 標記，只寫參數差異（endpoint / auth scheme / fixture 帳號）；若某標準案例本卡不適用，必附**具名豁免行**（格式：`豁免: {案例名} — {理由}`），禁靜默省略
- **未命中** → 全套案例正常寫出，不帶 `[Pattern:]` 標記，並記為晉升候選（供 code-review 階段第二次同型場景出現時標記晉升，見目錄晉升機制章節）

#### 7.5.5 FORBIDDEN

- ❌ **產表不產檔** — §7.5 不得建立 / 修改 / 刪除任何測試原始檔（`**/*.Tests/**`、`tests/**`、`**/*.spec.ts`、`**/*.test.ts` 等）。理由：create 為 DB-first 零產檔架構，介面 / DI 尚未存在使任何簽章成猜測，產檔會將 create 拉入 `.claude/rules/parallel-batch-conflict-isolation.md` 的檔案衝突面
- ❌ 冪等三分支判定引入 `<ask>` 或使用者提問
- ❌ 重跑時 rename / 刪除既有 `Case`（破壞案例名契約，下游對帳失去穩定 key）
- ❌ Pattern 未命中或目錄不可讀時中斷 workflow（必降級為「未命中」續行）
- ❌ `RED→GREEN` 欄寫「會通過」類模糊敘述

#### 7.5.6 輸出格式要求

案例表前後**各留一空行**（`\n\n`），表外敘述段落間用 `\n\n` 分段 —— DevConsole `StoryDetail.tsx` 以 react-markdown 渲染，單 `\n` 為 soft break 會使表格與前後文黏一起（對齊 §9.5 Q7）。`testing_strategy` 目前**不在** `run-depth-gate.js` 的 `MD_RENDER_FIELDS` 保護清單內，無寫入層 normalize 兜底，故本步驟需源頭治本。

---

### 8. Debt Registry Pull (DB-first via MCP)

> **CRITICAL:** 📋 DEBT REGISTRY PULL: Query tech_debt_items DB via search_debt MCP tool.
> registry.yaml 已廢棄（dla-04 遷移至 DB）。

**Phase A: target_story 查詢**

1. 呼叫 `search_debt({target_story: "{story_key}", status: "open"})`
2. 記錄結果為 `{debt_by_target}`

**Phase B: affected_files 查詢**

3. 從已建立的 `## File List` 提取所有檔案路徑，以逗號連接
4. 若 file_list 非空：呼叫 `search_debt({affected_files: "{file_list_joined}", status: "open"})`
5. 記錄結果為 `{debt_by_files}`

**Phase C: 合併與去重**

6. 合併 `{debt_by_target}` + `{debt_by_files}`，以 `debt_id` 為 key 去重
7. 最終結果為 `{merged_debts}`

**Phase D: 注入 Dev Notes**

8. **如果 `{merged_debts}` 非空：**
   - 在 Dev Notes 寫入 `### Related Tech Debt (auto-injected)` 表格：

     ```markdown
     | debt_id | severity | title | target_story | source |
     |---------|----------|-------|-------------|--------|
     | {debt_id} | {severity} | {title} | {target_story} | target/files/both |
     ```

   - **5-Min Rule 候選判斷**: severity="low" 且 affected_files overlap > 50% 的項目，額外標記：
     `建議加入 Tasks: {debt_id} — {title} (5-Min Rule candidate)`
   - 對 severity="low" 候選，新增對應 repair Task/Subtask
   - Output: 📋 前置技術債注入: N 個 open debts 已注入 Dev Notes

9. **如果 `{merged_debts}` 為空：** Silent skip（不留空標題）

---

### 8.5. IDD Warning (Intentional Decision Debt)

> **CRITICAL:** ⚠️ IDD WARNING: 檢查 file_list 是否觸及 active IDD 的 forbidden_changes。

1. 從 `## File List` 提取所有檔案路徑
2. 對每個檔案呼叫 `search_intentional_decisions({file_path: "{file}"})`
3. 合併所有命中結果，以 `idd_id` 去重

**如果命中 active IDD：**
- 在 Dev Notes 寫入 `### IDD Warnings` 區塊：

  ```markdown
  ### IDD Warnings
  ⚠️ **{idd_id}** ({title}) — criticality: {criticality}
    - Forbidden: {forbidden_change_1}
    - Forbidden: {forbidden_change_2}
    - Decision: {decision 摘要}
  ```

- 每個 IDD 展開全部 `forbidden_changes` 項目
- Output: ⚠️ IDD Warning: N 個 active IDDs 影響 file_list

**如果無命中：** Silent skip（不留空 `### IDD Warnings` 標題）

---

### 9. Final Story Content Sections

**PATH REFERENCE RULE:**
- **Source files** (`.cs`, `.ts`, `.tsx`, `.js`, `.css`, etc.): MUST use `FileName.ext:L123-145` format with exact line numbers verified by Read. Example: `useFloatingCards.ts:L543-561`
- **Spec/Doc files** (`.md`): MUST include section number (§X.X) and mark "僅讀此節". Example: `docs/.../functional-spec.md §5.1 僅讀此節`
- **All paths**: MUST be full relative paths from project root.

**DEPENDENCY INTERFACE RULE:** Story dependency field MUST include concrete interface/method names. Format: `Story-ID（FileName.cs: MethodName() / InterfaceName）`

Write remaining template sections:
- `## DEV AGENT GUARDRAILS`
- Technical requirements
- Architecture compliance
- Library/framework requirements
- File structure requirements
- Testing requirements
- Previous story intelligence (if available)
- Git intelligence summary (if available)
- Latest tech information (if web research completed)
- Project context reference

---

### 9.1. Fill Definition of Done

Compose `## Definition of Done` section content (in-memory, feeds `definition_of_done` DB field):
1. Start with template defaults (compile, test, review checkboxes)
2. Add story-specific items derived from:
   - AC requirements (e.g., "Migration 驗證通過" if DB changes)
   - Required Skills constraints
   - Architecture compliance items from Step 4
3. All items MUST use `- [ ]` checkbox format
4. Minimum 5 items (template defaults + story-specific)

### 9.2. Fill Implementation Approach

Compose `## Implementation Approach` section content (in-memory, feeds `implementation_approach` DB field):
1. Analyze Tasks/Subtasks to group into logical Phases
2. Each Phase MUST have:
   - `### Phase N: {title}` heading
   - `**Tasks:**` — list which Task numbers map to this phase
   - `**Verification:**` — how to confirm this phase is complete
3. Minimum 2 Phases (setup/foundation + core implementation)
4. If story has DB changes: Phase 1 MUST be "Database Migration"
5. Store as `{implementation_approach_text}` for DB sync in Step 7

---

### 9.5. Story Quality Gate (Mandatory — 7 Dimensions)

> **CRITICAL:** 🔒 QUALITY GATE — Story file MUST pass ALL 7 checks (Q6 SPEC Kernel: M/L/XL only) before
> proceeding to section 10 Set Status. Failure = fix before continuing.

**Q1. Background Code Evidence:**
- [ ] Background section contains at least 1 code snippet with `file:line` reference
- [ ] Code snippets are actual code (not paraphrased descriptions)
- If FAIL: Go back to Background, embed `{codebase_snippets}` from Step 3

**Q2. AC Concrete Examples:**
- [ ] Every AC contains at least one concrete example (code snippet, JSON output, DOM value, or command output with expected result)
- [ ] No AC uses vague language: "正確顯示", "合理處理", "適當回應"
- [ ] **Surface-anchored**: AC 必須觀察其意圖所指的**最外層表面**(API response / DOM / CLI stdout / HTTP status),禁以更內層的代理物(DB row / 私有欄位 / 內部狀態)替代
  - ✅ 對:`Then GET /api/v1/mgmt/orders/1 回 HTTP 200 且 body.status === "Paid"`(觀察 API response 最外層表面)
  - ❌ 錯:`Then Orders 表該列 Status 欄 = 2`(以 DB row 這個內部代理替代 API response)
  - **豁免(嚴格限縮)**:僅限**完全無外部可觀察表面**的 Story(如基礎建設卡,改的是 workflow markdown / 內部腳本)以「該意圖所指的最外層可觀察面」為準(可為 grep 命中結果 / CLI exit code),不強制要求 HTTP/DOM。**純後端但有 API 表面的 Story 不適用本豁免** —— 後端 Story 正是本判準的主要標的(必觀察 API response,禁以 DB row 替代)
- If FAIL: Add concrete examples to each failing AC

**Q3. Dev Notes File References with Line Numbers:**
- [ ] All source file references use `FileName.ext:L123-145` format
- [ ] All spec/doc references use `path §X.X` format
- [ ] No bare file names without line numbers (for source files)
- If FAIL: Read each referenced file to get exact line numbers

**Q4. Definition of Done Checkboxes:**
- [ ] `## Definition of Done` section exists with `- [ ]` items
- [ ] Contains at least 5 checkbox items
- [ ] Items are specific to this story (not just generic template items)
- If FAIL: Fill DoD section from template + story-specific items

**Q5. Implementation Approach Phase Breakdown:**
- [ ] `## Implementation Approach` section exists
- [ ] Contains `### Phase N:` structure with at least 2 phases
- [ ] Each Phase maps to specific Tasks
- [ ] Each Phase has a Verification method
- If FAIL: Create Phase breakdown mapping to Tasks

**Q6. SPEC Kernel Success Signal (M/L/XL):**
- [ ] `## SPEC Kernel` section exists with 5 fields (Problem / Capabilities / Constraints / Non-goals / Success signal)
- [ ] Non-goals is non-empty (明確劃定「不做什麼」)
- [ ] Success signal contains a verification command or measurable assertion (NOT descriptive like "正常運作"/"功能完整")
- If FAIL: Fill SPEC Kernel (§0.5), especially Non-goals + measurable Success signal
- **S complexity**: Q6 partial — Problem + Success signal 建議填，Constraints/Non-goals 可省（不阻擋 S 卡）

**Q7. Markdown 渲染格式 (DevConsole react-markdown · 源頭治本):**
- [ ] enrichment 各欄位 list item(`⬜`/`-`/`數字.`)、Given/When/Then、編號項間用 **`\n\n` 段落分隔**（非單 `\n`）
- [ ] **狀態符號(`✅`/`⚠️`/`⬜`/`❌`)放文前**（行首緊接 `## `/`- `/`數字. ` 後），禁文末/句中（對: `## ✅ AC4 ... RECONCILIATION`；錯: `## AC4 ... — ✅ RECONCILIATION`）；例外表格 cell `| ✅ PASS |` 不受限
- [ ] 理由: DevConsole(`StoryDetail.tsx`)用 react-markdown 渲染，單 `\n`=soft break(渲染成空格·項目黏一起)，`\n\n`=段落換行；文前符號讓使用者一眼看到狀態
- If FAIL: 各欄位元素間補 `\n\n`（配套下游 1A upsert-story.js normalize 兜底 + 1B depth-gate D7 §7.7 偵測）
- 對齊 `.claude/rules/create-story-enrichment.md` Q7（2026-06-12 m0-11 enrichment 全部黏一起事故）

**GATE RESULT:**
- M/L/XL: All 7 pass **AND §7.5 測試規格產出已執行**(testing_strategy 含合格具名案例表)→ Proceed to §9.6 Multi-Persona AC Audit
- S: Q1-Q5 + Q7 pass (Q6 partial 可接受;§7.5 依 7.5.0 分級 gate 跳過屬正常)→ Proceed to §9.6
- Any required dimension fail → Fix the failing dimension, then re-check

---

### 9.6. Multi-Persona AC Audit (v2.0 NEW — Path δ 微創 G3)

> **Added 2026-05-10**: 對齊 step-03 review 5-Layer Dispatch 升級範式,create-story 階段 AC 完整性也加多視角審查。對應 ruflo `code-review-swarm` 多角度 review pattern,但用在 **AC drafting 階段**(prevent vs fix)。**不引入 ruflo daemon**,只用 Claude 內建 Task tool / inline reasoning。

**觸發條件**: M/L/XL complexity Story (S 跳過,既有 §9.5 5-dim quality gate 已足)

**5-Persona AC 審視角度**:

#### Persona 1 — 🏗️ Architect Persona

**問**:
- AC 是否符合 SOLID / DRY / 抽象層次?
- AC 是否引入隱性 cross-cutting concerns 沒涵蓋?(logging / auth / error handling / i18n / observability)
- AC 是否與既有 Architecture / ADR 衝突?(對照 step-04 architecture-analysis 結果)
- AC 是否會引入 architectural debt?(violating DDD bounded context / 跨 layer 直接 access)

**Output**: architecture concerns list + suggested AC refinements

#### Persona 2 — 🔒 Security Persona

**問** (對應 step-03 Layer D 12 維度,適用於 AC drafting):
- AC 涵蓋 OWASP Top 10 中相關維度?(若涉用戶輸入 → AC 含 input validation;若涉 auth → AC 含 authorization check)
- AC 是否有資料外洩風險?(回傳含 PII / secrets 應 explicit 標 sanitize)
- AC 是否考慮 race condition / TOCTOU?
- AC 是否涵蓋 rate limit / DoS 防護?(若 public endpoint)
- AC 是否符合 GDPR / 個資法 / 合規 (per IDD-REG-* 既有)?

**Output**: security AC gaps + suggested AC additions (e.g., "+ AC-N: 攻擊者用 XSS payload 提交,系統應 escape 並儲存原始字串")

#### Persona 3 — 📈 Performance Persona

**問** (對應 step-03 Layer E 10 維度,適用於 AC drafting):
- AC 是否含 perf threshold?(latency p95 / throughput / DB query count)
- AC 是否考慮 scale (10x users)?
- AC 是否會引入 N+1 / hot path issue?
- 大量資料情境 AC 是否覆蓋?(pagination / streaming / batch)
- 對應 NFR 是否明確?(預設 PhyCool admin dashboard p95 < 500ms)

**Output**: perf AC gaps + suggested AC additions (e.g., "+ AC-N: 1000 row 列表 query 時間 ≤ 200ms")

#### Persona 4 — 🎨 UX Persona

**問**:
- AC 涵蓋 user feedback (loading / error / success state)?
- AC 涵蓋 accessibility?(aria-label / keyboard / focus / WCAG AA contrast)
- AC 涵蓋 responsive (mobile / tablet / desktop)?
- AC 用語是否 user-facing 友善?(避免 technical jargon)
- AC 涵蓋 error recovery (網路斷 / 操作失敗) flow?

**Output**: UX AC gaps + suggested AC additions (e.g., "+ AC-N: 載入中顯示 skeleton,error 顯示 toast 含 retry 按鈕")

#### Persona 5 — 📊 PM Persona

**問**:
- AC 真符合 user 原始 business intent?(對照 step-02 artifact-analysis)
- AC 是否完整覆蓋 use case (含 happy path + edge + error path)?
- AC 是否可量化驗證?(non-vague language)
- AC 優先級是否合理?(P0/P1/P2 分配)
- AC 是否與 product roadmap 對齊?(對照 PRD)

**Output**: business intent gaps + suggested AC refinements

#### 統合 (Lead Reviewer = create-story Agent)

執行 5 personas 後:
1. 收集各 persona 的 gap list (建議 AC additions)
2. Dedupe + 合併同類建議
3. **Decision**:
   - Critical gap (e.g., security XSS uncovered) → MUST add AC (Story 不可 ready-for-dev 直到補)
   - Important gap → SHOULD add AC (寫入 dev_notes 提醒 dev 階段補強)
   - Minor gap → MAY add AC (標 deferred to future Story)
4. 補新 AC 後 → 重跑 §9.5 5-dim quality gate (Q2 AC examples 重檢)

**Token budget 對抗**:
- 5 personas inline reasoning ~2-5K tokens (不 spawn sub-agent,主視窗推理)
- 或 spawn 5 parallel sub-agents (M/L/XL 複雜 Story,~10K tokens 增量)
- M complexity 預設 inline,L/XL 預設 sub-agent spawn

**FORBIDDEN**:
- ❌ 跳過 §9.6 對 M/L/XL Story 直接 §10 (放棄 multi-persona AC review)
- ❌ Persona reasoning 流於形式 (e.g., "Security: 沒問題" 無具體 OWASP 維度對照)
- ❌ 5 personas 全部 silent pass (≥ 1 persona 應有 finding,即使 minor)
- ❌ 補 AC 後不重跑 §9.5 (新 AC 可能 fail Q2 examples)

**預期效益**:
- AC 完整度 +30%
- Security AC 覆蓋率 +50% (OWASP 12 維度 explicit consider)
- Perf AC 覆蓋率 +50% (10 維度 explicit consider)
- review 階段 finding -20% (prevent at AC stage)
- Story-to-done 整體時間 -10% (early issue prevention)

**S complexity opt-out**: S 級 Story (Bug fix / typo) §9.6 跳過 — overhead 大於 benefit。

---

### 10. Set Status

1. Set story Status to: "ready-for-dev"（寫入 DB `stories.status`，由 `step-07-finalize.md` 的 upsert payload 帶出）
2. Add completion note: "Ultimate context engine analysis completed — comprehensive developer guide created"

> **DB-first (bwu-1):** 本步驟**不產 `.md`**，故**無 H1 標題可同步** —— `/story-status-emoji` skill 對 DB-first Story 屬 **N/A**（該 skill 僅適用於實體存在 `.md` 檔的 legacy Story，見其 SKILL.md description）。
> 僅當本 Story 確有 legacy `.md` 鏡像時才調用 `Skill(skill="story-status-emoji")` Mode A（status: ready-for-dev）。

---

## SUCCESS METRICS

- Story 章節內容組裝完成，ALL template sections filled (no placeholder text) — 交由 `step-07-finalize.md` 寫入 DB，**不產 `.md` 鏡像**
- Story 資訊欄位完整填寫 (Taiwan UTC+8 timestamps)
- Required Skills section written
- DB change detection run and auto-injections applied
- Doc impact detection run
- KB scan run and links injected
- Codebase analysis section written
- Background contains code snippets with file:line (Q1)
- Every AC has concrete example (Q2)
- Dev Notes file refs have line numbers (Q3)
- Definition of Done filled with `[ ]` items (Q4)
- Implementation Approach has Phase breakdown (Q5)
- SPEC Kernel filled with measurable Success signal + Non-goals (Q6, M/L/XL)
- Story Quality Gate (§9.5) passed — all dimensions (5 + Q6 for M/L/XL)
- **§7.5 測試規格產出執行**(M/L/XL:`testing_strategy` 含具名案例表 + 產表不產檔;S:依分級 gate 跳過)
- Debt Registry Pull run
- Status set to "ready-for-dev"
- H1 emoji synced **僅在 legacy `.md` 鏡像存在時適用**（DB-first Story 為 N/A）

## FAILURE MODES

- Leaving placeholder text `{variable}` in final output
- Incomplete Story 資訊欄位
- Skipping DB change detection
- Skipping Doc impact detection
- Skipping KB scan
- Skipping Debt Registry Pull
- **M/L/XL Story 跳過 §7.5 測試規格產出**(`testing_strategy` 遺留無結構化案例表 → Depth Gate D7 structural check 將 WARN)
- **§7.5 違反產表不產檔**(建立 / 修改 / 刪除任何測試原始檔)
- **產生 `docs/implementation-artifacts/stories/**/{story_key}.md` 鏡像檔**（違反 SUPREME `.claude/rules/db-first-no-md-mirror.md`）
- 對 legacy `.md` 鏡像存在的 Story 未同步 H1 emoji
- Background without code snippets (Q1 fail)
- ACs with vague language like "正確顯示" (Q2 fail)
- AC observes an internal proxy (DB row / private field / internal state) instead of the outermost surface the intent references (Q2 Surface-anchored fail)
- File references without line numbers (Q3 fail)
- Missing Definition of Done section (Q4 fail)
- Missing Implementation Approach phases (Q5 fail)
- SPEC Kernel Non-goals empty or Success signal descriptive like "正常運作" (Q6 fail, M/L/XL)
- Skipping §9.5 Quality Gate

---

**NEXT:** Load `step-07-finalize.md`
