# 13 - Components Pattern Library(元件模式庫)

## 抽屜 Drawer

### Pattern A: Off-Canvas(Mobile)
```tsx
<Drawer open={open} side="left" onClose={close}>
  <Drawer.Header>標題 [✕]</Drawer.Header>
  <Drawer.Body>內容</Drawer.Body>
  <Drawer.Footer>動作</Drawer.Footer>
</Drawer>
```

### Pattern B: Persistent Sidebar(Desktop)
```
┌─────┬──────────────────────┐
│ Nav │ Main content         │
│     │                      │
│ ▸   │                      │
│ ▸   │                      │
└─────┴──────────────────────┘
```

Collapsible: 寬度 240 ↔ 64px(僅圖示)。

### Iron Laws
- Slide-in 動畫 300ms ease-out(transform: translateX)
- Backdrop click 關閉 + ESC 關閉 + Focus trap
- Body `overflow: hidden` lock scroll(僅 mobile / overlay 模式)
- 上一次 collapsed 狀態 persist(localStorage)

## 手風琴 / 摺疊面板 Accordion

```tsx
<Accordion type="single" collapsible>
  <Accordion.Item value="1">
    <Accordion.Trigger>標題 1 ▾</Accordion.Trigger>
    <Accordion.Content>內容 1</Accordion.Content>
  </Accordion.Item>
  <Accordion.Item value="2">
    <Accordion.Trigger>標題 2 ▾</Accordion.Trigger>
    <Accordion.Content>內容 2</Accordion.Content>
  </Accordion.Item>
</Accordion>
```

### 兩種行為
- `type="single"`: 僅一個展開(類 radio)
- `type="multiple"`: 多個可同時展開(類 checkbox)

### Iron Laws
- 展開 / 收起平滑 transition(`max-height` + ease)
- 圖示 rotate 180°(`▾` ↔ `▴`)
- `aria-expanded="true"` / `aria-controls="content-id"`
- 鍵盤 Enter / Space toggle
- Deep link 支援(`?expanded=2`)

## 對話框 / Modal

### 3 種尺寸 / 行為

| Modal | 適用 |
|---|---|
| **Alert / Confirm** | 確認破壞性操作(刪除 / 取消訂閱) |
| **Form Modal** | 簡單編輯 / 創建(不需要全頁) |
| **Drawer**(side modal) | 中等複雜編輯 / 預覽 |
| **Full page**(takeover) | 複雜流程(multi-step) |

### Iron Laws
- ESC 關閉 + Backdrop click 關閉(危險操作可禁 backdrop click)
- Focus trap(Tab 不跳出)
- 開啟時 focus 移至第一互動元素
- 關閉時 focus 還原至觸發按鈕
- Body scroll lock(`overflow: hidden` 或 `react-remove-scroll`)
- Z-index hierarchy(對齊 `phycool-design-system` z-index 14 層)
- Multi-modal stacking(對齊 `phycool-floating-ui` Bootstrap 5 stacking pattern)

## 氣泡窗 / Tooltip / Popover

### Tooltip(輔助說明)
- 純文字提示
- Hover / Focus 觸發
- 自動消失(無 click 互動)
- 短文字(< 20 字)

### Popover(內容容器)
- 含豐富內容(form / list / image)
- Click 觸發
- Dismiss: 點外部 / ESC / 內部 close 按鈕
- 可包含互動元素

### Positioning(用 Floating UI)
```tsx
import { useFloating, autoUpdate, flip, shift, offset } from '@floating-ui/react';

const { refs, floatingStyles } = useFloating({
  placement: 'top',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});
```

**Iron Laws**:
- Collision detection(避免超出 viewport,自動 flip)
- 觸碰裝置: long press 觸發 tooltip(或改用 popover)
- ARIA: tooltip 用 `role="tooltip"` + `aria-describedby`;popover 用 `role="dialog"` + `aria-labelledby`
- PhyCool 平台特定行為見 `phycool-tooltip` skill

## 吐司訊息 / Toast / Notification

```tsx
toast.success('已儲存', { duration: 3000 });
toast.error('儲存失敗', { duration: 5000, action: { label: '重試', onClick: retry } });
toast.promise(savePromise, { loading: '儲存中...', success: '已儲存', error: '失敗' });
```

### Iron Laws
- 位置: 桌面右下 / 行動裝置頂部(避擋 navigation)
- 持續: 成功 3 秒 / 錯誤 5 秒 / 帶 action 7 秒 / persistent(危險錯誤)
- 堆疊: 最多 3 個同時,超過排隊
- Dismiss: ✕ 按鈕 / 滑動(swipe)/ 自動消失
- ARIA: `aria-live="polite"`(成功) / `aria-live="assertive"`(錯誤)
- 不可承載「需要使用者讀完」的訊息(改用 modal)

## 麵包屑導航 Breadcrumb

```tsx
<Breadcrumb aria-label="麵包屑">
  <Breadcrumb.Item href="/">首頁</Breadcrumb.Item>
  <Breadcrumb.Separator>/</Breadcrumb.Separator>
  <Breadcrumb.Item href="/products">產品</Breadcrumb.Item>
  <Breadcrumb.Separator>/</Breadcrumb.Separator>
  <Breadcrumb.Item current>SaaS 訂閱</Breadcrumb.Item>
</Breadcrumb>
```

### Iron Laws
- 當前項不可點 + `aria-current="page"`
- 太長時折疊中段(首 1 + 「...」+ 末 2)
- 分隔符可用 `/` `›` `>`(一致即可)
- 與 Site map 邏輯一致(URL 結構反映層級)

## 進度條 / 步驟條 Progress / Stepper

### Linear Progress Bar
```tsx
<Progress value={progress} max={100} />
```

確定 % vs 不確定(indeterminate spinner)。

### Stepper(多步驟流程)
```
[✓ Step 1] ── [● Step 2] ── [○ Step 3] ── [○ Step 4]
   完成         當前          未完成
```

**Iron Laws**:
- 顯示總步數 + 當前位置
- 完成 ✓ / 當前 ● / 未完成 ○(不同視覺)
- 可選: 允許跳回已完成步驟
- Mobile: 用 dot indicator 或縮減為「Step 2 / 4」

## 導航 Navigation

### Pattern A: Top Navbar
```
[Logo]  [Products] [Pricing] [Docs] [Blog]      [Sign in] [Try]
```

Sticky / Floating / Inline 三種。

### Pattern B: Side Sidebar(Admin)
```
[Logo]
─────
🏠 Dashboard
📊 Analytics
👥 Users
⚙ Settings
─────
[Avatar]
```

Collapsible to icon-only(寬 240 ↔ 64px)。

### Pattern C: Tab Navigation
- Top tabs(主要分頁)
- Bottom tabs(mobile 主要 nav)
- Inline tabs(局部切換)

### Iron Laws
- Current tab/page 視覺 distinct(顏色 + underline / fill)
- `aria-current="page"`
- Keyboard: Tab 切換 + Arrow keys(tab 列表)
- 不可超過 7 ± 2 個 top-level items(Miller's Law)

## 圖示 Icons & Visual Assets

### 圖示一致性
- 同一專案 1 個 icon library(Heroicons / Lucide / Phosphor / Tabler — 選一)
- 同一 viewBox(通常 24x24)
- 同一 stroke width(1.5 / 2 / 2.5)
- 同一 corner radius(rounded 或 square)

### 圖示尺寸對應
| Context | Size |
|---|---|
| Inline text | 16px |
| Button icon | 16-20px |
| Standalone icon button | 20-24px |
| Hero / Empty state | 64-128px |

### 圖示風格選擇(一專案僅一)
- **Outline / Stroke**: 細線,modern / minimal
- **Filled / Solid**: 實心,bold / prominent
- **Duotone**: 雙色,設計感重
- **Hand-drawn**: 手繪,playful / friendly

## Contextual Help(情境式說明)

### 4 種模式

| 模式 | 觸發 | 適用 |
|---|---|---|
| **Tooltip**(? icon) | Hover / Focus | 簡短解釋(< 20 字) |
| **Inline Helper Text** | 常駐 | 表單欄位下方提示 |
| **Coach Mark**(spotlight) | 首次使用 | 漸進引導(highlight 元素 + arrow) |
| **Tour**(多步驟) | 主動觸發 / 首次 | 完整功能介紹 |

### Iron Laws
- 不在每個元素都加 helper text(雜訊)
- Coach mark 可 skip + 「不再顯示」
- Tour 可暫停 + 隨時退出
- Help center 連結放穩定位置(右下角 ? 或 settings menu)
- Helper text 用次要色彩 + 小字(secondary text style)
