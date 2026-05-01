---
name: 'step-01-target-story'
description: 'Determine target story from user input or sprint-status auto-discovery; update epic status'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-01-target-story.md'
nextStepFile: '{workflow_path}/steps/step-02-artifact-analysis.md'
---

# Step 1: Determine Target Story

**Goal:** Identify which story to create, either from user input or sprint-status auto-discovery.

---

## AVAILABLE STATE

- `{db_story}`, `{db_enriched}`, `{memory_context}` — from Step 0

---

## STATE VARIABLES (set in this step)

- `{story_key}` — Story 識別碼 (e.g., "1-2-user-authentication")
- `{epic_num}` — Epic 編號
- `{story_num}` — Story 番号
- `{story_title}` — Story タイトル
- `{sprint_status_cache}` — Sprint status 快取（禁止後續步驟重讀）

---

## EXECUTION SEQUENCE

### 1. Check User-Provided Input

**If `{story_path}` provided OR user provided epic and story number (e.g., "2-4" or "1.6" or "epic 1 story 5"):**
1. Parse user-provided story path: extract `{epic_num}`, `{story_num}`, `{story_title}` from format like "1-2-user-auth"
2. Set `{epic_num}`, `{story_num}`, `{story_key}` from user input
3. Jump to Step 2a (artifact analysis)

### 2. Sprint Status Auto-Discovery

**If `{sprint_status}` file does NOT exist:**

**PROMPT:** 🚫 No sprint status file. Options:
- [1] Run sprint-planning (recommended)
- Provide epic-story number (e.g. "1-2-user-auth")
- Provide story docs path
- [q] quit

- If user chooses 'q': HALT
- If user chooses '1': Output "Run sprint-planning first." then HALT
- If user provides epic-story number: Parse and set `{epic_num}`, `{story_num}`, `{story_key}`, jump to Step 2
- If user provides docs path: Use user-provided path, jump to Step 2

---

**If no user input provided (auto-discover):**

> **CRITICAL:** MUST read COMPLETE `{sprint_status}` file from start to end to preserve order.

1. Load the FULL file: `{sprint_status}`
2. Store loaded content as `{sprint_status_cache}` for later use in Step 7 — **do NOT re-read the file in subsequent steps**
3. Read ALL lines from beginning to end — do not skip any content
4. Parse the `development_status` section completely

5. Find the FIRST story (reading top to bottom) where:
   - Key matches pattern: `number-number-name` (e.g., "1-2-user-auth")
   - NOT an epic key (epic-X) or retrospective
   - Status value equals "backlog"

**If no backlog story found:**
- Output: 📋 No backlog stories in sprint-status.yaml. Options: run sprint-planning, correct-course, or check if sprint is complete.
- HALT

6. Extract from found story key:
   - `{epic_num}`: first number before dash
   - `{story_num}`: second number after first dash
   - `{story_title}`: remainder after second dash
7. Set `{story_id}` = `{epic_num}.{story_num}`
8. Store `{story_key}` for later use

---

### 3. Update Epic Status (First Story in Epic)

1. Check if this is the first story in epic `{epic_num}` by looking for `{epic_num}-1-*` pattern

**If this is first story in epic `{epic_num}`:**
- Use `{sprint_status_cache}` (already loaded) to check epic-`{epic_num}` status — **do NOT re-read file**
- If epic status is "backlog" → update to "in-progress"
- If epic status is "contexted" (legacy) → update to "in-progress" (backward compatibility)
- If epic status is "in-progress" → no change needed
- If epic status is "done": HALT — "Epic {epic_num} is done. Change to 'in-progress' or create a new epic."
- If epic status is invalid: HALT — "Invalid epic status '{epic_status}'. Fix sprint-status.yaml or run sprint-planning."
- Output: 📊 Epic `{epic_num}` status updated to in-progress

---

### 4. Record Create Phase Start Timestamp (idempotent, COALESCE-protected)

> **CRITICAL:** 手動執行 create-story workflow(不透過 pipeline)時補強 `stories.create_started_at` 寫入缺口。
> Pipeline 已有寫入機制(`Update-DbStatus "creating"`),但手動執行會完全繞過。
> COALESCE 保護: 若 pipeline 已寫入值則不會被覆蓋。寫入失敗為非致命警告,不阻斷 workflow。

**Action:** 呼叫 helper script 寫入 `create_started_at`(以 `{story_key}` 為參數):

```bash
node scripts/record-phase-timestamp.js {story_key} create-start
```

預期輸出:
- 首次執行: `[ok] create-start: stories.create_started_at = <taiwan_ts> (story_id={story_key})`
- Pipeline 已寫入值時: `[ok] create-start: ... (preserved existing value)`
- Story 不存在於 DB(全新 Story): `[warn] Story not found in DB: ... (non-fatal)` — 繼續 workflow
  此警告在 create-story 首次執行時屬**預期行為**,因 Story 尚未寫入 DB。
  Story 真正建立後(Step 7)再次呼叫 review-start 的相同機制會補上 timestamp,
  <!-- [Intentional: IDD-STR-003] upsert-story.js 為 DB-first Story 流程核心 -->
  或由 step-07 的 upsert-story.js 流程自動填入 create_completed_at。

**備註:** 此動作為**幂等**(可重複呼叫),對應 pipeline `story-pipeline-interactive.ps1:247-253` 的寫入邏輯。
Helper script: `scripts/record-phase-timestamp.js`(v1.0.0)

---

## SUCCESS METRICS

- `{story_key}`, `{epic_num}`, `{story_num}`, `{story_title}` all set
- `{sprint_status_cache}` loaded (if auto-discovery)
- Epic status updated if first story
- Target story identified

## FAILURE MODES

- Not setting all story key components
- Re-reading sprint-status.yaml in later steps
- Not updating epic status when first story
- Skipping backward compatibility for "contexted" status

---

**NEXT:** Load `step-02-artifact-analysis.md`
