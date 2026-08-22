<#
.SYNOPSIS
    Pipeline E2E Task Launcher v1.0 - Interactive Claude Code for E2E testing with MCP.

.DESCRIPTION
    Launches Claude Code in FULL interactive mode (not -p) so MCP servers
    (e.g., Chrome DevTools) are loaded. For E2E testing tasks.
    Window stays open for user interaction.

.PARAMETER Launch
    Launch a single E2E task window.

.PARAMETER StoryId
    Story identifier (e.g., "S3-04").

.PARAMETER Command
    Pipeline stage command (e.g., "/e2e-test").

.PARAMETER StoryPath
    Relative path to the Story file.

.PARAMETER PipelineId
    Pipeline run identifier. Auto-generated if omitted.

.PARAMETER PlanName
    Display name for the pipeline plan.

.PARAMETER BatchId
    Batch number for display purposes.

.PARAMETER Prompt
    Full prompt text to pass as initial message to claude.

.PARAMETER Status
    Show tracking status.

.NOTES
    Version: 1.0.0
    Date: 2026-03-16
#>

param(
    [switch]$Launch,
    [string]$StoryId,
    [string]$Command,
    [string]$StoryPath,
    [string]$PipelineId,
    [string]$PlanName = "",
    [int]$BatchId = 1,
    [string]$Prompt,
    [int]$ChainDepth = 0,
    [int]$MaxChain = 4,
    [switch]$Status
)

$ErrorActionPreference = "Stop"

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Get-Item "$PSScriptRoot\..\..\..\..\").FullName
$TrackingDir = Join-Path $ProjectRoot "docs\pipeline-tracking"

function Get-Timestamp { return (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }

function Write-Utf8([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Read-Utf8([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Invoke-TaskLaunch {
    if (-not $Prompt) {
        $Prompt = @"
Read the Story file at: $StoryPath

Your task is E2E testing ($Command).

1. Read the Story's BR, AC, and test plan
2. Use Chrome DevTools MCP to perform E2E testing
3. Navigate to the target pages, take screenshots, verify UI behavior
4. After testing, EDIT the Story file ($StoryPath) to:
   a) Update SOP tracking table with your agent name + current system time
   b) Check completed items in the implementation task checklist
   c) Add a new entry in the change history section
   d) Update the status field based on test results

IMPORTANT: You MUST use the Edit tool to modify the Story file before finishing.
"@
    }

    # Write prompt file
    $promptFile = Join-Path $TrackingDir "prompt-$StoryId.txt"
    Write-Utf8 $promptFile $Prompt

    # Initialize or update tracking JSON
    $trackingPath = Join-Path $TrackingDir "$PipelineId.json"
    if (Test-Path $trackingPath) {
        $tracking = Read-Utf8 $trackingPath | ConvertFrom-Json
    } else {
        $tracking = @{
            pipeline_id = $PipelineId
            plan_name   = $PlanName
            start_time  = Get-Timestamp
            status      = "running"
            tasks       = @()
        } | ConvertTo-Json -Depth 5 | ConvertFrom-Json
    }

    $taskEntry = @{
        story_id    = $StoryId
        command     = $Command
        story_path  = $StoryPath
        batch_id    = $BatchId
        mode        = "interactive-e2e"
        window_opened = Get-Timestamp
        window_closed = $null
        result      = "running"
        output_file = ""
    }
    $tasks = @($tracking.tasks)
    $tasks += $taskEntry
    $tracking.tasks = $tasks
    # Reset pipeline status to running when new tasks are added
    $tracking.status = "running"
    Write-Utf8 $trackingPath ($tracking | ConvertTo-Json -Depth 5)

    # ── Signal file path — defined before here-string so it expands correctly ──
    $tsShort = Get-Date -Format "yyyyMMddHHmmss"
    $signalFile = Join-Path $TrackingDir "signal-e2e-$tsShort.done"
    $TimeoutSec = 1800  # 30 minutes max for E2E session

    # Generate interactive task runner script
    $batchId_val = $BatchId
    $runScript = @"
`$env:PIPELINE_SIGNAL_FILE = '$signalFile'
`$env:PIPELINE_STORY_ID = 'e2e-autorun'
`$env:PIPELINE_PHASE = 'e2e'
`$Host.UI.RawUI.WindowTitle = 'Claude-$StoryId [$Command] (E2E)'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

`$trackingDir = `$PSScriptRoot
`$projectRoot = (Get-Item `$trackingDir).Parent.Parent.FullName
Set-Location `$projectRoot

# Read plan name from tracking JSON at runtime
`$planName = ''
`$trackingFile = Join-Path `$trackingDir '$PipelineId.json'
try {
    `$tData = [System.IO.File]::ReadAllText(`$trackingFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    `$planName = `$tData.plan_name
} catch {}

# Header
Write-Host ('=' * 60) -ForegroundColor Green
Write-Host '  Pipeline E2E Task Runner v1.0.0' -ForegroundColor Green
Write-Host "  Pipeline ID: $PipelineId" -ForegroundColor Green
Write-Host "  Plan: `$planName" -ForegroundColor Green
Write-Host '  Batch: $batchId_val | Task: $StoryId [$Command] (E2E Interactive)' -ForegroundColor Green
Write-Host '  Story: $StoryPath' -ForegroundColor Green
Write-Host '  Mode: Full interactive (MCP enabled)' -ForegroundColor Green
Write-Host ('=' * 60) -ForegroundColor Green
Write-Host ''

# Launch claude in FULL interactive mode with initial prompt
`$promptFile = Join-Path `$trackingDir 'prompt-$StoryId.txt'
`$promptContent = [System.IO.File]::ReadAllText(`$promptFile, [System.Text.Encoding]::UTF8)

claude --dangerously-skip-permissions `$promptContent

# After claude exits, update tracking
try {
    `$t = [System.IO.File]::ReadAllText(`$trackingFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach (`$task in `$t.tasks) {
        if (`$task.story_id -eq '$StoryId' -and `$task.result -eq 'running') {
            `$task.window_closed = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            `$task.result = 'completed'
        }
    }
    `$allDone = (`$t.tasks | Where-Object { `$_.result -ne 'completed' }).Count -eq 0
    if (`$allDone) { `$t.status = 'completed' }
    [System.IO.File]::WriteAllText(`$trackingFile, (`$t | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new(`$false))
    Write-Host '' -ForegroundColor Green
    Write-Host '[TRACKING] $StoryId -> completed' -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to update tracking: `$_" -ForegroundColor Red
}

# ── Fallback: ensure Story status is updated ──
`$storyFullPath = Join-Path `$projectRoot '$StoryPath'
try {
    `$storyLines = [System.IO.File]::ReadAllLines(`$storyFullPath, [System.Text.Encoding]::UTF8)
    `$colonPos = `$storyLines[4].IndexOf(':')
    if (`$colonPos -ge 0) {
        `$oldStatus = `$storyLines[4].Substring(`$colonPos + 1).Trim()
        `$prefix = `$storyLines[4].Substring(0, `$colonPos + 1)
        if (`$oldStatus -notmatch '^Review|^Done') {
            `$storyLines[4] = "`$prefix Review"
            [System.IO.File]::WriteAllLines(`$storyFullPath, `$storyLines, [System.Text.UTF8Encoding]::new(`$false))
            Write-Host "[FALLBACK] $StoryId status: `$oldStatus -> Review" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[FALLBACK] Failed to update Story status: `$_" -ForegroundColor Red
}

# ── Auto-chain: after E2E, launch autorun /dev if Story not Done ──
`$chainDepth = $ChainDepth
`$maxChain = $MaxChain
if (`$chainDepth -lt `$maxChain) {
    `$currentStatus = 'Unknown'
    try {
        `$storyLines = [System.IO.File]::ReadAllLines((Join-Path `$projectRoot '$StoryPath'), [System.Text.Encoding]::UTF8)
        `$colonPos = `$storyLines[4].IndexOf(':')
        if (`$colonPos -ge 0) { `$currentStatus = `$storyLines[4].Substring(`$colonPos + 1).Trim() }
    } catch {
        Write-Host "[AUTO-CHAIN] Failed to read Story status: `$_" -ForegroundColor Red
    }

    if (`$currentStatus -match '^Done') {
        Write-Host "[AUTO-CHAIN] $StoryId status=Done. Complete." -ForegroundColor Green
    } elseif (`$currentStatus -notmatch '^Done') {
        Write-Host ''
        Write-Host "[AUTO-CHAIN] $StoryId status: `$currentStatus -> next: /dev via autorun (depth `$(`$chainDepth+1)/`$maxChain)" -ForegroundColor Cyan
        Start-Sleep -Seconds 3
        `$ps = Join-Path `$projectRoot '.claude\skills\autorun\scripts\pipeline.ps1'
        & powershell -ExecutionPolicy Bypass -File `$ps -Launch -StoryId '$StoryId' -Command '/dev' -StoryPath '$StoryPath' -PipelineId '$PipelineId' -BatchId $BatchId -ChainDepth (`$chainDepth + 1) -MaxChain `$maxChain
    }
} elseif (`$chainDepth -ge `$maxChain) {
    Write-Host "[AUTO-CHAIN] Max depth ($MaxChain) reached for $StoryId. Manual intervention needed." -ForegroundColor Yellow
}

# ── Signal completion to parent watchdog ──
if (`$env:PIPELINE_SIGNAL_FILE -and `$env:PIPELINE_SIGNAL_FILE -ne '') {
    try {
        [System.IO.File]::WriteAllText(`$env:PIPELINE_SIGNAL_FILE, 'done', [System.Text.UTF8Encoding]::new(`$false))
        Write-Host "[SIGNAL] Completion signal written -> `$env:PIPELINE_SIGNAL_FILE" -ForegroundColor DarkGray
    } catch {
        Write-Host "[SIGNAL] Failed to write signal file: `$_" -ForegroundColor Red
    }
}

Write-Host ''
Write-Host 'Window will close in 5 seconds...' -ForegroundColor DarkGray
Start-Sleep -Seconds 5
exit
"@
    $runFile = Join-Path $TrackingDir "run-$StoryId.ps1"
    Write-Utf8 $runFile $runScript

    # Launch in interactive mode (no -NoExit needed, claude itself is interactive)
    $proc = Start-Process "powershell" -ArgumentList "-ExecutionPolicy Bypass -File `"$runFile`"" -WindowStyle Normal -PassThru

    Write-Host "[E2E-TASK] $StoryId [$Command] -> window opened (interactive mode, PID=$($proc.Id))" -ForegroundColor Green

    # ── pipeline-active.json tracker ──
    $activeTrackerPath = Join-Path $TrackingDir "pipeline-active.json"
    $activeEntry = @{
        pipeline_id  = $PipelineId
        story_id     = $StoryId
        command      = $Command
        pid          = $proc.Id
        signal_file  = $signalFile
        started_at   = Get-Timestamp
        status       = "running"
    }
    Write-Utf8 $activeTrackerPath ($activeEntry | ConvertTo-Json -Depth 3)

    # ── Watchdog: poll signal file or process exit ──
    $watchdogStart = Get-Date
    $completed = $false
    while (-not $completed) {
        if (Test-Path $signalFile) { $completed = $true; break }
        if ($proc.HasExited) { $completed = $true; break }
        $elapsed = ((Get-Date) - $watchdogStart).TotalSeconds
        if ($elapsed -ge $TimeoutSec) { break }
        Start-Sleep -Seconds 10
    }

    if (-not $completed -and -not $proc.HasExited) {
        Write-Host "[E2E-WATCHDOG] TIMEOUT ($TimeoutSec s) — killing E2E window (PID=$($proc.Id))" -ForegroundColor Yellow
        try { & taskkill /T /F /PID $proc.Id 2>$null } catch { }
    }

    if (Test-Path $signalFile) { Remove-Item $signalFile -ErrorAction SilentlyContinue }

    # ── Update pipeline-active.json to closed ──
    try {
        $activeEntry.status = "closed"
        $activeEntry.closed_at = Get-Timestamp
        Write-Utf8 $activeTrackerPath ($activeEntry | ConvertTo-Json -Depth 3)
    } catch { }

    Write-Host "[E2E-TASK] $StoryId window closed." -ForegroundColor Green
}

# Reuse autorun's Show-Status
function Show-Status {
    $autorunScript = Join-Path $PSScriptRoot "..\..\autorun\scripts\pipeline.ps1"
    if (Test-Path $autorunScript) {
        & $autorunScript -Status
    } else {
        Write-Host "autorun skill not found. Use autorun -Status instead." -ForegroundColor Red
    }
}

# Main
if ($Status) {
    Show-Status
} elseif ($Launch) {
    if (-not $StoryId -or -not $Command -or -not $StoryPath) {
        Write-Host "ERROR: -Launch requires -StoryId, -Command, -StoryPath" -ForegroundColor Red
        exit 1
    }
    if (-not $PipelineId) { $PipelineId = Get-Date -Format "yyyyMMdd-HHmm" }
    Invoke-TaskLaunch
} else {
    Write-Host "Pipeline E2E Task Launcher v1.0.0"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host '  -Launch -StoryId "S3-04" -Command "/e2e-test" -StoryPath "path/to/story.md"'
    Write-Host '  -Status    Check latest pipeline progress'
}
