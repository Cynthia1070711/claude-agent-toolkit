---
name: 'step-07-finalize'
description: 'Validate, DB sync (incl. track_plan), tracking file, and completion communication'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-07-finalize.md'
nextStepFile: null
---

# Step 7: Finalize

**Goal:** Validate story against checklist, sync to DB (incl. `track_plan`), and create tracking file.

---

## AVAILABLE STATE

- All variables from Steps 0-6

---

## EXECUTION SEQUENCE

### 1. Validate Against Checklist

**PROTOCOL:** Validate against checklist at `{installed_path}/checklist.md`

Story content is assembled in-memory (no `.md` file to save — DB-first; the authoritative write happens in Step 4's `upsert-story.js` call).

---

### 2. Create/Update Tracking File

Set `{tracking_active_path}` = `{output_folder}/tracking/active/{story_key}.track.md`

**If tracking file does NOT exist:**
1. Create tracking file from template:
   - Path: `{tracking_active_path}`
   - 狀態: ready-for-dev

> **[frozen 2026-07-28 tdb-2]** 原第 2 步「Update `{output_folder}/tracking/README.md`」**已移除**。
> 該 README 的「進行中任務 / 近期完成任務」兩表已於 2026-07-28 凍結退役(中控 2026-07-28T19:32
> 裁定二),Story 狀態與排程分別由下方 Step 3 的 `upsert-story.js`(`stories` 表)與 Step 4.5 的
> `upsert-track-plan.js`(`track_plan` 表)承載,DevConsole `/stories` + `/roadmap` 呈現。
> 回寫該表等同製造第二個 drift 源。

---

### 3. Mandatory DB Sync

> **CRITICAL:** 🗄️ MANDATORY DB SYNC — DB is the ONLY source of truth. This step is NON-NEGOTIABLE.
>
> **CRITICAL:** Even if you wrote the .md file, you MUST ALSO write to DB. The next pipeline phase (dev-story) reads from DB, not .md.

**Step 4.1: 取得 Taiwan timestamp（create_completed_at）**

```powershell
powershell -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'"
```

儲存為 `{create_completed_ts}`。

<!-- [Intentional: IDD-STR-003] DB upsert 為 Story 寫入 SSOT - 成熟 Epic 繞過互動式 checklist -->
Execute DB upsert with ALL enriched fields:

```bash
node .context-db/scripts/upsert-story.js --inline '{
  "story_id": "{story_key}",
  "epic_id": "{epic_id}",
  "domain": "{domain}",
  "status": "ready-for-dev",
  "title": "{story_title}",
  "story_type": "{story_type}",
  "complexity": "{complexity}",
  "priority": "{priority}",
  "user_story": "{user_story_text}",
  "background": "{background_text}",
  "acceptance_criteria": "{acceptance_criteria_full_text}",
  "tasks": "{tasks_full_text}",
  "dev_notes": "{dev_notes_full_text}",
  "required_skills": "{required_skills_text}",
  "file_list": "{file_list_text}",
  "implementation_approach": "{implementation_approach_text}",
  "testing_strategy": "{testing_strategy_text}",
  "sdd_spec": "{sdd_spec_path_if_any}",
  "definition_of_done": "{definition_of_done_text}",
  "rollback_plan": "{rollback_plan_text}",
  "risk_assessment": "{risk_assessment_text}",
  "discovery_source": "{discovery_source_text}",
  "monitoring_plan": "{monitoring_plan_text}",
  "source_file": "context-db://stories/{story_key}",
  "tags": "{tags_text}",
  "dependencies": "{dependencies_text}",
  "create_agent": "{current_agent_id}",
  "create_completed_at": "{create_completed_ts}"
}'
```

> `{epic_id}` = derived from `{story_key}`（e.g., `"dla-04-…"` → `"epic-dla"`）  
> `{domain}` = Story 文件中的 domain 欄位（e.g., `"devops"`, `"editor"`, `"payment"`）  
> `{story_type}` = `"feature"` / `"bug"` / `"chore"` / `"enhancement"`  
> `{complexity}` = `"XS"` / `"S"` / `"M"` / `"L"` / `"XL"`  
> `{priority}` = `"P0"` / `"P1"` / `"P2"` / `"P3"`  
> `{current_agent_id}` = 當前 Agent ID（CC-OPUS / CC-SONNET），來自 `CLAUDE.local.md`  
> `{testing_strategy_text}` = M/L/XL：`step-06` §7.5 產出的具名測試案例表（七欄 markdown 表格，`Case`/`BR`/`Level`/`Fixture`/`Input`/`Expected`/`RED→GREEN`，選填 `Pattern`；每個 AC 引用的 BR 至少 1 列對映）；S：沿用 Story 既有自由格式測試策略文字（若有；無則從 AC 推導簡短測試方向）  
> `{definition_of_done_text}` = Exit Criteria / DoD 章節內容（若有；空則 `null`）  
> `{rollback_plan_text}` = SDD Spec §8 的 rollback plan（若有；無則從 Story 推導簡短回退方案）  
> `{risk_assessment_text}` = 風險評估（格式: `{LEVEL} — {reason}`，如 `LOW — Markdown only, no app code`）  
> `{user_story_text}` = "作為 / 我希望 / 以便" 格式的 user story（Story 文件 §1）  
> `{tags_text}` = Story 文件中的 tags（逗號分隔字串，若無則 `null`）  
> `{dependencies_text}` = Story 文件中的依賴 Story 清單（若無則 `null`）  
> `{discovery_source_text}` = 本 Story 需求發現來源（PRD 章節 / 分析報告路徑 / user 原話摘要；若無則 `null`）— 供 Depth Gate D3 讀取，補上可消除該常態 WARN  
> `{monitoring_plan_text}` = 本 Story 上線後的觀察信號（若為純開發環境基礎建設無 runtime 服務可監控，則具名說明「以何種方式觀察落地效果」；若無則 `null`）  
> `{source_file}` = DB-first URI，固定格式 `context-db://stories/{story_key}`（對齊 `.claude/rules/db-first-no-md-mirror.md` SUPREME，禁 `.md` 鏡像路徑）

CRITICAL field requirements:
- `acceptance_criteria`: MUST contain full ATDD format with `[Verifies: BR-XXX]`
- `tasks`: MUST contain full markdown checklist (all `[ ]` items)
- `dev_notes`: MUST contain tech debt prevention checklist + file references
- `required_skills`: MUST list all matched skills with reasons
- `user_story`: MUST be in "As a / I want / So that" format（或中文 equivalent）
- `create_agent`: MUST be set — 下游 code-review 追蹤 attribution 依賴此欄位
- `epic_id` + `domain`: MUST be set — DevConsole Kanban / search_stories epic filter 依賴
- `file_list`: MUST match the assembled `## File List` section content（非 NULL）
- `testing_strategy`: M/L/XL MUST contain named test case table from `step-06` §7.5（七欄 schema，每個 AC-cited BR ≥1 case row，對齊 SDD Spec §3.4）；S complexity 沿用既有自由格式，不受此要求約束
- `rollback_plan`: SHOULD be set（來自 SDD Spec §8 或推導）
- `risk_assessment`: SHOULD be set（`{LEVEL} — {reason}` 格式）
- `discovery_source`: SHOULD be set（消除 Depth Gate D3 常態 WARN）
- `monitoring_plan`: SHOULD be set（觀察信號說明，或具名理由何以 N/A）
- All text fields MUST be properly JSON-escaped

**Verify DB write (NULL field audit):**

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('.context-db/phycool.db', {readonly: true});
const MUST_FILL = ['story_id','epic_id','domain','title','status','priority','complexity','story_type','user_story','background','acceptance_criteria','tasks','dev_notes','required_skills','file_list','implementation_approach','testing_strategy','definition_of_done','sdd_spec','source_file','tags','create_agent','create_completed_at'];
const SHOULD_FILL = ['rollback_plan','risk_assessment','dependencies','discovery_source','monitoring_plan'];
const row = db.prepare('SELECT * FROM stories WHERE story_id=?').get('{story_key}');
const missing_must = MUST_FILL.filter(f => !row[f]);
const missing_should = SHOULD_FILL.filter(f => !row[f]);
if (missing_must.length) console.log('❌ MUST fields NULL:', missing_must.join(', '));
else console.log('✅ All MUST fields filled (' + MUST_FILL.length + ')');
if (missing_should.length) console.log('⚠️ SHOULD fields NULL:', missing_should.join(', '));
else console.log('✅ All SHOULD fields filled (' + SHOULD_FILL.length + ')');
db.close();
"
```

**If MUST fields are NULL → HALT and fix before continuing.**
**If SHOULD fields are NULL → warn but may proceed.**

**If DB verification shows empty fields:**
<!-- [Intentional: IDD-STR-003] DB-first 強制重試 - DB 是 downstream dev-story 唯一真實來源 -->
> **CRITICAL:** 🚨 DB SYNC FAILED — Retry the upsert-story.js command. Pipeline cannot proceed with empty DB.
- Retry the upsert command with corrected JSON escaping.

**Step 4.3: 補強 create_completed_at（COALESCE 保護）**

```bash
node scripts/record-phase-timestamp.js {story_key} create-complete
```

> COALESCE 保護：僅在 `create_completed_at` 為 NULL 時寫入，pipeline 已寫值則保留。

**Step 4.4: Safety Net — create_started_at NULL 檢查（MANDATORY）**

> **CRITICAL:** 2026-04-13 事故修復。step-00 §0.5 應已寫入 create_started_at，
> 但若因 Story 不在 DB（首次建立）或 Agent 遺漏而為 NULL，此處補上。

```bash
node scripts/record-phase-timestamp.js {story_key} create-start
```

> COALESCE 保護：若 step-00 已寫入值則不覆蓋。
> 若仍為 NULL（首次建立 Story），此處用 now() 填入（不完美但優於 NULL）。
> **已知限制：** 補填的 start 時間可能晚於實際開始，但保證階段時間軸不斷裂。

**Step 4.5: Ensure `track_plan` Entry (BR-003, non-blocking)**

> **CRITICAL:** Story 狀態 SSoT 已是 `stories` 表;`track_plan` 補其排程維度(`lane`/`seq`/`plan_state`)。寫入失敗**不阻擋** Story upsert(DB 狀態為主,對齊 SDD Spec §5 Boundary Conditions)。

1. 檢查是否已有列:
   ```bash
   node -e "
   const Database = require('better-sqlite3');
   const db = new Database('.context-db/phycool.db', {readonly: true});
   const row = db.prepare('SELECT 1 FROM track_plan WHERE story_id=?').get('{story_key}');
   console.log(row ? 'EXISTS' : 'MISSING');
   db.close();
   "
   ```
2. **若 MISSING** → 建立最小列:
   - `lane`:由 `pipeline_notes` 執行載體註記推導(含「dispatch」→ `dispatch`;含「手動軌」→ `manual`;皆無 → 預設 `dispatch`)
   - `seq`:目前 `track_plan` 最大 `seq` + 1(查詢後端 `MAX(seq)`;無列則從 1 起)
   - `plan_state`:固定 `queued`(4 值集合之一:`queued`/`unlocked`/`paused`/`done-exited`,對齊 SDD Spec §3.1 —— **不落** `in-flight`,該值由 `roadmapService.computeGate()` 依 `stories.status` 即時推導)
   ```bash
   node .context-db/scripts/upsert-track-plan.js --inline '{
     "story_id": "{story_key}",
     "lane": "{derived_lane}",
     "seq": {next_seq},
     "plan_state": "queued"
   }'
   ```
3. **若 EXISTS** → skip(冪等,不覆寫既有排程狀態)
4. **寫入失敗**(如 story_id 打錯 / DB 忙碌)→ log warning,continue(non-fatal,不阻擋 Story upsert)

---

### 4. Log Workflow to Context Memory DB

```
Tool: mcp__phycool-context__log_workflow
Parameters:
  workflow_type: "create-story"
  story_id: "{story_key}"
  agent_id: {current Agent ID — CC-OPUS / CC-SONNET}
  status: "completed"
```

---

### 5. Report Completion

**Output:**
```
🎯 Story Context 建立完成!

- Story: {story_key} | 狀態: ready-for-dev
- Story 來源: `context-db://stories/{story_key}`（DB-first,無 .md 鏡像）
- DB 同步: ✅ enriched fields 已回寫 Context Memory DB
- 建立: {current_date} by {user_name} (AI-Assisted)

🔧 Required Skills:
- {skill_name}: {reason}

已更新：
- ✅ Context Memory DB（epic_id, domain, story_type, complexity, priority, user_story, background, acceptance_criteria, tasks, dev_notes, required_skills, file_list, source_file, tags, dependencies, create_agent, create_completed_at）
- ✅ track_plan(排程維度,`plan_state=queued`)
- ✅ Tracking file

下一步: dev-story → code-review
```

---

## SUCCESS METRICS

- Story validated against checklist
- Tracking file created
- `track_plan` entry ensured (`plan_state=queued`, non-blocking)
- DB sync successful with non-empty AC and tasks
- **create_agent 非 NULL** ✅（下游 attribution 依賴）
- **epic_id + domain 非 NULL** ✅（DevConsole / search_stories 依賴）
- **user_story + background 非 NULL** ✅（完整 story context 在 DB 中）
- **source_file 非 NULL** ✅（`context-db://stories/{id}` DB-first URI，DevConsole 依此定位 Story record）
- **create_completed_at 非 NULL** ✅（lifecycle timestamp 完整）
- Workflow logged to Context Memory DB

## FAILURE MODES

- Skipping DB sync (pipeline cannot proceed without it)
- Not verifying DB write success
- **create_agent NULL** (違反 `.claude/rules/create-story-enrichment.md`)
- **epic_id / domain NULL** (DevConsole Kanban 無法正確分類)
- **user_story / background NULL** (Story context 遺失，dev-story Step 0 無法獲取完整背景)
- **source_file NULL** (DevConsole 無法定位 Story DB record)
- Using UTC timestamps instead of Taiwan UTC+8
- Not creating tracking file

---

**WORKFLOW COMPLETE** — Story `{story_key}` is now "ready-for-dev".
