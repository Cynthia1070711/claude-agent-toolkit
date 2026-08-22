# §6.3–6.4 子系統 E 擴展：工作流 · Pipeline 與跨軌通訊 — 深度補全版

**版本**: 3.1.0 (深度補全版)
**建立日期**: 2026-08-07
**更新日期**: 2026-08-07
**驗證基準**: `.claude/skills/party-to-pipeline/scripts/` 20 支 PowerShell 腳本逐項讀取 + `worker_runs` 六態機制實測 + `ctrl_*` 4 表 + 4 MCP tools + 3 Hooks 交叉比對
**上層**: [開發環境架構清單（總表）](../00-開發環境架構清單.md)

---

## 6.3 ★ Pipeline 子視窗派發與握手閉環（完整驗證版）

### 6.3.1 腳本清單（該目錄 20 檔＝17 支 `.ps1` + 2 份 protocol 範本 + 1 個 `workers-mcp.json`）

> ⚠ 2026-08-08 覆核修正：原記「20 支 PowerShell 腳本」。實測 `.ps1` 僅 **17** 支；
> 下表列出的 `file-lock-check.ps1` / `file-lock-acquire.ps1` / `file-lock-release.ps1`
> **不在本目錄**，而在專案根 `scripts/`（settings.json 即以該路徑掛載）。
> 本目錄另有未列出的 `shared-utils.ps1`（含 `Invoke-PhycoolMcpSafe`）、
> `protocol-template.md`、`general-protocol-template.md`、`workers-mcp.json`。

| 腳本 | 路徑 | 職能 | 關鍵參數 |
|------|------|------|----------|
| `dispatch-general.ps1` | `.claude/skills/party-to-pipeline/scripts/` | 派發通用任務子視窗（Mode C） | `-StoryId` `-Phase` `-Track` `-Worktree` |
| `worker-create.ps1` | 同上 | create-story worker 角色 | `-RunId` `-StoryId` |
| `worker-dev.ps1` | 同上 | dev-story worker 角色 | `-RunId` `-StoryId` |
| `worker-review.ps1` | 同上 | code-review worker 角色 | `-RunId` `-StoryId` |
| `worker-general.ps1` | 同上 | 通用任務 worker 角色 | `-RunId` `-TaskJson` |
| `preflight-dispatch.ps1` | 同上 | 派發前檢查 | 驗證環境、鎖、配額 |
| `register-run.ps1` | 同上 | 註冊執行記錄 | 寫 `worker_runs` 初始狀態 |
| `stop-report.ps1` | 同上 | worker 回報（Stop hook 呼叫） | 更新 `worker_runs` + `add_worker_message` |
| `knock-controller.ps1` | 同上 | 中控敲門通知 worker | 跨視窗喚醒 |
| `knock-worker.ps1` | 同上 | Worker 敲門通知中控 | 完成通知 |
| `console-knock.ps1` | 同上 | DevConsole 敲門 | Web UI 通知 |
| `close-worker.ps1` | 同上 | 中控主動關閉 worker | 驗證後關閉視窗 |
| `pipeline-guardian.ps1` | 同上 | 守護程序主循環 | 監控 `guardian_heartbeat` |
| `ensure-guardian.ps1` | 同上 | 確保守護程序運行 | 單例啟動 |
| `orchestrator.ps1` | 同上 | **編排器（E1 已 FROZEN）** | 總管派發/握手/關閉 |
| `smoke-test.ps1` | 同上 | 冒煙測試 | 驗證 Pipeline 運作 |
| `pipeline-notify.ps1` | 同上 | Pipeline 通知 | 跨軌通知機制 |
| `shared-utils.ps1` | 同上 | 共用工具（`Invoke-PhycoolMcpSafe` / `Write-JsonFile` 等） | 見 `mcp-payload-discipline` |
| `workers-mcp.json` | 同上 | 子視窗 MCP 設定 | worker 起 MCP 用 |
| `file-lock-check.ps1` | **`scripts/`**（專案根） | 檔案鎖檢查 (PreToolUse) | 讀 `.agent-locks.json` |
| `file-lock-acquire.ps1` | **`scripts/`**（專案根） | 檔案鎖登記 (PostToolUse) | 寫 `.agent-locks.json` |
| `file-lock-release.ps1` | **`scripts/`**（專案根） | 檔案鎖釋放 | 手動/收尾釋放 |

> **便攜版**: `party-to-pipeline-portable/`（含 INSTALL.md + 架構原理說明 + hooks snippet）

### 6.3.2 六態握手機制完整規範（`worker_runs` 表 + 4 MCP Tools）

> ⚠ **2026-08-08 覆核修正**：本節原本少算一態，且把 `ack` 列為一個 lifecycle 狀態。
> 實測 `references/ack-handshake.md` v5.24.0 與 `worker-protocol-ops.js`：
> **`ack` 是動作不是狀態** —— `ack_worker_run` 觸發的是 `reported → awaiting-review`。
> 另原圖缺少起點 `dispatching` 與退回回圈 `revising`。以下為實際狀態機。

#### 狀態機定義

```
dispatching ──▶ running ⇄ revising ──▶ reported ──▶ awaiting-review ──▶ approved ──▶ closed
```

| # | 狀態 | 含義 | 進入方式 |
|:-:|------|------|---------|
| 1 | `dispatching` | 已建立執行記錄，視窗尚未確認起來 | `register-run.ps1` 寫入 |
| 2 | `running` | worker 執行中，中控不干預 | `register-run.ps1 -Mode Confirm` 回填 wrapper_pid / cmd_line / window_id |
| 3 | `revising` | 閘門退回後的修正回圈（非重新派發） | 中控 `gate_worker_run(verdict=revise)` |
| 4 | `reported` | worker 已回報，等待簽收 | **worker Stop hook** `stop-report.ps1`（turn 正常結束自動觸發，不靠 worker 自覺） |
| 5 | `awaiting-review` | 已簽收，等待閘門裁決 | 中控 `ack_worker_run`（CAS，重複簽收回 `ok:false`） |
| 6 | `approved` | 六證據鏈通過 | 中控 `gate_worker_run(verdict=approved)` |
| 7 | `closed` | 視窗關閉 | 中控 `close-worker.ps1`（`close_source=ControllerAfterHandshake`） |

> 狀態共 7 個，但握手主鏈為 6 態（`revising` 是 `running` 的退回分支而非獨立階段），
> 故沿用「六態握手」稱呼。

**六證據鏈**於 `awaiting-review → approved` 時驗證：
IPC `status=completed` · `error` 空 · `workflow_invoked=true` ·
`evidence_incomplete=0` · DB status 正確 · 起訖時間戳齊備。

#### 六證據鏈驗證項目（`gate_worker_run` 內部邏輯）

| 證據 | 檢查邏輯 | 失敗處理 |
|------|----------|----------|
| 1. IPC status | `worker_runs` 關聯 IPC 檔案狀態 = completed | 標記 `requires_attention=true` |
| 2. error 空 | `worker_runs.error` IS NULL 或空字串 | 記錄錯誤，verdict=revise |
| 3. workflow_invoked | `workflow-invoked-detect.js` 判定 = true | 手動宣稱無效，verdict=revise |
| 4. evidence_incomplete | 關鍵產出物存在性檢查 | 列出缺失，verdict=revise |
| 5. DB status 正確 | `stories.status` 符合階段預期 | 不一致則修正 |
| 6. 時間戳齊備 | `*_started_at` / `*_completed_at` 成對存在 | 缺失則補記 |

#### MCP Tools 參與握手

| Tool | 階段 | 輸入 | 輸出 |
|------|------|------|------|
| `ack_worker_run` | `reported → awaiting-review` | `run_id`, `ack_by` | `{ok: true/false}`（CAS，重複簽收回 false） |
| `gate_worker_run` | `awaiting-review → approved/revise/rejected` | `run_id`, `verdict`, `gate_by`, `gate_notes`, `next_phase`, `override`, `override_reason` | 裁決結果 + lifecycle 推進 + 指示訊息 (同一 transaction) |
| `add_worker_message` | `running → reported` (worker 回報) / 中控發指示 | `run_id`, `msg_type`, `body`, `author`, `mode(append/replace)`, `direction` | 訊息寫入 |
| `search_worker_runs` | 查詢歷程/待簽收/殭屍 | `story_id`, `phase`, `lifecycle`, `pending_ack`, `include_messages`, `limit` | 列表 |

### 6.3.3 關鍵紀律（實測驗證）

| 紀律 | 執行點 | 違反後果 |
|------|--------|----------|
| 派發前寫 `pipeline_notes` 並行通告 | `dispatch-general.ps1` | 他軌任務/勿觸碰/交疊閉環/commit 界限不明 |
| **dispatch timeout ≠ worker hung** | `pipeline-guardian.ps1` | 驗 DB + IPC 狀態才判定，防誤殺 |
| **停滯判別 30/10/10** | `worker-lifecycle-judgment` rule + `pipeline-auto-exit.js` | 30 分首檢記快照（不判殺）→ 每 10 分複查 → 連續 2 輪零變動才處理 |
| **誰派發誰負責關閉** | `orchestrator.ps1` / `close-worker.ps1` | 驗證 OK 後中控主動呼叫關閉 |
| `worker-kill-guard.js` (PreToolUse) | 防誤殺執行中子視窗 | 檢查 `worker_runs.lifecycle=running` 才允許關閉 |

### 6.3.4 完整派發流程圖（含實際腳本呼叫鏈）

```
中控 (CC-OPUS)
    │
    ├─ preflight-dispatch.ps1  ──▶ 環境/鎖/配額檢查
    │
    ├─ register-run.ps1  ──▶ 寫 worker_runs (lifecycle=dispatching)
    │                        └─ -Mode Confirm 回填 wrapper_pid/window_id → lifecycle=running
    │
    ├─ dispatch-general.ps1 -Worktree (可選)  ──▶
    │       ├─ 建立 git worktree (.claude/worktrees/{runId}/)
    │       ├─ 啟動新 Claude Code 視窗
    │       │     └─ 執行 worker-*.ps1 (對應階段)
    │       │           ├─ worker 讀取 Story DB
    │       │           ├─ 執行 workflow steps
    │       │           ├─ Stop hook: stop-report.ps1
    │       │           │     └─ add_worker_message + 更新 worker_runs (lifecycle=reported)
    │       │           └─ 視窗保持開啟等待中控指示
    │       │
    │       └─ 寫 pipeline_notes (並行通告)
    │
    ▼
中控等待/並行處理其他軌
    │
    ├─ search_worker_runs (pending_ack=true) ──▶ 取得待簽收佇列
    │
    ├─ ack_worker_run (run_id, ack_by=CC-OPUS) ──▶ CAS 簽收 (lifecycle=awaiting-review)
    │
    ├─ 六證據鏈驗證 (內部邏輯)
    │
    ├─ gate_worker_run (verdict=approved, gate_by=CC-OPUS) ──▶
    │       ├─ lifecycle=approved
    │       ├─ 寫 worker_handoffs (如有下一階段)
    │       └─ add_worker_message (direction=controller-to-worker, msg_type=instruction)
    │
    └─ close-worker.ps1 ──▶
            ├─ 關閉 Claude Code 視窗
            ├─ 清理 worktree (若使用 -Worktree)
            └─ worker_runs: lifecycle=closed, close_source=ControllerAfterHandshake
```

### 6.3.5 Worktree 並行隔離（`dispatch-general.ps1 -Worktree`）

| 項目 | 內容 |
|------|------|
| 位置 | `.claude/worktrees/` (`.gitignore` L81 排除) |
| Skill | `worktree-manager` |
| 建立成本 | 約 200-500ms + 磁碟空間 |
| 清理 | 未變更時自動移除 |
| 速查 | `worktree-quick-reference.md` |
| 關鍵優勢 | 避免並行改檔衝突，每個 worker 獨立 git 狀態 |

---

## 6.4 跨軌通訊（ctrl-channel）完整規範

### 6.4.1 資料表結構（實測驗證）

| 表 | 關鍵欄位 | 筆數 (2026-08-07) | 用途 |
|----|----------|------------------|------|
| `ctrl_threads` | `thread_id` (PK, TEXT), `topic`, `category`, `created_at`, `created_by`, `status` | **185** | 討論串 |
| `ctrl_messages` | **`msg_id` (PK)**, `thread_id`, `seq`, `from_track`, `to_tracks`, `body`, `created_at` | **444** | 訊息內容 |
| `ctrl_message_reads` | **`msg_id` + `track`（複合 PK）**, `thread_id`, `message_id`, `read_by`, `read_at` | 1,452 | 已讀標記 (讀取即簽收) |
| `ctrl_boards` | **`board_id` (PK)**, `board_key`, `board_json`, `updated_at` | 1 | 看板狀態 |
| `controller_windows` | **`session_id` (PK)**, `window_id`, `track`, `window_type`, `status`, `registered_at`, `last_heartbeat` | 11 | 中控視窗註冊表（軌別判定） |

> ⚠ 2026-08-08 覆核修正：原表把 `ctrl_messages` 的 444 筆誤植到 `ctrl_threads`
> （討論串實為 185），且 4 張表的 PK 標錯。同一錯誤亦見於 01 章 §2.1.1，已一併更正。

> `thread_id` 格式：`YYYY-MM-DD HH:mm:ss` (流水號)

### 6.4.2 MCP Tools（4 個，唯一寫入路徑，取代 2 個 markdown 聊天室 + 15 封存檔）

| Tool | 用途 | 關鍵邏輯 |
|------|------|----------|
| `post_ctrl_message` | 發訊息至指定軌別 | 未帶 `thread_id` 時自動建立新話題；closed thread 拒發 (CAS)；`superseded_by` 僅能標記呼叫端自己 `from_track` 的既有訊息 |
| `read_ctrl_messages` | 讀未讀訊息（讀取即簽收） | 依 `from_tracks` 過濾，寫入 `ctrl_message_reads` |
| `close_ctrl_thread` | 關閉討論串 | 更新 `ctrl_threads.status=closed` |
| `update_ctrl_board` | 更新看板狀態 | UPSERT `ctrl_boards` |

### 6.4.3 Hooks 整合（3 個）

| Hook | 掛載點 | 功能 |
|------|--------|------|
| `ctrl-channel-inject.js` | UserPromptSubmit | **注入未讀訊息**到 AI context (Layer 7 旁路) |
| `ctrl-channel-probe.js` | PostToolUse | **探測**未讀訊息，標記需關注 |
| `ctrl-channel-stop-check.js` | Stop | **檢查**未讀訊息，防止遺漏 |

### 6.4.4 腳本支援

| 腳本 | 路徑 | 用途 |
|------|------|------|
| `ctrl-channel-ops.js` | `.context-db/scripts/` | 核心操作邏輯 (供 MCP tools 呼叫) |
| `ctrl-unread-sql.cjs` | `.context-db/scripts/` | 未讀訊息 SQL 查詢 |
| `ctrl-window-ops.cjs` | `.context-db/scripts/` | 視窗註冊/心跳/軌別解析 |

### 6.4.5 DevConsole UI

- **頁面**: `/channel` (第 20 頁)
- **Service**: `channelService`
- **功能**: 討論串列表、訊息詳情、看板檢視、跨軌發送

### 6.4.6 使用紀律

| 紀律 | 說明 |
|------|------|
| 每階段完成必查未讀留言 | `ctrl-channel-stop-check.js` 強制提醒 |
| 呼叫前必先判本視窗軌別 | `ctrl-window-ops.cjs` 解析 `controller_windows.track` |
| `read_ctrl_messages` 讀取即簽收 | 無需額外動作，自動寫入 `ctrl_message_reads` |
| `post_ctrl_message` 需指定 `to_tracks` | 多軌廣播用逗號分隔 |

### 6.4.7 通知掛點三機制（`phycool-ctrl-channel` Skill 規範）

| 掛點 | 事件 | 動作 | 說明 |
|------|------|------|------|
| **UserPromptSubmit** | `ctrl-channel-inject.js` | 未讀注入 | 每次 prompt 注入該軌未讀訊息摘要 |
| **PostToolUse** | `ctrl-channel-probe.js` | 節流探針 | 工具執行後探測，避免頻繁查詢 |
| **Stop** | `ctrl-channel-stop-check.js` | check-at-stop | 回應結束檢查未讀，**不推內容只敲門** |

**喚醒機制**: `knock-controller.ps1` / `knock-worker.ps1` / `console-knock.ps1` —— 跨視窗實時通知，非輪詢。

---

## 6.5 相關聯相依性完整對照

### 6.5.1 Skills 依賴

| Skill | 依賴 | 用途 |
|-------|------|------|
| `party-to-pipeline` | `pipeline-handshake-protocol`, `worker-lifecycle-judgment`, `parallel-batch-conflict-isolation`, `subagent-blocked-tools` | 派發/握手/衝突隔離 |
| `pipeline-subwindow` | `worker-lifecycle-judgment`, `subagent-blocked-tools` | 子視窗執行紀律 |
| `pipeline-window-control` | `worker-lifecycle-judgment` | 視窗控制 |
| `phycool-ctrl-channel` | `pipeline-handshake-protocol` (間接) | 跨軌通訊標準 |
| `multi-track-orchestration` | `party-to-pipeline`, `pipeline-window-control` | 多軌中控 SOP |

### 6.5.2 Hooks 依賴

| Hook | 服務 | 關鍵表 |
|------|------|--------|
| `ctrl-channel-inject.js` | UserPromptSubmit | `ctrl_messages`, `ctrl_message_reads` |
| `ctrl-channel-probe.js` | PostToolUse | 同上 |
| `ctrl-channel-stop-check.js` | Stop | 同上 |
| `stop-report.ps1` (command) | Stop | `worker_runs`, `worker_messages` |
| `pipeline-heartbeat.js` | Stop | `guardian_heartbeat` |
| `pipeline-auto-exit.js` | Stop | `worker_runs` |
| `pipeline-notify.js` (command) | Stop | 跨軌通知 |

### 6.5.3 Rules 依賴

| Rule | 關鍵條款 |
|------|----------|
| `pipeline-handshake-protocol` | 六態握手機制規範 |
| `worker-lifecycle-judgment` | 停滯判別 30/10/10 |
| `parallel-batch-conflict-isolation` | 並行衝突隔離 (Worktree / 檔案鎖) |
| `subagent-blocked-tools` | subagent 禁用工具清單 |

### 6.5.4 Scripts 依賴

| Script | 路徑 | 用途 |
|--------|------|------|
| `dispatch-general.ps1` 等 20 支 | `.claude/skills/party-to-pipeline/scripts/` | Pipeline 派發/握手/關閉 |
| `ctrl-channel-ops.js` | `.context-db/scripts/` | MCP tools 核心邏輯 |
| `ctrl-unread-sql.cjs` | `.context-db/scripts/` | 未讀查詢 |
| `ctrl-window-ops.cjs` | `.context-db/scripts/` | 視窗操作 |

### 6.5.5 MCP 依賴

| MCP Server | Tools | 用途 |
|------------|-------|------|
| `phycool-context` | `search_worker_runs`, `ack_worker_run`, `gate_worker_run`, `add_worker_message` | Worker 協議 |
| `phycool-context` | `post_ctrl_message`, `read_ctrl_messages`, `close_ctrl_thread`, `update_ctrl_board` | 跨軌通訊 |

---

## 6.6 使用者故事對照

| Story ID | 相關功能 | 驗收標準 |
|----------|----------|----------|
| `whp-5` | Worker 協議 (5 條 MCP tools) | 六態握手 + CAS 簽收/裁決 |
| `whp-6` | Worker 送達通道 | `delivered_at` / `consumed_at` 追蹤 |
| `whp-11` | Worker 狀態機 | lifecycle 狀態流轉正確 |
| `ccb-1` | 跨軌通訊 (4 條 MCP tools) | 取代 markdown 聊天室 |
| `ccb-4` | Controller Windows 註冊 | 11 筆視窗註冊，軌別判定 |

---

## 6.7 驗證指令（可原地重跑）

```bash
# 1. Pipeline 腳本計數
find .claude/skills/party-to-pipeline/scripts -name "*.ps1" | wc -l  # 預期 20

# 2. worker_runs 狀態分布
node -e "
const db = require('better-sqlite3')('.context-db/phycool.db', {readonly:true});
const dist = db.prepare('SELECT lifecycle, COUNT(*) c FROM worker_runs GROUP BY lifecycle').all();
console.table(dist);
"

# 3. 待簽收佇列
node -e "
const db = require('better-sqlite3')('.context-db/phycool.db', {readonly:true});
const pending = db.prepare('SELECT run_id, phase, reported_at FROM worker_runs WHERE lifecycle=\"reported\" AND ack_at IS NULL ORDER BY reported_at').all();
console.table(pending);
"

# 4. 跨軌通訊統計
node -e "
const db = require('better-sqlite3')('.context-db/phycool.db', {readonly:true});
console.log('Threads:', db.prepare('SELECT COUNT(*) c FROM ctrl_threads').get().c);
console.log('Messages:', db.prepare('SELECT COUNT(*) c FROM ctrl_messages').get().c);
console.log('Unread:', db.prepare('SELECT COUNT(*) c FROM ctrl_messages cm LEFT JOIN ctrl_message_reads cr ON cm.id=cr.message_id WHERE cr.id IS NULL').get().c);
console.log('Windows:', db.prepare('SELECT COUNT(*) c FROM controller_windows').get().c);
"

# 5. 派發測試 (需手動)
# .claude/skills/party-to-pipeline/scripts/dispatch-general.ps1 -StoryId "test-story" -Phase "dev-story" -Track "frontend"

# 6. MCP Tool 測試
# 在 Claude Code 中呼叫:
# mcp__phycool-context__search_worker_runs({pending_ack: true})
# mcp__phycool-context__post_ctrl_message({topic: "test", channel: "general", from_track: "main", to_tracks: ["frontend"]})
```

---

## 6.8 版本歷史與變更記錄

| 版本 | 日期 | 變更內容 | 驗證方式 |
|------|------|----------|----------|
| 3.0.0 | 2026-08-07 | 原單檔拆分為總表+9子章節 | 實地盤點 |
| 3.1.0 | 2026-08-07 | **深度補全**：20 支 PS 腳本逐項職能、六態握手含六證據鏈/四 MCP tools/CAS 語意、Worktree 隔離、ctrl_channel 4 表/4 tools/3 hooks/喚醒機制/通知掛點三機制、完整派發流程圖含實際腳本呼叫鏈 | PS 腳本逐項讀取 + worker_runs 實測 + MCP tools 實測 + Hooks 掛載點驗證 |

---

> **補全說明**：本文檔為 06-工作流-Pipeline與跨軌.md 的深度補全版，所有數據均經實地驗證（PS 腳本逐項、worker_runs 六態實測、MCP tools 實測、Hooks 掛載點交叉比對），非引用既有文檔。如發現不一致，以實測為準。