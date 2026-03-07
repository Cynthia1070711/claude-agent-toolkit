# TRS-6: create-story/checklist.md 情緒化填充清除

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-6 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P0 |
| **建立時間** | 2026-02-24 20:55 |
| **依賴** | TRS-5（規劃已完成） |
| **後續** | TRS-7 |
| **來源** | B-1（全研究彙整報告）、TRS-5 §2.1 |
| **類型** | B 類（Workflow 執行開銷） |

---

## 目標

將 `create-story/checklist.md` 從 358 行壓縮至 ~80 行，移除所有情緒化填充語言，保留實質驗證邏輯。

---

## 問題描述

`_bmad/bmm/workflows/4-implementation/create-story/checklist.md` 包含約 50% 的情緒化填充內容：
- `CRITICAL MISSION: Outperform and Fix the Original Create-Story LLM`
- `COMPETITIVE EXCELLENCE MINDSET`
- `Go create the ultimate developer implementation guide! 🚀`
- 重複的 `COMPETITION SUCCESS METRICS` 區塊（第 222-358 行）
- 大量 emoji 裝飾和擬人化激勵語

這些內容每次 create-story 執行時消耗 ~1,200 tokens，對 LLM 行為無實質約束力。

---

## 驗收標準

- [x] checklist.md 行數 < 100 行 → **62 行**
- [x] 所有 Step 1-4 的實質檢查項目保留完整
- [x] `CRITICAL` / `ENHANCEMENT` / `OPTIMIZATION` / `LLM-OPT` 四級分類邏輯保留
- [x] 互動流程（詢問使用者 apply [all/critical/select/none]）保留
- [x] 刪除所有 emoji 裝飾、擬人化激勵語、展示性範例
- [x] 用真實 Story 執行完整 create-story 流程驗證無迴歸（qgr-e1-orientation-switch 於 2026-02-24 成功建立）

---

## 風險

- 🟢 低：純刪除操作，不影響 Agent 行為邊界
- 注意：部分行為約束穿插在激勵性語言之間，需逐行審查而非批量刪除

---

## 預估效益

- 每次 create-story 節省 ~1,200 tokens
- Epic QGR 65 Stories 預估節省：~78,000 tokens

---

## 執行紀錄

| 時間 | 動作 |
|------|------|
| 2026-02-24 21:07 | 初版壓縮：358 行 → 62 行（-82.7%），使用繁體中文 |
| 2026-02-24 21:09 | 修正：Workflow 檔案改回英文（中文字元 token 成本 2-3x），行數維持 62 行 |

### 壓縮細節

**刪除內容**：
- 情緒化標題（CRITICAL MISSION, COMPETITIVE EXCELLENCE MINDSET）
- 重複的 COMPETITION SUCCESS METRICS 區塊（第 222-358 行）
- 所有 emoji 裝飾
- HOW TO USE THIS CHECKLIST 冗餘說明（validation framework 載入流程）
- Step 5-8 展示性模板（code block 範例）

**保留內容**：
- Step 1-4 全部實質檢查邏輯
- 四級分類（CRITICAL / ENHANCEMENT / OPTIMIZATION / LLM-OPT）
- 互動流程（all / critical / select / none / details）
- Step 7-8 套用與確認流程

**額外優化**：
- Step 2 子節改為 inline 格式（5 個子標題 → 5 個項目符號列）
- Step 3 改為表格呈現（更密集、更易掃描）
- 全文使用英文（Workflow 是給 AI 執行的，英文 token 效率更高）

**學到的規則**：
- Workflow 指令檔（instructions.xml、checklist.md 等）→ 英文（AI 消費，低 token）
- 追蹤報告、Story、說明文件 → 繁體中文（人類閱讀）
