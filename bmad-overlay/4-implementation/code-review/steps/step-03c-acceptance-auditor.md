---
name: 'step-03c-acceptance-auditor'
description: 'Acceptance Auditor: AC vs implementation comparison, spec compliance, compliance and test coverage'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-03c-acceptance-auditor.md'
nextStepFile: null
---

# Step 3c: Acceptance Auditor

**Goal:** AC vs 實作逐條對照，Spec 合規驗證，確認每條驗收標準的實作完整性。

---

## CONDITIONAL ACTIVATION (BR-03)

- `{review_mode}` = `"full"` → **啟用**，繼續執行
- `{review_mode}` = `"no-spec"` → **跳過**，return `{auditor_findings}` = [], log "Acceptance Auditor skipped (no-spec mode)"

---

## INPUT

```
{diff_output}         ← git diff
{spec_content}        ← SDD Spec (BR-XXX Business Rules + Boundary Conditions + API Spec)
{acceptance_criteria} ← Story ACs (Given/When/Then format with [Verifies: BR-XXX])
{context_docs}        ← Architecture + related skill docs
```

---

## EXECUTION SEQUENCE

### 1. Parse Inputs

Extract from `{spec_content}`:
- All Business Rules (BR-XXX) with testable conditions
- Boundary Conditions (BC-XXX)
- API/Interface Spec (§4)
- Error Handling spec (§5/§6)

Extract from `{acceptance_criteria}`:
- Each AC with Given/When/Then
- [Verifies: BR-XXX] mappings

### 2. AC-to-Code Traceability (Per AC)

For EACH Acceptance Criterion:
1. Read the AC: Given {precondition} → When {action} → Then {result}
2. **MANDATORY:** Read ACTUAL source code implementing this AC via Read tool
3. Trace implementation path: Controller → Service → Repository (or equivalent)
4. Determine status:
   - **IMPLEMENTED**: code exists + file:line proof
   - **PARTIAL**: part of AC implemented, specific gap identified
   - **MISSING**: no implementation found

Findings:
- PARTIAL → **HIGH** severity with specific missing code evidence
- MISSING → **HIGH** severity with expected implementation location

### 3. Business Rule Coverage (Per BR-XXX)

For EACH BR in `{spec_content}`:
1. Locate corresponding code via Read/Grep
2. Verify rule is enforced (not just happy-path)
3. Check: Is the BR's condition checked at the right layer?
4. MISSING → HIGH finding

### 4. Spec Alignment (VSDD Check)

Against `{spec_content}` API/Interface Spec:
- Route/URL matches spec §4
- Request/Response format matches spec §4
- Error codes match spec §5/§6
- New behavior not in spec → MEDIUM (spec drift / over-engineering)

### 5. Compliance Dimension (Primary)

> **GDPR / Data Retention / Audit Logs**

- Personal data fields: verify GDPR-compliant storage/retrieval
- Data deletion flows: verify cascade or anonymization
- Sensitive operations: verify audit log entries written
- Compliance requirements in spec §4+ implemented

### 6. Test Coverage (Primary)

For EACH new/modified test file (via Read tool):
- Verify tests map to ACs (BR ID in test name recommended)
- Verify assertions are real (not `Assert.True(true)`, not empty body)
- Verify boundary conditions from spec BC-XXX have test coverage
- Missing test for AC/BR → MEDIUM finding

### 7. Format Output

Return findings as Markdown list:

```markdown
- **[SEVERITY][DIMENSION]** {title}
  - AC/Constraint: {which AC or BR this relates to}
  - Evidence: {what was found in code or what is missing}
  - Location: {file}:{line} or "not found"
  - Severity: CRITICAL | HIGH | MEDIUM | LOW
```

---

## OUTPUT FORMAT

Produce `{auditor_findings}` as Markdown list.
Each finding MUST include: title, AC/constraint reference, evidence, location, severity.
If no issues found: return `{auditor_findings}` = [].

---

## SUCCESS METRICS

- Every AC traced to code with file:line evidence
- Every BR-XXX verified
- Spec drift findings generated for over-engineering
- Compliance (GDPR) and TestCoverage checks done
- Markdown list format correct

## FAILURE MODES

- Accepting AC as "implemented" without reading code
- Skipping BR coverage check
- Missing compliance dimension
- Invalid test assertions not flagged
- Mixing in non-spec context (architecture preferences, style)

---

**RETURNS:** `{auditor_findings}` (Markdown list) to Step 3 orchestrator
