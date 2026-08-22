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

# 宿主提醒(whp-12 CR F9)。`#Requires -Version 5.1` 只是下限,pwsh 7 一樣跑得起來 -- 但兩者的
# ConvertFrom-Json 行為不同:PS 7 會把 ISO-8601 字串自動轉成 [DateTime],於是 Group 13/15 那兩條
# 以 regex 釘住時間戳格式的斷言在 PS 7 下必紅(值被轉型後 -match 比對的是當地文化的日期字串)。
# 生產宿主本就鎖定 Windows PowerShell 5.1(encoding-discipline §2 / phycool-windows-ps-encoding §13),
# 這裡不阻擋,只在跑錯宿主時把"紅燈可能不是你的 code 造成的"講清楚。
if ($PSVersionTable.PSVersion.Major -ne 5) {
    Write-Host ("[HOST WARNING] 目前宿主 PowerShell $($PSVersionTable.PSVersion) 非契約宿主 Windows PowerShell 5.1。" +
        "Group 13/15 的時間戳格式斷言在 PS 7 下會因 ConvertFrom-Json 自動轉型而誤紅 -- " +
        "判定結果請以 powershell.exe(5.1)複跑為準。") -ForegroundColor Yellow
}

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

Assert-True "T4.5-1: sprint-status.yaml is NOT HARD_BLOCK (frozen 2026-07-28, no writers remain)" `
    (-not (Test-HardBlockFile -FilePath 'docs/implementation-artifacts/sprint-status.yaml'))

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
    conflict_files = @('CLAUDE.md')
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

# -- Test Group 7: whp-4 write-path wiring (T5.3) ----------------------------
Write-Host "`n[Group 7] whp-4 registration / session-id / DB dual-write" -ForegroundColor Yellow

foreach ($w in @('worker-create.ps1', 'worker-dev.ps1', 'worker-review.ps1', 'worker-general.ps1')) {
    Assert-True "T5.3-1: $w wires --session-id" `
        (Select-String -Path (Join-Path $PSScriptRoot $w) -Pattern '--session-id' -Quiet)
}

Assert-True "T5.3-2: preflight-dispatch.ps1 exists" (Test-Path (Join-Path $PSScriptRoot 'preflight-dispatch.ps1'))
Assert-True "T5.3-3: register-run.ps1 exists" (Test-Path (Join-Path $PSScriptRoot 'register-run.ps1'))

$preflightProbeOutput = & powershell -NoProfile -File (Join-Path $PSScriptRoot 'preflight-dispatch.ps1') `
    -StoryId 'smoke-test-nonexistent-story-id' -Phase 'dev-story' -Json 2>$null | Out-String
Assert-True "T5.3-4: preflight-dispatch.ps1 -Json on a nonexistent story SKIPs (not crash) STORY_STATE" `
    ($preflightProbeOutput -match 'STORY_STATE')

# Real DB round-trip: Register -> Confirm -> Update-Tracker dual-write -> cleanup.
# Same spirit as Group 6 (touches real DB/tracker.json, always restored in finally).
$smokeRunId = [guid]::NewGuid().ToString()
$smokeStoryId = 'smoke-whp4-' + (Get-Random)
$smokeIpcDir = Join-Path $env:TEMP "smoke-whp4-ipc-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $smokeIpcDir | Out-Null
$origPipelineRunId = $env:PIPELINE_RUN_ID
try {
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Register `
        -RunId $smokeRunId -StoryId $smokeStoryId -Phase 'dev-story' -IpcDir $smokeIpcDir -SessionId $smokeRunId `
        -ControllerTrack 'smoke' -ModelId 'smoke-model' -Effort 'max' -WorkRoot $PSScriptRoot `
        -BaselineCommit 'smoketest' -Attempt 1 | Out-Null
    Assert-True "T5.3-5: register-run.ps1 -Mode Register exit 0" ($LASTEXITCODE -eq 0)

    $smokeQueryJs = Join-Path $env:TEMP "smoke-whp4-query-$(Get-Random).js"
    $dbPathForJs = (Join-Path $PSScriptRoot '..\..\..\..\.context-db\phycool.db' | Resolve-Path).Path -replace '\\', '\\'
    $jsLines = @(
        "const Database = require(process.cwd() + '\\node_modules\\better-sqlite3');",
        "const db = new Database('$dbPathForJs', { readonly: true });",
        "const r = db.prepare('SELECT lifecycle, wrapper_pid, cmd_line, window_title FROM worker_runs WHERE run_id = ?').get('$smokeRunId');",
        "console.log(JSON.stringify(r));"
    )
    [System.IO.File]::WriteAllText($smokeQueryJs, ($jsLines -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $rowAfterRegister = (& node $smokeQueryJs | ConvertFrom-Json)
    Assert-Equal "T5.3-6: registered row lifecycle=dispatching" 'dispatching' $rowAfterRegister.lifecycle

    $env:PIPELINE_RUN_ID = $smokeRunId
    Update-Tracker -StoryId $smokeStoryId -Phase 'dev-story' -Status 'running' -ProcessId $PID -IpcDir $smokeIpcDir -WindowTitle '[SMOKE] whp4'
    $rowAfterDualWrite = (& node $smokeQueryJs | ConvertFrom-Json)
    Assert-Equal "T5.3-7: Update-Tracker DB dual-write sets wrapper_pid" $PID $rowAfterDualWrite.wrapper_pid
    Assert-Equal "T5.3-8: Update-Tracker DB dual-write sets window_title" '[SMOKE] whp4' $rowAfterDualWrite.window_title
    Assert-Equal "T5.3-9: DB dual-write does not touch lifecycle (register-run.ps1 -Mode Confirm's job, not Update-Tracker's)" 'dispatching' $rowAfterDualWrite.lifecycle

    Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue
    Update-Tracker -StoryId $smokeStoryId -Phase 'dev-story' -Status 'running' -ProcessId 999999 -IpcDir $smokeIpcDir -WindowTitle '[SMOKE] should-not-persist'
    $rowAfterGateSkip = (& node $smokeQueryJs | ConvertFrom-Json)
    Assert-Equal "T5.3-10: BR-127 gate -- no PIPELINE_RUN_ID means DB is untouched by Update-Tracker" $PID $rowAfterGateSkip.wrapper_pid

    Remove-Item $smokeQueryJs -ErrorAction SilentlyContinue
} finally {
    if ($origPipelineRunId) { $env:PIPELINE_RUN_ID = $origPipelineRunId } else { Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue }
    $cleanupJs = Join-Path $env:TEMP "smoke-whp4-cleanup-$(Get-Random).js"
    $dbPathForCleanup = (Join-Path $PSScriptRoot '..\..\..\..\.context-db\phycool.db' | Resolve-Path).Path -replace '\\', '\\'
    $cleanupLines = @(
        "const Database = require(process.cwd() + '\\node_modules\\better-sqlite3');",
        "const db = new Database('$dbPathForCleanup');",
        "db.prepare('DELETE FROM worker_runs WHERE story_id = ?').run('$smokeStoryId');",
        "db.prepare('DELETE FROM worker_handoffs WHERE story_id = ?').run('$smokeStoryId');"
    )
    [System.IO.File]::WriteAllText($cleanupJs, ($cleanupLines -join "`n"), [System.Text.UTF8Encoding]::new($false))
    & node $cleanupJs 2>$null | Out-Null
    Remove-Item $cleanupJs -ErrorAction SilentlyContinue
    Remove-Item $smokeIpcDir -Recurse -ErrorAction SilentlyContinue
    # tracker.json also received smoke entries via Update-Tracker (append-only) -- filter them back out.
    $trackerPath = Get-TrackerPath
    if (Test-Path $trackerPath) {
        try {
            $arr = @(Read-JsonRetry -Path $trackerPath | Where-Object { $_.story_id -ne $smokeStoryId })
            Write-AtomicJson -Path $trackerPath -Object $arr
        } catch { }
    }
}

# -- Test Group 8: whp-4 stop-report heartbeat path (added by whp-4 code-review, CR F7) ------
# Group 7 covers the dispatch side (session-id wiring / preflight / register-run / dual-write) but
# nothing on the Stop-hook side, where AC5/AC6/AC7/AC10/AC16 actually live. That gap is how two
# real defects shipped: worker_handoffs.evidence_json was persisted as invalid JSON (json_valid=0)
# and evidence_incomplete stayed 0 when the evidence DB query failed. These assertions are the
# repeatable form of the manual one-off checks the dev phase recorded in the tracking file.
Write-Host "`n[Group 8] whp-4 stop-report heartbeat / evidence (CR F7)" -ForegroundColor Yellow

$hbRunId   = [guid]::NewGuid().ToString()
$hbStoryId = 'smoke-whp4-hb-' + (Get-Random)
$hbIpcDir  = Join-Path $env:TEMP "smoke-whp4-hb-ipc-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $hbIpcDir | Out-Null
$hbOrigRunId = $env:PIPELINE_RUN_ID
$hbProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$hbDbForJs = (Join-Path $hbProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$hbModForJs = (Join-Path $hbProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'

function Invoke-SmokeStopReport {
    param([string]$Phase, [string]$StoryIdArg, [string]$ReportPath = '', [switch]$NoRunId, [string]$Cwd = '')
    $useCwd = if ($Cwd) { $Cwd } else { $hbProjectRoot }
    $env:PHYCOOL_ORCHESTRATOR_MODE = '1'
    $env:PIPELINE_STORY_ID    = $StoryIdArg
    $env:PIPELINE_PHASE       = $Phase
    $env:PIPELINE_IPC_DIR     = $hbIpcDir
    $env:PIPELINE_REPORT_PATH = $ReportPath
    if ($NoRunId) { Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue } else { $env:PIPELINE_RUN_ID = $hbRunId }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName  = 'powershell'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'stop-report.ps1')`""
    $psi.WorkingDirectory = $hbProjectRoot
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $proc = [Diagnostics.Process]::Start($psi)
    $proc.StandardInput.Write((@{ session_id = $hbRunId; cwd = $useCwd } | ConvertTo-Json -Compress))
    $proc.StandardInput.Close()
    $proc.StandardOutput.ReadToEnd() | Out-Null
    $proc.WaitForExit()
    return $proc.ExitCode
}

function Get-SmokeHbRow {
    $js = Join-Path $env:TEMP "smoke-whp4-hb-q-$(Get-Random).js"
    $l = @(
        "const D=require('$hbModForJs');",
        "const db=new D('$hbDbForJs',{readonly:true});",
        "const r=db.prepare('SELECT turn_count, last_status, evidence_incomplete FROM worker_runs WHERE run_id=?').get('$hbRunId');",
        "const h=db.prepare('SELECT gate_result, json_valid(evidence_json) jv FROM worker_handoffs WHERE run_id=?').get('$hbRunId');",
        "console.log(JSON.stringify({run:r,handoff:h}));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out
}

# whp-11 T5: this group's stop-report.ps1 calls against $hbProjectRoot carry a real
# PIPELINE_RUN_ID with no seeded worker_messages row, so every one of them is now a D2 MISS that
# waits out the full workerProtocol.hookGraceSec (live default 120s, BR-002) before falling
# through -- unrelated to what this group actually tests. Same backup/override/restore idiom as
# Group 11's resumeEnabled override below.
$hbCfgPath = Join-Path $hbProjectRoot 'scripts\pipeline-config.json'
$hbCfgBackup = "$hbCfgPath.smoke-backup-$(Get-Random)"
Copy-Item $hbCfgPath $hbCfgBackup -Force
$hbCfgObj = [System.IO.File]::ReadAllText($hbCfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
$hbCfgObj.workerProtocol.hookGraceSec = 1
[System.IO.File]::WriteAllText($hbCfgPath, ($hbCfgObj | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

try {
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Register `
        -RunId $hbRunId -StoryId $hbStoryId -Phase 'general' -IpcDir $hbIpcDir -SessionId $hbRunId `
        -ControllerTrack 'smoke' -Attempt 1 | Out-Null

    # AC5: dedup guard is gone -- two consecutive turns must both run and accumulate.
    $hbExit1 = Invoke-SmokeStopReport -Phase 'general' -StoryIdArg $hbStoryId -ReportPath (Join-Path $hbIpcDir 'r.md')
    Assert-Equal "T-CR-1: stop-report exits 0 (fail-open)" 0 $hbExit1
    Assert-True  "T-CR-2: status-general.json written" (Test-Path (Join-Path $hbIpcDir 'status-general.json'))
    $null = Invoke-SmokeStopReport -Phase 'general' -StoryIdArg $hbStoryId -ReportPath (Join-Path $hbIpcDir 'r.md')
    $hbRow = Get-SmokeHbRow
    Assert-Equal "T-CR-3 (AC5): turn_count accumulates across turns (old dedup guard made this impossible)" 2 $hbRow.run.turn_count

    # AC6: evidence_json must be parseable -- report_path is a Windows path, so this is the exact
    # shape that used to land in the DB with unescaped backslashes.
    Assert-Equal "T-CR-4 (AC6): worker_handoffs.evidence_json is valid JSON" 1 $hbRow.handoff.jv
    Assert-Equal "T-CR-5 (AC6): gate_result untouched by stop-report (whp-5 owns it)" 'pending' $hbRow.handoff.gate_result

    # AC7: when the evidence DB query item fails, evidence_incomplete must be 1 (not a silent partial).
    # Reproduces AC7's literal Given ("rename phycool.db") with a throwaway project root that has a
    # .claude marker and a copy of pipeline-config.json but no DB -- so ONLY the Story-query item
    # fails and the phaseTargetStatus read (the other path that raises this flag) still succeeds.
    $fakeRoot = Join-Path $env:TEMP "smoke-whp4-noDb-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path (Join-Path $fakeRoot '.claude') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $fakeRoot 'scripts') | Out-Null
    Copy-Item (Join-Path $hbProjectRoot 'scripts\pipeline-config.json') (Join-Path $fakeRoot 'scripts\pipeline-config.json') -Force
    $null = Invoke-SmokeStopReport -Phase 'dev-story' -StoryIdArg $hbStoryId -NoRunId -Cwd $fakeRoot
    $sfBroken = Join-Path $hbIpcDir 'status-dev-story.json'
    $evBroken = ([System.IO.File]::ReadAllText($sfBroken, [System.Text.Encoding]::UTF8) | ConvertFrom-Json).evidence
    Assert-Equal "T-CR-6 (AC7): evidence_incomplete=1 when the evidence DB query item fails" 1 $evBroken.evidence_incomplete
    Remove-Item $fakeRoot -Recurse -Force -ErrorAction SilentlyContinue

    # Control arm: a well-formed (nonexistent) story id queries fine -> flag stays 0.
    $null = Invoke-SmokeStopReport -Phase 'dev-story' -StoryIdArg 'smoke-whp4-hb-absent'
    $evOk = ([System.IO.File]::ReadAllText($sfBroken, [System.Text.Encoding]::UTF8) | ConvertFrom-Json).evidence
    Assert-Equal "T-CR-7 (AC7 control): evidence_incomplete stays 0 when the query succeeds" 0 $evOk.evidence_incomplete
    Assert-Equal "T-CR-8 (AC8): workflow_invoked present on a BMAD phase" 'unknown' $evOk.workflow_invoked

    # AC8: general phase carries no workflow_invoked key at all.
    $evGeneral = ([System.IO.File]::ReadAllText((Join-Path $hbIpcDir 'status-general.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json).evidence
    Assert-True "T-CR-9 (AC8): general phase evidence has no workflow_invoked key" `
        (-not ($evGeneral.PSObject.Properties.Name -contains 'workflow_invoked'))

    # BC-07: no PIPELINE_RUN_ID -> DB untouched, IPC status still written.
    $turnsBefore = (Get-SmokeHbRow).run.turn_count
    $null = Invoke-SmokeStopReport -Phase 'general' -StoryIdArg $hbStoryId -ReportPath (Join-Path $hbIpcDir 'r.md') -NoRunId
    Assert-Equal "T-CR-10 (BC-07): no PIPELINE_RUN_ID means zero DB heartbeat" $turnsBefore (Get-SmokeHbRow).run.turn_count
} finally {
    Copy-Item $hbCfgBackup $hbCfgPath -Force
    Remove-Item $hbCfgBackup -ErrorAction SilentlyContinue
    if ($hbOrigRunId) { $env:PIPELINE_RUN_ID = $hbOrigRunId } else { Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue }
    Remove-Item Env:\PHYCOOL_ORCHESTRATOR_MODE, Env:\PIPELINE_STORY_ID, Env:\PIPELINE_PHASE, Env:\PIPELINE_IPC_DIR, Env:\PIPELINE_REPORT_PATH -ErrorAction SilentlyContinue
    $hbCleanJs = Join-Path $env:TEMP "smoke-whp4-hb-clean-$(Get-Random).js"
    $hbCleanLines = @(
        "const D=require('$hbModForJs');",
        "const db=new D('$hbDbForJs');",
        "db.prepare('DELETE FROM worker_runs WHERE run_id = ?').run('$hbRunId');",
        "db.prepare('DELETE FROM worker_handoffs WHERE run_id = ?').run('$hbRunId');"
    )
    [System.IO.File]::WriteAllText($hbCleanJs, ($hbCleanLines -join "`n"), [System.Text.UTF8Encoding]::new($false))
    & node $hbCleanJs 2>$null | Out-Null
    Remove-Item $hbCleanJs -ErrorAction SilentlyContinue
    Remove-Item $hbIpcDir -Recurse -Force -ErrorAction SilentlyContinue
}

# -- Test Group 9: whp-2-no-autoclose-liveness no-auto-close assertions (AC1/AC2/AC3/AC5/AC6/AC8) --
# Static-grep regression lock: the close watchdog / self-kill tail / adaptive-wait / lingering
# branch / Get-ActivityFingerprint were commented out (BR-012, archived not deleted). These
# assertions fail loud if a future edit accidentally uncomments (or re-adds elsewhere) any of them.
Write-Host "`n[Group 9] whp-2 no-auto-close static assertions" -ForegroundColor Yellow

$g9WorkerFiles = @('worker-general.ps1', 'worker-create.ps1', 'worker-dev.ps1', 'worker-review.ps1')
$g9DispatchFile = Join-Path $PSScriptRoot 'dispatch-general.ps1'
$g9SharedFile   = Join-Path $PSScriptRoot 'shared-utils.ps1'

# CR-R2 修復(TD-WHP2-SMOKE-TEST-REDUNDANT-FILE-SCANS):Group 9 原本對同一檔案以每個 pattern
# 各發一次 Select-String -Path 重複讀檔(4 支 worker 各約 7 次、dispatch-general.ps1 約 5 次)。
# 改為讀檔一次進 cache,後續全部於記憶體內比對 -- 呼叫端簽名不變,零 call-site 改動。
# 語意等價:Select-String 與 PowerShell -match 皆預設 case-insensitive regex。
$Script:G9FileCache = @{}
function Get-G9Lines {
    param([string]$Path)
    if (-not $Script:G9FileCache.ContainsKey($Path)) {
        $Script:G9FileCache[$Path] = @(Get-Content -Path $Path -ErrorAction SilentlyContinue)
    }
    return $Script:G9FileCache[$Path]
}

function Get-NonCommentHitCount {
    param([string]$Path, [string]$Pattern)
    return @(Get-G9Lines -Path $Path | Where-Object { $_ -match $Pattern -and $_.TrimStart() -notmatch '^#' }).Count
}

# AC1: Start-Job -- zero executable occurrence across all 4 workers.
$g9StartJobHits = 0
foreach ($wf in $g9WorkerFiles) {
    $g9StartJobHits += (Get-NonCommentHitCount -Path (Join-Path $PSScriptRoot $wf) -Pattern 'Start-Job')
}
Assert-Equal "T-WHP2-1 (AC1): Start-Job has zero executable hits across worker-{general,create,dev,review}.ps1" 0 $g9StartJobHits

# AC2: Stop-Process -Id $PID -Force / Start-Countdown -- zero executable occurrence.
$g9SelfKillHits = 0
foreach ($wf in $g9WorkerFiles) {
    $g9SelfKillHits += (Get-NonCommentHitCount -Path (Join-Path $PSScriptRoot $wf) -Pattern 'Stop-Process -Id \$PID -Force')
    # CR-R2: pattern 由 'Start-Countdown -Seconds' 放寬為 'Start-Countdown' -- 原正則綁死具名參數,
    # 若未來以位置參數形式復活(Start-Countdown $countdown)會整條漏測(同 bwu-8 "閘門正則過窄" 類)。
    $g9SelfKillHits += (Get-NonCommentHitCount -Path (Join-Path $PSScriptRoot $wf) -Pattern 'Start-Countdown')
}
Assert-Equal "T-WHP2-2 (AC2): Stop-Process self-kill / Start-Countdown have zero executable hits across all 4 workers" 0 $g9SelfKillHits

# AC3/BR-005: workerProtocol.autoCloseEnabled exists, is boolean false, config remains valid JSON.
$g9CfgPath = Join-Path $PSScriptRoot '..\..\..\..\scripts\pipeline-config.json'
$g9Cfg = [System.IO.File]::ReadAllText((Resolve-Path $g9CfgPath), [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
Assert-Equal "T-WHP2-3 (AC3/BR-005): workerProtocol.autoCloseEnabled is boolean False" $false $g9Cfg.workerProtocol.autoCloseEnabled

# AC5: dispatch-general.ps1 has zero executable Stop-WorkerSafe / Get-ActivityFingerprint references.
Assert-Equal "T-WHP2-4 (AC5): dispatch-general.ps1 Stop-WorkerSafe has zero executable hits" 0 `
    (Get-NonCommentHitCount -Path $g9DispatchFile -Pattern 'Stop-WorkerSafe')
Assert-Equal "T-WHP2-5 (AC5): dispatch-general.ps1 Get-ActivityFingerprint has zero executable hits" 0 `
    (Get-NonCommentHitCount -Path $g9DispatchFile -Pattern 'Get-ActivityFingerprint')

# AC5 regression guard: Stop-WorkerSafe function body must still be DEFINED in shared-utils.ps1
# (whp-6 close-worker.ps1 depends on it) -- this card removes only the dispatch-side caller.
Assert-Equal "T-WHP2-6 (AC5 regression guard): shared-utils.ps1 still defines function Stop-WorkerSafe (exactly once)" 1 `
    (Get-NonCommentHitCount -Path $g9SharedFile -Pattern 'function Stop-WorkerSafe')

# AC5: Get-DirtyFiles must retain exactly 2 executable call sites (baseline snapshot + post-dispatch
# diff) after Get-ActivityFingerprint's internal call site was removed with it. Strip trailing
# comments before matching -- a bare '^#' check misses lines like ":74 ... # Get-DirtyFiles 差集 root"
# where the mention is in a trailing comment, not the executable part of the line.
$g9DirtyFilesHits = Get-G9Lines -Path $g9DispatchFile |
    Where-Object {
        $g9CodePart = ($_ -split '#', 2)[0]
        $g9CodePart -match 'Get-DirtyFiles' -and $g9CodePart -notmatch 'function Get-DirtyFiles'
    }
Assert-Equal "T-WHP2-7 (AC5): Get-DirtyFiles has exactly 2 executable call sites (baseline + diff)" 2 @($g9DirtyFilesHits).Count

# AC6: all 4 worker window titles begin with the literal [⚠ 勿關閉] prefix.
foreach ($wf in $g9WorkerFiles) {
    $g9TitleLine = @(Get-G9Lines -Path (Join-Path $PSScriptRoot $wf) | Where-Object { $_ -match 'WindowTitle = "\[⚠ 勿關閉\]' })
    Assert-True "T-WHP2-8 (AC6): $wf WindowTitle carries the [⚠ 勿關閉] warning prefix" ([bool]$g9TitleLine)
}

# AC8: each of the 5 archived blocks carries a 'whp-2' marker adjacent to it (archival, not deletion).
$g9Whp2MarkerFiles = $g9WorkerFiles + @('dispatch-general.ps1')
foreach ($wf in $g9Whp2MarkerFiles) {
    $g9MarkerHit = @(Get-G9Lines -Path (Join-Path $PSScriptRoot $wf) | Where-Object { $_ -match 'whp-2' })
    Assert-True "T-WHP2-9 (AC8): $wf carries at least one whp-2 archival marker" ([bool]$g9MarkerHit)
}

# T-WHP2-10 (CR fix regression lock): early-failure detection (worker exits before claude.exe ever
# spawns, e.g. task file missing / story not in DB) must be wired end-to-end -- both the $workerFailed
# detection inside the confirm-wait loop AND the final $outcome/exit-code branches must reference
# 'worker-reported-failed', or a future edit could silently break either half and regress to the
# CR-verified bug (early failure misreported as exit 0 / spawned-pending-guardian).
$g9WorkerFailedHits = @(Get-G9Lines -Path $g9DispatchFile |
    Where-Object { ($_ -split '#', 2)[0] -match 'worker-reported-failed' })
Assert-True "T-WHP2-10 (CR fix): dispatch-general.ps1 wires worker-reported-failed in >=3 places (outcome assign / WARN print / exit check)" (@($g9WorkerFailedHits).Count -ge 3)

# T-WHP2-11 (CR-R2 regression lock): $watchdog 變數與其 cleanup guard 已一併封存。R1 CR 曾將
# "$watchdog 恆 null 使 cleanup guard 永久不可達" 列為 ACCEPTED debt,CR-R2 依 cr-debt-doc-audit.md
# §A2.3(FixCost <= S=2 禁止 ACCEPT)實修。本斷言鎖住修復,防未來 edit 讓死碼復活。
$g9WatchdogHits = 0
foreach ($wf in $g9WorkerFiles) {
    $g9WatchdogHits += (Get-NonCommentHitCount -Path (Join-Path $PSScriptRoot $wf) -Pattern '\$watchdog')
}
Assert-Equal "T-WHP2-11 (CR-R2): `$watchdog has zero executable hits across all 4 workers (dead cleanup guard retired)" 0 $g9WatchdogHits

# T-WHP2-12 (CR-R2 doc-contract lock): dispatch-general.ps1 檔頭 Exit codes 契約不得再宣告 exit 2 /
# timeout / lingering(BR-009 明文 SHALL NOT produce)。R1 修了 template 的漂移卻漏了本檔自己的檔頭。
$g9HeaderText = ((Get-G9Lines -Path $g9DispatchFile) | Select-Object -First 40) -join "`n"
Assert-True "T-WHP2-12 (CR-R2): dispatch-general.ps1 header no longer advertises the retired exit-2 / lingering contract" `
    ($g9HeaderText -notmatch '2 = timeout/lingering' -and $g9HeaderText -notmatch 'Hybrid wait')

# -- Test Group 10: whp-6 D1 directive injection static assertions (AC5/AC6/BR-008/010/011/012) --
# AC5's line-order assertion and AC6's "ultrathink stays last" invariant are both structural
# (source-order) properties of a script PowerShell executes top-to-bottom -- no real worker
# spawn (and no real `claude` launch) is needed to verify them.
Write-Host "`n[Group 10] whp-6 D1 directive injection (static)" -ForegroundColor Yellow

$g10Workers = @('worker-dev.ps1', 'worker-create.ps1', 'worker-review.ps1', 'worker-general.ps1')
foreach ($wf in $g10Workers) {
    $wPath = Join-Path $PSScriptRoot $wf
    $lines = Get-Content -Path $wPath

    $readerHitIdx  = @()
    $userTaskIdx   = @()
    $claudeCallIdx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $codePart = ($lines[$i] -split '#', 2)[0]
        if ($codePart -match 'read-worker-directives\.js') { $readerHitIdx += $i }
        # Exclude the D1 block's own prepend reassignment ($userTask = $directiveOutput + ... + $userTask) --
        # that line is the injection itself, not a competing "userTask built here" site to order against.
        if ($codePart -match '\$userTask\s*=' -and $codePart -notmatch 'directiveOutput') { $userTaskIdx += $i }
        if ($claudeCallIdx -lt 0 -and $codePart -match '&\s*claude\s') { $claudeCallIdx = $i }
    }

    Assert-Equal "T-WHP6-D1-1 (AC5): $wf references read-worker-directives.js exactly once" 1 $readerHitIdx.Count
    if ($readerHitIdx.Count -eq 1 -and $userTaskIdx.Count -ge 1 -and $claudeCallIdx -ge 0) {
        $firstUserTaskIdx = ($userTaskIdx | Measure-Object -Minimum).Minimum
        Assert-True "T-WHP6-D1-2 (AC5): $wf reader call line > first `$userTask = line" `
            ($readerHitIdx[0] -gt $firstUserTaskIdx)
        Assert-True "T-WHP6-D1-3 (AC5): $wf reader call line < & claude line" `
            ($readerHitIdx[0] -lt $claudeCallIdx)
        # AC6: every `$userTask = ...` assignment (heredoc open / ultrathink append) must appear
        # BEFORE the D1 block -- D1 only ever prefixes an already-fully-assembled string, so
        # ultrathink (appended earlier) structurally remains the last segment.
        $lastUserTaskIdx = ($userTaskIdx | Measure-Object -Maximum).Maximum
        Assert-True "T-WHP6-D1-4 (AC6): $wf D1 block comes after every `$userTask = assignment (ultrathink stays last)" `
            ($readerHitIdx[0] -gt $lastUserTaskIdx)
    }

    Assert-True "T-WHP6-D1-5 (BR-010/BR-012): $wf D1 block wrapped in try/catch" `
        (($lines -join "`n") -match '(?s)if\s*\(\(\$task\.PSObject\.Properties\.Name -contains ''run_id''\).*?try\s*\{.*?\}\s*catch\s*\{')
    Assert-True "T-WHP6-D1-6 (BR-010): $wf logs 'D1 skipped' on reader error/non-zero exit" `
        ((Get-NonCommentHitCount -Path $wPath -Pattern 'D1 skipped \(reader') -ge 2)
    Assert-True "T-WHP6-D1-7 (BR-012): $wf logs 'D1 skipped (no run_id)' when run_id absent" `
        ((Get-NonCommentHitCount -Path $wPath -Pattern 'D1 skipped \(no run_id\)') -eq 1)
    Assert-True "T-WHP6-D1-8 (BR-014): $wf prefers --resume over --session-id when resume_session_id present" `
        ((Get-NonCommentHitCount -Path $wPath -Pattern "'--resume'") -eq 1)
}

# -- Test Group 11: whp-6 -Resume plumbing (BR-013/015/016/017) via real DB + -DryRun ----------
# -DryRun resolves -Resume against the real DB (read-only query) and prints the outcome without
# writing a task file, registering a run, or spawning a worker -- safe to run in an automated suite.
Write-Host "`n[Group 11] whp-6 -Resume session lookup (DryRun)" -ForegroundColor Yellow

function Invoke-SmokeDispatchDryRun {
    param([string]$StoryId, [switch]$Resume)
    $dispatchArgs = @('-TaskId', $StoryId, '-Phase', 'general', '-PromptFile', $g11PromptFile, '-Model', 'sonnet-5', '-DryRun')
    if ($Resume) { $dispatchArgs += '-Resume' }
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'dispatch-general.ps1') @dispatchArgs 2>&1 | Out-String
    return $out
}

$g11ProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$g11DbPath      = (Join-Path $g11ProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$g11ModPath     = (Join-Path $g11ProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$g11PromptFile  = Join-Path $env:TEMP "smoke-whp6-resume-prompt-$(Get-Random).txt"
[System.IO.File]::WriteAllText($g11PromptFile, "smoke test prompt", [System.Text.UTF8Encoding]::new($false))

# NOTE: JS source lines below are built in PowerShell DOUBLE-quoted strings (for $var interpolation) --
# the JS itself deliberately uses single-quoted string literals only, never backtick template literals
# (backtick is PowerShell's own escape character inside a double-quoted string, not a literal backtick).
# $prevEAP/'Continue' wrap matches the existing pattern used throughout dispatch-general.ps1 (preflight
# / register-run.ps1 calls): under this file's global $ErrorActionPreference='Stop', a native command
# that exits non-zero AND writes to stderr throws a NativeCommandError even when that stream is
# redirected to $null -- the redirect suppresses the displayed text but not PowerShell 5.1's own
# ErrorRecord creation. 'Continue' lets $LASTEXITCODE do its normal job instead.
function Invoke-SmokeNodeScript {
    param([string]$ScriptPath)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & node $ScriptPath 2>$null | Out-Null
    $ErrorActionPreference = $prevEAP
}

# -- whp-11 CR: stale smoke-run sweep (suite start) --------------------------------------------
# Interrupted past runs (Ctrl-C before a group's finally) leave smoke-% rows in the live DB; the
# resident guardian then reaps them abandoned + requires_attention=1 and worker-notify-inject.js
# spams them into every controller prompt (observed live: smoke-whp2 / smoke-whp4-hb leftovers).
# Sweep once at suite start -- story_id LIKE 'smoke-%' is this suite's own namespace (every group
# seeds under it), so the delete cannot touch real runs.
$sweepProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$sweepModPath = (Join-Path $sweepProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$sweepDbPath  = (Join-Path $sweepProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$sweepJs = Join-Path $env:TEMP "smoke-stale-sweep-$(Get-Random).js"
$sweepLines = @(
    "const D = require('$sweepModPath');",
    "const db = new D('$sweepDbPath');",
    "const ids = db.prepare('SELECT run_id FROM worker_runs WHERE story_id LIKE ?').all('smoke-%').map(function (r) { return r.run_id; });",
    "for (const id of ids) { db.prepare('DELETE FROM worker_messages WHERE run_id=?').run(id); db.prepare('DELETE FROM worker_handoffs WHERE run_id=?').run(id); db.prepare('DELETE FROM worker_runs WHERE run_id=?').run(id); }",
    "if (ids.length) console.log('[sweep] removed ' + ids.length + ' stale smoke runs');"
)
[System.IO.File]::WriteAllText($sweepJs, ($sweepLines -join "`n"), [System.Text.UTF8Encoding]::new($false))
Invoke-SmokeNodeScript -ScriptPath $sweepJs
Remove-Item $sweepJs -ErrorAction SilentlyContinue

function Invoke-SmokeResumeSeed {
    param([string]$StoryId, [string]$RunId, [string]$SessionId, [string]$StartedAt, [int]$Attempt = 1)
    $js = Join-Path $env:TEMP "smoke-whp6-seed-$(Get-Random).js"
    $l = @(
        "const D = require('$g11ModPath');",
        "const db = new D('$g11DbPath');",
        "db.prepare('INSERT INTO worker_runs (run_id, session_id, story_id, phase, attempt, ipc_dir, run_mode, lifecycle, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('$RunId','$SessionId','$StoryId','general',$Attempt,'C:/smoke/ipc','window','closed','$StartedAt','$StartedAt');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Remove-SmokeResumeStory {
    param([string]$StoryId)
    $js = Join-Path $env:TEMP "smoke-whp6-resume-clean-$(Get-Random).js"
    $l = @(
        "const D = require('$g11ModPath');",
        "const db = new D('$g11DbPath');",
        "db.prepare('DELETE FROM worker_runs WHERE story_id=?').run('$StoryId');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

# BR-013/BR-016: two prior runs (A older, B newer) -> DryRun picks B (most recent session_id).
# Distinct -Attempt values are required: ux_worker_runs_key is UNIQUE(story_id, phase, attempt), and
# both rows deliberately share (story_id, phase='general') to simulate one story dispatched twice.
$g11StoryWithHistory = 'smoke-whp6-resume-' + (Get-Random)
$g11FreshStory        = 'smoke-whp6-resume-fresh-' + (Get-Random)
$g11RunA = [guid]::NewGuid().ToString(); $g11SessA = [guid]::NewGuid().ToString()
$g11RunB = [guid]::NewGuid().ToString(); $g11SessB = [guid]::NewGuid().ToString()
try {
    Invoke-SmokeResumeSeed -StoryId $g11StoryWithHistory -RunId $g11RunA -SessionId $g11SessA -StartedAt '2026-01-01T00:00:00+08:00' -Attempt 1
    Invoke-SmokeResumeSeed -StoryId $g11StoryWithHistory -RunId $g11RunB -SessionId $g11SessB -StartedAt '2026-01-01T00:00:01+08:00' -Attempt 2

    $g11OutWithHistory = Invoke-SmokeDispatchDryRun -StoryId $g11StoryWithHistory -Resume
    Assert-True "T-WHP6-RESUME-1 (BR-013/016): -Resume with prior history resolves to the NEWER session (B)" `
        ($g11OutWithHistory -match [regex]::Escape("resume=$g11SessB"))
    Assert-True "T-WHP6-RESUME-2 (BR-016): resolved output names run_id=B as resumed_from_run_id" `
        ($g11OutWithHistory -match [regex]::Escape("from run=$g11RunB"))

    # BR-015: brand-new story (no history) -> WARN + fallback, no resume= in output.
    $g11OutFresh = Invoke-SmokeDispatchDryRun -StoryId $g11FreshStory -Resume
    Assert-True "T-WHP6-RESUME-3 (BR-015): -Resume on a fresh story logs a WARN + falls back" `
        ($g11OutFresh -match 'no prior session found')
    Assert-True "T-WHP6-RESUME-4 (BR-015): fresh-story DryRun output reports resume=none" `
        ($g11OutFresh -match 'resume=none')

    # BR-017: resumeEnabled=false in config -> WARN naming the exact key, fallback regardless of history.
    $g11CfgPath = Join-Path $g11ProjectRoot 'scripts\pipeline-config.json'
    $g11CfgBackup = "$g11CfgPath.smoke-backup-$(Get-Random)"
    Copy-Item $g11CfgPath $g11CfgBackup -Force
    try {
        $g11Cfg = [System.IO.File]::ReadAllText($g11CfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        $g11Cfg.workerProtocol.resumeEnabled = $false
        [System.IO.File]::WriteAllText($g11CfgPath, ($g11Cfg | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
        $g11OutDisabled = Invoke-SmokeDispatchDryRun -StoryId $g11StoryWithHistory -Resume
        Assert-True "T-WHP6-RESUME-5 (BR-017): resumeEnabled=false logs the literal key=value in the WARN" `
            ($g11OutDisabled -match 'resumeEnabled=false')
        Assert-True "T-WHP6-RESUME-6 (BR-017): resumeEnabled=false falls back regardless of history" `
            ($g11OutDisabled -match 'resume=none')
    } finally {
        Copy-Item $g11CfgBackup $g11CfgPath -Force
        Remove-Item $g11CfgBackup -ErrorAction SilentlyContinue
    }

    # Control: no -Resume switch at all -> resume=n/a, no lookup attempted.
    $g11OutNoResume = Invoke-SmokeDispatchDryRun -StoryId $g11StoryWithHistory
    Assert-True "T-WHP6-RESUME-7 (control): omitting -Resume reports resume=n/a" `
        ($g11OutNoResume -match 'resume=n/a')
} finally {
    Remove-SmokeResumeStory -StoryId $g11StoryWithHistory
    Remove-SmokeResumeStory -StoryId $g11FreshStory
    Remove-Item $g11PromptFile -ErrorAction SilentlyContinue
}

# -- Test Group 12: whp-6 close-worker.ps1 integration (AC9-AC12, BR-028/031/032/033/034) ------
# Precondition (BR-024/five checks) and liveness-branch (BR-026/027/029) logic already has 14
# unit tests directly against close-worker-ops.js (Group scope there: zero process spawn). This
# group covers what only exists at the close-worker.ps1 (PowerShell) layer: real taskkill against
# a real disposable dummy process, -DryRun ordering, the bounded confirm window, and the
# machine-readable CLOSE_RESULT line -- plus two real end-to-end smoke checks (AC9/AC10) that a
# full `.\close-worker.ps1` invocation (not just the Node layer) produces the right exit code.
Write-Host "`n[Group 12] whp-6 close-worker.ps1 (integration)" -ForegroundColor Yellow

$g12ProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$g12DbPath   = (Join-Path $g12ProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$g12ModPath  = (Join-Path $g12ProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$g12ClosePs1 = Join-Path $PSScriptRoot 'close-worker.ps1'

function Invoke-SmokeCloseWorkerSeed {
    param([string]$RunId, [string]$StoryId, [string]$ControllerTrack = 'backend', [int]$WrapperPid = 0, [string]$IpcDir = 'C:/smoke/ipc')
    $js = Join-Path $env:TEMP "smoke-whp6-close-seed-$(Get-Random).js"
    $l = @(
        "const D = require('$g12ModPath');",
        "const db = new D('$g12DbPath');",
        "const t = '2026-01-01T00:00:00+08:00';",
        "db.prepare('INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle, controller_track, wrapper_pid, ack_at, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('$RunId','$RunId','$StoryId','dev-story','$IpcDir','window','approved','$ControllerTrack',$WrapperPid,t,t,t);",
        "db.prepare('INSERT INTO worker_handoffs (run_id, story_id, phase, gate_result, gate_by, gate_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').run('$RunId','$StoryId','dev-story','approved','CC-TEST',t,t,t);"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Set-SmokeCloseWorkerLifecycle {
    param([string]$RunId, [string]$Lifecycle)
    $js = Join-Path $env:TEMP "smoke-whp6-close-setlc-$(Get-Random).js"
    $l = @(
        "const D = require('$g12ModPath');",
        "const db = new D('$g12DbPath');",
        "db.prepare('UPDATE worker_runs SET lifecycle=? WHERE run_id=?').run('$Lifecycle', '$RunId');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Remove-SmokeCloseWorkerRun {
    param([string]$RunId)
    $js = Join-Path $env:TEMP "smoke-whp6-close-clean-$(Get-Random).js"
    $l = @(
        "const D = require('$g12ModPath');",
        "const db = new D('$g12DbPath');",
        "db.prepare('DELETE FROM worker_runs WHERE run_id=?').run('$RunId');",
        "db.prepare('DELETE FROM worker_handoffs WHERE run_id=?').run('$RunId');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Get-SmokeCloseWorkerRow {
    param([string]$RunId)
    $js = Join-Path $env:TEMP "smoke-whp6-close-q-$(Get-Random).js"
    $l = @(
        "const D = require('$g12ModPath');",
        "const db = new D('$g12DbPath', {readonly:true});",
        "console.log(JSON.stringify(db.prepare('SELECT lifecycle, close_source, closed_at, closed_detected_at, requires_attention FROM worker_runs WHERE run_id=?').get('$RunId')));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = & node $js
    Remove-Item $js -ErrorAction SilentlyContinue
    return ($out | ConvertFrom-Json)
}

# Spawns a real, disposable dummy process whose CommandLine deliberately embeds the ipc_dir and
# "worker-dev.ps1" substrings judgeLiveness() greps for -- lets the "alive" branch resolve to true
# via the REAL probeLiveProcesses() (repo-wide WMI scan). A full close-worker.ps1 invocation is a
# separate process from this test runner, so injecting a fake probeFn (as the pure-JS unit tests
# do) is not an option here; a real matching process is the only way to exercise this path.
function Start-SmokeAliveDummy {
    param([string]$IpcDir)
    $cmd = "# ipc_dir=$IpcDir worker-dev.ps1 marker`nStart-Sleep -Seconds 120"
    $proc = Start-Process powershell -ArgumentList @('-NoProfile', '-Command', $cmd) -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 300   # let WMI/CIM catch up so its CommandLine is queryable
    return $proc
}

try {
    # AC11/BR-034: -DryRun prints "C4 WOULD WRITE" before "C5 WOULD KILL", zero DB write.
    $g12RunDry = [guid]::NewGuid().ToString(); $g12StoryDry = 'smoke-whp6-close-dry-' + (Get-Random)
    $g12DummyDry = Start-SmokeAliveDummy -IpcDir 'C:/smoke/dry-ipc'
    try {
        Invoke-SmokeCloseWorkerSeed -RunId $g12RunDry -StoryId $g12StoryDry -WrapperPid $g12DummyDry.Id -IpcDir 'C:/smoke/dry-ipc'
        $beforeDry = Get-SmokeCloseWorkerRow -RunId $g12RunDry
        $dryOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $g12ClosePs1 -RunId $g12RunDry -CallerTrack backend -DryRun 2>&1 | Out-String
        $writeIdx = $dryOut.IndexOf('C4 WOULD WRITE')
        $killIdx  = $dryOut.IndexOf('C5 WOULD KILL')
        Assert-True "T-WHP6-CLOSE-1 (AC11): -DryRun prints C4 WOULD WRITE before C5 WOULD KILL" `
            ($writeIdx -ge 0 -and $killIdx -gt $writeIdx)
        $afterDry = Get-SmokeCloseWorkerRow -RunId $g12RunDry
        Assert-Equal "T-WHP6-CLOSE-2 (BR-034): -DryRun performs zero DB writes (lifecycle unchanged)" $beforeDry.lifecycle $afterDry.lifecycle
    } finally {
        Stop-Process -Id $g12DummyDry.Id -Force -ErrorAction SilentlyContinue
        Remove-SmokeCloseWorkerRun -RunId $g12RunDry
    }

    # BR-033: a real successful close (alive -> CAS write -> taskkill -> confirm -> CLOSE_RESULT).
    $g12RunReal = [guid]::NewGuid().ToString(); $g12StoryReal = 'smoke-whp6-close-real-' + (Get-Random)
    $g12DummyReal = Start-SmokeAliveDummy -IpcDir 'C:/smoke/real-ipc'
    try {
        Invoke-SmokeCloseWorkerSeed -RunId $g12RunReal -StoryId $g12StoryReal -WrapperPid $g12DummyReal.Id -IpcDir 'C:/smoke/real-ipc'
        $realOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $g12ClosePs1 -RunId $g12RunReal -CallerTrack backend 2>&1 | Out-String
        $realLines = @($realOut -split "`r?`n" | Where-Object { $_.Trim() })
        Assert-True "T-WHP6-CLOSE-3 (BR-033): stdout's last line matches CLOSE_RESULT: {...lifecycle:closed...}" `
            ($realLines.Count -gt 0 -and $realLines[-1] -match '^CLOSE_RESULT: \{.*"lifecycle":"closed".*\}$')
        $afterReal = Get-SmokeCloseWorkerRow -RunId $g12RunReal
        Assert-Equal "T-WHP6-CLOSE-4: real close writes lifecycle=closed" 'closed' $afterReal.lifecycle
        Assert-Equal "T-WHP6-CLOSE-5: real close writes close_source=ControllerAfterHandshake" 'ControllerAfterHandshake' $afterReal.close_source
        Assert-True "T-WHP6-CLOSE-6: taskkill actually terminated the dummy process" `
            (-not (Get-Process -Id $g12DummyReal.Id -ErrorAction SilentlyContinue))
    } finally {
        Stop-Process -Id $g12DummyReal.Id -Force -ErrorAction SilentlyContinue
        Remove-SmokeCloseWorkerRun -RunId $g12RunReal
    }

    # AC12/BR-031: PHYCOOL_CLOSEWORKER_FORCE_SURVIVE (test-only escape hatch, see close-worker.ps1
    # Test-CloseWorkerProcessAlive) simulates taskkill being ineffective without needing a real
    # unkillable process -- confirm window expires, requires_attention=1, exit 1, no Stop-Process.
    $g12RunTimeout = [guid]::NewGuid().ToString(); $g12StoryTimeout = 'smoke-whp6-close-timeout-' + (Get-Random)
    $g12DummyTimeout = Start-SmokeAliveDummy -IpcDir 'C:/smoke/timeout-ipc'
    $g12CfgPath = Join-Path $g12ProjectRoot 'scripts\pipeline-config.json'
    $g12CfgBackup = "$g12CfgPath.smoke-backup-$(Get-Random)"
    Copy-Item $g12CfgPath $g12CfgBackup -Force
    try {
        Invoke-SmokeCloseWorkerSeed -RunId $g12RunTimeout -StoryId $g12StoryTimeout -WrapperPid $g12DummyTimeout.Id -IpcDir 'C:/smoke/timeout-ipc'
        $g12Cfg = [System.IO.File]::ReadAllText($g12CfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        $g12Cfg.workerProtocol.closeConfirmSec = 2
        [System.IO.File]::WriteAllText($g12CfgPath, ($g12Cfg | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

        $env:PHYCOOL_CLOSEWORKER_FORCE_SURVIVE = '1'
        $timeoutOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $g12ClosePs1 -RunId $g12RunTimeout -CallerTrack backend 2>&1 | Out-String
        $timeoutExit = $LASTEXITCODE
        Remove-Item Env:\PHYCOOL_CLOSEWORKER_FORCE_SURVIVE -ErrorAction SilentlyContinue

        Assert-Equal "T-WHP6-CLOSE-7 (AC12): exit code 1 on confirm-window timeout" 1 $timeoutExit
        Assert-True "T-WHP6-CLOSE-8 (AC12): output mentions WHP6-E06" ($timeoutOut -match 'WHP6-E06')
        $afterTimeout = Get-SmokeCloseWorkerRow -RunId $g12RunTimeout
        Assert-Equal "T-WHP6-CLOSE-9 (AC12): requires_attention=1 written" 1 $afterTimeout.requires_attention
        # Get-NonCommentHitCount (defined in Group 9 above) strips comment lines before matching --
        # a raw Select-String would false-positive on this very file's own explanatory comments/log
        # messages that document Stop-Process's *absence* (e.g. "no Stop-Process fallback used").
        Assert-Equal "T-WHP6-CLOSE-10 (BR-031): close-worker.ps1 has zero executable Stop-Process calls" 0 `
            (Get-NonCommentHitCount -Path $g12ClosePs1 -Pattern 'Stop-Process\s+-Id')
    } finally {
        Remove-Item Env:\PHYCOOL_CLOSEWORKER_FORCE_SURVIVE -ErrorAction SilentlyContinue
        Copy-Item $g12CfgBackup $g12CfgPath -Force
        Remove-Item $g12CfgBackup -ErrorAction SilentlyContinue
        Stop-Process -Id $g12DummyTimeout.Id -Force -ErrorAction SilentlyContinue
        Remove-SmokeCloseWorkerRun -RunId $g12RunTimeout
    }

    # BR-032: closeConfirmSec absent/unreadable from config -> falls back to the hard-coded default (15).
    Assert-True "T-WHP6-CLOSE-11 (BR-032): close-worker.ps1 falls back to 15 when closeConfirmSec is unreadable" `
        ((Get-NonCommentHitCount -Path $g12ClosePs1 -Pattern '\$closeConfirmSec = 15') -ge 1)

    # AC9 (via a real close-worker.ps1 invocation, not just the close-worker-ops.js unit tests):
    # a precondition violation still exits 2 end-to-end.
    $g12RunBadPre = [guid]::NewGuid().ToString(); $g12StoryBadPre = 'smoke-whp6-close-badpre-' + (Get-Random)
    try {
        Invoke-SmokeCloseWorkerSeed -RunId $g12RunBadPre -StoryId $g12StoryBadPre -WrapperPid 1 -IpcDir 'C:/smoke/badpre-ipc'
        Set-SmokeCloseWorkerLifecycle -RunId $g12RunBadPre -Lifecycle 'reported'
        & powershell -NoProfile -ExecutionPolicy Bypass -File $g12ClosePs1 -RunId $g12RunBadPre -CallerTrack backend | Out-Null
        Assert-Equal "T-WHP6-CLOSE-12 (AC9): precondition violation (lifecycle) exits 2 end-to-end" 2 $LASTEXITCODE
    } finally {
        Remove-SmokeCloseWorkerRun -RunId $g12RunBadPre
    }

    # AC10 (via a real close-worker.ps1 invocation): PID already dead -> exit 0, UserClosed, closed_at NULL.
    $g12RunDead = [guid]::NewGuid().ToString(); $g12StoryDead = 'smoke-whp6-close-dead-' + (Get-Random)
    try {
        Invoke-SmokeCloseWorkerSeed -RunId $g12RunDead -StoryId $g12StoryDead -WrapperPid 999999 -IpcDir 'C:/smoke/dead-ipc'
        & powershell -NoProfile -ExecutionPolicy Bypass -File $g12ClosePs1 -RunId $g12RunDead -CallerTrack backend | Out-Null
        Assert-Equal "T-WHP6-CLOSE-13 (AC10): already-dead PID exits 0 end-to-end" 0 $LASTEXITCODE
        $afterDead = Get-SmokeCloseWorkerRow -RunId $g12RunDead
        Assert-Equal "T-WHP6-CLOSE-14 (AC10/BR-026): already-dead PID -> close_source=UserClosed" 'UserClosed' $afterDead.close_source
        Assert-True "T-WHP6-CLOSE-15 (AC10/BR-026): already-dead PID -> closed_at stays NULL" ($null -eq $afterDead.closed_at)
    } finally {
        Remove-SmokeCloseWorkerRun -RunId $g12RunDead
    }
} catch {
    Assert-True "T-WHP6-CLOSE-FATAL: Group 12 threw an unhandled exception: $_" $false
}

# -- Test Group 13: whp-8-report-ack-notify lifecycle CAS advance + notify hook (integration) --
# A dedicated Invoke-SmokeLcStopReport is used here rather than Group 8's Invoke-SmokeStopReport:
# that helper reads $hbRunId/$hbIpcDir directly (script-scoped closure over Group 8's own
# variables, not true parameters), so calling it from this group would silently operate on
# Group 8's already-cleaned-up run instead of this group's -- caught live: lifecycle stayed
# 'running' because stop-report.ps1 was CAS-matching zero rows against the wrong run_id.
Write-Host "`n[Group 13] whp-8 lifecycle CAS advance + notify hook" -ForegroundColor Yellow

$g13RunId   = [guid]::NewGuid().ToString()
$g13StoryId = 'smoke-whp8-lc-' + (Get-Random)
$g13IpcDir  = Join-Path $env:TEMP "smoke-whp8-lc-ipc-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $g13IpcDir | Out-Null
$g13ProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$g13DbForJs  = (Join-Path $g13ProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$g13ModForJs = (Join-Path $g13ProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$g13NotifyJs = (Join-Path $g13ProjectRoot '.claude\hooks\worker-notify-inject.js')

function Invoke-SmokeLcStopReport {
    param([string]$Phase, [string]$StoryIdArg, [string]$ReportPath)
    $env:PHYCOOL_ORCHESTRATOR_MODE = '1'
    $env:PIPELINE_STORY_ID    = $StoryIdArg
    $env:PIPELINE_PHASE       = $Phase
    $env:PIPELINE_IPC_DIR     = $g13IpcDir
    $env:PIPELINE_REPORT_PATH = $ReportPath
    $env:PIPELINE_RUN_ID      = $g13RunId

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName  = 'powershell'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'stop-report.ps1')`""
    $psi.WorkingDirectory = $g13ProjectRoot
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $proc = [Diagnostics.Process]::Start($psi)
    $proc.StandardInput.Write((@{ session_id = $g13RunId; cwd = $g13ProjectRoot } | ConvertTo-Json -Compress))
    $proc.StandardInput.Close()
    $proc.StandardOutput.ReadToEnd() | Out-Null
    $proc.WaitForExit()
    return $proc.ExitCode
}

function Get-SmokeLcRow {
    $js = Join-Path $env:TEMP "smoke-whp8-lc-q-$(Get-Random).js"
    $l = @(
        "const D=require('$g13ModForJs');",
        "const db=new D('$g13DbForJs',{readonly:true});",
        "const r=db.prepare('SELECT lifecycle, reported_at FROM worker_runs WHERE run_id=?').get('$g13RunId');",
        "console.log(JSON.stringify(r));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out
}

# whp-11 T5: same D2-miss-waits-hookGraceSec concern as Group 8 above -- this group's two
# Invoke-SmokeLcStopReport calls carry a real PIPELINE_RUN_ID with no seeded worker_messages row.
$g13CfgPath = Join-Path $g13ProjectRoot 'scripts\pipeline-config.json'
$g13CfgBackup = "$g13CfgPath.smoke-backup-$(Get-Random)"
Copy-Item $g13CfgPath $g13CfgBackup -Force
$g13CfgObj = [System.IO.File]::ReadAllText($g13CfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
$g13CfgObj.workerProtocol.hookGraceSec = 1
[System.IO.File]::WriteAllText($g13CfgPath, ($g13CfgObj | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

# whp-11 T5 (post-run fix): wrapper_pid must resolve as a REAL worker under judgeLiveness()'s
# 4-Tuple -- this machine runs a genuine pipeline-guardian.ps1 singleton (Ensure-Guardian, wired
# into register-run.ps1 -Mode Register, self-heals on every call this group and others already
# make). Using $PID (smoke-test.ps1's own process) let this group's two-call sequence get raced:
# the guardian reaped this run as dead (cmdline never matches worker-general.ps1) and flipped
# lifecycle to 'abandoned' before the second call's own CAS ran (T-WHP8-LC-4, observed once the
# whp-11 session had already triggered the guardian via its own earlier Group 7/8/15 registrations
# -- pre-existing whp-8 code, not previously racy because nothing in this file's history had yet
# started a long-lived guardian process before it). Same disposable-dummy technique whp-11's own
# Group 14/15 fixtures already use (Start-SmokeGeneralAliveDummy), duplicated locally here to match
# this file's per-group self-contained helper convention (PowerShell does not hoist functions, so
# borrowing Group 14's later-defined copy is not an option without reordering the file).
function Start-SmokeLcAliveDummy {
    param([string]$IpcDir)
    $cmd = "# ipc_dir=$IpcDir worker-general.ps1 marker`nStart-Sleep -Seconds 120"
    $proc = Start-Process powershell -ArgumentList @('-NoProfile', '-Command', $cmd) -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 300
    return $proc
}
$g13Dummy = Start-SmokeLcAliveDummy -IpcDir $g13IpcDir

try {
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Register `
        -RunId $g13RunId -StoryId $g13StoryId -Phase 'general' -IpcDir $g13IpcDir -SessionId $g13RunId `
        -ControllerTrack 'smoke' -Attempt 1 | Out-Null
    # Register alone leaves lifecycle='dispatching' (Group 7 T5.3-9 confirms Confirm mode owns the
    # dispatching->running transition, not Register). The CAS this group is testing only matches
    # lifecycle IN ('running','revising'), so Confirm is required before stop-report.ps1 can advance it.
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Confirm `
        -RunId $g13RunId -WrapperPid $g13Dummy.Id | Out-Null

    # BR-001: a running run's first turn-end advances it to reported + stamps reported_at.
    $g13Exit1 = Invoke-SmokeLcStopReport -Phase 'general' -StoryIdArg $g13StoryId -ReportPath (Join-Path $g13IpcDir 'r.md')
    Assert-Equal "T-WHP8-LC-1 (BR-001): stop-report exits 0" 0 $g13Exit1
    $g13Row1 = Get-SmokeLcRow
    Assert-Equal "T-WHP8-LC-2 (BR-001): lifecycle becomes reported after first turn" 'reported' $g13Row1.lifecycle
    Assert-True "T-WHP8-LC-3 (BR-001/BR-004): reported_at is offset-aware Taiwan format" `
        ($g13Row1.reported_at -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$')

    # BR-002: a second turn-end on an already-reported run must NOT re-fire the CAS -- reported_at
    # stays byte-identical (the guardian's L2/L4 loops key off this value being stable once set).
    Start-Sleep -Milliseconds 1100   # ensure a second Get-Date call would differ if CAS wrongly re-fired
    $null = Invoke-SmokeLcStopReport -Phase 'general' -StoryIdArg $g13StoryId -ReportPath (Join-Path $g13IpcDir 'r.md')
    $g13Row2 = Get-SmokeLcRow
    Assert-Equal "T-WHP8-LC-4 (BR-002): lifecycle stays reported (not re-advanced)" 'reported' $g13Row2.lifecycle
    Assert-Equal "T-WHP8-LC-5 (BR-002): reported_at is byte-identical across the idempotent second turn" `
        $g13Row1.reported_at $g13Row2.reported_at

    # BR-007/BR-011/BR-015: the notify hook itself -- worker-window exclusion, silent-when-empty,
    # and the readonly guarantee -- exercised as a real spawn (not just the unit-test source-greps).
    $env:CLAUDE_PROJECT_DIR = $g13ProjectRoot
    $g13WorkerOut = ('{"prompt":"x","session_id":"s"}' | & node $g13NotifyJs)
    Assert-Equal "T-WHP8-LC-6 (BR-007): worker window (PIPELINE_RUN_ID set) emits nothing" '' ($g13WorkerOut -join '')
    Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue
    # (whp-8 CR) stderr captured to a file and echoed on failure: this assertion failed three
    # full-suite runs in a row while every isolated replication passed, and the naked boolean
    # left zero forensics -- a failing assert must surface its actuals.
    $g13Lc7Err = Join-Path $env:TEMP "smoke-whp8-lc7-err-$(Get-Random).txt"
    $g13MainOut = ('{"prompt":"x","session_id":"s"}' | & node $g13NotifyJs 2>$g13Lc7Err)
    $g13Lc7Joined = ($g13MainOut -join '')
    $g13Lc7Ok = ($g13Lc7Joined -match [regex]::Escape($g13StoryId))
    Assert-True "T-WHP8-LC-7 (BR-008): main window sees the pending-ack row this group just created" $g13Lc7Ok
    if (-not $g13Lc7Ok) {
        Write-Host ("  [DIAG] LC-7 expected story=" + $g13StoryId)
        Write-Host ("  [DIAG] LC-7 stdout len=" + $g13Lc7Joined.Length + " raw=" + $g13Lc7Joined)
        $g13Lc7ErrText = ''
        if (Test-Path $g13Lc7Err) { $g13Lc7ErrText = [System.IO.File]::ReadAllText($g13Lc7Err) }
        Write-Host ("  [DIAG] LC-7 stderr=" + $g13Lc7ErrText)
        $g13RowDiag = Get-SmokeLcRow
        Write-Host ("  [DIAG] LC-7 row-at-assert=" + ($g13RowDiag | ConvertTo-Json -Compress))
    }
    Remove-Item $g13Lc7Err -ErrorAction SilentlyContinue
} finally {
    if ($g13Dummy) { Stop-Process -Id $g13Dummy.Id -Force -ErrorAction SilentlyContinue }
    Copy-Item $g13CfgBackup $g13CfgPath -Force
    Remove-Item $g13CfgBackup -ErrorAction SilentlyContinue
    Remove-Item Env:\PHYCOOL_ORCHESTRATOR_MODE, Env:\PIPELINE_STORY_ID, Env:\PIPELINE_PHASE, Env:\PIPELINE_IPC_DIR, Env:\PIPELINE_REPORT_PATH, Env:\PIPELINE_RUN_ID, Env:\CLAUDE_PROJECT_DIR -ErrorAction SilentlyContinue
    $g13CleanJs = Join-Path $env:TEMP "smoke-whp8-lc-clean-$(Get-Random).js"
    $g13CleanLines = @(
        "const D=require('$g13ModForJs');",
        "const db=new D('$g13DbForJs');",
        "db.prepare('DELETE FROM worker_runs WHERE run_id = ?').run('$g13RunId');",
        "db.prepare('DELETE FROM worker_handoffs WHERE run_id = ?').run('$g13RunId');"
    )
    [System.IO.File]::WriteAllText($g13CleanJs, ($g13CleanLines -join "`n"), [System.Text.UTF8Encoding]::new($false))
    & node $g13CleanJs 2>$null | Out-Null
    Remove-Item $g13CleanJs -ErrorAction SilentlyContinue
    Remove-Item $g13IpcDir -Recurse -Force -ErrorAction SilentlyContinue
}

# -- Test Group 14: whp-11 preflight-dispatch.ps1 revising+Resume carve-out (BR-020~024) --------
# Gap 2 -- a narrow carve-out on Check 2 (NON_TERMINAL_RUN): lifecycle='revising' + -Resume +
# the prior window's wrapper_pid confirmed dead (via the real judgeLiveness()/probeLiveProcesses()
# reused from reap-worker-runs.js) reaches PASS tagged REVISE_REVIVE; every other combination
# still BLOCKs. Uses -Json throughout because a PASS check's own reason text is only ever echoed
# in the JSON checks[] array -- non-JSON mode only echoes SKIPPED reasons (see the emit-result
# block at the bottom of preflight-dispatch.ps1), so REVISE_REVIVE would be unobservable without it.
Write-Host "`n[Group 14] whp-11 preflight-dispatch.ps1 revising+Resume carve-out (BR-020~024)" -ForegroundColor Yellow

$g14ProjectRoot  = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$g14DbPath       = (Join-Path $g14ProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$g14ModPath      = (Join-Path $g14ProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$g14PreflightPs1 = Join-Path $PSScriptRoot 'preflight-dispatch.ps1'

function Invoke-SmokeCarveOutSeed {
    param([string]$RunId, [string]$StoryId, [string]$Lifecycle, [int]$WrapperPid, [string]$IpcDir, [string]$Phase = 'general')
    $js = Join-Path $env:TEMP "smoke-whp11-carve-seed-$(Get-Random).js"
    $l = @(
        "const D = require('$g14ModPath');",
        "const db = new D('$g14DbPath');",
        "const t = '2026-01-01T00:00:00+08:00';",
        "db.prepare('INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle, wrapper_pid, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('$RunId','$RunId','$StoryId','$Phase','$IpcDir','window','$Lifecycle',$WrapperPid,t,t);"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Remove-SmokeCarveOutRun {
    param([string]$StoryId)
    $js = Join-Path $env:TEMP "smoke-whp11-carve-clean-$(Get-Random).js"
    $l = @(
        "const D = require('$g14ModPath');",
        "const db = new D('$g14DbPath');",
        "db.prepare('DELETE FROM worker_runs WHERE story_id=?').run('$StoryId');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    Invoke-SmokeNodeScript -ScriptPath $js
    Remove-Item $js -ErrorAction SilentlyContinue
}

# Same spawn technique as Group 12's Start-SmokeAliveDummy, but the embedded marker names
# worker-general.ps1 (not worker-dev.ps1) to match this group's -Phase general fixtures --
# judgeLiveness()'s Tuple 4 greps cmdline for `worker-${phaseToSuffix(phase)}.ps1` verbatim.
function Start-SmokeGeneralAliveDummy {
    param([string]$IpcDir)
    $cmd = "# ipc_dir=$IpcDir worker-general.ps1 marker`nStart-Sleep -Seconds 120"
    $proc = Start-Process powershell -ArgumentList @('-NoProfile', '-Command', $cmd) -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 300   # let WMI/CIM catch up so its CommandLine is queryable
    return $proc
}

function Invoke-SmokePreflight {
    param([string]$StoryId, [switch]$Resume, [switch]$ForceProbeFail)
    # try/finally (whp-11 CR): a throw between set and remove would leak the force-fail flag
    # into every later preflight invocation and cascade false BLOCKs across groups.
    try {
        if ($ForceProbeFail) { $env:PHYCOOL_PREFLIGHT_FORCE_PROBE_FAIL = '1' }
        $preflightArgs = @('-StoryId', $StoryId, '-Phase', 'general', '-Json')
        if ($Resume) { $preflightArgs += '-Resume' }
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $g14PreflightPs1 @preflightArgs 2>&1 | Out-String
        $exit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        return @{ Out = $out; Exit = $exit }
    } finally {
        if ($ForceProbeFail) { Remove-Item Env:\PHYCOOL_PREFLIGHT_FORCE_PROBE_FAIL -ErrorAction SilentlyContinue }
    }
}

# BR-020: revising + -Resume + confirmed-dead prior window -> PASS, reason names REVISE_REVIVE.
$g14RunDead = [guid]::NewGuid().ToString(); $g14StoryDead = 'smoke-whp11-carve-dead-' + (Get-Random)
try {
    Invoke-SmokeCarveOutSeed -RunId $g14RunDead -StoryId $g14StoryDead -Lifecycle 'revising' -WrapperPid 999999 -IpcDir 'C:/smoke/whp11-dead-ipc'
    $r20 = Invoke-SmokePreflight -StoryId $g14StoryDead -Resume
    Assert-Equal "T-WHP11-CARVE-1 (BR-020): dead prior window + -Resume -> exit 0" 0 $r20.Exit
    Assert-True "T-WHP11-CARVE-2 (BR-020): NON_TERMINAL_RUN check names REVISE_REVIVE" ($r20.Out -match 'REVISE_REVIVE')
} finally {
    Remove-SmokeCarveOutRun -StoryId $g14StoryDead
}

# BR-021: revising + -Resume + prior window still ALIVE -> BLOCK, hints at same-window wake.
$g14RunLive = [guid]::NewGuid().ToString(); $g14StoryLive = 'smoke-whp11-carve-live-' + (Get-Random)
$g14DummyLive = Start-SmokeGeneralAliveDummy -IpcDir 'C:/smoke/whp11-live-ipc'
try {
    Invoke-SmokeCarveOutSeed -RunId $g14RunLive -StoryId $g14StoryLive -Lifecycle 'revising' -WrapperPid $g14DummyLive.Id -IpcDir 'C:/smoke/whp11-live-ipc'
    $r21 = Invoke-SmokePreflight -StoryId $g14StoryLive -Resume
    Assert-Equal "T-WHP11-CARVE-3 (BR-021): alive prior window + -Resume -> exit 1" 1 $r21.Exit
    Assert-True "T-WHP11-CARVE-4 (BR-021): output names BLOCK: NON_TERMINAL_RUN" ($r21.Out -match 'BLOCK: NON_TERMINAL_RUN')
    Assert-True "T-WHP11-CARVE-5 (BR-021): output hints at waking the same window" ($r21.Out -match '(?i)same window')
} finally {
    Stop-Process -Id $g14DummyLive.Id -Force -ErrorAction SilentlyContinue
    Remove-SmokeCarveOutRun -StoryId $g14StoryLive
}

# BR-022: same dead-window fixture as BR-020, WITHOUT -Resume -> BLOCK.
$g14RunNoResume = [guid]::NewGuid().ToString(); $g14StoryNoResume = 'smoke-whp11-carve-noresume-' + (Get-Random)
try {
    Invoke-SmokeCarveOutSeed -RunId $g14RunNoResume -StoryId $g14StoryNoResume -Lifecycle 'revising' -WrapperPid 999999 -IpcDir 'C:/smoke/whp11-noresume-ipc'
    $r22 = Invoke-SmokePreflight -StoryId $g14StoryNoResume
    Assert-Equal "T-WHP11-CARVE-6 (BR-022): dead prior window WITHOUT -Resume -> exit 1" 1 $r22.Exit
    Assert-True "T-WHP11-CARVE-7 (BR-022): output names BLOCK: NON_TERMINAL_RUN" ($r22.Out -match 'BLOCK: NON_TERMINAL_RUN')
} finally {
    Remove-SmokeCarveOutRun -StoryId $g14StoryNoResume
}

# BR-023: five non-revising lifecycles, all dead windows, all WITH -Resume -> all still BLOCK
# (carve-out limited to lifecycle='revising').
$g14NonRevisingLifecycles = @('dispatching', 'running', 'reported', 'awaiting-review', 'approved')
foreach ($lc in $g14NonRevisingLifecycles) {
    $g14LcStoryId = "smoke-whp11-carve-$lc-" + (Get-Random)
    try {
        Invoke-SmokeCarveOutSeed -RunId ([guid]::NewGuid().ToString()) -StoryId $g14LcStoryId -Lifecycle $lc -WrapperPid 999999 -IpcDir "C:/smoke/whp11-$lc-ipc"
        $r23 = Invoke-SmokePreflight -StoryId $g14LcStoryId -Resume
        Assert-Equal "T-WHP11-CARVE-8 (BR-023): lifecycle=$lc + -Resume + dead window -> exit 1" 1 $r23.Exit
    } finally {
        Remove-SmokeCarveOutRun -StoryId $g14LcStoryId
    }
}

# BR-024: revising + -Resume + probeLiveProcesses() forced to throw -> BLOCK naming the probe
# failure (fail CLOSED -- refuses the carve-out rather than assuming "confirmed dead").
$g14RunProbeFail = [guid]::NewGuid().ToString(); $g14StoryProbeFail = 'smoke-whp11-carve-probefail-' + (Get-Random)
try {
    Invoke-SmokeCarveOutSeed -RunId $g14RunProbeFail -StoryId $g14StoryProbeFail -Lifecycle 'revising' -WrapperPid 999999 -IpcDir 'C:/smoke/whp11-probefail-ipc'
    $r24 = Invoke-SmokePreflight -StoryId $g14StoryProbeFail -Resume -ForceProbeFail
    Assert-Equal "T-WHP11-CARVE-9 (BR-024): forced liveness-probe failure -> exit 1 (fail closed)" 1 $r24.Exit
    Assert-True "T-WHP11-CARVE-10 (BR-024): output names the liveness-probe failure" ($r24.Out -match '(?i)liveness probe failed')
} finally {
    Remove-SmokeCarveOutRun -StoryId $g14StoryProbeFail
}

# -- Test Group 15: whp-11 D2 bounded-wait poll in stop-report.ps1 (AC1-AC6, AC12) --------------
# Real end-to-end spawns of stop-report.ps1 -- whp-8's Group 13 header established that this is
# the only layer that catches require()/module-resolution defects, which applies equally here
# since worker-directive-poll.cjs is wired in via the same JS-heredoc-in-tmp-file pattern.
Write-Host "`n[Group 15] whp-11 D2 bounded-wait poll (AC1-AC6, AC12)" -ForegroundColor Yellow

$g15ProjectRoot = (Join-Path $PSScriptRoot '..\..\..\..' | Resolve-Path).Path
$g15DbForJs     = (Join-Path $g15ProjectRoot '.context-db\phycool.db') -replace '\\', '/'
$g15ModForJs    = (Join-Path $g15ProjectRoot '.context-db\node_modules\better-sqlite3') -replace '\\', '/'
$g15CfgPath     = Join-Path $g15ProjectRoot 'scripts\pipeline-config.json'
$g15LogFile     = Join-Path $g15ProjectRoot 'logs\party-pipeline-stop-report.log'
$g15CfgBackup   = "$g15CfgPath.smoke-backup-$(Get-Random)"
Copy-Item $g15CfgPath $g15CfgBackup -Force

function Set-SmokeD2GraceSec {
    param([int]$Seconds)
    $cfg = [System.IO.File]::ReadAllText($g15CfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    $cfg.workerProtocol.hookGraceSec = $Seconds
    [System.IO.File]::WriteAllText($g15CfgPath, ($cfg | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
}

function Invoke-SmokeD2StopReport {
    param([string]$RunId, [string]$StoryId, [string]$IpcDir, [string]$Phase = 'general', [switch]$NoRunId, [string]$Cwd = '')
    $useCwd = if ($Cwd) { $Cwd } else { $g15ProjectRoot }
    $sessionIdForStdin = if ($RunId) { $RunId } else { [guid]::NewGuid().ToString() }
    $env:PHYCOOL_ORCHESTRATOR_MODE = '1'
    $env:PIPELINE_STORY_ID = $StoryId
    $env:PIPELINE_PHASE    = $Phase
    $env:PIPELINE_IPC_DIR  = $IpcDir
    $env:PIPELINE_REPORT_PATH = ''
    if ($NoRunId) { Remove-Item Env:\PIPELINE_RUN_ID -ErrorAction SilentlyContinue } else { $env:PIPELINE_RUN_ID = $RunId }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName  = 'powershell'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'stop-report.ps1')`""
    $psi.WorkingDirectory = $g15ProjectRoot
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.UseShellExecute = $false
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = [Diagnostics.Process]::Start($psi)
    $proc.StandardInput.Write((@{ session_id = $sessionIdForStdin; cwd = $useCwd } | ConvertTo-Json -Compress))
    $proc.StandardInput.Close()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $proc.WaitForExit()
    $sw.Stop()
    return @{ Exit = $proc.ExitCode; Out = $stdout; Ms = $sw.ElapsedMilliseconds }
}

function Add-SmokeD2Message {
    param([string]$RunId, [int]$Seq = 1, [string]$Body = 'do the thing')
    $js = Join-Path $env:TEMP "smoke-whp11-d2-seed-$(Get-Random).js"
    $l = @(
        "const D = require('$g15ModForJs');",
        "const db = new D('$g15DbForJs');",
        "const t = '2026-01-01T00:00:00+08:00';",
        "const info = db.prepare('INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES (?,?,?,?,?,?,?,?)').run('$RunId',$Seq,'controller-to-worker','wake','$Body','CC-OPUS','pending',t);",
        "console.log(JSON.stringify({msg_id: info.lastInsertRowid}));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out.msg_id
}

function Get-SmokeD2Run {
    param([string]$RunId)
    $js = Join-Path $env:TEMP "smoke-whp11-d2-run-$(Get-Random).js"
    $l = @(
        "const D = require('$g15ModForJs');",
        "const db = new D('$g15DbForJs', {readonly:true});",
        "console.log(JSON.stringify(db.prepare('SELECT lifecycle, reported_at, turn_count FROM worker_runs WHERE run_id=?').get('$RunId')));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out
}

function Get-SmokeD2Handoff {
    param([string]$RunId)
    $js = Join-Path $env:TEMP "smoke-whp11-d2-hd-$(Get-Random).js"
    $l = @(
        "const D = require('$g15ModForJs');",
        "const db = new D('$g15DbForJs', {readonly:true});",
        "console.log(JSON.stringify(db.prepare('SELECT updated_at, length(evidence_json) AS ev_len FROM worker_handoffs WHERE run_id=?').get('$RunId') || null));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out
}

function Get-SmokeD2Message {
    param([int]$MsgId)
    $js = Join-Path $env:TEMP "smoke-whp11-d2-msg-$(Get-Random).js"
    $l = @(
        "const D = require('$g15ModForJs');",
        "const db = new D('$g15DbForJs', {readonly:true});",
        "console.log(JSON.stringify(db.prepare('SELECT state, delivered_via, knocked_at FROM worker_messages WHERE msg_id=?').get($MsgId)));"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    $out = (& node $js | ConvertFrom-Json)
    Remove-Item $js -ErrorAction SilentlyContinue
    return $out
}

function Remove-SmokeD2Run {
    param([string]$RunId)
    $js = Join-Path $env:TEMP "smoke-whp11-d2-clean-$(Get-Random).js"
    $l = @(
        "const D = require('$g15ModForJs');",
        "const db = new D('$g15DbForJs');",
        "db.prepare('DELETE FROM worker_runs WHERE run_id=?').run('$RunId');",
        "db.prepare('DELETE FROM worker_handoffs WHERE run_id=?').run('$RunId');",
        "db.prepare('DELETE FROM worker_messages WHERE run_id=?').run('$RunId');"
    )
    [System.IO.File]::WriteAllText($js, ($l -join "`n"), [System.Text.UTF8Encoding]::new($false))
    & node $js 2>$null | Out-Null
    Remove-Item $js -ErrorAction SilentlyContinue
}

function Get-SmokeD2LogLength {
    if (Test-Path $g15LogFile) { return (Get-Item $g15LogFile).Length }
    return 0
}

function Get-SmokeD2LogDelta {
    param([long]$SinceLength)
    if (-not (Test-Path $g15LogFile)) { return '' }
    $bytes = [System.IO.File]::ReadAllBytes($g15LogFile)
    if ($bytes.Length -le $SinceLength) { return '' }
    return [System.Text.Encoding]::UTF8.GetString($bytes, [int]$SinceLength, [int]($bytes.Length - $SinceLength))
}

function New-SmokeD2Run {
    param([string]$RunId, [string]$StoryId, [string]$IpcDir)
    New-Item -ItemType Directory -Force -Path $IpcDir | Out-Null
    # whp-11 T5 (post-run fix): wrapper_pid must resolve as a REAL worker under judgeLiveness()'s
    # 4-Tuple -- this machine runs a genuine pipeline-guardian.ps1 singleton (confirmed via
    # Get-CimInstance during triage) that reaps any non-terminal run whose wrapper_pid's cmdline
    # doesn't match worker-{suffix}.ps1. Using $PID (smoke-test.ps1's own process) let AC4's ~9s
    # miss-wait window get raced: the guardian flipped lifecycle to 'abandoned' before this
    # group's own CAS could advance it to 'reported' (T-WHP11-D2-18, first full-suite run). Same
    # disposable-dummy technique as Group 14's Start-SmokeGeneralAliveDummy (defined above).
    $dummy = Start-SmokeGeneralAliveDummy -IpcDir $IpcDir
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Register `
        -RunId $RunId -StoryId $StoryId -Phase 'general' -IpcDir $IpcDir -SessionId $RunId `
        -ControllerTrack 'smoke' -Attempt 1 | Out-Null
    & powershell -NoProfile -File (Join-Path $PSScriptRoot 'register-run.ps1') -Mode Confirm `
        -RunId $RunId -WrapperPid $dummy.Id | Out-Null
    return $dummy
}

try {
    # AC1: hit path -- shape (decision/hookEventName) + exit 0 + <2s even with the 120s default.
    # Two pending directives (whp-11 CR): locks BR-012's "count + ALL msg_ids" knock text (spec
    # §5 boundary: "one knock naming both msg_ids") end-to-end, not just at unit level.
    $g15RunA = [guid]::NewGuid().ToString(); $g15StoryA = 'smoke-whp11-d2-a-' + (Get-Random)
    $g15IpcA = Join-Path $env:TEMP "smoke-whp11-d2-a-ipc-$(Get-Random)"
    try {
        $g15DummyA = New-SmokeD2Run -RunId $g15RunA -StoryId $g15StoryA -IpcDir $g15IpcA
        $g15MsgA = Add-SmokeD2Message -RunId $g15RunA
        $g15MsgA2 = Add-SmokeD2Message -RunId $g15RunA -Seq 2 -Body 'second directive'
        Set-SmokeD2GraceSec -Seconds 120
        $r1 = Invoke-SmokeD2StopReport -RunId $g15RunA -StoryId $g15StoryA -IpcDir $g15IpcA
        Assert-Equal "T-WHP11-D2-1 (AC1/BR-011): hit path exits 0" 0 $r1.Exit
        $d1 = $null
        try { $d1 = $r1.Out | ConvertFrom-Json } catch { }
        Assert-True "T-WHP11-D2-2 (AC1/BR-011): stdout parses as JSON with decision=block" ($d1 -and $d1.decision -eq 'block')
        Assert-True "T-WHP11-D2-3 (AC1/BR-011): hookSpecificOutput.hookEventName=Stop" ($d1 -and $d1.hookSpecificOutput.hookEventName -eq 'Stop')
        Assert-True "T-WHP11-D2-4 (AC1/BR-001/BR-012): reason names read-worker-directives.js, the count and ALL msg_ids" `
            ($d1 -and $d1.reason -match [regex]::Escape('read-worker-directives.js') -and $d1.reason -match [regex]::Escape("msg_id=$g15MsgA,$g15MsgA2") -and $d1.reason -match [regex]::Escape('x2'))
        Assert-True "T-WHP11-D2-5 (AC1/BR-003): elapsed under 2000ms on immediate hit" ($r1.Ms -lt 2000)
    } finally {
        if ($g15DummyA) { Stop-Process -Id $g15DummyA.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunA
        Remove-Item $g15IpcA -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC2: miss -- bounded wait lands in [6s, 9s) for hookGraceSec=6, lifecycle advances normally.
    $g15RunB = [guid]::NewGuid().ToString(); $g15StoryB = 'smoke-whp11-d2-b-' + (Get-Random)
    $g15IpcB = Join-Path $env:TEMP "smoke-whp11-d2-b-ipc-$(Get-Random)"
    try {
        $g15DummyB = New-SmokeD2Run -RunId $g15RunB -StoryId $g15StoryB -IpcDir $g15IpcB
        Set-SmokeD2GraceSec -Seconds 6
        $r2 = Invoke-SmokeD2StopReport -RunId $g15RunB -StoryId $g15StoryB -IpcDir $g15IpcB
        Assert-Equal "T-WHP11-D2-6 (AC2/BR-002): miss path exits 0" 0 $r2.Exit
        Assert-True "T-WHP11-D2-7 (AC2/BR-002): stdout carries no decision field on miss" (-not ($r2.Out -match '"decision"'))
        Assert-True "T-WHP11-D2-8 (AC2/BR-002): elapsed lands in [6000ms, 9000ms)" ($r2.Ms -ge 6000 -and $r2.Ms -lt 9000)
        $row2 = Get-SmokeD2Run -RunId $g15RunB
        Assert-Equal "T-WHP11-D2-9 (AC2): miss still advances lifecycle to reported" 'reported' $row2.lifecycle
    } finally {
        if ($g15DummyB) { Stop-Process -Id $g15DummyB.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunB
        Remove-Item $g15IpcB -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC3: hit never leaks body content, never touches the delivery ledger -- read-worker-directives.js
    # still delivers the same directive afterward (D1 path independently confirms it wasn't consumed).
    $g15RunC = [guid]::NewGuid().ToString(); $g15StoryC = 'smoke-whp11-d2-c-' + (Get-Random)
    $g15IpcC = Join-Path $env:TEMP "smoke-whp11-d2-c-ipc-$(Get-Random)"
    try {
        $g15DummyC = New-SmokeD2Run -RunId $g15RunC -StoryId $g15StoryC -IpcDir $g15IpcC
        $g15MsgC = Add-SmokeD2Message -RunId $g15RunC -Body 'ZZQQ-SECRET'
        Set-SmokeD2GraceSec -Seconds 120
        $r3 = Invoke-SmokeD2StopReport -RunId $g15RunC -StoryId $g15StoryC -IpcDir $g15IpcC
        Assert-True "T-WHP11-D2-10 (AC3/BR-012): stdout never carries the directive body" (-not ($r3.Out -match 'ZZQQ-SECRET'))
        $msgC1 = Get-SmokeD2Message -MsgId $g15MsgC
        Assert-Equal "T-WHP11-D2-11 (AC3/BR-009): knock leaves state=pending" 'pending' $msgC1.state
        Assert-True "T-WHP11-D2-12 (AC3/BR-009): knock leaves delivered_via untouched" (-not $msgC1.delivered_via)
        $g15ReadJs = Join-Path $g15ProjectRoot '.context-db\scripts\read-worker-directives.js'
        $g15D1Out = (& node $g15ReadJs --run-id $g15RunC 2>$null | Out-String)
        Assert-True "T-WHP11-D2-13 (AC3/BR-009): read-worker-directives.js still delivers the knocked directive" `
            ($g15D1Out -match [regex]::Escape("msg_id=$g15MsgC"))
        $msgC2 = Get-SmokeD2Message -MsgId $g15MsgC
        Assert-Equal "T-WHP11-D2-14 (AC3/BR-009): D1 read marks it delivered afterward" 'delivered' $msgC2.state
    } finally {
        if ($g15DummyC) { Stop-Process -Id $g15DummyC.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunC
        Remove-Item $g15IpcC -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC4: loop bound -- same run, two consecutive turns; only the first knocks.
    $g15RunD = [guid]::NewGuid().ToString(); $g15StoryD = 'smoke-whp11-d2-d-' + (Get-Random)
    $g15IpcD = Join-Path $env:TEMP "smoke-whp11-d2-d-ipc-$(Get-Random)"
    try {
        $g15DummyD = New-SmokeD2Run -RunId $g15RunD -StoryId $g15StoryD -IpcDir $g15IpcD
        $g15MsgD = Add-SmokeD2Message -RunId $g15RunD
        Set-SmokeD2GraceSec -Seconds 6
        $r4a = Invoke-SmokeD2StopReport -RunId $g15RunD -StoryId $g15StoryD -IpcDir $g15IpcD
        $d4a = $null
        try { $d4a = $r4a.Out | ConvertFrom-Json } catch { }
        Assert-True "T-WHP11-D2-15 (AC4/BR-008): first turn knocks" ($d4a -and $d4a.decision -eq 'block')
        $msgD1 = Get-SmokeD2Message -MsgId $g15MsgD
        Assert-True "T-WHP11-D2-16 (AC4/BR-008): knocked_at stamped in +08:00 format" `
            ($msgD1.knocked_at -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$')
        $r4b = Invoke-SmokeD2StopReport -RunId $g15RunD -StoryId $g15StoryD -IpcDir $g15IpcD
        Assert-True "T-WHP11-D2-17 (AC4/BR-010): second turn carries no decision field" (-not ($r4b.Out -match '"decision"'))
        $rowD = Get-SmokeD2Run -RunId $g15RunD
        Assert-Equal "T-WHP11-D2-18 (AC4/BR-010): second turn advances lifecycle to reported" 'reported' $rowD.lifecycle
        $msgD2 = Get-SmokeD2Message -MsgId $g15MsgD
        Assert-Equal "T-WHP11-D2-19 (AC4): directive itself is never lost -- state stays pending throughout" 'pending' $msgD2.state
    } finally {
        if ($g15DummyD) { Stop-Process -Id $g15DummyD.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunD
        Remove-Item $g15IpcD -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC5: a knock is not a fake turn-end -- no status file, lifecycle unadvanced, but the heartbeat
    # (turn_count / worker_handoffs) still lands exactly like an unsuppressed turn would.
    $g15RunE = [guid]::NewGuid().ToString(); $g15StoryE = 'smoke-whp11-d2-e-' + (Get-Random)
    $g15IpcE = Join-Path $env:TEMP "smoke-whp11-d2-e-ipc-$(Get-Random)"
    try {
        $g15DummyE = New-SmokeD2Run -RunId $g15RunE -StoryId $g15StoryE -IpcDir $g15IpcE
        Add-SmokeD2Message -RunId $g15RunE | Out-Null
        Set-SmokeD2GraceSec -Seconds 120
        $rowE0 = Get-SmokeD2Run -RunId $g15RunE
        $r5 = Invoke-SmokeD2StopReport -RunId $g15RunE -StoryId $g15StoryE -IpcDir $g15IpcE
        Assert-True "T-WHP11-D2-20 (AC5/BR-013): status-general.json is NOT written on a knock" `
            (-not (Test-Path (Join-Path $g15IpcE 'status-general.json')))
        $rowE1 = Get-SmokeD2Run -RunId $g15RunE
        Assert-Equal "T-WHP11-D2-21 (AC5/BR-014): lifecycle stays running (not advanced)" 'running' $rowE1.lifecycle
        Assert-True "T-WHP11-D2-22 (AC5/BR-014): reported_at stays NULL" (-not $rowE1.reported_at)
        Assert-Equal "T-WHP11-D2-23 (AC5/BR-015): turn_count still increments on a knock" ($rowE0.turn_count + 1) $rowE1.turn_count
        $hdE = Get-SmokeD2Handoff -RunId $g15RunE
        Assert-True "T-WHP11-D2-23b (AC5/BR-015): worker_handoffs evidence upserted with fresh updated_at on a knock" `
            ($hdE -and $hdE.ev_len -gt 0 -and $hdE.updated_at)
    } finally {
        if ($g15DummyE) { Stop-Process -Id $g15DummyE.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunE
        Remove-Item $g15IpcE -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC6a: poll failure (DB path resolves to nothing) fails open -- exit 0, status file still written,
    # D2-POLL-FAILED logged. Same disposable-root technique as Group 8's AC7 (T-CR-6).
    $g15FakeRoot = Join-Path $env:TEMP "smoke-whp11-d2-noDb-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path (Join-Path $g15FakeRoot '.claude') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $g15FakeRoot 'scripts') | Out-Null
    # whp-11 T5 (post-run fix): stop-report.ps1's D2-POLL-FAILED Add-Content uses
    # -ErrorAction SilentlyContinue -- a missing logs\ parent directory makes the write fail
    # silently (T-WHP11-D2-26, first full-suite run) rather than throw, so it must exist upfront
    # (Group 8's own fakeRoot never needed this -- it never asserted on the fakeRoot's own log).
    New-Item -ItemType Directory -Force -Path (Join-Path $g15FakeRoot 'logs') | Out-Null
    Copy-Item $g15CfgPath (Join-Path $g15FakeRoot 'scripts\pipeline-config.json') -Force
    $g15RunF = [guid]::NewGuid().ToString(); $g15StoryF = 'smoke-whp11-d2-f-' + (Get-Random)
    $g15IpcF = Join-Path $env:TEMP "smoke-whp11-d2-f-ipc-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $g15IpcF | Out-Null
    try {
        $r6a = Invoke-SmokeD2StopReport -RunId $g15RunF -StoryId $g15StoryF -IpcDir $g15IpcF -Cwd $g15FakeRoot
        Assert-Equal "T-WHP11-D2-24 (AC6/BR-007): poll failure still exits 0" 0 $r6a.Exit
        Assert-True "T-WHP11-D2-25 (AC6/BR-007): status-general.json exists and parses" `
            (Test-Path (Join-Path $g15IpcF 'status-general.json'))
        $g15FakeLog = Join-Path $g15FakeRoot 'logs\party-pipeline-stop-report.log'
        $g15FakeLogText = if (Test-Path $g15FakeLog) { [System.IO.File]::ReadAllText($g15FakeLog, [System.Text.Encoding]::UTF8) } else { '' }
        Assert-True "T-WHP11-D2-26 (AC6/BR-007): log carries D2-POLL-FAILED for this run_id" `
            ($g15FakeLogText -match [regex]::Escape("D2-POLL-FAILED run_id=$g15RunF"))
    } finally {
        Remove-Item $g15FakeRoot -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $g15IpcF -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC6b: PIPELINE_RUN_ID unset -> D2 never engages at all (zero D2-POLL log lines), status file
    # still written normally. Log-delta technique (before/after) avoids false hits from prior groups.
    $g15StoryG = 'smoke-whp11-d2-g-' + (Get-Random)
    $g15IpcG = Join-Path $env:TEMP "smoke-whp11-d2-g-ipc-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $g15IpcG | Out-Null
    try {
        $g15LogBefore = Get-SmokeD2LogLength
        $r6b = Invoke-SmokeD2StopReport -RunId '' -StoryId $g15StoryG -IpcDir $g15IpcG -NoRunId
        Assert-Equal "T-WHP11-D2-27 (AC6/BR-005): no-RunId turn still exits 0" 0 $r6b.Exit
        Assert-True "T-WHP11-D2-28 (AC6/BR-005): status-general.json still written without PIPELINE_RUN_ID" `
            (Test-Path (Join-Path $g15IpcG 'status-general.json'))
        $g15LogDelta = Get-SmokeD2LogDelta -SinceLength $g15LogBefore
        Assert-True "T-WHP11-D2-29 (AC6/BR-005): zero D2-POLL log lines when PIPELINE_RUN_ID is unset" `
            (-not ($g15LogDelta -match 'D2-POLL'))
    } finally {
        Remove-Item $g15IpcG -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC12 (clamp half): hookGraceSec=9999 clamps to 300 and logs D2-GRACE-CLAMPED -- a pending
    # message keeps this a fast hit so the test doesn't itself wait out a five-minute grace window.
    $g15RunH = [guid]::NewGuid().ToString(); $g15StoryH = 'smoke-whp11-d2-h-' + (Get-Random)
    $g15IpcH = Join-Path $env:TEMP "smoke-whp11-d2-h-ipc-$(Get-Random)"
    try {
        $g15DummyH = New-SmokeD2Run -RunId $g15RunH -StoryId $g15StoryH -IpcDir $g15IpcH
        Add-SmokeD2Message -RunId $g15RunH | Out-Null
        Set-SmokeD2GraceSec -Seconds 9999
        $g15LogBeforeH = Get-SmokeD2LogLength
        $r12a = Invoke-SmokeD2StopReport -RunId $g15RunH -StoryId $g15StoryH -IpcDir $g15IpcH
        Assert-True "T-WHP11-D2-30 (AC12/BR-026): out-of-range grace still resolves via the fast hit path" ($r12a.Ms -lt 2000)
        $g15LogDeltaH = Get-SmokeD2LogDelta -SinceLength $g15LogBeforeH
        Assert-True "T-WHP11-D2-31 (AC12/BR-026): D2-GRACE-CLAMPED logged for hookGraceSec=9999" `
            ($g15LogDeltaH -match 'D2-GRACE-CLAMPED')
    } finally {
        if ($g15DummyH) { Stop-Process -Id $g15DummyH.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunH
        Remove-Item $g15IpcH -Recurse -Force -ErrorAction SilentlyContinue
    }

    # AC12 (zero-grace half): hookGraceSec=0 is a complete opt-out -- never knocks even with a
    # pending directive sitting right there, falls straight through to the pre-D2 behavior.
    $g15RunI = [guid]::NewGuid().ToString(); $g15StoryI = 'smoke-whp11-d2-i-' + (Get-Random)
    $g15IpcI = Join-Path $env:TEMP "smoke-whp11-d2-i-ipc-$(Get-Random)"
    try {
        $g15DummyI = New-SmokeD2Run -RunId $g15RunI -StoryId $g15StoryI -IpcDir $g15IpcI
        $g15MsgI = Add-SmokeD2Message -RunId $g15RunI
        Set-SmokeD2GraceSec -Seconds 0
        $r12b = Invoke-SmokeD2StopReport -RunId $g15RunI -StoryId $g15StoryI -IpcDir $g15IpcI
        Assert-True "T-WHP11-D2-32 (AC12/BR-004): zero-grace never knocks despite a pending directive" (-not ($r12b.Out -match '"decision"'))
        Assert-True "T-WHP11-D2-33 (AC12/BR-004): zero-grace resolves in under 2000ms" ($r12b.Ms -lt 2000)
        $rowI = Get-SmokeD2Run -RunId $g15RunI
        Assert-Equal "T-WHP11-D2-34 (AC12/BR-004): zero-grace still advances lifecycle to reported" 'reported' $rowI.lifecycle
        $msgI = Get-SmokeD2Message -MsgId $g15MsgI
        Assert-Equal "T-WHP11-D2-35 (AC12/BR-004): zero-grace never touches the directive (state stays pending)" 'pending' $msgI.state
        Assert-True "T-WHP11-D2-36 (AC12/BR-004): zero-grace never stamps knocked_at" (-not $msgI.knocked_at)
    } finally {
        if ($g15DummyI) { Stop-Process -Id $g15DummyI.Id -Force -ErrorAction SilentlyContinue }
        Remove-SmokeD2Run -RunId $g15RunI
        Remove-Item $g15IpcI -Recurse -Force -ErrorAction SilentlyContinue
    }
} finally {
    Copy-Item $g15CfgBackup $g15CfgPath -Force
    Remove-Item $g15CfgBackup -ErrorAction SilentlyContinue
    Remove-Item Env:\PHYCOOL_ORCHESTRATOR_MODE, Env:\PIPELINE_STORY_ID, Env:\PIPELINE_PHASE, Env:\PIPELINE_IPC_DIR, Env:\PIPELINE_REPORT_PATH, Env:\PIPELINE_RUN_ID, Env:\CLAUDE_PROJECT_DIR -ErrorAction SilentlyContinue
}

# -- Test Group 16: whp-12 console knock (static + CLI + isolated temp DB) ---------------------
# 🔴 本 Group 刻意不沿用 TD-WHP11-SMOKE-INFRA-HYGIENE-LIVE-MUTATION 記載的兩項反模式(AC12):
#    (a) 不對版控中的 scripts/pipeline-config.json 做 WriteAllText 覆寫 -- 改為產生 temp config
#        副本,經 knock-worker-ops.js 的 --config 指向它;
#    (b) 不對生產 .context-db/phycool.db 寫任何種子 -- 改為 migration SQL 建隔離 temp DB,
#        經 --db 指向它(範式取自 worker-directive-poll.test.js 的 createTestDb)。
#    這兩個 CLI 參數就是為了讓測試能完全隔離而存在的。
Write-Host "`n[Group 16] whp-12 console knock (static + CLI + temp DB)" -ForegroundColor Yellow

$g16Knock    = Join-Path $PSScriptRoot 'console-knock.ps1'
$g16Worker   = Join-Path $PSScriptRoot 'knock-worker.ps1'
$g16Ops      = Join-Path $hbProjectRoot '.context-db\scripts\knock-worker-ops.js'
$g16Proto    = Join-Path $PSScriptRoot 'protocol-template.md'
$g16Mig      = Join-Path $hbProjectRoot '.context-db\migrations\2026-07-27-add-worker-protocol-tables.sql'
$g16Tmp      = Join-Path $env:TEMP ("whp12-smoke-{0}" -f ([System.Guid]::NewGuid().ToString('N').Substring(0,8)))
New-Item -ItemType Directory -Path $g16Tmp -Force | Out-Null
$g16Utf8     = New-Object System.Text.UTF8Encoding($false)

function Get-G16Text { param([string]$Path) return [System.IO.File]::ReadAllText($Path, $g16Utf8) }

# temp DB seeder / reader:JS 寫成檔案再 node 執行(避免 node -e 在 PowerShell 內的引號與反引號地獄)
$g16SeedJs = Join-Path $g16Tmp 'seed.js'
[System.IO.File]::WriteAllText($g16SeedJs, @'
const path = require('path');
const fs = require('fs');
const Database = require(path.join(process.argv[2], '.context-db', 'node_modules', 'better-sqlite3'));
const [, , root, dbPath, migPath, specPath] = process.argv;
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const db = new Database(dbPath);
db.exec(fs.readFileSync(migPath, 'utf8'));
try { db.exec('ALTER TABLE worker_messages ADD COLUMN knocked_at TEXT'); } catch (e) { /* already there */ }
const T = '2026-01-01T00:00:00.000+08:00';
db.prepare(`INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle,
  controller_track, wrapper_pid, started_at, updated_at)
  VALUES (@run_id,@session_id,@story_id,@phase,@ipc_dir,'window',@lifecycle,'smoke',@wrapper_pid,@t,@t)`)
  .run({ run_id: spec.runId, session_id: spec.runId, story_id: 'smoke-whp12', phase: 'dev-story',
         ipc_dir: spec.ipcDir, lifecycle: spec.lifecycle, wrapper_pid: spec.wrapperPid, t: T });
// author 為 NOT NULL(migration :58)。whp-12 CR F1:原本漏填,每一筆 INSERT 都會拋、
// 被 New-G16Db 的 try/catch 吞掉,於是所有 temp DB 其實零訊息,下方以 -Pending N 為前提的
// 斷言全部在空資料上真空通過。
const ins = db.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at, knocked_at)
  VALUES (@run_id,@seq,'controller-to-worker','directive',@body,'controller','pending',@t,@knocked_at)`);
let seq = 1;
for (const m of (spec.pending || []))  ins.run({ run_id: spec.runId, seq: seq++, body: 'SMOKE-BODY-MUST-NOT-LEAK', t: T, knocked_at: null });
for (const m of (spec.knocked || []))  ins.run({ run_id: spec.runId, seq: seq++, body: 'SMOKE-BODY-MUST-NOT-LEAK', t: T, knocked_at: T });
const ids = db.prepare('SELECT msg_id, knocked_at FROM worker_messages WHERE run_id=? ORDER BY seq').all(spec.runId);
db.close();
console.log(JSON.stringify({ ok: true, msgs: ids }));
'@, $g16Utf8)

$g16ReadJs = Join-Path $g16Tmp 'read.js'
[System.IO.File]::WriteAllText($g16ReadJs, @'
const path = require('path');
const Database = require(path.join(process.argv[2], '.context-db', 'node_modules', 'better-sqlite3'));
const db = new Database(process.argv[3], { readonly: true });
const rows = db.prepare('SELECT msg_id, state, knocked_at FROM worker_messages WHERE run_id=? ORDER BY seq').all(process.argv[4]);
db.close();
console.log(JSON.stringify(rows));
'@, $g16Utf8)

function New-G16Db {
    param([string]$Lifecycle = 'reported', [int]$WrapperPid = 0, [string]$IpcDir = 'C:\smoke\whp12',
          [int]$Pending = 0, [int]$Knocked = 0)
    $runId   = [System.Guid]::NewGuid().ToString()
    $dbPath  = Join-Path $g16Tmp ("db-{0}.db" -f ([System.Guid]::NewGuid().ToString('N').Substring(0,8)))
    $specPath = Join-Path $g16Tmp ("spec-{0}.json" -f ([System.Guid]::NewGuid().ToString('N').Substring(0,8)))
    $spec = @{ runId = $runId; lifecycle = $Lifecycle; wrapperPid = $WrapperPid; ipcDir = $IpcDir
               pending = @(1..20 | Select-Object -First $Pending); knocked = @(1..20 | Select-Object -First $Knocked) }
    [System.IO.File]::WriteAllText($specPath, ($spec | ConvertTo-Json -Compress -Depth 4), $g16Utf8)
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $out = & node $g16SeedJs $hbProjectRoot $dbPath $g16Mig $specPath 2>&1
    $ErrorActionPreference = $prev
    $parsed = $null
    try { $parsed = ($out | Out-String).Trim() | ConvertFrom-Json } catch { }
    return [pscustomobject]@{ RunId = $runId; DbPath = $dbPath; Msgs = $(if ($parsed) { $parsed.msgs } else { @() }) }
}

function Invoke-G16Ops {
    param([string]$RunId, [string]$DbPath, [string]$ConfigPath = '')
    $a = @($g16Ops, '--run-id', $RunId, '--db', $DbPath)
    if ($ConfigPath) { $a += @('--config', $ConfigPath) }
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $out = & node @a 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $obj = $null
    try { $obj = ($out | Out-String).Trim() | ConvertFrom-Json } catch { }
    return [pscustomobject]@{ Exit = $code; Result = $obj; Raw = ($out | Out-String).Trim() }
}

try {
    # -- 靜態斷言(原語與 wrapper 的行為邊界)-------------------------------------------------
    $g16KnockSrc  = Get-G16Text $g16Knock
    $g16WorkerSrc = Get-G16Text $g16Worker
    $g16OpsSrc    = Get-G16Text $g16Ops

    Assert-True "T-WHP12-01 BR008_PrimitiveFile_ReferencesNoDomainTable" `
        (-not ($g16KnockSrc -match 'worker_runs|ctrl_|\.context-db|better-sqlite3'))
    Assert-True "T-WHP12-02 BR010_RecordBuilder_EmitsKeyDownOnlyExactlyOnce (static half)" `
        (-not ($g16KnockSrc -match 'bKeyDown\s*=\s*(false|\$false|0)'))
    Assert-True "T-WHP12-03 BR013_PrimitiveFile_ContainsNoFocusStealingApi" `
        (-not ($g16KnockSrc -match 'SetForegroundWindow|PostMessage|SendKeys|AppActivate'))
    Assert-True "T-WHP12-04 BR014_NewScripts_ContainNoKillPrimitive" `
        (-not (($g16KnockSrc + $g16WorkerSrc) -match 'taskkill|Stop-Process|TerminateProcess|CTRL_CLOSE_EVENT|GenerateConsoleCtrlEvent'))
    Assert-True "T-WHP12-05 BR012_PartialWriteBranch_ExistsWithErrorCode" `
        (($g16KnockSrc -match 'WHP12-E05') -and ($g16KnockSrc -match 'lpNumberOfEventsWritten|wroteText|wroteEnter'))
    Assert-True "T-WHP12-06 BR015_OpsModule_ImportsJudgeLivenessWithNoLocalProbe" `
        (($g16OpsSrc -match 'judgeLiveness') -and (-not ($g16OpsSrc -match 'Win32_Process')))
    Assert-True "T-WHP12-07 BR022 knockEnabled has a grep-able consumer in ops or wrapper" `
        (($g16OpsSrc + $g16WorkerSrc) -match 'knockEnabled')

    # BR-007:對區段擷取結果下否定斷言之前,必先斷言該區段非空(bwu-7 F13 -- 標記一改名,
    # 否定斷言就會在空字串上真空通過)。
    $g16Start = $g16KnockSrc.IndexOf('# region NON-ISOLATED BRANCH')
    $g16End   = $g16KnockSrc.IndexOf('# endregion NON-ISOLATED BRANCH')
    $g16Seg   = if ($g16Start -ge 0 -and $g16End -gt $g16Start) { $g16KnockSrc.Substring($g16Start, $g16End - $g16Start) } else { '' }
    Assert-True "T-WHP12-08 BR007 non-isolated region marker present and non-empty (precondition)" `
        (($g16Seg.Length -gt 0) -and ($g16Seg -match 'Start-Process'))
    Assert-True "T-WHP12-09 BR007_NonIsolatedBranch_ContainsNoPInvokeCall" `
        (($g16Seg.Length -gt 0) -and (-not ($g16Seg -match 'AttachConsole|FreeConsole|WriteConsoleInput')))

    # BR-026:送出鍵由原語自行附加,恰一個,且在陣列末端 -- 來源不是 -Text
    Assert-True "T-WHP12-10 BR026 submit key appended by the primitive at the array tail" `
        ($g16KnockSrc -match "recs\[text\.Length\]\s*=\s*MakeKeyDown\(\(ushort\)'\\r',\s*VK_RETURN\)")

    # BR-021:stamp 的呼叫位置必須在敲門之後(順序以原始碼位置斷言 -- 先 stamp 再注入會永久
    # 吃掉該指示的一次敲門預算)
    $g16IdxKnock = $g16WorkerSrc.IndexOf('-TargetPid $targetPid -Text $knockText')
    $g16IdxStamp = $g16WorkerSrc.IndexOf('--stamp')
    Assert-True "T-WHP12-11 BR021 stamp call site comes after the injection call site" `
        (($g16IdxKnock -ge 0) -and ($g16IdxStamp -gt $g16IdxKnock))

    # AC14-3:protocol-template.md 相對 HEAD 逐位元不變(HEAD 不可省 -- 無 rev 的 git diff
    # 比對的是 worktree vs index,`git add` 即可繞過守護)
    Push-Location $hbProjectRoot
    $g16ProtoDiff = (& git diff --stat HEAD -- '.claude/skills/party-to-pipeline/scripts/protocol-template.md' 2>&1 | Out-String).Trim()
    Pop-Location
    Assert-Equal "T-WHP12-12 BR020_ProtocolTemplate_ByteUnchangedVsHead" '' $g16ProtoDiff

    # AC12 自我守護:本 Group 區間不得沿用 TD-WHP11-SMOKE-INFRA-HYGIENE-LIVE-MUTATION 的兩項反模式。
    #
    # ⚠ 這道守護會掃到自己所在的檔案,故有兩層去雜訊,缺一則恆 FAIL:
    #   (1) 只掃可執行行 -- 註解行(^#)排除,否則上方說明"不對 X 做 Y"的那句話自己就命中;
    #       不能改用既有的 Get-NonCommentHitCount,那個掃整檔,會命中 Group 15 真正的 live 覆寫。
    #   (2) 下面兩個 Assert 的名稱刻意不寫出被搜尋的字面 -- Assert 名稱不是註解行,過不了 (1)。
    # 這與 console-knock.ps1 內那條"註解不寫出被禁 API 名"的紀律是同一件事的兩個現場。
    $g16SelfSrc   = Get-G16Text $PSCommandPath
    $g16SelfSeg   = $g16SelfSrc.Substring($g16SelfSrc.IndexOf('# -- Test Group 16'))
    $g16SelfExec  = (@($g16SelfSeg -split "`n" | Where-Object { $_.TrimStart() -notmatch '^#' })) -join "`n"
    Assert-True "T-WHP12-13 AC12 Group 16 never overwrites the versioned pipeline config file" `
        (-not ($g16SelfExec -match 'WriteAllText[^\r\n]*pipeline\-config\.json'))
    Assert-True "T-WHP12-14 AC12 Group 16 never seeds the production context DB" `
        (-not ($g16SelfExec -match 'phycool\.db'))

    # -- CLI 斷言(不需 DB)-------------------------------------------------------------------
    $g16AuditLog = Join-Path $hbProjectRoot 'logs\console-knock.log'
    $g16LinesBefore = if (Test-Path $g16AuditLog) { @([System.IO.File]::ReadAllLines($g16AuditLog, $g16Utf8)).Count } else { 0 }

    & $g16Knock -TargetPid 999999 -Text 'SMOKE-DEAD-PID' | Out-Null
    Assert-Equal "T-WHP12-15 BR009_AttachFailureCodes_MapToDistinctExitCodes (dead pid -> 5)" 5 $LASTEXITCODE

    & $g16Knock -TargetPid 999999 -Text ([char]0x4E2D + [char]0x6587) | Out-Null
    Assert-Equal "T-WHP12-16 BR011_NonAsciiText_RejectedBeforeAnyWin32Call" 6 $LASTEXITCODE

    & $g16Knock -TargetPid 999999 -Text ('a' + [char]13 + 'b') | Out-Null
    Assert-Equal "T-WHP12-17 BR026_TextWithLineBreak_RejectedAndSingleEnterAppended (CR)" 6 $LASTEXITCODE

    & $g16Knock -TargetPid 999999 -Text ('a' + [char]10 + 'b') | Out-Null
    Assert-Equal "T-WHP12-18 BR026_TextWithLineBreak_RejectedAndSingleEnterAppended (LF)" 6 $LASTEXITCODE

    # BR-027:每次呼叫恰一行稽核 -- 含被拒的 CR/LF 輸入(其 payload 必須先摺成單行,
    # 否則一次呼叫會在 log 留下兩行,計數就失準)
    $g16LinesAfter = if (Test-Path $g16AuditLog) { @([System.IO.File]::ReadAllLines($g16AuditLog, $g16Utf8)).Count } else { 0 }
    Assert-Equal "T-WHP12-19 BR027_BothOutcomePaths_AppendExactlyOneAuditLine (4 calls -> +4 lines)" 4 ($g16LinesAfter - $g16LinesBefore)

    # -- 隔離 temp DB 斷言 -------------------------------------------------------------------
    # BR-016:PID 未登記(wrapper_pid=0)-> not-registered -> exit 2 零注入
    $g16A = New-G16Db -Lifecycle 'reported' -WrapperPid 0 -Pending 1
    $g16RA = Invoke-G16Ops -RunId $g16A.RunId -DbPath $g16A.DbPath
    Assert-Equal "T-WHP12-20 BR016_DeadOrReusedPid_Exit2WithZeroInjection (exit)" 2 $g16RA.Exit
    Assert-Equal "T-WHP12-21 BR016 reason echoed verbatim" 'not-registered' $g16RA.Result.reason
    Assert-Equal "T-WHP12-22 BR016 code" 'WHP12-E06' $g16RA.Result.code

    # BR-017:lifecycle 不在白名單 -> exit 2,且在任何 Win32 呼叫之前
    $g16B = New-G16Db -Lifecycle 'running' -WrapperPid $PID -Pending 1
    $g16RB = Invoke-G16Ops -RunId $g16B.RunId -DbPath $g16B.DbPath
    Assert-Equal "T-WHP12-23 BR017_LifecycleOutsideAllowList_Exit2BeforeWin32 (exit)" 2 $g16RB.Exit
    Assert-True "T-WHP12-24 BR017 code is WHP12-E07 or liveness rejected first" `
        ($g16RB.Result.code -in @('WHP12-E07', 'WHP12-E06'))
    Assert-True "T-WHP12-25 BR017 zero injection payload (no text handed back)" (-not $g16RB.Result.text)

    # BR-019:零 pending 是合法 no-op(exit 0,不是錯誤)
    $g16C = New-G16Db -Lifecycle 'reported' -WrapperPid 0 -Pending 0
    $g16RC = Invoke-G16Ops -RunId $g16C.RunId -DbPath $g16C.DbPath
    Assert-Equal "T-WHP12-26 BR019_ZeroPending_BenignNoOpExit0 (liveness rejected first, still no text)" $null $g16RC.Result.text

    # BR-018:已被 D2 敲過的指示不再被慢環敲(peekPending 的 knocked_at IS NULL 是共用迴圈上界)
    $g16D = New-G16Db -Lifecycle 'reported' -WrapperPid 0 -Pending 0 -Knocked 2
    $g16RD = Invoke-G16Ops -RunId $g16D.RunId -DbPath $g16D.DbPath
    Assert-True "T-WHP12-27 BR018_AlreadyKnockedDirective_ExcludedByPeek (never yields text)" (-not $g16RD.Result.text)

    # BR-022:kill switch -- 用 temp config 副本,不碰版控中的那一份
    $g16CfgTmp = Join-Path $g16Tmp 'cfg-disabled.json'
    [System.IO.File]::WriteAllText($g16CfgTmp, '{"workerProtocol":{"knockEnabled":false}}', $g16Utf8)
    $g16E = New-G16Db -Lifecycle 'reported' -WrapperPid 0 -Pending 1
    $g16RE = Invoke-G16Ops -RunId $g16E.RunId -DbPath $g16E.DbPath -ConfigPath $g16CfgTmp
    Assert-Equal "T-WHP12-28 BR022_KnockDisabled_NoOpAndFlagHasRealConsumer (exit 0)" 0 $g16RE.Exit
    Assert-Equal "T-WHP12-29 BR022 reason=disabled (真 no-op,不是 silent pass-through)" 'disabled' $g16RE.Result.reason
    $g16MsgsE = & node $g16ReadJs $hbProjectRoot $g16E.DbPath $g16E.RunId | ConvertFrom-Json
    Assert-True "T-WHP12-30 BR022 kill switch performs zero DB mutation (knocked_at all NULL)" `
        (@($g16MsgsE | Where-Object { $_.knocked_at }).Count -eq 0)

    # BR-023 前半:DB 不可讀 -> fail-OPEN(exit 0,不敲門本身無害)
    $g16RF = Invoke-G16Ops -RunId ([System.Guid]::NewGuid().ToString()) -DbPath (Join-Path $g16Tmp 'does-not-exist-dir\nope.db')
    Assert-Equal "T-WHP12-31 BR023 db-unreadable fails OPEN (exit 0)" 0 $g16RF.Exit
    Assert-True "T-WHP12-32 BR023 db-unreadable never yields a knock" (-not $g16RF.Result.ok)

    # BR-020:兩筆 pending -> 一次敲門,文字含則數與全部 msg_id,且不含 body
    $g16G = New-G16Db -Lifecycle 'reported' -WrapperPid $PID -IpcDir 'C:\smoke\whp12-g' -Pending 2
    $g16RG = Invoke-G16Ops -RunId $g16G.RunId -DbPath $g16G.DbPath
    if ($g16RG.Result.ok) {
        $g16Ids = ($g16G.Msgs | ForEach-Object { $_.msg_id }) -join ','
        Assert-True "T-WHP12-33 BR020_TwoPending_SingleKnockNamingBothMsgIds (count + all ids)" `
            (($g16RG.Result.text -match 'x2') -and ($g16RG.Result.text -match [regex]::Escape("msg_id=$g16Ids")))
        Assert-True "T-WHP12-34 BR020 knock text names the read path" `
            ($g16RG.Result.text -match 'read-worker-directives\.js')
        Assert-True "T-WHP12-35 BR004 knock text never carries the directive body" `
            (-not ($g16RG.Result.text -match 'SMOKE-BODY-MUST-NOT-LEAK'))
    } else {
        # 本機 smoke 的 wrapper_pid 借用 $PID(smoke 自己),4-Tuple 的 cmdline 比對必然失敗,
        # 屬預期 -- 此時改以 ops 未回傳任何文字作為"零注入"的等價斷言,不放水成永綠。
        Assert-Equal "T-WHP12-33 BR020 (liveness rejected as expected in smoke host) exit=2" 2 $g16RG.Exit
        Assert-True  "T-WHP12-34 BR020 rejected path yields no text"  (-not $g16RG.Result.text)
        Assert-True  "T-WHP12-35 BR004 rejected path leaks no body"   (-not ($g16RG.Raw -match 'SMOKE-BODY-MUST-NOT-LEAK'))
    }

    # wrapper 端到端:ops 前置未過時 knock-worker.ps1 必須轉述並 exit 2,且零注入
    & $g16Worker -RunId $g16A.RunId -DryRun 2>&1 | Out-Null
    Assert-Equal "T-WHP12-36 knock-worker.ps1 relays precondition failure as exit 2" 2 $LASTEXITCODE

    # -- whp-12 CR 補測(F5 / F7)----------------------------------------------------------
    # AC6 第 3 項原本零覆蓋:活著但沒有 console 的目標 -> ERROR_INVALID_HANDLE -> E02 / exit 4。
    # 用 GUI 進程當靶(它天生沒有 console),CR 實測穩定且 sub-second。
    $g16GuiTarget = Start-Process -FilePath 'notepad.exe' -WindowStyle Hidden -PassThru
    try {
        Start-Sleep -Milliseconds 800
        & $g16Knock -TargetPid $g16GuiTarget.Id -Text 'SMOKE-NO-CONSOLE' | Out-Null
        Assert-Equal "T-WHP12-37 BR009 target without a console -> exit 4 (AC6-3, was uncovered)" 4 $LASTEXITCODE
    } finally {
        Stop-Process -Id $g16GuiTarget.Id -Force -ErrorAction SilentlyContinue
    }

    # F5 回歸鎖:守衛必須在 -Isolated 分支也生效 -- 該分支原本完全繞過 ASCII/換行守衛,
    # 而換行正是 BR-026 要擋的東西(一次呼叫排進多個 prompt)。
    $g16IsoDir = Join-Path $g16Tmp 'iso'
    New-Item -ItemType Directory -Path $g16IsoDir -Force | Out-Null
    $g16IsoText = Join-Path $g16IsoDir 'text.txt'
    $g16IsoRes  = Join-Path $g16IsoDir 'result.json'
    [System.IO.File]::WriteAllText($g16IsoText, ("line1" + [char]13 + [char]10 + "line2"), $g16Utf8)
    & $g16Knock -TargetPid 999999 -Isolated -TextFile $g16IsoText -ResultFile $g16IsoRes | Out-Null
    Assert-Equal "T-WHP12-38 BR026 -Isolated branch enforces the guard too (exit 6)" 6 $LASTEXITCODE
    $g16IsoObj = if (Test-Path $g16IsoRes) { [System.IO.File]::ReadAllText($g16IsoRes, $g16Utf8) | ConvertFrom-Json } else { $null }
    Assert-Equal "T-WHP12-39 BR026 -Isolated rejection is reported as WHP12-E04" 'WHP12-E04' $(if ($g16IsoObj) { $g16IsoObj.code } else { 'NO-RESULT' })
    Assert-Equal "T-WHP12-40 BR026 -Isolated rejection happens before any Win32 call (stage)" 'AsciiGuard' $(if ($g16IsoObj) { $g16IsoObj.stage } else { 'NO-RESULT' })
} catch {
    Assert-True "T-WHP12-FATAL: Group 16 threw an unhandled exception: $_" $false
} finally {
    Remove-Item $g16Tmp -Recurse -Force -ErrorAction SilentlyContinue
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
