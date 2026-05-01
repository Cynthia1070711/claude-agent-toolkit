---
name: saas-standards
description: "SaaS Production Readiness Standards v3.0 — severity policy, review dimensions, Framework v1.3 gates"
---

# SaaS Production Readiness Standards v3.0

> **REF:** Referenced by all code-review steps via `**REF:** saas-standards.md`

---

## Core Principle

開發階段發現的問題必須在開發階段解決，不留到上線後！

每個延後項目必須有明確的 Target Story 和修復期限。

累積技術債超過閾值時，阻止新功能開發。

---

## Severity Policy

| Severity | Rule | Action |
|----------|------|--------|
| **CRITICAL** | Security / Data / Architecture / AC偽完成 | MUST_FIX_NOW |
| **HIGH** | Performance / Error handling / Tests / Boundary | FIX_OR_JUSTIFY |
| **MEDIUM** | Quality / Documentation / Maintainability | TRACK_WITH_TARGET |
| **LOW** | Style / Naming / Comments (累積>10則阻止) | BACKLOG_WITH_LIMIT |

---

## Review Dimensions

| Dimension | Severity | Key Checks |
|-----------|---------|-----------|
| **Security** | CRITICAL | OWASP Top 10, Auth, Sensitive data, Unsafe dependencies |
| **Scalability** | HIGH | N+1 queries, Unlimited loading, Sync blocking, Missing cache |
| **Observability** | MEDIUM | Error logging, Performance metrics, Tracing, Health checks |
| **DataConsistency** | HIGH | Transactions, Race conditions, Optimistic locking, Validation |
| **ErrorHandling** | HIGH | Uncaught exceptions, Leaked messages, Retry, Circuit breaker |
| **Compliance** | CRITICAL | PII protection, Data retention, Access audit, Authorization |
| **MigrationIntegrity** | HIGH | Migration matches Model, FK/Navigation config, Check constraints |
| **TestCoverage** | HIGH | Real assertions (not `Assert.True(true)`), ≥70% coverage |

---

## SaaS Review Deep Dive Checklist

### 🔒 Security (CRITICAL)
- Parameterized queries (no SQL concatenation)
- XSS encoding for HTML output
- CSRF tokens on state-changing endpoints
- Auth/Authorization on all protected routes
- Sensitive data encrypted at rest and in transit
- Security headers and CORS configured
- Dependency versions without known CVEs

### 📈 Scalability (HIGH)
- No N+1 queries (use eager loading / Include)
- Pagination with Take/Skip (no unlimited result sets)
- Async/await properly used (no `.Result`/`.Wait()`)
- Appropriate caching strategy
- IDisposable properly disposed

### 📊 Observability (MEDIUM)
- ILogger in all catch blocks
- Performance timing/counting on critical paths
- Correlation ID propagated through requests
- Health check endpoint functional

### 🔄 DataConsistency (HIGH)
- DbContext/Transaction scope correct
- Locking/concurrency tokens where needed
- DataAnnotations validation present
- Idempotent operations

### 🗄️ MigrationIntegrity (HIGH) — Only if new Migrations
- Migration matches Model changes exactly
- FK/Navigation properties configured (no shadow FKs)
- DeleteBehavior follows conventions
- Check constraints and Unique indexes complete
- `dotnet ef database update` verified
- `has-pending-model-changes` returns No

### ⚠️ ErrorHandling (HIGH)
- try/catch present for external calls
- No stack trace leakage to end users
- Polly/retry for transient failures
- Circuit breaker for downstream services
- Graceful fallback

### 🧪 TestCoverage
- Read FULL test files — verify real assertions
- ❌ `Assert.True(true)` / empty body = invalid
- ✅ `Assert.Equal`, `.Should()` = valid
- Coverage ≥ 70%

---

## SaaS Readiness Score Formula

```
Base score: 100
CRITICAL issue: -25 each
HIGH issue: -10 each
MEDIUM issue: -5 each
LOW issue: -2 each
Minimum: 0
```

**Threshold:** Score < 70 → ⚠️ BELOW THRESHOLD (Gate warning)

---

## Production Gates (v3.0 分級制)

> **REF:** `pcpt-debt-registry` §13

### 按嚴重度分級

| Gate | Rule | Type | Failure Result |
|------|------|------|---------------|
| **p0-critical** | CRITICAL == 0 | **BLOCK** | Story 不可標記 done |
| **p1-high** | HIGH ≤ 5 (all routed) | **BLOCK** | Story 不可標記 done |
| **p2-medium** | MEDIUM ≤ 20 | **WARN** | 警告但不阻擋 |
| **p3-low** | LOW = unlimited | info | 不計入 gate |
| **p4-accepted** | ACCEPTED = unlimited | info | 不計入 gate |

### 特殊 Gate

| Gate | Rule | Type | Failure Result |
|------|------|------|---------------|
| **test-debt** | TestCoverage 類 debt == 0 | **BLOCK** | 測試債不可接受 |
| **coverage-minimum** | 測試覆蓋 ≥ 70% | **BLOCK** | HIGH issue |

### Age Limit Gate

| Gate | Rule | Type | Failure Result |
|------|------|------|---------------|
| **accepted-age** | ACCEPTED review_date 未過期 | **WARN** | 過期 → 強制 re-triage |
| **deferred-age** | DEFERRED < 90 天 | **WARN** | 超過 → 升級或改 ACCEPTED |

### FK Validation Gate

| Gate | Rule | Type | Failure Result |
|------|------|------|---------------|
| **orphaned-deferred** | DEFERRED 必須有 target_story | **WARN** | 缺失 target |
| **orphaned-target-story** | target_story 必須存在於 stories 表 | **WARN** | FK broken |
| **missing-review-date** | ACCEPTED 必須有 review_date | **WARN** | 缺失日期 |

---

## Non-Fixed Issue Classification (v3.0 Five-Way)

> **CRITICAL:** ABOLISHED: The "retained" / "保留" classification is PERMANENTLY REMOVED.
> **REF:** `pcpt-debt-registry` §2-2.3, `pcpt-intentional-decisions` §9.4

Every non-FIXED issue MUST be one of:

| Classification | 使用條件 | 必填欄位 | 儲存位置 |
|---------------|---------|---------|---------|
| **FIXED** | 本次 CR 已修復 | — | — |
| **DEFERRED** | 需要未來 Story 修復 (Score 25-50) | `target_story`, `root_cause` | `tech_debt_items` DB + sidecar |
| **WON'T FIX** | 純風格偏好 / 零實際風險（須通過 Q1-Q5 + 5-Min Rule 檢驗） | `wont_fix_reason`, Q1-Q5 answers | `tech_debt_items` DB |
| **ACCEPTED** | 承認存在但暫不修復 (Score 10-25 或 <10) | `review_date`, `accepted_reason` | `tech_debt_items` DB |
| **IDD** | Business/Strategy/Legal/User 決策驅動 (Q1-Q4 any Yes) | ADR, code annotation, DB entry | `intentional_decisions` DB |

**ACCEPTED 排除:** TestCoverage 類 debt 不可 ACCEPTED（必須 FIXED 或 DEFERRED）。

**IDD 互斥:** IDD 項目不入 `tech_debt_items` 表，走獨立 `intentional_decisions` 表。

If uncertain → default to DEFERRED (track more, not less).

---

## Architecture Bug Detection (Mandatory)

Always check for:
- useState duplicating Zustand state → MUST FIX (not deferrable)
- Hook called multiple places causing state desync → MUST FIX
- Data inconsistency / state desync → MUST FIX

Per CLAUDE.md §1.4: These are architecture Bugs, not design choices.

---

## Priority Score (v3.0)

> **REF:** `pcpt-debt-registry` §5

```
Priority Score = (Severity × BlastRadius × BusinessImpact) ÷ FixCost
```

**係數表:**

| 維度 | 值 | 說明 |
|------|---|------|
| Severity | P0=10, P1=7, P2=4, P3=2, P4=1 | 嚴重度 |
| BlastRadius | 全站=10, 模組=5, 單檔=2, 單行=1 | 影響範圍 |
| BusinessImpact | Revenue=10, Core=7, Admin=3, DevExp=1 | 商業影響 |
| FixCost | XS=1, S=2, M=5, L=10, XL=20 | 修復成本 |

**決策閾值:**

| Score | 決策 | 分類 |
|:-----:|------|------|
| > 50 | Fix Now (本週) | 強制 FIXED |
| 25-50 | Fix Next Sprint | DEFERRED |
| 10-25 | Track & Watch (+90d) | ACCEPTED |
| < 10 | Accept Long-term (+365d) | ACCEPTED |

---

## 5-Minute Rule — Quick Fix Inline (v3.0)

> **REF:** `pcpt-debt-registry` §6

**核心原則:** 符合 5-Min 條件的 finding 禁止標 WON'T FIX / DEFERRED，必須 inline FIX。

**5 條件 (全部滿足):** ≤5 行 + 0 跨檔 + 0 副作用 + 0 test break + ≤5 分鐘

**Whitelist:** typo / dead import / const / type annotation / nullish check / JSDoc
**Blacklist:** 跨檔重構 / API 變更 / DB schema / `[Intentional:]` 標註 / 測試修改

**執行點:** code-review Step 3d Section 3.5 (分類前攔截)

---

## Q1-Q5 Self-Check (v3.0)

> **REF:** `KB-workflow-003` — WON'T FIX 誤判 4 次事故

每個非 FIXED 項目必須回答 5 題：

| Q# | 問題 | Yes 的意義 |
|----|------|-----------|
| Q1 | 修復只改當前 Story 範圍檔案？ | 應立即修 |
| Q2 | 修復 ≤10 行且無副作用？ | 應立即修 |
| Q3 | 需要另一 Story 的 Service/API？ | 允許 DEFERRED |
| Q4 | 「等套件整合」是藉口嗎？ | 應立即修 |
| Q5 | 問題已在本次 CR 解決？ | 重分類 FIXED |

**執行點:** code-review Step 4 Phase 1 (分類流程入口)

---

## Q1-Q4 IDD Detection Gate (v3.0)

> **REF:** `pcpt-intentional-decisions` §9.4

對每個 DEFERRED / WON'T FIX / ACCEPTED 項目：

| Q# | 問題 | Yes → IDD 類型 |
|----|------|---------------|
| Q1 | 因 Business 決策不修？ | IDD-COM |
| Q2 | 因 Strategy 方向不修？ | IDD-STR |
| Q3 | 因法規/合規不修？ | IDD-REG |
| Q4 | 因 User feedback 不修？ | IDD-USR |

任一 Yes → 轉 IDD（執行 8 步建立流程），不入 tech_debt_items。

Priority: REG > COM > STR > USR

**執行點:** code-review Step 4 Phase 1.5 (Q1-Q5 後、分類前)

---

## Debt Registry Push Flow (v3.0)

After review, push ALL non-FIXED items to DB:

1. DEFERRED → `upsert-debt.js` + sidecar `tech-debt/{story_key}.debt.md`
2. WON'T FIX → `upsert-debt.js` with `wont_fix_reason` + Q1-Q5 evidence
3. ACCEPTED → `upsert-debt.js` with `review_date` + `accepted_reason` + `priority_score`
4. IDD → `add_intentional_decision` MCP + ADR + code annotation (8 步)
5. Run Push Checklist (12 items — see Step 4)

Push Checklist:
- ☐ All non-FIXED classified as DEFERRED / WON'T FIX / ACCEPTED / IDD (zero "retained")
- ☐ Q1-Q5 completed for ALL non-FIXED items
- ☐ Q1-Q4 IDD Gate completed for ALL DEFERRED/WON'T FIX/ACCEPTED
- ☐ IDD items have ADR + DB + code annotation
- ☐ ACCEPTED items have review_date + accepted_reason
- ☐ Priority Score calculated for ALL non-FIXED
- ☐ upsert-debt.js called for DEFERRED/WON'T FIX/ACCEPTED
- ☐ DEFERRED items have sidecar + target_story
- ☐ WON'T FIX have Q1-Q5 evidence
- ☐ TestCoverage debt NOT ACCEPTED
- ☐ Source Story Tech Debt Reference updated
- ☐ sprint-status.yaml synced
