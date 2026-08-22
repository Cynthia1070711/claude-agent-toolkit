-- Rollback: CCB-1 聊天室資料層 (ccb-1-db-mcp-import)
-- Date: 2026-07-28
-- DOWN — 移除 ctrl_threads / ctrl_messages / ctrl_message_reads / ctrl_boards 4 表 + FTS5 虛擬表(含影子表)+ 3 個 content-sync trigger。
-- 注意:DROP TABLE 自動移除其 indexes 與定義在該表上的 triggers,不需另 DROP INDEX / DROP TRIGGER。
-- 安全性:本卡新增表皆為 additive(零修改既有表 / tool / 執行路徑)。.context-db/phycool.db 為 gitignored,
--   DB 側回滾僅靠本檔;2 個主 .md + 15 個封存檔全程原文保留(未刪除或搬移),回滾零資料損失。

DROP TABLE IF EXISTS ctrl_messages_fts;
DROP TABLE IF EXISTS ctrl_message_reads;
DROP TABLE IF EXISTS ctrl_messages;
DROP TABLE IF EXISTS ctrl_threads;
DROP TABLE IF EXISTS ctrl_boards;
