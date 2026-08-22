# Common Patterns (10 ✅ correct usage patterns)

> phycool-mcp-discipline §5 search-first + §6 helpers 的具體應用範例。

---

## Pattern 1: Search-First Dedup Before Add

避免重複污染 DB。寫入前必 search,命中則 update,否則 add。

```powershell
# PowerShell
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

## Pattern 2: UTC+8 Timestamp Auto-Inject

對齊 constitutional §Timestamp Mandate。

```powershell
# helper auto-injects via Get-TaiwanTimestamp
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{ title='X'; content='Y'; category='pattern' }
# created_at 自動 = "2026-05-04T13:30:00+08:00"
```

```javascript
// JavaScript / Node.js (CLI scripts)
const taiwanTime = new Date().toLocaleString('sv', {timeZone: 'Asia/Taipei'}).replace(' ', 'T') + '+08:00';
db.prepare("INSERT INTO ... (created_at) VALUES (?)").run(taiwanTime);
```

---

## Pattern 3: Retry on SQLITE_BUSY (Exponential Backoff)

跨 worker 並行 add_* 場景。

```powershell
# 內建於 Invoke-PhycoolMcpSafe (3 次 retry, 200/400/600ms)
Invoke-PhycoolMcpSafe -Tool 'add_context' -Payload @{...}
# SQLITE_BUSY → auto-retry,throw 後 follow-up
```

---

## Pattern 4: UTF-8 No-BOM JSON IPC

跨平台 (PowerShell → Node.js MCP) JSON 寫入。

```powershell
# 用 T5.5 Write-JsonFile (UTF-8 No-BOM)
Write-JsonFile -Path "$IpcDir/payload.json" -Data @{ tool='add_context'; payload=@{...} }
```

```javascript
// Node.js 讀
const payload = JSON.parse(fs.readFileSync('payload.json', 'utf8'));
// No BOM → ConvertFrom-Json / JSON.parse 不報錯
```

---

## Pattern 5: Story Upsert with Full Enriched Fields

dev-story / create-story workflow 完成後 sync 全 enriched fields。

```bash
node .context-db/scripts/upsert-story.js --inline '{
  "story_id": "td-pipeline-X",
  "status": "ready-for-dev",
  "acceptance_criteria": "...",
  "tasks": "...",
  "dev_notes": "...",
  "required_skills": "phycool-context-memory, phycool-debt-registry",
  "file_list": "...",
  "implementation_approach": "...",
  "testing_strategy": "..."
}'
```

---

## Pattern 6: IDD Annotation 4-Layer

IDD 必同步 4 層 (Code / ADR / DB / Memory)。

```csharp
// Code layer
[Intentional: IDD-COM-001]
public bool AllowFreePlanEdit() => true;
```

```bash
# DB layer (via MCP)
Invoke-PhycoolMcpSafe -Tool 'add_intentional_decision' -Payload @{
    idd_id = 'IDD-COM-001'
    idd_type = 'IDD-COM'
    sub_type = 'communication'
    story_id = 'eft-X'
    decision = 'Free plan editor 全開放'
    rationale = '...'
    forbidden_changes = @('禁加 isFreeUser 阻擋 ImagePanel')
    code_locations = @(@{file='src/X.tsx'; line=42; snippet='...'})
}
```

ADR layer (file): `docs/technical-decisions/ADR-IDD-COM-001-X.md`
Memory layer (file): `memory/intentional_idd_com_001.md` + MEMORY.md index entry

---

## Pattern 7: Tech Debt Upsert (DEFERRED / WON'T FIX)

CR 完成後非 FIXED items 走 upsert-debt.js。

```bash
node .context-db/scripts/upsert-debt.js --inline '{
  "td_id": "TD-001",
  "story_id": "td-pipeline-X",
  "severity": "medium",
  "category": "performance",
  "status": "deferred",
  "target_story": "td-X-perf-rescue",
  "description": "..."
}'
```

---

## Pattern 8: Workflow Tracking with Token Count

對齊 OTel + DevConsole Recent Activity。

```javascript
mcp__phycool-context__log_workflow({
    workflow_type: 'dev-story',
    status: 'success',
    agent_id: 'CC-OPUS',
    input_tokens: 12345,
    output_tokens: 8765,
    evidence_json: JSON.stringify({ files_changed: [...], db_status: 'review' })
});
```

---

## Pattern 9: Search with FTS5 + Filters

```javascript
// Multi-filter search
mcp__phycool-context__search_stories({
    query: '4-Tuple Identity',
    epic: 'epic-governance',
    status: 'review',
    domain: 'pipeline',
    complexity: 'L',
    limit: 10,
    include_details: true
});
```

---

## Pattern 10: Trace Cross-Story Context

debugging / RCA 場景。

```javascript
mcp__phycool-context__trace_context({
    story_id: 'td-pipeline-party-orchestrator-v4',
    include_decisions: true,
    include_debt: true,
    include_idd: true
});
// Returns full execution chain: Story + linked decisions + tech debt + IDD
```

---

## 通用準則

- **PowerShell 必走 `Invoke-PhycoolMcpSafe`** (內建 validate + UTF-8 + UTC+8 + retry)
- **JS / CLI scripts 必對照 §1 catalog required fields + Enum lowercase**
- **search-first 預防重複污染** (§5)
- **跨 worker 並行同 hot-row (story_id/idd_id/td_id) HARD_BLOCK** (對齊 parallel-batch-conflict-isolation T5.7)
