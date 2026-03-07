# Context Memory DB

本專案配備 SQLite Context Memory DB（MCP Tools），儲存歷史決策、除錯教訓、架構模式、事故記錄。

## 查詢優先（任務開始前）

開始任何任務前，用 `search_context` / `search_tech` 查詢相關記憶：
- BMAD workflow（create-story/dev-story/code-review）→ 查該 Story 所屬領域的歷史決策與 pattern
- Bug 修復 → 查 `category:debug` 是否有同類問題
- 架構決策 → 查 `category:decision` / `category:architecture`

## 寫入紀律（任務完成後）

發現新知識點時，用 `add_context` / `add_tech` 寫入 DB：
- 新的除錯發現、架構決策、模式確認 → `add_context`
- 技術方案驗證（成功/失敗）→ `add_tech`
- Code Review 發現的問題 → `add_cr_issue`

不寫入：臨時性操作、一次性查詢結果、已存在的重複知識。
