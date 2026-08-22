---
name: 'step-00-db-first-query'
description: 'Query Context Memory DB before reading .md files (DB-first principle)'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-00-db-first-query.md'
nextStepFile: '{workflow_path}/steps/step-01-load-story.md'
---

# Step 0: DB-First Query

**Goal:** Query Context Memory DB for story context before reading .md files.

---

## STATE VARIABLES (set in this step)

- `{db_context_available}` — Pipeline 是否已注入 DB context (true/false)
- `{pipeline_directives}` — `pipeline_notes` 中的執行載體註記 + 跨視窗協調契約（空字串表示無中控指示）

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🗄️ DB-FIRST PRINCIPLE: Context Memory DB is the SINGLE SOURCE OF TRUTH. Query DB BEFORE reading .md files. If system prompt already contains DB-injected context, use it directly.

### 1. Check for Pipeline-Injected Context

Check if system prompt already contains a DB-injected story block (pipeline mode). **Two markers are valid** — match either:

- `[STORY DB CONTEXT]` — 現行 `party-to-pipeline` worker（`shared-utils.ps1` `Build-StoryPromptContext`，19 個標籤行）
- `[MEMORY DB STORY CONTEXT]` — legacy `claude-launcher-*` pipeline（`story-pipeline-interactive.ps1` / `story-pipeline-memory.ps1`）

> 只比對 legacy 標記會讓現行 party-to-pipeline 派工的 worker 恆走 manual 分支（重複查一次 DB）。
> 對照 `code-review/steps/step-00b-db-first-query.md` §1 同一判定。

**If system prompt has DB-injected story context:**
- Use injected context as primary source — skip .md file search in Step 1
- Set `{db_context_available}` = true

**If system prompt does NOT have DB-injected context (manual mode):**
- Determine `{story_key}` from workflow arguments FIRST (e.g., "dla-09-skill-idd-debt-cross-reference-scanner")
  - ⚠️ CRITICAL: Use the FULL story_id — NEVER abbreviate (e.g., "dla-09" will NOT match "dla-09-skill-idd-debt-cross-reference-scanner")
  - If argument is abbreviated, expand it by globbing: `docs/implementation-artifacts/stories/**/*{arg}*.md`
- Query story from DB via MCP tool:
  ```
  Tool: mcp__phycool-context__search_stories
  Parameters: { story_id: "{full_story_key}", include_details: true }
  ```
- If returns empty [] → HARD BLOCK: "Story {full_story_key} not found in DB. Run upsert-story.js first, then retry."
  - Do NOT silently fallback to reading .md file
- If DB has enriched data (AC, tasks, dev_notes non-empty) → use as primary source
- Set `{db_context_available}` = true if DB has data, false otherwise

### 1.5 Read `pipeline_notes` — 執行載體 + 跨視窗協調契約 (MANDATORY)

> **CRITICAL:** 取得 story 後 **MUST** 讀 `pipeline_notes`。該欄位是中控對執行者的指示通道，
> 內容不重複於 AC / tasks / dev_notes —— 跳過等同未收到中控指令。

1. 自注入的 `[STORY DB CONTEXT]` 區塊（`pipeline_notes:` 標籤，v5.14.0 起注入）或 `search_stories` 結果取出 `pipeline_notes`
2. 含**執行載體註記**（如「主視窗手動逐階段」/「禁 dispatch 子視窗」/「`-Worktree`」）→ **遵循之**，不得自行改用其他載體
3. 含**跨視窗協調契約**（並行軌凍結 / 勿觸碰檔案清單 / `baseline_commit`）→ 遵循之；`baseline_commit` 為本階段 diff scope 錨點，並與 `protocol-template.md` F8 他軌 dirty 檔紀律疊加
4. **開工 / 完工標記**（僅**手動視窗**執行時適用）：依契約於 `pipeline_notes` 追加 `[{執行者}] dev-story 開工 @ {Taiwan ts}`，完工時追加對應完工標記 —— 走 `upsert-story.js --merge`，**append 既有內容之後，不得覆寫**
   - ⚠️ 由 **dispatch 子視窗 worker** 執行時**不適用**：`pipeline_notes` 對 worker 為 READ-ONLY（`protocol-template.md` F5），開完工狀態改由 IPC status 檔回報中控

**If `pipeline_notes` 為空:** 無中控指示，依預設載體執行。

---

### 1.6 讀取 ctrl-channel 未讀訊息 — **僅手動視窗執行時** (CONDITIONAL)

> **兩種執行情境紀律不同**(2026-08-01 使用者裁定):dispatch 子視窗**不讀**聊天室(避免 context 污染),手動視窗**必讀**(它有軌別身分,是紀律的正當對象)。

**執行條件判定**:沿用 §1 已判定的 `{db_context_available}` 來源 —— system prompt 含 `[STORY DB CONTEXT]` / `[MEMORY DB STORY CONTEXT]` 注入區塊者為 pipeline mode。

- **pipeline mode**(有注入區塊)→ **SKIP 本步驟**
  理由:子視窗是單階段單卡執行者、**無軌別身分**(`read_ctrl_messages` 需 `reader_track`),讀跨軌聊天室只會污染其 context。派發前的守門由中控側 `preflight-dispatch.ps1` Check 5(`UNREAD_MESSAGES`)負責 —— 惟該檢查的 SQL 條件為 `t.must_read = 1 AND t.state = 'open'`,**僅擋必讀話題**;一般知會不擋派發,這是刻意的:子視窗本就不需要跨軌脈絡。

- **manual mode**(無注入區塊,手動視窗逐階段執行)→ **MUST 執行**:

  ```
  Tool: mcp__phycool-context__read_ctrl_messages
  Parameters: { reader_track: "{本視窗軌別}", unread_only: true }
  ```

  - 🔴 **`{本視窗軌別}` 判定優先序**(2026-08-01 手動軌實測後裁定 —— 主視窗 env 無任何軌別線索,**禁止臆測**):
    1. `$env:PHYCOOL_CONTROLLER_TRACK` 有值 → 用之(主視窗恆無,留作擴充點)
    2. **當前 prompt 含 DB canonical 軌名**(如「前台軌中控」/「後台軌中控」/「BMAD升級軌」)→ 該軌。各軌中控每次執行任務的第一個 prompt 本來就會宣告軌別
    3. **prompt 為 bmad slash 形態**(`/bmad:bmm:workflows:{phase} {story_id}`)→ 查該 story 的 `track_plan.lane`;`lane='manual'` → **主視窗手動軌**
    4. 以上皆無法判定 → **不呼叫本步驟**(零成本跳過),**不得臆測**
  - ⚠ **誤判軌別 = 代他軌簽收的稽核污染**。實例(2026-08-01):手動軌視窗以 `BMAD升級軌` 身分呼叫,代該軌簽收 4 則訊息;雖實質資訊零損失,但稽核紀錄失真。**判不出來就不查,比查錯好**
  - 回傳非空 → 依 `msg_type` / `body` 判斷是否需回覆(`post_ctrl_message` 帶 `thread_id`)或收尾(`close_ctrl_thread`)
  - **呼叫本身即完成簽收**(讀取即 UPSERT `ctrl_message_reads`),不需另外標記已讀
  - 完整使用情境見 `phycool-ctrl-channel` skill

### 2. Query Related Decisions and Patterns

```
Tool: mcp__phycool-context__search_context
Parameters: { query: "{story_key}", filters: { include_content: true, limit: 3 } }
```

### 3. Query Tech Knowledge for Domain

```
Tool: mcp__phycool-context__search_tech
Parameters: { query: "domain keywords", limit: 3 }
```

---

## SUCCESS METRICS

- `{db_context_available}` set (true/false) — both injection markers matched
- DB context or .md fallback identified
- `{pipeline_directives}` read from `pipeline_notes` and obeyed (execution carrier + cross-window contract)
- Related decisions and tech knowledge queried

## FAILURE MODES

- Skipping DB query and going straight to .md file search
- Not setting `{db_context_available}`
- **只比對 `[MEMORY DB STORY CONTEXT]` 而漏掉 `[STORY DB CONTEXT]`** — 現行 party-to-pipeline worker 會被誤判為 manual mode
- **Skipping `pipeline_notes` (§1.5)** — 中控的執行載體指示與跨視窗協調契約只存在於該欄位，未讀等同未收到指令
- **手動視窗執行卻未追加開工 / 完工標記** — 中控無法判斷何時凍結 / 恢復並行派發
- Missing related context query

---

**NEXT:** Load `step-01-load-story.md`
