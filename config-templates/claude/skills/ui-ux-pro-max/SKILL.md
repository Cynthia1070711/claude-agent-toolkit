---
name: ui-ux-pro-max
version: 3.2.0
updated: 2026-06-04
description: "UI/UX design intelligence v3 — searchable BM25 database (50 styles / 21 palettes / 50 fonts / 20 charts / 9 stacks) + 18 deep references: v3 adds admin dashboard app-shell / page-templates / 3-layer design tokens (distilled from Adminator/Materio/deskapp MIT admin templates) on top of 49 facets from agent-skills / agent-toolkit / skills-main / aws-agent-skills toolkits. Triggers: admin app shell, 後台佈局, sidebar, topbar, 頁面模板, error page, 錯誤頁, 登入頁, 發票頁, pricing page, 訂閱方案頁, dashboard layout, 三層 token, scene token, 透明度梯度, 語意陰影, NAV manifest, dark mode 防閃, admin dashboard, typography, font pairing, glassmorphism, visual effects, view transition, tween, micro-interaction, easing, GPU animation, dark mode, color blindness, accessibility, WCAG, ARIA, responsive, hamburger, drawer, accordion, modal, tooltip, toast, breadcrumb, stepper, infinite scroll, batch operations, autocomplete, optimistic UI, chart linking, master-detail, AI-slop avoidance, visual QA audit, 視覺特效, 微互動, 無障礙, 深色模式, 響應式, 儀表板, 表單驗證, 內容溢位."
---

# UI/UX Pro Max v3 - Design Intelligence

Searchable database(BM25 引擎 + 9 CSV)+ **18 個深度 references** 涵蓋 49+ 設計面向。
**v3 新增**(2026-05-29 · 天璣閣蒸餾 Adminator/Materio/deskapp MIT admin 模板 · 取神捨形 + zh-TW 在地化):
- `references/16-admin-app-shell.md` — 後台應用殼層(slot 注入合約 / 3 態 sidebar / topbar frosted-glass / z-index 分層)
- `references/17-page-templates.md` — 頁面模板庫(error 脫殼 / auth split / invoice print-first / pricing 5 層 / profile · 對齊 PhyCool 登入/ECPay 發票/訂閱頁)
- `references/18-admin-engineering.md` — 後台工程範式(NAV manifest / early-paint 防閃 / Chart-CSS 橋接 / Settings 三態 / 縮排算法)
- `assets/design-system-templates/design-tokens-template.json` — 升級三層 token(system → scene → component)+ 5 層透明度梯度 + solid/soft 配對 + 主色感知語意陰影
- 蒸餾來源 + MIT attribution: [`assets/SOURCE.md`](assets/SOURCE.md) §v3 · 裁決: `docs/tianji/distillations/2026-05-29-ui-v3-admin-templates.md`

## 現成資源庫(assets/ 6.2MB,不消耗 token)

蒸餾自外部 4 toolkit 的**現成可直接使用資源**,放在 `assets/`。詳見 [`assets/SOURCE.md`](assets/SOURCE.md) license 與使用紀律。

| 觸發情境 | 資源路徑 | 用途 |
|---|---|---|
| 需要 distinctive 字體(避 Inter / Roboto / Arial) | `assets/canvas-fonts/` 80+ OFL TTF | Web `@font-face` / Print reportlab |
| Design Token JSON 起始 | `assets/design-system-templates/design-tokens-template.json` | W3C Design Tokens Format Module 標準 |
| 新 React component 起始 | `assets/design-system-templates/component-template.tsx` | TypeScript component 標準模板 |
| Button / FormField / Card / Modal / Input 實作 | `assets/design-system-component-examples.md` | 直接複製 TS 實作 |
| Design System Audit | `assets/design-system-checklists/design-system-checklist.md` | 95 點完整 a11y / token / component checklist |
| React 列表 / 動畫 / state / rendering 效能 | `assets/react-native-rules/` 38 個 rules .md | List perf 8 + Animation 3 + State 5 + Rendering 2 等(規則適用任何 React 環境) |
| React Native 完整參考 | `assets/react-native-AGENTS.md` 2119L | 完整 expanded version |
| View Transitions CSS 食譜 | `assets/view-transitions-references/css-recipes.md` | 直接 copy-paste 至 global stylesheet |
| View Transitions 實作 4-step workflow | `assets/view-transitions-references/implementation.md` | Audit → CSS → VT placement |
| View Transitions 進階 patterns | `assets/view-transitions-references/patterns.md` | events API / timing / troubleshooting |
| View Transitions 完整參考 | `assets/view-transitions-AGENTS.md` 711L | 完整 expanded version |
| p5.js 生成藝術 viewer | `assets/algorithmic-art-templates/viewer.html` | Anthropic branding viewer 起始模板 |
| p5.js 結構 | `assets/algorithmic-art-templates/generator_template.js` | Seeded randomness + parameter pattern |
| 10 預設主題色票 + 字體配對 | `assets/themes/` 10 個 + `theme-showcase.pdf` | 主題化專案直接套用 |
| React+Vite+Tailwind+shadcn artifact 建置 | `assets/web-artifacts-builder/init-artifact.sh` + `bundle-artifact.sh` | 一鍵 init + 打包 single HTML |
| Slack GIF builder | `assets/slack-gif-creator-core/` + requirements.txt | PIL GIF + validators + easing + frame composer |
| Playwright dev testing | `assets/webapp-testing-scripts/with_server.py` + `webapp-testing-examples/` | 多伺服器生命週期 + Reconnaissance-then-action 範例 |
| 需要某 UI 風格的**完整實作參考** | `styles/01-minimalism.html` ~ `styles/57-gen-z-chaos.html`(+ `index.html` 索引)= `data/styles.csv` STT 1-57 的完整 Tailwind landing page | 生成某風格頁前先 Read 對應 `styles/{NN}-*.html`,參考現成配色/排版/effects 落地實作,免從零生成省 token(STT 58 Biomimetic 無範例) |

**Iron Law**: 觸發對應情境時優先 `assets/` 與 `styles/` 現成資源,**禁** 重造輪子。

## 49 面向 → references 對應(觸發時依關鍵詞 Read 對應 ref)

| 觸發詞 | Reference |
|---|---|
| 排版 / 字體 / typography / spacing | `references/02-typography-layout.md` |
| 玻璃 / glassmorphism / 視覺特效 / bloom / aurora / gradient mesh / noise / mask | `references/05-visual-effects.md` |
| 補間動畫 / view transition / easing / micro-interaction / GPU 動畫 / crosshair | `references/06-animation-microinteractions.md` |
| 表單 / form / validation / autocomplete / AJAX / optimistic UI | `references/11-forms-validation-async.md` |
| 列表 / 表格 / 無限滾動 / 凍結表頭 / 拖放 / 批次操作 / 篩選 / master-detail | `references/12-list-table-pattern.md` |
| 抽屜 / 手風琴 / 對話框 / 吐司 / 麵包屑 / 進度條 / contextual help | `references/13-components-pattern.md` |
| 儀表板 / 看板 / 圖表連動 / chart-to-table / brush zoom | `references/14-dashboard-dataviz.md` |
| 無障礙 / a11y / WCAG / 色盲 / 深色模式優化 | `references/08-a11y-darkmode.md` |
| 響應式 / 漢堡選單 / mobile / breakpoint / container queries | `references/09-responsive-mobile.md` |
| W3C tokens / Atomic Design / 色彩系統 / visual hierarchy / density control | `references/01-design-foundations.md` |
| 風格設計 / tones / philosophies / themes | `references/04-visual-identity.md` |
| 溢位 / 邊界案例 / empty state | `references/03-overflow-edge-cases.md` |
| 架構 / SSR / CSR / RSC / Islands / 動態非動態 | `references/07-architecture-rendering.md` |
| 互動狀態 / inline editing / smart defaults | `references/10-interaction-states.md` |
| visual QA / audit / 治理 / reconnaissance / reader testing | `references/15-visual-qa-governance.md` |
| **admin app shell / 後台佈局 / sidebar / topbar / 殼層 / 3 態響應式 / z-index 分層** | `references/16-admin-app-shell.md` |
| **頁面模板 / error 錯誤頁 / 登入頁 auth / invoice 發票 / pricing 訂閱方案 / profile** | `references/17-page-templates.md` |
| **後台工程 / NAV manifest / dark mode 防閃 / Chart-CSS 橋接 / Settings 三態 / 導覽縮排** | `references/18-admin-engineering.md` |
| **三層 token / scene token / 透明度梯度 / solid+soft / 語意陰影** | `references/01-design-foundations.md` §三層 Token(v3) + `assets/design-system-templates/design-tokens-template.json` |

## ⚠️ Iron Law: Measure-Before-Match(量測先於比照 · v3.1.0 2026-05-30)

「**比照 / 對齊 / 統一 X**」類 UI 任務**禁止憑猜測連續盲改**(guess → 式錯 → 再猜 → 無限輪迴)。改前必**核查參考目標實際參數**,改後必**實測驗證對齊**。四步鐵律:

1. **核查參考目標**:Read 參考元件實際 CSS + Chrome MCP `evaluate_script` 取 `getComputedStyle`/`getBoundingClientRect` 實測值(font-size / padding / line-height / **container `display`(flex vs block!)** / border)。`var(--token)` 先確認**有無定義**(未定義 → background 退 transparent 透明卡片 bug)。
2. **列差異表**:參考 vs 待改逐項對照(屬性 | 參考值 | 待改值 | 差異)。
3. **精準改**:依差異表改,非猜。
4. **再實測驗證**:Chrome MCP 重測 `rectH`/`clipped`/`display` 確認對齊。無 Chrome MCP 時,也讀雙方實際碼 + computed 邏輯比對,**不憑視覺猜測**。

❌ **Forbidden**:同一視覺問題未實測就連續改 CSS。
   Common Rationalization:「看起來差不多,直接改 gap/padding 試試」/「應該是字體/間距問題」(未量測)
   Red Flag:同一問題連續 ≥ 2 輪改 CSS 仍未對齊,且 transcript 無 computed-value 比對 / 差異表 → 立即停,改走四步鐵律。

> **Incident 2026-05-30**:emergence `recent-list` 比照 `live-obs`,連 8+ 輪盲改(gap/mini-card/divider/字體)未對齊。真因 = `__items` 為 `display:flex` column + max-height → flex-shrink 壓扁 item 至 15px(content-clip)vs live-obs `__list` block 27px — **Chrome MCP 實測 computed display+rectH 才抓到**。See `memory/feedback_no_blind_edit_verify_against_reference.md` + `references/15-visual-qa-governance.md`(reconnaissance-then-action)。

---

## Prerequisites

Check if Python is installed:

```bash
python3 --version || python --version
```

If Python is not installed, install it based on user's OS:

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3
```

**Windows:**
```powershell
winget install Python.Python.3.12
```

---

## How to Use This Skill

When user requests UI/UX work (design, build, create, implement, review, fix, improve), follow this workflow:

### Step 1: Analyze User Requirements + Design Manifesto

Extract key information from user request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, etc.
- **Stack**: React, Vue, Next.js, or default to `html-tailwind`

**Design Manifesto 4 元素**(來自 frontend-design L13-19):
- **Purpose**: 此 UI 解決什麼問題?誰使用?
- **Tone**: 選一極端方向 — brutally minimal / maximalist chaos / retro-futuristic / organic / luxury / playful / editorial / brutalist / art deco / soft pastel / industrial
- **Constraints**: 技術需求(框架、效能、無障礙)
- **Differentiation**: 一個記憶點是什麼?讓這 UI **無法被遺忘**

Bold maximalism 與 refined minimalism 都可,關鍵是**意圖明確**而非強度。

### Step 2: Search Relevant Domains

Use `search.py` multiple times to gather comprehensive information. Search until you have enough context.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**Recommended search order:**

1. **Product** - Get style recommendations for product type
2. **Style** - Get detailed style guide (colors, effects, frameworks)
3. **Typography** - Get font pairings with Google Fonts imports
4. **Color** - Get color palette (Primary, Secondary, CTA, Background, Text, Border)
5. **Landing** - Get page structure (if landing page)
6. **Chart** - Get chart recommendations (if dashboard/analytics)
7. **UX** - Get best practices and anti-patterns
8. **Stack** - Get stack-specific guidelines (default: html-tailwind)

### Step 3: Stack Guidelines (Default: html-tailwind)

If user doesn't specify a stack, **default to `html-tailwind`**.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack html-tailwind
```

Available stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`

---

## Search Reference

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare, beauty, service |
| `style` | UI styles, colors, effects | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional, modern |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, beauty, fintech, service |
| `landing` | Page structure, CTA strategies | hero, hero-centric, testimonial, pricing, social-proof |
| `chart` | Chart types, library recommendations | trend, comparison, timeline, funnel, pie |
| `ux` | Best practices, anti-patterns | animation, accessibility, z-index, loading |
| `prompt` | AI prompts, CSS keywords | (style name) |

### Available Stacks

| Stack | Focus |
|-------|-------|
| `html-tailwind` | Tailwind utilities, responsive, a11y (DEFAULT) |
| `react` | State, hooks, performance, patterns |
| `nextjs` | SSR, routing, images, API routes |
| `vue` | Composition API, Pinia, Vue Router |
| `svelte` | Runes, stores, SvelteKit |
| `swiftui` | Views, State, Navigation, Animation |
| `react-native` | Components, Navigation, Lists |
| `flutter` | Widgets, State, Layout, Theming |

---

## Example Workflow

**User request:** "Làm landing page cho dịch vụ chăm sóc da chuyên nghiệp"

**AI should:**

```bash
# 1. Search product type
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --domain product

# 2. Search style (based on industry: beauty, elegant)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant minimal soft" --domain style

# 3. Search typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant luxury" --domain typography

# 4. Search color palette
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness" --domain color

# 5. Search landing page structure
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "hero-centric social-proof" --domain landing

# 6. Search UX guidelines
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "animation" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux

# 7. Search stack guidelines (default: html-tailwind)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack html-tailwind
```

**Then:** Synthesize all search results and implement the design.

---

## Tips for Better Results

1. **Be specific with keywords** - "healthcare SaaS dashboard" > "app"
2. **Search multiple times** - Different keywords reveal different insights
3. **Combine domains** - Style + Typography + Color = Complete design system
4. **Always check UX** - Search "animation", "z-index", "accessibility" for common issues
5. **Use stack flag** - Get implementation-specific best practices
6. **Iterate** - If first search doesn't match, try different keywords

---

## Common Rules for Professional UI

These are frequently overlooked issues that make UI look unprofessional:

### Icons & Visual Elements

| Rule | Do | Don't |
|------|----|----- |
| **No emoji icons** | Use SVG icons (Heroicons, Lucide, Simple Icons) | Use emojis like 🎨 🚀 ⚙️ as UI icons |
| **Stable hover states** | Use color/opacity transitions on hover | Use scale transforms that shift layout |
| **Correct brand logos** | Research official SVG from Simple Icons | Guess or use incorrect logo paths |
| **Consistent icon sizing** | Use fixed viewBox (24x24) with w-6 h-6 | Mix different icon sizes randomly |

### Interaction & Cursor

| Rule | Do | Don't |
|------|----|----- |
| **Cursor pointer** | Add `cursor-pointer` to all clickable/hoverable cards | Leave default cursor on interactive elements |
| **Hover feedback** | Provide visual feedback (color, shadow, border) | No indication element is interactive |
| **Smooth transitions** | Use `transition-colors duration-200` | Instant state changes or too slow (>500ms) |

### Light/Dark Mode Contrast

| Rule | Do | Don't |
|------|----|----- |
| **Glass card light mode** | Use `bg-white/80` or higher opacity | Use `bg-white/10` (too transparent) |
| **Text contrast light** | Use `#0F172A` (slate-900) for text | Use `#94A3B8` (slate-400) for body text |
| **Muted text light** | Use `#475569` (slate-600) minimum | Use gray-400 or lighter |
| **Border visibility** | Use `border-gray-200` in light mode | Use `border-white/10` (invisible) |

### Layout & Spacing

| Rule | Do | Don't |
|------|----|----- |
| **Floating navbar** | Add `top-4 left-4 right-4` spacing | Stick navbar to `top-0 left-0 right-0` |
| **Content padding** | Account for fixed navbar height | Let content hide behind fixed elements |
| **Consistent max-width** | Use same `max-w-6xl` or `max-w-7xl` | Mix different container widths |

---

## Pre-Delivery Checklist(35 點 v2)

### Visual Quality(8)
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent set (Heroicons/Lucide)
- [ ] Brand logos correct (verified from Simple Icons)
- [ ] Hover states don't cause layout shift
- [ ] Theme colors used directly (bg-primary)
- [ ] **Distinctive fonts**(避免 Inter/Roboto/Arial 預設, distinctive display + refined body pairing)
- [ ] **AI-slop avoidance**(非泛用紫漸層 / 非統一圓角 / 非居中佈局)
- [ ] **Breathing room**(canvas-design L108: nothing falls off page, no overlap)

### Interaction & States(5)
- [ ] All clickable elements have `cursor-pointer`
- [ ] Hover states provide visual feedback
- [ ] Transitions smooth (150-300ms)
- [ ] Focus states visible for keyboard navigation
- [ ] **5 狀態完整**(Loading / Empty / Error / Success / Disabled)

### Animation & Performance(4)
- [ ] **GPU-only properties**(transform/opacity, 非 width/height/top/left)
- [ ] **Reduced motion respected**(`@media (prefers-reduced-motion: reduce)`)
- [ ] View Transitions used appropriately(spatial relationship 才用)
- [ ] No layout shift (CLS < 0.1)

### Light/Dark Mode(5)
- [ ] Light mode text contrast 4.5:1 minimum
- [ ] Glass/transparent elements visible in light mode (≥80% opacity)
- [ ] Borders visible in both modes
- [ ] **Dark mode 重新設計而非反白**(語意非反色)
- [ ] Test both modes before delivery

### Layout & Responsive(5)
- [ ] Floating elements proper spacing from edges
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 320 / 768 / 1024 / 1440px
- [ ] No horizontal scroll on mobile
- [ ] **Touch target ≥ 44×44px**

### Forms & Async(3)
- [ ] **Inline validation timing**(onBlur for typed input, onChange for selects)
- [ ] **Optimistic UI** 或 Skeleton(非空白)
- [ ] Race condition handled(AbortController 取消舊請求)

### Accessibility(5)
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] **Color-blind safe palette**(Deuteranopia/Protanopia/Tritanopia)
- [ ] **ARIA + Focus trap + Skip Links**
