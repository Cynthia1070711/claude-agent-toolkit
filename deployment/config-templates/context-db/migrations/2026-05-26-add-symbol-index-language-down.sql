-- DOWN migration for 2026-05-26-add-symbol-index-language.sql
-- SQLite < 3.35 cannot DROP COLUMN; for full rollback restore from phycool.db.bak.{ts}.
DROP INDEX IF EXISTS idx_symbol_index_language;
-- ALTER TABLE symbol_index DROP COLUMN language;  -- requires SQLite >= 3.35; otherwise restore .bak.{ts}
