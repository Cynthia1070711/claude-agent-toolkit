#Requires -Version 5.1
param(
    [switch]$Once,
    [switch]$DryRun,
    [switch]$Status
)
# ---- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# pipeline-guardian.ps1  v1.0.0
# [whp-7-guardian-daemon] 集中式無狀態守護常駐單例(SDD Spec §4.2)。
#
# 薄手宿主 -- 持鎖 + 讀 config + 雙節奏驅動 + log。全部判定邏輯在
# .context-db/scripts/guardian-tick.js(逐輪呼叫 node subprocess)。
#
# 鐵則:本檔零任何行程終止原語、零任何檔案刪除原語。
# 只回報、只提醒,絕不終止行程、絕不關窗、絕不派發(使用者硬裁定 ③)。
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\shared-utils.ps1"

$ProjectRoot      = Get-ProjectRoot
$LogDir           = Get-LogDir
$LockFile         = Join-Path $LogDir "pipeline-guardian.lock"
$PidFile          = Join-Path $LogDir "pipeline-guardian.pid"
$LogFile          = Join-Path $LogDir "pipeline-guardian.log"
$GuardianTickJs   = Join-Path $ProjectRoot ".context-db\scripts\guardian-tick.js"
$ConfigPath       = Join-Path $ProjectRoot "scripts\pipeline-config.json"

function Write-GuardianFileLog {
    param([string]$Message)
    $ts = Get-TaiwanTimestamp
    try {
        $line = "[$ts] $Message`r`n"
        [System.IO.File]::AppendAllText($LogFile, $line, [System.Text.UTF8Encoding]::new($false))
    } catch { }
}

function Get-GuardianCadenceConfig {
    $fastSec = 30
    $slowSec = 600
    try {
        $cfg = Read-JsonFile -Path $ConfigPath
        if ($cfg.workerProtocol.guardianFastTickSec) { $fastSec = [int]$cfg.workerProtocol.guardianFastTickSec }
        if ($cfg.workerProtocol.guardianSlowTickSec) { $slowSec = [int]$cfg.workerProtocol.guardianSlowTickSec }
    } catch {
        Write-PpLog "pipeline-guardian: config 讀取失敗,退回預設 fast=30s slow=600s(非致命)" "WARN"
    }
    return @{ FastSec = $fastSec; SlowSec = $slowSec }
}

# ---- -Status:唯讀,不取鎖,無論守護是否在跑皆安全(BR-G26) ----
if ($Status) {
    try {
        $raw = & node $GuardianTickJs --status --json 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-Host "guardian_pid: (unknown -- status query failed)"
            Write-Host "error: $raw"
            exit 0
        }
        $report = $raw | ConvertFrom-Json
        $freshnessDisplay = if ($null -ne $report.freshness_sec) { [Math]::Round($report.freshness_sec, 1) } else { "(none)" }
        Write-Host "guardian_pid: $($report.guardian_pid)"
        Write-Host "host: $($report.host)"
        Write-Host "freshness_sec: $freshnessDisplay"
        Write-Host "watched_runs: $($report.watched_runs)"
        Write-Host "last_error: $($report.last_error)"
        exit 0
    } catch {
        Write-Host "guardian_pid: (none)"
        Write-Host "error: $($_.Exception.Message)"
        exit 0
    }
}

function Invoke-GuardianTickMode {
    param(
        [Parameter(Mandatory)][ValidateSet('fast', 'slow')][string]$Mode,
        [switch]$DryRunFlag
    )
    $nodeArgs = @($GuardianTickJs, "--$Mode", "--json")
    if ($DryRunFlag) { $nodeArgs += "--dry-run" }

    $env:PIPELINE_GUARDIAN_PID = "$PID"
    try {
        $output = & node @nodeArgs 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-GuardianFileLog "$Mode tick exited $exitCode -- $output"
            return $null
        }
        $report = $output | ConvertFrom-Json
        # last_error 僅在該輪 tick 確實出錯時才出現在報告物件裡(guardian-tick.js 條件式加入),
        # 故存取前必先確認屬性存在 -- Set-StrictMode -Version Latest 下取不存在的屬性會拋錯。
        # 🔴 CR F5:原本無論 tick 內是否出錯都印 "ok",慢 tick 的錯誤(該路徑不寫心跳)因此
        # 在 DB 與 log 兩個問責面同時消失,一輪拋錯的慢 tick 與健康的慢 tick 字面完全相同。
        $tickError = $null
        if ($report.PSObject.Properties.Name -contains 'last_error') { $tickError = $report.last_error }
        $verdict = if ($tickError) { "DEGRADED" } else { "ok" }
        $errPart = if ($tickError) { " last_error=$tickError" } else { "" }
        Write-GuardianFileLog "$Mode tick $verdict scanned=$($report.scanned) abandoned=$($report.abandoned) stall_flagged=$($report.stall_flagged) idle_exit=$($report.idle_exit)$errPart"
        return $report
    } catch {
        Write-GuardianFileLog "$Mode tick invocation failed -- $($_.Exception.Message)"
        return $null
    }
}

# ---- 單例(BR-G18):全生命週期持有 file handle,handle 即擁有權,唯一互斥機制 ----
# 🔴 刻意不用 CreateNew marker(崩潰留檔永久擋自癒)、不用既存 guardian_pid 存活性 CAS
# (死 PID 被 Windows 回收後永久否決自癒)。持有 handle 已證明無他者存活,guardian-tick.js
# 的心跳寫入因此是無條件宣告。
$lockHandle = $null
try {
    $lockHandle = [System.IO.File]::Open(
        $LockFile,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
} catch {
    Write-PpLog "pipeline-guardian: 單例 lock 已被持有 -- 另一守護正在跑,exit 0(BR-G18)" "WARN"
    exit 0
}

try {
    Write-Utf8File -Path $PidFile -Content "$PID" -WithBom $false
    Write-GuardianFileLog "pipeline-guardian started, PID=$PID, Once=$Once, DryRun=$DryRun"

    $cadence = Get-GuardianCadenceConfig
    Write-PpLog "pipeline-guardian: 啟動(PID=$PID,fast=$($cadence.FastSec)s,slow=$($cadence.SlowSec)s)" "SUCCESS"

    if ($Once) {
        Invoke-GuardianTickMode -Mode 'fast' -DryRunFlag:$DryRun | Out-Null
        Invoke-GuardianTickMode -Mode 'slow' -DryRunFlag:$DryRun | Out-Null
        Write-GuardianFileLog "pipeline-guardian -Once complete, exiting"
        exit 0
    }

    # 雙節奏迴圈:cadence 到期與否由比較"牆鐘時間"決定(非累加迭代計數),故休眠/延遲
    # 喚醒後仍產生正確判定(BR-G21 精神)。此為 PS 宿主自身的 tick 排程節奏,與
    # guardian-tick.js 內部每一輪 tick 的無狀態判定(以 DB 時間戳相減)是兩個獨立層次 --
    # 宿主重啟只影響"下一輪 slow tick 何時觸發"的排程時機,不影響任何一輪 tick 本身的
    # 判定正確性(該判定永遠只看 DB 內容,與宿主自己活了多久無關)。
    $lastSlowTickAt = Get-Date

    while ($true) {
        $fastReport = Invoke-GuardianTickMode -Mode 'fast' -DryRunFlag:$DryRun

        $elapsedSec = ((Get-Date) - $lastSlowTickAt).TotalSeconds
        if ($elapsedSec -ge $cadence.SlowSec) {
            Invoke-GuardianTickMode -Mode 'slow' -DryRunFlag:$DryRun | Out-Null
            $lastSlowTickAt = Get-Date
        }

        if ($fastReport -and $fastReport.idle_exit) {
            Write-PpLog "pipeline-guardian: 全 run 終態且閒置逾期,idle_exit -- 乾淨退出(BR-G20)" "INFO"
            Write-GuardianFileLog "idle_exit recommended by tick -- exiting cleanly"
            break
        }

        Start-Sleep -Seconds $cadence.FastSec
    }
} finally {
    if ($lockHandle) { $lockHandle.Dispose() }
}

exit 0
