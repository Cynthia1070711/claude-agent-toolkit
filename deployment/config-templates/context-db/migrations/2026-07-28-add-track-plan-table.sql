-- Migration: TDB-1 排程層 track_plan 表 (tdb-1-track-plan-roadmap)
-- Date: 2026-07-28
-- Source: DDL 與 init-db.js 的 track_plan 區塊一致(該處為單一真實來源,本檔僅縮排不同)。
--   衍生自 SDD Spec §3 (docs/implementation-artifacts/specs/epic-tdb/tdb-1-track-plan-roadmap-spec.md),
--   但**非逐字**——三處具名偏離(FK 未實作 / plan_state 4 值不含 'in-flight' / 欄位順序)見該 Spec
--   檔頭「Known implementation divergences」block(tdb-1 code-review F5 補記)。
-- Idempotent: 對齊 init-db.js CREATE TABLE IF NOT EXISTS (此 migration 為 timestamp trace,
--   實際套用走 `node .context-db/scripts/init-db.js`;測試檔以 exec(此檔) 直接套 DDL,單一 DDL 來源避免漂移)。
-- 純 additive,零既有表 schema 變更,不建 FTS5 / trigger(排程列無全文檢索需求)。
-- 刻意不宣告 FOREIGN KEY REFERENCES stories(story_id):better-sqlite3 此建置 PRAGMA foreign_keys
-- 預設為 1(ON),而 upsert-story.js _doUpsert 用 INSERT OR REPLACE INTO stories(PK 衝突時底層
-- 等於 DELETE+INSERT)—— 若宣告 ON DELETE CASCADE,任何一次無關欄位的 Story 更新都會靜默把該卡
-- 的 track_plan 列級聯刪除。referential integrity 改在應用層做(migrate-track-plan.js FK 完整性
-- 中止 + upsert-track-plan.js 寫入前 story 存在性檢查)。
-- UP

CREATE TABLE IF NOT EXISTS track_plan (
  story_id      TEXT PRIMARY KEY,
  lane          TEXT NOT NULL CHECK (lane IN ('manual','dispatch','reconcile')),
  seq           INTEGER,
  plan_state    TEXT NOT NULL DEFAULT 'queued' CHECK (plan_state IN ('queued','paused','unlocked','done-exited')),
  pause_reason  TEXT,
  unlock_note   TEXT,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_track_plan_lane_seq ON track_plan(lane, seq);
CREATE INDEX IF NOT EXISTS ix_track_plan_state     ON track_plan(plan_state);
