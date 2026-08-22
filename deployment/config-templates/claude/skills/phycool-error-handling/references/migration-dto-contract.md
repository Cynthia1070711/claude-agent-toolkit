# phycool-error-handling — §8 Backward Compatibility + §10 DTO Entity Nullable Contract

> **抽出自** `.claude/skills/phycool-error-handling/SKILL.md` 2026-05-16 P2-Wave-2/3 modularization (saas-to-skill Mode B). 主 SKILL.md ≤300 行,本檔承載 §8 Backward Compatibility + §10 DTO Entity Nullable Contract。

---

## 8. Backward Compatibility & Migration History

| Legacy Source | Migration | Status |
|--------------|-----------|--------|
| `RefundValidationErrorCode` (C# enum) | `[Obsolete]` + `ToErrorCode()` converter | Done (QGR-S2) |
| Front-end `ParseErrorCode` (TS union) | `@deprecated` + mapped to PARSE_001~005 | Done (QGR-S2) |
| BusinessApiAuthMiddleware string codes | Changed to `ErrorCode.SYS_001` | Done (QGR-S7) |
| PdfApiController misused PROJ_001 | Changed to `ErrorCode.PDF_004` | Done (QGR-S7) |
| ProjectsController hardcoded strings | Changed to `nameof(ErrorCode.PROJ_XXX)` | Done (QGR-S7) |
| PDFJobsController 錯誤抽象改善 | BR-10: 統一使用 `ErrorCode.PDF_*` + `ProblemResult`，移除 inline 錯誤字串 | Done (fix7-21) |

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

## 10. DTO Entity Nullable Contract Sync（2026-05-12, Story: eft-worker-regression-knowledge-capture）

> **目的**：固化 DTO ↔ Entity nullable 契約不一致根因，防止 cold start 新對話視窗在 ASP.NET 400 validation 迷失。

### (a) ASP.NET Nullable Reference Types 對 ModelBinding 的影響

C# 8+ `#nullable enable`（`<Nullable>enable</Nullable>`）啟用後，屬性宣告方式直接影響 ApiController 400 validation 行為：

| DTO 屬性宣告 | HTTP PUT 不帶該欄位 | HTTP PUT 帶 null 值 |
|------------|-------------------|-------------------|
| `string BatchImages` | ModelBinder 設為 `null`，**ApiController 400**（non-nullable 屬性不能 null）| 400（同上）|
| `string? BatchImages` | ModelBinder 設為 `null`，正常（nullable，400 不觸發）| 正常 |
| `string BatchImages = ""` | ModelBinder 設為 `""`（fallback default），**不 400** | 設為 null 則 400 |

**PhyCool 根因實例（eft-excel-upload-multi-layer-fix-stack, 2026-05-12）**：
- `ProjectDataController.cs:31`：`public string? BatchImages` — 已修復為 nullable（修法後狀態）
- `Models/ProjectData.cs:20`：`public string? BatchImages` — Entity 是 nullable
- PUT `/api/v1/editor/project-data` 不帶 `BatchImages` → 修法前 ApiController auto-validation 400
- 修法：`ProjectDataController.cs:31` 改 `string? BatchImages`（對齊 Entity）

### (b) Roslyn Analyzer 配置範例

啟用 Nullable warnings 成 error，避免 DTO/Entity 契約 drift 到 runtime 才發現：

**.editorconfig**:
```ini
# DTO/Entity nullable 不對齊升 error
dotnet_diagnostic.CS8618.severity = error   # Non-nullable field not initialized
dotnet_diagnostic.CS8600.severity = warning # Converting null literal to non-nullable
dotnet_diagnostic.CS8601.severity = warning # Possible null reference assignment
dotnet_diagnostic.CS8602.severity = warning # Dereference of possibly null reference
```

**Directory.Build.props**（全專案 nullable enable）:
```xml
<PropertyGroup>
  <Nullable>enable</Nullable>
  <!-- 開發階段建議 warning，明確修復後再升 error -->
  <!-- <TreatWarningsAsErrors>true</TreatWarningsAsErrors> -->
</PropertyGroup>
```

**PR Gate 建議**：`dotnet build --warnaserror CS8618` 在 CI 強制 non-nullable field 必須初始化。

### (c) 6 常見 Contract Drift 範式 + 修法

| # | 範式 | BAD（造成問題）| GOOD（正確做法）| 根源 file:line |
|:-:|------|--------------|----------------|--------------|
| ① | **DTO 非 nullable，Entity nullable** | `string BatchImages` in DTO | `string? BatchImages` in DTO | `ProjectDataController.cs:31` vs `Models/ProjectData.cs:20` |
| ② | **Entity 升 nullable，DTO 漏跟** | Entity 加 `?`，DTO 保持 `string X` | 同步修改 DTO 加 `string? X` | Migration 後未掃 DTO |
| ③ | **ModelBinder 預設值不一致** | DTO `public int Count` — PUT 不帶 → 0（默認值）| `public int? Count` 讓 absence 和 0 可區分 | 數值型 nullable 常見 |
| ④ | **JsonConvert NullValueHandling default 不對齊** | `[JsonProperty(NullValueHandling = NullValueHandling.Ignore)]` 但 DTO 不接受 null | 移除 Ignore 或在 DTO 加 `?` | Newtonsoft.Json serialize 設定 |
| ⑤ | **DiffSync patch 部分欄位漏帶** | Patch JSON 只帶部分欄位，non-nullable DTO 欄位缺失 → 400 | DTO 所有 optional patch 欄位改 nullable，或用 `[Required]` 明確標記必填 | DiffSync 增量更新 pattern |
| ⑥ | **Migration 改欄位 nullable，EF Core scaffolding 未跟** | `ALTER COLUMN X NVARCHAR(MAX) NULL`，EF Entity 仍 `string X` | 更新 Entity `string? X` + 重跑 EF scaffolding 或手動對齊 | DB Migration 後遺症 |

**通則原則**：DTO 屬性 nullable 設定必須與 Entity 屬性以及業務規則三方一致：
- 業務上必填（NOT NULL DB）→ Entity `string X`，DTO `[Required] string X`
- 業務上可選（NULL DB）→ Entity `string? X`，DTO `string? X`
- PUT/PATCH 增量更新 → 所有欄位 nullable，後端邏輯判 null=不更新

### (d) FORBIDDEN — 防 DTO Nullable 契約再犯

❌ **DTO 屬性宣告不看 Entity nullable 直接沿用預設 non-nullable**
   Common Rationalization: "DTO 和 Entity 分離，各自設計"
   Red Flag: ApiController PUT/PATCH 請求不帶某欄位 → 400 ModelState 錯誤「The X field is required」，但業務上該欄位是可選的

❌ **nullable warning 出現時用 `#pragma warning disable` 壓制而不真正修復**
   Common Rationalization: "warning 不是 error，先壓制繼續開發"
   Red Flag: 程式碼中出現 `#pragma warning disable CS8618` 或 `null!`（null-forgiving operator）包裹 non-nullable 屬性初始化

❌ **Migration 改變欄位 nullable 後不同步更新 Entity + DTO**
   Common Rationalization: "EF Core 有 migration，跑一下就好，不需要手動改 Model"
   Red Flag: `dotnet build` 出現 CS8618，或 EF scaffolding 後 Entity 與 DTO 的 nullable annotation 不一致（需 diff 對照）

---


---
