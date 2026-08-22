# 08 - Accessibility & Dark Mode(無障礙與深色模式)

> 蒸餾自 design-system-starter L422-537 + vercel-react-view-transitions L306-308

## WCAG 2.1 AA Compliance

### Color Contrast
| 文字大小 | 對比比例 |
|---|---|
| Normal text(< 18pt) | **4.5:1** 最小 |
| Large text(≥ 18pt 或 14pt bold) | **3:1** 最小 |
| UI components / graphics | **3:1** 最小 |

工具:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Stark(Figma plugin)
- Chrome DevTools Lighthouse a11y audit

### Keyboard Navigation

每個互動元素必須:
- 用 `Tab` 可達到
- 用 `Enter` / `Space` 觸發
- Focus state 視覺明顯(`outline` 或 `box-shadow`)
- Tab order 符合視覺順序(`tabindex` 慎用,通常不需設定)

```tsx
<button
  onClick={handleClick}
  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
>
  Click me
</button>
```

### Focus Trap(Modal / Drawer)
```tsx
<Modal>
  <FocusTrap>
    {/* 內容 — Tab 不會跳出 Modal */}
  </FocusTrap>
</Modal>
```

Iron Laws:
- ESC 關閉 Modal
- 開啟 Modal 時 focus 移到第一個互動元素
- 關閉時 focus 還原至觸發按鈕

### ARIA Attributes

| 屬性 | 用途 |
|---|---|
| `aria-label` | 提供 accessible name(無視覺 label 時) |
| `aria-labelledby` | 引用其他元素作為 label |
| `aria-describedby` | 提供補充說明 |
| `aria-expanded` | 折疊 / 展開狀態 |
| `aria-controls` | 關聯控制元素與被控制內容 |
| `aria-live` | 動態內容更新(`polite` / `assertive`) |
| `aria-hidden` | 對螢幕閱讀器隱藏(但保留視覺) |
| `aria-current` | 當前 page / step / location |
| `role` | 自訂語義角色 |

### Semantic HTML

✅ 用語義標籤:`<button>` / `<nav>` / `<main>` / `<aside>` / `<article>` / `<section>` / `<header>` / `<footer>`
❌ 不用 `<div onClick>`(失去鍵盤 + a11y + cursor)

### Skip Links

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only">
  跳到主內容
</a>
```

讓鍵盤使用者跳過 nav,直達內容。

### Screen Reader Support

- 圖片 `alt=""`(裝飾)或 `alt="描述"`(資訊)
- 表單 `<label>` 必須關聯 `<input>`(`htmlFor={id}`)
- 動態錯誤訊息用 `aria-live="polite"`
- Loading state 用 `aria-busy="true"`

## Color Blindness Accessibility(色盲友善)

### 3 主要類型
- **Deuteranopia / Deuteranomaly**(綠色弱):紅綠混淆,人口 6% 男性
- **Protanopia / Protanomaly**(紅色弱):類似,人口 2% 男性
- **Tritanopia**(藍色弱):藍黃混淆,< 0.5%

### 設計原則
1. **永不單靠顏色傳遞資訊**(WCAG 1.4.1)— 加圖示 / 文字 / pattern
2. **安全色票範式**:
   - Blue + Orange(所有色盲類型可區分)
   - 避免 Red + Green 對比作 indicator
3. **資訊重複編碼**:
   - 圖表用顏色 + pattern(實線 / 虛線 / 點線)
   - 表單錯誤用紅色 + ⚠ 圖示 + 文字「錯誤」
4. **工具驗證**:Sim Daltonism(macOS)/ Color Oracle / WhoCanUse / Stark Pro

### Color-blind Safe Palette 範例
```
Sequential:  #fff7bc → #fec44f → #d95f0e  (黃→橙→深褐,所有類型可區分)
Diverging:   #1f78b4 ← #f7f7f7 → #ff7f00  (藍←中性→橙)
Categorical: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e']  (ColorBrewer Set2)
```

## Dark Mode Optimizations(深色模式優化)

### Iron Law: 不是反白,是重新設計

❌ 簡單 invert(`filter: invert(1)`)→ 圖片變反色,品牌色變調
✅ 每個 semantic token 在 light / dark 有獨立值

### 顏色語意對映

| Semantic | Light | Dark | 原則 |
|---|---|---|---|
| `background.primary` | `#ffffff` | `#0f172a` | Dark 不用純黑 #000(對比過強傷眼) |
| `background.secondary` | `#f8fafc` | `#1e293b` | 漸進對比階級 |
| `text.primary` | `#0f172a` | `#f1f5f9` | Dark 不用純白 #fff(發光感) |
| `text.secondary` | `#475569` | `#94a3b8` | 維持 contrast hierarchy |
| `brand.primary` | `#3b82f6` | `#60a5fa` | Dark mode 提升 saturation 一階(避免暗沉) |
| `border` | `#e2e8f0` | `#334155` | 邊框淡化避免切割感 |

### Shadow / Elevation

Light mode shadow 用深色 transparent:
```css
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
```

Dark mode shadow 改用**亮 ring**(深底之上 shadow 不可見):
```css
[data-theme="dark"] .elevated {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 6px -1px rgba(0, 0, 0, 0.5);
}
```

### 圖片 / Logo 適配

- Logo 雙版本(深 / 淺底背景各一)
- 圖片加 `filter: brightness(0.8) contrast(1.1)` 減少 dark mode 眩光
- SVG icon 用 `currentColor` 自動跟 text color

### Glass / Transparent 元素

```css
/* Light mode: 高透明度 */
.glass-light { background: rgba(255, 255, 255, 0.7); }

/* Dark mode: 改用深色 rgba */
[data-theme="dark"] .glass-dark { background: rgba(15, 23, 42, 0.7); }
```

### 偵測使用者偏好

```js
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
// 結合 user override(localStorage / DB)
```

3 種模式: `light` / `dark` / `system`(跟 OS)

### Toggle UX

- Switch 不是 toggle button(語義不同)
- 切換時短暫 transition(`color` / `bg` 200ms)避免閃光
- 切換前後 layout 不變(避免閃爍)

## Reduced Motion(vercel-react-view-transitions L306-308)

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

❌ 全關 → 失去回饋
✅ 縮至 0.01ms → 即時但保留邏輯
