# 11 - Forms / Validation / Async Data UX

## Form Field Layout

### Label 位置(3 種)

| 位置 | 優點 | 缺點 | 適用 |
|---|---|---|---|
| **Top** | 掃描快 / 多語適配好 / mobile 友善 | 縱向空間多 | 推薦預設 |
| **Left** | 緊湊 / 桌面對齊整齊 | 多語 label 長度不同對齊難 | 桌面 admin 表單 |
| **Float**(在 input 內動) | 節省空間 | a11y 風險 / 高難度實作 | 行動 app 高密度 |

### Label 內容
- 必填用 `*`(紅色)或 `(optional)`(灰色)— 二擇一,不混用
- 不用 placeholder 取代 label(輸入後消失,認知負擔)
- Helper text 在 label 下 / input 下(說明格式 / 限制 / 範例)

## Inline Validation Timing

```tsx
// onChange: 即時(每按鍵)— 適合 password strength
<input onChange={e => validatePasswordStrength(e.target.value)} />

// onBlur: 離開欄位驗證 — 推薦預設(避免使用者邊打邊看錯誤)
<input onBlur={e => validateEmail(e.target.value)} />

// onSubmit: 整體提交 — 最後一道
const handleSubmit = (e) => { validate全部(); }
```

**Iron Laws**:
- 文字輸入用 `onBlur`(不打斷思路)
- Select / Checkbox / Radio 用 `onChange`(無打字過程)
- Password strength 即時(`onChange` debounce 200ms)
- 提交後再次驗證(server-side authoritative)

## Error Message 位置

```
Label
[Input]
⚠ Error message(下方,紅色,aria-live="polite")
```

或:
```
Label  ⚠ Error(右側)
[Input]
```

**Iron Laws**:
- 錯誤訊息**緊鄰錯誤欄位**(不放表單頂部除非 server-side)
- 紅色 + ⚠ 圖示 + `aria-live` 通知螢幕閱讀器
- 修正後立即移除錯誤(`onChange` 重驗 或 onBlur 重驗)

## Multi-step Form / Wizard

```
[Step 1] → [Step 2] → [Step 3] → [Done]
  ●           ◐          ○         ○
```

**Iron Laws**:
- Stepper 顯示總步數 + 當前位置
- 「上一步」永遠可達(資料保留)
- 跳到任意已完成步驟(可選)
- Save progress(localStorage / DB)— 重新開啟可續
- 最後一步「確認」頁面 review 所有輸入

## Auto-save Indication

```
[Editing]            → "Saving..." (spinner)
Save complete        → "✓ Saved" (3 秒淡出)
Save failed          → "⚠ Save failed - Retry" (persistent)
Unsaved changes      → "• Unsaved" (dot indicator)
Conflict detected    → "⚠ Newer version exists - Reload?" (modal)
```

## Autocomplete(自動完成輸入)

```tsx
const [query, setQuery] = useState('');
const debouncedQuery = useDebounce(query, 300);
const { data } = useQuery(['search', debouncedQuery],
  () => fetchSuggestions(debouncedQuery),
  { enabled: debouncedQuery.length >= 2 }
);
```

**Iron Laws**:
- Debounce 200-300ms(避免每字 API call)
- 最小字數門檻 ≥ 2(1 字結果過多無意義)
- 顯示 ≤ 10 結果(超過用 scroll 或 group)
- Keyboard navigation(↑↓ Enter Esc)
- Highlight 配對片段(`<mark>`)
- Empty / Loading / Error state 都要設計
- ARIA `combobox` + `listbox` 角色

## AJAX / Server State 8 Patterns

### 1. Optimistic UI
```tsx
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries(['todos']);
    const previous = queryClient.getQueryData(['todos']);
    queryClient.setQueryData(['todos'], old => [...old, newTodo]);   // 立即更新
    return { previous };
  },
  onError: (err, newTodo, ctx) => queryClient.setQueryData(['todos'], ctx.previous),  // 回滾
});
```

### 2. Pessimistic UI(等待 server)
```tsx
const [isSubmitting, setSubmitting] = useState(false);
<button disabled={isSubmitting}>{isSubmitting ? <Spinner /> : 'Submit'}</button>
```

### 3. Loading State 三選一

詳見 `references/10-interaction-states.md` § Loading。

### 4. Skeleton vs Spinner vs Progress

| 種類 | 等待時間 | 已知 layout | 已知 % |
|---|:---:|:---:|:---:|
| Spinner | < 2 秒 | ❌ | ❌ |
| Skeleton | 2-5 秒 | ✅ | ❌ |
| Progress bar | > 5 秒 | — | ✅ |
| Indeterminate progress | > 5 秒 | — | ❌ |

### 5. Race Condition(取消舊請求)
```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
    .catch(e => { if (e.name !== 'AbortError') console.error(e); });
  return () => controller.abort();
}, [url]);
```

或 TanStack Query 自動處理。

### 6. Debounce / Throttle

| 場景 | 用 | 延遲 |
|---|---|:---:|
| 搜尋輸入 | Debounce | 200-300ms |
| Auto-save | Debounce | 1000ms |
| Scroll 載入 | Throttle | 100ms |
| Resize | Throttle | 16ms(60fps) |
| Window resize end | Debounce | 200ms |

### 7. Stale-While-Revalidate
```tsx
useQuery(['data'], fetchData, {
  staleTime: 5 * 60 * 1000,         // 5 分鐘內視為新鮮
  refetchOnWindowFocus: true,       // 切回頁面自動刷新
  refetchOnReconnect: true,         // 重連自動刷新
});
```

### 8. Real-time Updates 3 種

| 機制 | 適用 | PhyCool 對應 |
|---|---|---|
| **Polling** | 簡單 / 低頻(> 10 秒) | `phycool-signalr-realtime` fallback |
| **WebSocket** | 雙向 / 高頻 | `phycool-signalr-realtime` 主路徑 |
| **SSE**(Server-Sent Events) | 單向 server push | LLM streaming 用 |

## Error Recovery(Retry / Fallback / Error Boundary)

```tsx
<ErrorBoundary fallback={<ErrorState />}>
  <DataComponent />
</ErrorBoundary>

const mutation = useMutation({
  mutationFn: callAPI,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),  // exponential
});
```

**Iron Laws**:
- 暫態錯誤(network / 5xx)自動 retry,exponential backoff
- 永久錯誤(4xx)不 retry,直接顯示 error
- Retry 限制 ≤ 3 次,超過要使用者主動觸發

## Pagination vs Infinite Scroll vs Virtual List

| 模式 | 適用 | 缺點 |
|---|---|---|
| **Pagination** | 需要回到特定頁 / SEO / 全覽 | 中斷瀏覽 |
| **Load More 按鈕** | 簡單 / 漸進 / 可控 | 多點一次 |
| **Infinite Scroll** | 探索 / 社群 / 內容流 | 無法到 footer / 失去進度感 |
| **Virtual List** | 500+ 筆 / 已知 row 高 | 實作複雜 |

**Iron Laws**:
- Infinite scroll 必有「回到頂部」按鈕
- Pagination 顯示 「第 X 頁,共 Y 頁」
- Virtual list 用 TanStack Virtual / react-window(不自己 reinvent)

## 資料視覺化選擇邏輯

| 目的 | 圖表 |
|---|---|
| 時間趨勢 | Line chart |
| 累積 / 區域 | Area chart |
| 類別比較 | Bar chart(水平)/ Column chart(垂直) |
| 比例(≤ 5 類) | Pie / Donut chart |
| 比例(> 5 類) | Bar chart(按大小排序) |
| 兩維分佈 | Scatter plot |
| 三維(類別 × 時間 × 數值) | Heatmap |
| 流程 / 漏斗 | Funnel chart |
| 時間軸事件 | Timeline / Gantt |
| 階層 / 樹狀 | Treemap / Sunburst |

**Iron Laws**:
- ❌ 不要用 3D pie / 圓餅圖 > 5 切(無法比較)
- ❌ Y 軸不從 0 開始(誤導)
- ✅ 直接 label 資料而非 legend(Tufte data-ink)
- ✅ 色盲安全色票(`references/08-a11y-darkmode.md`)
