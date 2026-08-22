# 04 - Access Denied Debug 5-Step SOP

> 蒸餾自 aws-agent-skills/iam SKILL.md L207-223

## 通用 Authorization Debug 5 步

```
1. Verify identity         ← 我是誰?
   ↓
2. Check attached policies  ← 我有什麼 policy?
   ↓
3. Simulate the action      ← 這 policy 允許這個動作嗎?
   ↓
4. Check explicit denies    ← 有 SCP / Boundary 阻擋嗎?
   ↓
5. Verify resource policy   ← 目標 resource 允許我嗎?
```

## Step 1: Verify Identity

確認當前 principal(身分)是誰。

### AWS
```bash
aws sts get-caller-identity
# 輸出: {"Account": "123", "Arn": "arn:aws:iam::123:user/alice"}
```

### PhyCool ASP.NET Core 對應
```csharp
// In controller / service
var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
var userName = User.Identity.Name;
var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value);
var permissions = User.FindAll("permission").Select(c => c.Value);

_logger.LogInformation("Current principal: User={UserId}, Name={Name}, Roles={Roles}",
    userId, userName, string.Join(",", roles));
```

**Iron Law**: 任何 Access Denied debug 第一步**永遠**驗證身分,不要假設「應該是 admin」。

## Step 2: Check Attached Policies

列出當前 principal 有的所有 policy / permission。

### AWS
```bash
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice         # inline policies
aws iam list-groups-for-user --user-name alice       # 透過 group 繼承
```

### PhyCool
```sql
-- 查 user 直接 permissions
SELECT * FROM AdminPermissions WHERE UserId = @userId;

-- 查 user 透過 role 繼承
SELECT p.* FROM AdminPermissions p
INNER JOIN AdminRolePermissions rp ON p.Id = rp.PermissionId
INNER JOIN AdminUserRoles ur ON rp.RoleId = ur.RoleId
WHERE ur.UserId = @userId;

-- 查 audit log 確認近期變更
SELECT * FROM AuditLogEntries
WHERE TargetUserId = @userId
ORDER BY CreatedAt DESC LIMIT 20;
```

## Step 3: Simulate the Action

不執行實際動作,模擬 policy 是否允許。

### AWS Policy Simulator
```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123:user/alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::my-bucket/file.txt
```

### PhyCool 對應(自建 simulator)
```csharp
public class PermissionSimulator {
    public SimulationResult Simulate(string userId, string action, string resource) {
        var perms = GetEffectivePermissions(userId);
        var allowed = perms.Any(p => p.Matches(action, resource));
        var denied = perms.Any(p => p.IsDeny && p.Matches(action, resource));
        return new {
            UserId = userId, Action = action, Resource = resource,
            AllowedBy = perms.Where(p => p.Matches(action, resource)).Select(p => p.Source),
            DeniedBy = denied,
            FinalDecision = denied ? "DENY" : (allowed ? "ALLOW" : "IMPLICIT DENY")
        };
    }
}
```

**Iron Law**: simulate 永不執行真實動作,純檢查 policy。

## Step 4: Check Explicit Denies

優先級: **Explicit Deny > Allow > Implicit Deny**。

### 檢查順序
1. Service Control Policy(組織級)
2. Permission Boundary(identity 上限)
3. Resource-based policy 中的 deny
4. Identity-based policy 中的 deny

### AWS
```bash
# SCP
aws organizations list-policies-for-target --target-id ACCOUNT-ID --filter SERVICE_CONTROL_POLICY

# Permission Boundary
aws iam get-user --user-name alice --query 'User.PermissionsBoundary'
```

### PhyCool
```sql
-- 查是否有 deny rule
SELECT * FROM AdminPermissions
WHERE UserId = @userId AND Effect = 'Deny';

-- 查 Permission Boundary(若有實作)
SELECT * FROM AdminPermissionBoundaries WHERE UserId = @userId;
```

## Step 5: Verify Resource-based Policy

某些資源有自己的 policy(誰能 access)。

### AWS
```bash
# S3 bucket policy
aws s3api get-bucket-policy --bucket my-bucket

# SQS queue policy
aws sqs get-queue-attributes --queue-url ... --attribute-names Policy
```

### PhyCool 對應
```sql
-- 資源層級權限(若有實作)
SELECT * FROM ResourcePermissions
WHERE ResourceType = 'PdfJob' AND ResourceId = @jobId;

-- Tenant isolation check
SELECT TenantId FROM PdfJobs WHERE Id = @jobId;
-- 比對當前 user 的 tenant_id
```

## Common Causes 分類

### Cause 1: 缺 Permission
- **症狀**: `AccessDenied` / `403 Forbidden`
- **修法**: 加 permission

### Cause 2: 有 Explicit Deny
- **症狀**: 即使有 Allow 仍 deny
- **修法**: 移除 deny / 調整 boundary

### Cause 3: Wrong Resource
- **症狀**: Policy 允許 `bucket-A/*`,但要 access `bucket-B/*`
- **修法**: 修正 resource ARN

### Cause 4: Missing Conditions
- **症狀**: Policy 需 MFA 但 user 未啟用
- **修法**: 啟用 MFA / 調整 condition

### Cause 5: Cross-tenant Leak
- **症狀**: User 嘗試 access 別 tenant 資料
- **修法**: 確認 query filter 生效 + audit log

### Cause 6: Expired Token
- **症狀**: `401 Unauthorized`(非 403)
- **修法**: Refresh token / re-login

### Cause 7: Wrong Audience / Issuer
- **症狀**: Token validation fail
- **修法**: 確認 JWT `aud` / `iss` 符合 API 配置

## Debug Decision Tree

```
Access Denied
├─ 401 → Step 1: token 過期 / wrong audience(走 02-token-validation-jwks.md)
└─ 403 → Step 2-5:
   ├─ Step 1: identity 確認?
   ├─ Step 2: 有 policy 嗎?
   ├─ Step 3: simulate 結果?
   ├─ Step 4: 有 explicit deny 嗎?
   └─ Step 5: resource policy 允許嗎?
```

## Iron Laws

- ❌ 直接猜原因「應該是權限問題」→ 跳過 5 步走錯方向
- ❌ Step 1 跳過 identity 驗證 → 在錯的 user 上 debug
- ❌ 只看 allow 不看 deny → 漏掉 explicit deny
- ❌ 忽略 condition(IP / MFA / Time)→ 看似有 policy 卻不生效
- ❌ Cross-tenant access denied 改用 SuppressFilter 繞過 → 違反 multi-tenant isolation
- ✅ 5 步必走完,即使前面找到原因(避免複合問題)
- ✅ 留 audit log(誰 simulate 了什麼)
