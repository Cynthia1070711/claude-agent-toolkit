---
name: 'step-01-load-story'
description: 'Find next ready story and load it; parse tasks/subtasks; establish sprint-status cache'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-01-load-story.md'
nextStepFile: '{workflow_path}/steps/step-02-load-context.md'
---

# Step 1: Find and Load Story

**Goal:** Locate the target story, load it completely, and establish state variables.

---

## AVAILABLE STATE

- `{db_context_available}` — from Step 0

---

## STATE VARIABLES (set in this step)

- `{story_key}` — Story 識別碼 (e.g., "bu-02-workflow-xml-to-md")
- `{story_path}` — Story 檔案完整路徑
- `{sprint_status_cache}` — Sprint status 快取（禁止後續步驟重讀）
- `{story_title}` — Story 標題
- `{epic_num}` — Epic 編號

---

## EXECUTION SEQUENCE

> **CRITICAL:** MUST read COMPLETE sprint-status.yaml file from start to end to preserve order.

### 1. Check for Provided Story Path

**If `{story_path}` is provided:**
1. Use `{story_path}` directly
2. Read COMPLETE story file
3. Extract `{story_key}` from filename or metadata
4. Jump to [Task Check](#task-check)

### 2. Sprint-Based Story Discovery

**If `{sprint_status}` file exists:**
1. Load the FULL file: `{sprint_status}`
2. Store loaded content as `{sprint_status_cache}` for use in Steps 4 and 9 — **do NOT re-read the file in subsequent steps**
3. Read ALL lines from beginning to end — do not skip any content
4. Parse the `development_status` section completely to understand story order
5. Find the FIRST story (reading top to bottom) where:
   - Key matches pattern: `number-number-name` or epic-specific pattern
   - NOT an epic key (epic-X) or retrospective
   - Status value equals "ready-for-dev"

### If No ready-for-dev Story Found

**PROMPT:** 📋 No ready-for-dev stories. Choose:
- [1] create-story
- [2] validate-create-story
- [3] specify path
- [4] view sprint-status

- If [1] or [2]: HALT — Run chosen workflow
- If [3] or path provided: Store as `{story_path}`, jump to Task Check
- If [4]: Display sprint status analysis then HALT

### 3. Non-Sprint Story Discovery

**If `{sprint_status}` file does NOT exist:**
1. Search `{story_dir}` for stories directly
2. Find stories with "ready-for-dev" status in files
3. Look for story files matching pattern: `*-*-*.md`
4. Read each candidate story file to check Status section

### 4. Extract Story Information

1. Extract from story key (e.g., "bu-02-workflow-xml-to-md"):
   - `{epic_num}` — first segment if epic-based, or "bu"
   - `{story_title}` — remainder (e.g., "workflow-xml-to-md")
2. Store `{story_key}` for later status updates
3. Find matching story file in `{story_dir}` using story_key pattern
4. Read COMPLETE story file from discovered path

---

## TASK CHECK {#task-check}

After loading the story file:

1. Parse sections: Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Dev Agent Record, File List, Change Log, Status
2. Load comprehensive context from story file's Dev Notes section
3. Extract developer guidance: architecture requirements, previous learnings, technical specifications
4. **Identify first incomplete task** (unchecked `[ ]`) in Tasks/Subtasks

**If no incomplete tasks:** Jump to Step 9 (Completion sequence)

**If story file is inaccessible:** HALT: "Cannot develop story without access to story file"

**If incomplete task or subtask requirements are ambiguous:** ASK user to clarify or HALT

---

## SUCCESS METRICS

- `{story_key}`, `{story_path}`, `{story_title}`, `{epic_num}` all set
- `{sprint_status_cache}` loaded (if sprint file exists)
- Story file completely read and parsed
- First incomplete task identified
- Dev Notes context extracted

## FAILURE MODES

- Re-reading sprint-status.yaml in later steps (must use cache)
- Not parsing story sections completely
- Missing Dev Notes context extraction
- Skipping task identification

---

**NEXT:** Load `step-02-load-context.md`
