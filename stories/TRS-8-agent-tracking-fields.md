# TRS-8: Workflow Agent 追蹤欄位標準化

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-8 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P1 |
| **建立時間** | 2026-02-24 23:38 |
| **依賴** | TRS-7（instructions.xml 結構已優化） |
| **後續** | 下次 create-story / dev-story / code-review 執行時驗證 |
| **來源** | fra-4 Story 有手動 Agent 追蹤欄位，但模板未標準化 |
| **類型** | B 類（Workflow 執行開銷 — 可觀察性改善） |
| **Create Agent** | Claude Opus 4.6 |
| **Create完成時間** | 2026-02-24 23:38 |

---

## 目標

將 Agent 模型追蹤欄位標準化到 create-story / dev-story / code-review 三個 workflow 中，使每個 Story 的完整生命週期自動記錄執行的 LLM 模型與完成時間。

---

## 問題描述

`fra-4-purchase-policy-disclosure` 的 Story 資訊表包含 Agent 追蹤欄位（Create Agent、DEV Agent、Review Agent + 各自完成時間），但這些欄位是 ad-hoc 手動加上的，並未存在於：

- `template.md` — Story 模板無 Agent 追蹤欄位
- `create-story/instructions.xml` — 無填寫 Agent 欄位的指令
- `dev-story/instructions.xml` — 無填寫 DEV Agent 欄位的指令
- `code-review/instructions.xml` — 無填寫 Review Agent 欄位的指令

導致所有由 workflow 產生的 Story（包括 qgr-e1）皆缺少此追蹤資訊。

### 業務價值

Agent 追蹤資訊對多模型策略分析至關重要：
- 觀察不同 LLM（Claude Opus/Sonnet、Gemini 3.1 Pro 等）在不同任務類型的表現
- 分析 Create/DEV/Review 各階段的最佳模型配置
- 建立模型選擇的數據基礎

---

## 驗收標準

- [x] `template.md` Story 資訊表新增 6 個 Agent 追蹤欄位（Create/DEV/Review Agent + 完成時間）
- [x] `create-story/instructions.xml` Step 6 新增指令：自動填寫 Create Agent + Create完成時間
- [x] `dev-story/instructions.xml` Step 9 新增指令：自動填寫 DEV Agent + DEV完成時間
- [x] `code-review/instructions.xml` Step 5 新增指令：自動填寫 Review Agent + Review完成時間
- [x] `qgr-e1-orientation-switch.md` 補上 Create Agent: Claude Opus 4.6 + Create完成時間
- [x] 用真實 Story 執行 create-story 驗證 Agent 欄位自動產生 — qgr-e2: Create Agent=Claude Opus 4.6, Create完成時間=2026-02-24 23:47
- [x] 用真實 Story 執行 dev-story 驗證 DEV Agent 欄位自動填寫 — qgr-e1: DEV Agent=Claude Sonnet 4.6, DEV完成時間=2026-02-24 23:52
- [x] 用真實 Story 執行 code-review 驗證 Review Agent 欄位自動填寫 — qgr-e1: Review Agent=Claude Opus 4.6, Review完成時間=2026-02-25 00:00

---

## 風險

- 🟢 低：純新增欄位，不影響既有 workflow 邏輯
- 注意：Agent 自我辨識模型名稱的準確度取決於 LLM 的 self-awareness，部分模型可能填寫不精確

---

## 變更記錄

| 時間 | 操作 | 說明 |
|------|------|------|
| 2026-02-24 23:38 | 執行完成 | 修改 5 個檔案：template.md (+6 欄位)、create-story/instructions.xml (+4 行)、dev-story/instructions.xml (+4 行)、code-review/instructions.xml (+4 行)、qgr-e1 Story (+6 欄位) |
| 2026-02-25 00:22 | 驗證完成 | 3 個真實 workflow 驗證全通過：create-story (qgr-e2)、dev-story (qgr-e1)、code-review (qgr-e1)，Agent 追蹤欄位均自動正確填入 |

### 修改檔案清單

| 操作 | 檔案路徑 | 說明 |
|------|----------|------|
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/template.md` | Story 資訊表新增 6 個 Agent 追蹤欄位 |
| 修改 | `_bmad/bmm/workflows/4-implementation/create-story/instructions.xml` | Step 6 新增 Create Agent 填寫指令 |
| 修改 | `_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml` | Step 9 新增 DEV Agent 填寫指令 |
| 修改 | `_bmad/bmm/workflows/4-implementation/code-review/instructions.xml` | Step 5 新增 Review Agent 填寫指令 |
| 修改 | `docs/implementation-artifacts/stories/epic-qgr/qgr-e1-orientation-switch.md` | 補上 Create Agent + Create完成時間 |
