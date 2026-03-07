# ============================================================================
# Batch Audit - Pipeline Post-Execution Verification + AutoFix
# ============================================================================
# 7 consistency checks per Story + JSON report + optional AutoFix.
#
# Usage:
#   .\scripts\batch-audit.ps1 -StoryIds @("qgr-e7","qgr-s3")
#   .\scripts\batch-audit.ps1 -StoryIds @("qgr-e7") -AutoFix
#   .\scripts\batch-audit.ps1 -BatchId 1
# ============================================================================

[CmdletBinding()]
param (
    [Parameter(HelpMessage = "Story IDs to audit")]
    [string[]]$StoryIds = @(),

    [Parameter(HelpMessage = "Batch number (same definitions as batch-runner)")]
    [int]$BatchId = 0,

    [Parameter(HelpMessage = "Auto-fix safe issues")]
    [switch]$AutoFix
)

# ============================================================================
# Setup
# ============================================================================
$ErrorActionPreference = "Continue"

if ($PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
} else {
    $ProjectRoot = (Get-Location).Path
}

$SprintStatusPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"
$StoriesDir       = Join-Path $ProjectRoot "docs\implementation-artifacts\stories"
$ReviewsDir       = Join-Path $ProjectRoot "docs\implementation-artifacts\reviews"
$TrackActiveDir   = Join-Path $ProjectRoot "docs\tracking\active"
$TrackArchiveDir  = Join-Path $ProjectRoot "docs\tracking\archived"
$LogDir           = Join-Path $ProjectRoot "logs"
$Timestamp        = Get-Date -Format "yyyy-MM-dd_HHmmss"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Batch definitions (mirror batch-runner.ps1)
$Batches = @{
    1 = @("qgr-s2", "qgr-s3", "qgr-s4", "qgr-e12", "qgr-a6")
    2 = @("qgr-a1", "qgr-e10", "qgr-e11", "qgr-t5", "qgr-t6")
    3 = @("qgr-a2", "qgr-ba-11", "qgr-ba-12", "qgr-ba-13", "qgr-ba-14")
    4 = @("qgr-a10-5", "qgr-a10-6", "qgr-m10", "qgr-t8", "qgr-s6")
    5 = @("qgr-e4", "qgr-e5", "qgr-e9", "qgr-e13", "qgr-d6")
    6 = @("qgr-m4", "qgr-m5", "qgr-m8", "qgr-m9", "qgr-s5")
    7 = @("qgr-a4", "qgr-a5", "qgr-a7", "qgr-a8", "qgr-a9")
    8 = @("qgr-d5", "qgr-t7")
}

if ($StoryIds.Count -eq 0 -and $BatchId -gt 0) {
    if ($Batches.ContainsKey($BatchId)) {
        $StoryIds = $Batches[$BatchId]
    } else {
        Write-Output "[ERROR] Unknown BatchId: $BatchId"; exit 1
    }
}
if ($StoryIds.Count -eq 0) {
    Write-Output "[ERROR] No stories to audit. Provide -StoryIds or -BatchId"; exit 1
}

# Emoji constants (PowerShell-safe)
$EmojiBlue   = [char]::ConvertFromUtf32(0x1F535)
$EmojiOrange = [char]::ConvertFromUtf32(0x1F7E0)
$EmojiGreen  = [char]::ConvertFromUtf32(0x1F7E2)

# ============================================================================
# Helpers
# ============================================================================

function Get-SprintStatusValue {
    param([string]$sid)
    if (-not (Test-Path $SprintStatusPath)) { return $null }
    $lines = Get-Content $SprintStatusPath -Encoding UTF8
    foreach ($l in $lines) {
        $t = $l.Trim()
        if ($t -match "^${sid}(-[a-z][\w-]*)?\s*:\s+([\w-]+)") {
            return $Matches[2]
        }
    }
    return $null
}

function Find-StoryFile {
    param([string]$sid)
    $epicPfx = ($sid -split "-")[0]
    $epicDir = Join-Path $StoriesDir "epic-$epicPfx"
    if (Test-Path $epicDir) {
        $f = Get-ChildItem -Path $epicDir -Filter "$sid*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($f) { return $f.FullName }
    }
    $f2 = Get-ChildItem -Path $StoriesDir -Recurse -Filter "$sid*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f2) { return $f2.FullName }
    return $null
}

function Get-StoryFileStatus {
    param([string]$fp)
    if (-not $fp -or -not (Test-Path $fp)) { return $null }
    foreach ($line in (Get-Content $fp -Encoding UTF8)) {
        if ($line -match '\|\s*\*\*\u72C0\u614B\*\*\s*\|\s*(.+?)\s*\|') {
            return $Matches[1].Trim()
        }
        # Fallback: English "Status"
        if ($line -match '\|\s*\*\*Status\*\*\s*\|\s*(.+?)\s*\|') {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Get-StoryH1Line {
    param([string]$fp)
    if (-not $fp -or -not (Test-Path $fp)) { return $null }
    return (Get-Content $fp -Encoding UTF8 -TotalCount 1)
}

function Get-ExpectedEmoji {
    param([string]$st)
    switch ($st) {
        "ready-for-dev" { return $EmojiBlue }
        "in-progress"   { return $EmojiOrange }
        "review"        { return $EmojiOrange }
        "done"          { return $EmojiGreen }
        default         { return $null }
    }
}

function Get-StoryMetadata {
    param([string]$fp)
    $result = @{ DevAgent = $null; ReviewAgent = $null; DevTime = $null }
    if (-not $fp -or -not (Test-Path $fp)) { return $result }

    foreach ($line in (Get-Content $fp -Encoding UTF8)) {
        if ($line -match '\|\s*\*\*DEV Agent\*\*\s*\|\s*(.+?)\s*\|') {
            $v = $Matches[1].Trim()
            if ($v -ne '' -and $v -notmatch '^\s*[-\u2014]\s*$') { $result.DevAgent = $v }
        }
        if ($line -match '\|\s*\*\*Review Agent\*\*\s*\|\s*(.+?)\s*\|') {
            $v = $Matches[1].Trim()
            if ($v -ne '' -and $v -notmatch '^\s*[-\u2014]\s*$') { $result.ReviewAgent = $v }
        }
        if ($line -match '\|\s*\*\*DEV\u5B8C\u6210\u6642\u9593\*\*\s*\|\s*(.+?)\s*\|') {
            $v = $Matches[1].Trim()
            if ($v -ne '' -and $v -notmatch '^\s*[-\u2014]\s*$') { $result.DevTime = $v }
        }
    }
    return $result
}

# ============================================================================
# 7 Check Functions
# ============================================================================

function Test-C1-SprintStatus {
    param([string]$sid)
    $st = Get-SprintStatusValue -sid $sid
    if ($null -eq $st) {
        return @{ Check = "C1-SprintStatus"; Pass = $false; Message = "Not found in sprint-status.yaml"; CanFix = $false }
    }
    return @{ Check = "C1-SprintStatus"; Pass = $true; Message = "Status: $st"; Value = $st; CanFix = $false }
}

function Test-C2-FileStatus {
    param([string]$sid, [string]$sf, [string]$ys)
    if (-not $sf -or -not (Test-Path $sf)) {
        return @{ Check = "C2-FileStatus"; Pass = $false; Message = "Story file not found"; CanFix = $false }
    }
    $fs = Get-StoryFileStatus -fp $sf
    if (-not $fs) {
        return @{ Check = "C2-FileStatus"; Pass = $false; Message = "Cannot parse status from file"; CanFix = $false }
    }
    $nf = $fs.ToLower() -replace '\s+', '-'
    $ny = $ys.ToLower() -replace '\s+', '-'
    if ($nf -eq $ny) {
        return @{ Check = "C2-FileStatus"; Pass = $true; Message = "Consistent: $fs"; CanFix = $false }
    }
    return @{
        Check = "C2-FileStatus"; Pass = $false
        Message = "MISMATCH: file='$fs' vs yaml='$ys'"
        CanFix = $true; FixAction = "Update file status"; FixTarget = $sf; FixFrom = $fs; FixTo = $ys
    }
}

function Test-C3-Metadata {
    param([string]$sid, [string]$sf, [string]$ys)
    if ($ys -notin @("review", "done")) {
        return @{ Check = "C3-Metadata"; Pass = $true; Message = "Skipped (status=$ys)"; CanFix = $false }
    }
    $m = Get-StoryMetadata -fp $sf
    $issues = @()
    if (-not $m.DevAgent) { $issues += "DEV Agent missing" }
    if (-not $m.DevTime)  { $issues += "DEV time missing" }
    if ($ys -eq "done" -and -not $m.ReviewAgent) { $issues += "Review Agent missing" }

    if ($issues.Count -eq 0) {
        return @{ Check = "C3-Metadata"; Pass = $true; Message = "DEV=$($m.DevAgent), Review=$($m.ReviewAgent)"; CanFix = $false }
    }
    return @{ Check = "C3-Metadata"; Pass = $false; Message = ($issues -join "; "); CanFix = $false }
}

function Test-C4-TrackingFile {
    param([string]$sid, [string]$ys)
    $af = Join-Path $TrackActiveDir "$sid.track.md"
    $inActive = Test-Path $af
    $archived = Get-ChildItem -Path $TrackArchiveDir -Recurse -Filter "$sid.track.md" -ErrorAction SilentlyContinue

    if ($ys -eq "done") {
        if ($archived.Count -gt 0) {
            if ($inActive) {
                return @{
                    Check = "C4-TrackingFile"; Pass = $false
                    Message = "In BOTH active/ and archived/"; CanFix = $true
                    FixAction = "Remove from active/"; FixTarget = $af
                }
            }
            return @{ Check = "C4-TrackingFile"; Pass = $true; Message = "Correctly in archived/"; CanFix = $false }
        } elseif ($inActive) {
            return @{ Check = "C4-TrackingFile"; Pass = $false; Message = "Done but still in active/"; CanFix = $false }
        }
    } else {
        if ($inActive) {
            return @{ Check = "C4-TrackingFile"; Pass = $true; Message = "Correctly in active/"; CanFix = $false }
        }
    }
    return @{ Check = "C4-TrackingFile"; Pass = $false; Message = "Tracking file not found"; CanFix = $false }
}

function Test-C5-CRReport {
    param([string]$sid, [string]$ys)
    if ($ys -ne "done") {
        return @{ Check = "C5-CRReport"; Pass = $true; Message = "Skipped (status=$ys)"; CanFix = $false }
    }
    $epicPfx = ($sid -split "-")[0]
    $rd = Join-Path $ReviewsDir "epic-$epicPfx"
    if (-not (Test-Path $rd)) {
        return @{ Check = "C5-CRReport"; Pass = $false; Message = "Reviews dir not found"; CanFix = $false }
    }
    $cr = Get-ChildItem -Path $rd -Filter "*$sid*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cr) {
        return @{ Check = "C5-CRReport"; Pass = $true; Message = "Found: $($cr.Name)"; CanFix = $false }
    }
    return @{ Check = "C5-CRReport"; Pass = $false; Message = "CR report not found"; CanFix = $false }
}

function Test-C6-TrackingFreshness {
    param([string]$sid)
    $af = Join-Path $TrackActiveDir "$sid.track.md"
    if (-not (Test-Path $af)) {
        return @{ Check = "C6-TrackingFresh"; Pass = $true; Message = "Skipped (no active file)"; CanFix = $false }
    }
    $hrs = ((Get-Date) - (Get-Item $af).LastWriteTime).TotalHours
    if ($hrs -le 24) {
        return @{ Check = "C6-TrackingFresh"; Pass = $true; Message = "Updated $([math]::Round($hrs,1))h ago"; CanFix = $false }
    }
    return @{ Check = "C6-TrackingFresh"; Pass = $false; Message = "Stale: $([math]::Round($hrs,1))h ago"; CanFix = $false }
}

function Test-C7-H1Emoji {
    param([string]$sid, [string]$sf, [string]$ys)
    if (-not $sf -or -not (Test-Path $sf)) {
        return @{ Check = "C7-H1Emoji"; Pass = $false; Message = "Story file not found"; CanFix = $false }
    }
    $expected = Get-ExpectedEmoji -st $ys
    if ($null -eq $expected) {
        return @{ Check = "C7-H1Emoji"; Pass = $true; Message = "Skipped (status=$ys)"; CanFix = $false }
    }
    $h1 = Get-StoryH1Line -fp $sf
    if ($h1 -and $h1.Contains($expected)) {
        return @{ Check = "C7-H1Emoji"; Pass = $true; Message = "Correct emoji"; CanFix = $false }
    }
    return @{
        Check = "C7-H1Emoji"; Pass = $false
        Message = "Emoji mismatch for status=$ys"
        CanFix = $true; FixAction = "Update H1 emoji"; FixTarget = $sf
    }
}

# ============================================================================
# AutoFix Engine
# ============================================================================

function Invoke-AutoFix {
    param([hashtable]$cr, [string]$sid)
    if (-not $cr.CanFix) { return $false }

    switch ($cr.Check) {
        "C2-FileStatus" {
            $content = Get-Content $cr.FixTarget -Raw -Encoding UTF8
            $from = [regex]::Escape($cr.FixFrom)
            $to = $cr.FixTo
            $newContent = $content -replace "(\|\s*\*\*(?:\u72C0\u614B|Status)\*\*\s*\|\s*)$from(\s*\|)", "`${1}$to`${2}"
            $newContent | Out-File -FilePath $cr.FixTarget -Encoding UTF8 -NoNewline
            Write-Output "  [FIXED] C2: '$($cr.FixFrom)' -> '$to'"
            return $true
        }
        "C4-TrackingFile" {
            if ($cr.FixAction -eq "Remove from active/") {
                Remove-Item $cr.FixTarget -Force
                Write-Output "  [FIXED] C4: Removed from active/"
                return $true
            }
        }
        "C7-H1Emoji" {
            $lines = Get-Content $cr.FixTarget -Encoding UTF8
            $ys = Get-SprintStatusValue -sid $sid
            $emoji = Get-ExpectedEmoji -st $ys
            if ($lines.Count -gt 0 -and $emoji) {
                $first = $lines[0]
                # Remove existing known emojis then prepend correct one
                $cleaned = $first -replace "^(#\s+)[$EmojiBlue$EmojiOrange$EmojiGreen]\s*", '$1'
                $lines[0] = $cleaned -replace '^(#\s+)', "`${1}$emoji "
                $lines | Out-File -FilePath $cr.FixTarget -Encoding UTF8
                Write-Output "  [FIXED] C7: Updated H1 emoji"
                return $true
            }
        }
    }
    return $false
}

# ============================================================================
# Main Audit Loop
# ============================================================================
$AuditResults = @()
$totalChecks = 0; $passCount = 0; $failCount = 0; $fixedCount = 0

Write-Output "============================================================"
Write-Output "  Batch Audit $(if ($AutoFix) { '(AutoFix ON)' } else { '(Read-only)' })"
Write-Output "  Stories: $($StoryIds -join ', ')"
Write-Output "============================================================"
Write-Output ""

foreach ($sid in $StoryIds) {
    Write-Output "--- $sid ---"
    $sf = Find-StoryFile -sid $sid
    $c1 = Test-C1-SprintStatus -sid $sid
    $ys = $c1.Value

    $checks = @(
        $c1
        (Test-C2-FileStatus -sid $sid -sf $sf -ys $ys)
        (Test-C3-Metadata -sid $sid -sf $sf -ys $ys)
        (Test-C4-TrackingFile -sid $sid -ys $ys)
        (Test-C5-CRReport -sid $sid -ys $ys)
        (Test-C6-TrackingFreshness -sid $sid)
        (Test-C7-H1Emoji -sid $sid -sf $sf -ys $ys)
    )

    $sr = @{ StoryId = $sid; StoryFile = $sf; YamlStatus = $ys; Checks = @() }

    foreach ($chk in $checks) {
        $totalChecks++
        $icon = if ($chk.Pass) { "[OK]" } else { "[!!]" }
        $color = if ($chk.Pass) { "Green" } else { "Red" }
        Write-Host "  $icon $($chk.Check): $($chk.Message)" -ForegroundColor $color

        if ($chk.Pass) { $passCount++ }
        else {
            $failCount++
            if ($AutoFix -and $chk.CanFix) {
                $fixed = Invoke-AutoFix -cr $chk -sid $sid
                if ($fixed) { $chk["Fixed"] = $true; $fixedCount++; $failCount--; $passCount++ }
            }
        }
        $sr.Checks += $chk
    }

    $AuditResults += $sr
    Write-Output ""
}

# ============================================================================
# Summary + JSON Output
# ============================================================================
Write-Output "============================================================"
Write-Output "  AUDIT SUMMARY"
Write-Output "============================================================"
Write-Output "  Total Checks : $totalChecks"
Write-Output "  Passed       : $passCount"
Write-Output "  Failed       : $failCount"
Write-Output "  Auto-Fixed   : $fixedCount"
Write-Output ""

$jsonReport = @{
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
    autoFix   = $AutoFix.IsPresent
    summary   = @{ totalChecks = $totalChecks; passed = $passCount; failed = $failCount; fixed = $fixedCount }
    stories   = @()
}

foreach ($sr in $AuditResults) {
    $sj = @{ storyId = $sr.StoryId; yamlStatus = $sr.YamlStatus; storyFile = $sr.StoryFile; checks = @() }
    foreach ($c in $sr.Checks) {
        $cj = @{ check = $c.Check; pass = $c.Pass; message = $c.Message }
        if ($c.ContainsKey("CanFix") -and $c.CanFix) { $cj["canFix"] = $true }
        if ($c.ContainsKey("Fixed") -and $c.Fixed)   { $cj["fixed"] = $true }
        if ($c.ContainsKey("FixAction")) { $cj["fixAction"] = $c.FixAction }
        $sj.checks += $cj
    }
    $jsonReport.stories += $sj
}

$jsonFile = Join-Path $LogDir "batch-audit-$Timestamp.json"
$jsonReport | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonFile -Encoding UTF8

Write-Output "  JSON Report: $jsonFile"
Write-Output ""

if ($failCount -gt 0) {
    Write-Output "  RESULT: $failCount issues need attention"
    exit 1
} else {
    Write-Output "  RESULT: All checks passed"
    exit 0
}
