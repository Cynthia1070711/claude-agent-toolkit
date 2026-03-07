# TRS-19: 技術債側車 `.debt.md` 消費端啟用

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-19 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P0 |
| **建立時間** | 2026-02-25 19:37 |
| **依賴** | TRS-11（側車框架已建立，本 Story 啟用消費端） |
| **類型** | D 類（操作流程優化） |

---

## 目標

讓 code-review workflow 在發現延後項目時，自動生成 `.debt.md` 側車文件，兌現 TRS-11 規劃的 ~7,700 tok/次技術債操作節省。

---

## 問題描述

### 現況

TRS-11 已完成以下成果：
- `docs/implementation-artifacts/tech-debt/` 目錄已建立
- `README.md` 定義了完整的側車文件格式與三層上下文規範
- code-review/instructions.xml 和 dev-story/instructions.xml 已宣稱整合側車機制
- TRS-11 驗收標準第 6 項仍未勾選：「用真實技術債場景驗證完整流程」

### 實際差距

檢查實際狀態發現：
- `docs/implementation-artifacts/tech-debt/` 下 **0 個 `.debt.md` 實例檔案**
- 過去多次 code-review 執行（FRA-1、FRA-4、QGR-M1、QGR-M2 等）產生的延後項目，均以傳統方式路由（直接在 Story 文件中記錄 + sprint-status.yaml 新增 backlog Story）
- 側車機制從未被實際觸發

### 根因分析

1. code-review instructions.xml 中的側車生成邏輯可能條件判斷不完整（僅框架性宣告而非強制生成）
2. 缺少「延後項目 → 自動寫入 .debt.md」的明確觸發點
3. dev-story 消費 `.debt.md` 的路徑未經實際驗證

---

## 實作方案

### Phase 1：驗證既有整合（S）

1. 讀取 `code-review/instructions.xml`，定位技術債路由邏輯
2. 確認是否有明確的「生成 `.debt.md`」指令
3. 若僅為框架性提及（如 "consider generating sidecar"），升級為強制指令

### Phase 2：補齊生成邏輯（M）

在 code-review instructions.xml 的延後項目處理步驟中：

```xml
<!-- 當發現需延後修復的技術債時 -->
<action>
  Generate sidecar file: docs/implementation-artifacts/tech-debt/{new_story_key}.debt.md
  Format: TRS-11 三層上下文（修復層 + 影響層 + 業務脈絡層）
  Fields: source_story, severity, dimension, problem_location,
          problem_description, fix_guidance, affected_acceptance_criteria, related_modules
</action>
```

### Phase 3：驗證消費端（S）

1. 確認 dev-story instructions.xml 中有「檢查 tech-debt/ 目錄是否存在對應 .debt.md」的步驟
2. 確認消費後刪除邏輯（Story done → 刪除 .debt.md）
3. 用一個真實場景端到端驗證

---

## 驗收標準

- [x] code-review instructions.xml 中有**明確的** `.debt.md` 生成指令（Step 4 lines 260-332，含根因分析 + 三層上下文寫入）
- [x] 生成的 `.debt.md` 符合 TRS-11 README.md 定義的三層上下文格式（實例：`qgr-m10-checkout-modal-dry-refactor.debt.md`）
- [x] dev-story instructions.xml 中有讀取 `.debt.md` 的步驟（Step 2 lines 117-132 載入 + Step 5 消費引用已補齊）
- [x] 端到端驗證：FRA-4 CR 延後項目 → 生成 `qgr-m10-checkout-modal-dry-refactor.debt.md` → dev-story 可消費 → code-review Step 6 可刪除
- [x] 與 MEMORY.md 中「CR 延後項目路由規則」一致（QGR-M10 留在 Epic QGR 內追蹤）
- [x] TRS-11 驗收標準第 6 項（真實場景驗證）已勾選

---

## 預估效益

| 指標 | 傳統方式 | 側車方式 | 節省 |
|------|:-------:|:-------:|:----:|
| 每次技術債路由 token | ~7,800 tok | ~100 tok | **-99%** |
| 每個 Story 平均 1.5 個技術債 | ~11,700 tok | ~150 tok | **-11,550 tok** |
| Epic QGR 65 Stories | ~760,500 tok | ~9,750 tok | **~750,750 tok** |

---

## 風險

- 🟡 中：需同時修改 code-review 和 dev-story 的 instructions.xml，兩者必須保持一致
- 🟡 中：需確認既有的 CR 延後項目路由規則（MEMORY.md）不受影響
- 🟢 低：側車文件格式已在 TRS-11 明確定義，格式風險低
