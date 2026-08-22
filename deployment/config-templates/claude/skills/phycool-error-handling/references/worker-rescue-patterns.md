# phycool-error-handling — §9a Worker Onerror Fallback + §9b Promise.allSettled Per-Item Rescue + §Excel Worker Taxonomy

> **抽出自** `.claude/skills/phycool-error-handling/SKILL.md` 2026-05-16 P2-Wave-2/3 modularization (saas-to-skill Mode B). 主 SKILL.md ≤300 行,本檔承載 §9a Worker Onerror Fallback + §9b Promise.allSettled Per-Item Rescue + §Excel Worker Taxonomy。

---

## 9a. Worker Onerror Fallback Pattern（2026-05-12, Story: eft-excel-upload-multi-layer-fix-stack）

當 Web Worker 在特定環境無法執行時（跨源 module import、CSP block、COEP 等），必須有主線程 fallback。

**觸發時機判定**:
- Worker 初始化失敗（`new Worker(...)` 拋出）
- Worker `onerror` 觸發（特別是跨源 / CSP 相關）
- Worker postMessage 無回應超時

**Fallback Pattern（DataImportModal.tsx:157-193）**:
```typescript
// 主線程 fallback — Worker 跨源問題時的暫時方案
try {
  const result = await DataImportService.parseFile(selectedFile);
  if (!result.success) {
    setError(result.error ?? '檔案解析失敗');
    return;
  }
  // ... handle success
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : '未知錯誤';
  setError(`檔案解析失敗: ${errorMessage}`);
}
```

**User-facing error message**:
- ✅ `檔案解析失敗: {具體原因}` — 具體說明
- ❌ `Worker 錯誤: 未知錯誤` — 技術術語暴露給用戶

**root cause 分類**:
- CSP block: `worker-src` 缺失或 `script-src` 無 `blob:` → 修 SecurityHeadersMiddleware
- COEP: `require-corp` + 跨源 Worker fetch → 移除 COEP（Strategy A）
- Chrome 145+ 跨源 module import block → Worker bundling（`?worker&inline`）or 主線程 fallback

---

## 9b. Promise.allSettled Per-Item Rescue Pattern（v1.4.0, 2026-05-12）

> **Story**: `eft-canvas-sanitize-base64-legacy-rescue`
> **適用**: 並行操作中，部分項目失敗但整體流程仍可繼續時

### 使用時機對比

| Pattern | 適用情境 | 失敗行為 |
|---------|---------|---------|
| `Promise.all` | 所有項目必須全部成功（原子性） | 任一失敗 → 全部 reject → caller catch block |
| `Promise.allSettled` | 部分成功可接受（partial-success） | 各項獨立 settled → 分類 fulfilled/rejected → caller 決定 UX |

### 標準實作 (sanitizeBase64Assets.ts:104-170)

```typescript
// 並行執行所有項目，不因一個失敗中斷其他
const settledResults = await Promise.allSettled(
  items.map((item) => processItem(item))
);

const warnings: ItemWarning[] = [];
const successMap = new Map<number, Result>();

for (let i = 0; i < settledResults.length; i++) {
  const result = settledResults[i];
  if (result.status === 'fulfilled') {
    successMap.set(i, result.value);
  } else {
    warnings.push({
      index: i,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }
}
// 成功項目繼續處理，失敗項目記入 warnings
```

### 返回型別設計

```typescript
// Partial-success return shape — caller 必須處理 warnings
async function batchProcess(items): Promise<{
  result: ProcessedResult;
  warnings: ItemWarning[];  // 空陣列 = 全部成功
}> { ... }
```

### FORBIDDEN (§9b)

❌ **per-item 批次操作使用 `Promise.all` 而業務可接受部分成功**
   Common Rationalization: "Promise.all 更簡單，只有一個 catch 就好"
   Red Flag: catch block 顯示 `showError('全部失敗')` 即使只有 1/10 項目失敗 — 使用者體驗被一個壞資料擊垮

❌ **`Promise.allSettled` 結果不分類，直接忽略 rejected 項目**
   Common Rationalization: "allSettled 不會 throw，所以不需要額外處理"
   Red Flag: `settledResults` 只讀 `fulfilled` 狀態，rejected 項目 silently dropped — 使用者無法知道哪些項目失敗

---


---

## §Excel Worker 錯誤 Taxonomy — eft-excel-upload-critical-path-recovery 2026-05-13

`useExcelWorker.ts` 取代歷史「Worker 錯誤: 未知錯誤」fallback,改用 `ERROR_CODE_INFO` 對應 userMessage:

| ErrorCode | userMessage | 觸發場景 |
|:---------|:-----------|:--------|
| PARSE_001 | 檔案格式錯誤,請上傳 .xlsx 或 .csv 檔案 | format / 副檔名錯 |
| PARSE_003 | 檔案解析失敗,請確認檔案內容正確 | 一般 parse fail / Worker constructor fail / timeout |
| PARSE_004 | 上傳的檔案為空 | 0 row file |
| PARSE_005 | 檔案受密碼保護,無法解析 | 加密 .xlsx |

詳 `src/types/ErrorCode.ts` ParseRegistryErrorCode union + ERROR_CODE_INFO mapping。

### FORBIDDEN (補強)
❌ **Worker onerror 用 `error.message || '未知錯誤'` fallback**
   Common Rationalization: "W3C cross-origin 強制 sanitize empty message,只能 fallback"
   Red Flag: `useExcelWorker.ts` onerror 含 `'Worker 錯誤: ${error.message || '未知錯誤'}'` → 必改為 `ERROR_CODE_INFO.PARSE_003.userMessage`

---

## §Worker PDF ClassifyError Taxonomy — eft-m13-pdf-live-findings-followup AC-4 2026-07-11

`PdfGeneratorService.ClassifyError(Exception)`(`PdfGeneratorService.cs:1335`)將 Worker 例外映射為**固定**的使用者可讀 code + 自助指引,**全程絕不回傳 `ex.Message`**(不洩漏內部細節 / 堆疊給使用者),對齊 ERROR_CODE_INFO「分類 → userMessage」範式。

| Exception | userMessage |
|:---------|:-----------|
| QuestPDF `DocumentLayoutException`(版面溢出 / conflicting size constraints) | `PDF_LAYOUT: 版面配置超出可列印範圍，請調整物件大小或版面後重試` |
| TimeoutException | `PDF_TIMEOUT: 生成逾時，請減少頁數後重試` |
| OutOfMemoryException | `PDF_TOO_LARGE: 檔案過大，請分批生成` |
| OperationCanceledException | `PDF_CANCELLED: 任務已取消` |
| InvalidOperationException | `PDF_INVALID: 專案設定無效，請檢查後重試` |
| (未知) | `PDF_INTERNAL: 系統暫時無法生成，請稍後重試；若持續發生請聯繫客服`(軟化自舊「系統錯誤，請聯繫支援」) |

**DocumentLayoutException 偵測**:以**型別名稱**比對(`e.GetType().Name == "DocumentLayoutException"`,並走一層 inner exception;`IsLayoutException` `:1361`)— 避開對 QuestPDF 內部 exception 命名空間的編譯耦合(跨版本穩健;2025.12.1 = `QuestPDF.Drawing.Exceptions.DocumentLayoutException`)。版面溢出本身由渲染 clamp 預防(見 phycool-pdf-engine §1.5 coordinate-and-cutstack),本分類僅在 clamp 無法攔截的殘餘版面失敗時浮現。

### FORBIDDEN (§Worker PDF)
❌ **Worker ClassifyError default arm 回傳 `ex.Message` 或一律「系統錯誤，請聯繫支援」硬句**
   Common Rationalization: "把原始錯誤丟給使用者比較好除錯 / 反正失敗都是系統錯誤一種"
   Red Flag: ClassifyError 含 `_ => ex.Message` 或未依 exception 型別分類 → 洩漏內部細節 + 使用者無自助指引(2026-07-10 使用者實測 3 敗全見同句「PDF_INTERNAL: 系統錯誤」)

---
