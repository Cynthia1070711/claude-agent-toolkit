---
name: 'step-04-mark-in-progress'
description: 'Ensure tracking file exists; record dev phase start timestamp'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-04-mark-in-progress.md'
nextStepFile: '{workflow_path}/steps/step-05-implement-task.md'
---

# Step 4: Mark In-Progress

**Goal:** Ensure tracking file exists and dev phase start timestamp is recorded. `stories.status` transition to `in-progress` is owned by the pipeline dispatcher (`Update-DbStatus "in-progress"`, invoked before this workflow starts) — this step no longer writes status anywhere (sprint-status.yaml frozen 2026-07-28, `# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs`).

---

## AVAILABLE STATE

- `{story_key}`, `{epic_num}` — from Step 1
- `{review_continuation}` — from Step 3

---

## STATE VARIABLES (set in this step)

- `{tracking_active_path}` — Tracking 檔案路徑

---

## EXECUTION SEQUENCE

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

- `{tracking_active_path}` set and file exists
- Tracking file created or updated
- `stories.started_at` recorded (COALESCE-protected)

## FAILURE MODES

- Not creating tracking file when it doesn't exist
- Missing Taiwan UTC+8 timestamp

---

**NEXT:** Load `step-05-implement-task.md`
