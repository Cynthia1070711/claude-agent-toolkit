# ==============================================================================
# stop-report.ps1  v1.2.0
# party-to-pipeline v4.0.0 -- Stop Hook
# v1.2.0 (2026-08-02, whp-8-report-ack-notify): CAS lifecycle advance
#   - after the heartbeat UPDATE + worker_handoffs UPSERT, advance the run from
#     running/revising -> reported (via scripts/worker-lifecycle-advance.cjs)
#   - lets whp-7's guardian Loop B/D catch up-to-then-unreachable 'reported' rows
#   - failures logged as LIFECYCLE-WRITE-FAILED, independent of the heartbeat's
#     own DB-WRITE-FAILED path (BR-005/BR-133)
# v1.1.0 (2026-06-05, party-to-pipeline v5.3.0): Mode C 'general' phase branch
#   - skips Story DB evidence (no Story row for general tasks)
#   - evidence adds report_path / report_exists (env PIPELINE_REPORT_PATH)
#   - status: completed when report exists (main window reviews substance)
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

# (whp-4 T1.1) Dedup guard removed -- DB heartbeat now needs every-turn execution.
# Whether a turn takes the DB write path is gated by $env:PIPELINE_RUN_ID presence (added
# in T4.1), not by an early-exit here. status-$phase.json is still written unconditionally
# every turn (dispatch-general.ps1 hybrid wait + worker close watchdog read its existence).
$statusFile = Join-Path $ipcDir "status-$phase.json"

# -- Read stdin context (Claude provides session_id / cwd / transcript_path via JSON) --------
$sessionId = "unknown"
$cwd = (Get-Location).Path
$stdinTranscriptPath = ""
try {
    $raw = [Console]::In.ReadToEnd()
    if ($raw) {
        $ctx = $raw | ConvertFrom-Json
        if ($ctx.session_id)      { $sessionId = $ctx.session_id }
        if ($ctx.cwd)             { $cwd = $ctx.cwd }
        if ($ctx.transcript_path) { $stdinTranscriptPath = $ctx.transcript_path }
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
    evidence_incomplete = 0
}

# Evidence #1: DB status + tasks check via better-sqlite3 inline
# (whp-4 CR F2 / BR-118) $dbEvidenceOk tracks whether THIS evidence item was actually collected.
# Previously every failure path here was swallowed silently and evidence_incomplete stayed 0 --
# i.e. the flag that exists to replace "silent partial" never fired for the very failure AC7 names.
$dbEvidenceOk = $true
try {
    $sqliteModule = Join-Path $projectRoot ".context-db\node_modules\better-sqlite3"
    if (($phase -ne 'general') -and (Test-Path $dbPath) -and (Test-Path $sqliteModule)) {
        $nodeScript = @"
const Database = require('$($sqliteModule -replace '\\','/')');
try {
    const db = new Database('$($dbPath -replace '\\','/')', { readonly: true });
    const row = db.prepare('SELECT status, tasks, file_list, cr_score, review_completed_at, completed_at FROM stories WHERE story_id = ?').get(process.argv[2]);
    db.close();
    if (row) {
        const tasks = row.tasks || '';
        const fileList = row.file_list || '';
        const fileCount = fileList ? fileList.split('\n').filter(l => l.trim()).length : 0;
        // Bug #9 fix (2026-05-09): tasks_backfilled detection multi-signal
        // D19 fix (2026-05-11): review phase-specific signal (no fallback)
        // D22 fix (2026-05-16 v2.0.0): review 嚴格 marker check
        //   觸發: 使用者指控 review 看到 dev `+ String.fromCharCode(0x2705) +` 就跳過 file:line audit, review 失去意義
        //   修補: review phase 必含 `+ String.fromCharCode(0x2705,0x2705) +` + [R-verified @ ts] OR `+ String.fromCharCode(0x274c) +` 拒絕標記
        //   對齊: tasks-backfill-verify SKILL v2.0.0 兩階段差異化 SOP
        const CHECK = String.fromCodePoint(0x2705);
        const DOUBLE_CHECK = CHECK + CHECK;
        const REJECT = String.fromCodePoint(0x274C);
        const tasksHasCheck = tasks.indexOf(CHECK) !== -1;
        const tasksHasDoubleCheck = tasks.indexOf(DOUBLE_CHECK) !== -1;
        const tasksHasReviewVerified = /\[R-verified @ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(tasks);
        const tasksHasReviewReject = tasks.indexOf(REJECT) !== -1;
        const devComplete = !!row.completed_at && row.status === 'review';
        const phase = process.argv[3];
        const isReviewPhase = phase === 'code-review' || phase.indexOf('code-review') === 0;
        // v2.0.0: review 階段必含 double-check + [R-verified @ ts] OR reject marker
        const reviewBackfilled = (tasksHasDoubleCheck && tasksHasReviewVerified) || tasksHasReviewReject;
        const backfilled = isReviewPhase ? reviewBackfilled : (tasksHasCheck || devComplete);
        let signal = 'none';
        if (isReviewPhase) {
            if (tasksHasDoubleCheck && tasksHasReviewVerified) signal = 'review_double_check_verified';
            else if (tasksHasReviewReject) signal = 'review_reject';
            else signal = 'review_skip_detected';
        } else {
            if (tasksHasCheck) signal = 'tasks_check';
            else if (devComplete) signal = 'dev_complete';
        }
        console.log(JSON.stringify({
            status: row.status,
            tasks_backfilled: backfilled,
            backfill_signal: signal,
            file_list_count: fileCount
        }));
    } else {
        console.log(JSON.stringify({ status: 'not-found', tasks_backfilled: false, file_list_count: 0 }));
    }
} catch (e) {
    console.log(JSON.stringify({ error: e.message }));
}
"@
        # (whp-4 CR F5) story_id / phase go in as process.argv, never interpolated into the source
        # (an id carrying an apostrophe used to break the script; one carrying ..\ used to steer the
        # temp filename out of %TEMP%). Same reason register-run.ps1 refuses inline payloads.
        $tmpJs = Join-Path $env:TEMP "stop-report-ev-$([System.IO.Path]::GetRandomFileName()).js"
        [System.IO.File]::WriteAllText($tmpJs, $nodeScript, [System.Text.UTF8Encoding]::new($false))
        $jsonOut = & node $tmpJs $storyId $phase 2>$null
        Remove-Item $tmpJs -ErrorAction SilentlyContinue
        $parsedOk = $false
        if ($jsonOut) {
            $parsed = $jsonOut | ConvertFrom-Json
            if (-not $parsed.error) {
                $evidence.db_status        = $parsed.status
                $evidence.tasks_backfilled = [bool]$parsed.tasks_backfilled
                $evidence.file_list_count  = [int]$parsed.file_list_count
                $parsedOk = $true
            }
        }
        if (-not $parsedOk) { $dbEvidenceOk = $false }
    } elseif ($phase -ne 'general') {
        # BMAD phase but DB / better-sqlite3 unreachable -- this evidence item could not be collected.
        # ('general' legitimately skips the Story query: Mode C tasks have no Story row.)
        $dbEvidenceOk = $false
    }
} catch { $dbEvidenceOk = $false }
if (-not $dbEvidenceOk) { $evidence.evidence_incomplete = 1 }

# Evidence #2: git diff --name-only HEAD (best-effort)
try {
    Push-Location $projectRoot
    $changed = & git diff --name-only HEAD 2>$null
    if ($changed) {
        $evidence.files_changed = @($changed | Where-Object { $_.Trim() })
    }
    Pop-Location
} catch { try { Pop-Location } catch { } }

# Evidence #3 (Mode C v5.3.0): general-task report file (no Story row to check)
if ($phase -eq 'general') {
    $reportPath = $env:PIPELINE_REPORT_PATH
    $evidence.report_path   = if ($reportPath) { $reportPath } else { "" }
    $evidence.report_exists = [bool]($reportPath -and (Test-Path $reportPath))
    $evidence.db_status     = "n/a-general"
}

# ── Determine status (completed / partial / failed) based on phase target ───
$statusValue = "partial"
if ($phase -eq 'general') {
    # Mode C v5.3.0: general task has no Story target -- completed when report exists.
    # Status is a coarse signal only; main window reviews substance (git diff + report).
    if ($evidence.report_exists) { $statusValue = "completed" }
} else {
    # (whp-4 T1.2) phaseTargetStatus SSoT is scripts/pipeline-config.json (previously a
    # 3-key hardcoded hashtable here, diverged from the config's 8 keys -- pipeline-auto-exit.js
    # already treats the config as authoritative). Exact key wins; unlisted phases fall back
    # to prefix match against config keys (same -like semantics as the old hardcoded loop).
    $targets = $null
    try {
        $configPath = Join-Path $projectRoot "scripts\pipeline-config.json"
        $configRaw = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)
        $phaseTargetStatus = ($configRaw | ConvertFrom-Json).phaseTargetStatus
        if ($phaseTargetStatus.PSObject.Properties.Name -contains $phase) {
            $targets = @($phaseTargetStatus.$phase)
        } else {
            foreach ($key in $phaseTargetStatus.PSObject.Properties.Name) {
                if ($phase -like "$key*") {
                    $targets = @($phaseTargetStatus.$key)
                    break
                }
            }
        }
    } catch {
        $evidence.evidence_incomplete = 1
    }

    if ($targets -and ($targets -contains $evidence.db_status)) {
        # dev-story*/code-review* (any variant) also require tasks_backfilled
        if (($phase -like 'dev-story*' -or $phase -like 'code-review*') -and -not $evidence.tasks_backfilled) {
            $statusValue = "partial"
        } else {
            $statusValue = "completed"
        }
    }
}

# ── Atomic IPC status write (R2 obligation: tempfile + Move-Item -Force) ─────
function Write-IpcStatus {
    param([hashtable]$Evidence)
    try {
        $statusObj = @{
            phase      = $phase
            status     = $statusValue
            evidence   = $Evidence
            error      = ""
            session_id = $sessionId
            timestamp  = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
        }
        $json = $statusObj | ConvertTo-Json -Depth 6
        $tmp  = "$statusFile.tmp"
        [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
        Move-Item -Path $tmp -Destination $statusFile -Force
    } catch { }
}

# -- (whp-4 T4.5) claude_pid first-turn backfill -- ancestor-chain walk, depth cap 5, fail-open --
# stop-report.ps1 is spawned by claude itself, so its own process ancestry necessarily contains
# the run's claude.exe (zero cross-worker ambiguity, zero full-system scan). Zero kill primitives.
#
# whp-11 T5: relocated here (originally placed after the workflow_invoked detection block further
# below) together with $runId and Invoke-DbHeartbeat, because the D2 poll block that follows must
# run BEFORE the first Write-IpcStatus call (AC5/AC13: a hit must never let status-$phase.json
# exist) and its hit path needs Invoke-DbHeartbeat callable at that point. The original call site
# below (`if ($runId) { Invoke-DbHeartbeat | Out-Null }`) is untouched and still works unchanged,
# since PowerShell functions/variables defined earlier in a script are visible for the rest of it.
function Get-ClaudePidViaAncestry {
    param([int]$StartPid, [int]$MaxDepth = 5)
    $currentPid = $StartPid
    for ($i = 0; $i -lt $MaxDepth; $i++) {
        $proc = $null
        try { $proc = Get-WmiObject Win32_Process -Filter "ProcessId=$currentPid" -ErrorAction SilentlyContinue } catch { return $null }
        if (-not $proc) { return $null }
        if ($proc.Name -eq 'claude.exe') { return $currentPid }
        if (-not $proc.ParentProcessId -or $proc.ParentProcessId -le 0) { return $null }
        $currentPid = $proc.ParentProcessId
    }
    return $null
}

# -- (whp-4 T4.1/T4.2/T4.3, whp-11 T4 extraction) DB heartbeat merge + worker_handoffs UPSERT --
# gated by PIPELINE_RUN_ID at the call site below. (BC-07: unset -- e.g. legacy IPC dir, manual
# worker run -- means skip ALL DB writes; IPC status file is still written unconditionally
# elsewhere, unaffected by this gate.)
#
# whp-11 T4: extracted into a callable function (was an inline `if ($runId) {...}` block) so the
# D2 hit path (T5, immediately below) can run the SAME heartbeat/handoff writes with lifecycle
# advance suppressed, instead of duplicating this ~150-line block. Reads $runId/$storyId/$phase/
# $statusValue/$projectRoot/$dbPath/$evidence from script scope (same closure pattern already
# used by Write-IpcStatus above) -- behavior for the existing unsuppressed call site is
# byte-identical to before this extraction (verified: AC5's Phase 3 T4 byte-identical check).
#
# $runId assigned here (script scope, before the function def) so it is available both to this
# function's body (closure read) and to the D2 poll block (T5, immediately below) that decides
# whether to call this function with -SuppressLifecycleAdvance.
$runId = $env:PIPELINE_RUN_ID

function Invoke-DbHeartbeat {
    param([switch]$SuppressLifecycleAdvance)
    $hbResult = $null
    $claudePidFound = Get-ClaudePidViaAncestry -StartPid $PID -MaxDepth 5
    try {
        $sqliteModule = Join-Path $projectRoot ".context-db\node_modules\better-sqlite3"
        if ((Test-Path $dbPath) -and (Test-Path $sqliteModule)) {
            $hbTemplate = @'
const Database = require('__SQLITE_MODULE__');
const fs = require('fs');
try {
  // (whp-4 CR F1) Every variable value arrives as a JSON payload FILE -- never string-interpolated
  // into this source. The previous form pasted PowerShell's ConvertTo-Json output into a JS string
  // literal, so JS un-escaped the backslashes PowerShell had just escaped and what landed in
  // worker_handoffs.evidence_json was NOT valid JSON (json_valid()=0, verified 2026-07-29);
  // an apostrophe anywhere in the evidence produced a SyntaxError that lost the whole turn's
  // heartbeat. Same principle as register-run.ps1 (BR-134: JSON file path, never inline).
  const p = JSON.parse(fs.readFileSync('__PAYLOAD__', 'utf8'));
  const ev = p.evidence || {};
  const db = new Database('__DB_PATH__');

  // BR-132 / AC16: the cap is READ FROM workerProtocol.guardianScopeMaxFiles -- the same key the
  // guardian uses -- rather than restated as a literal here.
  let maxFiles = 2000;
  try {
    const cfg = JSON.parse(fs.readFileSync('__CONFIG_PATH__', 'utf8'));
    if (cfg.workerProtocol && cfg.workerProtocol.guardianScopeMaxFiles) maxFiles = cfg.workerProtocol.guardianScopeMaxFiles;
  } catch (e) { /* config unreadable -> keep the defensive default, heartbeat still runs */ }

  // Normalize: PowerShell renders a 1-element list as a scalar and an empty list as nothing.
  const list = Array.isArray(ev.files_changed) ? ev.files_changed : (ev.files_changed ? [ev.files_changed] : []);
  const newFiles = JSON.stringify(list);

  // BR-132: compute pre-cap union size to know whether truncation occurs this turn.
  const countRow = db.prepare(`
    SELECT COUNT(*) c FROM (
      SELECT DISTINCT value FROM (
        SELECT value FROM json_each((SELECT COALESCE(files_modified,'[]') FROM worker_runs WHERE run_id=?))
        UNION
        SELECT value FROM json_each(?)
      )
    )
  `).get(p.runId, newFiles);
  const truncated = !!(countRow && countRow.c > maxFiles);
  // (whp-4 CR F3) The flag has to reach the DB copy too -- it used to be set on the PowerShell
  // side only AFTER evidence_json had already been serialised, so the DB never carried it.
  if (truncated) ev.files_modified_truncated = true;

  // BR-113/BR-114: turn_count is a single relative SQL statement (never read-then-write).
  // BR-115: files_modified is a SQL-only dedup+union+cap (also never JS-side read-then-write).
  // claude_pid: COALESCE keeps any existing value (only-once-when-NULL semantics, BR-118 §4.6).
  const info = db.prepare(`
    UPDATE worker_runs SET
      turn_count = turn_count + 1,
      last_turn_at = @now,
      last_status = @lastStatus,
      evidence_incomplete = @evidenceIncomplete,
      claude_pid = COALESCE(claude_pid, @claudePid),
      files_modified = (
        SELECT json_group_array(v) FROM (
          SELECT DISTINCT value AS v FROM (
            SELECT value FROM json_each(COALESCE(files_modified, '[]'))
            UNION
            SELECT value FROM json_each(@newFiles)
          )
          ORDER BY v
          LIMIT @maxFiles
        )
      ),
      updated_at = @now
    WHERE run_id = @runId
  `).run({
    runId: p.runId, newFiles, maxFiles,
    claudePid: p.claudePid === null || p.claudePid === undefined ? null : Number(p.claudePid),
    now: p.now,
    lastStatus: p.statusValue,
    evidenceIncomplete: ev.evidence_incomplete ? 1 : 0,
  });

  // BR-117: worker_handoffs UPSERT -- gate_result untouched (DB default 'pending' on first
  // INSERT; ON CONFLICT branch omits it entirely so an existing value is never overwritten).
  db.prepare(`
    INSERT INTO worker_handoffs (run_id, story_id, phase, evidence_json, created_at, updated_at)
    VALUES (@runId, @storyId, @phase, @evidenceJson, @now, @now)
    ON CONFLICT(run_id) DO UPDATE SET evidence_json = excluded.evidence_json, updated_at = excluded.updated_at
  `).run({ runId: p.runId, storyId: p.storyId, phase: p.phase, evidenceJson: JSON.stringify(ev), now: p.now });

  // (whp-8 BR-001/BR-006, whp-11 T4/AC5) Lifecycle CAS advance -- a statement independent of the
  // heartbeat UPDATE above, so it neither gates nor is gated by turn_count/last_turn_at.
  // Suppressible: whp-11's D2 hit path must not fake a turn-end signal (the heartbeat/handoff
  // writes above still must happen every turn -- AC5 -- but lifecycle staying unadvanced is the
  // whole point of a knock, not a miss). advanceToReported() never throws (fail-open, BR-005): a
  // DB-unwritable connection surfaces as { ok:false, error } rather than aborting this whole try
  // block and losing the heartbeat/handoff writes.
  let lifecycleResult = { changes: 0, error: null };
  if (!p.suppressLifecycleAdvance) {
    const { advanceToReported } = require('__LIFECYCLE_MODULE__');
    lifecycleResult = advanceToReported(db, { runId: p.runId, now: p.now });
  }

  db.close();
  console.log(JSON.stringify({
    ok: true,
    changes: info.changes,
    files_modified_truncated: truncated,
    lifecycle_changes: lifecycleResult.changes,
    lifecycle_error: lifecycleResult.error,
  }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
}
'@
            # evidence payload (BR-135): only the evidence object itself (three-state values /
            # counts / booleans) -- never transcript content, file contents, or prompt text.
            $hbPayload = @{
                runId       = $runId
                storyId     = $storyId
                phase       = $phase
                statusValue = $statusValue
                now         = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
                claudePid   = $(if ($claudePidFound) { [int]$claudePidFound } else { $null })
                evidence    = $evidence
                suppressLifecycleAdvance = [bool]$SuppressLifecycleAdvance
            }
            $tmpPayload = Join-Path $env:TEMP "stop-report-hb-$([System.IO.Path]::GetRandomFileName()).json"
            [System.IO.File]::WriteAllText($tmpPayload, ($hbPayload | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
            # String.Replace (literal) not -replace (regex): the replacement side of -replace treats
            # $& / $1 as backreferences and silently rewrote path values containing them.
            $hbScript = $hbTemplate
            $hbScript = $hbScript.Replace('__SQLITE_MODULE__', ($sqliteModule -replace '\\', '/'))
            $hbScript = $hbScript.Replace('__DB_PATH__', ($dbPath -replace '\\', '/'))
            $hbScript = $hbScript.Replace('__CONFIG_PATH__', ((Join-Path $projectRoot "scripts\pipeline-config.json") -replace '\\', '/'))
            $hbScript = $hbScript.Replace('__PAYLOAD__', ($tmpPayload -replace '\\', '/'))
            # .cjs (not .js): .context-db/package.json declares "type":"module", so a plain .js
            # file there resolves as an ES module and this require() would throw "module is not
            # defined in ES module scope" (caught live: heartbeat/handoff still committed --
            # separate statements, BR-006 -- but the lifecycle CAS silently never ran).
            $hbScript = $hbScript.Replace('__LIFECYCLE_MODULE__', ((Join-Path $projectRoot ".context-db\scripts\worker-lifecycle-advance.cjs") -replace '\\', '/'))
            $tmpHbJs = Join-Path $env:TEMP "stop-report-hb-$([System.IO.Path]::GetRandomFileName()).js"
            [System.IO.File]::WriteAllText($tmpHbJs, $hbScript, [System.Text.UTF8Encoding]::new($false))
            $hbOut = & node $tmpHbJs 2>$null
            Remove-Item $tmpHbJs, $tmpPayload -ErrorAction SilentlyContinue
            $hbResult = if ($hbOut) { $hbOut | ConvertFrom-Json } else { $null }
            if (-not $hbResult -or -not $hbResult.ok) {
                # BR-133: fail-open never means silent -- log run_id + failure marker.
                $failMsg = if ($hbResult) { $hbResult.error } else { "no output from heartbeat script" }
                $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
                Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] DB-WRITE-FAILED run_id=$runId phase=$phase error=$failMsg" -Encoding UTF8 -ErrorAction SilentlyContinue
            } else {
                if ($hbResult.files_modified_truncated) {
                    $evidence.files_modified_truncated = $true
                }
                if ($hbResult.lifecycle_error) {
                    # (whp-8 BR-005) Distinct from DB-WRITE-FAILED above: heartbeat/handoff
                    # succeeded (hbResult.ok=true) but the lifecycle CAS advance itself failed
                    # (e.g. DB reopened readonly between statements). Logged separately so this
                    # failure mode stays greppable on its own.
                    $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
                    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] LIFECYCLE-WRITE-FAILED run_id=$runId phase=$phase error=$($hbResult.lifecycle_error)" -Encoding UTF8 -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {
        $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] DB-WRITE-FAILED run_id=$runId phase=$phase error=$_" -Encoding UTF8 -ErrorAction SilentlyContinue
    }
    return $hbResult
}

# whp-11 T5: D2 bounded-wait poll -- runs after $statusValue is finalized but BEFORE the first
# Write-IpcStatus call below (AC5/AC13: a hit must never let status-$phase.json exist). Gated on
# $runId exactly like Invoke-DbHeartbeat (BR-005: PIPELINE_RUN_ID unset -> poll never runs, zero
# D2-POLL log lines). The whole poll (immediate first check + fixed-interval re-checks up to
# workerProtocol.hookGraceSec) lives in ONE node process -- not a PowerShell Start-Sleep loop
# spawning node per iteration -- so a default 120s grace costs one process, not ~60 of them.
if ($runId) {
    $d2Result = $null
    $d2StderrTail = $null
    $d2CatchMsg = $null
    try {
        $d2SqliteModule = Join-Path $projectRoot ".context-db\node_modules\better-sqlite3"
        $d2PollModule = Join-Path $projectRoot ".context-db\scripts\worker-directive-poll.cjs"
        if ((Test-Path $dbPath) -and (Test-Path $d2SqliteModule) -and (Test-Path $d2PollModule)) {
            $d2Template = @'
const Database = require('__SQLITE_MODULE__');
const fs = require('fs');
const { peekPending, stampKnocked, buildKnockDecision, resolveGraceSec } = require('__POLL_MODULE__');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async () => {
  let db;
  try {
    const p = JSON.parse(fs.readFileSync('__PAYLOAD__', 'utf8'));
    // BR-006: the polling connection is READONLY -- the only write D2 may cause (BR-008's
    // knocked_at stamp) goes through a separate short-lived writable connection on the hit
    // path below. A stray future write on the poll loop fails loudly instead of silently.
    db = new Database('__DB_PATH__', { readonly: true });

    // BR-025/BR-026: absent config -> in-code default 120; out-of-range -> clamp [0,300].
    // BOM strip (whp-11 CR): a PS-tool-rewritten config with a UTF-8 BOM would otherwise throw
    // here and silently defeat the hookGraceSec=0 opt-out (parse fail -> {} -> default 120).
    let workerProtocolCfg = {};
    try {
      const raw = JSON.parse(fs.readFileSync('__CONFIG_PATH__', 'utf8').replace(/^\uFEFF/, ''));
      workerProtocolCfg = raw.workerProtocol || {};
    } catch (e) { /* config unreadable -- resolveGraceSec still returns its own default */ }
    const graceInfo = resolveGraceSec(workerProtocolCfg);
    const graceSec = graceInfo.value;
    // fixed 2s cadence (deliberately not a config key, YAGNI): bounds mid-window detection lag
    // at 2s; 61 peeks per default 120s grace cost ~2.6ms total (whp-11 CR Layer E measured).
    const intervalSec = __INTERVAL_SEC__;

    // AC12: hookGraceSec=0 is a complete opt-out ("零成本退場開關") -- it must never knock even
    // when a directive happens to be pending, so this skips peekPending entirely rather than
    // doing one zero-wait check. Distinct from BR-002/BR-003's bounded-but-nonzero grace, where
    // the first check always happens immediately with no pre-sleep.
    if (graceSec === 0) {
      db.close();
      console.log(JSON.stringify({ ok: true, hit: false, clamped: graceInfo.clamped, graceSec, skipped: true }));
      return;
    }

    // BR-003 (immediate first check, no pre-sleep) / BR-002 (bounded re-checks).
    let hitRows = null;
    let elapsed = 0;
    while (true) {
      const peek = peekPending(db, { runId: p.runId });
      if (!peek.ok) {
        db.close();
        console.log(JSON.stringify({ ok: false, hit: false, clamped: graceInfo.clamped, error: peek.error }));
        return;
      }
      if (peek.rows.length > 0) { hitRows = peek.rows; break; }
      if (elapsed >= graceSec) break;
      // sleep only the remaining budget (whp-11 CR): keeps the bound exact when graceSec is
      // not a multiple of intervalSec (e.g. graceSec=1 used to overshoot to 2s).
      const sleepSec = Math.min(intervalSec, graceSec - elapsed);
      await sleep(sleepSec * 1000);
      elapsed += sleepSec;
    }

    if (!hitRows) {
      db.close();
      console.log(JSON.stringify({ ok: true, hit: false, clamped: graceInfo.clamped, graceSec }));
      return;
    }

    // BR-008: stamp only the matched ids; stamp failure folds into the same fail-open path as a
    // poll failure (BR-007) rather than emitting a block decision whose loop-bound didn't land.
    // BR-006: the stamp is the hit path's single write -- it gets its own short-lived writable
    // connection so the poll connection above stays readonly.
    const msgIds = hitRows.map((r) => r.msg_id);
    let stamp;
    let wdb;
    try {
      wdb = new Database('__DB_PATH__');
      stamp = stampKnocked(wdb, { msgIds, now: p.now });
    } finally {
      try { if (wdb) wdb.close(); } catch (_) { /* noop */ }
    }
    if (!stamp.ok) {
      db.close();
      console.log(JSON.stringify({ ok: false, hit: false, clamped: graceInfo.clamped, error: stamp.error }));
      return;
    }
    if (stamp.changes === 0) {
      // TOCTOU (whp-11 CR): D1 delivered every peeked row between peek and stamp -- nothing
      // left to knock for; fall through as a miss rather than knocking for delivered rows.
      db.close();
      console.log(JSON.stringify({ ok: true, hit: false, clamped: graceInfo.clamped, graceSec, raced: true }));
      return;
    }
    const decision = buildKnockDecision(hitRows, p.runId);
    db.close();
    console.log(JSON.stringify({
      ok: true,
      hit: true,
      clamped: graceInfo.clamped,
      graceSec,
      decisionJson: JSON.stringify(decision),
    }));
  } catch (e) {
    try { if (db) db.close(); } catch (_) { /* already closed or never opened */ }
    console.log(JSON.stringify({ ok: false, hit: false, error: e.message }));
  }
})();
'@
            $d2Payload = @{
                runId = $runId
                now   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00")
            }
            $tmpD2Payload = Join-Path $env:TEMP "stop-report-d2-$([System.IO.Path]::GetRandomFileName()).json"
            [System.IO.File]::WriteAllText($tmpD2Payload, ($d2Payload | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
            $d2Script = $d2Template
            $d2Script = $d2Script.Replace('__SQLITE_MODULE__', ($d2SqliteModule -replace '\\', '/'))
            $d2Script = $d2Script.Replace('__POLL_MODULE__', ($d2PollModule -replace '\\', '/'))
            $d2Script = $d2Script.Replace('__DB_PATH__', ($dbPath -replace '\\', '/'))
            $d2Script = $d2Script.Replace('__CONFIG_PATH__', ((Join-Path $projectRoot "scripts\pipeline-config.json") -replace '\\', '/'))
            $d2Script = $d2Script.Replace('__PAYLOAD__', ($tmpD2Payload -replace '\\', '/'))
            $d2Script = $d2Script.Replace('__INTERVAL_SEC__', '2')
            $tmpD2Js = Join-Path $env:TEMP "stop-report-d2-$([System.IO.Path]::GetRandomFileName()).js"
            $tmpD2Err = Join-Path $env:TEMP "stop-report-d2-$([System.IO.Path]::GetRandomFileName()).err"
            try {
                [System.IO.File]::WriteAllText($tmpD2Js, $d2Script, [System.Text.UTF8Encoding]::new($false))
                $d2Out = & node $tmpD2Js 2>$tmpD2Err
                $d2Result = if ($d2Out) { $d2Out | ConvertFrom-Json } else { $null }
                if ((-not $d2Result) -and (Test-Path $tmpD2Err)) {
                    # (whp-11 CR) keep the first 300 chars of node stderr for the fail log --
                    # a require()/module-resolution failure otherwise surfaces as the useless
                    # "no output from D2 poll script" (the exact defect class whp-8 hit live).
                    $d2ErrText = [System.IO.File]::ReadAllText($tmpD2Err, [System.Text.Encoding]::UTF8)
                    if ($d2ErrText) { $d2StderrTail = $d2ErrText.Substring(0, [Math]::Min(300, $d2ErrText.Length)) }
                }
            } finally {
                # try/finally (whp-11 CR): a mid-poll kill no longer strands temp files.
                Remove-Item $tmpD2Js, $tmpD2Payload, $tmpD2Err -ErrorAction SilentlyContinue
            }
        }
    } catch {
        $d2Result = $null
        $d2CatchMsg = "$_"
    }

    if (-not $d2Result -or -not $d2Result.ok) {
        # BR-007: fail-open -- log D2-POLL-FAILED, fall through unchanged (existing flow below
        # still writes status-$phase.json and runs the unsuppressed heartbeat as if D2 never ran).
        $failMsg = if ($d2Result -and $d2Result.error) { $d2Result.error }
                   elseif ($d2CatchMsg) { "ps-exception: $d2CatchMsg" }
                   elseif ($d2StderrTail) { "node-stderr: $d2StderrTail" }
                   else { "no output from D2 poll script" }
        # newline-fold (whp-11 CR): keep one log line per event -- multi-line error text would
        # forge extra records in the log smoke-test greps as evidence.
        $failMsg = ($failMsg -replace '[\r\n]+', ' ')
        $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] D2-POLL-FAILED run_id=$($runId -replace '[\r\n]+',' ') error=$failMsg" -Encoding UTF8 -ErrorAction SilentlyContinue
    } else {
        if ($d2Result.clamped) {
            $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
            Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] D2-GRACE-CLAMPED run_id=$($runId -replace '[\r\n]+',' ') graceSec=$($d2Result.graceSec)" -Encoding UTF8 -ErrorAction SilentlyContinue
        }
        if ($d2Result.hit) {
            # BR-013/BR-014: knock instead of ending the turn -- suppressed heartbeat still writes
            # turn_count/evidence (BR-015) but must not advance lifecycle or touch status-$phase.json.
            # (whp-11 CR) the hit path exits before the workflow_invoked detection further below;
            # keep the three-state contract ('true'/'false'/'unknown') in this turn's handoff
            # evidence instead of an absent key.
            if (($phase -eq 'create-story') -or ($phase -like 'dev-story*') -or ($phase -like 'code-review*')) {
                $evidence.workflow_invoked = 'unknown'
            }
            Invoke-DbHeartbeat -SuppressLifecycleAdvance | Out-Null
            # BR-011/BR-012: decisionJson is already-serialized JSON from buildKnockDecision (T2) --
            # echoed verbatim, never round-tripped through ConvertTo-Json (would risk depth/format
            # drift). BR-011: exit 0 -- exit 2 would make Claude Code discard stdout entirely.
            Write-Output $d2Result.decisionJson
            exit 0
        }
        # miss after full bounded wait (BR-002) -- fall through unchanged, no log needed.
    }
}

# (whp-4 CR F6, re-scoped by whp-11 CR) On the MISS path the status file is written here, AFTER
# the bounded D2 wait above -- a deliberate ordering change to F6's original "status before any
# DB work": a D2 HIT must never let status-$phase.json exist (F16 -- the file is the sole legal
# turn-end signal and a hit means the turn continues), so the poll structurally has to run first.
# The timeout hazard F6 guarded against does not apply at current settings: hook timeout units
# are SECONDS (official hooks reference, fetched 2026-08-02 -- "JSON output is only processed on
# exit 0", hooks run in parallel), so this hook's configured 1500 = 25 min, >= 5x headroom over
# the 300 s BR-026 clamp ceiling. If anyone ever lowers that timeout, keep it comfortably above
# hookGraceSec's clamp or the wait will eat the one artifact that must survive. F6's original
# rationale (status ahead of the ~600 ms heartbeat/WMI work below) still holds on this path.
Write-IpcStatus -Evidence $evidence

# -- (whp-4 T4.4/BR-119~122) workflow_invoked: BMAD phase only, independent of PIPELINE_RUN_ID --
# (needs only sessionId, which stdin always provides -- not gated on the DB-heartbeat env var)
$isBmadPhase = ($phase -eq 'create-story') -or ($phase -like 'dev-story*') -or ($phase -like 'code-review*')
if ($isBmadPhase) {
    try {
        $transcriptPath = if ($stdinTranscriptPath) {
            $stdinTranscriptPath
        } else {
            $sanitizedRoot = ($projectRoot -replace '[:\\/()]', '-')
            Join-Path $env:USERPROFILE ".claude\projects\$sanitizedRoot\$sessionId.jsonl"
        }
        $detectScript = Join-Path $projectRoot ".context-db\scripts\workflow-invoked-detect.js"
        $wiTemplate = @'
const { pathToFileURL } = require('url');
(async () => {
  try {
    const m = await import(pathToFileURL('__DETECT_JS__').href);
    console.log(await m.detectWorkflowInvoked(process.argv[2], process.argv[3]));
  } catch (e) {
    console.log('unknown');
  }
})();
'@
        # (whp-4 CR F5) transcript path + phase go in as process.argv -- drops the fragile
        # backslash re-escaping this used to need to survive a JS string literal.
        $wiScript = $wiTemplate.Replace('__DETECT_JS__', ($detectScript -replace '\\', '/'))
        $tmpWiJs = Join-Path $env:TEMP "wi-detect-$([System.IO.Path]::GetRandomFileName()).js"
        [System.IO.File]::WriteAllText($tmpWiJs, $wiScript, [System.Text.UTF8Encoding]::new($false))
        $wiOut = & node $tmpWiJs $transcriptPath $phase 2>$null
        Remove-Item $tmpWiJs -ErrorAction SilentlyContinue
        $wiResult = if ($wiOut -and ($wiOut.Trim() -in @('true','false','unknown'))) { $wiOut.Trim() } else { 'unknown' }
    } catch { $wiResult = 'unknown' }
    $evidence.workflow_invoked = $wiResult
}

# whp-11 T5: Get-ClaudePidViaAncestry / $runId / Invoke-DbHeartbeat relocated above (before the
# D2 poll block, which must run ahead of the first Write-IpcStatus call) -- this is now just the
# call site. whp-11 T4: unsuppressed (default), byte-identical trigger condition to the original
# inline `if ($runId) {...}` block T4 replaced.
if ($runId) {
    Invoke-DbHeartbeat | Out-Null
}

# ── Re-write status file with the enriched evidence (workflow_invoked / truncation flag) ────
# Same atomic tempfile + Move-Item -Force; $statusValue is unchanged since the early write above.
Write-IpcStatus -Evidence $evidence

# Diagnostic log (non-blocking)
try {
    $logLine = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [stop-report] $storyId / $phase / $statusValue (tasks_backfilled=$($evidence.tasks_backfilled), db_status=$($evidence.db_status))"
    $logFile = Join-Path $projectRoot "logs\party-pipeline-stop-report.log"
    Add-Content -Path $logFile -Value $logLine -Encoding UTF8 -ErrorAction SilentlyContinue
} catch { }

exit 0
