# ==============================================================================
# worker-create.ps1  v1.0.0
# party-to-pipeline v4.0.0 -- Create-Story Worker (sub-window)
#
# Launched by orchestrator.ps1 via Start-Process. NOT for manual use.
# Runs claude in FULL interactive mode (no -p, MCP/Skills/Hooks all loaded).
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
    [string]$Phase = 'create-story'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$LogDir      = Get-LogDir

$Host.UI.RawUI.WindowTitle = "[CREATE] $StoryId"

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "Worker: CREATE-STORY" "SYSTEM"
Write-PpLog "Story  : $StoryId" "SYSTEM"
Write-PpLog "Track  : $Track" "SYSTEM"
Write-PpLog ("=" * 70) "SYSTEM"

# ── Load task spec from IPC ───────────────────────────────────────────────────
$taskFile = "$IpcDir\task-$Phase.json"
if (-not (Test-Path $taskFile)) {
    Write-PpLog "Task file missing: $taskFile" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "task file not found"
    exit 1
}
$task = Read-JsonRetry -Path $taskFile

# ── Resolve phase model ───────────────────────────────────────────────────────
$modelInfo = Read-PhaseModel -PhaseName $Phase -Complexity $Complexity
$model     = $modelInfo.model_id -replace '\[1m\]$', ''   # strip [1m] suffix (BUG B fix carryover)
$effort    = $modelInfo.effort

Write-PpLog "Model  : $model | effort=$effort" "INFO"

# ── Load story from DB ────────────────────────────────────────────────────────
$story = Get-StoryFromDb -StoryId $StoryId
if (-not $story) {
    Write-PpLog "Story not found in DB: $StoryId" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "story not in DB"
    exit 1
}

# ── Build system prompt (Story context + protocol) ────────────────────────────
$sysPrompt = Build-StoryPromptContext -Story $story -Phase $Phase -Track $Track -IpcDir $IpcDir
$sysPromptFile = Join-Path $IpcDir "system-$Phase.txt"
[System.IO.File]::WriteAllText($sysPromptFile, $sysPrompt, [System.Text.UTF8Encoding]::new($false))

# ── Phase-specific short user task ───────────────────────────────────────────
$userTask = @"
STEP 0 (MANDATORY BEFORE WORKFLOW): Query DB first via MCP search_stories(story_id: '$StoryId', include_details: true) to check current enriched state. Also search_context for related decisions.

STEP 1: Run /bmad:bmm:workflows:create-story $StoryId -- let workflow analyze codebase, match skills, generate AC/Tasks. If existing .md found with done status, treat as DOWNGRADE RE-RUN per protocol.

STEP 2 (MANDATORY AFTER WORKFLOW): Sync ALL enriched fields to DB via:
node .context-db/scripts/upsert-story.js --inline '{"story_id":"$StoryId","status":"ready-for-dev","acceptance_criteria":"...","tasks":"...","dev_notes":"...","required_skills":"...","file_list":"...","implementation_approach":"...","testing_strategy":"..."}'

DB is the ONLY source of truth. Do NOT ask user any questions (YOLO mode). Follow ACK handshake protocol from protocol-template.md (in system prompt above).
"@

# ── Setup logs ────────────────────────────────────────────────────────────────
$Timestamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$stderrFile = Join-Path $LogDir "claude-$StoryId-$Phase-err-$Timestamp.log"

# ── Set pipeline env vars (Stop hook reads these) ─────────────────────────────
$env:PHYCOOL_ORCHESTRATOR_MODE = '1'
$env:PIPELINE_STORY_ID         = $StoryId
$env:PIPELINE_PHASE            = $Phase
$env:PIPELINE_IPC_DIR          = $IpcDir
$env:PIPELINE_TASK_TRACK       = $Track
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'
# Phase 9 spike (2026-05-04): CLAUDE_CODE_EFFORT_LEVEL 官方 docs 未 documented (code.claude.com/docs/en/settings)
# GitHub Issue #50099: v2.1.113 ENV 部分版本被 ignore. 機會性嘗試 + system prompt directive 雙保險.
$env:CLAUDE_CODE_EFFORT_LEVEL  = $effort

# Inject effort directive into user task (system prompt directive 為唯一 reliable 機制, 對齊 BR-MR-03)
if ($effort -eq 'max') {
    $userTask = $userTask + "`n`n本任務必用最大思考深度 ultrathink"
}

# ── Launch claude in interactive mode ─────────────────────────────────────────
Set-Location $ProjectRoot
Write-PpLog "Launching Claude (interactive mode, $model)..." "STEP"
Write-PpLog "Signal: stop-report.ps1 will write status-$Phase.json on turn end" "INFO"

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

# ── After claude exits: check if Stop hook wrote status ───────────────────────
$statusFile = "$IpcDir\status-$Phase.json"
if (-not (Test-Path $statusFile)) {
    Write-PpLog "Stop hook did NOT write status -- synthesizing from DB" "WARN"
    $dbStatus = Get-StoryStatus -StoryId $StoryId
    $synthStatus = if ($dbStatus -eq 'ready-for-dev') { 'completed' } else { 'partial' }
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status $synthStatus -Evidence @{
        db_status = $dbStatus
        synthesized_by = 'worker-create.ps1 fallback'
        claude_exit = $claudeExit
    }
}

# ── Wait for ACK from orchestrator ────────────────────────────────────────────
$hsCfg = Get-HandshakeConfig
$ackTimeout = if ($hsCfg.ack_wait_sec) { [int]$hsCfg.ack_wait_sec } else { 60 }

Write-PpLog "Waiting orchestrator ACK (timeout ${ackTimeout}s)..." "INFO"
$ack = Wait-AckFile -IpcDir $IpcDir -Phase $Phase -TimeoutSec $ackTimeout

if (-not $ack) {
    Write-PpLog "ACK timeout -- assuming success (fallback mode)" "WARN"
} elseif ($ack.ok) {
    Write-PpLog "ACK received: $($ack.message)" "SUCCESS"
} else {
    Write-PpLog "ACK rejected: $($ack.message)" "ERROR"
}

# ── Countdown + close ─────────────────────────────────────────────────────────
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
