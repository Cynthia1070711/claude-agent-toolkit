# CC 報告子章節：第十輪 — Workflow 同步更新機制

> **所屬主報告**：`CC-Agent記憶庫策略分析報告.md`
> **研討輪次**：第十輪 Party Mode
> **更新時間**：2026-03-06 22:53:38
> **版本**：v1.0
> **議題**：Workflow 執行期間發現並修復問題後，Context Memory DB 的同步更新機制

---

## R10.1 問題定義

Context Memory DB 本質上是 Git 文檔的「影子索引」（Shadow Index）。Git 是 Source of Truth，DB 是衍生物。

**核心問題**：當 Workflow 執行中對 Source of Truth 發生變更時（資料結構、欄位、技術文檔、Skill、需求文檔等），影子索引何時、如何同步？

### 三類變更場景

| 變更類型 | 觸發時機 | 範例 | 影響的 DB 表 |
|---------|---------|------|------------|
| **Schema 結構變更** | dev-story 修改 Model/Migration | 新增 DB 欄位、改表結構 | `tech_entries`（記錄 ADR） |
| **文檔內容變更** | create-story/dev-story/code-review | Story 狀態更新、CR 報告產生 | `stories`, `cr_reports`, `cr_issues` |
| **知識資產變更** | dev-story 修改 Skill/rules | Skill 新增章節、CLAUDE.md 更新 | `doc_index`, `context_entries` |

---

## R10.2 三層同步架構

### 決策：Workflow 邊界同步為主，三層架構互補

**否決即時同步的理由**：
1. 即時同步 = 每次 Edit 都觸發，一個 dev-story 可能 50+ 次檔案修改，大量無效中間態寫入
2. **Workflow 完成 = 邏輯單位完成** — 這是最自然的同步點

### Layer 1 — Workflow 結束時（零額外 Token，腳本自動執行）

```
觸發：story-pipeline.ps1 每階段完成後
執行：node .context-db/scripts/sync-workflow-output.js --story $StoryId --stage $Stage
同步範圍：
  - Story 狀態變更 → stories 表
  - CR 報告解析 → cr_reports + cr_issues 表
  - sprint-status.yaml → sprint_index 表
  - tracking file 歸檔 → doc_index 更新
```

### Layer 2 — AI Workflow 內（MCP Tool，消耗少量 Token）

```
觸發：Workflow 執行中發現值得記錄的技術洞見
執行：AI 主動呼叫 add_tech() 或 add_context()
同步範圍：
  - 新發現的技術陷阱 → tech_entries
  - 跨 Story 影響的架構決策 → context_entries
```

### Layer 3 — 定期掃描（零 Token，排程腳本）

```
觸發：每日排程 / 每週排程
執行：node .context-db/scripts/scan-doc-index.js
同步範圍：
  - 新增/刪除/搬移的文檔 → doc_index 全表更新
  - Skill 文件變更偵測 → doc_index 標籤更新
  - 孤兒記錄清理（DB 有但 Git 已刪除的文件）
```

### Pipeline 整合點

```
story-pipeline.ps1 每階段完成後
  → node .context-db/scripts/sync-workflow-output.js --story $StoryId --stage $Stage
     → 零 Token

code-review 完成後
  → node .context-db/scripts/import-cr-reports.js --story $StoryId
     → 零 Token

batch-runner.ps1 全部完成後
  → node .context-db/scripts/sync-from-yaml.js
  → node .context-db/scripts/validate-data.js --quick
     → 零 Token

每日排程
  → node .context-db/scripts/scan-doc-index.js
     → 零 Token

每週排程
  → node .context-db/scripts/validate-data.js --full
     → 零 Token
```

---

## R10.3 防禦式 ETL 設計 — 三級欄位策略

### 問題：文檔格式變更導致 ETL 壞掉

ETL 腳本（`import-stories.js`、`import-cr-reports.js` 等）本質上是文檔解析器，依賴 Markdown 結構。文檔格式改了（Story 新增章節、CR 報告改表格格式），ETL 就壞了。

### 解決方案：Core + Standard + Flexible 三級欄位

| 等級 | 定義 | DB 處理 | 變更需求 |
|------|------|---------|---------|
| **Core** | 必要欄位（id, status, title） | 硬編碼在 Schema | 變更需要 Migration |
| **Standard** | 標準欄位（epic, priority, complexity） | Schema 中但允許 null | 解析失敗不影響匯入 |
| **Flexible** | 動態內容（新增章節、自訂標籤） | 存入 `metadata JSON` / `tags TEXT` | 零 Schema 變更 |

### ETL 解析策略範例

```javascript
function parseStoryFile(content, filePath) {
  const result = {
    // Core：解析失敗就跳過整個文件
    id: extractRequired(content, /Story\s*ID.*?\|\s*(\S+)/),
    title: extractRequired(content, /##\s+Story\s+資訊[\s\S]*?標題.*?\|\s*(.+)/),
    status: extractRequired(content, /狀態.*?\|\s*(\S+)/),

    // Standard：解析失敗用 null，不影響整體匯入
    epic: extractOptional(content, /Epic.*?\|\s*(\S+)/),
    priority: extractOptional(content, /優先級.*?\|\s*(\S+)/),
    complexity: extractOptional(content, /複雜度.*?\|\s*(\S+)/),

    // Flexible：新增的章節自動進入 tags
    extra_sections: extractAllSections(content)
  };

  return result;
}
```

---

## R10.4 同步失敗偵測與回復

### 失敗場景矩陣

| 失敗場景 | 影響 | 偵測方式 | 回復策略 |
|---------|------|---------|---------|
| ETL 腳本解析失敗（格式變更） | 部分記錄缺失 | `validate-data.js` 比對 Git vs DB 計數 | 重新全量匯入 |
| Workflow 中途崩潰（未到 final step） | 狀態不一致 | `sprint-status.yaml` ≠ DB 的 status | Layer 3 掃描修正 |
| 文件已刪除但 DB 記錄殘留 | 孤兒記錄 | `scan-doc-index.js` 的 `file_exists` 檢查 | 軟刪除（`is_deleted=1`） |
| DB 欄位與文件內容不符 | 數據過時 | 定期 checksum 比對 | 全量重建受影響表 |

### 驗證規則設計

```javascript
const validations = [
  // 1. 計數一致性：Git 中的 Story 文件數 = DB stories 表記錄數
  { name: 'story_count_match',
    query: 'SELECT COUNT(*) FROM stories WHERE is_deleted=0',
    expected: () => glob('docs/implementation-artifacts/stories/**/*.md').length },

  // 2. 狀態一致性：sprint-status.yaml 的狀態 = DB 的狀態
  { name: 'status_sync',
    check: () => compareStatusWithYaml() },

  // 3. 孤兒偵測：DB 中的 file_path 在 Git 中是否存在
  { name: 'orphan_detection',
    query: 'SELECT file_path FROM doc_index WHERE is_deleted=0',
    check: (paths) => paths.filter(p => !fs.existsSync(p)) },

  // 4. Schema 版本：ETL 腳本版本是否與 DB Schema 版本匹配
  { name: 'schema_version_match',
    check: () => getDbSchemaVersion() === ETL_SCHEMA_VERSION }
];
```

---

## R10.5 Skill 變更偵測機制

### 問題：Skill 內容變更後，tech_entries 中的舊記錄可能與新規範矛盾

### 解決方案：`needs_review` 標記 + 查詢時警告

```
Skill 變更偵測流程（Layer 3 — 定期掃描）：

1. scan-doc-index.js 偵測到 Skill 文件的 last_modified 改變
2. 標記該 Skill 關聯的 tech_entries 為 needs_review = 1
3. 下次 AI 查詢 search_tech() 時：
   - 結果中包含警告標記：「此記錄可能已過時，相關 Skill 近期已更新」
   - AI 可決定是否忽略或重新驗證
4. 人類審核（或 AI 在下次 Workflow 中）更新 tech_entries → 清除 needs_review

設計理由：
  - 避免自動刪除舊記錄的風險（舊記錄可能仍然部分有效）
  - 讓 AI 知道這些記錄需要謹慎對待
  - 人工介入點保留最終決策權
```

### tech_entries 表新增欄位

```sql
ALTER TABLE tech_entries ADD COLUMN needs_review INTEGER DEFAULT 0;
ALTER TABLE tech_entries ADD COLUMN review_reason TEXT;
ALTER TABLE tech_entries ADD COLUMN last_verified TEXT;
```

---

## R10.6 新增 DB 表：sync_log

### 用途

記錄每次同步操作的結果，實現同步可追溯性。

### Schema DDL

```sql
CREATE TABLE sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,        -- 'workflow' | 'schedule' | 'manual'
    script_name     TEXT NOT NULL,        -- 'sync-workflow-output.js' 等
    action          TEXT NOT NULL,        -- 'insert' | 'update' | 'delete' | 'full_rebuild'
    target_table    TEXT NOT NULL,        -- 'stories' | 'cr_reports' | 'doc_index' 等
    record_id       TEXT,                 -- 受影響的記錄 ID（可選）
    affected_count  INTEGER DEFAULT 0,   -- 受影響的記錄數
    status          TEXT NOT NULL,        -- 'success' | 'partial' | 'failed'
    error_msg       TEXT,                 -- 失敗時的錯誤訊息
    duration_ms     INTEGER,             -- 執行耗時（毫秒）
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_sync_log_status ON sync_log(status);
CREATE INDEX idx_sync_log_target ON sync_log(target_table);
CREATE INDEX idx_sync_log_created ON sync_log(created_at);
```

---

## R10.7 同步架構全景圖

```
┌─────────────────────────────────────────────────────────────┐
│                    Source of Truth: Git                       │
│  Story 文件 | CR 報告 | ADR | Skill | CLAUDE.md | YAML       │
└───────┬─────┴────┬────┴──┬──┴───┬───┴─────┬─────┴─────┬─────┘
        │          │       │      │         │           │
        ▼          ▼       ▼      ▼         ▼           ▼
┌───────────────────────────────────────────────────────────────┐
│              Sync Orchestration Layer                         │
│                                                               │
│  Layer 1: Workflow 邊界同步（零 Token）                        │
│    +-- sync-workflow-output.js   <- story-pipeline 完成後     │
│    +-- import-cr-reports.js      <- code-review 完成後        │
│    +-- sync-from-yaml.js         <- batch-runner 前後         │
│                                                               │
│  Layer 2: AI 即時寫入（少量 Token）                             │
│    +-- add_tech(entry)           <- AI 發現技術洞見時          │
│    +-- add_context(entry)        <- AI 識別跨 Story 關聯時     │
│                                                               │
│  Layer 3: 定期掃描（零 Token）                                 │
│    +-- scan-doc-index.js         <- 每日排程                   │
│    +-- validate-data.js          <- 每週排程                   │
│    +-- cleanup-orphans.js        <- 每月排程                   │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│              Context Memory DB (SQLite)                       │
│                                                               │
│  Core:    context_entries | tech_entries | sprint_index        │
│  Layer A: stories | cr_reports | cr_issues | adrs              │
│  Layer B: doc_index                                           │
│  Meta:    taxonomy | sync_log | schema_version                │
└───────────────────────────────────────────────────────────────┘
```

---

## R10.8 決策摘要

| 決策項目 | 決策 | 理由 |
|---------|------|------|
| 同步時機 | 三層架構（Workflow 邊界 + AI 即時 + 定期掃描） | 平衡即時性與 Token 成本 |
| DB Schema 策略 | Core + Standard + Flexible 三級欄位 | 文檔格式變更不壞 DB |
| 新增 DB 表 | `sync_log`（同步操作紀錄） | 同步可追溯 |
| 新增腳本 | `sync-workflow-output.js` | Workflow 產出自動同步 |
| 孤兒記錄策略 | 軟刪除（`is_deleted=1`） | 可恢復，不丟資料 |
| Skill 變更偵測 | `needs_review` 標記 + AI 查詢警告 | 避免自動刪除風險 |
| tech_entries 新增欄位 | `needs_review`, `review_reason`, `last_verified` | Skill 變更追蹤 |
| 驗證機制 | `validate-data.js` 增強（4 項驗證規則） | 每週偵測不一致 |
| Phase 0 影響 | 增加 ~200 行程式碼，+1 表（sync_log） | 可接受的複雜度增量 |

### Phase 0 修正影響

| 指標 | R8 修正後 | R10 修正後 | 差異 |
|------|:---:|:---:|:---:|
| DB 表數 | 3 張 | 4 張（+sync_log） | +1 |
| MCP Tool 數 | 4 個 | 4 個（不變） | 0 |
| 獨立腳本數 | 2 個 | 3 個（+sync-workflow-output.js） | +1 |
| Always-On Token | ~270 tok | ~270 tok（不變） | 0 |

---

## R10.9 邊界風險

| # | 邊界 | 風險等級 | 緩解策略 |
|---|------|:---:|---------:|
| 1 | sync_log 表膨脹 | 低 | 每季清理 90 天以前的成功記錄，保留失敗記錄 |
| 2 | Skill 變更偵測誤判 | 低 | `needs_review` 只是警告，不自動刪除 |
| 3 | ETL 解析正則失效 | 中 | Flexible 欄位兜底 + validate-data.js 每週偵測 |
| 4 | Workflow 崩潰後的不一致 | 中 | Layer 3 每日掃描自動修正 + validate-data.js 報告 |
| 5 | 同步腳本本身的 Bug | 低 | sync_log 記錄所有操作，可追溯定位問題 |
