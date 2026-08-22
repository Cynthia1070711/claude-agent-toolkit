# ==============================================================================
# worker-dev.ps1  v1.3.0
# party-to-pipeline v4.0.0 -- Dev-Story Worker (sub-window)
# v1.1.0 (2026-06-06, v5.4.0): close watchdog (status+5s 自動關窗) + ACK wait 死碼移除  [已於 v1.2.0 退場]
# v1.2.0 (2026-08-01, whp-2): close watchdog + 自殺收尾退場 -- 視窗永不自動關閉, 關窗僅限使用者手動
# v1.3.0 (2026-08-02, whp-8): 收尾段標題改"待中控確認"+ 警語補 /workers 指引 -- 啟動段 "[⚠ 勿關閉]" 不變
#
# Launched by dispatch-general.ps1 (E2 預設) 或 orchestrator.ps1 (E1 批次) via Start-Process. NOT for manual use.
# Prerequisites: create-story phase completed (status=ready-for-dev).
# ==============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StoryId,
    [Parameter(Mandatory)][string]$IpcDir,
    [Parameter(Mandatory)][string]$Track,
    [Parameter(Mandatory)][string]$Complexity,
    [ValidateSet('dev-story','dev-story-complex','dev-story-fix-R1','dev-story-fix-R2')]
    [string]$Phase = 'dev-story'
)

# ---- (T2.4 v5.0.0) PS 5.1 繁中 UTF-8 init -- 對齊 phycool-windows-ps-encoding ----
[Console]::OutputEncoding            = [System.Text.Encoding]::UTF8
[Console]::InputEncoding             = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
# ---------------------------------------------------------------------------------

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptsDir = $PSScriptRoot
. "$ScriptsDir\shared-utils.ps1"

$ProjectRoot = Get-ProjectRoot          # PoC: env PIPELINE_CONTROL_ROOT 設時 = 主 repo (控制平面 main-pinned)
$WorkRoot    = Get-WorkRoot             # PoC: worktree 模式 = worktree (執行平面跑 git); 否則 = ProjectRoot (向後相容)
$LogDir      = Get-LogDir

$Host.UI.RawUI.WindowTitle = "[⚠ 勿關閉] [DEV] $StoryId"

# ---- (whp-2 T5) CTRL_CLOSE_EVENT handler: 使用者手動關閉視窗時印警語 + 寫 marker
#      (whp-1 R2 已驗證範式 3/3 可靠、本機實測 4.6s 寬限期,fail-open -- 對齊 BR-011/BC-02) ----
try {
    Add-Type -Language CSharp @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class Whp2DevCloseHandler {
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
    [Whp2DevCloseHandler]::MarkerPath = Join-Path $IpcDir "user-closed-$Phase.marker"
    $methodInfo   = [Whp2DevCloseHandler].GetMethod("Handler")
    $delegateType = [Whp2DevCloseHandler+HandlerRoutine]
    # MUST stay $script:-scoped (not local/inline) -- this is the only managed reference keeping the
    # delegate alive for SetConsoleCtrlHandler; GC would otherwise collect it and crash on the next
    # CTRL event. Also requires -NoExit process hosting (see dispatch-general.ps1 Start-Process) to
    # keep script scope resident for the life of the window.
    $script:whp2CloseHandlerDelegate = [Delegate]::CreateDelegate($delegateType, $methodInfo)
    $whp2HandlerRegistered = [Whp2DevCloseHandler]::SetConsoleCtrlHandler($script:whp2CloseHandlerDelegate, $true)
    Write-PpLog "CTRL_CLOSE_EVENT handler registered: $whp2HandlerRegistered" "INFO"
} catch {
    Write-PpLog "CTRL_CLOSE_EVENT handler registration failed (fail-open, continuing): $_" "WARN"
}

Write-PpLog ("=" * 70) "SYSTEM"
Write-PpLog "Worker: DEV-STORY" "SYSTEM"
Write-PpLog "Story  : $StoryId" "SYSTEM"
Write-PpLog "Track  : $Track" "SYSTEM"
Write-PpLog ("=" * 70) "SYSTEM"

$taskFile = "$IpcDir\task-$Phase.json"
if (-not (Test-Path $taskFile)) {
    Write-PpLog "Task file missing: $taskFile" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "task file not found"
    exit 1
}
$task = Read-JsonRetry -Path $taskFile

$modelInfo = Read-PhaseModel -PhaseName $Phase -Complexity $Complexity
$model     = $modelInfo.model_id   # NO [1m] strip (align worker-general.ps1 v5.3.0 passthrough; 2026-06-07 fix: stripping caused sonnet-4.6[1m]->200k thrashing on L-card dev)
$effort    = $modelInfo.effort
Write-PpLog "Model  : $model | effort=$effort" "INFO"

$story = Get-StoryFromDb -StoryId $StoryId
if (-not $story) {
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "story not in DB"
    exit 1
}

# Verify create-story phase completed (status=ready-for-dev OR in-progress OR review)
if ($story.status -in @('backlog','creating')) {
    Write-PpLog "Story status='$($story.status)' -- create-story phase not complete" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "create-story prerequisite not met (status=$($story.status))"
    exit 1
}

$sysPrompt = Build-StoryPromptContext -Story $story -Phase $Phase -Track $Track -IpcDir $IpcDir
$sysPromptFile = Join-Path $IpcDir "system-$Phase.txt"
[System.IO.File]::WriteAllText($sysPromptFile, $sysPrompt, [System.Text.UTF8Encoding]::new($false))

# SKL-09 AC7 (cr-r1-followup AC4): [MUST LOAD] pipeline-subwindow Skill 短指引注入
$userTask = @"
/bmad:bmm:workflows:dev-story $StoryId

[MUST LOAD] First load Skill: pipeline-subwindow (sub-window conventions, DB query/write golden path, common-mistakes catalog). Reference: .claude/skills/pipeline-subwindow/SKILL.md

**MANDATORY STEP 1 -- BMAD workflow invocation (2026-07-27 determinism fix)**:
  - Line 1 above is a BARE slash command, deliberately placed first so the CLI can expand it. If it was expanded, the workflow instructions are already in your context: follow them exactly as written.
  - If it was NOT expanded (no command block appeared in your context), you **MUST literally invoke the Skill tool** with skill name bmad:bmm:workflows:dev-story and args $StoryId.
  - **DO NOT** paraphrase, summarise or hand-roll the workflow. The file _bmad/bmm/workflows/4-implementation/dev-story/workflow.md plus its steps/*.md files are the only authoritative execution order.
  - **DO NOT** satisfy this with narrative text such as "I will now run the dev-story workflow" -- only an expanded command block or a literal Skill tool_use counts as invocation.
  - Measured baseline (2026-07-27 audit of all 17 party-to-pipeline sub-window sessions): only 3 of 17 (18%) actually invoked their BMAD workflow; the other 14 read ZERO workflow files. This step exists to close that gap, and whp-4 will mechanically detect it via the workflow_invoked evidence field.

Implement per AC + Tasks. Run dotnet test / vitest until all pass.

After dev-story workflow completes, **MANDATORY FINAL STEP -- Tasks Backfill Verification (Bug #10 fix 2026-05-09)**:
  - **MUST literally invoke Skill tool**: `Skill(skill="tasks-backfill-verify", args="$StoryId")`
  - **DO NOT simulate via Bash grep / echo / narrative report** -- only literal Skill tool invocation writes ✅ markers to stories.tasks (Stop hook detects via tasks_backfilled signal).
  - If Skill not in available skill list (description budget overflow may drop ~11 skills):
    (a) Read .claude/skills/tasks-backfill-verify/SKILL.md
    (b) Follow SOP Step 1-6 explicitly (Read existing tasks → verify each with file:line code evidence → organize Markdown with ✅/⬜ at line start → upsert-story.js writing tasks field containing actual ✅ emojis + file_list + test_count)
  - **SUCCESS CRITERION**: After this step, query stories.tasks must contain at least one ✅ emoji literal. Stop hook tasks_backfilled signal depends on this. If absent, orchestrator will reject ACK and retry.

Then update DB status to 'review' via upsert-story.js. Do NOT ask user any questions (YOLO mode). Follow the sub-window protocol (protocol-template.md in system prompt).
"@

$Timestamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$stderrFile = Join-Path $LogDir "claude-$StoryId-$Phase-err-$Timestamp.log"

$env:PHYCOOL_ORCHESTRATOR_MODE = '1'
$env:PIPELINE_STORY_ID         = $StoryId
$env:PIPELINE_PHASE            = $Phase
$env:PIPELINE_IPC_DIR          = $IpcDir
$env:PIPELINE_TASK_TRACK       = $Track
# (whp-4 T3.1) PIPELINE_RUN_ID gates stop-report.ps1's DB heartbeat path (BC-07: absent when
# task file predates session binding -- legacy IPC dir / manual worker run -- heartbeat then
# silently skips, IPC status file still written as before).
if (($task.PSObject.Properties.Name -contains 'run_id') -and $task.run_id) {
    $env:PIPELINE_RUN_ID = $task.run_id
}
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'
# Phase 9 spike (2026-05-04): CLAUDE_CODE_EFFORT_LEVEL 官方 docs 未 documented + GitHub Issue #50099 v2.1.113 部分版本被 ignore.
# 機會性嘗試 + system prompt directive 雙保險.
$env:CLAUDE_CODE_EFFORT_LEVEL  = $effort
# 2026-07-25: worker 為獨立子視窗 session,不應繼承中控自身的 CLAUDE_CODE_CHILD_SESSION marker
# (否則 worker claude 誤判自己是巢狀子 session 而關閉 transcript persistence)。
Remove-Item Env:\CLAUDE_CODE_CHILD_SESSION -ErrorAction SilentlyContinue
$env:CLAUDE_CODE_FORCE_SESSION_PERSISTENCE = '1'

# SKL-09 AC6 (cr-r1-followup AC4): NODE_PATH bootstrap -- better-sqlite3 only in .context-db/node_modules/
# NODE_PATH 為 Node.js 模組解析的 fallback 路徑(cwd 內 / 上層 node_modules 找不到時退到此)
$env:NODE_PATH = "$ProjectRoot\.context-db\node_modules"

# Inject effort directive into user task (system prompt directive 為唯一 reliable 機制, 對齊 BR-MR-03)
if ($effort -eq 'max') {
    $userTask = $userTask + "`n`n本任務必用最大思考深度 ultrathink"
}

# ---- (whp-6 D1) 中控指示讀取器:讀 worker_messages 待送指示,前綴併入 $userTask
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

# [whp-2 RETIRED @ 2026-08-01] Close watchdog(第一層自動關窗)-- 原理 + 原文 + 回退指引見封存 §11.2(架構規格書第十一章)
# 為何曾經如此: claude 互動模式 turn 結束後不自行退出,需要有人結束子視窗(gt-smoke-001 + tracker 142/143 killed 實證)。
# 為何現在移除: 使用者硬裁定(2026-07-26)"取消 worker 子視窗自動關閉",watchdog kill claude.exe 即違反此裁定;
#              薄手已改"有界確認即退出"不再等視窗關閉,不需要 watchdog 幫它製造"視窗已關"的假象。
# 回退指引: 反註解本區塊(BR-012 統一封存,非旗標即時復原 -- autoCloseEnabled 僅示意/預留未來旗標守護)。
# ---- (v5.4.0) Close watchdog: claude 互動模式 turn 結束後不自行退出 ----
# 實證: gt-smoke-001 + tracker 142/143 BMAD worker killed (ACK 優雅關窗從未在生產走通)。
# $closeMode  = 'auto'
# $closeDelay = 5
# try {
#     $gtCfgPath = Join-Path $ProjectRoot 'scripts/pipeline-config.json'
#     $gtCfg = [System.IO.File]::ReadAllText($gtCfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
#     if ($gtCfg.PSObject.Properties.Name -contains 'generalTask') {
#         if (($gtCfg.generalTask.PSObject.Properties.Name -contains 'close_mode') -and $gtCfg.generalTask.close_mode) { $closeMode = [string]$gtCfg.generalTask.close_mode }
#         if (($gtCfg.generalTask.PSObject.Properties.Name -contains 'close_delay_sec') -and $gtCfg.generalTask.close_delay_sec) { $closeDelay = [int]$gtCfg.generalTask.close_delay_sec }
#     }
# } catch { }
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
Write-PpLog "Launching Claude (interactive mode, $model)..." "STEP"

try {
    # T3.1 v5.0.0: --dangerously-skip-permissions (YOLO mode) + --chrome (Claude-in-Chrome sandbox)
    # TD-4 fix (2026-05-11): --mcp-config workers-mcp.json --strict-mcp-config to exclude
    # chrome-devtools (real user Chrome port 9222 needs Alan manual auth → workers hang)
    # PoC: worktree 模式用 dispatch 生成的 worktree-local workers-mcp.json (phycool-context server.js 絕對路徑·B1); 非 worktree 用靜態版
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
    & claude --dangerously-skip-permissions --chrome --mcp-config $WorkersMcpConfig --strict-mcp-config @sessionIdArgs --model $model --append-system-prompt-file $sysPromptFile $userTask 2>> $stderrFile
    $claudeExit = $LASTEXITCODE
    Write-PpLog "Claude exited with code: $claudeExit" "INFO"
} catch {
    Write-PpLog "Claude launch error: $_" "ERROR"
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status 'failed' -ErrorMsg "claude launch error: $_"
    Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'failed' -ProcessId $PID -IpcDir $IpcDir
    exit 1
}

$statusFile = "$IpcDir\status-$Phase.json"
if (-not (Test-Path $statusFile)) {
    Write-PpLog "Stop hook did NOT write status -- synthesizing from DB" "WARN"
    $dbStatus = Get-StoryStatus -StoryId $StoryId
    $synthStatus = if ($dbStatus -eq 'review') { 'completed' } else { 'partial' }
    Write-StatusFile -IpcDir $IpcDir -Phase $Phase -Status $synthStatus -Evidence @{
        db_status = $dbStatus
        synthesized_by = 'worker-dev.ps1 fallback'
        claude_exit = $claudeExit
    }
}

# (v5.4.0) Close watchdog cleanup -- ACK wait 移除 (死碼: tracker 142/143 killed 實證)
# [whp-2 RETIRED @ 2026-08-01 · CR-R2 補完] cleanup guard -- $watchdog 恆 null 故永久不可達
# if ($watchdog) { try { Remove-Job -Job $watchdog -Force -ErrorAction SilentlyContinue } catch { } }

# [whp-2 RETIRED @ 2026-08-01] Countdown + Start-Countdown -- 原理見封存 §11.2(視窗永不自動關閉,倒數已無意義)
# $hsCfg = Get-HandshakeConfig
# $countdown = if ($hsCfg.countdown_sec) { [int]$hsCfg.countdown_sec } else { 5 }
# Start-Countdown -Seconds $countdown -Label "Window closing in"
# (whp-8 BR-026/BR-027) claude 已結束時,視窗語意從"執行中"改為"待中控確認" -- 啟動段
# "[⚠ 勿關閉]" 標題(line 37)在 running 期間措辭正確,維持不變。
$winTitle = "[⚠ 待中控確認 · 勿關閉] [DEV] $StoryId"
$Host.UI.RawUI.WindowTitle = $winTitle
Write-PpLog "claude 已結束,本視窗待中控確認(不自動關閉)。" "WARN"
Write-PpLog "關窗可由中控呼叫 close-worker.ps1(whp-6 起唯一程式化途徑),進度可於 DevConsole /workers 查看,您也可隨時手動關閉本視窗。" "WARN"
# v5.0.0 (T1.3 + T4.7): write window_title + files_modified to tracker
$filesChanged = @()
try {
    Push-Location $WorkRoot   # PoC: worker 變更落在 worktree (執行平面)
    $diff = & git diff --name-only HEAD 2>$null
    if ($diff) { $filesChanged = @($diff | Where-Object { $_.Trim() }) }
    Pop-Location
} catch { try { Pop-Location } catch {} }
Update-Tracker -StoryId $StoryId -Phase $Phase -Status 'closed' -ProcessId $PID -IpcDir $IpcDir `
    -WindowTitle $winTitle -FilesModified $filesChanged
Write-PpLog "[$Phase] Worker exit" "SUCCESS"
# [whp-2 RETIRED @ 2026-08-01] Self-kill tail -- 原理見封存 §11.2(取消自動關窗後,視窗續存為預期行為)
# D1+D15 fix (2026-05-11): defeat orchestrator -NoExit by self-killing PowerShell process.
# orchestrator.ps1:245 Start-Process powershell -NoExit prevents ps1 exit 0 from terminating
# the process (enters interactive prompt mode). Self-kill via $PID lets Quad-Confirm Layer 1
# (PID dead via $Proc.HasExited) pass immediately without 10s force-kill fallback.
# Stop-Process -Id $PID -Force
exit 0  # whp-2: now reachable -- normal exit path since self-kill retired; Start-Process -NoExit keeps window open
