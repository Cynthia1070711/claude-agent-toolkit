---
name: 'step-07-finalize'
description: 'Validate, update sprint-status, DB sync, tracking file, and completion communication'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-07-finalize.md'
nextStepFile: null
---

# Step 7: Update Sprint Status and Finalize

**Goal:** Validate story against checklist, update sprint-status, sync to DB, and create tracking file.

---

## AVAILABLE STATE

- All variables from Steps 0-6

---

## EXECUTION SEQUENCE

### 1. Validate Against Checklist

**PROTOCOL:** Validate against checklist at `{installed_path}/checklist.md`

Save story document unconditionally.

---

### 2. Create/Update Tracking File

Set `{tracking_active_path}` = `{output_folder}/tracking/active/{story_key}.track.md`

**If tracking file does NOT exist:**
1. Create tracking file from template:
   - Path: `{tracking_active_path}`
   - 狀態: ready-for-dev
2. Update `{output_folder}/tracking/README.md`

---

### 3. Update Sprint Status

**If sprint status file exists:**
1. Update `{sprint_status}`
2. Use `{sprint_status_cache}` from Step 1 — **do NOT re-read the file**
3. Find `development_status` key matching `{story_key}`
4. Verify current status is "backlog" (expected previous state)
5. Update `development_status[{story_key}]` = "ready-for-dev"
6. Save file, preserving ALL comments and structure including STATUS DEFINITIONS

---

### 4. Mandatory DB Sync

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
  "source_file": "docs/implementation-artifacts/stories/epic-{epic_num}/{story_key}.md",
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
> `{definition_of_done_text}` = Exit Criteria / DoD 章節內容（若有；空則 `null`）  
> `{rollback_plan_text}` = SDD Spec §8 的 rollback plan（若有；無則從 Story 推導簡短回退方案）  
> `{risk_assessment_text}` = 風險評估（格式: `{LEVEL} — {reason}`，如 `LOW — Markdown only, no app code`）  
> `{user_story_text}` = "作為 / 我希望 / 以便" 格式的 user story（Story 文件 §1）  
> `{tags_text}` = Story 文件中的 tags（逗號分隔字串，若無則 `null`）  
> `{dependencies_text}` = Story 文件中的依賴 Story 清單（若無則 `null`）  
> `{source_file}` = Story .md 相對路徑，固定格式 `docs/implementation-artifacts/stories/epic-{epic_num}/{story_key}.md`

CRITICAL field requirements:
- `acceptance_criteria`: MUST contain full ATDD format with `[Verifies: BR-XXX]`
- `tasks`: MUST contain full markdown checklist (all `[ ]` items)
- `dev_notes`: MUST contain tech debt prevention checklist + file references
- `required_skills`: MUST list all matched skills with reasons
- `user_story`: MUST be in "As a / I want / So that" format（或中文 equivalent）
- `create_agent`: MUST be set — 下游 code-review 追蹤 attribution 依賴此欄位
- `epic_id` + `domain`: MUST be set — DevConsole Kanban / search_stories epic filter 依賴
- `file_list`: MUST match Story .md File List table content（非 NULL）
- `rollback_plan`: SHOULD be set（來自 SDD Spec §8 或推導）
- `risk_assessment`: SHOULD be set（`{LEVEL} — {reason}` 格式）
- All text fields MUST be properly JSON-escaped

**Verify DB write (NULL field audit):**

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('.context-db/context-memory.db', {readonly: true});
const MUST_FILL = ['story_id','epic_id','domain','title','status','priority','complexity','story_type','user_story','background','acceptance_criteria','tasks','dev_notes','required_skills','file_list','implementation_approach','testing_strategy','definition_of_done','sdd_spec','source_file','tags','create_agent','create_completed_at'];
const SHOULD_FILL = ['rollback_plan','risk_assessment','dependencies'];
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

---

### 5. Log Workflow to Context Memory DB

```
Tool: mcp__pcpt-context__log_workflow
Parameters:
  workflow_type: "create-story"
  story_id: "{story_key}"
  agent_id: {current Agent ID — CC-OPUS / CC-SONNET}
  status: "completed"
```

---

### 6. Report Completion

**Output:**
```
🎯 Story Context 建立完成!

- Story: {story_key} | 狀態: ready-for-dev
- 檔案: {story_file}
- DB 同步: ✅ enriched fields 已回寫 Context Memory DB
- 建立: {current_date} by {user_name} (AI-Assisted)

🔧 Required Skills:
- {skill_name}: {reason}

已更新：
- ✅ Story 檔案（.md）
- ✅ Context Memory DB（epic_id, domain, story_type, complexity, priority, user_story, background, acceptance_criteria, tasks, dev_notes, required_skills, file_list, source_file, tags, dependencies, create_agent, create_completed_at）
- ✅ sprint-status.yaml
- ✅ Tracking file

下一步: dev-story → code-review
```

---

## SUCCESS METRICS

- Story validated against checklist
- Tracking file created
- Sprint status updated to "ready-for-dev"
- DB sync successful with non-empty AC and tasks
- **create_agent 非 NULL** ✅（下游 attribution 依賴）
- **epic_id + domain 非 NULL** ✅（DevConsole / search_stories 依賴）
- **user_story + background 非 NULL** ✅（完整 story context 在 DB 中）
- **source_file 非 NULL** ✅（DevConsole .md 連結依賴）
- **create_completed_at 非 NULL** ✅（lifecycle timestamp 完整）
- Workflow logged to Context Memory DB

## FAILURE MODES

- Skipping DB sync (pipeline cannot proceed without it)
- Not verifying DB write success
- **create_agent NULL** (違反 `.claude/rules/create-story-enrichment.md`)
- **epic_id / domain NULL** (DevConsole Kanban 無法正確分類)
- **user_story / background NULL** (Story context 遺失，dev-story Step 0 無法獲取完整背景)
- **source_file NULL** (DevConsole 無法跳轉到 .md 檔案)
- Using UTC timestamps instead of Taiwan UTC+8
- Not creating tracking file

---

**WORKFLOW COMPLETE** — Story `{story_key}` is now "ready-for-dev".
