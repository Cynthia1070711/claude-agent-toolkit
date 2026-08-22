# Context Memory DB

本專案配備 SQLite Context Memory DB（MCP Tools），儲存歷史決策、除錯教訓、架構模式、事故記錄、工作階段摘要。

## 對話開始儀式（CRITICAL — 每次對話的第一個回應前必須執行）

1. 檢查 Hook 是否已注入 session 記錄（additionalContext 中有「最近工作階段摘要」）
2. 若未注入或需要更多細節，手動執行 `search_context("", {category: "session", limit: 3})`
3. 基於 session 記錄理解當前專案狀態，再回應使用者
4. 若使用者問「前回做了什麼」類問題，**必須從記憶庫回答**，禁止直接讀 YAML

## 查詢優先（任務開始前）

開始任何任務前，用 `search_context` / `search_tech` 查詢相關記憶：
- BMAD workflow（create-story/dev-story/code-review）→ 查該 Story 所屬領域的歷史決策與 pattern
- Bug 修復 → 查 `category:debug` 是否有同類問題
- 架構決策 → 查 `category:decision` / `category:architecture`
- 專案狀態查詢 → 查 `category:session` 最近記錄

## 寫入紀律（任務完成後）

發現新知識點時，用 `add_context` / `add_tech` 寫入 DB：
- 新的除錯發現、架構決策、模式確認 → `add_context`
- 技術方案驗證（成功/失敗）→ `add_tech`
- Code Review 發現的問題 → `add_cr_issue`
- 對話即將結束或重要里程碑完成 → `add_context(category: "session")`
  - title: "Session 摘要: {日期} {主要任務}"
  - content: 完成了什麼 + 當前狀態 + 下一步建議
  - tags: `["session", "manual"]`

不寫入：臨時性操作、一次性查詢結果、已存在的重複知識。

## DB-first Story 的 SDD+ATDD 規則

DB-first Story 透過 `upsert-story.js` 直接寫入 DB，**不經過 create-story workflow checklist**。
但 AC 格式仍須遵循 SDD+ATDD+TDD 規範：

- **AC 格式**：ATDD 格式 — Given {前置條件} → When {操作} → Then {可驗證結果}（含具體數值）
- **BR 映射**：每個 AC 附 `[Verifies: BR-XXX]`（S 複雜度可內嵌定義；M/L/XL 引用 Spec）
- **M/L/XL Story**：寫入 DB 前應先產出 SDD Spec（`{{SPEC_DIR}}`）
- **dev-story / code-review**：下游 workflow 仍會觸發 SDD-TDD Bridge 和 VSDD 檢查

## 自動機制（三重保險）

| Hook | 觸發時機 | 行為 |
|------|---------|------|
| **Stop** | 每次 Agent 回應完成 | 2 分鐘內 UPDATE 既有記錄，超過則 INSERT 新記錄 |
| **SessionEnd** | 對話結束 | 無條件 INSERT（最後一次保底寫入） |
| **PreCompact** | context compaction 前 | 與 Stop 共用防重複邏輯 |
| **UserPromptSubmit** | 使用者提問時 | 注入最近 3 條 session 記錄至 additionalContext |

> Agent 無需手動寫入 session 記錄（Stop Hook 自動處理），但重要里程碑仍建議手動補充更詳細的摘要。
