---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/tests/**"
  - "**/Tests/**"
  - "src/**"
  - "_bmad/bmm/workflows/**/testarch-*/**"
---

# Testing

## Requirements
- Minimum 80% coverage: Unit + Integration + E2E (Playwright)
- Fix implementation, not tests (unless test itself is wrong)

## TDD Flow (all code changes including bug fixes)

1. **Query first**: Run `search_tech` for similar issues (category: bugfix/debug)
2. **ATDD First**: Write Acceptance Test from AC / bug description
3. **TDD RED**: Write failing Unit Test. Naming: `{BR_ID}_{Scenario}_{ExpectedResult}` (no BR: `BUG{ID}_{Scenario}_{Expected}`)
4. **TDD GREEN**: Minimal code to pass tests only
5. **TDD IMPROVE**: Refactor without changing behavior
6. **3-round debug limit**: ≤ 3 rounds. Exceeding → context compression or re-analyze

## Test Category Mapping
- Boundary / input validation → CMD tests
- Auth / authorization → SEC tests
- Query / read operations → QRY tests
- Event / notification → EVT tests

## Post Bug-Fix
- Record via `add_tech(category: "bugfix")` to memory DB
- Include Bug ID in test name for traceability

## Test Tracking DB Tables

- `test_journeys`: E2E 測試旅程定義（route_sequence JSON），DevConsole `/schema` 可瀏覽
- `test_traceability`: AC→Test→Code 追溯矩陣，`testarch-trace` workflow 寫入

Query: `search_debt` 可查詢 test-related tech debt；未來 MCP 將新增 `search_test_trace`。
