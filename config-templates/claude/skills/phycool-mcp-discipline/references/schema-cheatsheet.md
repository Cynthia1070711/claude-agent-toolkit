# Schema Cheat-Sheet (30+ tables)

> phycool-mcp-discipline §2 cheat-sheet 詳細展開。對齊 `.context-db/scripts/init-db.js` 的 CREATE TABLE 結構。

---

## Core Tables (Primary)

### `stories` (DB-first Story SSoT)

| Column | Type | Nullable | Notes |
|:-------|:-----|:--------:|:------|
| `story_id` | TEXT | NOT NULL | PK |
| `title` | TEXT | NULL | |
| `epic_id` | TEXT | NULL | linked Epic |
| `status` | TEXT | NULL | `backlog` / `creating` / `ready-for-dev` / `in-progress` / `review` / `reviewing` / `done` |
| `priority` | TEXT | NULL | P0/P1/P2/P3 |
| `complexity` | TEXT | NULL | XS/S/M/L/XL |
| `task_track` | TEXT | DEFAULT 'main' | `main` (PhyCool SaaS) / `side` (toolkit/env) |
| `acceptance_criteria` | TEXT | NULL | ATDD format |
| `tasks` | TEXT | NULL | markdown checkbox list |
| `dev_notes` | TEXT | NULL | |
| `required_skills` | TEXT | NULL | comma-separated phycool-* skills |
| `file_list` | TEXT | NULL | newline-separated file paths |
| `implementation_approach` | TEXT | NULL | |
| `testing_strategy` | TEXT | NULL | |
| `cr_score` / `cr_issues_total/fixed/deferred` | INTEGER | NULL | CR result |
| `cr_summary` | TEXT | NULL | |
| `dependencies` | TEXT | NULL | dep Story IDs |
| `created_at` / `updated_at` / `started_at` / `completed_at` | TEXT | NULL | UTC+8 ISO 8601 |

**Hot Row** (T5.7 conflict): 跨 worker 同 story_id upsert = HARD_BLOCK

---

### `intentional_decisions` (IDD)

| Column | Type | Nullable |
|:-------|:-----|:--------:|
| `idd_id` | TEXT | NOT NULL (PK) |
| `idd_type` | TEXT | NOT NULL (`IDD-COM/STR/REG/USR`) |
| `sub_type` | TEXT | NOT NULL |
| `story_id` | TEXT | NOT NULL |
| `decision` / `rationale` | TEXT | NOT NULL |
| `forbidden_changes` | TEXT | NULL (JSON array) |
| `code_locations` | TEXT | NULL (JSON array `{file, line, snippet}`) |
| `criticality` | TEXT | NULL |
| `related_skills` / `platform_modules` | TEXT | NULL |

**Hot Row**: 同 idd_id = HARD_BLOCK

---

### `tech_debt_items` (Tech debt v2.0)

| Column | Type | Nullable |
|:-------|:-----|:--------:|
| `td_id` | TEXT | NOT NULL (PK,`TD-NNN` format) |
| `story_id` / `target_story` | TEXT | NULL |
| `severity` | TEXT | (`critical/high/medium/low`) |
| `category` | TEXT | (6 categories) |
| `priority_score` | INTEGER | NULL |
| `status` | TEXT | (`open/deferred/wont_fix/fixed/accepted`) |
| `resolved_by` / `resolved_in_story` | TEXT | NULL |

**Hot Row**: 同 td_id = HARD_BLOCK

---

### `review_findings` / `review_reports` (CR)

| Column | Notes |
|:-------|:------|
| `story_id` | linked Story |
| `severity` / `category` | enum |
| `finding_text` / `evidence_file_line` | content |
| `fix_status` | `fixed/deferred/accepted/wont_fix` |
| `cr_score` | review_reports 主表 |

---

## Memory Tables

### `context_entries` (general memory)

| Column | Notes |
|:-------|:------|
| `id` | INTEGER PK AUTOINCREMENT |
| `category` | `session/decision/debug/pattern/reference/architecture` |
| `title` / `content` / `tags` / `source_file` / `metadata` | |
| `created_at` | UTC+8 |

### `tech_entries` (technical decisions)

`id / category / title / problem / solution / file_list / outcome / created_at`

### `cr_issues` (CR finding details)

`story_id / severity / category / description / file_line / fix_status`

---

## Phase 4 ML Tables (auto-managed by hooks)

| Table | Write Source |
|:------|:-------------|
| `pattern_observations` | PostToolUse `observe-pattern.js` |
| `embedding_queue` | PostToolUse `observe-pattern.js` |
| `retrieval_observations` | MCP Server logRetrieval() |
| `retrieval_hits` / `retrieval_keywords` | 同 |

**禁止**: agent 手動寫這些 tables(hook + server 自動管理)

---

## Phase 5 Extended Tables

| Table | Purpose | Write Method |
|:------|:--------|:-------------|
| `glossary` | Unified terminology | direct script / future MCP |
| `workflow_executions` | Workflow tracking | `log_workflow` MCP tool |
| `benchmarks` | Performance baselines | `upsert_benchmark` MCP tool |
| `test_journeys` | E2E test routes | E2E workflow |
| `test_traceability` | AC → Test mapping | `testarch-trace` workflow |
| `pipeline_checkpoints` | Pipeline state save/recover | `pipeline-checkpoint.js --save` |
| `rule_violations` | Phase 3 rule violation tracker | `log-rule-violation.js` |
| `skill_keywords` | Skill auto-detect | direct script |
| `code_symbols` / `document_chunks` | RAG indices | Phase 5 Sync Engine UoW |

---

## v5.0.0 Schema Additions

| Table | New Field | Purpose |
|:------|:----------|:--------|
| `stories` | `task_track TEXT DEFAULT 'main'` | main (SaaS 業務) / side (toolkit) |
| `workflow_executions` | `evidence_json TEXT NULL` | T4.0.0 ACK handshake evidence |

Migration: `2026-05-04-add-task-track-and-evidence-json.sql`

---

## Foreign Keys / Indexes

- `intentional_decisions.story_id` → `stories.story_id`
- `tech_debt_items.story_id` → `stories.story_id` (logical FK,no enforcement)
- `review_findings.story_id` → `stories.story_id`
- FTS5 indexes: `stories_fts` / `context_entries_fts` / `tech_entries_fts` / `documents_fts`

---

## SQLite Pragma (`.context-db/server.js:48-49`)

```javascript
db.pragma('journal_mode = WAL');     // Write-Ahead Logging,並行 read + write
db.pragma('busy_timeout = 5000');    // 5s wait if locked (對齊 T5.5 retry exponential backoff)
```
