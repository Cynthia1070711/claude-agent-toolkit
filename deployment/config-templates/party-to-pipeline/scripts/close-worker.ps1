#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$RunId,
    [string]$CallerTrack = '',
    [switch]$Override,
    [string]$OverrideReason = '',
    [switch]$Force,
    [switch]$DryRun
)
# ---- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# close-worker.ps1  v1.0.0
# party-to-pipeline (whp-6-directive-delivery-and-close) -- Controller-Initiated Worker Close
#
# 中控唯一程式化關窗途徑。本檔承 C1(入口)/ C5(taskkill)/ C6(有界確認)/ C7(成功輸出)/
# C8(-DryRun 顯示)。C2(五項前置)/ C3(4-Tuple 判活)/ C4(CAS 終態寫入)委派
# .context-db/scripts/close-worker-ops.js(DD-1:必須複用 reap-worker-runs.js 的
# judgeLiveness(),不在此自建第二套判活邏輯)。
#
# 順序不可調換(AC11):C4(DB 寫入)先於 C5(taskkill)。若在殺完當機才寫 DB,守護會把
# 一次正常關閉會被 reap-worker-runs.js 誤判為殭屍放棄狀態,留下永久假紀錄 -- 因此
# close-worker-ops.js 保證 "先寫後殺",本檔只在收到 Node 已完成 CAS 寫入的訊號後才送出 taskkill。
#
# Usage:
#   .\close-worker.ps1 -RunId <uuid> [-CallerTrack <track>] [-Override -OverrideReason <text>]
#     [-Force] [-DryRun]
#
# Exit codes:
#   0 = 成功關閉(含 "PID 已死視為使用者自行關閉" 路徑)
#   1 = C4 CAS 落空(WHP6-E04)或 C6 確認窗逾時仍存活(WHP6-E06,requires_attention=1 已寫)
#   2 = C2 前置未過(WHP6-E01/E02/E05)/ C3 判活為 PID 重用 ABORT(WHP6-E03)/ 判活探測本身不可用
#       (WHP6-E07,fail-CLOSED:關窗是全鏈唯一必須 fail-closed 的路徑,見 SDD BC-12)/ ops 腳本缺席
#       或輸出無法解析(WHP6-E09)
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$opsScript   = Join-Path $ProjectRoot ".context-db\scripts\close-worker-ops.js"

if (-not (Test-Path $opsScript)) {
    Write-Host "WHP6-E09: close-worker-ops.js not found at $opsScript"
    exit 2
}

# ---- BR-032: closeConfirmSec 讀 config,absent/unreadable -> 落到與 close-worker-ops.js
#      同一個硬編預設 15(兩處預設值刻意保持一致,見 pipeline-config.json _comment)。----
$closeConfirmSec = 15
try {
    $cfgPath = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
    $cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    if (($cfg.PSObject.Properties.Name -contains 'workerProtocol') -and
        ($cfg.workerProtocol.PSObject.Properties.Name -contains 'closeConfirmSec') -and
        $cfg.workerProtocol.closeConfirmSec) {
        $closeConfirmSec = [int]$cfg.workerProtocol.closeConfirmSec
    }
} catch { }

# ---- C1: 組裝 close-worker-ops.js 呼叫參數 ----
#      未顯式帶 -CallerTrack 時,自既有 $env:PHYCOOL_CONTROLLER_TRACK 機制取值(Get-ControllerTrackId,
#      shared-utils.ps1:262 -- dispatch-general.ps1 -ControllerTrack 寫入、worker 進程繼承的同一身分)。
#      該函式在環境變數未設時回 'unspecified';此時仍刻意不帶 --caller-track,因為 close-worker-ops.js
#      對空值的語意是 "跳過 track 比對",而帶入 'unspecified' 會與 run.controller_track 恆不相等,
#      反而擋掉所有正常關窗。故只在取得真實軌別時才帶,使 BR-024 第四項前置在有軌別身分的環境真正
#      生效(CR 2026-08-01 修復:原先預設永不帶值,該前置在所有預設呼叫路徑皆靜默失效,與 SDD Spec
#      BC-08 "the script's own track check protects direct CLI invocation" 的宣稱不符)。
if (-not $CallerTrack) {
    $autoTrack = Get-ControllerTrackId
    if ($autoTrack -and $autoTrack -ne 'unspecified') { $CallerTrack = $autoTrack }
}
$opsArgs = @('--run-id', $RunId)
if ($CallerTrack)    { $opsArgs += @('--caller-track', $CallerTrack) }
if ($Override)       { $opsArgs += '--override' }
if ($OverrideReason) { $opsArgs += @('--override-reason', $OverrideReason) }
if ($Force)           { $opsArgs += '--force' }
if ($DryRun)          { $opsArgs += '--dry-run' }

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$opsOutput = & node $opsScript @opsArgs 2>$null
$ErrorActionPreference = $prevEAP

$result = $null
try { $result = ($opsOutput | Out-String).Trim() | ConvertFrom-Json } catch { }
if (-not $result) {
    Write-Host "WHP6-E09: close-worker-ops.js produced no parseable output"
    exit 2
}

# ---- C2 前置未過 / C3 PID 重用 -- Node 端已零副作用完成判定,本檔只轉述 ----
if ($result.code -in @('WHP6-E01', 'WHP6-E02', 'WHP6-E05')) {
    Write-Host "$($result.code): precondition not met for run $RunId"
    if ($result.failedChecks) { Write-Host "  failedChecks: $($result.failedChecks -join ', ')" }
    exit 2
}
if ($result.code -eq 'WHP6-E03') {
    Write-Host "WHP6-E03: wrapper_pid for run $RunId is alive but CommandLine does not match this run (pid-reused/cmdline-mismatch, reason=$($result.reason)) -- ABORT, zero write, zero kill"
    exit 2
}
if ($result.code -eq 'WHP6-E07') {
    Write-Host "WHP6-E07: liveness probe unavailable ($($result.message)) -- fail-CLOSED, refusing to close (zero write, zero kill). Close is the one path that must fail closed (BC-12); retry once the probe works."
    exit 2
}
if ($result.code -eq 'WHP6-E04') {
    Write-Host "WHP6-E04: lifecycle advanced between precheck and CAS write for run $RunId (0 rows affected) -- ABORT, zero kill"
    exit 1
}

# ---- C8: -DryRun -- 顯示意圖,C4 WOULD WRITE 恆先於 C5 WOULD KILL,零寫入零殺 ----
if ($DryRun) {
    if ($result.outcome -eq 'dry-run-already-closed') {
        Write-Host "C4 WOULD WRITE: lifecycle=closed close_source=UserClosed closed_detected_at=<now> (run $RunId, wrapper_pid $($result.wrapper_pid) already dead)"
        Write-Host "C5 WOULD KILL: (skipped -- wrapper_pid already dead, nothing to kill)"
    } else {
        $closeSourceDry = if ($Force) { 'ControllerForce' } else { 'ControllerAfterHandshake' }
        Write-Host "C4 WOULD WRITE: lifecycle=closed close_source=$closeSourceDry closed_at=<now> (run $RunId)"
        Write-Host "C5 WOULD KILL: taskkill /T /F /PID $($result.wrapper_pid)"
    }
    exit 0
}

# ---- outcome=already-closed: wrapper_pid 早已不存在,視為使用者自行關閉,無需殺 ----
if ($result.outcome -eq 'already-closed') {
    $closeResult = @{ run_id = $RunId; lifecycle = 'closed'; close_source = $result.close_source; wrapper_pid = $result.wrapper_pid } | ConvertTo-Json -Compress
    Write-Host "CLOSE_RESULT: $closeResult"
    exit 0
}

# ---- outcome=alive-closed: C4 已於 close-worker-ops.js 內完成 CAS 寫入(順序保證,見檔頭),
#      C5 送出 taskkill(wrapper_pid 以 [int] 傳入,不做字串內插)----
$wrapperPid = [int]$result.wrapper_pid
try {
    & taskkill /T /F /PID $wrapperPid 2>$null | Out-Null
} catch { }

# ---- C6: 有界確認窗(closeConfirmSec)-- 恰 1 次 taskkill,不重試,不改用 Stop-Process(BR-031)。
#      PHYCOOL_CLOSEWORKER_FORCE_SURVIVE=1 為測試專用逃生口(smoke-test.ps1 用來確定性模擬
#      "taskkill 對此 PID 無效",避免依賴真的建一個 taskkill /F 殺不掉的行程;正常路徑永不設此值。----
function Test-CloseWorkerProcessAlive {
    param([int]$ProcessId)
    if ($env:PHYCOOL_CLOSEWORKER_FORCE_SURVIVE -eq '1') { return $true }
    return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

$deadline   = (Get-Date).AddSeconds($closeConfirmSec)
$stillAlive = $true
while ((Get-Date) -lt $deadline) {
    if (-not (Test-CloseWorkerProcessAlive -ProcessId $wrapperPid)) { $stillAlive = $false; break }
    Start-Sleep -Milliseconds 500
}

if ($stillAlive -and (Test-CloseWorkerProcessAlive -ProcessId $wrapperPid)) {
    try {
        $attnTmp = Join-Path (Get-LogDir) "close-attn-$RunId-$(Get-Date -Format 'HHmmssfff').json"
        [System.IO.File]::WriteAllText($attnTmp, (@{ requires_attention = 1 } | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
        & node --max-old-space-size=256 (Join-Path $ProjectRoot ".context-db\scripts\upsert-worker-run.js") --merge $RunId $attnTmp 2>$null | Out-Null
        Remove-Item $attnTmp -ErrorAction SilentlyContinue
    } catch { }
    Write-Host "WHP6-E06: PID $wrapperPid survived the ${closeConfirmSec}s confirmation window -- requires_attention=1 set, no retry attempted, no Stop-Process fallback used"
    exit 1
}

# ---- C7: 成功 -- 機器可讀 CLOSE_RESULT 為最後一行 stdout ----
$closeResult = @{ run_id = $RunId; lifecycle = 'closed'; close_source = $result.close_source; closed_at = $result.closed_at; wrapper_pid = $wrapperPid } | ConvertTo-Json -Compress
Write-Host "CLOSE_RESULT: $closeResult"
exit 0
