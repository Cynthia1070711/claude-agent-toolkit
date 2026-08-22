# phycool-error-handling — §5-§7 Controller Response + ExceptionHandlerMiddleware + Front-End

> **抽出自** `.claude/skills/phycool-error-handling/SKILL.md` 2026-05-16 P2-Wave-2/3 modularization (saas-to-skill Mode B). 主 SKILL.md ≤300 行,本檔承載 §5-§7 Controller Response + ExceptionHandlerMiddleware + Front-End。

---

## 5. Controller Error Response

**File**: `Extensions/ControllerErrorExtensions.cs`

### 5.1 ProblemResult Extension Method

```csharp
// In any Controller or ControllerBase:

// Basic usage
return this.ProblemResult(_errorRegistry, ErrorCode.AUTH_001);
// Returns: { type: "AUTH_001", title: "TokenExpired", status: 401,
//            detail: "Login expired...", instance: "/api/v1/projects" }

// With custom detail message
return this.ProblemResult(_errorRegistry, ErrorCode.PROJ_002,
    "You have reached the maximum of 10 projects.");
```

### 5.2 Manual ErrorResponse Pattern (legacy)

Some controllers still use inline anonymous objects:

```csharp
// Legacy pattern (still works, but prefer ProblemResult)
return StatusCode(401, ErrorResponse(ErrorCode.BAPI_001));
return BadRequest(ErrorResponse(ErrorCode.SEC_001));
```

### 5.3 DiffSync Error Usage

DiffSync responses use `nameof()` for compile-time safety:

```csharp
// ProjectsController.cs
new DiffSyncConflictResponse
{
    Error = nameof(ErrorCode.PROJ_005),  // "PROJ_005"
    // ...
}
```

---

## 6. ExceptionHandlerMiddleware

**File**: `Middleware/ExceptionHandlerMiddleware.cs`

Global exception handler at the outermost layer of the middleware pipeline.

### 6.1 Pipeline Position

```
ExceptionHandlerMiddleware  <-- OUTERMOST (catches everything)
  ...all other middleware...
    MapControllerRoute / MapRazorPages
```

### 6.2 Exception Handling Strategy

| Exception Type | API Path (`/api/**`) | MVC Path |
|---------------|---------------------|----------|
| `OperationCanceledException` (client abort) | HTTP 499, LogDebug | HTTP 499, LogDebug |
| `DbUpdateException` (FK violation) | HTTP 409 ProblemDetails | Re-throw |
| `DbUpdateException` (other DB) | HTTP 500 ProblemDetails | Re-throw |
| Generic `Exception` | HTTP 500 ProblemDetails | Re-throw to `UseExceptionHandler` |

### 6.3 API Error Response Format (RFC 7807)

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.6.1",
  "title": "Internal server error",
  "status": 500,
  "detail": "An error occurred processing your request.",
  "traceId": "00-abc123..."
}
```

### 6.4 Security Rules

- **Production**: `detail` contains generic message only (no stack trace, no exception message)
- **Development**: `detail` includes `ex.Message` for debugging
- **All environments**: `traceId` always included for log correlation
- **DB errors**: Never expose SQL error details to client

### 6.5 FK Violation Detection

Recursively checks `InnerException` chain for `SqlException.Number == 547`:

```csharp
private static bool IsForeignKeyViolation(Exception ex)
{
    var current = ex;
    while (current != null)
    {
        if (current is SqlException sqlEx && sqlEx.Number == 547)
            return true;
        current = current.InnerException;
    }
    return false;
}
```

---

## 7. Front-End Integration

### 7.1 TypeScript Error Code Type Guard

**File**: `ClientApp/src/types/ErrorCode.ts`

```typescript
// Set of all known error codes for fast lookup
const KNOWN_ERROR_CODES = new Set<string>([
    'AUTH_001', 'AUTH_002', 'AUTH_003', 'AUTH_004',
    'PROJ_001', 'PROJ_002', 'PROJ_003', ...
]);

export function isKnownErrorCode(code: string): code is ErrorCode {
    return KNOWN_ERROR_CODES.has(code);
}
```

### 7.2 handleApiError (Unified Error Handler)

**File**: `ClientApp/src/utils/apiErrorHandler.ts`

```typescript
const problem = await handleApiError(response, {
    // Custom override (return true = handled)
    override: (code, problem) => {
        if (code === 'PROJ_002') { showUpgradeModal(); return true; }
        return false;
    },
    onRedirectToLogin: () => router.push('/login'),
    onShowUpgradePrompt: () => setShowUpgrade(true),
    onToast: (msg) => toast.error(msg),
});
```

### 7.3 Default Strategies

| Error Code | Default Action |
|-----------|---------------|
| `AUTH_001` | Clear auth token + redirect to login |
| `PROJ_002` | Show upgrade prompt |
| All others | Show toast with `problem.detail` |

### 7.4 Processing Flow

1. Check `response.ok` -- if true, return null (no error)
2. Parse `application/problem+json` body
3. Extract `type` field (= error code string)
4. Call `isKnownErrorCode(type)` to get user message
5. Execute `options.override` if provided
6. Execute default strategy (`applyDefaultStrategy`)
7. Show toast (enabled by default)

### 7.5 Frontend SERIAL Toast Mapping (v1.2.0, 2026-05-11)

> **Story**: `pcpt-editor-serial-member-scope-frontend-hydration`
> **Source**: `src/stores/memberSerialGeneratorStore.ts:errorMessage()`
> **Pattern**: `SerialApiError` class (code/status/detail) + `useUIStore.getState().showError(msg)`

| Error Code | HTTP | UI Toast 訊息 |
|-----------|:----:|--------------|
| `SERIAL_LIMIT_EXCEEDED` | 400 | 「最多 10 個序號產生器,請先刪除不再使用的」 |
| `SERIAL_RANGE_EXCEEDED` | 400 | 「序號區間最大 2000」 |
| `SERIAL_RANGE_INVALID` | 400 | backend detail message |
| `SERIAL_PLAN_REQUIRED` | 403 | 「序號功能需進階版以上方案」 |
| `SERIAL_NOT_FOUND` | 404 | 「找不到指定的序號產生器(可能已被刪除)」 + force fetch |
| `SERIAL_NAME_CONFLICT` | 409 | 「相同名稱的序號產生器已存在」 |
| `UNAUTHORIZED` | 401 | 「登入已逾期,請重新登入」 + redirect |
| 其他 5xx | 5xx | 「序號伺服器暫時無回應,請稍後重試」 |

**Optimistic rollback**: UI 呼叫 createAsync/updateAsync/deleteAsync 後, 若 API 失敗→ store rollback temp state → showError。

### 7.6 Frontend QR/Barcode Toast Mapping (v2.13.0, 2026-07-03)

> **Story**: `eft-qrcode-generator-store`(子卡 B1 前端資料層)
> **Source**: `src/stores/memberQrBarcodeGeneratorStore.ts:errorMessage()`
> **Pattern**: `QrBarcodeApiError` class (code/status/detail) + `useUIStore.getState().showError(msg)`(對稱 §7.5 SERIAL)

| Error Code | HTTP | UI Toast 訊息 |
|-----------|:----:|--------------|
| `QR_BARCODE_GENERATOR_001` (LIMIT) | 400 | 「最多 10 個 QR/條碼產生器,請先刪除不再使用的」 |
| `QR_BARCODE_GENERATOR_002` (NOT_FOUND) | 404 | 「找不到指定的產生器(可能已被刪除)」 + create 分支 force fetch |
| `QR_BARCODE_GENERATOR_003` (NAME_CONFLICT) | 409 | 「相同名稱的 QR/條碼產生器已存在」 |
| `QR_BARCODE_GENERATOR_004` (INVALID_CONFIG) | 422 | backend `detail` message(fallback「產生器設定無效」)|
| `QR_BARCODE_GENERATOR_005` (REORDER_FAILED) | 400 | 「排序更新失敗,請重試」 + reorder 分支 force fetch |
| `UNAUTHORIZED` | 401 | 「登入已逾期,請重新登入」 + redirect(實際 401 走 `e.status` 判定;bare `Unauthorized()` 無 body → code=`HTTP_401`)|
| 其他 5xx | 5xx | 「QR/條碼伺服器暫時無回應,請稍後重試」 |

**契約關鍵(code vs type)**: 後端 `ControllerErrorExtensions.ProblemResult` → `ErrorCodeRegistry.ToProblemDetails`(`ErrorCodeRegistry.cs:44` `Type = info.Code`;`:83/:86` `codeString = field.Name`)將 **ErrorCode enum 成員名**(`QR_BARCODE_GENERATOR_001`)寫入 `ProblemDetails.Type`;標準 problem+json **無 `code` 欄位**。故前端 `handleResponse` 採 `code ?? type` fallback(優先 `problem.code` 向後相容,實際命中 `problem.type`)。§7.4 步驟 3「Extract `type` field」為此契約 SSoT。此為與 §7.5 SERIAL 的**契約差異**(Serial `handleResponse` 僅讀 `code`,QR 補 `type` fallback 對齊真實後端序列化)。

**Optimistic rollback**: createAsync/updateAsync/deleteAsync/reorderAsync/toggleEnabledAsync 失敗 → store rollback 快照(prevConfig / prevOrder / prev isEnabled)→ showError。詳 `phycool-editor-data-features §2.9 Member-Scoped QR/Barcode Generator Store`。

---


---
