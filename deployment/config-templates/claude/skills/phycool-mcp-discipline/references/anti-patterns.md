# Anti-Patterns (10 ❌ + Incident Records)

> phycool-mcp-discipline §3 6 式錯根因的具體 incident 案例 + 修補。

---

## AP-1: 必填欄位缺漏 → DB 寫入靜默 NULL

**Incident**: `add_intentional_decision` 缺 `sub_type` → MCP throw `missing required field`,部分情境 throw 後 retry 又缺 → DB 多筆殘缺 entries

**❌ 錯誤**:
```javascript
mcp__phycool-context__add_intentional_decision({
    idd_type: 'IDD-COM',
    story_id: 'X',
    decision: '...',
    rationale: '...'
    // MISSING: sub_type
})
```

**✅ 修補**: 對照 mcp-tools-cheatsheet.md §1 catalog,寫入前 verify required ✅ 全齊。

---

## AP-2: Enum 大小寫違反 → Search 找不到

**Incident**: 多次 add_cr_issue 寫 `severity: 'Critical'` (大寫),但 search 用 `severity: 'critical'` 找不到 → 後續 audit 漏算 critical issues

**❌ 錯誤**: `severity: 'Critical'` / `category: 'Security'` / `status: 'Done'`

**✅ 修補**: 全 lowercase。對照 cheat-sheet enum 表格。

---

## AP-3: UTC Timestamp → DB 顯示比實際早 8 小時

**Incident**: 2026-03-22 review_reports.created_at + stories.updated_at 混 UTC / UTC+8,顯示時間比實際早 8 小時。觸發 constitutional-standard §Timestamp Mandate 建立。

**❌ 錯誤**:
```javascript
created_at: new Date().toISOString()  // → "2026-05-04T05:30:00.000Z" (UTC)
```

**✅ 修補**:
```javascript
// JavaScript
const taiwanTime = new Date().toLocaleString('sv', {timeZone:'Asia/Taipei'}).replace(' ', 'T') + '+08:00';
```
```powershell
# PowerShell
Get-TaiwanTimestamp  # → "2026-05-04T13:30:00+08:00"
```

---

## AP-4: 重複 add_context (DB 多筆同 entry)

**Incident**: 同 session 重複 add_context for "Pattern X" → DB 累積 5 筆 identical entries → search_context limit=10 被佔滿,真正相關 entry 被擠出

**❌ 錯誤**:
```powershell
# 直接 add 不檢查
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{title='X'; ...}  # 第 1 次
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{title='X'; ...}  # 第 2 次重複
```

**✅ 修補**: search-first pattern (common-patterns.md Pattern 1)。

---

## AP-5: PS Set-Content -Encoding UTF8 → BOM 寫入 → Node.js 讀失敗

**Incident**: PS 5.1 `Set-Content -Encoding UTF8` 寫 UTF-8 with BOM (`EF BB BF` 前 3 byte),Node.js `JSON.parse(fs.readFileSync(...))` throw `Unexpected character` (BOM 在 first byte)

**❌ 錯誤**:
```powershell
$payload | ConvertTo-Json | Set-Content "payload.json" -Encoding UTF8
```

**✅ 修補**: 用 T5.5 Write-JsonFile (UTF-8 No-BOM):
```powershell
Write-JsonFile -Path "payload.json" -Data $payload  # 預設 No BOM
```

---

## AP-6: 並行 add_* 撞 SQLITE_BUSY → throw

**Incident**: dev-story + code-review 同 session 並行 add_context,同時 INSERT context_entries → SQLite WAL 仍可能 BUSY (尤其 schema migration 中) → throw `database is locked`

**❌ 錯誤**:
```powershell
# 直接 invoke,無 retry
$result = & node mcp-call.js add_context $payload  # SQLITE_BUSY → throw
```

**✅ 修補**: T5.5 Invoke-PhycoolMcpSafe 內建 retry (3 次 exponential backoff 200/400/600ms):
```powershell
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload $payload -RetryMax 3
```

---

## AP-7: 跨 Worker 同 story_id Upsert → 後寫覆蓋前寫

**Incident**: parallel batch dispatch 兩 worker 同時 upsert-story.js 同 story_id (e.g., create-story + tasks-backfill 並行),後寫覆蓋前寫的 file_list 欄位

**❌ 錯誤**: parallel batch 未檢測 hot-row conflict,直接 spawn 兩 worker 同 Story

**✅ 修補**: T5.7 `$Script:DbHotRowConflictTypes` + `Test-DbHotRowConflict` HARD_BLOCK 偵測 (對齊 parallel-batch-conflict-isolation.md SUPREME)

---

## AP-8: 直接 sqlite3 CLI 寫入 → 繞過 schema validation

**Incident**: agent 用 `sqlite3 .context-db/phycool.db "INSERT ..."` 寫入,跳過 MCP server schema check → enum 大小寫錯 / required 缺漏 / Foreign Key 違反 全靜默通過

**❌ 錯誤**:
```bash
sqlite3 .context-db/phycool.db "INSERT INTO stories VALUES (...)"
```

**✅ 修補**: 一律走 MCP tools (`upsert_story.js` / `Invoke-PhycoolMcpSafe`)

---

## AP-9: search_context 不用 `include_content: true` → 只看標題判斷相關性

**Incident**: 2026-04 多次 agent 看 search_context 只返 title 即下結論,忽略 content 內具體規範。觸發 constitutional-standard §Depth-First Verification Mandate 建立。

**❌ 錯誤**:
```javascript
search_context({ query: 'X' })  // 預設 include_content: false → 只看 title
```

**✅ 修補**:
```javascript
search_context({ query: 'X', include_content: true })  // 完整 content 才能判斷
```

---

## AP-10: Workflow log 缺 token count → DevConsole 統計失準

**Incident**: log_workflow 漏寫 `input_tokens` / `output_tokens` → DevConsole Recent Activity 無法顯示 token 消耗 → 預算追蹤失準

**❌ 錯誤**:
```javascript
log_workflow({ workflow_type: 'dev-story', status: 'success' })  // 缺 token count
```

**✅ 修補**: 從 OTel collector main-otel-info.json 讀 token count 後 inject:
```javascript
log_workflow({
    workflow_type: 'dev-story',
    status: 'success',
    agent_id: 'CC-OPUS',
    input_tokens: 12345,
    output_tokens: 8765,
    evidence_json: JSON.stringify({...})
})
```

---

## 反模式偵測機械守護

| 反模式 | 偵測機制 |
|:------|:---------|
| AP-1 (必填缺漏) | T5.3 `validate-mcp-payload.cjs` schema validator (follow-up) |
| AP-2 (Enum 違反) | T5.3 enum check |
| AP-3 (UTC timestamp) | T5.5 `Invoke-PhycoolMcpSafe` Auto-inject Get-TaiwanTimestamp |
| AP-4 (重複寫入) | search-first pattern (common-patterns Pattern 1) |
| AP-5 (BOM JSON) | T5.5 `Write-JsonFile` 預設 No BOM |
| AP-6 (SQLITE_BUSY) | T5.5 Invoke-PhycoolMcpSafe retry exponential backoff |
| AP-7 (Hot-row race) | T5.7 `$Script:DbHotRowConflictTypes` HARD_BLOCK + parallel-batch-conflict-isolation Schedule-Batches |
| AP-8 (sqlite3 直寫) | mcp-payload-discipline.md SUPREME §FORBIDDEN 第 7 條 |
| AP-9 (淺層 search) | constitutional-standard §Depth-First Verification |
| AP-10 (Workflow 缺 token) | OTel auto-aggregate via SessionEnd hook |

---

## 與 6 式錯根因的對應

| 6 式錯根因 (SKILL §3) | Anti-Pattern (本檔) |
|:--------------------|:--------------------|
| 1. 必填欄位缺漏 | AP-1 |
| 2. Enum/型別違反 | AP-2 |
| 3. UTC vs UTC+8 timestamp | AP-3 |
| 4. 重複/覆蓋寫入 | AP-4, AP-7 |
| 5. JSON encoding 串接斷裂 | AP-5 |
| 6. 並行 SQLITE_BUSY race | AP-6 |
| (新增) 8. sqlite3 直寫繞過 | AP-8 |
| (新增) 9. 淺層 search | AP-9 |
| (新增) 10. Workflow log 缺 token | AP-10 |
