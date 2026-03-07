# AC 分析報告：上下文資料庫與技術知識庫架構策略

> **分析者**：BMAD Party Mode 聯合分析團隊
> - 🏗️ Winston（架構師）— 上下文架構原理與實施路線圖
> - 📊 Mary（分析師）— 痛點根因分析與量化數據
> - 💻 Amelia（開發者）— MCP Server 實作架構設計
> - 🔬 Dr. Quinn（問題解決者）— 技術可行性評估
> - 📋 John（產品經理）— 擴展情境與 ROI 評估
> - 📚 Paige（技術寫手）— 現有系統整合評估
>
> **建檔者**：AG-OPUS（Antigravity IDE — Claude Opus 4.6）
> **建檔時間**：2026-03-05 22:09:55
> **引擎**：Antigravity IDE
> **參考資料**：`claude token減量策略研究分析/` 全部文件（16 份分析報告 + 17 個 TRS Stories）

---

## 一、研究背景與目的

### 1.1 議題來源

MyProject 專案目前運作四引擎 AI Agent 協作體系（Claude Code CLI、Gemini CLI、Antigravity IDE、Rovo Dev CLI），在 Token 減量策略研究（TRS 系列）中，Phase 5 曾提及「SQLite FTS5 本地 RAG」的概念驗證方向。本次討論延續該方向，進一步探討三大核心議題：

1. **建立上下文記憶資料庫** — 讓 AI 依需求查詢歷史上下文（按日期、關鍵字），而非每次全量讀取
2. **建立技術知識庫** — 記錄成功案例、不可行方式、設計模式等技術經驗
3. **擴展應用情境** — 除上述兩點外的其他可行應用場景

### 1.2 分析範疇

本報告基於以下核心文件進行分析：

| # | 文件 | 核心貢獻 |
|---|------|---------|
| 1 | `PHYCOOL_Claude_Code_Token_減量策略_深度分析報告.md` | 逐行審計、快取殺手識別、精確量化 |
| 2 | `MyProject_Claude_Code_Token減量策略_最終彙整報告.md` | A~F 類分類框架、TRS Story 完整追蹤 |
| 3 | `multi-engine-collaboration-strategy.md` | 四引擎生態系規格、Agent ID 規範、狀態同步機制 |
| 4 | `web_claude多agnet協作策略.md` | 三引擎協作 SOP、MCP 共用架構、追蹤設計 |
| 5 | `BMAD-METHOD 與 everything-claude-code 比較.md` | BMAD vs ECC 架構哲學比較、上下文分片機制 |
| 6 | `auto-pilot-multi-agent-research.md.resolved` | Auto-Pilot 指揮台模式、跨引擎委派策略 |

---

## 二、現況分析：四引擎上下文架構原理

### 2.1 上下文載入層級架構

```
┌─────────────────────────────────────────────────────────────┐
│                    上下文載入層級架構                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Always-On（靜態，每次對話 100% 載入）              │
│  ├── 全域憲章（CLAUDE.md / GEMINI.md / AGENTS.md）          │
│  ├── Rules 目錄（.claude/rules/ / .agent/rules/）           │
│  └── Skills 摘要（YAML description）                        │
│                                                             │
│  Layer 2: On-Demand（動態，50~80% 機率性觸發）               │
│  ├── SKILL.md 完整內容（語義匹配觸發）                       │
│  ├── Workflow 指令（工作流 XML/YAML）                        │
│  └── 參考文件（references/）                                │
│                                                             │
│  Layer 3: Session State（對話中累積）                         │
│  ├── 使用者訊息歷史                                         │
│  ├── 工具呼叫結果（檔案內容、指令輸出）                      │
│  ├── LLM 推理過程與中間產物                                  │
│  └── Antigravity Knowledge Items（跨 Session 持久化）        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各引擎核心差異

| 維度 | Claude Code | Gemini CLI | Antigravity IDE | Rovo Dev CLI |
|------|------------|------------|-----------------|-------------|
| **上下文視窗** | ~200K tok | **~1M tok** | 依模型 | 依模型 |
| **持久記憶** | ❌ 無原生 | ❌ 無原生 | ✅ Knowledge Base | ❌ 無原生 |
| **壓縮機制** | AutoCompact 83.5% | 閾值觸發 | 依模型 | N/A |
| **快取機制** | Prompt Caching | 無 | 依模型 | 無 |
| **跨 Session 狀態** | 檔案系統 | 檔案系統 | KI 自動生成 | 檔案系統 |

**關鍵發現**：目前四引擎的「記憶」全部依賴**檔案系統**（sprint-status.yaml、.track.md、Story 文件等），缺乏統一的結構化知識檢索機制。

---

## 三、痛點分析與量化基線

### 3.1 全量讀取造成的 Token 浪費

| 浪費來源 | 位置 | 重複次數 | Token 浪費/次 |
|---------|------|:--------:|:------------:|
| `sprint-status.yaml` 全量讀取 | create-story + dev-story | 5+ 次/Sprint | ~500-1,500 |
| `create-story/instructions.xml` Step 1 重複邏輯 | 第 24-178 行 | 每次 create | ~1,500 |
| Story 文件/架構文件重複讀取 | dev-story + code-review | 2-3 次/Story | ~1,000-3,000 |
| **單次 Sprint 循環累計浪費** | | | **~5,000-9,000** |

### 3.2 上下文遺失的隱性成本

| 遺失場景 | 頻率 | 隱性成本 |
|---------|------|---------|
| 同一 Bug 在不同 Session 重複研究 | 每週 2-3 次 | 每次 ~3,000-10,000 tok |
| 已驗證技術方案無法精確引用 | 每 Story 1-2 次 | 決策延遲 + 潛在方向錯誤 |
| 「不可行方案」未系統記錄 | 累積性 | 重蹈覆轍的 Token + 時間成本 |

### 3.3 知識孤島問題

四引擎各自的對話歷史中包含大量有價值的技術知識（code-review 回饋、debug 歷程、架構決策脈絡），但**分散在不同 Session 中，沒有統一檢索機制**。當引擎交接時，這些脈絡無法被系統性傳遞。

---

## 四、技術方案評估

### 4.1 方案對照

| 方案 | 技術 | 優勢 | 劣勢 | MyProject 適用性 |
|------|------|------|------|:-------------:|
| **A. SQLite FTS5** | 本地全文搜尋 | 零部署、高效能、中文支援 | 無語義搜尋 | ⭐⭐⭐⭐⭐ |
| **B. Embedding + Vector DB** | ChromaDB / Qdrant | 語義搜尋能力強 | 需額外服務、運維成本 | ⭐⭐⭐ |
| **C. Structured JSON** | JSON + JQ | 最簡實作 | 搜尋效能差、規模受限 | ⭐⭐ |
| **D. MCP Server** | 自建 MCP | 統一介面、四引擎通用 | 開發成本 | ⭐⭐⭐⭐ |
| **E. KI 增強** | Antigravity KB | 已部分可用 | 僅限 Antigravity | ⭐⭐⭐ |

### 4.2 推薦方案：SQLite FTS5 + MCP Server

**選型理由**：
1. **零部署成本**：SQLite 為本地檔案型資料庫，無需額外服務
2. **全文搜尋**：FTS5 支援 BM25 排名、前綴搜尋、欄位加權
3. **四引擎通用**：透過 MCP Server 暴露統一查詢 API
4. **先例支持**：TRS 深度分析報告 Phase 5 已提及此方向
5. **漸進式擴展**：未來可追加 Embedding 向量搜尋層

---

## 五、架構設計

### 5.1 上下文記憶資料庫 Schema

```sql
-- 上下文記錄表
CREATE TABLE context_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,                          -- 對話 Session ID
    agent_id    TEXT NOT NULL,                 -- CC-OPUS / GC-PRO / AG-OPUS / RD-*
    timestamp   TEXT NOT NULL,                 -- ISO-8601
    category    TEXT NOT NULL,                 -- debug / design / review / implement / plan
    tags        TEXT,                          -- JSON array, 關鍵字
    title       TEXT NOT NULL,                 -- 摘要標題
    content     TEXT NOT NULL,                 -- 完整內容
    related_files TEXT,                        -- JSON array, 涉及檔案路徑
    story_id    TEXT,                          -- 關聯 Story ID
    epic_id     TEXT                           -- 關聯 Epic ID
);

-- FTS5 全文搜尋虛擬表
CREATE VIRTUAL TABLE context_fts USING fts5(
    title, content, tags,
    content=context_entries,
    content_rowid=id
);
```

### 5.2 技術知識庫 Schema

```sql
-- 技術知識表
CREATE TABLE tech_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by      TEXT NOT NULL,              -- Agent ID
    created_at      TEXT NOT NULL,              -- ISO-8601
    updated_at      TEXT,
    category        TEXT NOT NULL,              -- success / failure / workaround / pattern / bugfix / architecture / benchmark
    tech_stack      TEXT,                       -- C# / React / SQL / Fabric.js / etc.
    tags            TEXT,                       -- JSON array
    title           TEXT NOT NULL,              -- 技術主題
    problem         TEXT,                       -- 問題描述
    solution        TEXT,                       -- 解決方案
    outcome         TEXT NOT NULL,              -- success / failure / partial
    lessons         TEXT,                       -- 經驗教訓
    code_snippets   TEXT,                       -- JSON, 程式碼片段
    related_files   TEXT,                       -- JSON array, 涉及檔案路徑
    references      TEXT,                       -- 外部連結/文件引用
    confidence      INTEGER DEFAULT 80          -- 信心分數 0-100
);

-- FTS5 全文搜尋虛擬表
CREATE VIRTUAL TABLE tech_fts USING fts5(
    title, problem, solution, lessons, tags,
    content=tech_entries,
    content_rowid=id
);

-- 技術分類索引值
-- ✅ success  — 成功案例
-- ❌ failure  — 不可行方式
-- ⚠️ workaround — 暫時解法
-- 🔧 pattern  — 設計模式 / 最佳實踐
-- 🐛 bugfix   — Bug 修復紀錄
-- 🏗️ architecture — 架構決策記錄
-- 📊 benchmark — 效能基準測試
```

### 5.3 專案追蹤資料結構 Schema（Epic / Story / 關聯 / 歷史）

> **設計動機**：MyProject 專案目前有 **21 個 Epic 目錄**、**100+ 個 Stories**（僅 QGR 就有 84 個），彼此存在跨 Epic 的關聯（如 `td-15` 移至 `epic-qgr` 更名為 `qgr-m10`）。現有的 `sprint-status.yaml` 以扁平 key-value 儲存，缺乏關聯查詢與全文搜尋能力。將其結構化至資料庫後，可實現：
> - 按關鍵字模糊搜尋 Story 標題與描述
> - 按 Epic / 狀態 / 優先級 / Agent / 日期範圍過濾
> - 查詢跨 Epic 的 Story 關聯（依賴、拆分、合併、取代）
> - 追溯每個 Story 的完整狀態變更歷史

#### 5.3.1 Epic 資料表

```sql
-- Epic 主表
CREATE TABLE epics (
    id              TEXT PRIMARY KEY,              -- epic-qgr, epic-td, epic-1, ...
    title           TEXT NOT NULL,                 -- 專案品質差距修復 (Quality Gap Repair)
    description     TEXT,                          -- Epic 完整描述
    status          TEXT NOT NULL DEFAULT 'backlog', -- backlog / in-progress / done
    category        TEXT,                          -- platform / editor / pdf / admin / infra / testing
    total_stories   INTEGER DEFAULT 0,             -- Story 總數
    done_stories    INTEGER DEFAULT 0,             -- 已完成 Story 數
    created_at      TEXT NOT NULL,                 -- ISO-8601
    completed_at    TEXT,                          -- 完成時間
    tags            TEXT,                          -- JSON array, 關鍵字
    source_doc      TEXT                           -- 來源文件路徑 (如 project-quality-gap-analysis-report.md)
);

-- Epic 全文搜尋
CREATE VIRTUAL TABLE epics_fts USING fts5(
    id, title, description, tags,
    content=epics,
    content_rowid=rowid
);
```

#### 5.3.2 Story 資料表

```sql
-- Story 主表（對應 sprint-status.yaml 中的每一筆 Story）
CREATE TABLE stories (
    id              TEXT PRIMARY KEY,              -- qgr-m1-emailsender-sendgrid
    epic_id         TEXT NOT NULL,                 -- 所屬 Epic ID
    title           TEXT NOT NULL,                 -- EmailSender SendGrid 整合
    description     TEXT,                          -- Story 完整描述
    status          TEXT NOT NULL DEFAULT 'backlog', -- backlog / ready-for-dev / in-progress / review / done / cancelled / superseded / split
    priority        TEXT,                          -- P0 / P1 / P2 / P3
    complexity      TEXT,                          -- XS / S / M / L / XL
    cr_score        INTEGER,                       -- Code Review 分數 (0-100)
    test_count      INTEGER DEFAULT 0,             -- 測試案例數量
    fixed_count     INTEGER DEFAULT 0,             -- CR 修復數量
    assigned_agent  TEXT,                          -- 開發者 Agent ID (CC-SONNET, GC-PRO, etc.)
    reviewed_by     TEXT,                          -- 審查者 Agent ID (CC-OPUS, etc.)
    tested_by       TEXT,                          -- 測試者 Agent ID (AG-OPUS, etc.)
    created_at      TEXT NOT NULL,                 -- ISO-8601
    created_by      TEXT,                          -- 建立者 Agent ID
    completed_at    TEXT,                          -- 完成時間
    story_file      TEXT,                          -- Story 文件路徑
    review_file     TEXT,                          -- CR 報告路徑
    tags            TEXT,                          -- JSON array, 關鍵字
    notes           TEXT,                          -- 備註（如 cancelled 原因）
    FOREIGN KEY (epic_id) REFERENCES epics(id)
);

-- Story 全文搜尋（支援關鍵字 + 模糊搜尋）
CREATE VIRTUAL TABLE stories_fts USING fts5(
    id, title, description, tags, notes,
    content=stories,
    content_rowid=rowid
);

-- 常用查詢索引
CREATE INDEX idx_stories_epic ON stories(epic_id);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_priority ON stories(priority);
CREATE INDEX idx_stories_agent ON stories(assigned_agent);
CREATE INDEX idx_stories_completed ON stories(completed_at);
```

#### 5.3.3 Story 關聯表（跨 Epic 關聯）

```sql
-- Story 關聯表（處理跨 Epic 的依賴、拆分、合併、取代關係）
CREATE TABLE story_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL,                 -- 來源 Story ID
    target_id       TEXT NOT NULL,                 -- 目標 Story ID
    relation_type   TEXT NOT NULL,                 -- depends_on / blocks / split_from / merged_into / superseded_by / renamed_from / moved_from
    description     TEXT,                          -- 關聯說明
    created_at      TEXT NOT NULL,                 -- ISO-8601
    FOREIGN KEY (source_id) REFERENCES stories(id),
    FOREIGN KEY (target_id) REFERENCES stories(id)
);

-- 關聯類型說明：
-- depends_on    — Story A 依賴 Story B 先完成
-- blocks        — Story A 阻塞 Story B 的進行
-- split_from    — Story A 從 Story B 拆分出來 (如 td-9 → split)
-- merged_into   — Story A 合併到 Story B (如 trs-14 → cancelled-merged 至 trs-13)
-- superseded_by — Story A 被 Story B 取代 (如 td-7 → superseded)
-- renamed_from  — Story A 從 Story B 改名 (如 td-15 → qgr-m10)
-- moved_from    — Story A 從別的 Epic 移入 (如 td-15 移至 epic-qgr)

-- 範例資料（反映 sprint-status.yaml 的現有關聯）：
-- INSERT INTO story_relations VALUES (NULL, 'trs-14', 'trs-13', 'merged_into', '合併至 TRS-13', '2026-02-25');
-- INSERT INTO story_relations VALUES (NULL, 'td-15-checkout-modal-dry-css', 'qgr-m10-checkout-modal-dry-refactor', 'renamed_from', '已移至 epic-qgr', '2026-03-01');
-- INSERT INTO story_relations VALUES (NULL, 'td-7-canvas-padding-coordinate-fix', NULL, 'superseded_by', '被後續 Story 取代', '2026-03-01');
```

#### 5.3.4 Story 狀態變更歷史表

```sql
-- Story 狀態變更歷史（追溯每次狀態轉換）
CREATE TABLE story_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        TEXT NOT NULL,                 -- Story ID
    from_status     TEXT,                          -- 變更前狀態
    to_status       TEXT NOT NULL,                 -- 變更後狀態
    changed_by      TEXT NOT NULL,                 -- Agent ID
    changed_at      TEXT NOT NULL,                 -- ISO-8601
    action          TEXT,                          -- created / dev-started / dev-completed / review-started / review-passed / review-rejected / cancelled
    notes           TEXT,                          -- 備註
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE INDEX idx_history_story ON story_history(story_id);
CREATE INDEX idx_history_agent ON story_history(changed_by);
CREATE INDEX idx_history_date ON story_history(changed_at);
```

#### 5.3.5 查詢範例

```sql
-- 🔍 模糊搜尋：找到所有與「PDF」相關的 Story
SELECT s.id, s.title, s.status, s.epic_id, s.cr_score
FROM stories s
JOIN stories_fts f ON s.rowid = f.rowid
WHERE stories_fts MATCH 'PDF*'
ORDER BY rank;

-- 📊 按 Epic 統計完成率
SELECT e.id, e.title, e.total_stories, e.done_stories,
       ROUND(e.done_stories * 100.0 / e.total_stories, 1) AS completion_pct
FROM epics e
WHERE e.status != 'done'
ORDER BY completion_pct DESC;

-- 🔗 查詢某 Story 的所有關聯（含雙向）
SELECT r.relation_type, r.description,
       CASE WHEN r.source_id = 'qgr-m10-checkout-modal-dry-refactor'
            THEN r.target_id ELSE r.source_id END AS related_story
FROM story_relations r
WHERE r.source_id = 'qgr-m10-checkout-modal-dry-refactor'
   OR r.target_id = 'qgr-m10-checkout-modal-dry-refactor';

-- 👤 查詢某 Agent 負責的所有 Story 與 CR 分數
SELECT s.id, s.title, s.cr_score, s.test_count, s.completed_at
FROM stories s
WHERE s.assigned_agent = 'CC-SONNET' AND s.status = 'done'
ORDER BY s.completed_at DESC;

-- 📋 查詢特定日期範圍的狀態變更
SELECT h.story_id, h.from_status, h.to_status, h.changed_by, h.changed_at
FROM story_history h
WHERE h.changed_at BETWEEN '2026-03-01' AND '2026-03-05'
ORDER BY h.changed_at DESC;

-- 🎯 查詢所有 ready-for-dev 且為 P0 優先級的 Story
SELECT s.id, s.title, s.epic_id, s.complexity, s.created_by
FROM stories s
WHERE s.status = 'ready-for-dev' AND s.priority = 'P0'
ORDER BY s.created_at;

-- 🔍 跨 Epic 模糊搜尋：找到所有與「apikey」或「金鑰」相關的 Story
SELECT s.id, s.title, s.epic_id, s.status
FROM stories s
JOIN stories_fts f ON s.rowid = f.rowid
WHERE stories_fts MATCH 'apikey OR 金鑰 OR api-key'
ORDER BY rank;
```

### 5.4 統一存取架構（MCP Server）

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Claude Code  │  │  Gemini CLI  │  │ Antigravity  │  │ Rovo Dev CLI │
│   CC-OPUS    │  │   GC-PRO     │  │   AG-OPUS    │  │  RD-SONNET   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │         MCP Protocol (stdio)      │                 │
       └────────────┬────┴────────┬────────┘                 │
                    │             │                           │
              ┌─────▼─────────────▼─────┐                    │
              │   MyProject Context MCP    │◄───────────────────┘
              │      Server (Node.js)    │
              ├─────────────────────────┤
              │                         │
              │  📝 上下文記憶 Tools:    │
              │  ├─ search_context()    │  ← 關鍵字 / 日期 / Agent 搜尋
              │  ├─ add_context()       │  ← 新增上下文記錄
              │  ├─ get_recent()        │  ← 取得最近 N 筆
              │                         │
              │  🔧 技術知識庫 Tools:    │
              │  ├─ search_tech()       │  ← 技術庫搜尋
              │  ├─ add_tech()          │  ← 新增技術記錄
              │                         │
              │  📋 專案追蹤 Tools:      │
              │  ├─ search_stories()    │  ← 關鍵字/模糊搜尋 Story
              │  ├─ get_epic_status()   │  ← 查詢 Epic 狀態與完成率
              │  ├─ get_story_detail()  │  ← 取得 Story 完整資訊+關聯
              │  ├─ get_story_history() │  ← 取得 Story 狀態變更歷史
              │  ├─ find_related()      │  ← 查詢跨 Epic Story 關聯
              │  ├─ sync_from_yaml()    │  ← 從 sprint-status.yaml 同步
              │                         │
              │  📊 統計 Tools:          │
              │  └─ get_stats()         │  ← 綜合統計資訊
              │                         │
              └────────┬────────────────┘
                       │
              ┌────────▼────────────────┐
              │     SQLite Database      │
              │  ├─ context_entries      │ ← 上下文記憶
              │  ├─ context_fts (FTS5)   │
              │  ├─ tech_entries         │ ← 技術知識
              │  ├─ tech_fts (FTS5)      │
              │  ├─ epics               │ ← Epic 主表
              │  ├─ epics_fts (FTS5)    │
              │  ├─ stories             │ ← Story 主表
              │  ├─ stories_fts (FTS5)  │
              │  ├─ story_relations     │ ← 跨 Epic 關聯
              │  └─ story_history       │ ← 狀態變更歷史
              └─────────────────────────┘
              (位置: .context-db/myproject.db)
```

#### 資料同步策略

| 同步方式 | 說明 | 觸發時機 |
|---------|------|---------|
| **YAML → DB 批量同步** | 解析 `sprint-status.yaml` 全量匯入/更新 | 手動呼叫 `sync_from_yaml()` 或 Phase 1 Hook |
| **Story 文件 → DB** | 解析 Story `.md` 檔案提取結構化欄位 | `create-story` / `dev-story` 完成時 |
| **即時寫入** | Agent 透過 MCP Tool 直接寫入新記錄 | 任何 Agent 執行任務時 |
| **CR 報告 → DB** | 解析 CR 報告提取分數、修復數、測試數 | `code-review` 完成時 |

### 5.5 MCP 配置分發

各引擎透過各自的 MCP 配置路徑連接同一個 MCP Server：

| 引擎 | 配置路徑 | 格式範例 |
|------|---------|---------| 
| Claude Code | `.mcp.json` | `{ "mcpServers": { "myproject-context": { "command": "node", "args": [".context-db/server.js"] } } }` |
| Gemini CLI | `.gemini/settings.json` | 同上格式，放在 `mcpServers` 區塊 |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | 同上格式（HTTP 用 `serverUrl`） |
| Rovo Dev CLI | YAML 配置 | MCP stdio 配置 |

---

## 六、擴展應用情境

### 6.1 核心情境

| # | 情境 | 觸發時機 | 價值 |
|---|------|---------|------|
| 1 | **上下文記憶搜尋** | AI 收到任務指令時 | 避免重複研究，Token 節省 |
| 2 | **技術庫查詢** | 遇到技術問題時 | 避免重蹈覆轍，加速決策 |
| 3 | **Story 關鍵字搜尋** | `create-story` / `dev-story` 時 | 快速定位相關 Story，避免重複 |

### 6.2 擴展情境

| # | 情境 | 觸發時機 | 價值 |
|---|------|---------|------|
| 4 | **Code Review 知識累積** | `code-review` 完成後 | 自動記錄常見問題模式 |
| 5 | **故障排除知識圖譜** | Debug 解決後 | 「症狀 → 根因 → 解法」三元組 |
| 6 | **架構決策追溯（ADR）** | 架構設計後 | 記錄「為什麼選 A 而非 B」的脈絡 |
| 7 | **Sprint 回顧分析** | Sprint 結束時 | 自動彙整技術挑戰、解決方案、效能數據 |
| 8 | **跨引擎交接上下文** | 引擎切換時 | 自動查詢上一引擎的相關工作記錄 |
| 9 | **Story 依賴分析** | `create-story` 時 | 查詢技術庫+Story 庫是否已有相似實作 |
| 10 | **錯誤模式預警** | coding 過程中 | 偵測到類似 failure 記錄時主動提醒 |
| 11 | **新引擎上手** | 新引擎加入時 | 自動提供專案技術慣例精華 |
| 12 | **效能基準追蹤** | 效能測試後 | 記錄基準數據，追蹤趨勢 |
| 13 | **安全漏洞知識庫** | Security scan 後 | 記錄已修復漏洞模式，防止復發 |
| 14 | **跨 Epic Story 影響分析** | Story 狀態變更時 | 查詢被變更 Story 的所有關聯 Story |
| 15 | **Agent 生產力報表** | Sprint 結束時 | 按 Agent 統計完成數、CR 分數、測試覆蓋 |

---

## 七、與現有系統的整合評估

### 7.1 現有記憶機制清單

| 機制 | 位置 | 類型 | 限制 |
|------|------|------|------|
| Antigravity KI | `~/.gemini/antigravity/brain/` | 自動語義萃取 | 僅 Antigravity 可存取 |
| BMAD Skills | `.agent/skills/*/SKILL.md` | 領域知識封裝 | 觸發率 50-80%，被動觸發 |
| sprint-status.yaml | 專案根目錄 | 狀態追蹤 | **扁平 key-value，無關聯查詢** |
| Story 文件 (100+) | `docs/stories/epic-*/` | 需求/驗收 | **分散在 21 個 Epic 目錄** |
| .track.md | 追蹤目錄 | 執行日誌 | 格式化紀錄，非知識庫 |
| Code Review 報告 | `docs/reviews/` | 審查回饋 | 分散在各 Epic 下 |
| ADR 文件 | `docs/technical-decisions/` | 架構決策 | 手動維護 |

### 7.2 整合關係

```
現有機制                              上下文資料庫
──────────                           ──────────
Knowledge Items ──自動萃取──→  context_entries (語義索引)
Code Review 報告 ──結構化──→  tech_entries (成功/失敗模式)
ADR 文件 ────────結構化──→  tech_entries (架構決策)
sprint-status.yaml ─解析──→  epics + stories (結構化追蹤)
Story 文件 ────────解析──→  stories (完整描述+AC)
.track.md ─────解析──→  story_history (狀態變更歷史)
story_relations ←──────────  跨 Epic 關聯 (依賴/拆分/合併/取代)
```

> **設計原則**：上下文資料庫不取代現有機制，而是在其之上建立**統一的結構化檢索層**。`sprint-status.yaml` 仍是四引擎間的唯一狀態真相來源，資料庫作為檢索加速器存在。

---

## 八、實施路線圖

### Phase 0：PoC 驗證（複雜度 S）

| 項目 | 說明 |
|------|------|
| SQLite DB + FTS5 Schema 建立 | `context_entries` + `tech_entries` 資料表 |
| 基礎 Node.js MCP Server | `search_context()` + `add_context()` |
| 單引擎測試 | 僅在 Antigravity IDE 上驗證 |

### Phase 1：核心功能（複雜度 M）

| 項目 | 說明 |
|------|------|
| MCP Server 完整 Tools | 全部 15 個 Tool 實作（上下文 3 + 技術 2 + 追蹤 7 + 統計 1 + 同步 2） |
| 四引擎 MCP 配置分發 | `.mcp.json` / `.gemini/settings.json` / `mcp_config.json` |
| Hook 自動化寫入 | PostToolUse / AfterTool 自動記錄 |
| **sprint-status.yaml 同步** | **解析現有 YAML 批量匯入 epics + stories** |
| **Story 文件解析** | **從 21 個 Epic 目錄解析 Story 文件至 stories 表** |

### Phase 2：知識遷移（複雜度 M）

| 項目 | 說明 |
|------|------|
| 現有 KI 批量導入 | Knowledge Items → context_entries |
| Code Review 報告歸檔 | 結構化至 tech_entries + stories(cr_score) |
| ADR 索引建立 | 架構決策記錄索引化 |
| **跨 Epic 關聯建立** | **解析 sprint-status.yaml 註解中的關聯（如 cancelled-merged、superseded、split）** |

### Phase 3：智慧化（複雜度 L）

| 項目 | 說明 |
|------|------|
| Embedding 向量搜尋 | 語義相似度查詢 |
| 錯誤模式預警 | 主動觸發告警 |
| 信心分數衰減 | 過時記錄自動降權 |
| **Story 自動關聯推薦** | **基於 FTS5 相似度分析推薦潛在相關 Story** |

---

## 九、ROI 評估

### 9.1 預期效益

| 效益類型 | 量化預估 |
|---------|---------|
| **Token 節省** | 每次任務平均節省 ~2,000-5,000 tok（避免重複讀取 sprint-status.yaml） |
| **決策加速** | 技術決策時間 ↓30%（直接查詢歷史案例） |
| **品質提升** | 重複犯錯機率 ↓50%（不可行方式自動預警） |
| **跨引擎效率** | 引擎交接上下文損失 ↓70%（統一知識庫） |
| **新手上手** | 新引擎適應時間 ↓60%（自動提供專案慣例） |
| **Story 定位加速** | Story 搜尋時間 ↓80%（FTS5 取代目錄手動翻找） |
| **跨 Epic 可視性** | 關聯 Story 發現率 ↑90%（relation 表自動追蹤） |

### 9.2 風險評估

| 風險 | 等級 | 緩解措施 |
|------|------|---------|
| MCP Server 穩定性 | 🟡 中 | 本地 SQLite，極簡架構，無外部依賴 |
| 資料品質控制 | 🟠 高 | 信心分數機制 + 人工定期審核 |
| 寫入自動化的 Token 開銷 | 🟡 中 | 結構化模板，最小化寫入成本 |
| 中文分詞精度 | 🟡 中 | FTS5 + ICU tokenizer 或 jieba 分詞 |
| 資料庫檔案大小膨脹 | 🟢 低 | 定期歸檔 + 信心分數衰減清理 |
| YAML ↔ DB 同步一致性 | 🟡 中 | YAML 仍為 Source of Truth，DB 為唯讀索引層 |

---

## 十、結論

### 10.1 四大議題可行性總結

| 議題 | 結論 | 可行性 |
|------|------|:------:|
| 1. 上下文記憶資料庫 | ✅ **高度可行**。SQLite FTS5 + MCP Server 最適合 MyProject 四引擎架構 | ⭐⭐⭐⭐⭐ |
| 2. 技術知識庫 | ✅ **高度可行**。與上下文 DB 共用同一 SQLite，獨立資料表 | ⭐⭐⭐⭐⭐ |
| 3. 專案追蹤結構化 | ✅ **高度可行**。Epic/Story/關聯/歷史四表設計，覆蓋現有 sprint-status.yaml 完整語義 | ⭐⭐⭐⭐⭐ |
| 4. 擴展應用情境 | ✅ **豐富**。已識別 15 個可行場景，可逐步實現 | ⭐⭐⭐⭐ |

### 10.2 核心架構決策

| 決策項 | 選擇 | 理由 |
|--------|------|------|
| 儲存引擎 | SQLite + FTS5 | 零部署、本地化、高效能 |
| 存取介面 | MCP Server (Node.js) | 四引擎統一存取 |
| 寫入方式 | PostToolUse Hook + 手動呼叫 + YAML 同步 | 多來源彈性寫入 |
| 搜尋能力 | Phase 0-1: FTS5 → Phase 3: Embedding | 漸進式增強 |
| 追蹤資料來源 | sprint-status.yaml（Source of Truth）→ DB（索引層） | 不改變現有工作流 |

### 10.3 建議下一步

1. 建立 TRS Story（如 TRS-34）正式追蹤此功能
2. 從 Phase 0 PoC 開始，先驗證 SQLite FTS5 + MCP Server 的基礎可行性
3. 同步將 `sprint-status.yaml` 匯入 DB，驗證 Story 搜尋與關聯查詢
4. 在驗證成功後，逐步擴展至 Phase 1-3

---

> **文件版本**：v1.1
> **文件狀態**：新增專案追蹤資料結構（Epic/Story/關聯/歷史）
> **更新時間**：2026-03-05 22:26:09
> **更新者**：AG-OPUS
