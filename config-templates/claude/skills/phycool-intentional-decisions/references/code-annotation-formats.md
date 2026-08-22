# Phycool Intentional Decisions — Code Annotation Formats (Multi-Language)

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 TypeScript / C# / Python / SQL / Markdown 各語言標註格式 完整內容。

---

## 7. Code Annotation Format (多語言)

### 7.1 TypeScript / JavaScript

```typescript
// 單行 (適用於簡單決策)
// [Intentional: IDD-COM-001] Free plan 不阻擋 UI
export const Component = () => { ... };

// Block (適用於關鍵決策 + forbidden_changes)
/**
 * @intentional IDD-COM-001
 * @type Commercial
 * @reason Free plan editor 無 gating, PDF 層 gate
 * @decision-by Alan (PO)
 * @decision-date 2026-04-08
 * @re-evaluate-trigger Free conversion rate < 1%
 * @see ADR-IDD-COM-001
 * @forbidden-changes 請勿加 isFreeUser 檢查
 */
export const ImagePanel: React.FC = () => { ... };
```

### 7.2 C#

```csharp
/// <intentional id="IDD-COM-002" type="Commercial">
///   <reason>無退款 policy, Admin only 處理</reason>
///   <decision-by>Alan (PO)</decision-by>
///   <decision-date>2026-04-08</decision-date>
///   <see cref="ADR-IDD-COM-002" />
///   <forbidden-changes>請勿加入 public refund endpoint</forbidden-changes>
/// </intentional>
public async Task<IActionResult> RefundRequest() { ... }
```

### 7.3 Python

```python
def process_payment():
    """
    [Intentional: IDD-COM-002]
    Type: Commercial
    Reason: 無退款 policy, Admin only
    Decision-by: Alan (PO)
    See: ADR-IDD-COM-002
    Forbidden: 請勿加 refund endpoint
    """
    ...
```

### 7.4 SQL / Markdown

```sql
-- [Intentional: IDD-REG-001] 個資保存 180 天(GDPR)
-- See: ADR-IDD-REG-001
DELETE FROM users WHERE deleted_at < DATE('now', '-180 days');
```

```markdown
<!-- [Intentional: IDD-STR-001] PCPT 無 Undo/Redo -->
## 編輯器功能清單
- ...
```

---

