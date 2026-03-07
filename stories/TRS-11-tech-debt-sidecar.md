# TRS-11: 技術債側車文件（Sidecar）架構

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-11 |
| **狀態** | done |
| **複雜度** | L |
| **優先級** | P2 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-8（code-review 壓縮完成後，在新邏輯中整合側車機制） |
| **後續** | TRS-12 |
| **來源** | D-1 + D-2（全研究彙整報告）、策略文件 Phase 4 §8 |
| **類型** | D 類（操作流程優化） |

---

## 目標

建立技術債側車文件架構（`.debt.md`），讓 code-review 發現技術債時不再需要讀取目標 Story 全文，改為寫入蒸餾過的側車文件。

---

## 問題描述

目前 code-review 每發現一個技術債，需要：
1. 讀取目標 Story 完整文件：~3,000 tokens
2. 讀取 sprint-status.yaml 全文：~1,500 tokens
3. 讀取 tracking README：~300 tokens

典型發現 2 個技術債消耗 ~7,800 tokens，其中實際被使用的資訊僅 ~200 tokens（3%）。

### 側車文件格式

```yaml
# docs/implementation-artifacts/tech-debt/{target_story_key}.debt.md
source_story: story-42
severity: HIGH
dimension: Security
problem_location: src/Auth/JwtService.cs:47
problem_description: |
  JWT refresh token 未實作 rotation 機制。
fix_guidance: |
  實作 one-time use refresh token...
affected_acceptance_criteria: |
  原 story-42 AC-3：「使用者重新整理頁面後維持登入狀態」
related_modules:
  - src/Auth/JwtService.cs
```

---

## 驗收標準

- [x] `docs/implementation-artifacts/tech-debt/` 目錄已建立
- [x] code-review/instructions.xml 技術債路由邏輯已修改（使用側車文件）
- [x] dev-story/instructions.xml 已新增讀取 `.debt.md` 的步驟
- [x] 側車文件包含三層上下文：修復層 + 影響層 + 業務脈絡層
- [x] code-review 通過 td-story 後自動刪除對應的 `.debt.md`
- [x] 用真實技術債場景驗證完整流程（TRS-19 使用 FRA-4→QGR-M10 場景驗證，2026-02-25）

---

## 風險

- 🟡 中：需要同時修改 code-review 和 dev-story 的 XML
- 需確認與 MEMORY.md 中「CR 延後項目路由規則」的一致性

---

## 預估效益

- 每次技術債操作節省 ~7,750 tokens（-99.4%）
- 每個 Story 平均 1.5 個技術債，65 Stories 預估節省：~754,875 tokens
