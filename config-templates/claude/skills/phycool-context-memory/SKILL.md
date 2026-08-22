---
name: phycool-context-memory
description: >
  PhyCool Context Memory DB 標準 — 55 實體基表 + 14 FTS5 虛擬表(計數口徑:PRAGMA 實測 2026-08-03,
  `sqlite_master` type='table' 非 sqlite_% 總數 125 = 55 實體基表 + 14 FTS5 主表 + 56 FTS5 影子表;
  含 ECC instincts/observations_queue/instincts_rejected/generated_skills/effect_metrics + epic-whp
  worker_runs/worker_messages/worker_handoffs/guardian_heartbeat + epic-ccb ctrl_threads/ctrl_messages/
  ctrl_message_reads/ctrl_boards + ccb-4 controller_windows + epic-tdb track_plan)+ 36 MCP Tools、
  Hook triple-write (Stop/SessionEnd/PreCompact/SessionStart)、5-layer memory、
  Sync Engine UoW、CMI-10 Hybrid Fusion 3-tier fallback (ONNX→Hybrid→LIKE)、
  Pipeline Context Recovery、PRAGMA-first DB query discipline (V2-01-FIX 2026-05-08)。詳 triggers。
version: 3.5.10
updated: 2026-08-04
last_synced_epic: epic-bwu
last_synced_date: 2026-08-04
last_synced_story: bwu-14-inject-budget-dimension-and-mirror
watches:
  - glob: ".context-db/server.js"
  - glob: ".context-db/scripts/init-db.js"
  - glob: ".context-db/scripts/upsert-*.js"
  - glob: ".context-db/scripts/reap-*.js"
  - glob: ".context-db/scripts/worker-protocol-ops.js"
  - glob: ".context-db/scripts/ctrl-channel-ops.js"
  - glob: ".context-db/scripts/import-ctrl-channel.js"
  - glob: ".context-db/scripts/migrate-track-plan.js"
  - glob: ".context-db/scripts/log-session.js"
  - glob: ".context-db/scripts/incremental-embed.js"
  - glob: ".claude/hooks/pre-prompt-rag.js"
  - glob: ".claude/hooks/precompact-tool-preprune.js"
triggers:
  - context memory
  - context_entries
  - phycool-context
  - search_context
  - search_tech
  - search_stories
  - search_debt
  - search_intentional_decisions
  - search_documents
  - search_glossary
  - search_god_nodes
  - search_symbols
  - search_conversations
  - semantic_search
  - trace_context
  - hybrid search
  - CMI-10
  - 5-layer memory
  - tech_entries
  - stories table
  - god_nodes
  - rule_violation
  - PRAGMA verify
  - db schema first
  - sync engine
  - triple-write hook
  - pipeline context recovery
author: CC-OPUS
created: 2026-02-04
---

# PhyCool Context Memory DB Standard v3.1

> **Purpose**: PhyCool 平台 Context Memory DB(SQLite + FTS5 + MCP)的完整規範 — DB schema、32 MCP tools、Hook 機制、5-Layer Memory 架構、Sync Engine UoW、CMI-10 Hybrid Fusion 3-tier fallback、Rule Violation Tracker。
>
> **CRITICAL §DB Schema-First Mandate**: 任何 SQL / Node script 引用 column name **必先 PRAGMA verify 或 Read `references/db-schema.md` Cheatsheet**,不得依賴記憶推測(V2-01-FIX 2026-05-08)。

> **2026-05-16 v3.0.0 Progressive Disclosure 重構**: 原 1127 行 monolithic 拆為核心 ≤300 行 + 5 references/*.md。完整內容按需 Read 對應子檔。

---

## 系統總覽(brief — 完整見 references/)

| 章節 | 一句話定位 | 完整 spec |
|------|------------|---------|
| **§1 Architecture Overview** | SQLite + FTS5 + MCP server.js + 55 實體基表 + 14 FTS5 虛擬表(2026-08-03 PRAGMA 實測,計數口徑見 §0)+ Hook triple-write triple-insurance | [references/architecture-overview.md](references/architecture-overview.md) |
| **§2 DB Schema + §3 MCP Tools** | context_entries / tech_entries / stories / tech_debt_items / intentional_decisions / god_nodes / documents / conversations / worker_runs(epic-whp)/ ctrl_threads + controller_windows(epic-ccb)/ track_plan(epic-tdb)/ etc. + search_*/add_*/log_workflow 共 36 tools(24 stable + 4 instinct WIP + 4 worker-protocol,epic-whp + 4 ctrl-channel,epic-ccb) | [references/db-schema-mcp-tools.md](references/db-schema-mcp-tools.md) |
| **§4-§8 Memory + Hook + Fusion** | Hook triple-write insurance + 5-Layer Memory(session/decision/tech/debt/IDD)+ CMI-10 Hybrid Search 3-tier fallback + S_final 4-Axis Fusion + Doc Taxonomy + Sync Engine UoW | [references/memory-hook-fusion.md](references/memory-hook-fusion.md) |
| **§9 + §12-§13 DevConsole + Workflow + Troubleshoot** | DVC Web UI 4 區塊(stories / rules / debt / IDD)+ Workflow Integration Pattern(dev-story / CR / Stop hook)+ 常見 troubleshooting | [references/devconsole-workflow.md](references/devconsole-workflow.md) |
| **§15-§15.2 Rule Violation Tracker** | ctr-p2-violation-tracker + Phase 3 L1 Observer Auto-Detect Hook + Phase 4 Workflow Entry Gate(完整 38+ keyword + 30d 觀察期 + 4-block dashboard) | [references/rule-violation-tracker.md](references/rule-violation-tracker.md) |

---

## §10 Language Charter (CRITICAL)

All user-facing output (DevConsole / CLI / error messages) MUST use Traditional Chinese (zh-TW).

DB content 中:
- `category` 欄位 = English(`session` / `decision` / `pattern` / `debug` / `intentional` / `rule_violation` / etc.)
- `title` / `content` 欄位 = zh-TW + technical terms in English(保留 API/JWT/CSRF/file paths)
- `tags` 欄位 = English kebab-case(`token-reduction` / `skill-modularization`)

詳對齊 `.claude/rules/constitutional-standard.md` §Language Standard。

---

## §11 Token Reduction

Context Memory DB 是 PhyCool token 減量策略核心:
- Always-on 規範通過 paths-scoped rules + Cross-Ref Discipline 機制控制
- Skill modularization(P2 wave 1-3)拆 SKILL.md 至 ≤300 行 core + references/
- MEMORY.md compression(P1-6)88 bullets → 30 core + DB pointer
- Hook intent detection(Phase 3)依 prompt intent 條件注入

詳完整策略見 `claude token減量策略研究分析/環境配置優化建議-20260516/`(本地 gitignored)。

---

## §14 FORBIDDEN

❌ **SQL / Node script 引用 column name 不 PRAGMA verify**
   Common Rationalization: "我記得 X 表有 created_at"
   Red Flag: `SELECT created_at FROM context_entries`(實 = `timestamp`)/ `SELECT id FROM intentional_decisions`(實 PK = `idd_id` TEXT)/ `UPDATE embedding_queue SET status='done'`(實 = `processed` INTEGER)— 必先 PRAGMA table_info 或 Read `references/db-schema.md` Cheatsheet
   (2026-05-08 V2-01-FIX,記憶推測 silent fail / silent corrupt)

❌ **JavaScript `new Date().toISOString()` 寫 DB timestamp**
   Common Rationalization: "ISO 8601 是標準格式"
   Red Flag: timestamp 比實際早 8 小時
   (constitutional-standard.md §Timestamp Mandate — 必 UTC+8,JS 用 `nowTs()` helper / SQLite 用 `datetime('now', '+8 hours')`)

❌ **直接 sqlite3 CLI 寫入 phycool.db**(繞過 MCP schema validation)
   應走 MCP `add_*` / CLI `upsert-*.js` / 或 server.js 內 prepared statements

❌ **跨 worker 並行同 `story_id` / `idd_id` / `td_id` upsert**
   Red Flag: SQLITE_BUSY 並行 race(對齊 `parallel-batch-conflict-isolation.md` T5.7 HARD_BLOCK 偵測 + busy_timeout=5000 server-side baseline)

❌ **PS Set-Content -Encoding UTF8 寫 JSON IPC**
   Red Flag: BOM 寫入 → Node.js ConvertFrom-Json 失敗
   (用 `Write-JsonFile` helper 或 `[System.IO.File]::WriteAllText(... UTF8Encoding(false))`)

❌ **跳過 search-first 重複 add_context 同樣 entry**
   Red Flag: DB 多筆同 title / 同 content_preview entry
   (必先 search,命中 → update;否則 → add)

---

## Quick Commands

```bash
# Query (主要)
mcp__phycool-context__search_context({query, category?, story_id?, include_content?})
mcp__phycool-context__search_stories({query, status?, epic_id?, include_details?})
mcp__phycool-context__search_intentional_decisions({query, idd_type?})
mcp__phycool-context__search_debt({story_id?, severity?, status?})

# Write
mcp__phycool-context__add_context({category, title, content, agent_id, tags?, story_id?})
node .context-db/scripts/upsert-story.js --inline '<json>'
node .context-db/scripts/upsert-debt.js --inline '<json>'
node .context-db/scripts/upsert-intentional.js --inline '<json>'

# epic-tdb 排程層(tdb-1-track-plan-roadmap)—— track_plan 的唯一人工寫入路徑
node .context-db/scripts/upsert-track-plan.js --inline '<json>'                      # 建卡(story_id+lane 必填;寫入前驗 stories 存在,無 DDL FK)
node .context-db/scripts/upsert-track-plan.js --merge <story-id> --inline '<json>'   # 重排/暫停/解鎖
# ⚠ upsert-story.js 的隱含副作用:status 進終態(done / cancelled / cancelled-merged /
#   superseded / split / skipped / deleted)時,會**連帶**把該卡 track_plan.plan_state 轉為
#   'done-exited' 並清空 seq(掛在 _doUpsert,故 --inline 與 --merge 兩條路徑皆觸發)。
#   無 track_plan 列者靜默略過;已是 done-exited 者不動 updated_at;track_plan 表不存在時
#   僅 console.warn 不阻斷 Story 寫入(temp DB 測試常見)。見 upsert-story.js autoExitTrackPlan()。

# epic-whp worker protocol registry(whp-3-db-schema-registry,純資料層 — 寫入端接線見 whp-4)
node .context-db/scripts/upsert-worker-run.js --merge <run_id> --inline '<json>'  # 欄位範圍 UPDATE,非 INSERT OR REPLACE(BR-009)
node .context-db/scripts/reap-worker-runs.js --dry-run --json                    # 殭屍對帳,只標記不殺

# DB Schema Verify (寫 query 前必走)
node -e "const db=require('better-sqlite3')('.context-db/phycool.db',{readonly:true}); console.log(db.prepare(\"PRAGMA table_info('intentional_decisions')\").all());"
# 或 Read .claude/skills/phycool-context-memory/references/db-schema.md §⚡ Speed Lookup
```

---

## References

| Reference | 涵蓋章節 | 行數 |
|-----------|---------|------|
| [architecture-overview.md](references/architecture-overview.md) | §1 Architecture Overview(SQLite + FTS5 + MCP server.js)| ~133 |
| [db-schema-mcp-tools.md](references/db-schema-mcp-tools.md) | §2 DB Schema(55 實體基表 + 14 FTS5,2026-08-03 PRAGMA 實測)+ §3 MCP Tools(36 = 24 stable + 4 instinct WIP + 4 worker-protocol + 4 ctrl-channel)| ~230 |
| [memory-hook-fusion.md](references/memory-hook-fusion.md) | §4 Hook Triple-Write + §5 5-Layer Memory + §6 CMI-10/S_final/PPR + §7 Doc Taxonomy + §8 Sync Engine | ~178 |
| [devconsole-workflow.md](references/devconsole-workflow.md) | §9 DevConsole + §12 Workflow Integration + §13 Troubleshooting | ~157 |
| [rule-violation-tracker.md](references/rule-violation-tracker.md) | §15 ctr-p2-violation-tracker + §15.1 Phase 3 L1 Observer + §15.2 Phase 4 Workflow Entry Gate | ~405 |
| (existing) [db-schema.md](references/db-schema.md) | PRAGMA-derived schema cheatsheet(`⚡ Speed Lookup`)— **V2-01-FIX 必查清單** | — |
| (existing) [mcp-tool-reference.md](references/mcp-tool-reference.md) | 32 MCP tools 完整 I/O reference | — |
| (existing) [hooks-and-scripts.md](references/hooks-and-scripts.md) | Hook + script 細節 | — |
| (existing) [session-lifecycle.md](references/session-lifecycle.md) | Session 生命週期 | — |
| (existing) [token-reduction.md](references/token-reduction.md) | Token 減量策略歷史 | — |
| (existing) [web-ui-architecture.md](references/web-ui-architecture.md) | DevConsole Web UI 架構 | — |
| **(new 2026-05-22)** [khoj-distillation.md](references/khoj-distillation.md) | **§A 階層切塊 + §B hashed_value MD5 chunk-level dedup + §C DateFilter `dt:"yesterday"` 自然語言**(Stage α Phase 3 蒸餾,對齊 ADR-KHOJ-CHUNKING-001,Khoj AGPL-3.0 整包 REJECT 純邏輯 ACCEPT)| ~150 |

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **3.5.10** | **2026-08-04** | **bwu-14-inject-budget-dimension-and-mirror code-review — 修正 3.5.9 對 Layer 12 parity 的過度宣稱(零列情形實為分歧,CR 已修)**。3.5.9 記載「實測 parity:hook 側與 `/layer12` 端點以相同 DB 狀態取值,`used=301`/`pct=0.6689` 雙邊精確相符(獨立算式驗證非巧合)」——該實測本身無誤(CR 以獨立算式複驗:`INSTINCT_HEADER.length`(94) + `formatInstinctEntry(row).length`(207) = 301,`pct` 0.6689,逐值相符),但它**只覆蓋了非空集合這一種狀態**。CR 讀碼比對兩側發現:hook 側 `pre-prompt-rag.js:1176` 為 `if (!rows.length) return ''`——零列時**整層不注入,連 header 都不輸出**;而 `emergence.ts` 修前無條件 `let used = INSTINCT_HEADER.length`,故零 instinct 時端點回報 `used=94`/`pct=0.2089`,`Emergence.tsx:70` 的儀表因此顯示 21% 已用,而 `:81` 同時渲染「目前無符合條件的 instinct 注入」——**觀測面自相矛盾**,且此偏差**由本卡引入**(修前 `let used = 0` 在零列時恰為正確值)。CR 修正為 `let used = instRows.length > 0 ? INSTINCT_HEADER.length : 0`,並補 route 層回歸測試(修前實測 RED:`expected 94 to be +0`;修後 GREEN),`tools/dev-console` 全套件 770→**771 綠**。**留下的教訓**:「兩側取同一 DB 狀態、數值相符」證明的是**該狀態下**的 parity,不等於**全狀態** parity——邊界狀態(空集合 / 全部超限 / 單列剛好卡界)須各自舉證,否則觀測工具會在最需要它誠實的時候說謊。同批另修 3 項(`session-recovery.js` 截斷路徑在極小 cap 下因 `slice(0, 負數)` 反向溢出、`emergence.ts` 鏡像行號錨仍為修前值、`pre-prompt-rag.js` 跨目錄 top-level `require` 缺 fail-open 防護),詳見 CR 報告。八面向:面向 2 為本次變更本體;面向 4 已檢(`references/hooks-and-scripts.md:245` + `memory-hook-fusion.md:105` 僅記 `INSTINCT_CHARS=450`,未涉起算基準,無需更新);面向 6 已檢(`Grep 'inject-budget\|INSTINCT_HEADER'` 全 `.claude/skills/` 僅本檔命中);面向 1/3/5/8 N/A(無新 FORBIDDEN、無新 code pattern 類別、無 troubleshooting 條目);面向 7 為本列。 |
| **3.5.9** | **2026-08-04** | **bwu-14-inject-budget-dimension-and-mirror dev-story — Layer 12 平行實作收斂,完成 3.5.6 交接的 debt 收口(純敘事閉環,零 schema/計數變更)**。3.5.6 於本檔具名記載「已知未同步:`tools/dev-console` `/emergence/layer12` 是 Layer 12 預算的平行複製實作(`INSTINCT_TOKENS=1200`),已建 debt `TD-DEVCONSOLE-LAYER12-BUDGET-MIRROR-DRIFT` 具名承接」——本卡即為承接該筆 debt 的收口卡。新建 `.context-db/scripts/inject-budget.cjs`(比照 `ctrl-unread-sql.cjs` 單一定義站點範式)匯出 `INSTINCT_CHARS`(450)/ `INSTINCT_HEADER` / `formatInstinctEntry()`,`pre-prompt-rag.js` 與 `emergence.ts` 兩側改為 `require` 消費,取代各自 inline 宣告;`emergence.ts` `/layer12` 端點的 `cap` 由 1200(token)改 450(字元),`used` 起算基準改與 hook 側一致(含 header 長度)。同批一併修復同源的 `TD-SESSION-RECOVERY-CHAR-CAP-DIMENSION`(`.claude/hooks/session-recovery.js` 三常數收斂為 `MAX_INJECT_CHARS=9500`,對齊 `pre-prompt-rag.js` `DEFAULT_MAX_INJECT_CHARS` 同型 pattern)。實測 parity:hook 側與 `/layer12` 端點以相同 DB 狀態取值,`used=301`/`pct=0.6689` 雙邊精確相符(獨立算式驗證非巧合)。八面向驗證:面向 1/3/5/6/8 N/A(純平行實作收斂,無新規範/無新 code pattern 類別/無 troubleshooting/無 cross-skill 引用/無新 FORBIDDEN);面向 2 N/A(本檔描述層級為「預算數值目錄」,不追蹤個別常數物理宣告位置,`references/hooks-and-scripts.md:245` 與 `references/memory-hook-fusion.md:105` 現有 `INSTINCT_CHARS=450` 記載仍準確,經比對 `ctrl-unread-sql.cjs` 先例確認此為既定抽象層級,不需更新);面向 4 已檢(`Grep 'INSTINCT_TOKENS'` 全 `.claude/skills/phycool-*` 僅本檔 Version History 敘事段落命中,無其他 active 引用);面向 7 為本次變更本體。 |
| **3.5.8** | **2026-08-03** | **ccb-4-ctrl-notify-knock dev-story — `controller_windows` 中控視窗註冊表落地(54→55 實體基表)**。新增 `controller_windows`(11 欄 1 索引,`session_id TEXT PRIMARY KEY`)—— 把 `session_id` 顯式綁到軌別,使 `Stop` / `PostToolUse` 兩個**沒有 `prompt` 欄位**的事件也能判定自己是哪一軌(官方 schema 實 fetch 確認 2026-08-03;`ctrl-channel-inject.js` 四條解析路徑有三條依賴 prompt 文字,故這不是「換個實作也行」而是缺了就做不出來)。三處設計選擇各有其理由:PK 取 `session_id` 而非 `track`(一軌可合法重綁新視窗,以 track 為 key 會讓那件事變成靜默丟棄舊 PID 的 update);`console_cmdline` 存下來而非重算(它是 `judgeLiveness()` Tuple 3/4 的中控域對應物 —— 那兩個 Tuple 檢查 worker 專屬 token,中控視窗不存在,等價守衛是「命令列是否仍是登記的那條」,少了它一個被重用的 Windows PID 會被當原視窗敲門);兩個 `last_*_count` 預設 `-1` 而非 `0`/`NULL`(`0` 是真實未讀數,`NULL` 讓比較式變複雜,`-1` 對 `COUNT(*)` 不可達)。零 FTS5 / 零 shadow / 零 trigger / 零 MCP tool 新增。**PRAGMA 直接實查校正 2026-08-03**:total=125 / FTS5 主表=14 / shadow=56 / 實體基表=55(55+14+56=125 驗算通過),+1 全數來自本卡。description + §1/§2 摘要表 + `references/db-schema.md`(§0 Post-snapshot additions + §A PK + §B timestamp 三處)同步。`last_synced_epic`→epic-ccb、`last_synced_story`→ccb-4-ctrl-notify-knock。走**字面** `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 無新 FORBIDDEN — 純資料層擴充,行為紀律歸 `phycool-ctrl-channel`;面向 3/5/8 N/A)。 |
| **3.5.7** | **2026-08-03** | **tdb-4-snapshot-retire — PreCompact chain 收斂為純 DB 寫(references 同步)**。`scripts/pre-compact-snapshot.ps1` 已 `git rm` 除役、`docs/tracking/active/session-snapshot.md` 已 `git rm`、`precompact-tool-preprune.js` 的 digest append 支線(含 `buildDigestLines` 與 export)已拆除 —— PreCompact 由 3 支 hook 收斂為 **2 支**(preprune → log-session),全鏈零 `.md` 產出。同步 5 個 references(create 階段只預估 `hooks-and-scripts.md` 一檔,dev 階段逐檔 grep 判定後實為 5 檔):`hooks-and-scripts.md`(settings 範例 PreCompact 區塊改列 2 支 + Hook 表移除 ps1 列 + preprune 列移除 snapshot digest 敘述)、`session-lifecycle.md`(PreCompact ASCII flow)、`memory-hook-fusion.md`(Hook 總表 `PreCompact (×3)` → `(×2)`;順手校正檔頭「15 個 handler(驗證 2026-04-13)」為 **65**,`ConvertFrom-Json` 實測 2026-08-03 —— 該值 stale 近 4 個月,屬既有 drift 非本卡引入)、`devconsole-workflow.md`(Compaction Recovery 元件清單移除 ps1)、`rule-violation-tracker.md`(路徑速查表移除 ps1 列)。另 `log-session.js` 的 `getActiveStories()` 改讀 `stories` 表(`status IN ('in-progress','review')`,可選 `existingDb` 參數複用既有連線),不再解析已凍結的 Sprint 排程 yaml —— 修前每筆 session 記錄都帶著停格舊清單。`watches` 新增 `precompact-tool-preprune.js` glob。**零 schema / 零 MCP tool / 零計數變更**(55 實體基表 / 124 total / 36 tools 不變)。走**字面** `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1/3/5/8 N/A — 無新 FORBIDDEN、無 BAD/GOOD pattern、無 troubleshooting 條目)。 |
| **3.5.6** | **2026-08-02** | **bwu-11-rag-charcap-budget — `pre-prompt-rag.js` 注入預算量綱由 token 改字元(references 同步)**。修前預算以 token 計(`MAX_TOKENS=10000` 搭配 `estimateTokens=length/4` ≈ 40,000 字元),官方 `additionalContext` 上限卻是 10,000 **字元**;且該常數只餵 idd/instinct 兩層的動態扣減,**從未**用於 `combinedContext` 全域封頂 —— 不是「數值訂太大」,是上限根本沒被把關過(實測同一支 hook 曾輸出 16.1KB 遭 CLI 轉存檔)。本次同步三個 references 子檔的預算敘述:`hooks-and-scripts.md`(架構圖逐層字元預算 + 全域封頂 9,500 + 分層降級與必留層 + 效能門檻表 + ASCII 摘要)、`session-lifecycle.md`(總預算 10,000 tokens → 9,500 字元;順手校正 `最小 query` 10 → 3 字元 stale 值)、`memory-hook-fusion.md` §6.3(`CODE_RAG_TOKENS=3500` → `CODE_RAG_CHARS=1450`,並記載 Layer 12 動態扣減已移除改靜態 `INSTINCT_CHARS=450`)。**零 schema / 零 MCP tool / 零計數變更**(55 實體基表 / 124 total / 36 tools 不變)。已知未同步:`tools/dev-console` `/emergence/layer12` 是 Layer 12 預算的平行複製實作(`INSTINCT_TOKENS=1200` + UI 標籤「Token 用量」),跨 server/UI/2 測試檔屬另一施工面,已建 debt `TD-DEVCONSOLE-LAYER12-BUDGET-MIRROR-DRIFT` 具名承接。走**字面** `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 無新 FORBIDDEN — 屬行為說明;面向 3 N/A;面向 8 未新增 FORBIDDEN 條目故不適用)。 |
| **3.5.5** | **2026-08-02** | **whp-11-d2-inline-revise T1 — `worker_messages` 12→13 cols(+`knocked_at` TEXT NULL)**。D2 敲門機制的冪等標記:orthogonal nullable 欄位,非新增 `state` 值(`read-worker-directives.js` 的 `state='pending'` 選取語意不變,敲門迴圈上界只是多一句 `AND knocked_at IS NULL`)。`init-db.js` additive-`ALTER`(`PRAGMA table_info` 先驗再 `ALTER`,與既有 30+ 欄位擴充同一冪等範式)。`references/db-schema.md` §0 Inventory footnote + §B(timestamp 欄位表補列)+ §1 Tables Quick Reference 同步(表數/FTS5/shadow 計數不變,純欄位層擴充)。`node init-db.js` 連跑兩次 exit 0×2 + `PRAGMA table_info` 回 13 欄 + 既有 5 列 `state`/`delivered_via` byte-identical + `knocked_at` 皆 NULL 現場驗證。走**字面** `Skill(skill="saas-to-skill")` Mode B。 |
| **3.5.4** | **2026-07-28** | **tdb-2-sprint-status-freeze-refs BR-012/BR-014**:`references/web-ui-architecture.md` §4 Sync Engine 標 retired(`UpdateSprintYaml()` 步驟 + 整個「衝突偵測」子節)+ §8 併發安全表移除 sprint-status.yaml 格式損壞風險列 —— `sprint-status.yaml` 已凍結,DevConsole Sync 功能(`/api/sync/preview` + `/api/sync/execute` + 前端入口)同批退場(Phase 4 落地)。走**字面** `Skill(skill="saas-to-skill")` Mode B。 |
| **3.5.3** | **2026-07-28** | **tdb-1-track-plan-roadmap code-review — Skill Sync Gate 缺口補件(面向 2 使用者故事/行為)**。v3.5.2 同步了 `track_plan` **表**,但漏了同一張卡對 `upsert-story.js` 的**行為變更**:該檔為全專案唯一 Story 寫入路徑,現在 status 進終態時會**連帶**改寫 `track_plan.plan_state='done-exited'` + `seq=NULL`(`autoExitTrackPlan()`,掛 `_doUpsert` 故 `--inline` 與 `--merge` 皆觸發)。此副作用不改任何 CLI 契約(旗標與 `stories` 語意皆未變),故 33 處引用 `upsert-story.js` 的其他 Skill 無需同步(CR 獨立掃描確認);但本 Skill 是 agent 查「upsert-story.js 怎麼運作」的正典落點,缺此說明會讓未來 agent 對「`plan_state` 沒人動卻自己變了」誤判為資料異常。Quick Commands 補 `upsert-track-plan.js` 兩模式 + auto-exit 三層降級行為(無列靜默略過 / 已 done-exited 不動 `updated_at` / 表不存在僅 warn 不阻斷);`references/devconsole-workflow.md` §12 Lifecycle Invariants 併記。**零 schema / 零計數變更**(55 實體基表 / 124 total 不變)。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 無新 FORBIDDEN — 屬行為說明非禁令;面向 3 N/A;面向 6 已掃描確認無跨 Skill 數值衝突)。 |
| **3.5.2** | **2026-07-28** | **tdb-1-track-plan-roadmap dev-story — `track_plan` 排程層表落地(53→55 實體基表)**。新增 `track_plan`(`story_id TEXT PRIMARY KEY` FK 語意但**刻意不宣告** DDL FK — better-sqlite3 預設 `PRAGMA foreign_keys=1`,若宣告 `ON DELETE CASCADE`,`INSERT OR REPLACE INTO stories` 的 DELETE+INSERT 語意會在**任何**無關欄位更新時靜默清空子表,故參照完整性改在 migration script 應用層檢查;8 欄 2 索引:`lane`/`seq`/`plan_state`/`pause_reason`/`unlock_note`/`updated_at`/`updated_by`)。承載 DevConsole `/roadmap` 唯讀投影頁(`stories LEFT JOIN track_plan` + epic 白名單子查詢,取代手工維護的多軌推進地圖 .md)。零 FTS5/shadow 增量、零 MCP tool 新增(YAGNI)。description + §1/§2 摘要表 + `references/db-schema-mcp-tools.md` 標題/§2 校正為 54/124(54+14+56=124 驗算通過);`references/web-ui-architecture.md` §2 路由 +`/roadmap`、§API Contract +`GET /api/roadmap`;`references/db-schema.md` §0 Inventory + §Post-snapshot additions 同步。`last_synced_epic`→epic-tdb、`last_synced_story`→tdb-1-track-plan-roadmap。watches 新增 `.context-db/scripts/migrate-track-plan.js` glob。走 `Skill(skill="saas-to-skill")` Mode B 八面向(面向 1 FORBIDDEN 無新增,純資料層擴充;面向 8 N/A)。 |
| **3.5.1** | **2026-07-28** | **ccb-3-devconsole-channel-page code-review — `/api/channel` 契約校正(`references/web-ui-architecture.md` §3)**。CR 修復改動三支端點契約,原文件已 stale:① `/stats` 新增 `categories[]`(DB 全量 DISTINCT,BR-026 —— 原實作下拉選項取自「當前頁 items」,選定某 category 後結果集收斂會使下拉塌成單一選項)+ `unread_total` 語意校正為「未簽 **cell** 數」(spec §4.1,原為「有未簽的話題數」)+ `today_messages` 改 `date('now','+8 hours')`(原 `date('now')` 為 UTC,台灣 00:00-08:00 這 8 小時窗口會統計到前一日)② `/read-matrix` 新增 `tracks[]`(spec §4.5;原缺此欄使前端改依賴 `/stats`,而 `loadStats` catch 為靜默 → `/stats` 失敗時矩陣渲染 0 欄且無錯誤提示)+ `days` 截止點改 `strftime` T 分隔格式(原 `datetime()` 空格格式因 `'T'(0x54) > ' '(0x20)` 使截止當日全數通過,窗口多算近一天;實測 rows 23→19)③ `/search` 新增 `state` 參數(spec §4.6 既有契約參數,原硬編 `closed`)+ LIKE fallback 涵蓋 **1-2** 字元(原文件與實作皆寫 2 字元 —— `ftsHelper.isShortQuery` 定義為 `len>=2 && len<3`,長度 1 落到 FTS 分支再被 `sanitizeFtsQuery` 的 `<3` 擋成 null,**靜默回 0 筆**;實測 `q=軌` 修復前 0、修復後 132 threads)+ `/threads` `pageSize` 預設 20→**50**(原預設使 44 個開放話題只回 20 筆而 Tab1 當時無分頁控制)。補「勿改用 `isShortQuery`」警示 block。**純文檔面向 4(references 子檔)同步**,無 FORBIDDEN/規範新增。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.5.0** | **2026-07-28** | **ccb-3-devconsole-channel-page dev-story — DevConsole `/channel` 頁補登(`references/web-ui-architecture.md` §2 路由結構 + §3 API Contract)**。新增唯讀觀察面路由:BoardCard/ChannelChips/APG tablist(手動啟動)/ThreadList/ThreadTimeline+MsgBlock/ReadMatrix 六元件,消費既有 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards`(ccb-1 已建表,本卡零 schema 變更)。新增 6 支唯讀 API(`/api/channel/stats`/`boards`/`threads`/`threads/:id/messages`/`read-matrix`/`search`),`channelService.ts` 零寫入(無 INSERT/UPDATE/DELETE)。純文檔面向 2(使用者故事/行為)+ 面向 4(references 子檔)同步,無規範/FORBIDDEN/行為變更;`last_synced_story` → ccb-3-devconsole-channel-page。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.4.2** | **2026-07-28** | **ccb-1-db-mcp-import code-review F2 — `update_ctrl_board` 回應契約補述**。`references/mcp-tool-reference.md` §23 的「必填 `expected_version` (number)」與「`version = expected_version + 1`」兩處補上整數約束:非整數於入口回 `CCB1-E01`(`ctrl-channel-ops.js:395-400`),故成功回應的 `version` 恆為 number,不會出現 CR 實測到的字串串接值(送 `"7"` → 曾回 `"71"`)。**純契約敘述校正,無 schema / tool 數量變更**。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.4.1** | **2026-07-28** | **whp-10-devconsole-ui — 與 ccb-1-db-mcp-import 並行編輯後 re-sync**。3.3.1(本卡 `/workers` 路由補登)與 3.4.0(ccb-1 聊天室通道 MCP tool)為同日兩軌並行對同一 SKILL.md 的循序編輯(非覆寫遺失,`git diff` 確認兩者實質內容皆完整保留於下方 Version History)。本列僅重新校正 frontmatter `last_synced_epic`/`last_synced_story` 反映本卡為最後一次觸碰者,無新增內容變更。 |
| **3.4.1** | **2026-07-28** | **ccb-1-db-mcp-import — 4 個聊天室通道 MCP tool 落地(36→ 表數 53+14)** — `post_ctrl_message`(未帶 thread_id 自動建題)/ `read_ctrl_messages`(讀取即簽收,故意不入 `SEARCH_TOOLS` — 回傳形狀不符任一解析分支 + 每次呼叫必有簽收副作用)/ `close_ctrl_thread`(CAS,僅發起軌)/ `update_ctrl_board`(BoardState CAS 樂觀鎖),取代 2 個 markdown 聊天室 + 15 封存檔的自由格式溝通。新增 `ctrl_threads`/`ctrl_messages`/`ctrl_message_reads`/`ctrl_boards` 4 實體基表 + `ctrl_messages_fts`(trigram)1 FTS5 虛擬表(+4 影子表)。description + §1/§2 摘要表數字修正為**明示計數口徑**(53 實體基表 + 14 FTS5 虛擬表,不再用單一歧義數字,回應 T14 dev_notes 對 v3.3.0「63 real」係 115-52 shadow 未扣 FTS5 主表的算式校正);tools 32→36。`last_synced_epic`→epic-ccb、`last_synced_story`→ccb-1-db-mcp-import。watches 新增 `ctrl-channel-ops.js`/`import-ctrl-channel.js`。詳 `references/db-schema.md` §0/§A/§B/§1、`references/db-schema-mcp-tools.md` §3c、`references/mcp-tool-reference.md` §3c。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.3.1** | **2026-07-28** | **whp-10-devconsole-ui — DevConsole `/workers` 路由補登(references/devconsole-workflow.md §9)**。whp-9-devconsole-api 只開 8 支後端 API 未建畫面,whp-10 首次交付對應 UI:`/workers`(三分頁 現場/歷程/稽核)+ `/workers/:runId`(同頁抽屜,非另一頁)。§9 Routes ASCII tree 補兩行 + 附註明列本表為手動維護索引、`/emergence`/`/reviews/findings`/`/rule-violations` 等既有路由尚未回補屬已知 drift(留 Boy Scout,不在本次同步範圍)。純文檔面向 4(references 子檔)同步,無規範/FORBIDDEN/行為變更;`last_synced_story` → whp-10-devconsole-ui。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.3.0** | **2026-07-28** | **whp-5-message-bus-mcp — 4 個 worker protocol MCP tool 落地(28→32)** — `search_worker_runs`(唯讀,故意不入 `SEARCH_TOOLS`,見 `.context-db/server.js` 該處新增註解)/ `ack_worker_run` / `gate_worker_run` / `add_worker_message`,把 SSoT §19.3「執行權」從文件約定變成 SQL `WHERE` CAS 條件。description + §1/§2 摘要表 32 tools(24 stable + 4 instinct WIP + 4 worker-protocol);`last_synced_story` → whp-5-message-bus-mcp;watches 新增 `.context-db/scripts/worker-protocol-ops.js` glob。CAS 邏輯全放獨立 ops 模組(`server.js` 只留 thin handler),理由:`server.js` 僅 export `parseDateExpr` 一個符號且拉入 embedder stack,獨立模組才能被 vitest 真實 import 測試(而非既有 `search-debt-files.test.js` 重新實作一份副本的反模式)。`.context-db/tests/worker-protocol-ops.test.js`(45 case)+ `worker-protocol-mcp-registration.test.js`(5 case)全綠,既有 61 筆維持綠。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.2.1** | **2026-07-27** | **whp-3-db-schema-registry code-review R1 修補(4 項文檔一致性)** — ③ Mode B 面向 4(references 子檔 grep)另掃出同一 Skill 內兩處同類漏改:`references/architecture-overview.md:18` 架構圖仍標「19 AI Tools」(此值正是 `capability-integration-mandate.md` §1 建立時點名的 stale 範例,至今未修)→ 校正為 **36 MCP Tools**;`:23`「50 real + 13 FTS5 / PRAGMA verified 2026-05-08」→ **63 real / 2026-07-27**。④ `references/db-schema.md:197` regen 說明「for all 43 real tables」→ **63**。① `references/db-schema.md` §0「Total `sqlite_master` table rows」106 → **115**:v3.2.0 只改 real 51→63 卻留著 106 並標記 stale,同一張表變成 106 total / 63 real / 52 shadow 三個數字互相矛盾,而 115 這個值本來就是 v3.2.0 算出 63 的來源(115−52),留舊值等於明知正確值仍不寫。② `skills_list.md` 第 42 行仍記 `v3.1.2 — 36 MCP Tools`,未反映 v3.2.0 的 63 tables 與四表新增 —— 對齊 `cross-ref-discipline.md` §4 Post-Action Step 3(動 skill 必同步索引檔);同檔他軌變更(`phycool-windows-ps-encoding` v1.1.1)有同步,證明此慣例現行有效。**無規範/行為變更**,純數值與索引一致性。走 `Skill(skill="saas-to-skill")` Mode B 八面向。 |
| **3.2.0** | **2026-07-27** | **epic-whp worker protocol registry 四表落地(whp-3-db-schema-registry)** — 新增 `worker_runs`(39 cols,8 態 lifecycle + 4-Tuple PID reuse 防護)/ `worker_messages`(12 cols,controller↔worker 聊天室)/ `worker_handoffs`(13 cols,GATE 證據鏈)/ `guardian_heartbeat`(10 cols,`CHECK(id=1)` 資料庫層單例)+ 8 個新 index(含全庫**第一個** partial index `ix_worker_runs_pending_ack`)。**本卡純資料層,零行為變更** —— 不改任何既有表 / 既有執行路徑,寫入端接線由 whp-4 承接。description + §1/§2 摘要表 real tables 43→**63**(2026-07-27 PRAGMA 直接實查:`sqlite_master` type='table' 總數 115、shadow 52 → 115−52=63;此為對 v3.1.2 記載「43」的**二度校正**,非本卡引入的新漂移 — 43 本身在加表前已是舊值,加表前實查為 59)。`references/db-schema.md` §0/§A/§B/§C/§1 同步(4 表 PK/timestamp 欄 + partial index 說明取代舊「零 partial index」敘述)+ `references/db-schema-mcp-tools.md` 標題/§2 校正。watches 新增 `.context-db/scripts/reap-*.js` glob。Quick Commands 補 `upsert-worker-run.js`/`reap-worker-runs.js` 範例。對齊 capability-integration-mandate Step 1(Step 2/3 因消費點在 whp-4/whp-5 結構上做不到,已記錄 audit-capability-reachability baseline 分數 + 具名承接卡)。saas-to-skill Mode B + 8 面向驗證。 |
| **3.1.2** | **2026-05-27** | P4 capability 文檔對齊 + G2 drift 收斂(DB 實測校正)：references/memory-hook-fusion.md §6.2 加 §6.3 PPR(G14 P2 Personalized PageRank · commit f8dc9d6d+e709abb8)+ 校正 Layer 10→3 + 行號 stale(:79→95 / :82-87→114-119 / :243→273 簽名加 pprScores);description + 摘要表 real tables 53/50→**43**(DB PRAGMA 實測,非 README「56」含 FTS5 混算口徑)、24→**28** tools(server.js 28 case 實測 = 24 stable + 4 instinct WIP)。對齊 capability-integration Step 1。saas-to-skill Mode B + 8 面向。 |
| **3.1.0** | **2026-05-22** | **Stage α Phase 3 Khoj 3 純邏輯蒸餾** — 新增 `references/khoj-distillation.md`(§A RecursiveCharacterTextSplitter 階層切塊 + §B hashed_value MD5 chunk-level dedup + §C DateFilter `dt:"yesterday"` 自然語言語法)。Source: khoj-master AGPL-3.0(整包 REJECT,純邏輯蒸餾 algorithm idea level non-copyrightable)。對齊 [ADR-KHOJ-CHUNKING-001](../../../docs/technical-decisions/ADR-KHOJ-CHUNKING-001-khoj-3-pure-logic-distillation.md)。saas-to-skill Mode B + 八面向驗證 PASS。觸發:Stage α Q4 提前 α 授權(user 2026-05-22 4 決策之一)。Defer Stage β/γ 實作落地。 |
| **3.0.0** | **2026-05-16** | **Progressive Disclosure 重構**(P2-Wave-1)— 原 1127 行 monolithic 拆為核心 ~280 行 + 5 新 references/*.md(1068 行)+ 既有 references 保留。觸發:env-cleanup P2 Skill Modularization。saas-to-skill Mode B + 8-aspect validation pass。 |
| 2.8.0 | 2026-05-08 | V2-01-FIX §DB Schema-First Mandate + `db-schema.md` Cheatsheet 建立(防 schema 假設 silent fail / silent corrupt)|
| 2.7.x | 2026-04 ~ 2026-05 | 24 MCP tools(+search_god_nodes for ADR-GOVERNANCE-001)+ Rule Violation Tracker Phase 3/4 |
| 2.0+ | 2026-03 ~ 2026-04 | 50 real tables + 13 FTS5 + CMI-10 Hybrid Fusion 3-tier + Sync Engine UoW + 5-Layer Memory + Hook Triple-Write |
| 1.0 | 2026-02-04 | Initial — SQLite + FTS5 + MCP server.js baseline |
