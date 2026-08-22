<#
.SYNOPSIS
    PhyCool PCPT MVP Development Environment Migration Packaging Script

.DESCRIPTION
    This script collects and packages the following core components:
    1. .claude complete configuration (global settings, Skills, MCP, Hooks, Rules)
    2. .context-db Memory DB architecture (excluding node_modules)
    3. .mcp.json MCP server configuration
    4. AGENTS.md Project specification document
    5. CLAUDE.md Project configuration
    6. party-to-pipeline-portable Pipeline infrastructure
    7. .codegraph Knowledge graph index
    8. .gitnexus GitNexus configuration
    9. .agent configuration
    10. Key architecture documents (extracted from token reduction research folder)
#>

param(
    [string]$OutputPath = "C:\Users\Alan\Desktop\PhyCool-DevEnv-Migration-$(Get-Date -Format 'yyyyMMdd-HHmmss')",
    [switch]$IncludeNodeModules = $false,
    [switch]$VerifyOnly = $false
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\Alan\Desktop\Projects\PhyCool-PCPT-MVP(Antigravity)"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Get-DirectorySize {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0 }
    $size = (Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    return $size
}

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -lt 1KB) { return "$Bytes B" }
    if ($Bytes -lt 1MB) { return "{0:N2} KB" -f ($Bytes/1KB) }
    if ($Bytes -lt 1GB) { return "{0:N2} MB" -f ($Bytes/1MB) }
    return "{0:N2} GB" -f ($Bytes/1GB)
}

# Main components list
$components = @()

# .claude complete configuration
$components += @{
    Name = ".claude (complete configuration)"
    Source = "$root\.claude"
    Destination = "migration\.claude"
    Required = $true
    Exclude = @("*.log", "ipc\*")
    IsFile = $false
}

# .context-db Memory DB architecture
$components += @{
    Name = ".context-db (Memory DB architecture)"
    Source = "$root\.context-db"
    Destination = "migration\.context-db"
    Required = $true
    Exclude = @("node_modules\**")
    IsFile = $false
}

# .mcp.json
$components += @{
    Name = ".mcp.json (MCP configuration)"
    Source = "$root\.mcp.json"
    Destination = "migration\.mcp.json"
    Required = $true
    IsFile = $true
}

# AGENTS.md
$components += @{
    Name = "AGENTS.md (Project specification)"
    Source = "$root\AGENTS.md"
    Destination = "migration\AGENTS.md"
    Required = $true
    IsFile = $true
}

# CLAUDE.md
$components += @{
    Name = "CLAUDE.md (Project configuration)"
    Source = "$root\CLAUDE.md"
    Destination = "migration\CLAUDE.md"
    Required = $true
    IsFile = $true
}

# party-to-pipeline-portable
$components += @{
    Name = "party-to-pipeline-portable (Pipeline infrastructure)"
    Source = "$root\party-to-pipeline-portable"
    Destination = "migration\party-to-pipeline-portable"
    Required = $true
    Exclude = @("*.log")
    IsFile = $false
}

# .codegraph
$components += @{
    Name = ".codegraph (Knowledge graph)"
    Source = "$root\.codegraph"
    Destination = "migration\.codegraph"
    Required = $true
    Exclude = @("*.log")
    IsFile = $false
}

# .gitnexus
$components += @{
    Name = ".gitnexus (GitNexus configuration)"
    Source = "$root\.gitnexus"
    Destination = "migration\.gitnexus"
    Required = $true
    IsFile = $false
}

# .agent
$components += @{
    Name = ".agent (Agent configuration)"
    Source = "$root\.agent"
    Destination = "migration\.agent"
    Required = $true
    IsFile = $false
}

# .claude-flow
$components += @{
    Name = ".claude-flow (Flow configuration)"
    Source = "$root\.claude-flow"
    Destination = "migration\.claude-flow"
    Required = $false
    IsFile = $false
}

# .gemini
$components += @{
    Name = ".gemini (Gemini CLI configuration)"
    Source = "$root\.gemini"
    Destination = "migration\.gemini"
    Required = $false
    IsFile = $false
}

# .rovodev
$components += @{
    Name = ".rovodev (Rovo Dev CLI configuration)"
    Source = "$root\.rovodev"
    Destination = "migration\.rovodev"
    Required = $false
    IsFile = $false
}

# .cursor
$components += @{
    Name = ".cursor (Cursor configuration)"
    Source = "$root\.cursor"
    Destination = "migration\.cursor"
    Required = $false
    IsFile = $false
}

# docs
$components += @{
    Name = "docs (Project documentation)"
    Source = "$root\docs"
    Destination = "migration\docs"
    Required = $true
    Exclude = @("**\node_modules\**", "**\bin\**", "**\obj\**")
    IsFile = $false
}

# scripts
$components += @{
    Name = "scripts (Automation scripts)"
    Source = "$root\scripts"
    Destination = "migration\scripts"
    Required = $true
    IsFile = $false
}

# infra
$components += @{
    Name = "infra (Infrastructure as Code)"
    Source = "$root\infra"
    Destination = "migration\infra"
    Required = $true
    IsFile = $false
}

# _bmad
$components += @{
    Name = "_bmad (BMAD Methodology)"
    Source = "$root\_bmad"
    Destination = "migration\_bmad"
    Required = $true
    IsFile = $false
}

# Extract key architecture documents from token reduction research folder
$tokenResearchRoot = Get-ChildItem $root -Directory | Where-Object {$_.Name -like "*claude*token*"} | Select-Object -First 1
if ($tokenResearchRoot) {
    $keyArchitectureFolders = @(
        "ai-agent-teams",
        "AGENT-communication",
        "Emergence-loops",
        "Architecture-docs",
        "Env-config-optimization-20260516",
        "Agent-workflows",
        "AI-Agent-workflow",
        "chrome-connect"
    )
    
    foreach ($folderName in $keyArchitectureFolders) {
        $found = Get-ChildItem $tokenResearchRoot.FullName -Directory | Where-Object {$_.Name -like "*$folderName*"} | Select-Object -First 1
        if ($found) {
            $components += @{
                Name = "Research: $folderName"
                Source = $found.FullName
                Destination = "migration\architecture-research\$folderName"
                Required = $false
                IsFile = $false
            }
        }
    }
}

# Display components to be packaged
Write-Log "=== PhyCool PCPT MVP Development Environment Migration Packaging ==="
Write-Log "Source: $root"
Write-Log "Output: $OutputPath"
Write-Log ""

$totalSize = 0
foreach ($comp in $components) {
    if (Test-Path $comp.Source) {
        $size = if ($comp.IsFile) { (Get-Item $comp.Source).Length } else { Get-DirectorySize $comp.Source }
        $totalSize += $size
        $status = if ($comp.Required) { "[REQUIRED]" } else { "[OPTIONAL]" }
        Write-Log "  $status | $($comp.Name) | $(Format-Bytes $size)"
    } else {
        $status = if ($comp.Required) { "[MISSING-REQUIRED]" } else { "[MISSING-OPTIONAL]" }
        Write-Log "  $status | $($comp.Name) | NOT FOUND"
    }
}
Write-Log ""
Write-Log "Total estimated size: $(Format-Bytes $totalSize)"

if ($VerifyOnly) {
    Write-Log "Verification mode complete, no files copied" -Level "WARN"
    exit 0
}

# Execute copy
Write-Log "Starting file copy..."
$copiedCount = 0
$failedCount = 0

foreach ($comp in $components) {
    if (-not (Test-Path $comp.Source)) {
        if ($comp.Required) {
            Write-Log "ERROR: Required component missing: $($comp.Name) -> $($comp.Source)" -Level "ERROR"
            $failedCount++
        } else {
            Write-Log "WARNING: Optional component missing, skipping: $($comp.Name)" -Level "WARN"
        }
        continue
    }

    $destPath = Join-Path $OutputPath $comp.Destination
    $destDir = if ($comp.IsFile) { Split-Path $destPath -Parent } else { $destPath }
    
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    try {
        if ($comp.IsFile) {
            Copy-Item $comp.Source $destPath -Force -ErrorAction Stop
        } else {
            $excludePatterns = @()
            if ($comp.Exclude) {
                $excludePatterns = $comp.Exclude
            }
            if ($excludePatterns.Count -gt 0) {
                Copy-Item $comp.Source $destPath -Recurse -Force -Exclude $excludePatterns -ErrorAction Stop
            } else {
                Copy-Item $comp.Source $destPath -Recurse -Force -ErrorAction Stop
            }
        }
        Write-Log "SUCCESS: Copied $($comp.Name)"
        $copiedCount++
    }
    catch {
        Write-Log "FAILED: Copy $($comp.Name) - $($_.Exception.Message)" -Level "ERROR"
        $failedCount++
    }
}

# Generate migration README
$readmePath = Join-Path $OutputPath "MIGRATION-README.md"
$readmeContent = @"
# PhyCool PCPT MVP Development Environment Migration Package

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Source: $root
Target: $OutputPath

## Included Components

### Core Configuration (Required)
| Component | Description |
|-----------|-------------|
| .claude/ | Complete Claude Code config (Settings, Skills, Hooks, Rules, MCP) |
| .context-db/ | Memory DB architecture (SQLite + Schema + Symbol Indexer) |
| .mcp.json | MCP Server configuration |
| AGENTS.md | Project AI Agent specification (v5.1) |
| CLAUDE.md | Project-level Claude Code configuration |
| party-to-pipeline-portable/ | Multi-track parallel pipeline infrastructure |

### Knowledge Graph & Retrieval
| Component | Description |
|-----------|-------------|
| .codegraph/ | CodeGraph knowledge graph (codegraph.db) |
| .gitnexus/ | GitNexus configuration |

### Development Tool Configuration
| Component | Description |
|-----------|-------------|
| .agent/ | Agent configuration (Hooks, Rules, Skills, Workflows) |
| .claude-flow/ | Flow configuration |
| .gemini/ | Gemini CLI configuration |
| .rovodev/ | Rovo Dev CLI configuration |
| .cursor/ | Cursor configuration |

### Project Documentation & Code
| Component | Description |
|-----------|-------------|
| docs/ | Project planning, specs, tracking, technical decisions |
| scripts/ | PowerShell automation scripts (hygiene, deploy, sync) |
| infra/ | Azure Bicep/ARM Infrastructure as Code |
| _bmad/ | BMAD Method v6 core modules |

### Key Architecture Research Documents
Extracted from token reduction strategy research:
- AI Agent Teams Architecture Guide
- Agent Communication Channel Mechanism
- Emergence Loops / Bidirectional Handshake Protocol
- Environment Configuration Optimization Recommendations
- Chrome MCP Connection SOP

## New Computer Deployment Steps

### 1. Prerequisites
- Windows 11 Pro
- .NET 8 SDK
- Node.js 20+ (with npm/pnpm)
- PowerShell 7+
- Git
- Docker Desktop (optional, for container testing)
- VS Code / Visual Studio 2026 / Antigravity IDE

### 2. Restore Configuration
```powershell
# 1. Extract to target project root
# Example: D:\Projects\PhyCool-PCPT-MVP

# 2. Restore .claude config (includes Skills, Hooks, MCP)
# Already included in migration package, just overwrite

# 3. Install .context-db dependencies
cd D:\Projects\PhyCool-PCPT-MVP\.context-db
npm install
# or
pnpm install

# 4. Build Symbol Indexer
cd D:\Projects\PhyCool-PCPT-MVP\.context-db\symbol-indexer
dotnet build -c Release

# 5. Initialize CodeGraph
cd D:\Projects\PhyCool-PCPT-MVP
npx codegraph init -i

# 6. Initialize GitNexus
npx gitnexus analyze

# 7. Verify MCP connections
claude mcp list
```

### 3. Environment Variables
Set these on the new machine:
- PHYCOOL_CONNECTION_STRING - SQL Server connection string
- AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET - Azure auth
- OPENAI_API_KEY / ANTHROPIC_API_KEY - LLM API Keys
- ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV - ECPay payment
- SENDGRID_API_KEY - Email service

### 4. Database Migration
```powershell
cd D:\Projects\PhyCool-PCPT-MVP\src\PhyCool.Platform\PhyCool.Web
dotnet ef database update
```

### 5. Start Development Servers
```powershell
# Using project script
.\scripts\start-servers.ps1 -All

# Or manually
# Backend: dotnet run --project src/PhyCool.Platform/PhyCool.Web
# Frontend: cd src/PhyCool.Platform/PhyCool.Web/ClientApp && npm run dev
"

## Important Notes

1. **Secrets**: This package does NOT include .env, .env.local, Azure Key Vault secrets, database connection strings - configure manually
2. **Git History**: Full git history requires separate repository clone
3. **node_modules**: Excluded, run `npm install` / `pnpm install` in new environment
4. **Path Differences**: If project path differs, update absolute paths in `.claude/settings.json`
5. **MCP Servers**: Some local MCP servers (e.g., Chrome DevTools) need reinstallation/configuration

## Verification Checklist

After deployment verify:
- [ ] `claude --version` works
- [ ] `claude mcp list` shows all MCP servers
- [ ] `npx codegraph status` shows healthy index
- [ ] `npx gitnexus status` shows index status
- [ ] `.context-db` starts without errors (`npm run dev`)
- [ ] Backend builds successfully (`dotnet build`)
- [ ] Frontend builds successfully (`npm run build`)
- [ ] Test accounts can login (A1~A5@gmail.com)
- [ ] Party-to-pipeline sub-windows launch correctly

## Support

Reference:
- `docs/專案部屬必讀/開發前環境部署_v3.0.0.md`
- `AGENTS.md` Section 18 Four-Engine SOP
- `.claude/skills/` individual skill documentation

---
Generated by Migrate-DevEnvironment.ps1
"@

Set-Content -Path $readmePath -Value $readmeContent -Encoding UTF8
Write-Log "Generated migration README: $readmePath"

# Generate manifest with checksums
$manifestPath = Join-Path $OutputPath "MANIFEST.txt"
$manifest = @()
$manifest += "PhyCool PCPT MVP Migration Manifest"
$manifest += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$manifest += "Source: $root"
$manifest += ""
$manifest += "Files:"

Get-ChildItem $OutputPath -Recurse -File | ForEach-Object {
    $hash = Get-FileHash $_.FullName -Algorithm SHA256
    $relPath = $_.FullName.Replace($OutputPath + "\", "")
    $manifest += "$($hash.Hash)  $relPath"
}

Set-Content -Path $manifestPath -Value ($manifest -join "`n") -Encoding UTF8
Write-Log "Generated manifest: $manifestPath"

# Summary
Write-Log ""
Write-Log "=== Migration Package Complete ==="
Write-Log "Output directory: $OutputPath"
Write-Log "Successfully copied: $copiedCount components"
Write-Log "Failed: $failedCount components"
Write-Log "Total size: $(Format-Bytes (Get-DirectorySize $OutputPath))"
Write-Log ""
Write-Log "Next steps:"
Write-Log "  1. Copy $OutputPath to new computer"
Write-Log "  2. Follow MIGRATION-README.md for deployment"
Write-Log "  3. Configure environment variables and secrets"
Write-Log "  4. Run verification checklist"

if ($failedCount -gt 0) {
    exit 1
}