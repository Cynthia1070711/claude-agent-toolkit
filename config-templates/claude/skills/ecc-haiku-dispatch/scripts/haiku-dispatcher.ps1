#Requires -Version 5.1
<#
.SYNOPSIS
    haiku-dispatcher.ps1 - 啟動 Haiku Agent (claude-haiku-4-5-20251001) 子視窗執行
    L2 atomic instinct dispatch.

.DESCRIPTION
    對齊 ecc-10 Story Phase 2 + IDD-STR-001 D2 獨立 Haiku Agent (避免 Opus 主視窗
    token 污染)。本 script 為 main window 觸發 Haiku Agent dispatch 的 wrapper:
    1. Read payload from JSON file
    2. 啟動 claude --model claude-haiku-4-5-20251001 --append-system-prompt 注入 contract spec
    3. Haiku Agent 執行 atomic dispatch (對齊 IInstinctDispatcher contract)
    4. 寫回 result + state_diff 至 dispatch-output.json
    5. Main window read output + verify

.PARAMETER InstinctName
    One of 10 L2 atomic instincts.

.PARAMETER PayloadFile
    Path to JSON file containing InstinctDispatchInput.

.EXAMPLE
    .\haiku-dispatcher.ps1 -InstinctName 'skill_invocation' `
                          -PayloadFile .context-db/ecc-state/dispatch-input.json

.NOTES
    本 script 為 ecc-10 Phase 2 wrapper scaffold · 完整 claude --model haiku 整合
    在 dev-story Phase 3-5 補完 (對齊 ecc-10 stub implementation_approach Phase 3
    dispatch quality 評估器 + Phase 4 Stage β gate hook + Phase 5 Azure deployment).
    當前 scaffold 行為: validate input + 標準輸出 stub command.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstinctName,
    [Parameter(Mandatory)][string]$PayloadFile,
    [string]$OutputFile = ".context-db/ecc-state/dispatch-output.json"
)

# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Load IInstinctDispatcher module ────────────────────────────────────────────
$ModulePath = Join-Path $PSScriptRoot "IInstinctDispatcher.psm1"
if (-not (Test-Path $ModulePath)) {
    throw "IInstinctDispatcher.psm1 not found at '$ModulePath'. Run ecc-10 Phase 1 contract first scaffold."
}
Import-Module $ModulePath -Force

# ── Read payload ───────────────────────────────────────────────────────────────
if (-not (Test-Path $PayloadFile)) {
    throw "PayloadFile not found: '$PayloadFile'"
}

$rawPayload = Get-Content $PayloadFile -Raw -Encoding UTF8
$payloadObj = $rawPayload | ConvertFrom-Json

# Validate input shape (對齊 contract InstinctDispatchInput)
if (-not $payloadObj.payload) {
    throw "PayloadFile missing 'payload' field (對齊 IInstinctDispatcher contract)"
}

$payloadHashtable = @{
    trigger_context = $payloadObj.payload.trigger_context
    rule_reference  = $payloadObj.payload.rule_reference
}
# Strict mode safe property access (PSObject.Properties.Match · 不存在 property 不拋)
if ($payloadObj.payload.PSObject.Properties.Match('file_path').Count -gt 0)  { $payloadHashtable.file_path = $payloadObj.payload.file_path }
if ($payloadObj.payload.PSObject.Properties.Match('metadata').Count -gt 0)   { $payloadHashtable.metadata  = $payloadObj.payload.metadata }

# ── v2.0 Dual-Mode Haiku Agent Dispatch(2026-05-23 P2.1b 分項 1 keystone)─────────────
# Toggle via env var PHYCOOL_HAIKU_REAL=1 啟用 real subprocess · default in-process mock
$useReal = $env:PHYCOOL_HAIKU_REAL -eq '1' -or $env:PHYCOOL_HAIKU_REAL -eq 'true'

Write-Host "▶ haiku-dispatcher.ps1 v2.0.0" -ForegroundColor Cyan
Write-Host "  InstinctName: $InstinctName"
Write-Host "  PayloadFile:  $PayloadFile"
Write-Host "  OutputFile:   $OutputFile"
Write-Host "  Mode:         $(if ($useReal) { 'REAL (claude --model claude-haiku-4-5-20251001)' } else { 'MOCK (default · set PHYCOOL_HAIKU_REAL=1 for real)' })" -ForegroundColor $(if ($useReal) { 'Green' } else { 'Yellow' })
Write-Host ""

if (-not $useReal) {
    # Mock mode: in-process dispatch via PSM1 (PSM1 v2.0 內部 PHYCOOL_HAIKU_REAL not set 走 mock)
    # 避免 PSM1 → ps1 → PSM1 infinite loop: PSM1 透過 ps1 wrapper 已避免直接遞迴呼叫
    $result = Invoke-InstinctDispatch -InstinctName $InstinctName -Payload $payloadHashtable
} else {
    # Real mode: spawn claude --model claude-haiku-4-5-20251001 subprocess
    # FIX 2026-05-24 (real-mode foundation verification): $Script:INSTINCT_SUPREME_MAP is module-scoped
    # in IInstinctDispatcher.psm1 — NOT accessible via $Script: here under StrictMode (throws "not set" → exit 99).
    # payload.rule_reference 已在上游 psm1 Invoke-InstinctDispatch (L247-250) 對齊 INSTINCT_SUPREME_MAP 驗證過,
    # 故此處直接用 payload 值 — StrictMode-safe,避開 module scope leak。
    $expectedRule = if ($payloadHashtable.ContainsKey('rule_reference') -and $payloadHashtable.rule_reference) { $payloadHashtable.rule_reference } else { 'unknown-rule' }
    $stateFileExpected = ".context-db/ecc-state/$($InstinctName -replace '_', '-')-state.json"

    # Build contract spec system prompt
    $contractSpec = @"
You are ECC L2 atomic instinct dispatcher. Return ONLY valid JSON matching InstinctDispatchOutput schema:
{
  "status": "success" | "failure" | "partial",
  "result": {"action_taken": "<short description>", "side_effects": ["<state_file_path>"]},
  "state_diff": {"state_file": "$stateFileExpected", "before": {}, "after": {"last_dispatch": "<timestamp>"}},
  "timestamp": "<ISO8601 UTC+8>",
  "evidence": {"rule_applied": "$expectedRule", "evidence_paths": ["<refs>"]}
}
NO markdown wrapper. NO commentary. JSON only.
"@

    $userPrompt = @"
Dispatch L2 atomic instinct: $InstinctName
Trigger context: $($payloadHashtable.trigger_context)
Rule reference: $($payloadHashtable.rule_reference)
File path: $(if ($payloadHashtable.ContainsKey('file_path') -and $payloadHashtable.file_path) { $payloadHashtable.file_path } else { 'n/a' })

Apply dispatch logic per the rule_reference (see SUPREME rule docs). Return InstinctDispatchOutput JSON.
"@

    Write-Host "  → Spawning claude --model claude-haiku-4-5-20251001 subprocess..." -ForegroundColor DarkCyan
    try {
        $claudeRaw = $userPrompt | & claude --model claude-haiku-4-5-20251001 --dangerously-skip-permissions -p --append-system-prompt $contractSpec 2>&1
        # Strip potential markdown wrapper(Haiku 偶爾包 ```json ... ``` 即使 prompt 禁)
        $cleanOutput = (($claudeRaw -join "`n") -replace '(?s)^[^{]*```(?:json)?\s*', '' -replace '```[^}]*$', '').Trim()
        $result = $cleanOutput | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Warning "claude subprocess failed or JSON parse error: $($_.Exception.Message)"
        $result = [PSCustomObject]@{
            status = 'failure'
            result = [PSCustomObject]@{
                action_taken = "claude --model haiku subprocess failure: $($_.Exception.Message)"
                side_effects = @($stateFileExpected)
            }
            state_diff = [PSCustomObject]@{ state_file = $stateFileExpected; before = @{}; after = @{ last_failure_at = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz') } }
            timestamp = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
            evidence = [PSCustomObject]@{
                rule_applied = $expectedRule
                evidence_paths = @("mode:real-failure", "exception:$($_.Exception.Message)")
            }
        }
    }
}

# ── Write output (atomic · 對齊 mcp-payload-discipline + encoding-discipline) ───
$OutputDir = Split-Path $OutputFile -Parent
if ($OutputDir -and -not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$jsonOutput = $result | ConvertTo-Json -Depth 10
$tempFile   = "$OutputFile.tmp"

# v2.0 atomic write fix (strict mode safe · 2026-05-23 latent bug rescue):
# 既有 Resolve-Path -ErrorAction SilentlyContinue 在 file 不存返 $null,strict mode `.Path` 拋
# 改用 IsPathRooted check + Combine 取 absolute path · UTF-8 No-BOM
$absTempFile = if ([System.IO.Path]::IsPathRooted($tempFile)) { $tempFile } else { [System.IO.Path]::Combine($PWD.Path, $tempFile) }
$absOutputFile = if ([System.IO.Path]::IsPathRooted($OutputFile)) { $OutputFile } else { [System.IO.Path]::Combine($PWD.Path, $OutputFile) }

[System.IO.File]::WriteAllText($absTempFile, $jsonOutput, [System.Text.UTF8Encoding]::new($false))
Move-Item -Path $absTempFile -Destination $absOutputFile -Force

Write-Host "✓ Dispatch result written to: $OutputFile" -ForegroundColor Green
Write-Host "  Status: $($result.status)"
Write-Host "  StateFile: $($result.state_diff.state_file)"

# Exit code: 0 success / 1 partial / 2 failure
switch ($result.status) {
    'success' { exit 0 }
    'partial' { exit 1 }
    'failure' { exit 2 }
    default   { exit 3 }
}
