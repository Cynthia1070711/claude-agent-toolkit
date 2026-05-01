---
name: 'step-00-db-first-query'
description: 'Query Context Memory DB before reading .md files (DB-first principle)'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-00-db-first-query.md'
nextStepFile: '{workflow_path}/steps/step-01-load-story.md'
---

# Step 0: DB-First Query

**Goal:** Query Context Memory DB for story context before reading .md files.

---

## STATE VARIABLES (set in this step)

- `{db_context_available}` — Pipeline 是否已注入 DB context (true/false)

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🗄️ DB-FIRST PRINCIPLE: Context Memory DB is the SINGLE SOURCE OF TRUTH. Query DB BEFORE reading .md files. If system prompt already contains DB-injected context, use it directly.

### 1. Check for Pipeline-Injected Context

Check if system prompt already contains `[MEMORY DB STORY CONTEXT]` block (pipeline mode).

**If system prompt has DB-injected story context:**
- Use injected context as primary source — skip .md file search in Step 1
- Set `{db_context_available}` = true

**If system prompt does NOT have DB-injected context (manual mode):**
- Determine `{story_key}` from workflow arguments FIRST (e.g., "dla-09-skill-idd-debt-cross-reference-scanner")
  - ⚠️ CRITICAL: Use the FULL story_id — NEVER abbreviate (e.g., "dla-09" will NOT match "dla-09-skill-idd-debt-cross-reference-scanner")
  - If argument is abbreviated, expand it by globbing: `docs/implementation-artifacts/stories/**/*{arg}*.md`
- Query story from DB via MCP tool:
  ```
  Tool: mcp__pcpt-context__search_stories
  Parameters: { story_id: "{full_story_key}", include_details: true }
  ```
- If returns empty [] → HARD BLOCK: "Story {full_story_key} not found in DB. Run upsert-story.js first, then retry."
  - Do NOT silently fallback to reading .md file
- If DB has enriched data (AC, tasks, dev_notes non-empty) → use as primary source
- Set `{db_context_available}` = true if DB has data, false otherwise

### 2. Query Related Decisions and Patterns

```
Tool: mcp__pcpt-context__search_context
Parameters: { query: "{story_key}", filters: { include_content: true, limit: 3 } }
```

### 3. Query Tech Knowledge for Domain

```
Tool: mcp__pcpt-context__search_tech
Parameters: { query: "domain keywords", limit: 3 }
```

---

## SUCCESS METRICS

- `{db_context_available}` set (true/false)
- DB context or .md fallback identified
- Related decisions and tech knowledge queried

## FAILURE MODES

- Skipping DB query and going straight to .md file search
- Not setting `{db_context_available}`
- Missing related context query

---

**NEXT:** Load `step-01-load-story.md`
