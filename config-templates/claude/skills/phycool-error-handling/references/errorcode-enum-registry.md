# phycool-error-handling — §1-§4 ErrorCode Enum + Attribute + Extensions + Registry

> **抽出自** `.claude/skills/phycool-error-handling/SKILL.md` 2026-05-16 P2-Wave-2/3 modularization (saas-to-skill Mode B). 主 SKILL.md ≤300 行,本檔承載 §1-§4 ErrorCode Enum + Attribute + Extensions + Registry。

---

## 1. ErrorCode Enum

**File**: `Models/Enums/ErrorCode.cs`

Every error code is an enum value with an `[ErrorCodeInfo]` attribute that carries metadata (HTTP status, internal ID, user message, handling suggestion).

### 1.1 Error Code Categories

| Category | Prefix | Range | Count | 最後更新 Story |
|----------|--------|-------|-------|--------------|
| Auth (authentication/authorization) | `AUTH_` | 1001-1005 | 5 | epic-qgr S2 |
| Project (resources/sync) | `PROJ_` | 2001-2005 | 5 | epic-qgr S7 |
| PDF (generation) | `PDF_` | 3001-3004 | 4 | epic-qgr S7 (fix7-21) |
| Payment (orders/refunds) | `PAY_` | 4001-4011 | 11 | epic-qgr S2 |
| Business API (external) | `BAPI_` | 5001-5005 | 5 | epic-qgr S7 |
| Excel Parse | `PARSE_` | 6001-6005 | 5 | epic-qgr S2 |
| Data Quota (plan-aware) | `DATA_` | 6101 | 1 | eft-excel-upload-plan-quota-enforcement (2026-05-12, planned) |
| Security | `SEC_` | 7001 | 1 | epic-qgr S7 |
| Account (data rights) | `ACCOUNT_` | 8001-8005 | 5 | epic-qgr S2 |
| Editor / Serial 序號 | `SERIAL_` | 8501-8506 | 6 | epic-pcpt-editor-refinement |
| System | `SYS_` | 9001 | 1 | epic-qgr S7 |
| Quota 儲存配額 (獨立 enum `QuotaErrorCode.cs`,非 `ErrorCode.cs`) | `Q` | 1000-1006 | 7 | eft-cc-g-1-backend-enforce (2026-06-13) |

### 1.2 Adding a New Error Code

```csharp
// 1. Add to ErrorCode.cs with [ErrorCodeInfo] attribute
/// <summary>Brief description</summary>
[ErrorCodeInfo(
    httpStatus: 400,         // HTTP status code (4xx or 5xx)
    internalId: "MyError",   // English identifier for logs
    userMessage: "User-facing message in Chinese",
    handlingSuggestion: "Front-end handling guidance (optional)"
)]
NEW_001 = XXXX,  // Unique int value in correct range
```

Rules:
- HTTP status must be 4xx or 5xx
- `internalId` must be unique English identifier
- `userMessage` must be user-friendly Traditional Chinese
- Int value must follow category range convention
- Every enum field **must** have `[ErrorCodeInfo]` attribute

### 1.2b DATA_* 資料配額錯誤碼 (61xx) — ✅ IMPLEMENTED (2026-05-12)

Story: `eft-excel-upload-plan-quota-enforcement` (P0/M DONE)

> 對齊 phycool-member-plans MaxDataRows quota enforcement + Spec #14 §3.6 zero-trust。
> 後端 service: `DashboardService.GetMaxDataRowsAsync(planType)` (`DashboardService.cs:454-465`)。

| Code | Value | HTTP | InternalId | UserMessage | Source |
|------|-------|------|-----------|-------------|--------|
| `DATA_001` | 6101 | 400 | DataQuotaExceeded | 資料筆數超過您目前方案上限 ({maxRows} 筆)，請升級方案或減少筆數 | `ProjectDataController.UpdateProjectData` (L4 zero-trust) |
| `DATA_002` | 6102 | 400 | InvalidContentJson | 資料格式錯誤，ContentJson 必須為合法的 JSON 陣列 | `ProjectDataController.UpdateProjectData` (parse guard) |

**ProblemDetails extensions** (RFC 9110):
```json
{
  "errorCode": "DataQuotaExceeded",
  "maxRows": 50,
  "actualRows": 51,
  "planType": "Free",
  "upgradeUrl": "/Member/Subscription"
}
```

> **2026-06-06 A2 校正(F-A2-09 六源污染)**: 原值 `/Subscription/Upgrade` live 實測 **404**(SubscriptionController 不存在)。本表已改為正確目標;code 現況 `ProjectDataController.cs:152` 仍回傳死路由(全 backend 唯一例外 — ProjectsController/ProjectController/ProjectCategoryController ×7 處皆 `/Member/Subscription`),與 `useUpgradeToast.ts:30` + test 2 處同接 Phase D `eft-upgrade-cta-route-unify`。

**Frontend handling (L5)**: `useUpgradeToast` hook 偵測 `errorCode === 'DataQuotaExceeded'` → 顯示 plan-aware warning toast + `[升級方案]` CTA → `/Member/Subscription`(F-A2-09 校正;原 `/Subscription/Upgrade` 404)（`DataImportModal.tsx handleConfirm` error path）。

**Backend evidence**:
- `Models/Enums/ErrorCode.cs` DATA_001 = 6101 / DATA_002 = 6102 (eft-excel-upload-plan-quota-enforcement 新增)
- `Controllers/ProjectDataController.cs` UpdateProjectData: JsonDocument.RootElement.GetArrayLength() → GetMaxDataRowsAsync → BadRequest(ProblemDetails)

---

### 1.3 SERIAL_* 序號功能錯誤碼 (85xx)

Story: `pcpt-editor-serial-member-scope-migration` (2026-05-11)

> ⚠️ **重要**: 85xx 範圍 (非 80xx)。80xx 已被 ACCOUNT_* (8001-8005) 占用。ErrorCodeRegistry._cache 以 enum value 為 key，duplicate value 會 overwrite (CRITICAL bug)。

| Code | Value | HTTP | InternalId | UserMessage |
|------|-------|------|-----------|-------------|
| `SERIAL_001` | 8501 | 400 | SerialLimitExceeded | 最多 10 個序號產生器 |
| `SERIAL_002` | 8502 | 400 | SerialRangeExceeded | 序號區間最大 2000 |
| `SERIAL_003` | 8503 | 400 | SerialRangeInvalid | 序號區間設定錯誤 |
| `SERIAL_004` | 8504 | 403 | SerialPlanRequired | 序號功能需進階版以上方案 |
| `SERIAL_005` | 8505 | 404 | SerialNotFound | 找不到指定的序號生成器 |
| `SERIAL_006` | 8506 | 409 | SerialNameConflict | 生成器名稱已存在 |

File: `Models/Enums/ErrorCode.cs:243-265` (SERIAL_001-006 section)

---

### 1.4 QuotaErrorCode Q1000-Q1099 儲存配額錯誤碼 — ✅ IMPLEMENTED (2026-06-13, CC-G 子卡1)

Story: `eft-cc-g-1-backend-enforce` (P0/M DONE) — 後端 L3/L4 Quota Enforce (修 FREE 197MB 漏洞)

> ⚠️ **獨立 enum**: `QuotaErrorCode` 是**獨立 enum** (`Models/Enums/QuotaErrorCode.cs`),**非**混入 `ErrorCode.cs`。
> 因 `ErrorCodeExtensions.GetInfo()` 綁定 `ErrorCode` 型別 (非泛型),`QuotaErrorCode` 走**平行** `QuotaErrorCodeExtensions` (SDD Contract Gap #4)。
> 對外 errorCode 字串 = `"Q"` 前綴 + enum value (如 1003 → `"Q1003"`,`GetCodeString()`)。
>
> **歷史校正**: SKILL.md v2.1.0 Version History (2026-05-23 父卡 audit-only 階段) 曾描述規劃版 Q1000-Q1099
> (`StorageQuotaExceeded` 413 / `MaxProjectsExceeded` / `MaxDevicesExceeded` / `CanvasJsonSizeExceeded` 413 等 Max*Exceeded 系列),
> **該規劃版未實際落地**。本表為實際落地版 (對齊 SDD spec `eft-cc-g-storage-quota-enforcement-realign-spec.md` §3.2),**取代規劃版**。

| Code | Value | HTTP | InternalId | UserMessage | 用途 |
|------|-------|------|-----------|-------------|------|
| `STORAGE_QUOTA_EXCEEDED` | 1000 | 403 | STORAGE_QUOTA_EXCEEDED | 儲存空間已達上限，請刪除舊檔或升級方案 | image 累計泛用 |
| `PLAN_RESOLVE_FAILED` | 1001 | 500 | PLAN_RESOLVE_FAILED | 方案資訊讀取失敗，請稍後再試 | user / PlanType 解析失敗 |
| `BATCH_QUOTA_ATOMIC_FAILED` | 1002 | 403 | BATCH_QUOTA_ATOMIC_FAILED | 批次上傳累計超過剩餘空間，已部分中止 | 累計 atomic UPDATE rowsAffected=0 |
| `CANVAS_JSON_QUOTA_EXCEEDED` | 1003 | 403 | CANVAS_JSON_QUOTA_EXCEEDED | 專案資料超過方案上限，請簡化內容或升級方案 | canvasJsonV2 per-file (ProjectsController) |
| `AVATAR_QUOTA_EXCEEDED` | 1004 | 403 | AVATAR_QUOTA_EXCEEDED | 頭像檔案超過方案上限 | avatar per-file (MemberAssetController) |
| `QUOTA_ABUSE_PATTERN_DETECTED` | 1005 | 429 | QUOTA_ABUSE_PATTERN_DETECTED | 操作過於頻繁，請稍後再試 | 子卡3 `IQuotaAuditLogService` 偵測 (5min/5 reject→第6次,Retry-After=60,見 §1.4.1) |
| `QUOTA_OPTIMISTIC_LOCK_FAILED` | 1006 | 409 | QUOTA_OPTIMISTIC_LOCK_FAILED | 同時上傳衝突，請重試 | 純併發競態可重試 |

**RFC 7807 9 欄位 problem+json** (`QuotaProblemDetailsFactory.Build/BuildResult`,content-type `application/problem+json`):
```json
{ "type": "CANVAS_JSON_QUOTA_EXCEEDED", "title": "專案資料超過方案上限",
  "detail": "目前佔用 12.0 MB / 10.0 MB（120%），請簡化內容或升級方案",
  "status": 403, "errorCode": "Q1003", "upgradeUrl": "/Member/Subscription",
  "currentBytes": 12582912, "maxBytes": 10485760, "planType": "Free" }
```
> RFC 7807 語意 (對齊 AC1 凍結範例): `title` = 短標題 (occurrence-agnostic,userMessage 全形逗號前段);
> `detail` = 本次佔用數據 + actionable 引導 (userMessage 逗號後段);9 欄位 = type/title/detail/status + Extensions[errorCode/upgradeUrl/currentBytes/maxBytes/planType]。

**QuotaErrorCodeExtensions** (平行 extension · `Models/Enums/QuotaErrorCodeExtensions.cs`):
`GetInfo()` (reflection 取 [ErrorCodeInfo]) / `GetHttpStatus()` / `GetUserMessage()` / `GetInternalId()` / `GetCodeString()` ("Q"+value)。

**Backend evidence**:
- `Models/Enums/QuotaErrorCode.cs:18-47` (7 值 positional [ErrorCodeInfo],對齊 ErrorCodeInfoAttribute positional 簽章)
- `Models/Enums/QuotaErrorCodeExtensions.cs:14-41` (平行 extension Gap #4)
- `Services/Quota/QuotaProblemDetailsFactory.cs:31-72` (Build 9 欄位 + BuildResult content-type;只回 used/max bytes + planType 不回檔名/路徑 = 避 PII)
- 消費路徑: `ProjectsController` (canvas Q1003) / `MemberAssetController` (avatar Q1004) / `AssetUploadService` (image Q1002)
- **子卡2** (eft-cc-g-2-frontend-quota-ux DONE) frontend 對齊 errorCode;**子卡3** (eft-cc-g-3-audit-migration DONE) L5 audit + abuse 偵測 — 見 §1.4.1

> 配額 enforce facade (IQuotaEnforcer L3/L4 plan-aware + atomic) 詳見 `phycool-member-plans` §IQuotaEnforcer。

---

### 1.4.1 Q1002/Q1005 消費端 — IQuotaAuditLogService (L5 audit + abuse pattern) — ✅ IMPLEMENTED (2026-06-14, CC-G 子卡3)

Story: `eft-cc-g-3-audit-migration` (P0/M DONE) — quota reject L5 稽核 + abuse 偵測 facade。**NO Migration 校正**:audit_logs 表不存在 → 寫既有 `UserAuditLog` (`Action` 自由 string `[MaxLength(50)]` 無 enum/CHECK,寫 `quota_violation`/`quota_abuse_detected` 純資料,`ef migrations has-pending-model-changes → No changes`)。

`IQuotaAuditLogService.LogQuotaViolationAsync(userId, QuotaEnforceResult, UploadType, sourceLayer, ip?, ua?)` → `QuotaAuditResult{AbuseDetected, RejectCount, RetryAfterSeconds}`:

1. **L5 audit** (每次 reject):複用 `IUserAuditService.LogAsync` 寫 `UserAuditLog.Action="quota_violation"` + Details JSON **6 白名單欄位** (`errorCode/currentBytes/maxBytes/planType/uploadType/sourceLayer`,**不記檔名/路徑 PII**);**fire-and-forget** — 寫入失敗 catch 不拋例外 (對齊 `UserAuditService` BR-011,避免 audit 成 DoS 放大面);ip/ua 先 `Truncate` 至 45/500 防欄位上限截斷 silent fail。
2. **abuse pattern** (Q1005):複用 `IDistributedRateLimitStore.IncrementAsync("quota_reject:{userId}", 300, 5)` → 第 6 次 `IsAllowed=false` → `AbuseDetected=true` + 寫 `Action="quota_abuse_detected"` audit (Details `{rejectCount,windowSeconds:300,lockSeconds:60}`) + `LogWarning "[QuotaAbuse]"` (admin 被動稽核,對齊 ADR-MVP-OPS-001 不主動 push) → 呼叫端回 **429 Q1005 + Retry-After=60**;偵測失敗 **fail-open** (回 Normal,不誤鎖正常上傳)。
3. **4 reject 點 DRY facade** (IDD-COM-001 #7 正向落地 — reject 寫 audit 非僅 LogWarning):`ProjectsController` Update/PatchCanvas (canvas L3) + `MemberAssetController` UploadAvatar (avatar L3) + `AssetUploadService` image 累計 (L4,service 層注入 `IHttpContextAccessor` 取 ip/ua,背景任務 null-safe);controller problem+json 走共用 glue `QuotaRejectControllerExtensions.BuildQuotaRejectResult` (abuse→429 / 否則原 403),image 路徑 service 回 `AssetUploadResult.AbuseDetected` 信號轉 429。

**Backend evidence**:
- `Services/Quota/IQuotaAuditLogService.cs` (facade 介面 + `QuotaAuditResult` record Normal/Abuse factory)
- `Services/Quota/QuotaAuditLogService.cs:51-128` (audit 寫入 + abuse 分支 + 雙層 fail-open) / `:134-156` (BuildViolationDetails 6 欄位 + Truncate)
- `Services/Quota/QuotaRejectControllerExtensions.cs:24-37` (reject→403/429 共用 glue + Retry-After header)
- DI: `ServiceRegistrationExtensions.cs` `AddScoped<IQuotaAuditLogService, QuotaAuditLogService>` (Scoped;複用 IUserAuditService + IDistributedRateLimitStore〔Singleton〕)

> abuse 偵測複用 rate-limit 基建詳見 `phycool-security-middleware` §Distributed Rate Limiting (quota abuse pattern 複用案例)。`UserAuditLog` INSERT+SELECT only (個資法§27 不可篡改) 詳見 `phycool-privacy-legal`。

---

## 2. ErrorCodeInfoAttribute

**File**: `Models/Enums/ErrorCodeInfoAttribute.cs`

Metadata attribute attached to each `ErrorCode` enum value:

```csharp
[AttributeUsage(AttributeTargets.Field, AllowMultiple = false, Inherited = false)]
public sealed class ErrorCodeInfoAttribute : Attribute
{
    public int HttpStatus { get; }           // HTTP 4xx/5xx
    public string InternalId { get; }        // English log identifier
    public string UserMessage { get; }       // UI display message (zh-TW)
    public string? HandlingSuggestion { get; } // Front-end handling hint
}
```

---

## 3. ErrorCodeExtensions

**File**: `Models/Enums/ErrorCodeExtensions.cs`

Convenience extension methods for direct enum-level access (uses Reflection per call):

```csharp
ErrorCode code = ErrorCode.AUTH_001;

// Get full attribute
ErrorCodeInfoAttribute attr = code.GetInfo();

// Get specific properties
int status = code.GetHttpStatus();          // 401
string msg = code.GetUserMessage();         // "Login expired..."
string id = code.GetInternalId();           // "TokenExpired"
string str = code.GetCodeString();          // "AUTH_001"
```

**Note**: For high-frequency lookups, use `IErrorCodeRegistry` instead (cached).

---

## 4. ErrorCodeRegistry (Singleton)

**File**: `Services/ErrorCodeRegistry.cs` + `Services/IErrorCodeRegistry.cs`

Singleton service that builds a cached dictionary at startup via Reflection scan. Use this for production code (O(1) lookup).

### 4.1 Interface

```csharp
public interface IErrorCodeRegistry
{
    // Get error code info (throws if not found)
    ErrorCodeInfo GetInfo(ErrorCode code);

    // Convert to RFC 7807 ProblemDetails
    ProblemDetails ToProblemDetails(ErrorCode code, string? instance = null);

    // Validate string is a known error code
    bool IsValid(string codeString);

    // Bidirectional lookup: string -> enum
    bool TryGetByString(string codeString, out ErrorCode code);
}
```

### 4.2 ErrorCodeInfo Record

```csharp
public sealed record ErrorCodeInfo(
    string Code,                    // "AUTH_001"
    int HttpStatus,                 // 401
    string InternalId,              // "TokenExpired"
    string UserMessage,             // User-facing message
    string? HandlingSuggestion      // Front-end hint
);
```

### 4.3 DI Registration

```csharp
// Program.cs
builder.Services.AddSingleton<IErrorCodeRegistry, ErrorCodeRegistry>();
```

### 4.4 BuildCache Mechanism

At construction, scans all `ErrorCode` enum fields with `[ErrorCodeInfo]` attribute and builds two dictionaries:
- `_cache`: `ErrorCode -> ErrorCodeInfo` (enum to info)
- `_stringLookup`: `string -> ErrorCode` (case-insensitive string to enum)

---


---
