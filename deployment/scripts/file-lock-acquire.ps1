<#
.SYNOPSIS
    Acquire a file lock after writing. Used by PostToolUse / AfterTool hooks.

.DESCRIPTION
    1. Reads .agent-locks.json (creates if missing)
    2. Uses Windows Mutex to prevent race condition on lock file itself
    3. Normalizes file path
    4. Registers lock entry (or updates if same agent already holds it)
    5. Skips if file matches 'free' policy in .agent-file-policy.yaml

    Supports multiple hook environments:
    - Claude Code: reads CLAUDE_TOOL_INPUT env var
    - Gemini CLI: reads GEMINI_TOOL_INPUT env var
    - Manual: pass -FilePath explicitly

.PARAMETER AgentId
    The calling agent's ID (e.g., CC-OPUS, GC-PRO, AG-SONNET, RD-SONNET)

.PARAMETER StoryId
    Optional Story ID for tracking (e.g., QGR-BA-3)

.PARAMETER FilePath
    The file path to lock. If not provided, reads from hook env vars.

.PARAMETER TtlMinutes
    Lock TTL in minutes (default: 30)

.EXAMPLE
    powershell -File scripts/file-lock-acquire.ps1 -AgentId CC-OPUS -StoryId QGR-BA-3 -FilePath "src/App.Web/Program.cs"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AgentId,

    [Parameter(Mandatory = $false)]
    [string]$StoryId = "unknown",

    [Parameter(Mandatory = $false)]
    [string]$FilePath,

    [Parameter(Mandatory = $false)]
    [int]$TtlMinutes = 30
)

$ErrorActionPreference = "SilentlyContinue"

# --- Resolve project root ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LockFile = Join-Path $ProjectRoot ".agent-locks.json"
$PolicyFile = Join-Path $ProjectRoot ".agent-file-policy.yaml"

# --- Extract file path from hook input if not provided ---
# Tries multiple hook environments in order: Claude Code → Gemini CLI
if (-not $FilePath) {
    $toolInput = $env:CLAUDE_TOOL_INPUT
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
            # Not JSON or no file_path field
        }
    }
}

if (-not $FilePath) {
    exit 0
}

# --- Normalize path ---
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

# --- Check policy: skip 'free' files ---
# H3 fix: Parse free patterns from .agent-file-policy.yaml dynamically.
# Falls back to hardcoded defaults if yaml is missing or unparseable.
function Get-FreePatternsFromPolicy {
    param([string]$PolicyPath)
    $patterns = @()
    if (-not (Test-Path $PolicyPath)) { return $patterns }

    try {
        $lines = Get-Content $PolicyPath -Encoding UTF8
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\s+policy:\s*free\s*$') {
                # Search backward for the nearest pattern: line
                for ($j = $i - 1; $j -ge 0 -and $j -ge ($i - 3); $j--) {
                    if ($lines[$j] -match '^\s+-?\s*pattern:\s*"([^"]+)"') {
                        $patterns += $Matches[1]
                        break
                    }
                }
            }
        }
    } catch {
        # Parse error — return empty, fall back to defaults
    }
    return $patterns
}

function Convert-GlobToRegex {
    param([string]$Pattern)
    # Use placeholders to avoid double-replacement
    $regex = $Pattern
    $regex = $regex -replace '\*\*/', '{{GLOB_DIR}}'  # **/ → zero or more dirs
    $regex = $regex -replace '\*\*', '{{GLOB_ALL}}'   # ** → match everything
    $regex = $regex -replace '\*', '[^/]*'             # * → single segment
    $regex = $regex -replace '{{GLOB_DIR}}', '(.+/)?'
    $regex = $regex -replace '{{GLOB_ALL}}', '.*'
    return "^" + $regex + "$"
}

function Test-FreePolicy {
    param([string]$Path)

    # Try dynamic parse first
    $freePatterns = Get-FreePatternsFromPolicy -PolicyPath $PolicyFile

    # Fallback defaults if yaml missing or parse returned nothing
    if ($freePatterns.Count -eq 0) {
        $freePatterns = @(
            "src/**/Views/**",
            "src/**/*.Tests/**",
            "docs/**",
            "src/**/wwwroot/**"
        )
    }

    foreach ($pattern in $freePatterns) {
        $regexPattern = Convert-GlobToRegex -Pattern $pattern
        if ($Path -match $regexPattern) {
            return $true
        }
    }
    return $false
}

if (Test-FreePolicy -Path $RelPath) {
    exit 0
}

# --- Mutex-protected lock file update ---
$mutexName = "Global\AgentFileLock_PCPT"
$mutex = $null
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

try {
    $mutex = New-Object System.Threading.Mutex($false, $mutexName)

    if (-not $mutex.WaitOne(5000)) {
        Write-Host "[file-lock-acquire] WARN: Mutex timeout after 5s, skipping lock for $RelPath" -ForegroundColor Yellow
        exit 0
    }

    try {
        # --- Read existing locks ---
        $lockContent = $null
        if (Test-Path $LockFile) {
            try {
                $lockContent = Get-Content $LockFile -Raw -Encoding UTF8 | ConvertFrom-Json
            } catch {
                # Corrupted — reset
                $lockContent = $null
            }
        }

        if (-not $lockContent) {
            $lockContent = [PSCustomObject]@{
                version = 1
                locks = @()
            }
        }

        # --- Clean expired locks ---
        $now = [DateTimeOffset]::Now
        $activeLocks = [System.Collections.ArrayList]@()

        foreach ($lock in $lockContent.locks) {
            try {
                $acquired = [DateTimeOffset]::Parse($lock.acquired)
                $ttl = if ($lock.ttl_minutes) { $lock.ttl_minutes } else { 30 }
                if ($now -lt $acquired.AddMinutes($ttl)) {
                    [void]$activeLocks.Add($lock)
                }
            } catch {
                # Invalid — drop
            }
        }

        # --- Check for duplicate: same agent + same file → update timestamp ---
        $existingIndex = -1
        for ($i = 0; $i -lt $activeLocks.Count; $i++) {
            $l = $activeLocks[$i]
            if ($l.file.Replace('\', '/') -eq $RelPath -and $l.agent -eq $AgentId) {
                $existingIndex = $i
                break
            }
        }

        $timestamp = $now.ToString("yyyy-MM-ddTHH:mm:sszzz")

        if ($existingIndex -ge 0) {
            # Update existing lock timestamp (extend TTL)
            $activeLocks[$existingIndex].acquired = $timestamp
            $activeLocks[$existingIndex].ttl_minutes = $TtlMinutes
            if ($StoryId -ne "unknown") {
                $activeLocks[$existingIndex].story = $StoryId
            }
        } else {
            # Add new lock
            $newLock = [PSCustomObject]@{
                file = $RelPath
                agent = $AgentId
                story = $StoryId
                type = "write"
                acquired = $timestamp
                ttl_minutes = $TtlMinutes
            }
            [void]$activeLocks.Add($newLock)
        }

        # --- Write back (M2: unified UTF-8 no-BOM) ---
        $lockContent.locks = @($activeLocks)
        $json = $lockContent | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText($LockFile, $json, $utf8NoBom)

    } finally {
        $mutex.ReleaseMutex()
    }

} catch {
    Write-Host "[file-lock-acquire] ERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($mutex) { $mutex.Dispose() }
}

exit 0
