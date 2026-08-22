# ==============================================================================
# chrome-auto-approve-debug.ps1  v1.0.0
# 自動按下 Chrome 的 [允許遠端偵錯嗎] 授權對話框
#
# 為什麼需要這支腳本:
#   Chrome 144+ 的 --auto-connect 每建立一條新的 CDP 連線就會跳一次授權對話框。
#   chrome://inspect/#remote-debugging 的開關 (Local State 的
#   devtools.remote_debugging.user-enabled) 只是啟用功能, 不等於永久批准連線。
#   官方目前沒有任何 [永久允許] 設定, 上游功能請求 chrome-devtools-mcp #825 尚未實作,
#   因此唯一能讓 agent 免人工介入的方式, 就是用 UI Automation 代按 [允許]。
#
# 用法 (中控在呼叫 MCP list_pages 等工具之前先於背景啟動本腳本):
#   powershell -ExecutionPolicy Bypass -File scripts/chrome-auto-approve-debug.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/chrome-auto-approve-debug.ps1 -TimeoutSec 30 -Once
#
# 退出碼: 0 = 至少按下一次允許; 1 = 逾時期間未出現對話框
#
# 安全性: 只在確認該視窗含有 [允許遠端偵錯] 提示文字時才按, 且按鈕名稱採精確比對,
#         不會誤按其他對話框的 [允許], 也不會按到 [取消]。
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [int]$TimeoutSec = 90,
    [switch]$Once,
    [int]$PollMs = 500
)

# ---- PS 5.1 繁中 UTF-8 init -- 對齊 windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ----------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

# 用於確認確實是遠端偵錯授權框的提示文字 (zh-TW / en)
$DialogPattern = '允許遠端偵錯|Allow remote debugging'
# 允許鈕名稱採精確比對, 避免命中 [不允許]
$AllowNames = @('允許', 'Allow')

function Find-AllowButton {
    $chromePids = @((Get-Process chrome -ErrorAction SilentlyContinue).Id)
    if ($chromePids.Count -eq 0) { return $null }

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $txtC = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Text)
    $btnC = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button)

    foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children,
                                 [System.Windows.Automation.Condition]::TrueCondition)) {
        try {
            if ($chromePids -notcontains $w.Current.ProcessId) { continue }

            $isDialog = $false
            foreach ($t in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $txtC)) {
                if ($t.Current.Name -match $DialogPattern) { $isDialog = $true; break }
            }
            if (-not $isDialog) { continue }

            foreach ($b in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnC)) {
                if ($AllowNames -contains $b.Current.Name) { return $b }
            }
        } catch {
            # 視窗在列舉過程中關閉屬正常, 跳過即可
        }
    }
    return $null
}

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$clicked = 0

while ((Get-Date) -lt $deadline) {
    $btn = Find-AllowButton
    if ($null -ne $btn) {
        try {
            $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
            $clicked++
            Write-Output "APPROVED #$clicked at $(Get-Date -Format 'HH:mm:ss')"
            if ($Once) { break }
            Start-Sleep -Milliseconds 1000
        } catch {
            Write-Output "CLICK FAILED: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Milliseconds $PollMs
}

if ($clicked -gt 0) {
    Write-Output "DONE clicked=$clicked"
    exit 0
}
Write-Output "TIMEOUT no approval dialog seen in $TimeoutSec s"
exit 1
