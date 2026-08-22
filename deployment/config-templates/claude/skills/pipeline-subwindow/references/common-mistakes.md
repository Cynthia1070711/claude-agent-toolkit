# Common Mistakes — 子視窗 10+ 反模式 + 避免方法

> Pipeline 子視窗(以及主視窗)在 DB / CLI / Skill 操作中容易踩的 base training pattern bias。每條附「為何 wrong + 避免方法 + 真實 incident 引用」。

---

## §1 模組路徑陷阱

### Anti-Pattern #1: `node -e "require('better-sqlite3')..."` 從專案根

```bash
# ❌ BAD
cd "${PROJECT_ROOT}"
node -e "const db=require('better-sqlite3')('.context-db/phycool.db'); ..."
# Error: Cannot find module 'better-sqlite3'
```

**為何 wrong**: `better-sqlite3` 只裝在 `.context-db/node_modules/`,Node.js 模組解析從 CWD 往上找,專案根 → C:\ → 根本找不到。

**避免方法**:
- ✅ 第一選擇: MCP `mcp__phycool-context__search_*` / `add_*`(23 tools 涵蓋大部分需求)
- ✅ 第二選擇: `cd .context-db && node -e "..."`(從正確 CWD 跑)
- ✅ 第三選擇: `node .context-db/scripts/*.js`(wrappers 已寫好相對路徑)
- ✅ 結構兜底: SKL-09 AC6 加 `$env:NODE_PATH` 含 `.context-db/node_modules`(Pipeline launch 時設,讓子視窗任何 CWD 可用)

**Incident**: 2026-05-08 SKL-04 sub-window dev-story 撞此陷阱;主視窗 2026-05-09 (`feedback_main_window_db_query_must_use_mcp.md`) 同樣犯錯。證明此為 base training bias 不限於子視窗。

---

### Anti-Pattern #2: 不確認 cwd 就跑 inline node

```bash
# ❌ BAD
node -e "console.log(require('better-sqlite3'))"
# 結果取決於 cwd,專案根會 crash,.context-db/ 會 OK
```

**為何 wrong**: PS1 / Bash 跑 inline node 不會自動 cd,sub-window 啟動 cwd 是 `$ProjectRoot`(專案根),不是 `.context-db/`。

**避免方法**: 寫 `cd .context-db && ...` 或用 `node .context-db/scripts/{wrapper}.js`(wrappers 內建 `path.join(__dirname, '../phycool.db')`)。

---

## §2 CLI 語法幻覺

### Anti-Pattern #3: `upsert-story.js --merge '{json}'` 漏 story-id arg

```bash
# ❌ BAD
node .context-db/scripts/upsert-story.js --merge '{"status":"review"}'
# Error: paths[0] argument must be of type string. Received undefined
```

**為何 wrong**: 子視窗以為 `--merge {json}` 是 2 args(Node.js 常見 CLI pattern),實際 script 預期 3 args:`--merge {story-id} --inline {json}`。

**避免方法**:
- ✅ 直接查 [upsert-story-cheatsheet.md](upsert-story-cheatsheet.md) §1 三模式
- ✅ Mode 2 標準語法: `node ... --merge {story-id} --inline '{json}'`
- ✅ Mode 3 替代: 寫 JSON 檔(內含 `story_id` 供人閱讀,但 CLI 仍需顯式帶 story-id)再 `--merge {story-id} {json-file}`

**Incident**: 2026-05-08 SKL-01 dev-story sub-window 連 3 次撞此語法,fallback chain 觸發 Cannot find module 'better-sqlite3' 連環錯。

---

### Anti-Pattern #4: 用 `--help` 期待 usage 提示

```bash
# ❌ BAD
node .context-db/scripts/upsert-story.js --help
# Error: ENOENT: '...\--help' as JSON file
```

**為何 wrong**: script 沒實作 `--help`,所有非 `--inline` / `--merge` 的 arg 都被當 JSON 檔路徑處理。

**避免方法**:
- ✅ Skill SKILL.md §3 cheatsheet 有完整 usage
- ✅ 載入 `pipeline-subwindow` skill(本 skill 就是 SoT)
- ✅ Read `.context-db/scripts/upsert-story.js` 開頭 30 行(usage 註解)

---

### Anti-Pattern #5: bash heredoc 多重轉義地獄

```bash
# ❌ BAD — 巢狀 escape 容易壞
node -e "const r = JSON.parse(\`{\\\"status\\\":\\\"review\\\"}\`); ..."
```

**為何 wrong**: Bash → Node 兩層 escape,backtick / 反斜線多重展開,易壞。

**避免方法**:
- ✅ 寫 temp .js 檔再執行: `Set-Content tmp.js '...'; node tmp.js; Remove-Item tmp.js`
- ✅ 用 JSON 檔模式(Mode 3)避免 inline JSON
- ✅ Edit/Write tool 對檔案直接寫(主視窗工具優勢,不走 Bash)

---

### Anti-Pattern #6: PowerShell inline JSON 含 backtick / dollar

```powershell
# ❌ BAD
node ... --inline '{"command":"`Get-Date`"}'
# PowerShell 對 backtick / $ 有特殊解釋
```

**為何 wrong**: PowerShell 的 backtick 是 escape 字元,`$` 觸發變數展開,inline JSON 含這兩字元易壞。

**避免方法**:
- ✅ Mode 3: 寫 JSON 檔(編輯器寫 raw 字元)
- ✅ 改用 Bash tool 跑(Bash 字元規則不同,但仍有 `$`/`backtick` 衝突)
- ✅ 終極辦法: `Edit` tool 改檔(完全避免 shell 字元解釋)

---

## §3 Lifecycle Invariant 違反

### Anti-Pattern #7: 直接 SQL UPDATE stories 表

```bash
# ❌ BAD — 繞過 upsert-story.js 全部守護
cd .context-db && node -e "
const db = require('better-sqlite3')('phycool.db');
db.prepare('UPDATE stories SET status=?, completed_at=? WHERE story_id=?')
  .run('done', '2026-05-09T...', 'skl-09-...');
"
```

**為何 wrong**: 跳過三層守護:
1. **Layer 1 auto-status-promotion** — 不會自動推 status(可能造成 review_completed_at 寫了但 status 還 review,違反 I3 invariant)
2. **Layer 5 invariant 驗證** — I1-I9 不變量檢查全 skip
3. **Hook chain** — skill-sync-gate / skill-idd-sync-gate / depth-gate 全不觸發

**避免方法**:
- ✅ 一律走 `node .context-db/scripts/upsert-story.js --merge {id} --inline '{json}'`
- ✅ 讀 [upsert-story-cheatsheet.md](upsert-story-cheatsheet.md) §1 三模式

**Incident**: `.claude/rules/story-lifecycle-invariants.md` 明文禁止,違反 = HARD BLOCK by Layer 5 validator。

---

### Anti-Pattern #8: 只設 status 不設 timestamp(I 不變量違反)

```bash
# ❌ BAD — status 設 done 但 review_completed_at 留 NULL
node .context-db/scripts/upsert-story.js --merge skl-09 --inline '{
  "status": "done"
}'
```

**為何 wrong**: 違反 I1-I7 lifecycle invariant(I3: status=done MUST review_completed_at IS NOT NULL)。upsert-story.js Layer 5 會 reject。

**避免方法**:
- ✅ 走 phase-aware timestamp 自動補強: `node scripts/record-phase-timestamp.js {story-id} review-complete`
- ✅ 或 inline 補: `"review_completed_at": "2026-05-09T..."`
- ✅ 完整推進對照表見 [upsert-story-cheatsheet.md](upsert-story-cheatsheet.md) §4 lifecycle 推進對照表

---

## §4 MCP / Tool 選擇

### Anti-Pattern #9: 沒先檢查 MCP write tool 可用就硬跑 CLI fallback

```bash
# ❌ BAD — 假設「stories 表沒 MCP write tool」就忽略其他需求
# 實際:add_context / add_tech / add_intentional_decision / add_cr_issue 都有
```

**為何 wrong**: 子視窗常見錯誤是「以為 MCP 寫工具全沒」就一律 CLI fallback,實際只有 stories 表(走 upsert-story.js)+ tech_debt_items 表(走 upsert-debt.js)無 MCP write,其他都有。

**避免方法**:
- ✅ 先想清楚目標表是什麼(stories / context_entries / tech_entries / IDD / cr_issues / tech_debt_items)
- ✅ 對照 [db-query-conventions.md](db-query-conventions.md) §優先順序矩陣
- ✅ 23 MCP tools 完整目錄: `mcp__phycool-context__search_*` / `add_*`

---

### Anti-Pattern #10: 用 grep 取代 MCP search

```bash
# ❌ BAD — grep .md 找歷史決策
grep -r "ECPay 退款政策" docs/
# 只能找 .md 文件,DB 內 context_entries / decisions 全 miss
```

**為何 wrong**: PhyCool 是 DB-first,Stories / Decisions / Patterns / Debug logs 都在 DB 不在 .md。grep .md 只查到 docs/,DB 內容全漏。

**避免方法**:
- ✅ `mcp__phycool-context__search_context({query, filters: {category, include_content: true}})`
- ✅ `mcp__phycool-context__search_documents({keyword, category})`(技術文件)
- ✅ FTS5 全文搜尋(>= 3 字元),空字串回傳最近 N 筆

---

## §5 子視窗特有陷阱

### Anti-Pattern #11: 看到 manual approval prompt 就傻等

```
"This action requires permission. Approve? (y/n)"
# 子視窗無人值守 → stuck → 30+ 分鐘 timeout
```

**為何 wrong**: SKL-08 hotfix(2026-05-08)後 `--dangerously-skip-permissions --chrome` 已 bypass,**不該再見此 prompt**;若仍見 = 新 bug。

**避免方法**:
- ✅ **立即寫入 signal file 通知中控**: `echo "ASK_PROMPT_DETECTED" > $env:PIPELINE_SIGNAL_FILE`
- ✅ 報告 sub-window 觀察的 prompt 細節到 add_context 紀錄(category=debug)
- ❌ **不要硬等 timeout** — 浪費 30 分鐘

**Incident**: 2026-05-08 SKL-04 sub-window dev-story 卡 manual approval 40min stuck。SKL-08 hotfix 加回 `--dangerously-skip-permissions --chrome` 解決。

---

### Anti-Pattern #12: tasks 字串格式錯亂(.md vs DB 不同)

```bash
# ❌ BAD — DB tasks 欄位用 .md 格式
"tasks": "- [x] Task 1: ...\n- [ ] Task 2: ..."

# ✅ GOOD — DB tasks 欄位專用格式
"tasks": "- ✅ Task 1: ... (file:line)\n- ⬜ Task 2: ... (deferred)"
```

**為何 wrong**: `.claude/rules/tasks-backfill.md` 規定 DB 格式為「✅ 在前 (file:line) 在後」,跟 .md 的 `[x]` checkbox 不同。tasks-backfill-verify Skill 解析時會 reject 錯格式。

**避免方法**:
- ✅ 走 `tasks-backfill-verify` Skill(機械化生成正確格式)
- ✅ 對照 `.claude/rules/tasks-backfill.md` 規範

---

## §6 反模式速查表

| # | 反模式 | 一句避免 |
|:-:|--------|---------|
| 1 | `node -e "require('better-sqlite3')..."` 專案根 | MCP-first,fallback 走 `cd .context-db && ...` |
| 2 | 不確認 cwd 跑 inline node | wrapper 一律 `cd .context-db &&` 或 `.context-db/scripts/*.js` |
| 3 | `--merge '{json}'` 漏 story-id | 三 args: `--merge {id} --inline {json}` |
| 4 | `--help` 幻覺 | 載入 pipeline-subwindow Skill 查 cheatsheet |
| 5 | bash heredoc 多重轉義 | 寫 temp .js 或用 Edit/Write tool |
| 6 | PowerShell backtick / `$` 衝突 | JSON 檔模式 OR Edit tool |
| 7 | 直接 SQL UPDATE stories | 一律 upsert-story.js(三層守護) |
| 8 | 只設 status 不設 timestamp | record-phase-timestamp.js 自動補 |
| 9 | 假設 MCP write 全沒 | 對照優先順序矩陣(只 stories + tech_debt 無 MCP write) |
| 10 | grep .md 取代 MCP search | DB-first,走 search_context / search_documents |
| 11 | 等 manual approval 傻等 | 寫 signal file 通知中控,SKL-08 hotfix 後不該見此 |
| 12 | tasks 用 `[x]` 格式 | DB 格式「✅ 在前 (file:line) 在後」 |

---

## §7 Self-Check(每次 DB / CLI 操作前 3 題)

1. **「我有 MCP tool 可用嗎?」** → 對照優先順序矩陣
2. **「我跑 CLI / inline node,cwd 對嗎?」** → 預設應 `cd .context-db/` 或走 wrapper script
3. **「我設 status,對應 timestamp 設了嗎?」** → I1-I9 invariant,Layer 5 會 BLOCK

---

## §8 References

- [db-query-conventions.md](db-query-conventions.md) — DB 操作 BAD/GOOD 對照
- [upsert-story-cheatsheet.md](upsert-story-cheatsheet.md) — CLI 完整範例
- [path-reference.md](path-reference.md) — 專案路徑速查
- `.claude/rules/story-lifecycle-invariants.md` — I1-I9 完整定義
- `.claude/rules/tasks-backfill.md` — DB tasks 格式規範
- `memory/feedback_main_window_db_query_must_use_mcp.md` — 主視窗也犯錯的 incident
