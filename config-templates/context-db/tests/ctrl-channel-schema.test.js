// ccb-1-db-mcp-import — Schema tests(BR-001~BR-007)
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// 對齊 worker-protocol-schema.test.js 既有 DRY 範式:schema 測試以 exec(MIGRATION_SQL) 套 DDL。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql'),
  'utf8'
);

let ctx;

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  ctx.cleanup();
});

describe('BR-001: schema materialisation', () => {
  it('BR001_InitDbRunTwice_NoErrorAndFiveCtrlObjects: applying the migration twice throws nothing and ctrl_% table count >= 5', () => {
    expect(() => ctx.db.exec(MIGRATION_SQL)).not.toThrow();
    const count = ctx.db.prepare(
      "SELECT count(*) c FROM sqlite_master WHERE name LIKE 'ctrl_%' AND type='table'"
    ).get().c;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('creates all 4 base tables plus the FTS5 virtual table', () => {
    const names = ctx.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ctrl_threads','ctrl_messages','ctrl_message_reads','ctrl_boards','ctrl_messages_fts')"
    ).all().map(r => r.name);
    expect(names.sort()).toEqual(['ctrl_boards', 'ctrl_message_reads', 'ctrl_messages', 'ctrl_messages_fts', 'ctrl_threads']);
  });
});

describe('BR-002: ux_ctrl_messages_thread_seq uniqueness', () => {
  it('BR002_DuplicateThreadSeq_ThrowsUniqueConstraint: inserting a duplicate (thread_id, seq) pair throws', () => {
    ctx.db.prepare(`
      INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at)
      VALUES ('t1', 'topic', 'A軌', '2026-01-01T00:00:00+08:00')
    `).run();
    const insert = ctx.db.prepare(`
      INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
      VALUES (@thread_id, @seq, @from_track, @to_tracks, @msg_type, @body, @created_at)
    `);
    insert.run({ thread_id: 't1', seq: 1, from_track: 'A軌', to_tracks: '["B軌"]', msg_type: 'inform', body: 'x', created_at: '2026-01-01T00:00:00+08:00' });
    expect(() => insert.run({ thread_id: 't1', seq: 1, from_track: 'B軌', to_tracks: '["A軌"]', msg_type: 'inform', body: 'y', created_at: '2026-01-01T00:00:01+08:00' }))
      .toThrow(/UNIQUE constraint failed/);
  });
});

describe('BR-003: ctrl_message_reads PK(msg_id,track) upsert semantics', () => {
  it('BR003_ReadUpsertTwice_KeepsSingleRowAndUpdatesReadAt: same (msg_id,track) UPSERT twice keeps 1 row with the latest read_at', () => {
    ctx.db.prepare(`
      INSERT INTO ctrl_message_reads (msg_id, track, read_at) VALUES (1, '前台軌', 'T1')
      ON CONFLICT(msg_id, track) DO UPDATE SET read_at=excluded.read_at
    `).run();
    ctx.db.prepare(`
      INSERT INTO ctrl_message_reads (msg_id, track, read_at) VALUES (1, '前台軌', 'T2')
      ON CONFLICT(msg_id, track) DO UPDATE SET read_at=excluded.read_at
    `).run();
    const rows = ctx.db.prepare('SELECT * FROM ctrl_message_reads WHERE msg_id=1 AND track=?').all('前台軌');
    expect(rows).toHaveLength(1);
    expect(rows[0].read_at).toBe('T2');
  });
});

describe('BR-004: ctrl_messages_fts trigram FTS5', () => {
  it('BR004_FtsMatchChineseTerm_ReturnsOneRow: inserting a Chinese-body message makes it findable via trigram MATCH', () => {
    ctx.db.prepare(`
      INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at)
      VALUES ('t1', 'topic', 'A軌', '2026-01-01T00:00:00+08:00')
    `).run();
    ctx.db.prepare(`
      INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
      VALUES ('t1', 1, 'A軌', '["B軌"]', 'request', '請後台軌讓出 Migration 窗口協調', '2026-01-01T00:00:00+08:00')
    `).run();
    const count = ctx.db.prepare(`SELECT count(*) c FROM ctrl_messages_fts WHERE ctrl_messages_fts MATCH '"窗口協調"'`).get().c;
    expect(count).toBe(1);
    const sql = ctx.db.prepare(`SELECT sql FROM sqlite_master WHERE name='ctrl_messages_fts'`).get().sql;
    expect(sql).toMatch(/tokenize\s*=\s*'trigram'/);
  });
});

describe('BR-005: index list', () => {
  it('BR005_IndexList_ContainsThreeThreadIndexes: ctrl_threads carries the channel/category/must_read indexes', () => {
    const names = ctx.db.prepare("PRAGMA index_list('ctrl_threads')").all().map(r => r.name);
    expect(names).toContain('ix_ctrl_threads_channel');
    expect(names).toContain('ix_ctrl_threads_category');
    expect(names).toContain('ix_ctrl_threads_must_read');
  });

  it('ctrl_messages carries the UNIQUE(thread_id,seq) and created_at indexes', () => {
    const names = ctx.db.prepare("PRAGMA index_list('ctrl_messages')").all().map(r => r.name);
    expect(names).toContain('ux_ctrl_messages_thread_seq');
    expect(names).toContain('ix_ctrl_messages_created');
  });
});

describe('BR-006: ctrl_threads.state CHECK constraint', () => {
  it('rejects a state value outside open/closed', () => {
    ctx.db.prepare(`
      INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at)
      VALUES ('t1', 'topic', 'A軌', '2026-01-01T00:00:00+08:00')
    `).run();
    expect(() => ctx.db.prepare("UPDATE ctrl_threads SET state='archived' WHERE thread_id='t1'").run())
      .toThrow(/CHECK constraint failed/);
  });
});

describe('BR-007: ctrl_messages.msg_type CHECK constraint', () => {
  it('rejects an msg_type value outside the 6 legal enum values', () => {
    ctx.db.prepare(`
      INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at)
      VALUES ('t1', 'topic', 'A軌', '2026-01-01T00:00:00+08:00')
    `).run();
    expect(() => ctx.db.prepare(`
      INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
      VALUES ('t1', 1, 'A軌', '["B軌"]', 'chat', 'x', '2026-01-01T00:00:00+08:00')
    `).run()).toThrow(/CHECK constraint failed/);
  });
});

describe('BR-046: query plan uses ux_ctrl_messages_thread_seq', () => {
  it('BR046_ThreadQueryPlan_UsesThreadSeqIndex: EXPLAIN QUERY PLAN hits the index, not a full scan', () => {
    const plan = ctx.db.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM ctrl_messages WHERE thread_id=? ORDER BY seq"
    ).all('t1');
    const detail = plan.map(p => p.detail).join(' | ');
    expect(detail).toMatch(/USING INDEX ux_ctrl_messages_thread_seq/);
    expect(detail).not.toMatch(/SCAN ctrl_messages/);
  });
});
