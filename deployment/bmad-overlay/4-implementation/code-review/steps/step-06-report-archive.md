---
name: 'step-06-report-archive'
description: 'Generate CR report, archive tracking file, doc drift detection, sidecar cleanup, log workflow'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-06-report-archive.md'
nextStepFile: null
---

# Step 6: Generate Report and Archive

**Goal:** Create code review report, archive tracking, doc drift detection, sidecar cleanup.

---

## AVAILABLE STATE

- `{story_key}`, `{new_status}`, `{saas_readiness_score}` — from Steps 1/5
- `{fixed_count}`, `{action_count}` — from Step 4

---

## EXECUTION SEQUENCE

> **CRITICAL:** POST-REVIEW OUTPUTS — Mandatory documentation for traceability.

### 1. Set Paths

- `{epic_num}` = from `{story_key}`
- `{review_report_path}` = `{implementation_artifacts}/reviews/epic-{epic_num}/{story_key}-code-review-report.md`

---

### 2. Create Review Report File

```markdown
# Code Review Report: {story_key}
**Review Date:** {system_date} | **Reviewer:** {user_name} (AI-Assisted) | **SaaS Score:** {saas_readiness_score}/100

## Summary
| Metric | Value |
|--------|-------|
| Story Status | {new_status} |
| Issues Found | {total_issues} |
| FIXED | {fixed_count} |
| DEFERRED | {deferred_count} |
| WON'T FIX | {wontfix_count} |
| ACCEPTED | {accepted_count} |
| IDD | {idd_count} |
| Dismissed | {dismissed_count} |
| 5-Min Rule 攔截 | {5min_reclassified_count} |
| Priority Score 範圍 | {min_score} - {max_score} |

## Review Trail
{if review_trail non-empty: output concern groupings + path:line stops ordered by blast-radius}
{if review_trail empty: Review Trail: N/A}

## Production Gate Results (v3.0 分級制)
| Gate | Result | Detail |
|------|--------|--------|
| p0-critical | {✅/❌} | CRITICAL={critical_remaining} |
| p1-high | {✅/❌} | HIGH={high_remaining} (≤5, all routed) |
| p2-medium | {✅/⚠️} | MEDIUM={medium_remaining} (≤20) |
| test-debt | {✅/❌} | TestCoverage debt={test_debt_count} |
| accepted-age | {✅/⚠️} | expired={expired_accepted} |
| deferred-age | {✅/⚠️} | stale={stale_deferred} |
| FK-validation | {✅/⚠️} | orphaned-deferred={N}, orphaned-target={N}, missing-review-date={N} |
| SaaS Readiness | {✅/⚠️} | {saas_readiness_score}/100 (≥70) |

## Multi-Source Finding Breakdown
| Source | Found | Unique (post-dedup) | Fixed | Deferred |
|--------|-------|---------------------|-------|----------|
| Blind Hunter (3a) | N | N | N | N |
| Edge Case Hunter (3b) | N | N | N | N |
| Acceptance Auditor (3c) | N | N | N | N |
| SaaS Audit (main) | N | N | N | N |
| Merged (multi-source) | — | N | N | N |
| **Total** | **N** | **N** | **N** | **N** |

## Issues by SaaS Dimension
(Dynamic table: Security/Scalability/Observability/DataConsistency/MigrationIntegrity/ErrorHandling/Compliance/TestCoverage/SkillFORBIDDEN × CRITICAL/HIGH/MEDIUM/LOW)

## Detailed Findings
### [{severity}][{dimension}][{source}] {title}
- **File:** {file}:{line} | **Resolution:** Fixed/Deferred → {target_story_id}

## Tech Debt Tracking
{if action_count > 0: 延後項目已關聯到: **{target_story_id}**}
{else: 無延後項目。}

## Q1-Q5 Self-Check Results
> Framework v1.3: 每個非 FIXED 項目的 5 題自檢答案

| Finding ID | Severity | Q1 (範圍內) | Q2 (≤10行) | Q3 (需前置) | Q4 (藉口?) | Q5 (已解決) | 決策 |
|-----------|---------|:-----------:|:---------:|:----------:|:---------:|:----------:|------|
| {id} | {sev} | {Y/N} | {Y/N} | {Y/N} | {Y/N} | {Y/N} | {classification} |

## IDD Detection Results
> Q1-Q4 IDD Detection Gate 結果

{if idd_count > 0:
| Finding ID | IDD Type | IDD ID | ADR | DB Entry |
|-----------|---------|--------|-----|----------|
| {id} | IDD-{TYPE} | IDD-{TYPE}-{NNN} | ADR-IDD-{TYPE}-{NNN}.md | ✅ |
}
{if idd_count == 0: 無 IDD 項目偵測。}

## ACCEPTED Items
> Priority Score 10-25 或 <10 的項目

{if accepted_count > 0:
| Finding ID | Severity | Priority Score | Review Date | Accepted Reason |
|-----------|---------|:--------------:|:-----------:|----------------|
| {id} | {sev} | {score} | {review_date} | {reason} |
}
{if accepted_count == 0: 無 ACCEPTED 項目。}

## Priority Score Summary
> 所有非 FIXED 項目的 Score 計算結果

| Finding ID | Severity | BlastRadius | BusinessImpact | FixCost | Score | 決策閾值 |
|-----------|---------|:-----------:|:--------------:|:------:|:-----:|---------|
| {id} | {sev} | {br} | {bi} | {fc} | {score} | {threshold_decision} |

## 文檔同步狀態 (TD-31)
{cr_doc_drift section}
```

---

### 3. CR Doc Drift Detection (TD-31)

Run doc drift detection for CR fixes (Warn-Only — never blocks completion):

```powershell
powershell -ExecutionPolicy Bypass -File "{project-root}/scripts/check-doc-drift.ps1" -DiffRange "HEAD~1..HEAD" -JsonOutput -Quiet
```

Parse output JSON to populate `{cr_doc_drift_items}`.

`severity == "must-sync"` items → populate `{cr_must_sync_docs}` with target_story from sprint-status (backlog/ready-for-dev).

Add to review report:
- If drift items: show table with affected_doc / change_type / severity / changed_file + must-sync list
- If no drift: Status: ✅ N/A — No documentation drift detected from CR fixes

Update `{implementation_artifacts}/reviews/README.md` to include new report.

---

### 4. Archive Tracking File

Set paths:
- `{tracking_active_path}` = `{output_folder}/tracking/active/{story_key}.track.md`
- `{tracking_archived_path}` = `{output_folder}/tracking/archived/epic-{epic_num}/{story_key}.track.md`

**If tracking file exists:**
- Update: 狀態, SaaS Score, 完成時間, 審查記錄, 報告連結, 技術債追蹤, Reviewer

**If `{new_status}` == "done":**
- Move tracking file from active/ to archived/epic-{epic_num}/
- Output: 📁 追蹤檔案已歸檔: `archived/epic-{epic_num}/{story_key}.track.md`

**If `{new_status}` != "done":**
- Keep tracking file in active/
- Output: 📝 追蹤檔案保留在 active/

**If tracking file doesn't exist:**
- Create tracking file directly in appropriate location based on status

---

### 5. Sidecar Cleanup (if story done)

**If `{new_status}` == "done":**
1. Check if `{implementation_artifacts}/tech-debt/{story_key}.debt.md` exists
2. If exists: Delete the sidecar file
3. Output: 🗑️ 側車文件已清除: `tech-debt/{story_key}.debt.md`

---

### 6. DB Writeback: Stories Table (MANDATORY)

> **CRITICAL:** 🗄️ MANDATORY DB WRITEBACK — `stories` 表是唯一真相來源。CR 審查結果（score / 時間戳 / issue 統計 / status）**必須**在此步驟寫入 DB，否則違反 DB-first 架構原則（DevConsole / Pipeline / 下一個 dev-story 都從 DB 讀取，.md 只是備份）。

**Step 6.1: 取得 Taiwan timestamp**

```powershell
powershell -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'"
```

儲存為 `{review_completed_ts}`。

**Step 6.2: 寫入 stories 表 (upsert-story.js --merge)**

```bash
node .context-db/scripts/upsert-story.js --merge {story_key} --inline '{
  "status": "{new_status}",
  "cr_score": {saas_readiness_score},
  "review_agent": "{agent_id}",
  "review_completed_at": "{review_completed_ts}",
  "cr_issues_total": {total_issues},
  "cr_issues_fixed": {fixed_count},
  "cr_issues_deferred": {action_count},
  "cr_summary": "CR {saas_readiness_score}/100 — {fixed_count} fixed, {action_count} deferred"
}'
```

> `{agent_id}` = 當前 Agent ID（CC-OPUS / CC-SONNET），來自 `CLAUDE.local.md`  
> `{saas_readiness_score}` / `{total_issues}` / `{fixed_count}` / `{action_count}` = **整數，無引號**  
> `{new_status}` = `"done"` 或 `"review"`（Step 5 產出的值）

**Step 6.3: 補強 review_completed_at（COALESCE 保護，pipeline 已寫則不覆蓋）**

```bash
node scripts/record-phase-timestamp.js {story_key} review-complete
```

**Step 6.4: 驗證寫入成功**

```
Tool: mcp__pcpt-context__search_stories
Parameters: { "story_id": "{story_key}" }
```

確認：`cr_score` 非 NULL + `review_completed_at` 非 NULL + `status` = `{new_status}`。

**If verification fails:**
> 🚨 DB WRITEBACK FAILED — Retry `upsert-story.js --merge`。Pipeline / DevConsole 依賴此資料，不可跳過。

---

### 6.5 Upstream Doc Review History 回寫(Mandatory — 新增 2026-04-14)

> **CRITICAL:** 📚 任何 CR 修改的上游 ADR / SDD Spec 檔案 → **MUST** 在該 doc Review History 新增本 CR row。
>
> **Incident:** 2026-04-14 eft-editor-batch-image-panel-free-open CR 修復 F5(ADR-BUSINESS-001 v1.4 範例廢除 class)但未新增 v1.6 Review History row,造成 ADR 本身也累積 drift。

**執行流程:**

1. 從 Step 1 `{diff_output}` 提取本 CR 修改的 doc 檔案清單(符合 pattern):
   - `docs/technical-decisions/ADR-*.md`
   - `docs/implementation-artifacts/specs/*-spec.md`
   - `docs/technical-decisions/ADR-IDD-*.md`(若有 IDD 變更)

2. **對每個 doc 檔案:**
   - Read 該檔案確認有 `## Review History`(或等效)章節
   - 若**無當日新 row** → 自動 append:
     ```markdown
     | {system_date} | v{next_ver} | CR auto-fix from `{story_key}` (findings: {fixed}/{deferred}/{accepted}) + {brief change} | {agent_id} |
     ```
   - 若已有當日 row(dev-story 階段已寫)→ Skip

3. **驗證(step-06 §7.5 gate):**
   - Grep `{system_date}` in 每個修改的 doc → 至少 1 match
   - 若 0 match → HARD BLOCK,自動補寫後重新驗證

**Output:** `📚 Upstream Doc Review History: 已於 {N} 個 doc 新增 row`

---

### 6.7 Target Story Cross-Sync(Mandatory — 新增 2026-04-14)

> **CRITICAL:** 🔗 每個 DEFERRED / ACCEPTED 含 `target_story` 的 debt → **MUST** 雙向同步至 target Story。
>
> **Incident:** 2026-04-14 eft-editor-batch-image-panel-free-open CR push TD-eft-batch-001 到 tech_debt_items 但未在 target Story `eft-plan-badge-unification` 的 dev_notes / dependencies 註記,造成 debt 被遺忘風險。

**執行流程:**

1. Query: `search_debt({story_id: story_key})` 取得本 CR push 的 non-FIXED debts
2. **對每個有 `target_story` 的 debt:**
   - `search_stories({story_id: target_story, fields: "dependencies, dev_notes"})`
   - 若 `dependencies` 不含 `{debt_id}` → `upsert-story.js --merge {target_story}` append:
     ```
     dependencies: 現有值 + "; {debt_id} (from {source_story} CR, {status}, consumed by this Story)"
     dev_notes:    現有值 + append section「## 接手的 Tech Debt({source_story} CR)」附 debt 詳情
     ```

3. **驗證(step-06 §7.5 gate):**
   - 對每個 debt:`search_stories({target_story}).dependencies` 包含 `{debt_id}` → PASS
   - 任一 FAIL → HARD BLOCK,自動補寫後重新驗證

**Output:** `🔗 Target Story Cross-Sync: {N} debts 已雙向註記至 {M} target stories`

---

### 7. Log Workflow to Context Memory DB

```
Tool: mcp__pcpt-context__log_workflow
Parameters:
  workflow_type: "code-review"
  story_id: "{story_key}"
  agent_id: {current Agent ID — CC-OPUS / CC-SONNET}
  status: "completed"
```

---

### 7.5: Mandatory Memory Writeback Verification (HARD BLOCK)

> **CRITICAL:** 🚨 在 Final Output 之前執行。任一驗證失敗 → **HARD BLOCK**，自動補寫後重新驗證。
> 補寫仍失敗 → 停止 workflow，要求 user 介入。不得跳過進入 Section 8。
>
> **Incident:** 2026-04-11 dla-04 CR 遺漏 cr_issues (0筆) + tech_entries (0筆) + cr_summary (129 chars 過短)，Alan 三次追問才發現。

**Auto-verify 8 項(2026-04-14 從 7 項擴展至 8 項,新增 Gate 8 Defer Audit):**

| # | 目標 | 驗證方式 | 門檻 |
|:-:|------|---------|------|
| 1 | **stories CR 欄位** | `search_stories({story_id})` | `cr_score` 非 NULL + `review_completed_at` 非 NULL + `cr_issues_total` ≥ 1 |
| 2 | **cr_summary 品質** | `search_stories({story_id})` 讀取 `cr_summary` | 長度 > 200 字元（≤200 = 過於簡略） |
| 3 | **cr_issues 完整性** | `add_cr_issue` 已為每個 finding 呼叫 | 筆數 = `cr_issues_total`（FIXED + DEFERRED + DISMISSED 全數） |
| 4 | **context_entries 審查紀錄** | `search_context({story_id, category: "review"})` | ≥ 1 筆 CR 結果摘要 |
| 5 | **tech_entries 技術知識** | `search_tech` 確認 review/pattern/architecture 分類 | ≥ 1 筆（finding 含技術教訓時必寫） |
| 6 | **tasks-backfill-verify Skill 已調用** | `search_stories({story_id}).test_count` 非 NULL + CR report 含 `[tasks-backfill-verify invoked]` marker | 兩者皆 PASS(Skill Step 6 產出的 side effect) |
| 7 | **Upstream Doc + Target Story Cross-Sync** | §6.5 驗證通過 + §6.7 驗證通過 | 每個 CR 修改的 ADR/Spec 有當日 Review History row + 每個 target_story debt 已雙向註記 |
| **8** | **Defer Audit 自檢(2026-04-14 新增)** | CR 完成前必答 4 問:(Q1) diff 含 UI 變更(.tsx/.css/DOM)? → 是 → Q2;(Q2) server 在跑(curl 7135/5173)? → 是 → Q3;(Q3) CR report 含 `[Chrome MCP Live Verification]` marker? → 否 → **FAIL**;(Q4) 跨 plan(至少 Free+1 付費)驗證? → 否 → **FAIL** | 所有 UI Story 必經 Q1-Q4 自檢 + 對應 marker 必寫入 CR report |

**Defer Audit 擴展檢查(Gate 8 延伸):**

CR Agent 在此 Gate 自問:「**Is there any action I could complete now but chose to defer with these excuses?**」
- 「留待 post-CR QA / 手動測試 / live 驗證」→ server 在跑就 MUST 當場做
- 「下次 dev-story 會處理」→ 若是本 Story scope 就 MUST 當場做,不是下次
- 「太 edge case / scope 外」→ 若 AC 明寫或 DoD 標 ⬜ 就 MUST 驗證,不是跳過
- 「工具不穩 / 失敗就跳過」→ 記錄為 finding,不是靜默 skip

任一藉口屬實 → **HARD BLOCK,回頭補做**。

**執行流程:**

1. 依序查詢 8 項,收集結果(Gate 8 需自覺性自問)
2. **全 PASS** → 輸出 `✅ Memory Writeback Verification: 8/8 PASS` → 進入 Section 8
3. **任一 FAIL** → 輸出 `❌ Missing writeback: {failed_items}` → 自動補寫缺失項目 → 重新驗證
4. **重新驗證仍 FAIL** → `⛔ HARD BLOCK: 無法自動補寫 {items},請 user 介入`

**Incident (2026-04-14):** `eft-editor-batch-image-panel-free-open` CR 因缺 Gate 8,連續 3 個遺漏(Skill 未調用 / ADR row 未加 / target Story 未 sync)+ 1 個深層規避(Chrome MCP 未做),使用者追問 4 次才補全。若當時有 Gate 8 Defer Audit,第一輪即被擋下強制補做。

---

### 7.7 L5 Exit-gate Self-audit (Mandatory — td-rule-violation-workflow-postcheck)

> **CRITICAL:** 🛑 L5 EXIT GATE — Final violation self-audit before CR archive. Scans session actions (CR reasoning, auto-fix decisions, defer rationale) against 30d hot violation rules.
>
> Complements §7.5 Gate 8 Defer Audit: Gate 8 catches UI verification skips; L5 catches rule-specific recidivism (Phase A shortcuts, Edit-SKILL bypass, WARN dismissal, etc.). Reference: `memory/reference_rule_violation_tracker.md` §Phase 3 + `.claude/rules/cr-debt-doc-audit.md` §Phase D.

**PROTOCOL:**

1. **Assemble session-actions JSON:**
   - Write `/tmp/session-actions.json` with CR session summary:
     ```json
     {
       "assistant_messages": ["<CR triage rationale / defer reasoning / auto-fix decisions>"],
       "tool_calls":         [{ "name": "<Edit|Bash|search_debt|...>", "input": {...} }],
       "file_changes":       ["<files touched by CR auto-fix from Step 4>"]
     }
     ```
   - Focus on messages containing decision language: DEFERRED, ACCEPTED, 跳過, 繞過, FixCost 估算, WARN=BLOCK.

2. **Run self-audit CLI:**
   ```bash
   cd .context-db && node scripts/check-violation-repeat.js \
     --phase code-review --session-id "{story_key}" --actions-file /tmp/session-actions.json
   ```
   Exit `0` = PASS / `1` = BLOCK + findings[] + suggested_log_commands[].

3. **On BLOCK — Resolve per finding:**
   - Each finding maps to a hot-rule + keyword match with `file:line`-equivalent scope (assistant_message[i] / tool_call[i] / file_change[i])
   - Choose per finding:
     - **Fix in-place** (preferred for 5-Min rule): edit CR report / re-triage / rerun relevant gate
     - **Log acknowledgement** via supplied `suggested_log_commands[i]` (replace placeholder summary with your specific reflection). This writes `context_entries.category='rule_violation'` row → appears in `/rule-violations` dashboard + feeds L4 RAG injection for next session (Phase D of `.claude/rules/cr-debt-doc-audit.md` §Rule Violation Logging already requires this for specific CR incidents; L5 captures the residual tail).
   - Re-run `check-violation-repeat.js` after resolve/log to re-assess.

4. **On PASS:**
   ```
   ✅ L5 Exit-gate Self-audit PASS — 0 findings, CR archive cleared
   ```

**FAIL-OPEN:** CLI failure (missing DB / malformed JSON / keyword map absent) → emit `⚠ L5 self-audit skipped (CLI error: <stderr>)` and proceed to Section 8. Never hard-block CR archive on telemetry infra bugs.

**FORBIDDEN:**
- ❌ Skip this step (Gate 8 Defer Audit does NOT substitute — different scope)
- ❌ Edit `check-violation-repeat.js` / keyword map to silence findings
- ❌ Claim PASS without running CLI (assistant self-assessment ≠ script verdict)
- ❌ Use `--all-rules` in normal flow (reserved for audit/debug)

**Integration with existing Phase D of cr-debt-doc-audit.md:**
- Phase D (§Rule Violation Logging) = **prospective** — triggered by specific known CR incidents (R1→R2 rescue, WARN unresolved, etc.)
- §7.7 L5 Exit-gate = **retrospective** — catches violations Phase D missed via keyword scan of full session

Both run; L5 is the last safety net.

---

### 8. Final Output

```
📋 Post-Review Documentation Complete!
審查報告: {review_report_path}
追蹤狀態: {if done: 已歸檔 else: 保留 active/}
{if action_count > 0: 側車文件: tech-debt/{target_story_id}.debt.md}
```

---

## SUCCESS METRICS

- CR report created at `{review_report_path}`
- reviews/README.md updated
- Doc drift detection run
- Tracking file updated and archived (if done)
- Sidecar cleanup done (if done)
- **Stories table DB writeback**: `cr_score`, `review_agent`, `review_completed_at`, `cr_issues_*`, `status` 全部非 NULL ✅
- Workflow logged to Context Memory DB
- **Memory Writeback Verification**: 5/5 PASS（cr_score + cr_summary + cr_issues + context_entries + tech_entries）

## FAILURE MODES

- Skipping CR report creation
- Not archiving tracking file when status is done
- Not cleaning up sidecar when status is done
- **Not writing CR results to stories table** (cr_score / review_completed_at / status remain NULL — violates DB-first)
- Missing workflow log to Context Memory DB
- **Skipping Section 7.5 Memory Writeback Verification** (cr_issues / tech_entries / context_entries 遺漏 — dla-04 incident)

---

**WORKFLOW COMPLETE** — Code review for `{story_key}` is done. Status: `{new_status}`.
