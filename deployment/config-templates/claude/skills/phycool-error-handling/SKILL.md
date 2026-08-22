---
name: phycool-error-handling
description: "PhyCool Error Code 與 Exception Handling 標準 — ErrorCode enum + [ErrorCodeInfo] attr、ErrorCodeRegistry singleton(Reflection cache)、ExceptionHandlerMiddleware(API/MVC split)、RFC 7807 ProblemDetails、ControllerErrorExtensions.ProblemResult()、前端 handleApiError。詳 triggers。"
version: 2.14.0
author: PhyCool Team
created: 2026-03-27
updated: 2026-07-11
last_synced_epic: epic-eft
last_synced_date: 2026-07-11
last_synced_story: eft-m13-pdf-live-findings-followup code-review — references/worker-rescue-patterns.md §Worker PDF ClassifyError Taxonomy 新增(PdfGeneratorService.ClassifyError 固定 code+自助指引禁 ex.Message;DocumentLayoutException→PDF_LAYOUT 以型別名比對免 QuestPDF 內部耦合,IsLayoutException 走一層 inner;default 軟化 PDF_INTERNAL「稍後重試」+ FORBIDDEN 禁 ex.Message/硬句)。前次:eft-qrcode-generator-store code-review — §7.6 Frontend QR/Barcode Toast Mapping 新增(對稱 §7.5 SERIAL · QrBarcodeApiError 7-code zh-TW:QR_BARCODE_GENERATOR_001~005 + UNAUTHORIZED + default;契約關鍵 code-vs-type:後端 ErrorCodeRegistry.cs:44 Type=info.Code / :83,:86 codeString=field.Name → enum 成員名寫入 ProblemDetails.Type,標準 problem+json 無 code 欄位 → 前端 handleResponse code??type fallback 對齊 §7.4;與 Serial handleResponse 僅讀 code 的契約差異)。前次:eft-triangle-card-validator-preflight-migration code-review — §前端 ErrorCode 範圍補充新增「三角桌牌 Preflight Validator」子段(TentErrorCode 9200/9210/9203/9204 自有碼 return-array 皆 WARN 非阻擋,9202 三方互斥共用碼 MIRROR_DUPLEX_TENT_SPLIT_CONFLICT 依 D9 不於 ErrorCode.ts 重複 string 定義 Validator 僅輸出 numericCode + TENT_NUMERIC_TO_CODE 映射,httpStatus 422,9204 mirror 角度取圓周最短弧距防邊界誤報)+ Preview/PDF 串接鏈總表 7→8 段(tent 第 8 段鏈尾 canvas 級 useTriangularTentPreflight + TriangularTentPreflightWarningModal 薄包裝 PreflightWarningModalShell)+ Free Funnel 7→8 段。前次:pcpt-preview-pdf-preflight-validation code-review — §前端 ErrorCode 範圍補充新增「圖層 visibility Preflight Validator」子段(LayerVisibilityErrorCode 9701-9705,return-array 三語 severity:critical/warning 非硬阻擋,純前端不註冊後端 ErrorCode.cs)+「Preview/PDF Preflight 串接鏈接線狀態總表」(7 子功能 7 段巢狀 chain:blockSplit→duplex→otherTools→image→cutStack→qrBarcode→layerVisibility,本卡接入 CutStack/QRCode/Barcode/Layer 4 validator dead-code→live + Free Funnel IDD-COM-001/007 守護)+ CutStack 接線狀態 dead-code→✅ live(TopBarPreviewActions.tsx:86/GeneratePdfButton.tsx:405)。前次:eft-cut-stack-sorting-correction code-review — §前端 ErrorCode 範圍補充新增「裁切堆疊 Preflight Validator」子段(CutStackErrorCode 9401-9404,return-array 範式對齊 BlockSplit/Duplex,9401-9403 BLOCK/9404 WARN,httpStatus 422,9400-9499 專屬無重疊)+ Boy Scout pointer cross-check 加 CutStack。前次:eft-image-panel-v2-correction dev-story — §前端 ErrorCode 範圍補充新增「圖片 Preflight Validator」子段(ImageErrorCode 圖片上傳 8601-8603 WARN + isPrintable 8651 INFO/8652 dev-only WARN,純前端 client-side return-array 範式自包含 ImageValidationError level 擴 BLOCK/WARN/INFO,無後端 ErrorCode.cs 對應,ERROR_CODE_INFO httpStatus 422 + isKnownErrorCode 自動納入);8600-8699 與 BatchImage 8700 / DataSource 8800 / QR 8901 無重疊;§2.A Contract 前置 8652 顯式化後端 IsPrintable 欄位 gap;對齊 preflight-validation-contract.md §2/§2.A 落地回填 2026-06-26。前次:eft-other-tools-validators-preflight CR §其他工具 Preflight Validator 子段(Shape 9001-9007 / Table 9008-9012 / MultiSelect 9050-9052)
watches:
  - glob: "src/YourApp/Web/Models/Enums/ErrorCode.cs"
    domain: error
  - glob: "src/YourApp/Web/Models/Enums/ErrorCodeInfoAttribute.cs"
    domain: error
  - glob: "src/YourApp/Web/Models/Enums/ErrorCodeExtensions.cs"
    domain: error
  - glob: "src/YourApp/Web/Services/ErrorCodeRegistry.cs"
    domain: error
  - glob: "src/YourApp/Web/Middleware/ExceptionHandlerMiddleware.cs"
    domain: error
  - glob: "src/YourApp/Web/Extensions/ControllerErrorExtensions.cs"
    domain: error
triggers:
  - ErrorCode
  - error code
  - ExceptionHandler
  - ExceptionHandlerMiddleware
  - ProblemDetails
  - RFC 7807
  - ErrorCodeInfo
  - ErrorCodeInfoAttribute
  - ErrorCodeRegistry
  - IErrorCodeRegistry
  - ErrorCodeExtensions
  - ProblemResult
  - ControllerErrorExtensions
  - handleApiError
  - isKnownErrorCode
  - error response
  - structured error
  - ApiResult
  - DbUpdateException
  - FK violation
  - traceId
  - error toast
  - JsonStringEnumConverter
  - enum binding
  - FromBody enum
  - JSON enum
---

> **2026-05-16 Progressive Disclosure 重構**: 原 647 行 monolithic 拆為核心 ≤300 行 + 4 references/*.md。完整內容按需 Read 對應子檔。

## References

| Reference | 涵蓋章節 |
|-----------|---------|
| [errorcode-enum-registry.md](references/errorcode-enum-registry.md) | §1-§4 ErrorCode Enum + Attribute + Extensions + Registry |
| [middleware-frontend.md](references/middleware-frontend.md) | §5-§7 Controller Response + ExceptionHandlerMiddleware + Front-End |
| [worker-rescue-patterns.md](references/worker-rescue-patterns.md) | §9a Worker Onerror Fallback + §9b Promise.allSettled Per-Item Rescue + §Excel Worker Taxonomy |
| [migration-dto-contract.md](references/migration-dto-contract.md) | §8 Backward Compatibility + §10 DTO Entity Nullable Contract |

---

## 韌性緩衝（Polly · 外部服務容錯）— pointer（vision-g8-5）

> 本 skill 範圍 = **應用層** ErrorCode 列舉 + Exception 處理 + RFC 7807 ProblemDetails（對請求方回傳結構化錯誤）。**外部服務呼叫的容錯韌性緩衝層（Polly 重試 / 斷路器 / 限流）** 為互補但不同 domain — 處理「外部依賴暫時性失敗的自動回復」而非「錯誤碼回傳」。完整文件化 + 調優基準見 **`RUNBOOK-OBSERVABILITY-001`**（`docs/implementation-artifacts/runbooks/RUNBOOK-OBSERVABILITY-001-resilience-tuning.md`）。

| 韌性機制 | code 位置 | 觸發 / 預設值 |
|:--|:--|:--|
| 重試（指數退避+Jitter） | `Extensions/ResilienceExtensions.cs:52-77` | `HandleTransientHttpError`（5xx/408/HttpRequestException）;MaxRetries=3 / Backoff=2.0 / Jitter=0.25（`ResilienceConfig.cs:17-21`） |
| 斷路器三態 | `ResilienceExtensions.cs:85-120` | onBreak/onReset/onHalfOpen;FailureThreshold=5 / DurationOfBreak=30s（`ResilienceConfig.cs:29-30`）。**A7 告警 emit `:98-109`** → `IAlertHook`（收斂端詳 `phycool-background-services` §IAlertHook） |
| 限流（分散式固定視窗） | `Models/DTOs/RateLimitingOptions.cs:17-20` | Public 10 / Auth 60 / Admin 120 / Webhook 30 @60s;OnRejected **429+Retry-After**（`ServiceRegistrationExtensions.cs:164-196`） |
| PDF 雙斷路器 | `Services/PdfCircuitBreakerService.cs:65-67` | 用戶 10 次/1h + 專案連續 3 次（DB 查 PdfJobs 跨程序） |

> **與 ErrorCode 的邊界**:Polly 韌性處理「外部依賴失敗的自動回復」,失敗耗盡後若需回傳用戶才走本 skill ErrorCode + ProblemDetails;限流 429 拒絕走 `OnRejected` handler（非 ErrorCode enum）。調優方向（NG-5 不投機目標值,全標 Phase D 實測校準）詳 runbook §3 調優基準表。

---

## 9. FORBIDDEN Patterns

- Creating error responses without using `ErrorCode` enum (no ad-hoc error strings)
- Adding an `ErrorCode` enum value without `[ErrorCodeInfo]` attribute (Registry will skip it)
- Returning stack traces in production API responses
- Using `ErrorCodeExtensions` in hot paths (use `IErrorCodeRegistry` instead)
- Hardcoding HTTP status codes in controllers when an `ErrorCode` already defines it
- Exposing SQL error details (`SqlException.Message`) in any API response
- Using `RefundValidationErrorCode` or `ParseErrorCode` directly (use unified `ErrorCode` via converters)
- Returning non-RFC 7807 error format from API endpoints

❌ **Worker onerror 不走 main-thread fallback 而直接向用戶顯示技術性錯誤訊息**
   Common Rationalization: "Worker 失敗就讓用戶看到錯誤，他們可以刷新頁面"
   Red Flag: useExcelWorker.ts onerror handler 只 setState(error) 無 fallback，用戶看到「Worker 錯誤: 未知錯誤」無法繼續上傳


---


## 前端 ErrorCode 範圍補充 (eft-qrcode-module-correction 2026-06-09)

> ✅ **前後端三方 SSoT 統一（2026-06-09 eft-qrcode-module-correction-phase-d 落地）**：前端 `types/ErrorCode.ts` 14 條 union type + `ERROR_CODE_INFO` entries 已是 SSoT；後端 `ErrorCode.cs` 補 14 條 enum（QR 8901-8907 / Barcode 8950-8957），命名嚴格對齊前端 SSoT；`ErrorCodeRegistry` 無 duplicate value（BuildCache_NoDuplicateEnumValues_FullScan reflection test PASS）；`preflight-validation-contract.md §5.A/§5.B` 三方一致。注：BarcodeErrorCode 共 7 條（8950~8957，8956 RESERVED 跳號對齊前端）。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 8901-8907 | `QRCodeErrorCode` | QR Code Preflight:MISSING_BINDING / MISSING_CONTENT / INVALID_ERROR_LEVEL / CONTENT_TOO_LARGE / ENCODING_UNSUPPORTED / FIELD_NOT_FOUND / LIMIT_EXCEEDED |
| 8950-8957 | `BarcodeErrorCode` | Barcode Preflight:INVALID_FORMAT / INVALID_FORMAT_DATA / MISSING_BINDING / FIELD_NOT_FOUND / BACKEND_UNAVAILABLE / SHOW_TEXT_TYPE_ERROR / LIMIT_EXCEEDED |

### 圖片 Preflight Validator(eft-image-panel-v2-correction 2026-06-26 落地)

> ✅ **純前端 client-side preflight(無後端 `ErrorCode.cs` 對應)** — 圖片 validator,採 `return-array static validate(): ImageValidationError[]` 範式(對齊 `DuplexValidator.ts` / `ShapeValidator.ts`,非 contract §0 願景 `implements SubfeatureValidator<T>`,全 src 0 命中)。自包含 `ImageValidationError`(level 擴 `'BLOCK'|'WARN'|'INFO'` — §2.A 8651 為 INFO,故不沿用 ValidatorTypes.ValidatorLevel);`types/ErrorCode.ts` `ImageErrorCode` union + `ERROR_CODE_INFO` entry(httpStatus 422);`isKnownErrorCode` 經 keys 自動納入。圖片異常皆 WARN/INFO(無 BLOCK — 不硬擋預覽/PDF,使用者可繼續)。對齊 `preflight-validation-contract.md` §2 / §2.A(規範就緒 + code 落地回填 2026-06-26)。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 8601-8603 | `ImageErrorCode`(圖片上傳 8600-8649) | 圖片 Preflight(皆 WARN):IMAGE_ASSET_DELETED(8601 · knownAssetIds OPTIONAL 安全降級,生產靠 8603)/ IMAGE_FORMAT_UNSUPPORTED(8602 · jpg/jpeg/png/webp/gif/svg)/ IMAGE_LOAD_FAILED(8603 · fabric image element naturalWidth broken 判定) |
| 8651-8652 | `ImageErrorCode`(圖片 [不列印] isPrintable 8650-8699) | IMAGE_ALL_NON_PRINTABLE(8651 INFO 非阻擋 · 全部 isPrintable=false → PDF 空白頁)/ IMAGE_NON_PRINTABLE_CONTRACT_PENDING(8652 WARN dev-only · 後端 CanvasObjectData.IsPrintable 欄位未驗,useImagePreflight 生產過濾) |

> **§2.A Contract 前置**: 8652 dev-only 顯式化後端 `CanvasObjectData.IsPrintable` 欄位 gap — 8651 INFO 純前端偵測可先行,PDF skip 真生效需後端補欄位(Phase D,對齊 `constitutional-backend-contract.md`)。圖片 8600-8699 與 BatchImage 8700-8799 / DataSource 8800-8899 / QR 8901-8957 無重疊(8800-8899 = DataSourceValidator,Story 原誤寫已校正)。

### 其他工具 Preflight Validator(eft-other-tools-validators-preflight 2026-06-22 落地)

> ✅ **純前端 client-side preflight(無後端 `ErrorCode.cs` 對應)** — 形狀 / 表格 / 多選 validator,採 `return-array static validate(): XxxValidationError[]` 範式(對齊 `BlockSplitValidator.ts` / `DuplexValidator.ts`,非 contract §0 願景 `implements SubfeatureValidator<T>`,全 src 0 命中)。numericCode 由 `utils/validators/ValidatorTypes.ts` `makeOtherToolsError` 帶,`types/ErrorCode.ts` 僅字串碼 union + `ERROR_CODE_INFO` entry(httpStatus 422);`isKnownErrorCode` 經 `ERROR_CODE_INFO` keys 自動納入。對齊 `preflight-validation-contract.md` §6.A / §6.B / §6.D(規範 2026-05-29 + code 落地回填 2026-06-22)。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 9001-9007 | `ShapeErrorCode` | 形狀 Preflight:INVALID_COLOR / INVALID_STROKE_WIDTH / INVALID_LINECAP / ZOMBIE_ZORDER(WARN) / INVALID_OPACITY / INVALID_RX_RY / TYPE_MISMATCH |
| 9008-9012 | `TableErrorCode` | 表格 Preflight(P29-4):INVALID_DIMENSION / CELL_GRID_MISMATCH / MERGE_OUT_OF_BOUNDS / MERGE_OVERLAP / CELL_INCONSISTENT(WARN);9013-9049 RESERVED |
| 9050-9052 | `MultiSelectErrorCode` | 多選 Preflight(3 條皆 WARN,低優先級非阻擋):OUT_OF_CANVAS / TOO_FEW / LOCKED_GROUP |

### 裁切堆疊 Preflight Validator(eft-cut-stack-sorting-correction 2026-06-26 落地)

> ✅ **純前端 client-side preflight(無後端 `ErrorCode.cs` 對應)** — 裁切堆疊排序 validator,採 `return-array static validate(ctx): CutStackValidationError[]` 範式(對齊 `BlockSplitValidator.ts` / `DuplexValidator.ts` 姊妹,inline numericCode + 三語 messages,非 contract §0 願景 `implements SubfeatureValidator<canvasDoc>`,全 src 0 命中)。`types/ErrorCode.ts` `CutStackErrorCode` union 4 條 + `ERROR_CODE_INFO` entry(httpStatus 422);`isKnownErrorCode` 經 keys 自動納入。`collectCutStackBlockingErrors` + `assertValid` + `toSubfeatureWarning` bridge(→ `usePreviewGeneration.ts:57 SubfeatureWarning` type='cutstack')。對齊 `preflight-validation-contract.md` §10(規範回填 2026-06-04 + code 落地 2026-06-26)。✅ **接線狀態(2026-06-26 `pcpt-preview-pdf-preflight-validation` 接入 · dead-code → live)**:`useCutStackPreflight` + `buildCutStackContext`(從 `pageSettings.cutStackSettings{enabled,stackSize}` + rows/cols + dataCount 組裝)已接線至 `TopBarPreviewActions.tsx:86`(Preview)+ `GeneratePdfButton.tsx:405`(PDF)串接鏈第 5 段(image→**cutStack**→qrBarcode→layerVisibility→doOpenPreview/proceedGeneratePdf)。`CutStackWarningModal` 薄包裝 `PreflightWarningModalShell`,傳 `hasBlocking={false}` 恆非阻擋(Story「偵測→警示→使用者決定」;9401-9403 BLOCK 僅用於挑選主文案,`confirm` 不 guard 恆可繼續)。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 9401-9404 | `CutStackErrorCode` | 裁切堆疊 Preflight:BATCH_RANGE_INVALID(9401 BLOCK · enabled+stackSize<1\|>100)/ M5_PRECONDITION_FAILED(9402 BLOCK · enabled+rows×cols≤1)/ DATA_EMPTY(9403 BLOCK · enabled+dataCount=0)/ DATA_INSUFFICIENT(9404 WARN · enabled+0<dataCount<stackSize) |

> **Boy Scout pointer**: 其他前端 Preflight validator 亦走同 return-array 範式但屬各自 Story scope — `BlockSplitErrorCode` 9301-9305(eft-block-split-frontend-validator)/ 雙面 Duplex 9100-9199(eft-duplex-*)/ `CutStackErrorCode` 9401-9404(eft-cut-stack-sorting-correction · 9400-9499 專屬區段)。ErrorCode 9000-9099 其他工具區段分配:Shape 9001-9007 / Table 9008-9049 / MultiSelect 9050-9052,與 QRCode 8901-8957 / BlockSplit 9301-9305 / CutStack 9401-9404 / TextMask 9651-9655(eft-text-hidden-code-frontend-ui · 9650-9699 區段)無重疊(父卡 R5 cross-check)。

```typescript
// ✅ 前端 types/ErrorCode.ts — 正確使用方式
import type { QRCodeErrorCode, BarcodeErrorCode } from '../../types/ErrorCode';
// QRCodeValidator.ts 拋出 ValidationError({ errorCode: 'QRCODE_FIELD_NOT_FOUND', numericCode: 8906 })
// BarcodeValidator.ts 拋出 ValidationError({ errorCode: 'BARCODE_INVALID_FORMAT_DATA', numericCode: 8951 })
```

```typescript
// ❌ 前端 Preflight Validator 不得拋出未知 errorCode 字串或 hardcode 數字
throw new Error('8906'); // 應改用 QRCodeErrorCode union type
```

### 文字隱碼 Preflight Validator(eft-text-hidden-code-frontend-ui 2026-06-27 落地)

> ✅ **純前端 client-side preflight + 範式 A 註冊** — F2 文字隱碼遮罩 validator(`utils/validators/TextMaskValidator.ts`),採 `return-array static validate(input): TextMaskValidationError[]` 範式(對齊 `ShapeValidator`)。**與圖層/CutStack 差異**:9651-9655 **有註冊進 `types/ErrorCode.ts`**(`TextMaskErrorCode` union + `ERROR_CODE_INFO` entry httpStatus 422,**範式 A** 對齊 Shape/Table)+ validator **同時**自帶三語 `messages`(zh-TW/zh-CN/en-US)。9654 PARITY_MISMATCH 為前端 `PiiMaskPort` TS port 對後端 `PiiMaskingService` SSoT 抽樣自檢(`PARITY_SAMPLES` 5 規則,防 ADR-PREVIEW-001 drift)。`collectTextMaskBlockingErrors`(只回 ERROR)+ `toSubfeatureWarning` bridge(→ `usePreviewGeneration.ts SubfeatureWarning` type='text-mask')。後端 `PiiMaskingService` graceful 零 throw,9651-9655 全歸前端 preflight。對齊 `preflight-validation-contract.md` §12.A。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 9651-9655 | `TextMaskErrorCode` | 文字隱碼 Preflight:TEXTMASK_INVALID_RULE(9651 ERROR · rule ∉ general/name/idCard/phone/plate)/ TEXTMASK_INVALID_CHAR(9652 ERROR · char ∉ 8 字符 `* X O # @ - ◻ ◌`)/ TEXTMASK_NO_BINDING(9653 WARN · 標隱碼但無綁定)/ TEXTMASK_PARITY_MISMATCH(9654 ERROR · 前端 port vs 後端 SSoT 抽樣不一致)/ TEXTMASK_GLYPH_UNSUPPORTED(9655 WARN · ◻/◌ 字型不支援 fallback *);9650/9656-9699 預留 |

### 圖層 visibility Preflight Validator(eft-layer-visibility-correction 2026-06-12 落地 · pcpt-preview-pdf-preflight-validation 2026-06-26 接線)

> ✅ **純前端 client-side cross-cutting preflight(無後端 `ErrorCode.cs` 對應)** — 圖層 visibility / lock canvas-level validator,採 `return-array static validate(canvas): LayerVisibilityWarning[]` 範式(對齊 `DuplexValidator.ts` inline 三語,非 contract §0 願景 `implements SubfeatureValidator<T>`,全 src 0 命中)。**§13 特殊性**:severity 採 `'critical'|'warning'`(異於 BlockSplit/Duplex 的 `level:'BLOCK'|'WARN'`)— 全為「印前提醒 + 詢問是否繼續生成 PDF」**無硬阻擋**,阻擋與否由整合層決定(critical 強烈提示但 `[仍要繼續預覽]` 恆可用)。validator 自帶 `messages` 三語(zh-TW/zh-CN/en-US),**不註冊進 `types/ErrorCode.ts`**(該檔 `ERROR_CODE_INFO.userMessage` 單語無法承載三語)。對齊 `preflight-validation-contract.md` §13(✅ Implemented)。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 9701-9705 | `LayerVisibilityErrorCode` | 圖層 Preflight:LAYER_CANVAS_EMPTY(9701 critical · 有 user 物件但全 visible=false)/ LAYER_HIDDEN_DATA_BINDING(9702 warning · 隱藏物件含 data.binding)/ LAYER_HIDDEN_SERIAL(9703 warning · 隱藏序號)/ LAYER_HIDDEN_QR_BARCODE(9704 warning · 隱藏 QR/條碼)/ LAYER_LOCKED_INVALID_OBJECTS(9705 critical · 鎖定+invalid);9706/9707 預留 |

> ✅ **接線狀態(2026-06-26 `pcpt-preview-pdf-preflight-validation` 接入)**:`useLayerVisibilityPreflight`(severity 適配 `hasCritical` 旗標,critical/warning 皆 `hasBlocking=false` 恆可繼續)+ `LayerVisibilityWarningModal`(直讀 validator 三語 messages)已接線至 `TopBarPreviewActions.tsx:88`(Preview)+ `GeneratePdfButton.tsx:407`(PDF)串接鏈**第 7 段(鏈尾)**;canvas-level 驗證(掃整 canvas user 物件,排除系統物件 + `_hiddenForPreview` 預覽暫態)故置鏈尾。`isUserHidden` 排除 `_hiddenForPreview` 暫態防 QR 預覽 false-positive(`LayerVisibilityValidator.ts:152-155`)。

### 三角桌牌 Preflight Validator(eft-triangle-card-validator-preflight-migration 2026-06-29 落地)

> ✅ **純前端 client-side preflight(無後端 `ErrorCode.cs` 對應)** — 三角桌牌 validator(`utils/TriangularTentValidator.ts`),採 `return-array static validate(tentSettings, pageSettings, canvasObjects): TriangularTentWarning[]` 範式(對齊 `BlockSplitValidator.ts` / `CutStackValidator.ts` 姊妹,非 contract §0 願景 `implements SubfeatureValidator<T>`,全 src 0 命中)。`types/ErrorCode.ts` `TentErrorCode` union 4 自有碼 + `ERROR_CODE_INFO` entry(httpStatus 422);`isKnownErrorCode` 經 keys 自動納入。**9202 三方互斥共用碼(`MIRROR_DUPLEX_TENT_SPLIT_CONFLICT`)依 D9 釐清不於 `ErrorCode.ts` 重複 string 定義**(Grep 9202=0 hit,雙面亦未註冊),Validator 僅輸出 `numericCode=9202` + `TENT_NUMERIC_TO_CODE` 映射供 dev-only disclosure。三角桌牌警示皆 WARN(無 BLOCK,confirm 恆可繼續)。對齊 `preflight-validation-contract.md` §8(規範 2026-06-03 C-I + code 落地 2026-06-29)。

| Range | Type | 說明 |
|:------|:-----|:-----|
| 9200/9210/9203/9204 | `TentErrorCode` | 三角桌牌 Preflight(皆 WARN):TENT_ZONE_HEIGHT_TOO_SMALL(9200 · 任一 zone 高度<10mm)/ TENT_FOLDLINE_GAP_TOO_SMALL(9210 · 相鄰 fold line 間距<10mm)/ TENT_FOLDLINE_COUNT_MISMATCH(9203 · foldLinePositions 數量≠3)/ TENT_MIRROR_ANGLE_DRIFT(9204 · horizontal-roof 反面 mirror 角度≠來源+180°);9201/9202 歸雙面 mirror/三方互斥共用,9205-9299 預留 |

> ✅ **接線狀態(2026-06-29 本卡接入)**:`useTriangularTentPreflight` + `buildTriangularTentContext`(從 live canvas `getObjects()` + `pageSettings.triangularTentSettings` SSoT 抽取,`DISABLED_TENT`/`EMPTY_PAGE` 安全降級)已接線至 `TopBarPreviewActions.tsx`(Preview)+ `GeneratePdfButton.tsx`(PDF)串接鏈**第 8 段(鏈尾 canvas 級)**;`TriangularTentPreflightWarningModal` 薄包裝 `PreflightWarningModalShell`(三語 i18n + dev-only 工程碼 disclosure + `cancelLabel`「返回修正」),傳 `hasBlocking={false}` 恆非阻擋。9204 mirror 角度比較取圓周最短弧距(避 359.9° vs 0° 邊界誤報)。

### Preview/PDF Preflight 串接鏈接線狀態總表(2026-06-26 整合)

> `TopBarPreviewActions.handleOpenPreview`(Preview)+ `GeneratePdfButton.handleGeneratePdf`(PDF)兩 call site **8 段巢狀 runWithPreflight chain**:blockSplit→duplex→otherTools→image→**cutStack**→**qrBarcode**→**layerVisibility**→**tent**(粗體 = preview-pdf-preflight 3 段 + `eft-triangle-card-validator-preflight-migration` tent 第 8 段鏈尾)。任一段 `runWithPreflight(ctx, proceed)`:無 error → `proceed()` 續鏈;有 error → 開 Modal 暫停(confirm 續鏈 / cancel 清 `pendingActionRef`)。

| 子功能 | Validator | ErrorCode | 接線 hook | 狀態 |
|:------|:----------|:----------|:----------|:----:|
| 區塊分割 | BlockSplitValidator | 9301-9305 | useBlockSplitPreflight | ✅ 已接線 |
| 雙面列印 | DuplexValidator | 9100-9108 | useDuplexPreflight | ✅ 已接線 |
| 其他工具(形狀/表格/多選) | Shape/Table/MultiSelect | 9001-9052 | useOtherToolsPreflight | ✅ 已接線 |
| 圖片 | ImageValidator | 8601-8651 | useImagePreflight | ✅ 已接線 |
| 裁切堆疊 | CutStackValidator | 9401-9404 | useCutStackPreflight | ✅ **本卡接入** |
| QR Code/條碼 | QRCode/BarcodeValidator | 8901-8957 | useQRCodePreflight | ✅ **本卡接入** |
| 圖層 visibility | LayerVisibilityValidator | 9701-9705 | useLayerVisibilityPreflight | ✅ **本卡接入** |
| 三角桌牌 | TriangularTentValidator | 9200/9210/9203/9204 | useTriangularTentPreflight | ✅ **本卡接入(eft-triangle-card-validator-preflight-migration · 第 8 段鏈尾)** |
| Serial/BatchImage/DataSource/Font/DataBinding | (validator 未實作) | — | — | ⬜ 各卡 Phase D |

> **Free Funnel hook(`pcpt-preview-pdf-preflight-validation` AC-16/22)**:8 段共用 `PreflightWarningModalShell` 內嵌 `PreflightFunnelCTA` — Free(`useUserFeatures().forceWatermark===true`)三級遞進(第 1 次純錯誤 / 第 2 次小 CTA / 第 3 次大 banner,`utils/preflightFunnel.ts` module 級計數)/ Pro 恆顯回報問題。**IDD-COM-001 守護**(preflight 全 plan 一致,CTA 僅暗示非阻擋)+ **IDD-COM-007 守護**(走 forceWatermark proxy 禁 plan 字串判斷)。

## JSON Enum [FromBody] Binding(ADR-JSON-ENUM-001 · 2026-06-14)

> 全域 `JsonStringEnumConverter` 雙註冊 — [FromBody] 字串 enum 反序列化 + read 容錯。觸發:m0-6-announcement-editor-enum-json-binding(公告編輯器送字串 enum 名 → 無 converter throw JsonException Path:$.type)。

**雙註冊範式**(對齊 ADR-TZ-001 UtcDateTimeJsonConverter 先例,兩 converter 並存型別不衝突):

```csharp
// ServiceRegistrationExtensions.cs:556 ConfigureHttpJsonOptions(Minimal API o.SerializerOptions)
o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
// :567 AddControllersWithViews().AddJsonOptions(MVC o.JsonSerializerOptions [FromBody])
o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
```

> **雙註冊缺一不可**:MVC controller [FromBody] 走 AddJsonOptions;只加 Minimal API ConfigureHttpJsonOptions 則 MVC body 仍 throw。

- **read 容錯**:字串大小寫不敏感 + integer 向後相容(`new JsonStringEnumConverter()` 預設 `allowIntegerValues=true`)→ 既有送 number 呼叫端不破壞
- **write**:PascalCase enum 名(業界標準 string-enum API)
- **未知字串 throw** = 合理 400 input validation(非缺陷)

**關鍵不對稱**:`[FromQuery]` enum 走 ASP.NET Core TypeConverter(本接受字串名 → 正常)vs `[FromBody]` 走 System.Text.Json(無 converter → throw JsonException Path:$.field)。解釋為何列表搜尋正常、create/update body 失效。

**Blast radius**:全域 enum number→string 影響所有 enum API write;前端 number-keyed map 須補 C# enum 名 PascalCase string key(保留 number 向後相容)或改用後端 label 欄位(typeLabel/urgencyLabel)。詳 `phycool-announcement-system` enum-binding 章節 + follow-up `m0-6-enum-frontend-systematic-alignment`。

**AOT**:非泛型 `JsonStringEnumConverter` 標記 `RequiresDynamicCode`;PhyCool reflection-based 非 AOT(`UtcDateTimeJsonConverter` 亦 reflection)→ 非泛型 factory 正確。未來 AOT 遷移改泛型 `JsonStringEnumConverter<TEnum>`。

[Source: ADR-JSON-ENUM-001 · ServiceRegistrationExtensions.cs:553-568 · code-verified 2026-06-14]

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.14.0** | **2026-07-11** | **eft-m13-pdf-live-findings-followup code-review Skill Sync — references/worker-rescue-patterns.md §Worker PDF ClassifyError Taxonomy 新增** — `PdfGeneratorService.ClassifyError`(`:1335`)映射 Worker 例外為固定 code + 自助指引,**全程禁 `ex.Message`**(不洩漏內部細節/堆疊):`DocumentLayoutException`→`PDF_LAYOUT: 版面配置超出可列印範圍,請調整物件大小或版面後重試`(以型別名 `GetType().Name` 比對 + 走一層 inner exception,免 QuestPDF 內部命名空間編譯耦合,`IsLayoutException :1361`;2025.12.1)/ Timeout→PDF_TIMEOUT / OOM→PDF_TOO_LARGE / Cancelled→PDF_CANCELLED / InvalidOperation→PDF_INVALID / default 軟化「PDF_INTERNAL: 系統暫時無法生成,請稍後重試」(自舊「系統錯誤,請聯繫支援」)。FORBIDDEN 禁 default arm 回 `ex.Message`/硬句(Red Flag `_ => ex.Message`;2026-07-10 使用者實測 3 敗全見同句)。版面溢出由 phycool-pdf-engine v2.27.0 §1.5 clamp 預防,本分類為殘餘失敗兜底。`Skill(skill="saas-to-skill")` Mode B 8 面向。 |
| **2.13.0** | **2026-07-03** | 〔VH 補登 — 升版時漏列,eft-m13-pdf-live-findings-followup CR 順手補〕**eft-qrcode-generator-store code-review — §7.6 Frontend QR/Barcode Toast Mapping 新增**(對稱 §7.5 SERIAL · `QrBarcodeApiError` 7-code zh-TW:QR_BARCODE_GENERATOR_001~005 + UNAUTHORIZED + default;code-vs-type 契約:`ErrorCodeRegistry.cs:44` Type=info.Code → enum 成員名寫入 `ProblemDetails.Type`,標準 problem+json 無 code 欄位 → 前端 handleResponse `code??type` fallback)。 |
| **2.12.0** | **2026-06-27** | **eft-text-hidden-code-frontend-ui CR Skill Sync — §前端 ErrorCode 範圍補充新增「文字隱碼 Preflight Validator」子段**:`TextMaskErrorCode` 9651-9655(TEXTMASK_INVALID_RULE 9651 ERROR / INVALID_CHAR 9652 ERROR / NO_BINDING 9653 WARN / PARITY_MISMATCH 9654 ERROR / GLYPH_UNSUPPORTED 9655 WARN)。**範式 A**(有註冊 `types/ErrorCode.ts` `TextMaskErrorCode` union + `ERROR_CODE_INFO` httpStatus 422,異於圖層/CutStack 範式 B 不註冊)+ validator 同時自帶三語 messages;9654 為前端 `PiiMaskPort` TS port 對後端 `PiiMaskingService` SSoT 抽樣自檢(`PARITY_SAMPLES`,防 ADR-PREVIEW-001 drift);`collectTextMaskBlockingErrors` + `toSubfeatureWarning` bridge(type='text-mask')。後端 graceful 零 throw 9651-9655 全歸前端。Boy Scout pointer 補 TextMask 9651-9655(9650-9699 區段無重疊)。對齊 `preflight-validation-contract.md` §12.A。last_synced_epic epic-pcpt-editor-refinement→epic-eft。`Skill(saas-to-skill)` Mode B + 8 面向 pass。 |
| **2.11.0** | **2026-06-26** | **pcpt-preview-pdf-preflight-validation CR Skill Sync — §前端 ErrorCode 範圍補充新增「圖層 visibility Preflight Validator」子段 + 「Preview/PDF Preflight 串接鏈接線狀態總表」**:(1) `LayerVisibilityErrorCode` 9701-9705(LAYER_CANVAS_EMPTY 9701 critical / HIDDEN_DATA_BINDING 9702 / HIDDEN_SERIAL 9703 / HIDDEN_QR_BARCODE 9704 warning / LOCKED_INVALID_OBJECTS 9705 critical;return-array 三語 severity:critical/warning **非硬阻擋**,純前端不註冊後端 `ErrorCode.cs`,`isUserHidden` 排除 `_hiddenForPreview` 預覽暫態防 false-positive);(2) 7 子功能 7 段巢狀 chain 接線總表(blockSplit→duplex→otherTools→image→cutStack→qrBarcode→layerVisibility);(3) **CutStack 接線狀態 dead-code→✅ live**(`TopBarPreviewActions.tsx:86` / `GeneratePdfButton.tsx:405`)+ QRCode/Barcode/Layer 本卡接入 4 validator;(4) Free Funnel `PreflightFunnelCTA` 三級遞進 + IDD-COM-001(全 plan 一致非阻擋)/ IDD-COM-007(forceWatermark proxy 禁 plan 字串)守護。last_synced_epic epic-eft→epic-pcpt-editor-refinement。`Skill(skill="saas-to-skill")` Mode B + 8 面向 pass(純前端 client-side preflight,無 production backend code · references/errorcode-enum-registry.md 不需同步因圖層/CutStack 純前端不註冊後端 enum)。 |
| **2.10.0** | **2026-06-26** | **eft-cut-stack-sorting-correction CR Skill Sync — §前端 ErrorCode 範圍補充新增「裁切堆疊 Preflight Validator」子段**:`CutStackErrorCode` 9401-9404(BATCH_RANGE_INVALID 9401 / M5_PRECONDITION_FAILED 9402 / DATA_EMPTY 9403 BLOCK / DATA_INSUFFICIENT 9404 WARN;return-array 範式對齊 BlockSplit/Duplex,httpStatus 422,9400-9499 專屬無重疊)+ Boy Scout pointer cross-check 加 CutStack。Version History 補登行(原 frontmatter 已升 2.10.0 但 table 行從缺)。 |
| **2.9.0** | **2026-06-26** | **eft-image-panel-v2-correction dev Skill Sync — §前端 ErrorCode 範圍補充新增「圖片 Preflight Validator」子段**:`ImageErrorCode` 圖片上傳 8601-8603 WARN(ASSET_DELETED / FORMAT_UNSUPPORTED / LOAD_FAILED)+ isPrintable 8651 INFO / 8652 dev-only WARN;純前端 client-side return-array 自包含 `ImageValidationError`(level 擴 BLOCK/WARN/INFO),無後端 `ErrorCode.cs` 對應,httpStatus 422;§2.A Contract 前置 8652 顯式化後端 `IsPrintable` 欄位 gap。Version History 補登行(原 frontmatter 已升 2.9.0 但 table 行從缺)。 |
| **2.8.0** | **2026-06-22** | **eft-other-tools-validators-preflight CR Skill Sync — §前端 ErrorCode 範圍補充新增「其他工具 Preflight Validator」子段**:`ShapeErrorCode` 9001-9007 / `TableErrorCode` 9008-9012 / `MultiSelectErrorCode` 9050-9052(純前端 client-side `return-array static validate` 範式,無後端 `ErrorCode.cs` 對應;numericCode 由 `utils/validators/ValidatorTypes.ts makeOtherToolsError` 帶,`types/ErrorCode.ts` 僅字串碼 union + `ERROR_CODE_INFO` entry httpStatus 422,`isKnownErrorCode` 經 keys 自動納入);對齊 `preflight-validation-contract.md` §6.A/§6.B/§6.D 落地回填 2026-06-22;Boy Scout pointer `BlockSplitErrorCode` 9301-9305 / Duplex 9100-9199 亦屬前端 validator(各自 Story scope)。last_synced_epic backend-vision→epic-eft。`Skill(skill="saas-to-skill")` Mode B + 8 面向 pass(純文檔同步,無 production code)。 |
| **2.7.0** | **2026-06-21** | **vision-g8-5-resilience-baseline L5 韌性文件化 — 新增 §韌性緩衝(Polly)pointer 章節**:釐清本 skill 應用層 ErrorCode + Exception 處理與**外部服務容錯韌性緩衝層(Polly 重試指數退避+Jitter / 斷路器三態 / 限流分散式固定視窗 / PDF 雙斷路器)** domain 邊界;additive pointer → `RUNBOOK-OBSERVABILITY-001`(5 類機制 file:line + 調優基準表 16 參數 NG-5 + A7 emit `ResilienceExtensions.cs:98-109` → IAlertHook)。last_synced_epic epic-eft→backend-vision。純文件化無 production code(RK-5)。`Skill(skill="saas-to-skill")` Mode B + 8 面向 pass。 |
| **2.6.0** | **2026-06-14** | **eft-cc-g-3-audit-migration CR Skill Sync — §1.4.1 Q1002/Q1005 消費端 `IQuotaAuditLogService`(子卡3 L5 audit + abuse pattern)**。`references/errorcode-enum-registry.md` §1.4.1 新增:quota reject 複用 `IUserAuditService.LogAsync` 寫 `UserAuditLog.Action="quota_violation"` + Details 6 白名單欄位(errorCode/currentBytes/maxBytes/planType/uploadType/sourceLayer,**無 PII**)fire-and-forget(BR-011)+ abuse pattern 複用 `IDistributedRateLimitStore.IncrementAsync("quota_reject:{userId}",300,5)` 第6次→429 Q1005 + Retry-After=60 + `quota_abuse_detected` audit + fail-open;4 reject 點 DRY facade(`QuotaRejectControllerExtensions` glue,IDD-COM-001 #7 正向落地);**NO Migration**(UserAuditLog.Action 自由 string)。§1.4 表 Q1005 用途 + 子卡2/3 落地狀態校正(audit_logs→UserAuditLog drift 修正)。last_synced_epic phycool-backend-correction→epic-eft。saas-to-skill Mode B + 8 面向。 |
| **2.5.0** | **2026-06-14** | **m0-6-announcement-editor-enum-json-binding CR — 新增「JSON Enum [FromBody] Binding」章節(ADR-JSON-ENUM-001)**:全域 `JsonStringEnumConverter` 雙註冊範式(`ServiceRegistrationExtensions.cs:556` ConfigureHttpJsonOptions + `:567` AddJsonOptions,與 `UtcDateTimeJsonConverter` 並存)+ read 容錯(string 大小寫不敏感 + integer 向後相容 allowIntegerValues 預設 true)+ write PascalCase enum 名 + 關鍵不對稱([FromQuery] TypeConverter 接受字串 vs [FromBody] System.Text.Json 需 converter)+ blast radius 前端 enum 消費對齊(number-keyed map 補 enum 名 key / 後端 label)+ AOT 考量(非泛型 RequiresDynamicCode · reflection 非 AOT)。triggers 加 JsonStringEnumConverter/enum binding/FromBody enum/JSON enum。last_synced_epic epic-eft→phycool-backend-correction。saas-to-skill Mode B + 8 面向。 |
| **2.4.0** | **2026-06-13** | **CC-G 子卡1 eft-cc-g-1-backend-enforce — QuotaErrorCode Q1000-Q1099 獨立 enum 落地** — `references/errorcode-enum-registry.md` 新增 §1.4 QuotaErrorCode 章節(7 值 positional [ErrorCodeInfo]:Q1000 STORAGE_QUOTA_EXCEEDED 403 / Q1001 PLAN_RESOLVE_FAILED 500 / Q1002 BATCH_QUOTA_ATOMIC_FAILED 403 / Q1003 CANVAS_JSON_QUOTA_EXCEEDED 403 / Q1004 AVATAR_QUOTA_EXCEEDED 403 / Q1005 QUOTA_ABUSE_PATTERN_DETECTED 429 / Q1006 QUOTA_OPTIMISTIC_LOCK_FAILED 409)+ §1.1 Category 表加 Quota 行(獨立 enum `QuotaErrorCode.cs` 非 `ErrorCode.cs`,走平行 `QuotaErrorCodeExtensions` Gap #4)+ `QuotaProblemDetailsFactory` RFC 7807 9 欄位 problem+json(title 短標題/detail 數據+引導,對齊 AC1)。**歷史校正**: v2.1.0(2026-05-23 父卡 audit-only)Version History 描述的規劃版 Q1000-Q1099(Max*Exceeded 系列:StorageQuotaExceeded 413/MaxProjectsExceeded/MaxDevicesExceeded/CanvasJsonSizeExceeded 413)**未實際落地**,本版以落地版取代(對齊 SDD spec §3.2)。saas-to-skill Mode B + 8 面向驗證。IL3 audit-only zero production code 改動(Skill 同步)。 |
| **2.3.0** | **2026-06-09** | **Phase D eft-qrcode-module-correction-phase-d — 後端 ErrorCode 8900-8999 14 條落地** — 後端 `ErrorCode.cs` 補 QR 8901-8907 + Barcode 8950-8957 共 14 條 enum，命名嚴格對齊前端 `types/ErrorCode.ts` SSoT；8954 BARCODE_BACKEND_UNAVAILABLE httpStatus=503（保留向後相容，警告非阻擋）；8956 RESERVED（跳號對齊前端 SSoT）；`ErrorCodeRegistry` 無 duplicate value（BuildCache_NoDuplicateEnumValues_FullScan + GetInfo 21 case xUnit PASS）；前端 types/ErrorCode.ts + preflight §5.A/§5.B + 後端 ErrorCode.cs 三方 SSoT 統一；前端 BarcodeErrorCode 6→7 條（補漏列 8955 BARCODE_SHOW_TEXT_TYPE_ERROR）。版本 2.2.0→2.3.0。 |
| **2.1.0** | **2026-05-23** | **CC-G Storage Quota Enforcement 跨切面 cross-cutting realign Step 3 — 7 位置 sync(位置 1 Skill 升版)** — 使用者 2026-05-23T01:15 OK 放行 v1(Memory id=4304)。本版補完 **QuotaErrorCode Q1000-Q1099 完整 enum + RFC 7807 problem+json range 規範**(對齊 CC-G D3 商業決策):**§ErrorCode enum 新增 Q1000-Q1099 quota range**:Q1000 `StorageQuotaExceeded`(StorageLimitMB 超過上限,httpStatus 413 Payload Too Large)/ Q1001 `MaxProjectsExceeded`(超過 MaxProjects)/ Q1002 `MaxDataRowsExceeded`(Excel/CSV 超過 MaxDataRows)/ Q1003 `MaxDevicesExceeded`(超過 MaxDevices,httpStatus 403)/ Q1004 `MaxPdfPagesExceeded`(超過 MaxPdfPages)/ Q1005 `CanvasJsonSizeExceeded`(canvasJsonV2 size 超過 MaxCanvasJsonSizeBytes,httpStatus 413)/ Q1006 `AvatarSizeExceeded`(avatar 超過 MaxAvatarSizeBytes)+ 每個 enum 含 ErrorCodeInfo attr 含 httpStatus / userMessage(zh-TW + en-US i18n) / developerMessage / planContext(plan-aware suggestion 含 upgrade link);**§ProblemDetails 補 quota 專用 helper**:`ControllerErrorExtensions.QuotaExceeded(planType, used, max, upgradeUrl)` 自動產生 RFC 7807 problem+json + 含 `type=quota/exceeded` / `title=Storage Quota Exceeded` / `status=413` / `detail=Free plan 10MB used 197MB` / `instance=/api/v1/assets/upload` / **extensions**:planType / used / max / percent / upgradeUrl / suggestedActions(["delete_old_data","upgrade_plan"]);**§FORBIDDEN 新增 3 條**(CC-G 範式):(1)「Backend upload exception 走 plain `throw new Exception("over quota")` 而非 `throw new QuotaExceededException(QuotaErrorCode.StorageQuotaExceeded, planType, used, max)`」 Common Rationalization「plain text 簡單」Red Flag「`.cs` upload action `throw new Exception(...)` 含 'quota' / 'over limit' 字串」/(2)「ProblemDetailsResult.QuotaExceeded helper 缺 extensions(planType / used / max / upgradeUrl / suggestedActions)」 Common Rationalization「basic problem+json 就夠」Red Flag「response body 缺 `extensions: { ... }` 物件」/(3)「QuotaErrorCode userMessage 缺 i18n(zh-TW + en-US)+ planContext upgrade link」 Common Rationalization「英文錯誤訊息客戶會懂」Red Flag「`[ErrorCodeInfo(userMessage=...)]` attr 只有 1 string 非 dict / 缺 upgradeUrl」。Cross-Ref: phycool-member-plans v2.3.0 §3.3 plan-aware enforcement + phycool-payment-subscription v2.1.0 §5-Layer 防呆 L3 Backend enforce + phycool-editor-data-features v4.10.0 §9 BatchImagePanel quota + Spec eft-cc-g-storage-quota-enforcement-realign-spec.md v1.0.0 §3 Data Model + Memory id=4288/4291/4294-4304 + Chrome MCP Live evidence id=4285。觸發:2026-05-23 主控端 CC-G Phase B Skill 升版 F6 SUPREME `Skill(skill="saas-to-skill")` 字面調用 Mode B + 8 面向 validation pass。IL3 audit-only zero production code 改動。 |
| **NEW** | **2026-05-16** | **Progressive Disclosure 重構**(P2-Wave-2/3)— 原 647 行 monolithic 拆為核心 + 4 references/*.md。env-cleanup P2 Skill Modularization。saas-to-skill Mode B + 8-aspect validation pass。 |
| (歷史) | — | 詳完整歷史見原 SKILL.md git log 或對應 references/*.md(若含 Version History 段)|
