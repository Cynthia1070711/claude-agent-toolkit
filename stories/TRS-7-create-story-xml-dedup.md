# TRS-7: create-story/instructions.xml 去重與硬編碼清除

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-7 |
| **狀態** | done |
| **複雜度** | M |
| **優先級** | P0 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-6 |
| **後續** | TRS-8 |
| **來源** | B-2 + B-6（全研究彙整報告）、TRS-5 §2.2 + §2.4 |
| **類型** | B 類（Workflow 執行開銷） |

---

## 目標

壓縮 `create-story/instructions.xml`（541 行），合併重複邏輯並移除硬編碼 Skill 對照表。

---

## 問題描述

### 問題 1：Step 1 重複邏輯（B-2）
第 24-123 行與第 123-178 行存在「找 backlog story + 更新 Epic 狀態」的 copy-paste 重複，浪費 ~1,500 tokens/次。

### 問題 2：硬編碼 Skill 對照表（B-6）
第 353-364 行硬編碼了 Skill 觸發對照表，與 `.claude/skills/skills_list.md` 重複，浪費 ~200 tokens/次。

---

## 驗收標準

- [x] Step 1 的重複 context loading 邏輯已合併為單一流程（移除 lines 123-178 共 56 行重複）
- [x] 硬編碼 Skill 對照表已移除，改為引用 `skills_list.md`（13 行 → 2 行）
- [x] instructions.xml 行數 < 450 行（542 → 434 行，-20%）
- [x] 用真實 Story 執行完整 create-story 流程驗證無迴歸（qgr-e1-orientation-switch 於 2026-02-24 成功建立）
- [x] 確認 Required Skills 自動載入機制仍正常運作（qgr-e1 正確匹配 4 個 Skills：editor-arch、type-canonical、design-system、testing-patterns）

---

## 風險

- 🟡 中：Step 1 邏輯合併可能影響 backlog story 搜尋流程
- 建議在獨立分支上操作，完整測試後再合併

---

## 預估效益

- 每次 create-story 節省 ~1,700 tokens
- Epic QGR 65 Stories 預估節省：~110,500 tokens

---

## 變更記錄

| 時間 | 操作 | 說明 |
|------|------|------|
| 2026-02-24 21:18 | 執行完成 | 542→434 行 (-108 行, -20%)：移除 Step 1 重複邏輯 (-56)、硬編碼 Skill 表 (-11)、精簡錯誤訊息 (-13)、精簡輸出模板 (-28) |
