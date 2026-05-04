# ==============================================================================
# worker-dev.ps1  v1.0.0
# party-to-pipeline v4.0.0 -- Dev-Story Worker (sub-window)
#
# Launched by orchestrator.ps1 via Start-Process. NOT for manual use.
# Prerequisites: create-story phase completed (status=ready-for-dev).
# ==============================================================================
#Requires -Version 5.1
# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StoryId,
    [Parameter(Mandatory)][string]$IpcDir,
    [Parameter(Mandatory)][string]$Track,
    [Parameter(Mandatory)][string]$Complexity,
    [string]$Phase = 'dev-story'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$LogDir      = Get-LogDir

$Host.UI.RawUI.WindowTitle = "[DEV] $StoryId"

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "Worker: DEV-STORY" "SYSTEM"
Write-PpLog "Story  : $StoryId" "SYSTEM"
Write-PpLog "Track  : $Track" "SYSTEM"
Write-PpLog ("=" * 70) "SYSTEM"

$taskFile = "$IpcDir\task-$Phase.json"
if (-not (Test-Path $taskFile)) {
    Write-PpLog "Task file missing: $taskFile" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "task file not found"
    exit 1
}
$task = Read-JsonRetry -Path $taskFile

$modelInfo = Read-PhaseModel -PhaseName $Phase -Complexity $Complexity
$model     = $modelInfo.model_id -replace '\[1m\]$', ''
$effort    = $modelInfo.effort
Write-PpLog "Model  : $model | effort=$effort" "INFO"

$story = Get-StoryFromDb -StoryId $StoryId
if (-not $story) {
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "story not in DB"
    exit 1
}

# Verify create-story phase completed (status=ready-for-dev OR in-progress OR review)
if ($story.status -in @('backlog','creating')) {
    Write-PpLog "Story status='$($story.status)' -- create-story phase not complete" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "create-story prerequisite not met (status=$($story.status))"
    exit 1
}

$sysPrompt = Build-StoryPromptContext -Story $story -Phase $Phase -Track $Track -IpcDir $IpcDir
$sysPromptFile = Join-Path $IpcDir "system-$Phase.txt"
[System.IO.File]::WriteAllText($sysPromptFile, $sysPrompt, [System.Text.UTF8Encoding]::new($false))

$userTask = @"
Run /bmad:bmm:workflows:dev-story $StoryId now. Implement per AC + Tasks. Run dotnet test / vitest until all pass.

After dev-story workflow completes, MANDATORY FINAL STEP:
  /tasks-backfill-verify $StoryId

This skill verifies each task against actual code (file:line evidence) and writes ✅/⬜ markers + file_list + test_count back to DB. NO BLIND BACKFILL.

Then update DB status to 'review' via upsert-story.js. Do NOT ask user any questions (YOLO mode). Follow ACK handshake protocol.
"@

$Timestamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$stderrFile = Join-Path $LogDir "claude-$StoryId-$Phase-err-$Timestamp.log"

$env:PHYCOOL_ORCHESTRATOR_MODE = '1'
$env:PIPELINE_STORY_ID         = $StoryId
$env:PIPELINE_PHASE            = $Phase
$env:PIPELINE_IPC_DIR          = $IpcDir
$env:PIPELINE_TASK_TRACK       = $Track
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'
# Phase 9 spike (2026-05-04): CLAUDE_CODE_EFFORT_LEVEL 官方 docs 未 documented + GitHub Issue #50099 v2.1.113 部分版本被 ignore.
# 機會性嘗試 + system prompt directive 雙保險.
$env:CLAUDE_CODE_EFFORT_LEVEL  = $effort

# Inject effort directive into user task (system prompt directive 為唯一 reliable 機制, 對齊 BR-MR-03)
if ($effort -eq 'max') {
    $userTask = $userTask + "`n`n本任務必用最大思考深度 ultrathink"
}

Set-Location $ProjectRoot
Write-PpLog "Launching Claude (interactive mode, $model)..." "STEP"

try {
    # T3.1 v5.0.0: --dangerously-skip-permissions (YOLO mode) + --chrome (Chrome MCP integration)
    & claude --dangerously-skip-permissions --chrome --model $model --append-system-prompt-file $sysPromptFile $userTask 2>> $stderrFile
    $claudeExit = $LASTEXITCODE
    Write-PpLog "Claude exited with code: $claudeExit" "INFO"
} catch {
    Write-PpLog "Claude launch error: $_" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "claude launch error: $_"
    Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'failed' -ProcessId $PID -IpcDir $IpcDir
    exit 1
}

$statusFile = "$IpcDir\status-$Phase.json"
if (-not (Test-Path $statusFile)) {
    Write-PpLog "Stop hook did NOT write status -- synthesizing from DB" "WARN"
    $dbStatus = Get-StoryStatus -StoryId $StoryId
    $synthStatus = if ($dbStatus -eq 'review') { 'completed' } else { 'partial' }
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status $synthStatus -Evidence @{
        db_status = $dbStatus
        synthesized_by = 'worker-dev.ps1 fallback'
        claude_exit = $claudeExit
    }
}

$hsCfg = Get-HandshakeConfig
$ackTimeout = if ($hsCfg.ack_wait_sec) { [int]$hsCfg.ack_wait_sec } else { 60 }
Write-PpLog "Waiting orchestrator ACK (timeout ${ackTimeout}s)..." "INFO"
$ack = Wait-AckFile -IpcDir $IpcDir -Phase $Phase -TimeoutSec $ackTimeout

if (-not $ack) { Write-PpLog "ACK timeout -- assuming success (fallback)" "WARN" }
elseif ($ack.ok) { Write-PpLog "ACK received: $($ack.message)" "SUCCESS" }
else { Write-PpLog "ACK rejected: $($ack.message)" "ERROR" }

$countdown = if ($hsCfg.countdown_sec) { [int]$hsCfg.countdown_sec } else { 5 }
Start-Countdown -Seconds $countdown -Label "Window closing in"
# v5.0.0 (T1.3 + T4.7): write window_title + files_modified to tracker
$filesChanged = @()
try {
    Push-Location $ProjectRoot
    $diff = & git diff --name-only HEAD 2>$null
    if ($diff) { $filesChanged = @($diff | Where-Object { $_.Trim() }) }
    Pop-Location
} catch { try { Pop-Location } catch {} }
$winTitle = "[$($Phase.ToUpper())] $StoryId"
Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'closed' -ProcessId $PID -IpcDir $IpcDir `
    -WindowTitle $winTitle -FilesModified $filesChanged
Write-PpLog "[$Phase] Worker exit" "SUCCESS"
exit 0
