# ============================================================================
# PCPT Epic Auto-Pilot Orchestrator
# ============================================================================
# Full-auto Epic pipeline via PowerShell orchestrating Claude Code + Gemini CLI
# Engine assignment per multi-engine-sop.md:
#   create-story  -> Claude Code CLI (CC-OPUS)
#   dev-story     -> Gemini CLI (GC-PRO)
#   code-review   -> Claude Code CLI (CC-OPUS)
#
# Usage:
#   .\scripts\epic-auto-pilot.ps1 -EpicId "qgr"
#   .\scripts\epic-auto-pilot.ps1 -EpicId "trs" -DryRun
#   .\scripts\epic-auto-pilot.ps1 -EpicId "qgr" -StoryFilter "qgr-d*"
# ============================================================================

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, HelpMessage = "Epic ID, e.g. qgr, trs, td")]
    [string]$EpicId,

    [Parameter(HelpMessage = "Dry-run mode")]
    [switch]$DryRun,

    [Parameter(HelpMessage = "Max iterations")]
    [int]$MaxIterations = 50,

    [Parameter(HelpMessage = "Story filter glob")]
    [string]$StoryFilter = "",

    [Parameter(HelpMessage = "Max code-review retries")]
    [int]$MaxReviewRetries = 2,

    [Parameter(HelpMessage = "CLI timeout in seconds")]
    [int]$TimeoutSeconds = 2700,

    [Parameter(HelpMessage = "Claude Code model")]
    [string]$ClaudeModel = "opus",

    [Parameter(HelpMessage = "Gemini CLI model")]
    [string]$GeminiModel = "gemini-3.1-pro-preview"
)

# ============================================================================
# Globals
# ============================================================================
if ($PSScriptRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
else {
    $ProjectRoot = (Get-Location).Path
}
$chkPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"
if (-not (Test-Path $chkPath)) {
    $ProjectRoot = (Get-Location).Path
}
$SprintStatusPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"
$LogDir = Join-Path $ProjectRoot "logs"
$ReportDir = Join-Path $ProjectRoot "docs\implementation-artifacts\reports"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LogFile = Join-Path $LogDir "epic-auto-pilot-$EpicId-$Timestamp.log"
$ReportFile = Join-Path $ReportDir "epic-auto-pilot-$EpicId-$Timestamp.md"
$StartTime = Get-Date
$script:StoryResults = @()

# ============================================================================
# Helpers
# ============================================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$ts] [$Level] $Message"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "OK" { "Green" }
        "PHASE" { "Cyan" }
        default { "White" }
    }
    Write-Host $logLine -ForegroundColor $color
    $logParent = Split-Path $LogFile -Parent
    if ($logParent -and (Test-Path $logParent)) {
        $logLine | Out-File -Append -FilePath $LogFile -Encoding UTF8
    }
}

function Initialize-Directories {
    @($LogDir, $ReportDir) | ForEach-Object {
        if (-not (Test-Path $_)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
            Write-Log "Created directory: $_"
        }
    }
}

function Parse-SprintStatus {
    param([string]$EpicKey)

    if (-not (Test-Path $SprintStatusPath)) {
        Write-Log "sprint-status.yaml not found: $SprintStatusPath" "ERROR"
        return @()
    }

    $lines = Get-Content $SprintStatusPath -Encoding UTF8
    $stories = @()
    $epicPrefix = $EpicKey.ToLower()
    $prefixes = @($epicPrefix)
    if ($epicPrefix -eq "qgr") { $prefixes += "fra" }

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -match "^#" -or $trimmed -eq "") { continue }
        if ($trimmed -match "^(generated|project|tracking|story_location|development_status):") { continue }
        if ($trimmed -match "^epic-") { continue }

        if ($trimmed -match "^(\S+):\s+([\w-]+)(.*)$") {
            $storyId = $Matches[1]
            $status = $Matches[2]
            $comment = $Matches[3].Trim()

            $belongsToEpic = $false
            foreach ($p in $prefixes) {
                if ($storyId.StartsWith("$p-")) { $belongsToEpic = $true; break }
            }

            if ($belongsToEpic) {
                $priority = 99
                if ($comment -match "P0") { $priority = 0 }
                elseif ($comment -match "P1") { $priority = 1 }
                elseif ($comment -match "P2") { $priority = 2 }

                $complexity = "M"
                if ($comment -match ",\s*(XS|S|M|L|XL)[\s,]") { $complexity = $Matches[1] }

                $stories += [PSCustomObject]@{
                    Id         = $storyId
                    Status     = $status
                    Priority   = $priority
                    Complexity = $complexity
                    Comment    = $comment
                }
            }
        }
    }

    if ($StoryFilter) {
        $stories = $stories | Where-Object { $_.Id -like $StoryFilter }
    }
    return $stories | Sort-Object Priority, Id
}

function Get-PendingStories {
    param([array]$Stories)
    return $Stories | Where-Object {
        $_.Status -notin @("done", "cancelled", "cancelled-merged", "superseded", "split")
    }
}

function Select-NextStory {
    param([array]$Stories)
    $statusPriority = @{
        "review"        = 0
        "in-progress"   = 1
        "ready-for-dev" = 2
        "backlog"       = 3
    }
    $pending = Get-PendingStories -Stories $Stories
    if ($pending.Count -eq 0) { return $null }

    return $pending | Sort-Object {
        $sp = $statusPriority[$_.Status]
        if ($null -eq $sp) { $sp = 99 }
        $sp
    }, Priority, Id | Select-Object -First 1
}

# ============================================================================
# CLI Invocation
# ============================================================================

function Invoke-ClaudeCode {
    param([string]$Prompt, [string]$TaskType)

    $agentId = "CC-OPUS"
    Write-Log "[$agentId] Starting Claude Code CLI ($TaskType)..." "PHASE"

    if ($DryRun) {
        Write-Log "[DRY-RUN] Skipped. Prompt length: $($Prompt.Length) chars" "WARN"
        Start-Sleep -Seconds 1
        return @{ Success = $true; Output = "[DRY-RUN]"; ExitCode = 0 }
    }

    try {
        $tempFile = [System.IO.Path]::GetTempFileName()
        $Prompt | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline
        $promptContent = Get-Content $tempFile -Raw -Encoding UTF8

        $timeoutMin = [math]::Round($TimeoutSeconds / 60)
        Write-Log "[$agentId] Running... (timeout: ${timeoutMin}min)" "INFO"

        $stdoutFile = Join-Path $LogDir "claude-stdout-$Timestamp.txt"
        $stderrFile = Join-Path $LogDir "claude-stderr-$Timestamp.txt"

        $proc = Start-Process -FilePath "claude" `
            -ArgumentList @("-p", $promptContent, "--model", $ClaudeModel, "--dangerously-skip-permissions") `
            -WorkingDirectory $ProjectRoot `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        $completed = $proc.WaitForExit($TimeoutSeconds * 1000)
        if (-not $completed) {
            Write-Log "[$agentId] TIMEOUT! Killing process" "ERROR"
            $proc.Kill()
            return @{ Success = $false; Output = "TIMEOUT"; ExitCode = -1 }
        }

        $stdout = ""
        if (Test-Path $stdoutFile) { $stdout = Get-Content $stdoutFile -Raw -Encoding UTF8 }

        $exitCode = $proc.ExitCode
        $lvl = "ERROR"; if ($exitCode -eq 0) { $lvl = "OK" }
        Write-Log "[$agentId] Done. ExitCode: $exitCode" $lvl
        return @{ Success = ($exitCode -eq 0); Output = $stdout; ExitCode = $exitCode }
    }
    catch {
        Write-Log "[$agentId] Failed: $_" "ERROR"
        return @{ Success = $false; Output = $_.ToString(); ExitCode = -999 }
    }
    finally {
        if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-GeminiCLI {
    param([string]$Prompt, [string]$TaskType)

    $agentId = "GC-PRO"
    Write-Log "[$agentId] Starting Gemini CLI ($TaskType)..." "PHASE"

    if ($DryRun) {
        Write-Log "[DRY-RUN] Skipped. Prompt length: $($Prompt.Length) chars" "WARN"
        Start-Sleep -Seconds 1
        return @{ Success = $true; Output = "[DRY-RUN]"; ExitCode = 0 }
    }

    try {
        $tempFile = [System.IO.Path]::GetTempFileName()
        $Prompt | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline

        $timeoutMin = [math]::Round($TimeoutSeconds / 60)
        Write-Log "[$agentId] Running... (timeout: ${timeoutMin}min)" "INFO"

        $stdoutFile = Join-Path $LogDir "gemini-stdout-$Timestamp.txt"
        $stderrFile = Join-Path $LogDir "gemini-stderr-$Timestamp.txt"

        $proc = Start-Process -FilePath "cmd" `
            -ArgumentList "/c", "type `"$tempFile`" | gemini --model $GeminiModel -y" `
            -WorkingDirectory $ProjectRoot `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        $completed = $proc.WaitForExit($TimeoutSeconds * 1000)
        if (-not $completed) {
            Write-Log "[$agentId] TIMEOUT! Killing process" "ERROR"
            $proc.Kill()
            return @{ Success = $false; Output = "TIMEOUT"; ExitCode = -1 }
        }

        $stdout = ""
        if (Test-Path $stdoutFile) { $stdout = Get-Content $stdoutFile -Raw -Encoding UTF8 }

        $exitCode = $proc.ExitCode
        $lvl = "ERROR"; if ($exitCode -eq 0) { $lvl = "OK" }
        Write-Log "[$agentId] Done. ExitCode: $exitCode" $lvl
        return @{ Success = ($exitCode -eq 0); Output = $stdout; ExitCode = $exitCode }
    }
    catch {
        Write-Log "[$agentId] Failed: $_" "ERROR"
        return @{ Success = $false; Output = $_.ToString(); ExitCode = -999 }
    }
    finally {
        if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
    }
}

# ============================================================================
# Prompt Builders (here-strings with Chinese for CLI agents)
# ============================================================================

function Build-CreateStoryPrompt {
    param([PSCustomObject]$Story)
    $sid = $Story.Id
    $prompt = "You are CC-OPUS, PCPT project AI commander.`n"
    $prompt += "Working directory: pcpt-PCPT-MVP project root.`n`n"
    $prompt += "## Task`nCreate story '$sid' using create-story workflow.`n`n"
    $prompt += "## Steps`n"
    $prompt += "1. Read docs/implementation-artifacts/stories/epic-$EpicId/README.md`n"
    $prompt += "2. Read sprint-status.yaml, confirm '$sid' status = backlog`n"
    $prompt += "3. Load _bmad/core/tasks/workflow.xml as core engine`n"
    $prompt += "4. Use _bmad/bmm/workflows/4-implementation/create-story/workflow.yaml`n"
    $prompt += "5. Write story file to docs/implementation-artifacts/stories/epic-$EpicId/`n"
    $prompt += "6. Update sprint-status.yaml: '$sid' -> ready-for-dev`n`n"
    $prompt += "## Important`n"
    $prompt += "- Follow AGENTS.md rules`n"
    $prompt += "- Story must include explicit Acceptance Criteria`n"
    $prompt += "- Log: [CC-OPUS] [ISO-8601] created story $sid`n"
    return $prompt
}

function Build-DevStoryPrompt {
    param([PSCustomObject]$Story)
    $sid = $Story.Id
    $prompt = "You are GC-PRO, PCPT project execution agent.`n"
    $prompt += "Working directory: pcpt-PCPT-MVP project root.`n`n"
    $prompt += "## Task`nDevelop story '$sid' using dev-story workflow.`n`n"
    $prompt += "## Steps`n"
    $prompt += "1. Read sprint-status.yaml, confirm '$sid' status = ready-for-dev`n"
    $prompt += "2. Read docs/implementation-artifacts/stories/epic-$EpicId/$sid.md`n"
    $prompt += "3. Load _bmad/core/tasks/workflow.xml as core engine`n"
    $prompt += "4. Use _bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml`n"
    $prompt += "5. Implement all tasks and subtasks`n"
    $prompt += "6. Write unit tests`n"
    $prompt += "7. Verify tsc compiles and all tests pass`n"
    $prompt += "8. Update sprint-status.yaml: '$sid' -> review`n"
    $prompt += "9. Update story file status -> review`n`n"
    $prompt += "## Important`n"
    $prompt += "- Follow AGENTS.md rules`n"
    $prompt += "- Code must pass check-hygiene.ps1`n"
    $prompt += "- Log: [GC-PRO] [ISO-8601] dev-completed $sid`n"
    return $prompt
}

function Build-CodeReviewPrompt {
    param([PSCustomObject]$Story)
    $sid = $Story.Id
    $prompt = "You are CC-OPUS, performing adversarial code review.`n"
    $prompt += "Working directory: pcpt-PCPT-MVP project root.`n`n"
    $prompt += "## Task`nReview story '$sid' using code-review workflow.`n`n"
    $prompt += "## Steps`n"
    $prompt += "1. Read sprint-status.yaml, confirm '$sid' status = review`n"
    $prompt += "2. Read docs/implementation-artifacts/stories/epic-$EpicId/$sid.md`n"
    $prompt += "3. Load _bmad/core/tasks/workflow.xml as core engine`n"
    $prompt += "4. Use _bmad/bmm/workflows/4-implementation/code-review/workflow.yaml`n"
    $prompt += "5. Review all changed files`n"
    $prompt += "6. Classify issues: CRITICAL / HIGH / MEDIUM / LOW`n"
    $prompt += "7. Fix all CRITICAL and HIGH issues`n"
    $prompt += "8. Write CR report to docs/implementation-artifacts/reviews/epic-$EpicId/`n"
    $prompt += "9. If passed: update sprint-status.yaml -> done`n"
    $prompt += "10. If rejected: set status -> ready-for-dev with feedback`n`n"
    $prompt += "## Review Dimensions`n"
    $prompt += "- Security, Scalability, Observability, Data Consistency`n`n"
    $prompt += "## Important`n"
    $prompt += "- Follow AGENTS.md rules`n"
    $prompt += "- CR report must include Score (0-100)`n"
    $prompt += "- Log: [CC-OPUS] [ISO-8601] review-passed/rejected $sid`n"
    return $prompt
}

# ============================================================================
# Report & Notification
# ============================================================================

function Generate-Report {
    $duration = (Get-Date) - $StartTime
    $totalSec = [int]$duration.TotalSeconds
    $h = [math]::Floor($totalSec / 3600)
    $m = [math]::Floor(($totalSec % 3600) / 60)
    $s = $totalSec % 60
    $dur = ('{0}h {1}m {2}s') -f $h, $m, $s
    $now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $mode = 'Dry-Run'; if (-not $DryRun) { $mode = 'LIVE' }

    $sep = '|----------|---------|---------|---------|------|'
    $rpt = @()
    $rpt += "# EPIC $EpicId Auto-Pilot Report"
    $rpt += ""
    $rpt += "> Generated: $now"
    $rpt += "> Duration: $dur"
    $rpt += "> Mode: $mode"
    $rpt += "> Engines: Claude Code CLI ($ClaudeModel) + Gemini CLI ($GeminiModel)"
    $rpt += ""
    $rpt += "## Summary"
    $rpt += ""
    $rpt += "| Story ID | Start | End | Engine | Result |"
    $rpt += $sep

    foreach ($r in $script:StoryResults) {
        $rpt += "| $($r.StoryId) | $($r.StartStatus) | $($r.EndStatus) | $($r.Engine) | $($r.Result) |"
    }

    $total = $script:StoryResults.Count
    $ok = @($script:StoryResults | Where-Object { $_.Result -eq "OK" }).Count
    $fail = @($script:StoryResults | Where-Object { $_.Result -ne "OK" }).Count

    $rpt += ""
    $rpt += "## Stats"
    $rpt += "- Processed: $total"
    $rpt += "- Succeeded: $ok"
    $rpt += "- Failed: $fail"
    $rpt += ""
    $rpt += "## Log"
    $rpt += "Full log: $LogFile"

    $rpt -join "`r`n" | Out-File -FilePath $ReportFile -Encoding UTF8
    Write-Log "Report saved: $ReportFile" "OK"
}

function Send-Notification {
    param([string]$Title, [string]$Message)
    Write-Log "=== $Title ===" "OK"
    Write-Log $Message "OK"

    try {
        if (Get-Module -ListAvailable -Name BurntToast -ErrorAction SilentlyContinue) {
            Import-Module BurntToast
            New-BurntToastNotification -Text $Title, $Message
            return
        }
    }
    catch { }

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        $balloon = New-Object System.Windows.Forms.NotifyIcon
        $balloon.Icon = [System.Drawing.SystemIcons]::Information
        $balloon.BalloonTipIcon = "Info"
        $balloon.BalloonTipTitle = $Title
        $balloon.BalloonTipText = $Message
        $balloon.Visible = $true
        $balloon.ShowBalloonTip(10000)
        Start-Sleep -Seconds 2
        $balloon.Dispose()
    }
    catch { }
}

# ============================================================================
# Main Loop
# ============================================================================

function Main {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  PCPT Epic Auto-Pilot Orchestrator" -ForegroundColor Cyan
    $modeLabel = "LIVE"; if ($DryRun) { $modeLabel = "DRY-RUN" }
    Write-Host "  EPIC: $EpicId | Mode: $modeLabel" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""

    Initialize-Directories
    Write-Log "Auto-Pilot started | Epic: $EpicId | DryRun: $DryRun | MaxIter: $MaxIterations"

    if (-not (Test-Path $SprintStatusPath)) {
        Write-Log "ERROR: $SprintStatusPath not found" "ERROR"
        exit 1
    }

    if (-not $DryRun) {
        try { $null = Get-Command claude -ErrorAction Stop }
        catch { Write-Log "ERROR: 'claude' CLI not found" "ERROR"; exit 1 }
        try { $null = Get-Command gemini -ErrorAction Stop }
        catch { Write-Log "ERROR: 'gemini' CLI not found" "ERROR"; exit 1 }
    }

    $iteration = 0
    $reviewRetryCount = @{}
    $staleCount = @{}
    $maxStaleRetries = 3
    $processedInDryRun = @{}

    while ($iteration -lt $MaxIterations) {
        $iteration++
        Write-Log "--- Iteration $iteration / $MaxIterations ---" "PHASE"

        $allStories = Parse-SprintStatus -EpicKey $EpicId
        $pending = Get-PendingStories -Stories $allStories
        $doneCount = @($allStories | Where-Object { $_.Status -eq "done" }).Count
        $totalCount = $allStories.Count

        Write-Log "Stories: $doneCount/$totalCount done | Pending: $($pending.Count)"

        if ($pending.Count -eq 0) {
            Write-Log "All stories done! EPIC $EpicId complete!" "OK"
            break
        }

        $nextStory = Select-NextStory -Stories $allStories
        if ($null -eq $nextStory) {
            Write-Log "No actionable story found" "WARN"
            break
        }

        # Skip stories marked as processed-but-stuck (DryRun / stale)
        if ($processedInDryRun.ContainsKey($nextStory.Id)) {
            # Find next non-stuck story
            $allPending = @(Get-PendingStories -Stories $allStories)
            $foundNext = $false
            foreach ($candidate in $allPending) {
                if (-not $processedInDryRun.ContainsKey($candidate.Id)) {
                    $nextStory = $candidate
                    $foundNext = $true
                    break
                }
            }
            if (-not $foundNext) {
                Write-Log "All pending stories are stuck, stopping" "WARN"
                break
            }
        }

        $storyStartStatus = $nextStory.Status
        Write-Log "Selected: $($nextStory.Id) (status: $($nextStory.Status), P$($nextStory.Priority), $($nextStory.Complexity))"

        $engine = ""
        $result = $null

        switch ($nextStory.Status) {
            "backlog" {
                $engine = "CC-OPUS (create-story)"
                $prompt = Build-CreateStoryPrompt -Story $nextStory
                $result = Invoke-ClaudeCode -Prompt $prompt -TaskType "create-story"
            }
            "ready-for-dev" {
                $engine = "GC-PRO (dev-story)"
                $prompt = Build-DevStoryPrompt -Story $nextStory
                $result = Invoke-GeminiCLI -Prompt $prompt -TaskType "dev-story"
            }
            "in-progress" {
                $engine = "GC-PRO (dev-story resume)"
                $prompt = Build-DevStoryPrompt -Story $nextStory
                $result = Invoke-GeminiCLI -Prompt $prompt -TaskType "dev-story"
            }
            "review" {
                $engine = "CC-OPUS (code-review)"
                $prompt = Build-CodeReviewPrompt -Story $nextStory

                $retryKey = $nextStory.Id
                if (-not $reviewRetryCount.ContainsKey($retryKey)) {
                    $reviewRetryCount[$retryKey] = 0
                }
                $reviewRetryCount[$retryKey]++

                if ($reviewRetryCount[$retryKey] -gt $MaxReviewRetries) {
                    Write-Log "Story $($nextStory.Id) review exceeded $MaxReviewRetries retries" "ERROR"
                    $script:StoryResults += [PSCustomObject]@{
                        StoryId     = $nextStory.Id
                        StartStatus = $storyStartStatus
                        EndStatus   = "review (stuck)"
                        Engine      = $engine
                        Result      = "REVIEW_RETRY_EXCEEDED"
                    }
                    Send-Notification "Auto-Pilot: Story Stuck" "Story $($nextStory.Id) review failed after $MaxReviewRetries retries."
                    # Mark as processed to skip in future iterations
                    $processedInDryRun[$nextStory.Id] = $true
                    continue  # Skip to next iteration, try another story
                }

                $result = Invoke-ClaudeCode -Prompt $prompt -TaskType "code-review"
            }
            default {
                Write-Log "Unknown status: $($nextStory.Status), skipping $($nextStory.Id)" "WARN"
                continue
            }
        }

        if ($null -ne $result) {
            Start-Sleep -Seconds 3
            $updatedStories = Parse-SprintStatus -EpicKey $EpicId
            $updatedStory = $updatedStories | Where-Object { $_.Id -eq $nextStory.Id }
            $endStatus = "unknown"
            if ($updatedStory) { $endStatus = $updatedStory.Status }

            $resultStr = "OK"
            if (-not $result.Success) { $resultStr = "FAILED (exit: $($result.ExitCode))" }

            $script:StoryResults += [PSCustomObject]@{
                StoryId     = $nextStory.Id
                StartStatus = $storyStartStatus
                EndStatus   = $endStatus
                Engine      = $engine
                Result      = $resultStr
            }

            if (-not $result.Success) {
                Write-Log "Story $($nextStory.Id) FAILED! ExitCode: $($result.ExitCode)" "ERROR"
                if ($nextStory.Status -ne "review") {
                    Send-Notification "Auto-Pilot: Failed" "Story $($nextStory.Id) ($engine) failed."
                    break
                }
            }

            if ($endStatus -eq $storyStartStatus -and $result.Success) {
                Write-Log "WARNING: CLI reported success but sprint-status.yaml unchanged" "WARN"
                # Stale detection: track no-progress retries
                $staleKey = $nextStory.Id
                if (-not $staleCount.ContainsKey($staleKey)) { $staleCount[$staleKey] = 0 }
                $staleCount[$staleKey]++
                if ($staleCount[$staleKey] -ge $maxStaleRetries) {
                    Write-Log "Story $staleKey stuck after $maxStaleRetries attempts, skipping" "ERROR"
                    # In DryRun, mark as processed to avoid infinite loop
                    $processedInDryRun[$staleKey] = $true
                }
            }
            else {
                # Reset stale count on successful progress
                $staleCount[$nextStory.Id] = 0
            }
        }
    }

    if ($iteration -ge $MaxIterations) {
        Write-Log "Reached max iterations ($MaxIterations)" "WARN"
    }

    Generate-Report

    $totalProcessed = $script:StoryResults.Count
    $succeeded = @($script:StoryResults | Where-Object { $_.Result -eq "OK" }).Count
    Send-Notification "Epic Auto-Pilot Complete" "EPIC $EpicId | Processed: $totalProcessed | OK: $succeeded"

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Auto-Pilot Complete" -ForegroundColor Green
    Write-Host "  Report: $ReportFile" -ForegroundColor Green
    Write-Host "  Log: $LogFile" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
}

Main
