# TRS-9: sprint-status.yaml 多次全量讀取優化

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-9 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P1 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-8（code-review 壓縮完成後，避免交叉修改衝突） |
| **後續** | TRS-10 |
| **來源** | B-3 + B-4 + B-5（全研究彙整報告）、TRS-5 §2.3 |
| **類型** | B 類（Workflow 執行開銷） |

---

## 目標

將三組 Workflow 的 sprint-status.yaml 讀取從多次全量讀取（FULL_LOAD）改為 1 次讀取 + 變數傳遞模式。

---

## 問題描述

sprint-status.yaml 隨 Epic QGR 推進持續成長（目前 ~1,500 tokens），每次全量讀取都灌入整個 YAML 內容：

| Workflow | 全量讀取次數 | 浪費 tokens |
|----------|:----------:|:-----------:|
| create-story | 2 次（Step 1 + Step 7） | ~1,500 |
| dev-story | 3 次（Step 1 + Step 4 + Step 9） | ~3,000 |
| code-review | 2 次（至少） | ~1,500 |
| **合計** | **7 次** | **~6,000** |

改為 1 次讀取 + 變數傳遞後，每個 Workflow 只需讀取 1 次。

---

## 驗收標準

- [x] create-story: Step 1 讀取一次，Step 7 使用快取值更新
- [x] dev-story: Step 1 讀取一次，Step 4/9 使用快取值
- [x] code-review: 讀取一次，後續使用快取值
- [x] sprint-status.yaml 的雙寫邏輯（Story 文件 + YAML）不受影響
- [x] 三組 Workflow 各自用真實 Story 驗證無迴歸（QGR-E2 + QGR-D1 完整走過 create-story→dev-story→code-review，雙寫一致，無迴歸）

---

## 風險

- 🟠 高：影響三組 Workflow 的讀取邏輯，交叉影響範圍大
- 需要修改 BMAD 核心的變數傳遞機制
- 建議每次只修改一個 Workflow，測試通過後再繼續下一個

---

## 預估效益

- 每 Sprint 循環（3 Workflow）節省 ~4,500 tokens
- Epic QGR 65 Stories 預估節省：~292,500 tokens
