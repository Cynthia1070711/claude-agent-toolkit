#Requires -Version 5.1
<#
.SYNOPSIS
    IInstinctDispatcher - ECC L2 atomic instinct Haiku Agent dispatcher PowerShell module.

.DESCRIPTION
    對齊 ecc-10 Story Phase 1 PRIORITY contract first 設計 + ADR-ECC-LEARNING-001 v1.2.0
    §Instinct↔SUPREME Rule Mapping Table (10 instincts × 10 SUPREME rules · 1-to-1).
    範式: Haiku Agent (claude-haiku-4-5-20251001) 接收 input → atomic dispatch →
    寫回 output + state_diff.

    對齊 IDD-STR-001 4 forbidden_changes:
    - D2 獨立 Haiku Agent (禁 Opus 承載 dispatch)
    - D3 不追 HyperAgents (scope 收斂)
    - D4 Stage β 後評估 production gate (本 module non-production)

.VERSION
    1.0.0 (2026-05-23 · ecc-10 Phase 1 contract first scaffold)

.AUTHOR
    CC-OPUS · Stage β P0.6 Coverage Rescue 後 ecc-10 dev-story workflow Phase 1
#>

# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Constants ───────────────────────────────────────────────────────────────────
$Script:VALID_INSTINCTS = @(
    'skill_invocation', 'hook_dispatch', 'cross_ref', 'depth_first',
    'governance', 'parallel_isolation', 'capability_integration',
    'pipeline_handshake', 'mcp_payload', 'encoding_discipline'
)

$Script:VALID_STATUSES  = @('success', 'failure', 'partial')

$Script:INSTINCT_SUPREME_MAP = @{
    'skill_invocation'       = 'skill-tool-invocation-mandatory v1.2.0'
    'hook_dispatch'          = 'hooks-creation-discipline'
    'cross_ref'              = 'cross-ref-discipline v1.0.0'
    'depth_first'            = 'constitutional-depth-first'
    'governance'             = 'skill-idd-sync-gate + skill-sync-gate'
    'parallel_isolation'     = 'parallel-batch-conflict-isolation v1.0.0'
    'capability_integration' = 'capability-integration-mandate v1.0.0'
    'pipeline_handshake'     = 'pipeline-handshake-protocol v1.0.0'
    'mcp_payload'            = 'mcp-payload-discipline v1.0.0'
    'encoding_discipline'    = 'encoding-discipline v1.0.0'
}

$Script:ECC_STATE_DIR = ".context-db/ecc-state"

# ── Helpers ─────────────────────────────────────────────────────────────────────

function Get-TaiwanTimestamp {
    return (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
}

function Test-InstinctName {
    param([string]$InstinctName)
    if ($InstinctName -notin $Script:VALID_INSTINCTS) {
        throw "Invalid instinct_name '$InstinctName'. Valid: $($Script:VALID_INSTINCTS -join ', ')"
    }
}

function Get-StateFilePath {
    param([string]$InstinctName)
    Test-InstinctName -InstinctName $InstinctName
    $kebab = $InstinctName -replace '_', '-'
    return "$Script:ECC_STATE_DIR/${kebab}-state.json"
}

# ── Main API ────────────────────────────────────────────────────────────────────

<#
.SYNOPSIS
    Invoke L2 atomic instinct dispatch via IInstinctDispatcher contract.

.PARAMETER InstinctName
    One of 10 L2 atomic instincts (對齊 ADR v1.2.0 §Instinct↔SUPREME Mapping).

.PARAMETER Payload
    Hashtable with trigger_context, file_path (optional), rule_reference, metadata (optional).

.EXAMPLE
    Invoke-InstinctDispatch -InstinctName 'skill_invocation' -Payload @{
        trigger_context = 'Edit .claude/skills/start-servers/SKILL.md'
        file_path = '.claude/skills/start-servers/SKILL.md'
        rule_reference = 'skill-tool-invocation-mandatory v1.2.0'
    }

.NOTES
    v1.0.0 (2026-05-23 P0.7): contract first scaffold · stub output
    v2.0.0 (2026-05-23 P2.1b 分項 1 keystone): mock+real 雙模架構
      - default mock mode (env var PHYCOOL_HAIKU_REAL 未設) · 保持 v1 stub 行為向後相容
      - real mode (PHYCOOL_HAIKU_REAL=1) · 透過 haiku-dispatcher.ps1 spawn claude --model claude-haiku-4-5-20251001 subprocess
      - state file 自動 update(dispatch_count + success/failure/partial + history cap 50)
      - dispatch_log.json append-only entry(D4 evaluation 統計 source)
    依賴 .context-db/ecc-state/ 已 init (跑 .context-db/scripts/init-ecc-state.cjs)
#>

# ── v2.0 Mock + Real Dual-Mode Helper Functions(2026-05-23 P2.1b 分項 1 keystone)──────
# Toggle via env var: PHYCOOL_HAIKU_REAL=1 啟用 real subprocess · default mock

function Invoke-MockHaikuDispatch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstinctName,
        [Parameter(Mandatory)][hashtable]$Payload,
        [Parameter(Mandatory)][string]$Timestamp,
        [Parameter(Mandatory)][string]$StateFile,
        [Parameter(Mandatory)][string]$ExpectedRule
    )
    # Mock mode (default · 對齊 v1 stub 行為 + 加 mode='mock' marker)
    return [PSCustomObject]@{
        status     = 'partial'
        result     = [PSCustomObject]@{
            action_taken = "Mock dispatch for '$InstinctName' (PHYCOOL_HAIKU_REAL not set · default mock). Set PHYCOOL_HAIKU_REAL=1 to enable real claude --model haiku subprocess."
            side_effects = @($StateFile)
        }
        state_diff = [PSCustomObject]@{
            state_file = $StateFile
            before     = @{}
            after      = @{ last_dispatch = $Timestamp; instinct = $InstinctName; rule_applied = $ExpectedRule; mode = 'mock' }
        }
        timestamp  = $Timestamp
        evidence   = [PSCustomObject]@{
            rule_applied   = $ExpectedRule
            evidence_paths = @(
                "docs/technical-decisions/ADR-ECC-LEARNING-001-epic-ecc-v2-ceo-signoff.md (v1.3.0)",
                ".claude/skills/ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json",
                "mode:mock"
            )
        }
    }
}

function Invoke-RealHaikuDispatch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstinctName,
        [Parameter(Mandatory)][hashtable]$Payload,
        [Parameter(Mandatory)][string]$Timestamp,
        [Parameter(Mandatory)][string]$StateFile,
        [Parameter(Mandatory)][string]$ExpectedRule
    )
    # Real mode: 透過 haiku-dispatcher.ps1 spawn claude --model claude-haiku-4-5-20251001 subprocess
    $ts_safe = ($Timestamp -replace ':', '-') -replace '\+', '_'
    $kebab = $InstinctName -replace '_', '-'
    $inputFile = Join-Path $Script:ECC_STATE_DIR "dispatch-input-$kebab-$ts_safe.json"
    $outputFile = Join-Path $Script:ECC_STATE_DIR "dispatch-output-$kebab-$ts_safe.json"

    # Write input JSON (UTF-8 No-BOM 對齊 phycool-windows-ps-encoding)
    $inputObj = [PSCustomObject]@{ instinct_name = $InstinctName; payload = $Payload; timestamp = $Timestamp }
    [System.IO.File]::WriteAllText($inputFile, ($inputObj | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

    $dispatcherPath = Join-Path $PSScriptRoot "haiku-dispatcher.ps1"
    $exitCode = 0
    try {
        & $dispatcherPath -InstinctName $InstinctName -PayloadFile $inputFile -OutputFile $outputFile 2>&1 | Out-Null
        $exitCode = $LASTEXITCODE
    } catch {
        Write-Warning "haiku-dispatcher.ps1 invocation failed: $($_.Exception.Message)"
        $exitCode = 99
    }

    if (Test-Path $outputFile) {
        $output = Get-Content $outputFile -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $output = [PSCustomObject]@{
            status = 'failure'
            result = [PSCustomObject]@{ action_taken = "Real subprocess failed: exit=$exitCode · output file not produced at $outputFile"; side_effects = @($StateFile) }
            state_diff = [PSCustomObject]@{ state_file = $StateFile; before = @{}; after = @{ last_failure = $Timestamp } }
            timestamp = $Timestamp
            evidence = [PSCustomObject]@{ rule_applied = $ExpectedRule; evidence_paths = @("mode:real-failure", "exit:$exitCode") }
        }
    }
    return $output
}

function Invoke-GeminiDispatch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstinctName,
        [Parameter(Mandatory)][hashtable]$Payload,
        [Parameter(Mandatory)][string]$Timestamp,
        [Parameter(Mandatory)][string]$StateFile,
        [Parameter(Mandatory)][string]$ExpectedRule
    )
    # Gemini-backed dispatch (ADR-ECC-LEARNING-001 v1.8.0 §D2 amendment) -- 取代 -p Haiku
    # (claude -p headless 新政策另計配額 + GT710 本地 LLM 不可靠)。透過 node gemini-dispatcher.cjs
    # (讀獨立 GEMINI_DISPATCH_API_KEYS env + 重用 Gemini REST + 契約輸出對齊 InstinctDispatchOutput)。
    $ts_safe = ($Timestamp -replace ':', '-') -replace '\+', '_'
    $kebab = $InstinctName -replace '_', '-'
    $inputFile = Join-Path $Script:ECC_STATE_DIR "dispatch-input-$kebab-$ts_safe.json"
    $outputFile = Join-Path $Script:ECC_STATE_DIR "dispatch-output-$kebab-$ts_safe.json"
    $inputObj = [PSCustomObject]@{ instinct_name = $InstinctName; payload = $Payload; timestamp = $Timestamp }
    [System.IO.File]::WriteAllText($inputFile, ($inputObj | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

    $dispatcherCjs = Join-Path $PSScriptRoot "gemini-dispatcher.cjs"
    $exitCode = 0
    try {
        & node $dispatcherCjs --instinct $InstinctName --payload-file $inputFile --output-file $outputFile 2>&1 | Out-Null
        $exitCode = $LASTEXITCODE
    } catch {
        Write-Warning "gemini-dispatcher.cjs invocation failed: $($_.Exception.Message)"
        $exitCode = 99
    }

    if (Test-Path $outputFile) {
        $output = Get-Content $outputFile -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $output = [PSCustomObject]@{
            status = 'failure'
            result = [PSCustomObject]@{ action_taken = "Gemini dispatch failed: exit=$exitCode - output file not produced at $outputFile"; side_effects = @($StateFile) }
            state_diff = [PSCustomObject]@{ state_file = $StateFile; before = @{}; after = @{ last_failure = $Timestamp } }
            timestamp = $Timestamp
            evidence = [PSCustomObject]@{ rule_applied = $ExpectedRule; evidence_paths = @("mode:gemini-failure", "exit:$exitCode") }
        }
    }
    return $output
}

function Update-InstinctStateFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$StateFile,
        [Parameter(Mandatory)][string]$Timestamp,
        [Parameter(Mandatory)][string]$Status,
        [Parameter(Mandatory)][string]$ActionTaken
    )
    if (-not (Test-Path $StateFile)) {
        Write-Warning "State file not found: $StateFile · run .context-db/scripts/init-ecc-state.cjs first"
        return
    }
    $state = Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $state.last_dispatch = $Timestamp
    $state.dispatch_count += 1
    switch ($Status) {
        'success' { $state.success_count += 1 }
        'failure' { $state.failure_count += 1 }
        'partial' { $state.partial_count += 1 }
    }
    $historyEntry = [PSCustomObject]@{ timestamp = $Timestamp; status = $Status; action_taken = $ActionTaken }
    $state.history = @($state.history) + @($historyEntry) | Select-Object -Last 50
    [System.IO.File]::WriteAllText($StateFile, ($state | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
}

function Add-DispatchLog {
    # Renamed 2026-05-24 from Append-DispatchLog: 'Append' 非 PowerShell 核准動詞(Get-Verb)→ Import-Module
    # 發 unapproved-verb WARNING(×2 因 psm1 + haiku-dispatcher.ps1 各 import 一次)。'Add' 為核准等義動詞。
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstinctName,
        [Parameter(Mandatory)][string]$Timestamp,
        [Parameter(Mandatory)][string]$Status,
        [int]$LatencyMs = 0,
        [int]$TokenCount = 0
    )
    $logFile = Join-Path $Script:ECC_STATE_DIR "dispatch_log.json"
    if (-not (Test-Path $logFile)) {
        Write-Warning "dispatch_log.json not found: $logFile · run .context-db/scripts/init-ecc-state.cjs first"
        return
    }
    $log = Get-Content $logFile -Raw -Encoding UTF8 | ConvertFrom-Json
    # v2.1 mode 反映 tri-mode engine(gemini/haiku/mock)供 D4 eval 統計區分 real-gemini vs mock
    $mode = if ($env:PHYCOOL_DISPATCH_ENGINE) { $env:PHYCOOL_DISPATCH_ENGINE.ToLower() }
            elseif ($env:PHYCOOL_HAIKU_REAL -eq '1' -or $env:PHYCOOL_HAIKU_REAL -eq 'true') { 'real' }
            else { 'mock' }
    # ecc-10 Phase 3 (2026-05-24): 記 latency_ms 供 D4 evaluation gate (success_rate / latency / token) 計算
    $logEntry = [PSCustomObject]@{ timestamp = $Timestamp; instinct = $InstinctName; status = $Status; mode = $mode; latency_ms = $LatencyMs }
    # token_count 僅 gemini engine 有值(usageMetadata.totalTokenCount · D4 informational)· mock/haiku 不加欄保持乾淨
    if ($TokenCount -gt 0) { $logEntry | Add-Member -NotePropertyName token_count -NotePropertyValue $TokenCount }
    $log.entries = @($log.entries) + @($logEntry)
    [System.IO.File]::WriteAllText($logFile, ($log | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
}

function Invoke-InstinctDispatch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstinctName,
        [Parameter(Mandatory)][hashtable]$Payload,
        [string]$Timestamp = (Get-TaiwanTimestamp)
    )

    # Input validation (對齊 contract InstinctDispatchInput)
    Test-InstinctName -InstinctName $InstinctName

    if (-not $Payload.ContainsKey('trigger_context')) {
        throw "Payload must contain 'trigger_context' (對齊 IInstinctDispatcher contract)"
    }
    if (-not $Payload.ContainsKey('rule_reference')) {
        throw "Payload must contain 'rule_reference' (對齊 ADR v1.2.0 §Instinct↔SUPREME Mapping)"
    }

    $expectedRule = $Script:INSTINCT_SUPREME_MAP[$InstinctName]
    if ($Payload.rule_reference -ne $expectedRule) {
        Write-Warning "rule_reference '$($Payload.rule_reference)' does not match expected '$expectedRule' for instinct '$InstinctName'"
    }

    $stateFile = Get-StateFilePath -InstinctName $InstinctName

    # v2.1 Tri-mode dispatch engine 路由 (ADR v1.8.0 §D2 amendment: 加 Gemini engine)
    #   PHYCOOL_DISPATCH_ENGINE = gemini | haiku | mock (優先) · 向後相容 PHYCOOL_HAIKU_REAL=1 -> haiku
    $engine = if ($env:PHYCOOL_DISPATCH_ENGINE) { $env:PHYCOOL_DISPATCH_ENGINE.ToLower() }
              elseif ($env:PHYCOOL_HAIKU_REAL -eq '1' -or $env:PHYCOOL_HAIKU_REAL -eq 'true') { 'haiku' }
              else { 'mock' }
    # ecc-10 Phase 3 (2026-05-24): 量測 dispatch latency 供 D4 evaluation gate (success_rate / latency / token)
    $__dispatchSw = [System.Diagnostics.Stopwatch]::StartNew()
    switch ($engine) {
        'gemini' { $output = Invoke-GeminiDispatch    -InstinctName $InstinctName -Payload $Payload -Timestamp $Timestamp -StateFile $stateFile -ExpectedRule $expectedRule }
        'haiku'  { $output = Invoke-RealHaikuDispatch -InstinctName $InstinctName -Payload $Payload -Timestamp $Timestamp -StateFile $stateFile -ExpectedRule $expectedRule }
        default  { $output = Invoke-MockHaikuDispatch -InstinctName $InstinctName -Payload $Payload -Timestamp $Timestamp -StateFile $stateFile -ExpectedRule $expectedRule }
    }
    $__dispatchSw.Stop()

    # v2.0 State persistence (P2.1b 分項 2+3+5 keystone): update state file + append dispatch_log
    $actionTaken = if ($output.result -and $output.result.action_taken) { $output.result.action_taken } else { "(no action_taken)" }
    Update-InstinctStateFile -StateFile $stateFile -Timestamp $Timestamp -Status $output.status -ActionTaken $actionTaken
    # Add-DispatchLog (renamed from Append-DispatchLog 2026-05-24 · approved verb) + LatencyMs for D4 evaluation
    # 安全取 _token_count(PSObject.Properties.Match safe-access · gemini output 含此 meta 欄 · mock/haiku 無)
    $tok = if ($output.PSObject.Properties.Match('_token_count').Count -gt 0 -and $output._token_count) { [int]$output._token_count } else { 0 }
    Add-DispatchLog -InstinctName $InstinctName -Timestamp $Timestamp -Status $output.status -LatencyMs $__dispatchSw.ElapsedMilliseconds -TokenCount $tok

    return $output
}

# Export-ModuleMember (v2.0 加 4 new helper functions for direct testing + composition)
Export-ModuleMember -Function @(
    'Invoke-InstinctDispatch',
    'Get-TaiwanTimestamp',
    'Test-InstinctName',
    'Get-StateFilePath',
    # NEW 2026-05-23 v2.0 dual-mode (P2.1b 分項 1 keystone):
    'Invoke-MockHaikuDispatch',
    'Invoke-RealHaikuDispatch',
    'Invoke-GeminiDispatch',
    'Update-InstinctStateFile',
    'Add-DispatchLog'
) -Variable @(
    'VALID_INSTINCTS',
    'INSTINCT_SUPREME_MAP'
)
