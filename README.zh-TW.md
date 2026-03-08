# Claude Agent Toolkit (v1.7.1)

**多 Agent 協作策略 · 半自動化排程 · 規格驅動開發 · 跨對話知識累積**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)

---

### 主開發策略

**Antigravity IDE + Claude Code CLI（主力） + BMAD Method v6**

1. **Claude Token 減量策略**
   靜態消耗 15.4K → 3.6K tokens（-76.5%），MEMORY.md 精簡 90%+，Prompt Caching 快取殺手消除。經 41 個 TRS Story 系統性驗證，涵蓋 Always-On 瘦身、On-Demand 按需載入、Workflow 壓縮三大層面。

2. **多 Agent 協作策略（Gemini CLI · Rovo Dev CLI · Antigravity IDE）**
   四引擎分工矩陣 + 交接 SOP + 並行檔案鎖（Worktree + File Lock + Total Commit）。提供統一憲章 `AGENTS.md` 與 Agent ID 體系，確保多引擎同步工作不衝突。
   **提供自行加入其他 CLI 策略**：建議先彙整 CLI 使用手冊 + 相關程式範例（Hook 腳本、配置模板、指令對照表），並由 Claude Opus 4.6 讀取部署手冊自動完成配置。已提供的指南：Claude Code、Gemini CLI、Antigravity IDE、Rovo Dev CLI、Copilot CLI。

3. **整合 [Everything Claude Code](https://github.com/anthropics/courses)（Anthropic 黑客松冠軍專案）**
   Token 經濟學 · 事件驅動 Hooks · 持續學習 v2 · AgentShield 安全審計。各專案可依使用狀況調整主開發策略為 Everything Claude Code 或 BMAD Method，或自行規劃 Workflows。

4. **上下文記憶庫策略（Context Memory DB）**
   建立向量記憶點資料庫（SQLite + FTS5 + MCP Server），多 Agent 協作共享同一個記憶庫、精準搜尋關鍵資料、可擴充記憶知識廣度。四層遞進架構 + **Epic CMI**（6 Stories）自動化生命週期記錄：
   - **L0 知識記憶層**：FTS5 全文搜尋 + 6 個 MCP Tools（search_context / search_tech / add_context / add_tech / add_cr_issue / trace_context）
   - **L1 程式碼語意層**：Roslyn AST Symbol 提取 + 依賴圖譜
   - **L2 向量語意層**：OpenAI Embedding + Cosine Similarity 語意搜尋
   - **L3 動態注入層**：UserPromptSubmit Hook 每次提問自動注入相關上下文
   - **CMI 進階強化**：Session 生命週期自動記錄（Stop/SessionEnd/PreCompact Hook）、全量文檔 ETL（136 Story + 50 CR + 29 ADR）、對話級記憶（list_sessions / get_session_detail / search_conversations）、UTC+8 時區正規化、壓縮恢復防護機制
   - **DevConsole Web UI**：獨立 Node.js 應用（Express 5 + Vite + React 18），提供記憶庫視覺化瀏覽/搜尋/CRUD、Story Kanban 看板、CR Issue 追蹤、Session 時間軸。支援繁中/英文切換（i18n）。`localhost:5174`（前端）+ `localhost:3001`（API）

5. **智能半自動化排程（BMAD Workflows）**
   Pipeline 自動化 + Token 安全閥 + Sprint 半自動推進。包含 batch-runner（批次執行）· story-pipeline（單 Story 全流程）· epic-auto-pilot（整個 Epic 自動推進）· batch-audit（批次 Code Review）。建議使用 **Claude Opus 4.6 作為中控**指揮官，搭配 Sonnet/Haiku 執行子任務。

6. **Telegram 整合策略**
   遠端操控啟動 Claude 執行任務。Telegram Bot Bridge v2.0 採用 stream-json 持久進程模式（上下文只載入一次），支援多輪對話記憶、訊息佇列、自動重連、模型切換（`/model opus`）、路徑書籤（`/bookmark`）。手機即可監控進度、發送指令、切換工作目錄。

7. **SDD + ATDD + TDD 開發方法論（規格驅動開發）**
   BDD 降級為需求溝通輔助（僅 PRD/Epic 層級），核心開發迴圈改為：**SDD Spec → ATDD 驗收測試 → TDD 單元測試 → 最小實作**。M/L/XL Story 自動觸發 `/sdd-spec-generator` 產出 `{id}-spec.md`（Business Rules + API 合約 + DB Schema + 邊界條件）。每個 AC 映射 `[Verifies: BR-XXX]`，3 輪 Debug 上限，VSDD 簡化版 code-review 進行 Spec vs Code 比對。預估在現有 76.5% Token 降幅基礎上再降 20%~35%。涵蓋 xUnit + Moq + FluentAssertions（後端）與 Vitest + Playwright E2E（前端）。

---

## 這個專案是什麼？

一套**可直接部署到任何專案的 AI Agent 開發方法論工具包**，從「直覺式編碼」（Vibe Coding）邁向「規格驅動開發」（Spec-Driven Development）。

---

## 核心框架整合：BMAD Method x Everything Claude Code

本工具包並非從零建構，而是站在兩大開源框架的肩膀上，取其精華並補其不足：

### BMAD Method — 規格驅動的敏捷團隊模擬

[BMAD Method](https://github.com/bmadcode/BMAD-METHOD)（Build More Architect Dreams）將 AI 視為一個完整的敏捷開發團隊，實作了「代理即程式碼」（Agent-as-Code）概念：

- **12+ 專業角色**：商業分析師、產品經理、架構師、Scrum Master、開發者、QA 等，各自定義為獨立的 YAML/Markdown 檔案
- **34+ 標準化工作流**：從產品分析到實施開發的四階段生命週期，每個階段有嚴格的 Gate Check
- **規模自適應**：依專案複雜度自動調整（L0 單一修復 → L4 企業級系統）
- **上下文分片**：強制將大型 PRD 切割為微小的使用者故事，確保每次執行的上下文純淨

### Everything Claude Code — Anthropic 黑客松冠軍的 Token 經濟學

[Everything Claude Code](https://github.com/anthropics/courses)（ECC）源自 Anthropic 黑客松冠軍團隊，經 10 個月以上高強度生產環境驗證：

- **Token 經濟學**：將 200K context window 視為珍貴資源，靜態消耗從 18K 瘦身至 ~10K tokens
- **事件驅動 Hooks**：PreToolUse / PostToolUse / SessionStart 生命週期事件，背景自動執行格式化、安全掃描
- **持續學習 v2**：自動觀察編碼習慣，萃取帶「信心分數」的微型直覺（Instincts），演化為永久技能
- **AgentShield**：基於 Opus 模型的紅藍軍對抗審計，掃描硬編碼金鑰與過度寬鬆權限

### 我們的整合策略 — 取兩家之長

| 層面 | 取自 BMAD | 取自 ECC | 本工具包的強化 |
|------|----------|---------|--------------|
| **流程骨架** | 四階段 SDLC + Gate Check | — | + 雙重狀態更新 + 五項同步 |
| **角色分工** | Agent-as-Code 角色體系 | — | + 多引擎 Agent ID 體系 |
| **Token 管控** | — | Token 經濟學理念 | + 量化基準 + 快取殺手消除 |
| **Hooks 機制** | — | 事件驅動架構 | + File Lock + Hygiene Check |
| **知識持久化** | — | 持續學習概念 | + Context Memory DB (SQLite + MCP) |
| **安全防護** | — | AgentShield 理念 | + check-hygiene.ps1 |
| **品質閘門** | code-review workflow | — | + useState/Zustand 重複偵測 |
| **自動化** | Sprint Planning | — | + Pipeline + Auto-Pilot + Telegram |

> **設計原則**：BMAD 負責「做什麼」（What），ECC 負責「怎麼省」（How to Save），本工具包負責「怎麼協作」（How to Collaborate）。

---

## 目錄

- [解決什麼問題？](#解決什麼問題)
- [架構全景](#架構全景)
- [目錄結構](#目錄結構)
- [快速開始](#快速開始)
- [模組詳解](#模組詳解)
- [研究報告索引](#研究報告索引)
- [TRS 執行故事](#trs-執行故事)
- [技術需求](#技術需求)
- [授權](#授權)

---

## 解決什麼問題？

| 挑戰 | 症狀 | 本工具包的解法 |
|------|------|--------------|
| **上下文遺失** | 每次新對話從零開始，上一次對話的 Bug 修復模式、架構決策、Code Review 教訓全部遺忘 | Context Memory DB — SQLite + MCP Server 按需查詢 |
| **Token 浪費** | 靜態配置檔膨脹佔用 context window，Workflow 執行開銷巨大（每輪 Sprint ~31K tokens） | 四層 Token 減量架構，MEMORY.md 精簡 90%+ |
| **多引擎衝突** | Claude Code、Gemini CLI、Antigravity IDE 等多引擎同時操作導致 commit 衝突、檔案覆蓋 | 三層並行策略（Worktree + File Lock + Total Commit） |
| **流程碎片化** | create-story → dev-story → code-review 手動串接，每步都需人工干預 | Pipeline 自動化 + Token 安全閥 + Telegram 遠端控制 |
| **遠端操控** | 離開電腦後無法監控或指揮 Agent 執行進度 | Telegram Bot Bridge — 手機遠端操作 Claude CLI |

---

## 架構全景

### Token 消耗三層架構

| 層級 | 內容 | 載入方式 | 優化前 | 優化後 |
|:----:|------|---------|:------:|:------:|
| Layer 1 | 全域 `~/.claude/CLAUDE.md` | Always-On | ~3,640 tokens | ~220 tokens |
| Layer 2 | 專案 `CLAUDE.md` + `.claude/rules/*` | Always-On | ~11,000 tokens | ~2,600 tokens |
| Layer 3 | Skills 描述 + MCP 工具 | On-Demand | ~800 tokens | ~800 tokens |
| **合計** | | | **~15,440** | **~3,620** |

> 靜態消耗降低 **76.5%**，節省的 ~12K tokens 全部回歸實際工作使用。

### Context Memory DB 四層遞進架構

```
L0 知識記憶層（必要 — 零外部依賴）
  ├── context_entries: 決策、Pattern、除錯發現、事故記錄
  ├── tech_entries: 技術方案（成功/失敗）、Bug 修復、架構決策
  ├── FTS5 trigram: 全文搜尋（中英文混合查詢）
  └── MCP Tools: search_context / search_tech / add_context / add_tech / add_cr_issue / trace_context

L1 程式碼語意層（選用 — 需 .NET SDK）
  ├── symbol_index: class / method / interface / enum（Roslyn AST 提取）
  ├── symbol_dependencies: calls / inherits / implements / uses
  └── MCP Tools: search_symbols / get_symbol_context

L2 向量語意層（選用 — 需 OpenAI API Key）
  ├── symbol_embeddings: text-embedding-3-small（1536 維）
  ├── Cosine Similarity 語意搜尋
  └── MCP Tool: semantic_search

L3 動態注入層（選用 — 需 L2）
  ├── UserPromptSubmit Hook
  ├── 使用者每次提問自動注入相關程式碼上下文
  └── S_final = 0.6×vec + 0.2×graph + 0.2×fts
```

### 多引擎協作架構

```
┌─────────────────────────────────────────────────┐
│              AGENTS.md 統一憲章                   │
│    （四引擎共用：語言規範、目錄結構、觸發規則）       │
└──────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │
  ┌────▼────┐ ┌───▼────┐ ┌──▼───────┐ ┌▼─────────┐
  │ Claude  │ │ Gemini │ │Antigrav- │ │ Rovo Dev │
  │ Code    │ │ CLI    │ │ity IDE   │ │ CLI      │
  │ CLI     │ │        │ │          │ │          │
  ├─────────┤ ├────────┤ ├──────────┤ ├──────────┤
  │CLAUDE.md│ │GEMINI  │ │.agent/   │ │config.yml│
  │.claude/ │ │.md     │ │rules/    │ │Charter   │
  │rules/   │ │.gemini/│ │workflows/│ │System    │
  │hooks/   │ │settings│ │          │ │Prompt    │
  └─────────┘ └────────┘ └──────────┘ └──────────┘
       │          │          │          │
  ┌────▼──────────▼──────────▼──────────▼──────────┐
  │         Context Memory DB (MCP Server)          │
  │    search_context / search_tech / add_context   │
  └─────────────────────────────────────────────────┘
```

---

## 目錄結構

```
claude-agent-toolkit/
│
├── deployment/                            # 一鍵部署工具包
│   ├── config-templates/                  # 各引擎配置模板
│   │   ├── claude/                        # Claude Code CLI
│   │   │   ├── CLAUDE.md.template         #   專案級指令模板
│   │   │   ├── MEMORY.md.template         #   Auto-memory 最小化模板（~380 tokens）
│   │   │   ├── hooks/pre-prompt-rag.js    #   L3 Code RAG 自動注入 Hook
│   │   │   └── rules/*.md                 #   行為規則（7 個檔案）
│   │   ├── context-db/                    # Context Memory DB（MCP Server + SQLite）
│   │   ├── gemini/                        # Gemini CLI 配置模板
│   │   ├── antigravity/                   # Antigravity IDE 配置模板
│   │   └── rovodev/                       # Rovo Dev CLI 配置模板
│   ├── scripts/                           # 自動化腳本（PowerShell）
│   │   ├── deploy-context-db.ps1          #   Context Memory DB 一鍵部署
│   │   ├── batch-runner.ps1               #   批次 Story 執行器
│   │   ├── epic-auto-pilot.ps1            #   Sprint 自動執行引擎
│   │   ├── check-hygiene.ps1              #   Commit 前衛生檢查
│   │   └── file-lock-*.ps1               #   多 Agent 檔案鎖（3 個腳本）
│   ├── bmad-overlay/                      # BMAD Workflow 強化覆蓋層（+SDD/ATDD/TDD）
│   ├── agent-cli-guides/                  # 各引擎使用指南
│   ├── BMAD-METHOD-main/                  # BMAD Method 原始碼（第三方, MIT）
│   └── everything-claude-code-main/       # Everything Claude Code（第三方）
│
├── research/                              # 策略研究報告
│   ├── token-reduction-final-report.md    # Token 減量最終報告（16 份報告彙整）
│   ├── multi-engine-collaboration-strategy.md  # 四引擎規格與分工矩陣
│   ├── bmad-vs-everything-claude-code.md  # BMAD vs ECC 深度比較
│   ├── context-memory-db/                 # 記憶庫策略分析（多 Agent + 多模型視角）
│   ├── pipeline-automation/               # Pipeline + Token 安全閥
│   ├── methodology/                       # SDD+ATDD+TDD 方法論研究（3 份交叉分析）
│   └── claude-mem-reference/              # claude-mem 開源參考實作
│
├── guides/                                # Agent CLI 使用指南
│   ├── Claude Code Guide.md
│   ├── Gemini CLI Guide.md
│   ├── Antigravity Guide.md
│   ├── Rovo Dev CLI Guide.md
│   └── Copilot CLI Guide.md
│
├── tools/                                 # 開發者工具
│   └── dev-console/                      # DevConsole Web UI（記憶庫視覺化）
│       ├── server/                       #   Express 5 REST API（better-sqlite3）
│       ├── src/                          #   React 18 SPA + i18n（zh-TW / en）
│       └── package.json                  #   `npm run dev` 一鍵啟動前後端
│
├── telegram-bridge/                       # Telegram 遠端控制 Claude CLI
│   ├── src/                               # TypeScript 原始碼
│   ├── PRD.md                             # 產品需求文檔（v2.0 持久進程模式）
│   ├── technical-spec.md                  # 技術規格（三層架構）
│   └── SETUP.md                           # 設定指南（BotFather + 環境變數）
│
└── stories/                               # TRS 執行故事（41 個, 實戰記錄）
    ├── TRS-0  ~ TRS-9                     # Phase 1: 基礎 Token 減量
    ├── TRS-10 ~ TRS-19                    # Phase 2: Workflow 壓縮
    ├── TRS-20 ~ TRS-29                    # Phase 3: 四引擎統一配置
    ├── TRS-30 ~ TRS-33                    # Phase 4: 並行執行策略
    └── TRS-34 ~ TRS-40                    # Phase 5: 進階優化
```

---

## 快速開始

### 前置條件

```bash
# 必要
node --version    # Node.js 18+
claude --version  # Claude Code CLI

# 選用
gemini --version  # Gemini CLI（大上下文開發）
dotnet --version  # .NET SDK 8+（L1 Code RAG）
```

### 步驟 1：部署 Context Memory DB

```powershell
cd <your-project-root>
powershell -ExecutionPolicy Bypass -File <toolkit-path>/deployment/scripts/deploy-context-db.ps1
```

部署腳本自動完成 6 個步驟：建立目錄結構 → 複製 MCP Server → npm install → 初始化 SQLite DB → 建立 .mcp.json → 部署查詢規則。

### 步驟 2：配置 CLAUDE.md

```bash
cp <toolkit-path>/deployment/config-templates/claude/CLAUDE.md.template ./CLAUDE.md
# 編輯模板，填入專案特定資訊
```

### 步驟 3：部署 Rules

```bash
mkdir -p .claude/rules
cp <toolkit-path>/deployment/config-templates/claude/rules/*.md .claude/rules/
```

### 步驟 4：安裝 BMAD Overlay（選用）

```bash
cp -r <toolkit-path>/deployment/bmad-overlay/4-implementation/* \
  _bmad/bmm/workflows/4-implementation/
```

### 步驟 5：驗證部署

```bash
claude mcp list  # 確認 MCP Server 已註冊
# 重啟 Claude Code，測試：「搜尋記憶庫中關於 Token 減量的記錄」
```

---

## 模組詳解

詳細模組說明請參見 [英文版 README](README.md#module-details)，包含：

1. **多引擎協作策略** — 四引擎分工矩陣、統一憲章、交接 SOP
2. **Context Memory DB** — 四層遞進架構、9 個 MCP Tools（+CMI 對話記憶 3 Tool）、Hook 自動化、自動行為規則
3. **DevConsole Web UI** — 記憶庫視覺化瀏覽/搜尋/CRUD、Story Kanban 看板、CR Issue 追蹤、Session 時間軸（Express 5 + React 18 + i18n 繁中/英文）
4. **BMAD Method 整合與強化** — dev-story / code-review / create-story Overlay + SDD-TDD Bridge + VSDD Simplified
5. **Token 減量策略** — 五個層面的系統性優化
6. **Pipeline 自動化** — batch-runner / epic-auto-pilot / Token 安全閥
7. **多 Agent 並行執行** — Worktree / File Lock / Total Commit 三層策略
8. **Telegram 遠端控制** — stream-json 持久進程模式、指令系統、快速部署

---

## 研究報告索引

| 報告 | 分析主題 | 參與模型 |
|------|---------|---------|
| `token-reduction-final-report.md` | Token 減量策略彙整 | Opus 4.6, Sonnet 4.6, Gemini Pro |
| `multi-engine-collaboration-strategy.md` | 四引擎規格與分工矩陣 | BMAD Party Mode（5 角色） |
| `auto-pilot-multi-agent-research.md` | Auto-Pilot 工作流改進 | AG-OPUS（Antigravity） |
| `bmad-vs-everything-claude-code.md` | BMAD vs ECC 架構整合 | Web AI 深度研究 |
| `context-memory-db/*.md` | 記憶庫策略（多視角） | CC + AC + GC + RC + ChatGPT |
| `methodology/*.md` | SDD+ATDD+TDD 方法論研究 | ChatGPT + Gemini + Claude 交叉分析 |

---

## TRS 執行故事

41 個 TRS（Token Reduction Strategy）Story 記錄了從發現問題到解決方案的完整過程：

| Phase | Stories | 主題 |
|:-----:|:-------:|------|
| **1** | TRS-0 ~ TRS-9 | 基礎 Token 減量 |
| **2** | TRS-10 ~ TRS-19 | Workflow 壓縮 |
| **3** | TRS-20 ~ TRS-29 | 四引擎統一配置 |
| **4** | TRS-30 ~ TRS-33 | 並行執行策略 |
| **5** | TRS-34 ~ TRS-40 | 進階優化 |
| **CMI** | CMI-1 ~ CMI-6 | 記憶庫進階優化：Session 自動記錄、全量文檔 ETL、對話記憶、時區修正、壓縮防護、品質強化 |
| **FLOW** | FLOW-OPT-001 | SDD+ATDD+TDD 方法論整合：BDD 降級、spec-gen 自動觸發、AC-BR 追溯、VSDD 簡化版 |

---

## 技術需求

| 項目 | 版本 | 必要性 | 用途 |
|------|------|:------:|------|
| **Node.js** | 18+ | 必要 | MCP Server 運行環境 |
| **PowerShell** | 5.1+ | 必要 | 部署腳本、Pipeline 自動化 |
| **Claude Code CLI** | Latest | 必要 | 主要 AI Agent 引擎 |
| **Git** | 2.30+ | 建議 | 版本控制、Worktree 支援 |
| **Gemini CLI** | Latest | 選用 | 大上下文開發 |
| **Antigravity IDE** | Latest | 選用 | E2E 測試、UI 開發 |
| **.NET SDK** | 8+ | 選用 | L1 Code RAG（Roslyn AST） |
| **OpenAI API Key** | — | 選用 | L2 向量語意搜尋 |

---

## 授權

| 元件 | 授權 | 來源 |
|------|------|------|
| BMAD Method | MIT | [bmadcode/BMAD-METHOD](https://github.com/bmadcode/BMAD-METHOD) |
| Everything Claude Code | 原始授權 | [anthropics/courses](https://github.com/anthropics/courses) |
| claude-mem | 參考實作 | 開源社群 |
| **自訂部分** | **MIT** | 本倉庫 |

---

## 致謝

- [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) — 規格驅動開發的「代理即程式碼」框架
- [Everything Claude Code](https://github.com/anthropics/courses) — Token 經濟學與持續學習系統
- [claude-mem](https://github.com/anthropics/claude-mem) — MCP-based 記憶持久化參考
- Anthropic Claude — 提供 Opus / Sonnet / Haiku 模型驅動整個開發流程
