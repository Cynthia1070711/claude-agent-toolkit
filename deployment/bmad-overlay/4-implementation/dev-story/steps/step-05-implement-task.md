---
name: 'step-05-implement-task'
description: 'Implement task following red-green-refactor TDD cycle; KB error lookup; tech debt consumption'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-05-implement-task.md'
nextStepFile: '{workflow_path}/steps/step-05b-apply-migrations.md'
---

# Step 5: Implement Task (TDD)

**Goal:** Implement the current task/subtask following red-green-refactor cycle.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}` — from Step 1
- `{story_required_skills}`, `{incoming_tech_debt}`, `{staleness_hits}` — from Step 2
- `{kb_relevant_entries}` — from Step 2b
- `{tracking_active_path}` — from Step 4

---

## EXECUTION SEQUENCE

> **CRITICAL:** FOLLOW THE STORY FILE TASKS/SUBTASKS SEQUENCE EXACTLY AS WRITTEN — NO DEVIATION.

### 1. Review Current Task

Review the current task/subtask from the story file — this is the authoritative implementation guide.

### 2. Tech Debt Consumption

**If `{incoming_tech_debt}` is not empty:**
- For EACH item in `{incoming_tech_debt}.items`:
  - Check if `item.problem_location` or `item.related_modules` overlap with the current task's target files
  - If overlap found → incorporate `item.fix_guidance` into implementation plan

### 3. Plan Implementation

Plan implementation following red-green-refactor cycle.

---

### 4. RED Phase — Write Failing Tests First

1. Write FAILING tests first for the task/subtask functionality
2. Confirm tests fail before implementation — this validates test correctness

---

### 5. GREEN Phase — Minimal Implementation

1. Implement MINIMAL code to make tests pass
2. Run tests to confirm they now pass
3. Handle error conditions and edge cases as specified in task/subtask

---

### 6. KB Error Lookup (on Build/Test Failure)

> **CRITICAL:** TD-31 — Consult Knowledge Base on build/test failure BEFORE attempting fix.

**If Build or Test fails:**
1. BEFORE attempting to fix, consult Knowledge Base:
   a. Extract key fragment from error message (error code, class name, exception type, 2-4 words)
   b. Set `{kb_troubleshooting_path}` = `{project-root}/docs/knowledge-base/troubleshooting`
   c. If directory exists: use Grep to search for error fragment in `{kb_troubleshooting_path}/**/*.md` (search `error_patterns` fields)
   d. If KB entry found → read full entry, prioritize the "解決方案" section approach
   e. If not found → proceed with normal debugging
   f. After successful fix → trigger KB write-back check (see Step 8)

---

### 7. REFACTOR Phase

1. Improve code structure while keeping tests green
2. Ensure code follows architecture patterns and coding standards from Dev Notes

### 8. Document Technical Approach

Document technical approach and decisions in Dev Agent Record → Implementation Plan.

---

## HALT CONDITIONS

- **Additional dependencies required beyond story specifications:** HALT — "Additional dependencies need user approval"
- **3 consecutive implementation failures:** HALT and request guidance
- **Required configuration is missing:** HALT — "Cannot proceed without necessary configuration files"

---

## CRITICAL CONSTRAINTS

> **CRITICAL:** NEVER implement anything not mapped to a specific task/subtask in the story file.
>
> **CRITICAL:** NEVER proceed to next task until current task/subtask is complete AND tests pass.
>
> **CRITICAL:** Execute continuously without pausing until all tasks/subtasks are complete or explicit HALT condition.
>
> **CRITICAL:** Do NOT propose to pause for review until Step 9 completion gates are satisfied.

---

## SUCCESS METRICS

- Failing tests written BEFORE implementation (RED phase)
- Tests pass after minimal implementation (GREEN phase)
- Code refactored maintaining green tests (REFACTOR phase)
- KB consulted on any build/test failure
- Implementation plan documented in Dev Agent Record

## FAILURE MODES

- Writing tests after implementation (skipping RED phase)
- Implementing more than task requires (over-engineering)
- Not consulting KB on build failure before attempting fix
- Pausing mid-task for non-HALT reasons
- Adding features not in story tasks

---

**NEXT:** Load `step-05b-apply-migrations.md` (if new migrations created), otherwise proceed to `step-06-author-tests.md`
