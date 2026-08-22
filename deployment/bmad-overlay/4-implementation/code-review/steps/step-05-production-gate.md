---
name: 'step-05-production-gate'
description: 'Bug fix verification, production gate checks, status decision'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-05-production-gate.md'
nextStepFile: '{workflow_path}/steps/step-05b-tasks-backfill.md'
---

# Step 5: Production Gate and Status Update

**Goal:** Run bug fix verification, apply all production gates, determine final story status.

---

## AVAILABLE STATE

- `{story_key}`, `{tech_debt_count}`, `{saas_readiness_score}` — from Steps 1/3
- `{fixed_count}`, `{action_count}`, `{deferred_issues}`, `{accepted_issues}`, `{idd_issues}` — from Step 4

---

## STATE VARIABLES (set in this step)

- `{new_status}` — 最終 Story 狀態 (done/in-progress/blocked)
- `{gate_failed}` — Production Gate 是否失敗
- `{critical_remaining}` — 剩餘 CRITICAL 問題數
- `{high_remaining}` — 剩餘 HIGH 問題數
- `{acs_incomplete}` — 未完成 AC 數

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — for production gates.

> **CRITICAL:** 🔄 PRODUCTION GATE CHECK — 此步驟不可跳過！

---

### Step 5.0: Bug Fix Verification (Mandatory)

> **CRITICAL:** MANDATORY BUG VERIFICATION — Must verify Bug fix status before Production Gate.

**PROTOCOL:** Invoke the Skill tool: `/bug-fix-verification {story_key}`

Verification criteria:
1. Query `review_findings` for Bugs related to this Story (`fix_story_id` / `suggested_story` / `module_code`)
2. Each Bug MUST be verified by Reading actual source code (FIXED/OPEN/DEFERRED/NOT_APPLICABLE)
3. FIXED → update `review_findings` (`fix_status=fixed` + file:line evidence)
4. DEFERRED → sync to `tech_debt_items` (`upsert-debt.js`)
5. OPEN P0/P1 Bugs → count towards `{critical_remaining}`
6. Append verification report to CR report

---

### Step 5.1: Calculate Final Metrics

```
{critical_remaining} = remaining CRITICAL issues after auto-fix + open P0/P1 bugs
{high_remaining} = remaining HIGH issues after auto-fix
{acs_incomplete} = ACs not implemented
{final_tech_debt} = {tech_debt_count} + count of new DEFERRED entries (use cached {tech_debt_count} from Step 1's search_debt call — do NOT re-query)
```

---

### Step 5.2: Production Gate Validation (Framework v1.3 分級制)

> **REF:** `phycool-debt-registry` §13 — Production Gate v3.0 分級制

#### Gate p0: Zero CRITICAL (BLOCK)
```
If {critical_remaining} > 0:
  Output: ❌ p0 FAILED: {critical_remaining} 個 CRITICAL 未修復！Story 無法標記 done。
  Set {new_status} = "blocked", {gate_failed} = true
```

#### Gate p1: HIGH ≤ 5 (BLOCK)
```
If {high_remaining} > 5:
  Output: ❌ p1 FAILED: {high_remaining} 個 HIGH (限制 ≤5)！
  Set {new_status} = "in-progress", {gate_failed} = true

If {high_remaining} > 0 AND {high_remaining} ≤ 5 AND all routed with root cause:
  Output: ⚠️ p1 PASS (with routing): {high_remaining} 個 HIGH 已路由。

If {high_remaining} > 0 AND NOT all routed:
  Output: ❌ p1 FAILED: {high_remaining} 個 HIGH 未完成路由！
  Set {new_status} = "in-progress", {gate_failed} = true
```

#### Gate p2: MEDIUM ≤ 20 (WARN)
```
If {medium_remaining} > 20:
  Output: ⚠️ p2 WARNING: {medium_remaining} 個 MEDIUM (閾值 ≤20)！
```

#### Gate p3/p4: LOW + ACCEPTED (unlimited, no gate)
```
Output: ℹ️ p3/p4: LOW={low_remaining}, ACCEPTED={accepted_count} — 不計入 gate
```

#### Gate: test-debt = 0 (BLOCK)
```
Query: count of open tech_debt_items WHERE dimension='TestCoverage' AND category='accepted' AND story_id='{story_key}'
If test_debt_count > 0:
  Output: ❌ test-debt FAILED: {test_debt_count} 個 TestCoverage debt 被標為 ACCEPTED — 測試債只能 FIXED 或 DEFERRED！
  Set {gate_failed} = true
```

#### Gate: Age Limits (WARN)
```
Query: ACCEPTED items WHERE review_date < current_date (expired)
If expired_accepted > 0:
  Output: ⚠️ age-limit: {expired_accepted} 個 ACCEPTED 已過期，須 re-triage

Query: DEFERRED items WHERE created_at < current_date - 90d
If stale_deferred > 0:
  Output: ⚠️ age-limit: {stale_deferred} 個 DEFERRED 超過 90 天，建議升級或改 ACCEPTED
```

#### Gate: FK Validation (WARN)
```
Check 1: DEFERRED items without target_story → orphaned-deferred
Check 2: target_story not in stories table → orphaned-target-story
Check 3: ACCEPTED items without review_date → missing-review-date

If any FK violation:
  Output: ⚠️ FK: orphaned-deferred={N}, orphaned-target-story={N}, missing-review-date={N}
```

#### Gate: SaaS Readiness
```
If {saas_readiness_score} < 70:
  Output: ⚠️ SaaS Readiness: {saas_readiness_score}/100 (閾值: 70)
```

#### Gate: Zero-Finding Justification (BLOCK if missing — W3 蒸餾)

> **REF:** `saas-standards.md` §Zero-Finding Justification（對抗審查制度化）

```
If {fixed_count} == 0 AND {action_count} == 0 (total findings == 0):
  Require Zero-Finding Justification in CR report:
    - ≥ 3 條「驗證了 {X}，因為 {Y}（file:line），結論無問題」
    - 每條對應一個 review dimension（8 維之一）+ file:line evidence
  If justification NOT present (或 < 3 dimensions / 缺 file:line):
    Output: ❌ zero-finding FAILED: 0 findings 但無合格 Zero-Finding Justification（未實質審查紅旗）
    Set {gate_failed} = true
  If justification present (≥ 3 dimensions with file:line):
    Output: ✅ zero-finding PASS: Justification 含 {N} dimensions
Else (findings > 0):
  Output: ℹ️ zero-finding N/A（本次有 findings，免 justification）
```

---

### Step 5.3: Determine Final Status

```
If {gate_failed} != true AND {critical_remaining} == 0 AND {high_remaining} == 0 AND {acs_incomplete} == 0 AND test_debt_count == 0:
  Set {new_status} = "done"

If {gate_failed} != true AND ({high_remaining} > 0 with justification OR {acs_incomplete} > 0):
  Set {new_status} = "in-progress"

If any BLOCK gate failed (p0 / p1 / test-debt):
  Set {new_status} = "blocked" or "in-progress" (based on severity)
```

---

### Step 5.4: Update Story Status

**If `{db_context_available}` == true (DB-first story — 無 `.md` 鏡像，bwu-1 G-4 路徑):**

1. 以 `upsert-story.js --merge` 寫 DB：`status` = `{new_status}`
2. 同時寫 review attribution DB 欄位：`review_agent`（current LLM model name）+ `review_completed_at`（`powershell -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'"`，offset-aware Taiwan `+08:00`）
3. 回查驗證：`search_stories({story_id, fields:"status,review_agent,review_completed_at"})` 三欄與預期一致
4. `/story-status-emoji` 屬 **N/A** —— 無 `.md` 即無 H1 標題可同步（見該 skill description）。**不得**因此改為產出 `.md`（違反 SUPREME `.claude/rules/db-first-no-md-mirror.md`）

**If `{db_context_available}` == false (legacy `.md`-tracked story):**

1. Update story Status field to `{new_status}`
2. Fill Review Agent tracking fields in Story 資訊 table:
   - Review Agent: Record the current LLM model name
   - Review完成時間: Execute `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"` (Taiwan UTC+8)
3. Verify Status field was updated correctly
4. Invoke `Skill(skill="story-status-emoji")` Mode A on the story file (status: `{new_status}`, check tech debt for compound marker)
5. Save story file.

---

### Step 5.6: Final Report

**Output:**
```
✅ Code Review Complete!
Story: {story_key} | Status: {new_status} | SaaS Score: {saas_readiness_score}/100
📊 Fixed: {fixed_count} | Deferred: N | WON'T FIX: N | ACCEPTED: N | IDD: N
🚧 Gates: p0(CRIT)={✅/❌} p1(HIGH)={✅/❌} p2(MED)={✅/⚠️} test-debt={✅/❌} age={✅/⚠️} FK={✅/⚠️} SaaS={✅/⚠️} zero-finding={✅/❌/N-A}
{if done: 🎉 Code review 通過！Story 可進入下一階段。}
{if blocked: ⛔ Story 被阻塞！請先修復 CRITICAL 問題。}
{if in-progress: 📋 請處理待辦項目後，重新執行 code-review。}
```

---

## SUCCESS METRICS

- Bug fix verification completed
- All production gates evaluated
- `{new_status}` determined based on gate results
- Story Status updated in `stories` 表(DB 單一 SSoT;sprint-status.yaml 已凍結 2026-07-28)
- H1 emoji synced

## FAILURE MODES

- Skipping bug fix verification
- Not applying production gates correctly
- Re-querying `search_debt` in this step (must use `{final_tech_debt}` from Step 1's cached count)
- Using UTC timestamps instead of Taiwan UTC+8

---

**NEXT:** Load `step-05b-tasks-backfill.md`
