-- Migration: ECC emergence UI v2 — 4 池架構新增 schema
-- Date: 2026-05-28
-- Story: ecc-emergence-ui-v2
-- 冪等性: 對齊 init-db.js §Epic-ECC-V2 UI v2 PRAGMA-check ALTER block
--   標準套用走 `node .context-db/scripts/init-db.js`
-- ============================================================
-- UP

-- 1. instincts_rejected +restored_at (否決還原紀錄)
--    PRAGMA check 前置不在此重複 — 已在 init-db.js §Epic-ECC-V2 UI v2 處理
--    此 .sql 為 timestamp trace 記錄用

-- 2. generated_skills (技能池主表)
CREATE TABLE IF NOT EXISTS generated_skills (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  instinct_cluster_id TEXT NOT NULL,
  skill_path          TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL CHECK(status IN('active','paused','deleted')) DEFAULT 'active',
  generated_at        TEXT NOT NULL,
  paused_at           TEXT,
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_generated_skills_status ON generated_skills (status);

-- 3. effect_metrics (技能效果量測)
CREATE TABLE IF NOT EXISTS effect_metrics (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id            INTEGER NOT NULL REFERENCES generated_skills(id),
  before_freq         INTEGER NOT NULL,
  after_freq          INTEGER NOT NULL,
  improvement_pct     REAL NOT NULL,
  measured_at         TEXT NOT NULL,
  sample_window_days  INTEGER NOT NULL DEFAULT 7
);
CREATE INDEX IF NOT EXISTS idx_effect_metrics_skill_measured ON effect_metrics (skill_id, measured_at DESC);
