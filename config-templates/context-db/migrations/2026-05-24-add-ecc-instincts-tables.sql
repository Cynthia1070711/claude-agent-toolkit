-- Migration: Epic-ECC-V2 α-path L2 Atomic Instincts (ecc-07)
-- Date: 2026-05-24
-- adapt-from-source: ECC-main homunculus instinct schema (everything-claude-code-instincts.yaml
--   fields id/trigger/confidence/domain/source + Action/Evidence) → PhyCool SQLite.
-- 適配 (tianji L3): YAML filesystem → SQLite · scope 4-value (CEO §8.1) · + verifier_status/decay_at.
-- Idempotent: 對齊 init-db.js CREATE TABLE IF NOT EXISTS (此 migration 為 timestamp trace,
--   實際套用走 `node .context-db/scripts/init-db.js`).
-- UP

CREATE TABLE IF NOT EXISTS instincts (
  id                TEXT PRIMARY KEY,
  trigger           TEXT NOT NULL,
  action            TEXT NOT NULL,
  confidence        REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  scope             TEXT NOT NULL CHECK (scope IN ('session','pipeline-session','project','global')),
  domain            TEXT,
  source            TEXT,
  source_session_id TEXT,
  evidence_jsonb    TEXT,
  verifier_status   TEXT CHECK (verifier_status IN ('approved','rejected','needs-more-evidence')),
  verifier_reason   TEXT,
  created_at        TEXT NOT NULL,
  last_seen         TEXT NOT NULL,
  decay_at          TEXT,
  CONSTRAINT unique_trigger_scope UNIQUE (trigger, scope)
);
CREATE INDEX IF NOT EXISTS idx_instincts_scope_conf ON instincts (scope, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_instincts_last_seen ON instincts (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_instincts_domain ON instincts (domain);

CREATE TABLE IF NOT EXISTS observations_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  file_path     TEXT,
  pattern_type  TEXT NOT NULL,
  context_jsonb TEXT NOT NULL,
  processed     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_processed ON observations_queue (processed, created_at);

CREATE TABLE IF NOT EXISTS instincts_rejected (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger        TEXT NOT NULL,
  action         TEXT NOT NULL,
  reject_reason  TEXT NOT NULL,
  evidence_jsonb TEXT,
  rejected_at    TEXT NOT NULL
);
