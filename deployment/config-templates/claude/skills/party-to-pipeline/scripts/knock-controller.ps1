#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Track,
    [switch]$DryRun
)
# -- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# knock-controller.ps1  v1.0.0
# party-to-pipeline (ccb-4-ctrl-notify-knock) -- 中控↔中控敲門的中控域包裝
#
# ccb-2 的 UserPromptSubmit 注入只在"使用者剛好送出 prompt"那一瞬間有效。中控 A 對中控 B
# post_ctrl_message 之後,若 B 正 idle 等待 worker,那則留言可以躺數小時。這支腳本就是那個
# 時間點的喚醒途徑:canonical 驗證 -> 取已綁定視窗 -> 速率上界 -> 未讀計數 -> 2-Tuple 判活
# -> 敲門 -> 成功後蓋章。
#
# 分層(DD-1,同 knock-worker.ps1 / close-worker.ps1):所有決策在
# .context-db/scripts/knock-controller-ops.js。本檔只做兩件 PowerShell 才做得到的事:
# 呼叫敲門原語、把結果轉述成機器可讀的一行。
#
# 🔴 console-knock.ps1 逐字不改(BR-028)。它在 whp-12 就是刻意設計成對收件端中立的
#    (參數只有 -TargetPid + -Text,零 domain 查詢),為的正是讓本卡原樣複用。
#    完工驗收:`git diff --stat -- .../console-knock.ps1` 輸出為空。
#
# 🔴 敲門文字必為純 ASCII 且因而不含軌名(BR-029)。console-knock.ps1 在任何 Win32 呼叫之前
#    就拒絕碼位 < 0x20 或 > 0x7E 的字元,而全部 6 個 canonical 軌名皆為 CJK。
#    收件視窗本來就知道自己是哪一軌 ---- 省略軌名不損資訊。
#
# 🔴 本檔與 knock-controller-ops.js 對"終止行程 / 關閉視窗 / console 控制事件 / 視窗焦點"
#    四類操作零命中(含註解),BR-035 有靜態斷言把關。敲門是純加法通知:它不移除任何東西,
#    也不關閉任何東西。關窗是另一條路徑的職責,那條路徑有它自己的前置條件與終態把關。
#
# Usage:
#   .\knock-controller.ps1 -Track <canonical-track-name> [-DryRun]
#
# Kill switch:`scripts/pipeline-config.json` -> ctrlChannel.knockEnabled。
#   設 false 時本腳本為真 no-op(零 DB 讀、零注入、零蓋章),消費端在
#   knock-controller-ops.js 的 resolveKnockConfig();缺鍵預設 true。此旗標刻意做成有實際
#   消費端 -- 對照 TD-WHP2-AUTOCLOSE-FLAG-NO-CONSUMER:那個旗標有 config、有 _comment、
#   零消費端,flip 成 true 是靜默 no-op。
#
# Exit codes:
#   0 = 已敲門,或合法的 no-op(kill switch 關閉 / 零未讀 / 無已綁定視窗 / 速率上界 /
#       DB 不可讀 fail-open)
#   1 = 目標確認存活後,注入本身失敗(last_knock_at 維持不變,可重試)
#   2 = 前置未過(CCB4-E01 軌名 / CCB4-E03 console_pid 為 NULL / CCB4-E04 判活 2-Tuple)
#       或判活探測不可用(CCB4-E05,fail-closed)
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptsDir     = $PSScriptRoot
$ProjectRoot    = (Resolve-Path (Join-Path $ScriptsDir '..\..\..\..')).Path
$OpsScript      = Join-Path $ProjectRoot '.context-db\scripts\knock-controller-ops.js'
$KnockPrimitive = Join-Path $ScriptsDir 'console-knock.ps1'

function Get-LastJsonLine {
    <#
      只取最後一行以 '{' 起頭者。node 只要吐出任何一行 stderr(warning / native module 提示),
      整段直接 ConvertFrom-Json 會讓一個**完全有效的決策**變成解析失敗 -> exit 2,而 exit 2
      的語意是"前置未過",會被中控誤讀成"這個視窗不可敲"。診斷訊息仍留在 $opsOut 供失敗時
      印出,解析卻不再被雜訊打敗(逐字沿用 knock-worker.ps1 的 whp-12 CR F6 修法)。
    #>
    param($Raw)
    $candidates = @(($Raw | Out-String) -split "`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_.StartsWith('{') })
    if ($candidates.Count -eq 0) { return $null }
    return $candidates[-1]
}

function Write-KnockResult {
    <# SDD Spec §4.2:stdout 的最後一行為機器可讀 JSON。 #>
    param([bool]$Knocked, [string]$Reason, [int]$TargetPid = 0, [int]$Unread = 0, [string]$Code = $null)
    $payload = [ordered]@{
        track   = $Track
        knocked = $Knocked
        reason  = $Reason
        code    = $Code
        pid     = $TargetPid
        unread  = $Unread
    } | ConvertTo-Json -Compress
    Write-Host $payload
}

if (-not (Test-Path $OpsScript)) {
    Write-Host "CCB4-E01: knock-controller-ops.js not found at $OpsScript"
    Write-KnockResult -Knocked $false -Reason 'ops-missing' -Code 'CCB4-E01'
    exit 2
}
if (-not (Test-Path $KnockPrimitive)) {
    Write-Host "CCB4-E01: console-knock.ps1 not found at $KnockPrimitive"
    Write-KnockResult -Knocked $false -Reason 'primitive-missing' -Code 'CCB4-E01'
    exit 2
}

# -- 決策(零副作用,全在 Node 側)----
#      native 命令的 stderr 在 ErrorActionPreference='Stop' 下會被升為終止錯誤,故暫切 Continue。
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$opsOut = & node --max-old-space-size=256 $OpsScript --track $Track 2>&1
$opsExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP

$decision = $null
$opsJson = Get-LastJsonLine $opsOut
if ($opsJson) { try { $decision = $opsJson | ConvertFrom-Json } catch { } }
if (-not $decision) {
    Write-Host "CCB4-E01: knock-controller-ops.js produced no parseable output (exit=$opsExit)"
    Write-Host "  raw: $(($opsOut | Out-String).Trim())"
    Write-KnockResult -Knocked $false -Reason 'ops-unparseable' -Code 'CCB4-E01'
    exit 2
}

# -- config 打錯字的警示 ----
#      kill switch 寫成 "false" / 0 這類非 boolean 值時仍視為開啟(不因打錯字關掉已驗證的通道),
#      但必須讓操作者看得見 -- 否則他以為關掉了,實際上每次都還在敲。
if ($decision.configWarning) { Write-Host "WARNING: $($decision.configWarning)" }

# -- 同一軌有多個已綁定視窗:敲 last_seen_at 最新的那一個,但把這件事說出來 ----
if ($decision.ambiguous) {
    Write-Host "note: 該軌有多個已綁定視窗,本次目標為 last_seen_at 最新的那一個"
}

# -- 前置未過:軌名非 canonical / console_pid 為 NULL / 判活失敗 / 判活探測不可用 ----
if ($decision.exit -eq 2) {
    Write-Host "$($decision.code): $($decision.reason) -- zero injection"
    Write-KnockResult -Knocked $false -Reason $decision.reason -Code $decision.code `
        -TargetPid ([int]$(if ($null -eq $decision.targetPid) { 0 } else { $decision.targetPid }))
    exit 2
}

# -- 合法 no-op:kill switch 關閉 / 零未讀 / 無已綁定視窗 / 速率上界 / DB 不可讀(fail-open)----
if (-not $decision.ok) {
    Write-Host "no knock: $($decision.reason)"
    Write-KnockResult -Knocked $false -Reason $decision.reason -Code $decision.code `
        -TargetPid ([int]$(if ($null -eq $decision.targetPid) { 0 } else { $decision.targetPid }))
    exit 0
}

$targetPid = [int]$decision.targetPid
$knockText = [string]$decision.text
$unread    = [int]$decision.unread

if ($DryRun) {
    Write-Host "WOULD KNOCK: pid=$targetPid unread=$unread"
    Write-Host "WOULD SEND : $knockText"
    Write-Host "WOULD STAMP: last_knock_at (only after a successful injection)"
    Write-KnockResult -Knocked $false -Reason 'dry-run' -TargetPid $targetPid -Unread $unread
    exit 0
}

# -- 敲門 ----
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$knockOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $KnockPrimitive `
                -TargetPid $targetPid -Text $knockText 2>&1
$knockExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
Write-Host (($knockOut | Out-String).Trim())

if ($knockExit -ne 0) {
    # BR-033 的另一半:注入失敗時**不**蓋章,該次敲門預算保留給下一次。
    Write-Host "injection failed (exit=$knockExit) -- last_knock_at unchanged, this target can be knocked again"
    Write-KnockResult -Knocked $false -Reason "injection-failed-exit-$knockExit" -Code 'CCB4-E07' `
        -TargetPid $targetPid -Unread $unread
    exit 1
}

# -- BR-033:注入成功之後才蓋章 ----
#      帶 session_id 蓋回**決策當下選中的那一列**。不帶的話 ops 會重算 "last_seen_at 最新",
#      而同一軌若有多個已綁定視窗,決策與蓋章之間任一視窗送出 prompt 就會換人領先 ----
#      敲 A 卻蓋 B:A 的速率上界失效可被連續敲,B 的敲門預算被平白吃掉。
#      以陣列組裝並條件式附加:空字串引數會被 PS 5.1 丟棄而造成後續參數位移
#      (與 TD-WHP4-DISPATCH-EMPTY-ARG-DROP-REGISTER-CONFIRM 同一失效類)。
$stampArgs = @('--max-old-space-size=256', $OpsScript, '--stamp', $Track)
if ($decision.sessionId) { $stampArgs += @('--stamp-session', [string]$decision.sessionId) }

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$stampOut = & node @stampArgs 2>&1
$ErrorActionPreference = $prevEAP

$stamp = $null
$stampJson = Get-LastJsonLine $stampOut
if ($stampJson) { try { $stamp = $stampJson | ConvertFrom-Json } catch { } }
if (-not $stamp -or -not $stamp.ok) {
    # 已經敲成功了,蓋章失敗不推翻那個事實 -- 最壞情況是速率上界失效一次,
    # 代價只是收件視窗可能在區間內多收到一行 ASCII。
    Write-Host "warning: stamp failed after a successful knock -- the rate limit may not apply to the next call"
}

Write-KnockResult -Knocked $true -Reason 'knocked' -TargetPid $targetPid -Unread $unread
exit 0
