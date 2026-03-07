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

## 🔍 Adversarial Review Execution (強制程式碼讀取)
- [ ] **MANDATORY**: 每個程式碼檔案已用 Read 工具讀取完整內容
- [ ] **MANDATORY**: 每個檔案已執行 git diff 逐行審查
- [ ] Git vs Story File List discrepancies identified
- [ ] AC cross-checked against **實際程式碼** (附 file:line 證據)
- [ ] Tasks marked [x] verified against **實際程式碼** (附 file:line 證據)
- [ ] 測試檔案已讀取並驗證 assertion 有效性 (非 placeholder)

## 🏢 SaaS Standards Review (MANDATORY)
- [ ] **Security (CRITICAL)**: OWASP Top 10, Auth, Data Protection
- [ ] **Scalability (HIGH)**: N+1, Pagination, Async, Caching
- [ ] **Observability (MEDIUM)**: Logging, Metrics, Tracing
- [ ] **Data Consistency (HIGH)**: Transactions, Concurrency, Validation
- [ ] **Error Handling (HIGH)**: Exceptions, Retry, Graceful Degradation
- [ ] **Compliance (CRITICAL)**: GDPR, Data Retention, Audit Logs
- [ ] **Test Quality**: Coverage >= 70%, Real assertions
- [ ] Skill FORBIDDEN rules checked (violations → HIGH)
- [ ] SaaS Readiness Score calculated (0-100, threshold >= 70)

## 🔥 Issue Resolution — 全自動修復 (By Severity)
- [ ] All CRITICAL issues auto-fixed (security, data corruption, arch bugs, false claims)
- [ ] All HIGH issues auto-fixed (unfixable → deferred with reason)
- [ ] All MEDIUM issues auto-fixed (unfixable → deferred with reason)
- [ ] All LOW issues auto-fixed (unfixable → deferred with reason)

### Auto-Deferred Items → Sidecar Files (if any)
- [ ] 每個延後項目寫入側車文件：根因分析(分類+因果鏈) → 路由決策(同Epic優先) → 寫入 tech-debt/{target}.debt.md（三層上下文：修復層+影響層+業務脈絡層）→ 當前Story新增 Tech Debt Reference → sprint-status.yaml tech_debt_backlog 更新
- [ ] Story done 時自動刪除對應 tech-debt/{story_key}.debt.md

## 🚧 Production Gate Validation
- [ ] **Zero Critical Gate**: CRITICAL issues == 0 ✅/❌
- [ ] **High Resolved Gate**: All HIGH fixed or justified ✅/❌
- [ ] **Tech Debt Limit Gate**: Total debt <= 15 ✅/⚠️
- [ ] **SaaS Readiness Gate**: Score >= 70 ✅/⚠️

## 📝 Status Update
- [ ] Story Status updated to {{new_status}} (done/in-progress/blocked)
- [ ] Sprint status synced

## 📋 Post-Review Documentation
- [ ] CR Report generated: `reviews/epic-{{epic_num}}/{{story_key}}-code-review-report.md`
- [ ] Report includes: SaaS dimension breakdown + Production Gate results
- [ ] reviews/README.md updated
- [ ] Tracking file updated (SaaS Score, review summary, tech debt cross-ref)
- [ ] Tracking file archived (if done) or retained (if in-progress)
