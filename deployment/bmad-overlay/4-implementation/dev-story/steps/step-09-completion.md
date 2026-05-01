---
name: 'step-09-completion'
description: 'Story completion: DoD validation, mark review, bug verification, tasks backfill, doc drift detection'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-09-completion.md'
nextStepFile: '{workflow_path}/steps/step-10-communication.md'
---

# Step 9: Story Completion

**Goal:** Validate DoD, mark story for review, run bug verification, tasks backfill, and doc drift detection.

---

## AVAILABLE STATE

- All variables from Steps 1-8

---

## EXECUTION SEQUENCE

### 1. Pre-Completion Validation

1. Verify ALL tasks and subtasks are marked `[x]` (re-scan the story document now)
2. Run the full regression suite (do not skip)
3. Confirm File List includes every changed file
4. Execute enhanced definition-of-done validation:
   - All tasks/subtasks marked complete with `[x]`
   - Implementation satisfies every Acceptance Criterion
   - Unit tests for core functionality added/updated
   - Integration tests for component interactions added when required
   - End-to-end tests for critical flows added when story demands them
   - All tests pass (no regressions, new tests successful)
   - Code quality checks pass (linting, static analysis if configured)
   - File List includes every new/modified/deleted file (relative paths)
   - Dev Agent Record contains implementation notes
   - Change Log includes summary of changes
   - Only permitted story sections were modified
   - Story 資訊 table `**狀態**` row is set to "review"
   - sprint-status.yaml `development_status[story_key]` is set to "review"

### 2. Update Story Status to "review"

1. Update Story 資訊 table: change `| **狀態** | ... |` row value to `review`
2. Fill DEV Agent tracking fields in Story 資訊 table:
   - DEV Agent: Record the current LLM model name (e.g., "Claude Sonnet 4.6")
   - DEV完成時間: Execute `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"` to get Taiwan time

### 2b. Update Stories Table Status (MANDATORY)

> **CRITICAL:** 🗄️ 步驟 2 僅更新 `.md` 檔，`stories` 表尚未同步。DB-first 架構要求必須額外透過 `upsert-story.js` 寫入 stories 表，否則 Pipeline / DevConsole / 下一個 code-review Step 0 讀到的狀態仍是舊值。

**Step 2b.1: 寫入 stories 表狀態與 dev_agent**

```bash
node .context-db/scripts/upsert-story.js --merge {story_key} --inline '{
  "status": "review",
  "dev_agent": "{current_agent_name}"
}'
```

> `{current_agent_name}` = 當前 Agent ID（CC-OPUS / CC-SONNET），來自 `CLAUDE.local.md`

**Step 2b.2: 補強 completed_at（COALESCE 保護，pipeline 已寫則不覆蓋）**

```bash
node scripts/record-phase-timestamp.js {story_key} dev-complete
```

> `started_at` 已由 step-04 的 `record-phase-timestamp.js dev-start` 設定。  
> `completed_at` 由本步驟補強，COALESCE 保護避免覆蓋 pipeline 既有值。

**Step 2b.3: 驗證**

```
Tool: mcp__pcpt-context__search_stories
Parameters: { "story_id": "{story_key}" }
```

確認：`status` = `"review"` + `dev_agent` 非 NULL + `completed_at` 非 NULL。

---

### 3. Update Sprint Status to "review"

**If `{sprint_status}` file exists AND `{current_sprint_status}` != "no-sprint-tracking":**
1. Use `{sprint_status_cache}` from Step 1 — **do NOT re-read the file**
2. Find `development_status` key matching `{story_key}`
3. Verify current status is "in-progress" (expected previous state)
4. Update `development_status[{story_key}]` = "review"
5. Save file, preserving ALL comments and structure including STATUS DEFINITIONS

Output: ✅ Story status updated to "review" in sprint-status.yaml

**If story key not found in sprint status:**
Output: ⚠️ Story file updated, but sprint-status update failed: `{story_key}` not found

### 4. Final HALT Conditions

- **If any task is incomplete:** HALT — Complete remaining tasks before marking ready for review
- **If regression failures exist:** HALT — Fix regression issues before completing
- **If File List is incomplete:** HALT — Update File List with all changed files
- **If definition-of-done validation fails:** HALT — Address DoD failures before completing

---

### 5. Bug Fix Verification (Step 9.3)

> **CRITICAL:** MANDATORY BUG VERIFICATION — Must verify related Bug fix status before promoting to review.

**PROTOCOL:** Invoke the Skill tool: `/bug-fix-verification {story_key}`

Verification criteria:
1. Query `review_findings` for Bugs related to this Story (`fix_story_id` or `module_code`)
2. Each Bug MUST be verified by Reading actual source code (FIXED/OPEN/NOT_APPLICABLE)
3. FIXED Bugs → update `review_findings` (`fix_status=fixed` + file:line evidence)
4. OPEN P0/P1 Bugs → HALT, cannot promote to review
5. Record results in tracking file

---

### 6. Sync H1 Heading Emoji

> **CRITICAL:** Invoke `/story-status-emoji` skill Mode A on this story file (status: review)

---

### 7. Tasks DB Backfill (Step 9.4)

> **CRITICAL:** 🔴 MANDATORY DB BACKFILL — Must run after all implementation and tests.

**PROTOCOL:** Invoke the Skill tool with the EXACT full name:

```
Skill({ skill: "tasks-backfill-verify", args: "{story_key}" })
```

> ⚠️ CRITICAL: Use the FULL skill name `tasks-backfill-verify` — NOT `verify` (which is the generic build/test tool, completely different).

Verification standards:
1. Each ✅ MUST have Read code file:line evidence
2. Each ⬜ MUST have reason for incompletion
3. Forbidden: `[x]/[ ]` format (must use ✅/⬜ emoji)
4. tasks is Markdown string, NOT JSON array
5. Cannot mark all ✅ because "looks done" — each task independently verified

After `/tasks-backfill-verify` completes: confirm DB `tasks` field updated with ✅/⬜ markers.

---

### 7.5 Boy Scout Sweep (Mandatory)

> **CRITICAL:** 🧹 BOY SCOUT SWEEP — Framework v1.3 Boy Scout Rule: 離開營地時比來時更乾淨。
> 掃描本 Story file_list 對應的 open tech debts，以 5-Minute Rule 4-signal 分類器篩選可順手修的項目。

**PROTOCOL:**

1. **提取 file_list** → 從 Story 的 File List 收集所有 NEW/MODIFY 檔案路徑（排除 SYNC/DELETE）
2. **Dry-run 掃描** → 執行腳本辨識候選：

   ```bash
   node .context-db/scripts/boy-scout-sweep.js --files "{file_list_comma_separated}"
   ```

3. **若有 candidates** → Dev agent 逐一 inline fix：
   - Read code (file:line) → 確認 5-Min Rule 條件（≤5 行、0 跨檔依賴、0 副作用）
   - Edit fix → 驗證不 break 既有測試
   - 若修復成功 → 繼續下一筆；若修復失敗或超出 5-Min 範圍 → skip 該筆

4. **Resolve 修復完成的 debts** → 執行 execute 模式：

   ```bash
   node .context-db/scripts/boy-scout-sweep.js --files "{file_list_comma_separated}" --execute --story {story_key} --agent {agent_id}
   ```

5. **記錄結果** → 在 tracking file 追加：`🧹 Boy Scout Sweep: fixed N / skipped M debts`
6. **若 0 candidates** → 輸出：`🧹 Boy Scout Sweep: 0 candidates — clean pass ✅`（無需 execute）

**BOUNDARY CONDITIONS:**
- 每次 sweep 最多處理 10 筆候選（超過部分延至下次 sweep）
- S4=false（IDD 保護）的 debt 絕不進入候選清單
- sweep 失敗為非致命錯誤 — 記錄後繼續 Step 8

---

### 8. Skill Sync Gate (Mandatory)

> **CRITICAL:** 🔒 SKILL SYNC GATE — Mandatory gate per `.claude/rules/skill-sync-gate.md`. Must complete before archival.
>
> Prompt is verbal instruction, Skill is written SOP. Code changed but Skill not synced = next conversation uses stale SOP producing incorrect code.

**PROTOCOL:**

1. **Scan `{file_list}`** → extract core change concepts (Entity names, Route paths, rule keywords)
2. **Grep reverse search** → `Grep pattern="{concept}" path=".claude/skills/pcpt-*"` to find Skills referencing these concepts
3. **Produce Skill Impact Report**:
   ```markdown
   ## Skill Sync Check
   | Affected Skill | Affected Section | Change Type | Synced |
   |---------------|-----------------|-------------|--------|
   | pcpt-xxx | L42: section name | Business rule | ✅/⬜ |
   ```
4. **If affected Skills exist → run `/saas-to-skill` Mode B** to update
5. **Mark ✅ after update**, attach Skill version and change summary
6. **If no affected Skills** → Record "Skill Sync Check: no affected Skills" in tracking file

**Quick Decision:**
- `{file_list}` contains Migration/Model/Service/Controller/Route/Component changes? → Grep search pcpt-* Skills
- Pure UI style/test/doc changes → Skip (record "no trigger files")

**Reference:** Full gate specification at `.claude/rules/skill-sync-gate.md`

---

### 8.5 L5 Exit-gate Self-audit (Mandatory — td-rule-violation-workflow-postcheck)

> **CRITICAL:** 🛑 L5 EXIT GATE — Scans session actions against 30d hot violation rules before archive. If any hot-rule keyword triggers, BLOCK until resolved.
>
> Fires **before** L1 Stop-hook can catch drift. Reference: `.claude/rules/context-memory.md` §Context Memory DB + `memory/reference_rule_violation_tracker.md` §Phase 3.

**PROTOCOL:**

1. **Assemble session-actions JSON** (Agent self-constructed, no infra dependency):
   - Write `/tmp/session-actions.json` containing:
     ```json
     {
       "assistant_messages": ["<3-5 key self-narration or decision-rationale strings from this dev-story>"],
       "tool_calls":         [{ "name": "Edit|Bash|...", "input": {...} }],
       "file_changes":       ["<same as {file_list} from Step 9.1>"]
     }
     ```
   - Approximation acceptable — include messages that contain decision language (e.g., "我選 DEFERRED", "跳過", "繞過"); file_changes reuses the Story file_list.

2. **Run self-audit CLI:**
   ```bash
   cd .context-db && node scripts/check-violation-repeat.js \
     --phase dev-story --session-id "{story_key}" --actions-file /tmp/session-actions.json
   ```
   - Exit `0` → PASS (`status:"PASS", findings:[]`) → proceed to Step 9
   - Exit `1` → BLOCK (`status:"BLOCK"`, findings[] non-empty, suggested_log_commands[] ready to run)

3. **On BLOCK — Resolve each finding:**
   - For each `suggested_log_commands[i]` in CLI JSON output:
     - Review the finding (rule / keyword / scope / context snippet)
     - **Option A — Fix in-place** (preferred when ≤ 5 min per `5-Min Rule`): Edit the offending code / remove the pattern / re-run check-violation-repeat.js to confirm 0 findings
     - **Option B — Log acknowledgement**: Replace placeholder `'...replace this placeholder...'` in the suggested command with your specific one-line reflection, then execute:
       ```bash
       node .context-db/scripts/log-rule-violation.js --rule '<rule>' --loaded true --cli-enforced false \
         --phase dev-story --severity <sev> --summary '<your specific one-line reason>' --session {story_key}
       ```
   - After each fix/log, re-run `check-violation-repeat.js` to confirm state.
   - Agent may proceed to Step 9 after **either** all findings resolved (0 findings) **or** all findings logged via `log-rule-violation.js` (DB audit trail captured).

4. **On PASS:**
   ```
   ✅ L5 Exit-gate Self-audit PASS — 0 findings, safe to archive
   ```

**FAIL-OPEN:** If CLI fails (DB missing / JSON parse error / keyword map missing) emit `⚠ L5 self-audit skipped (CLI error: <stderr>)` and proceed. Telemetry infra unavailability must not block dev work.

**FORBIDDEN:**
- ❌ Skip this step claiming "I didn't violate anything" — the CLI, not agent self-assessment, is the judge
- ❌ Edit `check-violation-repeat.js` or `_ref/violation-keyword-map.json` to silence findings
- ❌ Mark step complete without running CLI + (resolving OR logging) findings
- ❌ Use `--all-rules` in normal flow (reserved for audit mode; default hot-rules filter is the contract)

---

### 9. Update Tracking File

Set `{tracking_active_path}` = `{output_folder}/tracking/active/{story_key}.track.md`

**If tracking file exists:**
- Update:
  - 狀態 → review
  - 執行日誌: append dev records
  - 檔案變更紀錄: list changed files
- Output: 📝 Tracking file updated: `active/{story_key}.track.md`

---

### 10. Doc Impact Hook (Step 9.4b)

Run doc impact reminder hook (Warn-Only — never blocks completion):

```powershell
powershell -ExecutionPolicy Bypass -File "{project-root}/scripts/post-dev-story-doc-reminder.ps1" -StoryFile "{story_path}"
```

---

### 11. Doc Drift Detection (Step 9.5 — TD-31)

Run doc drift detection (Warn-Only — never blocks completion):

```powershell
powershell -ExecutionPolicy Bypass -File "{project-root}/scripts/check-doc-drift.ps1" -DiffRange "HEAD~1..HEAD" -JsonOutput -OutputFile "{project-root}/docs/tracking/doc-drift-latest.json" -Quiet
```

Parse drift results from `doc-drift-latest.json` (if exists):
- Extract `drift_items` where `severity == "must-sync"` or `"warning"`
- Store as `{drift_affected_docs}` list

**If `{drift_affected_docs}` is not empty:**
- Add or update "## 文檔影響評估" section in story file with table
- Update tracking file with drift summary
- Output: ⚠️ **Doc Drift Detected:** [must-sync count, warning count]

**If `{drift_affected_docs}` is empty or script not found:**
- Output: ✅ No documentation drift detected

---

## SUCCESS METRICS

- All tasks marked `[x]`
- Story status set to "review" in story file AND sprint-status.yaml AND `stories` table (三處同步)
- DEV Agent and completion time recorded in stories table
- **Stories table DB writeback**: `status="review"` + `dev_agent` + `completed_at` 全部非 NULL ✅
- Bug fix verification completed
- H1 emoji synced
- Tasks DB backfill completed with ✅/⬜ evidence
- Skill Sync Gate completed (Impact Report produced or "no trigger files" recorded)
- Tracking file updated

## FAILURE MODES

- Marking "review" without completing all tasks
- Not updating BOTH story file and sprint-status.yaml
- **Not updating stories table via upsert-story.js** (DB-first 架構違反)
- Skipping bug fix verification
- Skipping tasks backfill
- Skipping Skill Sync Gate (code changed but Skills not checked)
- Using `[x]/[ ]` format in backfill instead of ✅/⬜
- Using UTC timestamps instead of Taiwan UTC+8

---

**NEXT:** Load `step-10-communication.md`
