# ==============================================================================
# stop-report.ps1  v1.0.0
# party-to-pipeline v4.0.0 -- Stop Hook
#
# Registered in .claude/settings.json Stop hook chain (position 2 -- after
# pipeline-heartbeat, before log-session). Triggered on every claude turn end.
#
# Behavior:
#   - Env guard: only acts when PHYCOOL_ORCHESTRATOR_MODE=1 (party-to-pipeline mode)
#   - Collects evidence (DB status / tasks ✅ / file_list / git diff / session_id)
#   - Atomic writes status-{phase}.json (tempfile + Move-Item -Force)
#   - Fail-open everywhere (silent exit 0 on any error -- never blocks pipeline)
#
# Settings.json registration:
#   "Stop": [{ "hooks": [{
#     "type": "command",
#     "command": "powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/party-to-pipeline/scripts/stop-report.ps1",
#     "timeout": 1500
#   }] }]
# ==============================================================================
$ErrorActionPreference = "SilentlyContinue"

# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
# Stop Hook stdin reads JSON via [Console]::In.ReadToEnd() -- must set InputEncoding first
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------

# ── Env guard (R1 obligation: non-orchestrator mode = exit 0 silently) ───────
if (-not $env:PHYCOOL_ORCHESTRATOR_MODE -or $env:PHYCOOL_ORCHESTRATOR_MODE -ne '1') {
    exit 0
}

$storyId = $env:PIPELINE_STORY_ID
$phase   = $env:PIPELINE_PHASE
$ipcDir  = $env:PIPELINE_IPC_DIR
$track   = if ($env:PIPELINE_TASK_TRACK) { $env:PIPELINE_TASK_TRACK } else { 'main' }

if (-not $storyId -or -not $phase -or -not $ipcDir) {
    exit 0
}
if (-not (Test-Path $ipcDir)) {
    exit 0
}

# Already wrote? Skip (avoid duplicate writes within same phase before ack)
$statusFile = Join-Path $ipcDir "status-$phase.json"
if (Test-Path $statusFile) {
    exit 0
}

# ── Read stdin context (Claude provides session_id / cwd via JSON) ───────────
$sessionId = "unknown"
$cwd = (Get-Location).Path
try {
    $raw = [Console]::In.ReadToEnd()
    if ($raw) {
        $ctx = $raw | ConvertFrom-Json
        if ($ctx.session_id) { $sessionId = $ctx.session_id }
        if ($ctx.cwd)        { $cwd = $ctx.cwd }
    }
} catch { }

# ── Locate project root + DB ─────────────────────────────────────────────────
$projectRoot = $null
$dir = $cwd
while ($dir -and $dir -ne [System.IO.Path]::GetPathRoot($dir)) {
    if (Test-Path (Join-Path $dir ".claude")) { $projectRoot = $dir; break }
    $dir = Split-Path $dir -Parent
}
if (-not $projectRoot) {
    # Fallback: orchestrator usually launches from project root, env var should hint
    $projectRoot = $cwd
}

$dbPath = Join-Path $projectRoot ".context-db\phycool.db"

# ── Collect evidence (best-effort, fail-open per item) ───────────────────────
$evidence = @{
    task_track      = $track
    db_status       = "unknown"
    tasks_backfilled = $false
    file_list_count = 0
    files_changed   = @()
    session_id      = $sessionId
    phase           = $phase
}

# Evidence #1: DB status + tasks check via better-sqlite3 inline
try {
    $sqliteModule = Join-Path $projectRoot ".context-db\node_modules\better-sqlite3"
    if ((Test-Path $dbPath) -and (Test-Path $sqliteModule)) {
        $nodeScript = @"
const Database = require('$($sqliteModule -replace '\\','/')');
try {
    const db = new Database('$($dbPath -replace '\\','/')', { readonly: true });
    const row = db.prepare('SELECT status, tasks, file_list FROM stories WHERE story_id = ?').get('$storyId');
    db.close();
    if (row) {
        const tasks = row.tasks || '';
        const fileList = row.file_list || '';
        const fileCount = fileList ? fileList.split('\n').filter(l => l.trim()).length : 0;
        const backfilled = tasks.indexOf(String.fromCodePoint(0x2705)) !== -1;
        console.log(JSON.stringify({
            status: row.status,
            tasks_backfilled: backfilled,
            file_list_count: fileCount
        }));
    } else {
        console.log(JSON.stringify({ status: 'not-found', tasks_backfilled: false, file_list_count: 0 }));
    }
} catch (e) {
    console.log(JSON.stringify({ error: e.message }));
}
"@
        $tmpJs = Join-Path $env:TEMP "stop-report-$storyId-$([System.IO.Path]::GetRandomFileName()).js"
        [System.IO.File]::WriteAllText($tmpJs, $nodeScript, [System.Text.UTF8Encoding]::new($false))
        $jsonOut = & node $tmpJs 2>$null
        Remove-Item $tmpJs -ErrorAction SilentlyContinue
        if ($jsonOut) {
            $parsed = $jsonOut | ConvertFrom-Json
            if (-not $parsed.error) {
                $evidence.db_status        = $parsed.status
                $evidence.tasks_backfilled = [bool]$parsed.tasks_backfilled
                $evidence.file_list_count  = [int]$parsed.file_list_count
            }
        }
    }
} catch { }

# Evidence #2: git diff --name-only HEAD (best-effort)
try {
    Push-Location $projectRoot
    $changed = & git diff --name-only HEAD 2>$null
    if ($changed) {
        $evidence.files_changed = @($changed | Where-Object { $_.Trim() })
    }
    Pop-Location
} catch { try { Pop-Location } catch { } }

# ── Determine status (completed / partial / failed) based on phase target ───
$statusValue = "partial"
$phaseTargets = @{
    'create-story' = @('ready-for-dev')
    'dev-story'    = @('review')
    'code-review'  = @('done')
}
foreach ($key in $phaseTargets.Keys) {
    if ($phase -like "$key*") {
        $targets = $phaseTargets[$key]
        if ($targets -contains $evidence.db_status) {
            # For dev-story/code-review, also require tasks_backfilled
            if ($key -in @('dev-story','code-review') -and -not $evidence.tasks_backfilled) {
                $statusValue = "partial"
            } else {
                $statusValue = "completed"
            }
        }
        break
    }
}

# ── Build status object ──────────────────────────────────────────────────────
$statusObj = @{
    phase      = $phase
    status     = $statusValue
    evidence   = $evidence
    error      = ""
    session_id = $sessionId
    timestamp  = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
}

# ── Atomic write (R2 obligation: tempfile + Move-Item -Force) ────────────────
try {
    $json = $statusObj | ConvertTo-Json -Depth 6
    $tmp  = "$statusFile.tmp"
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
    Move-Item -Path $tmp -Destination $statusFile -Force
    # Diagnostic log (non-blocking)
    $logLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] $storyId / $phase / $statusValue (tasks_backfilled=$($evidence.tasks_backfilled), db_status=$($evidence.db_status))"
    $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
    Add-Content -Path $logFile -Value $logLine -Encoding UTF8 -ErrorAction SilentlyContinue
} catch { }

exit 0
