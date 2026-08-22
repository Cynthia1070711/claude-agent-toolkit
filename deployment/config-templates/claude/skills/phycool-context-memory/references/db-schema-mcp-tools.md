# phycool-context-memory — §2 DB Schema (55 實體基表 + 14 FTS5) + §3 MCP Tools (36 = 24 stable + 4 instinct WIP + 4 worker-protocol + 4 ctrl-channel)

> **抽出自** `.claude/skills/phycool-context-memory/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §2 DB Schema + §3 MCP Tools。
> **2026-05-27 P4 校正**: real tables 50→43(DB PRAGMA 實測,排除 13 FTS5 main + 53 FTS5 影子表 = 109 total objects);tools 24→**28**(server.js 28 case = 24 stable + 4 instinct WIP,口徑對齊架構全景 README §Layer4)。
> **2026-07-27 whp-3-db-schema-registry 二度校正**: real tables 43→**63**(當日直接 PRAGMA 實查:`sqlite_master` type='table' 總數=115、shadow=52 → 115−52=63;此數含本卡新增 4 表 `worker_runs`/`worker_messages`/`worker_handoffs`/`guardian_heartbeat`,加表前實查為 59)。詳 [db-schema.md](db-schema.md) §0/§A/§B/§C/§1。
> **2026-07-28 whp-5-message-bus-mcp**: tools 28→**32**(新增 `search_worker_runs`/`ack_worker_run`/`gate_worker_run`/`add_worker_message`,對 whp-3 四表落地執行權 CAS + 訊息狀態機;零 schema 變更)。詳 §3 Worker Protocol Tools。
> **2026-07-28 ccb-1-db-mcp-import 三度校正 + 計數口徑明示**: 「63 real」係 `115−52` 誤算未扣 FTS5 主表本身,改用**三欄分列**:實體基表 = **53**、FTS5 虛擬主表 = **14**、shadow = **56**(53+14+56=123 驗算通過)。新增 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 4 實體基表 + `ctrl_messages_fts` 1 FTS5 虛擬表。tools 32→**36**(新增 `post_ctrl_message`/`read_ctrl_messages`/`close_ctrl_thread`/`update_ctrl_board`)。詳 [db-schema.md](db-schema.md) §0(計數口徑)+ §3c Ctrl-Channel Tools。
> **2026-08-03 ccb-4-ctrl-notify-knock**: 實體基表 54→**55**(新增 `controller_windows`,11 欄 1 索引,`session_id TEXT PRIMARY KEY`)。這張表存在的理由是結構性的:`Stop` 與 `PostToolUse` 的 stdin **沒有 `prompt` 欄位**(官方 schema 實 fetch 確認),而 `ctrl-channel-inject.js` 四條軌別解析路徑有三條依賴 prompt 文字 —— 沒有 registry,ccb-4 新增的兩個通知掛點在結構上無從得知自己是哪一軌。零 FTS5/shadow 增量、零 trigger、零 MCP tool 新增(掛點直接以 better-sqlite3 讀寫,不經 MCP 層)。55+14+56=125 驗算通過。詳 [db-schema.md](db-schema.md) §0 + `phycool-ctrl-channel` skill(該表的用途與生命週期)。
> **2026-07-28 tdb-1-track-plan-roadmap**: 實體基表 53→**54**(新增 `track_plan`,8 欄 2 索引,排程層 lane/seq/plan_state;刻意不建 FK — `INSERT OR REPLACE INTO stories` 在預設 `PRAGMA foreign_keys=1` 下會觸發 `ON DELETE CASCADE` 靜默清空子表,故參照完整性改在應用層檢查)。零 FTS5/shadow 增量、零 MCP tool 新增(YAGNI,`server.js` 未變)。54+14+56=124 驗算通過。詳 [db-schema.md](db-schema.md) §0。

---

## 2. DB Schema (55 實體基表 + 14 FTS5 virtual, 5 Phases + DLA-07/08 · epic-whp · epic-ccb · epic-tdb · DB PRAGMA 2026-08-03 實測)

> **PRAGMA verified 2026-05-08** — full DDL / column / index per-table detail in [`references/db-schema.md`](db-schema.md). Speed Lookup Cheatsheet (PK / timestamp / 8 assumption traps) at top of that file. **Do not assume column names** — Read schema reference or run `PRAGMA table_info('{table}')` first.

| Phase | Core Tables | Status |
|-------|------------|--------|
| Phase 0 (PoC) | context_entries (FTS5, +source_idd_id since dla-08), tech_entries (FTS5), sprint_index | Complete |
| Phase 1 (Core) | stories (FTS5), cr_reports/issues (FTS5), symbol_index/deps/embeddings, doc_index/chunks/embeddings, tech_debt_items (FTS5), conversation_sessions/turns (FTS5) | Complete |
| Phase 4 (Learning) | embedding_queue, pattern_observations, 5 embedding tables, retrieval_observations/hits/keywords | Complete |
| Phase 5 (Extended) | glossary (FTS5), workflow_executions, benchmarks, test_journeys, test_traceability, pipeline_checkpoints | Complete |
| DLA-07 (IDD) | intentional_decisions (FTS5) — 4 sub-types COM/STR/REG/USR + 4-layer annotation lifecycle | Complete |
| **td-god-nodes** | **god_nodes** — weighted PageRank projection of symbol_index. 14 columns: symbol_id PK FK→symbol_index, file_path, start_line, end_line, domain, centrality_score, in_degree, out_degree, weighted_in_degree, weighted_out_degree, blast_radius (CHECK: critical/high/medium/low), is_generated, is_test, computed_at. 4 indexes: centrality DESC / domain / blast_radius / computed_at. Populated by `scripts/compute-centrality.cjs`. Migration: `2026-05-11-add-god-nodes-table.sql`. | **Complete 2026-05-11** |

Full DDL + per-table definitions: [references/db-schema.md](db-schema.md)

### 2.1 context_entries.source_idd_id (dla-08, 2026-04-11)

TD-DLA07-M2 fix via Migration `2026-04-11-add-source-idd-id-to-context-entries.sql`:

```sql
ALTER TABLE context_entries
    ADD COLUMN source_idd_id TEXT NULL REFERENCES intentional_decisions(idd_id);
CREATE INDEX IF NOT EXISTS idx_context_entries_source_idd_id ON context_entries(source_idd_id);
```

**Why**: dla-07 sync trigger was INSERT-only, UPDATEs on `intentional_decisions` produced duplicate mirror rows in `context_entries`. `source_idd_id` provides reverse-lookup anchor so UPDATE/DELETE triggers can locate the correct mirror row.

### 2.2 IDD → context_entries Sync Triggers (3 triggers since dla-08)

```
sync_idd_insert_to_context  AFTER INSERT ON intentional_decisions
  → INSERT new row into context_entries with source_idd_id = NEW.idd_id

sync_idd_update_to_context  AFTER UPDATE ON intentional_decisions
  WHEN (title/decision/reason/forbidden_changes/... NOT equal)
  → UPDATE context_entries WHERE source_idd_id = OLD.idd_id
     (updates title + content + tags + related_files in place)

sync_idd_delete_to_context  AFTER DELETE ON intentional_decisions
  → DELETE FROM context_entries WHERE source_idd_id = OLD.idd_id
```

**Verified (dla-08 Phase 4)**: UPDATE IDD-COM-001 title → context_entries row count pre=1 post=1 (no duplicate). Rollback via `2026-04-11-add-source-idd-id-to-context-entries-down.sql` restores legacy INSERT-only trigger.

### Rules File Consolidation (ctx-2377)
9 rules files (verified 2026-03-29): auto-skill-detection, code-quality, constitutional-standard, context-memory, skill-sync-gate, spec-timeliness, tasks-backfill, testing, verification-protocol.

---

## 3. MCP Tools (36 MCP Tools = 24 stable[18 read + 6 write] + 4 instinct WIP[ECC 湧現子系統,見 README §Layer4] + 4 worker-protocol[epic-whp,見 §3b] + 4 ctrl-channel[epic-ccb,見 §3c], v2.8.0 added search_god_nodes for ADR-GOVERNANCE-001; v2.10.0 added DevConsole UI Consumer use cases — Story td-devconsole-godnode-and-mem-dashboard; v2.12.0 added §3b worker-protocol tools — Story whp-5-message-bus-mcp; v2.13.0 added §3c ctrl-channel tools — Story ccb-1-db-mcp-import)

### Read Tools (18) — When to Use vs Not For

| Tool | Phase | Purpose | When to use vs Not for |
|------|:-----:|---------|-----------------------|
| `search_context` | 0 | FTS5 search context memory | **Use**: 文字記錄查詢(decision/session/pattern/debug)。**Not for**: code symbol(用 search_symbols)/ graph(用 search_god_nodes) |
| `search_tech` | 0 | Search technical solutions / bugfix / failure cases | **Use**: 「之前怎麼 fix 過類似 bug」。**Not for**: 一般 context |
| `trace_context` | 0 | Recursive CTE trace entity relationships (depth 1-2) | **Use**: 跨對話 thread 追溯歷史決策(category=session)。**Not for**: code dependency(用 get_symbol_context) |
| `search_symbols` | 1 | LIKE keyword search symbol_index | **Use**: 已知 symbol name keyword 找候選。**Not for**: ranking by importance(用 search_god_nodes) |
| `get_symbol_context` | 1 | Full code + 2-level graph dependency expansion | **Use**: 修改前 BlastRadius 詳細評估,取 deps_layer1 + deps_layer2 完整影響鏈 |
| **`search_god_nodes`** ★ | **td-god-nodes** | **High centrality production symbols (ADR-GOVERNANCE-001 Layer 3)** | **Use**: dev-story 啟動取 domain top god node / CR Phase 0.5 BlastRadius / cross-Story refactor 衝突識別。Primary path: queries `god_nodes` JOIN `symbol_index` — response includes `blast_radius` (critical/high/medium/low, P95/P75/P50), `computed_at`, `is_stale`, `domain`. New filter param: `blast_radius` ("critical"\|"high"\|"medium"\|"low"). Fallback: if god_nodes empty → legacy symbol_index.centrality_score (with stderr warning). 7-day staleness → `is_stale:true` + hint in response. Upstream: `scripts/compute-centrality.cjs` (RELATION_WEIGHTS weighted PageRank). |
| `semantic_search` | 2 | ONNX 384D cosine on symbol_embeddings (Hybrid Fusion) | **Use**: 自然語言語意搜尋。**Not for**: 結構性圖查詢 |
| `list_sessions` | CMI-3 | Timeline query conversation_sessions | **Use**: 查歷史 session 列表。**Not for**: full-text(用 search_conversations) |
| `search_conversations` | CMI-3 | Conversation full-text search | **Use**: 「之前問過 X 嗎」問答配對 |
| `get_session_detail` | CMI-3 | Single session per-turn details | **Use**: 已知 session_id 取完整 turns |
| `search_documents` | CMI-5 | Document semantic search (Hybrid Fusion) | **Use**: 跨 ADR/Spec/PRD 文檔搜尋 |
| `search_stories` | DB | Story FTS5 multi-condition filter (CMI-12: precise query 含 46 fields) | **Use**: 查 Story 完整內容。`include_details:true` + `story_id` 取無 truncation 完整資料 |
| `search_debt` | DB | Tech debt search (with stats via include_stats) | **Use**: 查 tech debt by story_id / target_story / status / severity |
| `search_glossary` | 5 | FTS5 search glossary (canonical_name + aliases + description) | **Use**: 術語定義查詢避免歧義 |
| `search_intentional_decisions` | DLA-07 | IDD-COM/STR/REG/USR 查詢 | **Use**: 查 intentional decision forbidden_changes / code_locations |
| `get_intentional_decision` | DLA-07 | 單一 IDD 完整內容(by idd_id) | **Use**: 已知 IDD-XXX 取完整 metadata |
| `verify_intentional_annotations` | DLA-07 | 驗 code annotation `[Intentional: IDD-XXX]` 與 DB 一致性 | **Use**: dev-story / CR audit IDD 標註完整性 |
| `get_patterns` | 4 | Query pattern_observations (domain filter + confidence + domain_stats) | **Use**: 查 file-change 行為 pattern。**Not for**: code structural pattern |

### Write Tools (6)

| Tool | Phase | Purpose | When to use |
|------|:-----:|---------|-------------|
| `add_context` | 0 | Write workflow summaries, decision records, infrastructure-evolution | category=decision/session/pattern/debug/audit/intentional/infrastructure-evolution/rule_violation |
| `add_tech` | 0 | Write technical findings, architecture decisions | bugfix / pattern / failure case 紀錄 |
| `add_cr_issue` | 0 | Write Code Review findings | step-04 auto-fix 後寫入 cr_issues 表 |
| `add_intentional_decision` | DLA-07 | Insert / update IDD-COM/STR/REG/USR | code-review Phase 1.5 IDD detection 後 |
| `log_workflow` | 5 | Record workflow execution (type/story/agent/status/tokens/duration) | create-story / dev-story / code-review 結束 |
| `upsert_benchmark` | 5 | Insert or update performance benchmarks (UNIQUE metric+context) | retrieval recall / token reduction 量化 |

Full reference: [mcp-tool-reference.md](mcp-tool-reference.md)

### 3b. Worker Protocol Tools (4, NEW v2.12.0 — epic-whp / whp-5-message-bus-mcp)

> **背景**: `whp-3-db-schema-registry` 建好 `worker_runs` / `worker_messages` / `worker_handoffs` / `guardian_heartbeat` 四表,但沒有任何 MCP tool 能寫入。本組 4 tool 把 SSoT §19.3「執行權」從文件約定變成 SQL `WHERE` CAS 條件 — 中控在 worker 還在跑時誤按核可,系統回應「影響零筆」而非產生錯誤裁決紀錄。CAS 邏輯全放 `.context-db/scripts/worker-protocol-ops.js`(理由:`server.js` 僅 export `parseDateExpr` 一個符號,import 會拉入 embedder 依賴鏈,獨立模組才能被 vitest 真正 import 出貨程式碼)。

| Tool | 用途 | 關鍵 CAS 條件 |
|------|------|--------------|
| `search_worker_runs` | 查派發歷程 / 待簽收佇列(`pending_ack`)/ 殭屍清單。唯讀,**故意不列入** `SEARCH_TOOLS`(worker_runs 為運行狀態非可檢索知識,且 entryId 抽取鏈 `r.id ?? r.story_id ?? r.session_id` 會誤記 `session_id`) | 無(唯讀) |
| `ack_worker_run` | 中控簽收(reported → awaiting-review) | `WHERE run_id=? AND lifecycle='reported'` |
| `gate_worker_run` | 中控裁決(approved/revise/rejected),裁決 + lifecycle 推進 + 指示訊息同一 transaction 原子完成 | `WHERE ack_at IS NOT NULL` 前置 + `WHERE run_id=? AND gate_result='pending'` |
| `add_worker_message` | 發指示 / 喚醒 / 回覆;`mode`(append\|replace)無預設值,必須明示 | `(run_id, seq)` 唯一索引,seq 於 `BEGIN IMMEDIATE` 內配置 |

**使用時機**:
- create-story `search_worker_runs` 前置檢查「同 story 是否已有非終態 run」(SSoT §S0 第 2 項)
- 中控從主視窗簽收 / 裁決子視窗回報,不需離開主視窗讀 IPC 檔
- `run_mode='inline'` 的 run(中控親自執行、無視窗)四 tool 一視同仁,唯一差異是 approve 後直接收斂到 `closed`(G26)

**Not for**: worker → controller 的送達通道(`pending → delivered → consumed` 由 D1/D2,whp-6/whp-11 承接,本組 4 tool 永不寫 `delivered`/`consumed`)。

Full reference: [mcp-tool-reference.md §3b](mcp-tool-reference.md)

### 3c. Ctrl-Channel Tools (4, NEW v2.13.0 — epic-ccb / ccb-1-db-mcp-import)

> **背景**: 跨軌中控溝通原以 2 個 markdown 聊天室(`AGENT溝通管道/非同步聊天訊息討論專區.md` + 校正區版)+ 15 封存檔為載體,371 則留言 / 176 個話題全靠人工 9 欄格式維護,同讀同寫 race + commit 污染 + 簽收靠人眼 + 歸檔靠手搬。本組 4 tool 為 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 四表(+ `ctrl_messages_fts` trigram)的**唯一寫入路徑**。歷史留言已一次性冪等 import(371 則零損失遷入,對帳 PASS),兩個主 `.md` 已貼凍結標頭轉唯讀。

| Tool | 用途 | 關鍵 CAS 條件 |
|------|------|--------------|
| `post_ctrl_message` | 發訊息;未帶 `thread_id` 自動建題(流水號格式 `YYYY-MM-DD HH:mm:ss`) | closed thread 拒發(CAS 非 isError);`superseded_by` 限本軌自己訊息 |
| `read_ctrl_messages` | 讀訊息(兼 list/未讀/依題/依分類/依頻道),讀取即自動簽收。**故意不列入 `SEARCH_TOOLS`**(回傳形狀 `{messages,count,signed}` 不符任一解析分支,且每次呼叫必有簽收副作用,不符 SEARCH_TOOLS 隱含唯讀前提) | 無(NOT EXISTS 子查詢過濾 unread_only) |
| `close_ctrl_thread` | 關閉話題(CAS,單句 UPDATE) | `WHERE thread_id=? AND initiator_track=? AND state='open'` — 僅發起軌可關閉,不提供 reopen 路徑 |
| `update_ctrl_board` | 更新共享看板(如 Staging DB 使用登記),`state` 須符合 `BoardState` shape(status/holder/history 必填) | `WHERE board_id=? AND version=?` 樂觀鎖,version 不符回最新完整 state 供重讀重試 |

**使用時機**:
- 跨軌(前台軌/後台軌/azure 佈署軌/賦能軌)溝通一律走 `post_ctrl_message`,禁止繼續寫舊 `.md`(已凍結)
- 每階段完成後 `read_ctrl_messages({unread_only:true})` 檢查是否有待簽收留言
- Staging DB 開關前後走 `update_ctrl_board({board_id:'staging-db',...})` 取代手動編輯看板表格

**MCP 不可用緊急 fallback**:允許臨時以舊格式寫 `.md`(僅限緊急,非常態),恢復後執行 `node .context-db/scripts/import-ctrl-channel.js --report` re-import(`UNIQUE(thread_id,seq)` 冪等鍵防重複)。詳 `.claude/skills/phycool-ctrl-channel/SKILL.md`。

Full reference: [mcp-tool-reference.md §3c](mcp-tool-reference.md)

### 3a. God Node Use Case Patterns (NEW v2.8.0, ADR-GOVERNANCE-001)

> **背景**: PCPT 既有 `symbol_dependencies` graph + `expandDependencies` 2-hop + `RELATION_WEIGHTS` 量化 + 8063 symbols 100% embedding 已 ready,但 BMAD workflow 0 命中調用(揭示「Latent Capability Trap」反模式)。v2.8.0 新增 `search_god_nodes` 補完 + 文檔教學使用範式。

#### Use Case 1 — dev-story 啟動定位核心檔(替代多輪 grep + Read)

```javascript
// dev-story step-05 §0.5 啟動前 god node 預檢
mcp__phycool-context__search_god_nodes({
  domain: "Payment",  // from story.domain or keyword inferred
  limit: 5
})

// Output 範例:
// [{ symbol_name: "RefundService", centrality: 30.60, file: "...:12-458" },
//  { symbol_name: "ECPayGatewayService", centrality: 25.28, file: "..." },
//  { symbol_name: "OrderService", centrality: 16.88, file: "..." }]

// 替代:
// - grep "RefundService" → search → Read
// - grep "OrderService" → search → Read
// - grep "WebhooksController" → search → Read(多輪)
```

**Token 減量**: ~3-5K token / Story 啟動(對齊 ADR-GOVERNANCE-001 §7.1)

#### Use Case 2 — code-review Phase 0.5 BlastRadius 自動補值(替代主觀估算)

```javascript
// 對 finding(file:line)取 symbol centrality_score → 自動補 BlastRadius
const ctx = mcp__phycool-context__get_symbol_context({ symbol_id: <from search_symbols> });
const centrality = ctx.symbol.centrality_score;

// 對照表(centrality_score → Priority Score 公式 BlastRadius):
// ≥ P95 (≥ 50.0) → BlastRadius = 10(全站)
// ≥ P75 (≥ 5.0)  → BlastRadius = 5(模組)
// ≥ P50 (≥ 0.5)  → BlastRadius = 2(單檔)
// < P50          → BlastRadius = 1(單行)
```

**對齊**: `cr-debt-doc-audit.md` Phase A2「禁止以估算成本替代實際試修」精神 — BlastRadius 量化來自 graph 真值,不是主觀估計。

#### Use Case 3 — Cross-Story Refactor 衝突識別

```javascript
// create-story step-06 §8.5 IDD Warning + step-06.5 D6 Cross-Story Consistency
// 對每個 affected file/symbol,檢查是否為高 centrality god node
const godNodes = mcp__phycool-context__search_god_nodes({
  domain: "Editor",
  limit: 10
});

// 若 Story A 與 Story B 同 epic 共改 high-centrality god node → BLOCK
// (對齊 capability-integration-mandate.md Step 2 BMAD 整合)
```

#### Use Case 4 — 修改前 BlastRadius 詳細評估

```javascript
// 已知 symbol_id,展開完整 2-hop dependency 鏈
mcp__phycool-context__get_symbol_context({
  symbol_id: 1234,
  depth: 2  // Layer 1 direct + Layer 2 transitive
})

// 回傳 deps_layer1 + deps_layer2 完整影響鏈
// 用途: 修改前確認「改 RefundService 會影響 N 個 caller」
```

#### Use Case 5 — DevConsole UI Centrality Dashboard(Human 視角項目健康度評估,NEW v2.10.0)

> **背景**: Use Case 1-4 為 AI Agent 視角(MCP tool 被動或主動消費),Use Case 5 為 **Human 視角**(專案主透過 DevConsole `/god-nodes` 直觀評估「centrality 數據是否活著 + 重要 god node 是哪些」)。Story `td-devconsole-godnode-and-mem-dashboard` 落地,對齊 `capability-integration-mandate.md` §3 Step 2 BMAD 整合的 UI 延伸層。**R2 redesign**(2026-05-02 user feedback):取消 Treemap(「一大片色塊無意義」inherently 不適合 ranking 場景)→ 改用 `/patterns` + `/rule-violations` 範式 — Status Bar + Top List ranking + By Namespace breakdown。

```bash
# DevConsole 部署後直接訪問
curl http://localhost:5174/god-nodes  # vite dev
# 後端 endpoint(reuse search_god_nodes 邏輯,godNodeService.ts ↔ server.js:1791-1842)
GET /api/godnodes?limit=20&namespace=PhyCool.Web.Services&include_generated=false
GET /api/godnodes/distribution  # 含 last_computed + by_namespace breakdown + P50/P75/P95/P99
```

**頁面結構**(`tools/dev-console/src/pages/GodNodes.tsx`,對齊 /patterns Embedding Status Bar + Domain Activity 範式):
- **Top Status Bar 6 chips**:📊 總 Symbols / ⭐ Non-Zero god nodes (pct%) / 🔝 Max / 📈 P95(god 上層門檻)/ 📉 Median / 🔄 **Last Indexed**(視覺確認「centrality 數據活著」— last_computed proxy = MAX(symbol_index.indexed_at))
- **Filter Bar**:Top-N {10/20/50/100} + Namespace dropdown(動態 distinct)+ include_generated checkbox
- **Top List Table**(left main):# rank / Symbol button(click → vscode://) / Namespace chip(顏色 by cluster `hslByCluster()`)/ **Centrality bar**(寬度 = score/max,顏色 by cluster) + score number / file:line + 📋 copy
- **By Namespace Sidebar**(right):前 12 namespace + count + bar(count/maxNsCount)+ ↑max,點擊即 filter
- **Distribution Stats panel**(right):8 chips Min/Max/Mean/Median/P50/P75/P95/P99 + BlastRadius 分位 note
- **Click action**:`vscode://file/{absolute_path}:{start_line}` URI(W3C)+ 「複製路徑」navigator.clipboard fallback

**為何放棄 Treemap**(R2 lesson):Treemap 適合「比例 share of whole」(100% 切分 hierarchy),但 centrality_score 是「絕對重要性」不是 percentage share — 強行套用會 (1) box size 接近模糊化 ranking(83 vs 5 = 16 倍但視覺差異弱)+ (2) cluster aggregation labels 顯示 undefined/總和 失去 individual symbol 資訊密度。**Bar chart ranking 反而更直觀** — 這是「強行套用不適合的 viz」反模式。

**反模式守護**(對齊 補全計畫 §3 F-S6):
- ❌ 引入 D3.js / Recharts(11 IDE skill 變體爆炸反模式)
- ❌ 硬編碼 Hex 色彩(必走 `--dvc-*` design tokens + `hslByCluster()` deterministic hsl(hash, 60%, 50%))
- ❌ 無 fallback 的 vscode:// URI(必雙軌 click + clipboard)
- ❌ **(R2 lesson)** 強行用 Treemap 表達「絕對重要性 ranking」— Treemap 適合 hierarchy share,不適合排名;ranking 用 bar chart 或 ranked list with score bars

#### Use Case 6 — Memory DB Dashboard 4 Charts(`/patterns` sidebar,NEW v2.10.0)

> **背景**: 既有 `/patterns` 頁面 sidebar 5 cards 純文字(Domain Activity / Memory Coverage / Retrieval Activity / Hot Entries / Top Keywords)。v2.10.0 新增 4 chart 視覺化 Memory DB 健康度,協助 cleanup / stale 策略決策。

```javascript
// Backend endpoints(memoryDashboardService.ts,4 SQL aggregations)
GET /api/dashboard/daily-context?days=30   // BR-MEM-001: Line by category(decision/pattern/debug/audit/...)
GET /api/dashboard/debt-severity            // BR-MEM-002: stacked Bar(severity × status,LOWER 正規化)
GET /api/dashboard/idd-subtypes             // BR-MEM-003: Doughnut(COM/STR/REG/USR)
GET /api/dashboard/story-funnel             // BR-MEM-004: horizontal Bar(5 stages + Other)
```

**Chart components**(`tools/dev-console/src/components/charts/`):
- DailyContextTrendChart.tsx(Line, react-chartjs-2,by category split)
- TechDebtSeverityChart.tsx(Bar with `stacked: true`)
- IDDSubtypesChart.tsx(Doughnut with center total)
- StoryStatusFunnel.tsx(Bar with `indexAxis: 'y'` horizontal funnel)

**SSoT 對齊**: 4 charts 全 read-only on existing schema(context_entries / tech_debt_items / intentional_decisions / stories),0 新建 backend logic。

#### When NOT to Use

- **單純 keyword 找 symbol**: 用 `search_symbols`(LIKE),不需 god node ranking
- **語意相似度查詢**: 用 `semantic_search`(ONNX cosine)
- **跨對話 thread 追溯**: 用 `trace_context`(non-code graph,走 conversation/decision)
- **找最近 session**: 用 `list_sessions` / `search_conversations`

---


---
