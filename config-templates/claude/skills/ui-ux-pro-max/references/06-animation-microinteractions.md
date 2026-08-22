# 06 - Animation & Micro-interactions(補間動畫與微互動)

> 蒸餾自 vercel-react-view-transitions 全 321L + slack-gif-creator L137-213 + react-native-skills animation rules + frontend-design L32

## Part A: React View Transitions(補間動畫核心)

> Animate between UI states using browser's native `document.startViewTransition`. Declare *what* with `<ViewTransition>`, trigger *when* with `startTransition` / `useDeferredValue` / `Suspense`, control *how* with CSS classes.

### When to Animate(5 priority patterns)

| Priority | Pattern | 表達什麼 |
|---|---|---|
| 1 | **Shared element**(`name`) | "Same thing — going deeper" |
| 2 | **Suspense reveal** | "Data loaded" |
| 3 | **List identity**(per-item `key`) | "Same items, new arrangement" |
| 4 | **State change**(`enter`/`exit`) | "Something appeared/disappeared" |
| 5 | **Route change**(layout-level) | "Going to a new place" |

> **每個 `<ViewTransition>` 必表達 spatial relationship 或 continuity**。表達不清楚 → 不加。

### Choose Animation Style

| Context | Animation | 為何 |
|---|---|---|
| Hierarchical(list → detail) | Type-keyed `nav-forward` / `nav-back` | 表達 spatial depth |
| Lateral(tab → tab) | Bare VT(fade)或 `default="none"` | 無 depth |
| Suspense reveal | `enter`/`exit` string props | Content arriving |
| Revalidation / background refresh | `default="none"` | Silent |

❌ **Reserve directional slides for hierarchical only**(lateral 用方向滑動 = 暗示假深度)

### Core API

```jsx
import { ViewTransition } from 'react';

// Type-keyed directional
<ViewTransition
  enter={{ 'nav-forward': 'slide-from-right', 'nav-back': 'slide-from-left', default: 'none' }}
  exit={{ 'nav-forward': 'slide-to-left', 'nav-back': 'slide-to-right', default: 'none' }}
  share={{ 'nav-forward': 'morph-forward', default: 'morph' }}
  default="none"
>
  <Page />
</ViewTransition>

// Trigger
startTransition(() => {
  addTransitionType('nav-forward');
  router.push('/detail/1');
});
```

### Critical Placement Rule

```jsx
// ✅ Works
<ViewTransition enter="auto" exit="auto">
  <div>Content</div>
</ViewTransition>

// ❌ Broken — div wraps VT,suppresses enter/exit
<div>
  <ViewTransition enter="auto" exit="auto">
    <div>Content</div>
  </ViewTransition>
</div>
```

### Shared Element Morph

```jsx
// View A: list thumbnail
<ViewTransition name={`photo-${id}`}>
  <img src="/thumb.jpg" />
</ViewTransition>

// View B: detail full
<ViewTransition name={`photo-${id}`}>
  <img src="/full.jpg" />
</ViewTransition>
```

**Iron Laws**:
- 同時只能一個 mounted VT 使用相同 `name`(用 `photo-${id}` 確保唯一)
- `share` 優先於 `enter`/`exit` — 規劃每條 navigation path 的 fallback
- 共享 morph 頁面禁用 fade-out exit(用 directional slide 代替)

### CSS Pseudo-Elements

```css
::view-transition-old(.class) { animation: slide-out 0.3s; }
::view-transition-new(.class) { animation: slide-in 0.3s; }
::view-transition-group(.class) { ... }
::view-transition-image-pair(.class) { ... }
```

### Composing Shared + List Identity

```jsx
{items.map(item => (
  <ViewTransition key={item.id}>                              {/* 外: list identity */}
    <Link href={`/items/${item.id}`}>
      <ViewTransition name={`item-image-${item.id}`} share="morph">  {/* 內: shared */}
        <Image src={item.image} />
      </ViewTransition>
    </Link>
  </ViewTransition>
))}
```

### `default="none"` Liberally

不加 → 每次 transition 都 fire browser cross-fade(Suspense / useDeferredValue / 背景 revalidation)。**Always use `default="none"` + 明確列舉允許 triggers**。

### router.back() / popstate

不觸發 VT(synchronous 不相容)。用 `router.push()` + explicit URL。

### Nested VT Limitation

Parent VT exit 時,nested 不 fire 自己的 enter/exit。Per-item staggered animation during page nav 尚不支援(react#36135 實驗 fix)。

### Browser Support

- Chromium 111+ / Firefox 144+ / Safari 18.2+
- Graceful degradation(不支援即跳過動畫)
- Reduced motion: 全頁加 `references/css-recipes.md` 的 reduced motion CSS

## Part B: 7 Easing Functions(slack-gif-creator L137-148)

```js
const easings = {
  linear:      t => t,
  ease_in:     t => t * t,
  ease_out:    t => 1 - (1 - t) ** 2,
  ease_in_out: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  bounce_out:  t => /* bounce 公式 */,
  elastic_out: t => /* elastic 公式 */,
  back_out:    t => /* overshoot 公式 */,
};
```

對應 CSS:
- `ease-in`(加速進場)→ Slide in / Fade in
- `ease-out`(減速出場)→ Slide stop / Fade out
- `ease-in-out`(對稱)→ State toggle
- `cubic-bezier(0.34, 1.56, 0.64, 1)` → back_out 範式

**Iron Law**: Transition 必有 easing,**禁用 linear**(機械感)。

## Part C: 8 Animation Concepts(slack-gif-creator L162-213)

| 概念 | 實現 | 用例 |
|---|---|---|
| **Shake / Vibrate** | `math.sin` 振盪 x/y position | Error feedback |
| **Pulse / Heartbeat** | scale 0.8↔1.2 sin 波 | Notification badge |
| **Bounce** | `ease_in` fall + `bounce_out` land | Drop indicator |
| **Spin / Rotate** | `rotate(angle)` linear or sin | Loading spinner / refresh |
| **Fade In/Out** | alpha 0↔1 | Modal / Tooltip enter |
| **Slide** | translate from off-screen + `ease_out` | Drawer / Toast |
| **Zoom** | scale 0.1↔2.0 | Modal open / Image preview |
| **Particle Burst** | 多粒子放射狀擴散 + gravity + fade | Success celebration |

## Part D: GPU 動畫紀律(react-native-skills `animation-gpu-properties`)

僅動畫:
- ✅ `transform`(translate / scale / rotate)
- ✅ `opacity`
- ✅ `filter`(部分)

禁止動畫:
- ❌ `width` / `height` / `top` / `left` / `margin` / `padding` → 觸發 layout reflow,< 60 fps
- ❌ `color` / `background-color` → 觸發 paint(可動但較慢,謹慎用)

範例:
```css
/* ❌ 慢 */
.slow { transition: width 0.3s; }
.slow:hover { width: 200px; }

/* ✅ 快 */
.fast { transition: transform 0.3s; transform: scaleX(0.5); }
.fast:hover { transform: scaleX(1); }
```

## Part E: 高 impact 時刻 + 微互動(frontend-design L32)

> Focus on **high-impact moments**: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

**選擇集中而非分散**:
- 一個 page load 動畫做到極致(staggered: 100ms / 200ms / 300ms 依序進場)
- 比 50 個微小 hover 動畫更有記憶點
- Scroll-triggered + hover surprise

## Part F: Reduced Motion(WCAG)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

❌ 不可完全移除動畫(失去回饋)→ ✅ 縮短至 0.01ms 等於即時切換

## Part G: Crosshair / 十字準線

Dashboard / 圖表 hover 互動:
```js
chart.on('mousemove', (e) => {
  // 垂直線 + 水平線追蹤滑鼠
  crosshairV.style.transform = `translateX(${e.x}px)`;
  crosshairH.style.transform = `translateY(${e.y}px)`;
});
```

Iron Law: Crosshair 用於 data viz,**禁止**用於一般 UI(過於工程化)。
