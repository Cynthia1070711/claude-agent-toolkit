# ============================================================================
# Batch Runner — Parallel Story Pipeline with Staggered Launch
# [RETIRED 2026-07-28 tdb-2] Depends on story-pipeline.ps1 (retired) and reads
# sprint-status.yaml (frozen read-only 2026-07-28) to judge completion — results
# would reflect a permanently stale snapshot. Superseded by party-to-pipeline v5.x
# batch dispatch (multi-track-orchestration SOP-3). Kept for historical reference only.
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
    [int]$DailyTokenLimit = 0,

    [Parameter(HelpMessage = "Max retry rounds for incomplete stories (default: 1)")]
    [int]$MaxRetries = 1
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
# Phase A-C: Launch → Monitor → Collect (with Retry Loop)
# ============================================================================
$InitialStatuses = @{}
$AllRoundResults = @()    # 所有 Round 的結果累積
$Results = @()            # 最終結果（每個 Story 取最後一次結果）

Write-Log "============================================================"
Write-Log "$BatchLabel | Stories: $($StoryIds -join ', ')"
Write-Log "Interval: ${IntervalSec}s | Timeout: ${TimeoutMin}min/phase | MaxRetries: $MaxRetries"
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

if ($DryRun) {
    Write-Log "--- [DRY-RUN] Would launch: $($StoryIds -join ', ') ---"
    Write-Log "[DRY-RUN] Complete."
    exit 0
}

$currentRound = 0
$storiesToRun = @() + $StoryIds  # 複製一份，避免修改原始參數
$tokenBlocked = $false

while ($currentRound -le $MaxRetries) {
    $currentRound++
    Write-Log ""
    Write-Log "============================================================"
    Write-Log "ROUND $currentRound / $($MaxRetries + 1) | Stories: $($storiesToRun -join ', ')"
    Write-Log "============================================================"

    # ── Phase A: Launch ──
    $Processes = @()

    for ($i = 0; $i -lt $storiesToRun.Count; $i++) {
        $sid = $storiesToRun[$i]
        $num = $i + 1
        $total = $storiesToRun.Count

        # 已經 done 的 Story 自動跳過（story-pipeline 也會跳，但這裡省去啟動開銷）
        $currentSt = Get-StoryStatusFromYaml -StoryId $sid
        if ($currentSt -eq "done") {
            Write-Log "[$num/$total] $sid already done — auto-skip"
            $Processes += [PSCustomObject]@{
                StoryId = $sid; Process = $null; PID = -1; Num = $num
                Skipped = $true; SkipReason = "ALREADY-DONE"
            }
            continue
        }

        # ── L2: Pre-story Token 安全閥 ──
        if (-not (Test-TokenHealth -CheckPoint "pre-story")) {
            Write-Log "[$num/$total] L2 PRE-STORY: Token safety valve triggered. Skipping $sid and remaining." "ERROR"
            $tokenBlocked = $true
            for ($j = $i; $j -lt $storiesToRun.Count; $j++) {
                $skippedSid = $storiesToRun[$j]
                # 避免重複記錄已 done 的
                $existingSkip = $Processes | Where-Object { $_.StoryId -eq $skippedSid }
                if (-not $existingSkip) {
                    $Processes += [PSCustomObject]@{
                        StoryId = $skippedSid; Process = $null; PID = -1; Num = $j + 1
                        Skipped = $true; SkipReason = "TOKEN-LIMIT"
                    }
                }
            }
            break
        }

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

        $Script:TokenUsageEstimate += $EstTokensPerStory
        Write-Log "[$num/$total] $sid launched (PID: $($proc.Id))"

        # Stagger interval (skip after last)
        if ($i -lt $storiesToRun.Count - 1) {
            # 下一個若已 done 則不用等
            $nextSid = $storiesToRun[$i + 1]
            $nextSt = Get-StoryStatusFromYaml -StoryId $nextSid
            if ($nextSt -ne "done") {
                Write-Log "Waiting ${IntervalSec}s..."
                Start-Sleep -Seconds $IntervalSec
            }
        }
    }

    $launchedCount = @($Processes | Where-Object { -not $_.Skipped }).Count
    Write-Log "Round ${currentRound}: $launchedCount stories launched."

    if ($launchedCount -eq 0) {
        Write-Log "Round ${currentRound}: Nothing to run, exiting loop."
        break
    }

    # ── Phase B: Monitor ──
    $pollInterval = 30
    while ($true) {
        Start-Sleep -Seconds $pollInterval
        $running = @($Processes | Where-Object { $_.Process -ne $null -and -not $_.Process.HasExited })
        if ($running.Count -eq 0) { break }

        $ts = Get-Date -Format "HH:mm:ss"
        $runningNames = ($running | ForEach-Object { $_.StoryId }) -join ", "
        $doneNow = $Processes.Count - $running.Count
        Write-Log "[$ts] Running: $($running.Count) ($runningNames) | Done: $doneNow"
    }
    Write-Log "Round ${currentRound}: All processes exited."

    # ── Phase C: Collect results ──
    Start-Sleep -Seconds 3  # file system sync

    $roundResults = @()
    foreach ($p in $Processes) {
        $sid = $p.StoryId
        $initialStatus = $InitialStatuses[$sid]

        if ($p.Skipped) {
            $roundResults += [PSCustomObject]@{
                StoryId       = $sid
                InitialStatus = $initialStatus
                FinalStatus   = if ($p.SkipReason -eq "ALREADY-DONE") { "done" } else { $initialStatus }
                Result        = if ($p.SkipReason -eq "ALREADY-DONE") { "DONE" } else { $p.SkipReason }
                Duration      = "N/A"
                PID           = -1
                Round         = $currentRound
            }
            continue
        }

        $finalStatus = Get-StoryStatusFromYaml -StoryId $sid
        $result = switch ($finalStatus) {
            "done"         { "DONE" }
            "review"       { "REVIEW" }
            "in-progress"  { "DEV-FAIL" }
            "ready-for-dev" { "CREATE-ONLY" }
            "backlog"      { "NOT-STARTED" }
            default        { "UNKNOWN" }
        }

        # L4 事後偵測
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

        $duration = "N/A"
        try {
            if ($p.Process.ExitTime -and $p.Process.StartTime) {
                $runtime = $p.Process.ExitTime - $p.Process.StartTime
                $duration = "{0:hh\:mm\:ss}" -f $runtime
            }
        } catch { }

        $roundResults += [PSCustomObject]@{
            StoryId       = $sid
            InitialStatus = $initialStatus
            FinalStatus   = $finalStatus
            Result        = $result
            Duration      = $duration
            PID           = $p.PID
            Round         = $currentRound
        }
    }

    $AllRoundResults += $roundResults

    # Round 統計
    $roundDone = @($roundResults | Where-Object { $_.Result -eq "DONE" }).Count
    $roundTotal = $roundResults.Count
    Write-Log "Round $currentRound results: $roundDone / $roundTotal DONE"

    # 判斷是否需要重跑
    $incomplete = @($roundResults | Where-Object { $_.Result -notin @("DONE", "TOKEN-LIMIT", "ALREADY-DONE") })
    if ($incomplete.Count -eq 0) {
        Write-Log "All stories completed. No retry needed." "OK"
        break
    }

    if ($tokenBlocked) {
        Write-Log "Token limit hit during this round. No retry." "WARN"
        break
    }

    if ($currentRound -gt $MaxRetries) {
        Write-Log "Max retries ($MaxRetries) exhausted. $($incomplete.Count) stories still incomplete." "WARN"
        break
    }

    # 準備下一輪：只重跑未完成的
    $storiesToRun = @($incomplete | ForEach-Object { $_.StoryId })
    Write-Log "Scheduling retry for: $($storiesToRun -join ', ')" "WARN"
    Write-Log "Waiting ${IntervalSec}s before retry round..."
    Start-Sleep -Seconds $IntervalSec
}

# 合併最終結果：每個 Story 取最後一次 Round 的結果
foreach ($sid in $StoryIds) {
    $lastResult = $AllRoundResults | Where-Object { $_.StoryId -eq $sid } | Select-Object -Last 1
    if ($lastResult) {
        $Results += $lastResult
    } else {
        # 不應發生，保險起見
        $Results += [PSCustomObject]@{
            StoryId = $sid; InitialStatus = $InitialStatuses[$sid]
            FinalStatus = Get-StoryStatusFromYaml -StoryId $sid
            Result = "UNKNOWN"; Duration = "N/A"; PID = -1; Round = 0
        }
    }
}

# ============================================================================
# Phase D: Generate Report
# ============================================================================
$TotalDuration = (Get-Date) - $StartTime
$TotalDurStr = '{0:hh\:mm\:ss}' -f $TotalDuration

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

# ============================================================================
# Phase E: Auto Batch Audit (FM2 防禦)
# ============================================================================
$AuditScript = Join-Path $ProjectRoot "scripts\batch-audit.ps1"
if (Test-Path $AuditScript) {
    Write-Log ""
    Write-Log "--- Running batch-audit -AutoFix ---"
    $storyIdArgs = ($StoryIds | ForEach-Object { "'$_'" }) -join ","
    try {
        $auditOutput = & powershell -ExecutionPolicy Bypass -Command "Set-Location '$ProjectRoot'; & '$AuditScript' -StoryIds @($storyIdArgs) -AutoFix" 2>&1
        $auditOutput | ForEach-Object { Write-Log "  [AUDIT] $_" }
        Write-Log "batch-audit completed (exit: $LASTEXITCODE)" $(if ($LASTEXITCODE -eq 0) { "OK" } else { "WARN" })
    } catch {
        Write-Log "batch-audit failed: $_" "WARN"
    }
} else {
    Write-Log "batch-audit.ps1 not found, skipping." "WARN"
}

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
