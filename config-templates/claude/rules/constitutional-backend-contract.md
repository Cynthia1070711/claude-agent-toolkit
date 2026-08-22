---
paths:
  - "**/*.cs"
  - "**/*.sql"
  - "Migrations/**"
  - "src/YourApp/**/Models/**"
  - "src/YourApp/**/Controllers/**"
  - "src/YourApp/**/Services/**"
  - "docs/implementation-artifacts/specs/**"
  - "docs/implementation-artifacts/stories/**"
---

# Constitutional Backend Contract Verification Mandate (CRITICAL — Permanent)

> **抽出自**: `.claude/rules/constitutional-standard.md` (2026-05-16 split,paths-scoped 降載入成本)
> **嚴重等級**: CRITICAL — Permanent

任何涉及 **backend contract**(DB schema 欄位單位、API response 欄位格式、Entity model 語意)的 Spec、Story、或程式碼,**必須 file:line 引用 backend 程式碼**作為 Source of Truth。

**嚴格禁止**: 從前端程式碼行為、mock 資料、或舊 Spec 推測 backend contract。

## Mandatory Flow

1. Spec/Story 涉及 DB 欄位(width/height/price/amount/etc.)→ **Read Model .cs 檔**確認型別與單位
2. Spec/Story 涉及 API default 值 → **Read Controller .cs 檔**確認 default 賦值
3. 前端 hook/service 使用 API 欄位 → **Read 對應 Controller action** 確認欄位語意
4. 若 backend code 無法讀取 → 明確標記「Contract unverified — needs backend read before implementation」

## Applies to all workflow phases

- `create-story`: AC 中任何數值 contract 必須引用 backend file:line
- `dev-story`: 實作前確認 contract;不得假設「前端已用 px 所以 DB 也是 px」
- `code-review`: 驗證 AC contract 與實際 backend code 一致

## Incident Record

- **EDF-15 (2026-04-06)**: edf-13 create-story/dev-story/code-review 三個 workflow 均未讀 `ProjectsController.cs`,誤認 DB 存 px。實際 `ProjectsController.cs:84-85` 以 `210m/297m`(C# decimal literal)儲存 mm。導致 100% 新建專案尺寸污染(A4 210mm → 793px 寫回 DB)。根因: Spec 從前端 mock 340(90mm×3.7795=340px)反推 DB 單位,跳過 backend code 讀取。

## Related

- `.claude/rules/constitutional-standard.md` — Code Verification + Timestamp + Language(always-on 核心)
- `.claude/rules/constitutional-depth-first.md` — Depth-First Verification(paths-scoped)
- `.claude/rules/constitutional-external-citation.md` — External Source Citation(paths-scoped)
