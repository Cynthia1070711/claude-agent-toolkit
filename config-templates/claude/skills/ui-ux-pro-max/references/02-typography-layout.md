# 02 - Typography & Layout Craft(排版與字體)

> 蒸餾自 design-system-starter L167-247 + frontend-design L30,33 + canvas-design L40-45,108

## Typography Tokens(5 維度)

```json
{
  "typography": {
    "fontFamily": {
      "sans": "'Inter', -apple-system, sans-serif",
      "serif": "'Georgia', 'Times New Roman', serif",
      "mono": "'Fira Code', 'Courier New', monospace"
    },
    "fontSize": {
      "xs": "0.75rem",   "sm": "0.875rem", "base": "1rem",
      "lg": "1.125rem",  "xl": "1.25rem",  "2xl": "1.5rem",
      "3xl": "1.875rem", "4xl": "2.25rem", "5xl": "3rem"
    },
    "fontWeight": { "normal": 400, "medium": 500, "semibold": 600, "bold": 700 },
    "lineHeight": { "tight": 1.25, "normal": 1.5, "relaxed": 1.75, "loose": 2 },
    "letterSpacing": { "tight": "-0.025em", "normal": "0", "wide": "0.025em" }
  }
}
```

## Font Pairing 方法論

**核心原則**(frontend-design L30):
- ❌ 避免 Inter / Roboto / Arial / 系統字體(AI-slop 預設)
- ❌ 避免 Space Grotesk(跨 generation 過度收斂)
- ✅ Distinctive display font + Refined body font 配對
- ✅ 字體有 character 而非泛用

**Pairing 策略**(5 類):

| 策略 | Display | Body | 適用 |
|---|---|---|---|
| **Editorial** | Serif heading | Sans body | 雜誌 / Blog |
| **Tech-forward** | Geometric sans | Mono body | SaaS / Dev tool |
| **Luxury** | Didone serif | Humanist sans | Beauty / High-end |
| **Playful** | Display script | Rounded sans | Kids / Game |
| **Brutalist** | Mono / Grotesque | Same family heavy | Editorial / Indie |

## Type Scale(Modular Scale)

**Golden ratio 1.618** / **Major third 1.25** / **Perfect fourth 1.333**:
- Base 16px
- 1.25 scale: 16 → 20 → 25 → 31 → 39 → 49 → 61
- 1.333 scale: 16 → 21 → 28 → 38 → 50 → 67

## Spatial Composition(來自 frontend-design L33)

避免「Generic AI 居中對稱」:
- **Asymmetry**: 70-30 / 60-40 split 而非 50-50
- **Overlap**: 卡片 / 圖層交疊製造深度
- **Diagonal flow**: 對角線視覺路徑
- **Grid-breaking**: 元素跨越網格線製造焦點
- **Generous negative space OR controlled density**(極端,非中庸)

## Information Architecture

### F-Pattern(內文 / Blog)
眼球軌跡: 上橫 → 中橫 → 左豎。重點放左上。

### Z-Pattern(Landing Page)
眼球軌跡: 左上 → 右上 → 左下 → 右下。CTA 放最後 Z 終點。

### Tufte Data-Ink Ratio
**Data-ink / Total ink → 最大化**。移除 chart junk:
- Grid lines 淡化
- Borders 移除
- Backgrounds 留白
- Labels 直接放資料旁(不用 legend)

## Breathing Room(canvas-design L108 核心紀律)

**Iron Law**: nothing falls off page, no overlap, breathing room everywhere.

執行檢查:
- 元素 ≥ 30px margin from container edge(draw-io §6.9 規則)
- 文字 line-height ≥ 1.5
- 段落間距 ≥ 1.5em
- Card padding ≥ spacing-6(24px)
- 視覺驗證: PNG / Screenshot 全頁掃描溢位
