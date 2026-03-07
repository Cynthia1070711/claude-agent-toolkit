# TRS-5: BMAD Workflow Instructions 壓縮規劃

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-5 |
| **狀態** | done（規劃產出，不在此階段修改 XML） |
| **複雜度** | M |
| **優先級** | P1 |
| **執行時間** | 2026-02-24 20:01 |
| **依賴** | TRS-0~4 完成後，Workflow 壓縮為下一階段 |
| **後續** | 依規劃文件逐一修改 XML（獨立任務） |

---

## 一、現況盤點

| Workflow | instructions.xml | checklist.md | 其他 | 總計 |
|----------|:----------------:|:------------:|:----:|:----:|
| code-review | 923 行 | 129 行 | 63 行 | 1,115 行 |
| create-story | 541 行 | 358 行 | 107 行 | 1,006 行 |
| dev-story | 480 行 | 80 行 | 64 行 | 624 行 |
| **合計** | **1,944 行** | **567 行** | **234 行** | **2,745 行** |

---

## 二、已識別的壓縮機會

### 2.1 create-story/checklist.md（358 行 → ~150 行，-58%）

**問題**: 約 180 行（50%）為情緒化填充
- `CRITICAL MISSION: Outperform and Fix the Original Create-Story LLM`
- `COMPETITIVE EXCELLENCE MINDSET`
- `Go create the ultimate developer implementation guide!`
- 重複的 `COMPETITION SUCCESS METRICS` 區塊（第 222-358 行）

**壓縮方案**: 保留實質驗證邏輯（Step 1-4 檢查項目），刪除所有擬人化激勵語和 emoji 裝飾。

### 2.2 create-story/instructions.xml Step 1 重複邏輯（-~100 行）

**問題**: 第 24-123 行與第 123-178 行存在「找 backlog story + 更新 Epic 狀態」的 copy-paste 重複。

**壓縮方案**: 合併為單一邏輯流程。

### 2.3 sprint-status.yaml 多次全量讀取（跨所有 workflow）

**問題**:
- create-story: Step 1 + Step 7 = 2 次 FULL_LOAD
- dev-story: Step 1 + Step 4 + Step 9 = 3 次 FULL_LOAD
- code-review: 至少 2 次 FULL_LOAD

**壓縮方案**: 每個 workflow 改為 1 次讀取 + 變數傳遞，避免重複全量灌入。

### 2.4 instructions.xml 硬編碼 Skill 對照表

**問題**: create-story/instructions.xml 第 353-364 行硬編碼了 Skill 觸發對照表，與 `skills_list.md` 重複。

**壓縮方案**: 引用 `skills_list.md` 作為唯一來源，移除硬編碼表。

### 2.5 code-review/instructions.xml（923 行 → ~600 行）

**問題**: 此檔案最大但未在深度分析報告中詳細拆解。需進一步審計：
- 檢查是否有與 checklist.md 重複的驗證邏輯
- 檢查英文模板的冗餘描述
- 識別可合併的步驟

**壓縮方案**: 需額外的詳細審計後再制定具體方案。

---

## 三、預期效益

| 項目 | 壓縮前 | 壓縮後（預估） | 節省 |
|------|:------:|:--------------:|:----:|
| create-story/checklist.md | 358 行 | ~150 行 | -58% |
| create-story/instructions.xml | 541 行 | ~430 行 | -20% |
| dev-story/instructions.xml | 480 行 | ~400 行 | -17% |
| code-review/instructions.xml | 923 行 | ~600 行（待審計） | -35% |
| **每次 Sprint 循環 Token 節省** | — | — | **~5,000-9,000 tokens** |

---

## 四、執行建議

1. **優先處理 create-story/checklist.md** — 最高 ROI，純刪除操作，風險最低
2. **其次合併 create-story/instructions.xml Step 1** — 中等風險，需驗證流程不中斷
3. **最後處理 sprint-status.yaml 讀取優化** — 需修改三組 workflow 的讀取邏輯，影響範圍最大
4. **code-review 壓縮需獨立審計** — 923 行的詳細分析應作為獨立任務

---

## 五、風險與注意事項

- BMAD workflow XML 結構高度耦合，任何修改都需要完整的端到端測試
- checklist.md 的情緒化語句雖然對 LLM 無增益，但刪除後需確認 workflow 正常觸發
- sprint-status.yaml 讀取優化可能需要修改 BMAD 核心的變數傳遞機制
- 建議每次只修改一個 workflow，測試通過後再繼續下一個
