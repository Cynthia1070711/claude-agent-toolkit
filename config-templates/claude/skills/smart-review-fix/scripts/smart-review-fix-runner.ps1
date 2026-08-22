# ============================================================
# Smart Review-Fix Pipeline — 全流程協調器
# 整合 review-batch.ps1 + story-pipeline-interactive.ps1
# ============================================================
# Usage:
#   .\smart-review-fix-runner.ps1 -Mode full -Modules "editor-core,admin-auth" -TimeoutMin 120
#   .\smart-review-fix-runner.ps1 -Mode review -Modules "all" -PlanId "srf-20260323"
#   .\smart-review-fix-runner.ps1 -Mode fix -EpicId "epic-fix9" -MaxConcurrent 3
#   .\smart-review-fix-runner.ps1 -Mode verify -EpicId "epic-fix9"
#   .\smart-review-fix-runner.ps1 -Mode report -EpicId "epic-fix9"
# ============================================================

param(
    [Parameter(Mandatory)]
    [ValidateSet('full', 'review', 'analyze', 'fix', 'direct-fix', 'verify', 'report')]
    [string]$Mode,

    [string]$Modules = '',
    [string]$EpicId = '',
    [string]$PlanId = '',
    [int]$MaxConcurrent = 3,
    [int]$TimeoutMin = 45,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ScriptsDir = Join-Path $ProjectRoot '.context-db' 'scripts'
$ReviewScriptsDir = Join-Path $ProjectRoot '.claude' 'skills' 'phycool-review-analyst' 'scripts'
$PipelineScript = Join-Path $ProjectRoot '.claude' 'skills' 'claude-launcher-interactive' 'scripts' 'story-pipeline-interactive.ps1'

function Write-Log {
    param([string]$Message, [string]$Color = 'White')
    $ts = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$ts] " -ForegroundColor DarkGray -NoNewline
    Write-Host $Message -ForegroundColor $Color
}

function Get-TaiwanTimestamp {
    return (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss+08:00')
}

# ──── Auto-generate Plan ID if not provided ────
if (-not $PlanId) {
    $PlanId = "srf-$(Get-Date -Format 'yyyyMMdd')"
}

Write-Log "Smart Review-Fix Pipeline v1.0" Cyan
Write-Log "Mode: $Mode | Plan: $PlanId | Epic: $EpicId" Cyan
Write-Log "Concurrent: $MaxConcurrent | Timeout: ${TimeoutMin}min | DryRun: $DryRun" Cyan
Write-Log ("=" * 60) DarkGray

# ============================================================
# Phase 1: Review (Mode: full, review)
# ============================================================
function Invoke-ReviewPhase {
    Write-Log "Phase 1: Full-Spectrum Review" Yellow

    $moduleList = if ($Modules -eq 'all' -or -not $Modules) {
        @('editor-core', 'datasource', 'image-asset', 'auth', 'dashboard',
          'pdf-engine', 'payment-subscription', 'business-api',
          'admin-auth', 'admin-member', 'admin-product', 'admin-order',
          'admin-content', 'admin-settings', 'admin-reports', 'admin-templates')
    } else {
        $Modules -split ','
    }

    # Build task list: each module x code + security
    $tasks = @()
    foreach ($mod in $moduleList) {
        $tasks += "$($mod.Trim()):code"
        $tasks += "$($mod.Trim()):security"
    }

    # E2E tasks added separately (max 1 concurrent)
    $e2eTasks = @()
    foreach ($mod in $moduleList) {
        $e2eTasks += "$($mod.Trim()):e2e"
    }

    $reviewBatch = Join-Path $ReviewScriptsDir 'review-batch.ps1'

    if ($DryRun) {
        Write-Log "[DRY-RUN] Would launch review-batch.ps1 with $($tasks.Count) code/security tasks + $($e2eTasks.Count) E2E tasks" Magenta
        return
    }

    # Launch code + security batch
    Write-Log "Launching $($tasks.Count) code+security tasks (max $MaxConcurrent concurrent)..." Green
    $tasksStr = $tasks -join ','
    & $reviewBatch -PlanId $PlanId -Tasks $tasksStr -MaxConcurrent $MaxConcurrent -TimeoutMin $TimeoutMin

    # Launch E2E batch (sequential)
    if ($e2eTasks.Count -gt 0) {
        Write-Log "Launching $($e2eTasks.Count) E2E tasks (sequential)..." Green
        $e2eStr = $e2eTasks -join ','
        & $reviewBatch -PlanId $PlanId -Tasks $e2eStr -MaxConcurrent 1 -TimeoutMin $TimeoutMin -LaunchMode 'interactive'
    }

    # Cross-compare
    Write-Log "Running cross-engine comparison..." Green
    node (Join-Path $ScriptsDir 'review-db-writer.js') --cross-compare $PlanId

    # Stats
    Write-Log "Review Phase complete. Statistics:" Green
    node (Join-Path $ScriptsDir 'review-db-writer.js') --stats --plan $PlanId
}

# ============================================================
# Phase 2-3: Analyze + Create (Mode: full, analyze)
# ============================================================
function Invoke-AnalyzePhase {
    Write-Log "Phase 2-3: Analyze & Create Stories" Yellow

    # Summary
    Write-Log "Querying open findings..." Green
    node (Join-Path $ScriptsDir 'group-findings-to-stories.js') --plan $PlanId --summary

    # Auto-detect epic ID (C5 fix: use script-scope variable)
    if (-not $script:EpicId) {
        $script:EpicId = (node (Join-Path $ScriptsDir 'group-findings-to-stories.js') --next-epic-id 2>&1).Trim()
        Write-Log "Auto-assigned Epic ID: $script:EpicId" Cyan
    }

    # Preview grouping
    Write-Log "Story grouping preview:" Green
    node (Join-Path $ScriptsDir 'group-findings-to-stories.js') --plan $PlanId --epic $script:EpicId --group

    if ($DryRun) {
        Write-Log "[DRY-RUN] Would create Stories for $script:EpicId" Magenta
        return
    }

    # Create Stories
    Write-Log "Creating Stories..." Green
    node (Join-Path $ScriptsDir 'group-findings-to-stories.js') --plan $PlanId --epic $script:EpicId --create

    # Link findings
    Write-Log "Linking findings to Stories..." Green
    node (Join-Path $ScriptsDir 'group-findings-to-stories.js') --plan $PlanId --epic $script:EpicId --link

    Write-Log "Phase 2-3 complete. Stories created in $script:EpicId" Green
}

# ============================================================
# Phase 4: Fix Pipeline (Mode: full, fix)
# ============================================================
function Invoke-FixPhase {
    Write-Log "Phase 4: Fix Pipeline" Yellow

    if (-not $script:EpicId) {
        Write-Log "Error: -EpicId required for fix phase" Red
        return
    }

    # C1 fix: Query stories using a temp .cjs file (avoids ESM/CJS conflict)
    $dbPath = (Join-Path $ProjectRoot '.context-db' 'phycool.db') -replace '\\', '/'
    $tmpCjs = Join-Path $env:TEMP "srf-query-$(Get-Random).cjs"
    @"
const Database = require('better-sqlite3');
const db = new Database('$dbPath');
const rows = db.prepare("SELECT story_id, status, complexity, priority FROM stories WHERE epic_id = ? AND status IN ('backlog','ready-for-dev','in-progress') ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, CASE complexity WHEN 'S' THEN 0 WHEN 'M' THEN 1 WHEN 'L' THEN 2 ELSE 3 END").all('$($script:EpicId)');
db.close();
console.log(JSON.stringify(rows));
"@ | Out-File -FilePath $tmpCjs -Encoding utf8

    try {
        $stories = node $tmpCjs 2>$null | ConvertFrom-Json
    } finally {
        Remove-Item $tmpCjs -ErrorAction SilentlyContinue
    }

    if (-not $stories -or $stories.Count -eq 0) {
        Write-Log "No pending stories found for $($script:EpicId)" Yellow
        return
    }

    Write-Log "Found $($stories.Count) stories to fix" Green

    if ($DryRun) {
        foreach ($s in $stories) {
            Write-Log "[DRY-RUN] Would launch: $($s.story_id) ($($s.complexity), $($s.priority))" Magenta
        }
        return
    }

    # Dynamic scheduling: launch up to MaxConcurrent, backfill slots
    $queue = [System.Collections.Queue]::new()
    foreach ($s in $stories) { $queue.Enqueue($s.story_id) }

    $running = @{}
    $completed = [System.Collections.ArrayList]::new()
    $slotDelay = 0

    while ($queue.Count -gt 0 -or $running.Count -gt 0) {
        # Fill empty slots
        while ($running.Count -lt $MaxConcurrent -and $queue.Count -gt 0) {
            $sid = $queue.Dequeue()
            $slotDelay += 10

            Write-Log "Launching: $sid (delay: ${slotDelay}s)" Green

            Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
            $job = Start-Job -ScriptBlock {
                param($script, $sid, $delay, $timeout, $root)
                Start-Sleep $delay
                Set-Location $root
                & $script -StoryId $sid -TimeoutMin $timeout
            } -ArgumentList $PipelineScript, $sid, $slotDelay, $TimeoutMin, $ProjectRoot

            $running[$sid] = $job
        }

        # Check completed jobs
        Start-Sleep -Seconds 30
        $doneKeys = @()
        foreach ($kv in $running.GetEnumerator()) {
            if ($kv.Value.State -eq 'Completed' -or $kv.Value.State -eq 'Failed') {
                $doneKeys += $kv.Key
                [void]$completed.Add($kv.Key)
                $color = if ($kv.Value.State -eq 'Completed') { 'Green' } else { 'Red' }
                Write-Log "$($kv.Key) -> $($kv.Value.State) [$($completed.Count)/$($completed.Count + $queue.Count + $running.Count - $doneKeys.Count)]" $color
                Remove-Job $kv.Value -Force
            }
        }
        foreach ($k in $doneKeys) { $running.Remove($k) }
    }

    Write-Log "Phase 4 complete. $($completed.Count) stories processed" Green
}

# ============================================================
# Phase 5: Verify (Mode: full, verify)
# ============================================================
function Invoke-VerifyPhase {
    Write-Log "Phase 5: Verify & Backfill" Yellow

    if (-not $script:EpicId) {
        Write-Log "Error: -EpicId required for verify phase" Red
        return
    }

    # Prepare verification list
    node (Join-Path $ScriptsDir 'verify-fixes-against-findings.js') --epic $script:EpicId --prepare

    Write-Log "Verification list prepared. Agent must now Read each file:line and verify." Cyan
    Write-Log "After verification, run: --batch-verify --input <results.json>" Cyan
}

# ============================================================
# Report (Mode: report)
# ============================================================
function Invoke-ReportPhase {
    Write-Log "Generating Report" Yellow

    if (-not $script:EpicId) {
        Write-Log "Error: -EpicId required for report" Red
        return
    }

    node (Join-Path $ScriptsDir 'verify-fixes-against-findings.js') --epic $script:EpicId --stats
    node (Join-Path $ScriptsDir 'verify-fixes-against-findings.js') --epic $script:EpicId --remaining
}

# ============================================================
# Main Router
# ============================================================
switch ($Mode) {
    'full' {
        Invoke-ReviewPhase
        Write-Log ("=" * 60) DarkGray
        Invoke-AnalyzePhase
        Write-Log ("=" * 60) DarkGray
        Write-Log "Phase 2 requires user confirmation. Pausing for interactive review." Yellow
        Write-Log "After confirming Story plan, re-run with: -Mode fix -EpicId $($script:EpicId)" Cyan
    }
    'review' {
        Invoke-ReviewPhase
    }
    'analyze' {
        Invoke-AnalyzePhase
    }
    'fix' {
        Invoke-FixPhase
    }
    'verify' {
        Invoke-VerifyPhase
    }
    'report' {
        Invoke-ReportPhase
    }
}

Write-Log ("=" * 60) DarkGray
Write-Log "Smart Review-Fix Pipeline completed: $Mode" Cyan
Write-Log "Timestamp: $(Get-TaiwanTimestamp)" DarkGray
