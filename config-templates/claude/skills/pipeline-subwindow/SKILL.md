---
name: pipeline-subwindow
description: Pipeline 子視窗執行紀律 — DB query/write 黃金路徑、專案路徑標註、常見錯誤模式、權限慣例、MCP-first 原則。當子視窗執行 dev-story / code-review / tasks-backfill 時 MUST LOAD 此 skill 取得本專案規範,避免 better-sqlite3 模組路徑、upsert-story.js CLI 語法、compound cd permission 等已知陷阱。觸發關鍵字:pipeline subwindow, sub-window conventions, dev-story conventions, code-review conventions, better-sqlite3, upsert-story syntax, MCP write story
version: 1.3.1
updated: 2026-08-02
disable-model-invocation: false
user-invocable: true
triggers:
  - pipeline subwindow
  - sub-window conventions
  - dev-story conventions
  - code-review conventions
  - better-sqlite3
  - upsert-story syntax
  - common mistakes catalog
  - path reference quick lookup
  - D1 directive
  - 中控指示
author: CC-OPUS
created: 2026-05-08
last-synced-epic: epic-whp
last-synced-date: 2026-08-02
---

# Pipeline Subwindow Conventions

> **Purpose**: Pipeline 子視窗(create-story / dev-story / code-review)執行時 SoT 規範,避免重複觸發 base training pattern bias 引起的已知錯誤。
>
> **MUST LOAD**: 子視窗 launch 時優先載入(由 `story-pipeline-interactive.ps1` shortPrompt 引導 + Skill 自動 trigger)。

---

## §1 概述 — 子視窗執行紀律

### Core Principle

> **MCP-first, CLI-fallback, 一律先 cd `.context-db/`**

子視窗常見錯誤都源自三個 base training bias:
1. 用 `node -e "require('better-sqlite3')..."` 從專案根撞模組路徑
2. 幻覺 `upsert-story.js --merge '{json}'` 語法(實際需 3 args)
3. 用 compound `cd && node ...` 觸發 claude CLI hardcoded 防護(SKL-08 已 hotfix `--dangerously-skip-permissions`)

本 skill **不教你做什麼**(workflow 教),**只教你別踩什麼坑**。

### Sub-Window Self-Check(每次需要 DB / CLI 操作前)

1. 「我要查 / 寫 stories 表嗎?」 → **先 MCP `search_stories`** 而非 `node -e ...`
2. 「我要寫 stories 表(status/tasks/file_list)?」 → MCP **無寫工具**,**必走 `upsert-story.js`** + 查 §3 cheatsheet 確認語法
3. 「我用 better-sqlite3 直接連 DB?」 → **絕對先 `cd .context-db/`** OR 用 `.context-db/scripts/*.js` wrapper
4. 「我用 compound `cd "..." && node ...`?」 → **可以**(SKL-08 hotfix 後 `--dangerously-skip-permissions` 已 bypass),但仍**不推薦**(可讀性差)

---

## §2 DB Query/Write 黃金路徑

### 優先順序矩陣

| 操作 | 第一選擇 | Fallback | 絕對禁止 |
|------|---------|---------|---------|
| **讀 stories** | `mcp__phycool-context__search_stories({story_id, include_details:true})` | `cd .context-db && node -e "..."` | 從專案根 `node -e "require('better-sqlite3')..."` |
| **寫 stories** | _(MCP 無寫工具)_ | `node .context-db/scripts/upsert-story.js --merge {id} --inline '{json}'` | 直接 SQL UPDATE 繞過 lifecycle invariants |
| **讀 context_entries** | `mcp__phycool-context__search_context` | 同上 fallback | 從專案根 |
| **寫 context_entries** | `mcp__phycool-context__add_context` | 同上 fallback | 直接 INSERT 繞過 schema |
| **寫 tech debt** | `node .context-db/scripts/upsert-debt.js --inline '{json}'` | — | registry.yaml(已 deprecated) |
| **讀 IDD** | `mcp__phycool-context__search_intentional_decisions` | — | — |
| **寫 IDD** | `mcp__phycool-context__add_intentional_decision` | — | — |

> 詳見 [db-query-conventions.md](references/db-query-conventions.md) BAD/GOOD 對照範例

---

## §3 upsert-story.js CLI Cheatsheet

### 三種模式(必記)

```bash
# 1. 新建 Story(JSON 含 story_id)
node .context-db/scripts/upsert-story.js --inline '{"story_id":"xxx",...}'

# 2. 部分更新 — inline JSON(最常用)
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{"status":"review",...}'

# 3. 部分更新 — JSON 檔案(story-id 為必要 positional arg,JSON 檔內可另含 story_id 但 CLI 不會回推)
node .context-db/scripts/upsert-story.js --merge {story-id} {json-file-path}
```

### ❌ 常見錯誤語法

```bash
# 錯誤 1: --merge 漏 <story-id> positional arg
node ... --merge '{"status":"review"}'
# → paths[0] argument must be of type string. Received undefined

# 錯誤 2: 用 --help(本 script 沒實作 --help)
node ... --help
# → ENOENT: --help 被當作 JSON 檔案路徑

# 錯誤 3: compound cd 多餘
cd "..." && node .context-db/scripts/upsert-story.js ...
# → SKL-08 hotfix 後不會卡 permission,但仍是 anti-pattern
```

> 完整範例見 [upsert-story-cheatsheet.md](references/upsert-story-cheatsheet.md)

---

## §4 Common Mistake Patterns

### Top 5 反模式

| # | 反模式 | 為何 wrong | 正確做法 |
|:-:|--------|-----------|---------|
| 1 | `node -e "require('better-sqlite3')..."` 從專案根 | better-sqlite3 只裝在 `.context-db/node_modules/` | `cd .context-db && node -e "..."` 或用 MCP |
| 2 | `--merge '{json}'`(漏 story-id arg) | CLI 預期 `--merge <id> --inline <json>` 三 arg | 查 §3 cheatsheet |
| 3 | `node -e` 含未轉義 backtick / 反斜線 | Bash → Node escape 巢狀地獄 | 寫 temp .js 檔再執行 |
| 4 | 直接 SQL UPDATE stories 表 | 繞過 I1-I9 lifecycle invariants | 走 upsert-story.js(內建 auto-promotion + invariant 驗證) |
| 5 | sub-window 用 inline node 寫 stories 而不先試 MCP write | MCP 雖無 stories write 但 `add_context`/`add_tech` 等其他寫工具可能適用 | 先確認需求是否 stories 表 |

> 完整 10+ 反模式 + 避免方法見 [common-mistakes.md](references/common-mistakes.md)

---

## §5 Permission Conventions(SKL-08 hotfix 後)

### 現況(2026-05-08+)

`story-pipeline-interactive.ps1` line 933 已加 `--dangerously-skip-permissions --chrome`(Bug#19 hotfix):
- ✅ compound `cd && ...` 不再彈 manual approval
- ✅ Long inline JSON(>948 bytes)不再彈 Command too long
- ✅ Chrome integration 啟用(支援 Chrome MCP live verify)
- ⚠️ 待驗:Bug#18 描述的「`bypassPermissions` hardcoded `.claude/` ask」是否仍存

### 子視窗 Permission 慣例

- ✅ **直接執行所需操作**(Edit/Write/Bash 不需顧慮 manual approval)
- ✅ **修改 `.claude/` 下檔案 OK**(skill / rule / config),只要遵守 skill-tool-invocation-mandatory v1.1.0 自舉條款
- ❌ **仍禁止**:刪除 `.git/` / 修改 `node_modules/` / 觸碰 secrets

---

## §6 Path Reference Quick Lookup

| 路徑 | 用途 |
|------|------|
| `.context-db/` | SQLite DB(`phycool.db`)+ scripts(`upsert-story.js` 等)+ `node_modules/`(better-sqlite3) |
| `.claude/skills/phycool-*/` | SaaS 模組 Skill(60+) |
| `.claude/skills/{workflow}/` | Workflow / Utility Skill(non-SaaS) |
| `.claude/rules/` | 載入規則 + Hook 規則 + Skill Sync Gate 等守護 |
| `.claude/hooks/` | UserPromptSubmit / Stop / PreCompact 等 hook script |
| `_bmad/bmm/workflows/` | BMAD M-tier workflow(create-story/dev-story/code-review) |
| `docs/implementation-artifacts/` | Story-related artifacts(specs/reviews;`sprint-status.yaml` 已凍結 2026-07-28,純歷史快照) |
| `docs/tracking/active/` | Story tracking .md(working log,非 Story 鏡像) |
| `docs/technical-decisions/` | ADR |
| `src/YourApp/` | C# backend code |
| `src/Editor/` | React frontend code |
| `tools/dev-console/` | DevConsole Web UI(讀 DB) |
| `scripts/` | 通用 PS1 / Node 腳本(check-hygiene / record-phase-timestamp) |

> 完整 20+ 路徑 + cwd 慣例見 [path-reference.md](references/path-reference.md)

---

## §7 References

- [db-query-conventions.md](references/db-query-conventions.md) — BAD/GOOD 完整對照(7 場景)
- [upsert-story-cheatsheet.md](references/upsert-story-cheatsheet.md) — CLI 完整範例(3 模式 + 4 use-case + 4 錯誤)
- [common-mistakes.md](references/common-mistakes.md) — 12 條反模式 + 避免方法 + Self-Check
- [path-reference.md](references/path-reference.md) — 20+ 路徑速查 + cwd 慣例 + 子視窗 cwd 預設行為

---

## §8 D1 中控指示注入(whp-6,子視窗開場必知)

> 完整格式契約 + worker 4 步處理協議見 `protocol-template.md`(BMAD 三階段)/ `general-protocol-template.md`(Mode C)「中控指示處理協議」章節 — 本節只講**子視窗第一時間該做什麼判斷**,不重複格式細節。

子視窗(任一 `worker-{create,dev,review,general}.ps1`)啟動時,`$userTask` 有機率被**前綴**(非附加)一段:

```
========== 中控指示(D1 開場注入 · 必讀後執行)==========
[中控指示 seq=N type=T msg_id=M]
...
========== 中控指示結束 · 讀畢後先執行指示,再繼續原任務 ==========
```

看到此 banner 時:

1. **這不是使用者訊息,是中控留言** — 讀完整段落(banner 內可能有多則,依 `seq` 順序)
2. **先執行指示內容,再繼續原本的 Story/任務**(banner 本身已明講此順序)
3. **回覆走 `progress`/`report` msg_type,絕不是 `answer`**(`answer` 為 controller-to-worker 方向保留值,worker 回覆用錯會被 `worker-protocol-ops.js` 的 `MSG_TYPES_BY_DIRECTION` 拒收)
4. **同一 session 內若收到後續指示,不代表視窗會自動關閉**(2026-08-01 whp-2 起視窗永不自動關閉,中控隨時可能在同一 session 追加指示)

沒看到 banner(多數情況,`worker_messages` 無待送指示或 DB 不可用)= 正常,不需任何額外動作(D1 讀取器 `read-worker-directives.js` fail-open,靜默無輸出)。

---

## §9 回報後視窗語意(whp-8)

`claude` 退出後,4 支 `worker-{create,dev,review,general}.ps1` 的收尾段會把視窗標題從啟動時的「[⚠ 勿關閉]」改為「**[⚠ 待中控確認 · 勿關閉]**」,收尾警語同時提及 `close-worker.ps1`(中控唯一程式化關窗途徑)與 DevConsole `/workers`(可查詢待辦狀態)。此為純外觀變更,不影響子視窗 agent 本身行為 —— agent 不需對此做任何動作,僅供**人**(或中控)判讀視窗當前狀態:「執行中」vs「已回報、等待簽收」。

實際簽收信號走 DB(`worker_runs.lifecycle`:`running`/`revising` → `reported` → `awaiting-review` → `approved` → `closed`,由 `stop-report.ps1` 的 CAS + `ack_worker_run`/`gate_worker_run` 推進),中控亦可經 `.claude/hooks/worker-notify-inject.js`(`UserPromptSubmit` hook)被動收到「N 筆待確認」提示,不需主動查視窗標題。

---

## FORBIDDEN

- ❌ 從專案根直接 `node -e "require('better-sqlite3')..."`(必先 cd .context-db/)
- ❌ `upsert-story.js --merge '{json}'`(必三 arg `--merge {id} --inline {json}`)
- ❌ 直接 SQL UPDATE/DELETE stories 繞過 upsert-story.js
- ❌ MCP 寫工具有缺(stories write)不報告就硬跑 CLI fallback — 先確認需求是否真的需要 stories 表
- ❌ 子視窗看到 permission prompt 就 stuck — SKL-08 hotfix 後本不該再彈,若仍彈則是新 bug,**回報主控端 + 不要硬等 timeout**
- ❌ **(whp-6)開場看到 `[中控指示 seq=N type=T msg_id=M]` banner 誤判為使用者輸入而忽略,或直接繼續原任務不先處理** — banner 已明講「讀畢後先執行指示,再繼續原任務」,詳 §8

## Self-Check(每次 sub-window 操作前)

1. 「我要做的操作有 MCP tool 嗎?」 → 有 → 用 MCP
2. 「無 MCP → 我用 CLI script,是否從正確 cwd 執行?」 → `.context-db/` 為基準
3. 「我用 compound 命令(cd && / | / 等)?」 → SKL-08 後不會卡 permission,但仍**避免**(可讀性 / fallback 觸發點)
4. 「我直接 SQL?」 → STOP — 走 upsert-story.js(invariant 保護)
5. 「(whp-6)我的開場提示是否含 `[中控指示 seq=N type=T msg_id=M]` banner?」 → 有 → 先執行指示、回覆用 `progress`/`report`、以標籤行的 `msg_id` 呼叫 `--consume` 收尾,再繼續原任務(§8)

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.3.1** | **2026-08-02** | **`bwu-10-doc-mirror-and-workflow-drift` `--merge` arity 全面收斂**。§3 upsert-story.js CLI Cheatsheet 模式 3(檔案路徑形式)由兩參數 `--merge {json-file-path}` 改為三參數 `--merge {story-id} {json-file-path}`;`references/upsert-story-cheatsheet.md` 的 Mode 3 範例與 `references/common-mistakes.md` 標為 `✅ Mode 3 替代` 的條目同步修正,兩處皆補 positional arg 說明(JSON 檔內可含 `story_id` 供人閱讀,但 CLI 以 `args[1]` 取 storyId、不從 JSON 內容回推)。三處明確標為 `❌` 的錯誤示範區塊(SKILL.md §3 錯誤 1 / common-mistakes.md Anti-Pattern #3 / upsert-story-cheatsheet.md 錯誤 1)逐字保留兩參數原文不動,反例仍需示範失敗形式。`.context-db/scripts/upsert-story.js` 本身零變更(僅修正描述該 CLI 的文檔,對齊 `IDD-STR-003` forbidden change 界線)。走 `Skill(skill="skill-builder")` Mode B。 |
| **1.3.0** | **2026-08-02** | **`whp-8-report-ack-notify` Skill Sync(Task T5.2)**。新增 §9「回報後視窗語意」—— 4 支 worker-*.ps1 收尾段標題由「[⚠ 勿關閉]」改為「[⚠ 待中控確認 · 勿關閉]」(啟動段不變)+ 收尾警語補 `close-worker.ps1`/DevConsole `/workers` 指引;純外觀變更,子視窗 agent 不需對此做任何動作,實際簽收信號走 `worker_runs.lifecycle` 狀態機 + 新 `.claude/hooks/worker-notify-inject.js`(`UserPromptSubmit` 第 5 顆 hook)被動通知中控。走 `Skill(skill="skill-builder")` Mode B。 |
| **1.2.1** | **2026-08-01** | **`whp-6` code-review 修復同步(D1 banner 加 `msg_id` 欄位)**。CR 發現 G16 格式契約斷裂:`read-worker-directives.js` 的 `formatDirectiveBlock` 只印 `seq` 與 `type`,但兩份 protocol template 的四步行為約定第 4 步要求 worker 以 `--consume {msg_id}` 收尾,而 `--consume` 的 CAS 只吃 `msg_id` 主鍵(`seq` 是 run 內序號)—— worker 結構上無從取得該值,consume 半場不可達,`monitoring_plan` 第 2 項「消費落差」指標必然永久成長。CR 已修讀取器輸出為 `[中控指示 seq=N type=T msg_id=M]` 並同步兩份 protocol template;本 skill 的 §8 格式示意、FORBIDDEN 該條、Self-Check 第 5 題三處 banner 字面同步對齊(Self-Check 第 5 題另補 consume 收尾動作)。走 `Skill(skill="skill-builder")` Mode B。 |
| **1.2.0** | **2026-08-01** | **`whp-6-directive-delivery-and-close` Skill Sync(Task 6.2)**。新增 §8「D1 中控指示注入(子視窗開場必知)」—— 子視窗啟動時 `$userTask` 可能被前綴 `[中控指示 seq=N type=T]` banner,補 4 點判斷(非使用者訊息 / 先執行指示再繼續原任務 / 回覆用 `progress`/`report` 非 `answer` / 視窗永不自動關閉故同 session 可能收到後續指示),指向 `protocol-template.md`/`general-protocol-template.md` 取完整格式契約(本節只講開場判斷,不重複格式細節)。FORBIDDEN 新增 1 條(誤判 banner 為使用者輸入)+ Self-Check 新增第 5 題。frontmatter `last-synced-epic` `epic-skl`→`epic-whp`,triggers 加 "D1 directive"/"中控指示"。走 `Skill(skill="skill-builder")` Mode B。 |
| **1.1.1** | **2026-07-28** | **tdb-2-sprint-status-freeze-refs BR-015**:§6 路徑速查表 `docs/implementation-artifacts/` 說明移除 sprint-status 字面(改註記已凍結);`references/path-reference.md` 對應行改為「已凍結(2026-07-28)· 純歷史快照,禁讀寫」+ SoT 補 `track_plan`。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **1.1.0** | **2026-05-09** | **SKL-09 完整交付**。新增 [common-mistakes.md](references/common-mistakes.md) 12 條反模式 + [path-reference.md](references/path-reference.md) 20+ 路徑速查 + cwd 慣例。Pipeline PS1 line 922-925 加 `$env:NODE_PATH` bootstrap(better-sqlite3 從任何 cwd 可 require)+ line 837-838 加 `[MUST LOAD] pipeline-subwindow` 短指引(三 phase 共用 prompt template,自動全 phase 注入)。trigger keywords 加 "common mistakes catalog" / "path reference quick lookup"。AC1-AC8 全 satisfied,進 review 待 next pipeline launch live verify。 |
| 1.0.0 | 2026-05-08 | Initial creation. SKL-09 主視窗手動實作。觸發事件:SKL-01/04 子視窗連環撞 better-sqlite3 / upsert-story.js / compound cd 三大陷阱。採 A+C 雙重保險(本 skill 為 A 認知層,PS1 NODE_PATH env 為 C 結構層)。 |
