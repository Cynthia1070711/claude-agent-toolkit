# E2E Test Data Reference — PhyCool Platform

> **來源**: `docs/implementation-artifacts/reports/review/全方位審查規劃.md` + `測試資料/測試資料說明.md`
> **適用**: E2E Loop Mode + Standard Pipeline E2E 審查

---

## 測試路徑（六大系統 + 8 跨系統場景）

> 依賴順序: Layer 0 → Layer 4（按依賴 DAG 排序）

### S1. 會員入口系統 — Layer 0~1

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 1 | auth | 登入頁 | `/Account/Login` | A1~A5 | 極高 |
| 2 | auth | 註冊頁 | `/Account/Register` | 新帳號 | 極高 |
| 3 | auth | 忘記密碼 | `/Account/ForgotPassword` | A1 | 高 |
| 4 | auth | OAuth 登入 | `/Account/ExternalLogin` | — | 高 |
| 5 | auth | 裝置管理 | `/Account/Devices` | A1 | 高 |
| 6 | dashboard | Dashboard | `/` 或 `/Dashboard` | A1 | 中 |
| 7 | dashboard | 專案列表 | `/Projects` | A1 | 中 |
| 8 | dashboard | 個人設定 | `/Account/Manage` | A1 | 中 |

### S2. PCPT 編輯器系統 — Layer 1~2

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 9 | editor-core | 編輯器載入 | `/Editor/{projectId}` | A1 | 高 |
| 10 | editor-core | 存檔 DiffSync | `/Editor/{projectId}` | A3 | 高 |
| 11 | datasource | 資料來源綁定 | `/Editor/{projectId}` | A3 | 中 |
| 12 | image-asset | 圖片素材 | `/Editor/{projectId}` | A3 | 中 |
| 13 | qr-barcode | QR/Barcode | `/Editor/{projectId}` | A3 | 低 |
| 14 | table-shape | 表格與形狀 | `/Editor/{projectId}` | A3 | 低 |

### S3. 支付與訂閱系統 — Layer 1~2

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 15 | payment | 方案管理 | `/Subscription` | A1~A5 | 極高 |
| 16 | payment | 訂單記錄 | `/Orders` | A3+ | 極高 |
| 17 | payment | 付款流程 | `/Payment/{orderId}` | A1 | 極高 |
| 18 | pdf-engine | PDF 預覽/生成 | `/Preview/{projectId}` | A3+ | 高 |

### S4. 行銷與公開頁面 — Layer 0

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 19 | marketing | 首頁 | `/Home` | — | 低 |
| 20 | marketing | 定價頁 | `/Pricing` | — | 低 |
| 21 | help-legal | 幫助中心 | `/Help` | — | 低 |
| 22 | help-legal | 法律文件 | `/Terms`, `/Privacy` | — | 低 |

### S5. 維運管理後台 — Layer 0~2

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 23 | admin-auth | Admin 登入 | `/mgmt/login` | super | 高 |
| 24 | admin-member | 會員管理 | `/mgmt/members` | super | 高 |
| 25 | admin-order | 訂單退款 | `/mgmt/orders` | finance | 高 |
| 26 | admin-product | 產品定價 | `/mgmt/products` | super | 中 |
| 27 | admin-content | 公告法律 | `/mgmt/content` | operator | 中 |
| 28 | admin-settings | 平台設定 | `/mgmt/settings` | super | 中 |
| 29 | admin-reports | 報表監控 | `/mgmt/reports` | super | 中 |
| 30 | admin-templates | 系統模板 | `/mgmt/templates` | operator | 低 |

### S6. 商務版 API — Layer 3

| # | 模組 | 路徑 | URL Pattern | 帳號 | 風險 |
|---|------|------|-------------|------|:----:|
| 31 | business-api | API 金鑰管理 | `/DataConnection` | A5 | 高 |
| 32 | business-api | Connector | `/api/business/*` | API Key | 高 |

### X: 跨系統整合場景 — Layer 4

| # | 場景 | 涉及模組 | 風險 |
|---|------|---------|:----:|
| X1 | 訂閱升級 → 功能解鎖 | payment + editor | 極高 |
| X2 | 退款 → 降級 → 功能收回 | payment + editor | 極高 |
| X3 | 維護模式 → 付款中使用者 | admin-settings + payment | 極高 |
| X4 | 刪除會員 → 級聯影響 | admin-member + payment + dashboard | 高 |
| X5 | Admin 停用 → 編輯中 Session | admin-member + editor | 高 |
| X6 | 刪專案 → PDF Job | dashboard + pdf-engine | 高 |
| X7 | 批次圖檔 → 綁定 → PDF | image + datasource + pdf | 高 |
| X8 | API 金鑰到期 → 同步 | business-api + datasource | 中 |

---

## 測試優先序（依賴 DAG）

```
Layer 0 (無依賴): auth → admin-auth → marketing → help-legal
Layer 1 (依賴 L0): dashboard → payment → editor-core → admin-member
Layer 2 (依賴 L1): datasource → image-asset → admin-order → admin-content
Layer 3 (依賴 L2): pdf-engine → business-api → admin-reports
Layer 4 (跨系統):  X1~X8 整合場景
```

> auth 失敗 = 所有後續測試 BLOCKED。

---

## 帳號方案功能差異矩陣

> **來源**: `測試資料/測試資料說明.md` §1
> **核心**: 同一功能路徑用不同帳號測試，預期結果不同。

| 功能 | Free (A1) | Basic (A2) | Advanced (A3) | Pro (A4) | Business (A5) |
|------|:---------:|:----------:|:-------------:|:--------:|:-------------:|
| 資料筆數 | 50 | 250 | 500 | 1,000 | 2,000 |
| 儲存空間 | 10 MB | 250 MB | 500 MB | 1 GB | 10 GB |
| 專案數量 | 5 | 20 | 50 | 100 | 200 |
| 裝置數量 | 1 | 1 | 2 | 2 | 5 |
| 強制浮水印 | **是** | 否 | 否 | 否 | 否 |
| PDF 頁數 | **2 頁** | 1,000 | 1,000 | 1,000 | 5,000 |
| 序號/QR/批次圖 | 試用 | **禁止** | 可用 | 可用 | 可用 |
| 雙面/裁切/底圖/自訂紙張 | 試用 | **禁止** | **禁止** | 可用 | 可用 |
| API 存取 | 禁止 | 禁止 | 禁止 | 禁止 | **可用** |

> **Free (A1)**: 全功能試用，輸出受限（2 頁 + 浮水印）
> **Basic (A2)**: 多數進階功能禁止 — E2E 權限驗證的重要反面帳號

### E2E 帳號選擇策略

| 測試目標 | 正面帳號 | 反面帳號 |
|----------|---------|---------|
| 基本登入/Dashboard | A1~A5 | — |
| 序號/QR/批次圖 | A3/A4/A5 | **A2** |
| 雙面列印/裁切 | A4/A5 | **A2/A3** |
| PDF 生成 | A3+ | **A1** (2頁+浮水印) |
| API 存取 | **A5** | A1~A4 |
| 多裝置 | A3 (2台)/A5 (5台) | A1/A2 (限1台) |

---

## Admin RBAC 權限矩陣

| 頁面 | SuperAdmin | Finance | Operator | Support |
|------|:----------:|:-------:|:--------:|:-------:|
| Dashboard | O | O | O | O |
| Members | O | X | X | O |
| Orders | O | O | X | O(唯讀) |
| Refunds | O | O | X | O(唯讀) |
| Products | O | O | X | X |
| PDF Queue | O | X | O | X |
| Fonts/Templates | O | X | O | X |
| Announcements | O | X | O | X |
| Settings | O | X | O | X |
| Reports | O | O | O | X |
| AuditLogs/ApiKeys | O | X | X | X |
| RBAC Access | O | X | X | X |

### Admin 帳號

| Role | Email | Password |
|------|-------|----------|
| SuperAdmin | `super@example.local` | `ExamplePw123` |
| Finance | `finance@example.local` | `ExamplePw123` |
| Operator | `operator@example.local` | `ExamplePw123` |
| Support | `support@example.local` | `ExamplePw123` |

> 每個 Admin 路徑需用**有權限**和**無權限**角色各測一次。
> 完整測試資料: `測試資料/測試資料說明.md`
