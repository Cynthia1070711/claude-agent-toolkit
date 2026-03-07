# ============================================================================
# Batch Runner — Parallel Story Pipeline with Staggered Launch
# ============================================================================
# 並行啟動多個 story-pipeline.ps1（隱藏視窗），監控完成後讀取
# sprint-status.yaml 判斷真實結果，產出 Markdown 報告。
#
# 設計為 Claude Code Bash run_in_background 執行（無可見主控台）。
#
# Usage:
#   .\scripts\batch-runner.ps1 -BatchId 1 -IntervalSec 12
#   .\scripts\batch-runner.ps1 -BatchId 1 -DryRun
#   .\scripts\batch-runner.ps1 -StoryIds @("qgr-s2","qgr-s3") -IntervalSec 15
# ============================================================================

[CmdletBinding()]
param (
    [Parameter(HelpMessage = "Batch number (1-8, uses predefined story lists)")]
    [int]$BatchId = 0,

    [Parameter(HelpMessage = "Custom story ID list (overrides BatchId)")]
    [string[]]$StoryIds = @(),

    [Parameter(HelpMessage = "Seconds to wait between story launches")]
    [int]$IntervalSec = 12,

    [Parameter(HelpMessage = "Dry-run mode")]
    [switch]$DryRun,

    [Parameter(HelpMessage = "Timeout per phase in minutes")]
    [int]$TimeoutMin = 45,

    [Parameter(HelpMessage = "Token safety valve threshold percentage (default: 90)")]
    [int]$TokenSafetyThreshold = 90,

    [Parameter(HelpMessage = "Estimated tokens per Story pipeline (used for safety valve calculation)")]
    [int]$EstTokensPerStory = 150000,

    [Parameter(HelpMessage = "Daily token limit (0 = disabled, relies on error pattern detection only)")]
    [int]$DailyTokenLimit = 0
)

# ============================================================================
# Batch Definitions
# ============================================================================
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

# ============================================================================
# Setup
# ============================================================================
$ErrorActionPreference = "Continue"

if ($PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
} else {
    $ProjectRoot = (Get-Location).Path
}

$PipelineScript = Join-Path $ProjectRoot "scripts\story-pipeline.ps1"
$SprintStatusPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"
$LogDir = Join-Path $ProjectRoot "logs"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Resolve story list
if ($StoryIds.Count -eq 0 -and $BatchId -gt 0) {
    if ($Batches.ContainsKey($BatchId)) {
        $StoryIds = $Batches[$BatchId]
    } else {
        Write-Output "[ERROR] Unknown BatchId: $BatchId"
        exit 1
    }
}

if ($StoryIds.Count -eq 0) {
    Write-Output "[ERROR] No stories to run. Provide -BatchId or -StoryIds"
    exit 1
}

$BatchLabel = if ($BatchId -gt 0) { "Batch-$BatchId" } else { "Custom" }
$LogFile = Join-Path $LogDir "batch-runner-$BatchLabel-$Timestamp.log"
$StartTime = Get-Date

# ============================================================================
# Helpers
# ============================================================================
function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    # 使用 Write-Host 避免污染 pipeline（Write-Output 會被函式呼叫者捕獲為回傳值）
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        default { "White" }
    }
    Write-Host $line -ForegroundColor $color
    $line | Out-File -Append -FilePath $LogFile -Encoding UTF8
}

# Token usage tracker
$Script:TokenUsageEstimate = 0
$Script:TokenExhausted = $false

function Test-TokenHealth {
    <#
    .SYNOPSIS
    Token 安全閥 — 檢查是否可安全啟動下一個 Story pipeline。
    回傳 $true = 安全，$false = 應停止。

    時間過濾策略：
      - pre-batch：掃描 1 小時內的 log（偵測同 session 前一批次耗盡）
      - pre-story：只掃 $StartTime 之後的 log（當前批次產生的）
    不依賴 Story ID 或 Epic 命名，換 Epic 也不用改邏輯。
    #>
    param(
        [string]$CheckPoint = "pre-story"  # pre-batch | pre-story
    )

    # 已偵測到 Token 耗盡 → 直接停止
    if ($Script:TokenExhausted) {
        Write-Log "TOKEN SAFETY: Previously detected token exhaustion. Blocking." "ERROR"
        return $false
    }

    # 時間過濾：pre-batch 看 1 小時內，pre-story 只看當前批次啟動後
    $cutoffTime = switch ($CheckPoint) {
        "pre-batch" { (Get-Date).AddHours(-1) }
        default     { $StartTime }
    }

    # 掃描時間範圍內的 claude log
    $recentLogs = Get-ChildItem -Path $LogDir -Filter "claude-*.log" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $cutoffTime } |
        Sort-Object LastWriteTime -Descending

    $exhaustionPatterns = @(
        "You've hit your limit",
        "rate_limit_error",
        "token limit exceeded",
        "quota exceeded",
        "ResourceExhausted",
        "overloaded_error"
    )

    foreach ($lf in $recentLogs) {
        $content = Get-Content $lf.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        foreach ($pattern in $exhaustionPatterns) {
            if ($content -match [regex]::Escape($pattern)) {
                Write-Log "TOKEN SAFETY: Pattern '$pattern' in $($lf.Name) (written: $($lf.LastWriteTime.ToString('HH:mm:ss')))" "ERROR"
                $Script:TokenExhausted = $true
                return $false
            }
        }
    }

    # 基於累積估算（需設定 DailyTokenLimit）
    if ($DailyTokenLimit -gt 0) {
        $usagePercent = [math]::Round(($Script:TokenUsageEstimate / $DailyTokenLimit) * 100, 1)
        Write-Log "TOKEN SAFETY [$CheckPoint]: Usage ${usagePercent}% ($($Script:TokenUsageEstimate) / $DailyTokenLimit)"

        if ($usagePercent -ge $TokenSafetyThreshold) {
            Write-Log "TOKEN SAFETY VALVE TRIGGERED at ${usagePercent}% (threshold: ${TokenSafetyThreshold}%)" "ERROR"
            $Script:TokenExhausted = $true
            return $false
        }
    }

    return $true
}

function Get-StoryStatusFromYaml {
    param([string]$StoryId)
    if (-not (Test-Path $SprintStatusPath)) { return "unknown" }
    $lines = Get-Content $SprintStatusPath -Encoding UTF8
    foreach ($l in $lines) {
        $trimmed = $l.Trim()
        if ($trimmed -match "^${StoryId}(-[a-z][\w-]*)?\s*:\s+([\w-]+)") {
            return $Matches[2]
        }
    }
    return "not-found"
}

# ============================================================================
# Phase A: Record initial statuses & Launch all stories
# ============================================================================
$Processes = @()
$InitialStatuses = @{}

Write-Log "============================================================"
Write-Log "$BatchLabel | Stories: $($StoryIds -join ', ')"
Write-Log "Interval: ${IntervalSec}s | Timeout: ${TimeoutMin}min/phase"
Write-Log "============================================================"

# Record initial statuses
foreach ($sid in $StoryIds) {
    $InitialStatuses[$sid] = Get-StoryStatusFromYaml -StoryId $sid
    Write-Log "  $sid initial status: $($InitialStatuses[$sid])"
}

# ── L1: Pre-batch Token 安全閥 ──
if (-not (Test-TokenHealth -CheckPoint "pre-batch")) {
    Write-Log "L1 PRE-BATCH: Token safety valve triggered. Entire batch blocked." "ERROR"
    Write-Log "$BatchLabel ABORTED (TOKEN-LIMIT)"
    exit 99
}

Write-Log "--- Launching pipelines ---"

for ($i = 0; $i -lt $StoryIds.Count; $i++) {
    $sid = $StoryIds[$i]
    $num = $i + 1
    $total = $StoryIds.Count

    # ── L2: Pre-story Token 安全閥 ──
    if (-not $DryRun -and -not (Test-TokenHealth -CheckPoint "pre-story")) {
        Write-Log "[$num/$total] L2 PRE-STORY: Token safety valve triggered. Skipping $sid and remaining stories." "ERROR"
        # 記錄被跳過的 Story
        for ($j = $i; $j -lt $StoryIds.Count; $j++) {
            $skippedSid = $StoryIds[$j]
            $Processes += [PSCustomObject]@{
                StoryId = $skippedSid
                Process = $null
                PID     = -1
                Num     = $j + 1
                Skipped = $true
                SkipReason = "TOKEN-LIMIT"
            }
        }
        break
    }

    if ($DryRun) {
        Write-Log "[$num/$total] [DRY-RUN] Would launch: $sid"
    } else {
        $proc = Start-Process -FilePath "powershell" `
            -ArgumentList @(
                "-ExecutionPolicy", "Bypass",
                "-Command",
                "Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue; " +
                "Set-Location '$ProjectRoot'; " +
                "& './scripts/story-pipeline.ps1' -StoryId '$sid' -TimeoutMin $TimeoutMin"
            ) -WindowStyle Hidden -PassThru

        $Processes += [PSCustomObject]@{
            StoryId    = $sid
            Process    = $proc
            PID        = $proc.Id
            Num        = $num
            Skipped    = $false
            SkipReason = ""
        }

        # 累加 Token 使用估算
        $Script:TokenUsageEstimate += $EstTokensPerStory

        Write-Log "[$num/$total] $sid launched (PID: $($proc.Id))"
    }

    # Stagger interval (skip after last)
    if ($i -lt $StoryIds.Count - 1) {
        Write-Log "Waiting ${IntervalSec}s..."
        Start-Sleep -Seconds $IntervalSec
    }
}

Write-Log "All $($StoryIds.Count) stories launched."

if ($DryRun) {
    Write-Log "[DRY-RUN] Complete."
    exit 0
}

# ============================================================================
# Phase B: Monitor until all processes exit
# ============================================================================
$pollInterval = 30

while ($true) {
    Start-Sleep -Seconds $pollInterval
    $running = @($Processes | Where-Object { $_.Process -ne $null -and -not $_.Process.HasExited })

    if ($running.Count -eq 0) { break }

    $ts = Get-Date -Format "HH:mm:ss"
    $runningNames = ($running | ForEach-Object { $_.StoryId }) -join ", "
    $doneCount = $Processes.Count - $running.Count
    Write-Log "[$ts] Running: $($running.Count) ($runningNames) | Done: $doneCount"
}

Write-Log "All processes exited."

# ============================================================================
# Phase C: Read sprint-status.yaml for REAL results
# ============================================================================
$TotalDuration = (Get-Date) - $StartTime
$TotalDurStr = '{0:hh\:mm\:ss}' -f $TotalDuration

# Small delay for file system sync
Start-Sleep -Seconds 3

$Results = @()
foreach ($p in $Processes) {
    $sid = $p.StoryId
    $initialStatus = $InitialStatuses[$sid]

    # 被 Token 安全閥跳過的 Story
    if ($p.Skipped) {
        $Results += [PSCustomObject]@{
            StoryId       = $sid
            InitialStatus = $initialStatus
            FinalStatus   = $initialStatus
            Result        = $p.SkipReason  # TOKEN-LIMIT
            Duration      = "N/A"
            PID           = -1
        }
        continue
    }

    $finalStatus = Get-StoryStatusFromYaml -StoryId $sid

    # Determine result from sprint-status.yaml (NOT exit code)
    $result = switch ($finalStatus) {
        "done"         { "DONE" }
        "review"       { "REVIEW" }   # dev completed, review pending or skipped
        "in-progress"  { "DEV-FAIL" } # dev didn't complete
        "ready-for-dev" { "CREATE-ONLY" } # only create completed
        "backlog"      { "NOT-STARTED" }
        default        { "UNKNOWN" }
    }

    # L4 事後偵測：只掃描當前批次啟動後產生的該 Story log
    $storyLogs = Get-ChildItem -Path $LogDir -Filter "claude-$sid-*.log" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $StartTime }
    foreach ($sl in $storyLogs) {
        $logContent = Get-Content $sl.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($logContent -match "You've hit your limit|rate_limit_error|token limit exceeded") {
            $result = "TOKEN-LIMIT"
            $Script:TokenExhausted = $true
            break
        }
    }

    # Duration from process
    $duration = "N/A"
    try {
        if ($p.Process.ExitTime -and $p.Process.StartTime) {
            $runtime = $p.Process.ExitTime - $p.Process.StartTime
            $duration = "{0:hh\:mm\:ss}" -f $runtime
        }
    } catch { }

    $Results += [PSCustomObject]@{
        StoryId       = $sid
        InitialStatus = $initialStatus
        FinalStatus   = $finalStatus
        Result        = $result
        Duration      = $duration
        PID           = $p.PID
    }
}

# ============================================================================
# Phase D: Generate Report
# ============================================================================
$doneCount = @($Results | Where-Object { $_.Result -eq "DONE" }).Count
$reviewCount = @($Results | Where-Object { $_.Result -eq "REVIEW" }).Count
$tokenLimitCount = @($Results | Where-Object { $_.Result -eq "TOKEN-LIMIT" }).Count
$failCount = @($Results | Where-Object { $_.Result -notin @("DONE", "REVIEW", "TOKEN-LIMIT") }).Count

Write-Log "============================================================"
Write-Log "$BatchLabel COMPLETE"
Write-Log "============================================================"
Write-Log "Total Wall Time: $TotalDurStr"
Write-Log "Results: DONE=$doneCount | REVIEW=$reviewCount | TOKEN-LIMIT=$tokenLimitCount | FAIL=$failCount"
Write-Log ""

foreach ($r in $Results) {
    $icon = switch ($r.Result) {
        "DONE"        { "[OK]" }
        "REVIEW"      { "[>>]" }
        "TOKEN-LIMIT" { "[TL]" }
        default       { "[!!]" }
    }
    Write-Log "  $icon $($r.StoryId): $($r.InitialStatus) -> $($r.FinalStatus) ($($r.Duration))"
}

# ── Markdown report file ──
$ReportDir = Join-Path $ProjectRoot "docs\implementation-artifacts\reports"
if (-not (Test-Path $ReportDir)) {
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}
$ReportFile = Join-Path $ReportDir "batch-$BatchLabel-$Timestamp.md"
$reportTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$rpt = "# $BatchLabel Report`r`n`r`n"
$rpt += "> Time: $reportTime`r`n"
$rpt += "> Wall Time: $TotalDurStr`r`n"
$rpt += "> Results: DONE=$doneCount | REVIEW=$reviewCount | TOKEN-LIMIT=$tokenLimitCount | FAIL=$failCount`r`n`r`n"
$rpt += "## Details`r`n`r`n"
$rpt += "| Story | Before | After | Result | Duration |`r`n"
$rpt += "|-------|--------|-------|--------|----------|`r`n"

foreach ($r in $Results) {
    $statusIcon = switch ($r.Result) {
        "DONE"        { "v" }
        "REVIEW"      { ">>" }
        "TOKEN-LIMIT" { "TL" }
        "DEV-FAIL"    { "X" }
        "CREATE-ONLY" { "~" }
        "NOT-STARTED" { "-" }
        default       { "?" }
    }
    $rpt += "| $($r.StoryId) | $($r.InitialStatus) | $($r.FinalStatus) | $statusIcon $($r.Result) | $($r.Duration) |`r`n"
}

$needsFollowUp = @($Results | Where-Object { $_.Result -notin @("DONE") })
if ($needsFollowUp.Count -gt 0) {
    $rpt += "`r`n## Follow-up`r`n`r`n"
    foreach ($r in $needsFollowUp) {
        $action = switch ($r.Result) {
            "REVIEW"      { "Run code-review (-SkipCreate -SkipDev)" }
            "TOKEN-LIMIT" { "Re-run after token quota reset (blocked by safety valve)" }
            "DEV-FAIL"    { "Re-run dev-story + code-review (-SkipCreate)" }
            "CREATE-ONLY" { "Run dev-story + code-review (-SkipCreate)" }
            "NOT-STARTED" { "Run full pipeline" }
            default       { "Manual check needed" }
        }
        $rpt += "- **$($r.StoryId)**: $action`r`n"
    }
}

$rpt | Out-File -FilePath $ReportFile -Encoding UTF8

Write-Log ""
Write-Log "Report: $ReportFile"

# Exit code: 99 = token limit, 1 = failures, 0 = success
if ($tokenLimitCount -gt 0) {
    Write-Log "$BatchLabel finished with TOKEN-LIMIT ($tokenLimitCount stories blocked)." "WARN"
    exit 99
} elseif ($failCount -gt 0) {
    Write-Log "$BatchLabel finished with failures ($failCount)." "WARN"
    exit 1
} else {
    Write-Log "$BatchLabel finished successfully."
    exit 0
}
