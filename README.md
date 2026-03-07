# Claude Agent Toolkit

> AI Agent 開發方法論工具包 — 跨引擎協作、Pipeline 自動化、記憶庫策略、Token 減量

整合 [BMAD Method](https://github.com/bmadcode/BMAD-METHOD)、[Everything Claude Code](https://github.com/anthropics/courses) 等開源最佳實踐，加上實戰驗證的多 Agent 協作策略、Context Memory DB、自動化排程系統。

---

## 核心能力

| 領域 | 說明 |
|------|------|
| **多引擎協作** | Claude Code + Gemini CLI + Antigravity + Rovo Dev 分工策略 |
| **BMAD Method 整合** | 強化 dev-story / code-review / create-story workflow |
| **Context Memory DB** | SQLite + FTS5 + MCP Server，跨對話知識累積 |
| **Pipeline 自動化** | batch-runner + Token 安全閥 + Telegram 通訊控制 |
| **Token 減量** | MEMORY.md 90% 精簡、按需查詢取代全量載入 |
| **TDD/BDD 整合** | 測試驅動開發 + 可執行規格模式 |

---

## 目錄結構

```
claude-agent-toolkit/
├── deployment/                     # 一鍵部署工具包
│   ├── config-templates/           # Claude/Gemini/Antigravity 配置模板
│   │   ├── claude/                 # CLAUDE.md, MEMORY.md, hooks, rules
│   │   ├── gemini/                 # GEMINI.md template
│   │   ├── antigravity/            # agent-identity template
│   │   └── context-db/             # MCP Server + SQLite schema
│   ├── scripts/                    # 部署腳本（PowerShell）
│   │   ├── deploy-context-db.ps1   # Context Memory DB 一鍵部署
│   │   ├── check-hygiene.ps1       # Commit 前衛生檢查
│   │   ├── epic-auto-pilot.ps1     # Sprint 自動執行引擎
│   │   └── file-lock-*.ps1         # 多 Agent 檔案鎖機制
│   ├── bmad-overlay/               # BMAD workflow 強化覆蓋層
│   ├── agent-cli-guides/           # 各引擎使用指南
│   ├── BMAD-METHOD-main/           # BMAD Method 原始碼（第三方）
│   └── everything-claude-code-main/# Everything Claude Code（第三方）
│
├── research/                       # 策略研究報告
│   ├── token-reduction-*.md        # Token 減量分析
│   ├── multi-engine-*.md           # 多引擎協作策略
│   ├── auto-pilot-*.md             # 自動駕駛模式研究
│   ├── context-memory-db/          # 記憶庫策略分析（多 Agent 視角）
│   ├── pipeline-automation/        # Pipeline + Token 安全閥
│   └── claude-mem-reference/       # claude-mem 開源參考
│
├── guides/                         # Agent CLI 使用指南
│   ├── claude-code-guide.md
│   ├── gemini-cli-guide.md
│   ├── antigravity-guide.md
│   └── rovo-dev-guide.md
│
└── stories/                        # TRS 執行故事（實戰記錄）
    └── TRS-0 ~ TRS-40
```

---

## 快速開始

### 1. Context Memory DB 部署

```powershell
cd <your-project-root>
powershell -ExecutionPolicy Bypass -File <toolkit-path>/deployment/scripts/deploy-context-db.ps1
```

自動完成：
- 建立 `.context-db/` + MCP Server + SQLite DB
- 註冊 `.mcp.json`
- 部署 `.claude/rules/context-memory-db.md`

### 2. CLAUDE.md 配置

複製 `deployment/config-templates/claude/CLAUDE.md.template` 到專案根目錄，填入專案特定資訊。

### 3. BMAD Overlay 安裝

將 `deployment/bmad-overlay/` 中的 workflow 覆蓋到 BMAD 安裝目錄。

---

## 核心策略文件

| 文件 | 說明 |
|------|------|
| `deployment/context-memory-db-strategy.md` | 四層遞進架構（L0~L3）完整設計 |
| `research/multi-engine-collaboration-strategy.md` | 多引擎分工與交接 SOP |
| `research/token-reduction-final-report.md` | Token 減量最終報告 |
| `deployment/multi-agent-parallel-execution-strategy.md` | 並行執行與檔案鎖策略 |

---

## 技術需求

- **必要**: Node.js 18+, PowerShell 5.1+
- **建議**: Claude Code CLI, Git
- **選用**: .NET SDK 8+（L1 Code RAG）, OpenAI API Key（L2 語意搜尋）

---

## 授權

本工具包整合了以下開源專案：
- [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) — MIT License
- [Everything Claude Code](https://github.com/anthropics/courses) — 原始授權
- [claude-mem](https://github.com/anthropics/claude-mem) — 參考實作

自訂部分採用 MIT License。
