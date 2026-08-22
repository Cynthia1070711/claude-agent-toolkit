# ==============================================================================
# shared-utils.ps1  v1.0.0
# party-to-pipeline v4.0.0 -- Shared helper functions
#
# All scripts (orchestrator / workers / stop-report) dot-source this file:
#   . "$PSScriptRoot\shared-utils.ps1"
#
# Provides:
#   Logger | Path / IPC helpers | Atomic file write | DB I/O wrappers
#   ACK handshake primitives | Process / window management | Phase model lookup
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init 3 行 -- 對齊 phycool-windows-ps-encoding ──
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
$OutputEncoding = [System.Text.Encoding]::UTF8

# ── Logger ────────────────────────────────────────────────────────────────────
function Write-PpLog {
    param(
        [string]$Message,
        [ValidateSet("INFO","SUCCESS","ERROR","WARN","STEP","DEBUG","SYSTEM","DB","IPC","ACK")]
        [string]$Level = "INFO"
    )
    $ts    = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "INFO"    { "Cyan"     }
        "SUCCESS" { "Green"    }
        "ERROR"   { "Red"      }
        "WARN"    { "Yellow"   }
        "STEP"    { "Magenta"  }
        "DEBUG"   { "DarkGray" }
        "SYSTEM"  { "White"    }
        "DB"      { "Magenta"  }
        "IPC"     { "DarkCyan" }
        "ACK"     { "Green"    }
        default   { "White"    }
    }
    Write-Host "[$ts][$Level] $Message" -ForegroundColor $color
}

# ── Taiwan Time (UTC+8) per Constitutional Standard ──────────────────────────
function Get-TaiwanTimestamp {
    return Get-Date -Format "yyyy-MM-ddTHH:mm:ss+08:00"
}

# ── Path helpers ──────────────────────────────────────────────────────────────
# (worktree x p2p PoC -- B1 main-pinned 鐵律, 研究報告 4.5 節): 控制平面 main-pinned / 執行平面 worktree-local.
# Get-ProjectRoot = 控制平面唯一入口 (Get-IpcRoot/Get-DbPath/Get-LogDir/Get-TrackerPath/
# Get-StoryFromDb/Update-DbStatus/Read-PhaseModel/Invoke-PhycoolMcpSafe 全 funnel 此函數),
# env 優先確保 worktree 模式下控制平面 (IPC/DB/log/tracker/MCP) 不隨 worker cwd 漂移;
# 無 env 時 walk-up fallback (現行 pipeline 行為完全不變 -- 向後相容).
function Get-ProjectRoot {
    # main-pinned: PIPELINE_CONTROL_ROOT 優先 (worktree 模式 = 主 repo 絕對路徑; 驗 .claude 防 env 設錯)
    if ($env:PIPELINE_CONTROL_ROOT -and (Test-Path (Join-Path $env:PIPELINE_CONTROL_ROOT ".claude"))) {
        return $env:PIPELINE_CONTROL_ROOT
    }
    # fallback: walk up from PSScriptRoot looking for .claude directory
    $dir = $PSScriptRoot
    while ($dir -and $dir -ne [System.IO.Path]::GetPathRoot($dir)) {
        if (Test-Path (Join-Path $dir ".claude")) { return $dir }
        $dir = Split-Path $dir -Parent
    }
    throw "Cannot locate project root (.claude not found)"
}

# Get-WorkRoot = 執行平面 (worker 在 worktree 跑 git 的 cwd). PIPELINE_WORK_ROOT 優先;
# 無 env 時 fallback Get-ProjectRoot (非 worktree 模式 = 執行平面與控制平面同一根 -- 向後相容).
function Get-WorkRoot {
    if ($env:PIPELINE_WORK_ROOT -and (Test-Path $env:PIPELINE_WORK_ROOT)) {
        return $env:PIPELINE_WORK_ROOT
    }
    return Get-ProjectRoot
}

function Get-IpcRoot {
    $root = Get-ProjectRoot
    $dir  = Join-Path $root ".claude\ipc"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    return $dir
}

function New-IpcDir {
    param([Parameter(Mandatory)][string]$StoryId)
    $ts  = Get-Date -Format "yyyyMMdd-HHmmss"
    $dir = Join-Path (Get-IpcRoot) "${StoryId}__${ts}"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return $dir
}

function Get-DbPath {
    $root = Get-ProjectRoot
    return Join-Path $root ".context-db\phycool.db"
}

function Get-LogDir {
    $root = Get-ProjectRoot
    $dir  = Join-Path $root "logs"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    return $dir
}

# ── Atomic file write (Risk R2 mitigation) ───────────────────────────────────
# Pattern: write to .tmp then Move-Item -Force (NTFS rename is atomic)
function Write-AtomicJson {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][object]$Object
    )
    $tmp  = "$Path.tmp"
    $json = ($Object | ConvertTo-Json -Depth 8)
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
    Move-Item -Path $tmp -Destination $Path -Force
}

# ── Read JSON with retry (Risk R2 mitigation) ────────────────────────────────
function Read-JsonRetry {
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$MaxRetries = 3,
        [int]$BackoffMs  = 200
    )
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            $raw = [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
            if (-not $raw -or $raw.Trim().Length -eq 0) { throw "empty" }
            return ($raw | ConvertFrom-Json)
        } catch {
            if ($i -lt $MaxRetries - 1) {
                Start-Sleep -Milliseconds $BackoffMs
                continue
            }
            throw "Read-JsonRetry: failed after $MaxRetries attempts on $Path -- $_"
        }
    }
}

# ── IPC primitives ───────────────────────────────────────────────────────────
function Write-TaskFile {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][hashtable]$Payload
    )
    $Payload["_created"] = Get-TaiwanTimestamp
    $Payload["phase"]    = $Phase
    Write-AtomicJson -Path "$IpcDir\task-$Phase.json" -Object $Payload
    Write-PpLog "Task written: $Phase" "IPC"
}

function Write-StatusFile {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Status,    # completed | failed | partial
        [object]$Evidence = $null,
        [string]$ErrorMsg = "",
        [string]$SessionId = ""
    )
    $obj = @{
        phase      = $Phase
        status     = $Status
        evidence   = $Evidence
        error      = $ErrorMsg
        session_id = $SessionId
        timestamp  = Get-TaiwanTimestamp
    }
    Write-AtomicJson -Path "$IpcDir\status-$Phase.json" -Object $obj
    Write-PpLog "Status written: $Phase / $Status" "IPC"
}

function Write-AckFile {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][bool]$Ok,
        [string]$Message = "",
        [string]$NextPhase = ""
    )
    $obj = @{
        phase      = $Phase
        ok         = $Ok
        message    = $Message
        next_phase = $NextPhase
        timestamp  = Get-TaiwanTimestamp
    }
    Write-AtomicJson -Path "$IpcDir\ack-$Phase.json" -Object $obj
    Write-PpLog "ACK written: $Phase / ok=$Ok" "ACK"
}

function Wait-StatusFile {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [int]$TimeoutSec = 1800   # 30min default
    )
    $f = "$IpcDir\status-$Phase.json"
    $elapsed = 0
    Write-PpLog "Waiting status: $Phase (timeout ${TimeoutSec}s)..." "INFO"
    while ($elapsed -lt $TimeoutSec) {
        if (Test-Path $f) {
            try {
                $s = Read-JsonRetry -Path $f
                if ($s.status -in @("completed","failed","partial")) { return $s }
            } catch {
                Write-PpLog "Read-JsonRetry transient failure for $Phase status: $_" "DEBUG"
            }
        }
        Write-Host "." -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    Write-Host ""
    Write-PpLog "Status timeout: $Phase (${TimeoutSec}s)" "ERROR"
    return $null
}

function Wait-AckFile {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [int]$TimeoutSec = 60
    )
    $f = "$IpcDir\ack-$Phase.json"
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        if (Test-Path $f) {
            try {
                return (Read-JsonRetry -Path $f)
            } catch {
                Write-PpLog "Read-JsonRetry transient failure for $Phase ack: $_" "DEBUG"
            }
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
    }
    Write-PpLog "ACK timeout: $Phase (${TimeoutSec}s)" "WARN"
    return $null
}

function Clear-IpcStage {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase
    )
    @("task","status","ack") | ForEach-Object {
        $f = "$IpcDir\$_-$Phase.json"
        Remove-Item $f -ErrorAction SilentlyContinue
        Remove-Item "$f.tmp" -ErrorAction SilentlyContinue
    }
    Write-PpLog "Cleared IPC: $Phase" "DEBUG"
}

# ── Tracker (PID + closed_at for triple-confirm Risk R4) ─────────────────────
function Get-TrackerPath {
    return Join-Path (Get-LogDir) "party-pipeline-tracker.json"
}

function Get-ControllerTrackId {
    # 2026-07-25: 派發中控 track 身份(前台軌/後台軌/azure佈署軌/其他軌)。
    # dispatch-general.ps1 -ControllerTrack 參數會把值寫入 $env:PHYCOOL_CONTROLLER_TRACK 後
    # 才 spawn worker,worker 進程繼承同一 env var,故 worker 端 Update-Tracker 呼叫無需額外參數
    # 即可自動取得同一身份。未設定時回傳 "unspecified"(向後相容,不 BLOCK 既有呼叫端)。
    if ($env:PHYCOOL_CONTROLLER_TRACK) { return $env:PHYCOOL_CONTROLLER_TRACK }
    return "unspecified"
}

function Update-Tracker {
    # v5.0.0 (T1.1 + T4.7): 4-Tuple Identity + window_title preservation + files_modified for Layer 3 conflict detection
    # v5.13.0 (2026-07-25): append-only 稽核軌跡(同 story+phase 不同 pid = 不同派發,不再互相覆蓋)
    #   + attempt 計數(第幾次派發)+ controller_track(派發中控身份)。
    #   觸發:重派時 started_at 被舊紀錄覆蓋的 bug(pid 已更新但 started_at 仍是上一輪的),
    #   且舊版無法回答「這個 story+phase 被誰、派發了幾次」。
    param(
        [Parameter(Mandatory)][string]$StoryId,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Status,    # running | closed | failed | killed
        [int]$ProcessId = 0,
        [string]$IpcDir = "",
        [string]$WindowTitle = "",
        [string[]]$FilesModified = @()
    )
    $path = Get-TrackerPath
    $arr  = @()
    if (Test-Path $path) {
        try { $arr = @(Read-JsonRetry -Path $path) } catch { $arr = @() }
    }
    $sameKey = @($arr | Where-Object { $_.story_id -eq $StoryId -and $_.phase -eq $Phase })
    # 同一次派發的狀態轉換(running -> closed/failed/killed)= 同一個 pid;
    # pid 不同(或本次未帶 pid)= 一次全新的派發,不得覆蓋既有歷史紀錄。
    $continuing = if ($ProcessId -gt 0) { $sameKey | Where-Object { $_.pid -eq $ProcessId } | Select-Object -Last 1 } else { $null }

    # Capture cmdline via WMI Win32_Process (4-Tuple defense vs PID reuse)
    $cmdLine = ""
    if ($ProcessId -gt 0) {
        try {
            $proc = Get-WmiObject Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
            if ($proc) { $cmdLine = $proc.CommandLine }
        } catch { }
    }

    $startedAt    = if ($continuing -and $continuing.started_at) { $continuing.started_at } else { Get-TaiwanTimestamp }
    $attempt      = if ($continuing -and $continuing.attempt) { [int]$continuing.attempt } else { $sameKey.Count + 1 }
    $winTitle     = if ($WindowTitle) { $WindowTitle } elseif ($continuing -and $continuing.window_title) { $continuing.window_title } else { "" }
    $effectiveCmd = if ($cmdLine) { $cmdLine } elseif ($continuing -and $continuing.cmd_line) { $continuing.cmd_line } else { "" }
    # files_modified: append-merge with prior (some workers may write multiple times)
    $mergedFiles = @()
    if ($continuing -and $continuing.files_modified) { $mergedFiles += @($continuing.files_modified) }
    if ($FilesModified -and $FilesModified.Count -gt 0) { $mergedFiles += $FilesModified }
    $mergedFiles = @($mergedFiles | Where-Object { $_ } | Select-Object -Unique)

    $entry = @{
        story_id         = $StoryId         # Tuple 1
        phase            = $Phase
        ipc_dir          = $IpcDir           # Tuple 2
        pid              = $ProcessId        # Tuple 3
        cmd_line         = $effectiveCmd     # Tuple 4 (defense vs PID reuse)
        window_title     = $winTitle         # Auxiliary (visual identification)
        files_modified   = $mergedFiles      # T4.7 Layer 3 runtime conflict detection
        status           = $Status
        attempt          = $attempt          # 第幾次派發(1=首次,2+=重派)
        controller_track = Get-ControllerTrackId   # 派發中控身份(前台軌/後台軌/azure佈署軌/unspecified)
        started_at       = $startedAt
        updated_at       = Get-TaiwanTimestamp
    }
    if ($Status -in @("closed","killed","failed")) {
        $entry["closed_at"] = Get-TaiwanTimestamp
    }
    if ($continuing) {
        # 同一次派發的狀態轉換 -> 就地取代該筆,不新增重複列
        $arr = @($arr | Where-Object { -not ($_.story_id -eq $StoryId -and $_.phase -eq $Phase -and $_.pid -eq $ProcessId) })
    }
    # 不同派發(不同 pid)一律 append,絕不刪除既有歷史紀錄
    $arr += $entry
    Write-AtomicJson -Path $path -Object $arr

    # BR-126/BR-127(whp-4 T5.1):DB 雙寫 -- 僅 $env:PIPELINE_RUN_ID 有值時執行,無值(既有非本
    # 協議呼叫端,如 orchestrator.ps1 / smoke-test.ps1)靜默跳過,行為與本卡落地前完全相同。範圍
    # 依 SDD Spec §3.3 欄位寫入權歸屬矩陣收斂為 wrapper_pid/cmd_line/window_title 三欄 -- lifecycle
    # 已由 register-run.ps1 -Mode Confirm 專責(dispatching->running),files_modified 已由
    # stop-report.ps1 心跳專責(每 turn merge),本函式不得覆寫這兩欄。DB 寫入失敗絕不影響上面已
    # 完成的檔案寫入,亦不 throw(比照 Update-DbStatus:507-534 既有 fail-open 慣例)。
    $runId = $env:PIPELINE_RUN_ID
    if ($runId) {
        try {
            $root   = Get-ProjectRoot
            $upsert = Join-Path $root ".context-db\scripts\upsert-worker-run.js"
            if (Test-Path $upsert) {
                $dbUpdates = @{
                    wrapper_pid  = $ProcessId
                    cmd_line     = $effectiveCmd
                    window_title = $winTitle
                }
                $tmp  = Join-Path (Get-LogDir) "tracker-db-$StoryId-$Phase-$(Get-Date -Format 'HHmmss').json"
                [System.IO.File]::WriteAllText($tmp, ($dbUpdates | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
                $prevEAP = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                try {
                    & node --max-old-space-size=256 $upsert --quiet --merge $runId $tmp 2>$null
                } finally {
                    $ErrorActionPreference = $prevEAP
                }
                Remove-Item $tmp -ErrorAction SilentlyContinue
            }
        } catch {
            Write-PpLog "Update-Tracker DB dual-write skipped (non-fatal): $_" "WARN"
        }
    }
}

function Get-TrackerEntry {
    # 回傳同 story+phase 的「最新一次派發」紀錄(array 為 append-only,故取最後一筆)。
    param(
        [Parameter(Mandatory)][string]$StoryId,
        [Parameter(Mandatory)][string]$Phase
    )
    $path = Get-TrackerPath
    if (-not (Test-Path $path)) { return $null }
    try {
        $arr = @(Read-JsonRetry -Path $path)
        return ($arr | Where-Object { $_.story_id -eq $StoryId -and $_.phase -eq $Phase } | Select-Object -Last 1)
    } catch { return $null }
}

# ── Quad-Confirm window closed (v5.0.0 T1.1: defense vs Windows PID reuse) ───
# 4 layers: PID dead + tracker.closed_at + ack file present + ack mtime > started_at
# Backward-compatible signature (callers in orchestrator.ps1 unchanged).
function Wait-WindowClosed {
    param(
        [Parameter(Mandatory)][System.Diagnostics.Process]$Proc,
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$StoryId,
        [int]$TimeoutSec = 30
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        # Layer 1: PID dead
        $pidDead = $Proc.HasExited
        # Layer 2: tracker marked closed (with story_id match -- implicit via Get-TrackerEntry filter)
        $trkEntry  = Get-TrackerEntry -StoryId $StoryId -Phase $Phase
        $trkClosed = ($trkEntry -and $trkEntry.status -in @("closed","killed","failed"))
        # Layer 3: ack file present
        $ackFile   = "$IpcDir\ack-$Phase.json"
        $ackPresent = Test-Path $ackFile
        # Layer 4 (NEW v5.0.0): ack mtime > tracker.started_at (defense vs stale ack from prior run)
        $ackFresh = $false
        if ($ackPresent -and $trkEntry -and $trkEntry.started_at) {
            try {
                $ackMtime  = (Get-Item $ackFile).LastWriteTime
                $startedAt = [datetime]::Parse($trkEntry.started_at)
                $ackFresh  = $ackMtime -gt $startedAt
            } catch { $ackFresh = $false }
        }
        # Quad-confirm: PID dead AND (tracker closed OR (ack present AND ack fresh))
        if ($pidDead -and ($trkClosed -or ($ackPresent -and $ackFresh))) {
            Write-PpLog "Window closed (quad-confirm): $Phase [pid_dead=$pidDead trk_closed=$trkClosed ack_fresh=$ackFresh]" "SUCCESS"
            return $true
        }
        if ($pidDead) {
            Write-PpLog "PID exited but tracker/ack incomplete (trk_closed=$trkClosed ack_present=$ackPresent ack_fresh=$ackFresh) -- accept anyway" "WARN"
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ── Stop-WorkerSafe (v5.0.0 T1.1: 4-Tuple verify before kill) ────────────────
# Defense vs Windows PID reuse -- never kill a process unless 4-Tuple matches.
function Stop-WorkerSafe {
    param(
        [Parameter(Mandatory)][string]$IpcDir,
        [Parameter(Mandatory)][string]$StoryId,
        [Parameter(Mandatory)][string]$Phase
    )
    # Tuple 1+2: tracker entry must match story_id + ipc_dir
    $tracker = Get-TrackerEntry -StoryId $StoryId -Phase $Phase
    if (-not $tracker) {
        Write-PpLog "Stop-WorkerSafe: tracker missing for $StoryId/$Phase -- cannot identify worker, ABORT kill" "WARN"
        return $false
    }
    if ($tracker.ipc_dir -ne $IpcDir) {
        Write-PpLog "Stop-WorkerSafe: tracker.ipc_dir mismatch (got '$($tracker.ipc_dir)', want '$IpcDir') -- ABORT kill" "ERROR"
        return $false
    }
    if (-not $tracker.pid -or $tracker.pid -le 0) {
        Write-PpLog "Stop-WorkerSafe: tracker.pid invalid -- ABORT kill" "WARN"
        return $false
    }

    # Already dead?
    $proc = $null
    try { $proc = Get-Process -Id $tracker.pid -ErrorAction SilentlyContinue } catch { }
    if (-not $proc) {
        Write-PpLog "Stop-WorkerSafe: PID $($tracker.pid) already dead" "DEBUG"
        Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'closed' -ProcessId $tracker.pid -IpcDir $IpcDir
        return $true
    }

    # Tuple 3+4: WMI cmdline match (defense vs PID reuse)
    $wmiProc = $null
    try { $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$($tracker.pid)" -ErrorAction SilentlyContinue } catch { }
    if (-not $wmiProc) {
        Write-PpLog "Stop-WorkerSafe: WMI lookup failed for PID $($tracker.pid) -- ABORT kill" "WARN"
        return $false
    }

    # CmdLine must contain IpcDir path (binding to specific worker invocation)
    if ($wmiProc.CommandLine -notmatch [regex]::Escape($IpcDir)) {
        Write-PpLog "Stop-WorkerSafe: PID $($tracker.pid) cmdline does NOT contain IpcDir '$IpcDir' -- PID likely reused, ABORT kill" "ERROR"
        Write-PpLog "  Actual cmdline: $($wmiProc.CommandLine)" "DEBUG"
        return $false
    }
    # CmdLine must reference worker-{scriptSuffix}.ps1
    # SKL-09 Bug #8 fix (2026-05-09): phase 名稱 vs script 名稱 convention 不一致
    # Phase: create-story / dev-story / code-review
    # Script: worker-create.ps1 / worker-dev.ps1 / worker-review.ps1
    $scriptSuffix = switch ($Phase) {
        'create-story' { 'create' }
        'dev-story'    { 'dev' }
        'code-review'  { 'review' }
        default        { $Phase }
    }
    if ($wmiProc.CommandLine -notmatch "worker-$scriptSuffix\.ps1") {
        Write-PpLog "Stop-WorkerSafe: PID $($tracker.pid) cmdline NOT a worker-$scriptSuffix.ps1 -- ABORT kill" "ERROR"
        return $false
    }
    # CmdLine should match tracker.cmd_line if recorded (extra defense)
    if ($tracker.cmd_line -and $wmiProc.CommandLine -ne $tracker.cmd_line) {
        Write-PpLog "Stop-WorkerSafe: PID $($tracker.pid) cmdline changed since tracker recorded -- ABORT kill" "ERROR"
        return $false
    }

    # All 4 tuples confirm → safe to kill
    Write-PpLog "Stop-WorkerSafe: 4-Tuple verified, killing PID $($tracker.pid) ($StoryId/$Phase)" "WARN"
    try {
        & taskkill /T /F /PID $tracker.pid 2>$null | Out-Null
        Stop-Process -Id $tracker.pid -Force -ErrorAction SilentlyContinue
    } catch { }
    Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'killed' -ProcessId $tracker.pid -IpcDir $IpcDir
    return $true
}

# ── DB I/O ───────────────────────────────────────────────────────────────────
function Get-StoryFromDb {
    param([Parameter(Mandatory)][string]$StoryId)
    $root  = Get-ProjectRoot
    $query = Join-Path $root ".context-db\scripts\query-stories.js"
    if (-not (Test-Path $query)) { Write-PpLog "query-stories.js not found" "WARN"; return $null }
    try {
        $json = & node $query --id $StoryId --format json 2>$null
        if (-not $json) { return $null }
        $obj = $json | ConvertFrom-Json
        if ($obj -is [array]) { $obj = $obj[0] }
        return $obj
    } catch {
        Write-PpLog "Get-StoryFromDb failed: $_" "WARN"
        return $null
    }
}

function Get-StoryStatus {
    param([Parameter(Mandatory)][string]$StoryId)
    $story = Get-StoryFromDb -StoryId $StoryId
    if ($story -and $story.status) { return $story.status }
    return "not-found"
}

function Update-DbStatus {
    param(
        [Parameter(Mandatory)][string]$StoryId,
        [Parameter(Mandatory)][string]$NewStatus,
        [hashtable]$ExtraFields = @{}
    )
    $root   = Get-ProjectRoot
    $upsert = Join-Path $root ".context-db\scripts\upsert-story.js"
    if (-not (Test-Path $upsert)) { Write-PpLog "upsert-story.js not found" "WARN"; return }
    try {
        $updates = @{ status = $NewStatus }
        $now = Get-TaiwanTimestamp
        switch ($NewStatus) {
            "creating"      { $updates.create_started_at   = $now }
            "ready-for-dev" { $updates.create_completed_at = $now }
            "in-progress"   { $updates.started_at          = $now }
            "review"        { $updates.completed_at        = $now }
            "reviewing"     { $updates.review_started_at   = $now }
            "done"          { $updates.review_completed_at = $now }
        }
        foreach ($k in $ExtraFields.Keys) { $updates[$k] = $ExtraFields[$k] }
        $tmp  = Join-Path (Get-LogDir) "db-update-$StoryId-$(Get-Date -Format 'HHmmss').json"
        $body = ($updates | ConvertTo-Json -Depth 5)
        [System.IO.File]::WriteAllText($tmp, $body, [System.Text.UTF8Encoding]::new($false))
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & node --max-old-space-size=256 $upsert --quiet --merge $StoryId $tmp 2>$null
        } finally {
            $ErrorActionPreference = $prevEAP
        }
        Remove-Item $tmp -ErrorAction SilentlyContinue
        Write-PpLog "DB merged: $StoryId / status=$NewStatus" "DB"
    } catch {
        Write-PpLog "Update-DbStatus failed: $_" "WARN"
    }
}

# ── phaseModelMapping lookup (BR-MR-02 helper) ───────────────────────────────
function Read-PhaseModel {
    param(
        [Parameter(Mandatory)][string]$PhaseName,
        [string]$Complexity = "M",
        [int]$RetryCount = 0
    )
    $root = Get-ProjectRoot
    # T2.6 v5.0.0: 改用 [System.IO.File]::ReadAllText UTF-8 No-BOM (對齊 phycool-windows-ps-encoding §P3)
    $cfgPath = Join-Path $root "scripts/pipeline-config.json"
    $cfg  = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    # 2026-06-08: 全 case 補 break -- 修 switch -Regex 無 break 導致多 case 命中時 $key 變陣列
    # ('dev-story-fix-R1' 原同時命中 ^dev-story-fix + ^dev-story → 'dev-story-fix-Rn dev-story' property 不存在 → dispatch 掛)。
    # 新增 ^dev-story-complex(sonnet-5 max + ultrathink,2026-07-19 dev 全階段改 sonnet-5;migration/複雜 schema 卡;放 ^dev-story 前因前綴重疊,break 保證精確)。
    $key  = switch -Regex ($PhaseName) {
        '^create-story'      { 'create-story'; break }
        '^dev-story-complex' { 'dev-story-complex'; break }
        '^dev-story-fix'     { 'dev-story-fix-Rn'; break }
        '^dev-story'         { 'dev-story'; break }
        '^code-review'       { 'code-review'; break }
        '^subagent'          { 'subagent'; break }
        default              { throw "Read-PhaseModel: unknown phase '$PhaseName'" }
    }
    $info = $cfg.phaseModelMapping.$key
    if (-not $info) { throw "Read-PhaseModel: no mapping for '$key'" }
    $effort = if ($RetryCount -gt 0) { 'max' } else { $info.effort }
    return @{
        model_id    = $info.model_id
        effort      = $effort
        model_alias = $info.model_alias
        phase_key   = $key
    }
}

# ── handshake config lookup ──────────────────────────────────────────────────
function Get-HandshakeConfig {
    $root = Get-ProjectRoot
    # T2.6 v5.0.0: 改用 [System.IO.File]::ReadAllText UTF-8 No-BOM
    $cfgPath = Join-Path $root "scripts/pipeline-config.json"
    $cfg  = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    if ($cfg.PSObject.Properties.Name -contains 'handshake') {
        return $cfg.handshake
    }
    return @{
        enabled            = $false
        timeout_sec        = 90
        ack_wait_sec       = 60
        countdown_sec      = 5
        fallback_to_legacy = $true
    }
}

# ── Countdown UI ─────────────────────────────────────────────────────────────
function Start-Countdown {
    param(
        [int]$Seconds = 5,
        [string]$Label = "Window closing in"
    )
    for ($i = $Seconds; $i -gt 0; $i--) {
        Write-Host "`r$Label $i seconds..." -NoNewline -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
    Write-Host ""
}

# -- (T1.1, bwu-1) Null/empty/whitespace -> literal placeholder for prompt injection --
function Format-InjectField {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return '(未填)'
    }
    return $Value
}

# ── Build prompt context (13 base fields + 6 bwu-1 additive fields -- full Story injection happens via system prompt file) ──
function Build-StoryPromptContext {
    param(
        [Parameter(Mandatory)]$Story,
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Track,
        [Parameter(Mandatory)][string]$IpcDir
    )
    $protocolPath = Join-Path $PSScriptRoot "protocol-template.md"
    $protocolText = if (Test-Path $protocolPath) {
        [System.IO.File]::ReadAllText($protocolPath, [System.Text.UTF8Encoding]::new($false))
    } else {
        "(protocol-template.md not found - check skill installation)"
    }
    # -- (T1.2, bwu-1) Additive injection fields -- BR-001/BR-002 --
    $fileListText               = Format-InjectField $Story.file_list
    $implementationApproachText = Format-InjectField $Story.implementation_approach
    $testingStrategyText        = Format-InjectField $Story.testing_strategy
    $definitionOfDoneText       = Format-InjectField $Story.definition_of_done
    $sddSpecText                = Format-InjectField $Story.sdd_spec
    $pipelineNotesText          = Format-InjectField $Story.pipeline_notes
    $trackBlock = if ($Track -eq 'side') {
@"
========== TASK TRACK: SIDE (Toolkit / Environment / Workflow Upgrade) ==========
本 Story 屬於副線任務（非 PhyCool SaaS 業務 code）-- 例如 toolkit 升級、配置調整、工作流改進。
要求：深度讀取所有相關文檔進行分析補全，禁止任何投機作法！
"@
    } else {
@"
========== TASK TRACK: MAIN (PhyCool SaaS Business) ==========
本 Story 屬於主線任務（PhyCool SaaS 業務 code）-- 涉實際業務邏輯、DB schema、API、UI。
要求：第一準則 PhyCool 商業策略 / 第二準則業界 SaaS 作法。目前是 localhost 開發階段，為黃金完善時期，禁止任何投機作法！
"@
    }
    return @"
================== PIPELINE ENFORCE RULES (SYSTEM CONTEXT) ==================
[STORY DB CONTEXT]
story_id     : $($Story.story_id)
title        : $($Story.title)
epic         : $($Story.epic_id)
priority     : $($Story.priority) | complexity: $($Story.complexity)
status       : $($Story.status)
task_track   : $Track
dependencies : $($Story.dependencies)

user_story:
$($Story.user_story)

background:
$($Story.background)

acceptance_criteria:
$($Story.acceptance_criteria)

tasks:
$($Story.tasks)

dev_notes:
$($Story.dev_notes)

required_skills:
$($Story.required_skills)

file_list:
$fileListText

implementation_approach:
$implementationApproachText

testing_strategy:
$testingStrategyText

definition_of_done:
$definitionOfDoneText

sdd_spec:
$sddSpecText

pipeline_notes:  [READ-ONLY -- protocol F5. 並行通告 / baseline_commit 來源,禁寫回]
$pipelineNotesText

[PIPELINE PHASE]
phase    : $Phase
ipc_dir  : $IpcDir

$trackBlock

========== ACK HANDSHAKE PROTOCOL ==========
$protocolText
"@
}

# =============================================================================
# v5.0.0 Conflict Matrix + Git Mutex (T4.1-T4.5 / T4.4) -- Parallel Batch Safety
# =============================================================================

# ── (T4.5) Hard-Block File Patterns SSoT ─────────────────────────────────────
# 同批並行 Story 任二有交集則 HARD_BLOCK,強制 sequential。
# Pattern 為 regex (case-insensitive),paths 用 forward-slash form。
$Script:HardBlockFilePatterns = @(
    # Cross-Story shared write hot files
    '^CLAUDE\.md$',
    '^CLAUDE\.local\.md$',
    '^MEMORY\.md$',
    # SUPREME rules + skill SSoT (skill-sync-gate cross-trigger)
    '^\.claude/rules/.*\.md$',
    '^\.(claude|gemini|agent)/skills/[^/]+/SKILL\.md$',
    # Database schema + migrations
    '^src/.+/Migrations/.+\.cs$',
    '^\.context-db/scripts/init-db\.js$',
    '^\.context-db/phycool\.db$',
    # ADR + technical-decisions
    '^docs/technical-decisions/ADR-.+\.md$',
    # Project-wide config
    '^\.mcp\.json$',
    '^scripts/pipeline-config\.json$',
    '^\.claude/settings\.json$'
)

$Script:ReadOnlyAllowedPatterns = @(
    '^src/.+/types/.+\.ts$',
    '^src/.+/Constants\.cs$',
    '^src/.+/Enums/.+\.cs$',
    '^.+\.csproj$',
    '^package\.json$',
    '^package-lock\.json$'
)

# T5.7 v5.0.0: DB Hot-Row Conflict Patterns
# 對齊 phycool-mcp-discipline 並行 MCP write 安全規範
# 不同 worker 同時 upsert 同 story_id / idd_id / td_id 視為 HARD_BLOCK
# (SQLite WAL 雖支援並行,但 row-level write race 導致後寫覆蓋)
$Script:DbHotRowConflictTypes = @(
    'stories',                  # upsert-story.js 同 story_id
    'intentional_decisions',    # add_intentional_decision 同 idd_id
    'tech_debt_items',          # upsert-debt.js 同 td_id
    'review_findings',          # add_cr_issue 同 story_id+severity 組合
    'workflow_executions'       # log_workflow 同 workflow_type+session
)
function Test-DbHotRowConflict {
    # 檢查兩 Story 是否會 upsert DB 同 row (story_id / idd_id / td_id 同名)
    param([string]$StoryA, [string]$StoryB)
    # 簡化檢測:同 story_id 即衝突 (跨 worker 同 Story 不該並行)
    return ($StoryA -eq $StoryB)
}

function Test-HardBlockFile {
    param([Parameter(Mandatory)][string]$FilePath)
    $normalized = $FilePath -replace '\\', '/'
    foreach ($p in $Script:HardBlockFilePatterns) {
        if ($normalized -match $p) { return $true }
    }
    return $false
}

function Test-ReadOnlyAllowedFile {
    param([Parameter(Mandatory)][string]$FilePath)
    $normalized = $FilePath -replace '\\', '/'
    foreach ($p in $Script:ReadOnlyAllowedPatterns) {
        if ($normalized -match $p) { return $true }
    }
    return $false
}

# ── (T4.4) Invoke-GitOperation -- TEMP file mutex prevents .git/index.lock race ─
function Invoke-GitOperation {
    param(
        [Parameter(Mandatory)][scriptblock]$Op,
        [string]$LockName = "git-index",
        [int]$TimeoutSec = 60
    )
    $lockFile = Join-Path $env:TEMP "phycool-$LockName.lock"
    $start = Get-Date
    while ((Get-Date) - $start -lt [TimeSpan]::FromSeconds($TimeoutSec)) {
        try {
            # CreateNew = atomic create-or-fail (NTFS)
            $fs = [System.IO.File]::Open($lockFile, 'CreateNew', 'Write', 'None')
            try {
                # Write PID for diagnostic
                $pidBytes = [System.Text.Encoding]::ASCII.GetBytes("$PID`n")
                $fs.Write($pidBytes, 0, $pidBytes.Length)
                $fs.Close()
                $fs = $null
                # Run the op
                & $Op
                return
            } finally {
                if ($fs) { $fs.Close() }
                Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
            }
        } catch [System.IO.IOException] {
            # Lock contention -- backoff
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Invoke-GitOperation: lock timeout after ${TimeoutSec}s ($LockName)"
}

# ── (T4.1 helper) Extract file paths from free-text (tasks / impl_approach) ──
function Get-FilePathsFromText {
    param([string]$Text)
    if (-not $Text) { return @() }
    # Match common path shapes: src/x/y.cs / docs/foo.md / .claude/rules/bar.md
    $regex = '(?<![\w/.-])((?:src|docs|tests?|scripts|\.context-db|\.claude|\.gemini|\.agent|_bmad)(?:/[\w.-]+)+\.[\w]+)'
    $matches = [regex]::Matches($Text, $regex)
    $paths = @()
    foreach ($m in $matches) { $paths += $m.Groups[1].Value }
    # Force array return (PS 5.1: @() | Select-Object -Unique returns $null, not @())
    return ,@($paths | Select-Object -Unique | Where-Object { $_ })
}

# ── (T4.1) Get-ExpectedFileSet -- 5-source union for one Story ────────────────
function Get-ExpectedFileSet {
    param([Parameter(Mandatory)][string]$StoryId)
    $story = Get-StoryFromDb -StoryId $StoryId
    if (-not $story) {
        Write-PpLog "Get-ExpectedFileSet: Story '$StoryId' not in DB" "WARN"
        return @()
    }
    $files = @()
    # Source 1: file_list (DB enriched after dev-story)
    if ($story.PSObject.Properties.Name -contains 'file_list' -and $story.file_list) {
        $files += ($story.file_list -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }
    # Source 2: implementation_approach grep paths
    if ($story.PSObject.Properties.Name -contains 'implementation_approach' -and $story.implementation_approach) {
        $files += (Get-FilePathsFromText -Text $story.implementation_approach)
    }
    # Source 3: tasks grep paths
    if ($story.PSObject.Properties.Name -contains 'tasks' -and $story.tasks) {
        $files += (Get-FilePathsFromText -Text $story.tasks)
    }
    # Source 4: required_skills → watches glob hot paths (heuristic -- by skill name)
    if ($story.PSObject.Properties.Name -contains 'required_skills' -and $story.required_skills) {
        foreach ($skill in ($story.required_skills -split '[,;]')) {
            $sk = $skill.Trim()
            if (-not $sk) { continue }
            # Add the skill SKILL.md itself (skill-sync-gate trigger surface)
            $files += ".claude/skills/$sk/SKILL.md"

        }
    }
    # Source 5: shared write hot files (always included per CR Phase B / dev-story Step 8 pattern)
    if ($story.PSObject.Properties.Name -contains 'epic_id' -and $story.epic_id) {
        $files += "docs/technical-decisions/ADR-$($story.epic_id)*"
    }
    return ($files | Where-Object { $_ } | Select-Object -Unique)
}

# ── (T4.2) Classify-ConflictSeverity -- 5-level matrix ────────────────────────
function Classify-ConflictSeverity {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [string[]]$ConflictFiles
    )
    if (-not $ConflictFiles -or $ConflictFiles.Count -eq 0) { return 'DISJOINT' }
    foreach ($f in $ConflictFiles) {
        if (Test-HardBlockFile -FilePath $f) { return 'HARD_BLOCK' }
    }
    # Any non-read-only intersect → SOFT_BLOCK
    foreach ($f in $ConflictFiles) {
        if (-not (Test-ReadOnlyAllowedFile -FilePath $f)) { return 'SOFT_BLOCK' }
    }
    # All in read-only allowed → READ_SHARED
    return 'READ_SHARED'
}

# ── (T4.2) Test-FileConflictMatrix -- pairwise intersect + classify ───────────
function Test-FileConflictMatrix {
    param([Parameter(Mandatory)][string[]]$StoryIds)
    $matrix = @()
    $fileSets = @{}
    foreach ($sid in $StoryIds) { $fileSets[$sid] = Get-ExpectedFileSet -StoryId $sid }
    for ($i = 0; $i -lt $StoryIds.Count; $i++) {
        for ($j = $i + 1; $j -lt $StoryIds.Count; $j++) {
            $a = $StoryIds[$i]; $b = $StoryIds[$j]
            $intersect = @($fileSets[$a] | Where-Object { $fileSets[$b] -contains $_ })
            $sev = Classify-ConflictSeverity -ConflictFiles $intersect
            if ($sev -ne 'DISJOINT') {
                $matrix += [PSCustomObject]@{
                    story_a = $a
                    story_b = $b
                    conflict_files = $intersect
                    severity = $sev
                }
            }
        }
    }
    # Force flat array (avoid nested array via leading-comma operator)
    return @($matrix)
}

# ── (T4.3) Schedule-Batches -- greedy scheduler, HARD_BLOCK forces sequential ─
function Schedule-Batches {
    param(
        [Parameter(Mandatory)][string[]]$StoryIds,
        [array]$ConflictMatrix = @()
    )
    if (-not $ConflictMatrix -or @($ConflictMatrix).Count -eq 0) {
        [array]$ConflictMatrix = @(Test-FileConflictMatrix -StoryIds $StoryIds)
    }
    # Defensive filter: only keep matrix entries with required properties (strict mode safety)
    [array]$matrixSafe = @($ConflictMatrix | Where-Object {
        $null -ne $_ -and ($_.PSObject.Properties.Name -contains 'severity')
    })
    $batches = @()
    $remaining = [System.Collections.ArrayList]@($StoryIds)
    while ($remaining.Count -gt 0) {
        $currentBatch = @()
        $currentFiles = @()
        $toRemove = @()
        foreach ($sid in $remaining) {
            $sFiles = @(Get-ExpectedFileSet -StoryId $sid)
            $overlap = @($sFiles | Where-Object { $currentFiles -contains $_ })
            $hasHardBlock = $false
            foreach ($f in $overlap) {
                if (Test-HardBlockFile -FilePath $f) { $hasHardBlock = $true; break }
            }
            # Also check pairwise matrix for any HARD_BLOCK with batch members
            if (-not $hasHardBlock) {
                foreach ($m in $matrixSafe) {
                    if ($m.severity -eq 'HARD_BLOCK') {
                        if (($m.story_a -eq $sid -and $currentBatch -contains $m.story_b) -or
                            ($m.story_b -eq $sid -and $currentBatch -contains $m.story_a)) {
                            $hasHardBlock = $true; break
                        }
                    }
                }
            }
            if (-not $hasHardBlock) {
                $currentBatch += $sid
                $currentFiles += $sFiles
                $toRemove += $sid
            }
        }
        if ($currentBatch.Count -eq 0) {
            # Force first remaining into next sequential batch (deadlock break)
            $first = $remaining[0]
            $currentBatch = @($first)
            $toRemove = @($first)
        }
        $batches += ,@($currentBatch)
        foreach ($r in $toRemove) { $remaining.Remove($r) | Out-Null }
    }
    # Force outer array (single batch case PS 5.1 unwrap defense)
    return ,$batches
}

# =============================================================================
# v5.0.0 UTF-8 I/O Helpers (T5.5) -- 對齊 phycool-windows-ps-encoding §4
# =============================================================================
# 取代 Get/Set-Content/Out-File 預設 (PS 5.1 default = Big5),確保 UTF-8 安全

function Read-Utf8File {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path $Path)) { throw "Read-Utf8File: file not found: $Path" }
    return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}

function Write-Utf8File {
    # $WithBom = $true → UTF-8 with BOM (.ps1 用); $false → No BOM (JSON/git 友善, 預設)
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content,
        [bool]$WithBom = $false
    )
    $enc = [System.Text.UTF8Encoding]::new($WithBom)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Read-JsonFile {
    param([Parameter(Mandatory)][string]$Path)
    return (Read-Utf8File -Path $Path) | ConvertFrom-Json
}

function Write-JsonFile {
    # JSON 寫入預設 No BOM (避免 ConvertFrom-Json / jq / Node.JS 對 BOM 報錯)
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)]$Data,
        [int]$Depth = 10
    )
    Write-Utf8File -Path $Path -Content ($Data | ConvertTo-Json -Depth $Depth) -WithBom $false
}

# =============================================================================
# v5.0.0 (T5.5) Invoke-PhycoolMcpSafe -- 對齊 phycool-mcp-discipline §6
# =============================================================================
# Safe MCP wrapper: validate (T5.3 stub) + UTF-8 No-BOM + UTC+8 timestamp + retry on SQLITE_BUSY
# T5.3 (validate-mcp-payload.cjs) + T5.4 (mcp-cli-wrapper.js) 為 follow-up Story 完整實作
# 當前 stub 模式: 若 validator/wrapper 不存在則 log warn 並 return $null (不 break pipeline)

function Invoke-PhycoolMcpSafe {
    param(
        [Parameter(Mandatory)][string]$Tool,        # 'add_context' / 'add_intentional_decision' / etc.
        [Parameter(Mandatory)][hashtable]$Payload,
        [int]$RetryMax = 3
    )
    # Auto-inject Taiwan timestamp (Constitutional §Timestamp Mandate)
    if (-not $Payload.ContainsKey('created_at')) {
        $Payload['created_at'] = Get-TaiwanTimestamp
    }

    # Write payload to tempfile (UTF-8 No-BOM via T5.5 helper)
    $tmp = [System.IO.Path]::GetTempFileName()
    Write-JsonFile -Path $tmp -Data $Payload -Depth 10

    $root = Get-ProjectRoot
    $validator = Join-Path $root "scripts/validate-mcp-payload.cjs"
    $wrapper   = Join-Path $root ".context-db/scripts/mcp-cli-wrapper.js"

    # Step 1: Validate (T5.3 follow-up)
    if (Test-Path $validator) {
        $validateOutput = & node $validator --tool $Tool --payload-file $tmp 2>&1
        if ($LASTEXITCODE -ne 0) {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            throw "MCP payload validation failed for tool '$Tool': $validateOutput"
        }
    } else {
        Write-PpLog "Invoke-PhycoolMcpSafe: validator not found (T5.3 follow-up) -- skipping validation" "DEBUG"
    }

    # Step 2: Invoke via wrapper (T5.4 follow-up) with retry on SQLITE_BUSY
    if (-not (Test-Path $wrapper)) {
        Write-PpLog "Invoke-PhycoolMcpSafe: wrapper not found (T5.4 follow-up) -- stub mode (no-op)" "WARN"
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        return $null
    }

    for ($i = 1; $i -le $RetryMax; $i++) {
        try {
            $result = & node $wrapper --tool $Tool --payload-file $tmp 2>&1
            if ($LASTEXITCODE -eq 0) {
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
                return ($result | ConvertFrom-Json)
            }
            throw "mcp-cli-wrapper exit ${LASTEXITCODE}: $result"
        } catch {
            if ($_ -match 'SQLITE_BUSY|database is locked') {
                Write-PpLog "MCP SQLite busy, retry $i/$RetryMax (exponential backoff)" "WARN"
                Start-Sleep -Milliseconds (200 * $i)
            } else {
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
                throw
            }
        }
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    throw "Invoke-PhycoolMcpSafe failed after $RetryMax retries (Tool: $Tool)"
}

# =============================================================================
# Export marker (v5.0.0: 4-Tuple Identity + Conflict Matrix + UTF-8 helpers + MCP)
# =============================================================================
Write-PpLog "shared-utils.ps1 v5.0.0 loaded (T1.1 4-Tuple Identity + T4.1-T4.5 Conflict Matrix + T4.4 Git Mutex + T5.5 UTF-8 helpers + Invoke-PhycoolMcpSafe + T5.7 DbHotRow)" "DEBUG"
