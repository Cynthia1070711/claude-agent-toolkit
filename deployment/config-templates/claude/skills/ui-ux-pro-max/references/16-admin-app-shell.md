# 16 - Admin App Shell（後台應用殼層佈局）

> 蒸餾自 Adminator（MIT）/ Materio（MIT）/ deskapp（MIT）三 admin 模板 · 取「神」捨「形」· BS5 + React 重寫 · zh-TW 在地化。
> 來源證據：天璣閣 `docs/tianji/distillations/2026-05-29-ui-v3-admin-templates.md`。
> **適用**：PhyCool BackOffice 後台、DevConsole、任何 sidebar+topbar+content 後台頁。**非** landing page / 編輯器 canvas。

---

## 為何 v2 缺這塊

v2 ref-07（architecture）/ ref-09（responsive）/ ref-13（components）涵蓋**原子 facet 方法論**，但無 admin **應用殼層**的端到端組合：sidebar + topbar + content + right-panel 如何組裝、3 態響應式 sidebar、z-index 分層合約。本 ref 補此缺口。

---

## 1. App Shell 佈局合約（Slot 注入 · 神來自 Materio `VerticalLayout.jsx:10-26`）

**核心智慧**：App Shell = 4 個**可選 slot**（navbar / navigation / content / footer），每個可獨立為 null。頁面只組裝 slot，不重複寫 chrome。

PhyCool React 表達（取代 MUI `VerticalLayout`）：

```tsx
// AdminShell.tsx — slot 注入合約（神：佈局與內容解耦）
interface AdminShellProps {
  sidebar?: React.ReactNode;   // null → 全寬無側欄（如 auth/error 頁）
  topbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
export function AdminShell({ sidebar, topbar, footer, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      {sidebar && <aside className="admin-shell__sidebar">{sidebar}</aside>}
      <div className="admin-shell__main">
        {topbar && <header className="admin-shell__topbar">{topbar}</header>}
        <main className="admin-shell__content">{children}</main>
        {footer && <footer className="admin-shell__footer">{footer}</footer>}
      </div>
    </div>
  );
}
```

**佈局 CSS（神來自 Adminator `_shell.scss:2-10` 的 grid 比例 + sticky 數值，改寫為 BS5 CSS 變數）**：

```css
/* 對齊 v2 三層 token（見 ref-01 §三層 Token）+ phycool design-tokens */
.admin-shell { display: grid; grid-template-columns: var(--sidebar-w, 248px) 1fr; min-height: 100vh; }
.admin-shell__sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto;
  background: var(--bg-sidebar); border-inline-end: 1px solid var(--border); }
.admin-shell__main { display: flex; flex-direction: column; min-width: 0; } /* min-width:0 防 grid 溢位 */
.admin-shell__topbar { position: sticky; top: 0; z-index: var(--z-admin-topbar, 10);
  height: 60px; backdrop-filter: saturate(140%) blur(10px); background: var(--overlay); }
.admin-shell__content { flex: 1; padding: var(--space-6, 1.5rem); }
```

> **Iron Law**：`min-width: 0` 在 `.admin-shell__main` 必加，否則長表格/寬 chart 撐破 grid（admin 常見 bug）。

## 2. 三態響應式 Sidebar（神來自 Adminator `_responsive.scss:26-102`）

admin sidebar 的**正確響應式不是「桌機全展開 ↔ 手機漢堡」二態**，而是**三態**：

| 斷點 | 狀態 | 行為 |
|---|---|---|
| ≥ 1100px | **full**（248px）| 完整 sidebar，文字 + icon |
| 720–1100px | **icon rail**（72px）| 僅 icon，hover 出 flyout submenu（平板/iPad 場景）|
| < 720px | **drawer** | fixed 抽屜 + backdrop + 漢堡 toggle |

```css
@media (max-width: 1100px) { .admin-shell { --sidebar-w: 72px; } .admin-shell__sidebar { /* icon-only + flyout */ } }
@media (max-width: 720px)  { .admin-shell { grid-template-columns: 1fr; }
  .admin-shell__sidebar { position: fixed; inset-block: 0; inset-inline-start: 0; z-index: var(--z-admin-drawer, 1045);
    transform: translateX(-100%); transition: transform .2s cubic-bezier(.2,.7,.2,1); }
  .admin-shell__sidebar.is-open { transform: translateX(0); } }
```

> **神**：72px icon-rail 中間態是 admin 特有（v2 ref-09 只談 breakpoint 理論，無此 admin pattern）。`cubic-bezier(.2,.7,.2,1)`（Adminator `_animations.scss`）是調校過的 spring-like 曲線，可借鑑。
> **在地化**：用 `inset-inline-start` / `border-inline-end` 邏輯屬性即可（PhyCool zh-TW 為 LTR，但邏輯屬性零成本前瞻；**不需**照搬 Materio 的 RTL 整套）。

## 3. Topbar（神來自 Adminator `_shell.scss:204-238` + `Shell.js:183-284`）

- **sticky 60px + frosted glass**：`backdrop-filter: saturate(140%) blur(10px)` + `--overlay: rgba(240,244,248,.72)`（light）/ `rgba(11,17,32,.72)`（dark）— 此為實戰調校數值（Adminator `_tokens.scss:48`）。
- **⌘K 命令搜尋框**：admin topbar 標配，hover focus ring + `border-color: var(--primary)` 過渡。
- **dropdown DOM 骨架**（通知/訊息/個人資料三組）：`.dd-wrap > .dd-menu > .dd-item(avatar + body + time) > .dd-footer`，`role="menu"`。PhyCool 通知 dropdown 可直接對應 SignalR realtime 推播（對齊 `phycool-signalr-realtime`）。

## 4. z-index 分層合約（對齊 phycool-floating-ui ADR-PANEL-STACK-001）

admin shell 的 z-index 必納入 PhyCool 既有 21 Tier 階層（見 `phycool-design-system` §z-index），**禁硬編碼**：

| 層 | token | 值參考 |
|---|---|---|
| content | （auto）| 0 |
| sticky topbar | `--z-admin-topbar` | 10 |
| sidebar drawer | `--z-admin-drawer` | 1045（BS5 offcanvas 層）|
| topbar dropdown | `--z-admin-dropdown` | 1050 |
| modal（沿用 BS5）| `--bs-modal-zindex` | 1055 |

> **Iron Law**：admin shell z-index **必引用 design-token CSS 變數**，對齊 `phycool-floating-ui` 防 Modal stacking / z-index 衝突（CLAUDE.md §22 條 R2/R3 incident 的根因）。

## 5. 捨棄的「形」（不照搬）

| 形 | 來源 | 為何捨 |
|---|---|---|
| webpack HtmlWebpackPlugin 多頁 | Adminator | PhyCool 用 Vite + React SPA / Razor |
| `Shell.js` innerHTML 字串拼接渲染 | Adminator | PhyCool 用 React component（見 §1）|
| MUI `VerticalLayout` JSX / `styled()` | Materio | 框架綁定，只取 slot 合約思想 |
| gulp + node-sass + BS4 `data-toggle` | deskapp | PhyCool BS5 用 `data-bs-*` + Vite |
| `data-active` / `data-crumbs` body attr 驅動 | Adminator | React Router / Razor RouteData 已有更好解 |
| FullCalendar / jsvectormap / chat / email demo 頁 | Adminator/deskapp | PhyCool 業務不需 |

## 6. 工程範式延伸

NAV manifest 單一真相、early-paint 防閃、Chart↔CSS-var 橋接、Settings 三態狀態機 → 見 `references/18-admin-engineering.md`。

## 7. Pre-Delivery Checklist（admin shell 專屬）

- [ ] `.admin-shell__main` 有 `min-width: 0`（防 grid 溢位）
- [ ] 三態 sidebar（full 1100 / rail 720-1100 / drawer <720）皆驗
- [ ] z-index 全走 design-token 變數（0 硬編碼）
- [ ] topbar dropdown `role="menu"` + 鍵盤可達（對齊 ref-08 a11y）
- [ ] dark mode 用 early-paint 防閃（見 ref-18）
- [ ] 無 jQuery / MUI / Next.js 依賴殘留（純 BS5 + React）
- [ ] zh-TW：sidebar 項目長詞不溢位（中文無空格斷詞，測 `word-break`）
