# 12 - List & Table Patterns(列表與表格)

> 蒸餾自 react-native-skills list-performance 8 rules + design-system-starter

## Table Anatomy

```
┌─────────────────────────────────────────────────────────┐
│ ☐  Name ▴       Email           Plan       Created ▾   │  ← Header(sticky)
├─────────────────────────────────────────────────────────┤
│ ☐  Alan         alan@test.com   Pro        2026-05-19  │
│ ☐  Beth         beth@test.com   Basic      2026-05-18  │
└─────────────────────────────────────────────────────────┘
[1] 2 3 ... 12   |  顯示 1-25 / 共 287    |  [▼ 25/page]
```

## Numeric Alignment

```css
.cell-number {
  text-align: right;
  font-variant-numeric: tabular-nums;   /* 等寬數字 */
  font-family: var(--font-mono);        /* 或 mono 字體 */
}
```

**Iron Law**: 數字右對齊 + tabular-nums,文字左對齊。

## Sort Indicator

```tsx
<th onClick={() => toggleSort('name')}>
  Name {sortBy === 'name' && (sortDir === 'asc' ? '▴' : '▾')}
</th>
```

Multi-column sort: Shift + click 加第二排序鍵(顯示 1️⃣ 2️⃣ 標記)。

## Row Selection

| 模式 | 觸發 | 視覺 |
|---|---|---|
| **Single** | Click row | Highlight row |
| **Multi** | Checkbox | Header checkbox = select all current page |
| **Range** | Shift + Click | 連續區間 |
| **Toggle individual** | Ctrl/Cmd + Click | 非連續 |

**Bulk Actions Bar**(選取後顯示):
```
┌────────────────────────────────────────────┐
│ ✓ 已選 3 筆   [刪除] [匯出] [移至...] [取消] │
└────────────────────────────────────────────┘
```

Sticky 在 table 頂部或浮在 viewport 底部。

## Filter Panel(篩選面板)

### Pattern A: Toolbar Inline
```
[搜尋____] [類別 ▼] [狀態 ▼] [日期 ▼] [清除]
```

### Pattern B: Side Drawer
桌面右側 sticky drawer,mobile 全屏 modal。

### Pattern C: Filter Chips
```
搜尋: [關鍵字____]
已套用: [類別: SaaS ✕] [狀態: 活躍 ✕] [日期: 30 天內 ✕] [全部清除]
```

**Iron Laws**:
- 顯示已套用 filter 數量 + 一鍵清除
- Filter 變更時資料即時更新(`debounce` 200ms)
- Filter state 入 URL(`?category=saas&status=active`)→ 可分享 / 後退
- Empty result 顯示「無符合資料」+ 「放寬條件」CTA

## Sticky Headers & Columns(凍結)

### Sticky Header
```css
thead { position: sticky; top: 0; z-index: 10; background: var(--bg-primary); }
```

### Sticky First Column(橫向滾動表格)
```css
td:first-child, th:first-child {
  position: sticky;
  left: 0;
  background: var(--bg-primary);
  z-index: 5;
}
```

兩個 sticky 軸交叉時(top-left 角):
```css
thead th:first-child { z-index: 15; }
```

## Master-Detail View(主從式檢視)

3 種佈局:

### A. Split View(桌面)
```
┌────────────┬──────────────────┐
│ List       │ Detail           │
│ (1/3)      │ (2/3)            │
│ ☐ Item 1   │ Selected: Item 1 │
│ ☐ Item 2 ▸ │ ...              │
│ ☐ Item 3   │ ...              │
└────────────┴──────────────────┘
```

### B. Drill Down(mobile)
List 全屏 → tap item → push detail page → back 回 list

### C. Modal(中間佈局)
List 主要,detail 浮在 modal,適合輕量檢視。

**Iron Laws**:
- Split view 切換 detail 不重新 mount list(保留 scroll position)
- URL 同步當前選中(`/items/123`)
- Detail 載入失敗不破壞 list

## Density Control(密度控制)

3 模式:

| 模式 | Row height | 預設 |
|---|---|---|
| Compact | 32px | Power user / Admin |
| Comfortable | 40px | 預設 |
| Spacious | 56px | Touch / Casual |

User preference + persist。

## 無限滾動 / 虛擬化

### Infinite Scroll(IntersectionObserver)
```tsx
const { ref, inView } = useInView();
useEffect(() => {
  if (inView && hasNextPage) fetchNextPage();
}, [inView]);
return <div ref={ref}>{/* sentinel 在底部 */}</div>;
```

### Virtual List(TanStack Virtual)
```tsx
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 40,        // row 高
  overscan: 5,                   // 預載前後 5 row
});
```

**Iron Laws**(react-native-skills `list-performance-*` 8 rules):
1. **Virtualize**: 500+ 筆必虛擬化
2. **Memoize item**: `React.memo` + `useCallback`
3. **Stable callbacks**: 避免每 render 新建 function
4. **Avoid inline style objects**: `style={{...}}` 觸發 re-render
5. **Extract functions outside render**: 避免重建
6. **Optimize images**: lazy load + size hint
7. **Move expensive work outside items**: 計算 hoist 出 row
8. **Item types**: 異質 list 用 type hint 提升 recycle

## 拖放 Drag & Drop

### 三模式支援(a11y)

```tsx
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor),    // Mouse + Touch
  useSensor(KeyboardSensor)    // Space/Enter 拾起,Arrow 移動,Enter 放下,Esc 取消
);
```

### Drop Zone 高亮
```tsx
const { isOver, setNodeRef } = useDroppable({ id: 'zone1' });
<div ref={setNodeRef} className={isOver ? 'ring-2 ring-primary' : ''}>
```

### Ghost Preview
```tsx
<DragOverlay>{activeId ? <ItemCard {...activeItem} className="opacity-50 cursor-grabbing" /> : null}</DragOverlay>
```

### Iron Laws
- Drag handle 視覺明確(≡ 或 ⋮⋮ 圖示)+ `cursor: grab` / `cursor: grabbing`
- Drop target 變更 cursor + background highlight
- 失敗回滾(網路 / 衝突)
- 跨容器拖放支援
- 觸碰友善: long press 啟動拖放(避免誤觸)
- ESC 取消拖放
- 螢幕閱讀器宣告拖放狀態(`aria-grabbed` / `aria-dropeffect`,雖已 deprecated 但 dnd-kit 自帶 live region)
