# Context Memory — MCP Tool Complete Reference (v2.3, 2026-07-28 ccb-1-db-mcp-import)

> 36 MCP Tools(24 stable + 4 instinct WIP + 4 worker-protocol + 4 ctrl-channel)完整參數清單、使用範例、語言憲章、容錯降級策略。
>
> **v2.1 changes (2026-05-02)**: 新增 `search_god_nodes`(Phase 1.5 Code Centrality);其餘 23 tools 對齊 SKILL.md §3 完整列表(search_intentional_decisions / get_intentional_decision / verify_intentional_annotations / add_intentional_decision / get_patterns / trace_context / upsert_benchmark / log_workflow / search_glossary 等已存在的 MCP tools 已於 server.js 註冊,本 references 後續補完逐一 spec)。
>
> **v2.2 changes (2026-07-28)**: 新增 §3b 4 個 worker-protocol tools(`search_worker_runs` / `ack_worker_run` / `gate_worker_run` / `add_worker_message`,epic-whp / whp-5-message-bus-mcp)。
>
> **v2.3 changes (2026-07-28)**: 新增 §3c 4 個 ctrl-channel tools(`post_ctrl_message` / `read_ctrl_messages` / `close_ctrl_thread` / `update_ctrl_board`,epic-ccb / ccb-1-db-mcp-import),取代 2 個 markdown 聊天室 + 15 封存檔的跨軌溝通載體。

---

## Phase 0 — 核心讀寫（6 Tools）

### 1. search_context

```
必填: query (string, >= 3 字元；空字串回傳最近 10 筆)
選填 filters:
  agent_id  → "CC-OPUS" | "CC-SONNET" | "GC-*"
  category  → "decision" | "pattern" | "debug" | "lesson" | "warning" | "session"
  story_id  → "qgr-a2" | "td-20" ...
  epic_id   → "qgr" | "td" ...
  limit     → 整數（預設 10，上限 50）
```

**使用時機**:
- Workflow Step 0：查同類 Story 過去失敗案例
- 對話開始：`search_context("", {category: "session", limit: 3})`
- Bug 修復前：`search_context("SignalR disconnect", {category: "debug"})`

### 2. search_tech

```
必填: query (string)
選填:
  category → "test_pattern" | "mock_strategy" | "bdd_scenario"
           | "architecture" | "performance" | "security"
           | "success" | "failure" | "workaround" | "bugfix"
           | "test_failure" | "test_infra" | "ac_pattern"
  limit    → 整數（預設 10）
```

**使用時機**:
- 實作前搜尋已知解法：`search_tech("BackgroundService PeriodicTimer")`
- 測試策略查詢：`search_tech("SignalR unit test", {category: "test_pattern"})`

### 3. trace_context

```
必填: entity_id (string) — Story ID / file path / Symbol name
選填:
  depth → 追蹤深度（1 或 2，預設 1）
```

**實作**：遞迴 CTE 從 `file_relations` 追蹤關聯 → Stories → tech_entries。

### 4. add_context

```
必填: agent_id, category, title (繁中), content (繁中)
選填: story_id, epic_id, tags (英文 JSON array), related_files
```

**寫入時機**:
- Workflow 完成後批次寫入
- 發現新架構決策
- Session 手動補充摘要

### 5. add_tech

```
必填: created_by, category, title (繁中), outcome
選填: problem, solution, lessons, code_snippets, tags, story_id, confidence
```

> **注意**: Agent 參數名稱是 `created_by`（非 `agent_id`），混用會報錯。

### 6. add_cr_issue

```
必填: agent_id, story_id, title
選填: issue_code, severity, dimension, summary, resolution, target_story, file_path
```

---

## Phase 1 — Code RAG（2 Tools, TD-33）

### 7. search_symbols

```
必填: keyword (string, >= 2 字元)
選填:
  symbol_type → "class" | "method" | "interface" | "enum"
  namespace   → 命名空間過濾 (e.g., "PhyCool.Web.Services")
  limit       → 整數（預設 10，上限 50）
```

**使用時機**：查詢特定 class/method 程式碼片段，避免讀取整個檔案。

### 8. get_symbol_context

```
必填: symbol_id (integer, 來自 search_symbols 結果)
選填:
  depth → 依賴展開層數（1 或 2，預設 1）
```

**使用時機**：深入查詢 Symbol 完整程式碼 + 依賴關係（calls/inherits/implements/uses）。

---

## Phase 1.5 — Code Centrality（1 Tool, ADR-GOVERNANCE-001 / 2026-05-02 新增）

### 8.5 search_god_nodes (NEW 2026-05-02)

```
必填: 無(全部選填,預設取 top-10 高 centrality god node)
選填:
  domain          → 命名空間關鍵字過濾(e.g., "Payment" / "Editor" / "Admin")
  min_centrality  → 數值門檻(預設 0,>0 = non-zero centrality only)
  limit           → 整數(預設 10,上限 50)
  include_filtered → boolean(預設 false 排除 Migrations/ModelSnapshot/Tests)
```

**使用時機**:
- BMAD `create-story` Step 3 Codebase Analysis: 取候選核心檔(替代全 Glob 多目錄掃描)
- BMAD `dev-story` Step 5 Implement: 啟動前取本 Story domain 高 BlastRadius symbol → 修改前必先 `get_symbol_context(depth=2)`
- BMAD `code-review` Phase 0.5: BlastRadius Auto-Lookup,centrality_score 對照閾值表自動填 Priority Score 公式
- 跨檔依賴推理: 識別 god node(centrality_score ≥ P95 = 50.0)後展開 2-hop 影響鏈

**Centrality 演算法**:
```
centrality_score = 0.6 * weighted_in_degree + 0.4 * weighted_out_degree

weighted_in / weighted_out = SUM(RELATION_WEIGHTS[t] for each edge)
RELATION_WEIGHTS = {inherits: 1.0, implements: 0.9, calls: 0.7, uses_inferred: 0.4}
```

> SSoT 對齊: `.context-db/scripts/compute-centrality.cjs` ↔ `.claude/hooks/pre-prompt-rag.js:82-87`(任一 drift = SUPREME 違反 capability-integration-mandate.md)

**BlastRadius 對照表**(Phase 0.5 自動補):

| centrality_score | BlastRadius | 說明 |
|:---:|:---:|:---|
| ≥ P95 (≥ 50.0) | **10**(全站) | god node — 修改影響廣 |
| ≥ P75 (≥ 5.0) | **5**(模組) | 中等中心性 — 影響跨檔 |
| ≥ P50 (≥ 0.5) | **2**(單檔) | 低中心性 — 影響範圍小 |
| < P50 (< 0.5) | **1**(單行) | 葉節點 — 影響極小 |

**回傳範例**(Production data 2026-05-02):

```json
[
  { "symbol_name": "AnnouncementService", "namespace": "PhyCool.Web.Services.BackOffice", "centrality_score": 83.24, "file_path": "...", "start_line": 12, "end_line": 487 },
  { "symbol_name": "HelpContentService",  "namespace": "PhyCool.Web.Services.BackOffice", "centrality_score": 82.68, ... },
  { "symbol_name": "AssetService",        "namespace": "PhyCool.Web.Services",            "centrality_score": 76.52, ... }
]
```

**降級行為**: `centrality_score` column 不存在(未跑 migration)→ 回傳空陣列 + 提示「Run `node .context-db/scripts/compute-centrality.cjs` first」。

**Production baseline**: 8063 symbols / 200,777 dependencies / 936 (11.6%) non-zero / max 824.44 / p95 ~50 / p99 ~561 (2026-05-02)。

---

## Phase 2 — 語意向量搜尋（1 Tool, TD-34 → CMI-6）

### 9. semantic_search

```
必填: query (string, >= 2 字元)
選填:
  limit          → 整數（預設 10，上限 50）
  symbol_type    → "class" | "method" | "interface" | "enum"
  min_similarity → 0.0-1.0（預設 0.3）
```

**降級行為**：ONNX 載入失敗 → 自動回退 `search_symbols` LIKE → 回傳含 `"mode": "fallback_like"`

**與 search_symbols 互補**:
1. 先用 `search_symbols`（精確關鍵字）→ 有結果 → 結束
2. 無結果 → 改用 `semantic_search`（語意查詢）→ 更廣泛匹配

---

## CMI-3 — 對話記憶（3 Tools）

### 10. list_sessions

```
選填:
  from      → 開始日期 (UTC+8)
  to        → 結束日期
  agent_id  → Agent 過濾
  limit     → 整數（預設 20）
```

**使用時機**：「昨天有哪些對話？」「這週完成了什麼？」

### 11. search_conversations

```
必填: query (string, >= 3 字元)
選填:
  session_id → 限定特定 session
  role       → "user" | "assistant"
  limit      → 整數（預設 10）
```

**使用時機**：「最近討論 token 減量策略」「使用者問過什麼關於 PDF 的問題」

### 12. get_session_detail

```
必填: session_id (string)
選填:
  include_turns → boolean（預設 true）
  turn_limit    → 整數（預設 50）
```

**使用時機**：查看特定 session 完整逐輪對話內容。

---

## CMI-5/6 — 文檔語意搜尋（1 Tool）

### 13. search_documents

```
必填: query (string)
選填:
  category → doc_index 分類過濾
  epic_id  → Epic 過濾
  limit    → 整數（預設 5）
```

**回傳**：`heading_path` + `content` + fusion `score`

**搜尋演算法**：Hybrid Fusion = 0.7 × vector_similarity + 0.3 × fts5_bm25_score

---

## DB-first Story/Debt 查詢（2 Tools）

### 14. search_stories

```
必填: query (string, 可空字串)
選填 filters:
  story_id       → 精確匹配（跳過 FTS5，直接 WHERE）
  include_details → boolean — CMI-12 策略指南:
                     精確查詢(story_id) + true → 完整 46 欄位（無 _preview 截斷）
                     精確查詢(story_id) 無此參數 → 22 欄完整 + 8 欄 _preview 截斷 + 11 欄不回傳
                     列表查詢(空 query/FTS5) + true → 保留 _preview（防多筆 token 爆炸）
  fields          → 逗號分隔欄位 — 顯式篩選時 CMI-12 完整回傳（行為不變）
  epic_id        → Epic 過濾
  status         → Story 狀態
  domain         → 領域
  complexity     → S/M/L/XL
  limit          → 整數（預設 10）

FTS5 查詢行為（trigram tokenizer）:
  - 多詞查詢自動拆分為 AND 連接（"image panel free" → "image" AND "panel" AND "free"）
  - 每個 term 為子字串匹配（>= 3 字元）
  - story_id 已納入 FTS 索引，可直接搜尋（如 "dla-10" 或 "eft-editor-image-panel-free-open"）
  - 空 query + filter = 回傳最近 N 筆（不走 FTS）
```

**CMI-12 _preview 截斷 8 欄位** (需 include_details:true 取完整): acceptance_criteria / tasks / dev_notes / implementation_approach / testing_strategy / definition_of_done / cr_summary / execution_log
**CMI-12 前完全不回傳 11 欄位** (v2.11 修復後可取): pipeline_notes / risk_assessment / rollback_plan / sdd_spec / create_agent / create_started_at / create_completed_at / review_started_at / source_file / affected_files / monitoring_plan

詳 SKILL.md §16 CMI-12 _preview 三策略指南

### 15. search_debt

```
必填: query (string, 可空字串)
選填:
  story_id     → 來源 Story
  target_story → 目標 Story
  status       → open / in-progress / resolved / deferred
  severity     → critical / high / medium / low
  include_stats → boolean（附統計摘要）
```

---

## §3b Worker Protocol Tools（4 Tools, NEW 2026-07-28 — epic-whp / whp-5-message-bus-mcp）

> 對 `whp-3-db-schema-registry` 四表(`worker_runs` / `worker_messages` / `worker_handoffs` / `guardian_heartbeat`)提供中控端寫入面。CAS 零筆結果為**成功回應**（`{ok:false, reason}`，不設 `isError`）；`isError:true` 僅用於缺必填參數 / 非法 enum / `run_id` 不存在（錯誤碼 `WHP5-E01`~`E04`）。

### 16. search_worker_runs（唯讀）

```
選填:
  story_id / phase / controller_track / run_mode → 精確比對
  lifecycle          → 逗號分隔多值走 IN（e.g. "reported,awaiting-review"）
  requires_attention → boolean
  pending_ack        → boolean — lifecycle='reported' AND ack_at IS NULL,依 reported_at ASC 排序
  include_messages   → boolean — 單次批次查詢附帶 worker_messages（依 seq ASC），未給時 'messages' 欄位不存在
  limit              → 整數（預設 20，硬上限 100）
```

**使用時機**: 查派發歷程 / 待簽收佇列(`pending_ack:true`) / 殭屍清單。**故意不列入 `SEARCH_TOOLS`**(運行狀態非可檢索知識)。

### 17. ack_worker_run

```
必填: run_id, ack_by（簽收者 Agent ID,不得為空字串）
```

**CAS**: `WHERE run_id=? AND lifecycle='reported'`。重複簽收 → `{ok:false, reason}`（含前次 `ack_at`/`ack_by`）,不觸碰 `worker_handoffs`。

### 18. gate_worker_run

```
必填: run_id, verdict("approved"|"revise"|"rejected"), gate_by
選填: gate_notes(verdict="revise" 時必填,將成為指示訊息 body), next_phase,
      controller_track(跨軌裁決時指定), override(boolean), override_reason(override=true 時必填)
```

**Guard 順序**(各自可區分拒絕訊息): run 存在 → `ack_at IS NOT NULL` → `lifecycle='awaiting-review'` → 跨軌 override → `worker_handoffs` 列存在 → `gate_result='pending'` CAS。三表(`worker_handoffs`/`worker_runs`/`worker_messages`)同一 transaction 原子完成。`verdict='revise'` 同步清空 `reported_at`/`ack_at`/`ack_by` 並歸零 `notify_count`(G24)。`run_mode='inline'` 核可直接收斂至 `closed`(G26)。

### 19. add_worker_message

```
必填: run_id, msg_type, body, author, mode("append"|"replace" — 無預設值,必須明示)
選填: direction("controller-to-worker" 預設 | "worker-to-controller")
```

**msg_type 依 direction 各自驗證**(非聯集): `controller-to-worker` → verdict-approved/revise/wake/probe/answer/close;`worker-to-controller` → progress/blocker/question/report。`mode="replace"` 只將既有 `pending` 的 `controller-to-worker` 訊息標 `superseded`(列保留不刪);已 `delivered` 者不可撤回並回 `warnings`。新列固定 `state='pending'`,永不寫 `delivered`/`consumed`(屬 D1/D2,whp-6/whp-11 承接)。

---

## §3c Ctrl-Channel Tools（4 Tools, NEW 2026-07-28 — epic-ccb / ccb-1-db-mcp-import）

> 跨軌中控溝通載體從 2 個 markdown 聊天室(371 則留言 / 176 個話題,人工 9 欄格式)遷移至 `ctrl_threads` / `ctrl_messages` / `ctrl_message_reads` / `ctrl_boards` 四表 + `ctrl_messages_fts`(trigram)。本組 4 tool 為**唯一寫入路徑**(A1 原理)。CAS 零筆結果為**成功回應**(`{ok:false, reason, current}`,不設 `isError`);`isError:true` 僅用於缺必填參數 / 非法 enum / 目標不存在 / DB 層失敗(錯誤碼 `CCB1-E01`~`E04`)。

### 20. post_ctrl_message

```
必填: to_tracks (array, 非空), msg_type ("inform"|"discuss"|"request"|"handoff"|"decision"|"state"), body (string)
選填:
  thread_id     → 省略即開新題(自動產生 "YYYY-MM-DD HH:mm:ss" 流水號格式)
  topic         → 開新題時必填(有 thread_id 時忽略)
  category      → 話題分類
  channel       → "general"(預設) | "correction" | 未來新值
  must_read     → boolean(預設 false,僅開新題時生效)
  from_track    → 省略時取 env PHYCOOL_CONTROLLER_TRACK
  ref_json      → 結構化參照物件(story_id/commit/file/board_id/thread_id 等)
  superseded_by → 標記本軌既有訊息(msg_id)為已被本則取代(僅限本軌自己的訊息)
```

**成功回應**: `{ok:true, thread_id, msg_id, seq, created_at}`(`created_at` 一律 offset-aware `+08:00`,忽略呼叫端傳入值)

**CAS 拒絕**(`{ok:false}` 非 `isError`): 目標 thread 已 `closed`(reason 含「開新題」指引)/ `superseded_by` 非本軌訊息 / 自動產生的 thread_id 同秒衝突(reason 提示重試或改帶明確 thread_id)

**Error**: `CCB1-E01`(缺必填 / to_tracks 非空陣列 / msg_type 非法)/ `CCB1-E03`(指定 thread_id 不存在)/ `CCB1-E04`(DB 層失敗,`SQLITE_BUSY` 退避 3 次 200/400/600ms 仍失敗)

**使用時機**: 跨軌發訊、回覆既有話題、標記自己先前訊息為更正版本(`superseded_by`)。

### 21. read_ctrl_messages

```
選填:
  reader_track    → 省略時取 env PHYCOOL_CONTROLLER_TRACK
  thread_id / channel / category / state → AND 組合過濾
  unread_only     → boolean,只回本軌尚未簽收的訊息
  must_read_only  → boolean,只回話題標記 must_read 的訊息
  limit           → 整數(預設 20,硬上限 100,只對實際回傳的訊息簽收)
```

**成功回應**: `{messages: [{msg_id, thread_id, seq, from_track, to_tracks, msg_type, body, ref_json, superseded_by, created_at, thread:{topic,category,channel,state,must_read}}], count, signed}`

**讀取即簽收**: 同一 transaction 內對每則實際回傳的訊息 UPSERT `ctrl_message_reads(msg_id, track, read_at)`。**故意不列入 `SEARCH_TOOLS`**(回傳形狀不符 `Array` / `.results` / `.total` 任一解析分支,且每次呼叫必有簽收寫入副作用,不符合 SEARCH_TOOLS 隱含的唯讀前提)。

**Error**: `CCB1-E01`(無 `reader_track` 且 env 未設)/ `CCB1-E04`(DB 層失敗)

**使用時機**: 每階段完成後 `{unread_only:true}` 檢查待簽收留言;查特定話題全部歷史 `{thread_id}`。

### 22. close_ctrl_thread

```
必填: thread_id
選填: caller_track（省略時取 env PHYCOOL_CONTROLLER_TRACK）
```

**成功回應**: `{ok:true, thread_id, state:'closed', closed_at}`

**CAS**: `WHERE thread_id=? AND initiator_track=? AND state='open'`。**CAS 拒絕**(`{ok:false, reason, current:{state,initiator_track}}` 非 `isError`): 非發起軌呼叫(reason 含實際 `initiator_track` 軌名)/ 重複關閉。**不提供任何 reopen 路徑**(D2 裁定,續談請開新題並以 `ref_json.thread_id` 引用舊題)。

**Error**: `CCB1-E01`(缺 thread_id 或 caller_track)/ `CCB1-E03`(thread_id 不存在)

### 23. update_ctrl_board

```
必填: board_id, expected_version (整數 — 非整數回 CCB1-E01), state (BoardState shape)
選填: updated_by（省略時取 env PHYCOOL_CONTROLLER_TRACK）

BoardState shape:
  status  (string, 必填)
  holder  (string|null, 必填)
  history (array, 必填 — 可為空陣列;每筆 {ts, track, action} 皆 string)
  until   (string, 選填)
  note    (string, 選填)
```

**成功回應**: `{ok:true, board_id, version}`(`version = expected_version + 1`,恆為 number —— `expected_version` 於入口以 `Number.isInteger()` 驗過,故不會出現字串串接)

**CAS**: `WHERE board_id=? AND version=?` 樂觀鎖。**CAS 拒絕**(`{ok:false, reason, current:{version, state}}` 非 `isError`): `expected_version` 不符(reason 含「重讀」指引,`current` 附最新完整 state 供重讀重試)

**Error**: `CCB1-E01`(缺必填)/ `CCB1-E02`(`state` 不符 BoardState shape — 缺 `holder`/`history` 或 `history` 項缺 `ts`/`track`/`action`)/ `CCB1-E03`(`board_id` 不存在,**不隱式建列**)

**使用時機**: Staging DB 使用登記制(§二之二)開關前後更新共享看板,取代手動編輯 markdown 表格。

### 緊急 Fallback(MCP 不可用時)

允許臨時以舊格式寫 `.md` 留言(非常態);MCP 恢復後執行 `node .context-db/scripts/import-ctrl-channel.js --report` re-import —— `UNIQUE(thread_id,seq)` / `PK(msg_id,track)` / `PK(thread_id)` / `PK(board_id)` 冪等鍵確保重跑零重複、零覆寫既有 DB-native 訊息。詳 `.claude/skills/phycool-ctrl-channel/SKILL.md`。

---

## 寫入 Tool 參數差異（常見錯誤源）

| 參數 | `add_context` | `add_tech` | `add_cr_issue` |
|------|:------------:|:----------:|:--------------:|
| Agent 識別 | `agent_id` | `created_by` | `agent_id` |
| 分類 | `category`（filters 內） | `category`（頂層必填） | 無 |
| 必填 | agent_id, category, title, content | created_by, category, title, outcome | agent_id, story_id, title |

---

## 語言憲章（CRITICAL）

```yaml
英文欄位（AI 操作 / 過濾）:
  tags[]       例: ["signalr", "hub", "cleanup"]
  category     例: "pattern"
  agent_id     例: "CC-OPUS"
  story_id     例: "qgr-d5"
  epic_id      例: "qgr"

繁體中文欄位（人類閱讀 / 內容）:
  title        例: "OnDisconnectedAsync 必須清理所有群組"
  content      例: "斷線時未清理 _connectionGroups 導致幽靈連線..."
  solution     例: "在 OnDisconnectedAsync 中遍歷 _connectionGroups..."
  lesson       例: "Hub Singleton 狀態需 ConcurrentDictionary 保護"
```

---

## 容錯降級策略

```yaml
MCP Server 未啟動:
  → 降級: 直接讀取 MEMORY.md + docs/tracking/active/
  → Workflow 絕不阻塞

DB 不存在:
  → 錯誤: "DB not found at .context-db/phycool.db"
  → 修復: node .context-db/scripts/init-db.js

FTS5 查詢無結果:
  → 縮短 query（核心術語 2-3 字）
  → 移除 filters 擴大範圍
  → 代表記憶庫尚未記錄此主題

ONNX 模型載入失敗:
  → semantic_search 自動降級至 LIKE
  → search_documents 自動降級至 FTS5-only
```
