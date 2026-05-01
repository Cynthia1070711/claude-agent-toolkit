---
name: 'step-00-db-first-query'
description: 'Query Context Memory DB before reading .md files (DB-first principle)'
intentional: '[Intentional: IDD-STR-003] DB-first Story bypass - ADR-IDD-STR-003'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-00-db-first-query.md'
nextStepFile: '{workflow_path}/steps/step-01-target-story.md'
---

# Step 0: DB-First Query

**Goal:** Query Context Memory DB for existing story data before reading any .md files.

---

## STATE VARIABLES (set in this step)

- `{db_story}` — DB Story 物件
- `{db_enriched}` — DB 是否已有豐富資料 (true/false)
- `{memory_context}` — 歷史決策上下文

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🗄️ DB-FIRST PRINCIPLE: Context Memory DB is the SINGLE SOURCE OF TRUTH for story data. Query DB BEFORE reading any .md files. If DB has enriched data (AC, tasks, dev_notes), USE IT as the baseline. .md files are SECONDARY — only use as fallback when DB is empty.

### 0.5 Record Create Phase Start Timestamp (FIRST ACTION)

> **CRITICAL:** 此步驟必須在 Step 0 最開始執行，不可延後到 Step 1。
> 2026-04-13 事故: create-start 埋在 step-01 §4，Agent 分析上下文時跳過，
> 導致 create_started_at = NULL 而 create_completed_at 已寫入。

**Action:** 取得 `{story_key}` 後立即呼叫（若 story_key 尚未確定，Step 1 確定後補呼叫）：

```bash
node scripts/record-phase-timestamp.js {story_key} create-start
```

- Story 不存在於 DB → `[warn] non-fatal`（Step 7 upsert 後 step-07 §4.4 會補上）
- COALESCE 保護：pipeline 已寫值則不覆蓋

---

### 1. Query Story from DB

```
Tool: mcp__pcpt-context__search_stories
Parameters: { story_id: "{story_key}", include_details: true }
```

Store result as `{db_story}` for comparison throughout workflow.

**If `{db_story}` has non-empty acceptance_criteria AND non-empty tasks:**
- DB already has enriched data — use as baseline for verification/supplement mode
- Set `{db_enriched}` = true
- Output: 📊 DB 已有 enriched Story 資料（AC + Tasks），進入驗證/補全模式

**If `{db_story}` has empty acceptance_criteria OR empty tasks:**
- DB has basic data only — proceed with full create-story analysis
- Set `{db_enriched}` = false

### 2. Query Related Context

```
Tool: mcp__pcpt-context__search_context
Parameters: { query: "{story_key}", filters: { include_content: true, limit: 5 } }
```

### 3. Query Related Tech Knowledge

```
Tool: mcp__pcpt-context__search_tech
Parameters: { query: "domain keywords from story", limit: 5 }
```

Store all DB context as `{memory_context}` for enrichment.

---

## SUCCESS METRICS

- `{db_story}` queried (may be empty)
- `{db_enriched}` set (true/false)
- `{memory_context}` populated
- Related tech knowledge retrieved

## FAILURE MODES

- Skipping DB query and going straight to file analysis
- Not setting `{db_enriched}`
- Missing `{memory_context}` query

---

**NEXT:** Load `step-01-target-story.md`
