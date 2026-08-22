# 07 - Architecture & Rendering Patterns(前後端架構)

> 蒸餾自 design-system-starter L283-460 + react-native-skills state/rendering rules

## Atomic Design 落地 component 樹

```
Atoms (Button/Input/Label)
  ↓
Molecules (SearchBar = Input + Button)
  ↓
Organisms (Navbar = Logo + Menu + UserMenu + SearchBar)
  ↓
Templates (DashboardLayout = Sidebar + Header + Main)
  ↓
Pages (UserDashboard = DashboardLayout 填真實資料)
```

## Component API 4 Best Practices

### 1. Predictable Prop Names
```tsx
// ✅ Good — 一致
<Button variant="primary" size="md" />
<Input variant="outlined" size="md" />

// ❌ Bad — 各說各話
<Button type="primary" sizeMode="md" />
<Input style="outlined" inputSize="md" />
```

### 2. Sensible Defaults
```tsx
// ✅ 多數情況不需傳 prop
interface ButtonProps {
  variant?: 'primary' | 'secondary';  // default: primary
  size?: 'sm' | 'md' | 'lg';           // default: md
  children: ReactNode;
}
```

### 3. Composition Over Configuration
```tsx
// ✅ Composable
<Card>
  <Card.Header><Card.Title>標題</Card.Title></Card.Header>
  <Card.Body>內容</Card.Body>
  <Card.Footer>動作</Card.Footer>
</Card>

// ❌ Prop 爆炸
<Card title="標題" content="內容" footerContent="動作"
      hasHeader={true} hasFooter={true} />
```

### 4. Polymorphic Components
```tsx
// 同元件 render 不同 HTML 標籤
<Button as="a" href="/login">Login</Button>
<Button as="button" onClick={handleClick}>Click</Button>
```

## Rendering 模式對照(動態 vs 非動態)

| 模式 | 何處 render | 載入時刻 | 適用 |
|---|---|---|---|
| **SSG**(Static Site Generation) | Build time | Build → CDN | Blog / Docs / Marketing |
| **SSR**(Server-Side Rendering) | Request time(server) | 每次 request | 動態內容 + SEO |
| **CSR**(Client-Side Rendering) | Browser(JS) | Hydrate after load | SPA / Admin / 不需 SEO |
| **ISR**(Incremental Static Regeneration) | Build + 定時更新 | CDN + revalidate | Mostly static + 偶爾更新 |
| **RSC**(React Server Components) | Server(streaming) | 漸進 streaming | 大量資料 + 零 JS bundle |
| **Islands**(Astro / Fresh) | Static + 局部 hydrate | 僅互動部分 hydrate | 內容為主 + 少量互動 |

**選擇邏輯**:
- SEO + 動態 → SSR / ISR
- SEO + 完全靜態 → SSG
- 純 Dashboard / Admin → CSR(無 SEO 需求)
- 大量 server data + 少量互動 → RSC / Islands

## State Management 階層

| 層級 | 工具 | 適用 |
|---|---|---|
| **Local component state** | `useState` | 純 UI(modal open / hover / input value) |
| **Shared cross-component** | Context / Zustand / Jotai | UI 主題 / 用戶 session / 表單 multi-step |
| **Server state** | TanStack Query / SWR | API data + cache + revalidation |
| **URL state** | Router params / search params | Filter / Sort / Pagination(可分享 URL) |
| **Form state** | React Hook Form / Formik | 複雜表單 + validation |

**Iron Laws**(react-native-skills `react-state-minimize`):
- ❌ 同一 state 既存 Zustand 又存 useState(雙 SSoT 漂移)
- ❌ Server state 放 useState(失去 cache / refetch)
- ❌ URL-shareable 狀態放 Zustand(失去 deep link)

## Theming 3 Approaches

### A. CSS Variables(推薦,跨框架)
```css
:root {
  --color-bg: #ffffff;
  --color-text: #000000;
}
[data-theme="dark"] {
  --color-bg: #1a1a1a;
  --color-text: #ffffff;
}
```

### B. Tailwind Dark Mode
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

### C. ThemeProvider(Styled Components / Emotion)
```tsx
<ThemeProvider theme={isDark ? darkTheme : lightTheme}>
```

選擇:
- 多框架 / SSR + CSR 混合 → A
- Tailwind only → B
- CSS-in-JS heavy → C

## Component Documentation Template

每元件文件:
- **Purpose**: 做什麼
- **Usage**: import + 基本範例
- **Variants**: 視覺風格列舉
- **Props**: 完整 prop 表(type / default / description)
- **Accessibility**: 鍵盤 / ARIA / 螢幕閱讀器
- **Examples**: 常見使用情境

工具: Storybook / Docusaurus / Ladle

## 4 階段 Design System Workflow

1. **Design Phase**: Audit existing → Define tokens → Component inventory → Figma library
2. **Development Phase**: Storybook + TS + tokens → Atoms first → Compose upward → Document as you go
3. **Adoption Phase**: Migration guide → Codemods → Workshops → Feedback loop
4. **Maintenance Phase**: Semver → Deprecation strategy → Changelog → Adoption metrics
