# 18 - Admin Engineering Patterns（後台工程範式）

> 蒸餾自 Adminator（MIT）/ Materio（MIT）admin 模板的**架構智慧**（非視覺）· 跨框架可移植「神」· PhyCool React/Zustand/Razor 表達。
> 來源證據：天璣閣 `docs/tianji/distillations/2026-05-29-ui-v3-admin-templates.md`（MVE-5~9）。
> **適用**：後台導覽 / 主題 / 圖表 / 設定的工程實作決策。

---

## 1. NAV Manifest 單一真相驅動（神 · Adminator `Shell.js:22-82`）

**根問題**：後台 N 頁各自維護 sidebar HTML → 新增頁需同步 N 份 → 易漏。
**神**：sidebar / breadcrumb / active-state 由**單一資料結構**驅動，新增頁 = 改 1 個 entry。

```tsx
// PhyCool React 表達（取代 Adminator vanilla NAV 物件）
const NAV: NavItem[] = [
  { key: 'dashboard', label: '儀表板', href: '/admin/dashboard', icon: 'grid' },
  { key: 'orders',    label: '訂單管理', href: '/admin/orders',    icon: 'receipt' },
  // 新增頁 = 加一筆，sidebar/breadcrumb/active 自動對應
];
// Razor 版（BackOffice）：List<NavItem> 注入 _Layout.cshtml，action 對應 active
```

> **Iron Law**：active-state 由 route 比對 `key`/`href` 自動算，禁手動在每頁標 `is-active`。

## 2. Early-paint 防閃 Dark Mode（神 · Adminator 防閃 inline script）

**根問題**：dark mode 用戶載入時，CSS 到達前先閃白底。
**神**：`<head>` 內聯腳本在 CSS 前設 `data-theme`，3 行解決。

```html
<!-- _Layout.cshtml <head> 最前（CSS link 之前）。try-catch 防 private browsing 崩潰 -->
<script>(function(){try{var t=localStorage.getItem('pcpt-theme');
  var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', t||(d?'dark':'light'));
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();</script>
```

> 對齊 ref-08 dark mode（語意重設計非反白）+ 防 CLAUDE.md §UI「dark mode 白閃」incident。

## 3. Chart ↔ CSS-variable 橋接（神 · Adminator `charts.js:15-52`）

**根問題**：圖表庫顏色 hardcode → 主題切換時圖表不跟著變。
**神**：圖表配色讀 CSS 變數 + `MutationObserver` 監聽 `data-theme` 變更 → re-render。

```tsx
// PhyCool ApexCharts（取代 Chart.js）— 配色禁 hardcode，讀 design-token
function tokens() { const s = getComputedStyle(document.documentElement);
  return { primary: s.getPropertyValue('--primary').trim(), track: s.getPropertyValue('--bg-muted').trim() }; }
// 主題切換時 re-render
new MutationObserver(() => chart.updateOptions({ colors: [tokens().primary] }))
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

> **Iron Law**：admin 圖表配色**必讀 CSS 變數**（對齊 ref-14 + 三層 token），0 hex 硬編碼。

## 4. Settings 三態狀態機（神 · Materio `settingsContext.jsx:36-66`）

**神**：後台主題/版面設定有 3 種模式 —
- **永久**（寫 localStorage/cookie，跨 session 持久）
- **暫時**（`updatePageSettings` 僅本頁切換，離頁還原 — 如預覽某主題）
- **重設**（`resetSettings` 回初始）

```ts
// PhyCool Zustand settings store（取代 React Context + useObjectCookie）
interface SettingsStore {
  settings: Settings;
  update: (p: Partial<Settings>) => void;          // 永久（persist middleware）
  updateTemp: (p: Partial<Settings>) => void;      // 暫時（不 persist，離頁還原）
  reset: () => void;                                // 重設
}
```

> 對齊 `phycool-zustand-patterns`（persist middleware + 避免 useState 重複 Zustand state）。

## 5. Level-based 導覽縮排（神 · Materio `menuItemStyles.js:50-68`）

多層 sidebar menu 縮排用公式而非寫死：`padding-inline-start: calc(1.5rem + 2.5rem * (level - 1))`。active item 漸層背景 `linear-gradient(270deg, var(--primary), ...)`。

## 6. 捨棄的「形」

| 形 | 為何捨 |
|---|---|
| Adminator `Shell.js` innerHTML 渲染 | React/Razor 宣告式取代 |
| Materio `useObjectCookie` / React Context | Zustand persist 取代 |
| Chart.js `tokens()` 全域 defaults 注入 | ApexCharts updateOptions API |
| MUI `styled()` menuItemStyles | CSS `calc()` + design-token |
| Materio RTL 鏡像 menu | PhyCool zh-TW LTR，邏輯屬性足夠 |

## 7. Checklist

- [ ] sidebar 由 NAV manifest 單一真相驅動（新增頁改 1 處）
- [ ] dark mode early-paint 防閃 script 在 CSS link 前
- [ ] 圖表配色讀 CSS 變數 + MutationObserver re-render（0 hardcode）
- [ ] settings 三態（永久/暫時/重設）走 Zustand persist
- [ ] 多層 menu 縮排用 calc 公式（非寫死）
