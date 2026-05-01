# Skills 治理深度指南 (Skills Deep Dive)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **資料快照日**: 2026-05-01
> **驗證指令**: `(Get-ChildItem .claude\skills -Directory).Count` 應 = 74

---

## 1. Skills 體系定位

Skill 是 Claude Code 的「**按需載入專家手冊**」 — 取代「全量載入 rules + 巨型 instructions.xml」的舊模式,改為:
- **Trigger 關鍵字** 命中 → AI 主動 `Read` 對應 SKILL.md → 載入該領域 SOP / FORBIDDEN / Pattern
- **Workflow 整合**:`create-story` 自動分析 Story 領域 → 註明 `## Required Skills`,`dev-story` / `code-review` 載入後執行
- **三引擎同步**:`.claude/skills/` ⟷ `.gemini/skills/` ⟷ `.agent/skills/` 三份 md5 一致(允許 frontmatter 引擎差異欄位)

---

## 2. Skill 數量與分布

| 引擎 | 路徑 | 數量(2026-05-01) |
|:----|:----|:----:|
| Claude Code(專案層)| `.claude/skills/` | **74** |
| Gemini CLI(專案層)| `.gemini/skills/` | **75** |
| Antigravity IDE(專案層)| `.agent/skills/` | **74** |
| Claude Code(全域層)| `~/.claude/skills/` | **3**(極少,框架預設)|

> **三引擎輕微不一致**:`.gemini` 比另外兩個多 1,通常為新增 Skill 尚未同步至其他引擎的暫態(由 `Skill(skill="saas-to-skill")` Mode B Phase 4 自動修復)。

---

## 3. Skill 分類矩陣(74 / .claude)

### 3.1 PCPT 領域 Skill(47 個,prefix `pcpt-*`)

#### Platform Core(6)
- `/pcpt-system-platform`(v1.1.5)— 19 模組架構大全
- `/pcpt-platform-overview` — 平台高階藍圖
- `/pcpt-editor-arch`(v1.16.0)— Canvas 編輯器資料架構 + Diff Sync
- `/pcpt-editor-data-features`(v2.6.1)— Excel / SerialNumber / QR / Barcode
- `/pcpt-floating-ui`(v2.6.3)— FloatingToolbar / FloatingCard / panelStack ESC LIFO
- `/pcpt-design-system`(v1.11.0)— Design Token / WCAG AA / EAA 2025

#### Backend Services(7)
- `/pcpt-admin-module`(v2.8.1)— Admin 後台架構
- `/pcpt-admin-rbac`(v1.4.0)— SuperAdmin / Impersonation / ForceChangePassword
- `/pcpt-admin-dashboard`(v1.3.0)— KPI / UserGrowth / SystemUsage / PdfQueueMonitor
- `/pcpt-admin-data-ops`(v1.2.1)— CSV export / API key batch
- `/pcpt-sqlserver` — T-SQL / EF Core / Migration patterns
- `/pcpt-background-services`(v2.2.0)— BackgroundService / PeriodicTimer / idempotent
- `/pcpt-security-middleware` — SecurityHeaders / CSP / HSTS / RequestTiming

#### Business Logic — Payment & Subscription(4)
- `/pcpt-payment-subscription`(v1.11.2)— ECPay / Order State Machine / Trial Abuse Fingerprinting / Downgrade Logic
- `/pcpt-invoice-receipt`(v1.1.1)— B2C/B2B e-invoice / ReceiptGenerator
- `/pcpt-remittance-review`(v1.2.3)— RemittanceStatus / SLA Reminder / DualProof
- `/pcpt-license-key`(v1.2.1)— LicenseKey / CrossEdition / Revoke

#### Member & Subscription(3)
- `/pcpt-member-plans`(v1.8.1)— PlanType / Feature Gating / MaxPdfPages / watermark
- `/pcpt-member-frontend`(v1.6.0)— MemberController / project hall / device management
- `/pcpt-announcement-system`(v2.0.1)— AudienceFilter / scheduled publish

#### Identity & Security(2)
- `/pcpt-auth-identity`(v1.11.0)— OAuth / JWT / RBAC / reCAPTCHA
- `/pcpt-branding-siteinfo`(v1.2.4)— SeoConfig / WCAG / SiteInfo

#### Infrastructure(5)
- `/pcpt-pdf-engine`(v1.5.0)— QuestPDF / DPI / CutLine / CircuitBreaker
- `/pcpt-signalr-realtime`(v1.3.0)— SignalR Hub / PdfProgressHub / polling fallback
- `/pcpt-azure-infra`(v0.3.3)— App Service / Functions / Blob / Service Bus / Key Vault
- `/pcpt-i18n-seo`(v1.4.3)— Internationalization / hreflang / JSON-LD / LocaleConstants
- `/pcpt-otel-micro-collector` — OTel OTLP token tracking + JSON Lines + rotation

#### Cross-Cutting & Governance(7)
- `/pcpt-routing-convention`(v1.2.0)— Route / URL convention / `/mgmt/` / `/api/v1/`
- `/pcpt-error-handling`(v1.0.3)— ErrorCode / RFC 7807 ProblemDetails
- `/pcpt-maintenance-mode`(v1.1.2)— MaintenanceMiddleware / 503 / IMaintenanceService
- `/pcpt-privacy-legal`(v1.5.1)— GDPR / DataRetention / AccountDeletion / Cookie Consent
- `/pcpt-business-api`(v1.4.2)— BusinessApi / Connector / HMAC-SHA256
- `/pcpt-doc-sync`(v1.2.1)— Documentation sync / last_synced_epic
- `/pcpt-tooltip` — Unified Tooltip dark-blue variant

#### Chrome MCP & Testing Support(4)
- `/pcpt-chrome-mcp-connect`(v1.0.0)— port 9222 真實 Chrome 連線辨識 SOP
- `/pcpt-chrome-mcp-login-sop`(v1.0.0)— Member + Admin 雙 track 登入測試 SOP
- `/pcpt-testing-patterns`(v1.14.0)— xUnit / Vitest / Playwright / DAMP / Test Pyramid
- `/pcpt-integration-testing`(v1.0.1)— WebApplicationFactory / Testcontainers / fixture selection

#### Workflow & DevOps(5)
- `/pcpt-context-memory`(v2.7.0)— Context DB / search / MCP tool 整合
- `/pcpt-debt-registry`(v3.4.0)— Tech Debt v3.0 / 6 categories / 5-layer triage / Boy Scout Rule
- `/pcpt-intentional-decisions`(v1.3.0)— IDD 4 層標註(Code/ADR/DB/Memory)/ COM/STR/REG/USR
- `/pcpt-create-story-depth-gate`(v1.4.0)— D1-D7 深度閘門
- `/pcpt-review-analyst` — 8 模式統一審查工具

#### Frontend & Data Patterns(4)
- `/pcpt-zustand-patterns`(v1.4.0)— stale closure / getState / useShallow
- `/pcpt-type-canonical` — TypeScript canonical types
- `/pcpt-progress-animation` — Skeleton / full-page progress bar

### 3.2 第三方整合 Skill(1)

- `/ECPay-API-Skill-master`(v1.5.4)— 官方版 ECPay API 助手:AIO / ECPG / CheckMacValue / e-invoice / Logistics

### 3.3 Workflow / Utility / Tool Skill(26)

| Skill | 用途 |
|:----|:----|
| `/saas-to-skill`(v3.1.0)| SaaS 模組 → Skill 創建 + 三引擎同步 + Mode A/B/C |
| `/skill-builder`(v3.0.1)| Workflow / Utility Skill 腳手架 |
| `/sdd-spec-generator` | M/L/XL Story SDD Spec 自動生成 |
| `/tasks-backfill-verify` | Tasks 逐項回填驗證(file:line 證據)|
| `/bug-fix-verification` | Bug fix 後驗證 |
| `/save-to-memory` | 對話內容存 Context DB |
| `/party-to-pipeline` | Party Mode → Pipeline 任務委派 |
| `/quick-dev` | 微任務快速路徑(零副作用)|
| `/smart-review-fix` | Smart review-fix 閉環 |
| `/edge-case-hunter` | 5 維邊界條件分析 |
| `/security-review`(v2.1.0)| OWASP checklist + ASP.NET Core 對齊 |
| `/tdd-workflow`(v2.1.0)| TDD RED/GREEN/REFACTOR + DAMP / Prove-It / Test Pyramid |
| `/constitutional-standard` | zh-TW + UTC+8 + Code Verification Mandate |
| `/claude-tools` | Claude Code CLI 完整參考 |
| `/claude-token-decrease` | Token 減量規範框架(11 categories A~K)|
| `/ui-ux-pro-max` | UI/UX 設計智能 |
| `/epic-config-sync` | Epic README 自動同步 |
| `/story-status-emoji` | Story 標題狀態 emoji |
| `/worktree-manager` | Git worktree 管理 |
| `/branch-merge` | Story branch merge to main |
| `/start-servers` | Backend 7135 / Frontend 5173 啟動 |
| `/claude-launcher` | Story pipeline 單一啟動 |
| `/claude-launcher-interactive` | 互動模式 launcher(全 MCP/Hooks)|
| `/claude-launcher-memory` | Memory 整合 launcher |
| `/autorun-e2e` | E2E 任務獨立視窗執行 |
| `/pipeline-window-control` | Pipeline 子視窗控制 |

---

## 4. Domain Profile(連帶載入規則)

`auto-skill-detection` 觸發單一 Skill 時,同 Domain 的關聯 Skill **可連帶建議載入**避免知識片面。

| # | Domain | Primary | 成員(`pcpt-` 前綴省略) | 載入策略 |
|:-:|:----|:----|:----|:----|
| 1 | `editor` | `editor-arch` | editor-arch / editor-data-features / floating-ui | ≤3 全量載入 |
| 2 | `state` | `zustand-patterns` | zustand-patterns / type-canonical | ≤3 全量載入 |
| 3 | `design` | `design-system` | design-system / tooltip / progress-animation | ≤3 全量載入 |
| 4 | `admin` | `admin-module` | admin-module / admin-rbac / admin-dashboard / admin-data-ops | ≥4:primary + 最相關 2 個 |
| 5 | `database` | `sqlserver` | sqlserver | 唯一成員 |
| 6 | `platform` | `platform-overview` | platform-overview / system-platform | ≤3 全量載入 |
| 7 | `middleware` | `error-handling` | background-services / maintenance-mode / error-handling / routing-convention | ≥4:primary + 最相關 2 個 |
| 8 | `security` | `auth-identity` | security-middleware / auth-identity | ≤3 全量載入 |
| 9 | `payment` | `payment-subscription` | payment-subscription / invoice-receipt / remittance-review | ≤3 全量載入 |
| 10 | `member` | `member-plans` | member-plans / member-frontend / license-key | ≤3 全量載入 |
| 11 | `notification` | `announcement-system` | announcement-system | 唯一成員 |
| 12 | `branding` | `branding-siteinfo` | branding-siteinfo / privacy-legal | ≤3 全量載入 |
| 13 | `integration` | `business-api` | business-api / ECPay-API-Skill-master | ≤3 全量載入 |
| 14 | `infra` | `azure-infra` | azure-infra / pdf-engine / signalr-realtime | ≤3 全量載入 |
| 15 | `i18n` | `i18n-seo` | i18n-seo | 唯一成員 |
| 16 | `testing` | `testing-patterns` | testing-patterns / integration-testing / e2e-playwright | ≤3 全量載入 |
| 17 | `devops` | `context-memory` | context-memory / debt-registry / intentional-decisions / doc-sync / review-analyst / otel-micro-collector | ≥4:primary + 最相關 2 個 |

> **規則**:每次觸發總載入上限 **≤ 3 個 Skill**(含初始匹配 Skill)。

---

## 5. SKILL.md 結構規範

每個 Skill 必含:

```yaml
---
name: pcpt-payment-subscription
version: 1.11.2
updated: 2026-04-30
description: |
  Payment / subscription / refund / trial logic.
  Handles ECPay AIO + ECPG + e-invoice + trial abuse detection.
triggers:
  - ECPay
  - Payment
  - Subscription
  - Webhook
  - free trial
  - refund
  - BillingType
  - OrderStatus
watches:
  - glob: "src/**/Services/Subscription*.cs"
  - glob: "src/**/Controllers/WebhooksController.cs"
  - glob: "src/**/Models/Order*.cs"
related_skills:
  - pcpt-invoice-receipt
  - pcpt-member-plans
related_idd:
  - IDD-COM-001
  - IDD-REG-001
---

# Skill: PCPT Payment & Subscription

## 1. Scope
## 2. Architecture
## 3. Forbidden Changes
## 4. Patterns
## 5. References
## 6. Version History
```

**附屬資源**:
- `references/*.md` — 深度子文件(複雜 Skill 才有)
- `scripts/*.ps1|.js` — 該 Skill 專屬輔助腳本(少數)

---

## 6. 三引擎同步機制

### 6.1 同步流程(由 `Skill(skill="saas-to-skill")` Mode B 執行)

```
1. .claude/skills/{name}/ 為 SSoT(Source of Truth)
2. PowerShell Copy-Item Recurse → .gemini/skills/{name}/
3. PowerShell Copy-Item Recurse → .agent/skills/{name}/
4. md5 校驗:三引擎同名檔 hash 必一致(except frontmatter 引擎特定欄位)
5. .claude/skills/skills_list.md 索引更新
```

### 6.2 三引擎差異欄位

| 引擎 | frontmatter 特有欄位 |
|:----|:----|
| `.claude/skills/` | `effort`、`context`、`agent` |
| `.gemini/skills/` | (無特殊,純 description + triggers)|
| `.agent/skills/` | (無特殊)|

### 6.3 watches glob staleness 偵測

每個 pcpt-* SKILL.md 含 `watches.glob` 監控源碼變更。`dev-story` Step 8 自動比對 `file_list` vs `watches.glob`:
- 命中 → tracking 寫入 `skill-staleness({skill}): {file}`
- `code-review` 驗證並寫 `tech_debt_items`(type=SKILL_STALE)
- ≥3 STALE → severity 自動升 MEDIUM

---

## 7. Sync Gates 三層守護

### 7.1 Skill-Sync-Gate(`.claude/rules/skill-sync-gate.md`)

**觸發**:`dev-story` / `code-review` 涉及 DB Schema / Models / Routes / Services / Components / Auth 變更
**動作**:
1. Scan file_list 提取核心概念
2. Grep 反向搜 pcpt-* 找受影響 Skill
3. 產出 Skill Impact Report
4. 影響 Skill 存在 → 跑 `Skill(skill="saas-to-skill")` Mode B 同步

### 7.2 Skill-IDD-Sync-Gate(`.claude/rules/skill-idd-sync-gate.md`)

**觸發**:`dev-story` Step 8.2(在 skill-sync-gate 之後)
**動作**:
1. 對每筆受影響 IDD 讀 `forbidden_changes`
2. Pattern match commit diff
3. 違反 → BLOCK + 顯示違反清單;未違反 → PASS
4. 連動更新 `pcpt-system-platform` 對應 module

### 7.3 Skill-Tool-Invocation-Mandatory(`.claude/rules/skill-tool-invocation-mandatory.md`)

**核心**:**字面 Skill tool 調用**必要(不可只「遵守 SOP 精神」)
- ❌ Edit `.claude/skills/**/SKILL.md` 而不先調 `Skill(skill="saas-to-skill")`
- ❌ PowerShell Copy-Item 三引擎同步繞過 Skill tool
- ❌ 自行人工模擬 7 面向檢查

**事故記錄**:
- 2026-04-16:td-hook-test-enhancement 直接 Edit 3 SKILL.md
- 2026-04-28 Session 55:Edit + Copy-Item 達 md5 identical 但未調用 Skill tool

---

## 8. 自助驗證指令

```powershell
# 數量驗證
$out = [PSCustomObject]@{
  Claude = (Get-ChildItem .claude\skills -Directory).Count
  Gemini = (Get-ChildItem .gemini\skills -Directory).Count
  Agent = (Get-ChildItem .agent\skills -Directory).Count
  Global = (Get-ChildItem $HOME\.claude\skills -Directory -EA SilentlyContinue).Count
}
$out | Format-List

# 三引擎同名 SKILL.md md5 校驗(舉例)
$skill = "pcpt-payment-subscription"
$h1 = (Get-FileHash ".claude\skills\$skill\SKILL.md").Hash
$h2 = (Get-FileHash ".gemini\skills\$skill\SKILL.md").Hash
$h3 = (Get-FileHash ".agent\skills\$skill\SKILL.md").Hash
"$skill claude=$h1`ngemini=$h2`nagent=$h3"
```

---

## 9. Related Reading

- `rules-deep-dive.md` — 20 rules 詳解(含 3 層 Skill Sync Gates)
- `idd-framework.md` — IDD 4 層標註體系
- `hooks-events-deep-dive.md` — 14 hooks(含 skill-change-detector)
- `BMAD架構演進與優化策略.md` §3.5 — Epic BU Skill Validator
- `.claude/skills/skills_list.md` — 即時索引(SSoT)

---

## 10. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。74 Skills 完整分類 + 17 Domain Profile + 三引擎同步 + 三層 Sync Gates |
