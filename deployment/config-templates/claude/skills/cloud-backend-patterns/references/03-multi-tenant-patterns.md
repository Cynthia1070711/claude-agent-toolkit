# 03 - Multi-tenant / Cross-account Patterns

> 蒸餾自 aws-agent-skills/iam SKILL.md L36-41 + L132-157

## Trust Relationships(信任關係)

**概念**: Account A 的 identity 想 assume Account B 的 role,Account B 必須**信任** Account A。

### Trust Policy(在 Account B 的 role 上)
```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::ACCOUNT-A:root" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "sts:ExternalId": "unique-secret-id" }
  }
}
```

### Assume Role(在 Account A 執行)
```bash
sts:AssumeRole \
  --role-arn arn:aws:iam::ACCOUNT-B:role/CrossAccountRole \
  --role-session-name MySession \
  --external-id unique-secret-id
# 取得 temporary credentials(15 min - 12 hour)
```

## ExternalId 防 Confused Deputy 攻擊

**問題**: Vendor X 為多客戶服務,持有 Account X 的 role,可 assume 你的 Account Y。攻擊者註冊 Vendor X 並指定**你的** Account Y → Vendor X 不知情下用 Account X 的 role assume Account Y,給攻擊者資料。

**解法**: ExternalId — 你給 Vendor X 一個唯一 secret(如 UUID),Vendor X 必須在 assume call 帶上;攻擊者註冊時不知道你的 ExternalId,assume 失敗。

**Iron Law**: 任何 third-party 訪問(SaaS vendor / Audit firm)必用 ExternalId。

## Multi-tenant 3 隔離模型

| 模型 | 資源隔離 | 適用 | PhyCool 階段 |
|---|---|---|---|
| **Silo**(完全獨立) | 每 tenant 一個 account / VPC / DB | 高合規 / Enterprise | 未來 enterprise plan |
| **Pool**(共用 + tenant 標記) | 共用 infra,row-level isolation by `tenant_id` | SaaS 預設 | PhyCool 目前 |
| **Bridge**(混合) | 共用 compute + 獨立 DB | 中型客戶 | 過渡 |

### Pool 模型實作(PhyCool 適用)

#### Row-Level Tenant Isolation
```csharp
// EF Core global filter
modelBuilder.Entity<Order>()
    .HasQueryFilter(o => o.TenantId == _currentTenantService.TenantId);
```

**Iron Laws**:
- ❌ 跳過 query filter 直接 SQL(繞過 tenant isolation)
- ✅ 所有 entity 加 `TenantId` column + index
- ✅ Service layer 永遠透過 `_currentTenantService.TenantId` 取當前 tenant
- ✅ Cross-tenant operation 必須明確標記 + audit log

#### Tenant Resolution
```csharp
// 從 JWT claim 取得 tenant_id
public class CurrentTenantService {
    public Guid TenantId => Guid.Parse(_httpContext.User.FindFirstValue("tenant_id"));
}
```

## Cross-Tenant Operation 紀律

某些操作需跨 tenant(admin tools / 跨 tenant 報表):

### Pattern A: Explicit Cross-Tenant Flag
```csharp
[CrossTenantOperation]   // 明確標記,審計用
public async Task<List<Order>> GetAllOrdersAsync() {
    using (_tenantContext.SuppressFilter()) {
        return await _db.Orders.ToListAsync();
    }
}
```

### Pattern B: Separate Admin Connection
```csharp
// Admin DbContext 不含 tenant filter
public class AdminDbContext : DbContext { /* 無 query filter */ }
```

**Iron Law**: Cross-tenant 操作必走 **AdminControllerBase** + **Permission Boundary** 限制範圍 + **AuditLogEntry** 留證據。

## Cross-Account Patterns

### Pattern: Hub-and-Spoke
- Hub account(中央管理 logging / audit / security)
- Spoke accounts(各 workload)
- Spoke → Hub: 推 log via cross-account role
- Hub → Spoke: 拉 audit data via cross-account role

### Pattern: Production / Staging / Dev 隔離
- 完全不同 accounts(防止意外 cross-environment access)
- CI/CD 用 deploy role assume(短期 token)

## Tenant Onboarding 流程

```
1. Create tenant record(tenant_id 生成)
2. Provision tenant-specific resources(若 silo:新 DB / 新 VPC;若 pool:加 row)
3. Create initial admin user + assign role
4. Send invitation email + activation token
5. Generate API keys / secrets per tenant
6. Configure tenant-specific settings(branding / config / locale)
7. Audit log: 「Tenant {X} onboarded by {admin}」
```

## Tenant Offboarding 紀律

```
1. Soft delete first(`is_deleted = true` + `deleted_at`)
2. Retain data per legal requirement(GDPR 30d / 個資法 180d)
3. Hard delete after retention period
4. Cascade delete: orders / users / api_keys / sessions
5. Revoke all active tokens(JWT blacklist 或短 lifetime)
6. Audit log: 「Tenant {X} offboarded by {admin}」
```

## Compliance: Data Residency

某些 tenant 要求資料在特定地區(EU GDPR / 中國 PIPL):
- Silo 模型: 每 tenant 一個 region account
- Pool 模型: 按 tenant 標記 region + 跨 region 複製禁

PhyCool 對應: `phycool-privacy-legal` IDD-REG-001 個資法 180 天 + GDPR。

## Iron Laws

- ❌ Cross-tenant accidental access(未走 SuppressFilter 又拿到別 tenant 資料)→ data breach
- ❌ ExternalId 用 short / predictable string → confused deputy 風險
- ❌ Assume role lifetime > 12h → 超出 STS 上限,且過長有風險
- ❌ Tenant id 用 incrementing integer → enumeration attack(改用 UUID)
- ❌ 共用 DB connection pool 不重設 search_path → leak
- ✅ Defense in depth:DB query filter + Service layer check + API auth check 三層
- ✅ Audit log 每 cross-tenant operation
- ✅ Tenant deletion 必 soft delete + retention period
