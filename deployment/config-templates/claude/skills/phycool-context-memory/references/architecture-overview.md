# phycool-context-memory — §1 Architecture Overview

> **抽出自** `.claude/skills/phycool-context-memory/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §1 Architecture Overview。

---

## 1. Architecture Overview

```
                    +-------------------------+
                    |  Claude Code / Gemini / |
                    |  Antigravity / Rovo Dev |
                    +----------+--------------+
                               | MCP Protocol (stdio)
                    +----------v--------------+
                    |  PhyCool Context MCP    |
                    |  Server (Node.js ESM)   |  <- .context-db/server.js
                    |  32 MCP Tools           |  <- epic-whp: search_worker_runs/ack_worker_run/gate_worker_run/add_worker_message
                    +----------+--------------+
                               | better-sqlite3 (WAL)
                    +----------v--------------+
                    |  phycool.db (SQLite)    |  <- .context-db/phycool.db
                    |  63 real + 13 FTS5      |  <- PRAGMA verified 2026-07-27
                    +----------+--------------+
                               |
           +-----------------------+-----------------------+
           |                       |                       |
    +------v------+       +--------v------+       +--------v------+
    | Hook writes  |       | Standalone    |       | DevConsole    |
    | (3-layer)   |       | scripts       |       | Web UI        |
    +-------------+       | (0 tokens)    |       +---------------+
                          +---------------+
```

### ⚠️ AIOS 跨 DB 架構說明 (aat-fnd-01, 2026-05-09)

PhyCool 現有**兩個獨立 DB**：

| DB | 連線 | 管理者 | 用途 |
|----|------|--------|------|
| **phycool.db** (SQLite) | `.context-db/phycool.db` | 本 Skill MCP 工具（23 tools） | Agent 記憶 / Skill / Debt / IDD / Session |
| **PhyCool_MVP** (SQL Server) | DefaultConnection | EF Core (`ApplicationDbContext` + `AIOSDbContext`) | 業務資料 + AIOS 6 新表 |

**AIOS 6 SQL Server 表**（`AIOSDbContext`，aat-fnd-01 建立，`Data/Migrations/AIOS/`）：
- `agent_runs` — Agent 子視窗即時狀態（run_id PK）
- `agent_events` — Agent 事件日誌（BIGINT IDENTITY PK）
- `agent_task_queue` — 任務佇列（BIGINT IDENTITY PK）
- `resource_locks` — 資源鎖定，UQ_resource_active 唯一索引（BIGINT IDENTITY PK）
- `ceo_briefings` — CEO 匯報（BIGINT IDENTITY PK，13 欄位 INSERT contract，詳見下方 Schema Cheatsheet）
- `agent_messages` — Agent 訊息（BIGINT IDENTITY PK）

> **關鍵**：查詢 AIOS 表不可用 `search_context` / `search_stories` MCP 工具（那些查 SQLite）。應透過 `AIOSDbContext` EF Core 或直接 SQL Server 查詢。

#### ceo_briefings 13-Column Schema Cheatsheet (aat-fnd-02-followup-extend-columns)

> Hook (`ceo-briefing-generator.js`) INSERT 13 欄位，1 欄位 (user_acknowledged_at) 由 UI 控制不寫。

| 欄位 | DB Type | Nullable | Hook 寫入值 | 備注 |
|------|---------|----------|-------------|------|
| `run_id` | nvarchar(64) | NOT NULL | `CLAUDE_RUN_ID` env | PK 參照 |
| `summary` | nvarchar(max) | NOT NULL | **sanitized plain Markdown** | ⚠️ 不再是 JSON blob（aat-fnd-02-followup 升版）|
| `status` | nvarchar(20) | NOT NULL | `'unread'` hardcode | 初始值 |
| `created_at` | datetimeoffset | NOT NULL | `nowTaiwan()` UTC+8 | |
| `created_by` | nvarchar(64) | NULL | `CLAUDE_AGENT_ID` \|\| `'CC-OPUS-Alan'` | Forward-Compat ADR-AIOS-002 |
| `module_id` | nvarchar(32) | NULL | `detectModuleId(storyId)` → `'PCPT'`\|`'UNKNOWN'` | |
| `briefing_type` | nvarchar(32) | NOT NULL(def: run_complete) | `'run_complete'` **顯式寫** | 4 enum: run_complete / error_halt / review_complete / manual |
| `decisions_md` | nvarchar(max) | NULL | sanitized Markdown fallback | fallback: `_本 session 無重大決策。_` |
| `risks_md` | nvarchar(max) | NULL | sanitized Markdown fallback | fallback: `_本 session 無識別風險。_` |
| `recommendations_md` | nvarchar(max) | NULL | sanitized Markdown fallback | fallback: `_繼續推進下一 Story。_` |
| `requires_user_action` | bit | NOT NULL(def: 0) | `false` **顯式寫** | UI 紅框警示；heuristic detection 留 follow-up Story |
| `epic_id` | nvarchar(64) | NULL | `detectEpicId(storyId)` → `'epic-{prefix}'`\|`null` | PCPT 白名單 22 prefix |
| `story_id_ref` | nvarchar(128) | NULL | `CLAUDE_STORY_ID` empty→null | |
| `user_acknowledged_at` | datetimeoffset | NULL | **Hook 不寫** | UI acknowledge button 控制 |

**briefing_type 4 enum values**:
- `run_complete` — Stop hook 正常結束（預設值）
- `error_halt` — 子視窗異常終止（future）
- `review_complete` — Code Review 完成（future）
- `manual` — 手動觸發（future）

**requires_user_action heuristic 擴充點（TODO in hook line ~134）**:
> 目前硬寫 `false`。follow-up Story 可加 heuristic：grep session log 內 `'BLOCKER'`/`'FAIL'`/`'❌'` → 自動標 `true`。

**FORBIDDEN**：
- ❌ `ceo-briefing-generator.js` INSERT 時 summary 寫 JSON blob（違反 aat-fnd-02-followup 升版合約，必寫 sanitized plain Markdown）
- ❌ INSERT 只寫 6 欄位（舊合約）— 必寫完整 13 欄位（7 新結構化欄位全填，user_acknowledged_at 除外）
- ❌ briefing_type / requires_user_action 不顯式寫（靠 Migration default 風險：default 改變時 hook 無感）

### Directory Structure

```
.context-db/
+-- phycool.db              SQLite database (WAL mode)
+-- ledger.jsonl            DB-native transaction log (Git tracked, auto-created on first MCP write)
+-- server.js               MCP Server (stdio, 19 tools + appendLedger dual-write)
+-- package.json            better-sqlite3 + @huggingface/transformers
+-- symbol-indexer/          Roslyn AST Symbol extractor (C# Console, 8,063 symbols)
+-- scripts/
    +-- log-session.js       Hook: Stop/SessionEnd/PreCompact triple-write
    +-- log-turn.js          Hook: per-turn conversation logging (CMI-3)
    +-- local-embedder.js    Local ONNX inference (all-MiniLM-L6-v2, 384D)
    +-- generate-embeddings.js  Symbol/doc embedding batch generation
    +-- sync-documents.js    Doc vectorization incremental sync (CMI-5)
    +-- scan-doc-index.js    Layer 3 Daily: doc_index rebuild
    +-- validate-data.js     Layer 3 Weekly: Git vs DB consistency check
    +-- cleanup-orphans.js   Layer 3 Monthly: orphan record cleanup
    +-- pipeline-checkpoint.js  Pipeline state save/update/recover (cmi-recovery-01)
    +-- context-budget-monitor.js  Token budget warning (80%/95% thresholds)
    +-- restore.js           Ledger disaster recovery (replay ledger.jsonl → DB)
    +-- upsert-story.js      DB-first Story write (Layer 1 auto-status-promotion, see `.claude/rules/story-lifecycle-invariants.md`)
    +-- upsert-debt.js       Tech debt DB write/query
    +-- timezone.js          UTC+8 timestamp shared utility
    +-- rebuild-watches-index.js  Skill watches index builder (skill_watches_index)
    +-- query-watches-hits.js     Watches hits query interface (--since filter)
    +-- ...                  46 scripts total

scripts/scheduled/           Layer 3 Windows Task Scheduler wrappers
+-- scan-doc-index.cmd       Daily 03:00 (with REM usage docs)
+-- validate-data.cmd        Weekly Sun 04:00
+-- cleanup-orphans.cmd      Monthly 1st 05:00
+-- install-schedules.ps1    One-click Task Scheduler installer
+-- logs/                    Scheduled task output logs

tools/dev-console/           DevConsole Web UI (standalone Node.js SPA)
+-- server/                  Express 5 + better-sqlite3 REST API
+-- src/                     Vite 6 + React 18 + TypeScript SPA
```

---


---
