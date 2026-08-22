# 05 - Secrets Management(Rotation + Versioning)

> 蒸餾自 aws-agent-skills/secrets-manager(對應 Azure Key Vault)

## Iron Laws

- ❌ Hardcode secrets in code / config files
- ❌ Commit secrets to git(即使是 .env,加 .gitignore)
- ❌ 長期 static API key 不輪換
- ❌ 跨 environment 共用 secret(prod / staging / dev 必獨立)
- ✅ 從 secrets store fetch at runtime
- ✅ Rotation 策略(scheduled / on-demand)
- ✅ Versioning + Staging Labels
- ✅ Audit log every secret access

## Auto-fetch Pattern

### C# / ASP.NET Core(Azure Key Vault)
```csharp
// Program.cs
builder.Configuration.AddAzureKeyVault(
    new Uri($"https://{vaultName}.vault.azure.net/"),
    new DefaultAzureCredential()
);

// 使用時透過 IConfiguration 自動 fetch + cache
var connStr = configuration["ConnectionStrings:Default"];
```

### Cache 策略
- **Memory cache**: 5-15 分鐘(平衡延遲與安全)
- **Refresh on rotation**: 訂閱 rotation 事件即時刷新
- **Fallback**: 上次成功值 + 重試(secret store 暫時不可用)

## Rotation 策略

### 1. Scheduled Rotation(定期)

| Secret 類型 | Rotation 頻率 |
|---|---|
| DB password | 30-90 天 |
| API key(internal) | 90 天 |
| API key(external SaaS) | 依 vendor 規範 |
| OAuth client secret | 6-12 個月 |
| TLS certificate | 90 天(Let's Encrypt 自動)/ 1 年(自簽) |
| Encryption key | 1-3 年(KMS 自動) |
| Master root key | 永不輪換(或極長週期 + 嚴格管控) |

### 2. On-demand Rotation(觸發式)
- 員工離職 → 立即輪換相關 secrets
- 資安事件 / 疑似洩露 → 立即輪換
- Compliance requirement → 立即輪換

### 3. Rotation Lambda / Function 範式

```
1. 生成新 secret value
2. 寫入新版本(label: PENDING)
3. 更新下游服務配置(DB / API)
4. 測試新 secret 可用
5. Promote: PENDING → CURRENT, CURRENT → PREVIOUS
6. 等待 grace period(允許舊 secret 短暫並存)
7. Revoke PREVIOUS(grace period 後)
```

## Versioning + Staging Labels

3 個標籤代表 secret 不同階段:

| Label | 意義 | Use case |
|---|---|---|
| `CURRENT`(或 `AWSCURRENT`)| 當前有效 | Production 使用 |
| `PENDING`(或 `AWSPENDING`)| Rotation 進行中 | 測試新 secret 期間 |
| `PREVIOUS`(或 `AWSPREVIOUS`)| 上一版本 | Grace period 期間並存,允許 rollback |

### Rotation 期間狀態變化
```
T0: Stable
  CURRENT  = v1

T1: Generate new
  CURRENT  = v1
  PENDING  = v2

T2: Test + Update downstream
  CURRENT  = v1
  PENDING  = v2(已測試 OK)

T3: Promote
  PREVIOUS = v1
  CURRENT  = v2

T4: Grace period(例如 1 hour)
  PREVIOUS = v1(舊 secret 仍可用)
  CURRENT  = v2

T5: Revoke
  CURRENT  = v2
```

## 範例: DB Password Rotation

```python
def rotate_db_password(secret_arn):
    # Step 1: 取現有 secret
    current = secrets_client.get_secret_value(SecretId=secret_arn, VersionStage='CURRENT')

    # Step 2: 生成新 password
    new_password = secrets_client.get_random_password(PasswordLength=32, ExcludeCharacters='/\\@" ')

    # Step 3: 寫入 PENDING
    secrets_client.put_secret_value(
        SecretId=secret_arn,
        SecretString=json.dumps({'username': current['username'], 'password': new_password}),
        VersionStages=['PENDING']
    )

    # Step 4: 在 DB 設置新 password(同時保留舊 password 一段時間)
    db.execute(f"ALTER USER {username} WITH PASSWORD '{new_password}'")

    # Step 5: 測試新 password
    test_conn = connect(host=db_host, user=username, password=new_password)
    test_conn.close()

    # Step 6: Promote PENDING → CURRENT
    secrets_client.update_secret_version_stage(
        SecretId=secret_arn,
        VersionStage='CURRENT',
        MoveToVersionId=new_version_id,
        RemoveFromVersionId=current_version_id
    )

    # Step 7: Grace period(等待 downstream 拿到新 secret)
    time.sleep(3600)

    # Step 8: Revoke 舊 password
    db.execute(f"REVOKE OLD PASSWORD FROM {username}")
```

## Secrets Hierarchy(分類儲存)

```
secrets/
├── prod/
│   ├── db/                main, replica
│   ├── api-keys/          stripe, sendgrid, ecpay
│   ├── oauth/             google, microsoft
│   └── encryption/        master, data
├── staging/
│   └── ...(同 prod 結構)
└── dev/
    └── ...
```

**Iron Law**: Prod / Staging / Dev secrets **完全獨立**,Dev key 不可 access Prod。

## Auto-fetch from App Code

### .env Pattern(僅 dev 用)
```bash
# .env(加 .gitignore)
DB_PASSWORD=local-dev-only
STRIPE_KEY=sk_test_xxx
```

### Production: Direct Fetch
```csharp
// Azure Key Vault
var client = new SecretClient(new Uri(vaultUri), new DefaultAzureCredential());
var dbPassword = (await client.GetSecretAsync("db-password")).Value.Value;
```

### Production: Sidecar / Init Container Pattern
- Container 啟動時 init container fetch secrets → 寫入 shared volume
- App container 讀取 shared volume(file mount 或 env var)
- 適合 K8s / ECS / App Service

## Audit Logging

每次 secret access 留 trail:
- Who(principal)
- What(secret name + version)
- When(timestamp)
- Where(source IP / region)
- Why(operation: GetSecretValue / PutSecretValue / DeleteSecret)

Azure: Diagnostic Settings → Log Analytics
AWS: CloudTrail
PhyCool: AuditLogEntry table

## Common Pitfalls

- ❌ Hardcode secret 在 `appsettings.json` 推到 git
- ❌ Dev environment 用 production secret(防誤操作)
- ❌ Rotation 沒 grace period → downstream 連線斷
- ❌ Secret cache 太久 → rotation 後仍用舊 secret
- ❌ Secret cache 太短 → 每次都 API call 影響效能
- ❌ 不留 audit log → 洩露追溯困難
- ❌ 同一 secret 跨 environment 共用 → 一個 env 洩露牽連全部
