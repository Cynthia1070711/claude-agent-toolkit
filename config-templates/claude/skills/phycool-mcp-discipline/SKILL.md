---
name: phycool-mcp-discipline
description: |
  PhyCool Context Memory MCP (phycool-context) 23 tools 調用紀律 + 30+ tables schema cheat-sheet。
  防 6 種「式錯」根因 (必填欄位缺漏 / Enum 違反 / UTC vs UTC+8 timestamp / 重複寫入 / JSON encoding 串接 / 並行 SQLITE_BUSY)。
  party-to-pipeline v5.0.0 全 ps1 走 MCP 寫入必透過 Invoke-PhycoolMcpSafe (T5.5 in shared-utils.ps1)。
  觸發關鍵字: MCP, mcp, search_context, add_context, add_intentional_decision, add_tech, add_cr_issue, upsert_story, upsert_debt, log_workflow, IDD, td-id, story_id, schema, busy_timeout, SQLITE_BUSY, Memory DB, phycool-context, payload validation, 式錯, 編碼, JSON IPC, dedup, search-first, MCP 調用.
version: 1.0.0
updated: 2026-05-04
last_synced_epic: epic-governance
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

> **核心任務**: 確保 23 MCP tools (`phycool-context`) + 12+ CLI scripts (`.context-db/scripts/`) 寫入 30+ tables 時,**杜絕 6 種「式錯」根因**(必填欄位缺漏 / Enum 違反 / UTC vs UTC+8 timestamp / 重複寫入 / JSON encoding 串接 / 並行 SQLITE_BUSY)。所有 PowerShell 寫入必走 `Invoke-PhycoolMcpSafe` (shared-utils.ps1 T5.5)。

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

## 1. 23 MCP Tools Catalog (phycool-context)

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

**Hot Row 衝突偵測**: 跨 worker 同 `story_id` / `idd_id` / `td_id` upsert → HARD_BLOCK (T5.7 in shared-utils.ps1 `$Script:DbHotRowConflictTypes`)

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

---

## Cross-Skill References

| 相關 Skill | 連動點 |
|:---|:---|
| `phycool-context-memory` | MCP server 規範 + 5-layer memory 架構 (本 Skill 補強 23 tools 調用層) |
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

- `.context-db/server.js` — MCP server (23 tools registered)
- `.context-db/scripts/init-db.js` — Schema (30+ CREATE TABLE)
- `scripts/validate-mcp-payload.cjs` (T5.3 follow-up) — schema validator
- `.context-db/scripts/mcp-cli-wrapper.js` (T5.4 follow-up) — PS→MCP bridge

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.0.0** | **2026-05-04** | 初版建立 (epic-governance party-to-pipeline v4.1.0→v5.0.0 改版 T5.1 task)。對齊 saas-to-skill v3.0.0 Phase 3+4 (extends T2.1 same-session invocation chain)。23 MCP tools catalog + 30+ tables cheat-sheet + 6 式錯根因 + 並行 SQLITE_BUSY 防護 + dedup search-first + Invoke-PhycoolMcpSafe (stub mode for T5.3/T5.4 follow-up)。Cross-ref phycool-context-memory / phycool-windows-ps-encoding。 |
