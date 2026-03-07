# 🎭 Party Mode：AI 上下文資料庫架構研究討論

**角色：** Rovo Dev (RD-SONNET) 擔任主持人，邀請內建多角色代理聯合討論\
**議題：** 上下文資料庫 × 技術知識庫 × 可行性分析\
**日期：** 2026-03-05

------------------------------------------------------------------------

# 📚 基礎共識：各 Agent 的上下文架構原理

在討論議題之前，先整理研究資料的核心發現。

## 現行上下文架構的本質問題

    LLM 注意力預算 (Attention Budget) = 有限資源

    n² 問題：每個 Token 與每個 Token 都在相互注意
    → Context 越長，準確率越低，成本越高
    → "Context Rot"（上下文腐敗）是長任務的必然宿命

## 目前各 Agent 的上下文載入模式

  ---------------------------------------------------------------------------------
  層級           Claude Code    Gemini CLI     Rovo Dev       Antigravity
  -------------- -------------- -------------- -------------- ---------------------
  Always-On      CLAUDE.md +    GEMINI.md      AGENTS.md +    agent-identity.md +
                 rules/                        config.yml     rules/

  On-Demand      Skills YAML    Commands TOML  Subagents      Skills
                 摘要                                         

  動態           grep / glob /  同左           同左           同左
                 read                                         
  ---------------------------------------------------------------------------------

## 關鍵痛點（已量化）

-   靜態成本每次會話高達 **\~15,040 tokens**，瘦身後仍約 **\~3,000**
-   `sprint-status.yaml` 在單次 Sprint 被 **FULL_LOAD 達 4 次**
-   **無記憶機制**：每次會話都從零開始，歷史知識完全丟失

------------------------------------------------------------------------

# 🗣️ 議題一：上下文記憶資料庫（Context Memory Database）

## 🎯 核心概念

AI
目前就像一個每天早上失憶的工程師。每次會話開始時都不知道昨天做了什麼、踩過哪些坑、哪個方案有效。

**解方：** 建立一個結構化記憶資料庫，讓 AI
在接到指令時先查詢相關歷史記憶，再決定行動策略。

## 📐 架構設計

    Context Memory Database

    ┌─────────────────────────────────────────────┐
    │ Memory Store (SQLite)                       │
    ├─────────────┬──────────────┬────────────────┤
    │ session_mem │ observation  │ knowledge_base │
    │ ories       │ _log         │                │
    │             │              │                │
    │ - date      │ - timestamp  │ - topic        │
    │ - story_id  │ - agent_id   │ - keywords[]   │
    │ - summary   │ - action     │ - content      │
    │ - keywords  │ - result     │ - tags[]       │
    │ - tags      │ - context    │ - confidence   │
    └─────────────┴──────────────┴────────────────┘

    FTS5 全文搜尋索引
    向量嵌入（Phase 2 可選）

## 🔍 查詢流程（Just-in-Time Context）

    使用者下指令
    ↓
    Agent 解析意圖 → 提取關鍵字
    ↓
    查詢 Memory DB
    SELECT * FROM knowledge_base
    WHERE keywords MATCH '${query}'
    ORDER BY date DESC LIMIT 5
    ↓
    注入相關記憶（~500–1000 tokens）
    ↓
    執行任務
    ↓
    PostToolUse Hook → 寫入新觀察

## ✅ 可行性評估

  面向            評估        說明
  --------------- ----------- ----------------------------
  技術成熟度      ✅ 高       SQLite FTS5 為成熟技術
  實作複雜度      🟡 中       需 Hook 整合與 Schema 設計
  Token 節省      ✅ 高       精準注入可節省 70--90%
  維護成本        🟡 中       需定期清理舊記憶
  多 Agent 共享   🟡 需設計   需鎖定機制

參考專案：**claude-mem-main**（SQLite + Hooks 記憶系統）。

------------------------------------------------------------------------

# 🗣️ 議題二：技術知識庫（Tech Knowledge Base）

## 🎯 核心概念

MyProject 已有 **19+ Epic** 的技術決策與踩坑記錄，但 AI 每次仍需重新探索。

**解方：** 建立結構化技術知識庫。

## 技術知識庫 Schema

    tech_knowledge

    失敗案例 (anti)
    - approach
    - reason
    - symptoms
    - tags

    成功案例 (proven)
    - solution
    - context
    - perf_data
    - story_id

    ADR 摘要 (adr)
    - decision
    - rationale
    - status

## 🔍 使用情境

    需求：實作 Canvas 匯出 PDF

    查詢 tech_knowledge WHERE tags MATCH 'canvas pdf'

    返回：
    ⚠️ 失敗案例：html2canvas → 中文字型破損
    ✅ 成功案例：PdfWorker + Playwright
    📋 ADR：字型嵌入策略

Agent 直接採用已驗證方案，跳過試錯。

## ✅ 可行性評估

  面向         評估      說明
  ------------ --------- -----------------------------------------
  技術成熟度   ✅ 高     docs/technical-decisions 可作為種子資料
  實作複雜度   🟡 中     需 ETL 腳本匯入
  實際效益     ✅ 極高   避免重複踩坑
  人工維護     🟡 中     任務結束需新增條目
  自動化潛力   ✅ 高     Hook 可自動記錄

------------------------------------------------------------------------

# 🗣️ 議題三：延伸應用場景

## 情境 A：Sprint 狀態索引

    問題：sprint-status.yaml FULL_LOAD
    199 行 × 4 次 → Token 浪費

    解法：
    sprint_index DB
    - story_id
    - status
    - assigned

    效益：
    1500 tokens → 100 tokens
    節省 93%

## 情境 B：設計 Token 查詢快取

    design_tokens DB
    - token_name
    - value
    - category
    - usage_example

    查詢：主色調 → SELECT category='color-primary'

## 情境 C：BDD / 測試案例知識庫

    test_patterns DB
    - pattern_type
    - example
    - tags
    - story_id

## 情境 D：Story 依賴圖

    story_graph DB
    - story_id
    - depends_on[]
    - blocks[]

## 情境 E：錯誤模式資料庫

    error_patterns DB
    - error_message (FTS5)
    - root_cause
    - solution_steps
    - verified

------------------------------------------------------------------------

# 🏗️ 整合架構

    MyProject Agent Memory System (SQLite FTS5)

    Context DB
    - 會話記憶
    - 關鍵字索引
    - 任務日誌

    Tech KB
    - 失敗案例
    - 成功案例
    - ADR 摘要

    Operational Index
    - Sprint 狀態
    - Story 依賴圖
    - Design Token
    - BDD Pattern

    Hooks
    PreToolUse → 查詢
    PostToolUse → 記錄
    Scheduled Sync → 彙整

所有 Agents 共享： CC / GC / AG / RD

------------------------------------------------------------------------

# 📊 效益預估

  指標              現況           導入後       改善
  ----------------- -------------- ------------ ------
  會話靜態成本      15040 tokens   2990 + 800   -78%
  重複踩坑          頻繁           接近零       -90%
  Sprint 狀態讀取   6000 tokens    400 tokens   -93%
  跨 Agent 知識     手動文件       DB 共享      質變
  新 Agent 冷啟動   讀文件         DB 查詢      -70%

------------------------------------------------------------------------

# ⚡ 建議實施優先序

## Phase 1（2 週）

-   SQLite FTS5 Schema
-   ETL 匯入 TD-\*.md
-   PostToolUse Hook

## Phase 2（1 個月）

-   Sprint 狀態索引
-   Design Token DB
-   Error Pattern DB

## Phase 3（進階）

-   向量搜尋（Chroma / Qdrant）
-   Story 依賴圖自動化
-   跨引擎同步

------------------------------------------------------------------------

# 結論

核心三大方向：

1.  **記憶上下文資料庫**：Just‑in‑Time 注入
2.  **技術知識庫**：避免重複踩坑
3.  **延伸應用**：Sprint 索引、Design Token、BDD、Dependency
    Graph、Error Pattern

可進一步討論方向：

A. 實作 Phase 1 SQLite + Hooks\
B. 深入某個應用場景設計\
C. 工具選型（SQLite vs Vector DB）\
D. 先做 PoC 驗證
