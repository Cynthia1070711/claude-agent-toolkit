# 02 - JWT / Token Validation Deep Dive

> 蒸餾自 aws-agent-skills/cognito SKILL.md L304-323

## Token 三類比較

| Token | 用途 | 內容 | 預設 lifetime |
|---|---|---|---|
| **ID Token** | 用戶身分 claims(name / email / 自訂 attribute) | OIDC standard claims + custom | 1 hour |
| **Access Token** | API 授權 | scopes + permissions | 1 hour |
| **Refresh Token** | 換新 ID/Access | opaque 或 JWT | 30 days(configurable) |

**Iron Laws**:
- ❌ Frontend 用 ID Token 呼叫 API(應用 Access Token)
- ❌ Refresh Token 放 localStorage(XSS 風險)→ httpOnly cookie 或 secure storage
- ✅ Token lifetime 越短越安全(關鍵業務 ≤ 15 min)
- ✅ Rotation: 每次 refresh 同時換 Refresh Token

## JWT 結構

```
header.payload.signature

eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.   ← header(算法 + key ID)
eyJzdWIiOiJ1c2VyMSIsImlhdCI6MTcxNn0.    ← payload(claims)
abc123...                                 ← signature(RSA / HMAC)
```

### Header
```json
{
  "alg": "RS256",       // 演算法 — RS256 / HS256 / ES256
  "kid": "key-1",       // Key ID(用於 JWKS 對映)
  "typ": "JWT"
}
```

### Payload(Claims)
```json
{
  "iss": "https://auth.example.com",   // Issuer
  "sub": "user-123",                    // Subject(user ID)
  "aud": "api.example.com",             // Audience(目標 API)
  "exp": 1716200000,                    // Expiration(Unix timestamp)
  "iat": 1716196400,                    // Issued At
  "nbf": 1716196400,                    // Not Before
  "jti": "unique-id",                   // JWT ID(防重放)
  // Custom claims
  "role": "admin",
  "tenant_id": "tenant-A"
}
```

## JWKS Validation 流程

### 1. Fetch JWKS(JSON Web Key Set)

```python
import requests
jwks_url = 'https://auth.example.com/.well-known/jwks.json'
jwks = requests.get(jwks_url).json()
# 範例 response:
# {
#   "keys": [
#     {"kty": "RSA", "kid": "key-1", "n": "...", "e": "AQAB"},
#     {"kty": "RSA", "kid": "key-2", "n": "...", "e": "AQAB"}
#   ]
# }
```

**Iron Law**: Cache JWKS(1 hour)+ rotate on `kid` miss → 避免每 token 都 fetch。

### 2. Decode Header(找 kid)
```python
import jwt
unverified_header = jwt.get_unverified_header(token)
kid = unverified_header['kid']
key = next(k for k in jwks['keys'] if k['kid'] == kid)
```

### 3. Verify Signature(RS256 範式)
```python
from jose import jwt
claims = jwt.decode(
    token,
    key,
    algorithms=['RS256'],
    audience='api.example.com',         # 必驗 audience
    issuer='https://auth.example.com'   # 必驗 issuer
)
# 自動驗證:
# - signature(用 JWKS public key)
# - exp(過期)
# - nbf(未生效)
# - aud(audience match)
# - iss(issuer match)
```

### 4. Custom Validation
```python
if claims['role'] not in ['admin', 'editor']:
    raise Unauthorized()
if claims['tenant_id'] != current_tenant:
    raise Forbidden()
```

## C# / ASP.NET Core(PhyCool 對應)

```csharp
services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => {
        options.Authority = "https://auth.example.com";
        options.Audience = "api.example.com";
        options.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(30),  // 容忍時鐘偏差
        };
    });
```

PhyCool 既有 `phycool-auth-identity` 已有完整 JWT 體系,本 ref 補充**通用方法論論述**。

## Token Refresh 範式

```js
async function refreshAccessToken(refreshToken) {
  const response = await fetch('/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  const { access_token, refresh_token: newRefreshToken } = await response.json();
  return { accessToken: access_token, refreshToken: newRefreshToken };
}

// Interceptor: 自動 refresh on 401
axios.interceptors.response.use(null, async (error) => {
  if (error.response?.status === 401) {
    const { accessToken } = await refreshAccessToken(getRefreshToken());
    setAccessToken(accessToken);
    error.config.headers.Authorization = `Bearer ${accessToken}`;
    return axios.request(error.config);
  }
  return Promise.reject(error);
});
```

## OAuth 2.0 / OIDC 4 Flows

| Flow | 用 | 適用 |
|---|---|---|
| **Authorization Code** | Web app + backend | 標準 server-side flow |
| **Authorization Code + PKCE** | SPA / Mobile | 無 client secret 環境 |
| **Client Credentials** | Backend-to-backend | M2M API call |
| **Refresh Token** | Renewal | Background token rotation |

**已退役**(不要用):
- ❌ Implicit Flow(token in URL fragment,安全性低)
- ❌ Resource Owner Password Credentials(直接收密碼)

## Token Lifetime Strategy

| 場景 | Access | Refresh |
|---|:---:|:---:|
| 高安全(金融 / 醫療) | 5-15 min | 1 day |
| 一般 SaaS | 1 hour | 30 days |
| 內部工具 / dev | 1 day | 90 days |
| Mobile app | 1 hour | 90 days |

## Common Pitfalls

- ❌ `alg: none`(無簽名)→ 接受任意 token,**禁** decode
- ❌ HS256 vs RS256 混用 → 攻擊者用 public key 當 HMAC secret 偽造 token
- ❌ 不驗 `aud` → 其他 audience 的 token 也通過
- ❌ 不驗 `iss` → 任意 issuer 的 token 通過
- ❌ Clock skew 不設 → 跨機器時鐘微差導致 valid token 被拒
- ❌ Refresh token 不 rotate → 被竊取持續有效
- ❌ Token 存 localStorage → XSS 攻擊讀取
