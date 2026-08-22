#Requires -Version 5.1
param(
    [switch]$DryRun
)
# ---- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# ensure-guardian.ps1  v1.0.0
# [whp-7-guardian-daemon] 冪等單例保證 + 自癒(SDD Spec §4.1)。
#
# 每次 dispatch 皆可安全呼叫:已有活著的守護 -> no-op;沒有 -> 啟動一個。守護非關鍵路徑,
# 本腳本恆 exit 0(絕不因為 Ensure 失敗而擋住派發)。
#
# 存活判定必含 CommandLine 比對,不僅 PID 存在 -- 33 筆殭屍實測中 3 筆 PID 仍存在,
# 真身是 svchost.exe / chrome.exe(SSoT §12.2 N6)。單獨 PID 存在完全不能證明是本守護。
# ==============================================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\shared-utils.ps1"

function Test-GuardianAlive {
    param([Parameter(Mandatory)][string]$PidFilePath)
    if (-not (Test-Path $PidFilePath)) { return $false }
    $pidValue = $null
    try {
        $raw = Read-Utf8File -Path $PidFilePath
        $pidValue = [int]($raw.Trim())
    } catch {
        return $false
    }
    if (-not $pidValue -or $pidValue -le 0) { return $false }

    $wmiProc = $null
    try { $wmiProc = Get-WmiObject Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue } catch { }
    if (-not $wmiProc) { return $false }

    # CommandLine 必含 pipeline-guardian.ps1 字面(對齊 Stop-WorkerSafe 4-Tuple tuple 3+4 精神,
    # 防 PID 重用:若舊守護非乾淨崩潰,該 PID 可能已被 Windows 回收給無關行程)。
    if ($wmiProc.CommandLine -notmatch [regex]::Escape('pipeline-guardian.ps1')) { return $false }
    return $true
}

function Find-LiveGuardianPid {
    # PID 檔失效時的第二判準(CR F3)。直接掃描活著的 powershell.exe,找 CommandLine 含
    # pipeline-guardian.ps1 且不是 -Status 唯讀查詢的那一個;找不到回 $null。
    #
    # 🔴 為何必要:pid 檔一旦與現實脫節(logs/ 目錄被清 -- 它是 gitignored;或 WMI 一次暫時性
    # 查詢失敗讓 Test-GuardianAlive 誤回 false),Ensure 會 spawn 一個註定搶不到 lock 的守護。
    # 那個守護 exit 0 前不會寫 pid 檔(它只在取得 lock 之後才寫),但 Ensure 已經先把它的 PID
    # 寫進去了 -- pid 檔於是永久指向一個死 PID,之後每次 dispatch 都重複這個空轉 spawn 迴圈,
    # 而 BR-G01 禁用一切檔案刪除原語故無法清掉 stale pid 檔,狀態不會自行恢復。
    # 本 fallback 讓 Ensure 直接看行程現實而非只看那份可能已經騙人的紀錄。
    $procs = $null
    try { $procs = @(Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue) } catch { return $null }
    if (-not $procs) { return $null }
    foreach ($p in $procs) {
        $cmd = $p.CommandLine
        if (-not $cmd) { continue }
        if (($cmd -match [regex]::Escape('pipeline-guardian.ps1')) -and ($cmd -notmatch '-Status')) {
            return [int]$p.ProcessId
        }
    }
    return $null
}

try {
    $ProjectRoot    = Get-ProjectRoot
    $LogDir         = Get-LogDir
    $PidFile        = Join-Path $LogDir "pipeline-guardian.pid"
    $EnsureLockFile = Join-Path $LogDir "pipeline-guardian-ensure.lock"
    $GuardianScript = Join-Path $PSScriptRoot "pipeline-guardian.ps1"

    if (Test-GuardianAlive -PidFilePath $PidFile) {
        Write-PpLog "Ensure-Guardian: 既有守護確認存活(CommandLine 比對通過)-- no-op" "DEBUG"
        exit 0
    }

    # pid 檔說沒有,再以行程 CommandLine 掃描複驗一次(CR F3)。兩者不一致時以行程現實為準,
    # 並把 pid 檔修回實際存活的那個守護,避免下次 dispatch 又走進同一個空轉 spawn 迴圈。
    $livePid = Find-LiveGuardianPid
    if ($livePid) {
        Write-PpLog "Ensure-Guardian: pid 檔失效但實際仍有守護存活(PID=$livePid),回寫 pid 檔 -- no-op" "WARN"
        try { Write-Utf8File -Path $PidFile -Content "$livePid" -WithBom $false } catch { }
        exit 0
    }

    if ($DryRun) {
        Write-PpLog "Ensure-Guardian: -DryRun -- 將啟動新守護(未實際執行)" "INFO"
        exit 0
    }

    # 短生命週期 Ensure-level mutex(僅序列化"同時多個 dispatch 搶著 Ensure"的極短窗口)。
    # 🔴 這不是 BR-G18 的守護單例機制本身 -- 真正的單例保證來自 pipeline-guardian.ps1
    # 自己全生命週期持有的 pipeline-guardian.lock(見該檔)。此處鎖檔案是不同檔案、不同用途。
    $ensureHandle = $null
    try {
        $ensureHandle = [System.IO.File]::Open(
            $EnsureLockFile,
            [System.IO.FileMode]::OpenOrCreate,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
    } catch {
        Write-PpLog "Ensure-Guardian: 另一個 Ensure-Guardian 正在進行中(lock 被持有)-- fail-open, exit 0" "DEBUG"
        exit 0
    }

    try {
        # 取得 Ensure lock 後再檢查一次(可能剛好有另一個 Ensure 搶先啟動完成)。
        # 同樣疊加 CommandLine 掃描 fallback:搶先者可能已 spawn 但守護尚未寫出自己的 pid 檔。
        if ((Test-GuardianAlive -PidFilePath $PidFile) -or (Find-LiveGuardianPid)) {
            Write-PpLog "Ensure-Guardian: 取鎖過程中守護已出現(另一 Ensure 完成)-- no-op" "DEBUG"
            exit 0
        }

        Write-PpLog "Ensure-Guardian: 啟動新守護 $GuardianScript" "STEP"
        $argList = @('-NoProfile', '-WindowStyle', 'Hidden', '-File', $GuardianScript)
        $proc = Start-Process -FilePath 'powershell' -ArgumentList $argList -WindowStyle Hidden -PassThru

        Write-Utf8File -Path $PidFile -Content "$($proc.Id)" -WithBom $false
        Write-PpLog "Ensure-Guardian: 新守護已啟動,PID=$($proc.Id)" "SUCCESS"
    } finally {
        if ($ensureHandle) { $ensureHandle.Dispose() }
    }

    exit 0
} catch {
    # 守護非關鍵路徑 -- Ensure 失敗絕不擋住派發
    try { Write-PpLog "Ensure-Guardian: 未預期例外(非致命):$($_.Exception.Message)" "WARN" } catch { }
    exit 0
}
