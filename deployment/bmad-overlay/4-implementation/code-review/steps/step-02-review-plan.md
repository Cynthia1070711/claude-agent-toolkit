---
name: 'step-02-review-plan'
description: 'Build review attack plan with triple-layer dispatch + SaaS 9-dimension coverage'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-02-review-plan.md'
nextStepFile: '{workflow_path}/steps/step-03-triple-layer-dispatch.md'
---

# Step 2: Build Review Plan

**Goal:** Extract all ACs, tasks, and files; create comprehensive triple-layer + 9-dimension SaaS review plan.

---

## AVAILABLE STATE

- `{story_key}`, `{story_required_skills}` — from Step 1
- `{diff_output}` — unified diff text (from Step 1)
- `{review_trail}` — Review Trail from Step 1b (empty string if unavailable)

---

## STATE VARIABLES (set in this step)

- `{review_mode}` — "full-trail" | "full" | "no-spec"

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — for review dimensions.

### 1. Extract Story Content

Extract ALL from story file:
- Acceptance Criteria (full list with Given/When/Then + [Verifies: BR-XXX])
- Tasks/Subtasks with completion status (`[x]` or `[ ]`)
- File List (Dev Agent Record → File List section)
- SDD Spec path (if M/L/XL complexity)

### 2. Determine Review Mode

Set `{review_mode}` using the following priority order:

1. **`"full-trail"`** — `{review_trail}` from Step 1b is **non-empty** (trail exists, regardless of spec presence)
2. **`"full"`** — SDD Spec exists + story complexity is M/L/XL (and `{review_trail}` is empty)
3. **`"no-spec"`** — no SDD Spec or S-complexity story (and `{review_trail}` is empty)

> **Note:** `full-trail` takes precedence over `full` and `no-spec`. When a trail exists, all downstream steps treat the review as `full-trail` mode — the trail serves as the Suggested Review Order.

### 3. Triple-Layer Dispatch Planning

Map review dimensions to each layer:

| Layer | Input | Primary Dimensions |
|-------|-------|--------------------|
| **Blind Hunter (3a)** | diff only | Security, Observability, ErrorHandling, TestCoverage |
| **Edge Case Hunter (3b)** | diff + project | Scalability, DataConsistency, MigrationIntegrity, ErrorHandling, Skill FORBIDDEN |
| **Acceptance Auditor (3c)** | diff + spec + AC | Compliance, TestCoverage (only in "full" mode) |
| **SaaS Audit (3 main)** | all files | All 9 dimensions (safety net) |

Note planned layer execution order:
1. If sub-agent capable: launch 3a, 3b, 3c in parallel + SaaS audit in main thread
2. If sequential fallback: 3a → 3b → 3c → SaaS audit

### 4. Create Comprehensive Review Plan

1. **AC Validation**: Each AC traced to code (Acceptance Auditor + SaaS audit)
2. **Task Audit**: Each `[x]` task verified against actual code (SaaS audit)
3. **SaaS Security**: OWASP Top 10, Auth, Data Protection (Blind Hunter primary)
4. **SaaS Scalability**: N+1, Pagination, Async, Caching (Edge Case Hunter primary)
5. **SaaS Observability**: Logging, Metrics, Tracing (Blind Hunter secondary)
6. **SaaS Data Consistency**: Transactions, Concurrency, Validation (Edge Case Hunter primary)
7. **SaaS Migration Integrity**: Migration files, ModelSnapshot (Edge Case Hunter primary)
8. **SaaS Error Handling**: Exceptions, Retry, Graceful Degradation (Edge Case Hunter primary)
9. **SaaS Compliance**: GDPR, Data Retention, Audit Logs (Acceptance Auditor primary)
10. **Test Quality**: Real tests vs placeholder, coverage ≥ 70% (both Blind + Auditor)
11. **Skill FORBIDDEN Rules**: From `{skill_forbidden_rules}` (Edge Case Hunter primary)

> Note: Sidecar routing doesn't need pre-loading Story map — deferred items written directly to .debt.md.

---

## SUCCESS METRICS

- All ACs extracted and enumerated
- All tasks/subtasks with completion status
- File List ready for code reading
- `{review_mode}` set
- Triple-layer dispatch plan documented with dimension assignments
- 9-dimension SaaS review plan created

## FAILURE MODES

- Missing ACs or tasks from extraction
- Incomplete File List
- `{review_mode}` not set before Step 3

---

**NEXT:** Load `step-03-triple-layer-dispatch.md`
