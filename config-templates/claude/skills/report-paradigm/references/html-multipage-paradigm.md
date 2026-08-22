# HTML 報告多頁架構範式(2026-05-26 確立 · 使用者裁定 · 走 ui-ux-pro-max)

> 遷移自原 `.claude/rules/doc-consolidation-discipline.md` §3 #4 子彈點(2026-06-06 rule→skill)。
> 適用:報告 HTML 過大時分頁 + 共用程式碼抽離;新報告體系首建 HTML 即走此架構。

## 標準結構

```
<任務報告資料夾>/
├── 00-總計畫-<任務>.html          ← 根目錄唯一 HTML 入口(index)
└── report-assets/
    ├── css/report.css             ← 共用樣式(DRY:取最完整頁為 base + superset 各頁 unique class)
    ├── js/report.js               ← 共用腳本(nav / scroll-spy / theme toggle)
    └── pages/                     ← 所有子章節 HTML
        ├── 01-<章節>.html
        └── ...
```

## 鐵則

1. **根目錄只留 `00-總計畫(index)` 一個 HTML 入口**;其餘全收 `report-assets/pages/`。
2. **禁各 HTML 內嵌重複 `<style>`/`<script>`**(必抽共用檔,~95% 重複 CSS 抽離)。
   - 實證:2026-05-26 實施報告 5 HTML 各內嵌 ~170 行重複 CSS + 單頁 1291 行過大 → 觸發本範式。
3. **相對路徑規範**:子頁引用 `../css/report.css` + `../js/report.js`;index 引用 `report-assets/...`;跨頁導航(gnav)相對路徑:子頁→index `../../<index>.html`,子頁→子頁同層檔名。
4. **跨檔章節導航**:每頁提供「返回總計畫 + 切換各章節」。

## 圖表(Mermaid)

- 甘特圖 / 依賴圖用 **Mermaid CDN**(`mermaid@11` esm):`<pre class="mermaid">` + `startOnLoad` init。
- **只在需要的頁載入**(如 index 加 `<script type="module">` 載入),非全站。
- **離線 fallback**:CDN 失敗時顯示原始碼(`<pre>` 內容本身可讀)。
- Mermaid 標籤避免未引號的特殊字元(Greek 字母 / 括號 → 用引號包裹或改 ASCII)。

## 移檔注意(血淚教訓)

子頁從根目錄移入 `pages/` 須**真移動非複製**:
- 刪根目錄原檔,避免重複殘留。
- 刪前先驗 `pages/` 版內文完整 + 連結正確。
- 實證:2026-05-26 子代理曾「複製非移動」→ 根目錄殘留重複版本,雙版 drift。

## 視覺風格 SSoT

- 風格範本檔:`claude token減量策略研究分析/_HTML風格範式.html`(雙主題 light/dark + 3 字體 + 元件清單 + theme-toggle script;複製為起點)。
- 校正報告體系落地實例:`docs/tracking/active/phycool資訊校正任務/校正報告/`(00-index 根 + report-assets/{css,js,pages})。
- 設計細節(配色 / 字體配對 / 特效 / a11y)查 `ui-ux-pro-max` skill。

## 範例 + SSoT

- `claude token減量策略研究分析/實施報告/`(00 index 根 + report-assets/{css,js,pages})— 首個落地範例。
- `docs/tracking/active/phycool資訊校正任務/校正報告/` — 校正任務落地(雙總覽 + 60+ 子頁)。
