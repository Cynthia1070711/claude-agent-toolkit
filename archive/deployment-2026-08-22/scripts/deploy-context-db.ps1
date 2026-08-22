# ============================================================
# Context Memory DB 一鍵部署腳本
# 部署 SQLite + MCP Server + Rules + MEMORY.md 範本
# ============================================================
# 使用方式:
#   cd <新專案根目錄>
#   powershell -ExecutionPolicy Bypass -File <path-to>/deploy-context-db.ps1
# ============================================================

param(
    [string]$ProjectName = (Split-Path -Leaf (Get-Location)),
    [switch]$SkipNpmInstall,
    [switch]$SkipHook
)

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent $PSScriptRoot  # 指向「專案部屬必讀」目錄
$TemplateDir = Join-Path $DeployRoot "config-templates"
$ContextDbTemplate = Join-Path $TemplateDir "context-db"

Write-Host "=== Context Memory DB 部署 ===" -ForegroundColor Cyan
Write-Host "專案名稱: $ProjectName"
Write-Host "專案路徑: $(Get-Location)"
Write-Host ""

# ── Step 1: 建立 .context-db 目錄 ──
Write-Host "[1/6] 建立 .context-db/ 目錄結構..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".context-db/scripts" -Force | Out-Null

# ── Step 2: 複製 MCP Server + init-db ──
Write-Host "[2/6] 複製 MCP Server + Schema 初始化腳本..." -ForegroundColor Yellow
Copy-Item (Join-Path $ContextDbTemplate "server.js") ".context-db/server.js" -Force
Copy-Item (Join-Path $ContextDbTemplate "scripts/init-db.js") ".context-db/scripts/init-db.js" -Force

# 處理 package.json（替換專案名稱）
$pkgContent = Get-Content (Join-Path $ContextDbTemplate "package.json.template") -Raw
$pkgContent = $pkgContent -replace '\{\{PROJECT_NAME\}\}', $ProjectName.ToLower()
Set-Content ".context-db/package.json" -Value $pkgContent -Encoding UTF8

# ── Step 3: npm install ──
if (-not $SkipNpmInstall) {
    Write-Host "[3/6] 安裝 MCP Server 依賴 (npm install)..." -ForegroundColor Yellow
    Push-Location ".context-db"
    npm install --omit=dev 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARN] npm install 失敗，請手動執行: cd .context-db && npm install" -ForegroundColor Red
    } else {
        Write-Host "  [OK] 依賴安裝完成" -ForegroundColor Green
    }
    Pop-Location
} else {
    Write-Host "[3/6] 跳過 npm install (-SkipNpmInstall)" -ForegroundColor DarkGray
}

# ── Step 4: 初始化 DB ──
Write-Host "[4/6] 初始化 SQLite 資料庫..." -ForegroundColor Yellow
node .context-db/scripts/init-db.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [WARN] DB 初始化失敗" -ForegroundColor Red
} else {
    Write-Host "  [OK] DB 初始化完成" -ForegroundColor Green
}

# ── Step 5: 建立 .mcp.json（若不存在）──
Write-Host "[5/6] 配置 MCP Server 註冊..." -ForegroundColor Yellow
$mcpPath = ".mcp.json"
if (Test-Path $mcpPath) {
    $existing = Get-Content $mcpPath -Raw | ConvertFrom-Json
    if (-not $existing.mcpServers."$ProjectName-context") {
        Write-Host "  [INFO] .mcp.json 已存在但無 context-memory 配置，請手動新增:" -ForegroundColor Cyan
        Write-Host "    ""$ProjectName-context"": { ""type"": ""stdio"", ""command"": ""node"", ""args"": ["".context-db/server.js""] }"
    } else {
        Write-Host "  [OK] MCP 已配置" -ForegroundColor Green
    }
} else {
    $mcpContent = Get-Content (Join-Path $ContextDbTemplate "mcp.json.template") -Raw
    $mcpContent = $mcpContent -replace '\{\{PROJECT_NAME\}\}', $ProjectName.ToLower()
    Set-Content $mcpPath -Value $mcpContent -Encoding UTF8
    Write-Host "  [OK] .mcp.json 已建立" -ForegroundColor Green
}

# ── Step 6: 部署 Rules ──
Write-Host "[6/6] 部署 context-memory-db.md 規則檔..." -ForegroundColor Yellow
$rulesDir = ".claude/rules"
if (Test-Path $rulesDir) {
    $ruleFile = Join-Path $rulesDir "context-memory-db.md"
    if (-not (Test-Path $ruleFile)) {
        Copy-Item (Join-Path $TemplateDir "claude/rules/context-memory-db.md") $ruleFile -Force
        Write-Host "  [OK] 規則檔已部署" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] context-memory-db.md 已存在" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  [SKIP] .claude/rules/ 不存在，請先部署 Claude Code 配置" -ForegroundColor Yellow
}

# ── 完成 ──
Write-Host ""
Write-Host "=== 部署完成 ===" -ForegroundColor Green
Write-Host ""
Write-Host "已部署的組件:" -ForegroundColor Cyan
Write-Host "  .context-db/server.js          MCP Server (6 Tools)"
Write-Host "  .context-db/scripts/init-db.js Schema 初始化"
Write-Host "  .context-db/package.json       依賴定義"
Write-Host "  .context-db/context-memory.db  SQLite DB (WAL)"
Write-Host "  .mcp.json                      MCP 註冊"
Write-Host "  .claude/rules/context-memory-db.md  查詢優先 + 寫入紀律"
Write-Host ""
Write-Host "MCP Tools:" -ForegroundColor Cyan
Write-Host "  search_context  搜尋上下文記憶 (FTS5)"
Write-Host "  search_tech     搜尋技術知識庫 (FTS5)"
Write-Host "  add_context     寫入上下文記憶"
Write-Host "  add_tech        寫入技術發現"
Write-Host "  add_cr_issue    寫入 CR 發現"
Write-Host "  trace_context   追蹤關聯上下文"
Write-Host ""
Write-Host "驗證:" -ForegroundColor Cyan
Write-Host "  claude mcp list    確認 MCP Server 已註冊"
Write-Host "  重啟 Claude Code   讓 MCP Server 自動啟動"
Write-Host ""
Write-Host "[選用] 進階功能（需額外設定）:" -ForegroundColor DarkGray
Write-Host "  Phase 1 (Code RAG):  Roslyn AST Symbol 提取 — 需 .NET SDK + symbol-indexer"
Write-Host "  Phase 2 (Vector):    語意搜尋 — 需 OPENAI_API_KEY + generate-embeddings.js"
Write-Host "  Phase 3 (Hook):      自動注入 — 需 UserPromptSubmit Hook + pre-prompt-rag.js"
