# Context Memory DB

> SQLite Context Memory DB (MCP Tools) — historical decisions, debug lessons, architecture patterns, incident records, session summaries.
>
> **2026-05-16 精簡**: 本檔僅保留 SUPREME 規範。技術細節(Phase 4/5 Tables / Context Overload Recovery / Auto-Save Hook 結構 / Compaction Recovery 等)備份於 `claude token減量策略研究分析/環境配置優化建議-20260516/backups/{ts}/rules/context-memory.md`。

## Conversation Start Ritual (CRITICAL — Mechanical, Zero Manual Ops)

UserPromptSubmit Hook (`pre-prompt-rag.js`) auto-injects 11 layers on every prompt: Session history / Rule Violation Hot Zones / Story progress / Related tech debt / Decisions / IDD / Pipeline State / Skill Recommendation / LSP / Code RAG / Document RAG.

Agent needs no manual query. Fallback if Hook fails (empty additionalContext): `search_context("", {category: "session", limit: 3})`. If user asks "what did we do last time" → **answer from memory DB**, never read YAML directly.

> Incident: 2026-03-07 violated this twice (read YAML skipping DB query), prompted CMI-1 creation.

## Query First (Before Starting Any Task)

Use `search_context` / `search_tech` for relevant memory:
- BMAD workflow → domain historical decisions and patterns
- Bug fix → `category:debug` for similar issues
- Architecture decision → `category:decision` / `category:architecture`
- Project status → `category:session` latest records
- Story query → `search_stories` (FTS5 + epic/status/domain/complexity filter)
- Tech debt → `search_debt` (FTS5 + story/target/status/severity filter)

## Write Discipline (After Task Completion)

Write new knowledge via `add_context` / `add_tech`:
- New debug findings, architecture decisions, pattern confirmations → `add_context`
- Technical verification (success/failure) → `add_tech`
- Code Review findings → `add_cr_issue`
- **Tech debt items** → `node .context-db/scripts/upsert-debt.js` (DEFERRED/WON'T FIX)
- Conversation end / milestone → `add_context(category: "session")` with `title: "Session Summary: {date} {task}"`, content covering completed/state/next, `tags: ["session", "manual"]`
- Workflow completion → `log_workflow(workflow_type, status, agent_id, input_tokens, output_tokens)`

Do NOT write: temporary ops, one-time query results, duplicate knowledge.

## Auto-Save (Triple Insurance — Agent doesn't manually write)

| Hook | Trigger | Behavior |
|------|---------|----------|
| **Stop** | Every Claude response | UPDATE existing within 2min, INSERT if >2min |
| **SessionStart** | Every session start | otel-auto-start.js: collector port 49200 idempotent |
| **SessionEnd** | Conversation end | log-session.js (INSERT) + otel-session-aggregate.js (glob-resilient) |
| **PreCompact** | Before compaction | Shares dedup logic with Stop |
| **UserPromptSubmit** | User submits prompt | Inject latest 3 sessions into additionalContext |

## DB-first Story SDD+ATDD (短摘要,完整見 `db-first-no-md-mirror.md`)

DB-first Stories written via `upsert-story.js`. AC must follow ATDD: Given/When/Then with concrete values + `[Verifies: BR-XXX]` mapping. M/L/XL → Produce SDD Spec first.

## Context Compaction Recovery

When detecting conversation resumed from compaction summary (signature: "This session is being continued from a previous conversation"):
1. **Never blindly trust summary's "how to do it"** — summary "what" usually correct, "how" may be wrong
2. **Force re-read original files** before any operation
3. **Query memory DB** via `search_context` for related lessons
4. **Cross-validate** — when summary conflicts with project specs, **specs are authoritative**

High-Risk: Epic MQV DB-first storage / "create file vs write to DB" decisions / Special Epic conventions.

> Incident: 2026-03-07 compaction summary instructed creating .md files, violating Epic MQV DB-first (memory id=149).

---

## §DB Schema-First Mandate (CRITICAL — Permanent, 2026-05-08 V2-01-FIX)

任何涉及 **DB column / table / PK / index 假設** 的 SQL 或 Node script,**必須先 PRAGMA verify 或 Read `.claude/skills/phycool-context-memory/references/db-schema.md`**,不得依賴記憶 / 類比 / 訓練資料推測。

### Applies When

- 寫 `SELECT/INSERT/UPDATE/DELETE` 提及具體 column 名稱
- Node script `db.prepare(...)` 任何 SQL
- DB 結構假設(「我記得 X 表有 `created_at`」)
- Migration 設計時涉及對既有表新增 column / FK
- Audit / 採集 task 寫 PRAGMA / COUNT / index_list

### Mandatory Flow

1. **PRAGMA-first**: 開 SQL/Node script 前先跑 `PRAGMA table_info('{table}')` 或 Read `references/db-schema.md`
2. **Cheatsheet 對照**: db-schema.md §⚡ Speed Lookup — 確認 PK / timestamp / 假設陷阱 3 表(A / B / C)
3. **Evidence in code comment**: `// Verified PRAGMA YYYY-MM-DD: {table}.{col} = TYPE`
4. **若 schema 與假設不符**: 信實際 PRAGMA 結果(SELECT silent fail 0 row;UPDATE 走錯 column 可能 silent corrupt)

### FORBIDDEN

- ❌ `SELECT created_at FROM context_entries` (real = `timestamp`)
- ❌ `SELECT id FROM intentional_decisions` (real PK = `idd_id` TEXT)
- ❌ `UPDATE embedding_queue SET status='done'` (real = `processed` INTEGER)
- ❌ `SELECT created_at FROM symbol_embeddings` (real = `generated_at`)
- ❌ `SELECT updated_at FROM tech_debt_items` (該表無 `updated_at`)
- ❌ Migration 加 column 不先看 `init-db.js` 是否已有(IF NOT EXISTS)
- ❌ 從 ChatGPT / 訓練資料記憶 推論 schema
- ❌ 信任 SKILL.md 摘要級欄位數字而不對照 db-schema.md

### Self-Check (寫 DB query 前必問 4 題)

1. column name 是否在 `db-schema.md` §B Cheatsheet 找到? 找不到 → STOP,PRAGMA verify
2. 用 `id` 作 PK,目標表是 `intentional_decisions/sprint_index/stories/conversation_sessions`?是 → STOP,改 `idd_id/story_id/story_id/session_id`
3. 用 `updated_at`,目標表是 `tech_debt_items`?是 → STOP,該表沒這個欄位
4. 用 `created_at/status/id`,但目標表的命名陷阱是否在 §C 列表?是 → STOP,對照 ✅ Reality 欄

### Discovery Commands

```powershell
# PRAGMA inspect
node -e "const db=require('better-sqlite3')('.context-db/phycool.db', {readonly:true}); console.log(db.prepare(\"PRAGMA table_info('intentional_decisions')\").all());"

# Read Cheatsheet
# .claude/skills/phycool-context-memory/references/db-schema.md → §⚡ Speed Lookup Cheatsheet
```

### Incident

- **2026-04-11 id=3959 模式 B**: V2-01 採集連 3 次 schema 假設違規 — `embedding_queue.status`(實 `processed`)/ `context_entries.created_at`(實 `timestamp`)/ `intentional_decisions.id`(實 `idd_id`)。query 全 silent fail / 0 結果 / 走錯 fallback。觸發本 Mandate。
- **配套封閉防線**: `phycool-context-memory` SKILL v2.8.0 + `references/db-schema.md` PRAGMA-derived + `⚡ Speed Lookup Cheatsheet`(A: PK 表 / B: timestamp 表 / C: 8 個假設陷阱)+ Story `ENV-CHECK-V2-01-FIX-db-schema-drift.md` Layer 1-3。
