# 專案部署必讀 — 多引擎協作環境一鍵初始化範本

**版本**: 1.6.0
**建立日期**: 2026-02-27
**適用範圍**: BMAD Method v6.0.0-alpha.21 + Claude Code CLI + Gemini CLI + Antigravity IDE + Rovo Dev CLI

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
├── context-memory-db-strategy.md          ← Context Memory DB 策略全文（TD-32~36）
│
├── agent-cli-guides/                      ← 四引擎入門指南
│   ├── README.md                          ← 索引 + 功能比較表 + 新引擎接入 SOP
│   ├── claude-code-guide.md
│   ├── gemini-cli-guide.md
│   ├── antigravity-guide.md
│   └── rovo-dev-guide.md
│
├── bmad-overlay/                          ← TRS 優化後的 BMAD Workflow 覆蓋包
│   └── 4-implementation/
│       ├── code-review/                   ← instructions.xml (471行, 原廠923行, -49%)
│       │   ├── instructions.xml              checklist.md (59行, 原廠129行, -55%)
│       │   ├── checklist.md                  workflow.yaml
│       │   └── workflow.yaml
│       ├── create-story/                  ← instructions.xml (449行, 原廠542行, -20%)
│       │   ├── instructions.xml              checklist.md (62行, 原廠358行, -83%)
│       │   ├── checklist.md                  workflow.yaml
│       │   └── workflow.yaml
│       └── dev-story/                     ← instructions.xml (436行, 原廠480行, -15%)
│           ├── instructions.xml              checklist.md (80行)
│           ├── checklist.md                  workflow.yaml
│           └── workflow.yaml
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
    └── deploy-context-db.ps1            ← [NEW] Context Memory DB 一鍵部署
```

---

## 使用步驟（新專案 / 舊專案）

### Step 0: 閱讀架構演進策略（首次部署建議）

> 首次部署前，建議先閱讀 **`BMAD架構演進與優化策略.md`**，了解：
> - 最新 BMAD v6.0.3 與舊版的結構差異（檔案數 225 vs 652、Agent YAML vs MD）
> - Token 靜態消耗基準數據（MyProject 實測 ~2,607 tokens）
> - 新專案 vs 舊專案的遷移決策樹
> - TRS overlay 與最新版的相容性對照

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

### Step 3: 覆蓋 BMAD Workflow（TRS 優化版）

```powershell
# 將 bmad-overlay 覆蓋到 BMAD 安裝目錄
Copy-Item -Path "docs\專案部屬必讀\bmad-overlay\4-implementation\*" `
          -Destination "_bmad\bmm\workflows\4-implementation\" `
          -Recurse -Force
```

> **為什麼需要這一步？**
> `npx bmad-method@alpha install` 安裝的是原廠版 Workflow。
> TRS Epic 優化了 code-review (-49%)、create-story checklist (-83%)、dev-story (-15%)，
> 這些壓縮版本需要手動覆蓋回去，否則每次執行 Workflow 會多消耗 ~14,200 tokens/Sprint。

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
| **不複製** | 專案特定 Skills (`myproject-*`) | 每個專案自行建立 | — |

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

### TD-15~19 資料庫/Skill 維護（2026-03-03 新增）

| 優化項目 | 效果 | Story |
|----------|------|-------|
| DeviceSession 影子 FK 清理 | 消除冗餘 ApplicationUserId 外鍵，Migration 安全遷移 | TD-15 |
| Invoice/Order FK 屬性修復 | 雙向 [ForeignKey] 衝突解決 | TD-16 |
| Workflow Migration 同步 | 資料庫 Migration 同步機制補強 | TD-17 |
| create-story DB 變更偵測 | 自動偵測 Schema 變更並標注影響範圍 | TD-18 |
| Skill 超限瘦身 | 6 個 > 500 行 Skill 重構精簡 | TD-19 |

---

## 注意事項

1. **BMAD 版本升級時**：重新執行 `npx bmad-method install` 後，**必須再次執行 Step 3 覆蓋 overlay**，否則 TRS 優化會被原廠版覆蓋
2. **新專案 vs 舊專案安裝指令不同**：新專案用 `npx bmad-method install`（stable）；舊專案維護用 `npx bmad-method@alpha install`。詳見 `BMAD架構演進與優化策略.md` §4
3. **最新 BMAD v6.0.3 結構變更**：Agent 格式改為 `.agent.yaml`、BMB/CIS 模組已移除。新專案安裝後的目錄結構與舊版不同，overlay 套用前務必 diff 確認相容性
4. **Skills 是專案特定的**：`constitutional-standard`、`skill-builder` 等通用 Skill 可跨專案使用，但業務 Skills 需要每個專案自行建立
5. **腳本為 PowerShell 格式**：macOS/Linux 環境需改寫為 bash
6. **Gemini Hooks 需要 Node.js 腳本**：`secret-guard.js` 和 `git-safety.js` 需另外建立於 `.gemini/hooks/`
7. **只安裝 Claude Code 也能正常工作**：其他引擎配置會被自動跳過，不影響 BMAD Workflow 執行
8. **Pipeline 自動化腳本需配合 Claude Max 方案**：`story-pipeline.ps1` 使用 `claude -p` 模式 + `--dangerously-skip-permissions`，僅適用於可信環境
9. **Token 安全閥需手動設定日配額**：Claude Max 無公開 API 查詢配額，需設定 `-DailyTokenLimit` 參數（基於方案等級估算）
10. **Pipeline 批次並行上限 5 個**：超過 5 個並行 Story 會導致 rate-limiting，建議 `-IntervalSec 12` 錯開啟動
11. **Context Memory DB 需要 Node.js 18+**：MCP Server 使用 ES Module + better-sqlite3 native addon，需確認 Node.js 版本
12. **Auto-memory 檔案必須精簡**：`~/.claude/projects/<hash>/memory/` 下的檔案每次新對話全量載入。詳細內容存 DB，MEMORY.md 只保留一行摘要（TD-36 教訓）
13. **Context Memory DB 是增量式的**：DB 檔案 `.context-db/context-memory.db` 隨專案累積知識越來越有價值，建議納入備份但不納入 Git（已列入 .gitignore）

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.6.0 | 2026-03-07 | 整合 Context Memory DB 策略（TD-32~36）；新增 `config-templates/context-db/`（MCP Server + init-db + package.json）；新增 `deploy-context-db.ps1` 一鍵部署腳本；新增 `context-memory-db.md` 規則檔、`MEMORY.md.template` 精簡範本；更新 README 資料夾結構、部署步驟（Step 4.6）、TRS 成果（TD-15~36）；補全 TD-15~19 資料庫/Skill 維護策略 |
| 1.5.0 | 2026-03-02 | 整合 Claude 智能中控自動化排程（Pipeline 中控 + Token 安全閥 + batch-audit）；新增 TRS-35/37/38 優化成果（Sprint Status 縮行、Registry 歸檔/單讀）；新增 Pipeline 腳本至資料夾結構（story-pipeline/batch-runner/batch-audit/epic-auto-pilot）；部署手冊 v3.2.0→v3.3.0（新增 PART 10 Pipeline 自動化排程） |
| 1.4.0 | 2026-02-28 | 部署手冊 v3.1.0→v3.2.0：新增 §4.10 技術債中央登錄協議 + §9.7 檢查清單 + Production Gate registry 驅動；worktree-quick-reference 新增 registry.yaml merge 規則；TRS 成果新增中央登錄（TRS-34） |
| 1.3.0 | 2026-02-27 | 新增 `worktree-quick-reference.md`；部署手冊 v3.0.0→v3.1.0（新增 PART 8.5 Worktree 並行開發 + Merge 衝突 SOP）；更新資料夾結構索引（TRS-33） |
| 1.2.0 | 2026-02-27 | 新增 `BMAD架構演進與優化策略.md`：BMAD v6.0.3 vs 舊版差異分析、Token 量化基準、ECC 功能覆蓋、遷移決策框架、多引擎相容性；更新安裝指令（stable vs alpha）；新增 Step 0 架構策略閱讀指引 |
| 1.1.0 | 2026-02-27 | 補齊 Rovo Dev CLI 配置範本；新增 CLI 安裝說明；條件部署邏輯（偵測已安裝引擎）；環境配置矩陣；新引擎接入指引 |
| 1.0.0 | 2026-02-27 | 初版：整合 TRS 優化 overlay + 配置範本 + 通用腳本 + 使用說明 |
