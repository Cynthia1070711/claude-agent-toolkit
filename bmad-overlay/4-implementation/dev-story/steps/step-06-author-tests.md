---
name: 'step-06-author-tests'
description: 'Author comprehensive tests: unit, integration, and E2E'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-06-author-tests.md'
nextStepFile: '{workflow_path}/steps/step-07-run-validations.md'
---

# Step 6: Test Coverage Gate & Cross-Task Fill

**Goal:** 驗證 step-05 per-task TDD 微迴圈 + §0.4 story-level ATDD 已達覆蓋率標準，並補上微迴圈/ATDD 跨不到的 cross-task 整合、edge、E2E。

> **職責定位（W2 收斂）**: step-05 §4-5 已 per-task RED→GREEN 寫 unit/integration 微迴圈測試；§0.4 已寫 story-level ATDD 驗收測試。step-06 **不重寫**這些（避免與 step-05 微迴圈職責重疊），而是：① 驗證覆蓋率 ≥80%；② 補 cross-task 整合場景 + edge case + E2E（per-task 微迴圈視角看不到的跨任務行為）。若 step-05 + §0.4 已充分覆蓋 → step-06 僅做覆蓋率驗證 + gap 補漏，不產生重複測試。

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}` — from Step 1
- `{story_required_skills}` — from Step 2 (for testing patterns)

---

## EXECUTION SEQUENCE

### 1. Unit Test Coverage (驗證 + 補漏，非重寫)

驗證 step-05 per-task 微迴圈已覆蓋 business logic / core functionality 的 unit tests。**僅補** step-05 微迴圈遺漏的 unit edge case（不重寫已存在的測試）。

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

Reference: `/phycool-e2e-playwright` for E2E patterns.

### 4. Edge Cases

Cover edge cases and error handling scenarios identified in story Dev Notes.

---

## SUCCESS METRICS

- Coverage ≥ 80% verified (step-05 微迴圈 + §0.4 ATDD + step-06 補漏 合計)
- Cross-task integration / edge / E2E gaps filled (非重寫 step-05 既有測試)
- Test naming convention followed for new tests
- All tests pass (step-05 + §0.4 + step-06)

## FAILURE MODES

- 重寫 step-05 per-task 微迴圈已寫的 unit/integration tests（職責重疊，浪費 token）
- Writing tests without real assertions (e.g., `Assert.True(true)`)
- Skipping cross-task edge case coverage
- Not verifying ≥80% coverage gate
- Skipping E2E when story requires critical flow validation

---

**NEXT:** Load `step-07-run-validations.md`
