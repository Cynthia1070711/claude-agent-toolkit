<#
.SYNOPSIS
  Epic README auto-generator from sprint-status.yaml + epic-config.yaml
.DESCRIPTION
  TRS-17: Transforms Epic README.md from manual maintenance to auto-generated derived view.
  Triggered by Claude Code PostToolUse Hook when sprint-status.yaml is updated.
.NOTES
  Created: 2026-02-25
  No external dependencies, uses PowerShell built-in regex to parse YAML
#>

param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ToolInput = $env:TOOL_INPUT,
    [switch]$Force
)

# --- 1. Hook filter: only run when sprint-status.yaml changes ---
if (-not $Force) {
    if ($ToolInput -and $ToolInput -notmatch 'sprint-status\.yaml') {
        exit 0
    }
}

$storiesDir = Join-Path $ProjectRoot "docs\implementation-artifacts\stories"
$sprintStatusPath = Join-Path $ProjectRoot "docs\implementation-artifacts\sprint-status.yaml"

if (-not (Test-Path $sprintStatusPath)) {
    Write-Error "sprint-status.yaml not found: $sprintStatusPath"
    exit 1
}

$sprintLines = [System.IO.File]::ReadAllLines($sprintStatusPath, [System.Text.UTF8Encoding]::new($false))

# --- 2. Parse sprint-status.yaml ---
$storyStatuses = @{}
$storyCRMeta = @{}

foreach ($line in $sprintLines) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    if ($line -match '^\s*(generated|project|project_key|tracking_system|story_location|development_status)\s*:') { continue }
    if ($line -match '^\s*epic-\w+:\s') { continue }

    if ($line -match '^\s+([\w-]+):\s+([\w-]+)') {
        $storyKey = $Matches[1]
        $status = $Matches[2]
        $storyStatuses[$storyKey] = $status

        $crScore = $null
        if ($line -match 'CR\s*(?:Score|R\d?)\s*:?\s*(\d+)') {
            $crScore = $Matches[1]
        }
        elseif ($line -match 'CR\s+R(\d):(\d+)') {
            $crScore = $Matches[2]
        }
        elseif ($line -match 'R\d\s+Score:(\d+)') {
            $crScore = $Matches[1]
        }
        elseif ($line -match 'Score:(\d+)') {
            $crScore = $Matches[1]
        }

        $testCount = $null
        if ($line -match '(\d+)\s*tests') {
            $testCount = $Matches[1]
        }

        $deferred = $null
        if ($line -match 'Deferred') { $deferred = $true }

        $comment = $null
        if ($line -match '#\s*(.+)$') { $comment = $Matches[1].Trim() }

        $storyCRMeta[$storyKey] = @{
            CRScore   = $crScore
            TestCount = $testCount
            Deferred  = $deferred
            Comment   = $comment
        }
    }
}

# --- 3. Scan all epic-config.yaml ---
$epicConfigs = Get-ChildItem -Path $storiesDir -Filter "epic-config.yaml" -Recurse

foreach ($configFile in $epicConfigs) {
    $epicDir = $configFile.DirectoryName
    $configLines = [System.IO.File]::ReadAllLines($configFile.FullName, [System.Text.UTF8Encoding]::new($false))
    $readmePath = Join-Path $epicDir "README.md"

    # --- 3.1 Parse epic header ---
    $epicId = ""
    $epicTitle = ""
    $epicCreated = ""
    $epicSource = ""
    $epicObjective = ""
    $epicScope = ""
    $epicDependencies = ""

    foreach ($cline in $configLines) {
        if ($cline -match '^epic:\s*(.+)') { $epicId = $Matches[1].Trim() }
        if ($cline -match '^title:\s*"?([^"]+)"?') { $epicTitle = $Matches[1].Trim() }
        if ($cline -match '^created:\s*"?([^"]+)"?') { $epicCreated = $Matches[1].Trim() }
        if ($cline -match '^source:\s*"?([^"]+)"?') { $epicSource = $Matches[1].Trim() }
        if ($cline -match '^objective:\s*"?([^"]+)"?') { $epicObjective = $Matches[1].Trim() }
        if ($cline -match '^scope:\s*"?([^"]+)"?') { $epicScope = $Matches[1].Trim() }
        if ($cline -match '^dependencies:\s*"?([^"]+)"?') { $epicDependencies = $Matches[1].Trim() }
    }

    # --- 3.2 Parse stories metadata ---
    $storyMeta = @{}
    $inStories = $false
    $currentStoryKey = $null

    foreach ($cline in $configLines) {
        if ($cline -match '^stories:') { $inStories = $true; continue }
        if ($cline -match '^phases:' -or $cline -match '^strategies:' -or $cline -match '^risks:') { $inStories = $false; continue }

        if ($inStories) {
            if ($cline -match '^\s{2}([\w-]+):$') {
                $currentStoryKey = $Matches[1]
                $storyMeta[$currentStoryKey] = @{ title = ""; complexity = ""; priority = "" }
            }
            elseif ($currentStoryKey) {
                if ($cline -match '^\s+title:\s*"?([^"]+)"?') { $storyMeta[$currentStoryKey].title = $Matches[1].Trim() }
                if ($cline -match '^\s+complexity:\s*(\S+)') { $storyMeta[$currentStoryKey].complexity = $Matches[1] }
                if ($cline -match '^\s+priority:\s*(\S+)') { $storyMeta[$currentStoryKey].priority = $Matches[1] }
            }
        }
    }

    # --- 3.3 Parse phases/groups ---
    $phases = [System.Collections.ArrayList]::new()
    $inPhases = $false
    $inStrategies = $false
    $inRisks = $false
    $currentPhase = $null
    $currentGroup = $null
    $strategies = [System.Collections.ArrayList]::new()
    $risks = [System.Collections.ArrayList]::new()
    $currentStrategy = $null
    $strategyContent = ""

    foreach ($cline in $configLines) {
        if ($cline -match '^phases:') { $inPhases = $true; $inStrategies = $false; $inRisks = $false; continue }
        if ($cline -match '^strategies:') { $inPhases = $false; $inStrategies = $true; $inRisks = $false; continue }
        if ($cline -match '^risks:') { $inPhases = $false; $inStrategies = $false; $inRisks = $true; continue }

        if ($inPhases) {
            if ($cline -match '^\s{2}- id:\s*(\S+)') {
                if ($currentPhase) {
                    if ($currentGroup) { [void]$currentPhase.groups.Add($currentGroup); $currentGroup = $null }
                    [void]$phases.Add($currentPhase)
                }
                $currentPhase = @{ id = $Matches[1]; name = ""; priority = ""; groups = [System.Collections.ArrayList]::new() }
            }
            elseif ($cline -match '^\s{4}name:\s*"?([^"]+)"?') {
                if ($currentPhase) { $currentPhase.name = $Matches[1].Trim() }
            }
            elseif ($cline -match '^\s{4}priority:\s*(\S+)') {
                if ($currentPhase) { $currentPhase.priority = $Matches[1] }
            }
            elseif ($cline -match '^\s{6}- id:\s*(\S+)') {
                if ($currentGroup -and $currentPhase) { [void]$currentPhase.groups.Add($currentGroup) }
                $currentGroup = @{ id = $Matches[1]; name = ""; parallel = $false; stories = @(); dependencies = @{} }
            }
            elseif ($cline -match '^\s{8}name:\s*"?([^"]+)"?') {
                if ($currentGroup) { $currentGroup.name = $Matches[1].Trim() }
            }
            elseif ($cline -match '^\s{8}parallel:\s*true') {
                if ($currentGroup) { $currentGroup.parallel = $true }
            }
            elseif ($cline -match '^\s{8}stories:\s*\[([^\]]+)\]') {
                if ($currentGroup) {
                    $currentGroup.stories = $Matches[1] -split ',\s*' | ForEach-Object { $_.Trim() }
                }
            }
            elseif ($cline -match '^\s{10}([\w-]+):\s*\[([^\]]+)\]') {
                if ($currentGroup) {
                    $depKey = $Matches[1]
                    $depVals = $Matches[2] -split ',\s*' | ForEach-Object { $_.Trim() }
                    $currentGroup.dependencies[$depKey] = $depVals
                }
            }
        }

        if ($inStrategies) {
            if ($cline -match '^\s{2}- title:\s*"?([^"]+)"?') {
                if ($currentStrategy) {
                    [void]$strategies.Add(@{ title = $currentStrategy; content = $strategyContent.TrimEnd() })
                }
                $currentStrategy = $Matches[1].Trim()
                $strategyContent = ""
            }
            elseif ($cline -match '^\s{4}content:\s*\|') {
                # multi-line content start
            }
            elseif ($currentStrategy -and $cline -match '^\s{6}(.+)') {
                $strategyContent += $Matches[1] + "`n"
            }
        }

        if ($inRisks) {
            if ($cline -match '^\s{2}-\s*"?([^"]+)"?') {
                [void]$risks.Add($Matches[1].Trim('"'))
            }
        }
    }

    # Flush last phase/group/strategy
    if ($currentGroup -and $currentPhase) { [void]$currentPhase.groups.Add($currentGroup) }
    if ($currentPhase) { [void]$phases.Add($currentPhase) }
    if ($currentStrategy) { [void]$strategies.Add(@{ title = $currentStrategy; content = $strategyContent.TrimEnd() }) }

    # --- 4. Status calculation ---
    # Emoji constants (use ConvertFromUtf32 for code points > U+FFFF)
    $E_DONE = [char]0x2705           # checkmark
    $E_REVIEW = [char]::ConvertFromUtf32(0x1F7E0)   # orange circle
    $E_READY = [char]::ConvertFromUtf32(0x1F7E2)    # green circle
    $E_PROGRESS = [char]::ConvertFromUtf32(0x1F535)  # blue circle
    $E_CANCEL = [char]0x274C         # red X
    $E_SUPERSEDED = [char]0x23ED     # skip
    $E_SPLIT = [char]0x2702          # scissors
    $E_YELLOW = [char]::ConvertFromUtf32(0x1F7E1)    # yellow circle
    $E_GREEN = [char]::ConvertFromUtf32(0x1F7E2)     # green circle
    $E_WARN = [char]0x26A0           # warning

    function Get-StatusEmoji($s) {
        switch ($s) {
            'done' { return $E_DONE }
            'review' { return $E_REVIEW }
            'ready-for-dev' { return $E_READY }
            'in-progress' { return $E_PROGRESS }
            'cancelled' { return $E_CANCEL }
            'superseded' { return $E_SUPERSEDED }
            'split' { return $E_SPLIT }
            default { return $E_PROGRESS }
        }
    }

    function Get-DoneTypeEmoji($stKey) {
        $st = $storyStatuses[$stKey]
        if ($st -ne 'done') { return "" }
        $m = $storyCRMeta[$stKey]
        if ($m -and $m.Deferred) { return $E_YELLOW }
        return $E_GREEN
    }

    # Global counts
    $totalStories = 0
    $doneCount = 0; $reviewCount = 0; $readyCount = 0
    $inProgressCount = 0; $backlogCount = 0; $cancelledCount = 0
    $p0Count = 0; $p1Count = 0; $p2Count = 0

    foreach ($sk in $storyMeta.Keys) {
        $totalStories++
        $st = $storyStatuses[$sk]
        if (-not $st) { $st = 'backlog' }
        switch ($st) {
            'done' { $doneCount++ }
            'review' { $reviewCount++ }
            'ready-for-dev' { $readyCount++ }
            'in-progress' { $inProgressCount++ }
            'cancelled' { $cancelledCount++ }
            'superseded' { $cancelledCount++ }
            default { $backlogCount++ }
        }
        switch ($storyMeta[$sk].priority) {
            'P0' { $p0Count++ }
            'P1' { $p1Count++ }
            'P2' { $p2Count++ }
        }
    }

    function Get-GroupStats($grp) {
        $tot = $grp.stories.Count
        $dn = 0; $cn = 0; $hasDef = $false
        foreach ($s in $grp.stories) {
            $st = $storyStatuses[$s]
            if ($st -eq 'done') { $dn++ }
            if ($st -eq 'cancelled') { $cn++ }
            $m = $storyCRMeta[$s]
            if ($m -and $m.Deferred) { $hasDef = $true }
        }
        $eff = $tot - $cn
        $allDn = ($dn -eq $eff -and $eff -gt 0)
        return @{ Total = $tot; Done = $dn; Cancelled = $cn; AllDone = $allDn; HasDeferred = $hasDef }
    }

    function Get-GroupLabel($gs) {
        if ($gs.AllDone -and $gs.HasDeferred) { return "$E_YELLOW Done" }
        if ($gs.AllDone) { return "$E_GREEN Done" }
        if ($gs.Done -gt 0) { return "$E_PROGRESS ($($gs.Done)/$($gs.Total - $gs.Cancelled))" }
        return ""
    }

    # --- 5. Generate Markdown ---
    $sb = [System.Text.StringBuilder]::new()
    $nl = [Environment]::NewLine

    # Helper: append line
    function A($text) { [void]$sb.AppendLine($text) }

    A "<!-- Auto-generated by scripts/sync-epic-readme.ps1 - DO NOT EDIT MANUALLY -->"
    A "<!-- Sources: sprint-status.yaml + epic-config.yaml -->"
    A "<!-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -->"
    A ""
    A "# Epic $($epicId.ToUpper()): $epicTitle"
    A ""
    A "> **Created**: $epicCreated"
    A "> **Source**: ``$epicSource``"
    A "> **Objective**: $epicObjective"
    if ($epicScope) { A "> **Scope**: $epicScope" }
    if ($epicDependencies) { A "> **Dependencies**: $epicDependencies" }
    A ""
    A "---"
    A ""

    # Story status summary
    A "## Story Status Summary"
    A ""
    A "| Metric | Count |"
    A "|--------|:-----:|"
    A "| **Total Stories** | **$totalStories** |"
    A "| $E_DONE Done | $doneCount |"
    if ($reviewCount -gt 0) { A "| $E_REVIEW Review | $reviewCount |" }
    if ($readyCount -gt 0) { A "| $E_READY Ready-for-dev | $readyCount |" }
    if ($inProgressCount -gt 0) { A "| $E_PROGRESS In-Progress | $inProgressCount |" }
    A "| $E_PROGRESS Backlog | $backlogCount |"
    if ($cancelledCount -gt 0) { A "| $E_CANCEL Cancelled | $cancelledCount |" }
    A "| P0 | $p0Count |"
    A "| P1 | $p1Count |"
    A "| P2 | $p2Count |"
    A ""

    $verifySum = $doneCount + $reviewCount + $readyCount + $inProgressCount + $backlogCount + $cancelledCount
    $verifyMark = if ($verifySum -eq $totalStories) { "$([char]0x2713)" } else { "$([char]0x2717) MISMATCH!" }
    A "> **Verify**: Done($doneCount) + Review($reviewCount) + Ready($readyCount) + InProgress($inProgressCount) + Backlog($backlogCount) + Cancelled($cancelledCount) = $verifySum $verifyMark"
    A ""
    A "---"
    A ""

    # Execution order diagram
    A "## Execution Order"
    A ""
    A "> **Legend**: $E_GREEN No deferred tech debt | $E_YELLOW Has deferred tech debt | $E_REVIEW Review | $E_CANCEL Cancelled | $E_PROGRESS Backlog"
    A ""
    A '```'

    foreach ($phase in $phases) {
        $phTotal = 0; $phDone = 0; $phCancelled = 0
        foreach ($g in $phase.groups) {
            foreach ($s in $g.stories) {
                $phTotal++
                if ($storyStatuses[$s] -eq 'done') { $phDone++ }
                if ($storyStatuses[$s] -eq 'cancelled') { $phCancelled++ }
            }
        }
        $phEff = $phTotal - $phCancelled
        $phPct = if ($phEff -gt 0) { [math]::Round(($phDone / $phEff) * 100) } else { 0 }

        A ""
        A ("=" * 65)
        A "  $($phase.name) ($phDone/$phEff Done, $phPct%)"
        A ("=" * 65)
        A ""

        $gCount = $phase.groups.Count
        for ($gi = 0; $gi -lt $gCount; $gi++) {
            $g = $phase.groups[$gi]
            $gs = Get-GroupStats $g
            $gl = Get-GroupLabel $gs
            $conn = if ($gi -eq $gCount - 1) { "$([char]0x2514)" } else { "$([char]0x251C)" }
            $parNote = if ($g.parallel) { " (parallel)" } else { "" }

            A "  $conn$([char]0x2500) $($g.name) $gl$parNote"

            foreach ($s in $g.stories) {
                $st = $storyStatuses[$s]
                if (-not $st) { $st = 'backlog' }
                $sm = $storyMeta[$s]
                $cm = $storyCRMeta[$s]
                $title = if ($sm) { $sm.title } else { $s }
                $cplx = if ($sm) { $sm.complexity } else { "?" }
                $pri = if ($sm) { $sm.priority } else { "?" }
                $de = Get-DoneTypeEmoji $s

                $stTxt = ""
                switch ($st) {
                    'done' {
                        $crT = if ($cm -and $cm.CRScore) { "CR:$($cm.CRScore)" } else { "" }
                        $tsT = if ($cm -and $cm.TestCount) { ", $($cm.TestCount) tests" } else { "" }
                        $dfT = if ($cm -and $cm.Deferred) { ", deferred" } else { "" }
                        $stTxt = "$de Done ($crT$tsT$dfT)"
                    }
                    'review' { $stTxt = "$E_REVIEW Review" }
                    'ready-for-dev' { $stTxt = "$E_READY Ready-for-dev" }
                    'in-progress' { $stTxt = "$E_PROGRESS In-Progress" }
                    'cancelled' { $stTxt = "$E_CANCEL Cancelled" }
                    default { $stTxt = "$E_PROGRESS Backlog" }
                }

                $depN = ""
                if ($g.dependencies.ContainsKey($s)) {
                    $deps = $g.dependencies[$s] -join ", "
                    $depN = " <- depends: $deps"
                }

                $lp = if ($gi -eq $gCount - 1) { "   " } else { "  $([char]0x2502)" }
                A "  $lp  $($s.ToUpper()) ($title, $cplx, $pri)$depN $stTxt"
            }
            A ""
        }
    }

    A '```'
    A ""
    A "---"
    A ""

    # Phase detail tables
    foreach ($phase in $phases) {
        A "## $($phase.name)"
        A ""

        foreach ($g in $phase.groups) {
            $gs = Get-GroupStats $g
            $gl = Get-GroupLabel $gs
            A "### $($g.name) $gl"
            A ""
            A "| ID | Title | Complexity | Priority | Status |"
            A "|----|-------|:----------:|:--------:|:------:|"

            foreach ($s in $g.stories) {
                $st = $storyStatuses[$s]
                if (-not $st) { $st = 'backlog' }
                $sm = $storyMeta[$s]
                $title = if ($sm) { $sm.title } else { $s }
                $cplx = if ($sm) { $sm.complexity } else { "?" }
                $pri = if ($sm) { $sm.priority } else { "?" }
                $emoji = Get-StatusEmoji $st

                A "| $($s.ToUpper()) | $title | $cplx | $pri | $emoji $st |"
            }
            A ""
        }
    }

    A "---"
    A ""

    # Strategies
    if ($strategies.Count -gt 0) {
        A "## Strategies"
        A ""
        foreach ($strat in $strategies) {
            A "### $($strat.title)"
            A ""
            A $strat.content
            A ""
        }
        A "---"
        A ""
    }

    # Risks
    if ($risks.Count -gt 0) {
        A "## Risks"
        A ""
        $ri = 1
        foreach ($r in $risks) {
            A "$ri. $r"
            $ri++
        }
        A ""
        A "---"
        A ""
    }

    # --- 6. Orphan detection ---
    $orphans = [System.Collections.ArrayList]::new()
    $configStoryIds = @($storyMeta.Keys)

    # Find stories belonging to this epic in sprint-status
    $sprintStoryIds = [System.Collections.ArrayList]::new()
    foreach ($sk in $storyStatuses.Keys) {
        if ($sk -match "^qgr-" -or $sk -match "^fra-") {
            [void]$sprintStoryIds.Add($sk)
        }
    }

    # In sprint-status but not in config
    foreach ($sid in $sprintStoryIds) {
        if ($configStoryIds -notcontains $sid) {
            [void]$orphans.Add(@{ id = $sid; issue = "In sprint-status but NOT in epic-config" })
        }
    }

    # In config but not in sprint-status
    foreach ($cid in $configStoryIds) {
        if (-not $storyStatuses.ContainsKey($cid)) {
            [void]$orphans.Add(@{ id = $cid; issue = "In epic-config but NOT in sprint-status" })
        }
    }

    if ($orphans.Count -gt 0) {
        A "## $E_WARN Orphan Story Warning"
        A ""
        A "| Story ID | Issue |"
        A "|----------|-------|"
        foreach ($o in $orphans) {
            A "| $($o.id) | $($o.issue) |"
        }
        A ""
    }

    # --- 7. Write README.md ---
    $output = $sb.ToString()
    [System.IO.File]::WriteAllText($readmePath, $output, [System.Text.UTF8Encoding]::new($false))
    Write-Host "sync-epic-readme: $readmePath updated ($totalStories stories, $doneCount done)" -ForegroundColor Green
}

if ($epicConfigs.Count -eq 0) {
    Write-Host "sync-epic-readme: No epic-config.yaml found, skipping." -ForegroundColor Yellow
}
