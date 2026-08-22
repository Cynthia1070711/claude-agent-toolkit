-- Migration: Epic-WHP worker protocol registry (whp-3-db-schema-registry)
-- Date: 2026-07-27
-- Source: SSoT 雙向握手協議機制.md §23 (gitignored, local disk only) — DDL verbatim.
-- Idempotent: 對齊 init-db.js CREATE TABLE IF NOT EXISTS (此 migration 為 timestamp trace,
--   實際套用走 `node .context-db/scripts/init-db.js`).
-- 純資料層,零行為變更 — 不改任何既有表 / 既有執行路徑。
-- UP

CREATE TABLE IF NOT EXISTS worker_runs (
  run_id              TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  resumed_from_run_id TEXT,
  story_id            TEXT NOT NULL,
  phase               TEXT NOT NULL,
  attempt             INTEGER NOT NULL DEFAULT 1,
  controller_track    TEXT NOT NULL DEFAULT 'unspecified',
  run_mode            TEXT NOT NULL DEFAULT 'window',
  wrapper_pid         INTEGER,
  claude_pid          INTEGER,
  cmd_line            TEXT,
  window_title        TEXT,
  ipc_dir             TEXT NOT NULL,
  model_id            TEXT,
  effort              TEXT,
  work_root           TEXT,
  baseline_commit     TEXT,
  lifecycle           TEXT NOT NULL DEFAULT 'dispatching',
  close_source        TEXT,
  last_status         TEXT,
  evidence_incomplete INTEGER NOT NULL DEFAULT 0,
  turn_count          INTEGER NOT NULL DEFAULT 0,
  files_modified      TEXT,
  health_flag         TEXT,
  stall_rounds        INTEGER NOT NULL DEFAULT 0,
  reported_at         TEXT,
  ack_at              TEXT,
  ack_by              TEXT,
  notify_count        INTEGER NOT NULL DEFAULT 0,
  last_notified_at    TEXT,
  window_vanished_at  TEXT,
  abandoned_at_stage  TEXT,
  requires_attention  INTEGER NOT NULL DEFAULT 0,
  guardian_exit_reason TEXT,
  started_at          TEXT NOT NULL,
  last_turn_at        TEXT,
  closed_at           TEXT,
  closed_detected_at  TEXT,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_messages (
  msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  direction     TEXT NOT NULL,
  msg_type      TEXT NOT NULL,
  body          TEXT NOT NULL,
  author        TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'pending',
  delivered_via TEXT,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT,
  consumed_at   TEXT
);

CREATE TABLE IF NOT EXISTS worker_handoffs (
  run_id          TEXT PRIMARY KEY,
  story_id        TEXT NOT NULL,
  phase           TEXT NOT NULL,
  evidence_json   TEXT,
  deliverables    TEXT,
  gate_result     TEXT NOT NULL DEFAULT 'pending',
  gate_by         TEXT,
  gate_notes      TEXT,
  override_reason TEXT,
  gate_at         TEXT,
  next_phase      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guardian_heartbeat (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  guardian_pid   INTEGER,
  host           TEXT,
  started_at     TEXT,
  last_beat_at   TEXT,
  fast_tick_sec  INTEGER NOT NULL DEFAULT 30,
  slow_tick_sec  INTEGER NOT NULL DEFAULT 600,
  watched_runs   INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  updated_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_runs_key       ON worker_runs(story_id, phase, attempt);
CREATE INDEX        IF NOT EXISTS ix_worker_runs_lifecycle ON worker_runs(lifecycle, updated_at);
CREATE INDEX        IF NOT EXISTS ix_worker_runs_track     ON worker_runs(controller_track, started_at);
CREATE INDEX        IF NOT EXISTS ix_worker_runs_session   ON worker_runs(session_id);
CREATE INDEX        IF NOT EXISTS ix_worker_runs_pending_ack
  ON worker_runs(lifecycle, reported_at) WHERE ack_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_messages_run_seq ON worker_messages(run_id, seq);
CREATE INDEX        IF NOT EXISTS ix_worker_messages_pending ON worker_messages(run_id, direction, state);

CREATE INDEX IF NOT EXISTS ix_worker_handoffs_gate ON worker_handoffs(gate_result, updated_at);
