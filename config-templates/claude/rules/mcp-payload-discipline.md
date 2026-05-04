# MCP Payload Discipline — phycool-context 寫入紀律 (SUPREME)

> **嚴重等級**: SUPREME (對齊 Constitutional Standard / dual-repo-push-discipline / parallel-batch-conflict-isolation)
> **建立**: 2026-05-04 (party-to-pipeline v5.0.0 T5.8 task)
> **觸發背景**: User ultrathink 補充「記憶庫 MCP 調用等相關 skill 及 phycool-context MCP 及相關 schema 欄位也都要注意,不要每次讀寫記憶庫 DB 都發生式錯的狀況」

---

## 1. Purpose

PhyCool 23 MCP tools (`phycool-context`) + 12+ CLI scripts 寫入 30+ tables 的歷史中,觀察到 6 種「式錯」根因:**必填欄位缺漏 / Enum 違反 / UTC vs UTC+8 timestamp / 重複寫入 / JSON encoding 串接斷裂 / 並行 SQLITE_BUSY**。本 rule 機械強制所有 PowerShell 寫入走 `Invoke-PhycoolMcpSafe` (T5.5 in shared-utils.ps1) + Validation + retry 機制,絕禁直接 add_*/upsert_* 跳過。

---

## 2. Applies When

任何以下動作前必檢查:

- PowerShell 腳本 (party-to-pipeline 6 ps1 / scripts/*.ps1) 寫入 phycool-context MCP
- `.context-db/scripts/upsert-*.js` / `log-*.js` CLI 寫入
- BMAD workflow / Skill / Hook 對 Memory DB 寫入
- 跨 worker 並行 MCP write 場景
- 出現 `Invalid JSON primitive` / `database is locked` / `missing required field` 錯誤

---

## 3. Mandatory Action 矩陣

| 場景 | 必走機制 |
|:-----|:---------|
| PowerShell 寫入 phycool-context MCP | `Invoke-PhycoolMcpSafe -Tool X -Payload @{...}` (T5.5 shared-utils.ps1) |
| Node.js / CLI 寫入 (e.g., upsert-story.js) | 內建 schema validation + UTC+8 timestamp + busy_timeout retry |
| 跨 worker 並行 add_* | retry on SQLITE_BUSY (exponential backoff 200/400/600ms 共 3 次) |
| 寫入前 dedup | Search-first pattern: search → if exists → update; else → add |
| Timestamp | `Get-TaiwanTimestamp` (PS) 或 `toLocaleString('sv', {timeZone:'Asia/Taipei'})` (JS) |
| JSON IPC encoding | UTF-8 No-BOM via `Write-JsonFile` (T5.5) 或 `[System.IO.File]::WriteAllText(... UTF8Encoding(false))` |

---

## 4. FORBIDDEN

- ❌ **PowerShell 直接 MCP add_*/ upsert_* 跳過 `Invoke-PhycoolMcpSafe`** (失去 validation + retry + UTF-8 + UTC+8)
- ❌ **Enum 大小寫錯誤** (severity 必 lowercase 'critical' 不是 'Critical' / category 必 lowercase)
- ❌ **`new Date().toISOString()` 寫 UTC timestamp** (違反 constitutional §Timestamp Mandate UTC+8)
- ❌ **JSON 寫入用 `Set-Content -Encoding UTF8`** (PS 5.1 寫 BOM,Node.js / jq / ConvertFrom-Json 報錯)
- ❌ **重複 add 同樣 entry 不走 search-first** (DB 污染)
- ❌ **跨 worker 並行同 `story_id` / `idd_id` / `td_id` upsert** (T5.7 HARD_BLOCK 偵測,違反 parallel-batch-conflict-isolation)
- ❌ **直接 sqlite3 CLI 寫入 phycool.db** (繞過 MCP schema validation)
- ❌ **跳過 SQLITE_BUSY retry** (並行 race 直接 throw)

---

## 5. Mandatory Pre-Write Flow

```
PowerShell 寫入 phycool-context MCP
  ↓
Step 1: Search-First (避重複污染)
  ├ search_context / search_intentional_decisions / etc.
  └ 命中 → 跳 step 4 (update); 否則 → step 2
  ↓
Step 2: Build Payload (對照 §1 catalog 必填欄位)
  ├ 對照 phycool-mcp-discipline §1 23 tools required fields
  ├ Enum 大小寫驗證 (lowercase severity / category / etc.)
  └ Auto-inject UTC+8 timestamp via Get-TaiwanTimestamp
  ↓
Step 3: Invoke-PhycoolMcpSafe (T5.5 shared-utils.ps1)
  ├ Step 3a: Schema validation (T5.3 validate-mcp-payload.cjs follow-up)
  ├ Step 3b: UTF-8 No-BOM JSON IPC (T5.5 Write-JsonFile)
  ├ Step 3c: Invoke MCP via T5.4 mcp-cli-wrapper.js (follow-up)
  └ Step 3d: Retry on SQLITE_BUSY (3 times, exponential backoff)
  ↓
Step 4: Verify Result
  ├ Check return value (entry_id / error)
  └ Log success / failure to pipeline log
```

---

## 6. Self-Check (每次 MCP 寫入前 5 題必自問)

1. **必填欄位齊全嗎?** (對照 phycool-mcp-discipline §1 catalog)
2. **Enum 大小寫對嗎?** (severity 'critical' 而非 'Critical')
3. **timestamp 是 UTC+8 嗎?** (`Get-TaiwanTimestamp` 或 `toLocaleString('sv', {timeZone:'Asia/Taipei'})`)
4. **search-first 確認無重複嗎?** (避 DB 污染)
5. **若跨 worker 並行,有走 `Invoke-PhycoolMcpSafe` retry 嗎?** (SQLITE_BUSY 防護)

---

## 7. Hook 機械守護(Phase 5+ 計畫)

未來可建 `.claude/hooks/mcp-payload-precheck.js` PreToolUse hook:
- 偵測 user 嘗試直接 `mcp__phycool-context__add_*`
- 對比 phycool-mcp-discipline §1 catalog 必填欄位
- 缺漏 → stderr 警告 + 提示走 `Invoke-PhycoolMcpSafe`

---

## 8. Incident Records

- **2026-05-04 v5.0.0 (本 rule 觸發)**: User ultrathink 補充「記憶庫 MCP 調用紀律」- 防 6 式錯根因。觸發 T5 系列 8 task 實作 (T5.1 phycool-mcp-discipline Skill + T5.5 Invoke-PhycoolMcpSafe + T5.7 hot-row + T5.8 本 rule + T5.3/T5.4 follow-up)。
- **歷史式錯實例** (本 rule 防範對象):
  - `add_intentional_decision` 缺 sub_type → 多次 throw
  - severity 'Critical' (大寫) → search 找不到 'critical'
  - `new Date().toISOString()` 寫 UTC → DB 顯示比實際早 8 小時
  - 同 session 重複 add_context → DB 多筆同 entry
  - PS Set-Content -Encoding UTF8 → BOM 寫入 → Node.js ConvertFrom-Json 失敗

---

## 9. Related

- `.claude/skills/phycool-mcp-discipline/SKILL.md` v1.0.0 — 23 MCP tools catalog + 30+ tables cheat-sheet + 6 式錯根因 ✅/❌ 範例
- `.claude/skills/party-to-pipeline/scripts/shared-utils.ps1` — `Invoke-PhycoolMcpSafe` (T5.5) + `Read/Write-Utf8File` (T5.5 helpers) + `$Script:DbHotRowConflictTypes` (T5.7)
- `.claude/rules/parallel-batch-conflict-isolation.md` SUPREME — T5.7 hot-row HARD_BLOCK 偵測 (story_id / idd_id / td_id)
- `.claude/rules/constitutional-standard.md` SUPREME — §Timestamp Mandate (UTC+8)
- `.claude/rules/context-memory.md` — Conversation Start Ritual + Write Discipline
- `.context-db/server.js:48-49` — WAL + busy_timeout=5000 (並行安全 baseline)
- `scripts/validate-mcp-payload.cjs` (T5.3 follow-up) — schema validator
- `.context-db/scripts/mcp-cli-wrapper.js` (T5.4 follow-up) — PS→MCP bridge

---

## 10. Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立。觸發事件:User ultrathink 補充「記憶庫 MCP 調用紀律」防 6 式錯根因。對齊 party-to-pipeline v5.0.0 T5 系列 8 task。Mandatory action 矩陣 + 8 條 FORBIDDEN + 5 步 Pre-Write Flow + Self-Check 5 題 + Hook 計畫 + 5 條 Incident Records。 |
