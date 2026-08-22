# Orchestrator Awareness (party-to-pipeline v5.1.0 L3)

> §12 5 軸環境感知 + §13 中控視角 SSoT + §14 動態決策狀態機 + §15 Effort 機制 + §16 Ctrl-Channel 跨軌溝通 + Phase 5 動態排程 + Skill 同步策略。
>
> **(2026-08-03 v5.24.0)** 本檔內凡以 `orchestrator.ps1` 委派為前提的段落(§13 表 Phase 4 欄 / §14 狀態機)屬 **E1 路徑,已 🔒 FROZEN**(理由與證據見 [ack-handshake.md §8](ack-handshake.md));5 軸環境感知、SPAWN_DELAY(F13)、Effort 機制、Ctrl-Channel、動態排程等中控概念對 E2 現行路徑仍適用。

---

## §12 中控環境感知五軸矩陣 SSoT (v4.1.0)

> 來源:Phase 2 AC-1。對齊 ADR-GOVERNANCE-001 §3 根因 #1 規範盲點 + Memory id=4024 7 軸路線圖收斂後的 5 軸版本。

中控(主對話視窗 orchestrator.ps1)需感知的 5 軸環境基礎設施:

### 12.1 軸 1 Hook (Pipeline 相關 7 hooks)

| Hook | 觸發時機 | 用途 | file:line |
|:----|:----|:----|:----|
| `pipeline-heartbeat.js` | Stop | 寫 heartbeat-{StoryId}-{phase}.txt(8min stale 偵測) | `.claude/hooks/pipeline-heartbeat.js` |
| `stop-report.ps1` (v4.0.0 新建) | Stop 第 2 順位 | 蒐集 evidence + 原子寫 status-{phase}.json | `.claude/skills/party-to-pipeline/scripts/stop-report.ps1` |
| `pipeline-auto-exit.js` | Stop | 偵測 phase target → 寫 signal file (legacy v1 路徑) | `.claude/hooks/pipeline-auto-exit.js:60-86` |
| `pipeline-window-control/scripts/pipeline-notify.js` | Stop | 寫 pipeline-notify.json 供中控讀 | `.claude/skills/pipeline-window-control/scripts/pipeline-notify.js` |
| `pipeline-permission.js` | PermissionRequest | 子視窗白名單工具自動授權 | `.claude/hooks/pipeline-permission.js` |
| `subagent-context-inject.js` | SubagentStart | Phase 4.5 god node Top-3 + agent-memory 注入 | `.claude/hooks/subagent-context-inject.js:158-173` |
| `session-recovery.js` | SessionStart(compact/resume) | 讀 pipeline_checkpoints + stale 警告 (>30min) | `.claude/hooks/session-recovery.js` |

`.claude/hooks/` 共 14+ 個 .js hooks(全 list 見 settings.json hook chain registry)。

### 12.2 軸 2 Rule (13+ SUPREME)

| Rule | 中控感知規範 |
|:----|:----|
| `constitutional-standard.md` | Code/Backend Contract/Depth-First/External Source Citation Mandate |
| ~~`dual-repo-push-discipline.md`~~ | **retired 2026-05-16**(整合至 single-engine-mode.md §FROZEN Future-Unfreeze SOP)|
| ~~`toolkit-mirror-immediate-sync.md`~~ | **retired 2026-05-05**(toolkit sync FROZEN per single-engine-mode.md)|
| `capability-integration-mandate.md` | MCP/Schema/Hook 新增 5 步整合 + §6.5 Sync-Gate 6 步序列 |
| `skill-creation-discipline.md` | Skill cap (47/28/75) + 新建必檢 3 題 |
| `skill-tool-invocation-mandatory.md` | Skill 升版字面 Skill tool 調用 |
| `skill-sync-gate.md` | dev-story/code-review Skill 與 code 同步閘門 |
| `skill-idd-sync-gate.md` | IDD forbidden_changes 保護 |
| `pipeline-handshake-protocol.md` (v4.0.0) | IPC schema + 16 步順序 + 14 條 FORBIDDEN |
| `deployment-doc-freshness.md` | 部屬指南新鮮度 10 觸發條件 |
| `subagent-blocked-tools.md` | 子代理 3-Tier Boundary + Self-Check 3 題 |
| `verification-protocol.md` | 跨檔變更 5 步驗證 |
| `db-first-no-md-mirror.md` | Story 結構化資料 DB-first SSoT |
| `parallel-batch-conflict-isolation.md` (v5.0.0) | 5 軸 Conflict Matrix + 4-Layer Defense |
| ~~`parallel-worker-identity.md`~~ [RETIRED → merged into `parallel-batch-conflict-isolation.md` + `scripts/shared-utils.ps1`] | 4-Tuple Identity Quad-Confirm |
| `encoding-discipline.md` (v5.0.0) | PS 5.1 繁中 UTF-8 防雷 |
| `mcp-payload-discipline.md` (v5.0.0) | MCP write 紀律 + Invoke-PhycoolMcpSafe |

### 12.3 軸 3 MCP (36 phycool-context tools,2026-07-28 實測)

| Category | Tools |
|:----|:----|
| Search (11) | search_context / search_tech / search_symbols / search_god_nodes / search_conversations / search_documents / search_stories / search_debt / search_glossary / search_intentional_decisions / semantic_search |
| Get (6) | get_symbol_context / get_session_detail / get_intentional_decision / get_patterns / list_sessions / trace_context |
| Add (4) | add_context / add_tech / add_cr_issue / add_intentional_decision |
| Upsert (1) | upsert_benchmark |
| Workflow (1) | log_workflow |
| Verify (1) | verify_intentional_annotations |
| Instinct(ECC WIP,4) | add_instinct / search_instincts / decay_instinct / promote_instinct |
| **Worker Protocol(CAS,epic-whp,4)** | search_worker_runs / ack_worker_run / gate_worker_run / add_worker_message |
| **Ctrl-Channel(CAS,epic-ccb,4)** | post_ctrl_message / read_ctrl_messages / close_ctrl_thread / update_ctrl_board |

> 完整 SSoT: `.context-db/server.js` `ListTools` 陣列(36 個,以實查為準)。逐 tool 欄位 / enum / CAS 語意見 `phycool-mcp-discipline/references/mcp-tools-cheatsheet.md`。

### 12.4 軸 4 Signal/Checkpoint

| Signal | 用途 | 路徑 |
|:----|:----|:----|
| **(v4.0.0)** `.claude/ipc/{StoryId}__{Timestamp}/{task,status,ack}-{phase}.json` | ACK Handshake 三 file IPC | 三段唯一鍵 |
| **(v4.0.0)** `logs/party-pipeline-tracker.json` | Worker PID + closed_at tracker | shared-utils.ps1 維護 |
| **(legacy)** `logs/pipeline-active.json` | claude-launcher v1 PID tracker | story-pipeline-interactive.ps1:1041-1061 |
| **(legacy)** `logs/pipeline-signal-{StoryId}-{phase}-{ts}.done` | claude-launcher v1 signal file | `$env:PIPELINE_SIGNAL_FILE` |
| `pipeline_checkpoints` (DB) | PreCompact 自動 snapshot | `.context-db/scripts/pipeline-checkpoint.js` |
| `logs/heartbeat-{StoryId}-{phase}.txt` | 8min stale 偵測 | pipeline-heartbeat.js |
| `logs/pipeline-auto-exit.log` | 診斷紀錄 | pipeline-auto-exit.js:158-173 |
| `logs/party-pipeline-stop-report.log` | (v4.0.0) Stop hook 診斷 | stop-report.ps1 |

### 12.5 軸 5 State Machine (7 狀態)

詳 §14 狀態機 ASCII 圖。

---

## §13 中控視角整體 SSoT — 13+ SUPREME × 中控感知行為對照表 (v4.1.0)

> 來源:Phase 2 AC-2。讓新對話 cold-start 拿到完整中控 mental model。

| Rule (SUPREME) | 中控 Phase 1 (Party Mode) | Phase 2 (Build Story) | Phase 4 (委派 Pipeline) | Phase 5+ (Watch / Close) |
|:----|:----|:----|:----|:----|
| ~~`dual-repo-push-discipline`~~ | — | — | — | **retired 2026-05-16**(整合至 single-engine-mode §FROZEN Future-Unfreeze SOP)|
| ~~`toolkit-mirror-immediate-sync`~~ | — | — | — | **retired 2026-05-05**(toolkit sync FROZEN per single-engine-mode)|
| `capability-integration-mandate` | — | Story 涉 MCP/Schema/Hook → 5 步整合 + Sync-Gate 6 步 | 同 | 同 |
| `skill-creation-discipline` | Mode A 討論 Story 建議涉 Skill 必先 §3 3 題 | 不新建 Skill,只升版 | — | — |
| `skill-tool-invocation-mandatory` | — | upsert-story 後若涉 Skill → 字面 Skill tool 調用 | — | (worker-review.ps1 強制) |
| `skill-sync-gate` | — | — | — | dev-story/code-review 階段強制 |
| `skill-idd-sync-gate` | — | upsert AC 不可觸 IDD forbidden_changes | — | code-review 階段檢查 |
| `pipeline-handshake-protocol` | — | — | (E1 FROZEN)orchestrator.ps1 IPC + 三重 confirm;現行 = DB 閉環(rule §3.6-§3.10 + [ack-handshake.md](ack-handshake.md)) | 同 |
| `constitutional-standard` | Party Mode 討論 ≤ 2-3 file:line evidence | upsert-story DB-first(對齊 db-first) | — | — |
| `deployment-doc-freshness` | — | 1.專案部屬必讀/ 對應 deep-dive 同步 | — | — |
| `subagent-blocked-tools` | — | — | Spawn subagent 限 3 並發 / depth ≤ 2 | 同 |
| `verification-protocol` | — | upsert-story 7 維度 cross-validation | — | — |
| `db-first-no-md-mirror` | — | upsert-story 不產 .md 鏡像 | — | — |

---

## §14 中控動態決策狀態機 (v4.1.0)

> 來源:Phase 2 AC-4。orchestrator.ps1 + worker scripts 隱含此狀態機。

### 14.1 7 狀態 ASCII 圖

```
                  ┌──────────┐
                  │  IDLE    │ orchestrator 待委派 / 上一階段已 closed
                  └────┬─────┘
                       │ Start-Process worker-{phase}.ps1
                       ▼
                  ┌──────────┐
              ┌──┤ DISPATCHED│ worker spawned + tracker(running)
              │   └────┬─────┘
              │        │ Stop hook 寫 status-{phase}.json
              │        ▼
              │   ┌──────────┐
              │   │ COMPLETED│ status.status=completed + DB phase target + tasks ✅
              │   └────┬─────┘
              │        │ 中控驗 + 寫 ack(ok=true) + 等子視窗倒數 5s 關閉
              │        │ + Wait-WindowClosed (PID + tracker.closed_at + ack mtime)
              │        ▼
              │   返回 IDLE 進下一階段
              │
              │   ┌──────────┐
              ├──┤ TIMEOUT  │ Wait-StatusFile 1800s 無 status (worker 卡死)
              │   └────┬─────┘
              │        │ 中控檢 DB target → 是 → 合成 partial → ack 流程
              │        │            否 → kill worker + retry (≤MaxRetries)
              │
              │   ┌─────────────────┐
              ├──┤ POSSIBLY_CRASHED│ PID 死亡但 status.json 不存在
              │   └────────┬────────┘
              │            │ 中控檢 DB / file artifacts (FALLBACK A-E)
              │            │ → 是 → 合成 status → ack 流程
              │            │ 否 → mark failed + retry
              │
              │   ┌──────────┐
              ├──┤STATE_DRIFT│ DB phase target 達成但 IPC artifacts 不一致
              │   └────┬─────┘
              │        │ 中控走 file-based fallback (pipeline-auto-exit.js Layer A-E)
              │
              │   ┌────────────────┐
              └──┤ NEEDS_APPROVAL │ 子視窗回報 [NEEDS-APPROVAL: ...]
                  └────────┬───────┘
                           │ Tier 2 升級對齊 subagent-blocked-tools.md Q1-Q3
                           │ (new-oauth / new-pii / new-external-api)
                           ▼
                  中控決策 → 寫指示 → worker 收 ack → resume / abort
```

### 14.2 狀態觸發條件 + 中控行為對照表

| 狀態 | 觸發條件 | 中控行為 | 監控 channel |
|:----|:----|:----|:----|
| IDLE | orchestrator 啟動 / phase done after Wait-WindowClosed | Clear-IpcStage → Write-TaskFile → Start-Process | tracker.status=closed |
| DISPATCHED | Start-Process 後 + tracker.status=running | Wait-StatusFile (1800s) | tracker / heartbeat |
| COMPLETED | status.status=completed AND DB target AND tasks ✅ (dev/review) | Write-AckFile (ok=true) → Wait-WindowClosed | status.json + DB + ack mtime |
| TIMEOUT | Wait-StatusFile 1800s 無 status | 檢 DB target → 合成 partial 或 retry | DB stories.status |
| POSSIBLY_CRASHED | PID 死亡 + 無 status | FALLBACK A-E (report file / tracking mtime / DB direct) | pipeline-auto-exit.js fallback |
| STATE_DRIFT | DB target 達成但 status missing | file-based fallback (legacy Layer A-E) | pipeline-auto-exit.js:88-155 |
| NEEDS_APPROVAL | 子視窗 stderr [NEEDS-APPROVAL: tag] | 中控人工決策 → 寫 ack(message) | log files |

### 14.3 STATE_DRIFT 偵測規則(v4.0.0 退化路徑)

```
若 90s timeout (Wait-StatusFile)未收到 status:
  → 檢 DB stories.status
  → 若到 phase target (ready-for-dev / review / done):
      → 合成 partial status with evidence={ db_status, fallback: true, synthesized_by: 'orchestrator timeout' }
      → 進入 ACK 流程 (中控驗 → 寫 ack)
  → 否則 STATE_DRIFT → 進 retry 或 mark failed
```

對齊 R3 對策 — bounded wait + 退化為 signal-fallback。

---

## §15 Effort 機制現狀 (Phase 9 Spike Result, 2026-05-04)

> **來源**: Phase 3 (b) Spike 驗證。對齊 `constitutional-standard.md::External Source Citation Mandate` (Fetched 2026-05-04 from `code.claude.com/docs/en/settings`)。

### 15.1 官方 docs 現狀

[Source: https://code.claude.com/docs/en/settings | Fetched 2026-05-04]

| 機制 | 官方 documented? | 範圍 | 持久化 |
|:----|:----:|:----|:----:|
| `settings.json::effortLevel` | ✅ | global / session | ✅ permanent |
| `/effort {level}` slash command | ✅ | session-only | ❌ |
| `--effort max` CLI flag | ⚠️ 部分版本(v2.1.113 GitHub Issue #50099 反映 ENV/CLI 不被 respect)| session | ❌ |
| `CLAUDE_CODE_EFFORT_LEVEL` ENV var | ⚠️ 第三方 blog 提及但**官方 docs 未 documented** | session | session |
| `CLAUDE_CODE_EFFORT` ENV var | ❌ **不存在**(本字面從未官方 documented) | — | — |

[Source: https://github.com/anthropics/claude-code/issues/50099 | Fetched 2026-05-04]

### 15.2 v4.0.0 worker scripts 既有實作 (修補前)

worker-create.ps1 / worker-dev.ps1 / worker-review.ps1 line 81 設 `$env:CLAUDE_CODE_EFFORT = $effort` — **dead code**(名稱錯 + 即使正確版本也不被 respect)。

### 15.3 v4.1.0 修補策略 — System Prompt Directive 為唯一 reliable 機制

```powershell
# worker-{phase}.ps1 修補後
$env:CLAUDE_CODE_EFFORT_LEVEL = $effort   # 機會性嘗試 (部分版本 respect)
$env:CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'

# 主機制: system prompt directive (對齊 BR-MR-03 既有設計)
$effortDirective = if ($effort -eq 'max') {
    "`n本任務必用最大思考深度 ultrathink"
} else { '' }
$userTask = $userTask + $effortDirective
```

對齊 story-pipeline-interactive.ps1:845 既有 `$effortDirective` 範式(BUG C v3 修補時引入,既有 1 年 production reliable)。

### 15.4 FORBIDDEN

- ❌ 純依賴 ENV var 機制(不 reliable)
- ❌ 不注入 system prompt directive(等於沒設 effort)
- ❌ 用錯名稱 `CLAUDE_CODE_EFFORT`(應為 `CLAUDE_CODE_EFFORT_LEVEL`,但即使對也不 reliable)

### 15.5 監控 + 未來

若官方未來補完 ENV var 支援(GitHub Issue #50099 fix),v4.x 可移除 directive fallback 改純 ENV。當前 (2026-05-04) 雙保險策略最 robust。

---

## §16 Ctrl-Channel 跨軌溝通(epic-ccb,2026-07-28)

> `ccb-1-db-mcp-import` 落地。與 §3(IPC task/status/ack 三檔)是**不同範疇**,勿混淆:

| | IPC Handshake(§3-§4) | Ctrl-Channel(本節) |
|:---|:---|:---|
| 溝通對象 | **同一 Story** 內中控 ↔ 子視窗(短生命週期,單一 phase 執行期間) | **跨軌**(前台軌 / 後台軌 / 中控)之間長生命週期非同步討論,與特定 Story phase 無關 |
| 載體 | `.claude/ipc/{StoryId}__{Timestamp}/{task,status,ack}-{phase}.json` | `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 4 表 |
| 存取方式 | Stop hook + orchestrator 專管(agent 禁手寫,F13) | 4 個 MCP tool:`post_ctrl_message`/`read_ctrl_messages`/`close_ctrl_thread`/`update_ctrl_board` |
| 完整規範 | 本檔 §3-§4 | `phycool-ctrl-channel` skill |

**背景**:過去跨軌溝通靠 2 個手寫 `.md` 聊天室(`claude token減量策略研究分析/AGENT溝通管道/非同步聊天訊息討論專區.md` + `docs/tracking/active/phycool資訊校正任務/非同步聊天訊息討論專區-校正區.md`)+ 15 個封存檔,同讀同寫 race + 簽收靠人眼掃。已於 2026-07-28 對帳 PASS 後**冪等遷入 DB 並貼凍結標頭轉唯讀**,兩檔今後**禁止新增留言**。

**orchestrator / 子視窗 agent 須知**:
1. 需要通知另一軌(如「Migration 窗口誰持有」「某話題是否已結束」)時,呼叫 4 個 MCP tool,**不得**再對兩個已凍結 `.md` 檔 Edit/Write(見 `phycool-ctrl-channel` skill FORBIDDEN)。
2. `pipeline_notes` 欄位(Story DB,中控注入的並行狀況通告,F5 read-only)與 Ctrl-Channel 是互補不同機制 —— `pipeline_notes` 是「派工當下」單向快照,Ctrl-Channel 是雙向、可回覆、可簽收的持續對話。
3. 完整使用情境 + FORBIDDEN + MCP 不可用時的 Fallback(含 `import-ctrl-channel.js --report` re-import 校驗手段)見 `phycool-ctrl-channel` skill;逐 tool 欄位表見 `phycool-mcp-discipline/references/mcp-tools-cheatsheet.md` §Ctrl-Channel。

---

## Phase 5 動態排程模式 (批次 Pipeline)

> 來源:2026-03-23 Epic FIX6 實戰驗證,比固定批次快 ~40%

### 核心概念

固定批次 (Batch N 全完成 → 啟動 N+1) 效率低。動態排程改為:**併行上限 3,任一 slot 空出即從佇列補位**。

### 排程規則

| 規則 | 說明 |
|------|------|
| 併行上限 | 3 個 Story 同時執行 |
| 衝突迴避 | 修改同檔案的 Story 禁止同批 |
| 依賴順序 | 被依賴項必須先完成 |
| 優先級 | P0 > P1 > P2 > P3;同優先級 S > M (小的先) |
| 失敗重試 | dev-story 超時 → 檢查 git diff → upsert review → SkipDev 重試 |
| 補位判斷 | slot 空出時掃描佇列找第一個無衝突 Story |

### 啟動指令模板 (v4.0.0)

```bash
# 每個 Story 獨立 run_in_background
powershell -Command "Start-Sleep {N*10}; Set-Location '{ProjectRoot}'; & './.claude/skills/party-to-pipeline/scripts/orchestrator.ps1' -StoryId '{STORY_ID}'"
```

> v5.0.0 進階:`-StoryIds A,B,C` Multi-Story batch 自動跑 Conflict Matrix + Greedy Schedule-Batches,內建衝突迴避。

### ⚠️ SPAWN_DELAY=10s 強制間隔 (2026-05-11 補強,對齊 aios-scheduler / phycool-scheduler)

**Rule (SUPREME 等級)**: 任何並行 dispatch 多個 orchestrator 子視窗時,**相鄰啟動間隔 ≥ 10 秒**。

**理由**: Anthropic API rate limit / bot detection 對短時間多次 claude CLI 啟動敏感,**間隔過短風險 = 帳號 ban**。實測案例:2026-05-11 並行 Story A + D 啟動間隔 1 秒 (15:39:04 vs 15:39:05) → 違規 (rule_violation id=4072)。

**機械守護**: 模板中的 `Start-Sleep {N*10}` 必填,N=0 (第一個) / N=1 (第二個延遲 10s) / N=2 (第三個延遲 20s)...

**正確並行範例 (3 Story)**:
```powershell
# Story 1 — 立即
Start-Sleep 0; & orchestrator.ps1 -StoryId 'A'
# Story 2 — 延遲 10s
Start-Sleep 10; & orchestrator.ps1 -StoryId 'B'
# Story 3 — 延遲 20s
Start-Sleep 20; & orchestrator.ps1 -StoryId 'C'
```

**錯誤模式 (禁止)**:
- ❌ 連續 2 次 `Bash run_in_background` 不帶 `Start-Sleep` (本 session 2026-05-11 違規根因)
- ❌ 依賴 Bash 工具 implicit serialization (Bash 平行 invoke 是 0.x 秒間隔)
- ❌ 用 `&` background 同時啟動多個 worker

**FORBIDDEN 對齊**: 違反 SPAWN_DELAY = 違反 aios-scheduler SUPREME 規範,記 rule_violation high severity。

---

## Skill 同步策略

> 來源:Epic PCPT-R (2026-03-30) 實戰驗證

| 方案 | 適用 |
|:-----|:----|
| **B (中控統一更新,預設)** | 所有子視窗完成 → 中控批次 Skill 更新;適用依賴鏈完整 + 同域 Epic |
| **C (混合)** | 模式變更時:Story CR 完成立即更新 Skill,再啟下一批 |
| ~~A (子視窗即時更新)~~ | ❌ 不推薦 (Git 衝突 + context 浪費 + 不一致風險) |
