# TRS-10: dev-story/instructions.xml 壓縮

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-10 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P1 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-9 |
| **後續** | TRS-11 |
| **來源** | B-8 + B-10（全研究彙整報告） |
| **類型** | B 類（Workflow 執行開銷） |

---

## 目標

壓縮 `dev-story/instructions.xml`（480 行），合併重複步驟，精簡 Sprint Status 多選 UI。

---

## 問題描述

### 問題 1：Step 1 + Step 2 重複 context loading（B-8）
Step 1 末尾和 Step 2 逐字重複相同的 context loading 動作：
```xml
<action>Parse sections: Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes...</action>
<action>Load comprehensive context from story file's Dev Notes section</action>
```
浪費 ~800 tokens/次。

### 問題 2：Sprint Status 多選 UI 過長（B-10）
第 37-76 行的「No ready-for-dev stories」互動 UI 模板約 40 行，可壓縮為 8 行選擇式指令，節省 ~200 tokens/次。

---

## 驗收標準

- [x] Step 1/2 的重複 context loading 已合併
- [x] Sprint Status 多選 UI 已精簡至 < 10 行（8 行）
- [x] instructions.xml 行數 < 420 行（410 行）
- [x] Step 5 的 `CRITICAL` 標籤禁止事項**不可壓縮**（4 條完整保留）
- [x] Step 5/8 的 HALT 觸發條件完整保留（Step 5: 3 條, Step 8: 1 條）
- [x] Step 9 的 Sprint Status 雙寫邏輯完整保留
- [ ] 用真實 Story 執行完整 dev-story 驗證無迴歸

---

## 風險

- 🟡 中：Step 1/2 合併需確認 Skill 載入時機不受影響
- HALT 條件和雙寫邏輯為安全禁區

---

## 預估效益

- 每次 dev-story 節省 ~1,000 tokens
- Epic QGR 65 Stories 預估節省：~65,000 tokens
