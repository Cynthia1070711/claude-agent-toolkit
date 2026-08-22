---
name: 'step-00-db-first-query'
description: 'Query Context Memory DB before reading .md files (DB-first principle)'
intentional: '[Intentional: IDD-STR-003] DB-first Story bypass - ADR-IDD-STR-003'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-00-db-first-query.md'
nextStepFile: '{workflow_path}/steps/step-01-target-story.md'
---

# Step 0: DB-First Query

**Goal:** Query Context Memory DB for existing story data before reading any .md files.

---

## STATE VARIABLES (set in this step)

- `{db_story}` — DB Story 物件
- `{db_enriched}` — DB 是否已有豐富資料 (true/false)
- `{pipeline_directives}` — `pipeline_notes` 中的執行載體註記 + 跨視窗協調契約（空字串表示無中控指示）
- `{memory_context}` — 歷史決策上下文

---

## EXECUTION SEQUENCE

> **CRITICAL:** 🗄️ DB-FIRST PRINCIPLE: Context Memory DB is the SINGLE SOURCE OF TRUTH for story data. Query DB BEFORE reading any .md files. If DB has enriched data (AC, tasks, dev_notes), USE IT as the baseline. .md files are SECONDARY — only use as fallback when DB is empty.

### 0.5 Record Create Phase Start Timestamp (FIRST ACTION)

> **CRITICAL:** 此步驟必須在 Step 0 最開始執行，不可延後到 Step 1。
> 2026-04-13 事故: create-start 埋在 step-01 §4，Agent 分析上下文時跳過，
> 導致 create_started_at = NULL 而 create_completed_at 已寫入。

**Action:** 取得 `{story_key}` 後立即呼叫（若 story_key 尚未確定，Step 1 確定後補呼叫）：

```bash
node scripts/record-phase-timestamp.js {story_key} create-start
```

- Story 不存在於 DB → `[warn] non-fatal`（Step 7 upsert 後 step-07 §4.4 會補上）
- COALESCE 保護：pipeline 已寫值則不覆蓋

---

### 1. Query Story from DB

```
Tool: mcp__phycool-context__search_stories
Parameters: { story_id: "{story_key}", include_details: true }
```

Store result as `{db_story}` for comparison throughout workflow.

**If `{db_story}` has non-empty acceptance_criteria AND non-empty tasks:**
- DB already has enriched data — use as baseline for verification/supplement mode
- Set `{db_enriched}` = true
- Output: 📊 DB 已有 enriched Story 資料（AC + Tasks），進入驗證/補全模式

**If `{db_story}` has empty acceptance_criteria OR empty tasks:**
- DB has basic data only — proceed with full create-story analysis
- Set `{db_enriched}` = false

### 1.5 Read `pipeline_notes` — 執行載體 + 跨視窗協調契約 (MANDATORY)

> **CRITICAL:** 取得 story 後 **MUST** 讀 `pipeline_notes`。該欄位是中控對執行者的指示通道，
> 內容不重複於 AC / tasks / dev_notes —— 跳過等同未收到中控指令。

1. 自 `{db_story}`（或系統提示注入的 `[STORY DB CONTEXT]` 區塊）取出 `pipeline_notes`
2. 含**執行載體註記**（如「主視窗手動逐階段」/「禁 dispatch 子視窗」/「`-Worktree`」）→ **遵循之**，不得自行改用其他載體
3. 含**跨視窗協調契約**（並行軌凍結 / 勿觸碰檔案清單 / `baseline_commit`）→ 遵循之；`baseline_commit` 為本階段 diff scope 錨點
4. **開工 / 完工標記**（僅**手動視窗**執行時適用）：依契約於 `pipeline_notes` 追加 `[{執行者}] {phase} 開工 @ {Taiwan ts}`，完工時追加對應完工標記 —— 走 `upsert-story.js --merge`，**append 既有內容之後，不得覆寫**
   - ⚠️ 由 **dispatch 子視窗 worker** 執行時**不適用**：`pipeline_notes` 對 worker 為 READ-ONLY（`protocol-template.md` F5），開完工狀態改由 IPC status 檔回報中控

**If `pipeline_notes` 為空:** 無中控指示，依預設載體執行。

---

### 1.6 Check for Existing Non-Terminal Worker Run (SSoT §S0 前置檢查第 2 項, whp-5-message-bus-mcp)

> **CRITICAL:** 同一 Story 若已有派發中的 worker run(尚未進入 `closed`/`failed`/`abandoned` 終態），重複 dispatch 會產生兩個並行子視窗同改同一批檔案。開工前一律先查。

```
Tool: mcp__phycool-context__search_worker_runs
Parameters: { story_id: "{story_key}", lifecycle: "dispatching,running,reported,awaiting-review,revising,approved" }
```

**If 回傳非空（存在非終態 run）：**
- Output: ⚠️ Story `{story_key}` 已有非終態 worker run（`{run_id}`，lifecycle=`{lifecycle}`）— 確認是否為前次中斷殘留或真實並行執行中，勿盲目重新 dispatch
- 若確認為殘留（視窗已關但 DB 未更新）→ 交中控依 `reap-worker-runs.js` 對帳流程處理，不在本 workflow 內自行判殺（SSoT ③ 只通知不殺）

**If 回傳空陣列：** 無並行風險，照常繼續。

---

### 1.7 讀取 ctrl-channel 未讀訊息 — **僅手動視窗執行時** (CONDITIONAL)

> **兩種執行情境紀律不同**(2026-08-01 使用者裁定):dispatch 子視窗**不讀**聊天室(避免 context 污染),手動視窗**必讀**(它有軌別身分,是紀律的正當對象)。

**執行條件判定**:檢查 system prompt 是否含 `[STORY DB CONTEXT]` 或 `[MEMORY DB STORY CONTEXT]` 注入區塊。

- **有注入區塊** → pipeline 子視窗(中控 dispatch)→ **SKIP 本步驟**
  理由:子視窗是單階段單卡執行者、**無軌別身分**(`read_ctrl_messages` 需 `reader_track`),讀跨軌聊天室只會污染其 context。派發前的守門由中控側 `preflight-dispatch.ps1` Check 5(`UNREAD_MESSAGES`)負責 —— 惟該檢查的 SQL 條件為 `t.must_read = 1 AND t.state = 'open'`,**僅擋必讀話題**;一般知會不擋派發,這是刻意的:子視窗本就不需要跨軌脈絡。

- **無注入區塊**(手動視窗逐階段執行)→ **MUST 執行**:

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

### 2. Query Related Context

```
Tool: mcp__phycool-context__search_context
Parameters: { query: "{story_key}", filters: { include_content: true, limit: 5 } }
```

### 3. Query Related Tech Knowledge

```
Tool: mcp__phycool-context__search_tech
Parameters: { query: "domain keywords from story", limit: 5 }
```

Store all DB context as `{memory_context}` for enrichment.

---

## SUCCESS METRICS

- `{db_story}` queried (may be empty)
- `{db_enriched}` set (true/false)
- `{pipeline_directives}` read from `pipeline_notes` and obeyed (execution carrier + cross-window contract)
- `{memory_context}` populated
- Related tech knowledge retrieved

## FAILURE MODES

- Skipping DB query and going straight to file analysis
- Not setting `{db_enriched}`
- **Skipping `pipeline_notes` (§1.5)** — 中控的執行載體指示與跨視窗協調契約只存在於該欄位，未讀等同未收到指令
- **手動視窗執行卻未追加開工 / 完工標記** — 中控無法判斷何時凍結 / 恢復並行派發
- Missing `{memory_context}` query

---

**NEXT:** Load `step-01-target-story.md`
