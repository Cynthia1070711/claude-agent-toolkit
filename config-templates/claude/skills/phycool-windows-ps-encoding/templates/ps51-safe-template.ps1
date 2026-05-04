# ==============================================================================
# [腳本名稱].ps1
# [功能描述]
#
# 儲存格式：UTF-8 with BOM（VS Code 右下角確認）
# 執行環境：Windows 11 PS 5.1 繁體中文
# ==============================================================================
#Requires -Version 5.1

# ---- 繁中環境 UTF-8 初始化（必須在 param() 之前）----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StoryId,
    [string]$Model = "claude-opus-4-5"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── dot-source 共用工具（路徑依專案結構調整）──
. "$PSScriptRoot\shared-utils.ps1"

# ── 常數 ────────────────────────────────────────────────────────────────────
$Stage       = "create"          # 此腳本負責的階段
$ProjectRoot = Get-ProjectRoot
$DbPath      = Get-DbPath
$IpcDir      = Get-IpcDir $StoryId

# ── 視窗標題 ────────────────────────────────────────────────────────────────
$Host.UI.RawUI.WindowTitle = "[$Stage] $StoryId"

# ── Logger（安全版，無危險字元）──────────────────────────────────────────────
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts    = Get-Date -Format "HH:mm:ss"
    $mark  = switch ($Level) {
        "SUCCESS" { "[OK]"   } "ERROR" { "[ERR]"  }
        "WARN"    { "[WARN]" } "STEP"  { "[STEP]" }
        "DEBUG"   { "[DBG]"  } default { "[INFO]" }
    }
    $color = switch ($Level) {
        "SUCCESS" { "Green"    } "ERROR"   { "Red"      }
        "WARN"    { "Yellow"   } "STEP"    { "Magenta"  }
        "DEBUG"   { "DarkGray" } default   { "Cyan"     }
    }
    Write-Host "[$ts]$mark $Message" -ForegroundColor $color
}

# ── 安全文件讀寫 ─────────────────────────────────────────────────────────────
function Read-Utf8File {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8File {
    param([string]$Path, [string]$Content, [bool]$WithBom = $false)
    $enc = [System.Text.UTF8Encoding]::new($WithBom)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

# ── 主流程 ───────────────────────────────────────────────────────────────────
Write-Log "=================================" "SYSTEM"
Write-Log " 腳本啟動: $Stage | $StoryId"      "SYSTEM"
Write-Log " Model : $Model"                   "SYSTEM"
Write-Log "=================================" "SYSTEM"

try {
    # 讀取任務（安全讀法）
    $taskFile = "$IpcDir\task-$Stage.json"
    if (-not (Test-Path $taskFile)) {
        Write-Log "找不到任務文件: $taskFile" "ERROR"
        exit 1
    }
    $task = (Read-Utf8File $taskFile) | ConvertFrom-Json
    Write-Log "任務已讀取: $($task.title)" "INFO"

    # 構建 Prompt（中文字串在 UTF-8 初始化後安全）
    $prompt = @"
你是 PhyCool 的代理，處理 Story: $StoryId
任務：$($task.task_description)
"@

    # 寫暫存文件（傳給 claude，避免 Start-Process 中文截斷）
    $tmpPrompt = [System.IO.Path]::GetTempFileName() + ".txt"
    Write-Utf8File $tmpPrompt $prompt $false   # No BOM

    Write-Log "啟動 Claude 互動模式..." "STEP"

    $claudeProc = Start-Process "claude" `
        -ArgumentList @("--model", $Model, "@$tmpPrompt") `
        -WorkingDirectory $ProjectRoot `
        -NoNewWindow `
        -PassThru

    Write-Log "Claude PID: $($claudeProc.Id)" "INFO"

    # 延遲後清理暫存文件
    Start-Sleep -Seconds 3
    Remove-Item $tmpPrompt -ErrorAction SilentlyContinue

    # 等待 ACK
    $timeout = 900
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        if ($claudeProc.HasExited) {
            Write-Log "Claude 已退出 (code: $($claudeProc.ExitCode))" "INFO"
            break
        }
        $ackFile = "$IpcDir\ack-$Stage.json"
        if (Test-Path $ackFile) {
            $ack = (Read-Utf8File $ackFile) | ConvertFrom-Json
            if ($ack.ok) {
                Write-Log "主控 ACK 已收到" "SUCCESS"
                break
            }
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
    }

    # 倒數關閉
    for ($i = 5; $i -gt 0; $i--) {
        Write-Host "`r視窗將在 $i 秒後關閉..." -NoNewline -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
    Write-Host ""

    if (-not $claudeProc.HasExited) {
        Stop-Process -Id $claudeProc.Id -Force -ErrorAction SilentlyContinue
    }

    Write-Log "任務結束: $Stage" "SUCCESS"

} catch {
    Write-Log "執行錯誤: $_" "ERROR"
    exit 1
}
