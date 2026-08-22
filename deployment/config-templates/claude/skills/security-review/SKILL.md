---
name: security-review
description: >
  Security review checklist for ASP.NET Core + SQL Server + React applications.
  Use when adding authentication, handling user input, working with secrets,
  creating API endpoints, or implementing payment/sensitive features.
  Covers OWASP Top 10, secrets management, input validation, SQL injection,
  XSS, CSRF, rate limiting, sensitive data exposure, automated SAST CI
  (security.yml Semgrep / Gitleaks / SARIF triage), and SBOM supply-chain
  generation (security.yml sbom job · Microsoft sbom-tool · SPDX 2.2 · NuGet+npm).
version: 2.3.0
updated: 2026-05-29
triggers:
  - authentication
  - secrets
  - API endpoints
  - OWASP
  - OWASP code patterns
  - Zod schema
  - FluentValidation
  - audit triage
  - dotnet list package vulnerable
  - Rate Limiting
  - Secrets Management
  - bcrypt argon2
  - vulnerability scanning
  - SAST
  - Semgrep
  - SARIF
  - security.yml
  - Gitleaks
  - IDD-REG
author: CC-OPUS
created: 2026-02-01
---

# Security Review Checklist

> OWASP Top 10 對齊。PhyCool 專案安全中介層細節見 `/phycool-security-middleware`。

## When to Activate

- 實作認證/授權邏輯
- 處理使用者輸入或檔案上傳
- 建立新 API endpoints
- 使用 secrets 或 credentials
- 實作金流功能
- 儲存或傳輸敏感資料

---

## 1. Secrets Management

- [ ] 無硬編碼 API keys、tokens、passwords
- [ ] 所有 secrets 來自環境變數或 Azure Key Vault
- [ ] `.env` / `appsettings.Development.json` 在 `.gitignore`
- [ ] Git history 無 secrets 殘留
- [ ] 生產 secrets 在 Azure App Service Configuration

## 2. Input Validation

- [ ] 所有使用者輸入使用 Data Annotations 或 FluentValidation
- [ ] 檔案上傳限制大小、類型、副檔名（白名單制）
- [ ] 禁止直接在查詢中使用使用者輸入
- [ ] 驗證採白名單（非黑名單）
- [ ] 錯誤訊息不洩漏內部資訊

## 3. SQL Injection Prevention

- [ ] 所有 DB 查詢使用 EF Core 參數化（禁止字串拼接 SQL）
- [ ] 原始 SQL 使用 `FromSqlInterpolated` 或 `SqlParameter`
- [ ] 動態排序/篩選使用白名單欄位名驗證

## 4. Authentication & Authorization

- [ ] JWT Token 存於 httpOnly cookie（非 localStorage）
- [ ] 敏感操作前驗證授權（Controller 層 `[Authorize]` + Service 層雙重檢查）
- [ ] AdminPermission Flags 正確設定（見 `/phycool-admin-account`）
- [ ] Session 管理安全（timeout、裝置踢除機制）
- [ ] 密碼政策符合規範（ASP.NET Identity 設定）

## 5. XSS Prevention

- [ ] 使用者提供的 HTML 經過 sanitize（`HtmlSanitizer`）
- [ ] CSP headers 已設定（見 `SecurityHeadersMiddleware`）
- [ ] 禁止未驗證的動態內容渲染
- [ ] React 使用 `dangerouslySetInnerHTML` 前必須 sanitize

## 6. CSRF Protection

- [ ] State-changing 操作有 CSRF token（ASP.NET `[ValidateAntiForgeryToken]`）
- [ ] Cookie 設定 `SameSite=Strict`
- [ ] API endpoints 使用 JWT Bearer（天然 CSRF 免疫）

## 7. Rate Limiting

- [ ] 所有 API endpoints 有速率限制（`Microsoft.AspNetCore.RateLimiting`）
- [ ] 昂貴操作（搜尋、PDF 生成、登入嘗試）有更嚴格限制
- [ ] IP-based + User-based 雙層限制

## 8. Sensitive Data Exposure

- [ ] 日誌不記錄密碼、token、金鑰（PII 遮罩見 `/phycool-privacy-legal`）
- [ ] 錯誤回應使用結構化格式（RFC 7807 ProblemDetails，見 `/phycool-error-handling`）
- [ ] 詳細錯誤僅在 server logs，使用者只看通用訊息
- [ ] 無 stack trace 暴露給使用者

## 9. Dependency Security

- [ ] `dotnet list package --vulnerable` 無已知漏洞
- [ ] `npm audit` 無高危漏洞
- [ ] 使用 `dotnet restore --locked-mode` 確保可重現建置

## 10. Pre-Deployment Checklist

- [ ] HTTPS 強制啟用（HSTS）
- [ ] Security Headers 完整（CSP, X-Frame-Options, Permissions-Policy）
- [ ] CORS 正確設定
- [ ] 檔案上傳已驗證（大小、類型）
- [ ] reCAPTCHA 保護高風險操作（見 `/phycool-auth-identity`）

---

## 11. Automated SAST CI (security.yml · v2.2.0 新增)

> **背景**: `.github/workflows/security.yml`（commit `64a6362a` · Stage α A1/A4）已自動化 SAST + secret scan，**§9 手動 `dotnet list --vulnerable` 不再是唯一防線**。本章記錄 CI 現況，使新對話載入 skill 即知「已有自動掃描」，避免重複手工檢查。

### §11.1 四 job 自動化現況（security.yml file:line）

| Job | 工具 | 涵蓋 | 狀態 |
|-----|------|------|:----:|
| `gitleaks`（L27-42）| Gitleaks Action v2 | secret leak（PAT/AWS/Stripe/OpenAI/API token）+ full git history | ✅ active |
| `semgrep`（L48-80）| Semgrep CI | `p/owasp-top-ten` + `p/cwe-top-25` + `p/csharp` + `p/typescript` + `p/react` + `p/secrets` · `--error`（高嚴重視為 fail）· SARIF→GitHub Security tab（L76-80）| ✅ active |
| `trivy`（L86-106）| Trivy Action | container/IaC fs scan（CRITICAL/HIGH）| ⏸ `if: false`（Stage γ Azure 部署啟用）|
| `sbom`（L108+ · v2.3.0 新增）| Microsoft sbom-tool | SBOM 軟體物料清單生成（SPDX 2.2 · NuGet+npm 單工具 · restore+npm ci 補 transitive）· upload-artifact 90d | ✅ active（advisory）|

觸發：`push [main,develop]` + `pull_request [main]` + 週一台北 09:00 全量 + `workflow_dispatch`（L7-15）。

### §11.2 與 §9 / dependabot 的分工

| 層 | 機制 | 偵測 | 自動化? |
|----|------|------|:------:|
| **SAST**（code-level 漏洞）| security.yml Semgrep | injection/XSS/CSRF/secret code pattern | ✅ CI |
| **SCA**（依賴 CVE）| dependabot.yml + npm-audit.yml | 已知套件漏洞 + 升級 PR | ✅ CI |
| **SBOM**（成分清單 artifact）| security.yml sbom job | 完整 NuGet+npm transitive 成分清單（SPDX · 非漏洞）· 供應鏈事件應變/合規/B2B | ✅ CI（advisory）|
| **手動補充** | §9 `dotnet list --vulnerable` | 本地開發快速自檢 | 手動（非唯一防線）|

### §11.3 Trivy placeholder 追蹤

`trivy` job `if: false`（L89）為 Stage γ Azure 部署預留。啟用時點 = Azure IaC（Bicep/Dockerfile）落地後移除 `if: false`。屬產品部署軌，非賦能軌。

### §11.4 SBOM 軟體物料清單 CI（v2.3.0 新增 · 補 39 缺口 Security A1-A8 最後一塊）

`sbom` job 生成完整依賴成分清單（SPDX 2.2），補齊既有 SAST/Secrets/Container/SCA 四層後的最後一塊供應鏈防護。

**為何 Microsoft sbom-tool（而非 Trivy/Syft/CycloneDX）**：PhyCool 4 個 .NET 專案**全無 packages.lock.json + 無 CPM**（裸 .csproj PackageReference · Glob 驗證）。Trivy/Syft **不解析裸 .csproj** → .NET 後端產 silently empty SBOM（金流 transitive CVE 全盲）。MS sbom-tool 底層 component-detection **原生解析裸 .csproj**，是唯一單工具雙生態方案。決策依據 `ADR-EXTERNAL-003` + tianji 蒸餾 `docs/tianji/distillations/2026-05-29-sbom-supply-chain.md`（路徑 A · 對抗復核翻轉名目 winner Trivy）。

**SBOM ≠ SCA**（避誤判冗餘）：SCA（dependabot/npm-audit）是「現在有沒有已知漏洞」動態警報器；SBOM 是「裡面到底有什麼」靜態可歸檔清單（回溯查詢 + 合規 artifact + 反哺 SCA）。互補非冗餘。

**job 設計**：setup-dotnet + 逐專案 `dotnet restore`（產 project.assets.json 補 NuGet transitive）+ setup-node + `npm ci`（補 npm license）+ curl MS sbom-tool linux-x64 + `generate -bc src/YourApp`（SPDX 2.2）+ upload-artifact 90d · **advisory continue-on-error**（對齊 Lighthouse CI / recurring-regression-guards Phase-1 觀察範式，不阻擋 PR）。

**限制 / Kill switch**：SPDX-only（無 CycloneDX · 可後續 `syft convert`）· `releases/latest` 版本漂移（觀察期後可 pin tag）· 測試專案依賴一併納入（後續可 scope）。首次 PR run .NET SBOM 仍空 → revert + 重評啟用 lockfiles（IDD-STR）。

**後續改善路線**：dependency-submission 餵 GitHub graph → SBOM diff 偵測新依賴 → OWASP Dependency-Track 持續監控（屆時補 CycloneDX）→ SLSA 簽章 + release 附加（B2B / EU CRA 趨勢）。

---

## OWASP Code Patterns & Audit Triage (v2.1.0 新增)

> **背景**: 既有 §1-10 是 ASP.NET checklist 對齊,本章補完整 OWASP Top 10 C# **code patterns**(BAD/GOOD 對照)+ Schema 驗證對照 + Audit Triage 決策樹 + Context DB IDD-REG 整合。
>
> **來源**: agent-skills-main `security-and-hardening/SKILL.md` 的 OWASP Top 10 prevention + Audit Triage 完整方法論,融入 PhyCool 既有 IDD-REG-001(個資 180 天)/ IDD-REG-002(發票合規)合規體系。

### §X.1 OWASP Top 10 C# Code Patterns

#### 1. Injection (SQL/NoSQL/Command)

```csharp
// ❌ BAD: SQL 字串拼接
var query = $"SELECT * FROM Users WHERE Id = {userId}";
var users = db.Database.ExecuteSqlRaw(query);

// ✅ GOOD: EF Core LINQ(預設參數化)
var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);

// ✅ GOOD: FromSqlInterpolated(原始 SQL 必用)
var users = await db.Users.FromSqlInterpolated($"SELECT * FROM Users WHERE Id = {userId}").ToListAsync();
```

#### 2. Broken Authentication

```csharp
// ❌ BAD: 自寫 hash
var passwordHash = MD5.HashData(Encoding.UTF8.GetBytes(plaintext));

// ✅ GOOD: ASP.NET Identity(BCrypt-style + auto salt + work factor)
await _userManager.CreateAsync(user, plaintext);
var result = await _signInManager.PasswordSignInAsync(email, plaintext, isPersistent: true, lockoutOnFailure: true);

// ✅ Cookie 設定(httpOnly + Secure + SameSite)
options.Cookie.HttpOnly = true;
options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
options.Cookie.SameSite = SameSiteMode.Lax;
options.ExpireTimeSpan = TimeSpan.FromHours(24);
```

#### 3. Cross-Site Scripting (XSS)

```csharp
// ❌ BAD: Razor 直接渲染 HTML
@Html.Raw(userInput)

// ✅ GOOD: Razor 預設 encode
@userInput

// ✅ GOOD: 必須渲染 HTML 時 sanitize
@using Ganss.Xss
@{ var sanitizer = new HtmlSanitizer(); }
@Html.Raw(sanitizer.Sanitize(userInput))

// ✅ React: 預設 encode,需 dangerouslySetInnerHTML 必先 sanitize
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

#### 4. Broken Access Control

```csharp
// ❌ BAD: 只 [Authorize] 不檢 ownership
[Authorize]
[HttpPatch("api/projects/{id}")]
public async Task<IActionResult> Update(int id, ProjectDto dto) {
    var project = await _service.UpdateAsync(id, dto);  // 任何登入 user 可改任何 project!
    return Ok(project);
}

// ✅ GOOD: Service 層雙重 ownership 檢查
[Authorize]
[HttpPatch("api/projects/{id}")]
public async Task<IActionResult> Update(int id, ProjectDto dto) {
    var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
    var project = await _service.GetByIdAsync(id);

    if (project.OwnerId != userId)
        return Forbid();  // 403,not 401(authenticated 但 not authorized)

    return Ok(await _service.UpdateAsync(id, dto));
}
```

#### 5. Security Misconfiguration

```csharp
// ASP.NET Core SecurityHeadersMiddleware(`/phycool-security-middleware`)
app.UseSecurityHeaders(policies => policies
    .AddDefaultSecurityHeaders()
    .AddContentSecurityPolicy(builder => {
        builder.AddDefaultSrc().Self();
        builder.AddScriptSrc().Self().WithNonce();  // CSP nonce 策略
        builder.AddStyleSrc().Self().UnsafeInline();
        builder.AddImgSrc().Self().Data().Schemes("https");
    })
    .AddStrictTransportSecurity(maxAge: 365 * 24 * 60 * 60));

// CORS 限白名單
services.AddCors(options => options.AddPolicy("Production",
    builder => builder
        .WithOrigins(Configuration["AllowedOrigins"].Split(','))
        .AllowCredentials()));
```

#### 6. Sensitive Data Exposure

```csharp
// ❌ BAD: API 回傳含 PasswordHash
public class UserDto { public string Email; public string PasswordHash; }  // 永遠不該!

// ✅ GOOD: DTO 排除敏感欄位
public class PublicUserDto {
    public int Id { get; init; }
    public string Email { get; init; }
    public DateTime CreatedAt { get; init; }
    // PasswordHash / ResetToken 都不在此
}

// ✅ Mapping 時只取允許欄位
return user.ToPublicDto();
```

### §X.2 Schema Validation 對照(Zod → .NET)

| 通用 (Zod / TypeScript) | PhyCool (.NET 8) |
|------------------------|------------------|
| `z.string().min(1).max(200).trim()` | `[Required, StringLength(200, MinimumLength=1)]` |
| `z.string().email()` | `[EmailAddress]` |
| `z.number().int().positive()` | `[Range(1, int.MaxValue)]` |
| `z.string().regex(/^\d+$/)` | `[RegularExpression(@"^\d+$")]` |
| 複雜 schema(條件式) | **FluentValidation**(更彈性) |

**FluentValidation 範例**:
```csharp
public class CreateOrderValidator : AbstractValidator<CreateOrderDto> {
    public CreateOrderValidator() {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Amount).GreaterThan(0).LessThanOrEqualTo(1_000_000);
        RuleFor(x => x.PaymentMethod).IsInEnum();
        RuleFor(x => x.Items).NotEmpty().Must(items => items.All(i => i.Qty > 0));
    }
}

// Controller
public async Task<IActionResult> Create([FromBody] CreateOrderDto dto, [FromServices] CreateOrderValidator validator) {
    var result = await validator.ValidateAsync(dto);
    if (!result.IsValid) return UnprocessableEntity(result.Errors);
    return Ok(await _service.CreateAsync(dto));
}
```

### §X.3 npm audit → dotnet 對應 Triage 決策樹

```
dotnet list package --vulnerable 報漏洞
├── 嚴重度 Critical / High
│   ├── 程式碼可達?(該套件函數實際被呼叫)
│   │   ├── YES → 立即 update / patch / 替換 套件
│   │   └── NO(dev-only / 未使用 code path)→ 排程 fix(non-blocker)
│   └── 是否有 fix?
│       ├── YES → update 至 patched 版本
│       └── NO → workaround / 替換套件 / 加 allowlist + review_date
├── 嚴重度 Moderate
│   ├── Production 可達? → 下一 release cycle 修
│   └── Dev-only? → backlog 追蹤,有空就修
└── 嚴重度 Low
    └── 下次 dependency update 順便修
```

**判準關鍵問題**:

1. 該漏洞函數是否實際在 PhyCool code path 中被呼叫?(grep 套件 method 名)
2. 該套件是 runtime dependency 還是 dev-only?(`<PackageReference IsImplicitlyDefined="false">` vs `<PackageReference PrivateAssets="all">`)
3. 該漏洞在 PhyCool 部署情境下可被利用嗎?(server-side vuln in client-only path?)

**defer 時必填**: review_date(下次強制 re-audit)+ defer 理由(寫入 `phycool-debt-registry`)

### §X.3b Semgrep SARIF Finding Triage（v2.2.0 新增 · 對應 security.yml semgrep job）

```
Semgrep SARIF finding（GitHub Security tab）
├── 嚴重度 ERROR（--error → CI fail，block PR）
│   ├── True positive（injection/XSS/CSRF/secret 確實存在）
│   │   ├── 涉付款/個資（ECPay HashKey / PII）→ 立即修 + 對接 IDD-REG-001/002 合規
│   │   └── 一般 → 修正 code pattern（對照 §X.1 GOOD 範例）
│   └── False positive → `.semgrepignore`(路徑) 或 inline `// nosemgrep: rule-id`(單行) + review_date + 理由寫 `phycool-debt-registry`
├── 嚴重度 WARNING
│   └── 下一 PR cycle 修 / 評估升 ERROR
└── INFO
    └── backlog 追蹤
```

**判準關鍵**:
1. finding 是否在實際 code path（非 test/mock/dist）?
2. 涉敏感資產（ECPay 簽章 / PII / secret）→ 升級立即處置 + IDD-REG 查詢
3. false positive 抑制必走 `.semgrepignore` 或 `// nosemgrep`(**禁**整個 disable rule) + review_date

**對接**: true positive 涉合規（injection 漏個資 / secret leak）→ `search_intentional_decisions(type:IDD-REG)` 確認約束（對齊 §X.6）。defer false positive → `phycool-debt-registry`（review_date 必填）。

### §X.4 Rate Limiting (ASP.NET Core)

```csharp
// 全 API 限流(IP-based)
services.AddRateLimiter(options => {
    options.AddFixedWindowLimiter("api", o => {
        o.PermitLimit = 100;
        o.Window = TimeSpan.FromMinutes(15);
    });

    // 嚴格限流(login / payment)
    options.AddFixedWindowLimiter("auth", o => {
        o.PermitLimit = 10;
        o.Window = TimeSpan.FromMinutes(15);
    });

    // PDF 生成(昂貴操作)
    options.AddFixedWindowLimiter("pdf", o => {
        o.PermitLimit = 20;
        o.Window = TimeSpan.FromHours(1);
    });
});

// Controller 標記
[EnableRateLimiting("auth")]
[HttpPost("/Identity/Account/Login")]
public async Task<IActionResult> Login(LoginDto dto) { ... }
```

### §X.5 Secrets Management (PhyCool 三層)

```
Local 開發:
  appsettings.Development.json (在 .gitignore)
    ├── ECPay TestMerchantId / TestHashKey / TestHashIV
    ├── SendGrid SandboxApiKey
    └── ConnectionStrings.DefaultConnection (LocalDB)

Staging:
  Azure App Service Configuration(slot-specific)
    + Key Vault reference: @Microsoft.KeyVault(SecretUri=...)

Production:
  Azure Key Vault + Managed Identity
    ├── ECPay LiveMerchantId / LiveHashKey / LiveHashIV
    ├── SendGrid LiveApiKey
    └── ConnectionStrings.DefaultConnection (Azure SQL)
```

**禁止**:
- ❌ secrets 寫入 `appsettings.json`(會 commit)
- ❌ secrets 寫入 source code(grep 史可見)
- ❌ secrets 透過 PR description / commit message 傳遞

**git pre-commit 檢查**:
```bash
git diff --cached | grep -iE "password|secret|api_?key|token|hash_?key|merchant_?id"
```

### §X.6 Context DB 整合 — IDD-REG 自動查詢

寫安全相關 code 前自動查 IDD 合規約束,**避免違反法規**:

```bash
# 寫新 OAuth provider 整合(非 Google)
mcp__phycool-context__search_intentional_decisions({
  type: 'IDD-REG',
  related_files: ['OAuth*']
})
# → 返回 IDD-REG-001(個資 180 天)+ 確認新 provider 是否需 ADR

# 寫 PII 新欄位(姓名/Email/電話之外)
mcp__phycool-context__search_intentional_decisions({
  type: 'IDD-REG',
  query: 'PII storage'
})
# → 返回 IDD-REG-001(個資保存 180 天自動刪除),確認新欄位需加入 deletion job

# 寫發票相關(InvoiceService / ECPay invoice)
mcp__phycool-context__search_intentional_decisions({
  type: 'IDD-REG',
  query: '電子發票'
})
# → 返回 IDD-REG-002(統一發票電子化規格遵循財政部要求),禁繞過 ECPay invoice
```

**對應 IDD**:

| IDD ID | Title | 觸發場景 | 強制動作 |
|--------|-------|---------|---------|
| IDD-REG-001 | 個資保存 180 天自動刪除 | 寫 PII 欄位 / 寫 deletion job | 必加入 BackgroundService 定期清理 |
| IDD-REG-002 | 統一發票電子化規格遵循財政部要求 | 寫 InvoiceService / ECPayInvoice | 禁繞過 ECPay invoice API,禁自製格式 |

### §X.7 Cross-Reference

| 補強位置 | 角色 |
|---------|------|
| **`.claude/rules/subagent-blocked-tools.md` §3-Tier Boundary**(F2) | subagent 特化版(Always/Ask First/Never)|
| **`/phycool-security-middleware`** | SecurityHeaders / CSP nonce / AdminAudit / DeviceTracking 中介層實作 |
| **`/phycool-auth-identity`** | JWT / OAuth / reCAPTCHA / 裝置管理 / 二次認證 |
| **`/phycool-admin-account`** | AdminPermission Flags / 角色權限矩陣 |
| **`/phycool-privacy-legal`** | PII 加密/遮罩 / 資料保留 / GDPR |
| **`/phycool-error-handling`** | RFC 7807 ProblemDetails / 結構化錯誤 |
| **`/phycool-intentional-decisions`** IDD-REG-001/002 | 法規合規約束 |

---

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **2.3.0** | **2026-05-29** | **§11.4 SBOM 軟體物料清單 CI 新增**。security.yml 新增 advisory `sbom` job(Microsoft sbom-tool · SPDX 2.2 · NuGet+npm 單工具 · 補 39 缺口 Security A1-A8 最後一塊)。§11.1 加 sbom job row(四 job)+ §11.2 分工表加 SBOM 列(**SBOM≠SCA**:成分清單 artifact vs 漏洞警報器,互補非冗餘)。description 加 SBOM/sbom-tool/SPDX/supply-chain。**關鍵決策**:PhyCool 4 .NET 專案 0 packages.lock.json 裸 .csproj → Trivy/Syft 產空 .NET SBOM,MS sbom-tool component-detection 原生解析裸 .csproj 為唯一單工具雙生態方案(tianji 對抗復核翻轉 benchmark 名目 winner Trivy)。決策依據 `ADR-EXTERNAL-003` + 蒸餾 `docs/tianji/distillations/2026-05-29-sbom-supply-chain.md`(路徑 A · 使用者裁定)。走 `skill-builder` Mode B(通用 skill canonical 工具邊界 · 紀律自我糾正:初次誤調 saas-to-skill,兩者 Mode B 共用 8 面向方法論內容正確僅 wrapper 名稱錯)。 |
| **2.2.0** | **2026-05-29** | **§11 Automated SAST CI 新增 + §X.3b Semgrep SARIF Triage**。消除 skill↔CI 文件斷層:既有 `.github/workflows/security.yml`(commit `64a6362a` · Stage α A1/A4)已自動化 Semgrep SAST(p/owasp-top-ten+cwe-top-25+csharp+typescript+react+secrets · `--error` · SARIF→GitHub Security)+ Gitleaks secret scan + Trivy placeholder(`if:false` Stage γ),但 SKILL 全文 0 提及致新對話以為只有 §9 手動 `dotnet list --vulnerable` → 重複手工檢查。新增 §11 記錄 CI 三層分工(SAST/SCA/手動)+ §X.3b Semgrep SARIF finding triage 決策樹(ERROR block PR / false-positive `.semgrepignore`+review_date / 涉付款個資對接 IDD-REG)。description+triggers 加 SAST/Semgrep/SARIF/security.yml/Gitleaks。觸發:2026-05-29 9 域落地驗證 pre-audit 揭 SAST 既有 80% 落地(超交接假設「39 缺口未做」)真 gap=文件斷層。走 `skill-builder` Mode B(security-review 通用 skill · canonical 工具邊界 · 非 saas-to-skill)。 |
| **2.1.0** | **2026-04-24** | **§OWASP Code Patterns & Audit Triage 新增**(§X.1-X.7)— OWASP Top 10 C# code patterns(6 個 BAD/GOOD)+ Schema Validation 對照(Zod→DataAnnotations/FluentValidation)+ Audit Triage 決策樹 + Rate Limiting + Secrets 三層 + Context DB IDD-REG 自動查詢整合(IDD-REG-001 個資 180 天 / IDD-REG-002 發票合規)。來源:agent-skills-main `security-and-hardening/SKILL.md` 完整方法論。觸發:2026-04-24 Party Mode 深度整合分析 G2(`claude token減量策略研究分析/專案優化項目計畫.md` Phase 2)。 |
| 2.0.1 | 2026-04-05 | (既有版本) |

---

## Related Skills

| Skill | Coverage |
|-------|----------|
| `/phycool-security-middleware` | SecurityHeaders, CSP nonce, AdminAudit, DeviceTracking |
| `/phycool-auth-identity` | JWT, OAuth, reCAPTCHA, 裝置管理, 二次認證 |
| `/phycool-admin-account` | AdminPermission Flags, 角色權限矩陣 |
| `/phycool-privacy-legal` | PII 加密/遮罩, 資料保留, GDPR |
| `/phycool-error-handling` | ErrorCode enum, ProblemDetails, 結構化錯誤 |
