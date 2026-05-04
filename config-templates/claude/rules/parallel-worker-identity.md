# Parallel Worker Identity — 4-Tuple Identity 機械守護 (SUPREME)

> **嚴重等級**: SUPREME (對齊 parallel-batch-conflict-isolation.md + shared-utils.ps1 4-Tuple)
> **建立**: 2026-05-04 (party-to-pipeline v5.0.0 T3.4 task)

---

## 1. Purpose

並行 worker spawn 時,**Windows PID 重用** 是真實風險 (短時間內 OS 可能 reuse 已死亡 PID)。中控對 worker 的識別、追蹤、kill 操作**必走 4-Tuple Identity**(story_id + ipc_dir + pid + cmd_line),禁止僅憑 PID 判斷生死或執行 kill。

---

## 2. 4-Tuple Identity SSoT

| Tuple | 用途 | 來源 |
|:-:|:-----|:-----|
| **1. story_id** | 跨 worker 隔離主鍵 | task file + tracker entry |
| **2. ipc_dir** | binding to specific worker invocation (含 timestamp 不重複) | `New-IpcDir -StoryId X` |
| **3. pid** | OS-level process identifier | `Start-Process -PassThru` |
| **4. cmd_line** | 防 PID 重用最後防線 (cmdline 含 IpcDir + worker.ps1 path) | `Get-WmiObject Win32_Process` |

**Auxiliary**: `window_title` (`[CREATE/DEV/REVIEW] $StoryId`) 視覺識別 + 人工除錯。

---

## 3. Mandatory Action 矩陣

| 操作 | 必走機制 |
|:-----|:---------|
| Worker spawn 後寫 tracker | `Update-Tracker` 4-Tuple capture (含 cmd_line via WMI) + `WindowTitle` |
| Wait worker close | `Wait-WindowClosed` Quad-Confirm (PID dead + tracker.closed_at + ack 存在 + ack mtime > started_at) |
| Kill worker | `Stop-WorkerSafe` (4-Tuple verify before kill) — 嚴禁直接 `Stop-Process -Id` 跳過 verify |
| 查 tracker entry | `Get-TrackerEntry -StoryId X -Phase Y` |

---

## 4. FORBIDDEN

- ❌ 直接 `Stop-Process -Id $pid` 跳過 `Stop-WorkerSafe` 4-Tuple verify (PID 重用 → 殺到別人 process)
- ❌ Wait close 只看 PID dead 不看 ack mtime > started_at (殘留 ack 誤判)
- ❌ Tracker 不寫 cmd_line / WindowTitle (4-Tuple 不完整)
- ❌ 跨 worker 共用同 IpcDir (違反 Tuple-2 唯一性,timestamp 確保不撞)
- ❌ 中控 dispatch 多 Story 跳過 `parallel-batch-conflict-isolation` Schedule-Batches (HARD_BLOCK 衝突未隔離)

---

## 5. Self-Check (worker spawn 前 / kill 前 3 題)

1. spawn 後立即 `Update-Tracker` 寫完整 4-Tuple 嗎?
2. kill 操作走 `Stop-WorkerSafe` 而非 `Stop-Process -Id`?
3. wait close 用 `Wait-WindowClosed` Quad-Confirm 而非僅 PID check?

---

## 6. Related

- `.claude/rules/parallel-batch-conflict-isolation.md` SUPREME — 5 軸 conflict matrix + 4-Layer Defense (Layer 1-4)
- `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` T1.1 — Update-Tracker 4-Tuple + Stop-WorkerSafe + Wait-WindowClosed Quad-Confirm
- `.claude/skills/party-to-pipeline/scripts/smoke-test.ps1` — Group 6 verify (T1.1-1 to T1.1-10)

---

## 7. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。SUPREME pointer rule,主機械 in shared-utils.ps1 (Update-Tracker / Stop-WorkerSafe / Wait-WindowClosed Quad-Confirm)。對齊 party-to-pipeline v5.0.0 T3.4 task。 |
