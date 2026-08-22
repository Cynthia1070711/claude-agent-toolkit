# ==============================================================================
# Get-ChromeTabsUia.ps1  v1.0.0
# 以 Windows UI Automation 獨立清點 Chrome 的視窗/分頁, 供與 MCP list_pages 交叉驗證
#
# 為什麼需要:
#   list_pages 只反映 MCP 看得到的 target。要對使用者斷言"你開了 N 個分頁",
#   必須有一條獨立的證據路徑; 單一來源不足以下結論。
#
# 本腳本已修掉三種實測抓到的假陽性:
#   1. Chrome_WidgetWin_1 是所有 Chromium 系應用共用的 ClassName (VS Code / Antigravity /
#      Edge), 未過濾 chrome.exe PID 時 IDE 側邊欄面板會被算成分頁 (實測誤報 27)。
#   2. 三點選單按鈕的 Name 是 Chrome, 會與設定檔名"你的 Chrome"誤配。
#   3. 網站自己的 ARIA tab 也是 TabItem (Gmail 的 主要/促銷內容/社群網路 + 右側
#      日曆/Keep/Tasks 面板), 1 個分頁會被算成 11 個 -- 扣掉位於 Document 子樹下者。
#
# 用法:
#   .\Get-ChromeTabsUia.ps1
#   .\Get-ChromeTabsUia.ps1 -Quiet     (只輸出彙總三行, 不列每個分頁標題)
#
# 輸出末尾三行為彙總: WINDOWS / PROFILES_IN_USE / TOTAL_UIA_TABS
# 退出碼: 0 = 有找到 Chrome 視窗; 1 = 找不到任何 Chrome 視窗
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Quiet
)

# ---- PS 5.1 繁中 UTF-8 init -- 對齊 windows-ps-encoding ----
# (置於 param 之後: [CmdletBinding()]/param 必須是腳本第一個可執行語句, 這是 PS 語法硬限制)
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ----------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

# 頭像按鈕名稱長度上限 (見假陽性 5)。Chrome 頭像鈕顯示設定檔名或 Google 帳號名,
# 實測最長為 gaia_name 如 'YAMAHA大聯葉（小編）' 等級, 40 足夠寬鬆。
$MaxProfileButtonNameLength = 40

# ---- 1) 從 Local State 取得所有設定檔的顯示名 / Google 帳號名 ----
$names = @()
$localState = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Local State'
if (Test-Path $localState) {
    $json = Get-Content $localState -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $json.profile.info_cache.PSObject.Properties) {
        if (-not $Quiet) {
            Write-Output "PROFILE-DEFINED: dir='$($p.Name)' name='$($p.Value.name)' gaia='$($p.Value.gaia_name)'"
        }
        $names += @($p.Value.name, $p.Value.gaia_name) | Where-Object { $_ }
    }
}

# ---- 2) UIA 清點 ----
$chromePids = @((Get-Process chrome -ErrorAction SilentlyContinue).Id)
if ($chromePids.Count -eq 0) {
    Write-Output 'NO_CHROME 找不到執行中的 chrome.exe'
    exit 1
}

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$cn = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Chrome_WidgetWin_1')
$tabC = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::TabItem)
$btnC = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
$docC = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Document)

$total = 0
$winN = 0
$seen = @()

foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cn)) {
    # 假陽性 1: 排除非 chrome.exe 的 Chromium 系應用 (VS Code / Antigravity / Edge)
    if ($chromePids -notcontains $w.Current.ProcessId) { continue }
    if ([string]::IsNullOrWhiteSpace($w.Current.Name)) { continue }

    $rawTabs = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabC)
    if ($rawTabs.Count -eq 0) { continue }

    # 假陽性 3: 扣掉網頁內容 (Document) 子樹下的 ARIA tab
    $inPage = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($d in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $docC)) {
        foreach ($t in $d.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabC)) {
            [void]$inPage.Add(($t.GetRuntimeId() -join '.'))
        }
    }
    $tabs = @($rawTabs | Where-Object { -not $inPage.Contains(($_.GetRuntimeId() -join '.')) })
    if ($tabs.Count -eq 0) { continue }

    $winN++
    $total += $tabs.Count

    # 以頭像按鈕名稱推斷設定檔 (雙向子字串比對: 子曦 對得上 黃子曦)
    $hit = @()
    foreach ($b in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnC)) {
        $bn = $b.Current.Name
        # 假陽性 2: Chrome 是三點選單按鈕名, 非頭像
        if ([string]::IsNullOrWhiteSpace($bn) -or $bn.Length -lt 2 -or $bn -eq 'Chrome') { continue }
        # 假陽性 5: 頭像鈕名不會超過數十字元。網頁內容的長文字按鈕若含短設定檔名
        # (實測: 設定檔名 'CC' vs DevConsole 卡片的 CCB / CC-SONNET / CC-OPUS)
        # 會被 $bn.Contains($k) 誤配, 令設定檔欄變成數百條標題串接 (實測輸出 140KB)。
        if ($bn.Length -gt $MaxProfileButtonNameLength) { continue }
        # 假陽性 4: -like 是 wildcard 比對, 按鈕名稱含 [ ] 時 "*$bn*" 成為非法 pattern
        # 直接 throw 中止全腳本 (實測: DevConsole story 卡片文字含 [已拆分 ...] 必炸)。
        # 改 .Contains() literal 比對 -- 語意等價 (雙向子字串), 無 wildcard 陷阱。
        foreach ($k in $names) {
            if ($bn.Contains($k) -or $k.Contains($bn)) { $hit += $bn }
        }
    }
    $prof = if ($hit) { ($hit | Select-Object -Unique) -join '/' } else { '(未偵測到)' }
    $seen += $prof

    if (-not $Quiet) {
        Write-Output "WINDOW $winN [$prof] -> tabs=$($tabs.Count)  :: $($w.Current.Name)"
        foreach ($t in $tabs) { Write-Output "   TAB: $($t.Current.Name)" }
    }
}

Write-Output "WINDOWS=$winN"
Write-Output "PROFILES_IN_USE=$(($seen | Select-Object -Unique).Count)  ($(($seen | Select-Object -Unique) -join ', '))"
Write-Output "TOTAL_UIA_TABS=$total"

if ($winN -eq 0) { exit 1 }
exit 0
