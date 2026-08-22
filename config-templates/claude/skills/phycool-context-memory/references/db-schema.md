# PhyCool Context Memory DB — Schema Reference

> **Source of truth**: live PRAGMA from `.context-db/phycool.db`
> **Auto-collected**: 2026-05-08 09:50:30 (UTC+8) via `.context-db/__regen-temp.cjs` (one-shot, deleted after V2-01-FIX run)
> **Regeneration**: future regen via `node .context-db/scripts/regen-db-schema-doc.js` (Layer 2 follow-up; until then, recreate `__regen-temp.cjs` + `__regen-md.cjs` from Story `ENV-CHECK-V2-01-FIX-db-schema-drift.md` Layer 1 spec)
> **Discipline**: PRAGMA-first — agents MUST run `PRAGMA table_info` or read this doc before writing any DB query that assumes column names. See `.claude/rules/context-memory.md` §DB Schema-First Mandate.
> **Drift incident reference**: Memory id=3959 (mode B — DB schema 盲目假設導致 3 violations: `embedding_queue.status` / `context_entries.created_at` / `intentional_decisions.id`)

## 0. Inventory

> **⚠️ 計數口徑說明(2026-07-28 ccb-1-db-mcp-import 校正)**: 「Total」= 「實體基表」+「FTS5 虛擬主表」+「FTS5 影子表」三者之和。舊版 v3.3.0 曾用單一「63 real」字眼混淆「total − shadow」(115−52=63,**未扣掉 13 個 FTS5 主表本身**)與「真正的實體基表」兩種不同含義。本表起改用三欄分列,消除歧義。

| Metric | Count |
|--------|------:|
| Total `sqlite_master` table rows(非 `sqlite_%`) | **124** |
| **實體基表**(non-FTS5, non-shadow) | **54** |
| FTS5 虛擬主表(`USING fts5(...)` 宣告) | **14** |
| FTS5 shadow tables (`_data` / `_idx` / `_docsize` / `_config` / `_content`) | 56 |

Sanity check: 54 + 14 + 56 = 124 ✅(2026-07-28 直接程式化驗算,非手算)。

FTS5 shadow tables are managed automatically by SQLite — agents should never query them directly.

> **⚠️ Post-snapshot additions (after 2026-05-08 auto-collect)**: ECC L2 subsystem tables `instincts` / `observations_queue` / `instincts_rejected` added 2026-05-24 (ecc-07) + D5 adoption-score columns 2026-05-25 (ADR-ECC-LEARNING-001 v1.4.0) + UI columns 2026-05-28 (ecc-emergence-ui-core: `instincts` +`description_zh`/`user_note`/`user_star_rating`, `instincts_rejected` +`reject_count`/`norm_key`; `init-db.js:1206-1222`) + Tianji-Pavilion `baseline_snapshots`/`external_evaluations` 2026-05-18 + `generated_skills`/`effect_metrics` 2026-05-28 (ecc-emergence-ui-v2) + epic-whp `worker_runs`/`worker_messages`/`worker_handoffs`/`guardian_heartbeat` 2026-07-27(whp-3-db-schema-registry) + epic-ccb `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` + `ctrl_messages_fts` 2026-07-28(ccb-1-db-mcp-import) + **epic-tdb `track_plan` 2026-07-28(tdb-1-track-plan-roadmap;8 欄 2 索引;`story_id TEXT PRIMARY KEY`;刻意不建 FK — `INSERT OR REPLACE INTO stories` 在 better-sqlite3 預設 `PRAGMA foreign_keys=1` 下會觸發 `ON DELETE CASCADE` 靜默清空子表,故排程層改在應用層做參照完整性檢查)**。**2026-07-28 PRAGMA 直接實查校正**(程式化計算,分別統計 FTS5 主表 vs shadow vs 其餘):total=124 / FTS5 主表=14 / shadow=56 / **實體基表=54**(54+14+56=124 驗算通過)。加 tdb-1 前(即 ccb-1 校正後基準)為 total=123 / FTS5=14 / shadow=56 / 實體基表=53,本次 +1(+1 實體基表,`track_plan`;零 FTS5、零 shadow,無 trigger)全數來自 tdb-1 單一 Story,無其他並行軌變更此期間動過 schema(逐項核對 delta 相符)。**2026-08-03(ccb-4-ctrl-notify-knock)**:epic-ccb `controller_windows`(11 欄 1 索引;`session_id TEXT PRIMARY KEY` —— 一個 session = 一個視窗 = 一個軌,以 track 為 key 會讓「同軌重綁新視窗」變成靜默丟棄舊視窗 PID 的 update;零 FTS5 / 零 shadow / 零 trigger)。**PRAGMA 直接實查**:total=**125** / FTS5 主表=14 / shadow=56 / **實體基表=55**(55+14+56=125 驗算通過),較 tdb-1 後基準 +1 全數來自本卡。**2026-08-02(whp-11-d2-inline-revise)**:`worker_messages` 12→13 cols(+`knocked_at` TEXT NULL,additive-`ALTER`,零表數變動,`node init-db.js` 連跑兩次冪等驗證 exit 0×2)。§A/§B/§C/§1 的逐表明細仍為 2026-05-08 快照 + 手動增補,**完整逐欄 regen 待 §4 Regeneration Protocol** 處理。

## ⚡ Speed Lookup Cheatsheet (Read this BEFORE writing any DB query)

### A. Tables → Primary Key column

| Table | PK column(s) | Type |
|-------|--------------|------|
| `benchmarks` | `id` | INTEGER |
| `context_embeddings` | `id` | INTEGER |
| `context_entries` | `id` | INTEGER |
| `conversation_embeddings` | `id` | INTEGER |
| `conversation_sessions` | `session_id` | TEXT |
| `conversation_turns` | `id` | INTEGER |
| `controller_windows` | `session_id` | TEXT |
| `cr_issues` | `id` | INTEGER |
| `cr_reports` | `id` | INTEGER |
| `debt_embeddings` | `id` | INTEGER |
| `doc_index` | `id` | INTEGER |
| `document_chunks` | `id` | INTEGER |
| `document_embeddings` | `id` | INTEGER |
| `embedding_queue` | `id` | INTEGER |
| `glossary` | `id` | INTEGER |
| `intentional_decisions` | `idd_id` | TEXT |
| `pattern_observations` | `id` | INTEGER |
| `pipeline_checkpoints` | `id` | INTEGER |
| `retrieval_hits` | `id` | INTEGER |
| `retrieval_keywords` | `id` | INTEGER |
| `retrieval_observations` | `id` | INTEGER |
| `review_findings` | `id` | INTEGER |
| `review_plans` | `id` | INTEGER |
| `review_reports` | `id` | INTEGER |
| `skill_watches_index` | `id` | INTEGER |
| `sprint_index` | `story_id` | TEXT |
| `stories` | `story_id` | TEXT |
| `stories_embeddings` | `id` | INTEGER |
| `god_nodes` | `symbol_id` | INTEGER (FK → symbol_index.id) |
| `symbol_dependencies` | `id` | INTEGER |
| `symbol_embeddings` | `id` | INTEGER |
| `symbol_index` | `id` | INTEGER |
| `tech_debt_items` | `id` | INTEGER |
| `tech_embeddings` | `id` | INTEGER |
| `tech_entries` | `id` | INTEGER |
| `test_journeys` | `id` | INTEGER |
| `test_traceability` | `id` | INTEGER |
| `watches_hits` | `id` | INTEGER |
| `workflow_executions` | `id` | INTEGER |
| `instincts` ⭐ECC | `id` | **TEXT (NOT INTEGER)** |
| `observations_queue` ⭐ECC | `id` | INTEGER |
| `instincts_rejected` ⭐ECC | `id` | INTEGER |
| `generated_skills` ⭐ECC-V2 | `id` | INTEGER AUTOINCREMENT |
| `effect_metrics` ⭐ECC-V2 | `id` | INTEGER AUTOINCREMENT |
| `worker_runs` 🆕epic-whp | `run_id` | TEXT (session_id seed) |
| `worker_messages` 🆕epic-whp | `msg_id` | INTEGER AUTOINCREMENT |
| `worker_handoffs` 🆕epic-whp | `run_id` | TEXT (PK = FK to worker_runs.run_id, 1:0..1) |
| `guardian_heartbeat` 🆕epic-whp | `id` | INTEGER, **`CHECK (id = 1)` — 資料庫層單例保證**(全表恆 1 列) |

### B. Tables → timestamp column(s)

Different tables use different timestamp column names. Common pitfalls (Memory id=3959 mode B):

| Table | timestamp column(s) |
|-------|--------------------|
| `context_embeddings` | `generated_at` |
| `context_entries` | `timestamp` |
| `conversation_embeddings` | `generated_at` |
| `conversation_sessions` | `started_at`, `ended_at` |
| `conversation_turns` | `timestamp` |
| `controller_windows` | `bound_at`, `last_seen_at`, `last_probe_at`, `last_stop_block_at`, `last_knock_at` |
| `cr_issues` | `created_at` |
| `cr_reports` | `review_date`, `created_at` |
| `debt_embeddings` | `generated_at` |
| `god_nodes` | `computed_at` (UTC+8 ISO text, format `YYYY-MM-DDTHH:mm:ss+08:00`) |
| `doc_index` | `last_updated`, `created_at` |
| `document_chunks` | `created_at`, `updated_at` |
| `document_embeddings` | `generated_at` |
| `embedding_queue` | `queued_at` |
| `glossary` | `created_at`, `updated_at` |
| `intentional_decisions` | `created_at`, `updated_at` |
| `pipeline_checkpoints` | `created_at`, `updated_at` |
| `retrieval_observations` | `timestamp` |
| `review_findings` | `created_at`, `updated_at` |
| `review_plans` | `created_at`, `updated_at` |
| `review_reports` | `started_at`, `completed_at`, `created_at`, `updated_at` |
| `skill_watches_index` | `indexed_at` |
| `sprint_index` | `last_updated` |
| `stories` | `created_at`, `updated_at`, `started_at`, `completed_at`, `create_started_at` |
| `stories_embeddings` | `generated_at` |
| `symbol_embeddings` | `generated_at` |
| `symbol_index` | `indexed_at` |
| `tech_debt_items` | `source_review_date`, `created_at`, `resolved_at`, `review_date` |
| `tech_embeddings` | `generated_at` |
| `tech_entries` | `created_at`, `updated_at` |
| `test_journeys` | `created_at`, `updated_at` |
| `workflow_executions` | `started_at`, `completed_at` |
| `instincts` ⭐ECC | `created_at`, `last_seen`, `decay_at` (UTC+8) |
| `observations_queue` ⭐ECC | `created_at` (UTC+8) |
| `instincts_rejected` ⭐ECC | `rejected_at`, `restored_at` (UTC+8; `restored_at` nullable — NULL 表示仍否決) |
| `generated_skills` ⭐ECC-V2 | `generated_at`, `paused_at`, `deleted_at` (UTC+8) |
| `effect_metrics` ⭐ECC-V2 | `measured_at` (UTC+8) |
| `worker_runs` 🆕epic-whp | `started_at`, `last_turn_at`, **`closed_at`(真實關閉,只有關閉者可寫)vs `closed_detected_at`(偵測時間,reaper/守護只能寫此欄)絕不混用**, `reported_at`, `ack_at`, `window_vanished_at`, `updated_at` |
| `worker_messages` 🆕epic-whp | `created_at`, `delivered_at`, `consumed_at`, `knocked_at`(whp-11,D2 敲門冪等標記,NULL=從未敲過門) |
| `worker_handoffs` 🆕epic-whp | `created_at`, `updated_at`, `gate_at` |
| `guardian_heartbeat` 🆕epic-whp | `started_at`, `last_beat_at`, `updated_at` |

### C. Common assumption traps (Memory id=3959 mode B 防範)

| ❌ Bad assumption | ✅ Reality (PRAGMA verified) |
|------------------|------------------------------|
| All tables have `updated_at` | `tech_debt_items` has `created_at`/`resolved_at`/`review_date`/`source_review_date` but NO `updated_at` |
| All tables have `id` PK | `intentional_decisions` uses `idd_id`; `sprint_index` uses `story_id`; `stories` uses `story_id`; `conversation_sessions` uses `session_id` |
| `embedding_queue` has `status` column | Real columns: `id` / `entry_type` / `entry_id` / `processed` (INTEGER 0/1) — only 4 cols |
| `context_entries.created_at` exists | Real column is `timestamp` (not `created_at`) |
| `*_embeddings` have `created_at` | Real column is `generated_at` |
| There is a `rule_violations` table | Rule violations live in `context_entries WHERE category='rule_violation'` (no dedicated table) |
| `pattern_observations` has indexes | Real `indexes` count = 0 (PRAGMA verified) |
| `tech_entries` has indexes | Real `indexes` count = 0 (PRAGMA verified — backfill bottleneck for V2-02-FIX) |
| `instincts` PK is `id` INTEGER | Real PK is `id` **TEXT** (e.g. `inst_xxx_project_mpl...`) — like `intentional_decisions` |
| `instincts` has no adoption fields | D5 (2026-05-25 ADR v1.4.0): has `project_type`/`business`/`adoption_score` (INTEGER NOT NULL DEFAULT 3, CHECK 0~5) |
| `instincts` has no UI/user fields | UI (2026-05-28 ecc-emergence-ui-core): +`description_zh` TEXT (AGENT 繁中說明) / `user_note` TEXT (使用者備註) / `user_star_rating` INTEGER (CHECK 1~10, NULL allowed) — `init-db.js:1206-1214` |
| `instincts_rejected` has 6 cols | UI (2026-05-28): +`reject_count` INTEGER NOT NULL DEFAULT 1 / `norm_key` TEXT (正規化 trigger key) → 8 cols — `init-db.js:1215-1222` |
| `instincts_rejected` has no `restored_at` | ECC-V2 (2026-05-28 ecc-emergence-ui-v2): +`restored_at` TEXT NULLABLE → 9 cols; `restored_at IS NULL` = 仍否決; `restored_at IS NOT NULL` = 已還原 — `init-db.js §Epic-ECC-V2 UI v2` |
| `generated_skills` 表不存在 | ECC-V2 (2026-05-28): 新建表 7 cols: `id AUTOINCREMENT` / `instinct_cluster_id` TEXT / `skill_path` TEXT UNIQUE / `status` ('active'/'paused'/'deleted') / `generated_at` / `paused_at` / `deleted_at` — `init-db.js §Epic-ECC-V2 UI v2` |
| `effect_metrics` 表不存在 | ECC-V2 (2026-05-28): 新建表 7 cols: `id AUTOINCREMENT` / `skill_id` FK → `generated_skills(id)` / `before_freq` / `after_freq` / `improvement_pct` REAL / `measured_at` / `sample_window_days` DEFAULT 7 — `init-db.js §Epic-ECC-V2 UI v2` |
| `observations_queue` has `status` | Real flag is `processed` (INTEGER 0/1); D5 added `project_type` (CHECK pcpt-business/env-tooling/workflow) |
| `symbol_index.centrality_score` 重建後仍有值 | **harvest 重建 `symbol_index` 會清空 centrality_score(預設 0)** → 須 `compute-centrality.cjs` 重跑回寫(2026-05-27 修:同 transaction back-propagate · 原只 INSERT `god_nodes` 表未回寫)。**DevConsole god-nodes 頁查 `symbol_index WHERE centrality_score>0`**,若全 0 → 空頁。`god_nodes` 表是另一份 centrality 存儲(`search_god_nodes` MCP 讀)。harvest-and-reembed.cjs 第⑦步呼叫 compute-centrality 已含此回寫 |
| 全庫零 partial index(舊敘述) | **已於 2026-07-27(whp-3-db-schema-registry)失效** —— `worker_runs` 的 `ix_worker_runs_pending_ack`(`ON worker_runs(lifecycle, reported_at) WHERE ack_at IS NULL`)是**全庫第一個 partial index**(non-unique)。PRAGMA 實查:加表前 86 個 explicit index / 0 個含 `WHERE` 子句,加表後現有 1 個(即此索引)。守護每 30 秒的 pending-ack 熱查詢(`lifecycle='reported' AND ack_at IS NULL`)`EXPLAIN QUERY PLAN` 證實確實走此索引,非僅存在未生效 |

## 1. Tables — Quick Reference (63 real, PRAGMA 實測 2026-07-27)

Each row = PK / index count / row count snapshot. For column-level detail, regenerate via `__regen-temp.cjs` + `__regen-md.cjs` (Story F1 Layer 1) and merge in.

| Table | Row Count | PK | Index Count | Notable Notes |
|-------|----------:|----|------:|---------------|
| `symbol_dependencies` | 200,777 | `id` | 2 | Code RAG dependency graph |
| `conversation_turns` | 29,144 | `id` | 3 | CMI-3 conversation full-text |
| `document_chunks` | 13,962 | `id` | 3 | CMI-5 RAG chunked docs |
| `document_embeddings` | 13,962 | `id` | 3 | 100% coverage |
| `symbol_embeddings` | 8,063 | `id` | 2 | 100% coverage |
| `symbol_index` | 8,063 | `id` | 3 | Roslyn AST extracted |
| `watches_hits` | 4,163 | `id` | 2 | Skill watches event log |
| `context_entries` | 3,542 | `id` | 1 | Phase 0 strategic memory + rule_violation pseudo-table |
| `context_embeddings` | 3,381 | `id` | 2 | 95.5% coverage |
| `pattern_observations` | 2,958 | `id` | 0 | **No indexes** — Phase 4 continuous learning |
| `conversation_sessions` | 2,798 | `session_id` | 3 | TEXT PK |
| `doc_index` | 2,480 | `id` | 2 | Layer B doc taxonomy |
| `conversation_embeddings` | 2,057 | `id` | 2 | 73.5% — V2-02-FIX backfill target |
| `retrieval_observations` | 2,048 | `id` | 2 | Phase 4 retrieval log |
| `retrieval_keywords` | 1,728 | `id` | 1 | Phase 4 keyword extract |
| `embedding_queue` | 1,368 | `id` | 0 | **No indexes** — `processed:INTEGER 0/1` (NOT `status`) |
| `tech_entries` | 1,057 | `id` | 0 | **No indexes** — V2-02-FIX backfill bottleneck |
| `retrieval_hits` | 1,027 | `id` | 2 | Phase 4 per-entry hits |
| `stories` | 979 | `story_id` | 4 | TEXT PK,47 cols(2026-06-07 R0 R-R0-14:PRAGMA 實證 47,後增 `task_track`;原記 46 漂移 +1) |
| `review_findings` | 961 | `id` | 6 | 35 cols (review_pipeline) |
| `stories_embeddings` | 942 | `id` | 2 | 96.2% coverage |
| `cr_issues` | 797 | `id` | 4 | CR Phase B findings |
| `tech_embeddings` | 770 | `id` | 2 | 72.8% — V2-02-FIX backfill target |
| `tech_debt_items` | 748 | `id` | 7 | INTEGER `id` + TEXT `debt_id` business key |
| `debt_embeddings` | 731 | `id` | 2 | 97.7% coverage |
| `workflow_executions` | 468 | `id` | 3 | INSERT-only (V2-05-FIX zombie root cause) |
| `cr_reports` | 414 | `id` | 2 | 14 cols |
| `skill_watches_index` | 162 | `id` | 1 | Skill watches glob index |
| `sprint_index` | 142 | `story_id` | 1 | TEXT PK |
| `review_reports` | 133 | `id` | 5 | 34 cols (review_pipeline master) |
| `benchmarks` | 36 | `id` | 2 | Phase 5 perf baseline |
| `glossary` | 15 | `id` | 2 | Phase 5 terminology |
| `intentional_decisions` | 14 | `idd_id` | 4 | **TEXT PK `idd_id` (NOT `id`)** — DLA-07/08 IDD,25 cols |
| `test_journeys` | 7 | `id` | 3 | Phase 5 E2E |
| `test_traceability` | 7 | `id` | 4 | Phase 5 AC→Test |
| `review_plans` | 4 | `id` | 1 | review_pipeline plans |
| `pipeline_checkpoints` | 3 | `id` | 3 | 13 cols (cmi-recovery-01) |
| `instincts` ⭐ECC | 14 | `id` | 4 | **TEXT PK `id`** · 20 cols (D5 2026-05-25 +`project_type`/`business`/`adoption_score`; UI 2026-05-28 ecc-emergence-ui-core +`description_zh`/`user_note`/`user_star_rating`) · ECC L2 動態湧現 · `UNIQUE(trigger,scope)` |
| `observations_queue` ⭐ECC | ~150 | `id` | 2 | INTEGER PK · 9 cols (D5 +`project_type`) · `processed` 0/1 (NOT `status`) · per-event capture |
| `instincts_rejected` ⭐ECC | 0 | `id` | 0 | INTEGER PK · 8 cols (UI 2026-05-28 +`reject_count`/`norm_key`) · verifier rejected log |
| `worker_runs` 🆕epic-whp | 0 | `run_id` | 6(含 1 partial · 1 sqlite_autoindex) | TEXT PK · 39 cols · 8 態 lifecycle · 4-Tuple PID reuse defence · `ux_worker_runs_key(story_id,phase,attempt)` 唯一 · **刻意不建 partial UNIQUE**(見 §C) |
| `worker_messages` 🆕epic-whp | 0 | `msg_id` | 2 | INTEGER AUTOINCREMENT PK · **13 cols**(whp-11 +`knocked_at` TEXT NULL,D2 敲門冪等標記)· controller↔worker 聊天室 · `seq` 流水號 · `ux_worker_messages_run_seq(run_id,seq)` 唯一 |
| `worker_handoffs` 🆕epic-whp | 0 | `run_id` | 2(含 1 sqlite_autoindex) | TEXT PK(= FK worker_runs.run_id)· 13 cols · GATE 證據鏈 · `evidence_json`/`gate_result`/`override_reason` |
| `guardian_heartbeat` 🆕epic-whp | 0 | `id` | 0 | INTEGER PK · **`CHECK(id=1)` 資料庫層單例保證** · 10 cols · 守護心跳 |

> **Per-table column detail** — regenerate via `__regen-temp.cjs` (auto runs `PRAGMA table_info` for all 63 real tables) + `__regen-md.cjs` (formats per-table sections). Layer 2 will ship `regen-db-schema-doc.js` for one-command regen integrated into `Skill(saas-to-skill)` Mode B.

## 2. FTS5 Virtual Tables (13)

| Name | Mirrors | Purpose |
|------|---------|---------|
| `context_fts` | `context_entries` | Phase 0 strategic memory FTS |
| `conversation_sessions_fts` | `conversation_sessions` | CMI-3 session search |
| `conversation_turns_fts` | `conversation_turns` | CMI-3 turn search |
| `cr_issues_fts` | `cr_issues` | CR Phase B finding search |
| `cr_reports_fts` | `cr_reports` | CR Phase A report search |
| `doc_index_fts` | `doc_index` | Document taxonomy search |
| `document_chunks_fts` | `document_chunks` | RAG chunked docs FTS |
| `glossary_fts` | `glossary` | Terminology FTS (CMI-5+) |
| `intentional_decisions_fts` | `intentional_decisions` | IDD FTS (DLA-07) |
| `review_findings_fts` | `review_findings` | review_pipeline finding search |
| `stories_fts` | `stories` | Story FTS5 (search_stories tool) |
| `tech_debt_fts` | `tech_debt_items` | Debt FTS (search_debt tool) |
| `tech_fts` | `tech_entries` | Tech entries FTS (search_tech tool) |

FTS5 shadow tables (52 total: 13 × `_data` / `_idx` / `_docsize` / `_config` plus content shadow): managed by SQLite — never query directly.

All FTS5 virtual tables use `tokenize='trigram'` (CJK 相容,零依賴).

## 3. Cross-Reference Notes

### V2 health check fix backlog (active 2026-05-08+)

- **V2-01-FIX**(this doc): db-schema.md drift 完全消除 ✅
- **V2-02-FIX**: `conversation_embeddings` 73.5% / `tech_embeddings` 72.8% backfill(see Story `ENV-CHECK-V2-02-FIX-vector-coverage.md`)
- **V2-03-FIX**: ADR-DB-001 整合契約文件化(see Story `ENV-CHECK-V2-03-FIX-adr-sync-contract.md`)
- **V2-05-FIX**: `workflow_executions` zombie cleanup with PID verification(see Story `ENV-CHECK-V2-05-FIX-zombie-workflow-cleanup.md`)

### Schema design notes (PRAGMA-verified pitfalls)

- `intentional_decisions.idd_id` is TEXT — NEVER assume `id INTEGER` (DLA-07 design decision)
- `embedding_queue.processed` is INTEGER 0/1 — NEVER assume `status TEXT`
- `tech_debt_items` has both INTEGER `id` (auto-PK) and TEXT `debt_id` (business key) — use `debt_id` for cross-references
- `pattern_observations` and `tech_entries` have **0 indexes** — full table scans for non-trivial filters; consider `LIMIT` always
- `*_embeddings` tables use `generated_at` (NOT `created_at`)

### IDD → context_entries sync triggers (DLA-08, 2026-04-11)

3 triggers: `sync_idd_insert_to_context` / `sync_idd_update_to_context` / `sync_idd_delete_to_context` keep `context_entries.source_idd_id` reverse-lookup mirror in sync. Verified: UPDATE IDD-COM-001 title → context_entries row count pre=1 post=1 (no duplicate). See SKILL.md §2.2 for full trigger source.

## 4. Regeneration Protocol

Until Layer 2 `regen-db-schema-doc.js` ships, regenerate this doc by:

1. Recreate `.context-db/__regen-temp.cjs` (Story F1 V2-01-FIX Layer 1 spec) and `.context-db/__regen-md.cjs`
2. `node .context-db/__regen-temp.cjs > .context-db/__regen-result.json`
3. `node .context-db/__regen-md.cjs` (writes `__regen-output.md`)
4. `Skill(saas-to-skill)` Mode B → integrate `__regen-output.md` into this file (replace §1 Quick Reference + recompute Speed Lookup Cheatsheet)
5. Delete temp files (`__regen-*.cjs`, `__regen-result.json`, `__regen-output.md`)
6. Bump SKILL.md `version` (patch — schema snapshot refresh)

## 5. Cross-References

- `.claude/rules/context-memory.md` §DB Schema-First Mandate (mandatory verification flow before any DB query)
- `.claude/skills/phycool-context-memory/SKILL.md` §2 (architectural overview, this doc = schema reference layer)
- Story `當前開發環境配置健檢任務/stories/ENV-CHECK-V2-01-FIX-db-schema-drift.md` (full Layer 1-3 plan)
- Memory id=3959 (2 root-cause modes — A bash-PowerShell escape / B DB schema 假設)
- Memory id=3960 (V1 投機違規 lesson)
- `memory/_archive/2026-05-05-tier-D/` — historical schema migration lessons
