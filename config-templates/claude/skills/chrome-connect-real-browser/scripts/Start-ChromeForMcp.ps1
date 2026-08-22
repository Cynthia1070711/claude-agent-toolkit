# ==============================================================================
# Start-ChromeForMcp.ps1  v1.0.0
# 以指定的使用者設定檔啟動真實 Chrome, 並自動處理遠端偵錯授權對話框
#
# 解決什麼問題:
#   1. 要讓 agent 用另一個 Google 帳號操作 (例如切到另一個 GCP 專案的擁有者帳號),
#      唯一可靠做法是用 --profile-directory 指定設定檔啟動, 而該參數若目錄名含空格
#      又沒加引號, Chrome 會誤建一個名為 Profile 的空設定檔並把後半當網址開 (實測踩過)。
#   2. Chrome 144+ 每建立一條新 CDP 連線就跳一次授權框, 官方無永久允許設定,
#      需要 UIA 代按 (見 chrome-auto-approve-debug.ps1)。
#
# 用法:
#   .\Start-ChromeForMcp.ps1 -List
#   .\Start-ChromeForMcp.ps1 -ProfileDirectory Default
#   .\Start-ChromeForMcp.ps1 -ProfileDirectory 'Profile 1' -Url https://console.cloud.google.com
#   .\Start-ChromeForMcp.ps1 -ProfileDirectory Default -NoApprove
#
# 退出碼: 0 = 成功 (或 -List 正常列出); 1 = 設定檔不存在 / chrome.exe 找不到
#
# 注意: 啟動後不需要重新連線 MCP -- 新設定檔視窗的分頁會直接出現在既有 list_pages
#       結果裡, 且通常不觸發新的授權對話框 (授權綁 browser process 不綁設定檔)。
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProfileDirectory,
    [string]$Url,
    [switch]$List,
    [switch]$NoApprove,
    [int]$ApproveTimeoutSec = 100
)

# ---- PS 5.1 繁中 UTF-8 init -- 對齊 windows-ps-encoding ----
# (置於 param 之後: [CmdletBinding()]/param 必須是腳本第一個可執行語句, 這是 PS 語法硬限制)
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ----------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$ChromeExe = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$LocalState = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Local State'
# 代按腳本與本檔同目錄 -- 不用相對層數回推, 避免搬移目錄後解析到 repo 外 (2026-08-02 實測缺陷)
$ApproveScript = Join-Path $PSScriptRoot 'chrome-auto-approve-debug.ps1'

function Get-ChromeProfiles {
    if (-not (Test-Path $LocalState)) {
        Write-Output "WARN 找不到 Local State: $LocalState"
        return @()
    }
    $json = Get-Content $LocalState -Raw -Encoding UTF8 | ConvertFrom-Json
    $out = @()
    foreach ($p in $json.profile.info_cache.PSObject.Properties) {
        $out += [pscustomobject]@{
            Directory = $p.Name
            Name      = $p.Value.name
            GaiaName  = $p.Value.gaia_name
        }
    }
    return $out
}

# ---- -List: 只列出不啟動 ----
if ($List) {
    $profiles = Get-ChromeProfiles
    if ($profiles.Count -eq 0) {
        Write-Output 'NO_PROFILES 讀不到任何設定檔'
        exit 1
    }
    Write-Output '可用的 Chrome 設定檔 (Directory 即 -ProfileDirectory 應傳的值):'
    $profiles | Format-Table Directory, Name, GaiaName -AutoSize | Out-String | Write-Output
    exit 0
}

if (-not $ProfileDirectory) {
    Write-Output 'USAGE 需指定 -ProfileDirectory, 或用 -List 查看可用設定檔'
    exit 1
}

if (-not (Test-Path $ChromeExe)) {
    Write-Output "NOT_FOUND chrome.exe 不存在: $ChromeExe"
    exit 1
}

# ---- 驗證設定檔存在 (避免誤建空設定檔) ----
$profiles = Get-ChromeProfiles
if ($profiles.Count -gt 0) {
    $hit = $profiles | Where-Object { $_.Directory -eq $ProfileDirectory }
    if (-not $hit) {
        Write-Output "PROFILE_NOT_FOUND 設定檔目錄不存在: $ProfileDirectory"
        Write-Output '現有設定檔:'
        $profiles | Format-Table Directory, Name -AutoSize | Out-String | Write-Output
        Write-Output '中止 -- 若強行啟動, Chrome 會建立一個同名的空設定檔。'
        exit 1
    }
    Write-Output "PROFILE_OK $($hit.Directory) = $($hit.Name)"
}

# ---- 先掛授權代按 (必須在 CDP 連線建立之前就位) ----
if (-not $NoApprove) {
    if (Test-Path $ApproveScript) {
        Start-Process powershell `
            -ArgumentList '-ExecutionPolicy', 'Bypass', '-File', $ApproveScript, '-TimeoutSec', "$ApproveTimeoutSec" `
            -WindowStyle Hidden
        Write-Output "APPROVER_STARTED timeout=${ApproveTimeoutSec}s"
    }
    else {
        Write-Output "APPROVER_MISSING 找不到代按腳本: $ApproveScript"
        Write-Output '若隨後 list_pages 卡住不回, 表示授權框在等人按, 請手動按允許。'
    }
}

# ---- 啟動 Chrome ----
# 關鍵: 目錄名含空格時, 值必須用雙引號包住, 否則 Chrome 會把空格後的部分當成網址,
#       並建立一個名為 Profile 的空設定檔 (2026-07-26 實測事故)。
$chromeArgs = @("--profile-directory=`"$ProfileDirectory`"")
if ($Url) { $chromeArgs += $Url }

Start-Process $ChromeExe -ArgumentList $chromeArgs
Write-Output "CHROME_STARTED profile=$ProfileDirectory$(if ($Url) { " url=$Url" })"
Write-Output 'NEXT 直接呼叫 MCP list_pages 即可 -- 新視窗分頁會併入既有連線, 無需重新連接。'
exit 0
