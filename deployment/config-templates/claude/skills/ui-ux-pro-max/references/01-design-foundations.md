# 01 - Design Foundations(設計基礎)

> 蒸餾自 design-system-starter SKILL.md L100-491 + frontend-design L29-34

## W3C Design Tokens(雙層結構)

**Layer 1: Primitive Colors**(50-950 階,11 個 stops)
```json
{
  "color.primitive.blue": {
    "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe",
    "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6",
    "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af",
    "900": "#1e3a8a", "950": "#172554"
  }
}
```

**Layer 2: Semantic Tokens**(語義 = primitive 引用)
```json
{
  "color.semantic": {
    "brand.primary": "{color.primitive.blue.600}",
    "brand.primary-hover": "{color.primitive.blue.700}",
    "text.primary": "{color.primitive.gray.900}",
    "text.secondary": "{color.primitive.gray.600}",
    "text.tertiary": "{color.primitive.gray.500}",
    "text.disabled": "{color.primitive.gray.400}",
    "background.primary": "{color.primitive.white}",
    "background.secondary": "{color.primitive.gray.50}",
    "feedback.success": "{color.primitive.green.600}",
    "feedback.warning": "{color.primitive.yellow.600}",
    "feedback.error": "{color.primitive.red.600}"
  }
}
```

**Spacing Scale**(4/8 base): 0/1/2/3/4/5/6/8/10/12/16/20/24 → rem 0/0.25/0.5/0.75/1/1.25/1.5/2/2.5/3/4/5/6

**Border Radius**: none/sm/base/md/lg/xl/2xl/full → 0/2/4/6/8/12/16/9999px

**Shadows**: xs/sm/base/md/lg/xl → 漸進 elevation

## Atomic Design 5 層

```
Atoms → Molecules → Organisms → Templates → Pages
```

| 層級 | 範例 | 規則 |
|---|---|---|
| **Atoms** | Button / Input / Label / Icon / Badge / Avatar | 不可再拆 |
| **Molecules** | SearchBar (Input+Button) / FormField (Label+Input+Error) | Atoms 組合 |
| **Organisms** | Navbar / Product Grid / Modal Dialog | Molecules + Atoms |
| **Templates** | Dashboard Layout / Marketing Page | 結構但無真實內容 |
| **Pages** | 實例化 Templates 加真實資料 | |

## Visual Hierarchy(視覺層級)

3 層文字對比階級:
- **Primary**(AAA contrast ≥ 7:1)— 主要內容
- **Secondary**(AA contrast 4.5:1)— 輔助說明
- **Disabled / Tertiary**(僅 disabled state,不可作 informative text)

**Dominant color 60-70%**(frontend-design L31): timid evenly-distributed palettes < dominant + sharp accents

**Spatial weight**:
- 大字 / 粗體 / 對比強 → 高權重
- F-pattern(內文)/ Z-pattern(landing) 閱讀引導
- Negative space 比裝飾更有力

## Density Control(密度控制)

3 種密度模式:

| 模式 | Padding | Row height | 適用 |
|---|---|---|---|
| **Compact** | 4-8px | 32px | 資料密集表格 / Admin / Pro user |
| **Comfortable** | 8-12px | 40px | 預設 |
| **Spacious** | 12-16px | 56px | Touch / Casual user / Marketing |

切換機制: User preference + persist in localStorage / DB(per-user setting)。

## Color Blindness 安全色票

3 種主要色盲類型(占人口 8% 男性 / 0.5% 女性):
- **Deuteranopia**(綠色盲): 紅綠混淆 → 避免 green/red 對比作 indicator
- **Protanopia**(紅色盲): 同上
- **Tritanopia**(藍色盲): 藍黃混淆,罕見

**對策**:
1. 永不單靠顏色傳遞資訊(加圖示 / 文字 / pattern)
2. 安全色票範式: Blue + Orange(高對比,所有色盲類型可區分)
3. 工具驗證: Stark / Sim Daltonism / WhoCanUse
4. Color-blind safe palette: 用 ColorBrewer 的 sequential / diverging schemes

**WCAG 對比**:
- Normal text(< 18pt): 4.5:1 最小
- Large text(≥ 18pt 或 14pt bold): 3:1 最小
- UI components / graphics: 3:1 最小

---

## 三層 Token 體系（v3 · 蒸餾自 Materio/Adminator MIT admin 模板）

> v2 原有 primitive → semantic 兩層。v3 補 admin dashboard 必備的**第三層（scene）** + 透明度梯度 + solid/soft + 語意陰影。完整 JSON 見 `assets/design-system-templates/design-tokens-template.json`（已升級）。

**三層架構**：
```
primitive (原始色階 gray-50~950 / blue-50~950 …)
   ↓ 引用
semantic  (brand/text/background/border/feedback + scene)
   ↓ 引用
component (button/card/input padding/radius/shadow)
```

**新增第三層重點（admin dashboard 必備）**：

| 概念 | 內容 | 來源（MIT）|
|---|---|---|
| **scene token** | bodyBg / cardBg / sidebarBg / hoverBg / tableHeaderBg / inputBorder / trackBg / tooltipText / overlay — 介於 semantic 與 component 之間的「應用場景」層 | Materio `colorSchemes.ts:153-161` |
| **5 層透明度梯度** | 8% / 16% / 24% / 32% / 38% — 用於 hover tint / soft 背景 / 選中 / active。用法 `rgb(var(--color-{name}-rgb) / {alpha})` | Materio `colorSchemes.ts:8-15` |
| **solid + soft 配對** | 每語意色 = solid（文字/圖示）+ soft（背景 tint）。dark mode soft 須**獨立調校**非 solid 加深 | Adminator `_tokens.scss:29-48` |
| **主色感知語意陰影** | xs/sm/md/lg/xl 五級，陰影色用**主色 RGB channel**（非固定黑），dark mode alpha 加重 | Materio `customShadows.ts:1-13` |

**Iron Laws**：① admin 元件背景用 scene token（非直接 primitive）② 狀態 tint 用透明度梯度（非另開色）③ badge/alert/tag 用 solid+soft 配對 ④ 陰影用語意別名（禁散落 box-shadow 值）。詳 admin 應用見 `references/16-admin-app-shell.md`。
