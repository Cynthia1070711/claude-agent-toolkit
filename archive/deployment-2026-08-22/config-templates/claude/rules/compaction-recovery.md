# Context Compaction Recovery

Context compaction summary 是系統自動生成的對話摘要，可能記錄錯誤的執行方式。

## 強制規則

當偵測到對話從 compaction summary 恢復時（特徵：訊息開頭含 "This session is being continued from a previous conversation"）：

1. **禁止盲信 summary 的「怎麼做」**：Summary 記錄「要做什麼」通常正確，但「怎麼做」（檔案格式、儲存方式、輸出路徑）可能錯誤
2. **強制回查原始檔案**：執行任何操作前，讀取相關的 README / 規範檔確認執行方式
3. **查詢記憶庫**：`search_context` 查詢是否有相關 lesson 記錄（如 DB-first、特殊約定等）
4. **交叉驗證**：當 summary 指示與專案規範衝突時，以專案規範為準

## 高風險場景

- DB-first Story 儲存（不建 .md 檔案）
- 任何涉及「建立檔案 vs 寫入 DB」的決策
- 特殊 Epic 約定（儲存方式、命名規則、輸出格式）
