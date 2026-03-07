# CC 報告子章節：第九輪 — 文檔分類與索引策略

> **所屬主報告**：`CC-Agent記憶庫策略分析報告.md`
> **研討輪次**：第九輪 Party Mode
> **更新時間**：2026-03-06 22:44:17
> **版本**：v3.0（補充 R9.10 全文檔分類適用性 + R9.11 資料存檔精化策略）

---

## R9.1 文檔全景盤點

MyProject 專案目前共有 **14 類文檔**，合計約 **1,080+ 份**。

| # | 文檔類型 | 數量 | 路徑 | 生命週期 |
|---|---------|:---:|------|---------|
| 1 | Story 文件 | ~136 | `stories/epic-*/` | 持續更新至 done |
| 2 | CR 報告 | ~404 | `reviews/epic-*/` | 寫入後不再變動 |
| 3 | Tracking 追蹤檔 | ~390 | `tracking/active/` → `archived/` | 完成後歸檔 |
| 4 | ADR / 技術決策 | ~28 | `technical-decisions/` | 長期有效 |
| 5 | 功能規格 | ~40 | `functional-specs/MyProject-MVP/` | 長期參考 |
| 6 | 架構文件 | ~5 | `architecture/` | 長期有效 |
| 7 | 技術規格 | ~12 | `technical-specs/` | 版本演進 |
| 8 | 討論/分析報告 | ~27 | `reference/` | 歷史參考 |
| 9 | sprint-status.yaml | 1 | `implementation-artifacts/` | 每日更新 |
| 10 | registry.yaml | 2 | `tech-debt/` | 每 Story 更新 |
| 11 | Epic README | ~12 | `stories/epic-*/README.md` | 每 Sprint 更新 |
| 12 | Skill 定義 | ~61 | `.claude/skills/` 等 | 低頻更新 |
| 13 | CLAUDE.md / rules | ~8 | 根目錄 + `.claude/rules/` | 低頻更新 |
| 14 | Token 策略分析 | ~616 | `claude token減量策略研究分析/` | 研究用 |

---

## R9.2 三分類判定框架

### 判定標準

```
Layer A — 索引到 DB（結構化 metadata + FTS 搜尋）
  條件：AI 任務中需高頻查詢 + 可萃取結構化欄位 + 原始文件存在 Git 中

Layer B — 僅建 doc_index 目錄索引（路徑 + 標題 + 標籤）
  條件：需要「找到文件」但不需「搜尋文件內容」

Layer C — 不索引（保持原狀）
  條件：極低頻參考 OR 已由其他機制覆蓋 OR 體積過大
```

### 核心原則

1. **DB 不存全文** — 全文永遠在 Git，DB 只存 metadata + 摘要（~200 字以內）
2. **DB ≠ Git 替代品** — DB 是「搜尋加速層」，Git 是「唯一事實來源」
3. **sync-from-yaml.js 已解決 YAML** — sprint-status / registry 不需另建 DB 表
4. **文檔越穩定，索引價值越低** — 頻繁被 AI 查詢的才值得索引

---

## R9.3 逐類判定

### Layer A：索引到 DB（6 類）

#### A1. Story 文件 → `stories` 表

| 欄位 | 來源 | 說明 |
|------|------|------|
| `id` (PK) | Story ID | `qgr-a1-dashboard-kpi-real-data` |
| `epic_id` | Epic 名稱 | `epic-qgr` |
| `title` | H1 標題 | 去除 emoji |
| `status` | 狀態欄位 | `done / review / ready-for-dev / backlog` |
| `priority` | 優先級 | `P0 / P1 / P2 / P3` |
| `complexity` | 複雜度 | `S / M / L / XL` |
| `type` | 類型 | `Enhancement / Feature / BugFix / TechDebt` |
| `dependencies` | 依賴 | 逗號分隔 Story ID |
| `tags` | 自動萃取 | 從 Background + AC 關鍵字萃取 |
| `file_list` | 變更檔案 | JSON array |
| `created_at` | 建立日期 | |
| `dev_agent` | DEV Agent | |
| `review_agent` | Review Agent | |

**優點**：
- AI 接到 `dev-story` 時可查詢同模組已完成 Story，避免重複實作
- `check-conflict.js` 可直接查 `file_list` 偵測檔案衝突
- 批次規劃可查詢未完成 Story 的依賴關係

**缺點**：
- Story 格式偶有差異（早期 vs 現在），需 ETL 腳本容錯
- file_list 在 dev-story 完成前為空

**Token 節省**：查詢 Story metadata 從讀整檔（~300-800 tok）降為 DB 查詢結果（~50-100 tok），節省 **~80%**

---

#### A2. CR 報告 → `cr_reports` 表

| 欄位 | 來源 | 說明 |
|------|------|------|
| `id` (PK) | 自動 | |
| `story_id` (FK) | Story ID | |
| `round` | R1/R2/R3 | 審查輪次 |
| `saas_score` | SaaS Score | 數值 0-100 |
| `issues_total` | Issues 總數 | |
| `issues_fixed` | FIXED 數 | |
| `issues_deferred` | DEFERRED 數 | |
| `deferred_targets` | 延後目標 | JSON array of Story IDs |
| `reviewer` | Agent ID | |
| `review_date` | 日期 | |
| `tags` | 自動萃取 | 從 Issues 維度欄位萃取 |

**優點**：
- Code Review 時可查「此模組歷史上常見問題」→ 精準審查
- 技術債追蹤可從 `deferred_targets` 反向查詢「哪些 CR 產生了延後項目」
- Sprint Retro 可聚合 SaaS Score 趨勢

**缺點**：
- CR 報告格式在 v1.0→v2.0 有變化，早期格式需適配
- 404 份報告的初次 ETL 需要較長時間

**Token 節省**：查詢 CR 歷史從讀多份報告（~2000-5000 tok）降為 DB 聚合查詢（~100-200 tok），節省 **~95%**

---

#### A3. ADR / 技術決策 → `tech_entries` 表（已設計）

| 欄位 | 對應 | 說明 |
|------|------|------|
| `category` | `architecture` | ADR 類別 |
| `title` | ADR 標題 | |
| `content` | 決策摘要 | ~200 字 |
| `tags` | 從 ADR 關鍵字萃取 | |
| `source_file` | 原始路徑 | |

**優點**：
- AI 做技術決策前可查「此問題是否已有 ADR」→ 避免重複決策
- `search_tech(category='architecture')` 即可檢索

**缺點**：28 份 ADR 的手動整理一次性成本（但之後自動化）

**Token 節省**：精準查詢取代 grep 28 份文件，節省 **~90%**

---

#### A4. 技術規格 → `doc_index` + `tech_entries`

技術規格（front-end-spec.md、database-schema.md 等）採**雙軌索引**：
- `doc_index`：路徑 + 標題 + 更新日期（scan-doc-index.js 自動掃描）
- `tech_entries`：從規格中萃取的**關鍵規範**作為獨立條目（如 Design Token 命名規則、SQL 命名規範）

**優點**：
- 開發時查「主色調是什麼」不需讀完整 front-end-spec.md（~2000 行）
- 規範摘要可作為 Code Review 對照基準

**缺點**：
- 規格更新時需同步更新 tech_entries（可用 Hook 自動化）
- 過度萃取會造成維護負擔

**建議**：Phase 0 僅索引 `doc_index`，Phase 1 再萃取關鍵規範到 `tech_entries`

---

#### A5. CR Issues → `cr_issues` 表（已設計）

從 CR 報告中萃取每個 Issue 作為獨立記錄。

| 欄位 | 來源 | 說明 |
|------|------|------|
| `id` (PK) | 自動 | |
| `cr_report_id` (FK) | 所屬 CR 報告 | |
| `issue_id` | H1/M2/L3 | |
| `severity` | CRITICAL/HIGH/MEDIUM/LOW | |
| `dimension` | CodeQuality/TestCoverage/... | |
| `summary` | 問題摘要 | |
| `resolution` | FIXED/DEFERRED/WON'T FIX | |
| `target_story` | 延後目標 Story | |
| `file_path` | 影響檔案 | |

**優點**：
- 可統計「哪個維度最常出問題」→ 改善開發規範
- 新 Story 開發前可查「此檔案歷史上有哪些 Issue」
- 技術債追蹤的黃金數據源

**缺點**：
- 404 份 × 平均 8 Issues = ~3,200 筆初次匯入
- Issue 格式偶有微小差異

**Token 節省**：查詢歷史問題模式從 grep 多份 CR（~3000-8000 tok）降為 DB 查詢（~150-300 tok），節省 **~95%**

---

#### A6. sprint-status / registry → `sprint_index` + `stories` 表

已由 `sync-from-yaml.js` 腳本解決（R8 決議），零 Token 同步。

- `sprint_index`：Story 狀態快照
- `stories` 表的 `status` 欄位與 YAML 同步

**不需額外設計**，Phase 0 sync-from-yaml.js 已覆蓋。

---

### Layer B：僅建目錄索引（4 類）

#### B1. 功能規格 → 僅 `doc_index`

| 理由 | 說明 |
|------|------|
| 查詢頻率 | 中（開發新功能時參考，~每週 1-2 次） |
| 結構化程度 | 低（非標準化格式，各文件差異大） |
| 內容穩定度 | 高（規劃階段完成後極少更新） |

**做法**：`scan-doc-index.js` 掃描 `functional-specs/` 目錄，記錄路徑 + 標題 + 關鍵字

**不做全文索引的原因**：
- 40 份功能規格總計約 15,000+ 行，FTS 索引膨脹但查詢頻率低
- AI 真正需要的是「找到正確的規格文件」，而非「搜尋規格內文」
- 找到文件後直接 Read 即可，中間層（DB 摘要）反而增加維護成本

---

#### B2. 架構文件 → 僅 `doc_index`

| 理由 | 說明 |
|------|------|
| 數量 | 僅 5 份 |
| 查詢頻率 | 低（架構決策由 ADR 覆蓋） |
| 關鍵資訊 | 已萃取到 `tech_entries` (category='architecture') |

5 份文件 grep 也只需 ~200 tok，建 DB 表的 overhead 不值得。

---

#### B3. 討論/分析報告 → 僅 `doc_index`

| 理由 | 說明 |
|------|------|
| 數量 | ~27 份 |
| 查詢頻率 | 極低（歷史決策背景參考） |
| 結構化程度 | 低（自由格式） |

**特例**：若報告中包含重要技術發現（如踩坑記錄），應**手動萃取**到 `tech_entries` 而非索引全文。

---

#### B4. Tracking 追蹤檔 → 僅 `doc_index`（歸檔部分不索引）

| 理由 | 說明 |
|------|------|
| Active 數量 | ~29 份（動態） |
| Archived 數量 | ~361 份（已歸檔） |
| 查詢頻率 | Active: 中；Archived: 極低 |

**做法**：
- Active tracking：`doc_index` 記錄路徑 + Story ID + 狀態
- Archived tracking：**不索引**（已反映在 `stories` 表的 status=done）

**不索引 Archived 的原因**：
- 追蹤檔是「執行過程記錄」，完成後其價值已轉移到 Story 文件和 CR 報告
- 361 份歸檔追蹤檔的內容與對應 Story/CR 高度重複

---

### Layer C：不索引（4 類）

#### C1. Skill 定義 → 不索引

| 理由 | 說明 |
|------|------|
| 載入機制 | Claude Code 的 Skill 系統已有 Always-On 索引 |
| 查詢方式 | 由 `skills_list.md` 和 CLAUDE.md 的 Skill 索引表管理 |
| 重複索引 | 建 DB 索引等於重複 Skill 系統已做的事 |

---

#### C2. CLAUDE.md / rules → 不索引

| 理由 | 說明 |
|------|------|
| 載入機制 | Always-On，每次會話自動載入 |
| 變更頻率 | 極低 |
| 索引價值 | 零（已經在每個 Prompt 中） |

---

#### C3. Token 策略分析報告 → 不索引

| 理由 | 說明 |
|------|------|
| 數量 | ~616 份（包含研究草稿） |
| 性質 | 一次性研究資料 |
| 索引價值 | 極低（研究完成後不再被 AI 任務查詢） |
| 體積風險 | 建索引反而浪費儲存空間 |

---

#### C4. Epic README / 推進樹狀圖 → 不索引

| 理由 | 說明 |
|------|------|
| 資訊冗餘 | 內容是 `stories` 表和 `sprint_index` 的人類友好視圖 |
| 查詢方式 | AI 直接查 DB 即可，不需透過 README |

---

## R9.4 DB 表與文檔映射總覽

```
文檔類型              → DB 表              → 索引層級    → 同步方式
─────────────────────────────────────────────────────────────────
Story 文件            → stories            → Layer A    → sync-from-yaml.js + MCP add_context
CR 報告              → cr_reports          → Layer A    → ETL 腳本（Phase 1）
CR Issues            → cr_issues           → Layer A    → ETL 腳本（Phase 1）
ADR / 技術決策       → tech_entries        → Layer A    → MCP add_tech（手動/半自動）
技術規格             → doc_index           → Layer B    → scan-doc-index.js
                     + tech_entries        → Layer A    → Phase 1 萃取
sprint-status.yaml   → sprint_index        → Layer A    → sync-from-yaml.js
registry.yaml        → (sprint_index ext)  → Layer A    → sync-from-yaml.js

功能規格             → doc_index           → Layer B    → scan-doc-index.js
架構文件             → doc_index           → Layer B    → scan-doc-index.js
討論/分析報告        → doc_index           → Layer B    → scan-doc-index.js
Active Tracking      → doc_index           → Layer B    → scan-doc-index.js
Archived Tracking    → (不索引)            → Layer C    → N/A

Skill 定義           → (不索引)            → Layer C    → N/A
CLAUDE.md / rules    → (不索引)            → Layer C    → N/A
Token 分析報告       → (不索引)            → Layer C    → N/A
Epic README          → (不索引)            → Layer C    → N/A
```

---

## R9.5 Phase 分期對照

### Phase 0（PoC）

| 表 | 文檔來源 | 筆數 | 同步方式 |
|---|---------|:---:|---------|
| `stories` | sprint-status.yaml + 20 份種子 | ~20 | sync-from-yaml.js |
| `tech_entries` | 手動 20 筆種子 | ~20 | MCP add_tech |
| `context_entries` | 手動測試 | ~10 | MCP add_context |
| `sprint_index` | sprint-status.yaml | ~全量 | sync-from-yaml.js |

### Phase 1（完整索引）

| 新增表 | 文檔來源 | 筆數 | 同步方式 |
|--------|---------|:---:|---------|
| `cr_reports` | 404 份 CR 報告 | ~404 | ETL 腳本 import-cr-reports.js |
| `cr_issues` | 從 CR 萃取 | ~3,200 | ETL 腳本 import-cr-issues.js |
| `doc_index` | 全目錄掃描 | ~200 | scan-doc-index.js |
| `stories`（全量） | 136 份 Story | ~136 | ETL 腳本 import-stories.js |
| `tech_entries`（ADR） | 28 份 ADR | ~28 | ETL 腳本 import-adrs.js |
| `test_journeys` | E2E 測試路徑 | ~50 | 手動 + MCP |
| `test_traceability` | Story AC 對應 | ~200 | ETL 腳本 |

### Phase 2（進階）

| 新增表 | 文檔來源 | 筆數 | 同步方式 |
|--------|---------|:---:|---------|
| `design_tokens` | front-end-spec.md | ~150 | import-design-tokens.js |
| `file_relations` | Story file_list | ~2,000 | sync-file-relations.js |
| `workflow_executions` | 執行紀錄 | 持續成長 | log-workflow.js |
| `glossary` | 術語表（新建） | ~100 | 手動 |

---

## R9.6 ETL 腳本設計要點

### 新增 Phase 1 腳本（全部零 Token）

| 腳本 | 輸入 | 輸出 | 複雜度 |
|------|------|------|:---:|
| `import-cr-reports.js` | `reviews/epic-*/` | cr_reports 表 | M |
| `import-cr-issues.js` | cr_reports + 原始 CR | cr_issues 表 | L |
| `import-stories.js` | `stories/epic-*/` | stories 表（完整） | M |
| `import-adrs.js` | `technical-decisions/` | tech_entries 表 | S |

### 解析策略

```
Story 文件解析：
  - H1 → title（去除 emoji）
  - ## Story 資訊 表格 → status, priority, complexity, type, dependencies
  - ## File List → file_list (JSON array)
  - ## Background + ## AC → tags 自動萃取（FTS 關鍵字）

CR 報告解析：
  - H1 → story_id
  - **Review Date** / **SaaS Score** → review_date, saas_score
  - ## Issues 總覽 表格 → issues_total, issues_fixed, issues_deferred
  - 每個 ### [XX][YY] 區塊 → cr_issues 表的一筆記錄

ADR 解析：
  - H1 → title
  - ## Decision / ## Status → content 摘要
  - 檔名 → category + tags
```

---

## R9.7 決策總結與邊界

### 決策摘要

| 決策項 | 結論 | 理由 |
|--------|------|------|
| Story 全文入 DB？ | **否** — 僅 metadata | 全文在 Git，DB 只加速搜尋 |
| CR 全文入 DB？ | **否** — metadata + issues 拆表 | 單份 CR 200-500 行，全文索引膨脹 |
| 功能規格入 DB？ | **否** — 僅 doc_index | 40 份低頻參考，grep 即可 |
| Archived Tracking 入 DB？ | **否** | 價值已轉移到 Story/CR |
| Token 分析報告入 DB？ | **否** | 一次性研究，616 份純噪音 |
| design_tokens 獨立表？ | **Phase 2** | Phase 0 不急，tech_entries 可暫替 |

### 邊界注意

| # | 邊界 | 風險 | 緩解 |
|---|------|:---:|------|
| 1 | CR 報告格式演進 | 中 | ETL 腳本需容錯處理 v1/v2 格式差異 |
| 2 | Story 格式不一致 | 中 | 早期 Story（Epic 1-5）缺少標準表頭，需 fallback 邏輯 |
| 3 | 全量 ETL 執行時間 | 低 | ~4,000 筆文件解析，Node.js 預估 < 30 秒 |
| 4 | DB 大小膨脹 | 低 | metadata only → ~5MB（含 FTS 索引） |
| 5 | doc_index 掃描遺漏 | 低 | scan-doc-index.js 用 glob pattern，需涵蓋所有 docs/ 子目錄 |
| 6 | 增量 vs 全量同步 | 中 | Phase 0 全量重建；Phase 1 增量同步（比對 mtime） |

### Layer A 表的 Schema 補充（與主報告 §4 DDL 對照）

```sql
-- Phase 1 追加：CR 報告索引
CREATE TABLE cr_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    round TEXT NOT NULL,           -- 'R1', 'R2', 'R3'
    saas_score INTEGER,
    issues_total INTEGER DEFAULT 0,
    issues_fixed INTEGER DEFAULT 0,
    issues_deferred INTEGER DEFAULT 0,
    deferred_targets TEXT,         -- JSON array
    reviewer TEXT,
    review_date TEXT NOT NULL,
    tags TEXT,
    source_file TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE VIRTUAL TABLE cr_reports_fts USING fts5(
    story_id, tags, reviewer,
    content=cr_reports, content_rowid=id, tokenize='trigram'
);

-- Phase 1 追加：CR Issues 明細
CREATE TABLE cr_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cr_report_id INTEGER NOT NULL,
    story_id TEXT NOT NULL,
    issue_id TEXT NOT NULL,        -- 'H1', 'M2', 'L3'
    severity TEXT NOT NULL,        -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    dimension TEXT,                -- 'CodeQuality', 'TestCoverage', etc.
    summary TEXT NOT NULL,
    resolution TEXT NOT NULL,      -- 'FIXED', 'DEFERRED', 'WON'T FIX'
    target_story TEXT,             -- DEFERRED 目標 Story ID
    file_path TEXT,
    tags TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (cr_report_id) REFERENCES cr_reports(id),
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE VIRTUAL TABLE cr_issues_fts USING fts5(
    summary, dimension, tags, file_path,
    content=cr_issues, content_rowid=id, tokenize='trigram'
);

-- Phase 1 追加：文檔目錄索引
CREATE TABLE doc_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    title TEXT,
    doc_type TEXT NOT NULL,        -- 'functional_spec', 'architecture', 'tech_spec', 'discussion', 'tracking'
    tags TEXT,
    last_modified TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE doc_index_fts USING fts5(
    title, tags, file_path,
    content=doc_index, content_rowid=id, tokenize='trigram'
);
```

### 更新後的 Schema 總表

```
Phase 0（3 張 + FTS）：
  context_entries + context_fts
  tech_entries + tech_fts
  sprint_index

Phase 1（+7 張 + FTS）：
  stories + stories_fts          -- 完整 Story metadata
  cr_reports + cr_reports_fts    -- CR 報告 metadata   [NEW]
  cr_issues + cr_issues_fts     -- CR Issue 明細       [NEW]
  doc_index + doc_index_fts     -- 文檔目錄索引        [NEW]
  test_journeys + test_journeys_fts
  test_traceability
  context_relations              -- 關聯圖

Phase 2（+4 張）：
  design_tokens
  file_relations
  workflow_executions
  glossary

總計：14 張資料表 + 8 張 FTS 虛擬表 = 22 張
（與主報告 §4 的 16 表方案比較：+6 張，來自 CR 拆表 + doc_index）
```

---

## R9.8 查詢情境驗證

| 情境 | 查詢方式 | Layer |
|------|---------|:---:|
| 「qgr-e3 的 CR 有哪些延後項目？」 | `SELECT * FROM cr_issues WHERE story_id='qgr-e3' AND resolution='DEFERRED'` | A |
| 「哪些 Story 改過 AdminDashboardService.cs？」 | `SELECT story_id FROM stories WHERE file_list LIKE '%AdminDashboardService%'` | A |
| 「Canvas 相關的 ADR 有哪些？」 | `SELECT * FROM tech_entries WHERE category='architecture' AND tags MATCH 'canvas'` | A |
| 「功能規格裡有沒有講到 PDF 佇列？」 | `SELECT file_path FROM doc_index WHERE doc_type='functional_spec' AND tags MATCH 'pdf queue'` → 找到後 Read | B |
| 「上週 CR 的平均 SaaS Score？」 | `SELECT AVG(saas_score) FROM cr_reports WHERE review_date >= '2026-02-28'` | A |
| 「哪些維度出問題最多？」 | `SELECT dimension, COUNT(*) FROM cr_issues GROUP BY dimension ORDER BY 2 DESC` | A |
| 「Epic QGR 還有幾個 Story 未完成？」 | `SELECT COUNT(*) FROM stories WHERE epic_id='epic-qgr' AND status != 'done'` | A |

---

## R9.9 多元記憶分類體系（Hierarchical Taxonomy）

### 設計動機

既然已建立記憶資料庫，所有存入 DB 的知識條目（context_entries、tech_entries、cr_issues 等）都應該能**按產品線、模組、議題領域**精準定位。目前的 `tags` 欄位是扁平的關鍵字陣列，無法表達**層級關係**，例如「這筆記錄屬於 MyProject → MyProject → 編輯器模組」。

### 分類體系設計

#### 三層分類架構

```
Level 1: 產品/專案線（product_line）
├── myproject          ← MyProject 產品線所有議題
├── devops           ← CI/CD、自動化排程、Pipeline
├── ai-agent         ← AI Agent 使用手冊、策略、記憶庫
└── research         ← 一次性研究分析（不定期）

Level 2: 產品子系統（product_sub）
├── myproject.pcpt     ← MyProject 個人化印刷系統（當前 MVP）
├── myproject.psop     ← PSOP 出版排版系統（未來模組）
├── myproject.platform ← MyProject 平台共用基礎（Auth、DB、Azure）
├── devops.pipeline  ← story-pipeline / batch-runner
├── devops.scheduler ← 智能中控自動化排程
├── ai-agent.cc      ← Claude Code 使用策略
├── ai-agent.gc      ← Gemini CLI 使用策略
├── ai-agent.ag      ← Antigravity 使用策略
├── ai-agent.rd      ← Rovo Dev 使用策略
├── ai-agent.memory  ← 記憶庫架構（本研究）
└── research.token   ← Token 減量策略研究

Level 3: 功能模組（module）
├── pcpt.editor            ← 編輯器核心（Canvas、Fabric.js）
├── pcpt.editor.shape      ← 形狀面板
├── pcpt.editor.text       ← 文字屬性
├── pcpt.editor.datasource ← 資料來源
├── pcpt.editor.pdf        ← PDF 生成流程
├── pcpt.member            ← 會員中心
├── pcpt.member.auth       ← 登入/註冊/OAuth
├── pcpt.member.profile    ← 個人資料/頭像
├── pcpt.member.payment    ← 金流/訂閱/退款
├── pcpt.admin             ← MyProject 維運後台
├── pcpt.admin.dashboard   ← Dashboard/KPI
├── pcpt.admin.user        ← 會員管理
├── pcpt.admin.finance     ← 會計/財務報表
├── pcpt.admin.audit       ← 匯款審核/稽核
├── pcpt.admin.apikey      ← API 金鑰管理
├── pcpt.admin.font        ← 字型管理
├── pcpt.admin.announce    ← 公告管理
├── pcpt.admin.queue       ← PDF 佇列監控
├── pcpt.legal             ← 法務（隱私政策/購買政策）
├── pcpt.seo               ← SEO/i18n/hreflang
├── pcpt.security          ← CSP/安全/錯誤碼
├── pcpt.business-api      ← 商務版 API 串接
├── pcpt.testing           ← 測試策略/E2E
├── platform.db            ← 資料庫 Schema/Migration
├── platform.azure         ← Azure 部署/Blob/CDN
├── platform.identity      ← ASP.NET Identity 共用
└── platform.email         ← SendGrid/Email 服務
```

#### 為何不用 Tag 替代？

| 做法 | 問題 |
|------|------|
| 只用 tags `["pcpt", "editor", "shape"]` | 無法區分「pcpt 的 editor」和「psop 的 editor」 |
| 只用 tags `["pcpt-editor-shape"]` | 無法查「所有 pcpt 相關」（需 LIKE 'pcpt%'） |
| **三欄位分層** | `WHERE product_line='myproject' AND product_sub='pcpt' AND module='editor.shape'` 精準且可聚合 |

### Schema 修改方案

#### 方案：在既有表新增 3 個分類欄位

```sql
-- 對 context_entries 追加
ALTER TABLE context_entries ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE context_entries ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE context_entries ADD COLUMN module       TEXT;

-- 對 tech_entries 追加
ALTER TABLE tech_entries ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE tech_entries ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE tech_entries ADD COLUMN module       TEXT;

-- 對 cr_issues 追加
ALTER TABLE cr_issues ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE cr_issues ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE cr_issues ADD COLUMN module       TEXT;

-- 對 stories 追加
ALTER TABLE stories ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE stories ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE stories ADD COLUMN module       TEXT;

-- 對 cr_reports 追加
ALTER TABLE cr_reports ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE cr_reports ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE cr_reports ADD COLUMN module       TEXT;
```

#### 分類參考表（非強制 FK，作為 Lookup 用）

```sql
CREATE TABLE taxonomy (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       INTEGER NOT NULL,   -- 1, 2, 3
    code        TEXT NOT NULL UNIQUE,
    parent_code TEXT,               -- Level 2 → Level 1, Level 3 → Level 2
    label_zh    TEXT NOT NULL,       -- 繁中顯示名
    label_en    TEXT NOT NULL,       -- 英文代碼
    description TEXT,               -- 說明
    is_active   INTEGER DEFAULT 1   -- 可停用
);

-- 種子資料範例
INSERT INTO taxonomy (level, code, parent_code, label_zh, label_en) VALUES
-- Level 1
(1, 'myproject',    NULL,        'MyProject 產品線',     'MyProject Products'),
(1, 'devops',     NULL,        'DevOps 自動化',      'DevOps Automation'),
(1, 'ai-agent',   NULL,        'AI Agent 策略',      'AI Agent Strategy'),
(1, 'research',   NULL,        '研究分析',           'Research & Analysis'),

-- Level 2: MyProject
(2, 'pcpt',       'myproject',   'MyProject 個人化印刷',    'Personalized Card Print Tool'),
(2, 'psop',       'myproject',   'PSOP 出版排版',      'Self-publishing & Online Proofing'),
(2, 'platform',   'myproject',   '平台共用基礎',       'Platform Foundation'),

-- Level 2: DevOps
(2, 'pipeline',   'devops',    'Story Pipeline',     'Story Pipeline'),
(2, 'scheduler',  'devops',    '智能中控排程',        'Intelligent Scheduler'),

-- Level 2: AI Agent
(2, 'cc',         'ai-agent',  'Claude Code',        'Claude Code CLI'),
(2, 'gc',         'ai-agent',  'Gemini CLI',         'Gemini CLI'),
(2, 'ag',         'ai-agent',  'Antigravity',        'Antigravity IDE'),
(2, 'rd',         'ai-agent',  'Rovo Dev',           'Rovo Dev'),
(2, 'memory',     'ai-agent',  '記憶庫架構',         'Context Memory DB'),

-- Level 2: Research
(2, 'token',      'research',  'Token 減量策略',      'Token Reduction Strategy'),

-- Level 3: MyProject 模組（精選）
(3, 'editor',          'pcpt',      '編輯器核心',     'Editor Core'),
(3, 'editor.shape',    'pcpt',      '形狀面板',       'Shape Panel'),
(3, 'editor.text',     'pcpt',      '文字屬性',       'Text Properties'),
(3, 'editor.datasource','pcpt',     '資料來源',       'Data Source'),
(3, 'editor.pdf',      'pcpt',      'PDF 生成',       'PDF Generation'),
(3, 'member',          'pcpt',      '會員中心',       'Member Center'),
(3, 'member.auth',     'pcpt',      '登入/認證',      'Auth & Login'),
(3, 'member.profile',  'pcpt',      '個人資料',       'User Profile'),
(3, 'member.payment',  'pcpt',      '金流/訂閱',      'Payment & Subscription'),
(3, 'admin',           'pcpt',      '維運後台',       'Admin BackOffice'),
(3, 'admin.dashboard', 'pcpt',      'Dashboard/KPI',  'Dashboard KPI'),
(3, 'admin.user',      'pcpt',      '會員管理',       'User Management'),
(3, 'admin.finance',   'pcpt',      '會計/財務',      'Finance & Accounting'),
(3, 'admin.audit',     'pcpt',      '匯款審核',       'Remittance Audit'),
(3, 'admin.apikey',    'pcpt',      'API 金鑰',       'API Key Management'),
(3, 'admin.font',      'pcpt',      '字型管理',       'Font Management'),
(3, 'admin.announce',  'pcpt',      '公告管理',       'Announcement'),
(3, 'admin.queue',     'pcpt',      'PDF 佇列',       'PDF Queue Monitor'),
(3, 'legal',           'pcpt',      '法務',           'Legal & Compliance'),
(3, 'seo',             'pcpt',      'SEO/i18n',       'SEO & Internationalization'),
(3, 'security',        'pcpt',      '資安',           'Security'),
(3, 'business-api',    'pcpt',      '商務版 API',     'Business API'),
(3, 'testing',         'pcpt',      '測試策略',       'Testing Strategy'),

-- Level 3: Platform 模組
(3, 'db',              'platform',  '資料庫',         'Database'),
(3, 'azure',           'platform',  'Azure 部署',     'Azure Deployment'),
(3, 'identity',        'platform',  '身份認證共用',    'Identity Foundation'),
(3, 'email',           'platform',  'Email 服務',     'Email Service');
```

### 自動分類策略

寫入 DB 時，分類欄位的填充方式：

```
Level 1（product_line）：
  → 根據來源路徑自動判定
    docs/implementation-artifacts/ → 'myproject'
    scripts/ / .claude/skills/claude-launcher/ → 'devops'
    claude token減量策略研究分析/ → 'research'
    多引擎相關 → 'ai-agent'

Level 2（product_sub）：
  → 根據 Epic ID 或路徑判定
    epic-qgr / epic-1~10 / epic-ux / epic-ds → 'pcpt'
    epic-td → 'pcpt'（技術債仍屬 MyProject）
    pipeline/batch-runner → 'pipeline'
    智能中控 → 'scheduler'

Level 3（module）：
  → 根據 Story ID 前綴 + tags + 影響檔案路徑
    qgr-e* → Story ID 含 'e' → 'editor' 系列
    qgr-a* → 'admin' 系列
    qgr-m* → 'member' 系列
    qgr-ba* → 'business-api'
    qgr-d* → 'editor.pdf'
    qgr-s* → 'security' 或 'seo'（依 tags 細分）
    qgr-t* → 'testing'

  → 影響檔案路徑補充判定
    ClientApp/src/components/Editor/ → 'editor'
    Areas/Admin/ → 'admin'
    Areas/Identity/ → 'member.auth'
    Controllers/MemberController → 'member'
    Services/Payment/ → 'member.payment'
    PdfWorker/ → 'editor.pdf'
```

### MCP Tool 查詢增強

現有 6 個 MCP Tool 不需新增，只需擴展 `filters` 參數：

```javascript
// search_context 增強
search_context({
  query: "Canvas 匯出 PDF 失敗",
  filters: {
    product_line: "myproject",
    product_sub: "pcpt",
    module: "editor.pdf"       // 精準限定到 PDF 生成模組
  }
})

// search_tech 增強
search_tech({
  query: "字型嵌入",
  category: "failure",
  filters: {
    product_sub: "pcpt",
    module: "editor.pdf"
  }
})

// 跨模組查詢 — 所有 admin 相關
search_context({
  query: "Dashboard",
  filters: {
    module: "admin%"            // SQLite LIKE 通配
  }
})

// 跨產品線查詢 — 所有 AI Agent 相關
search_context({
  query: "Token 優化",
  filters: {
    product_line: "ai-agent"
  }
})

// 不帶 filter → 全域搜尋（向下相容）
search_context({ query: "記憶庫" })
```

### 非 MyProject 議題的具體分類範例

| 議題 | product_line | product_sub | module | 存入表 |
|------|:---:|:---:|:---:|:---:|
| Claude Code Token 減量策略 | `research` | `token` | - | tech_entries |
| CC-OPUS 使用最佳實踐 | `ai-agent` | `cc` | - | tech_entries |
| Gemini CLI 多引擎協作 | `ai-agent` | `gc` | - | tech_entries |
| 記憶庫 Schema 設計決策 | `ai-agent` | `memory` | - | tech_entries |
| story-pipeline 錯開啟動規則 | `devops` | `pipeline` | - | tech_entries |
| batch-runner 併發限制 | `devops` | `pipeline` | - | tech_entries |
| 智能中控 Token 安全閥 | `devops` | `scheduler` | - | tech_entries |
| BMAD Workflow 使用手冊 | `devops` | `pipeline` | - | context_entries |
| Antigravity IDE 操作指南 | `ai-agent` | `ag` | - | context_entries |
| PSOP 未來模組規劃 | `myproject` | `psop` | - | context_entries |

### 統計查詢範例

```sql
-- 各產品線的知識條目數
SELECT product_line, COUNT(*) as cnt
FROM tech_entries GROUP BY product_line ORDER BY cnt DESC;

-- MyProject 各模組的 CR Issue 分布
SELECT module, severity, COUNT(*) as cnt
FROM cr_issues
WHERE product_sub = 'pcpt'
GROUP BY module, severity
ORDER BY module, severity;

-- 哪個模組最常出問題？
SELECT module, COUNT(*) as issue_count
FROM cr_issues
WHERE product_line = 'myproject'
GROUP BY module ORDER BY issue_count DESC LIMIT 10;

-- AI Agent 相關的所有技術知識
SELECT title, category, outcome
FROM tech_entries
WHERE product_line = 'ai-agent'
ORDER BY created_at DESC;

-- 跨引擎：Pipeline 相關的所有失敗案例
SELECT title, problem, solution
FROM tech_entries
WHERE product_sub = 'pipeline' AND category = 'failure';
```

### Token 影響分析

| 項目 | 增加 | 說明 |
|------|:---:|------|
| taxonomy 表 | +0 tok | 純查詢用，不影響 Always-On |
| 3 個分類欄位 | +0 tok | 儲存在 DB 內，不增加 MCP Tool 描述 |
| filters 參數擴展 | +15 tok | MCP Tool 描述增加 filter 說明 |
| 查詢精準度提升 | **-30~50 tok** | 返回結果更精準，減少無關結果 |
| **淨效果** | **-15~35 tok/查詢** | 分類越準確，返回雜訊越少 |

### Phase 分期

| Phase | 動作 | 說明 |
|------|------|------|
| Phase 0 | `product_line` + `product_sub` 欄位 + taxonomy 種子資料 | 最低成本，兩層分類即可用 |
| Phase 1 | `module` 欄位 + 自動分類腳本 + ETL 回填歷史資料 | 三層完整分類 |
| Phase 2 | taxonomy 管理 UI（人類可維護） + 分類準確度驗證 | 長期維護 |

### 邊界注意

| # | 邊界 | 風險 | 緩解 |
|---|------|:---:|------|
| 1 | 分類不準確 | 中 | Phase 0 僅用兩層（product_line + product_sub），準確率 >95% |
| 2 | module 層級過細 | 低 | 只分到功能模組（~30 個），不分到檔案級別 |
| 3 | 新模組（PSOP）加入 | 低 | 只需在 taxonomy 新增行，不改 Schema |
| 4 | 跨模組 Story | 中 | 取主要影響模組；若確實跨模組，module 填父級（如 'editor'） |
| 5 | 非 MyProject 記錄過少 | 低 | product_line DEFAULT 'myproject'，只有明確非 MyProject 才改 |

---

## R9.10 全文檔分類適用性 — 擴展 Agent 知識廣度

### 核心問題

R9.3 的三層分類（A/B/C）判定了「哪些文檔該入 DB」，R9.9 的 taxonomy 設計了「入 DB 後怎麼分類」。但兩者尚未打通：**專案中所有文檔（不論是否入 DB）以及專案外的知識，是否都能納入統一分類體系？**

### 回答：是的，taxonomy 適用於所有文檔

#### 適用範圍全景

```
                    taxonomy 分類適用範圍
                    ━━━━━━━━━━━━━━━━━━
    ┌──────────────────────────────────────────────┐
    │ Layer A（入 DB）                              │
    │   stories, cr_reports, cr_issues,            │
    │   tech_entries, context_entries, doc_index    │
    │   → product_line + product_sub + module       │
    │   → 欄位直接寫在每筆 row                      │
    ├──────────────────────────────────────────────┤
    │ Layer B（僅 doc_index）                       │
    │   功能規格, 架構文件, 討論報告, tracking       │
    │   → doc_index 表已有 product_line/sub/module  │
    │   → 分類資訊隨目錄掃描自動填入                 │
    ├──────────────────────────────────────────────┤
    │ Layer C（不入 DB，但 taxonomy 仍可標記）        │
    │   Skill 定義, CLAUDE.md, Token 分析報告        │
    │   → 不佔 DB 空間，但 taxonomy 表本身            │
    │     記錄了這些類別的「存在」                     │
    │   → 未來若需入庫，分類體系已就緒                 │
    ├──────────────────────────────────────────────┤
    │ 專案外知識（新增）                             │
    │   外部研究報告, 其他項目經驗, 通用技術筆記      │
    │   → 透過 MCP add_tech / add_context 手動寫入  │
    │   → taxonomy 的 Level 1 已預留擴展             │
    └──────────────────────────────────────────────┘
```

#### doc_index 表追加分類欄位

```sql
-- doc_index 也加入 taxonomy 三欄位
ALTER TABLE doc_index ADD COLUMN product_line TEXT DEFAULT 'myproject';
ALTER TABLE doc_index ADD COLUMN product_sub  TEXT DEFAULT 'pcpt';
ALTER TABLE doc_index ADD COLUMN module       TEXT;
```

目錄路徑自動映射：

| 路徑 pattern | product_line | product_sub | module |
|-------------|:---:|:---:|:---:|
| `functional-specs/MyProject-MVP/` | myproject | pcpt | (按檔名判定) |
| `architecture/editor-canvas.md` | myproject | pcpt | editor |
| `architecture/pdf-worker.md` | myproject | pcpt | editor.pdf |
| `architecture/auth-payment.md` | myproject | platform | identity |
| `architecture/deployment.md` | myproject | platform | azure |
| `technical-specs/front-end-spec.md` | myproject | pcpt | editor |
| `technical-specs/database-schema.md` | myproject | platform | db |
| `technical-specs/admin-*` | myproject | pcpt | admin |
| `technical-specs/security-spec.md` | myproject | pcpt | security |
| `reference/開發前討論紀錄/` | myproject | pcpt | - |
| `reference/Azure/` | myproject | platform | azure |
| `scripts/story-pipeline.ps1` | devops | pipeline | - |
| `scripts/batch-runner.ps1` | devops | pipeline | - |
| `.claude/skills/*/SKILL.md` | ai-agent | cc | - |
| `.gemini/skills/*/SKILL.md` | ai-agent | gc | - |
| `claude token減量策略研究分析/` | research | token | - |
| `claude token減量策略研究分析/記憶庫策略/` | ai-agent | memory | - |

#### 擴展 Agent 知識廣度 — 專案外知識入庫

taxonomy Level 1 新增 `external` 產品線，容納所有專案外知識：

```sql
-- Level 1 擴展
INSERT INTO taxonomy (level, code, parent_code, label_zh, label_en) VALUES
(1, 'external',   NULL,        '外部知識',          'External Knowledge'),

-- Level 2: External 子類
(2, 'web-tech',   'external',  'Web 技術通用',      'General Web Technology'),
(2, 'dotnet',     'external',  '.NET 生態系',       '.NET Ecosystem'),
(2, 'frontend',   'external',  '前端生態系',        'Frontend Ecosystem'),
(2, 'database',   'external',  '資料庫通用',        'Database General'),
(2, 'cloud',      'external',  '雲端/Azure',        'Cloud & Azure'),
(2, 'ai-ml',      'external',  'AI/ML 技術',        'AI & Machine Learning'),
(2, 'other-proj', 'external',  '其他專案',          'Other Projects'),

-- Level 2: AI Agent 擴展
(2, 'multi-eng',  'ai-agent',  '多引擎協作策略',     'Multi-Engine Collaboration'),
(2, 'mcp',        'ai-agent',  'MCP 協議',          'Model Context Protocol'),
(2, 'prompt-eng', 'ai-agent',  'Prompt 工程',       'Prompt Engineering');
```

**具體入庫範例**：

| 知識來源 | product_line | product_sub | 存入方式 |
|---------|:---:|:---:|---------|
| ASP.NET Core 8 破壞性變更踩坑 | external | dotnet | `add_tech(category='failure')` |
| React 19 Server Components 研究 | external | frontend | `add_tech(category='pattern')` |
| SQL Server 效能調校通用技巧 | external | database | `add_tech(category='benchmark')` |
| Azure App Service 部署排錯記錄 | external | cloud | `add_tech(category='workaround')` |
| 其他客戶專案的 PDF 生成經驗 | external | other-proj | `add_tech(category='success')` |
| MCP 協議版本更新筆記 | ai-agent | mcp | `add_context()` |
| 多引擎任務分配最佳實踐 | ai-agent | multi-eng | `add_tech(category='pattern')` |
| Claude Opus 4.6 特性與限制 | ai-agent | cc | `add_tech(category='pattern')` |
| BMAD v6 Workflow 使用心得 | devops | pipeline | `add_context()` |

**Agent 廣度提升效果**：

```
Before（無 DB）：
  Agent 每次啟動 → 只知 CLAUDE.md + Skills → 專案內靜態知識
  遇到新問題 → grep 專案文件 → 找不到就靠 LLM 內建知識（可能過時）

After（有 taxonomy + DB）：
  Agent 每次啟動 → search_tech 查 DB
    → MyProject 內部經驗（pcpt/platform）
    → DevOps 自動化經驗（pipeline/scheduler）
    → AI Agent 使用策略（cc/gc/ag）
    → 外部通用技術（dotnet/frontend/database）
    → 其他專案交叉經驗（other-proj）
  → 知識面從「一個專案」擴展到「全領域」
```

---

## R9.11 資料存檔精化策略 — 雙語儲存 + 內容優化

### 議題 1：雙語儲存策略

#### 現況問題

主報告 §12.2 已定義 DB 語言憲章：「索引欄位英文 + 內容欄位繁體中文」。但這個規則需要進一步精化：

1. **AI 消費的摘要內容**用繁中 → Token 浪費（中文每字 2-3 tokens，英文每字 1-1.5 tokens）
2. **人類審查的報告**用英文 → 閱讀體驗差

#### 解決方案：欄位級雙語設計

```sql
-- tech_entries 欄位語言規範（不改 Schema，改寫入規範）
--
-- AI 消費欄位（英文）：
--   title          → 英文技術標題（如 "Canvas PDF export font embedding failure"）
--   problem        → 英文技術描述（如 "html2canvas corrupts CJK font rendering"）
--   solution       → 英文技術方案（如 "Use Playwright-based PdfWorker with font subset"）
--   tags           → 英文（已是規範）
--   category       → 英文（已是規範）
--   tech_stack     → 英文（已是規範）
--
-- 人類審查欄位（繁中）：
--   lessons        → 繁中經驗總結（如 "html2canvas 對中日韓字型支援不足，必須用 Playwright 方案"）
--   content(ctx)   → 繁中詳細說明（AI 不常讀，人類審查用）
--
-- 雙語欄位（英文主體 + 繁中註解）：
--   code_snippets  → 程式碼本身英文，註解可繁中
```

#### Token 節省量化

| 欄位 | 原方案（全繁中） | 新方案（英文） | 節省 |
|------|:---:|:---:|:---:|
| title（~15 字） | ~30-45 tok | ~15-20 tok | **-50%** |
| problem（~50 字） | ~100-150 tok | ~50-75 tok | **-50%** |
| solution（~80 字） | ~160-240 tok | ~80-120 tok | **-50%** |
| lessons（~30 字） | 保持繁中 ~60-90 tok | 保持繁中 | 0% |
| **每筆合計** | ~350-525 tok | ~205-305 tok | **-42%** |
| **DB 查詢返回 5 筆** | ~1,750-2,625 tok | ~1,025-1,525 tok | **-42%** |

#### 寫入時的語言路由規則

```
MCP add_tech(entry) 寫入流程：

1. AI Agent 產生結構化條目
2. 語言路由：
   entry.title     → 強制英文（若 AI 產生中文 → 自動翻譯或提示）
   entry.problem   → 強制英文
   entry.solution  → 強制英文
   entry.lessons   → 強制繁中（人類審查用）
   entry.tags      → 強制英文
   entry.category  → 強制英文（枚舉值）
3. 驗證：MCP Server 在寫入前檢查語言合規
   → 偵測到非預期語言 → 警告但不阻斷（避免寫入失敗）
```

#### MCP Server 語言驗證實作

```javascript
// server.js 中的語言驗證
function validateLanguage(entry) {
  const warnings = [];

  // 英文欄位檢查：若含 CJK 字元比例 > 30% → 警告
  const cjkRatio = (str) => {
    const cjk = str.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
    return cjk.length / str.length;
  };

  if (entry.title && cjkRatio(entry.title) > 0.3) {
    warnings.push('title should be in English for AI consumption');
  }
  if (entry.problem && cjkRatio(entry.problem) > 0.3) {
    warnings.push('problem should be in English for AI consumption');
  }
  if (entry.solution && cjkRatio(entry.solution) > 0.3) {
    warnings.push('solution should be in English for AI consumption');
  }

  // 繁中欄位檢查：若全英文 → 提示
  if (entry.lessons && cjkRatio(entry.lessons) < 0.1) {
    warnings.push('lessons should be in Traditional Chinese for human review');
  }

  return warnings; // 不阻斷，僅警告
}
```

### 議題 2：內容優化（寫入前壓縮）

#### 問題

AI 產生的文字通常冗長。直接存入 DB → 查詢時返回大量冗餘 Token → 浪費。

#### 解決方案：三級壓縮策略

```
Level 1 — 結構化壓縮（MCP Server 自動）
  去除 Markdown 格式符號（#、**、-）
  去除重複空白、空行
  截斷超長欄位（title ≤ 100 字元, problem/solution ≤ 500 字元）
  → 節省 ~15-20%

Level 2 — 語意壓縮（AI 寫入時）
  在 Skill 指引中要求 AI 用精簡語句
  禁止使用的冗詞模式：
    ❌ "需要注意的是..." / "值得一提的是..."
    ❌ "根據上述分析可以得出結論..."
    ❌ "在這個情況下我們發現..."
  要求格式：
    ✅ 主詞 + 動詞 + 結果（如 "html2canvas corrupts CJK fonts"）
    ✅ 原因 → 解法（如 "Root: missing font subset → Fix: Playwright PDF render"）
  → 節省 ~25-35%

Level 3 — 去重壓縮（定期腳本）
  validate-data.js 週排程：
    偵測 title 相似度 > 0.8 的重複條目 → 合併或標記
    偵測 content 長度 > 500 字元但 FTS 命中率 < 5% → 建議精簡
  → 長期維護品質
```

#### Schema 層面的優化

```sql
-- 新增 content_version 欄位追蹤壓縮版本
ALTER TABLE tech_entries ADD COLUMN content_version INTEGER DEFAULT 1;
-- v1 = 原始寫入
-- v2 = Level 1 壓縮後
-- v3 = Level 2 語意壓縮後（人工或 AI 精簡）

-- 新增 char_count 輔助欄位（用於監控膨脹）
ALTER TABLE tech_entries ADD COLUMN char_count INTEGER;
ALTER TABLE context_entries ADD COLUMN char_count INTEGER;
```

#### 寫入前壓縮的 MCP Server 實作

```javascript
// server.js 中的 Level 1 壓縮
function compressEntry(entry) {
  const compress = (str) => {
    if (!str) return str;
    return str
      .replace(/^#{1,6}\s+/gm, '')     // 去 Markdown 標題
      .replace(/\*\*([^*]+)\*\*/g, '$1') // 去粗體
      .replace(/`([^`]+)`/g, '$1')       // 去行內碼
      .replace(/\n{3,}/g, '\n\n')        // 壓縮多空行
      .replace(/^\s*[-*]\s+/gm, '- ')    // 統一列表符號
      .trim();
  };

  return {
    ...entry,
    title: entry.title?.substring(0, 100),
    problem: compress(entry.problem)?.substring(0, 500),
    solution: compress(entry.solution)?.substring(0, 500),
    lessons: compress(entry.lessons)?.substring(0, 300),
    content: compress(entry.content)?.substring(0, 800),
    char_count: JSON.stringify(entry).length,
    content_version: 1
  };
}
```

### 議題 3：查詢返回格式優化

DB 查詢結果注入 Prompt 時，也需要精簡格式：

```javascript
// MCP Tool 返回格式 — 精簡版（給 AI 消費）
function formatForAI(results) {
  return results.map(r => ({
    id: r.id,
    title: r.title,           // 英文，~20 tok
    category: r.category,     // 英文枚舉，~2 tok
    problem: r.problem,       // 英文，~50 tok
    solution: r.solution,     // 英文，~80 tok
    tags: r.tags,             // 英文，~10 tok
    confidence: r.confidence  // 數值，~2 tok
    // 不返回 lessons（繁中，AI 不需要）
    // 不返回 code_snippets（太長）
    // 不返回 created_at, updated_at（AI 不關心）
  }));
  // 每筆 ~164 tok，5 筆 ~820 tok（vs. 全欄位 ~2,625 tok）
}

// 人類查閱格式 — 完整版（CLI 工具 / 報告用）
function formatForHuman(results) {
  return results.map(r => ({
    ...r,
    lessons: r.lessons,       // 繁中，人類看得懂
    code_snippets: r.code_snippets, // 完整程式碼
    created_at: r.created_at  // 時間脈絡
  }));
}
```

### 綜合 Token 節省

| 優化項目 | 節省量（每次查詢 5 筆） | 說明 |
|---------|:---:|------|
| AI 消費欄位改英文 | **-700~1,100 tok** | problem/solution/title 英文化 |
| Level 1 結構壓縮 | **-150~250 tok** | 去 Markdown + 截斷 |
| Level 2 語意壓縮 | **-250~400 tok** | 精簡措辭 |
| 返回格式裁剪 | **-500~800 tok** | 不返回 AI 不需要的欄位 |
| **合計** | **-1,600~2,550 tok** | 從原始 ~2,625 降至 ~820 tok |
| **節省率** | **~61~69%** | |

### 與主報告 §12.2 語言憲章的關係

| 維度 | 主報告 §12.2（原版） | R9.11（精化版） | 差異 |
|------|:---:|:---:|------|
| 索引欄位語言 | 英文 | 英文（不變） | 無 |
| 內容欄位語言 | 繁體中文 | **分欄位**：AI 消費英文 + 人類審查繁中 | 精化 |
| title 語言 | 依內容性質 | **強制英文**（AI 搜尋命中率關鍵） | 明確化 |
| 驗證機制 | 僅在 Skill 說明 | **MCP Server 層驗證**（CJK 比例檢測） | 強化 |
| 壓縮策略 | 無 | **三級壓縮** | 新增 |
| 返回格式 | 無 | **AI/人類雙格式** | 新增 |

### 可行性與邊界

| # | 議題 | 可行性 | 邊界風險 | 緩解 |
|---|------|:---:|:---:|------|
| 1 | AI 消費欄位強制英文 | 高 | AI 偶爾產出中文 | MCP 驗證警告 + Skill 指引 |
| 2 | 人類審查欄位繁中 | 高 | 無 | 自然語言 |
| 3 | Level 1 自動壓縮 | 高 | 截斷可能丟資訊 | 截斷閾值保守（500 字元） |
| 4 | Level 2 語意壓縮 | 中 | 依賴 AI 遵循 Skill 指引 | Skill 中明確禁止冗詞 |
| 5 | 返回格式裁剪 | 高 | AI 偶爾需要 lessons | 提供 `verbose=true` 選項 |
| 6 | 語言驗證效能 | 高 | CJK regex 極快（< 1ms） | 無瓶頸 |
| 7 | 外部知識品質 | 中 | 手動輸入品質參差 | confidence 分數 + 定期清理 |

### Phase 整合

| Phase | 精化動作 | 說明 |
|------|---------|------|
| Phase 0 | Skill 指引寫入語言規範 + MCP Server Level 1 壓縮 | 零額外 Schema |
| Phase 1 | MCP Server 語言驗證 + AI/人類雙返回格式 + char_count 監控 | 追加 2 個欄位 |
| Phase 2 | Level 2 語意壓縮指引精化 + validate-data.js 去重 + 外部知識批次匯入 | 長期品質維護 |
