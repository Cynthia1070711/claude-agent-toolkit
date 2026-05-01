---
name: 'step-05b-apply-migrations'
description: 'CONDITIONAL: Apply EF Core database migrations if new migration files were created in Step 5'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-05b-apply-migrations.md'
nextStepFile: '{workflow_path}/steps/step-06-author-tests.md'
---

# Step 5b: Apply Database Migrations

**Goal:** Apply EF Core migrations and run the Migration Cascade Checklist (ADR-DB-001).

> **CRITICAL:** CONDITIONAL STEP — Only execute if new EF Core Migration files were created in Step 5.

---

## EXECUTION SEQUENCE

### 1. Detect New Migrations

Check if any new or modified Migration files exist in `Data/Migrations/*.cs` (files created during Step 5 implementation).

**If NO new migration files detected:** Skip this step — no database migrations to apply.

---

**If new or modified Migration files detected:**

### 2. Log Detection

Log to Dev Agent Record: "Migration files detected: `{migration_file_list}`"

### 3. Apply Migrations

```bash
dotnet ef database update --project src/Platform/App.Web
```

**If succeeds:**
- Log to Dev Agent Record: "✅ Database migrations applied successfully: `{migration_names}`"

**If FAILS:**

> **CRITICAL HALT:** "Database migration failed — fix migration errors before continuing"

Log error details to Dev Agent Record → Debug Log.

Common fixes:
1. Check for FK constraint violations in migration
2. Verify Model changes match migration expectations
3. Check for conflicting migrations from parallel Story branches
4. Run: `dotnet ef migrations has-pending-model-changes` to diagnose

### 4. Verify Schema Consistency

```bash
dotnet ef migrations has-pending-model-changes --project src/Platform/App.Web
```

**If pending model changes remain:**
- Log warning: "⚠️ Model changes still pending after migration — may need additional migration"

---

### 5. Migration Cascade Checklist (ADR-DB-001)

**📋 Migration Cascade Checklist** — Every migration MUST complete each item:

- [ ] **UI 層** — 新欄位/移除欄位是否需要更新顯示邏輯？（View / Razor / React 組件）
- [ ] **Service 層** — 業務邏輯是否需要更新過濾條件或查詢行為？
- [ ] **Repository / Query** — 是否需要更新 Repository 查詢或加入 `IgnoreQueryFilters()`？
- [ ] **測試資料 / Seeder** — `TestAccountSeeder` 或其他 Seeder 是否需要補充新欄位的種子資料？
- [ ] **Global Query Filter** — 含 `IsDeleted` 的實體是否已在 `OnModelCreating` 配置 `HasQueryFilter(e => !e.IsDeleted)`？
- [ ] **ModelSnapshot 一致性** — `dotnet ef migrations has-pending-model-changes` 回報 No 且 ModelSnapshot 已更新？

> ⚠️ 未勾選項目須在本 Story 完成前處理或記錄為技術債。

---

## SUCCESS METRICS

- Migrations applied successfully (if any new migrations)
- Schema consistency verified
- Migration Cascade Checklist completed

## FAILURE MODES

- Not detecting new migration files before skipping
- Not applying migrations after creation
- Skipping Migration Cascade Checklist
- Ignoring pending model changes warning

---

**NEXT:** Load `step-06-author-tests.md`
