---
paths:
  - ".claude/skills/**"
  - ".gemini/skills/**"
  - ".agent/skills/**"
  - "src/**"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
  - "docs/technical-decisions/ADR-IDD-*.md"
---

# Skill-IDD Sync Gate — Intentional Decision Protection

## Purpose

保護 **Intentional Decision Debt (IDD)** 的 `forbidden_changes` 不被 dev-story / code-review 意外違反。與既有 `skill-sync-gate.md` 串接執行,形成雙層守護。

## Core Principle

> **Skill 變更 ≠ Code 變更 ≠ Intentional Decision 變更。** 三者獨立但相互關聯。任何一者改動都可能破壞另兩者的契約。

---

## Applies When

以下任一情境觸發 Sync Gate:

| # | 情境 | 觸發點 |
|:-:|------|-------|
| 1 | IDD 建立 / 更新 | `add_intentional_decision` / `upsert-intentional.js` |
| 2 | IDD 的 `code_locations` 改變 | dev-story Step 9 (commit verify) |
| 3 | Skill SKILL.md 修改 | `/saas-to-skill` Mode B |
| 4 | pcpt-system-platform module 文件更新 | references/**.md 修改 |
| 5 | Code 修改觸及 active IDD `related_files` | dev-story Step 3 / Stop Hook |

---

## Mandatory Flow

### dev-story phase (after Step 8, before archival)

1. **Scan file_list** → 提取當次修改的所有 files
2. **Query active IDDs**:
   ```bash
   node .context-db/scripts/skill-idd-sync-check.js --changed-files <file_list>
   ```
3. **對每筆受影響 IDD**:
   - 讀取 `forbidden_changes` JSON array
   - 對 commit diff 做 pattern match
   - 若違反 → BLOCK commit,顯示違反清單
   - 若未違反 → pass
4. **若 IDD 的 `related_skills` 有 skill 也在 Changed Skills 中**:
   - 警告: "本次變更同時動到 IDD-XXX 和其 related skill YYY"
   - 建議: 重新確認 IDD 是否仍有效

### code-review phase (Step 3.5 IDD Detection Gate)

1. **發現 new "non-FIXED" 項目**:
   - 對每個 DEFERRED / ACCEPTED / WON'T FIX 執行 Q1-Q4:
     ```
     Q1: 這是因為 Business 決策而不修嗎? → IDD-COM
     Q2: 這是因為 Strategy 方向而不修嗎? → IDD-STR
     Q3: 這是因為法規/合規而不修嗎? → IDD-REG
     Q4: 這是因為 User feedback 而不修嗎? → IDD-USR
     ```
2. **若任一為 Yes**:
   - **必須**轉為 IDD(不可留在 debt 表)
   - **必須**執行:
     1. 建立 ADR-IDD-{TYPE}-{NNN}
     2. Code 加 `[Intentional: IDD-XXX]` 標註
     3. `add_intentional_decision` (含 related_skills / platform_modules)
     4. 若 criticality='critical':
        - 寫入 `memory/intentional_xxx.md`
        - 更新 `MEMORY.md`
     5. 更新 related_skills SKILL.md 加 `[Intentional:]` 章節
     6. 更新 pcpt-system-platform 對應 module 文件
3. **若 Q1-Q4 全為 No**:
   - 繼續 pcpt-debt-registry 既有流程 (5-Min Rule → 分類)

---

## Verification Script

### `skill-idd-sync-check.js`

```bash
# 檢查特定檔案清單
node .context-db/scripts/skill-idd-sync-check.js --changed-files <comma-separated-paths>

# 全量 audit
node .context-db/scripts/skill-idd-sync-check.js --full-audit

# 檢查單一 skill vs IDD
node .context-db/scripts/skill-idd-sync-check.js --skill pcpt-editor-arch
```

**Output 範例**:

```
✓ Checked 5 changed files:
  - src/.../ImagePanel.tsx
  - src/.../QRBarcodePanel.tsx
  - ...

⚠ WARNING: ImagePanel.tsx:45 modified
  - Related IDD: IDD-COM-001 (Free plan editor 全開放)
  - Forbidden changes:
    ❌ 請勿加 isFreeUser 阻擋 ImagePanel
  - Detected violation: Added `if (isFreeUser) return null;` at line 52
  - BLOCK: Please revert or update IDD first

✗ BLOCKED: 1 violation found
```

---

## Integration with Existing `skill-sync-gate.md`

```
dev-story 結束
  ↓
Step 8.1 skill-sync-gate (既有):
  → 檢查 code 變更是否需要同步 skill
  → 若是 → /saas-to-skill Mode B
  ↓
Step 8.2 skill-idd-sync-gate (本規則 NEW):
  → 檢查 code 變更是否違反 IDD forbidden_changes
  → 若違反 → BLOCK + 提示 revert 或 update IDD
  ↓
Step 8.3 Boy Scout sweep
  ↓
Step 8.4 tasks-backfill-verify
  ↓
Archive
```

**執行順序重要**: skill-sync-gate 先執行(更新 skill),然後 skill-idd-sync-gate(檢查 IDD),避免先 block 了 IDD 才發現 skill 需要更新。

---

## FORBIDDEN

- ❌ 跳過 Skill-IDD Sync Gate 直接 commit
- ❌ 將 IDD 項目標 WON'T FIX 規避 gate
- ❌ 變更 code 而不更新對應 IDD 的 `code_locations`
- ❌ 變更 skill 相關章節而不檢查是否違反 IDD forbidden_changes
- ❌ 刪除 IDD annotation 而不 retire IDD 本身(孤兒 reference)

---

## Quick Decision: IDD Gate 會 Block 嗎?

```
修改了 src/ 的檔案?
  → Yes → Grep active IDDs 對照 related_files
    → Hit → Check forbidden_changes
      → Violation → BLOCK
      → No violation → PASS
    → No hit → PASS
  → No → SKIP
```

---

## pcpt-system-platform 同步檢查

Skill-IDD Sync Gate 的 **延伸觸發**: 若 IDD 的 `platform_modules` 非空,必須額外檢查:

| IDD 變更 | 必須同步的 pcpt-system-platform 檔案 |
|---------|------------------------------------------|
| 新增 IDD | `references/{Module}/overview.md` (加入 IDD 章節) |
| 更新 IDD decision | 同上 (更新章節內容) |
| Retire IDD | 同上 (加 "[RETIRED]" 前綴,不刪) |
| Supersede IDD | 同上 (更新為新 IDD 連結) |

**風險**: 新對話載入 stale pcpt-system-platform → 以為某功能是「可修」→ 實際是 IDD → 誤修 → 重複白工

---

## Related Rules

- `.claude/rules/skill-sync-gate.md` — Skill 與 code 的同步檢查 (前置 gate)
- `.claude/rules/tasks-backfill.md` — Story tasks 完整性檢查 (後置 gate)
- `.claude/rules/constitutional-standard.md` — Code Verification Mandate (所有 gate 的最高原則)

---

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| **1.0.0** | 2026-04-09 | Initial creation. Framework v1.3 Party Mode 產出,保護 IDD forbidden_changes。 |
