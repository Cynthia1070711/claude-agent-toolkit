# Testing

## Requirements
- Minimum 80% coverage: Unit + Integration + E2E (Playwright)
- Fix implementation, not tests (unless test itself is wrong)

## TDD Flow (applies to ALL code changes, including direct bug fixes)

1. **Query first**: Before fixing, run `search_tech` for similar issues (category: bugfix/debug)
2. **ATDD First**: Write Acceptance Test from AC / bug description (verify expected post-fix behavior)
3. **TDD RED**: Write failing Unit Test. Naming: `{BR_ID}_{Scenario}_{ExpectedResult}` (no BR: `BUG{ID}_{Scenario}_{Expected}`)
4. **TDD GREEN**: Write minimal code to pass tests only
5. **TDD IMPROVE**: Refactor without changing behavior (all tests still pass)
6. **3-round debug limit**: Test failure fixes ≤ 3 rounds. Exceeding → trigger context compression or re-analyze

## Test Category Mapping
- Boundary / input validation → CMD tests
- Auth / authorization rules → SEC tests
- Query / read operations → QRY tests
- Event / notification triggers → EVT tests

## Post Bug-Fix
- Record fix via `add_tech(category: "bugfix")` to memory DB
- Include Bug ID in test name for future traceability
