# Skill 類型完整範例

> 每個範例展示不同的 frontmatter 功能組合

---

## 1. 程式碼產生器（任務型 + 參數 + 禁止自動觸發）

```yaml
---
name: aspnet-api-generator
description: 產生 ASP.NET Core MVC API 程式碼。當使用者要求建立 API Controller、產生 CRUD 操作、或建立 Model 類別時觸發。
disable-model-invocation: true
argument-hint: "[EntityName] — e.g., Product, Order"
allowed-tools: Read, Write, Edit, Bash(dotnet *)
---

# ASP.NET Core API Generator

產生 $ARGUMENTS 的完整 CRUD API：

## 步驟
1. 確認 $0 的屬性（詢問使用者）
2. 產生 Model: `Models/$0.cs`
3. 產生 Controller: `Controllers/$0Controller.cs`
4. 產生 Migration: `dotnet ef migrations add Add$0`

## Controller 範本

```csharp
[ApiController]
[Route("api/[controller]")]
public class $0Controller : ControllerBase
{
    private readonly AppDbContext _db;
    public $0Controller(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
        => Ok(await _db.$0s.ToListAsync());
}
```

## 腳本
- `scripts/generate_model.py` - 產生 Model
- `scripts/generate_controller.py` - 產生 Controller
```

---

## 2. PR 摘要（隔離執行 + 動態注入 + Explore agent）

```yaml
---
name: pr-summary
description: Summarize a pull request with risk assessment and review suggestions
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull Request Context

- PR diff: !`gh pr diff`
- PR metadata: !`gh pr view --json title,body,additions,deletions`
- Changed files: !`gh pr diff --name-only`
- PR comments: !`gh pr view --comments`

## Task

Analyze this pull request:

1. **Summary**: 2-3 sentences describing the change
2. **Key Changes**: Bullet list of significant modifications
3. **Risk Assessment**: HIGH/MEDIUM/LOW with explanation
4. **Review Suggestions**: What reviewers should focus on
5. **Missing**: Tests, docs, or edge cases not covered
```

---

## 3. 背景知識（Claude 自動載入 + 隱藏選單）

```yaml
---
name: legacy-payment-context
description: Legacy payment system architecture context. Use when working with payment code, ECPay integration, or refund logic.
user-invocable: false
---

## 金流系統注意事項

- ECPay webhook 回呼可能延遲 5-30 秒，不要用同步等待
- 退款僅限 Admin 特殊處理（無自助退款）
- `CheckMacValue` 簽章驗證必須在處理前完成
- 測試環境用 `stage.ecpay.com.tw`，正式用 `payment.ecpay.com.tw`

## 常見陷阱

- OrderId 格式必須 ≤20 字元（ECPay 限制）
- 重複 webhook 通知：用 OrderId + RtnCode 做冪等檢查
```

---

## 4. 部署工具（禁止自動 + 指定參數 + 工具限制）

```yaml
---
name: deploy-staging
description: Deploy application to staging environment
disable-model-invocation: true
argument-hint: "[version-tag] — e.g., v1.2.3"
allowed-tools: Bash(git *), Bash(az *), Bash(curl *)
shell: bash
---

# Deploy to Staging

Version: $ARGUMENTS

## Pre-flight checks
- Current branch: !`git branch --show-current`
- Uncommitted changes: !`git status --porcelain`
- Last commit: !`git log --oneline -1`

## Deploy Steps

1. Tag the release: `git tag $0`
2. Push tag: `git push origin $0`
3. Deploy: `az webapp deploy --name staging-app --src-url "https://releases/$0.zip"`
4. Health check: `curl -f https://staging.example.com/health`
5. Smoke test: `curl -f https://staging.example.com/api/status`

## Rollback

If any step fails:
```bash
az webapp deployment slot swap --name staging-app --slot previous
```
```

---

## 5. 資料庫輔助（參考型 + supporting files）

```yaml
---
name: sql-helper
description: SQL Server query and schema assistant. Use when writing SQL, creating tables, or analyzing database schema.
argument-hint: "[operation] — e.g., create-table, optimize-query, migration"
allowed-tools: Read, Grep, Glob
---

# SQL Helper

Operation: $ARGUMENTS

## Quick Reference

### 分頁查詢
```sql
SELECT * FROM {Table}
ORDER BY {Column}
OFFSET @PageSize * (@PageNumber - 1) ROWS
FETCH NEXT @PageSize ROWS ONLY
```

### 交易範本
```sql
BEGIN TRY
    BEGIN TRANSACTION
    -- operations
    COMMIT
END TRY
BEGIN CATCH
    ROLLBACK
    THROW
END CATCH
```

## 詳細資源

- 完整 Schema 見 [database-schema.md](references/database-schema.md)
- 效能調校指引見 [performance-guide.md](references/performance-guide.md)
- Migration 慣例見 [migration-conventions.md](references/migration-conventions.md)
```

---

## 6. Session 記錄器（用 session ID + 腳本）

```yaml
---
name: session-logger
description: Log session activity and decisions for team review
disable-model-invocation: true
argument-hint: "[summary] — brief description of what was done"
---

# Session Logger

Record to `logs/${CLAUDE_SESSION_ID}.md`:

## Entry
- **Time**: !`date +%Y-%m-%dT%H:%M:%S%z`
- **Branch**: !`git branch --show-current`
- **Summary**: $ARGUMENTS

## Auto-capture
- Files changed this session: !`git diff --name-only HEAD`
- Lines added/removed: !`git diff --stat HEAD`
```

---

## 7. 多框架遷移器（多參數 + $N 縮寫）

```yaml
---
name: migrate-component
description: Migrate a component from one framework to another. Preserves behavior and tests.
disable-model-invocation: true
argument-hint: "[component] [from-framework] [to-framework]"
---

# Component Migration

Migrate the **$0** component from **$1** to **$2**.

## Steps

1. Read the current `$0` component implementation
2. Identify all props, state, events, and lifecycle hooks
3. Map $1 patterns to $2 equivalents
4. Rewrite the component in $2
5. Update imports in consuming files
6. Verify existing tests still pass (adapt test utilities if needed)

## Preserve
- All existing behavior and edge cases
- Accessibility attributes
- CSS class names and styles
- Test coverage
```

---

## 8. 唯讀審查器（context fork + 工具限制 + hooks）

```yaml
---
name: security-scan
description: Scan codebase for security vulnerabilities. Read-only, never modifies files.
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
effort: high
hooks:
  PreToolUse:
    - matcher: "Write|Edit|Bash"
      hooks:
        - type: command
          command: "echo 'BLOCKED: security-scan is read-only' >&2 && exit 2"
---

# Security Scan

ultrathink

Perform a thorough security audit:

1. **Secrets**: Search for hardcoded API keys, passwords, tokens
2. **Injection**: Check for SQL injection, XSS, command injection
3. **Auth**: Verify authentication and authorization patterns
4. **CSRF**: Check form submissions have anti-forgery tokens
5. **Dependencies**: Flag known vulnerable packages

Report format:
- CRITICAL / HIGH / MEDIUM / LOW severity
- File:line reference for each finding
- Recommended fix
```

---

---

## 9. SaaS 模組 Skill（含 watches + lifecycle）

> **適用場景**：管理 PhyCool SaaS 平台特定功能模組（如付款、會員、通知）的 Skill，需要隨 Story 演進自動偵測過期。

```yaml
---
name: phycool-payment-subscription
description: >-
  PhyCool 付款與訂閱模組開發指引。當處理 ECPay 金流整合、訂閱方案邏輯、發票開立、
  退款規則時觸發。支援：(1) AIO 付款流程，(2) 訂閱週期管理，(3) ECPay 簽章驗證。
  觸發關鍵字：ECPay, 訂閱, 付款, 發票, 退款
user-invocable: false
version: 2.3.0
updated: 2026-04-05
author: CC-OPUS
created: 2025-11-01
last-synced-epic: epic-pm
last-synced-date: 2026-04-05
watches:
  - glob: "src/YourApp/Web/Services/Payment*.cs"
    label: "付款服務變更偵測"
  - glob: "src/YourApp/Web/Models/Subscription*.cs"
    label: "訂閱 Model 變更偵測"
  - glob: "src/YourApp/Web/Controllers/PaymentController.cs"
    label: "付款 Controller 變更偵測"
---

# PhyCool 付款訂閱模組

## 退款政策（CRITICAL）
- 7 天試用期 + 收費後不退款
- 無自助退款 — 僅 Admin 特殊處理

## ECPay 整合注意事項
- CheckMacValue 簽章驗證必須在處理前完成
- Webhook 回呼可能延遲 5-30 秒，不得同步等待
- OrderId 格式 ≤ 20 字元（ECPay 限制）
- 重複 webhook：用 OrderId + RtnCode 做冪等檢查

## 詳細文件
- 付款流程見 [payment-flow.md](references/payment-flow.md)
- ECPay API 規格見 [ecpay-api.md](references/ecpay-api.md)
```

**lifecycle 說明：**

| 欄位 | 值 | 說明 |
|------|---|------|
| `version` | `2.3.0` | minor bump = 新增退款政策說明 |
| `updated` | `2026-04-05` | 每次 Skill 內容變更後更新 |
| `author` | `CC-OPUS` | 由 Claude Opus 4.6 建立 |
| `created` | `2025-11-01` | Skill 初次建立日期 |
| `last-synced-epic` | `epic-pm` | 最後同步的 Story 所屬 Epic |
| `last-synced-date` | `2026-04-05` | saas-to-skill Mode C 自動更新 |
| `watches` | 3 個 glob | 監控 Service/Model/Controller，任一變動即觸發 staleness 警告 |

---

## 功能組合速查表

| 需求 | Frontmatter 組合 |
|------|-----------------|
| 使用者手動觸發，帶參數 | `disable-model-invocation: true` + `argument-hint` |
| Claude 自動載入的背景知識 | `user-invocable: false` |
| 零 context 成本的手動工具 | `disable-model-invocation: true` |
| 隔離研究（不影響主對話） | `context: fork` + `agent: Explore` |
| 唯讀分析 | `allowed-tools: Read, Grep, Glob` |
| 即時資料 | `` !`command` `` 動態注入 |
| 多參數操作 | `$0`, `$1`, `$2` + `argument-hint` |
| 引用腳本 | `${CLAUDE_SKILL_DIR}/scripts/xxx.py` |
| 高深度推理 | `effort: high` 或內容含 "ultrathink" |
| Windows 環境 | `shell: powershell` |
| 生命週期控制 | `hooks:` + PreToolUse/PostToolUse |
| SaaS 模組 lifecycle | `watches` + `version` + `last-synced-epic` + `author` |
