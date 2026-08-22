# 10 - Interaction & States(互動回饋與五狀態)

## 5 大狀態(Loading / Empty / Error / Success / Disabled)

### 1. Loading State

3 種選擇:

| 種類 | 適用 | 範例 |
|---|---|---|
| **Spinner** | < 2 秒 等待 / 不知進度 | 按鈕 inline spinner |
| **Skeleton** | 已知 layout / 可預測 | 列表 / Card / Detail page |
| **Progress bar** | 已知百分比 / 多步驟 | 上傳 / Multi-step form |
| **Optimistic UI** | 高機率成功 + 可回滾 | Like / Comment / Inline edit |

**Iron Laws**:
- ❌ 空白頁 + spinner(predictable layout 用 skeleton)
- ❌ Skeleton 動畫 frenetic(用慢 pulse 不要 spin)
- ✅ Skeleton 形狀 mimic 真實內容(寬窄 + 行數)
- ✅ Progress 不可倒退(永遠遞增,不確定就 indeterminate)

### 2. Empty State

詳見 `references/03-overflow-edge-cases.md` § Empty States。

3 種空狀態(first-time / no-result / error)各自設計 — CTA 引導 next action。

### 3. Error State

層級:
- **Page-level**(整頁失敗): 友善 illustration + retry + 客服 CTA
- **Form-level**: Inline 錯誤訊息 + ⚠ 圖示 + 紅色 + aria-live
- **Field-level**: 即時 inline validation(onBlur 或 onChange)
- **Toast**(暫態錯誤): 短訊息 + 自動消失 / dismiss

**錯誤訊息原則**:
1. 友善語氣(不威脅 / 不指責)
2. 說明發生什麼 + 為何 + 下一步
3. 不暴露技術細節(stack trace 隱藏在 console / log)
4. 提供恢復路徑(retry / 改參數 / 客服)

❌ 「Error 500: Internal Server Error」
✅ 「載入時遇到問題,稍後再試一次,或聯絡客服」

### 4. Success State

- **Toast**(輕量): 3-5 秒自動消失,綠色 + ✓
- **Inline confirmation**(欄位儲存): ✓ 圖示 + 「已儲存」短訊
- **Page-level**(完成關鍵流程): 慶祝 illustration + 下一步 CTA
- **Particle burst / confetti**(高情感時刻): 訂閱成功 / 解鎖成就(慎用,過度會煩)

### 5. Disabled State

**Iron Laws**:
- ❌ 同色僅變淡 → 看不出 disabled
- ✅ Opacity 0.5 + cursor: not-allowed + 移除 hover effect
- ✅ 加 `aria-disabled="true"` 或原生 `disabled` attribute
- ❌ 不可作 informative text 顏色(WCAG 4.5:1 fail)
- ✅ 提示為何 disabled(tooltip:「請先填寫 Email」)

## Hover / Active / Focus 狀態

### Hover
```css
.button {
  transition: background-color 200ms, transform 200ms;
}
.button:hover {
  background-color: var(--color-primary-700);
  /* ❌ 不要 transform: scale(1.05) 觸發 layout shift */
}
```

### Active(按下瞬間)
```css
.button:active {
  transform: scale(0.98);   /* 微縮反饋 */
  transition: transform 50ms;
}
```

### Focus(鍵盤導航)
```css
.button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.button:focus:not(:focus-visible) {
  outline: none;   /* 滑鼠 click 不顯示 outline */
}
```

`focus-visible` 區分鍵盤 vs 滑鼠 focus,避免滑鼠用戶看到 outline。

## Cursor 樣式

| 狀態 | cursor |
|---|---|
| Default | `default` |
| 可點擊 | `pointer` |
| 文字選取 | `text` |
| 可拖動 | `grab` / `grabbing`(active) |
| 可調整尺寸 | `ew-resize` / `ns-resize` / `nwse-resize` |
| Loading | `wait` |
| Disabled | `not-allowed` |
| 不可選 | `default` + `user-select: none` |

## Inline Editing(行內編輯)

```tsx
const [isEditing, setEditing] = useState(false);
const [value, setValue] = useState(initial);

isEditing ? (
  <input
    autoFocus
    value={value}
    onChange={e => setValue(e.target.value)}
    onBlur={save}
    onKeyDown={e => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    }}
  />
) : (
  <span onClick={() => setEditing(true)} className="cursor-text">
    {value}
  </span>
)
```

**Iron Laws**:
- Click 進入編輯 + Enter / Tab / Blur 儲存 + Esc 取消
- Optimistic update(立即顯示新值)+ 失敗回滾
- 顯示 dirty indicator(•)直到儲存完成
- 鍵盤可達(Tab 進入 + Space / Enter 編輯)

## Smart Defaults(智慧預設值)

預填表單減少使用者輸入:

| 情境 | Smart default |
|---|---|
| 國家 | 依 GeoIP 偵測 |
| 語言 | 依瀏覽器 `Accept-Language` |
| 時區 | 依 `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| 貨幣 | 依國家對應 |
| 數量 | 上次選擇 / 最常選擇 |
| 日期 | 今天 / 下個工作日 |
| 收件人 | 上次選擇 / 最近聯絡 |

**Iron Laws**:
- 預設值必可改(不強迫)
- 預設值錯誤代價低(不可預填高風險選項如「刪除帳號」)
- 顯示預設來源(「依您的位置」)增加信任

## Micro-interactions(微互動)

frontend-design L32 警示:**集中式 vs 分散式**。

❌ 50 個小 hover 動畫 → 雜訊
✅ 一個 page load 動畫做到完美 + 關鍵時刻(成功 / 錯誤 / 進場)有 surprise

**值得做微互動的時刻**:
- 表單欄位 focus(平滑 border highlight)
- 按鈕點擊(scale 0.98 + ripple)
- Toggle / Switch 切換(spring 動畫)
- Notification badge 增減(pulse)
- Star / Like 點擊(particle burst)
- Drag handle hover(slight scale + cursor change)

**不值得做的**:
- 每個 list item 都 hover scale
- 每個 div 都有 enter animation
- 滾動 trigger 過多 reveal(雜訊)
