-- Migration: CCB-1 聊天室資料層 (ccb-1-db-mcp-import)
-- Date: 2026-07-28
-- Source: SDD Spec §3 (docs/implementation-artifacts/specs/epic-ccb/ccb-1-db-mcp-import-spec.md) — DDL 逐字同源於 init-db.js。
-- Idempotent: 對齊 init-db.js CREATE TABLE IF NOT EXISTS (此 migration 為 timestamp trace,
--   實際套用走 `node .context-db/scripts/init-db.js`;測試檔以 exec(此檔) 直接套 DDL,單一 DDL 來源避免漂移)。
-- 純資料層,零行為變更 —— 不改任何既有表 / 既有執行路徑,不觸碰 worker_* 四表(通道獨立,00 §一 定錨)。
-- UP

CREATE TABLE IF NOT EXISTS ctrl_threads (
  thread_id        TEXT PRIMARY KEY,
  topic            TEXT NOT NULL,
  category         TEXT,
  channel          TEXT NOT NULL DEFAULT 'general',
  initiator_track  TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  must_read        INTEGER NOT NULL DEFAULT 0,
  closed_at        TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ctrl_messages (
  msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id     TEXT NOT NULL REFERENCES ctrl_threads(thread_id),
  seq           INTEGER NOT NULL,
  from_track    TEXT NOT NULL,
  to_tracks     TEXT NOT NULL,
  msg_type      TEXT NOT NULL CHECK (msg_type IN ('inform','discuss','request','handoff','decision','state')),
  body          TEXT NOT NULL,
  ref_json      TEXT,
  superseded_by INTEGER,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ctrl_message_reads (
  msg_id   INTEGER NOT NULL,
  track    TEXT NOT NULL,
  read_at  TEXT NOT NULL,
  PRIMARY KEY (msg_id, track)
);

CREATE TABLE IF NOT EXISTS ctrl_boards (
  board_id   TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ctrl_messages_thread_seq ON ctrl_messages(thread_id, seq);
CREATE INDEX        IF NOT EXISTS ix_ctrl_messages_created    ON ctrl_messages(created_at);
CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_channel     ON ctrl_threads(channel, state);
CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_category    ON ctrl_threads(category);
CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_must_read   ON ctrl_threads(must_read, state);
CREATE INDEX        IF NOT EXISTS ix_ctrl_reads_track         ON ctrl_message_reads(track, read_at);

CREATE VIRTUAL TABLE IF NOT EXISTS ctrl_messages_fts USING fts5(
  body,
  content=ctrl_messages,
  content_rowid=msg_id,
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS ctrl_messages_ai AFTER INSERT ON ctrl_messages BEGIN
  INSERT INTO ctrl_messages_fts(rowid, body) VALUES (new.msg_id, new.body);
END;

CREATE TRIGGER IF NOT EXISTS ctrl_messages_ad AFTER DELETE ON ctrl_messages BEGIN
  INSERT INTO ctrl_messages_fts(ctrl_messages_fts, rowid, body) VALUES('delete', old.msg_id, old.body);
END;

CREATE TRIGGER IF NOT EXISTS ctrl_messages_au AFTER UPDATE ON ctrl_messages BEGIN
  INSERT INTO ctrl_messages_fts(ctrl_messages_fts, rowid, body) VALUES('delete', old.msg_id, old.body);
  INSERT INTO ctrl_messages_fts(rowid, body) VALUES (new.msg_id, new.body);
END;
