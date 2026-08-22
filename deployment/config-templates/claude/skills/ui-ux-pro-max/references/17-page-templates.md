# 17 - Page Templates（後台頁面模板庫）

> 蒸餾自 deskapp（MIT）error/login/invoice/pricing + Adminator（MIT）auth split · 取資訊架構「神」· BS5 + React 重寫 · zh-TW 在地化。
> 來源證據：天璣閣 `docs/tianji/distillations/2026-05-29-ui-v3-admin-templates.md`（MVE-14~17）。
> **與 PhyCool 直接相關**：登入頁、ECPay 發票顯示頁、訂閱方案頁、錯誤頁、個人資料頁 — 國際化上線必備。

---

## 為何 v2 缺這塊

v2 涵蓋元件/facet 方法論，但**無頁面級資訊架構模板**。本 ref 補 5 類後台常見頁面的「神」（資訊架構決策），非照搬 HTML。

## 1. Error 頁（神：脫殼原則 · deskapp `404.html:110-169`）

**核心智慧**：error 頁（400/403/404/500/503）**脫離 app shell**（無 sidebar/topbar），置中極簡。

```tsx
// ErrorPage.tsx — 不套 AdminShell（sidebar/topbar = null 或不渲染）
<div className="error-page"> {/* 全螢幕置中 */}
  <h1 className="error-page__code">404</h1>
  <p className="error-page__msg">{/* zh-TW: 找不到頁面 */}</p>
  <a className="btn btn-primary" href="/">返回首頁</a>
</div>
```

**Iron Laws**：① 脫殼（不含導覽，避免「壞頁仍想導航」誤導）② 短訊息 + 單一主 CTA（返回首頁）③ 5 碼齊全（400 請求錯 / 403 無權限 / 404 找不到 / 500 伺服器錯 / 503 維護中 — 對齊 `phycool-maintenance-mode`）④ **zh-TW**：訊息用繁中，避免英文 stack trace 外洩（對齊 `phycool-error-handling` 不洩敏）。

## 2. Auth 頁（神：split-screen + role selector · deskapp `login.html:112-137` + Adminator `_auth.scss`）

- **split-screen**：左 marketing aside（< 900px 隱藏）+ 右表單。`grid-template-columns: 1fr 1fr` → 窄屏單欄。
- **role selector**（神）：`btn-group` radio 切換入口角色。PhyCool 可借鑑用於 admin / member 分流登入，或方案層級提示。
- 對齊 PhyCool：登入走 `phycool-auth-identity`（ASP.NET Identity + Google OAuth + reCAPTCHA + DeviceSession），本模板只供**版面資訊架構**，登入邏輯不變。

## 3. Invoice 頁（神：print-first 佈局 · deskapp `invoice.html:736-800`）

**核心智慧**：發票頁**優先列印佈局而非響應式格線** — 用固定欄寬（Description / Rate / Hours / Subtotal）而非 Bootstrap grid，確保列印對齊。

- 對齊 PhyCool：ECPay 電子發票顯示頁（`phycool-invoice-receipt`），財政部格式合規（IDD-REG-002，禁繞過 ECPay）。
- **在地化（關鍵）**：
  - 全形商品名/中文長字串 → `word-break: break-word` + 固定欄寬測長名換行
  - 金額 `tabular-nums` + NT$ 千分位（對齊 ref-14 KPI 數值規範）
  - 日期 `toLocaleString` 不帶 `timeZoneName`（對齊 CLAUDE.md §4.5 UI 時區）
  - print CSS：`@media print { .admin-shell__sidebar, .admin-shell__topbar { display: none; } }`

## 4. Pricing 頁（神：5 層資訊架構 · deskapp `pricing-table.html:720-779`）

**5 層資訊架構**：icon → 方案名 → 大字價格（`<sup>NT$</sup>990<sub>/月</sub>`）→ feature 清單 → CTA。

- 對齊 PhyCool 實際定價（SSoT 禁虛構）：Basic 990/150 · Advanced 2490/350 · Professional 4990/650（對齊 `phycool-member-plans`）。
- **在地化**：i18n locale pricing（國際化上線需依 locale 顯示幣別/價格，對齊 `phycool-i18n-seo` GeoIP routing + locale-specific pricing）。
- 突出推薦方案（border + badge「最熱門」），對齊 5 狀態（見 ref-10）。

## 5. Profile 頁（神：avatar 裁切 modal · deskapp `profile.html`）

頭像上傳 + 裁切 modal + 分頁（基本資料/安全/通知）。對齊 PhyCool 裝置管理（`phycool-auth-identity` DeviceSession）+ 個資保存（IDD-REG-001 180 天）。

## 6. 捨棄的「形」

| 形 | 為何捨 |
|---|---|
| BS4 `data-toggle`/`data-target` 語法 | PhyCool BS5 用 `data-bs-*`（全部重寫）|
| jQuery Steps / DataTables / Cropper plugin | PhyCool React 棧，用 React 元件 |
| 模板英文文案 + Inter 無中文 fallback | 全 zh-TW 重寫 + 中文字型 fallback |
| blog/gallery/sitemap/faq demo 頁 | PhyCool 業務不需 |

## 7. Pre-Delivery Checklist（page-templates 專屬）

- [ ] error 頁脫殼（無 sidebar/topbar）+ 5 碼齊 + zh-TW + 不洩 stack
- [ ] invoice print CSS 隱藏 shell + 全形換行 + tabular-nums + 無 timeZoneName
- [ ] pricing 引用實際定價（禁虛構）+ locale pricing 支援
- [ ] auth 套 phycool-auth-identity 真實登入流（模板僅版面）
- [ ] 無 BS4 語法殘留（全 `data-bs-*`）+ 無 jQuery plugin
