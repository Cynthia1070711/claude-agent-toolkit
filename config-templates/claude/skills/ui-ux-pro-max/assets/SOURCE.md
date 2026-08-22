# Assets Source & License Attribution

> 本目錄 6.2MB 現成資源蒸餾自 4 個開源 toolkit,**直接複製不重造輪子**,不消耗 always-on token(全為 binary / 文檔 / scripts,按需 Read / 引用 / 執行)。

## 資源清單與來源

| 資源 | 來源 Toolkit | License | 用途 |
|---|---|---|---|
| **canvas-fonts/**(80+ OFL 字體)| skills-main/canvas-design | **OFL**(各字體 OFL.txt 附隨)| 通用 typography 設計時直接引用 TTF |
| **algorithmic-art-templates/**(viewer.html + generator_template.js)| skills-main/algorithmic-art | Proprietary(Anthropic skills-main LICENSE.txt)| p5.js 生成藝術 viewer 起始模板 |
| **themes/**(10 themes)+ **theme-showcase.pdf** | skills-main/theme-factory | Proprietary | 主題化專案直接套用 |
| **web-artifacts-builder/scripts/**(init-artifact.sh + bundle-artifact.sh)| skills-main/web-artifacts-builder | Proprietary | React+Vite+Parcel+Tailwind+shadcn artifact 一鍵建置 + 打包 |
| **slack-gif-creator-core/** + **requirements.txt** | skills-main/slack-gif-creator | Proprietary | PIL GIF builder + validators + easing + frame composer Python module |
| **webapp-testing-scripts/** + **webapp-testing-examples/** | skills-main/webapp-testing | Proprietary | Playwright with_server.py 多伺服器 + element_discovery / static_html / console_logging 範例 |
| **design-system-checklists/**(95 點)| agent-toolkit-main/design-system-starter | **MIT** | 完整 a11y / token / component audit 清單 |
| **design-system-templates/design-tokens-template.json** | agent-toolkit-main/design-system-starter | **MIT** + **W3C Design Tokens Format Module** standard | W3C 標準 token JSON 結構直接套用 |
| **design-system-templates/component-template.tsx** | agent-toolkit-main/design-system-starter | **MIT** | React TypeScript component 標準模板 |
| **design-system-component-examples.md** | agent-toolkit-main/design-system-starter | **MIT** | Button / FormField / Card(compound)/ Modal / Input 完整 TS 實作範例 |
| **react-native-rules/**(38 個 .md)| agent-skills-main/react-native-skills | **MIT** | List perf 8 + Animation 3 + UI 9 + State 5 + Rendering 2 + Monorepo 2 + Config 4 完整 rules |
| **view-transitions-references/**(css-recipes / implementation / nextjs / patterns)| agent-skills-main/react-view-transitions | **MIT** | View Transitions CSS 食譜 + 4-step audit workflow + 進階 patterns |
| **view-transitions-AGENTS.md**(711L)| 同上 | **MIT** | View Transitions 完整展開參考 |
| **react-native-AGENTS.md**(2119L)| agent-skills-main/react-native-skills | **MIT** | React Native skills 38 rules 完整展開參考 |

## v3 Admin 蒸餾來源（2026-05-29 · 天璣閣 GO）

UI v3 admin 能力（`references/16-admin-app-shell.md` / `17-page-templates.md` / `18-admin-engineering.md` + `design-tokens-template.json` 三層 token 升級）蒸餾自以下三個 **MIT** admin 模板的**設計智慧（神）**，非照搬程式碼（形已捨）。MIT 要求保留 copyright + permission notice：

| 來源模板 | License | Copyright | 蒸餾「神」 |
|---|---|---|---|
| **Adminator** admin dashboard | **MIT** | © 2018 Aigars Silkalns | App Shell grid / 3 態 sidebar / NAV manifest / early-paint 防閃 / Chart-CSS 橋接 / solid+soft token / frosted-glass overlay 值 |
| **Materio** MUI Next.js admin | **MIT** | © 2022 ThemeSelection | Slot 注入 App Shell 合約 / 5 層透明度梯度(8/16/24/32/38%) / scene token 層 / 主色感知語意陰影 / Settings 三態狀態機 / level-based 導覽縮排 |
| **deskapp** Bootstrap admin | **MIT** | © 2018 DeskApp | error 脫殼原則 / auth split + role selector / invoice print-first 佈局 / pricing 5 層資訊架構 / profile 範式 |

> 來源實體：`claude token減量策略研究分析/工作流/{Adminator-admin-dashboard-master, materio-mui-nextjs-admin-template-free-main, deskapp-master}`（各含 LICENSE）。
> 蒸餾裁決記錄：`docs/tianji/distillations/2026-05-29-ui-v3-admin-templates.md`（GO · take-rate 71% · 捨「形」MUI/Next.js/jQuery/gulp/BS4 框架綁定）。

## 標準規範對應

| 標準 | 資源 |
|---|---|
| **W3C Design Tokens Format Module** | `design-system-templates/design-tokens-template.json` |
| **WCAG 2.1 AA** | `design-system-checklists/design-system-checklist.md` §Accessibility |
| **ISO-IEC 29500-4:2016**(OOXML)| 在 `office-tools/scripts/{docx,xlsx,pptx}/office/schemas/` 已複製 |
| **SIL Open Font License 1.1** | `canvas-fonts/*-OFL.txt`(每字體附 license) |

## 使用紀律

### 字體使用(canvas-fonts/)
- ✅ 直接引用 TTF(80+ 個,涵蓋 sans / serif / mono / display / pixel)
- ✅ 字體選擇對齊 `references/02-typography-layout.md` § Font Pairing 5 策略
- ✅ Web 用 `@font-face` / Print 用 reportlab `pdfmetrics.registerFont(TTFont(...))`
- ❌ 移除字體 OFL.txt(各字體 OFL license 必須隨附)

### Component / Token 範本(design-system-*)
- ✅ 直接複製 `design-tokens-template.json` 至專案 → 改色 → 跑 Style Dictionary 產 CSS Variables
- ✅ `component-template.tsx` 作新 component 起始(複製 → 改名 → 改內容)
- ✅ `design-system-component-examples.md` Button / Card / Modal 直接複製 TS 實作至專案

### React Native Rules(react-native-rules/)
- ✅ PhyCool 純 Web 不直接用,但 **animation-gpu-properties / animation-derived-value / list-performance-* / react-state-* / rendering-* 規則適用任何 React 環境**
- ✅ 觸發效能 / 動畫 / list 問題時 Read 對應 rule .md

### View Transitions(view-transitions-references/)
- ✅ `css-recipes.md` 直接 copy-paste CSS 至 global stylesheet
- ✅ `patterns.md` 進階情境(events API / timing / troubleshooting)
- ⚠️ `nextjs.md` PhyCool 是 ASP.NET MVC + Razor,Next.js 章節**僅作概念參考**

### Artifact / GIF / Testing 工具(scripts/)
- ✅ 真正需要時複製 script + install 依賴(Node 18+ / Python venv / Playwright / PIL)
- ✅ Black-box 執行(`--help` first,**DO NOT read source**)
- ❌ 預先 install 全部依賴(YAGNI)

## License Compliance

PhyCool 是私有 SaaS 專案,引用這些資源時:

| License | 要求 |
|---|---|
| **MIT**(Vercel / agent-toolkit-main design-system-starter) | 保留 copyright notice + permission notice;商業使用 OK |
| **OFL**(canvas-fonts) | 字體本身可自由使用 / 嵌入 / 修改;**不可單獨販售字體檔**(嵌入 product 內可)|
| **Anthropic Proprietary**(skills-main) | "Complete terms in LICENSE.txt" — 本 toolkit 為 Anthropic 官方範本,建議僅作**內部參考 / 蒸餾學習**用途,不直接以原樣對外發布 |

**Iron Law**: 任何 production code 引用這些資源前,先確認 license 相容性 + 保留 attribution notice。
