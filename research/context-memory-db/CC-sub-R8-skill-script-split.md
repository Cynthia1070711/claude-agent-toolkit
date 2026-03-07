# CC 報告子章節：第八輪 — Skill 決策 + MCP Tool vs. 腳本切分

> **所屬主報告**：`CC-Agent記憶庫策略分析報告.md`
> **研討輪次**：第八輪 Party Mode
> **更新時間**：2026-03-06 20:43:45
> **版本**：v5.0

---

## R8.1 Skill 建立方案

### 決策：建立 1 個統一 Skill，不拆分

| 方案 | Skill 數 | Always-On Token | 判定 |
|------|:---:|:---:|:---:|
| A. 拆分多個（DB/TDD/BDD/知識管理） | +4 | +400 tok | 不推薦 — 回到 TRS-4 前水準 |
| **B. 統一入口** | **+1** | **+150 tok** | **採用** |
| C. 不建 Skill，純靠 MCP | +0 | +0 | 不推薦 — AI 無引導會亂呼叫 |

**新建 Skill**：`myproject-context-memory/SKILL.md` — 統一入口

**TDD/BDD 不建獨立 Skill**：在 `example-testing-patterns/SKILL.md` 新增一個章節（3-5 行）即可，因為：
1. example-testing-patterns 已存在（v1.3.0）
2. 8 個 testarch Workflow 已存在
3. Context DB 對 TDD/BDD 的支援方式是透過 MCP Tool 查詢 tech_entries，不是新規範

### Skill 內容結構

```
myproject-context-memory/SKILL.md

觸發條件：
  - BMAD Workflow 執行前（Step 0 查詢）
  - BMAD Workflow 執行後（Step Final 寫入）
  - 關鍵字：記憶庫, Context DB, 知識庫, 技術搜尋, 失敗案例

MCP Tool 使用指引：
  查詢類（AI 必要）：
    search_context, search_tech, trace_context, add_context, add_tech, add_cr_issue
  腳本類（零 Token）：
    sync-from-yaml.js, scan-doc-index.js, import-design-tokens.js, etc.

TDD/BDD 專用查詢：
  search_tech(category='test_pattern|mock_strategy|bdd_scenario')
  search_test_journeys(module='X')

語言憲章：
  索引欄位（tags, category）→ 英文
  內容欄位（content, solution）→ 繁體中文
```

---

## R8.2 MCP Tool vs. 獨立腳本切分

### 判斷標準

```
需要 AI 的「語意理解力」→ MCP Tool（AI 在對話中呼叫）
純機械操作（解析/同步/聚合）→ 獨立腳本（零 Token）
```

### 19 個操作逐一判定

#### 保留為 MCP Tool（6 個 — AI 必須參與）

| # | Tool 名稱 | 理由 |
|---|----------|------|
| 1 | `search_context(query, filters)` | AI 要組合語意查詢 |
| 2 | `search_tech(query, category)` | AI 要理解技術問題去搜尋 |
| 3 | `trace_context(entity_id, depth)` | 遞迴 CTE 追蹤 + AI 篩選相關度 |
| 4 | `add_context(entry)` | AI 要產生摘要內容 |
| 5 | `add_tech(entry)` | AI 要結構化技術發現 |
| 6 | `add_cr_issue(issue)` | AI 要產生描述 + 判定嚴重度 |

#### 改為獨立腳本（13 個 — 零 Token）

| # | 腳本名稱 | 原 MCP Tool | 觸發方式 | 說明 |
|---|---------|------------|---------|------|
| 1 | `sync-from-yaml.js` | sync_from_yaml | Pipeline 鉤子 | YAML -> stories/epics 表 |
| 2 | `sync-file-relations.js` | sync_file_relations | Pipeline 鉤子 | Story file-list -> file_relations |
| 3 | `scan-doc-index.js` | scan_doc_index | 每日排程 | docs/ 目錄 -> doc_index |
| 4 | `import-design-tokens.js` | import_design_tokens | 每日排程 | front-end-spec.md -> design_tokens |
| 5 | `log-workflow.js` | log_workflow | Pipeline 鉤子 | 執行紀錄 -> workflow_executions |
| 6 | `check-conflict.js` | check_conflict | batch-runner 呼叫 | 檔案衝突偵測 |
| 7 | `get-stats.js` | get_stats | 人類手動 | 統計報表 JSON/Markdown |
| 8 | `agent-productivity.js` | agent_productivity | 人類手動 | Agent 生產力報表 |
| 9 | `sprint-retro-data.js` | sprint_retrospective | Sprint 結束時 | 回顧資料聚合 |
| 10 | `debt-overview.js` | debt_overview | 人類手動 | 技術債全景報表 |
| 11 | `lookup-glossary.js` | lookup_glossary | CLI 工具 | 術語查詢 |
| 12 | `backup-snapshot.js` | (新增) | 每日排程 | 定期快照匯出 |
| 13 | `validate-data.js` | (新增) | 每週排程 | 資料品質驗證 |

### Token 節省量化

| 指標 | 原規劃（19 MCP Tools） | 修正後（6 + 13） | 節省 |
|------|:---:|:---:|:---:|
| Always-On 描述 | ~570 tok | ~180 tok | **-68%** |
| 每批次執行 Token | ~1,300-6,500 tok | ~600-3,000 tok | **-54%** |
| 每日排程 Token | ~200-400 tok | 0 tok | **-100%** |

### 腳本目錄結構

```
.context-db/
+-- myproject.db                 <- SQLite 資料庫
+-- ledger.jsonl               <- 交易日誌
+-- server.js                  <- MCP Server（僅 6 個 AI Tool）
+-- init-schema.js             <- Schema 初始化
+-- restore.js                 <- Ledger 恢復
+-- package.json
|
+-- scripts/                   <- 獨立腳本（零 Token）
    +-- sync-from-yaml.js      <- Pipeline 鉤子
    +-- sync-file-relations.js <- Pipeline 鉤子
    +-- log-workflow.js        <- Pipeline 鉤子
    +-- scan-doc-index.js      <- 每日排程
    +-- import-design-tokens.js<- 每日排程
    +-- check-conflict.js      <- batch-runner 呼叫
    +-- get-stats.js           <- CLI 工具
    +-- agent-productivity.js  <- CLI 工具
    +-- sprint-retro-data.js   <- Sprint 結束
    +-- debt-overview.js       <- CLI 工具
    +-- lookup-glossary.js     <- CLI 工具
    +-- backup-snapshot.js     <- 每日排程
    +-- validate-data.js       <- 每週排程
```

### Pipeline 整合

```
batch-runner.ps1 啟動前
  -> node .context-db/scripts/sync-from-yaml.js
     -> 零 Token

story-pipeline.ps1 每階段完成後
  -> node .context-db/scripts/log-workflow.js --story $StoryId --stage $Stage
     -> 零 Token

batch-runner.ps1 全部完成後
  -> node .context-db/scripts/sync-from-yaml.js
  -> node .context-db/scripts/sync-file-relations.js --batch $BatchId
  -> node .context-db/scripts/get-stats.js --format md > batch-report.md
     -> 全部零 Token

每日排程（Windows Task Scheduler）
  -> node .context-db/scripts/scan-doc-index.js
  -> node .context-db/scripts/backup-snapshot.js
  -> node .context-db/scripts/validate-data.js
     -> 全部零 Token
```

---

## R8.3 修正後的 Phase 0 最小版本

```
Phase 0 -- PoC（複雜度 S）：

SQLite DB：3 張表
  context_entries + context_fts
  tech_entries + tech_fts
  sprint_index

MCP Server（server.js）：僅 4 個 AI Tool
  search_context(query, filters)
  search_tech(query, category)
  add_context(entry)    + Ledger
  add_tech(entry)       + Ledger

獨立腳本：僅 2 個
  sync-from-yaml.js
  backup-snapshot.js

Skill：1 個
  myproject-context-memory/SKILL.md

配置：
  .mcp.json（僅 Claude Code）

種子資料：20 筆手動記錄

Always-On 成本：4 Tool * ~30 tok + 1 Skill ~150 tok = ~270 tok
比原規劃 ~720 tok 節省 63%
```

---

## R8.4 六大邊界注意事項

| # | 邊界 | 風險等級 | 緩解策略 |
|---|------|:---:|---------|
| 1 | MCP Tool Always-On 成本 | 低 | Phase 0 僅 4 Tool（~120 tok） |
| 2 | Ledger.jsonl Git 膨脹 | 低 | ~1.8MB/年，每季壓縮歸檔 |
| 3 | FTS5 trigram 索引膨脹 | 低 | ~2.5MB/1K 筆，SQLite 無問題 |
| 4 | Skill 語言混用 | 中 | 英文（AI 操作）+ 繁中（範例/審查） |
| 5 | 失敗 Workflow 寫入 | 中 | 完成 -> 完整寫入；部分完成 -> 僅 context；失敗 -> 記錄失敗原因 |
| 6 | MCP Server 測試 | 低 | 12 個基礎測試（Schema/CRUD/Ledger/容錯） |
