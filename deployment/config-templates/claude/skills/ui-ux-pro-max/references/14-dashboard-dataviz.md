# 14 - Dashboard & Data Visualization(儀表板與資料視覺化)

> 蒸餾自 draw-io §5.4 6 種 diagram type + 既有 charts.csv 20 chart types

## Dashboard Layout 3 Patterns

### Pattern A: Grid + Cards
```
┌─────────────┬─────────────┐
│ KPI Card    │ KPI Card    │
│ 數值大       │ 數值大       │
├──────┬──────┴────────┬────┤
│ Chart│  Big Chart    │Side│
│      │               │bar │
├──────┴───────────────┴────┤
│ Table / Activity log     │
└──────────────────────────┘
```

CSS Grid + responsive breakpoints:
```css
.dashboard {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.kpi { grid-column: span 3; }
.chart-big { grid-column: span 8; }
.sidebar { grid-column: span 4; }
.table { grid-column: span 12; }

@media (max-width: 768px) {
  .kpi, .chart-big, .sidebar, .table { grid-column: span 12; }
}
```

### Pattern B: Bento Grid(現代)
不對稱尺寸製造視覺節奏(詳見 `references/05-visual-effects.md` § Bento)。

### Pattern C: Split View(Master-Detail)
左側 list / nav + 右側 detail dashboard(詳見 `references/12-list-table-pattern.md` § Master-Detail)。

## KPI Card 4 元素

```
┌────────────────────────┐
│ 本月營收 (icon)     ⓘ │   ← Label + tooltip
│ NT$ 1,234,567          │   ← 主數值(大,tabular-nums)
│ ↑ 12.5% vs 上月        │   ← Trend(綠/紅 + 圖示)
│ ──╱─╲╱──╲──╱──         │   ← Sparkline(小趨勢)
└────────────────────────┘
```

**Iron Laws**:
- Label 用 secondary text + 必要時 tooltip 解釋
- 主數值用 tabular-nums + 大字(2xl ~ 4xl)
- Trend 比較期間明示(vs 上月 / 上週 / 同期去年)
- Trend 漲跌語意:綠↑ 紅↓(若漲是壞事如「客訴量↑」,反過來)
- Sparkline 可省略,但加上增加 context

## Chart 選擇邏輯

詳見 `references/11-forms-validation-async.md` § 資料視覺化選擇邏輯。

## Chart Linking / Synchronized Charts(圖表連動)

### Crosshair 同步
```tsx
const [hoverX, setHoverX] = useState(null);

<LineChart onHover={x => setHoverX(x)} crosshairX={hoverX} />
<BarChart onHover={x => setHoverX(x)} crosshairX={hoverX} />
// 兩圖共享 X 軸 hover,user 滑過一圖時兩圖同時高亮對應點
```

### Brush 同步
一圖 brush(框選範圍)→ 其他圖 zoom 對應範圍。

### Filter 同步
一圖 click data point → 其他圖 filter 至該 segment。

**Iron Laws**:
- 同步機制必雙向(任一圖觸發,所有圖回應)
- 同步狀態可 reset(「清除選擇」按鈕)
- URL 同步 brush / filter 範圍(可分享 / deep link)

## Chart-to-Table Toggle(圖表↔表格切換)

```tsx
const [view, setView] = useState<'chart' | 'table'>('chart');

<Toggle value={view} onChange={setView}>
  <Toggle.Item value="chart">📊 圖表</Toggle.Item>
  <Toggle.Item value="table">▦ 表格</Toggle.Item>
</Toggle>

{view === 'chart' ? <Chart data={data} /> : <Table data={data} />}
```

**Iron Laws**:
- a11y: 螢幕閱讀器永遠可達表格資料(`aria-hidden` 切換)
- 表格版包含相同資料 + 加上原始數值(圖表抽象,表格精確)
- 兩 view 共享相同 filter / sort state
- 預設 view 依據資料量:< 50 筆預設圖表,≥ 50 筆預設表格

## Brush / Zoom Slider(縮放滑桿)

```
┌──────────────────────────────────────┐
│ ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲                │   ← 主圖
└──────────────────────────────────────┘
[────━━━━━━━━━━━━────]                  ← Brush(下方時間軸)
   Jan         May        Dec
```

**Iron Laws**:
- Brush 顯示 overview / mini chart 在下方
- 主圖隨 brush 範圍動態 zoom
- 拖動兩端 handle 調整範圍
- 拖動中段平移
- Double-click brush 重置至全範圍
- 觸碰裝置: 兩指 pinch zoom

## Tooltip / Crosshair on Charts

### Tooltip 內容
```
─────────────────
2026-05-19
─────────────────
● 營收     NT$ 12,345
● 訂單     56 筆
─────────────────
```

**Iron Laws**:
- 跟隨滑鼠 + collision detect(不超出 chart 邊界)
- 多 series 同時顯示(按 X 軸對齊)
- Sort tooltip lines 按數值降序 / 按 series 固定順序
- Format 數字 / 日期 / 貨幣 i18n

### Crosshair Lines
- 垂直線追隨 X 軸 hover
- 水平線可選(連續資料,如散點圖)
- 對齊 grid lines

## 6 種 Diagram Type(架構視覺化,draw-io §5.4)

| Diagram | 用途 |
|---|---|
| **Context Diagram** | 系統外部視角 — 外部 actor + system boundary |
| **System Diagram** | 主要 components + 關係 |
| **Component Diagram** | 技術細節 + 整合點 |
| **Deployment Diagram** | 基礎設施配置(server / DB / network) |
| **Data Flow Diagram** | 資料流動 + 轉換 |
| **Sequence Diagram** | 時間序列互動 |

**漸進揭露原則**: 從 Context → System → Component 階段性深入,避免一張圖塞所有細節。

## Real-time Dashboard

### 更新策略

| 更新頻率 | 機制 |
|---|---|
| 每秒 | WebSocket / SignalR push |
| 每 5-30 秒 | Polling(短期) |
| 每分鐘 | Polling(長期) |
| 每小時 / 每天 | 手動 refresh / scheduled batch |

### Iron Laws
- 自動 refresh 必有「暫停」開關(避免 user 閱讀時被打斷)
- Refresh 不重置 user 互動狀態(filter / scroll / selected row)
- 顯示「最後更新時間」+ 倒數至下次
- 失敗 silent retry,連續 3 次失敗才顯示錯誤
- WebSocket 斷線 fallback 至 polling(對齊 `phycool-signalr-realtime` 30 秒 polling fallback)

## 資料密度 Density Control

對齊 `references/01-design-foundations.md` § Density Control。Dashboard 提供 Compact / Comfortable / Spacious 三模式切換。

## Empty / Error / Loading State

詳見 `references/10-interaction-states.md`。Chart 特殊處理:
- Empty: 顯示「無資料」插畫 + 篩選條件提示
- Error: 顯示錯誤 + retry 按鈕(不破壞 dashboard layout)
- Loading: Skeleton(矩形 placeholder for chart area)

---

## Admin Dashboard Widget 具體 DOM 範式（v3 · 蒸餾自 Adminator/deskapp/Materio MIT 模板）

> 上方 KPI Card 4 元素為**方法論**；以下補 admin 應用層的**具體 DOM 組合範式**（B 象限細節強化）。

### widget-style3 資訊原子（deskapp `index.html:715-728`）
三件式：**數值（font-24/700 tabular-nums）+ 標籤（font-14 secondary）+ 圖示（動態染色）**。admin dashboard 最小資訊單位。

### mini-sparkline 比例智慧（Adminator `_dashboard.scss` + deskapp `index.html:800-849`）
彩色 card-box 角落嵌小 sparkline — **圖表退輔助、數字為主角**。比例：數值區 ≥ 70% / sparkline ≤ 30% 視覺權重。

### 趨勢排行列表（Materio SalesByCountries widget）
帶趨勢箭頭（↑success / ↓error 色）的排行列表 — `頭像/icon + 主文 + 副文 + 趨勢 pill`。對齊 §KPI Card Trend 漲跌語意（綠↑紅↓，壞指標反過來）。

### 圖表配色連接（強制）
所有 widget 圖表配色**讀 CSS 變數**（`var(--primary)` / scene `--track-bg`），禁 hardcode。當週/重點 bar 用 primary，其餘用 track-bg。MutationObserver 主題切換 re-render — 見 `references/18-admin-engineering.md` §3。

> **Iron Law**：admin widget 用三層 token（見 ref-01 §三層 Token）+ scene token 背景，0 hex 硬編碼。完整 app-shell 組裝見 `references/16-admin-app-shell.md`。
