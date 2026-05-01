---
name: 'step-08-validate-complete'
description: 'Validate task completion; handle review follow-ups; KB write-back check; mark task complete'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-08-validate-complete.md'
nextStepFile_more_tasks: '{workflow_path}/steps/step-05-implement-task.md'
nextStepFile_done: '{workflow_path}/steps/step-09-completion.md'
---

# Step 8: Validate and Mark Task Complete

**Goal:** Gate task completion — only mark complete when ALL conditions are met.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}`, `{tracking_active_path}` — from Steps 1/4
- `{review_continuation}`, `{pending_review_items}` — from Step 3

---

## EXECUTION SEQUENCE

> **CRITICAL:** NEVER mark a task complete unless ALL conditions are met — NO LYING OR CHEATING.

### 1. Validation Gates

1. Verify ALL tests for this task/subtask ACTUALLY EXIST and PASS 100%
2. Confirm implementation matches EXACTLY what the task/subtask specifies — no extra features
3. Validate that ALL acceptance criteria related to this task are satisfied
4. Run full test suite to ensure NO regressions introduced

---

### 2. Review Follow-Up Handling

**If task is a review follow-up (has `[AI-Review]` prefix):**
1. Extract review item details (severity, description, related AC/file)
2. Add to resolution tracking list: `{resolved_review_items}`
3. Mark task checkbox `[x]` in "Tasks/Subtasks → Review Follow-ups (AI)" section
4. Find matching action item in "Senior Developer Review (AI) → Action Items" by matching description
5. Mark that action item checkbox `[x]` as resolved
6. Add to Dev Agent Record → Completion Notes: "✅ Resolved review finding [{severity}]: {description}"

---

### 3. Mark Complete (Only if ALL Validation Gates Pass)

**If ALL validation gates pass AND tests ACTUALLY exist and pass:**
1. Mark the task (and subtasks) checkbox with `[x]`
2. Update File List section with ALL new, modified, or deleted files (paths relative to repo root)
3. Add completion notes to Dev Agent Record summarizing what was ACTUALLY implemented and tested
4. Update `{tracking_active_path}` with task completion details

**If ANY validation fails:**
1. DO NOT mark task complete — fix issues first
2. HALT if unable to fix validation failures

---

### 4. Review Resolution Tracking

**If `{review_continuation}` == true AND `{resolved_review_items}` is not empty:**
1. Count total resolved review items in this session
2. Add Change Log entry: "Addressed code review findings — {resolved_count} items resolved (Date: {date})"

---

### 5. KB Write-Back Check (TD-31)

> Trigger: any task that required ≥2 fix attempts OR had build/test failure before success.

**If current task required ≥2 fix attempts OR had build/test failure before green:**

1. Check if KB already has an entry for this type of error:
   a. Extract core error description (2-5 words) from the debugging session
   b. Grep `docs/knowledge-base/troubleshooting/` for matching `error_patterns`
   c. **If EXISTING entry found:**
      - Update: increment occurrences count, update `last_seen` date
      - Append new solution approach to "解決方案" section if different
      - If occurrences now ≥ 3: append upgrade suggestion block
   d. **If NO existing entry:**
      - Determine domain category (frontend/backend/database/devops/workflow)
      - Generate new KB ID: `KB-{domain}-{next_sequential_number}`
      - Create new file from `_template.md` with auto-filled frontmatter:
        - title: core error description
        - keywords: from error message + affected files + tech stack
        - error_patterns: exact error message fragments
        - related_skills: copy from story Required Skills
        - first_seen/last_seen: current date (Taiwan UTC+8)
        - occurrences: 1
      - Fill "症狀", "根因分析", "解決方案" from debugging session
      - Update `docs/knowledge-base/README.md` index table with new entry

Output: 📝 **KB Write-Back:** {kb_action} — {kb_entry_id}: {kb_entry_title}

---

### 6. Continue or Finalize

Save the story file.

**If more incomplete tasks remain:** **NEXT:** Load `step-05-implement-task.md` (next task)

**If no tasks remain:** **NEXT:** Load `step-09-completion.md`

---

## SUCCESS METRICS

- Task marked `[x]` only when ALL validation gates pass
- File List updated with all changed files
- Dev Agent Record completion notes added
- Review follow-up items resolved and cross-marked
- KB write-back triggered when applicable

## FAILURE MODES

- Marking tasks complete without verifying test existence
- Updating File List with incomplete paths
- Skipping review section cross-marking
- Skipping KB write-back check after debugging session

---

**NEXT:** `step-05-implement-task.md` (if more tasks) or `step-09-completion.md` (if all done)
