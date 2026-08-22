# ==============================================================================
# worker-general.ps1  v1.2.0
# party-to-pipeline v5.3.0 -- Mode C General-Task Worker (sub-window)
# v1.1.0 (2026-08-01, whp-2): close watchdog + 自殺收尾退場 -- 視窗永不自動關閉, 關窗僅限使用者手動
# v1.2.0 (2026-08-02, whp-8): 收尾段標題改"待中控確認"+ 警語補 /workers 指引 -- 啟動段 "[⚠ 勿關閉]" 不變
#
# Launched by dispatch-general.ps1 via Start-Process. NOT for manual use.
# Mode C contract (vs worker-dev.ps1):
#   - NO Story DB query / NO BMAD workflow (free-form task prompt)
#   - NO Wait-AckFile (main window reviews evidence directly)
#   - (whp-2) 視窗永不自動關閉: 收尾只印警語, 不 Start-Countdown / 不 self-kill
#   - NO [1m] strip on model_id (1M-context presets pass through as-is)
#   - All task params read from IPC task-general.json (avoids Start-Process
#     CJK cmdline truncation -- only ASCII -TaskId / -IpcDir on cmdline)
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TaskId,
    [Parameter(Mandatory)][string]$IpcDir
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

$ProjectRoot = Get-ProjectRoot          # PoC: env PIPELINE_CONTROL_ROOT 設時 = 主 repo (控制平面 main-pinned)
$WorkRoot    = Get-WorkRoot             # PoC: worktree 模式 = worktree (執行平面跑 git); 否則 = ProjectRoot (向後相容)
$LogDir      = Get-LogDir
$Phase       = 'general'

$Host.UI.RawUI.WindowTitle = "[⚠ 勿關閉] [GT] $TaskId"

# ---- (whp-2 T5) CTRL_CLOSE_EVENT handler: 使用者手動關閉視窗時印警語 + 寫 marker
#      (whp-1 R2 已驗證範式 3/3 可靠、本機實測 4.6s 寬限期,fail-open -- 對齊 BR-011/BC-02) ----
try {
    Add-Type -Language CSharp @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class Whp2GeneralCloseHandler {
    public delegate bool HandlerRoutine(uint dwCtrlType);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleCtrlHandler(HandlerRoutine handler, bool add);

    public const uint CTRL_CLOSE_EVENT = 2;
    public static string MarkerPath = "";

    public static bool Handler(uint ctrlType) {
        if (ctrlType == CTRL_CLOSE_EVENT) {
            try {
                Console.Error.WriteLine("[WARN] 使用者手動關閉視窗 -- 本次任務可能未完整回報,請中控查驗 DB 狀態。");
                File.AppendAllText(MarkerPath,
                    "USER_CLOSED_WINDOW @ " + DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzzz") + Environment.NewLine);
            } catch (Exception ex) {
                // whp-2 CR-R2: marker 寫入失敗(IPC 目錄已清 / 磁碟滿)不得完全靜默。
                // 仍為 fail-open(不阻斷關窗),但至少於 stderr 留痕。callback thread ~5s 寬限期,保持極輕量。
                try { Console.Error.WriteLine("[WARN] close-marker 寫入失敗: " + ex.Message); } catch { }
            }
        }
        return false;
    }
}
'@
    [Whp2GeneralCloseHandler]::MarkerPath = Join-Path $IpcDir "user-closed-$Phase.marker"
    $methodInfo   = [Whp2GeneralCloseHandler].GetMethod("Handler")
    $delegateType = [Whp2GeneralCloseHandler+HandlerRoutine]
    # MUST stay $script:-scoped (not local/inline) -- this is the only managed reference keeping the
    # delegate alive for SetConsoleCtrlHandler; GC would otherwise collect it and crash on the next
    # CTRL event. Also requires -NoExit process hosting (see dispatch-general.ps1 Start-Process) to
    # keep script scope resident for the life of the window.
    $script:whp2CloseHandlerDelegate = [Delegate]::CreateDelegate($delegateType, $methodInfo)
    $whp2HandlerRegistered = [Whp2GeneralCloseHandler]::SetConsoleCtrlHandler($script:whp2CloseHandlerDelegate, $true)
    Write-PpLog "CTRL_CLOSE_EVENT handler registered: $whp2HandlerRegistered" "INFO"
} catch {
    Write-PpLog "CTRL_CLOSE_EVENT handler registration failed (fail-open, continuing): $_" "WARN"
}

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "Worker: GENERAL-TASK (Mode C)" "SYSTEM"
Write-PpLog "Task   : $TaskId" "SYSTEM"
Write-PpLog ("=" * 70) "SYSTEM"

# ---- Read task file (single source: model / report / track from IPC) ----
$taskFile = "$IpcDir\task-$Phase.json"
if (-not (Test-Path $taskFile)) {
    Write-PpLog "Task file missing: $taskFile" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "task file not found"
    exit 1
}
$task = Read-JsonRetry -Path $taskFile

foreach ($k in @('model_id','report_path')) {
    if ($task.PSObject.Properties.Name -notcontains $k -or -not $task.$k) {
        Write-PpLog "Task file missing field: $k" "ERROR"
        Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "task file missing field: $k"
        exit 1
    }
}
# Mode C: NO [1m] strip -- 1M-context model ids pass through as-is
$modelId    = $task.model_id
$reportPath = $task.report_path
$track      = if (($task.PSObject.Properties.Name -contains 'task_track') -and $task.task_track) { $task.task_track } else { 'side' }

# [whp-2 RETIRED @ 2026-08-01] generalTask close_mode/close_delay/countdown config read -- 原理見封存 §11.2
# 為何曾經如此: watchdog(下方)與 Start-Countdown(收尾段)需要這三個值決定何時/是否自動關窗。
# 為何現在移除: 使用者硬裁定"取消 worker 子視窗自動關閉",兩個消費者已全數封存,讀取變成無消費者的死碼。
# 回退指引: 反註解本區塊 + 下方 watchdog 區塊 + 收尾段 Start-Countdown 三處即復原(BR-012 統一封存)。
# ---- (v5.3.1) generalTask config: close mode + delays (single read) ----
# $closeMode  = 'auto'
# $closeDelay = 5
# $countdown  = 3
# try {
#     $cfgPath = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
#     $cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
#     if ($cfg.PSObject.Properties.Name -contains 'generalTask') {
#         $gtCfg = $cfg.generalTask
#         if (($gtCfg.PSObject.Properties.Name -contains 'close_mode') -and $gtCfg.close_mode) { $closeMode = [string]$gtCfg.close_mode }
#         if (($gtCfg.PSObject.Properties.Name -contains 'close_delay_sec') -and $gtCfg.close_delay_sec) { $closeDelay = [int]$gtCfg.close_delay_sec }
#         if (($gtCfg.PSObject.Properties.Name -contains 'countdown_sec') -and $gtCfg.countdown_sec) { $countdown = [int]$gtCfg.countdown_sec }
#     }
# } catch { }
# whp-2: 視窗永不自動關閉,CLOSE_MODE 對 agent 而言恆為此值(見下方 system prompt 注入)
$closeMode = 'never-auto (whp-2)'

$promptFile = "$IpcDir\prompt-$Phase.txt"
if (-not (Test-Path $promptFile)) {
    Write-PpLog "Prompt file missing: $promptFile" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "prompt file not found"
    exit 1
}
$taskPrompt = Read-Utf8File -Path $promptFile
if (-not $taskPrompt.Trim()) {
    Write-PpLog "Prompt file is empty" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "prompt file empty"
    exit 1
}

Write-PpLog "Model  : $modelId | effort=max (Mode C fixed)" "INFO"
Write-PpLog "Report : $reportPath" "INFO"

# ---- Build system prompt: TASK META + general protocol template ----
$protocolPath = Join-Path $ScriptsDir "general-protocol-template.md"
$protocolText = if (Test-Path $protocolPath) {
    Read-Utf8File -Path $protocolPath
} else {
    "(general-protocol-template.md not found - check skill installation)"
}

$sysPrompt = @"
================== MODE C GENERAL TASK (SYSTEM CONTEXT) ==================
[TASK META]
TASK_ID     : $TaskId
REPORT_PATH : $reportPath
TASK_TRACK  : $track
CLOSE_MODE  : $closeMode
IPC_DIR     : $IpcDir

$protocolText
"@
$sysPromptFile = Join-Path $IpcDir "system-$Phase.txt"
Write-Utf8File -Path $sysPromptFile -Content $sysPrompt -WithBom $false

# ---- User task: prompt + ultrathink directive ----
# (對齊 worker-dev.ps1:97-108 雙保險範式: env 機會性 + system prompt directive 為 reliable 主機制)
$userTask = $taskPrompt + "`n`n本任務必用最大思考深度 ultrathink"

# ---- (whp-6 D1) 中控指示讀取器:Mode C 無 Story DB,仍走同一 run_id / worker_messages 通道
#      (前綴而非附加 -- ultrathink 上面已 append,保證仍是最後一段,BR-008/BR-010/BR-011) ----
if (($task.PSObject.Properties.Name -contains 'run_id') -and $task.run_id) {
    try {
        $directiveOutput = & node "$ProjectRoot\.context-db\scripts\read-worker-directives.js" --run-id $task.run_id 2>$null
        if ($LASTEXITCODE -eq 0 -and $directiveOutput) {
            $userTask = ($directiveOutput -join "`n") + "`n`n" + $userTask
            Write-PpLog "D1: injected controller directives for run_id=$($task.run_id)" "INFO"
        } elseif ($LASTEXITCODE -ne 0) {
            Write-PpLog "D1 skipped (reader exited $LASTEXITCODE, fail-open)" "WARN"
        }
    } catch {
        Write-PpLog "D1 skipped (reader error, fail-open): $_" "WARN"
    }
} else {
    Write-PpLog "D1 skipped (no run_id)" "INFO"
}

$Timestamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$stderrFile = Join-Path $LogDir "claude-$TaskId-$Phase-err-$Timestamp.log"

$env:PHYCOOL_ORCHESTRATOR_MODE = '1'
$env:PIPELINE_STORY_ID         = $TaskId
$env:PIPELINE_PHASE            = $Phase
$env:PIPELINE_IPC_DIR          = $IpcDir
$env:PIPELINE_TASK_TRACK       = $track
$env:PIPELINE_REPORT_PATH      = $reportPath
# (whp-4 T3.1) PIPELINE_RUN_ID gates stop-report.ps1's DB heartbeat path (BC-07: absent when
# task file predates session binding -- legacy IPC dir / manual worker run -- heartbeat then
# silently skips, IPC status file still written as before).
if (($task.PSObject.Properties.Name -contains 'run_id') -and $task.run_id) {
    $env:PIPELINE_RUN_ID = $task.run_id
}
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'
# Mode C 固定 effort=max (env 為機會性嘗試 GitHub #50099, 主機制走 userTask directive)
$env:CLAUDE_CODE_EFFORT_LEVEL  = 'max'
# 2026-07-25: worker 不應繼承中控自身的 CLAUDE_CODE_CHILD_SESSION marker(避免 transcript persistence 被誤關)。
Remove-Item Env:\CLAUDE_CODE_CHILD_SESSION -ErrorAction SilentlyContinue
$env:CLAUDE_CODE_FORCE_SESSION_PERSISTENCE = '1'
$env:NODE_PATH = "$ProjectRoot\.context-db\node_modules"

# [whp-2 RETIRED @ 2026-08-01] Close watchdog(第一層自動關窗)-- 原理 + 原文 + 回退指引見封存 §11.2(架構規格書第十一章)
# 為何曾經如此: claude 互動模式 turn 結束後不自行退出(gt-smoke-001 實證),需要有人結束子視窗。
# 為何現在移除: 使用者硬裁定(2026-07-26)"取消 worker 子視窗自動關閉",watchdog kill claude.exe 即違反此裁定;
#              薄手已改"有界確認即退出"不再等視窗關閉,不需要 watchdog 幫它製造"視窗已關"的假象。
# 回退指引: 反註解本區塊(BR-012 統一封存,非旗標即時復原 -- autoCloseEnabled 僅示意/預留未來旗標守護)。
# ---- (v5.3.1) Close watchdog: claude 互動模式 turn 結束後不自行退出 (gt-smoke-001 實證) ----
# auto 模式: status 落地 + close_delay 後, 以 IpcDir cmdline 比對殺 claude 樹 (排除 worker 自身),
# `& claude` 解除阻塞 -> worker 自行收尾關窗。watchdog 失敗時 dispatcher lingering grace 備援兜底。
# $watchdog = $null
# if ($closeMode -eq 'auto') {
#     $watchdog = Start-Job -ScriptBlock {
#         param($StatusFile, $IpcDirPath, $WorkerProcId, $DelaySec)
#         $deadline = (Get-Date).AddHours(12)
#         while ((Get-Date) -lt $deadline) {
#             if (Test-Path $StatusFile) {
#                 Start-Sleep -Seconds $DelaySec
#                 try {
#                     # 2026-07-25: 改為只鎖定"自己(WorkerProcId)的直接子行程且名稱為 claude.exe",
#                     # 不再對全系統做 CommandLine 子字串掃描(避免並行多 worker 時誤殺他人)。
#                     # 父子行程關係由 OS 保證,不會跨 worker 誤判;IpcDir 子字串比對保留作第二層防禦。
#                     $targets = Get-WmiObject Win32_Process | Where-Object {
#                         $_.ParentProcessId -eq $WorkerProcId -and $_.Name -eq 'claude.exe' -and
#                         $_.CommandLine -and $_.CommandLine.Contains($IpcDirPath)
#                     }
#                     foreach ($t in $targets) {
#                         & taskkill /T /F /PID $t.ProcessId 2>$null | Out-Null
#                     }
#                 } catch { }
#                 break
#             }
#             Start-Sleep -Seconds 1
#         }
#     } -ArgumentList "$IpcDir\status-$Phase.json", $IpcDir, $PID, $closeDelay
#     Write-PpLog "Close watchdog armed (auto: status + ${closeDelay}s -> close own claude.exe child only, PPID-scoped)" "INFO"
# }
# [whp-2 RETIRED @ 2026-08-01 · CR-R2 補完] $watchdog 變數與下方 cleanup guard 一併封存 --
# watchdog 武裝已退場(上方區塊),$watchdog 恆 null 使 cleanup guard 成為永久不可達的死碼。
# 回退指引: 反註解本行 + 上方 watchdog 區塊 + 下方 cleanup guard 三處(BR-012 統一封存)。
# $watchdog = $null

Set-Location $WorkRoot   # PoC: worktree 模式進 worktree (執行平面 git/code); DB/IPC/log/NODE_PATH 仍 $ProjectRoot main-pinned
Write-PpLog "CWD = $WorkRoot (執行平面) | 控制平面 = $ProjectRoot (main-pinned)" "INFO"
Write-PpLog "Launching Claude (interactive mode, $modelId)..." "STEP"

try {
    # Clone worker-dev.ps1:113-118 (T3.1 YOLO + TD-4 workers-mcp sandbox-only)
    # PoC: worktree 模式用 dispatch 生成的 worktree-local workers-mcp.json (phycool-context server.js 絕對路徑·B1);
    #      非 worktree 用靜態 PSScriptRoot 版 (向後相容).
    $WorkersMcpConfig = if (($task.PSObject.Properties.Name -contains 'worker_mcp_config') -and $task.worker_mcp_config) { $task.worker_mcp_config } else { Join-Path $PSScriptRoot 'workers-mcp.json' }
    # (whp-4 T3.1/BR-110/BR-111) --session-id binds this claude session to worker_runs.run_id,
    # inserted before --model. Absent from task file (legacy IPC dir) -> omit flag, WARN, start normally.
    $sessionIdArgs = @()
    if (($task.PSObject.Properties.Name -contains 'resume_session_id') -and $task.resume_session_id) {
        # whp-6 BR-014: --resume and --session-id are mutually exclusive; resume takes priority.
        $sessionIdArgs = @('--resume', $task.resume_session_id)
    } elseif (($task.PSObject.Properties.Name -contains 'session_id') -and $task.session_id) {
        $sessionIdArgs = @('--session-id', $task.session_id)
    } else {
        Write-PpLog "task file has no session_id -- starting without --session-id (legacy IPC dir, backward-compat)" "WARN"
    }
    & claude --dangerously-skip-permissions --chrome --mcp-config $WorkersMcpConfig --strict-mcp-config @sessionIdArgs --model $modelId --append-system-prompt-file $sysPromptFile $userTask 2>> $stderrFile
    $claudeExit = $LASTEXITCODE
    Write-PpLog "Claude exited with code: $claudeExit" "INFO"
} catch {
    Write-PpLog "Claude launch error: $_" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "claude launch error: $_"
    Update-Tracker -StoryId $TaskId -Phase $Phase -Status 'failed' -ProcessId $PID -IpcDir $IpcDir
    exit 1
}

# ---- Status fallback synth (Stop hook may not have written) ----
$statusFile = "$IpcDir\status-$Phase.json"
if (-not (Test-Path $statusFile)) {
    Write-PpLog "Stop hook did NOT write status -- synthesizing from report file" "WARN"
    $reportExists = [bool]($reportPath -and (Test-Path $reportPath))
    $synthStatus  = if ($reportExists) { 'completed' } else { 'partial' }
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status $synthStatus -Evidence @{
        report_exists  = $reportExists
        report_path    = $reportPath
        synthesized_by = 'worker-general.ps1 fallback'
        claude_exit    = $claudeExit
    }
}

# [whp-2 RETIRED @ 2026-08-01 · CR-R2 補完] cleanup guard -- $watchdog 恆 null 故永久不可達
# ---- (v5.3.1) Close watchdog cleanup ----
# if ($watchdog) { try { Remove-Job -Job $watchdog -Force -ErrorAction SilentlyContinue } catch { } }

# ---- Mode C: NO Wait-AckFile (main window reviews evidence directly) ----
# [whp-2 RETIRED @ 2026-08-01] Start-Countdown -- 原理見封存 §11.2(視窗永不自動關閉,倒數已無意義)
# Start-Countdown -Seconds $countdown -Label "Window closing in"
# (whp-8 BR-026/BR-027) claude 已結束時,視窗語意從"執行中"改為"待中控確認" -- 啟動段
# "[⚠ 勿關閉]" 標題(line 39)在 running 期間措辭正確,維持不變。
$winTitle = "[⚠ 待中控確認 · 勿關閉] [GT] $TaskId"
$Host.UI.RawUI.WindowTitle = $winTitle
Write-PpLog "claude 已結束,本視窗待中控確認(不自動關閉)。" "WARN"
Write-PpLog "關窗可由中控呼叫 close-worker.ps1(whp-6 起唯一程式化途徑),進度可於 DevConsole /workers 查看,您也可隨時手動關閉本視窗。" "WARN"

# ---- Tracker: files_modified + closed (clone worker-dev.ps1 T1.3 + T4.7) ----
$filesChanged = @()
try {
    Push-Location $WorkRoot   # PoC: worker 變更落在 worktree (執行平面)
    $diff = & git diff --name-only HEAD 2>$null
    if ($diff) { $filesChanged = @($diff | Where-Object { $_.Trim() }) }
    Pop-Location
} catch { try { Pop-Location } catch {} }
Update-Tracker -StoryId $TaskId -Phase $Phase -Status 'closed' -ProcessId $PID -IpcDir $IpcDir `
    -WindowTitle $winTitle -FilesModified $filesChanged
Write-PpLog "[$Phase] Worker exit" "SUCCESS"
# [whp-2 RETIRED @ 2026-08-01] Self-kill tail -- 原理見封存 §11.2(取消自動關窗後,視窗續存為預期行為)
# Clone worker-dev.ps1:163-167 D1+D15 fix: self-kill defeats Start-Process -NoExit
# Stop-Process -Id $PID -Force
exit 0  # whp-2: now reachable -- normal exit path since self-kill retired; Start-Process -NoExit keeps window open
