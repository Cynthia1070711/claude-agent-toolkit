---
name: 'step-06-create-story-file'
description: 'Create comprehensive story file with Skills, DB change detection, Doc impact, KB scan, Debt Registry Pull'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-06-create-story-file.md'
nextStepFile: '{workflow_path}/steps/step-06.5-depth-gate.md'
---

# Step 6: Create Comprehensive Story File

**Goal:** Create the ultimate developer guide story file with all pcpt-specific enrichments.

---

## AVAILABLE STATE

- `{story_key}`, `{epic_num}`, `{sprint_status_cache}` — from Step 1
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

### 1. Initialize Story File

1. Set `{epic_num}` = extracted epic_num
2. Initialize from template.md: `{implementation_artifacts}/stories/epic-{epic_num}/{story_key}.md`

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

**TEMPLATE OUTPUT:** Write story header → `{implementation_artifacts}/stories/epic-{epic_num}/{story_key}.md`

---

### 3. Skills Analysis

> **CRITICAL:** 🔧 REQUIRED SKILLS ANALYSIS — Reference Skills catalog!

1. Load Skills catalog from: `{project-root}/.claude/skills/skills_list.md`
2. Match story content keywords against trigger keywords in the loaded Skills catalog
   - **Do NOT hardcode skill mappings** — skills_list.md is the single source of truth
3. For each matched Skill, note WHY it's needed based on story content
4. Store matched Skills as `{required_skills}` list

Write `## Required Skills` section to story file:
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

**If `{has_db_changes}` == true AND `/pcpt-sqlserver` NOT in `{required_skills}`:**
- Auto-add `/pcpt-sqlserver` to `{required_skills}` with reason "Story 涉及資料庫 Schema 變更"
- Append to Required Skills section in story file
- Output: 🗄️ 偵測到資料庫變更 — 自動加入 /pcpt-sqlserver Skill

**If `{has_db_changes}` == true:**
1. Write into Dev Notes section:
   ```markdown
   ### ⚠️ 資料庫變更注意事項
   本 Story 涉及資料庫 Schema 變更，dev-story 執行時需注意：
   1. 建立 Migration 後，執行 `dotnet ef database update` 套用至本機 DB
   2. 完成前驗證：`dotnet ef migrations has-pending-model-changes` 返回 "No changes"
   3. 參考 `/pcpt-sqlserver` Skill 的 Migration 規範
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
| #7 (Error Codes) | ErrorCode, error_code, 錯誤碼, PCPTException | `docs/.../error-codes.md` |
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

Write `## 程式碼現況分析` section to story file with:
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

Write `## Definition of Done` section to story file:
1. Start with template defaults (compile, test, review checkboxes)
2. Add story-specific items derived from:
   - AC requirements (e.g., "Migration 驗證通過" if DB changes)
   - Required Skills constraints
   - Architecture compliance items from Step 4
3. All items MUST use `- [ ]` checkbox format
4. Minimum 5 items (template defaults + story-specific)

### 9.2. Fill Implementation Approach

Write `## Implementation Approach` section to story file:
1. Analyze Tasks/Subtasks to group into logical Phases
2. Each Phase MUST have:
   - `### Phase N: {title}` heading
   - `**Tasks:**` — list which Task numbers map to this phase
   - `**Verification:**` — how to confirm this phase is complete
3. Minimum 2 Phases (setup/foundation + core implementation)
4. If story has DB changes: Phase 1 MUST be "Database Migration"
5. Store as `{implementation_approach_text}` for DB sync in Step 7

---

### 9.5. Story Quality Gate (Mandatory — 5 Dimensions)

> **CRITICAL:** 🔒 QUALITY GATE — Story file MUST pass ALL 5 checks before
> proceeding to section 10 Set Status. Failure = fix before continuing.

**Q1. Background Code Evidence:**
- [ ] Background section contains at least 1 code snippet with `file:line` reference
- [ ] Code snippets are actual code (not paraphrased descriptions)
- If FAIL: Go back to Background, embed `{codebase_snippets}` from Step 3

**Q2. AC Concrete Examples:**
- [ ] Every AC contains at least one concrete example (code snippet, JSON output, DOM value, or command output with expected result)
- [ ] No AC uses vague language: "正確顯示", "合理處理", "適當回應"
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

**GATE RESULT:**
- All 5 pass → Proceed to section 10
- Any fail → Fix the failing dimension, then re-check

---

### 10. Set Status and H1 Emoji

1. Set story Status to: "ready-for-dev"
2. Add completion note: "Ultimate context engine analysis completed — comprehensive developer guide created"

> **CRITICAL:** Invoke `/story-status-emoji` skill Mode A on this story file (status: ready-for-dev)

---

## SUCCESS METRICS

- Story file created with ALL template sections filled (no placeholder text)
- Story 資訊 table completely filled (Taiwan UTC+8 timestamps)
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
- Story Quality Gate (§9.5) passed — all 5 dimensions
- Debt Registry Pull run
- Status set to "ready-for-dev"
- H1 emoji synced

## FAILURE MODES

- Leaving placeholder text `{variable}` in final output
- Incomplete Story 資訊 table
- Skipping DB change detection
- Skipping Doc impact detection
- Skipping KB scan
- Skipping Debt Registry Pull
- Not syncing H1 emoji
- Background without code snippets (Q1 fail)
- ACs with vague language like "正確顯示" (Q2 fail)
- File references without line numbers (Q3 fail)
- Missing Definition of Done section (Q4 fail)
- Missing Implementation Approach phases (Q5 fail)
- Skipping §9.5 Quality Gate

---

**NEXT:** Load `step-07-finalize.md`
