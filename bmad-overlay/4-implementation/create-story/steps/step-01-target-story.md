---
name: 'step-01-target-story'
description: 'Determine target story from user input or DB-based auto-discovery'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-01-target-story.md'
nextStepFile: '{workflow_path}/steps/step-02-artifact-analysis.md'
---

# Step 1: Determine Target Story

**Goal:** Identify which story to create, either from user input or DB-based auto-discovery.

---

## AVAILABLE STATE

- `{db_story}`, `{db_enriched}`, `{memory_context}` — from Step 0

---

## STATE VARIABLES (set in this step)

- `{story_key}` — Story 識別碼 (e.g., "1-2-user-authentication")
- `{epic_num}` — Epic 編號
- `{story_num}` — Story 番号
- `{story_title}` — Story タイトル

---

## EXECUTION SEQUENCE

### 1. Check User-Provided Input

**If `{story_path}` provided OR user provided epic and story number (e.g., "2-4" or "1.6" or "epic 1 story 5"):**
1. Parse user-provided story path: extract `{epic_num}`, `{story_num}`, `{story_title}` from format like "1-2-user-auth"
2. Set `{epic_num}`, `{story_num}`, `{story_key}` from user input
3. Jump to Step 2a (artifact analysis)

### 2. DB-Based Auto-Discovery

**If no user input provided (auto-discover):**

> **CRITICAL:** 🗄️ DB-FIRST DISCOVERY — Query `stories` table via MCP, never read `sprint-status.yaml` (frozen historical snapshot since 2026-07-28,`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs` — not a valid state source).

1. Query DB for candidates:
   ```
   Tool: mcp__phycool-context__search_stories
   Parameters: { status: "backlog", limit: 20, fields: "story_id,title,priority,epic_id" }
   ```
2. **If the tool call itself fails (DB unavailable, connection error — not merely an empty result):** HALT — "Context Memory DB unavailable, cannot auto-discover next story. Stop and report to controller per fallback charter — do NOT fall back to reading sprint-status.yaml."
3. **If query returns empty list:**
   - Output: 📋 No backlog stories found in `stories` table. Options: run sprint-planning, correct-course, or check DevConsole `/stories` if sprint is complete.
   - HALT
4. Sort candidates by priority (P0 > P1 > P2 > P3); for ties, prefer stories with an existing `track_plan` row (lower `seq` first); fall back to `story_id` alphabetical
5. Select the first story from the sorted list

6. Extract from found `story_id`:
   - If it follows the legacy `number-number-name` pattern (e.g., "1-2-user-auth"): `{epic_num}` = first number before dash, `{story_num}` = second number after first dash, `{story_title}` = remainder after second dash, `{story_id}` = `{epic_num}.{story_num}`
   - Otherwise (PhyCool kebab-case IDs, e.g., "tdb-2-sprint-status-freeze-refs"): `{epic_num}` = prefix before first dash (e.g., "tdb"), `{story_title}` = remainder
7. Store `{story_key}` = selected `story_id` for later use

---

### 3. Epic Progress (DB-derived — no separate write)

> Epic-level progress is derived by aggregation over `stories.epic_id`(e.g., `SELECT status, COUNT(*) FROM stories WHERE epic_id=? GROUP BY status`),surfaced via DevConsole `/roadmap`。There is no separate mutable "epic status" field to update — sprint-status.yaml's `epic-X: in-progress` marker retired along with the rest of the file(2026-07-28 tdb-2 凍結)。

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
- Target story identified

## FAILURE MODES

- Not setting all story key components
- Falling back to reading sprint-status.yaml when DB query fails (must HALT + report controller instead)

---

**NEXT:** Load `step-02-artifact-analysis.md`
