---
name: 'step-06-author-tests'
description: 'Author comprehensive tests: unit, integration, and E2E'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-06-author-tests.md'
nextStepFile: '{workflow_path}/steps/step-07-run-validations.md'
---

# Step 6: Author Comprehensive Tests

**Goal:** Create complete test coverage for all functionality introduced or changed by this task.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}` — from Step 1
- `{story_required_skills}` — from Step 2 (for testing patterns)

---

## EXECUTION SEQUENCE

### 1. Unit Tests

Create unit tests for business logic and core functionality introduced/changed by the task.

**Naming convention:** `{BR_ID}_{Scenario}_{ExpectedResult}`
- No BR: `BUG{ID}_{Scenario}_{Expected}`

### 2. Integration Tests

Add integration tests for component interactions specified in story requirements.

**Test Category Mapping:**
| Category | Scenario |
|----------|---------|
| CMD tests | Boundary / input validation |
| SEC tests | Auth / authorization |
| QRY tests | Query / read operations |
| EVT tests | Event / notification |

### 3. End-to-End Tests

Include end-to-end tests for critical user flows when story requirements demand them.

Reference: `/pcpt-e2e-playwright` for E2E patterns.

### 4. Edge Cases

Cover edge cases and error handling scenarios identified in story Dev Notes.

---

## SUCCESS METRICS

- Unit tests written with proper naming convention
- Integration tests for component interactions
- E2E tests for critical flows (if required by story)
- Edge cases and error scenarios covered
- All new tests pass

## FAILURE MODES

- Writing tests without real assertions (e.g., `Assert.True(true)`)
- Skipping edge case coverage
- Not following test naming convention
- Skipping E2E when story requires critical flow validation

---

**NEXT:** Load `step-07-run-validations.md`
