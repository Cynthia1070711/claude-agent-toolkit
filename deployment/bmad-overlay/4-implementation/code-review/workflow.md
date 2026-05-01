---
name: code-review
description: "SaaS Production-Grade Code Review (Full Auto-Fix v3.0): ALL severity levels auto-fix, Production Gates, SaaS Readiness Score"
author: "BMad"
config_source: "{project-root}/_bmad/bmm/config.yaml"
installed_path: "{project-root}/_bmad/bmm/workflows/4-implementation/code-review"
---

# Code Review Workflow

**Goal:** Adversarial SaaS production-grade code review with full auto-fix and tech debt tracking.

**Your Role:** You are an adversarial code reviewer. Find what's wrong or missing. Challenge everything. Never write lazy "looks good" reviews.

---

## WORKFLOW ARCHITECTURE

This uses **step-file architecture** for focused execution:

- Each step loads fresh to combat "lost in the middle"
- SaaS standards extracted to `saas-standards.md` (referenced, not duplicated)
- State persists via variables across all steps

---

## INITIALIZATION

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `user_name`, `communication_language`, `user_skill_level`, `document_output_language`
- `output_folder`, `implementation_artifacts`
- `date` as system-generated current datetime (Taiwan UTC+8)

### Paths

- `installed_path` = `{project-root}/_bmad/bmm/workflows/4-implementation/code-review`
- `sprint_status` = `{implementation_artifacts}/sprint-status.yaml`
- `saas_standards` = `{installed_path}/saas-standards.md`

### Critical Rules

> **CRITICAL:** 🔥 YOU ARE AN ADVERSARIAL CODE REVIEWER — Find what's wrong or missing!
>
> **CRITICAL:** Your purpose: Validate story file claims against actual implementation.
>
> **CRITICAL:** Challenge everything: Are tasks marked [x] actually done? Are ACs really implemented?
>
> **CRITICAL:** Find 3-10 specific issues in every review minimum — no lazy "looks good" reviews.
>
> **CRITICAL:** Read EVERY file in the File List — verify implementation against story requirements.
>
> **CRITICAL:** Tasks marked complete but not done = CRITICAL finding.
>
> **CRITICAL:** Acceptance Criteria not implemented = HIGH severity finding.
>
> **CRITICAL:** 🚫 This is `template: false` (action-workflow). Steps 1→5 execute CONTINUOUSLY without user confirmation. Do NOT insert [c]/[y]/[a] prompts between steps. Step 4 auto-fix is MANDATORY — never ask permission to fix.

### SaaS Standards Reference

**REF:** `saas-standards.md` — Load at start of review for severity policy, review dimensions, and production gates.

### STATE VARIABLES (persist throughout all steps)

| Variable | Set In | Purpose |
|----------|--------|---------|
| `{precheck_phase}` | Step 0 (Pre-check) | Hardcoded `code-review` (workflow phase identity) |
| `{precheck_top_rules}` | Step 0 (Pre-check) | Top-3 hot violation rule paths from `query-violations.js --phase code-review --since-days 30` |
| `{precheck_violation_count}` | Step 0 (Pre-check) | `stats.total_30d_rolling` int — drives 0-violation short-circuit |
| `{story_key}` | Step 1 | Story 識別碼 |
| `{story_required_skills}` | Step 1 | 已載入的 Skills 列表 |
| `{skill_forbidden_rules}` | Step 1 | Skill 禁止規則 |
| `{tech_debt_count}` | Step 1 | 累積技術債數量 |
| `{registry_cache}` | Step 1 | Registry.yaml 快取 |
| `{sprint_status_cache}` | Step 1 | Sprint status 快取 |
| `{diff_output}` | Step 1 | 統一 diff 文字（git diff 輸出） |
| `{review_trail}` | Step 1b | Review Trail 結構化停靠點（2-5 concerns × 1-4 path:line stops） |
| `{review_mode}` | Step 2 | "full-trail"（trail 存在）\| "full"（有 Spec）\| "no-spec"（無 Spec） |
| `{failed_layers}` | Step 3 | 失敗的層名稱列表（string[]） |
| `{blind_findings}` | Step 3a | Blind Hunter 結果（Finding[]） |
| `{edge_findings}` | Step 3b | Edge Case Hunter 結果（Finding[]） |
| `{auditor_findings}` | Step 3c | Acceptance Auditor 結果（Finding[]） |
| `{saas_findings}` | Step 3 | SaaS 9 維審計結果（Finding[]） |
| `{unified_findings}` | Step 3d | 去重後統一格式 Finding[] |
| `{dismissed_count}` | Step 3d | 被 dismiss 的 finding 數量 |
| `{saas_readiness_score}` | Step 3d | SaaS 準備分數 (0-100)，從去重後清單計算 |
| `{deferred_issues}` | Step 4 | 延後修復項目 |
| `{analyzed_deferred_issues}` | Step 4 | 含根因分析的延後項目 |
| `{new_status}` | Step 5 | 最終 Story 狀態 |

---

## EXECUTION

Load `saas-standards.md`, then execute `steps/step-00-violation-precheck.md` (Workflow Entry Gate — force Read top-3 hot code-review violation rules from last 30d) to begin the workflow.

**Step chain (first four):** `step-00-violation-precheck.md` (Workflow Entry Gate) → `step-01-load-discover.md` (story + diff + skills load) → `step-01b-generate-trail.md` (review trail) → `step-02-review-plan.md`.

After step-01 completes, execute `steps/step-01b-generate-trail.md` before proceeding to step-02.
