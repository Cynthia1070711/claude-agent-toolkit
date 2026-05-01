---
name: 'step-04-present-autofix'
description: 'Present findings, auto-fix ALL severity levels, architecture bug detection, Debt Registry Push + Sidecar'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-04-present-autofix.md'
nextStepFile: '{workflow_path}/steps/step-04b-skill-staleness.md'
---

# Step 4: Present Findings with Mandatory Resolution

**Goal:** Present all findings, auto-fix ALL severity levels, push non-fixed items to Debt Registry.

> **CRITICAL:** 🚫 Do NOT ask user permission before fixing. This step executes automatically after Step 3d. ALL severity levels are auto-fixed without confirmation — this is by design (template:false action-workflow).

---

## AVAILABLE STATE

- `{story_key}`, `{tech_debt_count}`, `{saas_readiness_score}`, `{sprint_status_cache}` — from Steps 1/3d
- `{unified_findings}` — deduped unified Finding[] from Step 3d (source: blind/edge/auditor/saas/merged)
- `{dismissed_count}` — dismissed findings count from Step 3d
- All review findings from `{unified_findings}` (CRITICAL/HIGH/MEDIUM/LOW counts)

---

## STATE VARIABLES (set in this step)

- `{fixed_count}` — Total issues auto-fixed
- `{action_count}` — Total issues deferred/won't-fix/accepted/idd
- `{deferred_issues}` — Issues not yet fixed
- `{analyzed_deferred_issues}` — Deferred issues with root cause analysis
- `{accepted_issues}` — Issues classified as ACCEPTED (with review_date)
- `{idd_issues}` — Issues converted to IDD (with idd_id, idd_type)

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — for severity policy and classification rules.

### 1. Initialize Counters

Set `{fixed_count}` = 0, `{action_count}` = 0

### 2. Present All Findings

**OUTPUT: 🔥 CODE REVIEW FINDINGS**

```
Story: {story_file}
SaaS Readiness Score: {saas_readiness_score}/100 {if < 70: ⚠️ BELOW THRESHOLD}
Git vs Story Discrepancies: {git_discrepancy_count} found
Issues Found: {critical_count} Critical, {high_count} High, {medium_count} Medium, {low_count} Low
Dismissed: {dismissed_count} | Accumulated Tech Debt: {tech_debt_count} pending items

## Source Breakdown
| Source | Count | Note |
|--------|-------|------|
| Blind Hunter (3a) | N | code quality, no-context findings |
| Edge Case Hunter (3b) | N | boundary/concurrency/resource findings |
| Acceptance Auditor (3c) | N | AC vs implementation gaps |
| SaaS Audit (main) | N | 9-dimension safety net |
| Merged (multi-source) | N | deduped cross-layer findings |

## 🚨 CRITICAL ISSUES
- [CRITICAL][{dimension}][{source}] {description}
  📍 {file}:{line}
  🔧 修復方案: {fix_suggestion}
...

## ⚠️ HIGH ISSUES
...
```

> Input source: `{unified_findings}` from Step 3d (already normalized + deduped).
> Do NOT re-read raw finding sets — consume only `{unified_findings}`.

---

### 3. CRITICAL Auto-Fix (Mandatory)

> **CRITICAL:** 🚨 CRITICAL 問題不允許延後或跳過！正在自動修復...

If `{critical_count}` > 0:
1. Auto-fix ALL CRITICAL issues: Read each file → Apply fix_suggestion → Verify
2. Update `{fixed_count}`
3. Set `{critical_count}` = 0 after all fixed
4. Output: ✅ 已修復所有 CRITICAL 問題。

---

### 4. AUTO-FIX: HIGH → MEDIUM → LOW

For EACH severity level in [HIGH, MEDIUM, LOW]:
1. Auto-fix ALL issues (Read file → Apply fix_suggestion → Verify)
2. Unfixable → collect to `{deferred_issues}` with structured context:
   ```
   { severity, dimension, description, file, line, fix_suggestion,
     attempted_action, failure_reason }
   ```
3. Update `{fixed_count}` and `{action_count}`
4. Output: "✅ {severity} 處理完成 — 修復: X, 待路由: Y"

---

### 5. Architecture Bug Detection (Mandatory)

> **CRITICAL:** 🚨 架構 Bug 強制修復檢查

Scan remaining issues for architecture bugs:
- useState 與 Zustand 狀態重複 → MUST FIX (不可延後)
- Hook 多處呼叫導致狀態不同步 → MUST FIX (不可延後)
- 資料不一致/狀態不同步 → MUST FIX (不可延後)

If architecture bugs found:
- Output: 🚨 **架構 Bug 偵測！** — describe each bug with file:line
- Auto-fix all architecture bugs
- Update `{fixed_count}`

---

### 6. Debt Registry: Five-Way Classification with Gates (Framework v1.3)

> **CRITICAL:** 🚫 ABOLISHED: The "retained" / "保留" classification is PERMANENTLY REMOVED.
> **REF:** `saas-standards.md` — Non-Fixed Issue Classification rules.
> **REF:** `pcpt-debt-registry` §2.3, §5, §6, §13 — ACCEPTED, Priority Score, 5-Min Rule, Production Gate.
> **REF:** `pcpt-intentional-decisions` §1.4, §9.4 — IDD Sub-Types, IDD Detection Gate.

**Five classifications:** FIXED | DEFERRED | WON'T FIX | ACCEPTED | IDD (→ `intentional_decisions` 表)

---

**Phase 0: Priority Score Calculation**

> **REF:** `pcpt-debt-registry` §5

For EACH non-FIXED issue in `{deferred_issues}`, calculate:

```
Priority Score = (Severity × BlastRadius × BusinessImpact) ÷ FixCost

Severity:    P0=10, P1=7, P2=4, P3=2, P4=1
BlastRadius: 全站=10, 模組=5, 單檔=2, 單行=1
BusinessImpact: Revenue=10, Core feature=7, Admin=3, Dev experience=1
FixCost:     XS(<1h)=1, S(1-3h)=2, M(1d)=5, L(2-3d)=10, XL(>3d)=20

決策閾值:
  > 50   → Fix Now (本週) — 不可 defer/accept
  25-50  → Fix Next Sprint (DEFERRED, 2-4 週)
  10-25  → Track & Watch (ACCEPTED +90d review)
  < 10   → Accept Long-term (ACCEPTED +365d review)
```

Store `{issue.priority_score}` and `{issue.score_decision}` for each.

**If Score > 50:** Force reclassify as FIXED — auto-fix in this review (cannot be deferred/accepted).

---

**Phase 1: Q1-Q5 Self-Check Gate**

> **REF:** `KB-workflow-003` — WON'T FIX 誤判 4 次事故根因：審查者未逐條自檢。

For EACH non-FIXED item, **MANDATORY** answer Q1-Q5:

| Q# | 問題 | Yes 的意義 |
|----|------|-----------|
| Q1 | 修復是否只改動當前 Story 範圍內的檔案？ | 是 → 應立即修 |
| Q2 | 修復是否 ≤ 10 行程式碼且無副作用？ | 是 → 應立即修 |
| Q3 | 修復是否需要另一個 Story 的 Service/API 先存在？ | 是 → 允許 DEFERRED |
| Q4 | 「等套件整合」是否只是藉口？能否用最小替代方案？ | 能 → 應立即修 |
| Q5 | 問題已在本次 CR 中被解決（如：錯誤報告已取代）？ | 是 → 重分類為 FIXED |

**自動決策規則:**
- Q5 = Yes → 重分類為 **FIXED**（不是 WON'T FIX）
- Q1 = Yes AND Q2 = Yes → 檢查是否已被 5-Min Rule 攔截；若未攔截且仍標非 FIXED → **強制改 FIXED**
- Q3 = Yes → 允許 DEFERRED（但不允許 WON'T FIX）
- Q1-Q5 全部回答完畢後，答案記錄在 `{issue.q1_q5_answers}` 供 Step 6 CR Report 使用

**Output:** Q1-Q5 答案表格（每個非 FIXED 項目一行 × 5 欄）

---

**Phase 1.5: IDD Detection Gate (Q1-Q4)**

> **REF:** `pcpt-intentional-decisions` §9.4 — code-review Step 3.5 IDD Detection Gate
> **REF:** `.claude/rules/skill-idd-sync-gate.md` §code-review phase

For EACH remaining non-FIXED, non-IDD item (at this phase: items pending final classification):

| Q# | 問題 | Yes → IDD 類型 |
|----|------|---------------|
| Q1 | 這是因為 Business 決策而不修嗎？ | → IDD-COM |
| Q2 | 這是因為 Strategy 方向而不修嗎？ | → IDD-STR |
| Q3 | 這是因為法規/合規而不修嗎？ | → IDD-REG |
| Q4 | 這是因為 User feedback 而不修嗎？ | → IDD-USR |

**If ANY Q1-Q4 = Yes:**
- 不可標 WON'T FIX 或 DEFERRED — **MUST 轉為 IDD**
- Priority: REG > COM > STR > USR（若多個 Yes，選最高級別）
- **執行完整 8 步 IDD 建立流程:**
  1. 建立 `ADR-IDD-{TYPE}-{NNN}.md` (docs/technical-decisions/)
  2. Code 加 `[Intentional: IDD-{TYPE}-{NNN}]` 標註
  3. 呼叫 `add_intentional_decision` MCP tool 寫入 DB
  4. 更新 `related_skills` 的 SKILL.md 加 `[Intentional:]` 章節
  5. 更新 `pcpt-system-platform` 對應 module 文件
  6. 寫入 memory file (若 criticality='critical')
  7. 更新 MEMORY.md (若 criticality='critical')
  8. 從 `tech_debt_items` 移除（若已誤寫入）
- Store `{issue.idd_id}` and `{issue.idd_type}`

**If Q1-Q4 全部 No:** 繼續正常 DEFERRED / WON'T FIX / ACCEPTED 分類。

---

**Phase 1.7: ACCEPTED Classification**

> **REF:** `pcpt-debt-registry` §2.3

For EACH remaining non-FIXED, non-IDD item:

**ACCEPTED 條件 (Priority Score 驅動):**
- Score 10-25 → ACCEPTED (+90 天 review): `review_date` = current_date + 90d
- Score < 10 → ACCEPTED (+365 天 review): `review_date` = current_date + 365d
- **必填:** `review_date`, `accepted_reason`

**ACCEPTED 排除規則 (不可 ACCEPTED):**
- TestCoverage 分類的 debt → 必須 FIXED 或 DEFERRED（不可 ACCEPTED）
- Score > 50 → 已在 Phase 0 強制 Fix Now
- Score 25-50 → DEFERRED（Fix Next Sprint）

---

**Phase 2: Root Cause Analysis + Routing**

For EACH remaining DEFERRED / WON'T FIX item:

- **A. 根因分析**: `root_cause_category` + detail (2-3 sentence causal chain)
  - Categories: `CROSS_MODULE_DEPENDENCY | INFRASTRUCTURE_CHANGE | ARCHITECTURE_REDESIGN | SHARED_COMPONENT | UPSTREAM_DEPENDENCY | TESTING_GAP | DATA_MIGRATION`
- **B. 路由決策** (per MEMORY.md: CR deferred items must stay in original Epic):
  1. Check `{sprint_status_cache}` for same-Epic backlog/ready-for-dev Story (do NOT read Story full text)
  2. If no match → create new Story key: `{epic}-{next_id}-{short_desc}`
  - Set `{issue.target_story_id}`, `{issue.routing_reason}`

Store in `{analyzed_deferred_issues}`.

---

**Phase 2.3: Write Sidecar File** (named by SOURCE story)

Write sidecar at `{implementation_artifacts}/tech-debt/{story_key}.debt.md`:

```yaml
---
source_story: "{story_key}"
source_review_date: "{system_date}"
severity: "{max_severity}"
dimension: "{primary_dimension}"
items:
  - id: "{registry_id}"
    problem_location: "{file}:{line}"
    problem_description: |
      {description}
    fix_guidance: |
      {fix_suggestion}
    affected_acceptance_criteria: |
      {related_ac}
    related_modules:
      - "{affected_file_1}"
    root_cause_category: "{category}"
    root_cause_detail: |
      {detail}
    priority_score: {score}
    q1_q5_answers: "{q1,q2,q3,q4,q5}"
routing_reason: "{routing_reason}"
---
```

**Case B (needs new Story):** Create Story stub at `{implementation_artifacts}/stories/epic-{epic}/{target_story_id}.md`

---

**Phase 2.5: Debt Registry PUSH**

> **CRITICAL:** 📋 REGISTRY PUSH: Write ALL non-FIXED issues to DB via `upsert-debt.js`
> Supports 4 classifications: DEFERRED / WON'T FIX / ACCEPTED / IDD (→ separate table)

For EACH non-FIXED, non-IDD issue:
```bash
node .context-db/scripts/upsert-debt.js --inline '{"story_id":"{story_key}","title":"...","severity":"...","status":"{classification}","target_story":"{target_story_id}","review_date":"{review_date}","accepted_reason":"...","priority_score":{score}}'
```

For EACH IDD issue: already handled in Phase 1.5 step 3 (`add_intentional_decision`).

---

**Phase 3: Update Story Tech Debt Reference**

Add "## Tech Debt Reference" to current story:
- Summary table (延後日期 | 問題數 | 嚴重度分佈 | Score 範圍)
- Sidecar file path list
- IDD 建立清單 (if any)

---

**Phase 4: Update sprint-status.yaml**

If `{sprint_status}` file exists:
- Use `{sprint_status_cache}` — ensure `tech_debt_backlog:` section exists
- For EACH `target_story_id` add: `status: pending, source_story: {story_key}, sidecar: tech-debt/{target_story_id}.debt.md`
- Save preserving ALL comments and structure
- Output: 📋 側車文件已寫入 tech-debt/ (N 個)

---

**Push Checklist (Mandatory):**
- ☐ All non-FIXED issues classified as DEFERRED / WON'T FIX / ACCEPTED / IDD (zero "retained")
- ☐ Q1-Q5 Self-Check completed for ALL non-FIXED items
- ☐ Q1-Q4 IDD Detection Gate completed for ALL DEFERRED/WON'T FIX/ACCEPTED items
- ☐ IDD items have ADR + DB entry + code annotation (8-step complete)
- ☐ ACCEPTED items have `review_date` + `accepted_reason`
- ☐ Priority Score calculated for ALL non-FIXED items
- ☐ `upsert-debt.js` called for ALL DEFERRED/WON'T FIX/ACCEPTED items
- ☐ DEFERRED items have sidecar .debt.md + target_story
- ☐ WON'T FIX items have written justification + Q1-Q5 evidence
- ☐ TestCoverage debt NOT classified as ACCEPTED
- ☐ Source Story Tech Debt Reference section updated
- ☐ sprint-status.yaml tech_debt_backlog synced

If ANY item fails → HALT and fix before continuing.

---

**Output:**
```
✅ 技術債分類完成 (Framework v1.3 Five-Way)
- FIXED: {fixed_count} | DEFERRED: N | WON'T FIX: N | ACCEPTED: N | IDD: N
- Priority Score 範圍: {min_score} - {max_score}
- 5-Min Rule 攔截: N (from Step 3d)
- IDD 建立: N (ADR + DB + annotation)
- 側車文件: {unique_target_count} 個
```

---

## SUCCESS METRICS

- ALL CRITICAL issues fixed (critical_count = 0)
- ALL HIGH/MEDIUM/LOW auto-fixed or routed
- Architecture bugs detected and fixed
- Priority Score calculated for ALL non-FIXED items
- Q1-Q5 Self-Check completed for ALL non-FIXED items
- Q1-Q4 IDD Detection Gate completed for ALL DEFERRED/WON'T FIX/ACCEPTED items
- IDD items have complete 8-step creation (ADR + DB + code annotation)
- ACCEPTED items have review_date + accepted_reason
- Sidecar file written at `tech-debt/{story_key}.debt.md`
- upsert-debt.js called for ALL DEFERRED/WON'T FIX/ACCEPTED items
- sprint-status.yaml tech_debt_backlog synced
- Push Checklist all passed (12 items)

## FAILURE MODES

- Using "retained" classification (ABOLISHED)
- Skipping Q1-Q5 Self-Check for non-FIXED items
- Skipping Q1-Q4 IDD Detection Gate
- Classifying IDD items as WON'T FIX (must go to intentional_decisions table)
- ACCEPTED without review_date or accepted_reason
- TestCoverage debt classified as ACCEPTED
- Not calculating Priority Score
- Skipping Architecture Bug check
- Missing sidecar file creation

---

**NEXT:** Load `step-04b-skill-staleness.md`
