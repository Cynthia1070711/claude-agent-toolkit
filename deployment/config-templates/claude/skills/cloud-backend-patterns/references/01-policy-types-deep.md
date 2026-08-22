# 01 - 4 Policy Types Deep Dive

> 蒸餾自 aws-agent-skills/iam SKILL.md L29-33

## 4 種 Policy Types(通用認知模型)

### 1. Identity-Based Policy(身分策略)

**附加在**: User / Role / Group

**回答**: "**你(this identity)**能做什麼?"

**範例**(JSON 抽象表示):
```json
{
  "Effect": "Allow",
  "Action": ["read", "write"],
  "Resource": ["resource:database:prod/*"]
}
```

**PhyCool 對應**: `AdminPermission` enum + `AdminControllerBase.HasPermission()` 檢查

### 2. Resource-Based Policy(資源策略)

**附加在**: Resource(database / file / bucket / queue)

**回答**: "**誰**能對**我(this resource)**做什麼?"

**範例**:
```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "user-A", "Service": "lambda" },
  "Action": "read",
  "Resource": "*"
}
```

**PhyCool 對應**: 目前 PhyCool 主要走 identity-based(`phycool-admin-account`),資源層級權限較少。**未來 multi-tenant 階段必用**(Tenant A 的資料只能 Tenant A 存取)。

### 3. Permission Boundary(權限上限)

**附加在**: User / Role(設定該 identity 的**最大可能權限**)

**回答**: "這個 identity 即使被授予再多 policy,**上限**是什麼?"

**使用場景**:
- 委派管理(delegate admin 給 sub-admin,但限制範圍)
- Sub-admin 創建新 user 時自動套用 boundary
- 防止 privilege escalation

**範例**:
```json
{
  "Effect": "Allow",
  "Action": ["read", "write"],
  "Resource": "tenant-X/*"     // boundary: 僅能操作 tenant-X 內資源
}
```

**PhyCool 缺項**: `phycool-admin-account` 目前無 boundary 概念,**未來 multi-tenant + delegated admin 場景必補**。

### 4. Service Control Policy(服務控制)

**附加在**: Organization / Account 層級

**回答**: "整個組織 / 帳號**永遠不能**做什麼?"

**範例**:
```json
{
  "Effect": "Deny",
  "Action": ["delete-all-data"],
  "Resource": "*"             // 全組織禁止
}
```

**PhyCool 對應**: 目前無此層級(單一組織)。**SaaS multi-tenant + enterprise 階段考慮**(限制 enterprise customer 的子帳號永不能做某些事)。

## 決策樹: 何時用哪一種?

```
要管理權限?
├─ 對個人 / 角色 → Identity-based(最常用)
├─ 對資源「誰能 access」→ Resource-based(multi-tenant 必用)
├─ 要委派 admin 但設上限 → Permission Boundary
└─ 全組織禁止特定動作 → Service Control Policy
```

## Policy Variables(動態策略)

```json
{
  "Effect": "Allow",
  "Action": "read",
  "Resource": "users/${aws:username}/*"   // 每個 user 只能讀自己資料
}
```

PhyCool 對應: `User.Identity.Name` / claim-based filter。

## Conditions(條件式策略)

```json
{
  "Effect": "Allow",
  "Action": "write",
  "Resource": "*",
  "Condition": {
    "IpAddress": { "aws:SourceIp": "203.0.113.0/24" },     // 限 IP 範圍
    "DateGreaterThan": { "aws:CurrentTime": "2026-05-19" }, // 限時間
    "Bool": { "aws:MultiFactorAuthPresent": "true" }       // 必須 MFA
  }
}
```

**PhyCool 缺項**: 目前 `phycool-admin-account` 無 conditions。**未來高風險操作可加 MFA condition**(對齊 `phycool-auth-identity` HighRiskOperations 再驗證機制)。

## Policy Size Limits(警示)

- Managed policy: 6,144 chars
- Inline policy(user): 2,048 chars
- Inline policy(role / group): 10,240 chars
- Trust policy: 2,048 chars

**Solution**: 拆多 policy / 用 prefix wildcard / tags-based access control。

## Iron Laws

- ❌ 同一 identity 附加 5+ policy 不分類 → 維護困難
- ❌ Resource path 用 `*` 全開放 → least privilege fail
- ❌ Permission boundary 與 identity policy 衝突 → 取交集(最嚴格)
- ❌ Trust policy 開放 root account 卻無 ExternalId → cross-account 被劫持風險
- ✅ Least privilege: deny by default, grant minimum
- ✅ 用 conditions 加上下文(IP / Time / MFA)
- ✅ Versioning policy(可 rollback)
