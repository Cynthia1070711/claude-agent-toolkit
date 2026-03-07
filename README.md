# Claude Agent Toolkit

**AI Agent 開發方法論工具包 — 多引擎協作 · Pipeline 自動化 · 記憶庫策略 · Token 減量**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 從「直覺式編碼」（Vibe Coding）邁向「規格驅動開發」（Spec-Driven Development）—— 以 **[BMAD Method](https://github.com/bmadcode/BMAD-METHOD)** 規格驅動工作流為核心骨架，整合 **[Everything Claude Code](https://github.com/anthropics/courses)**（Anthropic 黑客松冠軍專案）的 Token 經濟學與持續學習系統，再疊加實戰驗證的多 Agent 協作策略、Context Memory DB、自動化排程系統，為 AI 輔助開發提供完整的方法論基礎設施。

---

## 核心框架整合：BMAD Method × Everything Claude Code

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
| **流程骨架** | ✅ 四階段 SDLC + Gate Check | — | + 雙重狀態更新 + 五項同步 |
| **角色分工** | ✅ Agent-as-Code 角色體系 | — | + 多引擎 Agent ID 體系 |
| **Token 管控** | — | ✅ Token 經濟學理念 | + 量化基準 + 快取殺手消除 |
| **Hooks 機制** | — | ✅ 事件驅動架構 | + File Lock + Hygiene Check |
| **知識持久化** | — | ✅ 持續學習概念 | + Context Memory DB (SQLite + MCP) |
| **安全防護** | — | ✅ AgentShield 理念 | + check-hygiene.ps1 |
| **品質閘門** | ✅ code-review workflow | — | + useState/Zustand 重複偵測 |
| **自動化** | ✅ Sprint Planning | — | + Pipeline + Auto-Pilot + Telegram |

> **設計原則**：BMAD 負責「做什麼」（What），ECC 負責「怎麼省」（How to Save），本工具包負責「怎麼協作」（How to Collaborate）。

---

## 目錄

- [解決什麼問題？](#解決什麼問題)
- [核心能力總覽](#核心能力總覽)
- [架構全景](#架構全景)
- [目錄結構](#目錄結構)
- [快速開始](#快速開始)
- [模組詳解](#模組詳解)
  - [1. 多引擎協作策略](#1-多引擎協作策略)
  - [2. Context Memory DB](#2-context-memory-db)
  - [3. BMAD Method 整合與強化](#3-bmad-method-整合與強化)
  - [4. Token 減量策略](#4-token-減量策略)
  - [5. Pipeline 自動化](#5-pipeline-自動化)
  - [6. 多 Agent 並行執行](#6-多-agent-並行執行)
- [研究報告索引](#研究報告索引)
- [TRS 執行故事](#trs-執行故事)
- [技術需求](#技術需求)
- [授權](#授權)

---

## 解決什麼問題？

AI Agent 輔助開發面臨四個核心挑戰：

| 挑戰 | 症狀 | 本工具包的解法 |
|------|------|--------------|
| **上下文遺失** | 每次新對話從零開始，上一次對話的 Bug 修復模式、架構決策、Code Review 教訓全部遺忘 | Context Memory DB — SQLite + MCP Server 按需查詢 |
| **Token 浪費** | 靜態配置檔膨脹佔用 context window，Workflow 執行開銷巨大（每輪 Sprint ~31K tokens） | 四層 Token 減量架構，MEMORY.md 精簡 90%+ |
| **多引擎衝突** | Claude Code、Gemini CLI、Antigravity IDE 等多引擎同時操作導致 commit 衝突、檔案覆蓋 | 三層並行策略（Worktree + File Lock + Total Commit） |
| **流程碎片化** | create-story → dev-story → code-review 手動串接，每步都需人工干預 | Pipeline 自動化 + Token 安全閥 + Telegram 遠端控制 |

---

## 核心能力總覽

```
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent Toolkit                       │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  多引擎協作   │ Context      │  BMAD        │  Pipeline      │
│  策略        │ Memory DB    │  Overlay     │  自動化         │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ • 4 引擎分工  │ • SQLite +   │ • dev-story  │ • batch-runner │
│   矩陣       │   FTS5       │   強化       │ • Token 安全閥  │
│ • 交接 SOP   │ • MCP Server │ • code-review│ • epic-auto-   │
│ • 統一憲章   │   (6 Tools)  │   深度審查    │   pilot        │
│ • Agent ID   │ • 四層遞進   │ • create-    │ • Telegram     │
│   體系       │   架構       │   story 自動 │   通訊控制      │
├──────────────┼──────────────┼──────────────┼────────────────┤
│  Token       │  多 Agent    │  TDD/BDD     │  一鍵部署       │
│  減量策略     │  並行執行     │  整合        │  工具包         │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ • Always-On  │ • Worktree   │ • 可執行規格 │ • 配置模板      │
│   瘦身       │   隔離       │   模式       │ • 部署腳本      │
│ • On-Demand  │ • File Lock  │ • Context    │ • Rules        │
│   按需載入    │   機制       │   Memory TDD │ • 衛生檢查      │
│ • 快取殺手   │ • Total      │ • RED→GREEN  │ • .claudeignore │
│   消除       │   Commit     │   →IMPROVE   │                │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

---

## 架構全景

### Token 消耗三層架構

Claude Code 每次新對話的初始 token 消耗分為三層：

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
├── 📦 deployment/                          # 一鍵部署工具包
│   │
│   ├── config-templates/                   # 各引擎配置模板
│   │   ├── claude/                         # Claude Code CLI
│   │   │   ├── CLAUDE.md.template          #   專案級指令模板（Triggers + Skills + Checklists）
│   │   │   ├── CLAUDE.local.md.template    #   本地 Agent ID 配置
│   │   │   ├── MEMORY.md.template          #   Auto-memory 最小化模板（~380 tokens）
│   │   │   ├── claudeignore.template       #   .claudeignore 排除規則
│   │   │   ├── settings.json.template      #   Hooks 配置（PreToolUse / PostToolUse）
│   │   │   ├── settings.local.json.template#   本地 Hooks（epic-readme sync / compact snapshot）
│   │   │   ├── hooks/                      #   Hook 腳本
│   │   │   │   └── pre-prompt-rag.js       #     L3 Code RAG 自動注入 Hook
│   │   │   └── rules/                      #   行為規則（Always-On，每個 ~100-200 tokens）
│   │   │       ├── coding-style.md         #     不可變性、檔案長度、巢狀限制
│   │   │       ├── constitutional-standard.md #  繁體中文輸出強制規則
│   │   │       ├── context-memory-db.md    #     查詢優先 + 寫入紀律
│   │   │       ├── git-workflow.md         #     Commit 格式、PR 規範
│   │   │       ├── performance.md          #     Subagent 模型選擇、Plan Mode
│   │   │       ├── security.md             #     OWASP Top 10 防護規則
│   │   │       └── testing.md              #     TDD 流程、80% 覆蓋率
│   │   │
│   │   ├── context-db/                     # Context Memory DB
│   │   │   ├── server.js                   #   MCP Server（6 Tools, stdio 傳輸）
│   │   │   ├── package.json.template       #   依賴定義（better-sqlite3 + MCP SDK）
│   │   │   ├── mcp.json.template           #   MCP 註冊配置
│   │   │   └── scripts/
│   │   │       └── init-db.js              #   SQLite Schema 初始化（WAL 模式 + FTS5）
│   │   │
│   │   ├── gemini/                         # Gemini CLI
│   │   │   ├── GEMINI.md.template          #   專案級指令模板
│   │   │   └── settings.json.template      #   context.fileName 配置
│   │   │
│   │   ├── antigravity/                    # Antigravity IDE
│   │   │   └── agent-identity.md.template  #   Agent 身份配置
│   │   │
│   │   └── rovodev/                        # Rovo Dev CLI
│   │       └── config.yml.template         #   Charter + System Prompt 配置
│   │
│   ├── scripts/                            # 自動化腳本（PowerShell）
│   │   ├── deploy-context-db.ps1           #   Context Memory DB 一鍵部署（6 步驟）
│   │   ├── batch-runner.ps1                #   批次 Story 執行器（IntervalSec 節流）
│   │   ├── batch-audit.ps1                 #   批次 Code Review 審計
│   │   ├── story-pipeline.ps1              #   Story 全流程管線（create → dev → review）
│   │   ├── epic-auto-pilot.ps1             #   Sprint 自動執行引擎
│   │   ├── check-hygiene.ps1               #   Commit 前衛生檢查（敏感資料掃描）
│   │   ├── sync-epic-readme.ps1            #   Epic README 自動同步
│   │   ├── pre-compact-snapshot.ps1        #   Context 壓縮前快照保存
│   │   ├── file-lock-acquire.ps1           #   多 Agent 檔案鎖取得
│   │   ├── file-lock-check.ps1             #   多 Agent 檔案鎖檢查
│   │   └── file-lock-release.ps1           #   多 Agent 檔案鎖釋放
│   │
│   ├── bmad-overlay/                       # BMAD Workflow 強化覆蓋層
│   │   └── 4-implementation/
│   │       ├── code-review/                #   深度審查：useState vs Zustand 重複偵測
│   │       │   ├── instructions.xml
│   │       │   ├── checklist.md
│   │       │   └── workflow.yaml
│   │       ├── create-story/               #   自動 Skills 分析 + Tracking 建立
│   │       │   ├── instructions.xml
│   │       │   ├── checklist.md
│   │       │   └── workflow.yaml
│   │       └── dev-story/                  #   雙重狀態更新 + 五項同步
│   │           ├── instructions.xml
│   │           ├── checklist.md
│   │           └── workflow.yaml
│   │
│   ├── agent-cli-guides/                   # 各引擎使用指南
│   │   ├── README.md
│   │   ├── claude-code-guide.md
│   │   ├── gemini-cli-guide.md
│   │   ├── antigravity-guide.md
│   │   └── rovo-dev-guide.md
│   │
│   ├── BMAD-METHOD-main/                   # BMAD Method 原始碼（第三方, MIT）
│   ├── everything-claude-code-main/        # Everything Claude Code（第三方）
│   │
│   ├── 開發前環境部署_v3.0.0.md              # 完整部署手冊（10 個 PART + 4 個附錄）
│   ├── context-memory-db-strategy.md       # Context Memory DB 策略文件（L0~L3）
│   ├── multi-agent-parallel-execution-strategy.md  # 多 Agent 並行策略
│   ├── BMAD架構演進與優化策略.md              # BMAD Token 消耗量化 + ECC 整合
│   ├── worktree-quick-reference.md         # Git Worktree 快速參考
│   ├── Claude智能中控自動化排程/              # Pipeline 自動化排程策略
│   │   ├── pipeline-audit-token-safety.md
│   │   └── pipeline-audit-token-safety.track.md
│   └── README.md                           # 部署包自身說明
│
├── 📊 research/                            # 策略研究報告
│   ├── token-reduction-analysis.md         # Token 減量初始分析
│   ├── token-reduction-final-report.md     # Token 減量最終報告（16 份報告彙整）
│   ├── multi-engine-collaboration-strategy.md  # 多引擎協作策略（四引擎規格 + 分工矩陣）
│   ├── multi-agent-collaboration-web-research.md # 多 Agent 協作 Web 研究
│   ├── auto-pilot-multi-agent-research.md  # Auto-Pilot 工作流研究
│   ├── bmad-vs-everything-claude-code.md   # BMAD vs ECC 深度比較與整合方案
│   ├── tasks-history.md                    # 研究任務歷史
│   │
│   ├── context-memory-db/                  # 記憶庫策略分析（多 Agent + 多模型視角）
│   │   ├── CC-Agent記憶庫策略分析報告.md      #   Claude Code Agent 分析
│   │   ├── AC-Agent記憶庫策略分析報告.md      #   Antigravity Agent 分析
│   │   ├── GC-Agent記憶庫策略分析報告.md      #   Gemini CLI Agent 分析
│   │   ├── RC-Agent記憶庫策略分析報告.md      #   Rovo Dev Agent 分析
│   │   ├── Chatgpt分析報告*.md              #   ChatGPT 交叉驗證（3 份）
│   │   ├── CC-sub-R8-skill-script-split.md #   Skill/Script 分離策略
│   │   ├── CC-sub-R9-document-classification.md # 文件分類策略
│   │   └── CC-sub-R10-workflow-sync-mechanism.md # Workflow 同步機制
│   │
│   ├── pipeline-automation/                # Pipeline 自動化研究
│   │   ├── pipeline-audit-token-safety.md  #   Token 安全閥設計
│   │   └── pipeline-audit-token-safety.track.md
│   │
│   └── claude-mem-reference/               # claude-mem 開源參考實作
│       ├── ragtime/                        #   RAG 管線參考
│       └── plugin/                         #   MCP Plugin 參考
│
├── 📖 guides/                              # Agent CLI 使用指南（繁體中文）
│   ├── Claude Code 入門指南.md
│   ├── Gemini CLI 入門指南.md
│   ├── Antigravity 入門指南.md
│   ├── Rovo Dev CLI 入門指南.md
│   ├── Copilot CLI 使用手冊編撰指南.md
│   └── GEMINI CLI_Hooks_JSON schema說明.md
│
└── 📝 stories/                             # TRS 執行故事（41 個, 實戰記錄）
    ├── execution-log.md                    # 執行總覽
    ├── TRS-0  ~ TRS-9                      # Phase 1: 基礎 Token 減量
    ├── TRS-10 ~ TRS-19                     # Phase 2: Workflow 壓縮 + 多引擎整合
    ├── TRS-20 ~ TRS-29                     # Phase 3: 四引擎統一配置
    ├── TRS-30 ~ TRS-33                     # Phase 4: 並行執行策略
    └── TRS-34 ~ TRS-40                     # Phase 5: 技術債登錄 + 進階優化
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

# 一鍵部署（自動完成 6 個步驟）
powershell -ExecutionPolicy Bypass -File <toolkit-path>/deployment/scripts/deploy-context-db.ps1
```

部署腳本自動完成：

| 步驟 | 動作 | 產出 |
|:----:|------|------|
| 1 | 建立 `.context-db/` 目錄結構 | 目錄 |
| 2 | 複製 MCP Server + Schema 初始化腳本 | `server.js`, `init-db.js` |
| 3 | `npm install` 安裝依賴 | `node_modules/` |
| 4 | 初始化 SQLite DB（WAL 模式） | `context-memory.db` |
| 5 | 建立 `.mcp.json` 註冊 MCP Server | MCP 配置 |
| 6 | 部署查詢優先 + 寫入紀律規則 | `.claude/rules/context-memory-db.md` |

### 步驟 2：配置 CLAUDE.md

```bash
# 複製模板到專案根目錄
cp <toolkit-path>/deployment/config-templates/claude/CLAUDE.md.template ./CLAUDE.md

# 編輯模板，填入專案特定資訊：
# - {{PROJECT_NAME}} → 你的專案名稱
# - Skill 索引表
# - 測試帳號
# - 核心禁止事項
```

### 步驟 3：部署 Rules

```bash
# 複製行為規則到 .claude/rules/
mkdir -p .claude/rules
cp <toolkit-path>/deployment/config-templates/claude/rules/*.md .claude/rules/
```

### 步驟 4：安裝 BMAD Overlay（選用）

```bash
# 將強化版 workflow 覆蓋到 BMAD 安裝目錄
cp -r <toolkit-path>/deployment/bmad-overlay/4-implementation/* \
  _bmad/bmm/workflows/4-implementation/
```

### 步驟 5：驗證部署

```bash
# 確認 MCP Server 已註冊
claude mcp list

# 重啟 Claude Code（讓 MCP Server 自動啟動）
# 測試查詢
# → 在新對話中輸入：「搜尋記憶庫中關於 Token 減量的記錄」
```

---

## 模組詳解

### 1. 多引擎協作策略

**核心文件**: `research/multi-engine-collaboration-strategy.md`

支援四個 AI 開發引擎的分工協作：

| 引擎 | 類型 | 最佳用途 | Agent ID 前綴 |
|------|------|---------|:------------:|
| **Claude Code CLI** | 終端機 CLI | 主線任務指揮官、架構決策、Code Review | `CC-` |
| **Gemini CLI** | 終端機 CLI | 大上下文分析、繁瑣執行任務 | `GC-` |
| **Antigravity IDE** | Agent-First IDE | E2E 測試、UI 開發輔助 | `AG-` |
| **Rovo Dev CLI** | 終端機 CLI + IDE 整合 | 非主線任務、快速修復 | `RD-` |

**關鍵設計**：
- **統一憲章** (`AGENTS.md`) — 四引擎共用的語言規範、目錄結構、觸發規則
- **交接 SOP** — Agent 切換時的三步驟確認（Sprint Status → Tracking → Last Log）
- **模型分工矩陣** — 每個引擎依任務類型選擇最佳模型（Opus/Sonnet/Haiku/Pro）

### 2. Context Memory DB

**核心文件**: `deployment/context-memory-db-strategy.md`

解決 AI Agent「每次對話從零開始」的根本問題。

| 層級 | 名稱 | 功能 | 依賴 |
|:----:|------|------|------|
| **L0** | 知識記憶層 | FTS5 全文搜尋 + 6 個 MCP Tools | Node.js 18+ |
| **L1** | 程式碼語意層 | Roslyn AST Symbol 提取 + 依賴圖譜 | .NET SDK 8+ |
| **L2** | 向量語意層 | OpenAI Embedding + Cosine Similarity | OpenAI API Key |
| **L3** | 動態注入層 | UserPromptSubmit Hook 自動注入上下文 | L2 完成 |

**MCP Tools（L0 基礎）**：

| Tool | 功能 | 使用場景 |
|------|------|---------|
| `search_context` | 搜尋上下文記憶 | 任務開始前查歷史決策 |
| `search_tech` | 搜尋技術知識庫 | Bug 修復前查已知解法 |
| `add_context` | 寫入上下文記憶 | 新的架構決策、模式確認 |
| `add_tech` | 寫入技術發現 | 技術方案驗證結果 |
| `add_cr_issue` | 寫入 CR 發現 | Code Review 發現的問題 |
| `trace_context` | 追蹤關聯上下文 | 擴展 story_id + related_files |

**自動行為規則**（透過 `.claude/rules/context-memory-db.md` 注入）：
- **查詢優先**：每個任務開始前，先用 `search_context` / `search_tech` 查詢相關記憶
- **寫入紀律**：任務完成後，將新發現寫入 DB（不重複、不暫時性）

### 3. BMAD Method 整合與強化

**核心文件**: `deployment/bmad-overlay/` + `deployment/BMAD架構演進與優化策略.md`

在 [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) v6.0 基礎上，疊加生產級強化：

| Workflow | 原版能力 | Overlay 強化 |
|----------|---------|-------------|
| **dev-story** | 基本任務執行 | + 雙重狀態更新（Story 文件 + YAML）<br>+ 五項同步（狀態 + YAML + Tracking + Agent 時間 + H1 emoji）<br>+ Skills 自動載入 |
| **code-review** | 基本程式碼審查 | + useState vs Zustand 重複偵測<br>+ 技術債全修復原則（WON'T FIX 僅限風格偏好）<br>+ CR 延後路由（留原 Epic，禁止路由至 Epic TD） |
| **create-story** | 基本 Story 建立 | + 自動分析 `skills_list.md` 寫入 Required Skills<br>+ 自動建立 Tracking 文件<br>+ 自動更新 Sprint Status |

**BMAD 四階段開發生命週期**：

```
Phase 1: 分析與探索   →  /product-brief（產品綱要）
Phase 2: 需求規劃     →  /create-prd（產品需求文件）
Phase 3: 架構方案     →  /create-architecture（架構設計 + Gate Check）
Phase 4: 實施與開發   →  /create-story → /dev-story → /code-review（Sprint 循環）
```

### 4. Token 減量策略

**核心文件**: `research/token-reduction-final-report.md`

經過 41 個 TRS Story 的系統性優化，涵蓋五個層面：

| 策略 | 做法 | 效果 |
|------|------|------|
| **靜態消耗瘦身** | CLAUDE.md 重寫、Rules 拆分、Auto-memory 精簡 | 靜態稅 15.4K → 3.6K tokens |
| **快取殺手消除** | 移除動態內容（Sprint 狀態、時間戳）、路徑引用替代嵌入 | Prompt Caching 命中率恢復 |
| **Workflow 壓縮** | XML 指令精簡、Checklist 合併、重複段落消除 | Sprint 循環 31.2K → ~22K tokens |
| **按需查詢** | MEMORY.md → Context Memory DB，8.8KB → 723B | Auto-memory 固定成本 -90% |
| **Skills On-Demand** | 完整 Skill 內容按需載入，僅摘要 Always-On | 避免 15+ Skills 全量載入 |

### 5. Pipeline 自動化

**核心文件**: `deployment/Claude智能中控自動化排程/` + `deployment/scripts/`

| 腳本 | 功能 | 使用場景 |
|------|------|---------|
| `batch-runner.ps1` | 批次 Story 執行器 | ≥2 Story 同時推進 |
| `batch-audit.ps1` | 批次 Code Review | 多 Story 一次審查 |
| `story-pipeline.ps1` | 完整管線（create → dev → review） | 單 Story 全流程自動化 |
| `epic-auto-pilot.ps1` | Sprint 自動執行引擎 | 整個 Epic 自動推進 |
| `check-hygiene.ps1` | Commit 前衛生檢查 | 敏感資料掃描、編碼驗證 |

**Token 安全閥機制**：
- 批次執行時自動偵測 Token 消耗異常
- 單一 Story 超過閾值自動暫停並通知
- `IntervalSec 12` 節流：避免 API Rate Limit

### 6. 多 Agent 並行執行

**核心文件**: `deployment/multi-agent-parallel-execution-strategy.md`

三層解決架構，依場景選擇：

| 層級 | 策略 | 解決問題 | 適用場景 |
|:----:|------|---------|---------|
| Layer 1 | **Worktree 隔離** | 同引擎多開的檔案衝突 | 5×CC-OPUS 並行推進 Sprint |
| Layer 2 | **File Lock 機制** | 跨引擎同目錄的檔案覆蓋 | CC + GC 同時工作不同功能 |
| Layer 3 | **Total Commit** | Commit 衝突與 token 浪費 | Agent 不 commit，人工決定時機 |

**File Lock 工具鏈**：
```powershell
# 取得鎖
.\scripts\file-lock-acquire.ps1 -AgentId "CC-OPUS" -Files "src/App.tsx,src/store.ts"

# 檢查鎖
.\scripts\file-lock-check.ps1 -Files "src/App.tsx"

# 釋放鎖
.\scripts\file-lock-release.ps1 -AgentId "CC-OPUS"
```

---

## 研究報告索引

本工具包的策略設計經過多引擎、多模型交叉驗證：

| 報告 | 分析主題 | 參與模型 |
|------|---------|---------|
| `token-reduction-final-report.md` | Token 減量策略彙整 | Opus 4.6, Sonnet 4.6, Gemini Pro |
| `multi-engine-collaboration-strategy.md` | 四引擎規格與分工矩陣 | BMAD Party Mode（5 角色） |
| `auto-pilot-multi-agent-research.md` | Auto-Pilot 工作流改進 | AG-OPUS（Antigravity） |
| `bmad-vs-everything-claude-code.md` | BMAD vs ECC 架構整合 | Web AI 深度研究 |
| `context-memory-db/CC-Agent*.md` | 記憶庫策略（CC 視角） | Claude Code Agent |
| `context-memory-db/AC-Agent*.md` | 記憶庫策略（AG 視角） | Antigravity Agent |
| `context-memory-db/GC-Agent*.md` | 記憶庫策略（GC 視角） | Gemini CLI Agent |
| `context-memory-db/RC-Agent*.md` | 記憶庫策略（RD 視角） | Rovo Dev Agent |
| `context-memory-db/Chatgpt*.md` | 記憶庫策略交叉驗證 | ChatGPT（3 份） |

---

## TRS 執行故事

41 個 TRS（Token Reduction Strategy）Story 記錄了從發現問題到解決方案的完整過程：

| Phase | Stories | 主題 |
|:-----:|:-------:|------|
| **1** | TRS-0 ~ TRS-9 | 基礎 Token 減量：.claudeignore、CLAUDE.md 瘦身、Rules 拆分、Sprint Status 優化 |
| **2** | TRS-10 ~ TRS-19 | Workflow 壓縮：dev-story XML 優化、code-review 審計、settings.json deny rules |
| **3** | TRS-20 ~ TRS-29 | 四引擎統一：Gemini MD 對齊、Antigravity Skills、Rovo Dev 配置、Progressive Disclosure |
| **4** | TRS-30 ~ TRS-33 | 並行策略：Rovo Dev Hooks、Multi-Agent 並行報告、File Lock 機制、Worktree SOP |
| **5** | TRS-34 ~ TRS-40 | 進階優化：技術債登錄、Registry YAML 索引、Skill Review Checklist、增量審查 |

> 每個 Story 包含：問題定義、執行內容、修改檔案清單、量化效益。

---

## 技術需求

| 項目 | 版本 | 必要性 | 用途 |
|------|------|:------:|------|
| **Node.js** | 18+ | 必要 | MCP Server 運行環境 |
| **PowerShell** | 5.1+ | 必要 | 部署腳本、Pipeline 自動化 |
| **Claude Code CLI** | Latest | 必要 | 主要 AI Agent 引擎 |
| **Git** | 2.30+ | 建議 | 版本控制、Worktree 支援 |
| **Gemini CLI** | Latest | 選用 | 大上下文開發、文檔分析 |
| **Antigravity IDE** | Latest | 選用 | E2E 測試、UI 開發 |
| **Rovo Dev CLI** | Latest | 選用 | 非主線任務 |
| **.NET SDK** | 8+ | 選用 | L1 Code RAG（Roslyn AST） |
| **OpenAI API Key** | — | 選用 | L2 向量語意搜尋 |

---

## 適用場景

| 場景 | 推薦部署層級 |
|------|------------|
| **個人開發者 + Claude Code** | L0 Context Memory DB + Rules + Token 減量 |
| **小團隊 + 雙引擎** | 上述 + BMAD Overlay + batch-runner |
| **多引擎並行開發** | 上述 + File Lock + Worktree + Pipeline 自動化 |
| **企業級 Sprint 管理** | 全部部署 + L1/L2 Code RAG + Auto-Pilot |

---

## 授權

本工具包包含以下元件：

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
