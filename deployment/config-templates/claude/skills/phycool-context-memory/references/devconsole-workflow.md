# phycool-context-memory — §9 DevConsole + §12 Workflow Integration + §13 Troubleshooting

> **抽出自** `.claude/skills/phycool-context-memory/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §9 DevConsole + §12 Workflow Integration + §13 Troubleshooting。

---

## 9. DevConsole Web UI (DVC)

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 6 + React 18 + TypeScript |
| Backend | Express 5 + tsx watch + better-sqlite3 |
| Access restriction | localhost-only (no auth, dev tool) |
| Start | `npm run dev` (tools/dev-console/) |

### Routes

```
/dev-console
+-- /dashboard          Overview (Story distribution + recent activity + health + Embedding KPI + Symbol Coverage)
+-- /stories            Kanban board + status ops + SDD Badge + completion filter (未完成/已完成/全部)
|   +-- /:id            Story detail + Markdown render + Tracking Timeline
+-- /memory             Memory search + category browse + CRUD
|   +-- /sessions       Session timeline + tag collapse (max 10)
|   +-- /decisions      Technical decision index
|   +-- /debug          Debug knowledge base
+-- /sprint             Sprint progress charts + Tech Debt + dependency graph
+-- /cr-issues          CR issue list + severity tabs
+-- /tech-debt          Tech debt tracking (DB-first) + click-to-expand detail panel
+-- /reviews            Review reports + module progress
+-- /documents          Doc browse + FTS5 search + VS Code links
+-- /schema             Schema Explorer (dynamic table browser — auto-adapts to schema changes)
+-- /patterns           Continuous Learning (3-layer: KPI status bar + memory coverage + sidebar domain + observations)
+-- /workers            Pipeline 工作台(epic-whp)— 3 tabs(現場/歷程/稽核)+ 4 段待辦佇列 + 右側抽屜
|   +-- /:runId         同頁抽屜(非另一頁)— 時間軸 + 溝通串 + 交接證據鏈
+-- /settings           Connection settings + export + health check + script runner
```

> **注意**: 本表為手動維護索引,非自動生成——多個先前 Story(如 `/emergence`、`/reviews/findings`、`/rule-violations`)新增的路由尚未回補,已知有 drift。`/workers` 為 whp-10-devconsole-ui(2026-07-28)所補;其餘缺口留待各自觸碰時 Boy Scout 補齊,不在本次同步範圍內。

Architecture details: [web-ui-architecture.md](web-ui-architecture.md)

---

## 10. Language Charter (CRITICAL)

```yaml
English fields (AI filter/query keys):
  tags[], category, agent_id, story_id, epic_id, canonical_name, metric_name
  Example: tags=["signalr","hub"], category="pattern"

Traditional Chinese fields (human-readable content):
  title, content, solution, lesson, problem, description
  Example: title="OnDisconnectedAsync must clean up all groups"

Code/paths/IDs (English):
  file_path, code_snippets, symbol_name
```

---

## 11. Token Reduction

**Quantified baselines**: Session -78% / Sprint Status -93% / Repeated errors -90% / Cold start -70%.

**Hybrid Fusion Search**: `final_score = 0.7 * vector + 0.3 * fts5_bm25`. FTS5 trigram >= 3 chars per term, 2-char LIKE fallback. Multi-word queries auto-split into AND terms (e.g., "image panel free" → `"image" AND "panel" AND "free"`).

**Local ONNX**: Xenova/all-MiniLM-L6-v2 (384D), $0 cost, 10-30ms CPU, offline capable.

---


---

## 12. Workflow Integration Pattern

### Pre-retrieval Injection (GC Report Design Principle)

```
User starts task -> Step 0: parse intent -> query MCP (search_context + search_tech + trace_context)
  -> assemble <historical_context> XML -> Step 1~N: main workflow (no mid-workflow DB queries)
  -> Step Final: batch write (add_context / add_tech / log_workflow)
```

### Post-workflow Logging

```
Workflow completes (create-story / dev-story / code-review / custom)
  → Step Final: log_workflow(workflow_type, status, agent_id, tokens, duration)
  → Dashboard Recent Activity merges workflow_executions + context_entries (session)
  → DevConsole /schema can browse raw workflow_executions table
```

Dashboard integration: `server/routes/dashboard.ts` queries both `context_entries WHERE category='session'` and `workflow_executions`, merges by timestamp, returns top 15.

**Token 數據品質（Session 15 補全）**:
- 種子/估計數據標記 `--seed-estimate` 後綴 → Backend 查詢自動排除（`WHERE workflow_type NOT LIKE '%--seed-estimate%'`）
- `/api/workflows/stats` 回傳 `zeroTokenPct`（0~100）數據品質指標
- Dashboard 在 `zeroTokenPct > 80` 時顯示黃色警告橫幅
- OTel Micro Collector（`phycool-otel-micro-collector` Skill）上線後 token 數據逐步填充，警告自動消失
- 相關程式碼: `tools/dev-console/server/services/workflowService.ts` + `src/pages/Dashboard.tsx`

**BMAD Workflow 已整合** (Step Final 自動呼叫 `upsert-story.js --merge/--inline` + `log_workflow`):
- **create-story Step 7**: `upsert-story.js --inline` 寫入 epic_id/domain/story_type/complexity/priority/user_story/background/acceptance_criteria/tasks/dev_notes/required_skills/file_list/implementation_approach/testing_strategy/definition_of_done/source_file/tags/dependencies/create_agent/create_completed_at；`record-phase-timestamp.js create-complete`
- **dev-story Step 9 §2b**: `upsert-story.js --merge {story_id} --inline '{"status":"review","dev_agent":"..."}'`；`record-phase-timestamp.js dev-complete`
- **code-review Step 6 §6**: `upsert-story.js --merge {story_id} --inline '{"status":"...","cr_score":N,"review_agent":"...","review_completed_at":"...","cr_issues_total":N,"cr_issues_fixed":N,"cr_issues_deferred":N,"cr_summary":"..."}'`；`record-phase-timestamp.js review-complete`
- 所有步驟均含 `search_stories` 驗證確認 DB 寫入成功後，再呼叫 `log_workflow`
- **Lifecycle Invariants**: `upsert-story.js` merge 模式內建 Layer 1 auto-status-promotion（backlog→ready-for-dev / →review / →done），防止 `*_completed_at` 與 `status` 不一致。規則詳見 `.claude/rules/story-lifecycle-invariants.md`
- **track_plan auto-exit**（epic-tdb tdb-1，2026-07-28）: 承上，auto-promotion 算完的**最終** status 若落在終態集合（`done` / `cancelled` / `cancelled-merged` / `superseded` / `split` / `skipped` / `deleted`），`upsert-story.js` 會**連帶**把該卡 `track_plan.plan_state` 改為 `'done-exited'` 並清 `seq`（`autoExitTrackPlan()`，掛在 `_doUpsert` 而非 `mergeStory`，故完整 upsert 與 merge 兩條路徑皆觸發）。三層降級：無 `track_plan` 列 → 靜默略過不憑空 INSERT；已是 `done-exited` → 不動 `updated_at`（避免製造假的排程異動時間）；`track_plan` 表不存在 → 僅 `console.warn` 不阻斷 Story 寫入（temp DB 測試常見）。**故看到 `plan_state` 「沒人動卻自己變了」屬預期行為，非資料異常**；排程維度的人工調整仍一律走 `upsert-track-plan.js`。

### Pipeline Context Recovery (cmi-recovery-01)

```
Context Overload → PreCompact saves pipeline_checkpoints + .track.md content snapshot
  → Compaction happens
  → SessionStart(compact) fires session-recovery.js
  → HANDOFF_PREFIX injected first (Hermes-inspired, td-38): 5 semantic items prevent re-execution of historical tasks
  → Legacy `[CONTEXT SUMMARY]:` detection: skip new prefix if old format already present
  → Stale detection: checkpoint.updated_at > 30 min → POSSIBLY STALE warning
  → Injects: HANDOFF prefix + active checkpoint + last 3 sessions ([Historical context] marked) + last workflow
  → Agent resumes with structured recovery context (5K tok budget, prefix ≤ 500 tok)
```

Components:
- `pipeline_checkpoints` table (structured pipeline state with orchestrator reasoning)
- `.context-db/scripts/pipeline-checkpoint.js` (--save/--update/--load/--recover/--active)
- `.claude/hooks/session-recovery.js` (SessionStart hook, compact|resume matcher, 30-min stale detection)
- `.context-db/scripts/context-budget-monitor.js` (80% warning, 95% critical)

### Truncation Warnings (cmi-recovery-01)

`pre-prompt-rag.js` 11-layer injection shows explicit warnings when token budget forces content truncation (Note: `ctr-p2-hook-intent` 起，`PHYCOOL_PROMPT_INTENT_ENABLED=true` 且 intent=discussion 時 Code RAG/LSP/IDD/Violations 不注入，故無對應截斷警告):
- Code RAG: `⚠ Code RAG 截斷：顯示 N/M 個符號`
- Session: `⚠ Session 截斷：顯示 N 條，M 條被省略`
- Document RAG: `⚠ Document RAG 截斷：顯示 N/M 個文檔片段`
- LSP 診斷: `⚠ LSP 診斷截斷：顯示 N/M 條`

Agent receiving these warnings should be aware of incomplete context and may need manual queries for dropped items.

### Graceful Degradation

MCP Server unavailable -> full fallback to standard file reading mode. Workflow **never blocks**.

---

## 13. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|---------|
| search_context returns empty but data exists | FTS5 trigram < 3 chars per term | Query needs >= 3 chars per term, or empty string + category filter |
| search_stories by story_id returns empty | Using query param instead of story_id param | Use `story_id` param for exact match, or `query` for FTS5 substring search (story_id is indexed) |
| MCP Server unresponsive | Stale process | `taskkill //PID //F` -> `/mcp` reconnect |
| ONNX model load fails | First-time download ~90MB | Check network, or manually place in `~/.cache/huggingface/hub` |
| DevConsole Stories returns [] | Windows CRLF | yaml-service.ts uses `split(/\r?\n/)` |
| Epic filter no results | `matchesEpicId()` fuzzy match | `deriveEpicId()` returns "mqv", Epic key "epic-mqv" |

---


---
