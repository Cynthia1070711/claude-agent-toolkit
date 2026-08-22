# phycool-debt-registry — §1-§4 Overview + Classification + Categories + Severity

> **抽出自** `.claude/skills/phycool-debt-registry/SKILL.md` 2026-05-16 P2 modularization (saas-to-skill Mode B 8-aspect validation pass). 主 SKILL.md ≤300 行,本檔承載 §1-§4 Overview + Classification + Categories + Severity。

---

## 1. Overview

### 1.1 What is Tech Debt?

**Tech Debt** 是因 engineering constraint (時間 / 資源 / 知識不足) 產生的「應該修但還沒修」的 code 問題。

**嚴格區分**:
- Tech Debt = 忘記 / 沒時間修 (本 skill 處理)
- **Intentional Decision Debt (IDD)** = 故意不修 (由 `phycool-intentional-decisions` 處理)

### 1.2 tech_debt_items 是唯一真相來源

DB-first: `tech_debt_items` SQLite 表是唯一真相來源。registry.yaml + .debt.md 已 deprecated。

### 1.3 v3.0 Framework 概覽

```
6 分類 × 5 嚴重度 × 4 處理決策 × Priority Score

分類:
  - SD (Structural Debt)
  - CQD (Code Quality Debt)
  - TD (Test Debt) — Murat 優先級 0
  - DD (Documentation Debt)
  - DpD (Dependency Debt)
  - [BPD → 已移至 IDD skill]

嚴重度:
  - P0 CRITICAL — Fix Now (same day)
  - P1 HIGH — Fix This Sprint
  - P2 MEDIUM — Fix Next Sprint
  - P3 LOW — Track & Watch Quarterly
  - P4 ACCEPTED — Document + Re-evaluate

處理決策:
  - FIXED — 已修復
  - DEFERRED — 跨 Story 承接 (必須有 target_story)
  - ACCEPTED — 承認存在, 暫不修, 有 review_date
  - WON'T FIX — 永不修 (限純風格 / 零風險)
```

---

## 2. Issue Classification (4 處理決策)

### 2.1 FIXED

**定義**: 當場修復完成。

**條件**: code 已修改 + test 通過 + commit 建立

**額外條件 — 能力類 debt(2026-08-03 bwu-12)**: 若 debt 的標的是**外部能力是否可用**(MCP 連線 / 工具層可達性 / 瀏覽器自動化橋接等,非本 repo 的 code),則上述「test 通過」不成立,取而代之的門檻是 **≥2 次、時間戳分屬不同日期的直接調用成功獨立觀察**,經 `add_tech({tech_stack, outcome:'success'})` 落 DB、`search_tech` 查詢確認。**單次成功不足以標 fixed** —— 它無法區分「已修復」與「這次剛好通了」。SSoT 為 `.claude/rules/tasks-backfill.md` §Chrome MCP 能力判準 (b);該族 debt(`chrome-devtools-mcp` 連線)在此門檻建立前已三次以單次成功結案並三次復發。

**後續**: `upsert-debt.js --resolve TD-xxx --by {agent} --in {story}`

> **部分修復禁止整筆結案(2026-08-03 bwu-12 CR)**: 若 debt 的 description 列舉多個具名組成(如「(A) schema 不相容 / (B) 測試過期 / (C) glob 誤收」),只修其中一部分**不得**將整筆標 `fixed` —— 未修的組成必須在同一動作內另立具名 debt 承接,且其 `affected_files` 需列出具體檔案路徑(後續 `search_debt({affected_files})` 唯一打得中的穩定鍵)。否則該組成同時失去「open debt」與「造冊」兩個可見性,退化為無人追蹤的紅燈。

### 2.2 DEFERRED

**定義**: 當前 Story 範圍內無法修復,必須建立 Target Story 承接。

**嚴格要求**: **必填** `target_story` 欄位。

**Q: 為何不能當 Story 結束就不管?** — 因為 DEFERRED 若沒有 target,會變成「孤兒 debt」,永遠不會被處理。

### 2.3 ACCEPTED (v3.0 新增)

**定義**: 承認 debt 存在,但決定暫不修復。**與 WON'T FIX 不同**,ACCEPTED 有 `review_date`,會在到期時自動要求重新評估。

**使用條件**:
- Priority Score < 25 且 > 10 → 自動進入 ACCEPTED (+90 天 review)
- Priority Score < 10 → 自動進入 ACCEPTED (+365 天 review)
- 不適用 5-Minute Rule
- 不是 Test Debt (TD 類必須 FIX 或 DEFERRED,不可 ACCEPTED)

**必填**: `review_date`, `accepted_reason`

### 2.4 WON'T FIX (v3.0 嚴格限定)

**定義**: 永不修復。

**嚴格限定範圍**:
- ✅ 純語言風格偏好 (e.g., `const` vs `let` 在 immutable context)
- ✅ 命名差異但零實際風險 (e.g., camelCase vs PascalCase unused variable)
- ❌ 「超出 Story 範圍」(這是 DEFERRED)
- ❌ 「LOW 嚴重度不需處理」(這是 ACCEPTED)
- ❌ 「等下次批次更新」(這是 DEFERRED 或 ACCEPTED)
- ❌ 任何 Business/Strategy/Legal/User 驅動 (這是 IDD,不是 debt)

**Q1-Q5 自檢清單**(CR 標 WON'T FIX 前必答):

```
Q1. 修復是否只改動當前 Story 範圍內的檔案? → 是則立即修
Q2. 修復是否 ≤ 5 行 + 無副作用 (5-Minute Rule)? → 是則立即修
Q3. 修復是否需要另一個 Story 的 Service/API 先存在? → 是則 DEFERRED (非 WON'T FIX)
Q4. 「等套件整合」是否只是藉口? 能否用最小替代方案? → 能則立即修
Q5. 問題已在本次 CR 中被解決 (錯誤報告已取代)? → 分類為 FIXED
```

**強制執行**: 每個 CR 中非 FIXED 項目必須展示 Q1-Q5 答案。

---

## 3. Tech Debt Categories (6 分類, v3.0 新增)

### 3.1 SD — Structural Debt

**定義**: 架構層級的設計缺陷,影響多個模組或跨 service 耦合。

**範例**:
- `edf-13` FabricObject.width 單位混亂 (px vs mm)
- `mqv-33` Property Panel 散落 7 處 (導致 mqv-35 統一重構)

**Priority Tendency**: P1-P0 (影響範圍大)

### 3.2 CQD — Code Quality Debt

**定義**: 本地程式碼品質問題,不影響架構。

**範例**:
- useState vs Zustand 重複
- 硬編碼字串
- Dead code
- Over-engineering

**Priority Tendency**: P2-P3

### 3.3 TD — Test Debt (Murat 優先級 0)

**定義**: 測試覆蓋不足或測試品質問題。

**範例**:
- 沒有 E2E 測試的關鍵路徑
- Flaky tests (quarantined)
- Mock 過度導致 false pass

**特殊規則**: **TD 不可 ACCEPTED** (Murat 堅持)。只能 FIX 或 DEFERRED。

**Priority Tendency**: P0-P1

**原因**: 沒有 test → 不知道哪裡壞 → 所有 debt 都變成 "薛丁格 debt"。

### 3.4 DD — Documentation Debt

**定義**: 文檔與實作的落差。

**範例**:
- Spec 落後 code 3 個 Story
- phycool-system-platform 模組狀態未更新
- README 過時

**Priority Tendency**: P2-P3

### 3.5 DpD — Dependency Debt

**定義**: 套件版本落後 / 安全更新未應用。

**範例**:
- Chart.js 3.x → 4.x
- npm audit CRITICAL 未處理
- EOL package

**Priority Tendency**: P1-P0 (安全問題時)

### 3.6 BPD — Business Policy Debt (已移至 IDD skill)

> ⚠️ **v3.0 變更**: BPD 不再是 tech debt 類別,改由 `phycool-intentional-decisions` skill 處理。
>
> **為何移出**: BPD 本質是「故意不修」的決策,不是 engineering constraint。應走 IDD 4 層標註 (Code/ADR/DB/Memory),而非 tech_debt_items 表。
>
> **遷移路徑**: 現有 `tech_debt_items` 中的 BPD 條目,透過 dla-08 migration 轉入 `intentional_decisions` 表。

---

## 4. Severity Levels (5 級, v3.0 新增)

| 等級 | 名稱 | 定義 | SLA | 範例 |
|:----:|------|------|-----|------|
| **P0** | CRITICAL | 生產中斷 / 資安 / 資料損壞 | Fix Now (same day) | TD-eft-405-01 LocaleMiddleware POST 被 302 降級 |
| **P1** | HIGH | 核心功能降級 / 使用者可感知 | Fix This Sprint | TD-EFT-COEP-M1 DataSource Worker CORS |
| **P2** | MEDIUM | 品質降級 / 開發效率影響 | Fix Next Sprint | CQD-001 ImagePanel React key warning |
| **P3** | LOW | 偏好 / 理論風險 | Track & Watch Quarterly | DD-001 README 過時 |
| **P4** | ACCEPTED | 知道但不修 (有 review_date) | Document + Re-evaluate | ACCEPTED-001 CI artifact path |

---


---
