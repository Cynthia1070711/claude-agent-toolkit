---
name: 'step-01-load-discover'
description: 'Load story, discover changes, load required skills, git diff, tech debt stats'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-01-load-discover.md'
nextStepFile: '{workflow_path}/steps/step-02-review-plan.md'
---

# Step 1: Load Story and Discover Changes

**Goal:** Load story, required skills, git changes, and tech debt stats.

---

## STATE VARIABLES (set in this step)

- `{story_key}` — Story 識別碼
- `{story_required_skills}` — 已載入的 Skills
- `{skill_forbidden_rules}` — Skill 禁止規則列表
- `{diff_output}` — 統一 diff 文字（full git diff 輸出）
- `{tech_debt_count}` — 累積技術債數量
- `{critical_debt_count}` — CRITICAL 技術債數量
- `{has_db_changes}` — 是否含 DB Schema 變更（Migration / Model / Repository）

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — load for severity policy and review dimensions.

### 1. Load Story Content

**If `{db_context_available}` == true (set by `step-00b-db-first-query.md`):**
1. `{story_key}` already set by step-00b — do NOT re-query
2. Use DB-injected sections as primary source: user_story, background, acceptance_criteria, tasks, dev_notes, file_list, required_skills
3. Skip the `.md` file read entirely (DB-first — see `.claude/rules/db-first-no-md-mirror.md`)

**If `{db_context_available}` == false (legacy `.md`-only story, no DB row):**
1. Use provided `{story_path}` or ask user which story to review
2. Read COMPLETE story file
3. Set `{story_key}` = extracted key from filename or metadata (e.g., "1-2-user-authentication.md" → "1-2-user-authentication")
4. Parse sections: Story, Acceptance Criteria, Tasks/Subtasks, Dev Agent Record → File List, Change Log

---

### 1b. Record Review Phase Start Timestamp (idempotent, COALESCE-protected)

> **CRITICAL:** 手動執行 code-review workflow(不透過 pipeline)時補強 `stories.review_started_at` 寫入缺口。
> Pipeline 已有寫入機制(`Update-DbStatus "reviewing"`),但手動執行會完全繞過。
> COALESCE 保護: 若 pipeline 已寫入值則不會被覆蓋。寫入失敗為非致命警告,不阻斷 workflow。

**Action:** 呼叫 helper script 寫入 `review_started_at`(以 `{story_key}` 為參數):

```bash
node scripts/record-phase-timestamp.js {story_key} review-start
```

預期輸出:
- 首次執行: `[ok] review-start: stories.review_started_at = <taiwan_ts> (story_id={story_key})`
- Pipeline 已寫入值時: `[ok] review-start: ... (preserved existing value)`
- Story 不存在: `[warn] Story not found in DB: ... (non-fatal)` — 繼續 workflow

**備註:** 此動作為**幂等**(可重複呼叫),對應 pipeline `story-pipeline-interactive.ps1:247-253` 的寫入邏輯。
Helper script: `scripts/record-phase-timestamp.js`(v1.0.0)

---

### 2. Required Skills Loading

> **CRITICAL:** 🔧 LOAD REQUIRED SKILLS FOR REVIEW — Load tech specs to check violations!

1. Search story file for `## Required Skills` section

**If Required Skills section exists:**
1. Extract all skill names (format: `/skill-name`)
2. Store as `{story_required_skills}` list
3. For EACH skill: invoke Skill tool — pay special attention to FORBIDDEN rules
4. Store skill FORBIDDEN rules as `{skill_forbidden_rules}` for Step 3 review

Output: 📚 **Required Skills Loaded for Review:** [list with FORBIDDEN rule note]

**If Required Skills section does NOT exist:**
- Output: ℹ️ No Required Skills section found — reviewing without skill-specific rules

---

### 3. Discover Actual Changes via Git

Check if git repository detected.

**If git repo exists:**
1. Run `git status --porcelain`, `git diff --name-only`, `git diff --cached --name-only`
2. Compile list of actually changed files
3. Run `git diff` (full diff) and store result as `{diff_output}` — this is the unified diff text consumed by Step 3 triple-layer dispatch

**Cross-reference Story File List vs git reality:**
- Files in git but not in story File List
- Files in story File List but no git changes
- Missing documentation of what was actually changed

---

### 3b. DB Schema Change Detection

Scan `{diff_output}` 和 git changed files，偵測以下 pattern：
- `Migrations/` — EF Core Migration 檔案
- `Models/` 或 `Entities/` — Entity class 變更
- `*Repository*.cs` 或 `**/Data/*.cs` — Repository / DbContext 變更

**If any pattern matched:**
Set `{has_db_changes}` = true

Output: 🗄️ **DB Schema Changes Detected** — Step 3 Layer F 將執行 DB 專項審查：
- Migration Up/Down 對稱性 + 無資料毀損操作
- `ModelSnapshot.cs` 是否與 Migration 同步更新
- PhyCool PK 策略合規（Guid / int / string by context）
- FK 欄位 / 查詢條件欄位 / 排序欄位的 Index 覆蓋

**If no pattern matched:**
Set `{has_db_changes}` = false

---

### 4. Load Input Patterns (discover_inputs)

**PROTOCOL:** discover_inputs

Load `{project_context}` for coding standards (if exists).

---

### 5. Tech Debt Statistics (DB-first via MCP)

> registry.yaml 已廢棄（dla-04 遷移至 DB）。

1. 呼叫 `search_debt({status: "open", include_stats: true})`
2. 從回傳統計取得 `{tech_debt_count}`（open 總數）與 `{critical_debt_count}`（severity=critical 數）

**If CRITICAL debt count > 0:**
- Output: 🚨 **CRITICAL 技術債**: `{critical_debt_count}` 個 CRITICAL pending entries!

**If tech_debt_count >= 15:**
- Output: ⚠️ **技術債警告**: 累積 `{tech_debt_count}` 個待處理項目 (閾值: 15)！建議先處理技術債。

---

## SUCCESS METRICS

- Story file loaded and all sections parsed
- All required skills loaded with FORBIDDEN rules captured
- `{skill_forbidden_rules}` set for Step 3
- Git changes discovered and cross-referenced with story File List
- `{tech_debt_count}`, `{critical_debt_count}` set (via `search_debt`)

## FAILURE MODES

- Not reading FORBIDDEN rules from each skill's SKILL.md
- Skipping git cross-reference with story File List
- Not querying `search_debt` for tech debt stats

---

**NEXT:** Load `step-02-review-plan.md`
