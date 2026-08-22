-- Migration DOWN: ECC D5 Adoption-Score Model rollback
-- Date: 2026-05-25
-- ADR: ADR-ECC-LEARNING-001 v1.4.0 §Adoption-Score Model (D5)
-- 注意: DROP COLUMN 需 SQLite >= 3.35.0 (better-sqlite3 bundled SQLite 已支援)
-- ============================================================
-- DOWN

DROP INDEX IF EXISTS idx_instincts_adoption;

ALTER TABLE instincts DROP COLUMN adoption_score;
ALTER TABLE instincts DROP COLUMN business;
ALTER TABLE instincts DROP COLUMN project_type;

ALTER TABLE observations_queue DROP COLUMN project_type;
