# 09 - Responsive Design & Mobile Patterns

> 蒸餾自 design-system-starter spacing + frontend-design L33 + react-native-skills `ui-safe-area-scroll`

## Breakpoints

| 裝置 | Min width | 對應 Tailwind |
|---|---|---|
| Mobile S | 320px | (預設) |
| Mobile L | 480px | `sm:` 640px |
| Tablet | 768px | `md:` 768px |
| Laptop | 1024px | `lg:` 1024px |
| Desktop | 1280px | `xl:` 1280px |
| Large | 1440px+ | `2xl:` 1536px |

## Mobile-First vs Desktop-First

**Mobile-first**(推薦):
```css
/* Base = mobile */
.card { padding: 16px; }

/* Progressive enhancement */
@media (min-width: 768px) { .card { padding: 24px; } }
@media (min-width: 1280px) { .card { padding: 32px; } }
```

優點:
- 預設樣式即 mobile(80%+ traffic)
- Min-width 漸進 → 不需 unset 屬性
- 與 utility CSS(Tailwind)契合

**Desktop-first**(legacy):
```css
.card { padding: 32px; }
@media (max-width: 1023px) { .card { padding: 24px; } }
@media (max-width: 767px) { .card { padding: 16px; } }
```

❌ 缺點: max-width 容易遺漏 / 不易維護

## Fluid Typography(clamp())

```css
/* fluid: 16px @ 320vw, 20px @ 1280vw */
h1 { font-size: clamp(1rem, 0.5rem + 1.5vw, 1.25rem); }
```

**公式**:`clamp(min, preferred, max)`
- preferred 用 `vw` 動態
- min/max 防止過小或過大

## Container Queries(現代 CSS)

不依賴 viewport,而依賴 **container width**:
```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }
}
```

適用:可重用元件,在不同 container 自動 adapt(不需傳 prop / 不需 viewport)。

支援: Chromium 105+ / Safari 16+ / Firefox 110+。

## Touch Targets

**Apple HIG / Material Design**:
- 最小 **44 × 44px**(Apple)/ **48dp**(Material)
- 相鄰 target 間距 ≥ 8px
- 觸碰區可大於視覺區(`padding` 或 `::before` 擴展)

```css
.icon-button {
  padding: 12px;       /* 視覺 24px 圖示 → 觸碰 48x48 */
  min-width: 44px;
  min-height: 44px;
}
```

## Safe Area(Mobile / iOS notch)

```css
.fixed-bottom-bar {
  padding-bottom: env(safe-area-inset-bottom);
}
.fixed-header {
  padding-top: env(safe-area-inset-top);
}
```

`viewport-fit=cover` meta 開啟 safe area inset。

## Mobile Navigation 漢堡選單佈局

### Pattern A: Hamburger → Drawer
```
[≡] Logo                 [Avatar]
─────────────────────────────────

(Tap ≡)
┌──────────────┐
│ Logo         │
│ ─────────    │
│ ▸ Home       │
│ ▸ Products   │
│ ▸ About      │
│ ▸ Contact    │
└──────────────┘
```

**Iron Laws**:
- 漢堡 ≥ 24×24px 圖示 + 44×44 觸碰
- Drawer 滑入動畫 300ms ease-out
- Backdrop click 關閉
- ESC 鍵關閉(若用 keyboard)
- Body `overflow: hidden` 防背景滾動

### Pattern B: Bottom Tab Bar(原生 app 風格)
```
─────────────────────────────────
[🏠]    [🔍]    [+]    [💬]    [👤]
 Home   Search  New    Chat   Me
```

- ≤ 5 個 tab(超過用 More)
- Tab 高度 ≥ 56px(觸碰友善)
- 當前 tab 視覺 distinct(顏色 + 圖示填充)
- Badge 用紅點 / 數字(不阻擋圖示)

### Pattern C: Sticky Top Tabs(Scroll-aware)
```
[≡] Logo
─────────────────────────────────
[Trending] [Latest] [Popular] [...]
─────────────────────────────────
```

Scroll 下滑時隱藏 / 上滑顯示(IntersectionObserver)。

## Responsive Layout Patterns

### Pattern A: Mostly Fluid
```css
.layout { max-width: 1280px; margin: 0 auto; padding: 0 16px; }
```
單欄漸進至 multi-column。

### Pattern B: Column Drop
```css
.layout { display: grid; grid-template-columns: 1fr; }
@media (min-width: 768px) { .layout { grid-template-columns: 2fr 1fr; } }
```
窄 → 單欄堆疊;寬 → 多欄。

### Pattern C: Layout Shifter
不同 viewport 完全不同 layout(Hamburger nav → Top tabs → Sidebar)。

### Pattern D: Off Canvas
```css
.sidebar { transform: translateX(-100%); }
.sidebar.open { transform: translateX(0); }
@media (min-width: 1024px) { .sidebar { transform: none; } }
```
Mobile 隱藏 → Desktop 常駐。

## 響應式表格

3 種策略:

| 策略 | 實現 | 適用 |
|---|---|---|
| **Horizontal Scroll** | `overflow-x: auto` + sticky first column | 資料密集 / 不可省略欄 |
| **Stack to Cards** | Mobile 用 `display: block` 每 row 變 card | < 10 row + 欄位多 |
| **Collapse Less-Important Columns** | Mobile 隱藏次要欄,desktop 顯示 | 中等資料量 |

## Image 響應式

```html
<picture>
  <source media="(min-width: 1024px)" srcset="hero-lg.webp" type="image/webp">
  <source media="(min-width: 768px)" srcset="hero-md.webp" type="image/webp">
  <img src="hero-sm.webp" alt="..." loading="lazy" decoding="async">
</picture>
```

格式優先:AVIF > WebP > JPEG/PNG(漸進降級)。

## Mobile-specific UX

- ❌ Hover-only feature(觸碰無法)→ 改 long press / two-tap
- ❌ 多層級 dropdown menu → 改 drill-down view
- ✅ Swipe gesture(swipe to delete / swipe to refresh)
- ✅ Pull-to-refresh(原生 app 範式)
- ✅ Haptic feedback(iOS / Android API)
- ✅ Keyboard-aware layout(input focus 時 viewport 調整)
