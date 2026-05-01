---
name: 'step-04-mark-in-progress'
description: 'Mark story in-progress in sprint-status; create or update tracking file'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-04-mark-in-progress.md'
nextStepFile: '{workflow_path}/steps/step-05-implement-task.md'
---

# Step 4: Mark In-Progress

**Goal:** Update sprint-status to "in-progress" and ensure tracking file exists.

---

## AVAILABLE STATE

- `{story_key}`, `{sprint_status_cache}`, `{epic_num}` — from Step 1
- `{review_continuation}` — from Step 3

---

## STATE VARIABLES (set in this step)

- `{current_sprint_status}` — Sprint 追蹤狀態
- `{tracking_active_path}` — Tracking 檔案路徑

---

## EXECUTION SEQUENCE

### 1. Update Sprint Status

**If `{sprint_status}` file exists:**

1. Use `{sprint_status_cache}` from Step 1 — **do NOT re-read the file**
2. Read all development_status entries to find `{story_key}`
3. Get current status value for `development_status[{story_key}]`

**If current status == "ready-for-dev" OR `{review_continuation}` == true:**
- Update the story in the sprint status to = "in-progress"
- Output: 🚀 Starting work on story `{story_key}` — Status updated: ready-for-dev → in-progress

**If current status == "in-progress":**
- Output: ⏯️ Resuming work on `{story_key}` — Story is already marked in-progress

**If current status is neither ready-for-dev nor in-progress:**
- Output: ⚠️ Unexpected story status: `{current_status}` — Expected ready-for-dev or in-progress. Continuing anyway...

Store `{current_sprint_status}` for later use.

**If `{sprint_status}` file does NOT exist:**
- Output: ℹ️ No sprint status file exists — story progress will be tracked in story file only
- Set `{current_sprint_status}` = "no-sprint-tracking"

---

### 1b. Record Dev Phase Start Timestamp (idempotent, COALESCE-protected)

> **CRITICAL:** 手動執行 dev-story workflow(不透過 pipeline)時補強 `stories.started_at` 寫入缺口。
> Pipeline 已有寫入機制(`Update-DbStatus "in-progress"`),但手動執行會完全繞過。
> COALESCE 保護: 若 pipeline 已寫入值則不會被覆蓋。寫入失敗為非致命警告,不阻斷 workflow。

**Action:** 呼叫 helper script 寫入 `started_at`(以 `{story_key}` 為參數):

```bash
node scripts/record-phase-timestamp.js {story_key} dev-start
```

預期輸出:
- 首次執行: `[ok] dev-start: stories.started_at = <taiwan_ts> (story_id={story_key})`
- Pipeline 已寫入值時: `[ok] dev-start: ... (preserved existing value)`
- Story 不存在: `[warn] Story not found in DB: ... (non-fatal)` — 繼續 workflow

**備註:** 此動作為**幂等**(可重複呼叫),對應 pipeline `story-pipeline-interactive.ps1:247-253` 的寫入邏輯。
Helper script: `scripts/record-phase-timestamp.js`(v1.0.0)

---

### 2. Ensure Tracking File Exists

1. Set `{epic_num}` = extracted epic number from `{story_key}`
2. Set `{tracking_active_path}` = `{output_folder}/tracking/active/{story_key}.track.md`

**If `{tracking_active_path}` does NOT exist:**

> **CRITICAL:** Tracking file missing — must create!

Create tracking file from template:
- Path: `{tracking_active_path}`
- Story ID: `{story_key}`
- Story 標題: `{story_title}`
- Epic: Epic `{epic_num}`
- 狀態: 🔄 In Progress
- 開始時間: `{date}` (system time Taiwan UTC+8)
- DEV Agent: `{user_name}` (AI-Assisted)
- 執行日誌: dev-story 工作流開始

Also update `{output_folder}/tracking/active/README.md` if exists.

Output: 📝 Tracking file created: `active/{story_key}.track.md`

**If `{tracking_active_path}` exists:**
- Update tracking file status to 🔄 In Progress if not already

---

## SUCCESS METRICS

- `{current_sprint_status}` set
- Sprint status updated to "in-progress"
- `{tracking_active_path}` set and file exists
- Tracking file created or updated

## FAILURE MODES

- Re-reading sprint-status.yaml instead of using cache
- Not creating tracking file when it doesn't exist
- Missing Taiwan UTC+8 timestamp

---

**NEXT:** Load `step-05-implement-task.md`
