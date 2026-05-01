<#
.SYNOPSIS
    Check file lock status before writing. Used by PreToolUse / BeforeTool hooks.

.DESCRIPTION
    1. Reads .agent-locks.json
    2. Cleans expired locks (TTL exceeded)
    3. Normalizes file path
    4. Checks if target file is locked by another agent
    5. Outputs WARNING if locked (does NOT block — agent decides)

    Supports multiple hook environments:
    - Claude Code: reads CLAUDE_TOOL_INPUT env var
    - Gemini CLI: reads GEMINI_TOOL_INPUT env var
    - Manual: pass -FilePath explicitly

.PARAMETER AgentId
    The calling agent's ID (e.g., CC-OPUS, GC-PRO, AG-SONNET, RD-SONNET)

.PARAMETER FilePath
    The file path to check. If not provided, reads from hook env vars.

.EXAMPLE
    powershell -File scripts/file-lock-check.ps1 -AgentId CC-OPUS -FilePath "src/App.Web/Program.cs"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AgentId,

    [Parameter(Mandatory = $false)]
    [string]$FilePath
)

$ErrorActionPreference = "SilentlyContinue"

# --- Resolve project root (script is in scripts/) ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LockFile = Join-Path $ProjectRoot ".agent-locks.json"

# --- Extract file path from hook input if not provided ---
# Tries multiple hook environments in order: Claude Code → Gemini CLI
if (-not $FilePath) {
    # Claude Code: CLAUDE_TOOL_INPUT contains JSON with file_path
    $toolInput = $env:CLAUDE_TOOL_INPUT
    # Gemini CLI: GEMINI_TOOL_INPUT contains JSON with file_path
    if (-not $toolInput) {
        $toolInput = $env:GEMINI_TOOL_INPUT
    }
    if ($toolInput) {
        try {
            $parsed = $toolInput | ConvertFrom-Json
            if ($parsed.file_path) {
                $FilePath = $parsed.file_path
            } elseif ($parsed.path) {
                $FilePath = $parsed.path
            } elseif ($parsed.destination) {
                $FilePath = $parsed.destination
            }
        } catch {
            # Not JSON or no file_path field — skip
        }
    }
}

if (-not $FilePath) {
    # No file path to check — exit silently (non-file tool calls)
    exit 0
}

# --- Normalize path to project-relative ---
function Get-RelativePath {
    param([string]$FullPath, [string]$BasePath)
    $resolved = [System.IO.Path]::GetFullPath($FullPath)
    $baseResolved = [System.IO.Path]::GetFullPath($BasePath)
    if ($resolved.StartsWith($baseResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $resolved.Substring($baseResolved.Length).TrimStart('\', '/').Replace('\', '/')
    }
    return $FullPath.Replace('\', '/')
}

$RelPath = Get-RelativePath -FullPath $FilePath -BasePath $ProjectRoot

# --- Read lock file ---
if (-not (Test-Path $LockFile)) {
    exit 0
}

try {
    $lockContent = Get-Content $LockFile -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    # Corrupted lock file — skip check
    exit 0
}

if (-not $lockContent.locks -or $lockContent.locks.Count -eq 0) {
    exit 0
}

# --- Clean expired locks (M1: use ArrayList for consistency with acquire) ---
$now = [DateTimeOffset]::Now
$activeLocks = [System.Collections.ArrayList]@()
$cleaned = $false

foreach ($lock in $lockContent.locks) {
    try {
        $acquired = [DateTimeOffset]::Parse($lock.acquired)
        $ttl = if ($lock.ttl_minutes) { $lock.ttl_minutes } else { 30 }
        $expiry = $acquired.AddMinutes($ttl)
        if ($now -lt $expiry) {
            [void]$activeLocks.Add($lock)
        } else {
            $cleaned = $true
        }
    } catch {
        # Invalid timestamp — remove this lock
        $cleaned = $true
    }
}

# --- Write back cleaned locks if any expired (M2: unified UTF-8 no-BOM write) ---
if ($cleaned) {
    $mutexName = "Global\AgentFileLock_PCPT"
    $mutex = $null
    try {
        $mutex = New-Object System.Threading.Mutex($false, $mutexName)
        if ($mutex.WaitOne(3000)) {
            try {
                $lockContent.locks = @($activeLocks)
                $json = $lockContent | ConvertTo-Json -Depth 5
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($LockFile, $json, $utf8NoBom)
            } finally {
                $mutex.ReleaseMutex()
            }
        }
    } catch {
        # Mutex failed — not critical for check operation
    } finally {
        if ($mutex) { $mutex.Dispose() }
    }
}

# --- Check if target file is locked by another agent ---
foreach ($lock in $activeLocks) {
    $lockPath = $lock.file.Replace('\', '/')
    if ($lockPath -eq $RelPath -and $lock.agent -ne $AgentId) {
        $remaining = ([DateTimeOffset]::Parse($lock.acquired).AddMinutes($lock.ttl_minutes) - $now).TotalMinutes
        $remainMin = [math]::Ceiling($remaining)

        Write-Host ""
        Write-Host "============================================" -ForegroundColor Yellow
        Write-Host " FILE LOCK WARNING" -ForegroundColor Yellow
        Write-Host "============================================" -ForegroundColor Yellow
        Write-Host " File   : $RelPath" -ForegroundColor White
        Write-Host " Locked : $($lock.agent) (Story: $($lock.story))" -ForegroundColor Cyan
        Write-Host " TTL    : ${remainMin} min remaining" -ForegroundColor White
        Write-Host " Action : Consider working on other files first" -ForegroundColor White
        Write-Host "============================================" -ForegroundColor Yellow
        Write-Host ""

        # Exit 0 — warning only, does not block
        exit 0
    }
}

# No conflict found
exit 0
