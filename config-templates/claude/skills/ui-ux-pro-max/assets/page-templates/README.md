# Page Templates（後台頁面模板範本 · v3）

> 蒸餾自 deskapp / Adminator（MIT）頁面**資訊架構「神」**，BS5 + zh-TW 重寫，捨 BS4/jQuery 形。
> 完整資訊架構說明 + 對齊 PhyCool 模組見 [`../../references/17-page-templates.md`](../../references/17-page-templates.md)。

## 現成範本

| 檔 | 範式 | 對齊 PhyCool |
|---|---|---|
| `error-page.html` | error 脫殼（無 shell + 置中 + 單一 CTA + 不洩 stack）；5 碼套用 400/403/404/500/503 | `phycool-maintenance-mode` / `phycool-error-handling` |

## 待擴範本（references/17 已有資訊架構，需要時依 §對應節落地）

- **auth split-screen + role selector** → 對齊 `phycool-auth-identity`（ASP.NET Identity + Google OAuth + reCAPTCHA），範本僅版面
- **invoice print-first 佈局**（固定欄寬 + 全形換行 + tabular-nums + 無 timeZoneName）→ 對齊 `phycool-invoice-receipt`（ECPay 財政部格式 IDD-REG-002）
- **pricing 5 層資訊架構**（icon→方案→大字價→feature→CTA）→ 引用實際定價（Basic 990/150·Advanced 2490/350·Professional 4990/650）+ locale pricing（`phycool-i18n-seo`）

> Iron Law：範本僅版面/資訊架構；登入/發票/金流**邏輯**走對應 phycool-* skill，禁在範本實作業務邏輯。

## Attribution（MIT）

- deskapp © 2018 DeskApp（error/login/invoice/pricing 資訊架構）
- Adminator © 2018 Aigars Silkalns（auth split-screen）

詳見 [`../SOURCE.md`](../SOURCE.md) §v3 Admin 蒸餾來源。
