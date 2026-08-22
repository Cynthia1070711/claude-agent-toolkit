# 03 - Overflow & Edge Cases(溢位與邊界案例)

> 蒸餾自 canvas-design L106-108(Iron Law)+ draw-io §6.9 + react-native-skills list-perf

## Iron Law(canvas-design L108)

> **"Nothing falls off the page and nothing overlaps. Every element must be contained within the canvas boundaries with proper margins."**

執行紀律(來自 draw-io §6.9):
- 元素 ≥ **30px margin** from container edge
- 強制 PNG / Screenshot 視覺驗證
- 邊框 stroke width 不算 inner content area

## 6 種溢位類型 + 處置

| 類型 | 範例 | 處置 |
|---|---|---|
| **Text overflow** | 中文超長標題 / Email 地址 | `text-overflow: ellipsis` + `overflow: hidden` + `white-space: nowrap`;Multi-line 用 `-webkit-line-clamp: N` + `display: -webkit-box` |
| **Container overflow** | List 撐爆 sidebar | `overflow-y: auto` + max-height;不用 `overflow: scroll`(永遠顯示) |
| **Grid overflow** | Card 撐破 grid cell | `min-width: 0` on grid item(預設 `min-width: auto` 會撐爆) |
| **Flex overflow** | Flex children 不縮 | `min-width: 0` + `flex-shrink: 1` |
| **Image overflow** | 大圖撐破容器 | `object-fit: cover / contain` + `max-width: 100%` |
| **Modal overflow** | 內容超過視窗高度 | `max-height: 90vh` + `overflow-y: auto`;Body `overflow: hidden` lock scroll |

## Truncate / Ellipsis / Expand 模式

### 模式 A: 純截斷(無互動)
```css
.truncate-single { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.truncate-multi { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
```

### 模式 B: Hover 展開 tooltip
- 純 CSS: `:hover` 觸發絕對定位 tooltip
- 進階: Floating UI(positioning + collision detection)

### 模式 C: Click 展開
- 「Show more」按鈕切換 `-webkit-line-clamp: 3 ↔ unset`
- 平滑過渡: `max-height` transition(避免 height auto 無法 transition)

## Empty States(空白狀態頁)

**3 種 empty 來源**:
1. **First-time use**(尚未建立任何資料)→ 引導 CTA + 圖示 + 範例
2. **Filter / Search no result** → 提示放寬條件 + 重設 filter 按鈕
3. **Error state**(網路 / 權限)→ 錯誤訊息 + 重試 + 客服 CTA

**Empty State 4 元素**:
- 圖示 / Illustration(64-128px,非emoji)
- 主標題(問題或狀態,非威脅性語氣)
- 副說明(為何空 + 下一步)
- CTA 按鈕(primary action)

**範例**:
```
[圖示: 空文件夾]
還沒有任何訂單
建立第一筆訂單,系統會自動產生發票
[+ 建立訂單]
```

## 資料量邊界案例

| 資料量 | 處理 |
|---|---|
| **0 筆** | Empty state |
| **1 筆** | 不展示分頁 / sort 控制 |
| **2-50 筆** | 一般渲染,不需虛擬化 |
| **50-500 筆** | Pagination 或 Lazy load |
| **500-5000 筆** | 虛擬化(TanStack Virtual / react-window)+ Server-side filter / sort |
| **5000+ 筆** | Server-side everything + Cursor pagination + 進階篩選器 |

## 網路 / Offline / 慢網路邊界

- **慢網路**(< 1 Mbps): Skeleton + 漸進載入(thumbnail → full)+ 不阻塞 UI
- **Offline**: Service Worker cache + IndexedDB queue + reconnect 重送
- **Connection lost mid-action**: AbortController + 顯示重試 CTA + 不 silent drop user input

## Touch vs Mouse 邊界

- Hover-only feature 在 touch 裝置必有替代(long press / tap 兩次)
- Touch target ≥ **44×44px**(Apple HIG)
- Hover-dependent tooltip → 改為 tap-to-toggle
- Drag handle 必須 ≥ 8px wide + visible
