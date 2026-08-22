# 05 - Visual Effects(視覺特效)

> 蒸餾自 frontend-design L34 全章 + 既有 styles.csv 50 styles 補方法論

## 1. Glassmorphism(玻璃效果)

```css
.glass {
  background: rgba(255, 255, 255, 0.7);   /* 重要: light mode ≥ 80% */
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
}

@supports not (backdrop-filter: blur(12px)) {
  .glass { background: rgba(255, 255, 255, 0.95); }  /* fallback */
}
```

**Iron Laws**:
- ❌ Light mode opacity < 80% → 文字對比不足 + 玻璃看不出
- ❌ Mobile / 低階裝置使用 backdrop-filter → GPU 開銷大,40 fps 以下卡頓
- ✅ 提供 `@supports not` fallback(Firefox < 103 不支援)
- ✅ Saturate(180%) 增強底層色彩穿透感

## 2. Neumorphism / Soft UI

```css
.neumorphic {
  background: #e0e5ec;
  box-shadow: 9px 9px 16px #a3b1c6, -9px -9px 16px #ffffff;
  border-radius: 20px;
}
```

❌ a11y 風險: 對比不足,WCAG 通常 fail。慎用,或加文字 outline。

## 3. Claymorphism

```css
.claymorphic {
  background: #6c5ce7;
  border-radius: 30px;
  box-shadow:
    inset 0 -8px 0 rgba(0, 0, 0, 0.15),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3),
    0 35px 60px -15px rgba(0, 0, 0, 0.3);
}
```

## 4. Skeuomorphism / Flat Design

對立兩極:
- **Skeuomorphic**: 模擬實體(紙質 / 木紋 / 金屬反光)— iOS 6 之前
- **Flat**: 純色 + 無陰影 — Material Design 之前

## 5. Brutalism

```css
.brutalist {
  background: #fff;
  border: 4px solid #000;
  box-shadow: 8px 8px 0 #000;   /* 偏移實心陰影 */
  font-family: 'Courier New', monospace;
  text-transform: uppercase;
}
```

## 6. Gradient Mesh(漸層網格)

```css
.gradient-mesh {
  background:
    radial-gradient(at 0% 0%, hsla(280, 100%, 70%, 0.5) 0%, transparent 50%),
    radial-gradient(at 100% 0%, hsla(180, 100%, 70%, 0.5) 0%, transparent 50%),
    radial-gradient(at 50% 100%, hsla(340, 100%, 70%, 0.5) 0%, transparent 50%);
}
```

進階: SVG / Canvas / WebGL 動態網格(Stripe / Linear landing page)。

## 7. Noise Texture / Grain Overlay

```css
.noise::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
  pointer-events: none;
}
```

## 8. Bloom / Glow / Halo

```css
.glow {
  filter: drop-shadow(0 0 20px #00ffaa) drop-shadow(0 0 40px #00ffaa);
}

.text-glow {
  text-shadow: 0 0 10px currentColor, 0 0 20px currentColor;
}
```

## 9. Aurora / Northern Lights

```css
@keyframes aurora {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.aurora {
  background: linear-gradient(120deg, #84fab0, #8fd3f4, #a8edea, #fed6e3);
  background-size: 400% 400%;
  animation: aurora 15s ease infinite;
}
```

## 10. Particle System

JS(Canvas)+ requestAnimationFrame:
- 粒子有 x/y/vx/vy/life/color
- 每幀 update + draw
- 限制粒子數 < 500(mobile)/ < 2000(desktop)
- 用 `pointer-events: none` 不阻擋互動

## 11. Bento Grid

```css
.bento {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 200px;
  gap: 16px;
}
.bento-large { grid-column: span 2; grid-row: span 2; }
.bento-wide { grid-column: span 2; }
.bento-tall { grid-row: span 2; }
```

不對稱尺寸製造視覺節奏(Apple WWDC / Linear landing 範式)。

## 12. SVG Filters / Mask / Clip-path

```css
/* Mask: 用圖像 / SVG 切割 */
.masked {
  mask-image: url(shape.svg);
  -webkit-mask-image: url(shape.svg);
}

/* Clip-path: 幾何切割 */
.clipped { clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%); }

/* SVG filter: 變形 / 模糊 / displacement */
<filter id="goo"><feGaussianBlur stdDeviation="10"/><feColorMatrix values="..."/></filter>
```

## 13. Layered Transparencies / Dramatic Shadows / Decorative Borders / Custom Cursors

frontend-design L34 列舉的 13 種視覺細節層次:
- **Layered transparencies**: 多層 rgba 疊加製造深度
- **Dramatic shadows**: `box-shadow: 0 50px 100px -20px rgba(...)` 戲劇感
- **Decorative borders**: `border-image` + SVG pattern
- **Custom cursors**: `cursor: url(...)` 主題化

## Performance 紀律

GPU-accelerated only:
- ✅ `transform` / `opacity` / `filter`(部分)
- ❌ `width` / `height` / `top` / `left` / `margin`(觸發 layout reflow)

`will-change`:
- 大物件 animation 前加 `will-change: transform`
- ❌ 不要全頁 `* { will-change: transform }`(浪費 GPU 記憶體)
- 動畫結束移除 `will-change`
