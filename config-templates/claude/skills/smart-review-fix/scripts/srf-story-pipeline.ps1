# ============================================================
# Smart Review-Fix Story Pipeline — Story-level wrapper
# Wraps story-pipeline-interactive.ps1 with SRF-specific logic:
#   Pre:  4B validation, tracking check, findings link
#   Core: story-pipeline-interactive.ps1 (untouched)
#   Post: dev-story auto-correct, tasks-backfill, findings verify
# ============================================================
# Usage:
#   .\srf-story-pipeline.ps1 -StoryId "fix7-04-admin-product-p1" -TimeoutMin 30
#   .\srf-story-pipeline.ps1 -StoryId "fix7-08-admin-auth-settings-p1" -FixMode 4B -TimeoutMin 30
#   .\srf-story-pipeline.ps1 -StoryId "fix7-01-admin-member-p1-security" -FixMode 4A -TimeoutMin 45
# ============================================================

param(
    [Parameter(Mandatory)]
    [string]$StoryId,

    [ValidateSet('4A', '4B')]
    [string]$FixMode = '4A',

    [int]$TimeoutMin = 45,

    [string]$EpicId = 'epic-fix7',

    [switch]$SkipDev,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# .claude/skills/smart-review-fix/scripts → 4 levels up to project root
$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
# PS 5.1 Join-Path only accepts 2 args — chain calls
$ScriptsDir = Join-Path (Join-Path $ProjectRoot '.context-db') 'scripts'
$CorePipeline = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $ProjectRoot '.claude') 'skills') 'claude-launcher-interactive') 'scripts') 'story-pipeline-interactive.ps1'
$VerifyScript = Join-Path $ScriptsDir 'verify-fixes-against-findings.js'
$QueryScript = Join-Path $ScriptsDir 'query-stories.js'
$TrackingDir = Join-Path (Join-Path (Join-Path $ProjectRoot 'docs') 'tracking') 'active'
# [tdb-2 2026-07-28] sprint-status.yaml 已凍結唯讀 — $SprintStatusPath 變數與 G1 的 YAML 回寫區塊
# 已於 code-review 階段移除(僅留註解不足以阻止執行;凍結檔不得有任何 active 寫入者)。
# 狀態唯一 SSoT = Context Memory DB stories 表(下方 G1 走 upsert-story.js)。

function Write-SrfLog {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'HH:mm:ss'
    $color = switch ($Level) {
        'OK'    { 'Green' }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red' }
        'PHASE' { 'Cyan' }
        'DB'    { 'DarkCyan' }
        default { 'White' }
    }
    Write-Host "[$ts] [SRF] " -ForegroundColor DarkGray -NoNewline
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

function Get-TaiwanTimestamp {
    return (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss+08:00')
}

function Get-StoryFromDb {
    param([string]$Id)
    try {
        $json = & node $QueryScript --story-id $Id --format json 2>$null
        if ($json) { return ($json | ConvertFrom-Json) }
    } catch { }
    return $null
}

function Get-StoryStatus {
    param([string]$Id)
    try {
        $savedDir = Get-Location
        Set-Location $ScriptsDir
        $result = & node -e "const D=require('better-sqlite3');const d=new D('../phycool.db');const r=d.prepare('SELECT status FROM stories WHERE story_id=?').get('$Id');console.log(r?r.status:'unknown');d.close();" 2>$null
        Set-Location $savedDir
        return $result.Trim()
    } catch {
        try { Set-Location $savedDir } catch { }
        return 'unknown'
    }
}

function Get-LinkedFindings {
    param([string]$Id)
    try {
        $savedDir = Get-Location
        Set-Location $ScriptsDir
        $result = & node -e "const D=require('better-sqlite3');const d=new D('../phycool.db');const r=d.prepare('SELECT id,title,file_path,fix_status FROM review_findings WHERE fix_story_id=?').all('$Id');console.log(JSON.stringify(r));d.close();" 2>$null
        Set-Location $savedDir
        if ($result) { return ($result | ConvertFrom-Json) }
    } catch {
        try { Set-Location $savedDir } catch { }
    }
    return @()
}

# ============================================================
# ZOMBIE WINDOW CLEANUP (post-pipeline utility)
# ============================================================
function Invoke-ZombieWindowCleanup {
    param([string]$StoryPattern)
    $zombies = @()
    try {
        $zombies = Get-Process powershell -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -match "Claude \[.+\] $StoryPattern" }
    } catch { }
    if ($zombies.Count -gt 0) {
        Write-SrfLog "ZOMBIE DETECT: $($zombies.Count) leftover window(s) for pattern '$StoryPattern'" 'WARN'
        foreach ($z in $zombies) {
            Write-SrfLog "  Killing zombie PID=$($z.Id) Title='$($z.MainWindowTitle)'" 'WARN'
            # Graceful: kill Claude child, let PS exit naturally
            try {
                Get-CimInstance Win32_Process -Filter "ParentProcessId = $($z.Id)" -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -notin @('powershell.exe','pwsh.exe') } |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            } catch { }
            $closed = $z.WaitForExit(8000)
            if (-not $closed -and -not $z.HasExited) {
                try { & taskkill /T /F /PID $z.Id 2>$null } catch { }
            }
        }
        return $zombies.Count
    }
    return 0
}

# ============================================================
# REPORT OBJECT
# ============================================================
$Report = @{
    StoryId       = $StoryId
    FixMode       = $FixMode
    EpicId        = $EpicId
    StartTime     = Get-Date
    PreFlight     = @{ Passed = $false; Errors = @() }
    CorePipeline  = @{ Status = 'pending'; Duration = '' }
    PostPipeline  = @{
        AutoCorrect     = 'N/A'
        TasksBackfill   = 'N/A'
        FindingsVerify  = 'N/A'
        TrackingSync    = 'N/A'
    }
    FinalStatus   = 'unknown'
}

Write-SrfLog ("=" * 60) 'PHASE'
Write-SrfLog "Smart Review-Fix Story Pipeline v1.1" 'PHASE'
Write-SrfLog "Story: $StoryId | Mode: $FixMode | Epic: $EpicId" 'PHASE'
Write-SrfLog "Timeout: ${TimeoutMin}min | DryRun: $DryRun" 'PHASE'
Write-SrfLog ("=" * 60) 'PHASE'

# ============================================================
# PRE-PIPELINE: Validation
# ============================================================
Write-SrfLog "--- PRE-PIPELINE VALIDATION ---" 'PHASE'

$trackingFile = Join-Path $TrackingDir "$StoryId.track.md"

# Check 1: Story exists in DB
$storyStatus = Get-StoryStatus -Id $StoryId
Write-SrfLog "DB Status: $storyStatus" 'DB'
if ($storyStatus -eq 'unknown') {
    $Report.PreFlight.Errors += "Story not found in DB"
}

# Check 2: Tracking file exists — auto-create if missing (FIX 2026-03-30)
# Missing tracking file causes auto-exit fallback (C) failure → sub-window hangs.
# Auto-create ensures pipeline never starts without a tracking file.
if (Test-Path $trackingFile) {
    Write-SrfLog "Tracking file: EXISTS" 'OK'
} else {
    Write-SrfLog "Tracking file: MISSING — auto-creating" 'WARN'
    $ts = Get-TaiwanTimestamp
    $trackContent = @"
# $StoryId

> Auto-created by SRF Pipeline pre-flight

## Status: $storyStatus
## Agent: CC-SONNET

### Timeline
- [SRF] $ts Pipeline pre-flight auto-created tracking file
"@
    try {
        $trackContent | Out-File -FilePath $trackingFile -Encoding utf8
        Write-SrfLog "Tracking file: AUTO-CREATED ($trackingFile)" 'OK'
    } catch {
        $Report.PreFlight.Errors += "Failed to auto-create tracking file: $_"
        Write-SrfLog "Tracking file: AUTO-CREATE FAILED ($_)" 'ERROR'
    }
}

# Check 3: Findings linked (fix_status = 'fixing')
$findings = Get-LinkedFindings -Id $StoryId
if ($findings.Count -gt 0) {
    Write-SrfLog "Linked findings: $($findings.Count) (ids: $(($findings | ForEach-Object { $_.id }) -join ', '))" 'DB'
} else {
    $Report.PreFlight.Errors += "No findings linked to story (review_findings.fix_story_id)"
    Write-SrfLog "Linked findings: NONE" 'WARN'
}

# Check 4 (4B only): Story must have tasks + affected_files
if ($FixMode -eq '4B') {
    Write-SrfLog "4B Pre-Flight: Validating required fields..." 'PHASE'

    try {
        $dbPath = Join-Path (Join-Path $ProjectRoot '.context-db') 'phycool.db'
        $storyFields = & node -e "
            const D=require('better-sqlite3');
            const d=new D('$($dbPath -replace '\\','/')');
            const r=d.prepare('SELECT tasks,affected_files,acceptance_criteria,dev_notes,discovery_source FROM stories WHERE story_id=?').get('$StoryId');
            console.log(JSON.stringify(r||{}));
            d.close();
        " 2>$null | ConvertFrom-Json

        $missingFields = @()
        if (-not $storyFields.tasks) { $missingFields += 'tasks' }
        if (-not $storyFields.affected_files) { $missingFields += 'affected_files' }
        if (-not $storyFields.acceptance_criteria) { $missingFields += 'acceptance_criteria' }
        if (-not $storyFields.dev_notes) { $missingFields += 'dev_notes' }

        if ($missingFields.Count -gt 0) {
            $Report.PreFlight.Errors += "4B missing fields: $($missingFields -join ', ')"
            Write-SrfLog "4B MISSING FIELDS: $($missingFields -join ', ')" 'ERROR'
        } else {
            Write-SrfLog "4B fields: ALL PRESENT (tasks, affected_files, AC, dev_notes)" 'OK'
        }

        # Check "4B Direct-Fix" marker
        if ($storyFields.discovery_source -and $storyFields.discovery_source -match '4B') {
            Write-SrfLog "4B marker: PRESENT in discovery_source" 'OK'
        } else {
            $Report.PreFlight.Errors += "4B marker missing in discovery_source"
            Write-SrfLog "4B marker: MISSING (discovery_source should contain '4B')" 'WARN'
        }
    } catch {
        $Report.PreFlight.Errors += "4B validation query failed: $_"
        Write-SrfLog "4B validation FAILED: $_" 'ERROR'
    }
}

# Pre-flight verdict
if ($Report.PreFlight.Errors.Count -eq 0) {
    $Report.PreFlight.Passed = $true
    Write-SrfLog "PRE-FLIGHT: ALL CHECKS PASSED" 'OK'
} else {
    Write-SrfLog "PRE-FLIGHT: $($Report.PreFlight.Errors.Count) ISSUES FOUND" 'WARN'
    foreach ($err in $Report.PreFlight.Errors) {
        Write-SrfLog "  - $err" 'WARN'
    }
    # Non-blocking warnings — pipeline continues but report tracks issues
    $Report.PreFlight.Passed = $true  # Warnings don't block, errors would set $false
    Write-SrfLog "PRE-FLIGHT: Continuing with warnings (non-blocking)" 'WARN'
}

# ============================================================
# CORE PIPELINE: story-pipeline-interactive.ps1
# ============================================================
Write-SrfLog "--- CORE PIPELINE ---" 'PHASE'

$statusBefore = Get-StoryStatus -Id $StoryId
$gitHashBefore = & git -C $ProjectRoot rev-parse HEAD 2>$null

if ($DryRun) {
    Write-SrfLog "[DRY-RUN] Would execute: story-pipeline-interactive.ps1 -StoryId $StoryId -TimeoutMin $TimeoutMin" 'WARN'
    $Report.CorePipeline.Status = 'dry-run'
} else {
    $pipelineStart = Get-Date

    # PS splatting requires hashtable for named params (not array)
    $pipelineArgs = @{ StoryId = $StoryId; TimeoutMin = $TimeoutMin }
    if ($SkipDev) { $pipelineArgs['SkipDev'] = $true }

    Write-SrfLog "Launching core pipeline... (timeout: ${TimeoutMin}min)"
    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue

    # ★ SRF Tracker: 寫入 SRF 批次進度追蹤
    $srfTrackerFile = Join-Path (Join-Path $ProjectRoot 'logs\review') "pipeline-active.json"
    try {
        $srfTracker = if (Test-Path $srfTrackerFile) {
            (Get-Content $srfTrackerFile -Raw -Encoding UTF8 | ConvertFrom-Json)
        } else { @() }
        if ($srfTracker -isnot [array]) { $srfTracker = @($srfTracker) }
        $srfTracker = @($srfTracker | Where-Object { $_.story_id -ne $StoryId })
        $srfTracker += @{
            story_id    = $StoryId
            phase       = "srf-$FixMode"
            pid         = $PID
            started_at  = (Get-TaiwanTimestamp)
            status      = 'running'
        }
        $srfTracker | ConvertTo-Json -Depth 3 | Out-File -FilePath $srfTrackerFile -Encoding UTF8 -Force
        Write-SrfLog "TRACKER: Registered SRF pipeline for $StoryId" 'OK'
    } catch {
        Write-SrfLog "TRACKER: Failed: $_" 'WARN'
    }

    try {
        & $CorePipeline @pipelineArgs
        $pipelineExit = $LASTEXITCODE
    } catch {
        $pipelineExit = 1
        Write-SrfLog "Core pipeline exception: $_" 'ERROR'
    }

    $pipelineDuration = (Get-Date) - $pipelineStart
    $Report.CorePipeline.Duration = "{0:hh\:mm\:ss}" -f $pipelineDuration
    $Report.CorePipeline.ExitCode = $pipelineExit
    Write-SrfLog "Core pipeline finished (exit: $pipelineExit, duration: $($Report.CorePipeline.Duration))"
}

# ============================================================
# POST-PIPELINE: Auto-Correct + Verify + Sync
# ============================================================
Write-SrfLog "--- POST-PIPELINE ---" 'PHASE'

$statusAfter = Get-StoryStatus -Id $StoryId
$gitHashAfter = & git -C $ProjectRoot rev-parse HEAD 2>$null
Write-SrfLog "Status after pipeline: $statusAfter" 'DB'

# ── G1 Fix: Dev-story auto-correct ──
if ($statusAfter -eq 'in-progress' -and -not $SkipDev) {
    Write-SrfLog "G1 CHECK: Status still 'in-progress' — checking git diff..." 'WARN'

    $gitDiff = & git -C $ProjectRoot diff --stat HEAD 2>$null
    $gitDiffStaged = & git -C $ProjectRoot diff --cached --stat 2>$null
    $hasChanges = ($gitDiff -and $gitDiff.Trim()) -or ($gitDiffStaged -and $gitDiffStaged.Trim())

    if ($hasChanges) {
        Write-SrfLog "G1 AUTO-CORRECT: Git diff found — updating DB to 'review'" 'WARN'
        try {
            $upsertScript = Join-Path $ScriptsDir 'upsert-story.js'
            & node $upsertScript --inline "{`"story_id`":`"$StoryId`",`"status`":`"review`"}" 2>$null
            $statusAfter = 'review'
            $Report.PostPipeline.AutoCorrect = 'APPLIED (in-progress -> review via git diff)'
            # [tdb-2 2026-07-28] 原此處另回寫 sprint-status.yaml；該檔已凍結唯讀,回寫區塊已移除。
            # DB(上方 upsert-story.js)為狀態唯一 SSoT。
        } catch {
            Write-SrfLog "G1 AUTO-CORRECT FAILED: $_" 'ERROR'
            $Report.PostPipeline.AutoCorrect = "FAILED: $_"
        }
    } else {
        Write-SrfLog "G1: No git diff — genuine failure, no auto-correct" 'ERROR'
        $Report.PostPipeline.AutoCorrect = 'SKIPPED (no git diff)'
    }
} elseif ($statusAfter -eq 'in-progress' -and $SkipDev) {
    Write-SrfLog "G1: Status in-progress with SkipDev — expected, no action" 'OK'
    $Report.PostPipeline.AutoCorrect = 'N/A (SkipDev)'
} else {
    $Report.PostPipeline.AutoCorrect = "N/A (status=$statusAfter)"
}

# ── If auto-corrected to review, re-run code-review ──
if ($Report.PostPipeline.AutoCorrect -match 'APPLIED' -and $statusAfter -eq 'review') {
    Write-SrfLog "G1: Auto-corrected to 'review' — relaunching code-review phase..." 'PHASE'

    try {
        & $CorePipeline -StoryId $StoryId -TimeoutMin $TimeoutMin -SkipDev
        $statusAfter = Get-StoryStatus -Id $StoryId
        Write-SrfLog "Code-review re-run complete. Status: $statusAfter" 'OK'
    } catch {
        Write-SrfLog "Code-review re-run failed: $_" 'ERROR'
    }
}

# ── G3 Fix: Tasks backfill check ──
$statusNow = Get-StoryStatus -Id $StoryId
if ($statusNow -eq 'done' -or $statusNow -eq 'review') {
    try {
        $dbPath = Join-Path (Join-Path $ProjectRoot '.context-db') 'phycool.db'
        $contextDbDir = Join-Path $ProjectRoot '.context-db'
        $tasksField = & node -e "
            const path=require('path');
            const D=require(path.resolve('$($contextDbDir -replace '\\','/')','node_modules','better-sqlite3'));
            const d=new D('$($dbPath -replace '\\','/')');
            const r=d.prepare('SELECT tasks FROM stories WHERE story_id=?').get('$StoryId');
            console.log(r && r.tasks ? r.tasks : 'EMPTY');
            d.close();
        " 2>$null

        if ($tasksField -match [char]0x2705) {  # ✅ character
            $checkCount = ([regex]::Matches($tasksField, [char]0x2705)).Count
            Write-SrfLog "G3: Tasks backfill verified ($checkCount tasks with checkmark)" 'OK'
            $Report.PostPipeline.TasksBackfill = "PASSED ($checkCount tasks)"
        } elseif ($tasksField -eq 'EMPTY' -or -not $tasksField) {
            Write-SrfLog "G3: Tasks field EMPTY — needs manual backfill by control center" 'ERROR'
            $Report.PostPipeline.TasksBackfill = 'FAILED (empty)'
        } else {
            Write-SrfLog "G3: Tasks field exists but no checkmarks — needs backfill" 'WARN'
            $Report.PostPipeline.TasksBackfill = 'NEEDS_BACKFILL'
        }
    } catch {
        Write-SrfLog "G3: Tasks check failed: $_" 'ERROR'
        $Report.PostPipeline.TasksBackfill = "ERROR: $_"
    }
} else {
    $Report.PostPipeline.TasksBackfill = "SKIPPED (status=$statusNow)"
}

# ── Findings verify ──
$statusNow = Get-StoryStatus -Id $StoryId
if ($statusNow -eq 'done') {
    $linkedFindings = Get-LinkedFindings -Id $StoryId
    $fixingCount = ($linkedFindings | Where-Object { $_.fix_status -eq 'fixing' }).Count
    $fixedCount = ($linkedFindings | Where-Object { $_.fix_status -eq 'fixed' }).Count

    if ($fixingCount -gt 0) {
        Write-SrfLog "FINDINGS: $fixingCount still 'fixing' — needs Phase 5 verification by control center" 'WARN'
        $Report.PostPipeline.FindingsVerify = "PENDING ($fixingCount fixing, $fixedCount fixed)"
    } elseif ($fixedCount -gt 0) {
        Write-SrfLog "FINDINGS: All $fixedCount already 'fixed'" 'OK'
        $Report.PostPipeline.FindingsVerify = "DONE ($fixedCount fixed)"
    } else {
        Write-SrfLog "FINDINGS: No linked findings found" 'WARN'
        $Report.PostPipeline.FindingsVerify = "NO_FINDINGS"
    }
} else {
    $Report.PostPipeline.FindingsVerify = "SKIPPED (status=$statusNow)"
}

# ── G4 Skill Sync Check ──
$statusNow = Get-StoryStatus -Id $StoryId
$Report.PostPipeline | Add-Member -NotePropertyName 'SkillSync' -NotePropertyValue 'N/A' -Force
if ($statusNow -eq 'done') {
    try {
        $skillSyncScript = Join-Path $ScriptsDir 'skill-sync-check.cjs'
        if (Test-Path $skillSyncScript) {
            $savedDir = Get-Location
            Set-Location $ScriptsDir
            $syncResult = & node skill-sync-check.cjs --story-id $StoryId 2>$null
            Set-Location $savedDir
            if ($syncResult) {
                $syncJson = $syncResult | ConvertFrom-Json
                if ($syncJson.status -eq 'SYNC_NEEDED') {
                    $skillCount = $syncJson.affected.Count
                    $skillNames = ($syncJson.affected | ForEach-Object { $_.skill }) -join ', '
                    Write-SrfLog "G4 SKILL SYNC: $skillCount skills affected ($skillNames) — control center should run /saas-to-skill" 'WARN'
                    $Report.PostPipeline.SkillSync = "SYNC_NEEDED (${skillCount}: ${skillNames})"
                } else {
                    Write-SrfLog "G4 SKILL SYNC: OK (no affected skills)" 'OK'
                    $Report.PostPipeline.SkillSync = 'OK'
                }
            }
        }
    } catch {
        Write-SrfLog "G4 Skill sync check failed: $_" 'WARN'
        $Report.PostPipeline.SkillSync = "ERROR: $_"
    }
} else {
    $Report.PostPipeline.SkillSync = "SKIPPED (status=$statusNow)"
}

# ── Tracking file sync ──
if (Test-Path $trackingFile) {
    $Report.PostPipeline.TrackingSync = 'EXISTS'
    Write-SrfLog "Tracking file: EXISTS" 'OK'
} else {
    $Report.PostPipeline.TrackingSync = 'MISSING'
    Write-SrfLog "Tracking file: MISSING — control center must create" 'WARN'
}

# ── Zombie window cleanup ──
$Report.PostPipeline | Add-Member -NotePropertyName 'ZombieWindows' -NotePropertyValue 0 -Force
$zombieCount = Invoke-ZombieWindowCleanup -StoryPattern $StoryId
$Report.PostPipeline.ZombieWindows = $zombieCount
if ($zombieCount -gt 0) {
    Write-SrfLog "ZOMBIE CLEANUP: $zombieCount window(s) cleaned" 'WARN'
} else {
    Write-SrfLog "ZOMBIE CHECK: No leftover windows" 'OK'
}

# ============================================================
# FINAL REPORT
# ============================================================
$Report.FinalStatus = Get-StoryStatus -Id $StoryId
$totalDuration = (Get-Date) - $Report.StartTime

Write-Host ""
Write-SrfLog ("=" * 60) 'PHASE'
Write-SrfLog "SRF STORY PIPELINE REPORT: $StoryId" 'PHASE'
Write-SrfLog ("=" * 60) 'PHASE'
Write-SrfLog "Fix Mode      : $FixMode"
Write-SrfLog "Total Duration: $("{0:hh\:mm\:ss}" -f $totalDuration)"
Write-SrfLog "Final Status  : $($Report.FinalStatus)"
Write-SrfLog ""
Write-SrfLog "Pre-Flight    : $(if ($Report.PreFlight.Passed) { 'PASSED' } else { 'FAILED' }) ($($Report.PreFlight.Errors.Count) warnings)"
Write-SrfLog "Core Pipeline : $($Report.CorePipeline.Status) ($($Report.CorePipeline.Duration))"
Write-SrfLog "Auto-Correct  : $($Report.PostPipeline.AutoCorrect)"
Write-SrfLog "Tasks Backfill: $($Report.PostPipeline.TasksBackfill)"
Write-SrfLog "Findings      : $($Report.PostPipeline.FindingsVerify)"
Write-SrfLog "Skill Sync    : $($Report.PostPipeline.SkillSync)"
Write-SrfLog "Zombie Windows: $($Report.PostPipeline.ZombieWindows)"
Write-SrfLog "Tracking      : $($Report.PostPipeline.TrackingSync)"

# Actions needed by control center
$actions = @()
if ($Report.PostPipeline.TasksBackfill -match 'NEEDS_BACKFILL|FAILED') {
    $actions += "RUN /tasks-backfill-verify $StoryId"
}
if ($Report.PostPipeline.FindingsVerify -match 'PENDING') {
    $actions += "RUN verify-fixes-against-findings.js --epic $EpicId --verify <ids> --status fixed"
}
if ($Report.PostPipeline.TrackingSync -eq 'MISSING') {
    $actions += "CREATE tracking file: $trackingFile"
}
if ($Report.FinalStatus -ne 'done') {
    $actions += "INVESTIGATE: Final status '$($Report.FinalStatus)' (expected 'done')"
}
if ($Report.PostPipeline.SkillSync -match 'SYNC_NEEDED') {
    $actions += "RUN /saas-to-skill Mode B for affected skills: $($Report.PostPipeline.SkillSync)"
}

if ($actions.Count -gt 0) {
    Write-SrfLog ""
    Write-SrfLog "ACTIONS REQUIRED BY CONTROL CENTER:" 'WARN'
    foreach ($a in $actions) {
        Write-SrfLog "  -> $a" 'WARN'
    }
}

Write-SrfLog ("=" * 60) 'PHASE'

# Output result code
if ($Report.FinalStatus -eq 'done') {
    Write-SrfLog "RESULT: Story $StoryId completed successfully!" 'OK'
    exit 0
} else {
    Write-SrfLog "RESULT: Story $StoryId needs attention (status: $($Report.FinalStatus))" 'WARN'
    exit 1
}
