# DB Query / Write Conventions — BAD/GOOD 對照

> Pipeline 子視窗常見 DB 操作模式,先 MCP 後 CLI,絕不裸跑 better-sqlite3 從專案根。

## §1 讀取 stories 表

### BAD

```bash
# ❌ 從專案根 inline node + require('better-sqlite3')
cd "${PROJECT_ROOT}"
node -e "const db=require('better-sqlite3')('.context-db/phycool.db'); ..."
# Error: Cannot find module 'better-sqlite3'
# 原因: better-sqlite3 只裝在 .context-db/node_modules/
```

### GOOD

```bash
# ✅ 方法 1(首選): MCP search_stories
# Tool: mcp__phycool-context__search_stories
# Args: { story_id: "skl-01-...", include_details: true }
# 回傳: 完整 Story 物件含 AC/tasks/dev_notes/file_list

# ✅ 方法 2(MCP 不夠時): cd .context-db/ 再 node -e
cd .context-db && node -e "
const db = require('better-sqlite3')('phycool.db', {readonly: true});
const r = db.prepare('SELECT * FROM stories WHERE story_id = ?').get('skl-01-...');
console.log(JSON.stringify(r, null, 2));
"
```

## §2 寫入 stories 表

### BAD

```bash
# ❌ 直接 SQL 繞過 upsert-story.js → 破壞 lifecycle invariants
cd .context-db && node -e "
const db = require('better-sqlite3')('phycool.db');
db.prepare('UPDATE stories SET status=?, completed_at=? WHERE story_id=?')
  .run('done', '...', 'skl-01-...');
"
# 風險: 跳過 I1-I9 invariant 檢查 / 跳過 auto-status-promotion / 跳過 skill-sync-gate
```

### GOOD

```bash
# ✅ 走 upsert-story.js(內建 invariant + auto-promotion + sync gate hooks)
node .context-db/scripts/upsert-story.js --merge skl-01-pressure-test-and-forbidden-closure --inline '{
  "status": "review",
  "dev_agent": "CC-SONNET",
  "file_list": [".claude/skills/skill-builder/SKILL.md"]
}'
```

## §3 讀取 context_entries(decisions / debug / sessions)

### GOOD

```
# ✅ MCP search_context(優先)
Tool: mcp__phycool-context__search_context
Args: { keyword: "ECPay refund", category: "decision", limit: 5 }

# ✅ MCP search_documents(技術文件)
Tool: mcp__phycool-context__search_documents
Args: { keyword: "auth identity", category: "functional-spec" }
```

### BAD

```bash
# ❌ inline node 從專案根
node -e "const db=require('better-sqlite3')..."
# → Cannot find module
```

## §4 寫入 context_entries / tech_entries / IDD

### GOOD

```
# ✅ 全部走 MCP write tools
mcp__phycool-context__add_context           # decisions / patterns / debug
mcp__phycool-context__add_tech              # technical solutions
mcp__phycool-context__add_intentional_decision  # IDD-COM/STR/REG/USR
mcp__phycool-context__add_cr_issue          # CR findings
```

### Tech Debt 例外

```bash
# tech_debt_items 表沒有 MCP write tool
# 走 CLI:
node .context-db/scripts/upsert-debt.js --inline '{
  "title": "...",
  "story_id": "...",
  "severity": "...",
  ...
}'
```

## §5 Lifecycle Invariants 守則

寫 stories 表時必經由 `upsert-story.js`,因為它內建:

- **Layer 1**: auto-status-promotion(create_completed_at 設了 → status 自動推 ready-for-dev)
- **Layer 5**: I1-I9 invariant 驗證(started_at / completed_at / agent 對稱)
- **Hook**: skill-sync-gate / skill-idd-sync-gate / depth-gate 觸發

**直接 SQL UPDATE 會跳過全部三層**,造成 DB 污染 + 下次 Agent 讀錯狀態。

## §6 BAD/GOOD 速查

| 場景 | BAD(❌) | GOOD(✅) |
|------|---------|---------|
| 查 Story 詳情 | `node -e "require('better-sqlite3')..."` | `mcp__phycool-context__search_stories` |
| 改 Story status | 直接 SQL UPDATE | `upsert-story.js --merge {id} --inline '{...}'` |
| 查歷史決策 | grep docs | `mcp__phycool-context__search_context` |
| 加 tech debt | 寫 yaml | `upsert-debt.js --inline '{...}'` |
| 加 IDD | 編 ADR + 手動 SQL | `mcp__phycool-context__add_intentional_decision` |
| 確認 story 是否存在 | grep .md | `search_stories` 看回傳是否 null |

## §7 為什麼專案根撞 better-sqlite3

```
project-root/
├── node_modules/                    ← 沒有 better-sqlite3
├── .context-db/
│   ├── node_modules/
│   │   └── better-sqlite3/          ← 在這裡
│   ├── phycool.db
│   └── scripts/
│       └── upsert-story.js
```

Node.js 模組解析從 CWD 往上找,專案根 → C:\ → 根本找不到 `.context-db/node_modules/`。

**結論**: 跑 better-sqlite3 必先 `cd .context-db/`,或用 `.context-db/scripts/*.js` wrapper(它們相對路徑寫好了)。

> 結構性兜底見 SKL-09 §C: `story-pipeline-interactive.ps1` 加 `$env:NODE_PATH` 含 `.context-db/node_modules`(讓子視窗從任何 CWD 可用)。
