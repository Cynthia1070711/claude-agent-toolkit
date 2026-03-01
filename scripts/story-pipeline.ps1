# ============================================================================
# Story Pipeline — Single Story Full Lifecycle
# ============================================================================
# 單一 Story 完整生命週期：create-story → dev-story → code-review
# 每個階段開新 Claude 會話，完成後自動關閉，最後產出報告。
#
# Usage:
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7"                          # 每階段開新視窗（預設）
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7" -NewWindow $false        # 同一視窗背景執行
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7" -DryRun
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7" -SkipCreate              # 已有 Story，跳過 create
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7" -SkipDev                 # 已開發完，只跑 review
#   .\scripts\story-pipeline.ps1 -StoryId "qgr-e7" -TimeoutMin 60
# ============================================================================

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, HelpMessage = "Story ID, e.g. qgr-e7, qgr-ba-5")]
    [string]$StoryId,

    [Parameter(HelpMessage = "Dry-run mode — only show what would execute")]
    [switch]$DryRun,

    [Parameter(HelpMessage = "Skip create-story phase")]
    [switch]$SkipCreate,

    [Parameter(HelpMessage = "Skip dev-story phase")]
    [switch]$SkipDev,

    [Parameter(HelpMessage = "Skip code-review phase")]
    [switch]$SkipReview,

    [Parameter(HelpMessage = "Timeout per phase in minutes (default: 45)")]
    [int]$TimeoutMin = 45,

    [Parameter(HelpMessage = "Max code-review retry attempts")]
    [int]$MaxReviewRetries = 2,

    [Parameter(HelpMessage = "Run each phase in a NEW PowerShell window (default: true)")]
    [bool]$NewWindow = $true,

    [Parameter(HelpMessage = "Seconds to wait between phases (rate-limit protection, default: 12)")]
    [int]$PhaseIntervalSec = 12
)

# ============================================================================
# Setup
# ============================================================================
$ErrorActionPreference = "Stop"

if ($PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
} else {
    $ProjectRoot = (Get-Location).Path
}

# Validate project root
$sprintStatusPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"
if (-not (Test-Path $sprintStatusPath)) {
    Write-Host "ERROR: sprint-status.yaml not found. Are you in the project root?" -ForegroundColor Red
    exit 1
}

# Derive Epic ID from Story ID (e.g. "qgr-e7" → "qgr")
$EpicId = ($StoryId -split "-")[0]

$LogDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LogFile = Join-Path $LogDir "story-pipeline-$StoryId-$Timestamp.log"
$StartTime = Get-Date
$TimeoutSec = $TimeoutMin * 60

# Phase results tracker
$PhaseResults = @()

# ============================================================================
# Helpers
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        "PHASE" { "Cyan" }
        default { "White" }
    }
    Write-Host $line -ForegroundColor $color
    $line | Out-File -Append -FilePath $LogFile -Encoding UTF8
}

function Get-StoryStatus {
    if (-not (Test-Path $sprintStatusPath)) { return "unknown" }
    $lines = Get-Content $sprintStatusPath -Encoding UTF8
    foreach ($l in $lines) {
        $trimmed = $l.Trim()
        # Support both full ID (qgr-e7-color-picker-recent-colors) and short ID (qgr-e7)
        # Suffix must start with hyphen+letter to avoid qgr-ba-1 matching qgr-ba-10
        if ($trimmed -match "^${StoryId}(-[a-z][\w-]*)?\s*:\s+([\w-]+)") {
            return $Matches[2]
        }
    }
    return "not-found"
}

function Invoke-Phase {
    param(
        [string]$PhaseName,
        [string]$Model,
        [string]$Prompt
    )

    $phaseStart = Get-Date
    Write-Log ("=" * 60) "PHASE"
    Write-Log "PHASE: $PhaseName | Model: $Model | Story: $StoryId" "PHASE"
    Write-Log ("=" * 60) "PHASE"

    $statusBefore = Get-StoryStatus
    Write-Log "Status before: $statusBefore"

    if ($DryRun) {
        Write-Log "[DRY-RUN] Would execute: claude -p `"$($Prompt.Substring(0, [Math]::Min(80, $Prompt.Length)))...`" --model $Model" "WARN"
        Start-Sleep -Seconds 1
        return @{
            Phase      = $PhaseName
            Model      = $Model
            Success    = $true
            ExitCode   = 0
            Duration   = "0s"
            StatusFrom = $statusBefore
            StatusTo   = $statusBefore
            Note       = "DRY-RUN"
        }
    }

    # Validate claude CLI exists
    try { $null = Get-Command claude -ErrorAction Stop }
    catch {
        Write-Log "ERROR: 'claude' CLI not found in PATH" "ERROR"
        return @{ Phase = $PhaseName; Success = $false; ExitCode = -1; Note = "CLI_NOT_FOUND" }
    }

    # Execute
    $stdoutFile = Join-Path $LogDir "claude-$StoryId-$PhaseName-$Timestamp.log"
    $stderrFile = Join-Path $LogDir "claude-$StoryId-$PhaseName-err-$Timestamp.log"

    $windowMode = if ($NewWindow) { "NEW WINDOW" } else { "BACKGROUND" }
    Write-Log "Launching Claude ($Model) [$windowMode]... timeout: ${TimeoutMin}min"
    Write-Log "Log: $stdoutFile"

    # --append-system-prompt 強制 BMAD workflow 完整執行
    $enforcePrompt = @"
MANDATORY: Execute ALL workflow steps in EXACT order. Do NOT skip any step.
Step 9 metadata sync MUST update BOTH:
  1. Story file "## Story 資訊" table Status field
  2. sprint-status.yaml development_status entry
Also update: tracking file, H1 emoji.
Skipping ANY metadata step is a CRITICAL violation.
"@
    # 轉為單行避免 PowerShell 命令列跳脫問題
    $enforcePromptOneLine = ($enforcePrompt -replace "`r`n", " " -replace "`n", " " -replace '"', '\"')

    try {
        if ($NewWindow) {
            # ── 開新 PowerShell 視窗執行 ──
            # 寫暫存 .ps1 腳本再執行，避免 -Command 命令列長度/跳脫問題
            # Start-Transcript 錄製輸出，claude 直接寫主控台（保持 TTY 串流）
            $tempScript = Join-Path $LogDir "claude-$StoryId-$PhaseName-$Timestamp.ps1"
            $scriptContent = @"
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
`$Host.UI.RawUI.WindowTitle = 'Claude [$PhaseName] $StoryId'
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '  [$PhaseName] $StoryId — Model: $Model' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$ProjectRoot'
Start-Transcript -Path '$stdoutFile' -Force | Out-Null
`$promptText = @'
$Prompt
'@
`$enforcePrompt = @'
$enforcePrompt
'@
try {
    claude -p `$promptText --model $Model --append-system-prompt `$enforcePrompt --dangerously-skip-permissions
} finally {
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
`$code = `$LASTEXITCODE
Write-Host ''
if (`$code -eq 0) { Write-Host '  DONE (exit: 0)' -ForegroundColor Green }
else { Write-Host "  FAILED (exit: `$code)" -ForegroundColor Red }
Write-Host ''
Write-Host 'Window closing in 5 seconds...' -ForegroundColor DarkGray
Start-Sleep -Seconds 5
exit `$code
"@
            $scriptContent | Out-File -FilePath $tempScript -Encoding UTF8
            Write-Log "Temp script: $tempScript"

            $proc = Start-Process -FilePath "powershell" `
                -ArgumentList @("-ExecutionPolicy", "Bypass", "-File", $tempScript) `
                -PassThru

            $completed = $proc.WaitForExit($TimeoutSec * 1000)
        }
        else {
            # ── 背景模式（同一視窗，用 temp script 避免命令列解析問題） ──
            $tempScript = Join-Path $LogDir "claude-$StoryId-$PhaseName-bg-$Timestamp.ps1"
            $scriptContent = @"
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
Set-Location '$ProjectRoot'
Start-Transcript -Path '$stdoutFile' -Force | Out-Null
`$promptText = @'
$Prompt
'@
`$enforcePrompt = @'
$enforcePrompt
'@
try {
    claude -p `$promptText --model $Model --append-system-prompt `$enforcePrompt --dangerously-skip-permissions
} finally {
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
exit `$LASTEXITCODE
"@
            $scriptContent | Out-File -FilePath $tempScript -Encoding UTF8
            Write-Log "Temp script: $tempScript"

            $proc = Start-Process -FilePath "powershell" `
                -ArgumentList @("-ExecutionPolicy", "Bypass", "-File", $tempScript) `
                -NoNewWindow -PassThru

            $completed = $proc.WaitForExit($TimeoutSec * 1000)
        }

        if (-not $completed) {
            Write-Log "TIMEOUT after ${TimeoutMin}min! Killing process..." "ERROR"
            $proc.Kill()
            $phaseDuration = (Get-Date) - $phaseStart
            return @{
                Phase      = $PhaseName
                Model      = $Model
                Success    = $false
                ExitCode   = -1
                Duration   = "{0:mm\:ss}" -f $phaseDuration
                StatusFrom = $statusBefore
                StatusTo   = Get-StoryStatus
                Note       = "TIMEOUT"
            }
        }

        # Flush exit code (PowerShell Start-Process bug: ExitCode can be null or wrong)
        $proc.WaitForExit()
        $exitCode = $proc.ExitCode
        $phaseDuration = (Get-Date) - $phaseStart
        $statusAfter = Get-StoryStatus

        # Fallback: exit code unreliable in Start-Process wrapper — use status change as truth
        if ($exitCode -ne 0) {
            if ($statusAfter -ne $statusBefore) {
                Write-Log "Exit code ($exitCode) non-zero but status changed ($statusBefore -> $statusAfter), treating as SUCCESS" "WARN"
                $exitCode = 0
            } elseif ($null -eq $exitCode) {
                Write-Log "Exit code null and status unchanged, treating as FAILURE" "ERROR"
                $exitCode = -1
            }
        }

        if ($exitCode -eq 0) {
            Write-Log "Phase completed successfully (exit: 0)" "OK"
        } else {
            Write-Log "Phase FAILED (exit: $exitCode)" "ERROR"
        }

        Write-Log "Status after: $statusAfter | Duration: $("{0:mm\:ss}" -f $phaseDuration)"

        # Phase Gate: 偵測 Token 耗盡
        $tokenSafe = Test-PhaseGate -PhaseLogFile $stdoutFile

        return @{
            Phase      = $PhaseName
            Model      = $Model
            Success    = ($exitCode -eq 0)
            ExitCode   = $exitCode
            Duration   = "{0:mm\:ss}" -f $phaseDuration
            StatusFrom = $statusBefore
            StatusTo   = $statusAfter
            Note       = if ($exitCode -eq 0) { "OK" } else { "FAILED" }
            LogFile    = $stdoutFile
            TokenSafe  = $tokenSafe
        }
    }
    catch {
        Write-Log "Exception: $_" "ERROR"
        return @{
            Phase      = $PhaseName
            Model      = $Model
            Success    = $false
            ExitCode   = -999
            Duration   = "0s"
            StatusFrom = $statusBefore
            StatusTo   = Get-StoryStatus
            Note       = $_.ToString()
            LogFile    = $stdoutFile
            TokenSafe  = $true
        }
    }
}

# ============================================================================
# Prompt Builders
# ============================================================================

function Test-PhaseGate {
    <#
    .SYNOPSIS
    Phase Gate — 掃描 Phase log 偵測 Token 耗盡模式。
    回傳 $true 表示安全可繼續，$false 表示應中止。
    #>
    param([string]$PhaseLogFile)

    if (-not $PhaseLogFile -or -not (Test-Path $PhaseLogFile)) { return $true }

    $content = Get-Content $PhaseLogFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content) { return $true }

    $tokenExhaustedPatterns = @(
        "You've hit your limit",
        "rate_limit_error",
        "token limit exceeded",
        "quota exceeded",
        "ResourceExhausted",
        "overloaded_error"
    )

    foreach ($pattern in $tokenExhaustedPatterns) {
        if ($content -match [regex]::Escape($pattern)) {
            Write-Log "TOKEN EXHAUSTED detected in log: '$pattern'" "ERROR"
            return $false
        }
    }
    return $true
}

function Build-CreatePrompt {
    return "/bmad:bmm:workflows:create-story $StoryId"
}

function Build-DevPrompt {
    return "/bmad:bmm:workflows:dev-story $StoryId"
}

function Build-ReviewPrompt {
    return "/bmad:bmm:workflows:code-review $StoryId"
}

# ============================================================================
# Main Pipeline
# ============================================================================
$pipelineAborted = $false

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Story Pipeline: $StoryId" -ForegroundColor Cyan
$modeLabel = if ($DryRun) { "DRY-RUN" } else { "LIVE" }
Write-Host "  Mode: $modeLabel | Timeout: ${TimeoutMin}min/phase" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Log "Pipeline started for $StoryId"
$initialStatus = Get-StoryStatus
Write-Log "Initial status: $initialStatus"

# ── Phase 1: create-story (Opus) ──
if (-not $SkipCreate) {
    if ($initialStatus -eq "backlog" -or $initialStatus -eq "not-found") {
        $result = Invoke-Phase -PhaseName "create-story" -Model "opus" -Prompt (Build-CreatePrompt)
        $PhaseResults += $result

        if (-not $result.Success) {
            Write-Log "create-story FAILED. Pipeline aborted." "ERROR"
            $pipelineAborted = $true
        }

        # Phase Gate: 偵測 Token 耗盡
        if (-not $result.TokenSafe) {
            Write-Log "Phase Gate BLOCKED: Token exhausted after create-story. Aborting pipeline." "ERROR"
            $pipelineAborted = $true
        }

        # Rate-limit protection interval
        Write-Log "Waiting ${PhaseIntervalSec}s before next phase (rate-limit protection)..."
        Start-Sleep -Seconds $PhaseIntervalSec
    } else {
        Write-Log "Skipping create-story: status is '$initialStatus' (not backlog)" "WARN"
        $PhaseResults += @{ Phase = "create-story"; Success = $true; Note = "SKIPPED (status=$initialStatus)" }
    }
} else {
    Write-Log "Skipping create-story: -SkipCreate flag" "WARN"
    $PhaseResults += @{ Phase = "create-story"; Success = $true; Note = "SKIPPED (flag)" }
}

# ── Phase 2: dev-story (Sonnet) ──
if ($pipelineAborted) {
    Write-Log "Skipping dev-story: pipeline aborted" "WARN"
    $PhaseResults += @{ Phase = "dev-story"; Success = $false; Note = "SKIPPED (aborted)" }
} elseif (-not $SkipDev) {
    $currentStatus = Get-StoryStatus
    if ($currentStatus -eq "ready-for-dev" -or $currentStatus -eq "in-progress") {
        $result = Invoke-Phase -PhaseName "dev-story" -Model "sonnet" -Prompt (Build-DevPrompt)
        $PhaseResults += $result

        if (-not $result.Success) {
            Write-Log "dev-story FAILED. Pipeline aborted." "ERROR"
            $pipelineAborted = $true
        }

        # Phase Gate: 偵測 Token 耗盡
        if (-not $result.TokenSafe) {
            Write-Log "Phase Gate BLOCKED: Token exhausted after dev-story. Aborting pipeline." "ERROR"
            $pipelineAborted = $true
        }

        # Rate-limit protection interval
        Write-Log "Waiting ${PhaseIntervalSec}s before next phase (rate-limit protection)..."
        Start-Sleep -Seconds $PhaseIntervalSec
    } else {
        Write-Log "Skipping dev-story: status is '$currentStatus' (expected ready-for-dev)" "WARN"
        $PhaseResults += @{ Phase = "dev-story"; Success = $true; Note = "SKIPPED (status=$currentStatus)" }
    }
} else {
    Write-Log "Skipping dev-story: -SkipDev flag" "WARN"
    $PhaseResults += @{ Phase = "dev-story"; Success = $true; Note = "SKIPPED (flag)" }
}

# ── Phase 3: code-review (Opus) ──
if ($pipelineAborted) {
    Write-Log "Skipping code-review: pipeline aborted" "WARN"
    $PhaseResults += @{ Phase = "code-review"; Success = $false; Note = "SKIPPED (aborted)" }
} elseif (-not $SkipReview) {
    $reviewAttempt = 0
    $reviewPassed = $false

    while ($reviewAttempt -lt $MaxReviewRetries -and -not $reviewPassed) {
        $reviewAttempt++
        $currentStatus = Get-StoryStatus

        if ($currentStatus -ne "review") {
            if ($reviewAttempt -eq 1) {
                Write-Log "Skipping code-review: status is '$currentStatus' (expected review)" "WARN"
                $PhaseResults += @{ Phase = "code-review"; Success = $true; Note = "SKIPPED (status=$currentStatus)" }
            }
            break
        }

        Write-Log "Code review attempt $reviewAttempt / $MaxReviewRetries" "PHASE"
        $result = Invoke-Phase -PhaseName "code-review-R$reviewAttempt" -Model "opus" -Prompt (Build-ReviewPrompt)
        $PhaseResults += $result

        if (-not $result.Success) {
            Write-Log "code-review FAILED (exit code error)." "ERROR"
            break
        }

        # Check if review passed (status changed to 'done')
        $afterStatus = Get-StoryStatus
        if ($afterStatus -eq "done") {
            $reviewPassed = $true
            Write-Log "Code review PASSED! Story is done." "OK"
        } elseif ($afterStatus -eq "ready-for-dev") {
            Write-Log "Code review REJECTED. Story sent back to dev." "WARN"
            # Re-run dev + review if retries remain
            if ($reviewAttempt -lt $MaxReviewRetries) {
                Write-Log "Re-running dev-story before next review..." "PHASE"
                $devResult = Invoke-Phase -PhaseName "dev-story-fix-R$reviewAttempt" -Model "sonnet" -Prompt (Build-DevPrompt)
                $PhaseResults += $devResult
                if (-not $devResult.Success) {
                    Write-Log "dev-story fix FAILED. Pipeline aborted." "ERROR"
                    break
                }
                Write-Log "Waiting ${PhaseIntervalSec}s before next phase (rate-limit protection)..."
                Start-Sleep -Seconds $PhaseIntervalSec
            }
        } else {
            Write-Log "Unexpected status after review: $afterStatus" "WARN"
            break
        }
    }

    if (-not $reviewPassed -and $reviewAttempt -ge $MaxReviewRetries) {
        Write-Log "Code review exhausted $MaxReviewRetries retries." "ERROR"
    }
} else {
    Write-Log "Skipping code-review: -SkipReview flag" "WARN"
    $PhaseResults += @{ Phase = "code-review"; Success = $true; Note = "SKIPPED (flag)" }
}

# ============================================================================
# Report
# ============================================================================
# Report
$totalDuration = (Get-Date) - $StartTime
$totalSec = [int]$totalDuration.TotalSeconds
$h = [math]::Floor($totalSec / 3600)
$m = [math]::Floor(($totalSec % 3600) / 60)
$s = $totalSec % 60
$durStr = "${h}h ${m}m ${s}s"
$finalStatus = Get-StoryStatus

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PIPELINE REPORT: $StoryId" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total Duration : $durStr" -ForegroundColor White
Write-Host "  Initial Status : $initialStatus" -ForegroundColor DarkGray
Write-Host "  Final Status   : $finalStatus" -ForegroundColor $(if ($finalStatus -eq "done") { "Green" } else { "Yellow" })
Write-Host ""
Write-Host "  Phase Results:" -ForegroundColor White

foreach ($pr in $PhaseResults) {
    $icon = if ($pr.Note -match "^(OK|SKIPPED|DRY)") { "[OK]" } else { "[!!]" }
    $c = if ($pr.Note -match "^(OK|SKIPPED|DRY)") { "Green" } else { "Red" }
    $dur = if ($pr.Duration) { $pr.Duration } else { "-" }
    $model = if ($pr.Model) { $pr.Model } else { "-" }
    Write-Host "    $icon $($pr.Phase) | Model: $model | $dur | $($pr.Note)" -ForegroundColor $c
}

Write-Host ""
Write-Host "  Log: $LogFile" -ForegroundColor DarkGray
Write-Host ""

# Final verdict
if ($finalStatus -eq "done") {
    Write-Host "  RESULT: Story $StoryId completed successfully!" -ForegroundColor Green

    # Windows notification
    try {
        if (Get-Module -ListAvailable -Name BurntToast -ErrorAction SilentlyContinue) {
            Import-Module BurntToast
            New-BurntToastNotification -Text "Story Pipeline Complete", "$StoryId -> done ($durStr)"
        }
    } catch { }
} else {
    Write-Host "  RESULT: Pipeline ended with status '$finalStatus'" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

# Write summary to log
Write-Log "Pipeline finished. Final status: $finalStatus. Duration: $durStr"
