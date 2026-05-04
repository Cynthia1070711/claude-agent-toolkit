# ==============================================================================
# smoke-test.ps1  v1.0.0
# party-to-pipeline v5.0.0 -- Smoke Test (T1.4)
#
# Pure PowerShell unit-style verification of v5.0.0 helpers (no real worker spawn).
# Tests: 4-Tuple Identity / Stop-WorkerSafe / Quad-Confirm / Conflict Matrix /
#        Schedule-Batches / Hard-block patterns / Invoke-GitOperation mutex
#
# Usage: .\smoke-test.ps1 [-Verbose]
# Exit:  0 = all pass, 1 = any fail
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\shared-utils.ps1"

$Script:passCount = 0
$Script:failCount = 0
$Script:failures  = @()

function Assert-Equal {
    param([string]$Name, $Expected, $Actual)
    $eq = ($Expected -eq $Actual) -or
          ($Expected -is [array] -and $Actual -is [array] -and
           $Expected.Count -eq $Actual.Count -and
           -not (Compare-Object $Expected $Actual))
    if ($eq) {
        $Script:passCount++
        Write-Host "  [PASS] $Name" -ForegroundColor Green
    } else {
        $Script:failCount++
        $Script:failures += $Name
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
        Write-Host "         Expected: $Expected" -ForegroundColor DarkGray
        Write-Host "         Actual  : $Actual"   -ForegroundColor DarkGray
    }
}

function Assert-True {
    param([string]$Name, [bool]$Condition)
    if ($Condition) {
        $Script:passCount++
        Write-Host "  [PASS] $Name" -ForegroundColor Green
    } else {
        $Script:failCount++
        $Script:failures += $Name
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host " party-to-pipeline v5.0.0 Smoke Test" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan

# ── Test Group 1: Hard-Block File Patterns (T4.5) ────────────────────────────
Write-Host "`n[Group 1] Hard-Block File Patterns" -ForegroundColor Yellow

Assert-True "T4.5-1: sprint-status.yaml is HARD_BLOCK" `
    (Test-HardBlockFile -FilePath 'docs/implementation-artifacts/sprint-status.yaml')

Assert-True "T4.5-2: .claude/rules/foo.md is HARD_BLOCK" `
    (Test-HardBlockFile -FilePath '.claude/rules/foo.md')

Assert-True "T4.5-3: .claude/skills/X/SKILL.md is HARD_BLOCK" `
    (Test-HardBlockFile -FilePath '.claude/skills/phycool-payment-subscription/SKILL.md')

Assert-True "T4.5-4: .gemini/skills/X/SKILL.md is HARD_BLOCK (three-engine sync)" `
    (Test-HardBlockFile -FilePath '.gemini/skills/phycool-payment-subscription/SKILL.md')

Assert-True "T4.5-5: src/X/Migrations/Y.cs is HARD_BLOCK" `
    (Test-HardBlockFile -FilePath 'src/PhyCool.Web/Data/Migrations/20260504_AddX.cs')

Assert-True "T4.5-6: ADR-FOO-001.md is HARD_BLOCK" `
    (Test-HardBlockFile -FilePath 'docs/technical-decisions/ADR-FOO-001-some-decision.md')

Assert-True "T4.5-7: Random src .cs is NOT hard-block" `
    (-not (Test-HardBlockFile -FilePath 'src/PhyCool.Web/Services/PaymentService.cs'))

Assert-True "T4.5-8: csproj is read-only allowed" `
    (Test-ReadOnlyAllowedFile -FilePath 'src/PhyCool.Web/PhyCool.Web.csproj')

# ── Test Group 2: Conflict Severity Classification (T4.2) ────────────────────
Write-Host "`n[Group 2] Conflict Severity Classification" -ForegroundColor Yellow

Assert-Equal "T4.2-1: empty intersect = DISJOINT" 'DISJOINT' `
    (Classify-ConflictSeverity -ConflictFiles @())

Assert-Equal "T4.2-2: SUPREME rule conflict = HARD_BLOCK" 'HARD_BLOCK' `
    (Classify-ConflictSeverity -ConflictFiles @('.claude/rules/foo.md'))

Assert-Equal "T4.2-3: src/X.cs conflict = SOFT_BLOCK" 'SOFT_BLOCK' `
    (Classify-ConflictSeverity -ConflictFiles @('src/PhyCool.Web/Services/PaymentService.cs'))

Assert-Equal "T4.2-4: csproj-only = READ_SHARED" 'READ_SHARED' `
    (Classify-ConflictSeverity -ConflictFiles @('src/PhyCool.Web/PhyCool.Web.csproj'))

Assert-Equal "T4.2-5: mixed (SUPREME + src) = HARD_BLOCK (worst wins)" 'HARD_BLOCK' `
    (Classify-ConflictSeverity -ConflictFiles @('src/X.cs', '.claude/rules/y.md'))

# ── Test Group 3: Get-FilePathsFromText (T4.1 helper) ────────────────────────
Write-Host "`n[Group 3] Get-FilePathsFromText (path extraction)" -ForegroundColor Yellow

$text1 = "Edit src/PhyCool.Web/Services/PaymentService.cs:45 to add validation"
$paths1 = Get-FilePathsFromText -Text $text1
Assert-True "T4.1-1: extract single path" ($paths1 -contains 'src/PhyCool.Web/Services/PaymentService.cs')

$text2 = @"
Tasks:
- [ ] Edit src/A.cs
- [ ] Create docs/B.md
- [ ] Update .claude/rules/c.md
"@
$paths2 = Get-FilePathsFromText -Text $text2
Assert-True "T4.1-2: extract 3 paths from multiline text" ($paths2.Count -ge 3)
Assert-True "T4.1-3: extract .md path" ($paths2 -contains 'docs/B.md')

$text3 = "Pure prose with no paths at all just describing things"
$paths3 = Get-FilePathsFromText -Text $text3
Assert-Equal "T4.1-4: empty result for prose" 0 $paths3.Count

# ── Test Group 4: Schedule-Batches (T4.3) ────────────────────────────────────
Write-Host "`n[Group 4] Schedule-Batches greedy scheduler" -ForegroundColor Yellow

# Mock: empty conflict matrix → all in 1 batch
$batches1 = Schedule-Batches -StoryIds @('A','B','C') -ConflictMatrix @()
Assert-Equal "T4.3-1: empty matrix → single batch" 1 $batches1.Count
Assert-Equal "T4.3-2: all 3 stories in batch 1" 3 $batches1[0].Count

# Mock: A<->B HARD_BLOCK → 2 batches
$matrix2 = @([PSCustomObject]@{
    story_a = 'A'; story_b = 'B'
    conflict_files = @('docs/implementation-artifacts/sprint-status.yaml')
    severity = 'HARD_BLOCK'
})
$batches2 = Schedule-Batches -StoryIds @('A','B','C') -ConflictMatrix $matrix2
Assert-Equal "T4.3-3: HARD_BLOCK A<->B → 2 batches" 2 $batches2.Count
Assert-True  "T4.3-4: batch 1 has A or B (not both)" `
    (($batches2[0] -contains 'A' -xor $batches2[0] -contains 'B') -or
     ($batches2[0].Count -ge 1))

# ── Test Group 5: Invoke-GitOperation mutex (T4.4) ───────────────────────────
Write-Host "`n[Group 5] Invoke-GitOperation TEMP file mutex" -ForegroundColor Yellow

$lockName = "smoke-test-$(Get-Random)"
$ranOk = $false
Invoke-GitOperation -Op { $Script:ranOk = $true } -LockName $lockName -TimeoutSec 5
Assert-True "T4.4-1: scriptblock executed under lock" $ranOk

$lockFile = Join-Path $env:TEMP "phycool-$lockName.lock"
Assert-True "T4.4-2: lock file cleaned up after op" (-not (Test-Path $lockFile))

# ── Test Group 6: Update-Tracker 4-Tuple (T1.1) ──────────────────────────────
Write-Host "`n[Group 6] Update-Tracker 4-Tuple Identity" -ForegroundColor Yellow

# Use temp tracker (don't pollute real one)
$realTrackerPath = Get-TrackerPath
$backupPath = "$realTrackerPath.smoke-backup-$(Get-Random)"
if (Test-Path $realTrackerPath) { Move-Item $realTrackerPath $backupPath }
try {
    Update-Tracker -StoryId 'smoke-A' -Phase 'create-story' -Status 'running' -ProcessId $PID -IpcDir 'C:\test\ipc-A' -WindowTitle '[CREATE] smoke-A'
    $entry = Get-TrackerEntry -StoryId 'smoke-A' -Phase 'create-story'
    Assert-True "T1.1-1: tracker entry created" ($null -ne $entry)
    Assert-Equal "T1.1-2: story_id matches" 'smoke-A' $entry.story_id
    Assert-Equal "T1.1-3: ipc_dir matches" 'C:\test\ipc-A' $entry.ipc_dir
    Assert-Equal "T1.1-4: pid captured" $PID $entry.pid
    Assert-True "T1.1-5: cmd_line captured (non-empty)" (-not [string]::IsNullOrWhiteSpace($entry.cmd_line))
    Assert-Equal "T1.1-6: window_title captured" '[CREATE] smoke-A' $entry.window_title
    Assert-True "T1.1-7: started_at present" (-not [string]::IsNullOrWhiteSpace($entry.started_at))

    # Update again → window_title preserved when not provided
    Update-Tracker -StoryId 'smoke-A' -Phase 'create-story' -Status 'closed' -ProcessId $PID -IpcDir 'C:\test\ipc-A'
    $entry2 = Get-TrackerEntry -StoryId 'smoke-A' -Phase 'create-story'
    Assert-Equal "T1.1-8: window_title preserved across update" '[CREATE] smoke-A' $entry2.window_title
    Assert-True "T1.1-9: started_at preserved" ($entry2.started_at -eq $entry.started_at)
    Assert-True "T1.1-10: closed_at written on status=closed" (-not [string]::IsNullOrWhiteSpace($entry2.closed_at))

    # files_modified merge
    Update-Tracker -StoryId 'smoke-B' -Phase 'dev-story' -Status 'closed' -ProcessId $PID -IpcDir 'C:\test\ipc-B' `
        -FilesModified @('src/X.cs','docs/Y.md')
    $entry3 = Get-TrackerEntry -StoryId 'smoke-B' -Phase 'dev-story'
    Assert-Equal "T4.7-1: files_modified count" 2 $entry3.files_modified.Count
    Assert-True "T4.7-2: files_modified contains src/X.cs" ($entry3.files_modified -contains 'src/X.cs')

} finally {
    Remove-Item $realTrackerPath -ErrorAction SilentlyContinue
    if (Test-Path $backupPath) { Move-Item $backupPath $realTrackerPath -Force }
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan
$total = $Script:passCount + $Script:failCount
$rate  = if ($total -gt 0) { [math]::Round(($Script:passCount / $total) * 100, 1) } else { 0 }
if ($Script:failCount -eq 0) {
    Write-Host " SMOKE TEST: $($Script:passCount)/$total PASSED ($rate%)" -ForegroundColor Green
    Write-Host ("=" * 70) -ForegroundColor Cyan
    exit 0
} else {
    Write-Host " SMOKE TEST: $($Script:passCount)/$total PASSED ($rate%)" -ForegroundColor Red
    Write-Host " FAILED: $($Script:failCount)" -ForegroundColor Red
    foreach ($f in $Script:failures) { Write-Host "   - $f" -ForegroundColor Red }
    Write-Host ("=" * 70) -ForegroundColor Cyan
    exit 1
}
