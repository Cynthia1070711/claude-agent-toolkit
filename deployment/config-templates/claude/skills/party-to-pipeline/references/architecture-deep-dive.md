# Architecture Deep-Dive (party-to-pipeline v5.1.0 L3)

> 完整架構解剖 + 21 個已知缺陷/邊界 (2026-05-11 sleep mode 推進 11 Story 觀察提煉 + Party Mode 多 agent 收斂)。
> 對齊既有 architecture-and-scripts.md (Self-Contained) + ack-handshake.md (16 步) + orchestrator-awareness.md (5 軸環境感知)。
>
> **修補進度**: D1+D15 (CRITICAL) + D19 (CRITICAL) + D21 (P3) **已修補 2026-05-11** — Party Mode 多 agent 收斂方案 C。

---

## 1. 整體心智模型

> **「中控寫任務 + Stop hook 寫證據 + 中控驗證簽 ack + 子視窗倒數收尾 + Quad-Confirm 確認關閉」**
>
> Evidence-based 雙向協議,完全 file-based IPC,無 daemon 無 socket 無 polling。

### 1.1 設計直覺對齊

User 描述的設計直覺(2026-05-11 ultrathink):
> 「子視窗開完整 claude code 互動模式執行任務 → 任務完畢回報中控 → 自動關閉 → 中控檢查 → commit → 推下個任務,中控可 kill 子視窗 + 辨識哪個子視窗」

實作對應:
- ✅ **完整互動模式**: `claude --dangerously-skip-permissions --chrome --model X --append-system-prompt-file ...` (worker-{phase}.ps1:115)
- 🔴 **自動關閉**: **已於 whp-2(2026-08-01)整個取消** —— 使用者硬裁定「取消 worker 子視窗自動關閉」。原兩層機制(設計上的 `exit 0` 被 `Start-Process -NoExit` 阻擋 → 改走 Stop-WorkerSafe force kill fallback,即 D1 缺陷)**皆已封存**;現行為視窗永不自動關閉,關窗僅限使用者手動(`whp-6` `close-worker.ps1` 落地前無任何程式化管道)。上方引用的 User 設計直覺屬 2026-05-11 原文,保留為歷史脈絡
- ✅ **回報中控**: Stop hook (stop-report.ps1) atomic write `status-{phase}.json`
- ✅ **中控檢查**: `Confirm-StageResult` (DB target / tasks ✅ / file_list_count) → 寫 ack
- ✅ **中控 kill + 辨識**: 4-Tuple Identity (story_id + ipc_dir + pid + cmd_line via WMI) Quad-Confirm,防 Windows PID 重用
- ⚠️ **commit + 推下個任務**: orchestrator.ps1 跑完返回中控 (主對話視窗 agent),由 main agent (我) 手動 commit + dispatch 下一 — **不自動**

---

## 2. 元件職責矩陣

| 元件 | 角色 | 關鍵職責 |
|:----|:----|:----|
| `orchestrator.ps1` | 主控(主對話視窗執行) | 3 階段串接 + IPC 寫 task/ack + Wait-StatusFile/AckFile/WindowClosed + Quad-Confirm + Stop-WorkerSafe |
| `worker-create.ps1` | 子視窗 Create | claude(現行 Opus 分層 max)→ BMAD create-story workflow(現值見 `pipeline-config.json phaseModelMapping.create-story`) |
| `worker-dev.ps1` | 子視窗 Dev | claude(現行 Sonnet 分層 max)→ TDD red-green-refactor + tasks-backfill-verify Skill 字面調用(2026-07-19 裁定 dev 全階段改 sonnet;現值見 `pipeline-config.json phaseModelMapping.dev-story`) |
| `worker-review.ps1` | 子視窗 Review | claude(現行 Opus 分層 max)→ 9-axis audit + Skill Sync (saas-to-skill Mode B) + bug-fix-verification(現值見 `pipeline-config.json phaseModelMapping.code-review`) |
| `shared-utils.ps1` | 共用 helpers | Logger / Atomic JSON / IPC primitives / handshake config / Quad-Confirm / 4-Tuple / `Get-HandshakeConfig` |
| `stop-report.ps1` | Stop hook(settings.json 第 2 順位) | Env guard `PHYCOOL_ORCHESTRATOR_MODE` → evidence collect → atomic write status.json + `party-pipeline-stop-report.log` |
| `protocol-template.md` | 子視窗 system prompt 注入 | ACK 規範文字(避 32K cmdline,寫 `system-{phase}.txt`) |
| `smoke-test.ps1` | 集成驗證 | 74 case / 9 group,T1.1-T5.7(Group 7 · whp-4 registration/session-id/DB dual-write;Group 8 · whp-4 CR stop-report 心跳/證據;Group 9 · whp-2 no-auto-close 靜態斷言) |

---

## 3. ACK Handshake 16 步時序(完整版)

```
中控 orchestrator.ps1                  子視窗 worker-{phase}.ps1

 ① Clear-IpcStage(Phase)
 ② Write-TaskFile task-{phase}.json
 ③ Start-Process powershell -NoExit -File worker-{phase}.ps1
                   (-NoExit 是設計缺陷,見 §D1)
   ──────────────────────────────────► ④ Read task → Build prompt
                                       ⑤ claude --dangerously-skip-permissions
                                          --chrome --model X
                                          --append-system-prompt-file system-{phase}.txt
                                          (互動模式,完整 MCP/Hooks/Skills)
                                            │
                                            │ BMAD workflow execution
                                            │ + tasks-backfill-verify Skill 字面調用 (R10)
                                            │
                                       ⑥ claude turn 結束 → Stop hook 觸發
                                                            │
                                            [stop-report.ps1 Stop hook 第 2 順位]
                                                  ⑦ Env guard
                                                     PHYCOOL_ORCHESTRATOR_MODE != 1 → exit 0
                                                  ⑧ Read stdin (session_id / cwd)
                                                  ⑨ DB query (better-sqlite3 inline)
                                                     status + tasks(✅ check) + file_list
                                                  ⑩ git diff --name-only HEAD
                                                  ⑪ Determine status:
                                                     - phase target 達成 + tasks_backfilled → completed
                                                     - phase target 達成但 tasks 未 backfill → partial
                                                  ⑫ Atomic write status-{phase}.json
   ◄────────────────────────────────────────────────────────┘
 ⑬ Wait-StatusFile (1800s timeout)
 ⑭ Confirm-StageResult
 ⑮ Write-AckFile (ok=true/false, message, next_phase)
   ──────────────────────────────────► ⑯ Wait-AckFile (60s timeout)
                                       ⑰a (ok=true): Start-Countdown 5s
                                       ⑰b (ok=false): stderr 反饋,繼續修
                                       ⑱ Update-Tracker(closed_at)
                                       ⑲ exit 0 (但 -NoExit 阻擋 process exit)
 ⑳ Wait-WindowClosed (Quad-Confirm,10s timeout @ 2026-05-11)
    ├ Layer 1: PID 死亡? (Proc.HasExited)         ← -NoExit 失效點
    ├ Layer 2: tracker.closed_at 已寫?
    ├ Layer 3: ack mtime > 子視窗 start time?
    └ Layer 4: 4-Tuple Identity match via WMI
 ㉑ 全失敗 → Stop-WorkerSafe (4-Tuple verified force kill)
 ㉒ Update-Tracker(status=closed/killed) → 進下一階段
```

---

## 4. IPC 結構(三段唯一鍵防衝突)

```
.claude/ipc/{StoryId}__{Timestamp}/
├── task-create-story.json      # 中控 → worker
├── status-create-story.json    # Stop hook → 中控
├── ack-create-story.json       # 中控 → worker
├── system-create-story.txt     # claude --append-system-prompt-file 內容
│   ├── BMAD workflow + Story context (DB-first thin SKL-04 ~1600 chars)
│   └── ACK protocol from protocol-template.md
├── task-dev-story.json + status + ack + system.txt (同上)
├── task-code-review.json + status + ack + system.txt (同上)
└── enrichment.json             # (optional) Mode B Story 預載
```

> 三段唯一鍵 (StoryId + __ + Timestamp) 防 retry / 並發衝突 (R5)。

---

## 5. 環境變數契約

worker.ps1 啟動 claude 前設定:

| Env | 用途 | Reliable? |
|:----|:----|:----:|
| `PHYCOOL_ORCHESTRATOR_MODE=1` | stop-report.ps1 識別 orchestrator 模式 | ✅ |
| `PIPELINE_STORY_ID` | Story ID | ✅ |
| `PIPELINE_PHASE` | create-story / dev-story / code-review | ✅ |
| `PIPELINE_IPC_DIR` | IPC dir 絕對路徑 | ✅ |
| `PIPELINE_TASK_TRACK` | main / side | ✅ |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` | Bash tool 用 PowerShell | ✅ |
| `CLAUDE_CODE_EFFORT_LEVEL` | default / max | ⚠️ GitHub Issue #50099 v2.1.113 部分版本被 ignore — 主機制走 system prompt directive (`本任務必用最大思考深度 ultrathink`) |
| `NODE_PATH` | better-sqlite3 fallback (SKL-09 AC6) | ✅ |

---

## 6. Quad-Confirm 子視窗已關(v5.0.0 完整)

| Layer | 檢查項 | 行為 | -NoExit 影響 |
|:-:|:----|:----|:----:|
| 1 | `$Proc.HasExited` | PID 死亡 | ❌ -NoExit 阻擋,永遠 false |
| 2 | `tracker.closed_at` 寫入 | worker Step ⑱ Update-Tracker | ✅ |
| 3 | ack file mtime > 子視窗 start time | 防 stale ack 殘留誤判 | ✅ |
| 4 | 4-Tuple Identity via WMI | story_id + ipc_dir + pid + cmd_line match | ⚠️ WMI silent fail 風險 (D9) |

**判定規則**:
- Layer 1 ✅ + (Layer 2 OR Layer 3) → ✅ confirmed
- Layer 1 ✅ 單獨 → ⚠️ accept (warn)
- 全失敗 N 秒 (預設 10s,原 30s @ 2026-05-11 改) → 🛑 Stop-WorkerSafe force kill

---

## 7. 21 個已知缺陷 + 邊界 (D1-D21,3 CRITICAL 已修補)

### 7.1 D1 - `-NoExit` flag 設計缺陷 (CRITICAL) ✅ FIXED 2026-05-11

| 項目 | 內容 |
|:----|:----|
| 位置 | `orchestrator.ps1:245` `Start-Process powershell -ArgumentList @('-NoExit', ...)` |
| 行為 | worker.ps1 `exit 0` 只結束 ps1 script,powershell.exe process 因 `-NoExit` 進入互動 prompt mode 不退出 |
| 影響 | Quad-Confirm Layer 1 `Proc.HasExited` 永遠 false → Wait-WindowClosed 必 timeout → 每 phase 走 Stop-WorkerSafe force kill fallback |
| 累計成本 | 10s × 3 phase × N stories = ~30N 秒 cosmetic 延遲 (本 session 11 stories ~5.5 min) |
| **修補 (2026-05-11)** | 3 worker scripts (worker-create/dev/review.ps1) 結尾加 `Stop-Process -Id $PID -Force` 自殺 — 對齊 SKILL ack-handshake §Step 15 「ps1 wrapper exit」設計意圖。保留 -NoExit 對 debug 觀察價值 |
| 設計初衷 | 讓使用者觀察子視窗 console output (debug 用),但 sleep mode 不需要 |

### 7.2 D2 - `handshake.enabled=false` 名存實亡 (MEDIUM)

| 項目 | 內容 |
|:----|:----|
| 位置 | `pipeline-config.json:137` + `orchestrator.ps1:180-181` |
| 行為 | 設計上 `enabled=false` 應降級為 signal-fallback (claude-launcher v1 legacy 路徑) |
| 實際 | orchestrator 只 `Write-PpLog WARNING`,不分支 → 仍走完整 ACK flow;worker.ps1 也不讀 `enabled` flag |
| 影響 | flag 是 documentation noise,實際無作用 |
| 修法 | 實作 fallback_to_legacy 真實分支 OR 直接 default enabled=true 移除 flag |

### 7.3 D3 - claude session hang 偶發 (HIGH)

| 項目 | 內容 |
|:----|:----|
| 觸發 | code-review phase Opus 4.7 max effort 在複雜 9-axis 審查可能 thinking loop / stall(觀察於 Opus 4.7;現行 code-review SSoT 已改 `claude-opus-5[1m]`,是否仍有此風險未複驗,不可假設已解) |
| 觀察 | 本 session #7 `aat-ui-03-followup-js-context-encoding` code-review × 2 attempts × 30 min timeout = 60 min 浪費 |
| 證據 | `party-pipeline-stop-report.log` 缺 code-review entry → Stop hook 從未 fire |
| 影響 | 1800s × MaxRetries+1 = 最長 60 min/Story 浪費,orchestrator exit 1 |
| 修法 | (a) 加 progress heartbeat 偵測 (b) 縮短 worker timeout (c) 切 Sonnet 跑 review (d) split 9-axis 為多輪 |

### 7.4 D4 - `pipeline-active.json` legacy 殘留累積 (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `logs/pipeline-active.json` (1418 lines, 70 KB) |
| 來源 | claude-launcher v1 (story-pipeline-interactive.ps1:1041-1061) signal-file based PID tracker |
| 狀態 | party-to-pipeline orchestrator 讀 `party-pipeline-tracker.json` 不讀此,但 legacy reader 仍看到 stale "status: running" entries (2026-04-04 起累積) |
| 修法 | Boy Scout cleanup + 加 retention 機制 (≤ 30 days) |

### 7.5 D5 - `NEEDS_APPROVAL` 路徑 0 實作 (MEDIUM)

| 項目 | 內容 |
|:----|:----|
| 位置 | `orchestrator-awareness.md §14.2` 列為狀態之一,但 scripts grep 0 matches |
| 行為 | 子視窗若 escalate Tier 2 (`[NEEDS-APPROVAL: tag]` stderr) → 中控盲目,無偵測 |
| 對齊 | `subagent-blocked-tools.md` SUPREME 規範要求 Tier 2 升級 |
| 影響 | 子視窗 OAuth / PII / new-external-api 需 user approval 場景無路徑 |
| 修法 | orchestrator stderr 監聽 + IPC channel 接收 escalation requests |

### 7.6 D6 - Stop hook `tasks_backfilled` multi-signal false positive 風險 (MEDIUM)

| 項目 | 內容 |
|:----|:----|
| 位置 | `stop-report.ps1:109-112` (Bug #9 fix 2026-05-09) |
| 邏輯 | `tasksHasCheck OR reviewComplete OR devComplete` |
| 風險 | "devComplete" signal = `completed_at SET AND status='review'` → 但若 worker 跳過某些 tasks 直接 upsert status=review + completed_at → false positive |
| 影響 | 中控誤判 partial → completed → ack ok=true 推下一 |
| 修法 | tighten "devComplete" signal: require tests_passed flag OR file_list 不為空 |

### 7.7 D7 - Worker exit 1 → `status='failed'` retry workflow 不明確 (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `worker-dev.ps1:56-65` exit 1 + Write-StatusFile failed |
| 行為 | 中控讀到 `status='failed'` 走 retry / abort |
| 不明 | orchestrator 是否區別 `status=failed` vs `status` timeout? Retry 流程是否相同? |
| 修法 | Confirm-StageResult 加入 explicit `failed` 路徑分支 + 不同 retry 策略 |

### 7.8 D8 - Multi-Story batch Conflict Matrix 對單 Story 不啟用 (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `orchestrator.ps1 Invoke-MultiStoryBatch` 僅 `-StoryIds A,B,C` 啟用 |
| 缺漏 | Sequential single-Story dispatch (本 session 11 stories) 無 cross-Story 防護 |
| 風險低 | sequential 跑時前一 Story commit 完才推下一,實際無 cross-conflict |
| 但 | 若同 session 改 SUPREME rule + 推 stories,SUPREME 改動可能未即時生效新 stories |

### 7.9 D9 - 4-Tuple WMI query silent fail (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `shared-utils.ps1 Stop-WorkerSafe:361+` |
| 行為 | `Get-CimInstance Win32_Process` 取 cmd_line,WMI 服務暫停或 permission 不足 → query return $null |
| Default | 安全 default = 不 kill (保護無辜) |
| 但 | 真正 zombie 因此不殺,需 user 手動清 |
| 修法 | Fallback: 至少 verify story_id + ipc_dir + pid → 3-Tuple match (不要求 cmd_line) |

### 7.10 D10 - Wait-AckFile 60s vs Wait-StatusFile 1800s 不對稱 (LOW)

| 項目 | 內容 |
|:----|:----|
| 子視窗 | `Wait-AckFile 60s` |
| 中控 | `Wait-StatusFile 1800s` (30x 子視窗) |
| 場景 | 若 status fail 後中控走 retry → 60s 內絕對寫不出 ack → 子視窗早 exit |
| 影響 | retry path 子視窗已死,中控走 new spawn,實際 OK 但 timing 不對稱 |

### 7.11 D11 - `pipeline-active.json` + `tracker.json` 累積無 retention (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `logs/pipeline-active.json` (70 KB) + `logs/party-pipeline-tracker.json` (62 KB) |
| 累積 | 從 2026-04 至今,每 phase 加 entry |
| 修法 | Retention policy (≤ 90 days) + 自動 rotation |

### 7.12 D12 - IPC dir 累積無 cleanup (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `.claude/ipc/{StoryId}__{Timestamp}/` |
| 累積 | 24+ dirs (本 session +7,前 session +17) |
| 修法 | Story done 後 archive 或 retention 30 天 auto-rm |

### 7.13 D13 - system-{phase}.txt 容量上限無 monitor (LOW)

| 項目 | 內容 |
|:----|:----|
| 內容 | BMAD workflow + Story context (DB-first thin ~1600 chars) + protocol-template.md (~5000 chars) ~6500 chars 起 |
| 上限 | claude system prompt 容量未明 (可能 200K?) |
| 風險 | 隨 Story 內容增長 + Skill 升版,可能逼近上限 |
| 修法 | 加 char count 監控 + warning threshold |

### 7.14 D14 - claude session hang detection 缺 progress signal (HIGH)

| 項目 | 內容 |
|:----|:----|
| 行為 | 中控 Wait-StatusFile 等 1800s,worker PID 仍 alive 但 claude session stall (no tool use) |
| 觀察 | pipeline-heartbeat.js 是 PostToolUse Hook → claude 不 tool use 就不 fire heartbeat |
| 影響 | 中控等到 deadline timeout 才知道 hang |
| 修法 | 加 progress signal (e.g., claude internal token stream 監控 / OTel collector inactivity threshold) |

### 7.15 D15 - Quad-Confirm Layer 1 對 -NoExit 永遠 false (CRITICAL) ✅ FIXED 2026-05-11

`D1 的延伸 — Wait-WindowClosed 邏輯 line 346 必須 $pidDead 才 return true,-NoExit 阻擋 Layer 1 通過`。**D1 修補後 self-kill 讓 $pidDead=true,Layer 1 自然通過。**

### 7.16 D16 - git diff 未限 staged changes (LOW)

| 項目 | 內容 |
|:----|:----|
| 位置 | `stop-report.ps1:144` `git diff --name-only HEAD` |
| 風險 | 若主視窗 chore commits 未推 + worker concurrent → false attribution |
| 修法 | `git diff --name-only --cached` (staged only) 或 commit between markers |

### 7.17 D17 - Stop hook 鏈順位無 automated check (MEDIUM)

| 項目 | 內容 |
|:----|:----|
| 規範 | stop-report.ps1 必在 settings.json Stop hook 鏈第 2 順位 (R1) |
| FORBIDDEN | F9 列為禁止項目 |
| 缺漏 | 無 automated verifier 防 user 誤改 |
| 修法 | check-hygiene.ps1 加入 settings.json Stop hook 順位驗證 |

### 7.18 D18 - 跨 session env var 污染風險 (LOW)

| 項目 | 內容 |
|:----|:----|
| 風險 | 若 SessionStart hook 不小心 set 全局 `PHYCOOL_ORCHESTRATOR_MODE=1` (跨 main + sub-window) → 主視窗 Stop hook 也誤觸發 stop-report.ps1 |
| 影響 | Phantom evidence write to 主視窗 phase context |
| 修法 | stop-report.ps1 加 secondary check (e.g., IPC dir exists + recent activity) |

---

### 7.19 D19 - Stop hook multi-signal 違反 review 審查獨立性 (CRITICAL) ✅ FIXED 2026-05-11

| 項目 | 內容 |
|:----|:----|
| 位置 | `stop-report.ps1:109-112` Bug #9 fix (2026-05-09) multi-signal |
| 原邏輯 | `tasks_backfilled = tasksHasCheck OR reviewComplete OR devComplete` |
| 違反原則 | **User 明確要求**:「review 不能因為 dev 有 tasks-backfill-verify 就少做這一步驟。都已經在審查 dev 了,當然還是要重新進行全面的審查」 |
| 行為 | `reviewComplete` signal = `review_completed_at SET AND cr_score != null` → review agent 寫了 cr_score + completed_at 就算 backfilled = true,**可跳過 tasks-backfill-verify 字面調用** |
| 影響 | review 階段失去**獨立 audit** 能力,Skill SOP §Step 3 + §Step 5 self-check (file:line cross-verify) **被繞過** |
| 證據 | Party Mode 多 agent 討論 2026-05-11,Architect 確認設計反審查獨立性 |
| **修補 (2026-05-11)** | `stop-report.ps1` phase-specific signal: `code-review` phase 強制 `tasksHasCheck === true` (no fallback),dev-story phase 保留 `tasksHasCheck OR devComplete` 容忍 description budget drop |
| Triggered by | Party Mode Round 2 收斂 (2026-05-11 user ultrathink 觀察 review 階段 tasks-backfill-verify 流程) |

### 7.20 D20 - Audit Trail 強化建議 (P3 deferred)

| 項目 | 內容 |
|:----|:----|
| 建議 | DB stories 加 `tasks_dev_snapshot` + `tasks_review_snapshot` 兩欄位 |
| 用途 | dev 階段 tasks 寫入 _dev_snapshot → review 覆寫 tasks 寫入 _review_snapshot → 可 diff 兩者看 review 是否真有 audit (e.g., ⬜ 反轉、新 finding 補入) |
| 狀態 | DEFERRED — D19 phase-specific signal 已足夠強制 review 真 invoke,audit trail 為錦上添花 |

### 7.21 D21 - worker-review.ps1 Step 2 prompt 缺 audit 語意 (P3) ✅ FIXED 2026-05-11

| 項目 | 內容 |
|:----|:----|
| 位置 | `worker-review.ps1:80-86` Step 2 prompt |
| 原文 | 「CRITICAL — Tasks Backfill Verification (Bug #10 fix)」+ 「MUST literally invoke Skill tool」+ SUCCESS CRITERION |
| 問題 | 缺**「review ≠ rubber-stamp」**語意提示 — review agent 可能誤認為 dev 已 backfilled 就跳過 |
| **修補 (2026-05-11)** | 改為 「**AUDIT MODE**」+ 「REVIEW ≠ RUBBER-STAMP: dev 已 backfilled ≠ review 跳過; review **必獨立重新逐項 file:line cross-verify** dev ✅ markers」+ 「**若 dev ✅ 與 review file:line audit 不一致 → 標 ⬜ + 加 finding** (這是 review 的核心審查任務,非走過場)」 |
| 對齊 | User 「review 仍然要再次進行逐一驗證比對才對 tasks-backfill-verify,**這才是審查的重點**」原則 |

---

## 8. 嚴重度分級

| 級別 | 缺陷 | 處理優先級 | 狀態 |
|:----:|:----|:----|:----:|
| **CRITICAL** | D1 -NoExit + D15 Quad-Confirm Layer 1 | P0 — 影響每 phase 推進 | ✅ FIXED 2026-05-11 |
| **CRITICAL** | D19 multi-signal 違反 review 審查獨立性 | P0 — 失去 audit 能力 | ✅ FIXED 2026-05-11 |
| **HIGH** | D3 claude session hang + D14 progress signal 缺 | P1 — 偶發但成本高 | open |
| **MEDIUM** | D2 enabled flag + D5 NEEDS_APPROVAL + D6 multi-signal false positive (D19 解決後 D6 縮窄至 dev 階段) + D17 hook chain order check | P2 — 邊界場景 | open |
| **LOW** | D4/D7/D8/D9/D10/D11/D12/D13/D16/D18/D20/D21 | P3 — cosmetic / 防禦性增強 | D21 ✅ FIXED 2026-05-11;餘 open |

---

## 9. 建議修補路徑(P0 優先)

### 9.1 D1+D15 修補方案 A:worker.ps1 結尾自殺

```powershell
# worker-{phase}.ps1 line ~160 (Update-Tracker 之後,exit 之前)
Write-PpLog "[$Phase] Worker exit" "SUCCESS"
Stop-Process -Id $PID -Force   # 自殺 — defeat -NoExit
exit 0  # unreachable but kept for safety
```

優點:
- 對齊 SKILL ack-handshake.md Step 15 「ps1 wrapper exit」設計意圖
- 不破壞 -NoExit 對 debug 觀察的好處
- 修改最小 (3 行 × 3 worker = 3 文件)

### 9.2 D1+D15 修補方案 B:移除 orchestrator -NoExit

```powershell
# orchestrator.ps1 line 244-253 移除 '-NoExit',
$workerProc = Start-Process powershell -ArgumentList @(
    '-ExecutionPolicy','Bypass',
    '-File',$workerScript,
    ...
) -PassThru -WindowStyle Normal
```

優點: 1 行刪除
缺點: 破壞 debug 觀察用途

### 9.3 D14 progress signal (P1)

```powershell
# 加 progress-watch.ps1 (orchestrator side):
# - 監聽 logs/main-otel-{ts}.jsonl claude OTel token stream
# - 若 N 分鐘 (e.g., 5min) 無 token 增長 → mark stall → kill + retry
```

---

## 10. 相關 Rules

| Rule | 對應缺陷 |
|:----|:----|
| `pipeline-handshake-protocol.md` v1.0.0 | F1-F14 + IPC schema (本 file D1-D18 延伸) |
| ~~`parallel-worker-identity.md`~~ [RETIRED] → `parallel-batch-conflict-isolation.md` SUPREME + `scripts/shared-utils.ps1` T5.5 | 4-Tuple Identity Quad-Confirm (D9 WMI fail 場景) |
| `parallel-batch-conflict-isolation.md` SUPREME | Multi-Story batch 5 軸 Conflict Matrix (D8 single-Story 漏防護) |
| `encoding-discipline.md` SUPREME | PS 5.1 繁中 UTF-8 (D2 BOM issue 潛在) |
| `mcp-payload-discipline.md` SUPREME | MCP write 紀律 (Invoke-PhycoolMcpSafe) |

---

## 11. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.2.0** | **2026-07-25** | **Party Mode 冪等性分析裁示落地**:§2 元件職責矩陣 3 行(worker-create/dev/review)model 描述改「角色語言」(現行 Opus/Sonnet 分層)+ 明確指向 `pipeline-config.json phaseModelMapping` SSoT,取代重述字面版本字串——避免下次 Anthropic 更名時本表又要同步改。§7.3 D3 觸發欄維持不動(歷史觀察紀錄,非現況描述)。配套新增獨立唯讀偵測腳本 `scripts/audit-model-string-drift.cjs`(不修改本檔涵蓋範圍之外的邏輯)。 |
| **1.1.0** | **2026-07-25** | **健檢修復 stale model 標示(獨立於 skill-builder Mode B 本次 model rename 主軸,屬順帶發現的既有漂移)**:§2 元件職責矩陣 `worker-create.ps1` / `worker-review.ps1` 「Opus 4.7 max」→ **「Opus 5 max」**(current-state 描述,對齊現行 phaseModelMapping;已跨 2 世代未同步 4.7→4.8→5);`worker-dev.ps1` 「Sonnet 4.6 default」→ **「Sonnet 5 max」**(2026-07-19 使用者裁定 dev 全階段改 sonnet-5 max,此檔未曾同步)。§7.3 D3 「觸發」欄**刻意不改** Opus 4.7 字面(該欄是特定歷史 session 的觀察紀錄,非現狀描述)—— 僅追加現況註記「現行 code-review SSoT 已改 claude-opus-5[1m],是否仍有此風險未複驗」,避免虛構「已在 Opus 5 觀察到 stall」的不實陳述(對齊 Anti-Speculation Mandate)。觸發:party-to-pipeline v5.9.0 model rename 健檢時發現本檔落後 2 世代。 |
| **1.0.0** | **2026-05-11** | 初版建立。Sleep mode 推進 11 Story 觀察提煉 18 缺陷 (D1-D18)。對齊既有 architecture-and-scripts.md + ack-handshake.md + orchestrator-awareness.md L3 progressive disclosure。觸發事件:User ultrathink 要求深挖架構原理 + 缺陷邊界。修補路徑優先 P0 (D1+D15 -NoExit 自殺方案 A)。 |
