# 15 - Visual QA & Design System Governance

> 蒸餾自 webapp-testing Reconnaissance-then-action + pptx visual QA loop + doc-coauthoring Reader Testing + design-system-starter §Workflow

## Visual QA Loop(蒸餾自 pptx SKILL.md)

### 5-Step Reconnaissance Cycle

```
1. Generate(產出 UI 程式碼)
   ↓
2. Render to Screenshot(轉圖像 / 部署 / 啟動 dev server)
   ↓
3. Subagent Inspect(用 fresh subagent 檢視截圖)
   ↓
4. Identify Issues(對比 / 對齊 / 溢位 / 文字可讀性)
   ↓
5. Fix → Re-verify(修復後重跑 cycle,至少 1 次完整迴圈)
```

**Iron Laws**:
- 至少 1 次完整 cycle(generate → screenshot → subagent → fix → re-verify)
- Subagent 用 fresh instance(無 prior context bias)
- 比對 design spec(若有)或 visual reference image
- 多 viewport screenshot(320 / 768 / 1024 / 1440)

### Subagent 檢查清單
- [ ] 文字是否被截斷 / 溢位 container
- [ ] 元素是否重疊 / 對齊錯誤
- [ ] 顏色對比是否充足(WCAG)
- [ ] 圖示尺寸是否一致
- [ ] Hover / focus state 是否視覺明確
- [ ] Loading / Empty / Error state 是否設計
- [ ] Dark mode 是否單純 invert(應重新設計)
- [ ] Mobile responsive 是否實際在 320px viewport 測試

## Reconnaissance-then-Action(蒸餾自 webapp-testing)

> "Don't act blind — inspect first."

### Pattern
```
Static HTML
  └ Read HTML file → 識別 selectors → 寫 Playwright script

Dynamic Webapp
  └ 啟動 dev server(with_server.py)
    → page.goto(url) + wait_for_load_state('networkidle')
    → page.screenshot('inspect.png', full_page=True)
    → page.content() / page.locator(...).all()
    → 識別 selectors(從 rendered DOM)
    → 寫 actions(click / fill / wait)
    → 再 screenshot 驗證
```

### Black-box Scripts 哲學

webapp-testing 強調:
> "DO NOT read the source until you try running the script first and find that a customized solution is absolutely necessary. These scripts can be very large and thus pollute your context window."

**Iron Laws**:
- ✅ 用 `--help` 先看用法
- ✅ 直接呼叫腳本,不讀 source
- ❌ 預先 ingest 腳本 source 至 context(浪費 token)
- 適用範圍: 通用 / 黑盒工具(linter / formatter / build script)

### Common Pitfall
- ❌ Dynamic app 沒等 `networkidle` 就 inspect → 抓到未渲染 DOM
- ✅ `page.wait_for_load_state('networkidle')` 之後再 inspect

## Reader Testing with Fresh Claude(蒸餾自 doc-coauthoring Stage 3)

針對 UI / documentation / spec — 用無 context 的 fresh Claude 測試是否能讓「不知情讀者」理解。

### Steps
1. **Predict reader questions**(5-10 個)— 預測讀者會問什麼
2. **Test with sub-agent**: 用 Task tool 啟動 subagent,只給 UI screenshot 或文件內容 + 問題
3. **Run additional checks**:
   - 「有什麼模糊或不清楚?」
   - 「假設讀者已知什麼?」
   - 「有內部矛盾或不一致?」
4. **Report and fix**: 修復 subagent 抓到的問題,loop refinement

### Exit Condition
Subagent 連續答對問題且不再發現新 gap → 文件 / UI ready。

## WCAG 2.1 AA Audit Checklist(快速 35 點)

### Perceivable(可感知)
- [ ] 文字對比 4.5:1(normal)/ 3:1(large)
- [ ] 圖片有 `alt` 屬性
- [ ] 影片有 captions
- [ ] 不單靠顏色傳遞資訊
- [ ] 可調整字級至 200%(layout 不破)
- [ ] Image of text 避免(用真實文字)

### Operable(可操作)
- [ ] 鍵盤可達所有功能
- [ ] Focus indicator 視覺明顯
- [ ] 無 keyboard trap
- [ ] 動畫可暫停 / 停止(> 5 秒自動 cycle)
- [ ] Flash 頻率 < 3 次 / 秒(防癲癇)
- [ ] Skip link 提供
- [ ] Page title 描述性
- [ ] Focus order 邏輯
- [ ] Link 文字 descriptive(避免「click here」)
- [ ] 多種方式找到頁面(search / nav / sitemap)
- [ ] Heading 結構正確(h1 → h2 → h3)

### Understandable(可理解)
- [ ] Language attribute(`<html lang="zh-TW">`)
- [ ] 表單錯誤訊息明確
- [ ] Label 與 input 關聯
- [ ] 一致的 navigation 位置
- [ ] 一致的 component 命名

### Robust(穩健)
- [ ] HTML valid
- [ ] ARIA 正確使用
- [ ] Screen reader 測試通過(NVDA / VoiceOver)

### 額外(EAA 2025)
- [ ] Mobile a11y(VoiceOver / TalkBack 測試)
- [ ] Cognitive a11y(plain language / 圖示輔助)
- [ ] Time limit 可延長 / 關閉
- [ ] Auto-save 防失誤資料丟失
- [ ] 錯誤預防(刪除 / 提交前確認)

## Design System Governance

### Semver 版本策略

| 變更類型 | 版本 | 範例 |
|---|---|---|
| Bug fix | patch | 1.2.3 → 1.2.4 |
| 新增 component / variant(向後相容) | minor | 1.2.3 → 1.3.0 |
| Breaking change(prop 改名 / 移除) | major | 1.2.3 → 2.0.0 |

### Deprecation Strategy

```tsx
/**
 * @deprecated since v2.5.0, use <NewComponent> instead.
 * Removal target: v3.0.0
 */
export function OldComponent(props) {
  console.warn('OldComponent is deprecated, use NewComponent.');
  // ...
}
```

**Iron Laws**:
- Deprecated → 保留至少 1 個 major version
- 文檔標記 deprecated + alternative
- Runtime console warning(non-production)
- Migration guide 提供

### Migration Guide 4 部分
1. **Why**: 為何 deprecate
2. **What**: 新 component / API
3. **How**: 程式碼對照(before / after)
4. **Codemod**: 自動轉換工具(jscodeshift / babel plugin)

### Adoption Metrics

追蹤:
- 每 component 使用次數(grep 全 codebase imports)
- Deprecated component 殘留數量(target: → 0)
- Token coverage(% 使用 token vs hardcode 值)
- Cross-product consistency(同 component prop 是否一致)

### Audit Cycle
- 每月: 統計 metrics + 識別 hotspot
- 每季: Review token 是否需新增 / 移除
- 每年: Major version 規劃 + breaking change 評估

## 完整 Pre-Delivery Checklist(35 點)

詳見 SKILL.md § Pre-Delivery Checklist。涵蓋 Visual Quality(8)+ Interaction & States(5)+ Animation & Performance(4)+ Light/Dark Mode(5)+ Layout & Responsive(5)+ Forms & Async(3)+ Accessibility(5)。
