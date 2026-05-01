# Senior Developer Review - Validation Checklist (SaaS Standards v2.0)

## 📋 Pre-Review Setup
- [ ] Story file loaded from `{{story_path}}`
- [ ] Story Status verified as reviewable (review)
- [ ] Epic and Story IDs resolved ({{epic_num}}.{{story_num}})
- [ ] Required Skills loaded + FORBIDDEN rules extracted (if exists)
- [ ] Accumulated tech debt count loaded ({{tech_debt_count}})

## 📚 Context Loading
- [ ] Story Context + Epic Tech Spec located (or warning recorded)
- [ ] Architecture/standards docs + tech stack detected
- [ ] Available target stories listed for tech debt assignment
- [ ] Review Trail generated (step-01b): `{review_trail}` set (non-empty or "" if unavailable)

## 🔍 Triple-Layer Review Execution (v4.0)

### Blind Hunter (Step 3a)
- [ ] Blind Hunter executed with `{diff_output}` ONLY (no spec/AC/context)
- [ ] Blind Hunter output: Markdown list with file:line evidence per finding
- [ ] Coverage confirmed: Security(Primary), Observability, ErrorHandling, TestCoverage

### Edge Case Hunter (Step 3b)
- [ ] Edge Case Hunter executed with diff + project Read access
- [ ] Changed files and dependencies read via Read tool
- [ ] Edge Case Hunter output: JSON array with location/trigger_condition/severity
- [ ] Coverage confirmed: Scalability, DataConsistency, MigrationIntegrity, ErrorHandling, Skill FORBIDDEN

### Acceptance Auditor (Step 3c)
- [ ] `{review_mode}` evaluated: "full" → auditor ran; "no-spec" → skipped with reason
- [ ] If ran: each AC traced to code with file:line evidence
- [ ] If ran: Compliance (GDPR/Data Retention/Audit Logs) and TestCoverage checked
- [ ] All BR-XXX from SDD Spec verified

### SaaS 9-Dimension Audit (Step 3 main thread)
- [ ] **MANDATORY**: 每個程式碼檔案已用 Read 工具讀取完整內容
- [ ] **MANDATORY**: 每個檔案已執行 git diff 逐行審查
- [ ] Git vs Story File List discrepancies identified
- [ ] AC cross-checked against **實際程式碼** (附 file:line 證據)
- [ ] Tasks marked [x] verified against **實際程式碼** (附 file:line 證據)
- [ ] 測試檔案已讀取並驗證 assertion 有效性 (非 placeholder)

### Triage (Step 3d)
- [ ] All 4 finding sources normalized to unified Finding format
- [ ] Dedup applied: same file:line + similar title → merged with combined source
- [ ] All findings classified: patch / defer / dismiss
- [ ] `{dismissed_count}` set; dismissed findings dropped from `{unified_findings}`
- [ ] `{saas_readiness_score}` calculated from deduped non-dismissed list (no double-counting)
- [ ] Failed layers warning shown if `{failed_layers}` non-empty

## 🏢 SaaS Standards Review (MANDATORY)
- [ ] **Security (CRITICAL)**: OWASP Top 10, Auth, Data Protection
- [ ] **Scalability (HIGH)**: N+1, Pagination, Async, Caching
- [ ] **Observability (MEDIUM)**: Logging, Metrics, Tracing
- [ ] **Data Consistency (HIGH)**: Transactions, Concurrency, Validation
- [ ] **Migration Integrity (HIGH)**: If story includes new migrations, verify: (a) Migration files are well-formed and match Model changes, (b) `dotnet ef database update` applies without errors, (c) No orphaned shadow FK properties in ModelSnapshot, (d) `has-pending-model-changes` returns "No changes"
- [ ] **Error Handling (HIGH)**: Exceptions, Retry, Graceful Degradation
- [ ] **Compliance (CRITICAL)**: GDPR, Data Retention, Audit Logs
- [ ] **Test Quality**: Coverage >= 70%, Real assertions
- [ ] Skill FORBIDDEN rules checked (violations → HIGH)
- [ ] SaaS Readiness Score calculated (0-100, threshold >= 70)

## 📐 Spec Alignment Verification — VSDD Simplified (M/L/XL Story Only)

> 僅當 Story 資訊表中 SDD Spec 欄位非 N/A 時啟用。以全新乾淨視角比對 Spec vs Code。

- [ ] **Spec Loaded**: 讀取 SDD Spec `{spec_path}` 的 Business Rules + Boundary Conditions + API Spec
- [ ] **BR Coverage**: 每條 Business Rule 在程式碼中有對應實作（附 file:line 證據）
- [ ] **Boundary Compliance**: Spec Boundary Conditions（§5）有對應測試覆蓋
- [ ] **API Contract Match**: 實作的 API route/request/response 與 Spec §4 一致
- [ ] **Error Code Alignment**: 實作的錯誤碼與 Spec §5 Error Handling 一致
- [ ] **No Spec Drift**: 實作未引入 Spec 未定義的功能（防止 over-engineering / 架構漂移）
- [ ] **Test-BR Traceability**: 測試命名含 BR ID，可直接追溯至 Spec

## 🔥 Issue Resolution — 全自動修復 (By Severity)
- [ ] All CRITICAL issues auto-fixed (security, data corruption, arch bugs, false claims)
- [ ] All HIGH issues auto-fixed (unfixable → deferred with reason)
- [ ] All MEDIUM issues auto-fixed (unfixable → deferred with reason)
- [ ] All LOW issues auto-fixed (unfixable → deferred with reason)

### Auto-Deferred Items → Sidecar Files (if any)
- [ ] 每個延後項目寫入側車文件：根因分析(分類+因果鏈) → 路由決策(同Epic優先) → 寫入 tech-debt/{target}.debt.md（三層上下文：修復層+影響層+業務脈絡層）→ 當前Story新增 Tech Debt Reference → sprint-status.yaml tech_debt_backlog 更新
- [ ] Story done 時自動刪除對應 tech-debt/{story_key}.debt.md

## 🔍 Bug Fix Verification (Pre-Production Gate)
- [ ] `/bug-fix-verification {{story_key}}` invoked
- [ ] All related review_findings Bugs verified by Reading actual source code
- [ ] FIXED Bugs updated in review_findings (fix_status + file:line evidence)
- [ ] DEFERRED Bugs synced to tech_debt_items
- [ ] OPEN P0/P1 Bugs counted towards critical_remaining

## 🚧 Production Gate Validation
- [ ] **Zero Critical Gate**: CRITICAL issues == 0 ✅/❌
- [ ] **High Resolved Gate**: All HIGH fixed or justified ✅/❌
- [ ] **Tech Debt Limit Gate**: Total debt <= 15 ✅/⚠️
- [ ] **SaaS Readiness Gate**: Score >= 70 ✅/⚠️

## 📝 Status Update
- [ ] Story Status updated to {{new_status}} (done/in-progress/blocked)
- [ ] Sprint status synced
- [ ] H1 Emoji synced: Invoke /story-status-emoji Mode A (🟢 done / 🟢🚧 done+debt / 🟡 in-progress)

## 📋 Post-Review Documentation
- [ ] CR Report generated: `reviews/epic-{{epic_num}}/{{story_key}}-code-review-report.md`
- [ ] Report includes: SaaS dimension breakdown + Production Gate results
- [ ] reviews/README.md updated
- [ ] Tracking file status emoji synced (🟢 done / 🟠 review / 🔵 in-progress)
- [ ] Tracking file code-review 執行記錄已補入（Agent, 時間, CR Score, fixed/deferred 數量）
- [ ] Tracking file archived to `archived/epic-{{epic_num}}/` (if done) or retained in `active/` (if in-progress)
