#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Register','Confirm')][string]$Mode,
    [Parameter(Mandatory)][string]$RunId,
    # Register mode
    [string]$StoryId = '',
    [string]$Phase = '',
    [string]$IpcDir = '',
    [string]$SessionId = '',
    [string]$ControllerTrack = '',
    [string]$ModelId = '',
    [string]$Effort = '',
    [string]$WorkRoot = '',
    [string]$BaselineCommit = '',
    [int]$Attempt = 1,
    # Confirm mode
    [int]$WrapperPid = 0,
    [string]$CmdLine = '',
    [string]$WindowTitle = ''
)
# ---- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# register-run.ps1  v1.0.0
# [whp-4-write-path-wiring] One action, two modes -- register a worker_runs row and
# confirm it after spawn (SDD Spec SS4.2, BR-105~BR-108, BR-134).
#
# -Mode Register (called BEFORE Start-Process, SDD SS4.3 insertion point):
#   1. fullUpsert into worker_runs: lifecycle='dispatching', wrapper_pid=NULL,
#      started_at=now -- INSERT happens before spawn so "registered but never started"
#      leaves a trace (SSoT SSS0 + idempotency scenario E2).
#   2. Calls ensure-guardian.ps1 (BR-108, fail-open -- guardian is not on the critical path).
#
# -Mode Confirm (called AFTER Start-Process, once the wrapper PID is known):
#   mergeRun (field-scoped UPDATE): wrapper_pid / cmd_line / window_title / lifecycle='running'.
#   Touches ONLY these four columns (BR-107) -- never a full-row replace, so any field another
#   writer (guardian / stop-report heartbeat) already set in between stays untouched.
#
# All DB writes go through .context-db/scripts/upsert-worker-run.js (BR-134: JSON FILE path
# argument; the inline-JSON CLI form is deliberately never used here -- window_title/cmd_line carry
# user-controllable Story IDs and paths, and inline string concatenation has a quote-escaping
# attack surface). AC16 greps this file for that flag literal, so it must not appear even in prose.
#
# Exit codes: 0 = success / 1 = write failed (caller SHALL abort dispatch, SSoT SS22.1)
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$upsertScript = Join-Path $ProjectRoot ".context-db\scripts\upsert-worker-run.js"

function Invoke-UpsertWorkerRun {
    # NOTE: parameter deliberately NOT named $Args -- that collides with PowerShell's reserved
    # automatic $args variable and silently breaks splatting (2026-07-29 whp-4 smoke-test bug:
    # -Mode Confirm always fell through to fullUpsert's REQUIRED_FULL_FIELDS check because
    # @Args below resolved to the wrong array).
    param([string[]]$CliArgs, [string]$JsonFilePath)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & node --max-old-space-size=256 $upsertScript @CliArgs $JsonFilePath 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    return @{ Output = ($output -join "`n"); ExitCode = $exitCode }
}

if ($Mode -eq 'Register') {
    if (-not $StoryId -or -not $Phase -or -not $IpcDir -or -not $SessionId) {
        Write-Host "register-run.ps1 -Mode Register requires -StoryId -Phase -IpcDir -SessionId"
        exit 1
    }
    $payload = @{
        run_id           = $RunId
        session_id       = $SessionId
        story_id         = $StoryId
        phase            = $Phase
        controller_track = if ($ControllerTrack) { $ControllerTrack } else { Get-ControllerTrackId }
        ipc_dir          = $IpcDir
        model_id         = if ($ModelId) { $ModelId } else { $null }
        effort           = if ($Effort) { $Effort } else { $null }
        work_root        = if ($WorkRoot) { $WorkRoot } else { $null }
        baseline_commit  = if ($BaselineCommit) { $BaselineCommit } else { $null }
        lifecycle        = 'dispatching'
        started_at       = Get-TaiwanTimestamp
    }
    # attempt: 只在呼叫端顯式指定時傳遞;省略時由 upsert-worker-run.js 自算 MAX(attempt)+1,
    # 重派(斷電/失敗後二次派發)不再撞 ux_worker_runs_key(BC-03)。2026-07-29。
    if ($PSBoundParameters.ContainsKey('Attempt')) { $payload.attempt = $Attempt }
    $tmpJson = Join-Path (Get-LogDir) "register-run-$RunId-$(Get-Date -Format 'HHmmssfff').json"
    Write-JsonFile -Path $tmpJson -Data $payload

    $result = Invoke-UpsertWorkerRun -CliArgs @() -JsonFilePath $tmpJson
    Remove-Item $tmpJson -ErrorAction SilentlyContinue

    if ($result.ExitCode -ne 0) {
        # BC-03: ux_worker_runs_key (story_id, phase, attempt) unique index collision --
        # fullUpsert takes the INSERT branch (run_id is new) and SQLite throws on the unique
        # constraint. Detect the SQLite error signature and surface an actionable message
        # rather than the raw stack trace.
        if ($result.Output -match '(?i)unique constraint|ux_worker_runs_key') {
            Write-PpLog "register-run.ps1: story '$StoryId' phase '$Phase' attempt $Attempt already registered -- pass -Attempt $($Attempt + 1)" "ERROR"
        } else {
            Write-PpLog "register-run.ps1: Register failed for run $RunId -- $($result.Output)" "ERROR"
        }
        exit 1
    }
    Write-PpLog "register-run.ps1: Registered run $RunId (story=$StoryId phase=$Phase lifecycle=dispatching)" "DB"

    # BR-108: Ensure-Guardian called AFTER Register, BEFORE spawn -- non-critical path,
    # a non-zero exit here SHALL NOT abort dispatch.
    $ensureScript = Join-Path $ScriptsDir "ensure-guardian.ps1"
    if (Test-Path $ensureScript) {
        try {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            & powershell -NoProfile -ExecutionPolicy Bypass -File $ensureScript 2>&1 | Out-Null
            $ErrorActionPreference = $prevEAP
        } catch {
            Write-PpLog "register-run.ps1: Ensure-Guardian threw (non-fatal): $_" "WARN"
        }
    }
    exit 0
}

# -Mode Confirm
if ($WrapperPid -le 0) {
    Write-Host "register-run.ps1 -Mode Confirm requires -WrapperPid > 0"
    exit 1
}
$updates = @{
    wrapper_pid  = $WrapperPid
    cmd_line     = if ($CmdLine) { $CmdLine } else { $null }
    window_title = if ($WindowTitle) { $WindowTitle } else { $null }
    lifecycle    = 'running'
}
$tmpJson = Join-Path (Get-LogDir) "register-run-confirm-$RunId-$(Get-Date -Format 'HHmmssfff').json"
Write-JsonFile -Path $tmpJson -Data $updates

$result = Invoke-UpsertWorkerRun -CliArgs @('--merge', $RunId) -JsonFilePath $tmpJson
Remove-Item $tmpJson -ErrorAction SilentlyContinue

if ($result.ExitCode -ne 0) {
    Write-PpLog "register-run.ps1: Confirm failed for run $RunId -- $($result.Output)" "ERROR"
    exit 1
}
Write-PpLog "register-run.ps1: Confirmed run $RunId (wrapper_pid=$WrapperPid lifecycle=running)" "DB"
exit 0
