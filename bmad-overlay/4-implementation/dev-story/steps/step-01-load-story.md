---
name: 'step-01-load-story'
description: 'Find next ready story and load it; parse tasks/subtasks'
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
- `{story_title}` — Story 標題
- `{epic_num}` — Epic 編號

---

## EXECUTION SEQUENCE

### 1. Check for Provided Story Path

**If `{story_path}` is provided (either an explicit story_key or a DB-injected `[STORY DB CONTEXT]` block already set `{story_key}` in Step 0):**
1. Use `{story_path}` / `{story_key}` directly
2. Extract `{story_key}` from filename or metadata if not already set
3. Jump to [Task Check](#task-check)

### 2. DB-Based Story Discovery (auto-discovery — no explicit target provided)

> **CRITICAL:** 🗄️ DB-FIRST DISCOVERY — Query `stories` table via MCP, never read `sprint-status.yaml` (frozen historical snapshot since 2026-07-28,`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs` — not a valid state source).

1. Query DB for candidates:
   ```
   Tool: mcp__phycool-context__search_stories
   Parameters: { status: "ready-for-dev", limit: 20, fields: "story_id,title,priority,epic_id" }
   ```
2. **If the tool call itself fails (DB unavailable, connection error — not merely an empty result):** HALT — "Context Memory DB unavailable, cannot auto-discover next story. Stop and report to controller per fallback charter — do NOT fall back to reading sprint-status.yaml."
3. **If query returns empty list:** Jump to [No ready-for-dev Story Found](#if-no-ready-for-dev-story-found)
4. Sort candidates by priority (P0 > P1 > P2 > P3); for ties, prefer stories that already have a `track_plan` row (lower `seq` first, query `track_plan` only if multiple P-tier ties need finer ordering); fall back to `story_id` alphabetical
5. Select the first story from the sorted list; set `{story_key}` = its `story_id`

### If No ready-for-dev Story Found

**PROMPT:** 📋 No ready-for-dev stories. Choose:
- [1] create-story
- [2] validate-create-story
- [3] specify path
- [4] view Story board (DevConsole `/stories`)

- If [1] or [2]: HALT — Run chosen workflow
- If [3] or path provided: Store as `{story_path}`, jump to Task Check
- If [4]: Suggest opening DevConsole `/stories` then HALT

### 3. Extract Story Information

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
- Story file completely read and parsed
- First incomplete task identified
- Dev Notes context extracted

## FAILURE MODES

- Falling back to reading sprint-status.yaml when DB query fails (must HALT + report controller instead)
- Not parsing story sections completely
- Missing Dev Notes context extraction
- Skipping task identification

---

**NEXT:** Load `step-02-load-context.md`
