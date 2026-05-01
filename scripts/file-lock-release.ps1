<#
.SYNOPSIS
    Release file locks. Supports three granularity levels.

.DESCRIPTION
    Releases locks from .agent-locks.json by one of three criteria:
    1. By AgentId — release all locks held by a specific agent
    2. By StoryId — release all locks for a specific story
    3. By FilePath — release a specific file lock

    When multiple criteria are provided, they combine with OR logic:
    a lock is released if it matches ANY of the provided criteria.

    Uses Windows Mutex for thread-safe lock file access.

.PARAMETER AgentId
    Release all locks held by this agent (e.g., CC-OPUS)

.PARAMETER StoryId
    Release all locks for this story (e.g., QGR-BA-3)

.PARAMETER FilePath
    Release lock on a specific file path

.PARAMETER All
    Release ALL locks (cleanup operation)

.EXAMPLE
    # Release all locks for an agent
    powershell -File scripts/file-lock-release.ps1 -AgentId CC-OPUS

    # Release all locks for a story
    powershell -File scripts/file-lock-release.ps1 -StoryId QGR-BA-3

    # Release a specific file lock
    powershell -File scripts/file-lock-release.ps1 -FilePath "src/App.Web/Program.cs"

    # Release all locks (full cleanup)
    powershell -File scripts/file-lock-release.ps1 -All

    # Combined: release locks matching agent OR story (OR logic)
    powershell -File scripts/file-lock-release.ps1 -AgentId CC-OPUS -StoryId QGR-BA-3
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$AgentId,

    [Parameter(Mandatory = $false)]
    [string]$StoryId,

    [Parameter(Mandatory = $false)]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [switch]$All
)

$ErrorActionPreference = "SilentlyContinue"

# --- Validate at least one parameter ---
if (-not $AgentId -and -not $StoryId -and -not $FilePath -and -not $All) {
    Write-Host "Usage: file-lock-release.ps1 -AgentId <id> | -StoryId <id> | -FilePath <path> | -All" -ForegroundColor Yellow
    exit 1
}

# --- Resolve project root ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LockFile = Join-Path $ProjectRoot ".agent-locks.json"

if (-not (Test-Path $LockFile)) {
    Write-Host "[file-lock-release] No lock file found. Nothing to release." -ForegroundColor Gray
    exit 0
}

# --- Normalize path helper ---
function Get-RelativePath {
    param([string]$FullPath, [string]$BasePath)
    $resolved = [System.IO.Path]::GetFullPath($FullPath)
    $baseResolved = [System.IO.Path]::GetFullPath($BasePath)
    if ($resolved.StartsWith($baseResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $resolved.Substring($baseResolved.Length).TrimStart('\', '/').Replace('\', '/')
    }
    return $FullPath.Replace('\', '/')
}

if ($FilePath) {
    $FilePath = Get-RelativePath -FullPath $FilePath -BasePath $ProjectRoot
}

# --- Mutex-protected release ---
$mutexName = "Global\AgentFileLock_PCPT"
$mutex = $null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

try {
    $mutex = New-Object System.Threading.Mutex($false, $mutexName)

    if (-not $mutex.WaitOne(5000)) {
        Write-Host "[file-lock-release] WARN: Mutex timeout after 5s" -ForegroundColor Yellow
        exit 1
    }

    try {
        # --- Read lock file ---
        $lockContent = $null
        try {
            $lockContent = Get-Content $LockFile -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            Write-Host "[file-lock-release] Lock file corrupted. Resetting." -ForegroundColor Yellow
            $lockContent = [PSCustomObject]@{ version = 1; locks = @() }
        }

        if (-not $lockContent.locks) {
            Write-Host "[file-lock-release] No active locks." -ForegroundColor Gray
            exit 0
        }

        $before = $lockContent.locks.Count

        # --- Filter locks based on release criteria (OR logic for multiple params) ---
        if ($All) {
            $remaining = @()
            Write-Host "[file-lock-release] Releasing ALL $before lock(s)" -ForegroundColor Cyan
        } else {
            $remaining = @($lockContent.locks | Where-Object {
                $keep = $true
                if ($AgentId -and $_.agent -eq $AgentId) { $keep = $false }
                if ($StoryId -and $_.story -eq $StoryId) { $keep = $false }
                if ($FilePath -and $_.file.Replace('\', '/') -eq $FilePath) { $keep = $false }
                $keep
            })
        }

        $released = $before - $remaining.Count

        # --- Write back (M2: unified UTF-8 no-BOM) ---
        $lockContent.locks = $remaining
        $json = $lockContent | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText($LockFile, $json, $utf8NoBom)

        # --- Report ---
        if ($released -gt 0) {
            $criteria = if ($All) { "ALL" }
                        elseif ($AgentId) { "Agent=$AgentId" }
                        elseif ($StoryId) { "Story=$StoryId" }
                        else { "File=$FilePath" }
            Write-Host "[file-lock-release] Released $released lock(s) ($criteria). $($remaining.Count) remaining." -ForegroundColor Green
        } else {
            Write-Host "[file-lock-release] No matching locks found." -ForegroundColor Gray
        }

    } finally {
        $mutex.ReleaseMutex()
    }

} catch {
    Write-Host "[file-lock-release] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($mutex) { $mutex.Dispose() }
}

exit 0
