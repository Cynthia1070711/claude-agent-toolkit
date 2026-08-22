#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StoryId,
    [Parameter(Mandatory)][string]$Phase,
    [switch]$Json,
    [switch]$Resume
)
# ---- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# preflight-dispatch.ps1  v1.0.0
# [whp-4-write-path-wiring] S0 five-check dispatch gate (SDD Spec SS4.1, BR-101~BR-104, BR-136)
#
# Five checks evaluated in order, first BLOCK stops immediately:
#   1. STORY_STATE       -- story exists AND status matches this phase's precondition
#                            (story not found in `stories` table -> SKIP this check, fall through --
#                            worker_runs rows can exist for a story never enriched into `stories`)
#   2. NON_TERMINAL_RUN   -- no non-terminal run for this story across ANY phase (SSoT G19,
#                            per-story not per-story+phase). Narrow carve-out (whp-11 Gap 2,
#                            BR-020~024): lifecycle='revising' + -Resume + the prior window's
#                            wrapper_pid is confirmed dead (4-Tuple judgeLiveness(), reused
#                            verbatim from reap-worker-runs.js, never redeclared) -- PASS,
#                            reason tagged REVISE_REVIVE. Any other non-terminal lifecycle,
#                            missing -Resume, or a liveness-probe failure all still BLOCK
#                            (probe failure fails CLOSED here -- the opposite of this script's
#                            usual fail-open elsewhere -- because misjudging "dead" opens a
#                            second window on a worker that is actually still alive, which is
#                            the exact failure mode this whole check exists to prevent).
#   3. PREV_PHASE_CLOSED  -- the predecessor phase's latest run (if any) has reached a terminal
#                            lifecycle (closed/failed/abandoned) -- NOT strictly lifecycle='closed',
#                            because a failed/abandoned predecessor must not deadlock the pipeline
#                            forever (only-notify-never-kill philosophy: a human judges consequences,
#                            preflight only judges "did it stop running")
#   4. MIGRATION_WINDOW   -- no dotnet-ef migration process detected via WMI (native PowerShell,
#                            no DB dependency; WMI probe failure -> fail-open)
#   5. UNREAD_MESSAGES    -- no unread must-read ctrl-channel thread addressed to this controller
#                            track (track unknown via $env:PHYCOOL_CONTROLLER_TRACK, or DB
#                            unavailable -> fail-open)
#
# Checks 1/2/3/5 share one DB query (single node subprocess, see BR-103: NON_TERMINAL_LIFECYCLES /
# TERMINAL_LIFECYCLES are imported from reap-worker-runs.js, never redeclared here). If the DB
# itself is unreachable, all four fail open together (there is no sane way to judge story/run
# state without it) -- check 4 is WMI-native and evaluates independently regardless.
#
# Exit codes: 0 = PASS (including fail-open SKIPPED) / 1 = BLOCK / 2 = bad arguments
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

if (-not $StoryId -or -not $Phase) {
    Write-Host "Usage: preflight-dispatch.ps1 -StoryId <id> -Phase <phase> [-Json]"
    exit 2
}

$ProjectRoot     = Get-ProjectRoot
$dbPath          = Get-DbPath
$controllerTrack = Get-ControllerTrackId
$reapScript      = Join-Path $ProjectRoot ".context-db\scripts\reap-worker-runs.js"

# (BR-101/BR-136) Phase precondition table -- the Story status a phase expects BEFORE it starts.
# 'general' is intentionally absent: Mode C tasks are not Story-state-driven.
$phasePrecondition = @{
    'create-story'      = @('backlog')
    'dev-story'          = @('ready-for-dev','in-progress')
    'dev-story-complex'  = @('ready-for-dev','in-progress')
    'dev-story-fix-R1'   = @('review','in-progress')
    'dev-story-fix-R2'   = @('review','in-progress')
    'code-review'        = @('review','in-progress')
    'code-review-R1'     = @('review','in-progress')
    'code-review-R2'     = @('review','in-progress')
}
# Predecessor phase (PREV_PHASE_CLOSED lookup) -- create-story/general have none.
$phasePredecessor = @{
    'dev-story'          = 'create-story'
    'dev-story-complex'  = 'create-story'
    'dev-story-fix-R1'   = 'code-review'
    'dev-story-fix-R2'   = 'code-review'
    'code-review'        = 'dev-story'
    'code-review-R1'     = 'code-review'
    'code-review-R2'     = 'code-review-R1'
}

$checks = New-Object System.Collections.ArrayList
function Add-Check {
    param([string]$Code, [string]$Status, [string]$Message)
    [void]$checks.Add(@{ code = $Code; status = $Status; message = $Message })
}

$blockCode = $null
$blockMessage = ''

# ---- Checks 1/2/3/5: single combined DB query (BC-15: DB unavailable -> all four fail open) ----
$dbOut = $null
try {
    $predecessor = if ($phasePredecessor.ContainsKey($Phase)) { $phasePredecessor[$Phase] } else { '' }
    # (whp-4 CR F5) story_id / predecessor / controller track go in as process.argv -- never
    # interpolated into this source. An id carrying an apostrophe would otherwise turn a BLOCK
    # decision into a SyntaxError that silently fails open (and an id carrying ..\ would steer
    # the temp filename out of %TEMP%). Same rule register-run.ps1 states for its payloads.
    $nodeTemplate = @'
const Database = require('__SQLITE_MODULE__');
const { pathToFileURL } = require('url');

(async () => {
  const out = { db_unavailable: false };
  const storyId = process.argv[2];
  try {
    const reapUrl = pathToFileURL('__REAP_SCRIPT__').href;
    const { NON_TERMINAL_LIFECYCLES, TERMINAL_LIFECYCLES, judgeLiveness, probeLiveProcesses } = await import(reapUrl);
    const db = new Database('__DB_PATH__', { readonly: true });

    const story = db.prepare('SELECT status FROM stories WHERE story_id = ?').get(storyId);
    out.story_status = story ? story.status : null;

    const ntPh = NON_TERMINAL_LIFECYCLES.map(() => '?').join(',');
    const ntRun = db.prepare(
      `SELECT run_id, phase, lifecycle, wrapper_pid, ipc_dir FROM worker_runs WHERE story_id = ? AND lifecycle IN (${ntPh}) ORDER BY started_at DESC LIMIT 1`
    ).get(storyId, ...NON_TERMINAL_LIFECYCLES);
    out.non_terminal_run = ntRun || null;

    // (whp-11 Gap 2, BR-020~024) Only the REVISE_REVIVE carve-out consumes this, but it is
    // computed whenever a non-terminal run exists (not gated on lifecycle here) -- keeping
    // the liveness judgement itself unconditional means the PowerShell side owns the entire
    // carve-out eligibility decision (lifecycle==='revising' AND -Resume), matching how every
    // other check in this script keeps its DB read and its PASS/BLOCK judgement separate.
    if (ntRun) {
      try {
        // BR-024 test-only escape hatch (same idiom as close-worker.ps1's
        // PHYCOOL_CLOSEWORKER_FORCE_SURVIVE / worker-kill-guard.js's
        // PHYCOOL_KILLGUARD_BYPASS): forces the probe-failure branch without
        // depending on a real, flaky WMI/environment failure.
        if (process.env.PHYCOOL_PREFLIGHT_FORCE_PROBE_FAIL === '1') {
          throw new Error('forced failure for testing (PHYCOOL_PREFLIGHT_FORCE_PROBE_FAIL=1)');
        }
        const liveProcMap = probeLiveProcesses();
        // probe_failed always present (even false) -- preflight-dispatch.ps1 runs under
        // Set-StrictMode -Version Latest, where referencing a genuinely-absent PSCustomObject
        // property throws PropertyNotFoundStrict (unlike a hashtable's silent $null), so the
        // PowerShell side's `$liveness.probe_failed` read must never hit a missing key.
        out.non_terminal_run_liveness = { ...judgeLiveness(ntRun, liveProcMap), probe_failed: false };
      } catch (e) {
        out.non_terminal_run_liveness = { alive: null, probe_failed: true, error: e.message };
      }
    }

    // '-' sentinel: Windows PowerShell 5.1 drops empty-string arguments to native commands,
    // which would silently shift argv and hand the controller track to the predecessor slot.
    const predecessor = (process.argv[3] && process.argv[3] !== '-') ? process.argv[3] : '';
    if (predecessor) {
      const prevRun = db.prepare(
        'SELECT run_id, phase, lifecycle FROM worker_runs WHERE story_id = ? AND phase = ? ORDER BY started_at DESC LIMIT 1'
      ).get(storyId, predecessor);
      out.prev_phase_run = prevRun || null;
      out.terminal_lifecycles = TERMINAL_LIFECYCLES;
    }

    const track = (process.argv[4] && process.argv[4] !== '-') ? process.argv[4] : '';
    if (track && track !== 'unspecified') {
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM ctrl_messages m JOIN ctrl_threads t ON t.thread_id = m.thread_id " +
        "WHERE t.must_read = 1 AND t.state = 'open' AND m.to_tracks LIKE '%\"' || ? || '\"%' " +
        "AND NOT EXISTS (SELECT 1 FROM ctrl_message_reads r WHERE r.msg_id = m.msg_id AND r.track = ?)"
      ).get(track, track);
      out.unread_count = row.cnt;
    } else {
      out.unread_count = null;
    }

    db.close();
  } catch (e) {
    out.db_unavailable = true;
    out.error = e.message;
  }
  console.log(JSON.stringify(out));
})();
'@
    $sqliteModule = (Join-Path $ProjectRoot ".context-db\node_modules\better-sqlite3") -replace '\\', '/'
    # String.Replace (literal) not -replace (regex): only machine-derived paths are substituted here.
    $nodeScript = $nodeTemplate
    $nodeScript = $nodeScript.Replace('__SQLITE_MODULE__', $sqliteModule)
    $nodeScript = $nodeScript.Replace('__REAP_SCRIPT__', ($reapScript -replace '\\', '/'))
    $nodeScript = $nodeScript.Replace('__DB_PATH__', ($dbPath -replace '\\', '/'))

    $tmpJs = Join-Path $env:TEMP "preflight-dispatch-$([System.IO.Path]::GetRandomFileName()).js"
    [System.IO.File]::WriteAllText($tmpJs, $nodeScript, [System.Text.UTF8Encoding]::new($false))
    $argPred  = if ($predecessor) { $predecessor } else { '-' }
    $argTrack = if ($controllerTrack) { $controllerTrack } else { '-' }
    $jsonOut = & node $tmpJs $StoryId $argPred $argTrack 2>$null
    Remove-Item $tmpJs -ErrorAction SilentlyContinue
    if ($jsonOut) { $dbOut = $jsonOut | ConvertFrom-Json }
} catch {
    $dbOut = $null
}

$dbAvailable = $dbOut -and (-not $dbOut.db_unavailable)

if (-not $dbAvailable) {
    Add-Check 'STORY_STATE' 'SKIPPED' 'DB unavailable -- cannot read story status'
    Add-Check 'NON_TERMINAL_RUN' 'SKIPPED' 'DB unavailable -- cannot query worker_runs'
    Add-Check 'PREV_PHASE_CLOSED' 'SKIPPED' 'DB unavailable -- cannot query worker_runs'
    Add-Check 'UNREAD_MESSAGES' 'SKIPPED' 'DB unavailable -- cannot query ctrl_messages'
} else {
    # ---- Check 1: STORY_STATE ----
    if (-not $blockCode) {
        if (-not $phasePrecondition.ContainsKey($Phase)) {
            Add-Check 'STORY_STATE' 'SKIPPED' "phase '$Phase' has no Story-state precondition (not Story-driven)"
        } elseif ($null -eq $dbOut.story_status) {
            Add-Check 'STORY_STATE' 'SKIPPED' "story_id '$StoryId' not found in stories table -- cannot validate state"
        } else {
            $expected = $phasePrecondition[$Phase]
            if ($expected -contains $dbOut.story_status) {
                Add-Check 'STORY_STATE' 'PASS' "status=$($dbOut.story_status) satisfies precondition"
            } else {
                $blockCode = 'STORY_STATE'
                $blockMessage = "BLOCK: STORY_STATE actual_status=$($dbOut.story_status) expected=$($expected -join '|') phase=$Phase"
                Add-Check 'STORY_STATE' 'BLOCK' $blockMessage
            }
        }
    }

    # ---- Check 2: NON_TERMINAL_RUN (per-story, any phase) ----
    if (-not $blockCode) {
        if ($dbOut.non_terminal_run) {
            $r = $dbOut.non_terminal_run
            $liveness = $dbOut.non_terminal_run_liveness
            $carveOutEligible = $Resume -and ($r.lifecycle -eq 'revising')

            if ($carveOutEligible -and $liveness -and $liveness.probe_failed) {
                # BR-024: a liveness-probe failure must refuse the carve-out (fail CLOSED),
                # not be treated as "confirmed dead" -- see header comment above Check 2.
                # (whp-11 CR) surface the captured probe error: without it, a permanent import
                # breakage in reap-worker-runs.js would be indistinguishable from a transient
                # WMI failure and the carve-out would silently degrade to always-BLOCK.
                $probeErr = if ($liveness.error) { " ($($liveness.error))" } else { "" }
                $blockCode = 'NON_TERMINAL_RUN'
                $blockMessage = "BLOCK: NON_TERMINAL_RUN run_id=$($r.run_id) lifecycle=$($r.lifecycle) phase=$($r.phase) -- REVISE_REVIVE liveness probe failed$probeErr, refusing carve-out"
                Add-Check 'NON_TERMINAL_RUN' 'BLOCK' $blockMessage
            } elseif ($carveOutEligible -and $liveness -and ($liveness.alive -eq $true)) {
                # BR-021: prior window is still alive -- wake it in place (D3), do not open a second one.
                $blockCode = 'NON_TERMINAL_RUN'
                $blockMessage = "BLOCK: NON_TERMINAL_RUN run_id=$($r.run_id) lifecycle=$($r.lifecycle) phase=$($r.phase) -- prior window still alive, wake it in the same window instead of -Resume"
                Add-Check 'NON_TERMINAL_RUN' 'BLOCK' $blockMessage
            } elseif ($carveOutEligible -and $liveness -and ($liveness.alive -eq $false)) {
                # BR-020: narrow carve-out -- revising + -Resume + confirmed-dead prior window.
                Add-Check 'NON_TERMINAL_RUN' 'PASS' "REVISE_REVIVE: run_id=$($r.run_id) lifecycle=revising, prior window confirmed dead ($($liveness.reason)) -- -Resume will re-attach"
            } else {
                # BR-022/BR-023: not eligible (wrong lifecycle, or -Resume not given).
                $blockCode = 'NON_TERMINAL_RUN'
                $blockMessage = "BLOCK: NON_TERMINAL_RUN run_id=$($r.run_id) lifecycle=$($r.lifecycle) phase=$($r.phase)"
                Add-Check 'NON_TERMINAL_RUN' 'BLOCK' $blockMessage
            }
        } else {
            Add-Check 'NON_TERMINAL_RUN' 'PASS' 'no non-terminal run for this story'
        }
    }

    # ---- Check 3: PREV_PHASE_CLOSED ----
    if (-not $blockCode) {
        if (-not $predecessor) {
            Add-Check 'PREV_PHASE_CLOSED' 'SKIPPED' "phase '$Phase' has no predecessor phase"
        } elseif (-not $dbOut.prev_phase_run) {
            Add-Check 'PREV_PHASE_CLOSED' 'PASS' "predecessor phase '$predecessor' has no run yet"
        } else {
            $pr = $dbOut.prev_phase_run
            $terminal = @($dbOut.terminal_lifecycles)
            if ($terminal -contains $pr.lifecycle) {
                Add-Check 'PREV_PHASE_CLOSED' 'PASS' "predecessor phase '$predecessor' run reached terminal lifecycle=$($pr.lifecycle)"
            } else {
                $blockCode = 'PREV_PHASE_CLOSED'
                $blockMessage = "BLOCK: PREV_PHASE_CLOSED prev_phase=$predecessor lifecycle=$($pr.lifecycle) run_id=$($pr.run_id)"
                Add-Check 'PREV_PHASE_CLOSED' 'BLOCK' $blockMessage
            }
        }
    }

    # ---- Check 5 (evaluated here, before check 4 output ordering below): UNREAD_MESSAGES ----
    # (data collected above; final ordering vs check 4 is enforced when emitting output)
}

# ---- Check 4: MIGRATION_WINDOW (WMI-native, independent of DB availability) ----
if (-not $blockCode) {
    try {
        $dotnetProcs = @(Get-WmiObject Win32_Process -Filter "Name='dotnet.exe'" -ErrorAction Stop)
        $migrating = $dotnetProcs | Where-Object {
            $_.CommandLine -and ($_.CommandLine -match '(?i)ef\s+(migrations|database\s+update)')
        }
        if ($migrating -and $migrating.Count -gt 0) {
            $blockCode = 'MIGRATION_WINDOW'
            $blockMessage = "BLOCK: MIGRATION_WINDOW $($migrating.Count) active dotnet-ef process(es) detected"
            Add-Check 'MIGRATION_WINDOW' 'BLOCK' $blockMessage
        } else {
            Add-Check 'MIGRATION_WINDOW' 'PASS' 'no active dotnet-ef migration process'
        }
    } catch {
        Add-Check 'MIGRATION_WINDOW' 'SKIPPED' "WMI probe unavailable: $($_.Exception.Message)"
    }
}

# ---- Check 5: UNREAD_MESSAGES (uses data collected in the combined DB query above) ----
if (-not $blockCode) {
    if (-not $dbAvailable) {
        # already added as SKIPPED above
    } elseif ($controllerTrack -eq 'unspecified') {
        Add-Check 'UNREAD_MESSAGES' 'SKIPPED' 'PHYCOOL_CONTROLLER_TRACK unset -- cannot determine whose unread queue to check'
    } elseif ($null -eq $dbOut.unread_count) {
        Add-Check 'UNREAD_MESSAGES' 'SKIPPED' 'controller track unresolved'
    } elseif ([int]$dbOut.unread_count -gt 0) {
        $blockCode = 'UNREAD_MESSAGES'
        $blockMessage = "BLOCK: UNREAD_MESSAGES track=$controllerTrack unread=$($dbOut.unread_count)"
        Add-Check 'UNREAD_MESSAGES' 'BLOCK' $blockMessage
    } else {
        Add-Check 'UNREAD_MESSAGES' 'PASS' "track=$controllerTrack has zero unread must-read messages"
    }
}

# ---- Emit result ----
$overallStatus = if ($blockCode) { 'BLOCK' } else { 'PASS' }
if ($Json) {
    $out = @{
        status      = $overallStatus
        reason_code = $blockCode
        message     = $blockMessage
        story_id    = $StoryId
        phase       = $Phase
        checks      = @($checks.ToArray())
    }
    Write-Output ($out | ConvertTo-Json -Depth 6)
} else {
    if ($blockCode) {
        Write-Output $blockMessage
    } else {
        $skipped = @($checks | Where-Object { $_.status -eq 'SKIPPED' })
        Write-Output "PASS"
        foreach ($s in $skipped) {
            Write-Output "SKIPPED: $($s.code) -- $($s.message)"
        }
    }
}

if ($blockCode) { exit 1 } else { exit 0 }
