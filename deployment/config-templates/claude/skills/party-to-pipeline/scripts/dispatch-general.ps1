# ==============================================================================
# dispatch-general.ps1  v2.0.0
# party-to-pipeline v5.4.0 -- Unified Thin-Hand Dispatcher (main-window side)
#
# THIN HAND, NOT A BRAIN -- zero validation / zero retry / zero ACK.
# 主對話視窗 (中控 = 唯一的腦) 做所有決策: 審查 / commit / 重派 / kill。
# v2.0.0 (v5.4.0): -Phase 擴充 -- 同一薄手直連全部 4 種 worker (E2 預設路徑):
#   general                      -> worker-general.ps1  (Mode C 通用任務, 不走 BMAD)
#   create-story                 -> worker-create.ps1   (BMAD create-story)
#   dev-story / dev-story-fix-Rn -> worker-dev.ps1      (BMAD dev-story)
#   code-review / code-review-Rn -> worker-review.ps1   (BMAD code-review)
# orchestrator.ps1 退守 E1 批次黑箱專用 (tracker 142/143 killed 實證其 ACK 關窗為死碼)。
#
# 本腳本只負責:
#   1. 解析參數 (general: model preset + prompt 入 IPC 防 CJK cmdline 截斷;
#      BMAD: Story DB 帶出 track/complexity, phaseTimeouts 帶出 timeout)
#   2. Start-Process 可見 worker 視窗
#   3. 登記 4-Tuple tracker (供 guardian / reaper 判活; kill 與關窗永遠是人的決策)
#   4. 有界確認 (dispatchConfirmSec): 見到 claude.exe 子行程, 或逾時但 wrapper PID 仍存活, 即退出
#   5. 輸出機器可讀摘要 (含 baseline 差集 = 本 worker 實際造成的變更) 後退出
#
# Exit codes (whp-2 收斂, BR-009):
#   0 = 已 spawn 且 wrapper PID 於交棒時存活 (**非**「任務完成」-- 完成與否須另驗 DB / IPC status)
#   1 = preflight / register BLOCK, wrapper 於確認窗內結束, 或 worker 於 claude.exe 啟動前回報 failed
#   (exit 2 與 timeout/lingering/stalled/hard-ceiling 四態已隨 adaptive wait 一併退場, 不再產生)
#
# Usage (主視窗 run_in_background):
#   # Mode C 通用任務
#   powershell -ExecutionPolicy Bypass -File .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 `
#     -TaskId gt-0606-demo -PromptFile logs/gt-0606-demo-prompt.txt -Model opus-5
#   # Story 三階段 (E2 預設; -StoryId 為 -TaskId 別名)
#   powershell -ExecutionPolicy Bypass -File .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 `
#     -StoryId my-story-id -Phase create-story
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][Alias('StoryId')][string]$TaskId,  # ASCII slug; BMAD phase 時 = StoryId
    [ValidateSet('general','create-story','dev-story','dev-story-complex','dev-story-fix-R1','dev-story-fix-R2','code-review','code-review-R1','code-review-R2')]
    [string]$Phase = 'general',
    [string]$PromptFile = '',                  # general 必填; BMAD 忽略 (worker 自建 prompt)
    [string]$Model = '',                       # general 必填 (preset 或 raw id); BMAD 忽略 (phaseModelMapping SSoT)
    [string]$Track = '',                       # general 預設 side; BMAD 預設自 Story DB task_track
    [string]$Complexity = '',                  # BMAD 預設自 Story DB complexity (fallback M)
    [int]$TimeoutSec = 0,                      # 0 = general: generalTask.default_timeout_sec; BMAD: phaseTimeouts
    [string]$ReportPath = '',                  # general 專用; '' = {report_dir}/{TaskId}-report.md
    [switch]$DryRun,
    [switch]$Worktree,                         # PoC (B1): 建 git worktree 物理隔離 worker 執行平面; 控制平面 main-pinned
    [string]$ControllerTrack = '',             # 2026-07-25: 派發中控身份(前台軌/後台軌/azure佈署軌/其他軌),寫入 tracker 供稽核 + worker 繼承
    [switch]$Resume                            # whp-6 BR-013~017: 續用前一筆同 story 的 claude session(plain --resume,非 --fork-session)
)

# ---- PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ----------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot
$isGeneral   = ($Phase -eq 'general')

# ---- 2026-07-25: 派發中控身份 -- 寫入 env var 供 (a) 本腳本自己的 Update-Tracker 呼叫
# (b) Start-Process 產生的 worker 進程繼承 讀取 (兩者皆經 Get-ControllerTrackId 統一取值)。
# 未帶 -ControllerTrack 時保持既有行為 (Get-ControllerTrackId 內建 fallback = "unspecified")。
if ($ControllerTrack) { $env:PHYCOOL_CONTROLLER_TRACK = $ControllerTrack }

# ---- PoC worktree (B1 main-pinned 鐵律): 執行平面物理隔離 root ----
# -Worktree 開: worker 在 .claude/worktrees/{TaskId} 跑 git (執行平面 worktree-local);
#   控制平面 (IPC/DB/log/tracker/MCP) 仍 main-pinned 主 repo (spawn 前注入 PIPELINE_CONTROL_ROOT).
#   不開 = 現行行為完全不變 (向後相容).
$WorktreePath   = if ($Worktree) { Join-Path $ProjectRoot ".claude\worktrees\$TaskId" } else { '' }
$gitRoot        = if ($Worktree) { $WorktreePath } else { $ProjectRoot }   # Get-DirtyFiles 差集 root
# BMAD 方式 A 部分 (#2 Dev Baseline): dispatch-time HEAD commit 供 CR worker 算 review boundary
$baselineCommit = ''
try { Push-Location $ProjectRoot; $baselineCommit = (& git rev-parse HEAD 2>$null); Pop-Location } catch { try { Pop-Location } catch {} }

# ---- TaskId sanity: ASCII slug (cmdline + IPC dir 安全) ----
if ($TaskId -notmatch '^[a-zA-Z0-9._-]+$') {
    throw "TaskId must be ASCII slug [a-zA-Z0-9._-]: '$TaskId'"
}

# ---- Config (fail-safe defaults) ----
$cfg = $null; $gt = $null
try {
    $cfgPath = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
    $cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
    if ($cfg.PSObject.Properties.Name -contains 'generalTask') { $gt = $cfg.generalTask }
} catch {
    Write-PpLog "pipeline-config.json read failed ($_) -- using built-in defaults" "WARN"
}
# [whp-2 RETIRED @ 2026-08-01] lingering_grace_sec 讀取 -- 唯二消費者位於下方
# "[whp-2 RETIRED] Signal-driven adaptive wait" 封存區塊內 (以區塊標記引用, 不寫行號:
# 本卡 CR-R2 實測行號會隨同檔任何編輯漂移, 硬編行號的交叉引用必然失準)。
# 本體退場後此變數即成死碼, 與 worker 的 watchdog cleanup guard 同類, 一併封存。
# 回退指引: 反註解本行 + 下方 adaptive wait 區塊 (兩者同進退)。
# $lingerGrace = if ($gt -and ($gt.PSObject.Properties.Name -contains 'lingering_grace_sec')) { [int]$gt.lingering_grace_sec } else { 90 }

# ---- Per-mode resolution ----
$modelId = ''
$workerScriptName = 'worker-general.ps1'
$promptText = ''

if ($isGeneral) {
    # general: PromptFile + Model 必填 (手動驗證, param 已非 Mandatory)
    if (-not $PromptFile) { throw "general phase requires -PromptFile" }
    if (-not $Model)      { throw "general phase requires -Model (preset opus-5/sonnet-5/fable-5, legacy opus-4.8/sonnet-4.6/sonnet-4.6-1m, or raw id)" }
    if (-not (Test-Path $PromptFile)) { throw "PromptFile not found: $PromptFile" }
    $promptText = Read-Utf8File -Path $PromptFile
    if (-not $promptText.Trim()) { throw "PromptFile is empty: $PromptFile" }
    # Model resolve: preset 優先, 否則 raw passthrough (不剝 [1m])
    $modelId = $Model
    if ($gt -and ($gt.PSObject.Properties.Name -contains 'presets') -and
        ($gt.presets.PSObject.Properties.Name -contains $Model)) {
        $modelId = $gt.presets.$Model.model_id
    }
    if (-not $Track) { $Track = 'side' }
    if ($TimeoutSec -le 0) {
        $TimeoutSec = if ($gt -and ($gt.PSObject.Properties.Name -contains 'default_timeout_sec')) { [int]$gt.default_timeout_sec } else { 3600 }
    }
    if (-not $ReportPath) {
        $reportDir = if ($gt -and ($gt.PSObject.Properties.Name -contains 'report_dir')) { $gt.report_dir } else { 'docs/tracking/active/general-tasks' }
        $ReportPath = Join-Path $ProjectRoot (Join-Path $reportDir "$TaskId-report.md")
    }
    if (-not [System.IO.Path]::IsPathRooted($ReportPath)) {
        $ReportPath = Join-Path $ProjectRoot $ReportPath
    }
} else {
    # BMAD phase: Story DB 帶出 track/complexity; model 由 worker 依 phaseModelMapping 自解析
    if ($PromptFile) { Write-PpLog "-PromptFile ignored for BMAD phase (worker 自建 prompt)" "WARN" }
    if ($Model)      { Write-PpLog "-Model ignored for BMAD phase (phaseModelMapping SSoT, worker 自解析)" "WARN" }
    $story = Get-StoryFromDb -StoryId $TaskId
    if (-not $story) { throw "Story not found in DB: $TaskId (BMAD phase requires existing Story)" }
    if (-not $Track) {
        $Track = if (($story.PSObject.Properties.Name -contains 'task_track') -and $story.task_track) { $story.task_track } else { 'main' }
    }
    if (-not $Complexity) {
        $Complexity = if (($story.PSObject.Properties.Name -contains 'complexity') -and $story.complexity) { $story.complexity } else { 'M' }
    }
    # Model (informational -- worker re-resolves itself, 並依其既有行為剝 [1m])
    $modelInfo = Read-PhaseModel -PhaseName $Phase -Complexity $Complexity
    $modelId   = $modelInfo.model_id
    # Timeout: phaseTimeouts (ms) by base phase + complexity
    if ($TimeoutSec -le 0) {
        $basePhase = if ($Phase -like 'create-story*') { 'create-story' } elseif ($Phase -like 'dev-story*') { 'dev-story' } else { 'code-review' }
        $TimeoutSec = 1800
        try {
            $ms = $cfg.phaseTimeouts.$basePhase.$Complexity
            if ($ms) { $TimeoutSec = [int]([int64]$ms / 1000) }
        } catch { }
    }
    $workerScriptName = if ($Phase -like 'create-story*') { 'worker-create.ps1' }
                        elseif ($Phase -like 'dev-story*') { 'worker-dev.ps1' }
                        else { 'worker-review.ps1' }
}

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "Unified Thin-Hand Dispatch (v5.4.0)" "SYSTEM"
Write-PpLog "Task    : $TaskId | Phase: $Phase | Controller: $(Get-ControllerTrackId)" "SYSTEM"
Write-PpLog "Model   : $modelId $(if ($isGeneral) { '| effort=max (fixed)' } else { '(phaseModelMapping, worker 自解析)' })" "SYSTEM"
Write-PpLog "Timeout : ${TimeoutSec}s (soft; 30/10/10 停滯偵測交 pipeline-guardian.ps1) | Track: $Track" "SYSTEM"
if ($isGeneral) { Write-PpLog "Report  : $ReportPath" "SYSTEM" }
Write-PpLog ("=" * 70) "SYSTEM"

# ---- Baseline dirty files (多軌並行: 供摘要差集隔離本 worker 造成的變更) ----
# PoC worktree: 差集 root = $gitRoot (worktree 模式 = worktree, 否則主 repo)
function Get-DirtyFiles {
    $files = @()
    try {
        Push-Location $gitRoot
        $lines = & git -c core.quotepath=false status --porcelain -uall 2>$null
        if ($lines) {
            $files = @($lines | ForEach-Object {
                if ($_ -and $_.Length -gt 3) { $_.Substring(3).Trim('"') }
            } | Where-Object { $_ })
        }
        Pop-Location
    } catch { try { Pop-Location } catch {} }
    return ,$files
}

# ---- (whp-4 T2.3) run_id generation + reaper-on-dispatch + preflight gate (SDD SS4.3) ----
# run_id doubles as claude --session-id (BR-109): DB row <-> session <-> transcript, one key.
$runId = [guid]::NewGuid().ToString()
# (whp-4 T5.1) 本腳本自己的 process 也要看得到 run_id -- Update-Tracker (shared-utils.ps1:398
# 下方呼叫) 的 DB 雙寫以 $env:PIPELINE_RUN_ID 是否有值為 gate (BR-127)。worker 子行程另有自己的
# 賦值路徑 (worker-*.ps1 讀 $task.run_id,見 T3),兩者互不依賴、互不覆蓋。
$env:PIPELINE_RUN_ID = $runId

if ($cfg -and ($cfg.PSObject.Properties.Name -contains 'workerProtocol') -and $cfg.workerProtocol.reaperOnDispatch) {
    try {
        $reapScript = Join-Path $ProjectRoot ".context-db\scripts\reap-worker-runs.js"
        & node --max-old-space-size=256 $reapScript --quiet 2>$null | Out-Null
    } catch { Write-PpLog "reaper-on-dispatch failed (non-fatal, fail-open): $_" "WARN" }
}

# ---- (whp-6 BR-013~017) -Resume: locate prior run's session_id for claude --resume,
#      or fall back to a fresh --session-id (fail-open on any lookup problem). Resolved
#      before the -DryRun exit point below so `-DryRun -Resume` can report the outcome
#      (read-only DB query; no write, no worker spawn) without touching either. ----
$resumeSessionId  = ''
$resumedFromRunId = ''
if ($Resume) {
    $resumeEnabled = $true
    if ($cfg -and ($cfg.PSObject.Properties.Name -contains 'workerProtocol') -and
        ($cfg.workerProtocol.PSObject.Properties.Name -contains 'resumeEnabled')) {
        $resumeEnabled = [bool]$cfg.workerProtocol.resumeEnabled
    }
    if (-not $resumeEnabled) {
        Write-PpLog "-Resume requested but workerProtocol.resumeEnabled=false -- falling back to fresh --session-id" "WARN"
    } else {
        # 三個 WHP6_* env 只為把值安全帶進 node -e(避免 Windows 路徑的反斜線在 JS 字面值內被當
        # 逃脫字元),用完必清:本行以下會 Start-Process spawn worker,worker 進程繼承 dispatcher
        # 的環境區塊,殘留變數會一路傳進子視窗。清理放 finally -- 放 try 內時 `& node` 一旦拋錯
        # 就整批殘留(CR 2026-08-01 修復)。better-sqlite3 改以絕對路徑 require(同 worker-kill-guard.js
        # 範式),因此不再設定 NODE_PATH -- 該變數原本同樣未被清除,會改寫 worker 內所有 node 呼叫
        # 的模組解析鏈。
        $priorRun = $null
        try {
            $env:WHP6_SQLITE_MODULE = Join-Path $ProjectRoot '.context-db\node_modules\better-sqlite3'
            $env:WHP6_DB_PATH       = Join-Path $ProjectRoot '.context-db\phycool.db'
            $env:WHP6_STORY_ID      = $TaskId
            $priorJson = & node -e "const Database=require(process.env.WHP6_SQLITE_MODULE);const db=new Database(process.env.WHP6_DB_PATH,{readonly:true});const row=db.prepare('SELECT run_id, session_id FROM worker_runs WHERE story_id=? AND session_id IS NOT NULL ORDER BY started_at DESC LIMIT 1').get(process.env.WHP6_STORY_ID);db.close();console.log(row?JSON.stringify(row):'null');" 2>$null
            if ($priorJson -and $priorJson.Trim() -ne 'null') { $priorRun = $priorJson | ConvertFrom-Json }
        } catch {
            Write-PpLog "-Resume: prior-session lookup failed (fail-open, fresh session): $_" "WARN"
        } finally {
            Remove-Item Env:\WHP6_SQLITE_MODULE, Env:\WHP6_DB_PATH, Env:\WHP6_STORY_ID -ErrorAction SilentlyContinue
        }
        if ($priorRun -and $priorRun.session_id) {
            $resumeSessionId  = $priorRun.session_id
            $resumedFromRunId = $priorRun.run_id
            Write-PpLog "-Resume: found prior session $resumeSessionId (run_id=$resumedFromRunId) -- will pass --resume" "INFO"
        } else {
            Write-PpLog "-Resume requested but no prior session found for story '$TaskId' -- falling back to fresh --session-id" "WARN"
        }
    }
}

$preflightScript = Join-Path $PSScriptRoot "preflight-dispatch.ps1"
if (Test-Path $preflightScript) {
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $preflightOutput = (& powershell -NoProfile -ExecutionPolicy Bypass -File $preflightScript -StoryId $TaskId -Phase $Phase 2>&1 |
        Where-Object { $_ -notmatch '^\[\d\d:\d\d:\d\d\]\[DEBUG\]' }) -join "`n"
    $preflightExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($preflightExit -ne 0) {
        Write-PpLog $preflightOutput "ERROR"
        Write-Host "BLOCKED: preflight-dispatch.ps1 rejected this dispatch (see reason above)"
        exit 1
    }
    Write-PpLog "Preflight: PASS (run_id=$runId)" "SUCCESS"
} else {
    Write-PpLog "preflight-dispatch.ps1 not found -- skipping (fail-open, degrades to pre-whp-4 behavior)" "WARN"
}

# ---- (whp-4 T5.3 / BR-131) UI-phase execution-carrier divergence WARN -- advisory only ----
if (-not $isGeneral -and $Phase -like 'code-review*') {
    if ($story -and ($story.PSObject.Properties.Name -contains 'file_list') -and $story.file_list -and
        ($story.file_list -match '\.(tsx|css)\b')) {
        Write-PpLog "WARN UI_LIVE_VERIFY: this phase's file_list touches .tsx/.css -- dispatch sub-window has no browser MCP, consider running from the main window instead (does not block dispatch)" "WARN"
    }
}

if ($DryRun) {
    $resumeDryRunInfo = if (-not $Resume) { 'resume=n/a' } elseif ($resumeSessionId) { "resume=$resumeSessionId (from run=$resumedFromRunId)" } else { 'resume=none (fallback --session-id)' }
    Write-PpLog "[DryRun] 不啟動子視窗。解析: phase=$Phase worker=$workerScriptName model=$modelId track=$Track complexity=$(if ($Complexity) { $Complexity } else { 'n/a' }) timeout=${TimeoutSec}s worktree=$($Worktree.IsPresent) base=$baselineCommit run_id=$runId preflight=PASS $resumeDryRunInfo" "INFO"
    exit 0
}

# ---- PoC worktree add (B1: 執行平面物理隔離; hardlink 建立近 0, node_modules 不複製) ----
if ($Worktree) {
    $branchName = "worktree-$TaskId"
    if (Test-Path $WorktreePath) {
        Write-PpLog "Worktree 已存在, 先移除重建 (PoC 可重入): $WorktreePath" "WARN"
        Push-Location $ProjectRoot
        & git worktree remove --force $WorktreePath 2>$null
        & git branch -D $branchName 2>$null
        Pop-Location
    }
    Push-Location $ProjectRoot
    Write-PpLog "git worktree add -B $branchName $WorktreePath HEAD ..." "STEP"
    # git worktree add 的"Preparing worktree"進度訊息走 stderr (非錯誤);
    # background non-interactive 模式下 2>&1 會被 PowerShell 當 NativeCommandError 誤中斷 script。
    # 明確以 ErrorActionPreference=Continue 包住, 靠 $LASTEXITCODE 判斷真實成敗 (worktree add 成功 exit 0)。
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $wtOutput = & git worktree add -B $branchName $WorktreePath HEAD 2>&1
    $wtOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prevEAP
    foreach ($wtLine in $wtOutput) { Write-PpLog "  $wtLine" "DEBUG" }
    Pop-Location
    if (-not $wtOk -or -not (Test-Path $WorktreePath)) { throw "git worktree add 失敗: $WorktreePath" }
    Write-PpLog "Worktree ready: $WorktreePath (branch $branchName, base $baselineCommit)" "SUCCESS"
}

$baseline = Get-DirtyFiles
if ($baseline.Count -gt 0) {
    Write-PpLog "Pre-existing dirty files: $($baseline.Count) (他軌並行屬正常 -- 摘要將以差集隔離本 worker 變更)" "WARN"
}

# [whp-2 RETIRED @ 2026-08-01] Get-ActivityFingerprint -- 原理 + 原文 + 回退指引見封存 §11.2/§11.9(架構規格書第十一章)
# 為何曾經如此: adaptive wait 的 30/10/10 停滯偵測需要一個"本 run 是否仍有活動"的指紋比對依據。
# 為何現在移除: (a) 指紋建於 repo-wide Get-DirtyFiles,多軌並行時他軌寫入使本 run 永遠"看似有活動",
#              停滯測不出來(SSoT G17 違規);(b) 唯一消費者 adaptive wait 迴圈已一併退場(見下方);
#              (c) per-run 30/10/10 已由 whp-7 guardian-tick.js loop C 取代(checkScopeActive +
#              writeStallIncrement,per-run scope,只通知不殺)。刪除責任由 whp-7 spec §4.3.2.1 指派本卡。
# 回退指引: 反註解本區塊 + 下方 adaptive wait 區塊(兩者同進退,無法單獨復原其一)。
# ---- v2.1.0 (2026-07-25): 活動指紋 -- worker-lifecycle-judgment.md §3.5 30/10/10 機械化 ----
# 取代"dispatch timeout = 觀察者死線"的舊設計: PID 存活才是權威信號 (真訊號),
# phaseTimeouts 降級為"軟性期限", 只用來啟動活動探測 (次級防呆), 不再直接終止等待。
# function Get-ActivityFingerprint {
#     $parts = @()
#     try {
#         foreach ($f in (Get-DirtyFiles)) {
#             $full = Join-Path $gitRoot $f
#             $mt = if (Test-Path $full) { (Get-Item $full -ErrorAction SilentlyContinue).LastWriteTimeUtc.Ticks } else { 'gone' }
#             $parts += "$f=$mt"
#         }
#         if (Test-Path $IpcDir) {
#             Get-ChildItem $IpcDir -File -ErrorAction SilentlyContinue | ForEach-Object {
#                 $parts += "ipc:$($_.Name)=$($_.LastWriteTimeUtc.Ticks)"
#             }
#         }
#     } catch { }
#     return ($parts -join '|')
# }

# ---- IPC 準備 ----
$IpcDir = New-IpcDir -StoryId $TaskId

# ---- PoC Step 3: worktree 模式生成動態 workers-mcp.json (B1: phycool-context server.js 絕對路徑) ----
# 靜態版 phycool-context args=".context-db/server.js" 相對路徑 → worker 在 worktree cwd 解析到
# worktree/.context-db (gitignored·不存在) → MCP 崩 (B1 spike 實證). 絕對路徑 → server.js __dirname 指主 repo.
# 字串替換 (非 ConvertTo-Json round-trip, 避 PS5.1 單元素陣列去陣列化 + 保留 _comment/其餘 MCP 原樣).
# gitnexus/codegraph (依賴 .gitnexus/.codegraph index·gitignored) main-pin 留完整 PoC; github/context7/azure 外部服務不依賴 cwd.
$workerMcpConfig = ''
if ($Worktree) {
    $staticMcp = Join-Path $PSScriptRoot 'workers-mcp.json'
    $absServer = (Join-Path $ProjectRoot '.context-db\server.js') -replace '\\','/'
    $dynText   = ([System.IO.File]::ReadAllText($staticMcp, [System.Text.UTF8Encoding]::new($false))) -replace '"\.context-db/server\.js"', "`"$absServer`""
    $workerMcpConfig = Join-Path $IpcDir 'workers-mcp.json'
    [System.IO.File]::WriteAllText($workerMcpConfig, $dynText, [System.Text.UTF8Encoding]::new($false))
    Write-PpLog "動態 workers-mcp.json: phycool-context → $absServer" "IPC"
}

if ($isGeneral) {
    Write-Utf8File -Path "$IpcDir\prompt-$Phase.txt" -Content $promptText -WithBom $false
    Write-TaskFile -IpcDir $IpcDir -Phase $Phase -Payload @{
        task_id         = $TaskId
        task_track      = $Track
        model_id        = $modelId
        effort          = 'max'
        report_path     = $ReportPath
        timeout_sec     = $TimeoutSec
        baseline_files  = $baseline
        baseline_commit = $baselineCommit   # BMAD #2: CR review boundary
        control_root    = $ProjectRoot       # PoC: 控制平面 main-pinned
        work_root       = $WorktreePath      # PoC: 執行平面 worktree ('' = 非 worktree)
        worker_mcp_config = $workerMcpConfig # PoC: worktree-local MCP ('' = 用靜態 PSScriptRoot 版)
        ipc_dir         = $IpcDir
        run_id          = $runId             # whp-4 T2.3/T3.1: also passed to worker as --session-id
        session_id      = $runId
        resume_session_id = $resumeSessionId # whp-6 BR-014: worker prefers this over session_id when non-empty
    }
    # 報告目錄確保存在
    $rDir = Split-Path $ReportPath -Parent
    if ($rDir -and -not (Test-Path $rDir)) { New-Item -ItemType Directory -Force -Path $rDir | Out-Null }
} else {
    # BMAD task file (clone orchestrator.ps1:229-237 payload shape; worker 讀取但 model 自行再解析)
    Write-TaskFile -IpcDir $IpcDir -Phase $Phase -Payload @{
        story_id        = $TaskId
        task_track      = $Track
        complexity      = $Complexity
        model_id        = $modelId
        effort          = (Read-PhaseModel -PhaseName $Phase -Complexity $Complexity).effort
        attempt         = 1
        baseline_commit = $baselineCommit   # BMAD #2: CR review boundary (亦寫 pipeline_notes, 完整 PoC follow-up)
        control_root    = $ProjectRoot       # PoC: 控制平面 main-pinned
        work_root       = $WorktreePath      # PoC: 執行平面 worktree ('' = 非 worktree)
        worker_mcp_config = $workerMcpConfig # PoC: worktree-local MCP ('' = 用靜態 PSScriptRoot 版)
        ipc_dir         = $IpcDir
        run_id          = $runId             # whp-4 T2.3/T3.1: also passed to worker as --session-id
        session_id      = $runId
        resume_session_id = $resumeSessionId # whp-6 BR-014: worker prefers this over session_id when non-empty
    }
}

# ---- PoC ② BMAD Dev Baseline: dev-story phase 寫 baseline_commit 到 pipeline_notes ----
# protocol-template.md §Dev Baseline: CR worker 開工讀 pipeline_notes.baseline_commit 算 review scope = git diff {baseline}..工作樹.
# 僅 dev-story phase 寫 (dev pre-snapshot); retry 保留原; merge append 不覆蓋中控並行通告 (F8.3). upsert-story.js --merge 不改 status.
if (-not $isGeneral -and $Phase -like 'dev-story*' -and $baselineCommit) {
    try {
        $storyPn   = Get-StoryFromDb -StoryId $TaskId
        $existingPn = if ($storyPn -and ($storyPn.PSObject.Properties.Name -contains 'pipeline_notes') -and $storyPn.pipeline_notes) { [string]$storyPn.pipeline_notes } else { '' }
        if ($existingPn -notmatch '\[baseline_commit\]') {
            $bcMarker = "[baseline_commit] $baselineCommit (dev dispatch @ $(Get-TaiwanTimestamp))"
            $newPn    = if ($existingPn.Trim()) { "$existingPn`n$bcMarker" } else { $bcMarker }
            $pnTmp    = Join-Path (Get-LogDir) "pn-$TaskId-$(Get-Date -Format 'HHmmss').json"
            [System.IO.File]::WriteAllText($pnTmp, (@{ pipeline_notes = $newPn } | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
            & node --max-old-space-size=256 (Join-Path $ProjectRoot ".context-db\scripts\upsert-story.js") --quiet --merge $TaskId $pnTmp 2>$null
            Remove-Item $pnTmp -ErrorAction SilentlyContinue
            Write-PpLog "② baseline_commit 寫入 pipeline_notes: $baselineCommit" "DB"
        } else {
            Write-PpLog "② pipeline_notes 已含 baseline_commit (retry 保留原 dev pre-snapshot)" "DEBUG"
        }
    } catch { Write-PpLog "② pipeline_notes 寫入失敗 (non-fatal): $_" "WARN" }
}

# ---- (whp-4 T2.3/T2.4) register-run.ps1 -Mode Register: INSERT worker_runs BEFORE spawn ----
# lifecycle='dispatching' leaves a trace even if Start-Process below throws (BR-106, idempotency E2).
$registerScript = Join-Path $PSScriptRoot "register-run.ps1"
if (Test-Path $registerScript) {
    $registerEffort = if ($isGeneral) { 'max' } else { $modelInfo.effort }
    # PS 5.1 drops empty-string args passed to an external powershell.exe (same failure class the
    # CR fixed via F5 for preflight argv) -- an empty -WorkRoot/-BaselineCommit collapses the arg
    # list and the binder reports "Missing an argument". Omit empty optionals; register-run.ps1's
    # own param defaults ('') apply. 2026-07-29 canary: every non-worktree dispatch aborted here.
    # whp-6 BR-016: resume 時此列的 session_id 欄位寫入沿用的舊 session(B),非本次新 run_id
    # -- plain --resume 實際續用的 claude session 就是 B,DB 應反映真相以利未來 -Resume 查詢鏈接續。
    $registerSessionId = if ($resumeSessionId) { $resumeSessionId } else { $runId }
    $registerArgs = @(
        '-Mode', 'Register', '-RunId', $runId, '-StoryId', $TaskId, '-Phase', $Phase,
        '-IpcDir', $IpcDir, '-SessionId', $registerSessionId, '-ControllerTrack', (Get-ControllerTrackId),
        '-ModelId', $modelId, '-Effort', $registerEffort
    )
    if ($WorktreePath)   { $registerArgs += @('-WorkRoot', $WorktreePath) }
    if ($baselineCommit) { $registerArgs += @('-BaselineCommit', $baselineCommit) }
    # -Attempt 不再硬編 1 -- 省略讓 upsert-worker-run.js 自算 MAX(attempt)+1,
    # 重派(斷電/失敗後二次派發)不再撞 ux_worker_runs_key UNIQUE 而 abort。2026-07-29。
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $registerScript @registerArgs 2>&1 | ForEach-Object { Write-PpLog "$_" "DB" }
    $registerExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($registerExit -ne 0) {
        Write-PpLog "register-run.ps1 -Mode Register failed -- aborting dispatch (SSoT SS22.1: throw aborts dispatch)" "ERROR"
        exit 1
    }
    # whp-6 BR-016: resumed_from_run_id 非 register-run.ps1 既有欄位範圍(該 script 保留原樣,見 SDD 施工邊界),
    # 以既有 upsert-worker-run.js --merge 直接補寫本欄,與上方 pipeline_notes baseline_commit 同一範式。
    if ($resumedFromRunId) {
        try {
            $rfTmp = Join-Path (Get-LogDir) "resume-$runId-$(Get-Date -Format 'HHmmssfff').json"
            [System.IO.File]::WriteAllText($rfTmp, (@{ resumed_from_run_id = $resumedFromRunId } | ConvertTo-Json -Depth 3), [System.Text.UTF8Encoding]::new($false))
            & node --max-old-space-size=256 (Join-Path $ProjectRoot ".context-db\scripts\upsert-worker-run.js") --merge $runId $rfTmp 2>$null | Out-Null
            Remove-Item $rfTmp -ErrorAction SilentlyContinue
            Write-PpLog "resumed_from_run_id=$resumedFromRunId written to run $runId" "DB"
        } catch { Write-PpLog "resumed_from_run_id write failed (non-fatal): $_" "WARN" }
    }
} else {
    Write-PpLog "register-run.ps1 not found -- skipping registration (fail-open, degrades to pre-whp-4 behavior)" "WARN"
}

# ---- Spawn worker window (clone orchestrator.ps1:247-262 範式) ----
$workerScript = Join-Path $PSScriptRoot $workerScriptName
if (-not (Test-Path $workerScript)) { throw "Missing $workerScriptName" }

$workerArgs = @('-NoExit','-ExecutionPolicy','Bypass','-File',$workerScript)
if ($isGeneral) {
    $workerArgs += @('-TaskId',$TaskId,'-IpcDir',$IpcDir)
    $winTitle = "[GT] $TaskId"
} else {
    $workerArgs += @('-StoryId',$TaskId,'-IpcDir',$IpcDir,'-Track',$Track,'-Complexity',$Complexity,'-Phase',$Phase)
    $winTitle = "[$($Phase.ToUpper())] $TaskId"
}

# ---- PoC 雙根 env 注入 (worker 繼承; 控制平面 main-pinned / 執行平面 worktree-local) ----
if ($Worktree) {
    $env:PIPELINE_CONTROL_ROOT = $ProjectRoot    # worker 控制平面 (IPC/DB/log/tracker/MCP) 回主 repo
    $env:PIPELINE_WORK_ROOT    = $WorktreePath    # worker 執行平面 (git/code) 在 worktree
    Write-PpLog "雙根 env 注入: CONTROL=$ProjectRoot WORK=$WorktreePath" "INFO"
}

Write-PpLog "Launching worker window ($workerScriptName)..." "STEP"
$workerProc = Start-Process powershell -ArgumentList $workerArgs -PassThru -WindowStyle Normal

Write-PpLog "Worker PID: $($workerProc.Id)" "INFO"
Update-Tracker -StoryId $TaskId -Phase $Phase -Status 'running' `
    -ProcessId $workerProc.Id -IpcDir $IpcDir -WindowTitle $winTitle

# ---- (whp-4 T2.3) register-run.ps1 -Mode Confirm: backfill wrapper_pid + lifecycle=running ----
# BR-107: field-scoped merge only (wrapper_pid/cmd_line/window_title/lifecycle) -- never touches
# any field another writer (guardian / stop-report heartbeat) may already have set.
if (Test-Path $registerScript) {
    $cmdLineForConfirm = ''
    try {
        $wmiSelf = Get-WmiObject Win32_Process -Filter "ProcessId=$($workerProc.Id)" -ErrorAction SilentlyContinue
        if ($wmiSelf) { $cmdLineForConfirm = $wmiSelf.CommandLine }
    } catch { }
    # Same PS 5.1 empty-arg drop class: a failed WMI lookup leaves $cmdLineForConfirm '' and an
    # inline '-CmdLine' would swallow '-WindowTitle'. Omit when empty; script default applies.
    $confirmArgs = @('-Mode', 'Confirm', '-RunId', $runId, '-WrapperPid', $workerProc.Id, '-WindowTitle', $winTitle)
    if ($cmdLineForConfirm) { $confirmArgs += @('-CmdLine', $cmdLineForConfirm) }
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $registerScript @confirmArgs 2>&1 | ForEach-Object { Write-PpLog "$_" "DB" }
    $ErrorActionPreference = $prevEAP
}

# ---- (whp-4 T2.3) Bounded confirmation wait -- dispatchConfirmSec (SSoT SS1: thin-hand has no
# authority to judge failure). Waits for a claude.exe child process to appear; timing out with the
# wrapper PID still alive is NOT a failure -- ownership hands off to the guardian (whp-7). ----
$dispatchConfirmSec = if ($cfg -and ($cfg.PSObject.Properties.Name -contains 'workerProtocol') -and $cfg.workerProtocol.dispatchConfirmSec) {
    [int]$cfg.workerProtocol.dispatchConfirmSec
} else { 60 }
$confirmDeadline = (Get-Date).AddSeconds($dispatchConfirmSec)
$claudeSeen = $false
# whp-2 CR fix: status 檔路徑提前於迴圈之前計算(原僅於迴圈後計算,見下方 T8 收斂 evidence)。
# 早期失敗(worker 尚未啟動 claude 前已 exit,如 task file missing / story not in DB)在 -NoExit
# 下 wrapper 進程不會真正終止,$workerProc.HasExited 恆 false;若不主動偵測 status=failed,
# 確認窗會空等滿 $dispatchConfirmSec 秒,且下方 $outcome 邏輯會誤判為 spawned-pending-guardian
# (exit 0),讓已知的立即失敗被回報成功。
$statusFile = "$IpcDir\status-$Phase.json"
$workerFailed = $false
while ((Get-Date) -lt $confirmDeadline) {
    if ($workerProc.HasExited) { break }
    try {
        $childClaude = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($workerProc.Id) AND Name='claude.exe'" -ErrorAction SilentlyContinue
        if ($childClaude) { $claudeSeen = $true; break }
    } catch { }
    if (-not $claudeSeen -and (Test-Path $statusFile)) {
        try {
            $earlyStatus = Read-JsonRetry -Path $statusFile
            if ($earlyStatus -and $earlyStatus.status -eq 'failed') { $workerFailed = $true; break }
        } catch { }
    }
    Start-Sleep -Milliseconds 500
}
if ($claudeSeen) {
    Write-PpLog "claude.exe child process confirmed within ${dispatchConfirmSec}s" "SUCCESS"
} elseif ($workerFailed) {
    Write-PpLog "worker reported status=failed within ${dispatchConfirmSec}s (before claude.exe ever spawned)" "ERROR"
} elseif (-not $workerProc.HasExited) {
    Write-Host "已交守護監看 -- claude.exe 未於 ${dispatchConfirmSec}s 內偵測到,但 wrapper PID $($workerProc.Id) 仍存活(薄手無權判定失敗)"
}

# [whp-2 RETIRED @ 2026-08-01] Signal-driven adaptive wait + lingering 分支 -- 原理 + 原文 + 回退指引見封存 §11.9(架構規格書第十一章)
# 為何曾經如此: 舊薄手的終止條件是"worker PID 退出"或"status 檔出現 + lingering grace 過後強制關窗",
#              需要一個觀察迴圈持續輪詢直到視窗關閉為止,搭配 30/10/10 活動探測防止誤判真正停滯的 worker。
# 為何現在移除: 使用者硬裁定(2026-07-26)"取消 worker 子視窗自動關閉"後,視窗永不自關,
#              繼續等待視窗關閉即是死鎖(SSoT §18.2:主視窗被本次 dispatch tool call 阻塞期間,
#              唯一能授權關窗的也是主視窗,兩者互相等待)。薄手改為"有界確認即退出"(見上方 :431-451,
#              保留勿動),30/10/10 停滯偵測職責已全數移交 pipeline-guardian.ps1 常駐守護(whp-7 done)。
# 回退指引: 此段刻意不做旗標守護(a wait loop that no longer exists cannot be re-enabled by a flag);
#          回退方式為 git revert 本卡 commit,或反註解本區塊 + 上方 Get-ActivityFingerprint 兩處。
# ---- Signal-driven adaptive wait (v2.1.0) ----
# 權威終止條件只有 2 個: (a) worker PID 退出 (b) status 檔出現 + lingering grace 過.
# $TimeoutSec 不再是硬終止線 -- 只是"軟性期限", 過線後啟動 30/10/10 活動探測 (次級防呆);
# 探測到真停滯 (連續 2 輪 = 20min 零檔案變動) 才回報 'stalled', 且**不自動 kill**
# (對齊 worker-lifecycle-judgment.md FORBIDDEN: 未走 30/10/10 或未經人工裁決禁止殺 worker)。
# hard-ceiling 是最終安全閥 (防 dispatch wrapper 自己無限跑), 命中時同樣只回報不殺。
# $statusFile        = "$IpcDir\status-$Phase.json"
# $start             = Get-Date
# $statusSeenAt      = $null
# $outcome           = 'unknown'
# $softDeadlineHit   = $false
# $staleRounds       = 0
# $lastFingerprint   = $null
# $lastActivityCheck = $start
# $STALE_CHECK_SEC   = 600   # 10min (worker-lifecycle-judgment.md §3.5)
# $STALE_ROUNDS_FLAG = 2     # 連續 2 輪 (20min) 零變動才判 stalled
# $hardCeilingSec    = [Math]::Max($TimeoutSec * 3, 7200)
#
# while ($true) {
#     $elapsed = ((Get-Date) - $start).TotalSeconds
#     if ($workerProc.HasExited) { $outcome = 'exited'; break }
#     if (-not $statusSeenAt -and (Test-Path $statusFile)) {
#         $statusSeenAt = Get-Date
#         Write-PpLog "Status file appeared -- waiting window close (grace ${lingerGrace}s)" "INFO"
#     }
#     if ($statusSeenAt -and (((Get-Date) - $statusSeenAt).TotalSeconds -gt $lingerGrace)) {
#         $outcome = 'lingering'; break
#     }
#     if (-not $softDeadlineHit -and $elapsed -gt $TimeoutSec) {
#         $softDeadlineHit   = $true
#         $lastFingerprint   = Get-ActivityFingerprint
#         $lastActivityCheck = Get-Date
#         Write-PpLog "軟性期限 (${TimeoutSec}s) 已過, worker PID 仍 ALIVE -- 續等 + 啟動 30/10/10 活動探測 (非 kill 信號)" "WARN"
#     }
#     if ($softDeadlineHit -and (((Get-Date) - $lastActivityCheck).TotalSeconds -ge $STALE_CHECK_SEC)) {
#         $fp = Get-ActivityFingerprint
#         if ($fp -eq $lastFingerprint) {
#             $staleRounds++
#             Write-PpLog "活動探測: 零變動 (輪 $staleRounds/$STALE_ROUNDS_FLAG)" "WARN"
#         } else {
#             if ($staleRounds -gt 0) { Write-PpLog "活動探測: 偵測到檔案變動, worker 正常執行中, 重置計數" "INFO" }
#             $staleRounds = 0
#         }
#         $lastFingerprint   = $fp
#         $lastActivityCheck = Get-Date
#         if ($staleRounds -ge $STALE_ROUNDS_FLAG) { $outcome = 'stalled'; break }
#     }
#     if ($elapsed -gt $hardCeilingSec) { $outcome = 'hard-ceiling'; break }
#     Start-Sleep -Seconds 5
# }
# if ($outcome -eq 'exited') { Write-PpLog "Worker window closed." "SUCCESS" }
# if ($outcome -eq 'lingering') {
#     # Live 實證 (gt-smoke-001 2026-06-05): claude 互動模式 turn 結束後不自行退出。
#     # 正常路徑由 worker 內建 watchdog 自關; 本分支為備援 (watchdog 失靈時)。
#     # 4-Tuple 驗證殺錯零風險; 仍失敗才留給主視窗處置 (exit 2)。
#     Write-PpLog "Status present, window lingering past grace -- graceful close via Stop-WorkerSafe" "WARN"
#     $closed = Stop-WorkerSafe -IpcDir $IpcDir -StoryId $TaskId -Phase $Phase
#     if ($closed) { $outcome = 'closed-by-dispatcher' }
# }
# if ($outcome -in @('stalled','hard-ceiling')) {
#     # 明確不殺 -- 只回報, 由主視窗依 worker-lifecycle-judgment.md §5 Self-Check 人工裁決。
#     Write-PpLog "$outcome -- worker PID 仍 ALIVE, dispatch 主動退出等待但**未殺 worker**, 交主視窗裁決" "WARN"
# }
#
# ---- (whp-2 T8) 終止語意收斂: bounded confirmation 解析後直接收斂 evidence -> 印摘要 -> exit ----
# 不再進入任何等待迴圈;30/10/10 停滯偵測職責已全交 pipeline-guardian.ps1 常駐守護(whp-7)。
# whp-2 CR fix: worker-reported-failed 併入判定(見上方迴圈內 $workerFailed 偵測),使 claude 從未
# 啟動前就 exit 1 的 worker(task file missing / story not in DB / claude launch error)不再被
# 誤判為 spawned-pending-guardian(exit 0)。
$outcome = if ($workerProc.HasExited) { 'exited-during-confirm' } elseif ($workerFailed) { 'worker-reported-failed' } elseif ($claudeSeen) { 'spawned-confirmed' } else { 'spawned-pending-guardian' }

# ---- 收斂 evidence ----
$status = $null
if (Test-Path $statusFile) {
    try { $status = Read-JsonRetry -Path $statusFile } catch { }
}
$statusValue = if ($status -and $status.status) { $status.status } else { 'unknown' }

# 本 worker 實際造成的變更 = 當前 dirty 差集 baseline
$current     = Get-DirtyFiles
$workerFiles = @($current | Where-Object { $baseline -notcontains $_ })

# ---- 機器可讀摘要 (主視窗審查入口) ----
Write-Host ""
Write-Host "==================== DISPATCH RESULT ===================="
Write-Host "TASK_ID  : $TaskId | PHASE: $Phase"
Write-Host "OUTCOME  : $outcome"
Write-Host "STATUS   : $statusValue"
if ($isGeneral) {
    $reportExists = [bool](Test-Path $ReportPath)
    Write-Host "REPORT   : $ReportPath ($(if ($reportExists) { 'EXISTS' } else { 'MISSING' }))"
} else {
    $dbStatus = 'unknown'; $tasksBackfilled = 'unknown'
    if ($status -and ($status.PSObject.Properties.Name -contains 'evidence') -and $status.evidence) {
        $ev = $status.evidence
        if ($ev.PSObject.Properties.Name -contains 'db_status')        { $dbStatus = $ev.db_status }
        if ($ev.PSObject.Properties.Name -contains 'tasks_backfilled') { $tasksBackfilled = $ev.tasks_backfilled }
    }
    Write-Host "DB_STATUS: $dbStatus | TASKS_BACKFILLED: $tasksBackfilled"
}
Write-Host "WORKER_FILES ($($workerFiles.Count)) -- 本 worker 造成的變更 (差集 baseline):"
foreach ($f in $workerFiles) { Write-Host "  - $f" }
Write-Host "PRE_EXISTING_DIRTY ($($baseline.Count)) -- 他軌/既有, 審查與 commit 不得觸碰"
Write-Host "IPC      : $IpcDir"
$workerAlive = -not $workerProc.HasExited
Write-Host "WORKER   : PID $($workerProc.Id) ($(if ($workerAlive) { 'ALIVE' } else { 'closed' }))"
if ($outcome -eq 'exited-during-confirm') {
    Write-Host "WARN     : worker wrapper 已於確認窗內結束(可能啟動失敗)-- 請查 IPC/log 排查"
}
if ($outcome -eq 'worker-reported-failed') {
    Write-Host "WARN     : worker 於 claude.exe 啟動前已回報 status=failed -- 請查 IPC/log 排查(視窗仍存活,未被關閉)"
    Write-Host "WARN     : 此 run 的 lifecycle 仍為非終態,且 wrapper PID 存活使 4-Tuple 判活恆為 alive --"
    Write-Host "           在**使用者手動關閉該視窗**之前,本 story 的所有後續派發都會被 preflight"
    Write-Host "           NON_TERMINAL_RUN 擋下(exit 1)。排查完畢請手動關窗後再重派。"
}
# (whp-2 T8/AC4) 視窗不會自動關閉 -- 避免中控誤以為視窗會自己消失;-TimeoutSec 對本路徑已無效的告知。
Write-Host "NOTICE   : 視窗不會自動關閉(whp-2 起生效)-- 關窗須由中控走完握手,或使用者隨時手動關閉本視窗"
Write-Host "NOTICE   : -TimeoutSec/phaseTimeouts 對本路徑已不再影響返回時機(僅 dispatchConfirmSec 有界確認生效)"
if ($isGeneral) {
    Write-Host "NEXT     : 主視窗審查 V1-V5 (references/general-task-mode.md) -> pathspec commit -> 下一任務"
} else {
    Write-Host "NEXT     : 主視窗 E2 驗證 (main-controlled-mode.md SS4 證據項 + 三層語意/抽樣) -> commit -> 下一階段"
}
Write-Host "=========================================================="

# (whp-2 T8) exit code 收斂: 0=spawned & wrapper PID alive at hand-off(不論是否見到 claude.exe 子行程,BR-009)
# · 1=wrapper 已於確認窗內結束(spawn 後即失敗)或 worker 於 claude.exe 啟動前已回報 status=failed
# (whp-2 CR fix,見上方 $workerFailed)。原 timeout/lingering/stalled/hard-ceiling 三態與 exit 2 已隨
# adaptive wait 一併退場(BR-009 SHALL NOT produce outcomes timeout/lingering/stalled/hard-ceiling or exit code 2)。
if ($outcome -in @('exited-during-confirm', 'worker-reported-failed')) { exit 1 }
exit 0
