---
name: 'step-03-review-continuation'
description: 'Detect review continuation and extract review context from story file'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-03-review-continuation.md'
nextStepFile: '{workflow_path}/steps/step-04-mark-in-progress.md'
---

# Step 3: Review Continuation Detection

**Goal:** Determine if this is a fresh start or continuation after code review.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}` — from Step 1
- `{story_required_skills}`, `{incoming_tech_debt}` — from Step 2

---

## STATE VARIABLES (set in this step)

- `{review_continuation}` — true/false
- `{pending_review_items}` — list of unchecked review follow-up tasks

---

## EXECUTION SEQUENCE

> **CRITICAL:** Determine if this is a fresh start or continuation after code review.

### 1. Check Story File for Review Sections

1. Check if "Senior Developer Review (AI)" section exists in the story file
2. Check if "Review Follow-ups (AI)" subsection exists under Tasks/Subtasks

---

### If Review Section Exists

1. Set `{review_continuation}` = true
2. Extract from "Senior Developer Review (AI)" section:
   - Review outcome (Approve/Changes Requested/Blocked)
   - Review date
   - Total action items with checkboxes (count checked vs unchecked)
   - Severity breakdown (High/Med/Low counts)
3. Count unchecked `[ ]` review follow-up tasks in "Review Follow-ups (AI)" subsection
4. Store list of unchecked review items as `{pending_review_items}`

**Output:**
```
⏯️ Resuming Story After Code Review ({review_date})

Review Outcome: {review_outcome}
Action Items: {unchecked_review_count} remaining to address
Priorities: {high_count} High, {med_count} Medium, {low_count} Low

Strategy: Will prioritize review follow-up tasks (marked [AI-Review]) before continuing with regular tasks.
```

---

### If Review Section Does NOT Exist

1. Set `{review_continuation}` = false
2. Set `{pending_review_items}` = empty

**Output:**
```
🚀 Starting Fresh Implementation

Story: {story_key}
Story Status: {current_status}
First incomplete task: {first_task_description}
```

---

## SUCCESS METRICS

- `{review_continuation}` set (true/false)
- `{pending_review_items}` set (empty or with items)
- Review context extracted if continuation

## FAILURE MODES

- Not checking for review sections in story file
- Skipping extraction of review outcome and priority breakdown
- Not identifying pending review follow-up tasks

---

**NEXT:** Load `step-04-mark-in-progress.md`
