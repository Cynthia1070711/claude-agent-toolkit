---
name: 'step-03-triple-layer-dispatch'
description: 'Triple-layer parallel review dispatch: Blind Hunter + Edge Case Hunter + Acceptance Auditor + SaaS 9-dim audit'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03-triple-layer-dispatch.md'
nextStepFile: '{workflow_path}/steps/step-03d-triage-merge.md'
---

# Step 3: Triple-Layer Review Dispatch

**Goal:** 以三層平行架構 + SaaS 9 維審計執行深度程式碼審查，收集並轉交 Triage。

---

## AVAILABLE STATE

- `{story_key}`, `{skill_forbidden_rules}`, `{story_required_skills}` — from Step 1
- `{tech_debt_count}`, `{critical_debt_count}` — from Step 1
- `{diff_output}` — unified diff text (set in Step 1)
- `{review_mode}` — "full" | "no-spec" (set in Step 2)

---

## STATE VARIABLES (set in this step)

- `{failed_layers}` — 失敗層名稱列表（string[]）
- `{blind_findings}` — Blind Hunter 結果（Finding[]）
- `{edge_findings}` — Edge Case Hunter 結果（Finding[]）
- `{auditor_findings}` — Acceptance Auditor 結果（Finding[]，no-spec 時為空）
- `{saas_findings}` — SaaS 9 維審計結果（Finding[]）

---

## EXECUTION SEQUENCE

**REF:** `saas-standards.md` — for SaaS dimension checklist.

> **CRITICAL:** BC-03 Guard — If `{diff_output}` is empty → output "Nothing to review" and HALT.
> **CRITICAL:** BC-04 Guard — If diff > 3000 lines → warn user, pipeline continues without waiting.

### 1. Initialize

Set `{failed_layers}` = [].

### 2. Launch Three Layers (Parallel if possible, sequential fallback)

#### Layer A — Blind Hunter (Sub-agent or inline)

> **BR-01:** ONLY receives `{diff_output}`. FORBIDDEN: spec, AC, story context, project docs.

**Prompt to sub-agent / inline execution:**
Load `{workflow_path}/steps/step-03a-blind-hunter.md` with input: `{diff_output}`.

On success: store result as `{blind_findings}`.
On failure/timeout/empty: append "blind" to `{failed_layers}`, set `{blind_findings}` = [].

#### Layer B — Edge Case Hunter (Sub-agent or inline)

> **BR-02:** Receives `{diff_output}` + project Read permission. FORBIDDEN: spec/AC.

**Prompt to sub-agent / inline execution:**
Load `{workflow_path}/steps/step-03b-edge-case-hunter.md` with input: `{diff_output}`.

On success: store result as `{edge_findings}`.
On failure/timeout/empty: append "edge" to `{failed_layers}`, set `{edge_findings}` = [].

#### Layer C — Acceptance Auditor (Sub-agent or inline)

> **BR-03:** Only when `{review_mode}` = "full". Skip when "no-spec".

**If `{review_mode}` = "full":**
Load `{workflow_path}/steps/step-03c-acceptance-auditor.md` with:
- `{diff_output}`, `{spec_content}`, `{acceptance_criteria}`, `{context_docs}`

On success: store result as `{auditor_findings}`.
On failure/timeout: append "auditor" to `{failed_layers}`, set `{auditor_findings}` = [].

**If `{review_mode}` = "no-spec":**
Set `{auditor_findings}` = []. Log: "Acceptance Auditor skipped (no-spec mode)".

### 3. SaaS 9-Dimension Audit (Main Thread — Mandatory)

> **BR-06:** SaaS audit runs in main thread, independent of sub-agents.
> **CRITICAL:** Read EVERY file in story File List via Read tool.

**REF:** `saas-standards.md` for full per-dimension checklist.

For EACH file in story File List + git changes:
1. **READ** complete file via Read tool
2. **DIFF** via `git diff` for exact changes
3. **ANALYZE** line-by-line against SaaS dimensions

Run all 10 dimensions (cite file:line for each finding):
- 🔒 **Security** (CRITICAL): SQL injection, XSS, CSRF, Auth, secrets, headers, dependency CVE
- 📈 **Scalability** (HIGH): N+1, pagination, async misuse (.Result/.Wait), IDisposable leaks
- 📊 **Observability** (MEDIUM): ILogger in catch blocks, correlation IDs, health endpoints
- 🔄 **DataConsistency** (HIGH): Transaction scope, concurrency tokens, idempotency
- 🗄️ **MigrationIntegrity** (HIGH): Migration file integrity, ModelSnapshot, pending-model-changes
- ⚠️ **ErrorHandling** (HIGH): try/catch coverage, no stack trace leakage, Polly/retry
- ✅ **Compliance** (CRITICAL): GDPR, data retention, audit logs
- 🧪 **TestCoverage**: Real assertions (not `Assert.True(true)`), coverage ≥ 70%
- 🚫 **Skill FORBIDDEN**: Check `{skill_forbidden_rules}` — violations → HIGH
- 🖱️ **UI Behavioral** (HIGH,2026-04-14 新增): **觸發條件**:diff 含 `.tsx` / `.css` / DOM 結構 / layout / gating / tier label 類變更。**MANDATORY 動作**:(1) `curl https://localhost:7135` + `curl http://localhost:5173` 確認 server 在跑 → (2) `list_pages` 確認 Chrome 可用 → (3) `evaluate_script` 讀 DOM class / computed style / aria attrs 對照每個 UI 類 AC → (4) `click` 驗關鍵 interaction state transitions → (5) `take_screenshot` 存檔至 `docs/implementation-artifacts/reviews/epic-{X}/{story-id}-{plan}-verification.png` → (6) **跨 plan 至少 2 個**(涉及 plan gating 必須 Free + 1 個付費)。**若 server 未跑** → finding:HIGH「CR UI 驗證受阻,建立 verification Story 或啟動 server 重跑」,不可 ⬜ 帶過標 done。**若違反** → step-06 §7.5 Gate 8 HARD BLOCK。
>
> **Incident (2026-04-14):** `eft-editor-batch-image-panel-free-open` CR 依 Vitest 22/22 通過標 done,留 ⬜ tasks「post-CR QA」;使用者質疑後補做 Chrome MCP 驗 A1 Free + A4 Professional,DOM computed style + 跨 plan 一致性實測才完整驗證 AC-1/2/4/6/7。Memory id=3288。

Git vs Story discrepancies:
- Changed files not in File List → MEDIUM
- Story lists files with no git changes → HIGH
- Uncommitted changes undocumented → MEDIUM

AC Validation (per AC):
1. Read AC requirement
2. Read implementing code
3. Trace: Controller → Service → Repository
4. IMPLEMENTED (file:line) / PARTIAL / MISSING → HIGH if PARTIAL/MISSING

Task Completion Audit (per [x] task):
1. Read implementing code
2. If marked `[x]` but NOT done → **CRITICAL** finding

Collect all findings as `{saas_findings}` (source = "saas").

### 4. Fault Guard

**If `{failed_layers}` contains all of ["blind", "edge", "auditor"]:**
Output: ⚠️ **警告：三層全部失敗，review 可能不完整。僅 SaaS 審計結果有效。**
Do NOT declare clean review.

### 5. Minimum Issue Check

**If total findings across all sources < 3:**
> **CRITICAL:** NOT LOOKING HARD ENOUGH — Re-examine harder!
Re-check: null handling, edge cases, architecture violations, integration issues.

---

## SUCCESS METRICS

- `{blind_findings}`, `{edge_findings}`, `{auditor_findings}`, `{saas_findings}` all set
- `{failed_layers}` set (empty if all succeeded)
- All story files read via Read tool (SaaS audit)
- Every AC validated with file:line evidence
- Every `[x]` task verified
- ≥ 3 total findings

## FAILURE MODES

- Blind Hunter receiving spec/AC context (violates BR-01)
- Skipping SaaS audit or any of 9 dimensions
- Declaring "clean review" with failed layers
- Not reading files via Read tool
- Missing file:line evidence

---

**NEXT:** Load `step-03d-triage-merge.md`
