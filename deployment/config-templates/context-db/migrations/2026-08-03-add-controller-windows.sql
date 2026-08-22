-- Migration: CCB-4 中控視窗註冊表 (ccb-4-ctrl-notify-knock)
-- Date: 2026-08-03
-- Source: SDD Spec §3.1 (docs/implementation-artifacts/specs/epic-ccb/ccb-4-ctrl-notify-knock-spec.md)
--   — DDL 逐字同源於 init-db.js「Epic-CCB 中控視窗註冊表」區塊。
-- Idempotent: 對齊 init-db.js CREATE TABLE IF NOT EXISTS (此 migration 為 timestamp trace,
--   實際套用走 `node .context-db/scripts/init-db.js`)。
-- 純 additive:零修改既有表 / 既有 tool / 既有執行路徑;controller_windows 起始為空表,
--   隨各中控視窗宣告軌別而逐列填入。
-- UP

CREATE TABLE IF NOT EXISTS controller_windows (
  session_id            TEXT PRIMARY KEY,
  track                 TEXT NOT NULL,
  console_pid           INTEGER,
  console_cmdline       TEXT,
  last_probe_at         TEXT,
  last_probe_count      INTEGER NOT NULL DEFAULT -1,
  last_stop_block_at    TEXT,
  last_stop_block_count INTEGER NOT NULL DEFAULT -1,
  last_knock_at         TEXT,
  bound_at              TEXT NOT NULL,
  last_seen_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_controller_windows_track ON controller_windows(track, last_seen_at);
