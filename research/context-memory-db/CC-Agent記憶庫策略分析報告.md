# CC-Agent 記憶庫策略分析報告

> **分析者**：BMAD Party Mode 聯合研討團隊
> - 🏗️ Winston（架構師）— 統一架構設計、Vector-Graph Fusion 落地路線、Schema 映射
> - 📊 Mary（分析師）— 三份報告交叉審閱、情境量化、圖形邊可行性分析
> - 💻 Amelia（開發者）— MCP Server 實作方案、三層漸進架構、完整 Schema DDL
> - 🔬 Dr. Quinn（問題解決者）— 中文分詞技術評估、Vector-Graph Fusion 公式拆解、寫入負擔分析
> - 📋 John（產品經理）— 34 情境完整盤點、四維價值分類、優先矩陣
> - 🔄 Wendy（工作流建構師）— 檢索前置化設計、情境優先矩陣
> - 🧪 Murat（測試架構師）— 資料品質驗證、搜尋準確度基準、QA 情境補充
>
> - 📚 Paige（技術寫手）— DB 語言憲章設計
>
> **建檔者**：CC-OPUS（Claude Code CLI — Claude Opus 4.6）
> **建檔時間**：2026-03-05 23:09:31
> **最後更新**：2026-03-07 01:51:25（v10.0 — ChatGPT 記憶庫策略報告整合 + Code RAG Phase 規劃）
> **引擎**：Claude Code CLI
> **參考資料**：
> - `claude token減量策略研究分析/記憶庫策略/AC-Agent記憶庫策略分析報告.md`
> - `claude token減量策略研究分析/記憶庫策略/RC-Agent記憶庫策略分析報告.md`
> - `claude token減量策略研究分析/記憶庫策略/GC-Agent記憶庫策略分析報告.md`
> - `claude token減量策略研究分析/記憶庫策略/Chatgpt分析報告claude_cli_token_reduction_sql_architecture.md`（**v10.0 新增**）
> - `claude token減量策略研究分析/記憶庫策略/Chatgpt分析報告1.md`（**v10.0 新增**）
> - `claude token減量策略研究分析/記憶庫策略/Chatgpt分析報告2.md`（**v10.0 新增**）
> - `claude token減量策略研究分析/` 全部文件（16 份分析報告 + 17 個 TRS Stories）
> - `.claude/skills/claude-launcher/SKILL.md`（claude-launcher 智能中控）
> - `_bmad/bmm/workflows/4-implementation/*/instructions.xml`（BMAD Workflow 指令）

---

## 子章節索引

主報告超過 1,500 行後，新增內容拆分為獨立子章節文件：

| 子章節 | 文件 | 研討輪次 | 核心內容 |
|--------|------|:-------:|---------|
| R8 | `CC-sub-R8-skill-script-split.md` | 第八輪 | Skill 決策（1 個統一 Skill）+ MCP Tool vs. 腳本切分（6+13）+ Phase 0 修正版 |
| R9 | `CC-sub-R9-document-classification.md` | 第九輪 | 14 類文檔三層分類 + CR 拆表 + taxonomy 分類體系 + 全文檔適用性 + external 外部知識 + 雙語儲存精化 + 三級壓縮策略 |
| R10 | `CC-sub-R10-workflow-sync-mechanism.md` | 第十輪 | 三層同步架構 + 防禦式 ETL 三級欄位 + sync_log 表 + Skill 變更偵測 + 驗證機制 |
| R11 | 本文 §二十一 | ChatGPT 整合 | ChatGPT 三份報告交叉分析 + Code RAG 雙層架構決策 + Phase 3 Story 規劃 (TD-33~35) |

---

## 一、研究背景與報告定位

### 1.1 本報告定位

本報告為 **CC-OPUS**（Claude Code CLI）主持的 Party Mode 三輪深度研討之完整記錄。與 AC/RC/GC 三份報告的差異定位如下：

| 報告 | 引擎 | 核心貢獻 | 側重 |
|------|------|---------|------|
| **AC 報告** | Antigravity IDE | Schema 設計最完整（8 張表 + 追蹤結構） | 架構深度 |
| **RC 報告** | Rovo Dev CLI | Token 節省量化數據最精確 | 效益量化 |
| **GC 報告** | Gemini CLI | 工作流整合設計（檢索前置化 + 容錯降級） | 流程設計 |
| **CC 報告（本文）** | Claude Code CLI | 三份報告交叉整合 + 34 情境全盤點 + Vector-Graph Fusion 路線 + 完整 14 表 Schema + 邊界分析 + 資料持久性保障 | **統一規格** |

### 1.2 三份報告交叉審閱摘要

**共識點**：
- SQLite FTS5 + MCP Server 為最適技術選型
- 四引擎統一存取介面（MCP Protocol）
- 漸進式實作（Phase 0 → Phase 3）

**差異點與整合決策**：

| 維度 | AC | RC | GC | CC 整合決策 |
|------|----|----|----|-----------|
| Schema 範圍 | 8 張表 | 3 張表 | 未定義 | 14 張表分 3 Phase |
| Token 節省量化 | 每任務 ~2,000-5,000 tok | 靜態 -78%、Sprint -93% | 未量化 | 採 RC 基線 + AC 場景補充 |
| 擴展場景 | 15 個 | 5 個 | 3 個 | 擴展至 34 個（四維分類） |
| 中文分詞 | ICU / jieba | 未提及 | 未提及 | trigram（Phase 0-1）→ Embedding（Phase 2+） |
| 寫入策略 | Hook + 手動 + YAML 同步 | PostToolUse Hook | 檢索前置化 | 三級寫入（全自動/Workflow 尾端/手動） |
| 容錯降級 | 未提及 | 未提及 | 明確要求 | 納入：DB 不可用時回退讀檔模式 |
| MVP 切入點 | 上下文記憶 | Sprint 索引 | 技術知識庫 | Phase 0 三表並行 |

---

## 二、Vector-Graph Fusion 技術深度分析

### 2.1 核心概念

現代 AI 代理（如 GitHub Copilot）的檢索架構已超越單純的 BM25 關鍵字搜尋，採用「**向量圖形融合**」（Vector-Graph Fusion）機制。其最終關聯度分數的數學架構為：

$$S_{final}(q, d) = \alpha \cdot Sim_{vec}(E_q, E_d) + \beta \cdot Sim_{graph}(G_q, G_d)$$

| 符號 | 含義 | 實作需求 |
|------|------|---------|
| $E_q, E_d$ | 查詢與文件的高維語意向量 | Embedding 模型（本地或 API） |
| $Sim_{vec}$ | 向量餘弦相似度 | Vector DB（sqlite-vec / ChromaDB） |
| $G_q, G_d$ | 查詢與文件的拓撲圖形結構 | 圖形索引（關係表 + 遞迴 CTE） |
| $Sim_{graph}$ | 圖形結構相似度 | 路徑搜尋演算法 |
| $\alpha, \beta$ | 多模態感知動態權重 | Ranking 模型或啟發式規則 |

### 2.2 關聯連貫性（Relational Coherence Maintenance）

此機制的關鍵價值在於：系統不只回傳包含關鍵字的記錄，還會**沿著圖形結構追蹤相關脈絡**。

範例對比：

```
情境：查詢「Canvas 座標轉換 Bug」

FTS5 trigram 結果：
  [命中] tech_entries 中含「座標轉換」的 3 筆記錄
  [遺漏] 當時一起修改的 CanvasConstants.ts
  [遺漏] 相關的 PhycCanvas.test.tsx 測試案例
  [遺漏] 觸發此 Bug 的 Story qgr-e4-size-change-warning

Vector-Graph Fusion 結果：
  [命中] 語意向量匹配 → 3 筆技術記錄
  [追蹤] 圖形邊 → CanvasConstants.ts（被修改的檔案）
  [追蹤] 圖形邊 → PhycCanvas.test.tsx（對應測試）
  [追蹤] 圖形邊 → qgr-e4（觸發 Story）
  → 完整脈絡打包為 ~800 tokens 精準注入
```

### 2.3 MyProject 務實落地路線

GitHub Copilot 背後是數十人團隊 + 大規模 GPU 算力。MyProject 為一人專案 + 四 AI 引擎。因此核心問題是：**如何用最小實作成本逼近 Vector-Graph Fusion 的效果？**

**關鍵發現**：MyProject 的「圖形邊」已隱式存在於現有文件結構中，不需要解析 AST：

| 關係類型 | 現有來源 | 圖形邊表達 | 提取難度 |
|---------|---------|-----------|---------|
| Story → 修改檔案 | Story 文件 `file-list` | `story --modifies--> file` | 低 |
| Story → Story 依賴 | sprint-status.yaml 註解 | `story --depends_on--> story` | 低 |
| CR Issue → 修復 Commit | CR 報告 FIXED 項目 | `issue --fixed_by--> commit` | 中 |
| 檔案 → 檔案 import | TS/C# import 語句 | `file --imports--> file` | 中 |
| Bug → 根因 → 修復 | tech_entries 記錄 | `bug --caused_by--> root_cause` | 中 |
| Agent → 執行任務 | .track.md 日誌 | `agent --executed--> task` | 低 |

**規模估算**：~500 條 `modifies` 邊 + ~150 條 `depends` 邊 + ~150 條 `fixed_by` 邊 = **~800 條邊**。此規模 SQLite 遞迴 CTE 完全可處理，不需要 Neo4j。

**三層漸進架構**：

```
Layer 1: FTS5 關鍵字搜尋（Phase 0）
  → BM25 排名 + trigram 中文支援
  → 零外部依賴
  → 覆蓋 ~60% 檢索需求

Layer 2: + 關係圖形追蹤（Phase 1）
  → file_relations + story_relations + 遞迴 CTE
  → Sim_graph 的 ~70% 效果
  → 覆蓋 ~80% 檢索需求

Layer 3: + 語意向量搜尋（Phase 2+）
  → Embedding 模型 + sqlite-vec
  → 完整 S_final 公式
  → 覆蓋 ~95% 檢索需求
```

**S_final 在各 Phase 的近似**：

```
Phase 0: S_final ≈ FTS5_score
Phase 1: S_final ≈ FTS5_score + α · graph_proximity
Phase 2: S_final = FTS5_score + α · graph_proximity + β · vec_similarity
Phase 3: S_final = α(dynamic) · vec_similarity + β(dynamic) · graph_similarity
```

Phase 1-2 使用固定權重（α=0.3, β=0.7），Phase 3 再做動態調整。

### 2.4 圖形追蹤查詢實作（遞迴 CTE）

```sql
-- MyProject 版 Sim_graph：遞迴 CTE 模擬圖形路徑搜尋
WITH RECURSIVE context_graph AS (
    -- 起點：FTS5 搜尋命中的 tech_entry
    SELECT 'tech_entry' AS entity_type, CAST(t.id AS TEXT) AS entity_id, 0 AS depth
    FROM tech_entries t
    JOIN tech_fts f ON t.rowid = f.rowid
    WHERE tech_fts MATCH '座標轉換'

    UNION ALL

    -- 擴展：沿 file_relations 追蹤相關檔案
    SELECT 'file', fr.file_path, cg.depth + 1
    FROM context_graph cg
    JOIN file_relations fr ON fr.source_id = cg.entity_id
    WHERE cg.depth < 2  -- 最多追蹤 2 層

    UNION ALL

    -- 擴展：沿 story_relations 追蹤相關 Story
    SELECT 'story', sr.target_id, cg.depth + 1
    FROM context_graph cg
    JOIN story_relations sr ON sr.source_id = cg.entity_id
    WHERE cg.depth < 2
)
SELECT DISTINCT entity_type, entity_id, MIN(depth) AS proximity
FROM context_graph
ORDER BY proximity, entity_type;
```

### 2.5 中文全文搜尋技術評估

SQLite FTS5 預設 `unicode61` tokenizer 對中文無效（按空格分詞，中文整塊不拆分）。

| 方案 | 可行性 | 依賴 | 限制 |
|------|--------|------|------|
| **trigram tokenizer** | 零依賴，Phase 0 直接可用 | 無 | 索引膨脹 3-5 倍 |
| ICU tokenizer | 需 SQLite 編譯時啟用 ICU | Windows 上 better-sqlite3 預設不含 | 分詞品質佳 |
| jieba 分詞前處理 | JS 移植版可用 | nodejieba 套件 | 額外依賴 |
| Embedding 向量搜尋 | 完全繞過分詞問題 | Embedding 模型 | Phase 2+ |

**決策**：Phase 0-1 使用 **trigram**，Phase 2+ 評估 Embedding 是否必要。

```sql
CREATE VIRTUAL TABLE context_fts USING fts5(
    title, content, tags,
    content=context_entries,
    content_rowid=id,
    tokenize='trigram'
);
```

---

## 三、34 情境完整盤點

### 3.1 四大價值維度分類

#### 維度一：Token 節省（7 情境）

| ID | 情境 | 現有痛點 | DB 解法 | 預估節省 |
|----|------|---------|---------|---------|
| T1 | Sprint 狀態索引查詢 | `sprint-status.yaml` 199 行全量讀取 ×4/Sprint | `SELECT id, status FROM stories WHERE status='ready-for-dev'` | -93% |
| T2 | Story 文件精準提取 | dev-story 讀整份 Story（~300 行）只用 AC 區塊 | 按欄位查詢，只返回 tasks + AC | -60% |
| T3 | SKILL.md 觸發率優化 | 50~80% 機率性觸發，有時載入不相關 Skill | DB 記錄「Story X 需要 Skill Y」歷史，精準匹配 | -30% |
| T4 | Design Token 快取 | 每次用到 CSS 變數要讀 `front-end-spec.md`（~500 行） | `SELECT value FROM design_tokens WHERE name='--color-primary'` | -90% |
| T5 | 重複讀取消除 | 同一 Session 內多次 Read 同一檔案 | DB 快取檔案摘要 + hash，變更才重讀 | -40% |
| T6 | Workflow 指令去重 | `create-story/instructions.xml` Step 1 重複邏輯 | 常用 Workflow 步驟結果快取 | -50% |
| T7 | project-context.md 差量查詢 | 每次 Workflow 都全量讀取（~800 行） | section-level hash，只返回變更段落 | -70% |

#### 維度二：加速精準查詢（8 情境）

| ID | 情境 | 現有痛點 | DB 解法 | 加速效果 |
|----|------|---------|---------|---------|
| Q1 | 技術知識庫搜尋 | 翻找 ADR + 舊 Story + CR 報告 | FTS5 + Graph 追蹤一次返回完整脈絡 | 分鐘 → 秒 |
| Q2 | 錯誤模式比對 | Build 失敗時重新 debug | `tech_entries WHERE category='bugfix' AND tech_fts MATCH '錯誤訊息'` | 避免重複 debug |
| Q3 | 跨 Epic Story 搜尋 | 翻 21 個 Epic 目錄 | `stories WHERE stories_fts MATCH 'PDF'` | 即時查詢 |
| Q4 | CR 歷史模式查詢 | 找舊 CR 報告中類似 Issue | CR Issue 結構化後直接查類似模式 | 加速 CR 判斷 |
| Q5 | 依賴影響分析 | 修改檔案前不知哪些 Story 也動過 | `file_relations WHERE file_path='X'` | 風險預判 |
| Q6 | 設計決策追溯 | 找當時的 ADR | `tech_entries(category='architecture')` | 決策脈絡秒查 |
| Q7 | 測試案例搜尋 | Grep 翻找類似測試 | 測試模式庫 + FTS5 | 快速找可複用測試 |
| Q8 | failed approach 預警 | Agent 不知某方案曾失敗 | 寫入前自動查 `tech_entries WHERE category='failure'` | 避免重蹈覆轍 |

#### 維度三：多 Agent 協作統一規章（8 情境）

| ID | 情境 | 現有痛點 | DB 解法 | 治理效果 |
|----|------|---------|---------|---------|
| G1 | 跨引擎交接上下文 | CC→GC→AG 切換時新引擎不知前任做了什麼 | `context_entries WHERE story_id='X' ORDER BY timestamp DESC` | 交接零損失 |
| G2 | 統一命名規範強制 | 四引擎對同一概念用不同名稱 | 術語表 `glossary` — 標準名稱 + 禁用別名 | 命名一致性 |
| G3 | CR 判準一致化 | 不同 Agent 對「延後/修復/WON'T FIX」判準不同 | CR 判準規則庫 + 歷史判決案例參照 | 審查標準統一 |
| G4 | Workflow 步驟執行紀錄 | 無法驗證 Agent 是否真的執行了 checklist 每一步 | `workflow_executions` 記錄每步驟完成狀態 | 流程合規稽核 |
| G5 | 新 Agent 冷啟動規範注入 | 新引擎要讀大量文件理解專案慣例 | `tech_entries WHERE category='pattern' ORDER BY confidence DESC` | 上手時間 ↓70% |
| G6 | MEMORY.md 事故教訓共享 | MEMORY.md 只有 CC 能讀 | 事故教訓統一入庫，四引擎共查 | 全團隊學習 |
| G7 | Skill 觸發歷史分析 | 不確定某 Skill 是否有被有效觸發 | 記錄每次 Skill 載入的 Story + 效果評估 | 精準優化 Skill |
| G8 | 併發任務衝突偵測 | 兩個 Agent 同時修改同一檔案 | `file_relations WHERE file_path='X' AND created_at > '最近1小時'` | 防止衝突 |

#### 維度四：資料紀錄共享（11 情境）

| ID | 情境 | 現有痛點 | DB 解法 | 資產化效果 |
|----|------|---------|---------|-----------|
| D1 | Sprint 回顧自動生成 | 手動翻 track.md + CR 報告 | 聚合 `story_history` + `tech_entries` | 零人工回顧 |
| D2 | Agent 生產力儀表板 | 無法追蹤哪個 Agent 效率最高 | 按 Agent 統計完成數/CR 分數/覆蓋率 | 數據驅動派工 |
| D3 | 技術債全景追蹤 | `registry.yaml` 手動維護 | 技術債入庫 + 自動追蹤修復狀態 | 債務可視化 |
| D4 | 效能基準趨勢追蹤 | 無 Build/Test 時間歷史趨勢 | `benchmarks` 記錄每次耗時 | 效能退化預警 |
| D5 | 安全漏洞模式庫 | Security scan 修復後無紀錄 | `tech_entries(category='security')` | 防止復發 |
| D6 | 使用者回饋關聯 | Bug 無法快速關聯修復 Story | `feedback_entries` + Story 關聯 | 全追溯 |
| D7 | 文件版本索引 | 不知哪些文件最新、哪些過期 | `doc_index`：路徑 + 更新時間 + 有效性 | 文件新鮮度 |
| D8 | 跨專案知識移植 | 新專案無法繼承經驗 | 匯出 `tech_entries` + `glossary` 為種子 | 經驗可攜帶 |
| QA1 | 測試覆蓋率趨勢追蹤 | 無覆蓋率歷史 | `benchmarks` 記錄每次覆蓋率 | 品質趨勢 |
| QA2 | Flaky Test 黑名單 | 不穩定測試無紀錄 | `tech_entries(category='flaky_test')` | 降低 flake |
| QA3 | AC 驗收標準歷史庫 | 類似需求的 AC 寫法無法參考 | AC 歷史庫統一驗收粒度 | 品質一致 |

### 3.2 情境優先矩陣

```
        高痛感                           低痛感
高頻率 ┌─────────────────────┬─────────────────────┐
       │ P0 — 立即做          │ P2 — 排入中期        │
       │ T1 Sprint 狀態索引   │ T3 Skill 觸發優化    │
       │ Q1 技術知識庫搜尋    │ T5 重複讀取消除      │
       │ Q8 failed approach  │ G7 Skill 歷史分析    │
       │ G1 跨引擎交接        │ D4 效能基準追蹤      │
       │ Q3 跨 Epic 搜尋     │ D7 文件版本索引      │
       ├─────────────────────┼─────────────────────┤
低頻率 │ P1 — 排入近期        │ P3 — 視需求          │
       │ Q2 錯誤模式比對      │ D6 使用者回饋關聯    │
       │ G3 CR 判準一致化     │ D8 跨專案知識移植    │
       │ G6 MEMORY 事故共享   │ G2 術語表            │
       │ D1 Sprint 回顧生成   │ Q7 測試案例搜尋      │
       │ D3 技術債全景追蹤    │ D2 Agent 生產力報表  │
       │ T4 Design Token     │ G4 Workflow 步驟紀錄  │
       └─────────────────────┴─────────────────────┘
```

---

## 四、完整 Schema 設計（16 張表）

### 4.1 Phase 0：PoC 驗證（3 張表 → 覆蓋 P0 的 6 個情境）

```sql
-- ═══════════════════════════════════════
-- Phase 0: PoC（複雜度 S）
-- ═══════════════════════════════════════

-- 1. 上下文記憶表
CREATE TABLE context_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT,                          -- 對話 Session ID
    agent_id        TEXT NOT NULL,                 -- CC-OPUS / GC-PRO / AG-OPUS / RD-*
    timestamp       TEXT NOT NULL,                 -- ISO-8601
    category        TEXT NOT NULL,                 -- debug / design / review / implement / plan
    tags            TEXT,                          -- JSON array, 關鍵字
    title           TEXT NOT NULL,                 -- 摘要標題
    content         TEXT NOT NULL,                 -- 完整內容
    related_files   TEXT,                          -- JSON array, 涉及檔案路徑
    story_id        TEXT,                          -- 關聯 Story ID
    epic_id         TEXT                           -- 關聯 Epic ID
);

CREATE VIRTUAL TABLE context_fts USING fts5(
    title, content, tags,
    content=context_entries,
    content_rowid=id,
    tokenize='trigram'
);

-- 2. 技術知識庫表
CREATE TABLE tech_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by      TEXT NOT NULL,                 -- Agent ID
    created_at      TEXT NOT NULL,                 -- ISO-8601
    updated_at      TEXT,
    category        TEXT NOT NULL,                 -- success / failure / workaround / pattern / bugfix / architecture / benchmark / security / flaky_test / test_pattern / bdd_scenario / ac_pattern / test_failure / test_infra / mock_strategy
    tech_stack      TEXT,                          -- C# / React / SQL / Fabric.js / etc.
    tags            TEXT,                          -- JSON array
    title           TEXT NOT NULL,                 -- 技術主題
    problem         TEXT,                          -- 問題描述
    solution        TEXT,                          -- 解決方案
    outcome         TEXT NOT NULL,                 -- success / failure / partial
    lessons         TEXT,                          -- 經驗教訓
    code_snippets   TEXT,                          -- JSON, 程式碼片段
    related_files   TEXT,                          -- JSON array
    references      TEXT,                          -- 外部連結/文件引用
    confidence      INTEGER DEFAULT 80             -- 信心分數 0-100
);

CREATE VIRTUAL TABLE tech_fts USING fts5(
    title, problem, solution, lessons, tags,
    content=tech_entries,
    content_rowid=id,
    tokenize='trigram'
);

-- 3. Sprint 狀態索引（Phase 1 將被 stories 表取代）
CREATE TABLE sprint_index (
    story_id        TEXT PRIMARY KEY,
    epic_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL,
    priority        TEXT,
    assigned_agent  TEXT,
    last_updated    TEXT
);
```

### 4.2 Phase 1：核心功能（+7 張表 → 覆蓋 P0+P1 的 18 個情境）

```sql
-- ═══════════════════════════════════════
-- Phase 1: 核心（複雜度 M）
-- ═══════════════════════════════════════

-- 4. Epic 主表
CREATE TABLE epics (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'backlog',
    category        TEXT,
    total_stories   INTEGER DEFAULT 0,
    done_stories    INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    completed_at    TEXT,
    tags            TEXT,
    source_doc      TEXT
);

CREATE VIRTUAL TABLE epics_fts USING fts5(
    id, title, description, tags,
    content=epics,
    content_rowid=rowid,
    tokenize='trigram'
);

-- 5. Story 主表（取代 sprint_index）
CREATE TABLE stories (
    id              TEXT PRIMARY KEY,
    epic_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'backlog',
    priority        TEXT,
    complexity      TEXT,
    cr_score        INTEGER,
    test_count      INTEGER DEFAULT 0,
    fixed_count     INTEGER DEFAULT 0,
    assigned_agent  TEXT,
    reviewed_by     TEXT,
    tested_by       TEXT,
    created_at      TEXT NOT NULL,
    created_by      TEXT,
    completed_at    TEXT,
    story_file      TEXT,
    review_file     TEXT,
    tags            TEXT,
    notes           TEXT,
    FOREIGN KEY (epic_id) REFERENCES epics(id)
);

CREATE VIRTUAL TABLE stories_fts USING fts5(
    id, title, description, tags, notes,
    content=stories,
    content_rowid=rowid,
    tokenize='trigram'
);

CREATE INDEX idx_stories_epic ON stories(epic_id);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_stories_priority ON stories(priority);
CREATE INDEX idx_stories_agent ON stories(assigned_agent);

-- 6. Story 關聯表
CREATE TABLE story_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    relation_type   TEXT NOT NULL,       -- depends_on / blocks / split_from / merged_into / superseded_by / renamed_from / moved_from
    description     TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES stories(id),
    FOREIGN KEY (target_id) REFERENCES stories(id)
);

-- 7. Story 狀態變更歷史表
CREATE TABLE story_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        TEXT NOT NULL,
    from_status     TEXT,
    to_status       TEXT NOT NULL,
    changed_by      TEXT NOT NULL,
    changed_at      TEXT NOT NULL,
    action          TEXT,                -- created / dev-started / dev-completed / review-started / review-passed / review-rejected / cancelled
    notes           TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE INDEX idx_history_story ON story_history(story_id);
CREATE INDEX idx_history_date ON story_history(changed_at);

-- 8. 檔案關聯表（圖形邊 — Vector-Graph Fusion 的 Graph 部分）
CREATE TABLE file_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type     TEXT NOT NULL,       -- story / commit / cr_issue / tech_entry
    source_id       TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    relation        TEXT NOT NULL,       -- modifies / creates / deletes / tests / imports
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_file_rel_path ON file_relations(file_path);
CREATE INDEX idx_file_rel_source ON file_relations(source_id);

-- 9. CR Issue 結構化表
CREATE TABLE cr_issues (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        TEXT NOT NULL,
    issue_code      TEXT NOT NULL,
    severity        TEXT NOT NULL,       -- critical / high / medium / low
    category        TEXT,                -- architecture / security / performance / style
    description     TEXT NOT NULL,
    resolution      TEXT NOT NULL,       -- FIXED / DEFERRED / WONT_FIX
    target_story    TEXT,                -- DEFERRED 時的目標 Story
    self_check_q1   TEXT,
    self_check_q2   TEXT,
    self_check_q3   TEXT,
    self_check_q4   TEXT,
    self_check_q5   TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE VIRTUAL TABLE cr_issues_fts USING fts5(
    description, resolution,
    content=cr_issues,
    content_rowid=id,
    tokenize='trigram'
);

-- 10. Design Token 快取表
CREATE TABLE design_tokens (
    name            TEXT PRIMARY KEY,    -- --color-primary
    value           TEXT NOT NULL,       -- #1A73E8
    category        TEXT NOT NULL,       -- color / spacing / radius / shadow
    usage_hint      TEXT                 -- 使用情境提示
);
```

### 4.3 Phase 2：擴展功能（+4 張表 → 覆蓋全部 34 個情境）

```sql
-- ═══════════════════════════════════════
-- Phase 2: 擴展（複雜度 M）
-- ═══════════════════════════════════════

-- 11. 術語表（命名規範統一）
CREATE TABLE glossary (
    canonical_name  TEXT PRIMARY KEY,    -- CanvasJsonV2
    aliases         TEXT,                -- JSON: ["canvasData", "canvas_json"]
    definition      TEXT NOT NULL,
    category        TEXT,                -- frontend / backend / database / workflow
    forbidden       TEXT                 -- JSON: 禁用名稱列表
);

-- 12. Workflow 執行紀錄表
CREATE TABLE workflow_executions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_name   TEXT NOT NULL,
    story_id        TEXT,
    agent_id        TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    status          TEXT NOT NULL,       -- running / completed / failed / aborted
    steps_completed TEXT,                -- JSON: ["step1", "step2", ...]
    skills_loaded   TEXT,                -- JSON: 實際載入的 Skills
    token_estimate  INTEGER,
    notes           TEXT
);

-- 13. 效能基準表
CREATE TABLE benchmarks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name     TEXT NOT NULL,       -- build_time / test_duration / bundle_size / coverage_pct
    value           REAL NOT NULL,
    unit            TEXT NOT NULL,       -- seconds / KB / count / percent
    measured_at     TEXT NOT NULL,
    context         TEXT                 -- 測量情境說明
);

-- 14. 文件索引表
CREATE TABLE doc_index (
    file_path       TEXT PRIMARY KEY,
    title           TEXT,
    category        TEXT,                -- story / review / adr / spec / guide
    last_updated    TEXT NOT NULL,
    updated_by      TEXT,
    is_current      INTEGER DEFAULT 1,   -- 0=過期, 1=有效
    content_hash    TEXT                 -- SHA-256，用於變更偵測
);

CREATE VIRTUAL TABLE doc_index_fts USING fts5(
    file_path, title, category,
    content=doc_index,
    content_rowid=rowid,
    tokenize='trigram'
);
```

### 4.4 Phase 1 追加：TDD/BDD 支援（+2 張表）

```sql
-- ═══════════════════════════════════════
-- Phase 1 追加：TDD/BDD 全鏈路支援
-- ═══════════════════════════════════════

-- 15. E2E 測試路徑庫
CREATE TABLE test_journeys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_name    TEXT NOT NULL,                 -- 'auth-login-flow'
    feature_file    TEXT,                          -- 'docs/testing/features/bf-17-*.feature'
    priority        TEXT NOT NULL,                 -- P0 / P1 / P2
    test_layer      TEXT NOT NULL,                 -- e2e / api / unit
    gherkin_zh      TEXT,                          -- 中文 Given/When/Then
    selectors       TEXT,                          -- JSON: data-testid 選擇器列表
    preconditions   TEXT,                          -- 前置條件（測試帳號、資料狀態）
    test_file       TEXT,                          -- 對應測試檔案路徑
    module          TEXT,                          -- admin / editor / payment / member / pdf
    tags            TEXT,                          -- JSON array
    last_verified   TEXT,                          -- 最後驗證通過時間
    is_stable       INTEGER DEFAULT 1,             -- 0=flaky, 1=stable
    created_at      TEXT NOT NULL,
    created_by      TEXT NOT NULL
);

CREATE VIRTUAL TABLE test_journeys_fts USING fts5(
    journey_name, gherkin_zh, preconditions, tags,
    content=test_journeys,
    content_rowid=id,
    tokenize='trigram'
);

CREATE INDEX idx_journeys_module ON test_journeys(module);
CREATE INDEX idx_journeys_priority ON test_journeys(priority);
CREATE INDEX idx_journeys_layer ON test_journeys(test_layer);

-- 16. 測試追蹤矩陣（AC -> Test -> Code）
CREATE TABLE test_traceability (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id        TEXT NOT NULL,                 -- QGR-E4
    ac_id           TEXT NOT NULL,                 -- AC-1, AC-2
    ac_description  TEXT NOT NULL,                 -- 驗收標準描述
    test_type       TEXT NOT NULL,                 -- unit / integration / e2e
    test_file       TEXT,                          -- 測試檔案路徑
    test_method     TEXT,                          -- 測試方法名
    impl_file       TEXT,                          -- 實作檔案路徑
    coverage_status TEXT DEFAULT 'pending',         -- covered / partial / pending / skipped
    notes           TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (story_id) REFERENCES stories(id)
);

CREATE INDEX idx_trace_story ON test_traceability(story_id);
CREATE INDEX idx_trace_coverage ON test_traceability(coverage_status);
```

#### tech_entries TDD/BDD 專用 category 值擴展

| category 值 | 用途 | 資料範例 |
|-------------|------|---------|
| `test_pattern` | 測試撰寫模式 | xUnit Theory + InlineData、Moq callback、fabric.js Mock |
| `bdd_scenario` | BDD 場景範本 | 中文 Gherkin 模板、P0 E2E 流程 |
| `ac_pattern` | AC 驗收標準範本 | 類似需求的 AC 寫法參照 |
| `test_failure` | 測試失敗根因 | 「InMemory DB 不支援 FK 約束」踩坑記錄 |
| `test_infra` | 測試基礎設施決策 | WebApplicationFactory 配置、Testcontainers vs InMemory |
| `mock_strategy` | Mock 策略 | fabric.js Mock、ECPay Webhook Mock、Azure Blob Mock |

### 4.5 Phase 3：向量擴展

```sql
-- ═══════════════════════════════════════
-- Phase 3: 向量搜尋（複雜度 L）
-- ═══════════════════════════════════════
-- 使用 sqlite-vec 擴展，為核心表增加向量欄位
-- 實作時機：Phase 2 完成後，評估 FTS5 + Graph 是否已滿足需求

-- 範例（待 Phase 3 設計時確認）：
-- CREATE VIRTUAL TABLE context_vec USING vec0(
--     embedding float[384]  -- all-MiniLM-L6-v2 維度
-- );
```

### 4.6 Schema 覆蓋映射（16 張表）

| # | 表名 | Phase | 覆蓋情境 | TDD/BDD |
|---|------|:-----:|---------|:-------:|
| 1 | context_entries + FTS | 0 | T5, T6, T7, G1, G6, D1 | |
| 2 | tech_entries + FTS | 0 | Q1, Q2, Q6, Q8, G3, G5, D3, D5, QA2 | 核心（6 新 category） |
| 3 | sprint_index | 0 | T1 | |
| 4 | epics + FTS | 1 | Q3, D2 | |
| 5 | stories + FTS | 1 | T1, T2, Q3, Q5, D2 | |
| 6 | story_relations | 1 | Q3, Q5, G8 | |
| 7 | story_history | 1 | D1, D2 | |
| 8 | file_relations | 1 | Q5, G8 | |
| 9 | cr_issues + FTS | 1 | Q4, G3, QA3 | 含測試品質項目 |
| 10 | design_tokens | 1 | T4 | |
| 11 | **test_journeys + FTS** | **1** | **新增** | **E2E 路徑庫** |
| 12 | **test_traceability** | **1** | **新增** | **AC->Test->Code** |
| 13 | glossary | 2 | G2 | |
| 14 | workflow_executions | 2 | G4, G7, T3 | testarch 紀錄 |
| 15 | benchmarks | 2 | D4, QA1 | 覆蓋率趨勢 |
| 16 | doc_index + FTS | 2 | D7 | .feature 索引 |

---

## 五、統一存取架構（MCP Server）

### 5.1 架構總圖

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│CC-OPUS/  │ │ GC-PRO   │ │ AG-OPUS  │ │RD-SONNET │
│CC-SONNET │ │          │ │          │ │          │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │            │
     └──────┬─────┴─────┬──────┘            │
            │  MCP stdio │                   │
      ┌─────▼───────────▼───────────────────▼──┐
      │     MyProject Context MCP Server         │
      │            (Node.js)                   │
      ├────────────────────────────────────────┤
      │                                        │
      │  查詢 Tools (讀取零成本):              │
      │  ├─ search_context(query, filters)     │
      │  ├─ search_tech(query, category)       │
      │  ├─ search_stories(query, epic, status)│
      │  ├─ trace_context(entity_id, depth)    │ ← Graph 追蹤
      │  ├─ get_design_token(name|category)    │
      │  ├─ lookup_glossary(term)              │
      │  ├─ check_conflict(file_path)          │
      │  └─ get_stats(scope)                   │
      │                                        │
      │  寫入 Tools (Workflow 尾端):           │
      │  ├─ add_context(entry)                 │
      │  ├─ add_tech(entry)                    │
      │  ├─ log_workflow(execution)             │
      │  └─ add_cr_issue(issue)                │
      │                                        │
      │  同步 Tools (腳本/排程):               │
      │  ├─ sync_from_yaml()                   │
      │  ├─ sync_file_relations(story_id)      │
      │  ├─ scan_doc_index()                   │
      │  └─ import_design_tokens()             │
      │                                        │
      │  分析 Tools (Sprint 回顧):             │
      │  ├─ agent_productivity(agent, range)   │
      │  ├─ sprint_retrospective(sprint)       │
      │  └─ debt_overview()                    │
      │                                        │
      └──────────────┬─────────────────────────┘
                     │
      ┌──────────────▼─────────────────────────┐
      │          SQLite Database                │
      │      (.context-db/myproject.db)          │
      │                                        │
      │  Phase 0 (3 表):  context / tech / idx │
      │  Phase 1 (+7 表): epic~story 追蹤      │
      │  Phase 2 (+4 表): glossary~doc_index   │
      │  Phase 3 (擴展):  *_vec 向量表         │
      └────────────────────────────────────────┘
```

### 5.2 MCP 配置分發

| 引擎 | 配置路徑 | 格式 |
|------|---------|----|
| Claude Code | `.mcp.json` | `{ "mcpServers": { "myproject-context": { "command": "node", "args": [".context-db/server.js"] } } }` |
| Gemini CLI | `.gemini/settings.json` | 同上格式，`mcpServers` 區塊 |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | 同上格式 |
| Rovo Dev CLI | YAML 配置 | MCP stdio 配置 |

### 5.3 MCP Tool `trace_context()` 規格

此為 Vector-Graph Fusion 的核心落地 Tool：

- **輸入**：FTS5 搜尋命中的實體 ID + 追蹤深度（預設 2）
- **執行**：遞迴 CTE 圖形追蹤
- **輸出**：完整關聯脈絡包（相關檔案 + Story + 技術記錄）
- **實現**：「關聯連貫性」— 不只返回關鍵字命中，還返回結構相連的完整脈絡

---

## 六、三級寫入策略

### 6.1 Level 1：全自動（零 Token 成本）

| 觸發方式 | 覆蓋表 | 資料來源 |
|---------|--------|---------|
| YAML 同步腳本 | sprint_index / stories / epics | sprint-status.yaml |
| 檔案系統掃描腳本 | doc_index | docs/ 目錄結構 |
| 前端規格解析腳本 | design_tokens | front-end-spec.md |
| CI/CD pipeline 輸出 | benchmarks | Build/Test 結果 |

### 6.2 Level 2：Workflow 尾端批次寫入（極低 Token）

| 觸發時機 | 寫入 Tool | 覆蓋表 |
|---------|----------|--------|
| create-story 完成 | add_context() | context_entries |
| dev-story 完成 | add_context() + add_tech() + sync_file_relations() | context_entries + tech_entries + file_relations |
| code-review 完成 | add_tech() + add_cr_issue() | tech_entries + cr_issues |
| 任何 Workflow 完成 | log_workflow() | workflow_executions |
| 狀態變更時 | (自動觸發) | story_history |

### 6.3 Level 3：手動觸發（人類決策）

| 觸發場景 | 寫入 Tool | 覆蓋表 |
|---------|----------|--------|
| 發現命名不一致 | lookup_glossary() → 手動新增 | glossary |
| 遭遇技術失敗 | add_tech(category='failure') | tech_entries |
| 發現跨 Epic 關聯 | (手動建立) | story_relations |

### 6.4 GC 報告關鍵補充：檢索前置化 + 容錯降級

```
Workflow 執行流程（整合 GC 報告 Wendy 的設計）：

  使用者下指令（如 dev-story QGR-X1）
  │
  ├─ Step 0: Context Retrieval（檢索前置化）
  │   ├─ 解析指令關鍵字
  │   ├─ 查詢 MCP Server（search_context + search_tech + trace_context）
  │   ├─ 格式化為 <historical_context> XML 區塊
  │   └─ 注入 Prompt
  │
  ├─ Step 1~N: 主要 Workflow 執行
  │   └─ （不在中途查詢 DB，避免延遲）
  │
  └─ Step Final: 批次寫入
      ├─ add_context() / add_tech() / log_workflow()
      └─ sync_file_relations()

  容錯降級：
  若 MCP Server 不可用 → 回退至標準讀檔模式，Workflow 不中斷
```

---

## 七、資料品質保障機制

### 7.1 寫入品質控制

- 每筆記錄必須有 `agent_id` + `timestamp` + `story_id`（可追溯）
- `tech_entries` 的 `outcome` 欄位強制填寫（success / failure / partial）
- 禁止空 `tags` — 至少一個關鍵字

### 7.2 信心分數衰減

- `confidence` 每 30 天 -5（過期知識降權）
- 最低門檻 30 — 低於此自動歸檔至 `_archived` 表
- 手動確認可重置為 100

### 7.3 搜尋準確度基準

Phase 0 交付前必須通過的驗證：

| 類別 | 測試案例數 | 驗收 Recall |
|------|:---------:|:----------:|
| 純英文關鍵字查詢 | 5 | >= 80% |
| 純中文關鍵字查詢 | 5 | >= 60% |
| 混合中英文查詢 | 5 | >= 70% |
| 需關聯脈絡的查詢 | 5 | Phase 0 不要求，Phase 1 >= 70% |

**測試案例範例**：

| # | 查詢 | 期望命中 | 期望關聯脈絡（Phase 1+） |
|---|------|---------|------------------------|
| 1 | Canvas 座標轉換 | CanvasConstants.ts 修改記錄 | + PhycCanvas.test.tsx + qgr-e4 |
| 2 | PDF 中文字型 | PdfWorker 技術決策 | + QuestPDF 設定 + 字型嵌入 ADR |
| 3 | ECPay Webhook | WebhooksController 實作 | + 訂單狀態機 + 重試機制 |
| 4 | sprint-status 效能 | YAML 全量讀取分析 | + TRS Stories + Token 減量報告 |

---

## 八、ROI 綜合評估

### 8.1 量化效益（整合三份報告）

| 效益類型 | 量化預估 | 來源 |
|---------|---------|------|
| Token 節省（Sprint 讀取） | -93%（1,500 → 100 tok） | RC |
| Token 節省（每任務平均） | ~2,000-5,000 tok | AC |
| Token 節省（靜態成本） | -78%（15,040 → 3,790 tok） | RC |
| 決策加速 | 技術決策時間 ↓30% | AC |
| 品質提升 | 重複犯錯機率 ↓50% | AC |
| 跨引擎效率 | 交接上下文損失 ↓70% | AC |
| 新手上手 | 適應時間 ↓60-70% | AC + GC |
| Story 定位 | 搜尋時間 ↓80% | AC |
| 跨 Epic 可視性 | 關聯 Story 發現率 ↑90% | AC |

### 8.2 風險評估

| 風險 | 等級 | 緩解措施 |
|------|------|---------|
| MCP Server 穩定性 | 低 | 本地 SQLite，極簡架構，無外部依賴 |
| 資料品質控制 | 高 | 信心分數 + 衰減 + 人工定期審核 |
| 寫入自動化 Token 開銷 | 中 | 三級寫入策略，Level 1 零成本 |
| 中文分詞精度 | 中 | trigram 先行，Phase 2+ 評估 Embedding |
| DB 檔案大小膨脹 | 低 | 定期歸檔 + 信心分數衰減清理 |
| YAML ↔ DB 同步一致性 | 中 | YAML 仍為 Source of Truth，DB 為唯讀索引層 |
| DB 不可用時 Workflow 中斷 | 中 | 容錯降級：回退至標準讀檔模式（GC 報告） |

---

## 九、實施路線圖

### Phase 0：PoC 驗證（複雜度 S）

| 項目 | 說明 |
|------|------|
| SQLite DB + FTS5 Schema 建立 | 3 張核心表（context_entries + tech_entries + sprint_index） |
| trigram tokenizer | 零依賴中文搜尋方案 |
| 基礎 Node.js MCP Server | 3 個查詢 Tool + 2 個寫入 Tool |
| 手動種子資料 | 10-20 筆已知記錄 |
| 搜尋準確度測試 | 20 個測試案例，Recall >= 60% |
| 單引擎驗證 | Claude Code 或 Antigravity |

### Phase 1：核心功能（複雜度 M）

| 項目 | 說明 |
|------|------|
| 完整追蹤表 | +7 張表（epics ~ design_tokens） |
| `trace_context()` MCP Tool | 遞迴 CTE 圖形追蹤（Vector-Graph Fusion Graph 部分） |
| 完整 15 個 MCP Tools | 查詢 8 + 寫入 4 + 同步 4 + 分析 3 |
| 四引擎 MCP 配置分發 | `.mcp.json` / `.gemini/settings.json` / `mcp_config.json` |
| sprint-status.yaml → DB 同步 | 批量匯入 100+ Stories |
| Story 文件解析 | 21 個 Epic 目錄 → stories 表 |
| Workflow 尾端批次寫入 | create-story / dev-story / code-review 自動記錄 |
| 容錯降級 | DB 不可用時回退至讀檔模式 |

### Phase 2：擴展功能（複雜度 M）

| 項目 | 說明 |
|------|------|
| +4 張擴展表 | glossary / workflow_executions / benchmarks / doc_index |
| Agent 生成高品質 tags | 利用 LLM 能力提升語意覆蓋（Embedding 替代方案） |
| 現有 KI 批量導入 | Knowledge Items → context_entries |
| CR 報告結構化歸檔 | → cr_issues + tech_entries |
| 跨 Epic 關聯建立 | 解析 sprint-status.yaml 註解中的關聯 |
| 信心分數衰減機制 | 30 天 -5，門檻 30 自動歸檔 |

### Phase 3：向量擴展與智慧化（複雜度 L）

| 項目 | 說明 |
|------|------|
| Embedding 向量搜尋 | sqlite-vec 或 ChromaDB，完成 $S_{final}$ 公式 |
| $\alpha, \beta$ 動態權重 | 多模態感知排序（視 Phase 2 效果決定是否需要） |
| 錯誤模式主動預警 | coding 過程中偵測類似 failure 記錄時主動提醒 |
| Story 自動關聯推薦 | FTS5 + 向量相似度分析推薦潛在相關 Story |

---

## 十、v1.0 核心架構決策總結（已被 §14 更新版取代）

> 此章節保留供歷史對照。完整決策表請見 §14。

| 決策項 | v1.0 選擇 | v2.0 變更 |
|--------|----------|----------|
| 追蹤資料來源 | YAML = Source of Truth，DB = 索引層 | **修正**：僅對可重建資料成立 |
| 持久性保障 | （未涉及） | **新增**：DB-Native 資料雙寫（DB + Ledger） |

---

## 十一、v1.0 建議下一步（已被 §15 更新版取代）

> 此章節保留供歷史對照。最新行動計畫請見 §15。

---

## 十二、邊界分析：五大部署前必決議題

### 12.1 議題 1：BMAD Workflow 是否受影響？

**結論：不修改 Workflow XML 核心邏輯，只在「前」和「後」注入 DB 操作。**

三個核心 Workflow（create-story / dev-story / code-review）的 `instructions.xml` 不做任何修改。DB 操作透過 MCP Tool 在 Workflow 外層執行：

```
                   現有 Workflow（不動）
                 ┌──────────────────────┐
  DB 查詢注入 →  │  Step 1: 載入 Story   │  → 維持原邏輯
  (檢索前置化)   │  Step 2~N: 核心執行   │
                 │  Step Final: 狀態更新  │  → DB 寫入注入
                 └──────────────────────┘  (Workflow 尾端)
```

| Workflow | 「前」注入（Step 0） | 「後」注入（Final+1） | 本體修改 |
|----------|---------------------|----------------------|:--------:|
| create-story | `search_stories()` 查類似 Story；`search_tech()` 查相關技術 | `add_context()` 記錄建立資訊 | 無 |
| dev-story | `search_tech()` 查歷史解法 + `trace_context()` 取關聯脈絡 | `add_context()` + `add_tech()` + `sync_file_relations()` | 無 |
| code-review | `search_tech(category='failure')` 預載失敗案例供比對 | `add_tech()` + `add_cr_issue()` | 無 |

**容錯降級**：MCP Server 不可用時，Workflow 完全照舊（讀檔模式），零影響。

**`sprint-status.yaml` 角色不變**：DB 是加速索引，YAML 仍為四引擎間的狀態 Source of Truth。

### 12.2 議題 2：DB 資料語言憲章

**規則：「索引欄位用英文，內容欄位用繁體中文」**

延伸自現有 Constitutional Standard（AI 消費 → 英文；人類閱讀 → 繁體中文）：

| 欄位類型 | 語言 | 代表欄位 | 理由 |
|---------|------|---------|------|
| 索引/過濾鍵 | 英文 | tags, category, status, canonical_name, metric_name | AI 搜尋效率 + 統一命名 |
| 詳細內容 | 繁體中文 | content, problem, solution, lessons, description | Alan 需審查的人類可讀內容 |
| 程式碼/路徑/ID | 英文 | code_snippets, file_path, agent_id | 本身就是英文 |
| 標題 | 依內容性質 | title | 技術主題通常英文，Story 標題繁體中文 |

**實作方式**：Schema 不需修改，在 MCP Tool 的 `add_context()` / `add_tech()` 說明文件中註明語言規範即可。

### 12.3 議題 3：是否可直接連本機 DB 新建資料表？

**結論：可以，透過 Node.js 腳本（不依賴 sqlite3 CLI）。**

```
部署步驟：
1. 建立目錄：.context-db/
2. npm install（better-sqlite3 + @modelcontextprotocol/sdk）
3. node init-schema.js（建立所有表 + FTS5）
4. 配置 .mcp.json

better-sqlite3 自帶 SQLite 編譯版本，零額外安裝。
```

**Git 策略**：
- `.context-db/myproject.db` — 不納入 Git（二進位，可重建）
- `.context-db/init-schema.js` + `server.js` + `package.json` — 納入 Git
- `.context-db/ledger.jsonl` — 納入 Git（DB-Native 資料的持久化保障，見 §13）

### 12.4 議題 4：大規模資料遷入整合

**結論：需要，但分兩步。本質是「建索引」非「遷移」。**

| 資料來源 | 數量 | 目標表 | Phase |
|---------|:----:|--------|:-----:|
| sprint-status.yaml | 100+ Stories | stories + epics | 1 |
| Story 文件（21 Epic 目錄） | 100+ 個 .md | stories（補充欄位） | 1 |
| CR 報告 | ~50 個 .md | cr_issues + tech_entries | 1 |
| .track.md 追蹤檔 | ~80 個 | story_history | 1 |
| sprint-status.yaml 註解 | ~30 個關聯 | story_relations | 1 |
| front-end-spec.md | ~500 行 | design_tokens | 1 |
| ADR 文件 | ~10 個 | tech_entries(architecture) | 1 |

**Phase 0**：手動種子 10-20 筆（驗證搜尋準確度）
**Phase 1**：自動化腳本一鍵匯入（sync_from_yaml.js, import_stories.js 等）

原始資料（YAML, Story 文件, CR 報告）完全不動，DB 只是多一層結構化索引。

**需 Alan 手動補充的部分**：`tech_entries` 中的「失敗案例」和「成功案例」— 這些經驗知識分散在 Alan 的記憶中，無法自動提取。建議 Phase 1 後逐步補充。

### 12.5 議題 5：claude-launcher 智能中控更新

**結論：Phase 2 最後一步。在 DB 完全驗證前不動 Pipeline。**

| 更新項目 | 改動程度 | 時機 |
|---------|---------|------|
| story-pipeline.ps1（增加 DB 查詢/寫入步驟） | 中 | Phase 2 |
| batch-runner.ps1（完成後呼叫 sync_from_yaml） | 低 | Phase 1 |
| batch-audit.ps1（DB vs YAML 一致性檢查） | 低 | Phase 2 |
| claude-launcher SKILL.md（新增 DB 操作指引） | 低 | Phase 2 |

**更新前置條件**（全部滿足後才改 Pipeline）：
- MCP Server 穩定運行 >= 2 週
- 四引擎均已配置 MCP 連接
- sync_from_yaml() 驗證無誤
- 至少 5 個 Story 的完整 Pipeline 已搭配 DB 成功運行

**核心原則**：Pipeline 是已驗證穩定的生產工具（經 Batch 1-4 實戰驗證），在 DB 功能尚未完全驗證前不應修改。

### 12.6 五議題決策總表

| # | 議題 | 結論 | 行動時機 |
|---|------|------|---------|
| 1 | BMAD Workflow 影響 | 不修改 XML，DB 在「前/後」注入，容錯降級 | Phase 1 |
| 2 | DB 語言憲章 | 索引英文 + 內容繁體中文，Prompt 指引 | Phase 0 起 |
| 3 | 直接連本機 DB | 可以，better-sqlite3 + Node.js，DB 不入 Git | Phase 0 |
| 4 | 大規模遷入 | Phase 0 手動種子；Phase 1 自動腳本。是「建索引」非「遷移」 | Phase 0-1 |
| 5 | claude-launcher 更新 | Phase 2 最後一步，DB 驗證穩定後才改 Pipeline | Phase 2 |

---

## 十三、資料持久性保障：DB-Native 資料不可重建問題（CRITICAL）

### 13.1 問題發現

前述架構聲稱「DB 是索引層，隨時可從檔案重建」— 但此聲明**僅對一半的資料成立**。

14 張表按持久性分為兩類：

| 類別 | 資料來源 | DB 損壞後果 | 代表表 |
|------|---------|-----------|--------|
| **可重建** | 有檔案系統對應（YAML, .md, front-end-spec） | 重跑同步腳本即 100% 恢復 | stories, epics, design_tokens, doc_index |
| **不可重建（DB-Native）** | Agent 即時寫入，無任何檔案對應 | **永久遺失** | context_entries, tech_entries, workflow_executions, benchmarks, glossary |

**context_entries 和 tech_entries 是整個系統最有價值的資料**（Agent 觀察、技術失敗案例、成功方案），而它們恰恰是最脆弱的。

### 13.2 各表持久性風險分類

| 表 | 來源 | DB 損壞後無 Ledger | 有 Ledger 後 |
|----|------|:------------------:|:-----------:|
| sprint_index / stories / epics | YAML 同步 | 可重建 | 可重建 |
| story_relations | YAML 註解 | 可重建 | 可重建 |
| design_tokens | front-end-spec.md | 可重建 | 可重建 |
| doc_index | 檔案系統掃描 | 可重建 | 可重建 |
| story_history | .track.md + DB 新增 | **部分遺失** | 100% 恢復 |
| file_relations | Story file-list + DB 新增 | **部分遺失** | 100% 恢復 |
| cr_issues | CR 報告 + 結構化欄位 | **部分遺失** | 100% 恢復 |
| **context_entries** | **DB-Native Only** | **永久遺失** | **100% 恢復** |
| **tech_entries** | **DB-Native Only** | **永久遺失** | **100% 恢復** |
| **workflow_executions** | **DB-Native Only** | **永久遺失** | **100% 恢復** |
| **benchmarks** | **DB-Native Only** | **永久遺失** | **100% 恢復** |
| **glossary** | **DB-Native Only** | **永久遺失** | **100% 恢復** |

### 13.3 解決方案：雙寫機制（DB + Ledger）

**架構修正**：對 DB-Native 資料，DB 不再是唯一 Source of Truth。每次寫入 DB 時，同步 append 一行至 `ledger.jsonl`，此 Ledger 是 append-only 的交易日誌，納入 Git 版控。

```
MCP Server 雙寫流程：

add_context(entry) / add_tech(entry) / log_workflow(entry)
  │
  ├─ Step 1: INSERT INTO sqlite_table → DB 寫入
  │
  └─ Step 2: fs.appendFileSync(ledger.jsonl) → 檔案備份
      格式：{"table":"context_entries","id":42,"data":{...},"_written_at":"ISO-8601"}
```

### 13.4 備份與恢復策略

```
.context-db/
├── myproject.db              ← SQLite 主資料庫（不納入 Git）
├── ledger.jsonl            ← Append-only 交易日誌（納入 Git）
├── backups/                ← 定期匯出快照（納入 Git）
│   ├── context_entries_2026-03-05.jsonl
│   ├── tech_entries_2026-03-05.jsonl
│   ├── workflow_executions_2026-03-05.jsonl
│   ├── benchmarks_2026-03-05.jsonl
│   └── glossary_2026-03-05.jsonl
├── server.js               ← MCP Server 主程式（納入 Git）
├── init-schema.js          ← Schema 初始化（納入 Git）
├── restore.js              ← 恢復腳本（納入 Git）
└── package.json            ← 依賴定義（納入 Git）
```

**完整恢復流程**：

```
DB 損壞 → 完整恢復步驟：

Step 1: 重建 Schema
  node init-schema.js

Step 2: 恢復可重建資料（從檔案系統）
  node sync_from_yaml.js            ← stories / epics
  node import_design_tokens.js      ← design_tokens
  node scan_doc_index.js            ← doc_index

Step 3: 恢復 DB-Native 資料（從 Ledger）
  node restore.js --from-ledger     ← 重放 ledger.jsonl 全部記錄
  或
  node restore.js --from-backup 2026-03-05  ← 從快照恢復

→ 14 張表全部 100% 恢復，零資料遺失
```

### 13.5 定期匯出排程

| 策略 | 觸發時機 | 輸出 | Git 追蹤 |
|------|---------|------|:-------:|
| Ledger 即時寫入 | 每次 MCP Tool 寫入時 | ledger.jsonl（append） | 是 |
| 快照匯出 | 每日排程 or batch-runner 完成後 | backups/*.jsonl | 是 |
| SQLite .backup | 每週 | myproject.db.bak | 否 |

### 13.6 修正後的架構定位

```
修正前（有缺陷）：
  「DB 是唯讀索引層，YAML 是 Source of Truth」
  → 對 DB-Native 資料不成立

修正後（完整）：
  可重建資料：YAML / 文件是 Source of Truth → DB 是索引層
  DB-Native 資料：DB + Ledger 共同是 Source of Truth → Ledger 提供持久保障

  合併表達：
  「結構化追蹤資料以 YAML 為 Source of Truth；
   知識記憶資料以 DB + Ledger 雙寫為 Source of Truth」
```

---

## 十四、更新後的核心架構決策總結

| 決策項 | 選擇 | 理由 |
|--------|------|------|
| 儲存引擎 | SQLite + FTS5 | 零部署、本地化、高效能 |
| 中文分詞 | trigram（Phase 0-1）→ Embedding（Phase 2+） | 零依賴 → 漸進增強 |
| 存取介面 | MCP Server (Node.js) | 四引擎統一存取、MCP SDK 生態系最成熟 |
| 圖形追蹤 | SQLite 遞迴 CTE（非 Neo4j） | ~800 邊規模完全可處理 |
| 寫入策略 | 三級（全自動 / Workflow 尾端 / 手動） | 最小化寫入 Token 成本 |
| 搜尋策略 | FTS5 → +Graph CTE → +Embedding | 漸進逼近 Vector-Graph Fusion |
| **持久性保障** | **雙寫（DB + Ledger.jsonl）** | **DB-Native 資料不可從檔案重建** |
| 追蹤資料來源 | YAML = Source of Truth（可重建資料） | 不改變現有工作流 |
| **知識記憶來源** | **DB + Ledger = Source of Truth（DB-Native 資料）** | **Ledger 納入 Git，確保零遺失** |
| 容錯機制 | DB 不可用時回退讀檔模式 | Workflow 不中斷 |
| 權重策略 | Phase 1-2 固定權重 → Phase 3 動態調整 | 務實先行 |
| BMAD Workflow | 不修改 XML，DB 在「前/後」注入 | 容錯降級保障 |
| DB 語言憲章 | 索引欄位英文 + 內容欄位繁體中文 | 延伸 Constitutional Standard |
| Pipeline 更新 | Phase 2 最後一步 | DB 驗證穩定後再改 |

---

## 十五、建議下一步（更新版）

1. **建立 TRS Story**（如 TRS-39）正式追蹤此功能開發
2. **Phase 0 PoC 實作**：SQLite + FTS5 + 3 張表 + 基礎 MCP Server + **Ledger 雙寫機制**
3. **種子資料注入**：從現有 ADR + CR 報告 + sprint-status.yaml 提取 20 筆種子資料
4. **搜尋準確度驗證**：20 個測試案例，確認 trigram 對中文的 Recall
5. **Ledger 恢復驗證**：刻意刪除 DB → 從 Ledger 重建 → 確認 100% 恢復
6. **單引擎驗證**：在 Claude Code 上測試完整查詢 → 寫入 → 恢復流程
7. **驗證成功後**：推進至 Phase 1，四引擎分發

---

## 十六、TRS Token 減量策略跨比對分析（v3.0 新增）

### 16.1 TRS 系列已完成成果基線

| 類別 | 核心成果 | 量化節省 | 狀態 |
|------|---------|---------|:----:|
| **A 類（Session 瘦身）** | CLAUDE.md 388->25 行、Rules 397->37 行、Skills 42->20 | **-86%** (15,440->2,150 tok/session) | 完成 |
| **B 類（Workflow 壓縮）** | checklist 去情緒化、instructions 去重、sprint-status 讀取降頻 | **-14,200 tok/Sprint 循環** | 完成 |
| **C 類（防禦性保護）** | .claudeignore、動態狀態解耦、Session 紀律 | 快取命中率恢復 | 大部分完成 |
| **D 類（操作流程）** | 技術債側車、Story 模板標注、Epic README 自動化 | **-19,550 tok/操作** | 大部分完成 |

**TRS 完成度**：15/19 Stories（79%）。剩餘 4 個：TRS-13（雙引擎 SOP）、TRS-14（三引擎統一憲章）、TRS-18（settings.json deny）、TRS-19（.debt.md 消費端）。

### 16.2 核心結論：兩套策略解決不同問題

```
TRS Token 減量策略（已完成 79%）：
  問題：「每次對話載入太多無用資料」
  手段：刪減靜態文件 + 壓縮 Workflow 指令 + 阻絕無效讀取
  效果：Session 啟動稅 -86%，Workflow -14,200 tok/cycle
  本質：管線瘦身 — 減少流入的水量

Context DB 記憶庫策略（提案中）：
  問題：「每次對話都從零開始，無跨 Session 記憶」
  手段：SQLite FTS5 結構化儲存 + MCP 按需查詢
  效果：技術知識秒查、失敗案例預警、跨引擎交接零損失
  本質：記憶系統 — 讓水在對的時候流到對的地方
```

**互補而非重疊**。TRS 讓 Agent「吃得少」，Context DB 讓 Agent「記得住」。

### 16.3 34 情境 vs. TRS 覆蓋率比對

#### 維度一：Token 節省（7 情境）

| ID | 情境 | TRS 已覆蓋？ | DB 增量價值 |
|----|------|:---:|------|
| T1 | Sprint 狀態索引 | 部分（TRS-9 已 4 次->1 次+變數） | 邊際：500->100 tok |
| T2 | Story 精準提取 | 未覆蓋 | 中：按欄位查詢省 -60% |
| T3 | Skill 觸發率優化 | 部分（TRS-4 刪了 22 個無關 Skill） | 低：剩餘 20 個已精準 |
| T4 | Design Token 快取 | 未覆蓋 | 高：-90% front-end-spec 讀取 |
| T5 | 重複讀取消除 | 未覆蓋 | 中：同 Session 去重 |
| T6 | Workflow 指令去重 | **已覆蓋**（TRS-6~10） | 極低 |
| T7 | project-context 差量 | 未覆蓋 | 中：section hash |

**Token 維度結論**：7 情境中 TRS 完全覆蓋 1 個、部分覆蓋 2 個、完全未覆蓋 4 個。但這 4 個的量化節省相對 TRS 已實現成果屬邊際增量。

#### 維度二：加速精準查詢（8 情境）

| ID | 情境 | TRS 已覆蓋？ | DB 增量價值 |
|----|------|:---:|------|
| Q1 | 技術知識庫搜尋 | 未覆蓋 | **極高** — 核心殺手級場景 |
| Q2 | 錯誤模式比對 | 未覆蓋 | **極高** |
| Q3 | 跨 Epic Story 搜尋 | 未覆蓋 | 高 |
| Q4 | CR 歷史模式查詢 | 未覆蓋 | 高 |
| Q5 | 依賴影響分析 | 未覆蓋 | 高 |
| Q6 | 設計決策追溯 | 未覆蓋 | 高 |
| Q7 | 測試案例搜尋 | 未覆蓋 | 中 |
| Q8 | Failed approach 預警 | 未覆蓋 | **極高** — 核心殺手級場景 |

**查詢維度結論**：8 個情境 TRS **全部未覆蓋**。這是 Context DB 的核心價值區。

#### 維度三：多 Agent 協作（8 情境）

| ID | 情境 | TRS 已覆蓋？ | DB 增量價值 |
|----|------|:---:|------|
| G1 | 跨引擎交接上下文 | 規劃中（TRS-13/14 未執行） | **極高** |
| G2 | 統一命名規範 | 未覆蓋 | 中 |
| G3 | CR 判準一致化 | 未覆蓋 | 高 |
| G4 | Workflow 步驟紀錄 | 未覆蓋 | 中 |
| G5 | 新 Agent 冷啟動 | 未覆蓋 | 高 |
| G6 | MEMORY 事故共享 | 未覆蓋 | **極高** — 核心殺手級場景 |
| G7 | Skill 觸發歷史 | 未覆蓋 | 低 |
| G8 | 併發衝突偵測 | 未覆蓋 | 中 |

**多 Agent 維度結論**：TRS-13/14 僅解決「配置同步」，Context DB 解決「知識同步」，層次不同。

#### 維度四：資料紀錄共享（11 情境）

全部 11 個情境（D1-D8, QA1-QA3）TRS **完全未覆蓋**。這是全新能力域。

### 16.4 `1.專案部屬必讀` 整合分析

| 資料夾 | 與 Context DB 關係 |
|--------|-------------------|
| **everything-claude-code (ECC)** | ECC 的 `/learn` + `instinct-import/export` 是 file-based 簡易記憶系統。Context DB 可取代且超越 ECC 記憶機制 |
| **Claude 智能中控自動化排程** | Pipeline（story-pipeline + batch-runner）已穩定。DB 在 Phase 2 才整合，不衝突 |
| **config-templates** | MCP 配置模板可直接擴展為 Context DB 四引擎分發配置 |

**關鍵發現**：ECC 的 `continuous-learning` Skill 已在 TRS-4 被刪除（需 bash hooks 且從未啟用），但其設計理念（Agent 從工作中學習）正好是 Context DB 要做的事。Context DB 是 ECC 學習系統的正式工程化實現。

### 16.5 量化效益對比

```
TRS 已實現（可量化）：
  Session:    -66,450 tok/日（5 次視窗 * 13,290 tok）
  Workflow:   -14,200 tok/Sprint 循環
  操作流程:    -19,550 tok/操作
  QGR 65 Stories 總節省: ~2,567,175 tok

Context DB 預估（可量化部分）：
  Sprint 狀態: -400 tok/次（邊際，TRS-9 已做大部分）
  Design Token: -4,500 tok/次
  技術搜尋: -2,000~5,000 tok/次
  Story 精準提取: -1,800 tok/次

Context DB 預估（不可量化但高價值）：
  技術失敗案例預警 → 避免重蹈覆轍（每次省數萬 tok 的 debug cycle）
  跨引擎交接零損失 → 四引擎切換不再「失憶」
  CR 判準一致化 → 消除 WON'T FIX 誤判（MEMORY.md 記錄 3+ 次事故）
  Sprint 回顧自動化 → 零人工回顧報告
```

### 16.6 綜合裁定

| 維度 | 評估 |
|------|------|
| 與 TRS 重疊度 | **低（< 15%）** — 僅 T1/T3/T6 三個情境部分重疊 |
| 獨特價值 | **極高** — 34 個情境中 28 個是 TRS 完全無法覆蓋的新能力 |
| 最大 ROI 場景 | Q1（技術知識搜尋）+ Q8（失敗預警）+ G1（跨引擎交接）+ G6（事故共享） |
| Phase 0 投入 | 複雜度 S — 3 張表 + 基礎 MCP + 手動種子 20 筆 |
| 風險 | 低 — 容錯降級保障 Workflow 不受影響 |
| 時機 | TRS 完成 79% 後是最佳時機 — 作為「下一階段」自然接續 |

**結論**：Context DB **值得執行**。定位為「知識基礎建設」獨立 Initiative（非 TRS 延續）。TRS 解決「Agent 吃太多」，Context DB 解決「Agent 失憶」。

---

## 十七、Epic TD 影響評估（v3.0 新增）

### 17.1 Epic TD 未開始 Story 總覽

Epic TD 目前有 12 個 `ready-for-dev` Story（TD-20 ~ TD-31），分析 Context DB 對其影響：

### 17.2 直接受益（Context DB 會顯著提升效率的 TD Story）

| TD Story | 標題 | 受益方式 | 對應 DB 情境 |
|----------|------|---------|-------------|
| **TD-22** | database-schema.md v3.0 全面更新 | DB 的 `stories` + `file_relations` 表可快速查出 QGR 所有新增 Entity/欄位/ER 變更，免翻 84 個 Story 文件 | Q3, Q5, D7 |
| **TD-24** | 架構文檔 QGR 同步（4 文件） | `tech_entries(category='architecture')` 可秒查所有架構決策歷史 | Q6, D7 |
| **TD-25** | 技術規格 QGR 同步（3 文件） | `cr_issues` + `tech_entries` 結構化查詢可快速找出需同步的安全/錯誤碼/測試規格變更 | Q4, D3 |
| **TD-27** | 新增 4 項 QGR 架構決策 ADR | DB 的 `tech_entries` 已結構化儲存 ADR 種子資料，直接查詢產出 | Q6, D7 |
| **TD-30** | 測試資料審計與補全 | `benchmarks` + `cr_issues(category='test')` 可快速定位覆蓋率缺口 | QA1, QA3 |

### 17.3 間接受益（Context DB 提供輔助但非必要的 TD Story）

| TD Story | 標題 | 受益方式 | 對應 DB 情境 |
|----------|------|---------|-------------|
| **TD-20** | 新建 5 個 QGR 聚焦 Skill | DB 的 `workflow_executions` + Skill 載入歷史可輔助判斷 Skill 邊界 | G7 |
| **TD-21** | 更新 5 個現有 Skill 補入 QGR 新模式 | 同上 | G7 |
| **TD-23** | project-context.md QGR 完結更新 | DB 的 `stories` 聚合查詢可快速產出進度數字，但直讀 sprint-status.yaml 也夠用 | T1 |
| **TD-26** | 功能規格反映實作差異 | `file_relations` 可比對規格文件 vs 實作文件的關聯，但手動比對也可行 | Q5, D7 |
| **TD-29** | create-story 文檔影響標記機制 | DB 的 `doc_index` 可輔助偵測文檔新鮮度，但此 Story 本身就在建立偵測機制 | D7 |

### 17.4 無直接關聯的 TD Story

| TD Story | 標題 | 說明 |
|----------|------|------|
| **TD-28** | Epic 完結審計 Workflow 建立 | 此 Story 建立的 Workflow **本身可成為 Context DB Phase 1 的消費端**，但建立時不依賴 DB |
| **TD-31** | Workflow 文檔同步強制機制 + 除錯知識庫 | 此 Story 的「除錯知識庫」與 `tech_entries(category='bugfix')` **高度重疊**。若 Context DB Phase 0 先完成，TD-31 的知識庫部分可直接用 DB 實現，避免另建一套 |

### 17.5 關鍵交叉發現

**TD-31 與 Context DB 的功能重疊是最值得注意的交叉點**：

```
TD-31 規劃的「除錯知識庫」：
  - 記錄 Bug 根因、解決步驟、驗證方式
  - Agent 遇到類似錯誤時可參照

Context DB 的 tech_entries(category='bugfix')：
  - 完全相同的功能
  - 更結構化（FTS5 搜尋 + Graph 追蹤 + MCP 統一存取）
```

**建議**：若決定執行 Context DB，TD-31 的「除錯知識庫」部分應改為「接入 Context DB tech_entries」而非另建獨立機制，避免雙系統維護。

### 17.6 執行順序建議

```
推薦順序（考慮 Context DB）：

Phase A — 立即可做（不依賴 DB）：
  TD-23（project-context 更新，複雜度 S）
  TD-27（新增 ADR，複雜度 S）
  TD-28（Epic 完結審計 Workflow，複雜度 M）

Phase B — 等 Context DB Phase 0 完成後效率更高：
  TD-22（database-schema v3.0，複雜度 L）
  TD-24（架構文檔同步，複雜度 L）
  TD-25（技術規格同步，複雜度 M）

Phase C — 建議與 Context DB 整合設計：
  TD-31（除錯知識庫 → 改用 tech_entries）
  TD-30（測試資料審計 → 利用 benchmarks/cr_issues）

Phase D — 獨立進行：
  TD-20, TD-21（Skill 建立/更新）
  TD-26（功能規格差異）
  TD-29（文檔影響標記）
```

### 17.7 影響評估總結

| 分類 | TD Story 數量 | 說明 |
|------|:---:|------|
| 直接受益 | 5 個 | TD-22/24/25/27/30 — DB 的結構化查詢可顯著加速 |
| 間接受益 | 5 個 | TD-20/21/23/26/29 — DB 有幫助但非必要 |
| 功能重疊 | 1 個 | **TD-31** — 除錯知識庫應改為接入 DB 而非另建 |
| 無關 | 1 個 | TD-28 — 可獨立進行，但完成後可作為 DB 消費端 |

---

## 十八、更新後的統一實施路線圖（v3.0）

### 18.1 推薦執行順序

```
[已完成] TRS A~D 類（15/19 Stories）→ Session/Workflow 瘦身已兌現
     |
     ├─ [Phase A — 立即] TRS-18/19 收尾 + TD-23/27/28（無 DB 依賴）
     |
     ├─ [Phase B — PoC] Context DB Phase 0（3 表 + MCP + Ledger 雙寫）
     |     └─ 單引擎驗證（Claude Code）+ 20 筆種子 + 搜尋準確度測試
     |
     ├─ [Phase C — 核心] Context DB Phase 1 + TD-22/24/25（利用 DB 加速）
     |     ├─ 14 張表完整部署 + 四引擎 MCP 分發
     |     ├─ TRS-13/14（三引擎統一憲章 — 與 MCP 分發合併推進）
     |     └─ TD-31 改為接入 DB tech_entries（避免雙系統）
     |
     └─ [Phase D — 擴展] Context DB Phase 2 + Pipeline 整合 + TD-20/21/26/29/30
```

### 18.2 Context DB 定位聲明

Context DB 不是 TRS（Token 減量策略）的第 20 個 Story，而是**獨立的知識基礎建設 Initiative**：

- TRS 解決的是**效率問題**（Agent 吃太多）→ 已實現 86%+ 節省
- Context DB 解決的是**記憶問題**（Agent 每次失憶）→ 28 個全新能力場景
- 兩者互補、不重疊、可並行推進

---

## 十九、TDD/BDD 整合策略（v4.0 新增）

### 19.1 現有測試生態系統

| 組件 | 框架 | 覆蓋率目標 |
|------|------|:--------:|
| 後端 (C#) | xUnit + Moq + FluentAssertions | > 80% |
| 前端 (React) | Vitest + Testing Library | > 80% |
| E2E | Playwright + Chrome MCP | 關鍵路徑 |
| 整合測試 | WebApplicationFactory + InMemory DB | 關鍵案例 |

**測試金字塔**：Unit (70%) + API/Integration (20%) + E2E (10%)

### 19.2 BDD 現有實踐

MyProject 已有中文 Gherkin BDD 實踐：
- `docs/spec-templates/bdd/feature-template.feature` — 標準化模板
- `docs/testing/features/bf-17-district-cascade.feature` — 實際案例
- 支援 P0-P2 優先級標籤 + Chrome MCP E2E 標籤

### 19.3 Context DB 如何整合 TDD/BDD

#### A. tech_entries 新增 6 個 TDD/BDD category

| category | 用途 | 查詢場景 |
|----------|------|---------|
| `test_pattern` | 測試撰寫模式 | dev-story 前查詢：「此模組用哪種 Mock 策略？」 |
| `bdd_scenario` | BDD 場景範本 | create-story 時推薦類似 AC 的 Gherkin 寫法 |
| `ac_pattern` | AC 驗收標準範本 | 統一驗收粒度，避免 AC 過粗或過細 |
| `test_failure` | 測試失敗根因 | 避免重蹈覆轍（如 InMemory DB 不支援 FK） |
| `test_infra` | 測試基礎設施 | 新模組直接複用已驗證的配置 |
| `mock_strategy` | Mock 策略庫 | fabric.js Mock、ECPay Mock 等可直接引用 |

#### B. test_journeys 表（E2E 路徑庫）

記錄所有 E2E 測試路徑，避免重複建立、追蹤穩定性：

```sql
-- 查詢 editor 模組所有 P0 E2E 路徑
SELECT journey_name, gherkin_zh, is_stable
FROM test_journeys
WHERE module = 'editor' AND priority = 'P0'
ORDER BY last_verified DESC;
```

#### C. test_traceability 表（AC->Test->Code 追蹤矩陣）

支援 testarch:trace Workflow 秒級產出追蹤報告：

```sql
-- 查詢某 Story 的 AC 覆蓋狀態
SELECT ac_id, ac_description, test_type, coverage_status
FROM test_traceability
WHERE story_id = 'QGR-E4'
ORDER BY ac_id;

-- 全域覆蓋率統計
SELECT coverage_status, COUNT(*) as count
FROM test_traceability
GROUP BY coverage_status;
```

### 19.4 TDD/BDD + Context DB 整合工作流

```
create-story 完成
  |
  +-- DB 查詢：search_tech(category='ac_pattern')
  |   -> 推薦類似 Story 的 AC 寫法
  +-- DB 查詢：search_test_journeys(module='editor')
  |   -> 顯示該模組已有的 E2E 路徑，避免重複
  |
testarch:atdd 執行（TDD 紅-綠-重構）
  |
  +-- DB 查詢：search_tech(category='test_pattern')
  |   -> 推薦已驗證的測試模式
  +-- DB 查詢：search_tech(category='flaky_test')
  |   -> 預警：「此模式曾導致 flaky test」
  |
dev-story 完成
  |
  +-- DB 寫入：add_tech(category='test_pattern')
  |   -> 記錄本次使用的新測試模式
  +-- DB 寫入：upsert_traceability(story_id, ac_id)
  |   -> 更新 AC -> Test -> Code 追蹤矩陣
  |
code-review 完成
  |
  +-- DB 寫入：add_cr_issue() 含測試品質項目
  +-- DB 更新：test_traceability.coverage_status
  |
testarch:trace 執行
  |
  +-- DB 查詢：全部 test_traceability WHERE story_id='X'
      -> 自動產出追蹤矩陣，秒級完成
```

### 19.5 testarch Workflow 與 DB 對應

MyProject 已有 8 個 testarch Workflow，Context DB 可強化其中 6 個：

| testarch Workflow | DB 強化方式 | 對應表 |
|-------------------|-----------|--------|
| test-design | 查詢歷史風險分類 + 已有測試層級分配 | tech_entries, test_journeys |
| atdd | 查詢 Mock 策略 + 測試模式 + 失敗預警 | tech_entries |
| automate | 查詢測試基礎設施決策歷史 | tech_entries(test_infra) |
| trace | **直接從 DB 產出追蹤矩陣** | test_traceability |
| test-review | 查詢 CR 歷史中的測試品質項目 | cr_issues, benchmarks |
| nfr-assess | 查詢效能基準趨勢 | benchmarks |

---

## 二十、長期沿用性分析（v4.0 新增）

### 20.1 Tag-First 設計的模組無關性

Schema 不綁定特定模組。所有記錄透過 `tags` + `category` + `module` 軟分類。新模組只需新增 tag 值，零 Schema 修改：

```
目前（QGR Epic）：
  tags: ["editor", "canvas", "fabric"]
  tags: ["payment", "ecpay", "webhook"]
  tags: ["pdf", "questpdf", "dpi"]

未來（CRM 模組）：
  tags: ["crm", "customer", "pipeline"]
  -> 零 Schema 修改

未來（行銷自動化）：
  tags: ["marketing", "email", "campaign"]
  -> 零 Schema 修改

未來（BI 儀表板）：
  tags: ["bi", "dashboard", "chart"]
  -> 零 Schema 修改
```

### 20.2 跨模組知識遷移場景

| 場景 | 現有 QGR 經驗 | 未來模組沿用方式 |
|------|-------------|----------------|
| DB Schema 設計 | FK 約束 Data Annotation 衝突 | 新模組設計前先查 `tech_entries WHERE tags MATCH 'FK migration EF'` |
| Mock 策略 | fabric.js Mock、ECPay Mock | 新模組第三方 SDK Mock 直接參照 |
| 錯誤處理 | CSP Header 踩坑 | 新模組安全配置查 `category='security'` |
| 測試模式 | WebApplicationFactory + InMemory DB | 新模組整合測試直接複用已驗證配置 |
| 部署 | Azure PaaS 配置 | 新模組 Azure 部署查 `category='architecture'` |
| BDD 場景 | 縣市聯動 Feature | 新模組下拉聯動測試參照已有 Gherkin 模板 |
| CR 判準 | DEFERRED/FIXED 判定歷史 | 新模組 CR 查 `cr_issues` 歷史案例統一標準 |

### 20.3 新模組冷啟動加速流程

```
啟動新 Epic/模組時的查詢流程：

Step 1: search_tech(tags='類似技術棧')
  -> 歷史經驗秒查（成功案例 + 失敗案例）

Step 2: search_tech(category='failure')
  -> 避坑指南（不重蹈覆轍）

Step 3: search_test_journeys(module='類似模組')
  -> 測試模式參照（Mock 策略、BDD 模板）

Step 4: lookup_glossary('新模組涉及的概念')
  -> 命名統一（避免同概念不同名）

Step 5: search_cr_issues(category='類似問題域')
  -> CR 判準參照（統一審查標準）

-> 新模組的第一個 Story 就已站在過去所有經驗的肩膀上
```

### 20.4 資料積累的複利效應

```
                     知識積累曲線
  查詢命中率
  100% |                              .........
       |                     .........
       |               ......
   70% |          .....
       |       ...
   50% |    ...
       |  ..
   30% | .
       |.
    0% +---+---+---+---+---+---+---+---> Epic 數量
       QGR  E2  E3  E4  E5  E6  E7

  Phase 0 (QGR): 種子資料 -> ~30% 命中率
  Phase 1 (Epic 2-3): 自動積累 -> ~50% 命中率
  Phase 2+ (Epic 4+): 複利效應 -> ~70%+ 命中率

  每完成一個 Epic，DB 中的知識量指數增長
  新模組開發速度因歷史經驗而持續加速
```

---

## 二十一、ChatGPT 記憶庫策略報告整合（v10.0 新增）

> **新增日期**：2026-03-07 01:51:25
> **來源**：三份 ChatGPT 分析報告（`Chatgpt分析報告claude_cli_token_reduction_sql_architecture.md`、`Chatgpt分析報告1.md`、`Chatgpt分析報告2.md`）
> **性質**：外部報告交叉分析 + 整合決策

### 21.1 三份 ChatGPT 報告核心洞見

| 報告 | 核心主題 | 關鍵貢獻 |
|------|---------|---------|
| SQL 架構報告 | Roslyn AST + SQL Server 2025 VECTOR | Symbol-level 切塊策略、`VECTOR(1536)` 原生向量儲存、`VECTOR_DISTANCE('cosine')` 語意搜尋 |
| 報告 1 | Symbol-level RAG + 混合檢索 | 四級減量策略分級、Symbol Dependency Graph（calls/inherits/implements/uses）、混合排名公式 |
| 報告 2 | Context Packing 機制 + 七種減量法 | CLI 每輪 Token 累積原理（5K→9K→15K）、`UserPromptSubmit` Hook 動態注入、終極架構整合 |

### 21.2 與本報告（CC-Agent）的互補分析

**核心判斷：兩層架構互補，非替換。**

| 維度 | CC-Agent 報告（本文） | ChatGPT 報告 |
|------|---------------------|-------------|
| **解決問題** | Agent 跨 Session 失憶 + 多引擎知識共享 | 每次互動 Token 消耗過高 |
| **檢索對象** | 知識記錄（決策/模式/CR Issue） | 程式碼 Symbol（class/method/interface） |
| **儲存引擎** | SQLite + FTS5（本地化） | SQL Server 2025 VECTOR / Qdrant / Neo4j |
| **檢索方式** | FTS5 trigram 全文搜尋 | Embedding 向量語意搜尋 |
| **整合方式** | MCP Server（Workflow Step 0 預載） | Hook（UserPromptSubmit 即時注入） |
| **量化效益** | 定性描述（「顯著減少」） | 具體數據（↓70~95%） |

```
完整記憶庫架構（整合後）：

┌─────────────────────────────────────────────────────────┐
│                    AI Agent 查詢層                        │
│          MCP Server (.context-db/server.js)               │
├───────────────────────┬─────────────────────────────────┤
│  知識記憶層 (Phase 0~2) │  程式碼語意層 (Phase 3 新增)       │
│  CC-Agent 報告設計      │  ChatGPT 報告貢獻                 │
│                        │                                  │
│  context_entries       │  symbol_index (Roslyn AST)        │
│  tech_entries          │  symbol_embeddings (VECTOR)       │
│  sprint_index          │  symbol_dependencies (Graph)      │
│  FTS5 trigram 搜尋     │  Cosine 語意搜尋                  │
│  SQLite 本地化         │  SQL Server 2025 / SQLite-VSS     │
├───────────────────────┴─────────────────────────────────┤
│               Hook 動態注入 (Phase 3 TD-35)                │
│     UserPromptSubmit → 向量檢索 → additionalContext       │
└─────────────────────────────────────────────────────────┘
```

### 21.3 ChatGPT 報告的強補強領域

以下為本報告（CC-Agent）**未涵蓋或僅點到為止**，由 ChatGPT 報告顯著補強的領域：

| 補強領域 | ChatGPT 貢獻 | CC-Agent 缺口 |
|---------|-------------|--------------|
| **程式碼級 RAG** | 完整的 Roslyn AST → Symbol 切塊 → Embedding → 語意檢索 pipeline | 本報告 Phase 3 僅標「向量搜尋」，未設計程式碼切塊策略 |
| **Symbol Dependency Graph** | 具體的 calls/inherits/implements/uses 四種關係 + SQL Graph NODE/EDGE 實作 | 本報告 §2.3 用遞迴 CTE 做圖形追蹤，但對象是知識條目而非程式碼符號 |
| **Context Packing 機制解析** | 詳細說明 CLI 每輪 Token 累積原理（System Prompt + Tool + 專案上下文 + 程式碼 + 指令） | 本報告未分析 CLI 內部 Token 消耗機制 |
| **Hook 動態注入** | `UserPromptSubmit` Hook + `additionalContext` 即時注入 | 本報告採 Workflow Step 0 預載，非即時動態注入 |
| **量化效益** | 整檔 50K → RAG+Graph <10K（↓70~90%），七種減量法各有具體數據 | 本報告的 Token 節省估算偏定性 |
| **SQL Server 2025 原生向量** | `VECTOR(1536)` + `VECTOR_DISTANCE` 免外部 DB | 本報告選 SQLite，未評估專案既有 SQL Server 資源 |

### 21.4 整合決策

#### 決策 1：雙層架構並存

- **知識記憶層**（Phase 0~2）：維持本報告設計不變（SQLite + FTS5 + MCP Server）
- **程式碼語意層**（Phase 3）：採用 ChatGPT 報告方案（Roslyn AST + Embedding + Hook）
- 兩層共用同一個 MCP Server 對外暴露 Tool

#### 決策 2：Phase 3 細分為三個串行 Story

| Story | 標題 | 複雜度 | 依賴 | ChatGPT 報告對應 |
|-------|------|:------:|------|-----------------|
| **TD-33** | Roslyn AST Symbol 提取 Pipeline | L | TD-32d PoC 通過 | SQL 架構報告 §2-3（MSBuildWorkspace + SyntaxWalker） |
| **TD-34** | Symbol Embedding + Vector 儲存 | L | TD-33 | SQL 架構報告 §3-4（VECTOR(1536) + VECTOR_DISTANCE） |
| **TD-35** | Hook 動態注入 + 依賴圖展開 | M | TD-34 | 報告 2 §Hook（UserPromptSubmit + additionalContext） |

#### 決策 3：Vector 儲存選型延後至 TD-34

TD-34 Task 1 需做出技術選型決策（ADR），候選方案：

| 方案 | 優點 | 缺點 |
|------|------|------|
| **SQL Server 2025 VECTOR(1536)** | 利用既有 DB、原生 `VECTOR_DISTANCE`、零額外部署 | 需 SQL Server 2025+、Azure 成本 |
| **SQLite + sqlite-vss** | 本地化、與 Phase 0 DB 統一 | sqlite-vss 成熟度較低、Windows 相容性待驗 |

**決策依據**：TD-32d PoC 的 FTS5 Recall 結果 + 專案 SQL Server 版本 + Windows 環境相容性。

#### 決策 4：TD-20 不變，Code RAG Skill 內容併入 TD-33

TD-20（新建 7 個 Skill）目前已在執行中，不可中途修改 AC。`myproject-context-memory` Skill 的 Code RAG 章節改為在 TD-33 Task 0 中補入。

### 21.5 更新後的完整 Phase 路線圖

```
Phase 0 (TD-32a~d) — 知識記憶 PoC
  3 張表 + FTS5 + MCP Server + 種子資料 + 準確度驗證
  → 已部分完成（TD-32a done, TD-32b done）

Phase 1 (本報告 §4.2~§4.5) — 知識記憶完整版
  +9 張表（stories, epics, cr_issues, file_relations...）
  +圖形追蹤（遞迴 CTE）
  → 待 Phase 0 PoC 通過後啟動

Phase 2 (本報告 §4.6~§4.7) — 知識記憶擴展
  +4 張表（doc_index, test_journeys, test_traceability, benchmarks）
  +14 類文檔分類（CC-sub-R9）
  → 待 Phase 1 穩定後啟動

Phase 3 (v10.0 新增 — ChatGPT 報告整合) — 程式碼語意檢索
  TD-33: Roslyn AST Symbol 提取 → symbol_index + symbol_dependencies
  TD-34: Embedding 向量化 → symbol_embeddings (VECTOR)
  TD-35: Hook 動態注入 → UserPromptSubmit + additionalContext
  → 待 TD-32d PoC 通過後啟動（與 Phase 1 可並行）
  → 預估 Token 減量：70~90%（ChatGPT 報告量化數據）
```

### 21.6 混合檢索公式更新

本報告 §2.1 的 $S_{final}$ 公式在 Phase 3 後擴展為三模態：

$$S_{final}(q, d) = \alpha \cdot Sim_{vec}(E_q, E_d) + \beta \cdot Sim_{graph}(G_q, G_d) + \gamma \cdot Sim_{fts}(T_q, T_d)$$

| Phase | $\alpha$ (向量) | $\beta$ (圖形) | $\gamma$ (FTS5) | 說明 |
|:-----:|:---:|:---:|:---:|------|
| 0 | 0 | 0 | 1.0 | 純 FTS5 |
| 1 | 0 | 0.3 | 0.7 | FTS5 + 知識圖形 |
| 2 | 0.5 | 0.3 | 0.2 | 知識向量 + 圖形 + FTS5 |
| 3 | 0.6 | 0.2 | 0.2 | 程式碼向量 + Symbol 依賴圖 + FTS5 |

Phase 3 的 $Sim_{vec}$ 和 $Sim_{graph}$ 對象從知識記錄擴展至程式碼 Symbol，覆蓋率預估從 ~80% 提升至 ~95%。

---

> **文件版本**：v10.0
> **文件狀態**：七輪 Party Mode 研討 + TRS 跨策略比對 + Epic TD 影響 + TDD/BDD 整合 + 16 表 Schema + 長期沿用性 + ChatGPT 報告整合
> **建檔時間**：2026-03-05 23:09:31
> **最後更新**：2026-03-07 01:51:25
> **建檔者**：CC-OPUS（Claude Code CLI — Claude Opus 4.6）
