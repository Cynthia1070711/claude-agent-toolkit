# 部屬指南脫敏政策 (Sanitization Policy)

> **版本**: 1.0.0
> **建立日期**: 2026-05-01
> **適用範圍**: `claude token減量策略研究分析/`(root)+ `1.專案部屬必讀/`(子目錄)所有 .md 文件
> **目標**: 對外公開部屬指南,但不洩漏業務細節 / 真實憑證 / 客戶資料

---

## 1. 為何需要脫敏

部屬指南文件可能透過以下管道流出:
- 開源 toolkit(`Cynthia1070711/claude-agent-toolkit` GitHub repo)
- 對外培訓 / 公開分享(會議 / Blog)
- 第三方審計 / 合作夥伴文件交換

**讀者應能**:理解架構設計、配置流程、技術選型
**讀者不應能**:複製貼上即可觸達生產環境、得知真實營收數字、識別客戶身份

---

## 2. 7 類脫敏對照表

| # | 類別 | 真實值範例 | 脫敏代稱 | 適用範圍 |
|:-:|:----|:---------|:--------|:--------|
| **1** | 品牌名 | (公司中文/英文品牌名) | **PCPT** / *該平台* / *the platform* | 正文敘述(技術 namespace 如 `App.Web` 因公開 csproj 可保留)|
| **2** | 域名 | `*.<brand>.com` / `<brand>.local` | `app.example.com` / `app.local` | URL / hostname / DNS 配置 |
| **3** | 測試 Email | `A<N>@<freemail>.com` / `<personal>@<freemail>.com`(實際使用 5 個 tier 測試帳號)| `user-tier-1@example.local` ~ `user-tier-5@example.local` / `dev-redacted@example.local` | 測試帳號 / 範例 |
| **4** | 測試密碼 | `<word><MMDD>` 形式弱口令(實際密碼禁洩漏)| `ChangeMe123!`(占位)+ 註明「部屬後必修改」 | 測試文檔 / Seeder |
| **5** | 真實價格 | `NT$<XXX>/年` ~ `NT$<X,XXX>/年` 多 tier 訂閱方案 | `Plan A/B/C/D`(具體金額由 SiteSettings 動態讀取,不於文檔列示);如需示範使用 `NT$<X,XXX>/年` 模糊化 | 訂閱 / 價格展示 |
| **6** | 客戶 / 業務真實名 | (具體 B2B 客戶名稱)| 通用代稱:`B2B Customer A` / `End User` / `Enterprise Tenant` | 範例 / 案例 |
| **7** | API 憑證 / Merchant ID | 真實 ECPay MerchantID / HashKey / SendGrid Key / Azure Connection String | `{{ECPAY_MERCHANT_ID}}` / `{{HASH_KEY}}` / `{{REDACTED}}` 占位符 | 配置範例 / settings.json |

---

## 3. 公開可揭露邊界(白名單)

以下技術細節**可保留**(因屬通用業界知識或公開 csproj/json):

- **技術棧版本**:.NET 8 / EF Core 8.0.22 / React 18.2 / Vite 5.2 / Vitest 1.5 / Playwright 1.58 / Zustand 5 / Fabric 5.3 等
- **路徑**:`src/Platform/`、`.claude/`、`.context-db/`、`docs/` 等(repo 結構)
- **Skill 名稱**:`/pcpt-payment-subscription`、`/pcpt-editor-arch` 等(架構索引)
- **Rule 名稱**:`constitutional-standard.md`、`skill-sync-gate.md` 等
- **Hook 名稱**:`pre-prompt-rag.js`、`session-recovery.js` 等
- **MCP server 名稱**:`pcpt-context`、`chrome-devtools` 等
- **Port 配置**:`localhost:7135` / `:5173` / `:5174` / `:3001`(本機開發,非生產)
- **資料夾結構命名**:`epic-eft/`、`epic-qgr/`、`epic-mqv/` 等(epic 代號可揭露)
- **架構決策記錄(ADR)編號**:`ADR-BUSINESS-001` 等(僅編號,內容若涉商業需脫敏)

---

## 4. 嚴禁揭露(黑名單)

以下**任何形式**禁止出現於部屬指南任何位置:

- ❌ 真實訂閱方案具體月費 / 年費金額
- ❌ 真實客戶名稱 / 案例(即使匿名化「某 X 客戶」仍禁,應改通用代稱)
- ❌ 真實 ECPay MerchantID / HashKey / HashIV / NotifyURL 完整 URL
- ❌ 真實 SendGrid API Key / Sender Email
- ❌ 真實 Azure Connection String / Service Bus Endpoint / Blob Storage Key
- ❌ 真實 Google OAuth Client Secret
- ❌ 真實 reCAPTCHA Secret
- ❌ 真實 PII 加密 Master Key
- ❌ 真實生產 URL / 內部 IP
- ❌ 真實 Git remote URL(若是私有 repo)
- ❌ Application Insights 真實 Connection String
- ❌ 真實 admin 帳號 username 及對應密碼
- ❌ 內部營業數據(營收 / 用戶數 / DAU / MAU)

---

## 5. 占位符規範

統一使用 mustache 風格 `{{...}}` 包覆環境變數占位:

```bash
# settings.json 範例
{
  "ConnectionStrings": {
    "DefaultConnection": "Server={{DB_HOST}};Database={{DB_NAME}};{{AUTH_OPTIONS}}"
  },
  "ECPay": {
    "MerchantID": "{{ECPAY_MERCHANT_ID}}",
    "HashKey": "{{ECPAY_HASH_KEY}}",
    "HashIV": "{{ECPAY_HASH_IV}}",
    "ServiceUrl": "{{ECPAY_SERVICE_URL}}"
  },
  "SendGrid": {
    "ApiKey": "{{SENDGRID_API_KEY}}",
    "SenderEmail": "noreply@{{YOUR_DOMAIN}}"
  }
}
```

開發 dummy 值清單:
- `Server=.;Database=PCPT_Dev;Trusted_Connection=True`(本機 SQL Server)
- `UseDevelopmentStorage=true`(Azurite 模擬器)
- `Endpoint=sb://localhost/`(Service Bus 模擬器)

---

## 6. 終審驗證指令

文件落地後執行以下 PowerShell 驗證脫敏完整性,**全部須返回 0 命中**才視為通過:

```powershell
# V-1 真實品牌正文敘述偵測(允許 namespace 如 App.Web)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "(?<!PCPT\.)PCPT(?![\.\w])" -CaseSensitive |
  Where-Object { $_.Line -notmatch '(配置|路徑|檔案|namespace)' }

# V-2 真實 Email(免費信箱提供商或品牌域名)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "@(gmail|hotmail|outlook|yahoo|qq|163|126)\.(com|cn|tw)|@<brand>" |
  Where-Object { $_.Path -notmatch 'SANITIZATION-POLICY' }
# 真實品牌域名(如 PCPT / your-brand)由 CI 腳本維護

# V-3 真實價格(NT$ 具體金額,不在此 policy 文件外露具體數字 — pattern 由實際營運數字組成)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "(NT?\$|NTD)\s?(\d{2,4})\b" |
  Where-Object { $_.Path -notmatch 'SANITIZATION-POLICY' }
# 註:本 policy 自身為避免洩漏不在 grep pattern 列舉具體數字,而於實際 CI 腳本 verify-deployment-docs.cjs 內含敏感數字常數

# V-4 真實 API 憑證 pattern(ECPay MerchantID 7+ 數字 / API Key 20+ 字元)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "MerchantID\s?[=:]\s?\d{7,}|ApiKey\s?[=:]\s?[A-Za-z0-9]{20,}"

# V-5 真實生產 URL 結構
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "https?://[\w\-]+\.PCPT\.(com|net|org|io)"

# V-6 弱口令 / 真實密碼(具體弱口令字串由 verify-deployment-docs.cjs 持有,不於本 policy 文件揭露)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "Password\s?[=:]\s?[\w\d!@#\$%^&\*]{6,12}"
# 真實弱口令 pattern(<word><MMDD> 形式)由 CI 腳本維護

# V-7 真實 Azure Connection String(IK 簽名長度判斷)
Select-String -Path "claude token減量策略研究分析\1.專案部屬必讀\*.md" `
  -Pattern "AccountKey=[A-Za-z0-9+/=]{60,}"
```

每條 V-N 必須返回 0 命中。任一命中視為脫敏未完成,**禁止 commit**。

---

## 7. 自動化驗證腳本

`scripts/verify-deployment-docs.cjs` 負責 CI 期間自動執行 V-1~V-7 + markdown link 解析 + 數字統計校驗(13 hooks / 73 skills / 19 rules / 23 MCP tools)。詳見「持續維護機制」章節。

---

## 8. 例外處理

如某段內容因技術需求**確實**無法完全脫敏(如教學如何配置 ECPay 必須露出欄位名稱):

1. 在該段加註:`<!-- SANITIZED: 欄位名揭露但具體值已占位化 -->`
2. 確認沒有對應的真實值出現在同一文件
3. 在版本歷史記錄該例外

---

## 9. 版本歷史

| 版本 | 日期 | 變更 |
|:----|:----|:----|
| 1.0.0 | 2026-05-01 | 初版建立。對齊 GitHub `Cynthia1070711/claude-agent-toolkit` v1.7.1 公開邊界,定義 7 類脫敏 + 占位符規範 + 7 條驗證指令 |

---

## Related Reading

- `README.md` — 主索引(本政策的呼叫位置)
- `verify-deployment-docs.cjs`(`scripts/`)— 自動化驗證腳本
- `.claude/rules/deployment-doc-freshness.md` — 持續維護機制(後置 gate)
