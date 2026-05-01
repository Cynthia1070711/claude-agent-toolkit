---
name: dev-story
description: "Execute a story by implementing tasks/subtasks, writing tests, validating, and updating the story file per acceptance criteria"
author: "BMad"
config_source: "{project-root}/_bmad/bmm/config.yaml"
installed_path: "{project-root}/_bmad/bmm/workflows/4-implementation/dev-story"
---

# Dev Story Workflow

**Goal:** Implement a ready-for-dev story end-to-end — tasks, tests, validations, and status updates.

**Your Role:** You are a senior developer executing a story autonomously. Follow the story's tasks exactly, write tests first (TDD), and never skip steps.

---

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for focused execution:

- Each step loads fresh to combat "lost in the middle"
- State persists via variables across all steps
- Sequential progression through implementation phases

---

## INITIALIZATION

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `user_name`, `communication_language`, `user_skill_level`, `document_output_language`
- `output_folder`, `implementation_artifacts`, `story_dir`
- `date` as system-generated current datetime (Taiwan UTC+8)

### Paths

- `installed_path` = `{project-root}/_bmad/bmm/workflows/4-implementation/dev-story`
- `sprint_status` = `{implementation_artifacts}/sprint-status.yaml`
- `project_context` = `**/project-context.md`
- `story_path` = explicit path if provided, else auto-discovered

### Critical Rules

> **CRITICAL:** Execute ALL steps in exact order. Do NOT skip steps.
>
> **CRITICAL:** Do NOT stop because of "milestones", "significant progress", or "session boundaries". Continue in a single execution until the story is COMPLETE (all ACs satisfied, all tasks/subtasks checked) UNLESS a HALT condition is triggered.
>
> **CRITICAL:** Do NOT schedule a "next session" or request review pauses unless a HALT condition applies. Only Step 9 decides completion.
>
> **CRITICAL:** User skill level affects conversation style ONLY, not code updates.
>
> **CRITICAL:** Only modify the story file in these areas: Tasks/Subtasks checkboxes, Dev Agent Record (Debug Log, Completion Notes), File List, Change Log, and Status.

### STATE VARIABLES (persist throughout all steps)

| Variable | Set In | Purpose |
|----------|--------|---------|
| `{precheck_phase}` | Step 0 (Pre-check) | Hardcoded `dev-story` (workflow phase identity) |
| `{precheck_top_rules}` | Step 0 (Pre-check) | Top-3 hot violation rule paths from `query-violations.js --phase dev-story --since-days 30` |
| `{precheck_violation_count}` | Step 0 (Pre-check) | `stats.total_30d_rolling` int — drives 0-violation short-circuit |
| `{db_context_available}` | Step 0 | Pipeline 是否已注入 DB context |
| `{story_key}` | Step 1 | Story 識別碼 |
| `{story_path}` | Step 1 | Story 檔案路徑 |
| `{sprint_status_cache}` | Step 1 | Sprint status 快取（禁止重讀） |
| `{story_required_skills}` | Step 2 | 已載入的 Skills 列表 |
| `{staleness_hits}` | Step 2 | Skill 過時偵測結果 |
| `{incoming_tech_debt}` | Step 2 | 前置技術債 |
| `{kb_relevant_entries}` | Step 2b | KB 已知問題 |
| `{review_continuation}` | Step 3 | 是否為 review 後續 |
| `{current_sprint_status}` | Step 4 | Sprint 追蹤狀態 |
| `{tracking_active_path}` | Step 4 | Tracking 檔案路徑 |

---

## EXECUTION

Load and execute `steps/step-00-violation-precheck.md` to begin the workflow.

**Step chain (first three):** `step-00-violation-precheck.md` (Workflow Entry Gate — force Read top-3 hot dev-story violation rules from last 30d) → `step-00-db-first-query.md` (DB-first context load) → `step-01-load-story.md` (story discovery).
