---
name: 'step-05-production-gate'
description: 'Bug fix verification, production gate checks, status decision, sprint-status sync'
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
- `{sprint_status_cache}` — from Step 1

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
{final_tech_debt} = {tech_debt_count} + count of new DEFERRED entries (do NOT re-read registry.yaml)
```

---

### Step 5.2: Production Gate Validation (Framework v1.3 分級制)

> **REF:** `pcpt-debt-registry` §13 — Production Gate v3.0 分級制

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
Query: count of open tech_debt_items WHERE category='TestCoverage' AND story_id='{story_key}'
If test_debt_count > 0:
  Output: ❌ test-debt FAILED: {test_debt_count} 個 TestCoverage debt 必須修復！
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

1. Update story Status field to `{new_status}`
2. Fill Review Agent tracking fields in Story 資訊 table:
   - Review Agent: Record the current LLM model name
   - Review完成時間: Execute `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"` (Taiwan UTC+8)
3. Verify Status field was updated correctly

> **CRITICAL:** Invoke `/story-status-emoji` skill Mode A on this story file (status: `{new_status}`, check tech debt for compound marker)

Save story file.

---

### Step 5.5: Sync Sprint Status

**If `{sprint_status}` file exists:**
1. Use `{sprint_status_cache}` from Step 1 — **do NOT re-read the file**
2. Find `development_status` key matching `{story_key}`
3. Update `development_status[{story_key}]` = `{new_status}`
4. Add comment with review summary:
   `# Code Review {system_date} - Score:{saas_readiness_score} Fixed:{fixed_count} Deferred:{action_count} → {target_story_id}`
5. Save file preserving ALL comments and structure
6. Output: ✅ Sprint status synced: `{story_key}` → `{new_status}`

---

### Step 5.6: Final Report

**Output:**
```
✅ Code Review Complete!
Story: {story_key} | Status: {new_status} | SaaS Score: {saas_readiness_score}/100
📊 Fixed: {fixed_count} | Deferred: N | WON'T FIX: N | ACCEPTED: N | IDD: N
🚧 Gates: p0(CRIT)={✅/❌} p1(HIGH)={✅/❌} p2(MED)={✅/⚠️} test-debt={✅/❌} age={✅/⚠️} FK={✅/⚠️} SaaS={✅/⚠️}
{if done: 🎉 Code review 通過！Story 可進入下一階段。}
{if blocked: ⛔ Story 被阻塞！請先修復 CRITICAL 問題。}
{if in-progress: 📋 請處理待辦項目後，重新執行 code-review。}
```

---

## SUCCESS METRICS

- Bug fix verification completed
- All production gates evaluated
- `{new_status}` determined based on gate results
- Story Status and sprint-status.yaml updated
- H1 emoji synced

## FAILURE MODES

- Skipping bug fix verification
- Not applying production gates correctly
- Re-reading registry.yaml (must use `{final_tech_debt}` from count)
- Using UTC timestamps instead of Taiwan UTC+8

---

**NEXT:** Load `step-05b-tasks-backfill.md`
