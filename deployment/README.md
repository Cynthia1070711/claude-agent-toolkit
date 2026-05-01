# 專案部署必讀 — 多引擎協作環境一鍵初始化範本 (v1.7.0)

**版本**: 2.0.0
**建立日期**: 2026-02-27
**最後更新**: 2026-05-01（v2.1.0：新增 9 篇深度補全 — Skills/Rules/IDD/Hooks/Memory/MCP/BMAD Workflows/Commands + SANITIZATION-POLICY）
**適用範圍**: BMAD Method v6.0.0-alpha.21（已升級 v6.2.2 概念）+ Claude Code CLI（含 ECC Hook 強化 + WFQ 配額管理 + CCI 環境整合 + OTel OTLP Token 追蹤）+ Gemini CLI + Antigravity IDE + Rovo Dev CLI

---

## 這是什麼？

這個資料夾是一個**完整的、可攜帶的專案初始化範本包**。當你建立新專案或接手舊專案時，只需要：

1. 安裝必要的 CLI 工具
2. 安裝 BMAD Method
3. 複製這個資料夾到新專案
4. 執行覆蓋與配置
5. 讓 Claude Code 讀取部署手冊完成剩餘設定

所有 TRS Epic 的優化成果（Workflow 壓縮、配置精簡、自動化腳本）都已打包在此，**不會因為重新安裝 BMAD 而遺失**。

---

## 前置條件：CLI 工具安裝

> **最低需求**：至少安裝 Claude Code CLI（必要）。其他引擎為選用，根據團隊需求安裝。
> 部署流程會**自動偵測已安裝的 CLI**，僅部署已安裝引擎的配置。未安裝的引擎會跳過並顯示安裝提示。

### Claude Code CLI（必要）

```bash
# 安裝（需要 Node.js 18+）
npm install -g @anthropic-ai/claude-code

# 驗證安裝
claude --version

# 首次登入
claude login
```

> 官方文檔：https://docs.anthropic.com/en/docs/claude-code

### Gemini CLI（選用 — 大上下文開發、文檔分析）

```bash
# 安裝（需要 Node.js 18+）
npm install -g @anthropic-ai/gemini-cli

# 驗證安裝
gemini --version

# 設定 API Key
gemini auth login
```

> 官方文檔：https://github.com/anthropics/gemini-cli
> 詳細入門：`agent-cli-guides/gemini-cli-guide.md`

### Antigravity IDE（選用 — IDE 整合開發、E2E 測試）

```
從 https://windsurf.com 下載安裝 Windsurf (Antigravity) IDE
安裝後開啟專案即自動讀取 .agent/ 配置
```

> 詳細入門：`agent-cli-guides/antigravity-guide.md`

### Rovo Dev CLI（選用 — Atlassian Jira/Confluence 整合）

```bash
# 安裝（需要 Node.js 18+）
npm install -g @atlassian/rovo-dev

# 驗證安裝
rovo-dev --version

# 配置 Atlassian 憑證
rovo-dev auth login
```

> 官方文檔：https://developer.atlassian.com/cloud/rovo/
> 詳細入門：`agent-cli-guides/rovo-dev-guide.md`

### 安裝狀態速查

```powershell
# 一鍵檢查所有 CLI 安裝狀態
Write-Host "=== CLI 安裝狀態 ==="
@("claude", "gemini", "rovo-dev") | ForEach-Object {
    $cmd = $_
    try {
        $ver = & $cmd --version 2>$null
        Write-Host "[OK] $cmd : $ver" -ForegroundColor Green
    } catch {
        Write-Host "[--] $cmd : 未安裝" -ForegroundColor Yellow
    }
}
```

---

## 資料夾結構

```
docs/專案部屬必讀/
│
├── README.md                              ← 你正在讀的這份文件
├── 開發前環境部署_v3.0.0.md               ← 主部署手冊 v3.1.0（含 PART 8.5 Worktree 並行開發）
├── worktree-quick-reference.md            ← Worktree 並行開發一頁速查指南
├── BMAD架構演進與優化策略.md              ← 架構版本差異 + Token 量化 + 遷移決策框架
├── multi-agent-parallel-execution-strategy.md ← 多 Agent 並行策略（Worktree + File Lock + Total Commit + Debt Registry §10）
│
├── Claude智能中控自動化排程/              ← Pipeline 中控調度 + Token 安全閥
│   ├── pipeline-audit-token-safety.md     ← 完整需求分析 + 根因分析 + Bug 修正紀錄
│   └── pipeline-audit-token-safety.track.md ← 實作追蹤檔
│
├── Agent-User/Claude-Docs/               ← Claude API/用量文檔（中文翻譯）
│   └── 用量與成本API.md                   ← Anthropic Usage & Cost API（Admin API, 組織帳戶用）
│
├── context-memory-db-strategy.md          ← Context Memory DB 策略全文（TD-32~36）
│
│  ─────── 2026-05-01 新增 9 篇深度補全（v2.1.0）───────
├── SANITIZATION-POLICY.md                 ← 脫敏政策 SSoT（7 類映射 + 7 條 grep 終審）
├── skills-deep-dive.md                    ← 74 Skills 全景 + 17 Domain Profile + 三引擎 + 三層 Sync Gates
├── rules-deep-dive.md                     ← 20 Rules 完整索引 + 5 SUPREME Mandate + 9 Lifecycle Invariants + 3-Tier Boundary
├── idd-framework.md                       ← IDD 4 層標註（Code/ADR/DB/Memory）+ COM/STR/REG/USR + forbidden_changes
├── hooks-events-deep-dive.md              ← 14 Hooks + 11 層 RAG 注入 + 10 Hook event 矩陣 + Block vs Advisory
├── memory-system-deep-dive.md             ← Context Memory DB 30+ tables schema + 23 MCP tools + 82 scripts + DevConsole + agent-memory
├── mcp-ecosystem.md                       ← pcpt-context + chrome-devtools + claude-in-chrome + Google MCP + 內部 RAG 優先 6 步
├── bmad-workflows-evolution.md            ← create-story 8 step + 7 Depth Gates / dev-story 13 step / code-review 13 step + 三層平行 + SaaS 9 維 + Phase A-D
├── commands-reference.md                  ← 13 專案 + 3 全域 commands + 10 subagents + 25+ Skill 偽 commands
│
├── agent-cli-guides/                      ← 四引擎入門指南
│   ├── README.md                          ← 索引 + 功能比較表 + 新引擎接入 SOP
│   ├── claude-code-guide.md
│   ├── gemini-cli-guide.md
│   ├── antigravity-guide.md
│   └── rovo-dev-guide.md
│
├── bmad-overlay/                          ← BMAD Workflow 覆蓋包（Epic BU v1.8.0 升級）
│   └── 4-implementation/
│       ├── code-review/                   ← [BU] workflow.md + 13 step 分檔 + 三層平行架構
│       │   ├── workflow.md                   主工作流（95行, 取代 instructions.xml）
│       │   ├── workflow.yaml                 BMAD 配置（指向 workflow.md）
│       │   ├── checklist.md                  品質檢查清單（+VSDD Simplified）
│       │   ├── saas-standards.md          ← [NEW] SaaS 9 維 Production Readiness 標準
│       │   ├── instructions.xml           ← [DEPRECATED] 舊 XML 備份（697行）
│       │   └── steps/                     ← [NEW] 13 step 分檔
│       │       ├── step-01-load-discover.md     載入 Story + 探索 codebase
│       │       ├── step-01b-generate-trail.md   [BU-06] Review Trail path:line 生成
│       │       ├── step-02-review-plan.md       審查計畫 + 三層分派
│       │       ├── step-03-triple-layer-dispatch.md  [BU-01] 三層平行調度
│       │       ├── step-03a-blind-hunter.md     Layer A: 功能正確性盲測
│       │       ├── step-03b-edge-case-hunter.md Layer B: 邊界條件窮舉
│       │       ├── step-03c-acceptance-auditor.md Layer C: AC 符合性驗證
│       │       ├── step-03d-triage-merge.md     Findings 合併 + 分類
│       │       ├── step-04-present-autofix.md   呈現 + 自動修復
│       │       ├── step-04b-skill-staleness.md  Skill 過時偵測
│       │       ├── step-05-production-gate.md   Production 品質閘門
│       │       ├── step-05b-tasks-backfill.md   Tasks 回填驗證
│       │       └── step-06-report-archive.md    報告 + 歸檔
│       ├── create-story/                  ← [BU] workflow.md + 8 step 分檔
│       │   ├── workflow.md                   主工作流（76行, 取代 instructions.xml）
│       │   ├── workflow.yaml                 BMAD 配置
│       │   ├── checklist.md                  品質檢查清單
│       │   ├── template.md                   SDD+ATDD Story 模板
│       │   ├── instructions.xml           ← [DEPRECATED] 舊 XML 備份（746行）
│       │   └── steps/                     ← [NEW] 8 step 分檔
│       │       ├── step-00-db-first-query.md    DB-first 查詢
│       │       ├── step-01-target-story.md      目標 Story 解析
│       │       ├── step-02-artifact-analysis.md 產物分析
│       │       ├── step-03-codebase-analysis.md 程式碼分析
│       │       ├── step-04-architecture-analysis.md 架構分析
│       │       ├── step-05-web-research.md      Web 研究
│       │       ├── step-06-create-story-file.md Story 檔案建立
│       │       └── step-07-finalize.md          完成 + DB 同步
│       └── dev-story/                     ← [BU] workflow.md + 13 step 分檔
│           ├── workflow.md                   主工作流（76行, 取代 instructions.xml）
│           ├── workflow.yaml                 BMAD 配置
│           ├── checklist.md                  品質檢查清單
│           ├── instructions.xml           ← [DEPRECATED] 舊 XML 備份（759行）
│           └── steps/                     ← [NEW] 13 step 分檔（含 KB/Migration/Review Continuation）
│               ├── step-00-db-first-query.md ~ step-10-communication.md
│
├── config-templates/                      ← 各引擎配置範本
│   ├── claude/                            ← [必要] Claude Code CLI
│   │   ├── CLAUDE.md.template             ← 專案級配置骨架（需修改）
│   │   ├── CLAUDE.local.md.template       ← Agent Identity（直接複製）
│   │   ├── MEMORY.md.template             ← Auto-memory 精簡範本（直接複製）
│   │   ├── claudeignore.template          ← .claudeignore（直接複製）
│   │   ├── settings.json.template         ← 安全 deny 清單（直接複製）
│   │   ├── settings.local.json.template   ← Hooks 配置（直接複製）
│   │   ├── hooks/                         ← Hook 腳本（選用）
│   │   │   └── pre-prompt-rag.js          ← Phase 3 Code RAG 動態注入（需 OpenAI API Key）
│   │   └── rules/                         ← 7 個品質規則（直接複製）
│   │       ├── coding-style.md
│   │       ├── constitutional-standard.md
│   │       ├── context-memory-db.md       ← [NEW] 查詢優先 + 寫入紀律
│   │       ├── git-workflow.md
│   │       ├── performance.md
│   │       ├── security.md
│   │       └── testing.md
│   ├── context-db/                        ← [選用] Context Memory DB
│   │   ├── server.js                      ← MCP Server (6 Tools, stdio)
│   │   ├── package.json.template          ← 依賴（需替換專案名）
│   │   ├── mcp.json.template              ← .mcp.json 註冊範本
│   │   └── scripts/
│   │       └── init-db.js                 ← SQLite Schema 初始化（冪等）
│   ├── gemini/                            ← [選用] Gemini CLI
│   │   ├── GEMINI.md.template             ← 全域配置（直接複製到 ~/.gemini/）
│   │   └── settings.json.template         ← Hooks + MCP（直接複製）
│   ├── antigravity/                       ← [選用] Antigravity IDE
│   │   └── agent-identity.md.template     ← AG 身份定義（直接複製）
│   └── rovodev/                           ← [選用] Rovo Dev CLI
│       └── config.yml.template            ← Charter + Event Hooks（需修改專案名）
│
└── scripts/                               ← 通用自動化腳本
    ├── check-hygiene.ps1                  ← 檔案編碼 Mojibake 偵測
    ├── sync-epic-readme.ps1               ← Epic README 自動生成（Hook 觸發）
    ├── pre-compact-snapshot.ps1           ← 壓縮前快照保存（Hook 觸發）
    ├── file-lock-check.ps1               ← [TRS-32] 寫入前檢查檔案鎖定狀態
    ├── file-lock-acquire.ps1             ← [TRS-32] 寫入後登記檔案鎖定
    ├── file-lock-release.ps1             ← [TRS-32] 釋放檔案鎖定（Agent/Story/File）
    ├── story-pipeline.ps1                ← [Pipeline] 單 Story 三階段管線（create→dev→review）
    ├── batch-runner.ps1                  ← [Pipeline] 批次並行（最多 5 Story，間隔 12s）
    ├── batch-audit.ps1                   ← [Pipeline] 批次後驗證 + AutoFix（7 Check）
    ├── epic-auto-pilot.ps1              ← [Pipeline] 整個 Epic 迴圈自動化
    ├── deploy-context-db.ps1            ← [NEW] Context Memory DB 一鍵部署
    └── otel-micro-collector.js          ← [WFQ-08] OTel OTLP HTTP Micro Collector（Token 追蹤）
```

> **OTel Token 追蹤說明**（wfq-08, 2026-04-04）：
> Pipeline 執行時自動啟動 `otel-micro-collector.js`（Node.js HTTP server, port 49152-65535）。
> Claude CLI 透過 `OTEL_LOGS_EXPORTER=otlp` + `OTEL_EXPORTER_OTLP_ENDPOINT` 將 per-request token 數據
> 發送至 collector → 寫入 JSONL 檔案 → Pipeline watchdog 即時讀取累加 → 寫入 `workflow_executions` 表。
> 完全繞過 stdout（解決 Bug #17 isatty 衝突），Dashboard 可顯示真實 Token 消耗 + Cost。
> Skill: `.claude/skills/pcpt-otel-micro-collector/`

---

## 使用步驟（新專案 / 舊專案）

### Step 0: 閱讀架構演進策略（首次部署建議）

> 首次部署前，建議先閱讀 **`BMAD架構演進與優化策略.md`**，了解：
> - BMAD v6.2.2 最新架構（Skills-based + Markdown step 分檔）
> - PCPT 自訂系統已超越 BMAD 2.1 倍（Workflow 2,202 行 vs source 885 行）
> - Token 靜態消耗基準數據（v3.0 ~19,090 tokens — 含 63 Skills + 15 Rules）
> - Epic BU 升級成果（三層平行 Review + Skill Validator + Quick Dev oneshot + Edge Case Hunter）
> - 新專案 vs 舊專案的遷移決策樹

### Step 1: 安裝 BMAD Method

```bash
# 新專案建議使用最新 stable 版
npx bmad-method install

# 舊專案維護（若已安裝 alpha 版且運作正常，不需重新安裝）
# npx bmad-method@alpha install
```

> 這會安裝原廠版 BMAD 到 `_bmad/` 目錄。

### Step 2: 複製範本包到新專案

```powershell
# 將整個「專案部屬必讀」資料夾複製到新專案的 docs/ 下
Copy-Item -Path "原始專案\docs\專案部屬必讀" -Destination "新專案\docs\專案部屬必讀" -Recurse
```

### Step 3: 覆蓋 BMAD Workflow（Epic BU 升級版）

```powershell
# 將 bmad-overlay 覆蓋到 BMAD 安裝目錄
Copy-Item -Path "docs\專案部屬必讀\bmad-overlay\4-implementation\*" `
          -Destination "_bmad\bmm\workflows\4-implementation\" `
          -Recurse -Force
```

> **為什麼需要這一步？**
> `npx bmad-method install` 安裝的是原廠版 Workflow。
> Epic BU（2026-04-03）將 Workflow 從 XML 遷移到 Markdown step 分檔架構：
> - code-review: 三層平行（Blind Hunter + Edge Case Hunter + Acceptance Auditor）+ SaaS 9 維
> - create-story: 8 step 分檔（含 DB-first + Skill 自動發現 + KB 掃描）
> - dev-story: 13 step 分檔（含 Skill staleness + Migration Cascade + KB 錯誤查詢）
> 覆蓋後同時安裝 PCPT 自訂功能（Production Gates、Tech Debt Registry 等）。
> 舊 instructions.xml 保留為 DEPRECATED 備份。

### Step 4: 部署配置檔案（依安裝狀態條件部署）

> **重要**：只部署你已安裝的 CLI 引擎配置。未安裝的引擎直接跳過。

#### 4.1 Claude Code（必要 — 所有專案都必須部署）

```powershell
# Claude Code 配置（必要）
Copy-Item "docs\專案部屬必讀\config-templates\claude\claudeignore.template" ".claudeignore"
New-Item -ItemType Directory -Path ".claude" -Force
Copy-Item "docs\專案部屬必讀\config-templates\claude\settings.json.template" ".claude\settings.json"
Copy-Item "docs\專案部屬必讀\config-templates\claude\settings.local.json.template" ".claude\settings.local.json"
Copy-Item "docs\專案部屬必讀\config-templates\claude\CLAUDE.local.md.template" "CLAUDE.local.md"
New-Item -ItemType Directory -Path ".claude\rules" -Force
Copy-Item "docs\專案部屬必讀\config-templates\claude\rules\*" ".claude\rules\" -Recurse
```

#### 4.2 Gemini CLI（選用 — 僅在已安裝時部署）

```powershell
# 檢查是否安裝
if (Get-Command gemini -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Gemini CLI detected - deploying config" -ForegroundColor Green
    New-Item -ItemType Directory -Path ".gemini" -Force
    Copy-Item "docs\專案部屬必讀\config-templates\gemini\settings.json.template" ".gemini\settings.json"
    # 全域 GEMINI.md（若尚未存在）
    if (-not (Test-Path "$env:USERPROFILE\.gemini\GEMINI.md")) {
        Copy-Item "docs\專案部屬必讀\config-templates\gemini\GEMINI.md.template" "$env:USERPROFILE\.gemini\GEMINI.md"
    }
} else {
    Write-Host "[SKIP] Gemini CLI not installed - skipping config" -ForegroundColor Yellow
    Write-Host "       Install: npm install -g @anthropic-ai/gemini-cli" -ForegroundColor DarkGray
}
```

#### 4.3 Antigravity IDE（選用 — 僅在使用 Windsurf IDE 時部署）

```powershell
# Antigravity 不需要 CLI 檢查，只要你使用 Windsurf IDE 就部署
$deployAG = Read-Host "是否使用 Antigravity IDE (Windsurf)? [Y/n]"
if ($deployAG -ne 'n') {
    New-Item -ItemType Directory -Path ".agent\rules" -Force
    Copy-Item "docs\專案部屬必讀\config-templates\antigravity\agent-identity.md.template" ".agent\rules\agent-identity.md"
    Write-Host "[OK] Antigravity config deployed" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Antigravity config skipped" -ForegroundColor Yellow
}
```

#### 4.4 Rovo Dev CLI（選用 — 僅在已安裝且使用 Atlassian 時部署）

```powershell
# 檢查是否安裝
if (Get-Command rovo-dev -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Rovo Dev CLI detected - deploying config" -ForegroundColor Green
    New-Item -ItemType Directory -Path ".rovodev" -Force
    Copy-Item "docs\專案部屬必讀\config-templates\rovodev\config.yml.template" ".rovodev\config.yml"
    Write-Host "     Remember: Edit .rovodev/config.yml to set project name" -ForegroundColor Cyan
} else {
    Write-Host "[SKIP] Rovo Dev CLI not installed - skipping config" -ForegroundColor Yellow
    Write-Host "       Install: npm install -g @atlassian/rovo-dev" -ForegroundColor DarkGray
}
```

#### 4.5 自動化腳本（必要 — 所有專案都部署）

```powershell
New-Item -ItemType Directory -Path "scripts" -Force
Copy-Item "docs\專案部屬必讀\scripts\*" "scripts\" -Recurse
```

#### 4.6 Context Memory DB（建議 — 跨對話知識累積）

> Context Memory DB 讓 AI Agent 能跨對話累積知識：除錯教訓、架構決策、Code Review 發現。
> 每次新對話不再從零開始，而是先查詢已知模式再行動。

```powershell
# 方式一：一鍵部署（推薦）
powershell -ExecutionPolicy Bypass -File docs\專案部屬必讀\scripts\deploy-context-db.ps1

# 方式二：手動部署
# 1. 複製 MCP Server
New-Item -ItemType Directory -Path ".context-db/scripts" -Force
Copy-Item "docs\專案部屬必讀\config-templates\context-db\server.js" ".context-db\server.js"
Copy-Item "docs\專案部屬必讀\config-templates\context-db\scripts\init-db.js" ".context-db\scripts\init-db.js"

# 2. 建立 package.json（替換專案名）
$pkg = Get-Content "docs\專案部屬必讀\config-templates\context-db\package.json.template" -Raw
$pkg = $pkg -replace '\{\{PROJECT_NAME\}\}', 'my-project'
Set-Content ".context-db\package.json" -Value $pkg -Encoding UTF8

# 3. 安裝依賴 + 初始化 DB
cd .context-db && npm install && node scripts/init-db.js && cd ..

# 4. 註冊 MCP Server
$mcp = Get-Content "docs\專案部屬必讀\config-templates\context-db\mcp.json.template" -Raw
$mcp = $mcp -replace '\{\{PROJECT_NAME\}\}', 'my-project'
Set-Content ".mcp.json" -Value $mcp -Encoding UTF8
```

> **MEMORY.md 精簡原則**（TD-36 教訓）：
> Auto-memory 目錄下的檔案每次新對話全量載入，佔用 context window。
> 詳細規則和事故記錄應存入 Context Memory DB 按需查詢，MEMORY.md 僅保留一行摘要指引。
> 範本：`config-templates/claude/MEMORY.md.template`（~350 tokens，對比未精簡前 ~5.9k tokens）

### Step 5: 修改專案特定配置

以下檔案需要根據新專案修改：

| 檔案 | 需修改內容 | 必要/選用 |
|------|-----------|----------|
| `CLAUDE.md` | 從 `CLAUDE.md.template` 複製後，填入：專案名稱、Skill 索引、Test Accounts、核心禁止事項、Canonical Source | 必要 |
| `GEMINI.md` | 全域 `~/.gemini/GEMINI.md`，通常不需修改 | 選用 |
| `.claudeignore` | 根據專案添加額外排除項 | 必要 |
| `.rovodev/config.yml` | 修改 `name` 為專案名稱 | 選用 |

### Step 6: 讓 Claude Code 執行部署手冊

```
請讀取 docs/專案部屬必讀/開發前環境部署_v3.0.0.md 並執行環境部署
```

> Claude Code 會自動：
> - 執行 PART 0 入口診斷（判斷綠地/棕地/銜接模式）
> - **偵測已安裝的 CLI 引擎**，僅檢查已安裝引擎的配置完整性
> - 未安裝的引擎標記為 `N/A`，不會報錯
> - 根據模式執行對應流程
> - 建立專案特定的 Skills

---

## 環境配置矩陣

> 根據你的開發環境組合，選擇需要部署的配置：

| 環境組合 | Claude Code | Gemini CLI | Antigravity | Rovo Dev | 適合場景 |
|----------|:-----------:|:----------:|:-----------:|:--------:|----------|
| **最小配置** | **必要** | — | — | — | 個人開發、只用 VS Code |
| **雙引擎** | **必要** | **選用** | — | — | 規劃 + 開發分工 |
| **三引擎** | **必要** | **選用** | **選用** | — | 含 E2E 測試、IDE 整合 |
| **完整配置** | **必要** | **選用** | **選用** | **選用** | 含 Atlassian 整合 |

> **最小配置說明**：即使只安裝 Claude Code，所有 BMAD Workflow（create-story、dev-story、code-review）都能正常運作。其他引擎是為了**分擔工作量**和**特定功能**（如 Gemini 的 1M 上下文、Antigravity 的瀏覽器自動化）。

---

## 新增 CLI 引擎時

當專案需要接入第五個（或更多）AI 引擎時，請參考：

**`agent-cli-guides/README.md`** 中的「新引擎接入 SOP（5 步驟）」

流程概要：
1. 整理新引擎的入門指南到 `agent-cli-guides/`
2. 在 `config-templates/` 建立新引擎的配置範本
3. 在部署手冊 PART 2 註冊 Agent ID
4. 設定交接協議（共享 sprint-status.yaml + tracking files）
5. 驗證跨引擎交接

---

## 哪些直接複製、哪些需修改？

| 類型 | 檔案 | 處理方式 | 引擎 |
|------|------|---------|------|
| 直接複製 | `bmad-overlay/*` | 覆蓋 `_bmad/bmm/workflows/4-implementation/` | 通用 |
| 直接複製 | `rules/*.md` (含 context-memory-db.md) | 複製到 `.claude/rules/` | Claude |
| 直接複製 | `claudeignore.template` | 複製為 `.claudeignore` | Claude |
| 直接複製 | `settings.json.template` | 複製為 `.claude/settings.json` | Claude |
| 直接複製 | `settings.local.json.template` | 複製為 `.claude/settings.local.json` | Claude |
| 直接複製 | `CLAUDE.local.md.template` | 複製為 `CLAUDE.local.md` | Claude |
| 直接複製 | `scripts/*.ps1` | 複製到 `scripts/` | 通用 |
| 直接複製 | `agent-identity.md.template` | 複製到 `.agent/rules/` | Antigravity |
| 直接複製 | `gemini/settings.json.template` | 複製到 `.gemini/settings.json` | Gemini |
| **需修改** | `CLAUDE.md.template` | 填入專案名、Skills、Test Accounts | Claude |
| **需修改** | `config.yml.template` | 填入專案名稱 | Rovo Dev |
| 一鍵部署 | `context-db/*` | `deploy-context-db.ps1` 自動部署至 `.context-db/` | 通用 |
| 直接複製 | `MEMORY.md.template` | 複製到 auto-memory 目錄（精簡版） | Claude |
| **不複製** | 專案特定 Skills (`pcpt-*`) | 每個專案自行建立 | — |

---

## TRS 優化成果摘要

此範本包含了 TRS (Token Reduction Strategy) Epic 的所有成果：

### 核心優化（TRS-0 ~ TRS-34）

| 優化項目 | 效果 |
|----------|------|
| Session 固定開銷 | -86%（15,440 → 2,150 tokens/session） |
| code-review instructions.xml | -49%（923 → 471 行） |
| code-review checklist.md | -55%（129 → 59 行） |
| create-story checklist.md | -83%（358 → 62 行） |
| dev-story instructions.xml | -15%（480 → 436 行） |
| 語言選擇規則 | AI 消費用英文、人類閱讀用繁中 |
| Prompt Cache 保護 | CLAUDE.md 無動態狀態、無時間戳 |
| 技術債側車模式 | CR 延後項目留原 Epic，不路由至 TD |
| 技術債中央登錄 (TRS-34) | registry.yaml 為唯一真實來源，三分類 + Push/Pull/Audit |

### 進階優化（TRS-35 ~ TRS-38，2026-03-01 新增）

| 優化項目 | 效果 | Story |
|----------|------|-------|
| Sprint Status 行格式縮短 | 每行 120→40 字元（-67%），全檔 6,600→3,700 tokens（-44%） | TRS-35 |
| Registry 死數據歸檔 | registry.yaml 980→174 行（-82%），消除最大 token 單點黑洞 | TRS-37 (P0) |
| Registry 單次讀取 | CR 讀取 3次→1次，每次 CR 減少 ~1,148 行無效讀取 | TRS-38 |
| 已完成 Epic 歸檔 | 49 entries 移至 sprint-status-archive.yaml，主檔 244→180 行 | TRS-35 |

> **已評估但取消的 Story**：TRS-36（三層索引架構 — Grep 已可達成）、TRS-39（Skill 合併審查 — 完整 SKILL.md 載入是品質基礎）、TRS-40（R2 增量審查 — 缺乏事故數據支撐）

### Claude 智能中控自動化排程（2026-03-01 ~ 03-02 新增）

| 優化項目 | 效果 |
|----------|------|
| Pipeline 中控調度 | 主視窗 Claude 作為排程器，分批啟動 Story pipeline |
| 三階段獨立視窗 | create(Opus)→dev(Sonnet)→review(Opus)，每階段全新 Claude 會話 |
| Token 90% 安全閥 | 4 層防護（Pre-batch / Pre-story / Phase Gate / 事後偵測），達閾值自動停止 |
| `--append-system-prompt` 強制指令 | 解決 `-p` 模式偶爾跳過 metadata 更新的問題 |
| batch-audit.ps1 事後驗證 | 7 Check + AutoFix，三層防護預期失敗率從 15-20% 降至 < 1% |
| Phase 間隔防 Ban | Story 間隔 12s + Phase 間隔 12s，模擬手動操作節奏 |

> 詳細說明：`Claude智能中控自動化排程/pipeline-audit-token-safety.md`

### Context Memory DB 策略（TD-32~36，2026-03-07 新增）

> **核心理念**：靜態檔案（MEMORY.md、rules/）每次新對話全量載入佔用 context window；
> 詳細知識改存 SQLite DB 按需查詢，靜態檔案僅保留一行摘要指引。

| 優化項目 | 效果 | Story |
|----------|------|-------|
| SQLite Schema + FTS5 trigram | 3 張表 + 自動同步 Trigger + WAL 模式 | TD-32a |
| MCP Server 6 Tools | search_context / search_tech / add_context / add_tech / add_cr_issue / trace_context | TD-32b/c |
| 搜尋準確度驗證 | 20 案例測試 + 種子資料 + sync-from-yaml | TD-32d |
| Roslyn AST Symbol 提取 | symbol_index (class/method/interface/enum) + symbol_dependencies | TD-33 |
| Symbol Embedding + 語意搜尋 | OpenAI text-embedding-3-small + Cosine Similarity + semantic_search Tool | TD-34 |
| Hook 動態注入 | UserPromptSubmit 自動注入相關程式碼上下文 (< 10K tokens) | TD-35 |
| **靜態 Memory 遷移** | **MEMORY.md 94% 減量 (8.8KB→723B)，pipeline-lessons.md 刪除，11 條記錄遷入 DB** | **TD-36** |
| 意識層注入 | `.claude/rules/context-memory-db.md` — 查詢優先 + 寫入紀律（~200 tokens） | TD-36 |

**四層架構**：

```
知識記憶層（TD-32）: context_entries / tech_entries
  └── FTS5 全文搜尋（search_context, search_tech）

程式碼語意層（TD-33）: symbol_index / symbol_dependencies
  └── LIKE 關鍵字搜尋（search_symbols, get_symbol_context）

向量語意層（TD-34）: symbol_embeddings
  └── Cosine Similarity 語意搜尋（semantic_search）

動態注入層（TD-35）: UserPromptSubmit Hook
  └── 自動注入（pre-prompt-rag.js → additionalContext）
```

**部署層級**（依專案需求選擇）：

| 層級 | 內容 | 依賴 | 部署腳本 |
|------|------|------|----------|
| **L0 基礎（建議全部署）** | SQLite + MCP Server + Rules | Node.js 18+ | `deploy-context-db.ps1` |
| L1 Code RAG | Roslyn AST 提取 | .NET SDK 8+ | 手動（需 symbol-indexer 專案） |
| L2 語意搜尋 | OpenAI Embedding | OPENAI_API_KEY | `generate-embeddings.js --full` |
| L3 自動注入 | UserPromptSubmit Hook | L2 | 複製 `pre-prompt-rag.js` + 配置 settings.json |

> 詳細說明：`context-memory-db-strategy.md`

### Epic CMI：Context Memory 進階優化（CMI-1~6，2026-03-07 新增）

> **核心理念**：從「手動寫入」升級為「自動生命週期記錄 + 全量文檔 ETL + 對話級記憶 + 時區正規化 + 壓縮恢復防護」。

| 優化項目 | 效果 | Story |
|----------|------|-------|
| Session 生命週期自動記錄 | Stop/SessionEnd/PreCompact Hook → 每次對話自動存檔，不再遺忘 | CMI-1 |
| 全量文檔 ETL | 136 Story + 50 CR + 29 ADR 匯入 DB，三層分類 + 5 張表 | CMI-2 |
| 對話級記憶 Schema | conversation_sessions + turns + 3 MCP Tool（list/get/search） | CMI-3 |
| 時間戳 UTC+8 修正 | timezone.js 共用工具、19,727 筆歷史記錄批次修正 | CMI-4 |
| 壓縮恢復防護 | Rules 硬注入 + 記憶庫 lesson + 三重防護矩陣 | CMI-5 |
| Session 品質強化 | Regex 內容擷取 + 提問歷史注入 + Story ID 修正 | CMI-6 |

> 詳細策略文件：`context-memory-db-strategy.md` §5

### G類：SDD+ATDD+TDD 開發方法論優化（FLOW-OPT-001，2026-03-08 新增）

> **核心理念**：BDD 降級為需求溝通輔助，改用 SDD（Spec Driven）+ ATDD + TDD 閉環，
> 減少 Agent 架構漂移、降低 Debug Token 消耗。

| 優化項目 | 效果 | 影響檔案 |
|----------|------|----------|
| BDD 降級 | 開發迴圈完全移除 BDD，消除語意自由度導致的架構漂移 | CLAUDE.md Triggers |
| SDD Spec Generator | M/L/XL Story 自動產出 `{id}-spec.md`（BR + API + DB + Boundary） | `.claude/skills/sdd-spec-generator/` |
| AC ATDD 格式 | 每個 AC 附 `[Verifies: BR-XXX]`，100% 可追溯 | create-story template + checklist |
| SDD-TDD Bridge | 從 Spec BR 直接驅動 TDD（命名規則 `{BR_ID}_{Scenario}_{Expected}`） | dev-story checklist |
| VSDD Simplified | code-review 增加 Spec vs Code 比對（M/L/XL Only） | code-review checklist |
| 3-Round Debug Limit | 測試修復 ≤ 3 輪，超過強制上下文壓縮 | dev-story checklist |
| 自動觸發 spec-gen | CLAUDE.md Triggers 自動判斷複雜度並觸發 `/sdd-spec-generator` | CLAUDE.md §1.3 |

**預估 Token 降幅**：在現有 76.5% 基礎上再降 20%~35%（需實際 Story 驗證）

> 詳細決策紀錄：`ATDD-SDD-TDD-BDD/決策總覽-SDD-ATDD-TDD整合方案.md`
> Spec 輸出目錄：`docs/implementation-artifacts/specs/epic-{X}/`

### Epic WFQ: Workflow Quality — Pipeline 配額管理 + Token 追蹤（2026-04-04 新增）

> **核心理念**：Pipeline 子視窗因 token 配額耗盡靜默卡死 → 需要偵測、防護、恢復、預測四層機制。
> 禁止 Opus→Sonnet 自動降級（Model Purity Rule）— 會嚴重汙染 code-review 品質。

| 優化項目 | 效果 | Story |
|----------|------|-------|
| BMAD Workflow 定義補強 | 4 個 GAP 修復（upsert-story.js 顯式呼叫、Skill Sync Gate 命名、useState vs Zustand 檢查、skills_list.md 引用） | wfq-01 |
| Phase Target Map 集中化 | `pipeline-config.json` 取代 6 處 inline 重複定義（JS+PS1 共讀一份） | wfq-02 |
| DB Schema + MCP Tool 補全 | `workflow_executions` +4 欄位（cache_read/creation_tokens, cost_usd, model）；`log_workflow` MCP +4 參數 | wfq-05 |
| -p 模式 Truth Table | Claude Code v2.1.92 實測：-p 模式（無 --bare）= 互動模式 context（唯一限制：/slash-command 不可用）；17 Feature × 3 Mode 驗證矩陣 | wfq-06 |
| Pipeline Heartbeat (L5) | Stop hook 寫入 heartbeat timestamp；watchdog 8 分鐘無更新 → 判定卡死 | wfq-03 |
| Pipeline 429/Model Purity (L6) | 每 30 秒掃描 stderr；偵測 429 → QUOTA_EXHAUSTED；偵測模型降級 → MODEL_DEGRADED → 立即 kill | wfq-03 |
| Phase Timeout 分級 | 依 phase × complexity 差異化 timeout（S: 15-20min, M: 25-35min, L: 35-50min） | wfq-03 |
| Recovery Script + SOP | `pipeline-recovery.js`：新 Session 掃描非 done Story + debug log 分析 → 恢復建議 | wfq-03 |
| Token 追蹤（OTel） | `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_METRICS_EXPORTER=console` → `pipeline-log-tokens.js` 擷取真實 token | wfq-04 |
| Quota 預測 | `pipeline-quota-check.js` 基於 benchmark 基線 → GO/WARN/BLOCK 決策 | wfq-04 |
| ModelPricing 配置 | `pipeline-config.json` 含 Haiku/Sonnet/Opus/FastOpus 四級定價（$/MTok） | wfq-05 |

**新增檔案清單**：

| 檔案 | 用途 |
|------|------|
| `.claude/hooks/pipeline-heartbeat.js` | Stop hook heartbeat（三引擎同步） |
| `scripts/pipeline-config.json` | 集中化配置（phaseTargetStatus + modelPricing + quota + phaseTimeouts + model_purity） |
| `scripts/pipeline-recovery.js` | 新 Session 恢復腳本（掃描 + 診斷 + 建議） |
| `scripts/pipeline-log-tokens.js` | OTel token 擷取 + DB 寫入 |
| `scripts/pipeline-quota-check.js` | 配額預測 GO/WARN/BLOCK |
| `docs/implementation-artifacts/specs/pipeline-recovery-sop.md` | 恢復 SOP 文件 |
| `docs/implementation-artifacts/specs/wfq-06-pipeline-mode-truth-table.md` | -p 模式能力 Truth Table |

**真實數據來源**（非猜測）：

| 數據 | 來源 | 可靠度 |
|------|------|:------:|
| per-request token (4 欄位) | OTel `claude_code.token.usage` | ✅ 真實 |
| 429 rate_limit_error | Debug log `~/.claude/debug/{session-id}.txt` | ✅ 真實 |
| Plan type / Rate limit tier | `.credentials.json` subscriptionType + rateLimitTier | ✅ 真實 |
| Extra usage 狀態 | `.claude.json` cachedExtraUsageDisabledReason | ✅ 快取 |
| Current Session / All Models 剩餘% | 伺服器端，無法程式化取得 | ❌ |

> **claw-code 參考**：TokenUsage 四欄位（input/output/cache_create/cache_read）+ ModelPricing + UsageTracker 累積器。
> 來源：`claude token減量策略研究分析/工作流/claw-code-main/rust/crates/runtime/src/usage.rs`

---

### TD-15~19 資料庫/Skill 維護（2026-03-03 新增）

| 優化項目 | 效果 | Story |
|----------|------|-------|
| DeviceSession 影子 FK 清理 | 消除冗餘 ApplicationUserId 外鍵，Migration 安全遷移 | TD-15 |
| Invoice/Order FK 屬性修復 | 雙向 [ForeignKey] 衝突解決 | TD-16 |
| Workflow Migration 同步 | 資料庫 Migration 同步機制補強 | TD-17 |
| create-story DB 變更偵測 | 自動偵測 Schema 變更並標注影響範圍 | TD-18 |
| Skill 超限瘦身 | 6 個 > 500 行 Skill 重構精簡 | TD-19 |

---

## 搭配 DevConsole Web UI 查看記憶庫資料

> **適用場景**：想要以視覺化介面瀏覽/搜尋記憶庫內容，而非透過 Claude CLI MCP Tools 查詢。

### 啟動方式

```powershell
# 方式一：手動 BAT 檔（推薦）
# 啟動：雙擊執行
claude token減量策略研究分析\記憶庫策略\手動開關Server\1.DevConsole啟動.bat

# 關閉：雙擊執行
claude token減量策略研究分析\記憶庫策略\手動開關Server\2.DevConsole關閉.bat

# 方式二：命令列
cd tools/dev-console && npm run dev
```

### 存取位址

- 前端 UI：`http://localhost:5174`
- 後端 API：`http://localhost:3001`

### 功能總覽

| 頁面 | 說明 |
|------|------|
| Dashboard | Story 狀態分佈 KPI + 最近活動 |
| Stories | Kanban 看板 + Epic 篩選 + Story 詳情（Markdown 渲染） |
| Memory | 記憶庫搜尋/瀏覽 + 分類篩選 + 手動 CRUD |
| Sessions | Session 工作紀錄時間軸 |
| CR Issues | Code Review 問題追蹤 + Severity/Resolution 統計 |

### 語言切換

- 預設繁體中文，Header 右上角按鈕切換英文
- 設定儲存於瀏覽器 `localStorage`（key: `dvc-lang`）

### 注意事項

- DevConsole 為**唯讀查看工具**，不會修改記憶庫或 YAML 檔案的核心資料
- 手動 CRUD（Memory 頁面）會直接寫入 SQLite，使用時請注意資料正確性
- 需先確認 `.context-db/context-memory.db` 存在（即已完成 Context Memory DB 部署）

---

## 注意事項

1. **BMAD 版本升級時**：重新執行 `npx bmad-method install` 後，**必須再次執行 Step 3 覆蓋 overlay**，否則 TRS 優化會被原廠版覆蓋
2. **新專案 vs 舊專案安裝指令不同**：新專案用 `npx bmad-method install`（stable）；舊專案維護用 `npx bmad-method@alpha install`。詳見 `BMAD架構演進與優化策略.md` §4
3. **最新 BMAD v6.0.3 結構變更**：Agent 格式改為 `.agent.yaml`、BMB/CIS 模組已移除。新專案安裝後的目錄結構與舊版不同，overlay 套用前務必 diff 確認相容性
4. **Skills 是專案特定的**：`constitutional-standard`、`skill-builder` 等通用 Skill 可跨專案使用，但業務 Skills 需要每個專案自行建立
5. **腳本為 PowerShell 格式**：macOS/Linux 環境需改寫為 bash
6. **Gemini Hooks 需要 Node.js 腳本**：`secret-guard.js` 和 `git-safety.js` 需另外建立於 `.gemini/hooks/`
7. **只安裝 Claude Code 也能正常工作**：其他引擎配置會被自動跳過，不影響 BMAD Workflow 執行
8. **Pipeline 自動化腳本需配合 Claude Max 方案**：`story-pipeline-interactive.ps1` 使用互動模式（完整 MCP/Hooks/Skills），`story-pipeline.ps1` 使用 `-p` 模式。兩者均需 `--dangerously-skip-permissions`，僅適用於可信環境
9. **Token 配額管理（Epic WFQ 新增）**：Pipeline 配額無法程式化查詢（伺服器端），改用 OTel 累計消耗 + 429 頻率 + benchmark 基線做間接預測。`pipeline-quota-check.js` 提供 GO/WARN/BLOCK 決策
10. **Pipeline 批次並行上限 3 個**：動態排程模式（Epic FIX6 驗證），slot 空出即補位。Phase 間隔 12s 防 rate-limit
11. **禁止自動模型降級（Model Purity Rule）**：Claude Code 內建 Opus→Sonnet fallback 會嚴重汙染 code-review 品質。Pipeline Layer 6 偵測到降級立即 kill，DB status 不前進，等配額恢復重跑
12. **-p 模式能力更新（v2.1.92 實測）**：`-p`（不加 `--bare`）支援 Hooks/MCP/Skills（唯一限制：/slash-command 不可用）。`--bare` 將成為未來 `-p` 預設，屆時需顯式載入配置
11. **Context Memory DB 需要 Node.js 18+**：MCP Server 使用 ES Module + better-sqlite3 native addon，需確認 Node.js 版本
12. **Auto-memory 檔案必須精簡**：`~/.claude/projects/<hash>/memory/` 下的檔案每次新對話全量載入。詳細內容存 DB，MEMORY.md 只保留一行摘要（TD-36 教訓）
13. **Context Memory DB 是增量式的**：DB 檔案 `.context-db/context-memory.db` 隨專案累積知識越來越有價值，建議納入備份但不納入 Git（已列入 .gitignore）

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| **2.1.0** | **2026-05-01** | **9 篇深度補全 + 數字校正 + 編碼修復**。新增 9 篇 deep-dive：SANITIZATION-POLICY（脫敏 SSoT 7 類映射）/ skills-deep-dive（74 Skills + 17 Domain + 三層 Sync Gates）/ rules-deep-dive（20 Rules + 5 SUPREME Mandate + 9 Lifecycle Invariants）/ idd-framework（4 層標註 + COM/STR/REG/USR + forbidden_changes）/ hooks-events-deep-dive（14 Hooks + 11 層 RAG + 10 Hook event）/ memory-system-deep-dive（30+ tables schema + 23 MCP tools + 82 scripts + DevConsole + agent-memory + ledger.jsonl）/ mcp-ecosystem（pcpt-context + chrome-devtools + claude-in-chrome + Google MCP + 內部 RAG 6 步）/ bmad-workflows-evolution（create 8 step + 7 Depth Gates / dev 13 step / review 13 step + 三層平行 + SaaS 9 維 + Phase A-D）/ commands-reference（13 + 3 + 10 subagents + 25+ Skill 偽 commands）。修復既有亂碼 4 處（最後更新 / 概念）/ 強化 / 完整需求分析）。Resolution: Plan v3.5 Party Mode 17 BMAD agents 整合 |
| 2.0.0 | 2026-04-04 | **Epic WFQ: Pipeline 配額管理系統**。新增 Pipeline Heartbeat (L5) + 429/Model Purity 偵測 (L6) + Recovery Script/SOP + OTel Token 追蹤 + Quota Prediction (GO/WARN/BLOCK) + Phase Timeout 分級 + ModelPricing 配置 + Model Purity Rule（禁止 Opus→Sonnet 降級）。-p 模式 Truth Table（v2.1.92 實測）。DB Schema 擴展 workflow_executions +4 欄位 + log_workflow MCP +4 參數。BMAD Workflow 定義補強（4 GAP 修復）+ Phase Target Map 集中化。6 Stories, avg CR 93.5, 落地驗證 34/34 通過 |
| 1.9.0 | 2026-04-03 | Epic BU (BMAD v6.2.2 升級 6/6) + Epic ECC (Hook 基礎設施強化 5/5) |
| 1.7.1 | 2026-03-08 | 新增 DevConsole Web UI 使用說明章節；記錄 5 項 Bug 修復（CRLF/Epic ID/路徑/Schema/預設模式）+ i18n 國際化 + SDD Spec 徽章 |
| 1.7.0 | 2026-03-08 | 整合 G類 SDD+ATDD+TDD 方法論（FLOW-OPT-001）+ Epic CMI 記憶庫進階優化（CMI-1~6）；同步 bmad-overlay 5 檔；新增 `sdd-spec-generator` Skill；`context-memory-db-strategy.md` v1.0→v1.1（+CMI 章節）；反向同步 Pipeline 檔案；更新 TRS 成果摘要 |
| 1.6.0 | 2026-03-07 | 整合 Context Memory DB 策略（TD-32~36）；新增 `config-templates/context-db/`（MCP Server + init-db + package.json）；新增 `deploy-context-db.ps1` 一鍵部署腳本；新增 `context-memory-db.md` 規則檔、`MEMORY.md.template` 精簡範本；更新 README 資料夾結構、部署步驟（Step 4.6）、TRS 成果（TD-15~36）；補全 TD-15~19 資料庫/Skill 維護策略 |
| 1.5.0 | 2026-03-02 | 整合 Claude 智能中控自動化排程（Pipeline 中控 + Token 安全閥 + batch-audit）；新增 TRS-35/37/38 優化成果（Sprint Status 縮行、Registry 歸檔/單讀）；新增 Pipeline 腳本至資料夾結構（story-pipeline/batch-runner/batch-audit/epic-auto-pilot）；部署手冊 v3.2.0→v3.3.0（新增 PART 10 Pipeline 自動化排程） |
| 1.4.0 | 2026-02-28 | 部署手冊 v3.1.0→v3.2.0：新增 §4.10 技術債中央登錄協議 + §9.7 檢查清單 + Production Gate registry 驅動；worktree-quick-reference 新增 registry.yaml merge 規則；TRS 成果新增中央登錄（TRS-34） |
| 1.3.0 | 2026-02-27 | 新增 `worktree-quick-reference.md`；部署手冊 v3.0.0→v3.1.0（新增 PART 8.5 Worktree 並行開發 + Merge 衝突 SOP）；更新資料夾結構索引（TRS-33） |
| 1.2.0 | 2026-02-27 | 新增 `BMAD架構演進與優化策略.md`：BMAD v6.0.3 vs 舊版差異分析、Token 量化基準、ECC 功能覆蓋、遷移決策框架、多引擎相容性；更新安裝指令（stable vs alpha）；新增 Step 0 架構策略閱讀指引 |
| 1.1.0 | 2026-02-27 | 補齊 Rovo Dev CLI 配置範本；新增 CLI 安裝說明；條件部署邏輯（偵測已安裝引擎）；環境配置矩陣；新引擎接入指引 |
| 1.0.0 | 2026-02-27 | 初版：整合 TRS 優化 overlay + 配置範本 + 通用腳本 + 使用說明 |
