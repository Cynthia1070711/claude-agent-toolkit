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

## Runtime Behavior Verification (Auth / API / Route — 測行為非宣告)

Authorization / policy / cookie / route 的正確性**只在 runtime 顯現**(policy 能否解析、cookie 是否送達、HTTP status code)。reflection 驗 attribute 字串(如 `Assert.Equal("AdminPermission_None", attr.Policy)`)只測「宣告了什麼」,**不測「跑起來對不對」**。

涉以下任一改動,**必含 runtime integration test**(用既有 `CustomWebApplicationFactory` + `HttpClient.CreateClient()` 實打 HTTP 斷言 status;範式見 `JwtOnTokenValidatedIntegrationTests` / `SubscriptionRouteTests`):
- `[Authorize]` / `[AdminPermission]` / policy attribute 新增或修改
- `IAuthorizationPolicyProvider` / `AddPolicy` / `AddAuthentication` / `AddJwtBearer`
- `CookieOptions`(Path / Domain / SameSite)
- `[Route]` / route prefix / API versioning

**FORBIDDEN**:
- ❌ 只 reflection 驗 attribute 字串(`attr.Policy == "X"`)就標該 auth/route 行為「已測」(測宣告非行為)
- ❌ 「單元測試綠 = auth 正確」(reflection 測不到 runtime 401/403/500)

**Incident (2026-06-13)**: admin 後台 client API 全壞 3 個月 — cookie path `/mgmt` 不 cover `/api/v1/mgmt`(RC-A 401)+ `AdminPermission_None` policy provider 回 null(RC-B 500)。`DashboardControllerRbacTests` 只 reflection 驗 `attr.Policy` 通過,runtime 從未實打 endpoint → 漏網。一行 `client.GetAsync("/api/v1/mgmt/dashboard/stats")` 斷言 `!= 500` 即可擋下。CR runtime gate 見 `_bmad/bmm/workflows/4-implementation/code-review/steps/step-05b-tasks-backfill.md` §API/Auth 行為驗證獨立性。

## Post Bug-Fix
- Record via `add_tech(category: "bugfix")` to memory DB
- Include Bug ID in test name for traceability

## Test Tracking DB Tables

- `test_journeys`: E2E 測試旅程定義（route_sequence JSON），DevConsole `/schema` 可瀏覽
- `test_traceability`: AC→Test→Code 追溯矩陣，`.context-db/scripts/upsert-test-trace.js` 寫入（`bwu-3-dev-consume-review-audit` 校正：`testarch-trace` workflow 只寫 `traceability-matrix.md` 檔案，從未寫過此表——7 列種子資料 `linked_at` 皆為同一毫秒即為證據；code-review `step-03c` §6.6 對每個逐案例對帳完成的 case 呼叫此 writer）

Query: `search_debt` 可查詢 test-related tech debt；未來 MCP 將新增 `search_test_trace`。
