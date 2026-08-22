# Context Memory — Hooks & Scripts Reference (v2.0)

> Hook 配置、40+ 腳本清單、Code RAG Phase 1-3、S_final 融合公式、效能門檻。

---

## 1. Hook 配置（.claude/settings.json）

### 寫入類 Hooks

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node .context-db/scripts/log-session.js" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "node .context-db/scripts/log-session.js" }] }
    ],
    "PreCompact": [
      { "hooks": [
        { "type": "command", "command": "node .claude/hooks/precompact-tool-preprune.js" },
        { "type": "command", "command": "node .context-db/scripts/log-session.js" }
      ] }
    ]
  }
}
```

### 讀取注入 Hook

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node .claude/hooks/pre-prompt-rag.js", "timeout": 5000 }] }
    ]
  }
}
```

---

## 2. 獨立腳本一覽（零 Token）

### Pipeline Hooks（Workflow 自動觸發）

```bash
# Sprint YAML → DB 同步
node .context-db/scripts/sync-from-yaml.js

# Workflow 階段記錄
node .context-db/scripts/log-workflow.js --story $StoryId --stage create|dev|review

# Workflow 輸出同步（R10 Layer 1）
node .context-db/scripts/sync-workflow-output.js --story $StoryId --stage $Stage
```

### Session Hooks（Claude Code 事件觸發）

```bash
# Stop/SessionEnd/PreCompact 三層保險
node .context-db/scripts/log-session.js

# 對話逐輪記錄（CMI-3）
node .context-db/scripts/log-turn.js
```

### DB-first Story 操作

```bash
# Story 初始建立（create-story Step 7，含所有 enriched fields）
node .context-db/scripts/upsert-story.js --inline '<json>'

# Story 欄位局部更新（不覆蓋其他欄位，BMAD workflow Step Final 使用）
node .context-db/scripts/upsert-story.js --merge {story_id} --inline '{"status":"review","dev_agent":"CC-OPUS"}'

# Lifecycle timestamp COALESCE 保護寫入（pipeline 已寫則不覆蓋）
# phases: create-start | create-complete | dev-start | dev-complete | review-start | review-complete
node scripts/record-phase-timestamp.js {story_key} {phase}

# Story 查詢
node .context-db/scripts/query-stories.js --epic epic-cmi --status done

# 技術債操作
node .context-db/scripts/upsert-debt.js --inline '{...}'
node .context-db/scripts/upsert-debt.js --resolve TD-xxx --by CC-OPUS --in qgr-a2
node .context-db/scripts/upsert-debt.js --stats --epic qgr
```

### 文檔索引與 Embedding

```bash
# 文檔索引掃描
node .context-db/scripts/scan-doc-index.js

# 文檔向量化同步（增量，只處理 checksum 變更的檔案）
node .context-db/scripts/sync-documents.js

# 文檔匯入（全量重建）
node .context-db/scripts/import-documents.js

# Symbol Embedding 生成（本地 ONNX，$0）
node .context-db/scripts/generate-embeddings.js --full
node .context-db/scripts/generate-embeddings.js --incremental

# uses 依賴啟發式推斷（生成後執行）
node .context-db/scripts/infer-uses-deps.js

# Symbol Centrality 計算 (NEW 2026-05-02 ADR-GOVERNANCE-001 + Tianji v1.1.0)
# - 演算法: centrality = 0.6 * weighted_in + 0.4 * weighted_out
# - RELATION_WEIGHTS: inherits 1.0 / implements 0.9 / calls 0.7 / uses_inferred 0.4
# - 預設執行: 全量計算 + UPDATE symbol_index.centrality_score
# - 21 vitest tests + S-1 stress test (200K scores)
# - 手動執行 (尚無 cron / hook 自動重算,Story §7.2 P1-O3 待加)
node .context-db/scripts/compute-centrality.cjs              # full run
node .context-db/scripts/compute-centrality.cjs --dry-run    # 計算不寫入 DB
node .context-db/scripts/compute-centrality.cjs --top 20     # show top-20 god nodes
node .context-db/scripts/compute-centrality.cjs --domain "Payment"  # filter namespace

# 歷史遷移腳本（已完成，一次性，當前系統 100% 本地 ONNX）
# node .context-db/scripts/migrate-embeddings.js
```

### 定期排程

```bash
# 每日：doc_index 全量重建 + Skill 變更偵測
node .context-db/scripts/scan-doc-index.js

# 每週：一致性檢查
node .context-db/scripts/validate-data.js

# 每月：軟刪除孤兒記錄
node .context-db/scripts/cleanup-orphans.js

# 災難恢復：ledger.jsonl 重播
node .context-db/scripts/restore.js

# 歷史時區修復（一次性）
node .context-db/scripts/fix-timezone.js
```

### 共用工具模組

```bash
# UTC+8 時間戳
.context-db/scripts/timezone.js
  → getTaiwanTimestamp()  # "2026-03-07T16:45:00.123+08:00"

# 本地 ONNX 推理引擎（Singleton）
.context-db/scripts/local-embedder.js
  → initModel()           # 首次下載 ~90MB，快取 ~/.cache/huggingface/hub
  → generateEmbedding()   # 單句 → Float32Array (384D)
  → generateEmbeddings()  # 批次推理
```

> 所有腳本均為 Node.js ESM，直接用路徑 `../../.context-db/phycool.db`（禁止 `require('./server/config.js')`）。

---

## 3. Code RAG — Symbol 提取（Phase 1, TD-33）

### Roslyn AST 索引器

```
位置: .context-db/symbol-indexer/ (C# Console)
索引目標: src/YourApp/PhyCool.Platform.slnx
提取範圍: class / method / interface / enum（4 種 Symbol 類型）
依賴關係: calls / inherits / implements / uses

全量索引: dotnet run -- --full
增量索引: dotnet run -- --incremental（預設，讀取 git diff）
```

### 索引統計

| 指標 | 數值 |
|------|:----:|
| symbol_index 記錄 | 5,294 |
| symbol_dependencies 記錄 | ~800 edges |
| symbol_embeddings | 5,294 (384D) |

---

## 4. Code RAG — Embedding（Phase 2, TD-34 → CMI-6 本地化）

### 本地 ONNX 模型

| 屬性 | 值 |
|------|-----|
| 模型 | Xenova/all-MiniLM-L6-v2 |
| 維度 | 384D |
| 格式 | ONNX (Transformers.js) |
| 大小 | ~90MB |
| 快取 | `~/.cache/huggingface/hub` |
| 成本 | $0（本地推理） |
| 延遲 | 10-30ms/query (CPU) |

### 降級策略

```
ONNX 模型載入失敗
  → generateEmbedding() throws
  → semantic_search / search_documents catch
  → 自動降級至 FTS5-only / LIKE
  → 使用者體驗不中斷
```

---

## 5. Code RAG — Hook 動態注入（Phase 3, TD-35）

### pre-prompt-rag.js 架構

```
使用者提問
  ↓
pre-prompt-rag.js（UserPromptSubmit Hook）— 11-layer context injection
  ※ bwu-11 起所有預算一律以「字元」為單位，與官方 additionalContext 10,000 字元上限同量綱。
     修前以 token 計（MAX_TOKENS=10000 搭配 estimateTokens=length/4）＝ 換算約 40,000 字元，
     且該常數只餵 idd/instinct 兩層的動態扣減，從未用於 combinedContext 全域封頂。
  ├─ Layer 1-3: Session 記憶注入 (2,400 字元):
  │   ├─ 最近 3 條 session 記錄（單筆過長改截斷納入，不整筆丟棄）
  │   └─ 最近 5 條 user questions
  ├─ Layer 11: Rule Violation Hot Zones (650 字元 cap) [td-rule-violation-rag-inject]:
  │   ├─ 最近 30 天 context_entries category='rule_violation' GROUP BY rule+phase top-5
  │   ├─ Cascade 5→3→1 自動截斷到 ≤ 650 字元（banner 另允 ×1.2）
  │   ├─ intent=discussion → skip（同 Code RAG/LSP/IDD）
  │   └─ PHYCOOL_VIOLATION_INJECT_ENABLED=false 可停用
  ├─ Layer 4-6: Task-Aware Context (550 字元)（技術債 + 技術決策 + Story 進度）
  ├─ Layer 10: IDD 注入 (1,400 字元) [DLA-07]:
  │   ├─ active intentional_decisions GROUP BY idd_type
  │   ├─ intent=code 時執行（discussion skip）
  │   └─ 靜態字元預算（bwu-11 移除原 CR-H1 動態扣減 —— IDD 是降級必留層，
  │      動態扣減會在前面幾層吃緊時把含 CRITICAL 禁令的它靜默壓成 0）
  ├─ Layer 7: Pipeline State (300 字元)（active pipeline 警告 + 30min stale 偵測）
  ├─ Layer 8: Skill Recommendation (400 字元)（skill-keywords.json 匹配）
  ├─ Layer 9: LSP 診斷注入 (750 字元) [ecc-06]:
  │   ├─ dotnet build --no-restore → C# 編譯錯誤（BR-001）
  │   ├─ npx tsc --noEmit → TypeScript 編譯錯誤（BR-001）
  │   ├─ 3s 超時自動跳過（BR-003）
  │   ├─ 零錯誤零開銷（BR-002）
  │   └─ PHYCOOL_LSP_DIAG=false 可停用（BR-007）
  ├─ Layer 12: ECC Instinct 注入 (450 字元) [ADR-ECC-LEARNING-001]
  ├─ Code RAG 注入 (1,450 字元):
  │   ├─ query → ONNX Embedding (384D)
  │   ├─ symbol_embeddings Cosine Top 5
  │   ├─ symbol_dependencies 展開 1 層
  │   └─ S_final 融合排名（intent=code only）
  └─ Document RAG 注入 (650 字元):
      └─ FTS5-only（document_chunks_fts MATCH，非 Hybrid Fusion）
         ※ Hook 延遲 < 3 秒考量，向量搜尋僅限 MCP Tool search_documents
  ↓
全域封頂 MAX_INJECT_CHARS = 9,500 字元（對官方 10,000 硬界留 500 安全邊際）
  └─ 超限時分層降級：依「Claude 能否自行重新取得」丟棄
       doc → code → lsp → instinct → session → skill → pipeline
     必留層 violation / task / idd / godNodes 永不丟棄（Claude 無法自行得知）
     降級時三管道告警：additionalContext 內嵌行 + systemMessage（附加合併，
     不覆寫 ECC instinct）+ stderr；被丟層附自取管道（pointer-over-payload）
  ↓
輸出 additionalContext（上限 10,000 **字元** — 超過會被 CLI 存檔並改傳 preview + 檔案路徑）
```

### S_final 融合公式 (Phase 5 / ADR-GOVERNANCE-001, 2026-05-02 4-Axis 升級)

```
S_final = 0.6 × vec_similarity + 0.2 × graph_similarity + 0.2 × fts_similarity + 0.05 × centrality_norm
       (α=0.6)               (β=0.2)               (γ=0.2)               (δ=0.05 NEW 2026-05-02)
```

- `vec_similarity`：本地 ONNX cosine 相似度（VECTOR_MIN_SIMILARITY = 0.25）
- `graph_similarity`：依賴關係節點得 0.5 基礎分(quantitative,2-hop expansion)
- `fts_similarity`：LIKE 降級搜尋結果得 1.0
- `centrality_norm`：(NEW 2026-05-02 ADR-GOVERNANCE-001) `symbol_index.centrality_score / max_score` 歸一至 [0, 1] 區間;優先排序高中心性 god node
  - δ=0.05 漸進(對齊投機紅線 F-S6 ≤ 0.10);Kill switch: `pre-prompt-rag.js:79` `const DELTA = 0.05` 改 0 即回退至 Phase 4(Story §7.2 P1-O2 加 ENV flag 待規劃)

### 效能門檻

| 指標 | 目標 |
|------|------|
| Hook 總延遲 | < 3 秒 |
| 注入字元上限 | 9,500 字元（`MAX_INJECT_CHARS`；官方硬界 10,000 **字元**，非 token）|
| 分層預算總和 | 9,280 字元 ≤ 全域上限，留 220 緩衝吸收各 formatter 截斷註記 |
| 依賴展開層數 | 1 層（Top 5 直接依賴） |
| 最小 query 長度 | 3 字元（`MIN_QUERY_LENGTH`，以下整支跳過）|

### 開關控制

```bash
PHYCOOL_RAG_HOOK=false      # 停用全部 RAG 注入
PHYCOOL_RAG_HOOK=true       # 重新啟用（預設）
PHYCOOL_LSP_DIAG=false      # 停用 Layer 9 LSP 診斷（BR-007）
```

---

## 6. Phase 路線圖

```
Phase 0 (TD-32)  ✅ 完成
  └── context_entries + tech_entries + FTS5 文字搜尋

Phase 1 (TD-33)  ✅ 完成
  └── symbol_index + symbol_dependencies + Roslyn AST
      └── search_symbols / get_symbol_context MCP Tool

Phase 2 (TD-34 → CMI-6)  ✅ 完成
  └── symbol_embeddings (384D ONNX) + document_embeddings (384D)
      ├── semantic_search + search_documents MCP Tool
      ├── generate-embeddings.js（local-embedder.js）
      └── infer-uses-deps.js（uses_inferred 啟發式）

Phase 3 (TD-35)  ✅ 完成
  └── UserPromptSubmit Hook 動態注入 + 依賴圖展開
      ├── .claude/hooks/pre-prompt-rag.js
      └── S_final 三路融合

CMI-1~10  ✅ 完成（CMI-7~10 為後續補強）
  ├── CMI-1: Session 三層寫入保險
  ├── CMI-3: 對話記憶層 (conversation_sessions + turns)
  ├── CMI-4: UTC+8 時區修復 (19,727 筆)
  ├── CMI-5: 文檔向量化 (14,114 chunks + embeddings)
  ├── CMI-5: Compaction Recovery 三道防線
  ├── CMI-6: 全面本地化（100% ONNX，零外部 API）
  ├── CMI-7: search_debt MCP Tool（技術債搜尋 + include_stats 統計）
  ├── CMI-8: DevConsole DVC-16 Memory Launcher 整合
  ├── CMI-9: pre-prompt-rag Story ID 偵測 40+ 前綴擴展
  └── CMI-10: Hybrid Search 三層降級（ONNX → Hybrid FTS5 → LIKE 後備）

DVC Phase 1-3  ✅ 完成
  └── DevConsole Web UI (16 模組)
```

---

## 7. 完整 13-Handler Hook 總覽（ECC v1.9.0, 2026-04-03）

> 來源：SKILL.md §4，已驗證 .claude/settings.json（2026-04-05）

| Hook | Trigger | Write Strategy / 用途 | Dedup |
|------|---------|----------------|:-----:|
| `Stop` | Each Claude response completes | `pipeline-heartbeat.js` — phase-aware signal file + suggest-compact 工具計數 | — |
| `Stop` | Each Claude response completes | `incremental-embed.js` — re-embed queued symbols (max 20, absolute→relative path normalization) | Queue |
| `SessionEnd` | Conversation ends | `log-session.js` — Unconditional INSERT (final safety net) | None |
| `PreCompact` | Before context compaction | `precompact-tool-preprune.js` — Pass 1 md5 dedup + Pass 2 tool summary (19+ branches) → DB `context_entries` category=`compaction_preprune` (14-day retention). Story: td-37. **tdb-4 (2026-08-03)**: snapshot digest append 支線已拆除,PreCompact 全鏈純 DB 寫,不產出任何 `.md`(原 `pre-compact-snapshot.ps1` 同批 `git rm` 除役)。 **writeToDb DI** (`options.db`): td-hook-test-enhancement 新增 91 assertions (含 SQLITE_BUSY retry monkey-patch), 共用 helper `test/helpers/sqlite-test-helper.js`. CLI: `query-preprune.js` | — |
| `PreCompact` | Before context compaction | `log-session.js` — Shares Stop logic | 2 min |
| `PostToolUse` | After Edit/Write | `observe-pattern.js` — queue embedding + log pattern (18 domains) | Dedup |
| `PostToolUse` | After Edit/Write | `file-lock-acquire.ps1` — lock acquisition | — |
| `PreToolUse` | Before Edit/Write | `file-lock-check.ps1` — concurrent write guard | — |
| `PreToolUse` (Bash) | Before git commit | `pre-commit-quality.js` — 攔截 secrets/debug/commit msg 品質 | — |
| `PreToolUse` (mcp__phycool-context) | Before MCP call | `mcp-health-check.js` — MCP Server 探測 + 指數退避重試 | — |
| `PostToolUseFailure` (mcp__phycool-context) | MCP 失敗 | `mcp-health-check.js` — 自動重連 | — |
| `UserPromptSubmit` | User submits prompt | `pre-prompt-rag.js` — 11-layer context inject (Session/Violations/Task/IDD/Pipeline/Skill/LSP/Code/Doc, not write) + truncation warning | — |
| `SessionStart` | compact/resume event | `session-recovery.js` — HANDOFF_PREFIX inject + pipeline checkpoint + sessions + stale detection (30 min) + legacy `[CONTEXT SUMMARY]:` detection (td-38) | — |
| `SubagentStart` | Sub-agent spawned | `subagent-context-inject.js` — 子代理啟動時注入 context | — |
| `FileChanged` (SKILL.md) | Skill 檔案變更 | `skill-change-detector.js` — 偵測 Skill 同步需求 | — |
| `PermissionRequest` | 工具執行前 | `pipeline-permission.js` — Pipeline 模式下自動授權 | — |

---

## 8. pipeline-heartbeat.js Phase Target Map

Signal file 只在 DB status 達到**階段目標**時寫入（避免誤殺中間狀態）：

| Phase | Target Status | 說明 |
|-------|:---:|------|
| `create-story` | `ready-for-dev` | BMAD workflow 完成 + DB 回寫 |
| `dev-story` | `review` | 實作 + 測試完成 |
| `dev-story-fix-R1/R2` | `review` | CR 修復後重新送審 |
| `code-review` / `R1` / `R2` | `done` | CR 通過 + tasks backfilled |

> 中間狀態 (`creating`, `in-progress`, `reviewing`) 不觸發 signal — 防止 watchdog 誤殺。

---

## 9. Pipeline 子視窗 Memory 落地矩陣

| Pipeline | Mode | Hooks | MCP | RAG 注入 | Session 寫入 |
|----------|------|:-----:|:---:|:--------:|:----------:|
| launcher-interactive | interactive | ✅ | ✅ | ✅ 9 層 | ✅ |
| review-analyst | interactive | ✅ | ✅ | ✅ 9 層 | ✅ |
| autorun-e2e | interactive | ✅ | ✅ | ✅ 9 層 | ✅ |
| launcher-memory | `-p` pipe | ❌ | ❌ | 腳本注入 Story context | ❌ |
| claude-launcher | `-p` pipe | ❌ | ❌ | ❌ | ❌ |

> `-p` 模式不載入 Hooks/MCP/Skills — by design。interactive 模式子視窗完整載入 `.claude/settings.json` 所有 hooks。

---

## 10. STORY_ID_REGEX（pre-prompt-rag.js）

Story-aware RAG 層（Layer 2~3）透過 regex 從 prompt 偵測 Story ID。支援前綴：
`mqv|dvc|dvs|cmi|qgr|td|bf|cat|opt|arch|ux|adm|admin|fix\d*|rev\d*|fra|ds|rwd|uds|pi|sku|...`

> 完整 regex 見 `.claude/hooks/pre-prompt-rag.js:344`。新增 Epic 前綴時必須同步更新此 regex。

---

## 11. UserPromptSubmit 9-Layer 詳細注入

```
pre-prompt-rag.js injection (auto-triggered on every prompt >= 3 chars, zero manual ops):
  1. Session memory:       <- last 3 sessions + 5 user questions
  2. Story progress:       <- detect Story ID in prompt -> query stories table (auto)
  3. Related tech debt:    <- Story ID -> query tech_debt_items open/deferred (auto)
  4. Related decisions:    <- prompt keywords -> query context_entries decision (auto)
  5. Code RAG:             <- symbol_embeddings ONNX Cosine Top 5 + dependency expansion
  6. Document RAG:         <- FTS5-only (hook latency consideration)
  7. Pipeline State:       <- pipeline_checkpoints WHERE status IN (running, paused) + stale detection
  8. Skill Recommendation: <- skill-keywords.json keyword matching -> inject recommended SKILL.md paths
  9. LSP Diagnostics:      <- C# csproj + TS tsconfig compile errors (timeout: 3s, max: 750 chars)
  ─────────────────────────────
  Total budget:          9,500 chars (MAX_INJECT_CHARS) | timeout: 5,000ms | error: silent skip
                         over cap -> layered degradation (protected: violation/task/idd/godNodes)
  MIN_QUERY_LENGTH:      3 chars (was 10)
```

---

## 12. S_final Fusion Formula（Phase 歷史）

```
S_final = α * Sim_vec + β * Sim_graph + γ * Sim_fts

Phase 0: (0,   0,   1.0)  <- pure FTS5
Phase 1: (0,   0.3, 0.7)  <- FTS5 + knowledge graph
Phase 2: (0.5, 0.3, 0.2)  <- vector + graph + FTS5
Phase 3: (0.6, 0.2, 0.2)        <- production (binary graph 0/0.5)
Phase 4: (0.6, 0.2, 0.2)        <- (quantitative graph score)
Phase 5: (0.6, 0.2, 0.2, 0.05)  <- current (4-axis: + centrality, ADR-GOVERNANCE-001 / 2026-05-02)
```

**Phase 4 Graph Score Enhancement** (replaces binary 0/0.5):
- `inherits`: 1.0 | `implements`: 0.9 | `calls`: 0.7 | `uses_inferred`: 0.4
- Level 1 (direct dep): full weight | Level 2 (transitive): halved
- 2-hop expansion (was 1-hop), prepared statement reuse for perf

**Phase 5 Centrality Axis Addition** (ADR-GOVERNANCE-001 / 2026-05-02):
- 新增 δ × centrality_norm(δ=0.05 漸進)
- centrality_score = 0.6 × weighted_in_degree + 0.4 × weighted_out_degree(對齊 RELATION_WEIGHTS SSoT)
- 由 `compute-centrality.cjs` 手動或排程更新(Story §7.2 P1-O3 自動重算 cron 待規劃)
- 對 search 結果優先排序 god node;BMAD `code-review` Phase 0.5 BlastRadius Auto-Lookup 直接讀此欄位

---

## 13. Phase 4 Continuous Learning Hooks

```
PostToolUse (Edit/Write) → observe-pattern.js
  ├── Source file (.cs/.ts/.tsx)? → INSERT embedding_queue (dedup)
  └── All files → UPSERT pattern_observations (domain + confidence)
      Domain detection (18 categories):
        AI infra:  skill | rules | memory-infra | dev-console | bmad
        Docs:      story | review | tracking | docs
        Pipeline:  scripts
        Frontend:  state > editor > component > types > frontend
        Backend:   admin | service | controller | model | migration | test
        Config:    config (.json/.yaml/.yml/.csproj)
        Fallback:  other

Stop → incremental-embed.js
  ├── SELECT embedding_queue WHERE processed = 0
  ├── Normalize paths (absolute → relative, strip project root)
  ├── Find symbols in symbol_index by relative file_path
  ├── generateEmbeddings() via local ONNX (max 20/run)
  └── INSERT OR REPLACE symbol_embeddings + mark queue processed
```

Confidence formula: `min(1.0, 0.1 × ln(occurrences + 1))` — logarithmic growth, never exceeds 1.0.

> **Bug fix (2026-03-29)**: `incremental-embed.js` path normalization — `embedding_queue` stores absolute paths, `symbol_index` stores relative paths. Fixed by stripping project root prefix before matching.

---

## 14. Retrieval Observation（2026-03-29）

MCP Server (`server.js`) 自動追蹤所有 search tool 的呼叫統計，三層寫入：

```
MCP search tool call → logRetrieval() (non-blocking, 3 tables)
  ├── retrieval_observations: tool_name, query_text, result_count, search_mode, avg_similarity, duration_ms
  ├── retrieval_hits: UPSERT per returned entry (source_table + entry_id + hit_count + confidence)
  └── retrieval_keywords: extract keywords from query, UPSERT frequency
```

**追蹤工具**：`search_context` / `search_tech` / `semantic_search` / `search_documents` / `search_stories` / `search_debt` / `search_symbols` / `search_conversations` / `search_glossary` / `get_patterns` / `trace_context` / `list_sessions`

**信心值公式**：`confidence = MIN(1.0, 0.1 × ln(hit_count + 1))`

**DevConsole `/patterns` 側邊欄 5 個區塊**：
1. 領域活動 (18 域) — 編輯行為觀測
2. 記憶庫向量覆蓋 — 5 表嵌入健康度
3. 檢索活動 — MCP Tool 呼叫頻率 + 平均結果 + 延遲
4. 熱門條目 — 最常被檢索命中的記憶條目 + 信心值
5. 搜尋關鍵字 — 關鍵字頻率 Tag Cloud
