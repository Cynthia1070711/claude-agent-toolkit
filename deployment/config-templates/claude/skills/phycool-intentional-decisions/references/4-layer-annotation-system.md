# Phycool Intentional Decisions — 4-Layer Annotation System

> **抽出自** `.claude/skills/phycool-intentional-decisions/SKILL.md` 2026-05-16 P2 modularization (Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 Code/ADR/DB/Memory 四層標註系統 完整內容。

---

## 2. 4-Layer Annotation System (核心)

> **Why 4 layers?** 單一通道會失敗。四層標註確保 **任何新對話 / 新開發者 / 三引擎任一個** 無論從哪個通道都能發現「這是故意的」。

### 2.1 Layer 1: Code Inline Annotation (Source of Truth)

程式碼檔案內的 inline 標註,是最接近真相的通道。

#### TypeScript / JavaScript 單行格式

```typescript
// [Intentional: IDD-COM-001] Free plan 不阻擋 UI, PDF 層 gate
// See: docs/technical-decisions/ADR-IDD-COM-001.md
export const ImagePanel: React.FC = () => { ... };
```

#### TypeScript / JavaScript Block 格式(推薦用於關鍵決策)

```typescript
/**
 * @intentional IDD-COM-001
 * @type Commercial Decision
 * @reason Free plan editor 無 gating, 僅 PDF 層 gate(2 頁 + 浮水印)
 * @decision-by Alan (PO)
 * @decision-date 2026-04-08
 * @re-evaluate-trigger Free conversion rate < 1% 連續 2 個月
 * @see ADR-IDD-COM-001
 * @forbidden-changes 請勿加 isFreeUser 檢查阻擋 UI
 */
export const ImagePanel: React.FC = () => { ... };
```

#### C# XML Comment 格式

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

#### Required Annotation Fields

| 欄位 | 必填 | 說明 |
|------|:---:|------|
| `id` / `@intentional` | ✅ | IDD-XXX-NNN |
| `type` | ✅ | COM / STR / REG / USR |
| `reason` 或 single line | ✅ | 一行描述 |
| `decision-by` | ✅ | PO name |
| `see` 指向 ADR | ✅ | ADR 相對路徑 |
| `forbidden-changes` | ⚠️ 強烈建議 | 禁止動作清單 |

### 2.2 Layer 2: ADR File (Decision Record)

**檔案命名**: `docs/technical-decisions/ADR-IDD-{TYPE}-{NNN}-{kebab-title}.md`

**必填區塊**:

```markdown
# ADR-IDD-COM-001: Free Plan Editor 無 Gating

## Classification
- **Type**: IDD-COM (Commercial Decision)
- **Status**: Active
- **Created**: 2026-04-08
- **Signoff**: Alan (PO)

## Context
Free plan 使用者應該如何在 editor 中被限制功能?

## Decision
編輯器 (ImagePanel, QRBarcodePanel, SerialPanel 等) 對 Free 使用者保持可開啟,
但實際執行生成動作時由 PDF 層 gate (2 頁上限 + 浮水印)。

## Why Not "Technical Fix"?
1. **UX 研究**: 顯示 upgrade modal 的轉換率 > 隱藏按鈕 3 倍
2. **Business**: PO 決定 editor 無 gating, 讓 Free 使用者體驗核心
3. **Strategy**: Free 體驗核心功能才會升級, 提前封鎖反而失去轉換機會

## Code Impact (file:line)
- `src/YourApp/Web/ClientApp/src/components/Editor/panels/ImagePanel.tsx:45` [Intentional: IDD-COM-001]
- `src/YourApp/Web/ClientApp/src/components/Editor/panels/QRBarcodePanel.tsx:20,87` [Intentional: IDD-COM-001] (2026-06-09 eft-qrcode-module-correction Phase 1.3 改寫後行號更新:L20「FREE 會員享有全功能使用權限，禁止在此加 isFreeUser/planType 阻擋 UI」+ L87「無 isFreeUser 阻擋」)
- `src/YourApp/Web/ClientApp/src/components/Editor/panels/SerialPanel.tsx:158` [Intentional: IDD-COM-001] — 水平鏡像 checkbox 當前違反 disabled+lock,Story `pcpt-editor-serial-mirror-conditional-render` 修復為 enabled + Tier label
- `src/YourApp/Web/ClientApp/src/utils/CanvasDataBinder.ts:285-340` [Intentional: IDD-COM-001] — 切換資料來源 toggle (Story `pcpt-editor-serial-data-source-toggle`) 對所有方案開放,無 plan gating
- (若改回 gating 需同步修改 11+ 處 editor check)

## Re-evaluation Trigger
- Free conversion rate < 1% 連續 2 個月
- 使用者 survey 顯示「誤導性 UI」成為 top complaint
- PO 策略改變

## Alternatives Considered
- **A**: 完全隱藏 Panel(rejected: UX 差, 破壞 layout)
- **B**: 禁用 button + tooltip(rejected: 轉換率低)
- **C**: 顯示 Panel + UpgradeModal ✓ (chosen)

## Forbidden Changes
- ❌ 請勿在 editor 加上 `isFreeUser` 阻擋檢查
- ❌ 請勿隱藏 ImagePanel / QRBarcodePanel
- ❌ 請勿在 `useFloatingCards.ts` handleLeftToolbarSelect 加 Free plan 過濾

## Related Skills
- phycool-editor-arch
- phycool-member-plans
- phycool-editor-data-features
- phycool-pdf-engine

## Related Docs
- docs/project-planning-artifacts/functional-specs/member-plan-gating.md
- memory/project_free_plan_full_access.md
```

### 2.3 Layer 3: DB Record (`intentional_decisions` 表)

```sql
CREATE TABLE intentional_decisions (
  idd_id TEXT PRIMARY KEY,                     -- IDD-COM-001
  idd_type TEXT NOT NULL
    CHECK(idd_type IN ('COM','STR','REG','USR')),
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  code_locations TEXT,                         -- JSON: [{file,line,snippet}]
  adr_path TEXT NOT NULL,                      -- docs/technical-decisions/ADR-IDD-XXX.md
  memory_file_path TEXT,                       -- memory/intentional_xxx.md (optional)
  signoff_by TEXT NOT NULL,                    -- Alan / PO / Legal
  signoff_date TEXT NOT NULL,                  -- UTC+8 ISO8601
  re_evaluation_trigger TEXT,                  -- 事件觸發條件描述
  re_evaluation_date TEXT,                     -- 計劃 review 日期 (optional)
  forbidden_changes TEXT,                      -- JSON array 禁止動作清單
  criticality TEXT DEFAULT 'normal'
    CHECK(criticality IN ('critical','normal','low')),
  status TEXT DEFAULT 'active'
    CHECK(status IN ('active','retired','superseded')),
  superseded_by TEXT,                          -- 後續取代的 IDD ID
  related_skills TEXT,                         -- JSON array (phycool-* skill names)
  related_docs TEXT,                           -- JSON array (doc paths)
  platform_modules TEXT,                       -- JSON array (e.g., ["Editor","Member"])
  related_files TEXT,                          -- JSON array 關聯檔案路徑
  tags TEXT,                                   -- JSON array
  last_verified_at TEXT,                       -- 最後 code 驗證時間
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(superseded_by) REFERENCES intentional_decisions(idd_id)
);

CREATE INDEX idx_idd_type ON intentional_decisions(idd_type);
CREATE INDEX idx_idd_status ON intentional_decisions(status);
CREATE INDEX idx_idd_criticality ON intentional_decisions(criticality);

CREATE VIRTUAL TABLE intentional_decisions_fts USING fts5(
  idd_id, title, context, decision, reason, forbidden_changes, tags,
  content='intentional_decisions',
  content_rowid='rowid',
  tokenize='trigram'
);

-- Trigger: 自動同步到 context_entries (讓 pre-prompt-rag.js 自動感知)
CREATE TRIGGER sync_idd_insert_to_context
AFTER INSERT ON intentional_decisions
BEGIN
  INSERT INTO context_entries (
    agent_id, category, title, content, tags, related_files,
    story_id, epic_id, created_at
  ) VALUES (
    'CC-OPUS',
    'intentional',
    NEW.idd_id || ' ' || NEW.title,
    '[' || NEW.idd_id || '/' || NEW.idd_type || '] '
      || NEW.decision || char(10) || char(10)
      || 'Reason: ' || NEW.reason || char(10) || char(10)
      || 'Forbidden: ' || COALESCE(NEW.forbidden_changes, '[]') || char(10)
      || 'ADR: ' || NEW.adr_path,
    COALESCE(NEW.tags, '[]'),
    COALESCE(NEW.related_files, '[]'),
    NULL, NULL,
    NEW.created_at
  );
END;

-- FTS5 sync
CREATE TRIGGER idd_fts_insert AFTER INSERT ON intentional_decisions
BEGIN
  INSERT INTO intentional_decisions_fts(
    rowid, idd_id, title, context, decision, reason, forbidden_changes, tags
  ) VALUES (
    NEW.rowid, NEW.idd_id, NEW.title, NEW.context,
    NEW.decision, NEW.reason, NEW.forbidden_changes, NEW.tags
  );
END;

CREATE TRIGGER idd_fts_update AFTER UPDATE ON intentional_decisions
BEGIN
  UPDATE intentional_decisions_fts SET
    idd_id = NEW.idd_id, title = NEW.title, context = NEW.context,
    decision = NEW.decision, reason = NEW.reason,
    forbidden_changes = NEW.forbidden_changes, tags = NEW.tags
  WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER idd_fts_delete AFTER DELETE ON intentional_decisions
BEGIN
  DELETE FROM intentional_decisions_fts WHERE rowid = OLD.rowid;
END;
```

### 2.4 Layer 4: Memory DB + MEMORY.md (Fast Access)

**僅限 `criticality='critical'` 的 IDD 才寫入 MEMORY.md**:

```markdown
- **IDD-COM-001 Free plan editor 全開放** (CRITICAL — 2026-04-08):
  Editor 所有 panel 對 Free 使用者保持可開啟, gate 在 PDF 層(2 頁 + 浮水印)。
  請勿加 isFreeUser 阻擋。See `ADR-IDD-COM-001` + memory/intentional_com_001.md
```

**對應的 memory file**:

```
memory/
  intentional_com_001_free_plan_editor_access.md
  intentional_com_002_no_refund_policy.md
  intentional_str_001_pcpt_not_image_editor.md
  ...
```

**memory file 格式**:

```markdown
---
name: IDD-COM-001 Free plan editor 全開放
description: Editor 無 Free plan gating, PDF 層 gate
type: project
---

Free plan 使用者在 editor 中可以開啟所有 panel(ImagePanel/QRBarcodePanel/SerialPanel)。
Gate 在 PDF 生成層(2 頁上限 + 浮水印)。這是商業決策驅動的設計。

**Why**: UX 研究顯示 upgrade modal 轉換率 3x 高於隱藏按鈕。

**How to apply**:
- 任何 editor 修改 PR 不得加 `isFreeUser` 阻擋 panel 開啟
- 若提議改變此決策,需觸發 PO re-evaluation
- See `ADR-IDD-COM-001.md`
```

---

