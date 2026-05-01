# Context Memory DB

SQLite Context Memory DB (MCP Tools) storing historical decisions, debug lessons, architecture patterns, incident records, session summaries.

## Conversation Start Ritual (CRITICAL — Mechanical Enforcement, Zero Manual Ops)

UserPromptSubmit Hook (`pre-prompt-rag.js`) auto-injects 11 layers of context on every prompt:
1. **Session history** (latest 3 + 5 user questions)
2. **Rule Violation Hot Zones** (Layer 11, td-rule-violation-rag-inject — 最近 30 天違規熱區 top-5 GROUP BY rule+phase)
3. **Task-aware Story progress** (detect Story ID from prompt → query `stories` table)
4. **Related tech debt** (Story ID linked `debt_entries`)
5. **Related technical decisions** (prompt keyword matching `context_entries` category=decision)
6. **Intentional Decisions (IDD)** (Layer 10, DLA-07 — intent-gated, active IDD 注入 forbidden_changes)
7. **Active Pipeline State** (pipeline_checkpoints stale 警告 30min+)
8. **Skill Recommendation** (skill-keywords.json 關鍵字匹配)
9. **LSP Diagnostics** (ecc-06 — C#/TS 編譯錯誤 intent-gated)
10. **Code RAG** (ONNX cosine + S_final fusion — intent=code only)
11. **Document RAG** (FTS5 document search)

Agent needs no manual query. Fallback if Hook fails (empty additionalContext): `search_context("", {category: "session", limit: 3})`.
If user asks "what did we do last time" → **must answer from memory DB**, never read YAML directly.

> Incident: 2026-03-07 violated this rule twice (read YAML skipping DB query), prompted CMI-1 creation.

## Query First (Before Starting Any Task)

Use `search_context` / `search_tech` to query relevant memory:
- BMAD workflow (create-story/dev-story/code-review) → query domain historical decisions and patterns
- Bug fix → query `category:debug` for similar issues
- Architecture decision → query `category:decision` / `category:architecture`
- Project status → query `category:session` latest records
- Story query → `search_stories` (FTS5 + epic/status/domain/complexity multi-filter)
- Tech debt query → `search_debt` (FTS5 + story/target/status/severity filter, `include_stats` for statistics)

## Write Discipline (After Task Completion)

When discovering new knowledge, write to DB via `add_context` / `add_tech`:
- New debug findings, architecture decisions, pattern confirmations → `add_context`
- Technical approach verification (success/failure) → `add_tech`
- Code Review findings → `add_cr_issue`
- **Tech debt items** → `node .context-db/scripts/upsert-debt.js` (DEFERRED/WON'T FIX, replaces registry.yaml)
- Conversation ending or major milestone → `add_context(category: "session")`
  - title: "Session Summary: {date} {main task}"
  - content: what was completed + current state + next steps
  - tags: `["session", "manual"]`
- Workflow completion → `log_workflow(workflow_type, status, agent_id, input_tokens, output_tokens)`
  - Automatically shown on Dashboard Recent Activity (merged with session records)
  - workflow_type: `create-story` | `dev-story` | `code-review` | custom name

Do NOT write: temporary operations, one-time query results, duplicate knowledge.

## Tech Debt DB Write (v2.0 — Replaces registry.yaml)

tech_debt_items table is the sole source of truth. registry.yaml + .debt.md are deprecated.
- **Push** (after code-review): `upsert-debt.js --inline '{...}'` for each non-FIXED issue
- **Pull** (before dev-story): prefer `search_debt` MCP Tool (`story_id` / `target_story` / `status` filter); CLI fallback `upsert-debt.js --query --target {story}`
- **Resolve** (after fix): `upsert-debt.js --resolve TD-xxx --by {agent} --in {story}`
- **Stats**: `search_debt(include_stats: true)` MCP Tool or `upsert-debt.js --stats [--epic {epic}]`

## DB-first Story SDD+ATDD Rules

DB-first Stories (e.g., Epic MQV) written via `upsert-story.js` directly to DB, **bypassing create-story workflow checklist**.
AC format must still follow SDD+ATDD+TDD spec:

- **AC format**: ATDD — Given {precondition} → When {action} → Then {verifiable result} (with concrete values)
- **BR mapping**: Each AC includes `[Verifies: BR-XXX]` (S complexity can inline; M/L/XL reference Spec)
- **M/L/XL Story**: Produce SDD Spec before DB write (`docs/implementation-artifacts/specs/`)
- **dev-story / code-review**: Downstream workflows still trigger SDD-TDD Bridge and VSDD checks

## Auto-Save Mechanism (Triple Insurance + OTel Token Tracking)

| Hook | Trigger | Behavior |
|------|---------|----------|
| **Stop** | Every Claude response complete | UPDATE existing within 2min, INSERT new if >2min |
| **SessionStart** | Every session start | otel-auto-start.js: 確保 collector port 49200 運行（冪等，rotation 由 collector 內部處理不重啟） |
| **SessionEnd** | Conversation end | log-session.js (unconditional INSERT) + otel-session-aggregate.js (glob-resilient: 讀 main-otel-info.json PoT + glob 所有 jsonl + marker 冪等 → UPDATE workflow_executions) |
| **PreCompact** | Before context compaction | Shares dedup logic with Stop |
| **UserPromptSubmit** | User submits prompt | Inject latest 3 session records into additionalContext |

> Agent doesn't need to manually write session records (Stop Hook handles it), but manual summaries recommended for major milestones.
> Token 追蹤全自動：SessionStart 啟動 collector → Claude 發送 OTLP → Collector 自動 daily rotate + 發佈 main-otel-info.json PoT → SessionEnd 聚合寫入 DB → DevConsole 可見。跨日邊界由 collector 內部 rotation + aggregate glob-resilient 保證零遺失（2026-04-14 修復，詳 `pcpt-otel-micro-collector` §S13）。

## Phase 4/5 Tables

### Phase 4 — Continuous Learning (auto-managed by hooks)

| Table | Write Mechanism | Read Mechanism |
|-------|----------------|----------------|
| `embedding_queue` | PostToolUse `observe-pattern.js` (auto) | Stop `incremental-embed.js` (auto) |
| `pattern_observations` | PostToolUse `observe-pattern.js` (auto, 18 domains) | DevConsole `/patterns` |
| `retrieval_observations` | MCP Server `logRetrieval()` (auto) | DevConsole `/patterns` 檢索活動 |
| `retrieval_hits` | MCP Server `logRetrieval()` (auto, per entry) | DevConsole `/patterns` 熱門條目 |
| `retrieval_keywords` | MCP Server `logRetrieval()` (auto, keyword extract) | DevConsole `/patterns` 搜尋關鍵字 |

Agent does NOT manually write to these tables — hooks and MCP Server handle it automatically.

### Phase 5 — Extended Tables (MCP write, DevConsole browse)

| Table | Purpose | Write | Read |
|-------|---------|-------|------|
| `glossary` | Unified terminology | Direct script / future MCP | `search_glossary` MCP tool |
| `workflow_executions` | Workflow tracking | `log_workflow` MCP tool | DevConsole `/schema` |
| `benchmarks` | Performance baselines | `upsert_benchmark` MCP tool | DevConsole `/schema` |
| `test_journeys` | E2E test routes | E2E workflow | DevConsole `/schema` |
| `test_traceability` | AC→Test mapping | `testarch-trace` workflow | DevConsole `/schema` |

## Context Overload Recovery Protocol

當 context 接近模型上限（Haiku/Sonnet 200K，Opus 1M）時：

### 主動防護措施
1. **Pipeline Checkpoint**：在啟動子任務前，先執行 `node .context-db/scripts/pipeline-checkpoint.js --save` 儲存 checkpoint
2. **PreCompact Auto-Save**：PreCompact hook 自動將進行中的 pipeline 狀態 + `.track.md` 檔案內容（前 500 字元）儲存至快照
3. **SessionStart Recovery**：Compaction 後，`session-recovery.js` 自動注入最後一筆 checkpoint + 最近 3 筆 session 摘要
4. **Stale Checkpoint Detection**：SessionStart 恢復時自動檢測 checkpoint 是否超過 30 分鐘未更新，超過則標記 `POSSIBLY STALE` 警告
5. **Truncation Warnings**：`pre-prompt-rag.js` 在 Session/Code RAG/Document RAG/LSP/IDD/Violation 因預算截斷時顯示 `⚠` 警告，Agent 知曉上下文不完整

### Context Budget Monitor（手動工具）
```bash
# 檢查目前 session 的 token 使用量
node .context-db/scripts/context-budget-monitor.js --model opus
# 輸出: { "usage_pct": 0.75, "warning": false, "tokens_used": 750000, "limit": 1000000 }
```
- `warning: true` → 已達 80% → 建議立即儲存 checkpoint
- `critical: true` → 已達 95% → 自動觸發 `pipeline-checkpoint.js --save`
- Exit code: `0`=正常, `1`=warning, `2`=critical

### Compaction 後恢復流程
1. SessionStart(compact) hook 觸發 → 讀取 `pipeline_checkpoints` + 最近 3 筆 session
2. 注入內容包含：pipeline 步驟/狀態、orchestrator 推理記錄、sub-window 狀態
3. **Stale 檢測**：若 checkpoint.updated_at 超過 30 分鐘，注入 `POSSIBLY STALE` 警告 — 子視窗可能已 crash
4. Agent **必須在繼續執行前驗證當前狀態**（注入的 context 可能已過時，尤其 stale checkpoint）

### Sub-Window Context 管理
- 每個 sub-window 透過 SessionStart hook 在啟動時取得 checkpoint context
- Sub-window 完成後更新 checkpoint：`pipeline-checkpoint.js --update --step N --result '{...}'`
- 若 sub-window 崩潰而未更新，orchestrator 透過 checkpoint 中缺少的 result 偵測到異常

### 手動恢復指令
若自動恢復失敗：
```bash
node .context-db/scripts/pipeline-checkpoint.js --recover  # 取得恢復提示
node .context-db/scripts/pipeline-checkpoint.js --active    # 列出進行中的 pipeline
```

---

## Context Compaction Recovery

Context compaction summaries are system-generated conversation summaries that may record incorrect execution methods.

### Recovery Rules

When detecting conversation resumed from compaction summary (signature: message starts with "This session is being continued from a previous conversation"):

1. **Never blindly trust summary's "how to do it"**: Summary records "what to do" usually correct, but "how" (file format, storage method, output path) may be wrong
2. **Force re-read original files**: Before any operation, read relevant README / spec files to confirm execution method
3. **Query memory DB**: `search_context` for related lesson records (e.g., DB-first, special conventions)
4. **Cross-validate**: When summary instructions conflict with project specs, project specs are authoritative

### High-Risk Scenarios

- Epic MQV: DB-first Story storage (no .md file creation)
- Any decision involving "create file vs write to DB"
- Special Epic conventions (storage method, naming rules, output format)

> Incident: 2026-03-07 compaction summary instructed creating .md files, violating Epic MQV DB-first rule (memory DB id=149)
