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

# [tdb-4 CR F1] UTF-8 console init so Chinese JSON from node round-trips intact
# under zh-TW code pages (aligned with story-pipeline-interactive.ps1 / -memory.ps1).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if ($PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
} else {
    $ProjectRoot = (Get-Location).Path
}

# Validate project root
# [tdb-4] The sprint schedule yaml was frozen read-only on 2026-07-28 (tdb-2).
# Project root is now validated against the Context Memory DB instead.
$ContextDbPath = Join-Path $ProjectRoot ".context-db\phycool.db"
if (-not (Test-Path $ContextDbPath)) {
    Write-Host "ERROR: .context-db/phycool.db not found. Are you in the project root?" -ForegroundColor Red
    exit 1
}

# Derive Epic ID from Story ID (e.g. "qgr-e7" → "qgr")
$EpicId = ($StoryId -split "-")[0]

$TrackingActiveDir = Join-Path $ProjectRoot "docs\tracking\active"
$TrackingArchivedDir = Join-Path $ProjectRoot "docs\tracking\archived"

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

function Sync-TrackingFile {
    <#
    .SYNOPSIS
    保底同步 tracking file 的狀態 emoji，並在 done 時歸檔到 archived/。
    子視窗 code-review workflow 應已更新，這裡做二次保底。
    #>
    param([string]$NewStatus)

    $trackFile = Join-Path $TrackingActiveDir "$StoryId.track.md"
    $emojiMap = @{
        "done"          = "🟢 done"
        "review"        = "🟠 review"
        "in-progress"   = "🔵 in-progress"
        "ready-for-dev" = "⚪ ready-for-dev"
        "backlog"       = "⚫ backlog"
        "blocked"       = "🔴 blocked"
    }

    if (-not (Test-Path $trackFile)) {
        Write-Log "Tracking file not found: $trackFile (skipping sync)" "WARN"
        return
    }

    $emojiStatus = if ($emojiMap.ContainsKey($NewStatus)) { $emojiMap[$NewStatus] } else { $NewStatus }

    try {
        $content = Get-Content $trackFile -Encoding UTF8 -Raw
        $updated = $content -replace '\|\s*\*\*狀態\*\*\s*\|\s*[^\|]+\|', "| **狀態** | $emojiStatus |"

        if ($updated -ne $content) {
            [System.IO.File]::WriteAllText($trackFile, $updated, [System.Text.Encoding]::UTF8)
            Write-Log "Tracking file status synced to: $emojiStatus" "OK"
        } else {
            Write-Log "Tracking file status already correct" "OK"
        }

        if ($NewStatus -eq "done") {
            $archivedEpicDir = Join-Path $TrackingArchivedDir "epic-$EpicId"
            if (-not (Test-Path $archivedEpicDir)) {
                New-Item -ItemType Directory -Path $archivedEpicDir -Force | Out-Null
            }
            $archivedPath = Join-Path $archivedEpicDir "$StoryId.track.md"
            $finalContent = Get-Content $trackFile -Encoding UTF8 -Raw
            [System.IO.File]::WriteAllText($archivedPath, $finalContent, [System.Text.Encoding]::UTF8)
            Remove-Item $trackFile -Force
            Write-Log "Tracking file archived: archived/epic-$EpicId/$StoryId.track.md" "OK"
        }
    } catch {
        Write-Log "Tracking file sync failed: $($_.Exception.Message)" "WARN"
    }
}

function Get-StoryStatus {
    # [tdb-4] Context Memory DB is the single source of truth for Story status
    # since the schedule yaml was frozen on 2026-07-28 (tdb-2).
    $queryScript = Join-Path $ProjectRoot ".context-db\scripts\query-stories.js"
    if (-not (Test-Path $queryScript)) { return "unknown" }
    try {
        # [tdb-4 CR F7] EAP guard (same Fix-9 pattern as the launcher pipelines):
        # stray node stderr must not become a terminating error under EAP=Stop.
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $json = & node $queryScript --id $StoryId --format json 2>$null
        } finally {
            $ErrorActionPreference = $prevEAP
        }
        if ($json) {
            $row = $json | ConvertFrom-Json
            if ($row -is [array]) { $row = $row[0] }
            # [tdb-4 CR F3] shape guard (CWE-117): keep the constraint the old yaml
            # regex enforced before the value flows into Write-Log / log files.
            if ($row -and $row.status -and $row.status -match '^[\w-]+$') { return $row.status }
        }
    } catch { }
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
            TokenSafe  = $true
        }
    }

    # Validate claude CLI exists
    try { $null = Get-Command claude -ErrorAction Stop }
    catch {
        Write-Log "ERROR: 'claude' CLI not found in PATH" "ERROR"
        return @{ Phase = $PhaseName; Success = $false; ExitCode = -1; Note = "CLI_NOT_FOUND"; TokenSafe = $true }
    }

    # Execute
    $stdoutFile = Join-Path $LogDir "claude-$StoryId-$PhaseName-$Timestamp.log"
    $stderrFile = Join-Path $LogDir "claude-$StoryId-$PhaseName-err-$Timestamp.log"

    $windowMode = if ($NewWindow) { "NEW WINDOW" } else { "BACKGROUND" }
    Write-Log "Launching Claude ($Model) [$windowMode]... timeout: ${TimeoutMin}min"
    Write-Log "Log: $stdoutFile"

    # --append-system-prompt 強制 BMAD workflow 完整執行
    $enforcePrompt = @"
MANDATORY PIPELINE MODE RULES:
1. YOLO MODE ACTIVE — You are in #yolo mode. Skip ALL [a/c/p/y] elicitation prompts. NEVER wait for user input. Auto-continue through ALL template-output checkpoints.
2. Execute ALL workflow steps. Do NOT skip any step.
3. Metadata sync is MANDATORY — update ALL of these:
   a. Story file Status field (in Story 資訊 table)
   b. Story file DEV Agent / Review Agent / completion time fields
   c. Context Memory DB stories entry (via upsert-story.js)
   d. H1 emoji
   e. Tracking file
4. Skipping ANY metadata update is a CRITICAL violation.
5. GOD NODE AWARENESS PROTOCOL (ADR-GOVERNANCE-001 + Tianji v1.1.0, since 2026-05-02):
   a. pre-prompt-rag.js UserPromptSubmit Hook automatically injects top god nodes (centrality_score >= P75) into every prompt context. Trust those hints.
   b. BEFORE modifying any code referenced as a god node, MUST call mcp__phycool-context__search_god_nodes({domain: '<inferred-namespace>'}) and mcp__phycool-context__get_symbol_context({symbol_id}) to read full BlastRadius before edits.
   c. CR phase: Phase 0.5 BlastRadius auto-lookup is MANDATORY - centrality_score >= 50 (P95) maps to BlastRadius=10 (whole site); >= 5 (P75) -> 5 (module); >= 0.5 (P50) -> 2 (single file); < P50 -> 1 (single line). Use these mapped values in Priority Score formula, NEVER subjective estimates.
   d. F1 violation if Path A (Pipeline) and Path B (SubagentStart) both lack god node injection on same change.
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
            # 記錄超時失敗（推導 stage 名稱）
            $timeoutStage = if ($PhaseName -match '^create') { 'create' } elseif ($PhaseName -match '^dev') { 'dev' } else { 'review' }
            try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage $timeoutStage --status failure --error "timeout after ${TimeoutMin}min" 2>$null } catch { }
            return @{
                Phase      = $PhaseName
                Model      = $Model
                Success    = $false
                ExitCode   = -1
                Duration   = "{0:mm\:ss}" -f $phaseDuration
                StatusFrom = $statusBefore
                StatusTo   = Get-StoryStatus
                Note       = "TIMEOUT"
                TokenSafe  = $true
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

        # Post-phase status reconciliation (FM3 defence)
        # [tdb-4] The yaml writer is now a no-op; this branch only reports the drift.
        if ($exitCode -eq 0) {
            $expectedStatus = Get-ExpectedStatusAfterPhase -PhaseName $PhaseName
            if ($expectedStatus -and $statusAfter -ne $expectedStatus) {
                # [tdb-4 CR F1] This pipeline has no DB writer and the yaml writer is a
                # no-op since the freeze, so the drift is reported, not corrected.
                Write-Log "POST-PHASE DRIFT: Expected '$expectedStatus' but found '$statusAfter'" "WARN"
            }
        }

        # Phase Gate: 偵測 Token 耗盡 + abort_reason (wfq-03 BR-002)
        $gateResult  = Test-PhaseGate -PhaseLogFile $stdoutFile -StderrFile $stderrFile
        $tokenSafe   = $gateResult.TokenSafe
        $abortReason = $gateResult.AbortReason

        # wfq-04 T4.2: Log token record for -p mode pipeline (BR-004)
        if (Test-Path (Join-Path (Get-Location).Path "scripts/pipeline-log-tokens.js")) {
            try {
                $ptStatus = if ($exitCode -eq 0) { "completed" } else { "failed" }
                $ptDurMs = [long]$phaseDuration.TotalMilliseconds
                $ptScript = Join-Path (Get-Location).Path "scripts/pipeline-log-tokens.js"
                $null = & node $ptScript --workflow-type $PhaseName --story-id $StoryId --model $Model --status $ptStatus --input-tokens 0 --output-tokens 0 --cache-read-tokens 0 --cache-creation-tokens 0 --duration-ms $ptDurMs 2>$null
                Write-Log "Token record inserted (p-mode, tokens=0): phase=$PhaseName" "OK"
            } catch {
                Write-Log "pipeline-log-tokens.js (p-mode) failed: $_" "WARN"
            }
        }

        return @{
            Phase      = $PhaseName
            Model      = $Model
            Success    = ($exitCode -eq 0)
            ExitCode   = $exitCode
            Duration   = "{0:mm\:ss}" -f $phaseDuration
            StatusFrom = $statusBefore
            StatusTo   = $statusAfter
            Note       = if ($exitCode -eq 0) { "OK" } else { "FAILED" }
            AbortReason = $abortReason
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
# Story Status Writer (FM3 defence) -- yaml no-op since tdb-2 freeze
# ============================================================================

function Update-SprintStatusSafe {
    <#
    .SYNOPSIS
    [tdb-4] No-op since 2026-08-03. The sprint schedule yaml was frozen read-only
    on 2026-07-28 (tdb-2). The signature is kept so call sites need no change.
    Story status now lives in the Context Memory DB (stories table).
    #>
    param(
        [string]$TargetStoryId,
        [string]$NewStatus
    )

    Write-Log "YAML WRITE SUPPRESSED (frozen 2026-07-28 tdb-2)" "WARN"
    return $false
}

function Get-ExpectedStatusAfterPhase {
    <#
    .SYNOPSIS
        根據 Phase 名稱推斷該階段完成後的預期 Story 狀態。
    #>
    param([string]$PhaseName)
    # Single Source of Truth: scripts/pipeline-config.json (BR-01)
    $configFile = Join-Path $ProjectRoot "scripts/pipeline-config.json"
    if (Test-Path $configFile) {
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $targets = $cfg.phaseTargetStatus.$PhaseName
        if ($null -eq $targets) {
            foreach ($key in $cfg.phaseTargetStatus.PSObject.Properties.Name) {
                if ($PhaseName -like "$key*") { $targets = $cfg.phaseTargetStatus.$key; break }
            }
        }
        if ($targets) { return [string]$targets[0] }
        return $null
    }
    # Config 檔遺失 — 不使用 inline fallback（BR-01: Single Source of Truth）
    Write-Log "WARNING: scripts/pipeline-config.json not found — phase target unknown" "WARN"
    return $null
}

# ============================================================================
# Prompt Builders
# ============================================================================

function Test-PhaseGate {
    <#
    .SYNOPSIS
    Phase Gate — scan Phase log for Token exhaustion patterns. (wfq-03 BR-002 extended: returns hashtable + abort_reason)
    Returns @{ TokenSafe: bool; AbortReason: string|null }
    #>
    param(
        [string]$PhaseLogFile,
        [string]$StderrFile = ''
    )

    $result = @{ TokenSafe = $true; AbortReason = $null }

    $tokenExhaustedPatterns = @(
        "You've hit your limit",
        "rate_limit_error",
        "token limit exceeded",
        "quota exceeded",
        "ResourceExhausted",
        "overloaded_error"
    )

    # Scan stdout log
    if ($PhaseLogFile -and (Test-Path $PhaseLogFile)) {
        $logContent = Get-Content $PhaseLogFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($logContent) {
            foreach ($pattern in $tokenExhaustedPatterns) {
                if ($logContent -match [regex]::Escape($pattern)) {
                    Write-Log "TOKEN EXHAUSTED detected in stdout log: '$pattern'" "ERROR"
                    $result.TokenSafe   = $false
                    $result.AbortReason = "QUOTA_EXHAUSTED"
                    return $result
                }
            }
        }
    }

    # Scan stderr log (wfq-03 BR-002)
    if ($StderrFile -and (Test-Path $StderrFile)) {
        $stderrContent = Get-Content $StderrFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($stderrContent) {
            $stderrPatterns = @(
                'rate_limit_error',
                "You.ve hit your limit",
                'quota exceeded',
                'ResourceExhausted',
                'overloaded_error'
            )
            foreach ($pat in $stderrPatterns) {
                if ($stderrContent -match $pat) {
                    Write-Log "QUOTA_EXHAUSTED in stderr log: '$pat'" "ERROR"
                    $result.TokenSafe   = $false
                    $result.AbortReason = "QUOTA_EXHAUSTED"
                    return $result
                }
            }
        }
    }

    return $result
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
            # 記錄失敗（不阻塞 pipeline）
            try {
                $errMsg = $result.Note -replace '"', ''
                node .context-db/scripts/log-workflow.js --story-id $StoryId --stage create --status failure --error "$errMsg" 2>$null
            } catch { }
        } else {
            # 記錄成功
            try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage create --status success 2>$null } catch { }
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
        # 記錄 skip
        try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage create --status skipped 2>$null } catch { }
    }
} else {
    Write-Log "Skipping create-story: -SkipCreate flag" "WARN"
    $PhaseResults += @{ Phase = "create-story"; Success = $true; Note = "SKIPPED (flag)" }
    # 記錄 skip（flag 觸發）
    try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage create --status skipped 2>$null } catch { }
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
            # 記錄失敗（不阻塞 pipeline）
            try {
                $errMsg = $result.Note -replace '"', ''
                node .context-db/scripts/log-workflow.js --story-id $StoryId --stage dev --status failure --error "$errMsg" 2>$null
            } catch { }
        } else {
            # 記錄成功
            try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage dev --status success 2>$null } catch { }
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
        # 記錄 skip
        try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage dev --status skipped 2>$null } catch { }
    }
} else {
    Write-Log "Skipping dev-story: -SkipDev flag" "WARN"
    $PhaseResults += @{ Phase = "dev-story"; Success = $true; Note = "SKIPPED (flag)" }
    # 記錄 skip（flag 觸發）
    try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage dev --status skipped 2>$null } catch { }
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
            try {
                node .context-db/scripts/log-workflow.js --story-id $StoryId --stage review --status failure --error "exit code error" 2>$null
            } catch { }
            break
        }

        # Check if review passed (status changed to 'done')
        $afterStatus = Get-StoryStatus
        if ($afterStatus -eq "done") {
            $reviewPassed = $true
            Write-Log "Code review PASSED! Story is done." "OK"
            # 記錄 review 成功
            try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage review --status success 2>$null } catch { }
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
    # 記錄 skip（flag 觸發）
    try { node .context-db/scripts/log-workflow.js --story-id $StoryId --stage review --status skipped 2>$null } catch { }
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

# ── Tracking file 保底同步 ──
# 子視窗 workflow 應已更新，但若遺漏則由此保底
try {
    Sync-TrackingFile -NewStatus $finalStatus
} catch {
    Write-Log "Tracking file sync (safety net) failed: $($_.Exception.Message)" "WARN"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan

# Write summary to log
Write-Log "Pipeline finished. Final status: $finalStatus. Duration: $durStr"
