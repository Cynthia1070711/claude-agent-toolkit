# ==============================================================================
# orchestrator.ps1  v1.0.0
# party-to-pipeline v4.0.0 -- Orchestrator (Control Center)
#
# Run from main conversation window. Sequentially launches 3 worker windows
# (create-story / dev-story / code-review) with bidirectional ACK handshake.
#
# Usage:
#   .\orchestrator.ps1 -StoryId "td-pipeline-party-orchestrator-v4"
#   .\orchestrator.ps1 -StoryId "..." -Track main -DryRun
#   .\orchestrator.ps1 -StoryId "..." -SkipCreate -SkipReview
# ==============================================================================
#Requires -Version 5.1
# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------
[CmdletBinding()]
param(
    [string]$StoryId = "",                 # v5.0.0: Optional (use either StoryId OR StoryIds)
    [string[]]$StoryIds = @(),             # v5.0.0 (T4.6): Multi-Story batch mode
    [ValidateSet('main','side','auto')][string]$Track = 'auto',
    [switch]$DryRun,
    [switch]$SkipCreate,
    [switch]$SkipDev,
    [switch]$SkipReview,
    [int]$MaxRetries = 1,
    [int]$AckTimeoutSec = 90,
    [int]$AckWaitSec = 60,
    [int]$CountdownSec = 5,
    [int]$WorkerTimeoutSec = 1800,
    [int]$WindowCloseTimeoutSec = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Load shared utilities ─────────────────────────────────────────────────────
$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$LogDir      = Get-LogDir
$Timestamp   = Get-Date -Format "yyyyMMdd-HHmmss"

# v5.0.0 (T4.6): Multi-Story batch mode dispatch -- runs BEFORE single-Story setup
function Invoke-MultiStoryBatch {
    param([Parameter(Mandatory)][string[]]$Ids)
    Write-PpLog ("=" * 70) "SYSTEM"
    Write-PpLog "MULTI-STORY BATCH MODE (T4.6) -- analyzing conflict matrix..." "STEP"
    Write-PpLog ("=" * 70) "SYSTEM"
    # Step 1: Validate all stories exist
    foreach ($sid in $Ids) {
        $s = Get-StoryFromDb -StoryId $sid
        if (-not $s) { throw "Story '$sid' not found in DB" }
    }
    # Step 2: Compute conflict matrix
    $matrix = @(Test-FileConflictMatrix -StoryIds $Ids)
    Write-PpLog "" "INFO"
    Write-PpLog "Conflict Matrix Analysis:" "STEP"
    if ($matrix.Count -eq 0) {
        Write-PpLog "  [OK] All Stories DISJOINT (no shared files)" "SUCCESS"
    } else {
        foreach ($m in $matrix) {
            $marker = switch ($m.severity) {
                'HARD_BLOCK' { '[BLOCK]' }
                'SOFT_BLOCK' { '[SOFT] ' }
                'READ_SHARED'{ '[READ] ' }
                default      { '[INFO] ' }
            }
            Write-PpLog "  $marker $($m.story_a) <-> $($m.story_b) [$($m.severity)] -- $($m.conflict_files.Count) shared file(s)" "WARN"
            foreach ($f in ($m.conflict_files | Select-Object -First 3)) {
                Write-PpLog "      $f" "DEBUG"
            }
            if ($m.conflict_files.Count -gt 3) {
                Write-PpLog "      ... (+$($m.conflict_files.Count - 3) more)" "DEBUG"
            }
        }
    }
    # Step 3: Schedule batches
    $batches = @(Schedule-Batches -StoryIds $Ids -ConflictMatrix $matrix)
    Write-PpLog "" "INFO"
    Write-PpLog "Batch Decision Tree:" "STEP"
    for ($i = 0; $i -lt $batches.Count; $i++) {
        $b = $batches[$i]
        Write-PpLog "  Batch $($i+1) of $($batches.Count): [$($b -join ', ')]" "INFO"
    }
    Write-PpLog "" "INFO"
    Write-PpLog "NOTE: v5.0.0 dispatches Stories SEQUENTIALLY within each batch." "WARN"
    Write-PpLog "      Parallel spawn within batch is FUTURE enhancement (td-pipeline-multi-story-parallel-spawn)." "WARN"
    Write-PpLog "      Conflict matrix above is for AWARENESS -- same-batch Stories CAN safely run parallel in future." "WARN"
    Write-PpLog "" "INFO"
    if ($DryRun) {
        Write-PpLog "[DRY-RUN] Multi-Story batch preview complete. Skipping actual dispatch." "WARN"
        return
    }
    # Step 4: Per-Story sequential dispatch (recursive self-invoke)
    $allStartTime = Get-Date
    $batchIdx = 0
    foreach ($batch in $batches) {
        $batchIdx++
        Write-PpLog "" "SYSTEM"
        Write-PpLog ("═" * 70) "SYSTEM"
        Write-PpLog "BATCH $batchIdx / $($batches.Count) START : [$($batch -join ', ')]" "STEP"
        Write-PpLog ("═" * 70) "SYSTEM"
        foreach ($sid in $batch) {
            Write-PpLog "" "INFO"
            Write-PpLog "Dispatching: $sid (Batch $batchIdx)" "STEP"
            $args = @('-StoryId', $sid, '-Track', $Track,
                      '-MaxRetries', $MaxRetries,
                      '-AckTimeoutSec', $AckTimeoutSec,
                      '-AckWaitSec', $AckWaitSec,
                      '-CountdownSec', $CountdownSec,
                      '-WorkerTimeoutSec', $WorkerTimeoutSec,
                      '-WindowCloseTimeoutSec', $WindowCloseTimeoutSec)
            if ($SkipCreate) { $args += '-SkipCreate' }
            if ($SkipDev)    { $args += '-SkipDev' }
            if ($SkipReview) { $args += '-SkipReview' }
            & $PSCommandPath @args
            if ($LASTEXITCODE -ne 0) {
                Write-PpLog "[$sid] orchestrator exit code $LASTEXITCODE -- ABORT batch $batchIdx" "ERROR"
                throw "Story $sid failed (exit=$LASTEXITCODE)"
            }
        }
        Write-PpLog "BATCH $batchIdx / $($batches.Count) END" "SUCCESS"
    }
    $totalElapsed = (Get-Date) - $allStartTime
    Write-PpLog "" "SYSTEM"
    Write-PpLog ("=" * 70) "SUCCESS"
    Write-PpLog "Multi-Story batch DONE in $([math]::Round($totalElapsed.TotalMinutes,1)) min ($($Ids.Count) Stories / $($batches.Count) batches)" "SUCCESS"
    Write-PpLog ("=" * 70) "SUCCESS"
}

# v5.0.0 (T4.6): Param routing -- multi-Story takes precedence over single-Story
if ($StoryIds.Count -gt 0) {
    $Host.UI.RawUI.WindowTitle = "Orchestrator | Multi-Story ($($StoryIds.Count))"
    Invoke-MultiStoryBatch -Ids $StoryIds
    exit 0
}
if (-not $StoryId) {
    throw "Must provide -StoryId (single Story) or -StoryIds (batch mode)"
}

$IpcDir      = New-IpcDir -StoryId $StoryId

$Host.UI.RawUI.WindowTitle = "Orchestrator | $StoryId"

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "party-to-pipeline v4.0.0 Orchestrator" "SYSTEM"
Write-PpLog "Story    : $StoryId" "SYSTEM"
Write-PpLog "IPC dir  : $IpcDir" "SYSTEM"
Write-PpLog "Log dir  : $LogDir" "SYSTEM"
Write-PpLog ("=" * 70) "SYSTEM"

# ── Load Story from DB ────────────────────────────────────────────────────────
$Story = Get-StoryFromDb -StoryId $StoryId
if (-not $Story) {
    Write-PpLog "Story '$StoryId' not found in DB. Run upsert-story.js first." "ERROR"
    exit 1
}

# ── Resolve Track (auto-detect from DB if not specified) ──────────────────────
if ($Track -eq 'auto') {
    $dbTrack = if ($Story.PSObject.Properties.Name -contains 'task_track' -and $Story.task_track) {
        $Story.task_track
    } else { 'main' }
    $Track = $dbTrack
}
$Complexity = if ($Story.complexity) { $Story.complexity } else { 'M' }

Write-PpLog "Title      : $($Story.title)" "INFO"
Write-PpLog "Status     : $($Story.status)" "INFO"
Write-PpLog "Track      : $Track" "INFO"
Write-PpLog "Complexity : $Complexity" "INFO"

# ── Handshake config ──────────────────────────────────────────────────────────
$hsCfg = Get-HandshakeConfig
if (-not $hsCfg.enabled) {
    Write-PpLog "WARNING: handshake.enabled=false in pipeline-config.json -- orchestrator will still run with file-based IPC" "WARN"
}

# ── DryRun preview ────────────────────────────────────────────────────────────
if ($DryRun) {
    Write-PpLog "[DRY-RUN] Would execute the following phases:" "WARN"
    @('create-story','dev-story','code-review') | ForEach-Object {
        $skip = switch ($_) {
            'create-story' { $SkipCreate }
            'dev-story'    { $SkipDev }
            'code-review'  { $SkipReview }
        }
        $marker = if ($skip) { '[SKIP]' } else { '[EXEC]' }
        $model  = (Read-PhaseModel -PhaseName $_ -Complexity $Complexity).model_id
        Write-PpLog "  $marker $_  -> $model" "INFO"
    }
    exit 0
}

# ═════════════════════════════════════════════════════════════════════════════
#  Phase invocation
# ═════════════════════════════════════════════════════════════════════════════
function Invoke-WorkerPhase {
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$WorkerName
    )
    $phaseStart = Get-Date
    Write-PpLog "" "SYSTEM"
    Write-PpLog ("─" * 70) "STEP"
    Write-PpLog "PHASE: $Phase" "STEP"
    Write-PpLog ("─" * 70) "STEP"

    $attempt = 0
    while ($attempt -le $MaxRetries) {
        $attempt++

        # Step 1: Clear IPC residue
        Clear-IpcStage -IpcDir $IpcDir -Phase $Phase

        # Step 2: Resolve model
        $modelInfo = Read-PhaseModel -PhaseName $Phase -Complexity $Complexity -RetryCount ($attempt - 1)
        Write-PpLog "Model: $($modelInfo.model_id) | effort=$($modelInfo.effort)" "INFO"

        # Step 3: Write task file (with track + complexity for worker)
        Write-TaskFile -IpcDir $IpcDir -Phase $Phase -Payload @{
            story_id     = $StoryId
            task_track   = $Track
            complexity   = $Complexity
            model_id     = $modelInfo.model_id
            effort       = $modelInfo.effort
            attempt      = $attempt
            ipc_dir      = $IpcDir
        }

        # Step 4: Launch worker window
        $workerScript = Join-Path $ScriptsDir $WorkerName
        if (-not (Test-Path $workerScript)) {
            Write-PpLog "Worker script missing: $workerScript" "ERROR"
            throw "Missing worker: $WorkerName"
        }

        Write-PpLog "Launching worker: $WorkerName" "STEP"
        $workerProc = Start-Process powershell -ArgumentList @(
            '-NoExit',
            '-ExecutionPolicy','Bypass',
            '-File',$workerScript,
            '-StoryId',$StoryId,
            '-IpcDir',$IpcDir,
            '-Track',$Track,
            '-Complexity',$Complexity,
            '-Phase',$Phase
        ) -PassThru -WindowStyle Normal

        Write-PpLog "Worker PID: $($workerProc.Id)" "INFO"
        # v5.0.0 (T1.1): write tracker with window_title for visual identification
        $winTitle = "[$($Phase.ToUpper())] $StoryId"
        Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'running' `
            -ProcessId $workerProc.Id -IpcDir $IpcDir -WindowTitle $winTitle

        # Step 5: Wait for status (Stop hook writes it)
        Write-PpLog "Awaiting status from worker (timeout ${WorkerTimeoutSec}s)..." "INFO"
        $status = Wait-StatusFile -IpcDir $IpcDir -Phase $Phase -TimeoutSec $WorkerTimeoutSec
        Write-Host ""

        if (-not $status) {
            Write-PpLog "[$Phase] Status timeout -- falling back to DB target check" "WARN"
            $dbStatus = Get-StoryStatus -StoryId $StoryId
            # T2.6 v5.0.0: 改用 [System.IO.File]::ReadAllText UTF-8 No-BOM
            $cfgPath = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
            $targets  = ([System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json).phaseTargetStatus.$Phase
            if ($targets -and ($targets -contains $dbStatus)) {
                Write-PpLog "[$Phase] DB target reached ($dbStatus) -- synthesizing partial status" "WARN"
                $status = @{
                    phase    = $Phase
                    status   = 'partial'
                    evidence = @{ db_status = $dbStatus; fallback = $true }
                }
            } else {
                Write-PpLog "[$Phase] Worker timeout AND DB target not met -- kill + retry" "ERROR"
                # v5.0.0 (T1.2): 4-Tuple verified kill (PID-reuse safe)
                Stop-WorkerSafe -IpcDir $IpcDir -StoryId $StoryId -Phase $Phase | Out-Null
                if ($attempt -le $MaxRetries) {
                    Write-PpLog "[$Phase] Retrying (attempt $($attempt+1)/$($MaxRetries+1))..." "WARN"
                    Start-Sleep -Seconds 5
                    continue
                }
                throw "[$Phase] Failed after $($MaxRetries+1) attempts"
            }
        }

        # Step 6: Validate evidence
        Write-PpLog "Validating evidence..." "INFO"
        $valid = Confirm-StageResult -Phase $Phase -Status $status

        if ($valid) {
            $nextPhase = switch ($Phase) {
                'create-story' { 'dev-story' }
                'dev-story'    { 'code-review' }
                'code-review'  { '' }
            }
            Write-AckFile -IpcDir $IpcDir -Phase $Phase -Ok $true -Message "Validation passed, ready to close" -NextPhase $nextPhase
            Write-PpLog "[$Phase] ACK sent (ok=true)" "ACK"
        } else {
            $reason = if ($status.error) { $status.error } else { 'evidence validation failed' }
            Write-AckFile -IpcDir $IpcDir -Phase $Phase -Ok $false -Message $reason
            Write-PpLog "[$Phase] ACK sent (ok=false): $reason" "ERROR"

            # Wait for worker to acknowledge reject and exit
            Wait-WindowClosed -Proc $workerProc -IpcDir $IpcDir -Phase $Phase -StoryId $StoryId -TimeoutSec $WindowCloseTimeoutSec | Out-Null

            if ($attempt -le $MaxRetries) {
                Write-PpLog "[$Phase] Retrying (attempt $($attempt+1)/$($MaxRetries+1))..." "WARN"
                Start-Sleep -Seconds 5
                continue
            }
            throw "[$Phase] Validation failed after $($MaxRetries+1) attempts"
        }

        # Step 7: Wait for triple-confirm window closed
        Write-PpLog "Waiting for worker window to close (triple-confirm)..." "INFO"
        $closed = Wait-WindowClosed -Proc $workerProc -IpcDir $IpcDir -Phase $Phase -StoryId $StoryId -TimeoutSec $WindowCloseTimeoutSec
        if (-not $closed) {
            Write-PpLog "Worker did not close in ${WindowCloseTimeoutSec}s -- force terminate via Stop-WorkerSafe" "WARN"
            # v5.0.0 (T1.2): 4-Tuple verified kill replaces direct Stop-Process / taskkill
            Stop-WorkerSafe -IpcDir $IpcDir -StoryId $StoryId -Phase $Phase | Out-Null
        } else {
            Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'closed' -ProcessId $workerProc.Id -IpcDir $IpcDir
        }

        $elapsed = ((Get-Date) - $phaseStart).TotalSeconds
        Write-PpLog "[$Phase] DONE in $([math]::Round($elapsed,1))s" "SUCCESS"
        return $status
    }
}

# ── Evidence validation (post-status check) ──────────────────────────────────
function Confirm-StageResult {
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)]$Status
    )
    if (-not $Status) { return $false }
    if ($Status.status -eq 'failed') {
        Write-PpLog "Status reports failed: $($Status.error)" "WARN"
        return $false
    }
    # Re-check DB status against phase target
    $cfgFile = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
    # T2.6 v5.0.0: 改用 [System.IO.File]::ReadAllText UTF-8 No-BOM
    $targets = ([System.IO.File]::ReadAllText($cfgFile, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json).phaseTargetStatus.$Phase
    $dbStatus = Get-StoryStatus -StoryId $StoryId
    if ($targets -and -not ($targets -contains $dbStatus)) {
        Write-PpLog "DB status '$dbStatus' does not match phase target $($targets -join '/')" "WARN"
        return $false
    }
    # tasks-backfill check (dev/review only)
    if ($Phase -in @('dev-story','code-review')) {
        if ($Status.evidence -and $Status.evidence.PSObject.Properties.Name -contains 'tasks_backfilled') {
            if (-not $Status.evidence.tasks_backfilled) {
                Write-PpLog "tasks_backfilled=false in evidence" "WARN"
                return $false
            }
        }
    }
    return $true
}

# ── Summary ───────────────────────────────────────────────────────────────────
function Show-Summary {
    param([datetime]$StartTime)
    $elapsed = (Get-Date) - $StartTime
    $story = Get-StoryFromDb -StoryId $StoryId
    Write-PpLog "" "SYSTEM"
    Write-PpLog ("=" * 70) "SUCCESS"
    Write-PpLog " Orchestrator complete" "SUCCESS"
    Write-PpLog ("=" * 70) "SUCCESS"
    Write-PpLog "Story    : $StoryId - $($story.title)" "SUCCESS"
    Write-PpLog "Track    : $Track" "SUCCESS"
    Write-PpLog "Status   : $($story.status)" "SUCCESS"
    Write-PpLog "Elapsed  : $([math]::Round($elapsed.TotalMinutes,1)) min" "SUCCESS"
    Write-PpLog "IPC dir  : $IpcDir" "SUCCESS"
}

# ═════════════════════════════════════════════════════════════════════════════
#  Main flow
# ═════════════════════════════════════════════════════════════════════════════
$startTime = Get-Date
try {
    if (-not $SkipCreate) {
        Invoke-WorkerPhase -Phase 'create-story' -WorkerName 'worker-create.ps1' | Out-Null
    } else {
        Write-PpLog "[create-story] SKIPPED" "WARN"
    }

    if (-not $SkipDev) {
        Invoke-WorkerPhase -Phase 'dev-story' -WorkerName 'worker-dev.ps1' | Out-Null
    } else {
        Write-PpLog "[dev-story] SKIPPED" "WARN"
    }

    if (-not $SkipReview) {
        Invoke-WorkerPhase -Phase 'code-review' -WorkerName 'worker-review.ps1' | Out-Null
    } else {
        Write-PpLog "[code-review] SKIPPED" "WARN"
    }

    Show-Summary -StartTime $startTime
    exit 0

} catch {
    Write-PpLog "" "SYSTEM"
    Write-PpLog ("=" * 70) "ERROR"
    Write-PpLog " Orchestrator FAILED" "ERROR"
    Write-PpLog ("=" * 70) "ERROR"
    Write-PpLog "Error: $_" "ERROR"
    Show-Summary -StartTime $startTime
    exit 1
}
