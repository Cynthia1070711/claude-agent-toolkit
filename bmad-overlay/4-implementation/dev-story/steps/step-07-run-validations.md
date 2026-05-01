---
name: 'step-07-run-validations'
description: 'Run full test suite, linting, and validate all acceptance criteria'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-07-run-validations.md'
nextStepFile: '{workflow_path}/steps/step-08-validate-complete.md'
---

# Step 7: Run Validations

**Goal:** Run all tests and linting to ensure no regressions and all ACs are satisfied.

---

## EXECUTION SEQUENCE

### 1. Determine Test Framework

Infer test framework from project structure (look for `.csproj`, `package.json`, test directories).

### 2. Run All Existing Tests

Run all existing tests to ensure no regressions.

**If regression tests fail:** STOP and fix before continuing — identify breaking changes immediately.

### 3. Run New Tests

Run the new tests to verify implementation correctness.

**If new tests fail:** STOP and fix before continuing — ensure implementation correctness.

### 4. Run Linting and Code Quality Checks

Run linting and code quality checks if configured in project.

### 5. Validate Acceptance Criteria

Validate implementation meets ALL story acceptance criteria; enforce quantitative thresholds explicitly.

---

## SUCCESS METRICS

- All existing tests pass (zero regressions)
- All new tests pass
- Linting passes (if configured)
- All story ACs validated

## FAILURE MODES

- Running only new tests and not the full suite
- Skipping regression check
- Ignoring linting failures
- Moving on despite test failures

---

**NEXT:** Load `step-08-validate-complete.md`
