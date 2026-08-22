-- G14 PhyCool RepoMap v2 (方案1) — add `language` column to symbol_index for multi-lang CodeGraph harvest
-- Date: 2026-05-26 · Track: 開發環境檢索架構改善 (Axis 6) · ADR: 改善計畫 §6.7
-- Context: harvest-codegraph-to-symbolgraph.cjs rebuilds symbol_index from CodeGraph (multi-lang),
--          adding language dimension (csharp/typescript/tsx/javascript/php/...). Additive, non-destructive schema.
-- NOTE: SQLite has no `ADD COLUMN IF NOT EXISTS`; the harvest script guards with PRAGMA table_info before ALTER (idempotent).

ALTER TABLE symbol_index ADD COLUMN language TEXT;
CREATE INDEX IF NOT EXISTS idx_symbol_index_language ON symbol_index(language);
