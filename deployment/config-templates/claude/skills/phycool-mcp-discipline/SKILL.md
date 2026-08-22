---
name: phycool-mcp-discipline
description: |
  PhyCool Context Memory MCP (phycool-context) 36 tools 調用紀律 + 30+ tables schema cheat-sheet。
  防 6 種「式錯」根因 (必填欄位缺漏 / Enum 違反 / UTC vs UTC+8 timestamp / 重複寫入 / JSON encoding 串接 / 並行 SQLITE_BUSY)。
  party-to-pipeline v5.0.0 全 ps1 走 MCP 寫入必透過 Invoke-PhycoolMcpSafe (T5.5 in shared-utils.ps1)。
  觸發關鍵字: MCP, mcp, search_context, add_context, add_intentional_decision, add_tech, add_cr_issue, upsert_story, upsert_debt, log_workflow, IDD, td-id, story_id, schema, busy_timeout, SQLITE_BUSY, Memory DB, phycool-context, payload validation, 式錯, 編碼, JSON IPC, dedup, search-first, MCP 調用, search_worker_runs, ack_worker_run, gate_worker_run, add_worker_message, worker_runs, execution right CAS, post_ctrl_message, read_ctrl_messages, close_ctrl_thread, update_ctrl_board, ctrl_threads, ctrl channel.
version: 1.3.0
updated: 2026-08-02
last_synced_epic: epic-whp
watches:
  - .context-db/server.js
  - .context-db/scripts/*.js
  - .context-db/scripts/*.cjs
  - .claude/skills/party-to-pipeline/scripts/shared-utils.ps1
  - scripts/validate-mcp-payload.cjs
disable-model-invocation: false
user-invocable: true
---

# PhyCool MCP Discipline — phycool-context 調用紀律

> **核心任務**: 確保 36 MCP tools (`phycool-context`) + 12+ CLI scripts (`.context-db/scripts/`) 寫入 30+ tables 時,**杜絕 6 種「式錯」根因**(必填欄位缺漏 / Enum 違反 / UTC vs UTC+8 timestamp / 重複寫入 / JSON encoding 串接 / 並行 SQLITE_BUSY)。所有 PowerShell 寫入必走 `Invoke-PhycoolMcpSafe` (shared-utils.ps1 T5.5)。

## 適用 / 不適用

**適用**:
- 任何透過 MCP `phycool-context` 寫入 Memory DB (add_*/ upsert_*)
- 透過 CLI scripts 寫入 (.context-db/scripts/upsert-story.js / upsert-debt.js / log-rule-violation.js / etc.)
- party-to-pipeline 6 ps1 對 phycool-context MCP 的調用
- BMAD workflow / Skill / Hook 對 Memory DB 的寫入
- 出現 `Invalid JSON primitive` / `database is locked` / `missing required field` 錯誤
- 跨 worker 並行 MCP write 場景

**不適用**:
- ❌ MCP read-only operations (search_*/ get_*/ list_*) — read 無 schema 風險
- ❌ 直接 SQLite SQL CLI (sqlite3 .context-db/phycool.db) — 繞過 MCP 規範
- ❌ Phase 4 自動 hook (observe-pattern / incremental-embed / log-session) — 已 hook-managed

---

## 1. 32 MCP Tools Catalog (phycool-context)

| Category | Tool | Required Fields | Critical Enum |
|:---|:---|:---|:---|
| **Add** | `add_context` | title / content / category | category: session/decision/debug/pattern/reference/architecture |
| | `add_cr_issue` | story_id / severity / category / description | severity: critical/high/medium/low |
| | `add_intentional_decision` | idd_type / sub_type / story_id / decision / rationale | idd_type: IDD-COM/IDD-STR/IDD-REG/IDD-USR; sub_type: communication/strategic/regulatory/user-experience |
| | `add_tech` | title / problem / solution / category | category: bugfix/architecture/performance/etc. |
| **Upsert** | `upsert_benchmark` | name / value / unit | — |
| **Search** | 11 search tools (search_context / search_tech / search_debt / search_documents / search_glossary / search_god_nodes / search_intentional_decisions / search_stories / search_symbols / search_conversations / semantic_search) | query | varies |
| **Get** | 6 get tools (get_intentional_decision / get_patterns / get_session_detail / get_symbol_context / list_sessions / trace_context) | id / story_id (varies) | — |
| **Workflow** | `log_workflow` | workflow_type / status | status: success/failed/in-progress |
| **Verify** | `verify_intentional_annotations` | (read-only audit) | — |
| **Instinct(ECC WIP)** | `add_instinct` | trigger / action / confidence / scope | confidence 0-1 浮點 |
| | `search_instincts`(唯讀) | — | — |
| | `decay_instinct` / `promote_instinct` | id | promote 未達 `confidence ≥ 0.8` 回 `{ok:false}` 不設 isError |
| **Worker Protocol(CAS,epic-whp)** | `search_worker_runs`(唯讀) | — | pending_ack / include_messages boolean;`pending_ack` 與 `lifecycle` 互斥 |
| | `ack_worker_run` | run_id / ack_by | CAS: `WHERE lifecycle='reported'` |
| | `gate_worker_run` | run_id / verdict / gate_by | verdict: approved/revise/rejected;CAS `WHERE ack_at IS NOT NULL AND gate_result='pending'` |
| | `add_worker_message` | run_id / msg_type / body / author / **mode**(無預設,必填) | mode: append/replace;msg_type 依 direction 各自驗證 |
| **Ctrl-Channel(CAS,epic-ccb)** | `post_ctrl_message` | to_tracks(非空陣列) / msg_type / body | msg_type: inform/discuss/request/handoff/decision/state;無 `thread_id` 自動建題(seq=1);closed thread 拒發 `{ok:false}`;`superseded_by` 限本軌 |
| | `read_ctrl_messages`(唯讀,讀取即簽收) | — | `unread_only`/`must_read_only`/`thread_id`/`category`/`channel`/`state` 過濾 AND 組合;`limit` 預設 20 硬上限 100;**無 ledger 呼叫**(BR-043,唯讀不計入 ledger,對齊 `handleSearchWorkerRuns` 前例) |
| | `close_ctrl_thread` | thread_id | CAS: `WHERE initiator_track=@caller AND state='open'`;非發起軌 / 重複 close 皆回 `{ok:false}` 非 `isError` |
| | `update_ctrl_board` | board_id / expected_version / state | CAS: `WHERE version=@expected`;`state` 必符 `BoardState` shape(`status`/`holder`/`history[{ts,track,action}]` 必填,`until`/`note` 選填),否則 `isError:true` 且 `code='CCB1-E02'` |

**CLI Scripts SSoT** (.context-db/scripts/):
- `upsert-story.js` (DB-first Story SSoT)
- `upsert-debt.js` (Tech debt v2.0)
- `pipeline-checkpoint.js` (Pipeline state save/recover)
- `log-session.js` (Session 補登)
- `log-rule-violation.js` (Phase 3 rule violation tracker)
- `otel-session-aggregate.js` (OTel token tracking)
- 等 12+ scripts

---

## 2. 30+ Tables Schema Cheat-Sheet

| Table | Purpose | Key Fields | Hot Row (T5.7 conflict) |
|:---|:---|:---|:---:|
| `stories` | DB-first Story SSoT | story_id (PK) / status / acceptance_criteria / tasks / file_list / task_track | ⚠️ |
| `intentional_decisions` | IDD 4 sub-types | idd_id (PK) / idd_type / sub_type / story_id / decision / forbidden_changes | ⚠️ |
| `tech_debt_items` | Tech debt v2.0 | td_id (PK) / story_id / severity / category / status | ⚠️ |
| `review_findings` / `review_reports` | CR result | story_id / cr_score / cr_issues_total | ⚠️ |
| `context_entries` | General memory | id / category / title / content / tags | — |
| `tech_entries` | Technical decisions | id / category / title / problem / solution | — |
| `cr_issues` | CR finding details | story_id / severity / category / description | — |
| `pattern_observations` | Phase 4 ML | hook auto-write | — (hook managed) |
| `retrieval_observations` / `retrieval_hits` / `retrieval_keywords` | RAG analytics | MCP server auto-write | — (server managed) |
| `glossary` | Terminology | term / definition | — |
| `workflow_executions` | Workflow tracking | workflow_type / status / evidence_json (T4.0.0) | — |
| `benchmarks` | Performance | name / value / unit | — |
| `test_journeys` / `test_traceability` | E2E | journey_id / story_id | — |
| `pipeline_checkpoints` | Pipeline state | session_id / step_n / result | — |
| `rule_violations` | Phase 3 violation tracker | rule_name / phase / severity | — |
| `skill_keywords` | Skill auto-detect | skill_name / keywords | — |
| `code_symbols` / `document_chunks` | RAG indices | (Phase 5) | — |
| `worker_runs`(epic-whp) | 派發歷程 + 執行權狀態機 | run_id (PK) / lifecycle / ack_at / controller_track | ⚠️ |
| `worker_messages`(epic-whp) | controller↔worker 訊息匯流排 | msg_id (PK) / run_id / seq(唯一索引 `(run_id,seq)`)/ state | — |
| `worker_handoffs`(epic-whp) | GATE 裁決證據鏈 | run_id (PK) / gate_result / gate_by | ⚠️ |
| `ctrl_threads`(epic-ccb) | 中控聊天室話題(CAS close) | thread_id (PK,時間戳格式) / initiator_track / state / must_read | ⚠️ |
| `ctrl_messages`(epic-ccb) | 話題內訊息(append-only) | msg_id (PK) / thread_id / seq(唯一索引 `(thread_id,seq)`)/ from_track / to_tracks | — |
| `ctrl_message_reads`(epic-ccb) | 簽收記錄(讀取即 UPSERT) | msg_id + track(PK) / read_at | — |
| `ctrl_boards`(epic-ccb) | 看板狀態(CAS optimistic lock) | board_id (PK) / version / state_json(BoardState shape) | ⚠️ |

**Hot Row 衝突偵測**: 跨 worker 同 `story_id` / `idd_id` / `td_id` upsert → HARD_BLOCK (T5.7 in shared-utils.ps1 `$Script:DbHotRowConflictTypes`)。`ctrl_threads`/`ctrl_boards` 走各自 SQL 層 CAS(`WHERE state='open'` / `WHERE version=@expected`),非 T5.7 機制範圍,但同屬「並行寫入需防護」風險等級,故同標 ⚠️。

---

## 3. 6 種式錯根因 + ✅/❌ 範例

### 根因 1: 必填欄位缺漏

```bash
# ❌ 錯誤 (add_intentional_decision 缺 sub_type)
mcp__phycool-context__add_intentional_decision({
    idd_type: 'IDD-COM',
    story_id: 'mcp-001',
    decision: 'no logging',
    rationale: 'too noisy'
})
# → throw "missing required field: sub_type"

# ✅ 正確 (full required fields)
mcp__phycool-context__add_intentional_decision({
    idd_type: 'IDD-COM',
    sub_type: 'communication',
    story_id: 'mcp-001',
    decision: 'no logging',
    rationale: 'too noisy',
    forbidden_changes: ['no console.log', 'no Logger.Info']
})
```

### 根因 2: Enum/型別違反

```bash
# ❌ 大小寫錯 (DB enum 是 lowercase)
add_cr_issue({ severity: 'Critical', ... })  # → 寫成 'Critical' string,query 找 'critical' 找不到

# ✅ 正確 (lowercase)
add_cr_issue({ severity: 'critical', ... })
```

### 根因 3: UTC vs UTC+8 Timestamp(constitutional 違反)

```javascript
// ❌ 錯誤 (UTC,8 小時前)
created_at: new Date().toISOString()
// → "2026-05-04T05:30:00.000Z" (UTC,實際台灣 13:30)

// ✅ 正確 (UTC+8 per constitutional §Timestamp Mandate)
created_at: new Date().toLocaleString('sv', {timeZone: 'Asia/Taipei'}).replace(' ', 'T') + '+08:00'
// → "2026-05-04T13:30:00+08:00"
```

PowerShell 用 helper:
```powershell
Get-TaiwanTimestamp  # 返 "2026-05-04T13:30:00+08:00"
```

### 根因 4: 重複/覆蓋寫入

```bash
# ❌ 錯誤 (重複 add 同樣 entry,DB 多筆)
add_context({ title: 'Pattern X', content: '...', category: 'pattern' })
add_context({ title: 'Pattern X', content: '...', category: 'pattern' })  # 第 2 次也 add

# ✅ 正確 (search-first pattern,命中則 skip / update,否則 add)
const existing = await search_context({ query: 'Pattern X', category: 'pattern' });
if (existing.entries.length === 0) {
    await add_context({ title: 'Pattern X', ... });
} else {
    // optionally update via add_context (DB 內部處理 dedup)
}
```

### 根因 5: JSON Encoding 串接斷裂(關聯 phycool-windows-ps-encoding)

```powershell
# ❌ 錯誤 (PS 5.1 ConvertTo-Json + Set-Content 寫 BOM,Node.js 讀 BOM 失敗)
$payload | ConvertTo-Json | Set-Content "payload.json" -Encoding UTF8

# ✅ 正確 (UTF-8 No-BOM via T5.5 helper)
Write-JsonFile -Path "payload.json" -Data $payload
```

### 根因 6: 並行 MCP Write Race(SQLITE_BUSY)

```powershell
# ❌ 錯誤 (兩 worker 同時 add_context,無 retry → SQLITE_BUSY throw)
& mcp-call add_context $payload

# ✅ 正確 (Invoke-PhycoolMcpSafe with retry exponential backoff)
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{
    title = 'Pattern X'
    content = '...'
    category = 'pattern'
}
# 內建 SQLITE_BUSY retry 3 times with exponential backoff (200ms / 400ms / 600ms)
```

---

## 4. 並行 MCP Write 安全

`.context-db/server.js:48-49` 已設:
```javascript
db.pragma('journal_mode = WAL');     // Write-Ahead Logging,允許 concurrent read + write
db.pragma('busy_timeout = 5000');    // 5s wait if locked
```

**保證**: SQLite WAL 模式下,跨 worker `add_context` / `add_intentional_decision` 不同 row 寫入並行安全。

**例外**: 跨 worker 同 `story_id` / `idd_id` / `td_id` upsert → **後寫覆蓋** (race condition)。對齊 T5.7 `$Script:DbHotRowConflictTypes` HARD_BLOCK 偵測。

**機械守護**: `Invoke-PhycoolMcpSafe` 內建 SQLITE_BUSY retry (3 次 exponential backoff)。

---

## 5. dedup Search-First Pattern

寫入前**必先 search**,命中則 update,否則 add。防重複污染 DB。

```powershell
# Pattern: search → if exists → update; else → add
$existing = Invoke-PhycoolMcpSafe -Tool 'search_context' -Payload @{
    query = 'Pattern X'
    category = 'pattern'
    limit = 1
}
if (-not $existing -or $existing.entries.Count -eq 0) {
    Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{
        title = 'Pattern X'
        content = '...'
        category = 'pattern'
    }
}
```

---

## 6. Helpers (party-to-pipeline shared-utils.ps1 T5.5)

| Helper | 用途 |
|:---|:---|
| `Invoke-PhycoolMcpSafe -Tool X -Payload @{...}` | Validate (T5.3) + UTF-8 No-BOM + UTC+8 timestamp + retry on SQLITE_BUSY |
| `Read-Utf8File -Path X` | 取代 Get-Content 預設 (Big5 → UTF-8) |
| `Write-Utf8File -Path X -Content Y -WithBom $false` | 取代 Set-Content -Encoding UTF8 (避 BOM) |
| `Read-JsonFile -Path X` | UTF-8 No-BOM + ConvertFrom-Json |
| `Write-JsonFile -Path X -Data $obj` | UTF-8 No-BOM + ConvertTo-Json |
| `Get-TaiwanTimestamp` | UTC+8 timestamp |

**Stub Mode**: T5.5 Invoke-PhycoolMcpSafe 當前是 stub (T5.3 validate-mcp-payload.cjs + T5.4 mcp-cli-wrapper.js 為 follow-up Story 完整實作)。Stub 模式下 log warn 並 return $null,不 break pipeline。

---

## 7. FORBIDDEN

- ❌ **修改 `.context-db/scripts/` 下被 `server.js` import 的模組後,直接以「既有 session 的 MCP tool 呼叫」驗證修復效果**
   Common Rationalization: 「vitest 都綠了,MCP 只是包一層,直接呼叫確認一下就好」
   Red Flag: MCP 回傳值與 vitest 結論不一致(如 gate 後 DB 欄位仍舊值);機器上同時存在多個 `node .context-db/server.js` 行程(whp-11 T14 實測 3 個並存,最舊起自前一日)。Node.js module cache 是行程級 — 長駐 server 不會熱載入磁碟新碼,修復驗證必走 **fresh process**(vitest / CLI script / 新開 session 的 MCP server),或先重啟 server;詳 debt `TD-MCP-SERVER-STALE-MODULE-CACHE-BLOCKS-SOURCE-FIXES`

- ❌ 直接 MCP add_* 跳過 `Invoke-PhycoolMcpSafe` (PowerShell 場景必走 helper)
- ❌ Enum 大小寫錯誤 (severity 必 lowercase 'critical' 不是 'Critical')
- ❌ `new Date().toISOString()` 寫 UTC timestamp (違反 constitutional §Timestamp Mandate)
- ❌ JSON 寫入用 `Set-Content -Encoding UTF8` (寫 BOM,Node.js / jq / ConvertFrom-Json 報錯)
- ❌ 重複 add 同樣 entry (必走 search-first pattern)
- ❌ 跨 worker 並行同 story_id / idd_id / td_id upsert (T5.7 HARD_BLOCK 偵測)
- ❌ 直接 sqlite3 CLI 寫入 phycool.db (繞過 MCP 規範,失去 schema validation)

---

## 8. Self-Check (每次 MCP 寫入前 5 題必自問)

1. **必填欄位齊全嗎?** (對照 §1 catalog)
2. **Enum 大小寫對嗎?** (severity lowercase / category lowercase / etc.)
3. **timestamp 是 UTC+8 嗎?** (Get-TaiwanTimestamp 或 toLocaleString('sv', {timeZone:'Asia/Taipei'}))
4. **search-first 確認無重複嗎?** (避 DB 污染)
5. **若跨 worker 並行,有走 Invoke-PhycoolMcpSafe retry 嗎?** (SQLITE_BUSY 防護)
6. **我剛改過 `.context-db/scripts/` 下被 `server.js` import 的模組嗎?** → 是 → 長駐 MCP server **不會熱載入**,驗證修復必經 fresh process(vitest / CLI / 新 session 的 server)或先重啟 server;既有 session 的 MCP 呼叫可能連到快取舊碼的行程(2026-08-02 whp-11 T14 實測 3 個 server 並存,`gate_worker_run` 走到最舊行程使 T7 修復未生效)

---

## Cross-Skill References

| 相關 Skill | 連動點 |
|:---|:---|
| `phycool-context-memory` | MCP server 規範 + 5-layer memory 架構 (本 Skill 補強 36 tools 調用層) |
| `phycool-windows-ps-encoding` | UTF-8 helpers (T5.5 引用) + JSON IPC encoding 串接 |
| `phycool-debt-registry` | tech_debt_items table 寫入規範 (本 Skill §3 cheat-sheet) |
| `phycool-intentional-decisions` | intentional_decisions table 寫入規範 + IDD 4 sub-types Enum |
| `party-to-pipeline` (v5.0.0+) | Invoke-PhycoolMcpSafe + T5.7 hot-row HARD_BLOCK 偵測 |

---

## Cross-Rule References

| Rule | 連動點 |
|:---|:---|
| `.claude/rules/constitutional-standard.md` | §Timestamp Mandate (UTC+8) + §Code Verification |
| `.claude/rules/context-memory.md` | Conversation Start Ritual (auto-injected memory) |
| `.claude/rules/parallel-batch-conflict-isolation.md` | T5.7 HARD_BLOCK hot-row patterns (DB write conflict) |
| `.claude/rules/mcp-payload-discipline.md` (T5.8) | SUPREME mandate: 必走 Invoke-PhycoolMcpSafe |

---

## References

- `.context-db/server.js` — MCP server (36 tools registered)
- `.context-db/scripts/init-db.js` — Schema (30+ CREATE TABLE)
- `scripts/validate-mcp-payload.cjs` (T5.3 follow-up) — schema validator
- `.context-db/scripts/mcp-cli-wrapper.js` (T5.4 follow-up) — PS→MCP bridge

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.0** | **2026-08-02** | **whp-11-d2-inline-revise code-review — 長駐 MCP server 模組快取紀律新增(承接 debt `TD-MCP-SERVER-STALE-MODULE-CACHE-BLOCKS-SOURCE-FIXES` 短期文檔半)**。§7 FORBIDDEN 新增三元素條目(修改 `.context-db/scripts/` 被 `server.js` import 的模組後,禁以既有 session 的 MCP tool 呼叫驗證修復 — Node.js module cache 為行程級,長駐 server 不熱載入;Red Flag = MCP 回傳與 vitest 結論不一致 / 多個 `node .context-db/server.js` 行程並存)+ §8 Self-Check 新增 Q6(fresh process 驗證原則)。觸發:whp-11 T14 端到端演練 live 實測 — T7 已修 `gateWorkerRun`(vitest 57/57 綠)但 MCP 路徑連到 2026-08-01 起跑的舊 server 行程,`gate(revise)` 未重置 `gate_result`,3 個 server 行程並存;本 CR 於新 session(fresh server)synthetic run 複驗修復經 MCP 路徑生效。debt 殘餘(server 啟動 stamp / staleness 偵測面)仍 open,`target_story=whp-worker-handshake-protocol`。走**字面** `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 本條即新 FORBIDDEN;面向 4 references 無需同步 — 純紀律新增無 tool/schema 變更;面向 6 cross-skill 無數值衝突)。 |
| **1.2.1** | **2026-07-28** | **ccb-1-db-mcp-import code-review F2 — `update_ctrl_board.expected_version` 型別契約補述**。CR 實測發現:MCP `inputSchema` 宣告 `type:'number'` 但不強制,送 `"7"`(字串)時 SQLite INTEGER 親和性讓 CAS 成功寫入(version 正確變 8),但回傳值 `expected_version + 1` 走字串串接變成 `"71"` —— 寫對讀錯,呼叫端拿到不存在的 version 去做下一次 CAS。實作已於 `ctrl-channel-ops.js:395-400` 以 `Number.isInteger()` 於入口擋下回 `CCB1-E01`。本次同步 `references/mcp-tools-cheatsheet.md` §Ctrl-Channel `expected_version` 欄位列 + 新增型別式錯警示 block(歸入 §1 六式錯根因的「型別/Enum 違反」家族,提醒所有宣告 `number` 但由 LLM 產生 payload 的欄位同屬風險面)。**無新增 tool、無 catalog 數量變更**。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **1.2.0** | **2026-07-28** | **ccb-1-db-mcp-import — tool catalogue 32→36 全面校正 + Ctrl-Channel(epic-ccb)區塊新增**。新增 4 個中控聊天室 MCP tool(`post_ctrl_message`/`read_ctrl_messages`/`close_ctrl_thread`/`update_ctrl_board`,CAS 語意 + append-only + `CCB1-E01~E04` 錯誤碼)。①frontmatter description 32→36 + 觸發關鍵字補 8 個(ctrl_threads/ctrl channel 等);②§1 catalog 加「Ctrl-Channel(CAS,epic-ccb)」分類 4 tool 列;③§2 schema cheat-sheet 加 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 四表(`ctrl_threads`/`ctrl_boards` 標 ⚠️,各自走 SQL 層 CAS 非 T5.7 機制,已加註說明);④`references/mcp-tools-cheatsheet.md` 標題 + 組成算式 36 化 + 新增「Ctrl-Channel 4 tools(epic-ccb · CAS)」完整 4-tool 參數表(逐字對齊 `.context-db/scripts/ctrl-channel-ops.js` 實作與 DDL);⑤Cross-Skill References / References 段同步 36;⑥`last_synced_epic` epic-whp→epic-ccb。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **1.1.1** | **2026-07-28** | **whp-5 code-review F5 修補 — 標題數與內文條目對齊**。v1.1.0 把 `references/mcp-tools-cheatsheet.md` 標題由「23 tools」改為 32,但**未補條目**,該檔內文仍只列 24 個(4 Add + 1 Upsert + 11 Search + 6 Get + 1 Workflow + 1 Verify)——改前低報 1、改後**高報 8**,對讀者的誤導反而擴大,而該檔正是本 SKILL §1 catalog 的「詳細展開」。本次補齊:① cheatsheet 新增 **Worker Protocol 4 tools** 完整參數表(含 CAS 守衛鏈順序 / `mode` 無預設 / `pending_ack` 與 `lifecycle` 互斥 / replace 僅同 direction / 永不寫 delivered-consumed);② 新增 **Instinct 4 tools(ECC WIP)** 表(`add_instinct`/`search_instincts`/`decay_instinct`/`promote_instinct`,required 欄位以 `server.js` `ListTools` 實查);③ 檔頭補 32 的組成算式並註明以 `ListTools` 實查為準;④ 本 SKILL §1 catalog 同步補 Instinct 分類列(原表亦只列 28)。**無規範/行為變更**,純數量一致性。走 `Skill(skill="saas-to-skill")` Mode B。 |
| **1.1.0** | **2026-07-28** | **whp-5-message-bus-mcp — tool catalogue 23/24/28→32 全面校正**(本 Skill 為 `mcp-payload-discipline.md` §9 指名的 MCP tool catalogue SSoT,先前長期停在過時「23 tools」)。§1 catalog 加 Worker Protocol(CAS,epic-whp)分類 4 tool;§2 schema cheat-sheet 加 `worker_runs`/`worker_messages`/`worker_handoffs` 三表(`worker_runs`/`worker_handoffs` 標 Hot Row ⚠️,`run_id` 為天然衝突鍵);References/Cross-Skill References 段同步 32;`last_synced_epic` epic-governance→epic-whp。順帶修正 `references/mcp-tools-cheatsheet.md:1` 標題「23 tools」→ 32(該檔為 orphan reference,未被本 SKILL.md 連結,僅修正其自身標頭數字,未擴充逐 tool 條目——留給日後正式接線時一併補完)。移除已退役的「三引擎同步 md5 identical」殘留敘述(對齊 `single-engine-mode.md`)。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **1.0.0** | **2026-05-04** | 初版建立 (epic-governance party-to-pipeline v4.1.0→v5.0.0 改版 T5.1 task)。對齊 saas-to-skill v3.0.0 Phase 3+4 (extends T2.1 same-session invocation chain)。23 MCP tools catalog + 30+ tables cheat-sheet + 6 式錯根因 + 並行 SQLITE_BUSY 防護 + dedup search-first + Invoke-PhycoolMcpSafe (stub mode for T5.3/T5.4 follow-up)。Cross-ref phycool-context-memory / phycool-windows-ps-encoding。 |
