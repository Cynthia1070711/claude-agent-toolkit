#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$RunId,
    [switch]$DryRun
)
# -- 繁中環境 UTF-8 初始化(必須在 param() 之後) ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# -----------------------------------------------

# ==============================================================================
# knock-worker.ps1  v1.0.0
# party-to-pipeline (whp-12-knock-console-inject) -- 慢環敲門的 worker 域包裝
#
# 中控在 revise 迴圈裡讀完報告、寫好指示之後,worker 早已 idle、D2 的 hookGraceSec 也早已逾時。
# 這支腳本就是那個時間點唯一的程式化喚醒途徑:判活 -> lifecycle 白名單 -> 取待送指示 ->
# 敲門 -> 成功後標記。
#
# 分層(DD-1,同 close-worker.ps1):所有決策在 .context-db/scripts/knock-worker-ops.js。
# 本檔只做兩件 PowerShell 才做得到的事:呼叫敲門原語、把結果轉述成機器可讀的一行。
#
# 🔴 本檔與 console-knock.ps1 一行 kill / 關窗原語都沒有(BR-014,使用者硬裁定②③)。
#    敲門是純加法:它不移除任何東西,也不關閉任何東西。關窗請走 close-worker.ps1。
#
# Usage:
#   .\knock-worker.ps1 -RunId <uuid> [-DryRun]
#
# Kill switch:`scripts/pipeline-config.json` -> workerProtocol.knockEnabled(BR-022)。
#   設 false 時本腳本為真 no-op(零 DB 讀、零注入、零標記),消費端在 knock-worker-ops.js 的
#   resolveKnockEnabled();缺鍵預設 true。此旗標刻意做成有實際消費端 -- 對照
#   TD-WHP2-AUTOCLOSE-FLAG-NO-CONSUMER:那個旗標有 config、有 _comment、零消費端,
#   flip 成 true 是靜默 no-op。AC10 就是為了不重蹈它而寫的。
#
# Exit codes:
#   0 = 已敲門,或合法的 no-op(kill switch 關閉 / 無待送指示 / DB 不可讀 fail-open)
#   1 = 目標確認存活後,注入本身失敗(knocked_at 維持 NULL,下次可重敲)
#   2 = 前置未過(WHP12-E06 判活 / WHP12-E07 lifecycle)或判活探測不可用(WHP12-E08,fail-closed)
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptsDir   = $PSScriptRoot
$ProjectRoot  = (Resolve-Path (Join-Path $ScriptsDir '..\..\..\..')).Path
$OpsScript    = Join-Path $ProjectRoot '.context-db\scripts\knock-worker-ops.js'
$KnockPrimitive = Join-Path $ScriptsDir 'console-knock.ps1'

function Get-LastJsonLine {
    <#
      whp-12 CR F6:ops 的呼叫用 2>&1 併流以保留診斷訊息,但若整段直接 ConvertFrom-Json,
      node 只要吐出任何一行 stderr(warning / native module 提示),一個**完全有效的決策**就會
      變成 'ops-unparseable' -> exit 2,而 exit 2 的語意是"前置未過",會被中控誤讀成
      "這個 worker 不可敲"。改為只取最後一行以 '{' 起頭者:診斷訊息仍留在 $opsOut 供失敗時印出,
      解析卻不再被雜訊打敗。(對照 close-worker.ps1:92 走 2>$null -- 那是丟掉診斷換取穩定,
      本函式兩者兼得。)
    #>
    param($Raw)
    $candidates = @(($Raw | Out-String) -split "`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_.StartsWith('{') })
    if ($candidates.Count -eq 0) { return $null }
    return $candidates[-1]
}

function Write-KnockResult {
    param([bool]$Knocked, [string]$Reason, [int]$TargetPid = 0, $MsgIds = @(), [string]$Code = $null)
    $payload = @{
        run_id   = $RunId
        knocked  = $Knocked
        reason   = $Reason
        code     = $Code
        pid      = $TargetPid
        msg_ids  = @($MsgIds)
    } | ConvertTo-Json -Compress
    Write-Host "KNOCK_RESULT: $payload"
}

if (-not (Test-Path $OpsScript)) {
    Write-Host "WHP12-E10: knock-worker-ops.js not found at $OpsScript"
    Write-KnockResult -Knocked $false -Reason 'ops-missing' -Code 'WHP12-E10'
    exit 2
}
if (-not (Test-Path $KnockPrimitive)) {
    Write-Host "WHP12-E10: console-knock.ps1 not found at $KnockPrimitive"
    Write-KnockResult -Knocked $false -Reason 'primitive-missing' -Code 'WHP12-E10'
    exit 2
}

# -- 決策(零副作用,全在 Node 側)----
#      native 命令的 stderr 在 ErrorActionPreference='Stop' 下會被升為終止錯誤,故暫切 Continue。
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$opsOut = & node --max-old-space-size=256 $OpsScript --run-id $RunId 2>&1
$opsExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP

$decision = $null
$opsJson = Get-LastJsonLine $opsOut
if ($opsJson) { try { $decision = $opsJson | ConvertFrom-Json } catch { } }
if (-not $decision) {
    Write-Host "WHP12-E10: knock-worker-ops.js produced no parseable output (exit=$opsExit)"
    Write-Host "  raw: $(($opsOut | Out-String).Trim())"
    Write-KnockResult -Knocked $false -Reason 'ops-unparseable' -Code 'WHP12-E10'
    exit 2
}

# -- config 打錯字的警示(whp-12 CR F2)----
#      kill switch 寫成 "false" / 0 這類非 boolean 值時仍視為開啟(不因打錯字關掉已驗證的通道),
#      但必須讓操作者看得見 -- 否則他以為關掉了,實際上每次都還在敲。
if ($decision.configWarning) { Write-Host "WARNING: $($decision.configWarning)" }

# -- 前置未過:判活失敗 / lifecycle 不在白名單 / 判活探測不可用 ----
if ($decision.exit -eq 2) {
    Write-Host "$($decision.code): $($decision.reason) -- zero injection"
    Write-KnockResult -Knocked $false -Reason $decision.reason -Code $decision.code
    exit 2
}

# -- 合法 no-op:kill switch 關閉 / 無待送指示 / DB 不可讀(fail-open)----
if (-not $decision.ok) {
    Write-Host "no knock: $($decision.reason)"
    Write-KnockResult -Knocked $false -Reason $decision.reason -Code $decision.code
    exit 0
}

$targetPid = [int]$decision.targetPid
$knockText = [string]$decision.text
$msgIds    = @($decision.msgIds)

if ($DryRun) {
    Write-Host "WOULD KNOCK: pid=$targetPid msg_ids=$($msgIds -join ',')"
    Write-Host "WOULD SEND : $knockText"
    Write-Host "WOULD STAMP: knocked_at on msg_id $($msgIds -join ',') (only after a successful injection)"
    Write-KnockResult -Knocked $false -Reason 'dry-run' -TargetPid $targetPid -MsgIds $msgIds
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
    # BR-021 的另一半:注入失敗時**不** stamp,該指示的一次敲門預算保留給下一次。
    Write-Host "injection failed (exit=$knockExit) -- knocked_at left NULL, this directive can be knocked again"
    Write-KnockResult -Knocked $false -Reason "injection-failed-exit-$knockExit" -TargetPid $targetPid -MsgIds $msgIds
    exit 1
}

# -- BR-021:注入成功之後才標記 ----
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$stampOut = & node --max-old-space-size=256 $OpsScript --stamp $RunId --msg-ids ($msgIds -join ',') 2>&1
$ErrorActionPreference = $prevEAP

$stamp = $null
$stampJson = Get-LastJsonLine $stampOut
if ($stampJson) { try { $stamp = $stampJson | ConvertFrom-Json } catch { } }
if (-not $stamp -or -not $stamp.ok) {
    # 已經敲成功了,stamp 失敗不推翻那個事實 -- 最壞情況是同一則指示被重複敲一次,
    # 代價只是 worker 多讀一次 DB(SDD §2.3 BR-021 明列此反向風險為可接受)。
    Write-Host "warning: stamp failed after a successful knock -- the directive may be knocked once more later"
} elseif ($stamp.changes -lt $msgIds.Count) {
    # whp-12 CR F8:stampKnocked 的 TOCTOU 守衛(state='pending' AND knocked_at IS NULL)命中時
    # 回 ok=true 但 changes 少於提交筆數 -- 代表 D1 在 peek 與注入之間先送達了。這不是錯誤,
    # 但下方 KNOCK_RESULT 會宣告這些 msg_id 已敲門,若不說出來,日後對帳 knocked_at 會對不上。
    Write-Host "note: stamped $($stamp.changes) of $($msgIds.Count) directive(s) -- the rest were delivered by D1 between peek and knock"
}

Write-KnockResult -Knocked $true -Reason 'knocked' -TargetPid $targetPid -MsgIds $msgIds
exit 0
