# SDD Spec Template (PhyCool 適配版)

Replace all `{placeholders}` with actual content from the requirement discussion.

---

## Template

```markdown
# {Feature Name} — SDD Specification

| Field | Value |
|-------|-------|
| Feature ID | {EPIC-TYPE_NUMBER} |
| Priority | {P0 / P1 / P2} |
| Complexity | {M / L / XL} |
| Status | Draft |
| Created | {YYYY-MM-DD} |
| Affected Modules | {list of modules/services impacted} |

> **繁中摘要**: {一段話描述此功能解決什麼問題，給人類快速瀏覽}

## 1. Overview

### 1.1 Problem Statement

{One paragraph: what problem does this feature solve. Be specific.}

### 1.2 Scope

**In scope:**
- {What this feature WILL do — be explicit}

**Out of scope:**
- {What this feature will NOT do — prevent scope creep}

### 1.3 User Roles

| Role | Interaction |
|------|-------------|
| {Role name} | {What this role does with this feature} |

### 1.4 Success Signal

> Measurable signal that proves this feature is done — MUST include a verification command or measurable assertion (NOT descriptive like "works correctly"). Feeds the Story's D0 SPEC Kernel Success signal.

- {Measurable criterion + verification command, e.g. `dotnet test --filter {Feature}Tests` all green / API returns 200 with `{field}`==`{value}` / Chrome MCP `getComputedStyle('.foo').width`==='120px'}

## 2. Business Rules

> Every rule must be independently testable with clear input → expected output.
> **建議用 EARS 句式精確化系統契約**: `WHEN {trigger} the {system} SHALL {response}` / `IF {condition} THEN the {system} SHALL {response}` / `WHILE {state} the {system} SHALL {response}`（對齊 create-story template EARS + BDD 雙層）
> Rule ID format: BR-{SEQ} (sequential within this spec)

| Rule ID | Rule (EARS 句式建議) | Validation |
|---------|------|------------|
| BR-001 | {WHEN/IF/WHILE … SHALL … — precise testable statement} | {input → expected output} |
| BR-002 | {Next rule} | {verification method} |

## 3. Data Model

### 3.1 New Tables

```sql
CREATE TABLE [dbo].[{TableName}] (
    [{PK_Column}] INT IDENTITY(1,1) NOT NULL,
    [{Column}] NVARCHAR({length}) NOT NULL,
    [{Column}] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [{FK_Column}] INT NOT NULL,
    CONSTRAINT [PK_{TableName}] PRIMARY KEY CLUSTERED ([{PK_Column}]),
    CONSTRAINT [FK_{TableName}_{RefTable}] FOREIGN KEY ([{FK_Column}])
        REFERENCES [dbo].[{RefTable}] ([{RefPK}])
);
```

### 3.2 Modified Tables

```sql
ALTER TABLE [dbo].[{ExistingTable}]
    ADD [{NewColumn}] NVARCHAR(100) NULL;
```

### 3.3 Indexes

```sql
CREATE NONCLUSTERED INDEX [IX_{TableName}_{Column}]
    ON [dbo].[{TableName}] ([{Column}])
    INCLUDE ([{CoveringColumns}]);
```

### 3.4 Entity Relationships

- `{TableA}` 1:N `{TableB}` via `{FK_Column}`

## 4. API Specification

### 4.1 Endpoints

#### {HTTP_METHOD} {/api/v1/route}

**Description:** {What this endpoint does}

**Authorization:** {Role(s) required}

**Request:**
```json
{
  "{field}": "{SQL Server type — NVARCHAR/INT/BIT/etc}"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "{field}": "{type}"
  }
}
```

**Error Responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | E-{MODULE}{SEQ} | {When this error occurs} |
| 401 | — | Unauthenticated |
| 403 | — | Insufficient permissions |
| 404 | E-{MODULE}{SEQ} | {Resource not found condition} |

## 5. Boundary Conditions & Error Handling

| Scenario | Expected Behavior | Related BR |
|----------|-------------------|------------|
| {Input X exceeds maximum} | {Return error E-XXXX} | BR-{XXX} |
| {Required field missing} | {Return 400 with field-level errors} | BR-{XXX} |
| {Database connection fails} | {Return 503, log error} | — |
| {Concurrent modification} | {Return 409 if row version mismatch} | BR-{XXX} |

## 6. Security Considerations

- **Authentication:** Cookie-based (ASP.NET Identity)
- **Authorization:** Role-based — specify which roles: {roles}
- **Input Validation:** {Max lengths, allowed characters}
- **SQL Injection:** Parameterized queries via EF Core
- **CSRF:** AntiForgeryToken for MVC forms
- **XSS:** Razor auto-encoding + explicit sanitization for user HTML

## 7. Dependencies

| Dependency | Type | Impact |
|------------|------|--------|
| {Existing module/service} | {Calls / Called by} | {What breaks if unavailable} |

## 8. Migration Notes

- Data migration required: {Yes/No}
- Backward compatibility: {description}
- Rollback plan: {description}
```
