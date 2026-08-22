// whp-3-db-schema-registry — AC1/AC2/AC3 + BR-006 (gate CAS) + BR-007 (message dedup)
// 走隔離 temp DB(createTestDb),絕不連 phycool.db。schema 直接 exec migration up 檔本尊
// (DRY,單一 DDL 來源 = 實際套用走的同一份 .sql,避免測試 schema 與正式 schema 漂移)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
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

describe('AC1: schema materialisation (BR-001/BR-002)', () => {
  it('creates exactly 4 tables and 8 explicit indexes (excluding sqlite_autoindex)', () => {
    const tableCount = ctx.db.prepare(
      "SELECT count(*) c FROM sqlite_master WHERE type='table' AND name IN ('worker_runs','worker_messages','worker_handoffs','guardian_heartbeat')"
    ).get().c;
    expect(tableCount).toBe(4);

    const explicitIndexCount = ctx.db.prepare(
      "SELECT count(*) c FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%' AND tbl_name IN ('worker_runs','worker_messages','worker_handoffs','guardian_heartbeat')"
    ).get().c;
    expect(explicitIndexCount).toBe(8);
  });

  it('column counts match SSoT §23 field-for-field: 39/12/13/10 (migration snapshot), 13 for worker_messages after the whp-11 additive ALTER', () => {
    expect(ctx.db.prepare('PRAGMA table_info(worker_runs)').all()).toHaveLength(39);
    // migration file is a frozen whp-3 snapshot (per project practice, single-column adds live
    // in init-db.js additive-ALTER only -- see worker-directive-poll.test.js beforeEach) so the
    // raw migration still yields 12; production parity is asserted by replaying the same ALTER
    // init-db.js:1404-1413 applies (whp-11 CR: this lock's header promises "避免測試 schema 與
    // 正式 schema 漂移", which a 12-only assertion silently stopped delivering once knocked_at
    // landed).
    expect(ctx.db.prepare('PRAGMA table_info(worker_messages)').all()).toHaveLength(12);
    ctx.db.exec('ALTER TABLE worker_messages ADD COLUMN knocked_at TEXT');
    const wmCols = ctx.db.prepare('PRAGMA table_info(worker_messages)').all();
    expect(wmCols).toHaveLength(13);
    expect(wmCols.map(c => c.name)).toContain('knocked_at');
    expect(ctx.db.prepare('PRAGMA table_info(worker_handoffs)').all()).toHaveLength(13);
    expect(ctx.db.prepare('PRAGMA table_info(guardian_heartbeat)').all()).toHaveLength(10);
  });

  it('applying the migration a second time is idempotent (no error, counts unchanged)', () => {
    expect(() => ctx.db.exec(MIGRATION_SQL)).not.toThrow();
    expect(ctx.db.prepare('PRAGMA table_info(worker_runs)').all()).toHaveLength(39);
    const tableCount = ctx.db.prepare(
      "SELECT count(*) c FROM sqlite_master WHERE type='table' AND name IN ('worker_runs','worker_messages','worker_handoffs','guardian_heartbeat')"
    ).get().c;
    expect(tableCount).toBe(4);
  });
});

describe('AC2: two deliberate index decisions (BR-003/BR-004)', () => {
  it('the only UNIQUE index on worker_runs is ux_worker_runs_key, and its SQL contains no WHERE', () => {
    const rows = ctx.db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='worker_runs' AND sql LIKE '%UNIQUE%'"
    ).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ux_worker_runs_key');
    expect(rows[0].sql).not.toMatch(/WHERE/i);
  });

  it('two rows sharing (story_id, phase) with different attempt both accepted, both running', () => {
    const insert = ctx.db.prepare(`
      INSERT INTO worker_runs (run_id, session_id, story_id, phase, attempt, ipc_dir, lifecycle, started_at, updated_at)
      VALUES (@run_id, @session_id, @story_id, @phase, @attempt, @ipc_dir, @lifecycle, @t, @t)
    `);
    insert.run({ run_id: 'r1', session_id: 's1', story_id: 'st1', phase: 'code-review', attempt: 1, ipc_dir: 'd1', lifecycle: 'running', t: '2026-01-01T00:00:00+08:00' });
    insert.run({ run_id: 'r2', session_id: 's1', story_id: 'st1', phase: 'code-review', attempt: 2, ipc_dir: 'd2', lifecycle: 'running', t: '2026-01-01T00:00:00+08:00' });

    const count = ctx.db.prepare(
      "SELECT count(*) c FROM worker_runs WHERE story_id='st1' AND phase='code-review' AND lifecycle='running'"
    ).get().c;
    expect(count).toBe(2);
  });

  it('a third row with the same (story_id, phase, attempt) is rejected by ux_worker_runs_key', () => {
    const insert = ctx.db.prepare(`
      INSERT INTO worker_runs (run_id, session_id, story_id, phase, attempt, ipc_dir, started_at, updated_at)
      VALUES (@run_id, @session_id, @story_id, @phase, @attempt, @ipc_dir, @t, @t)
    `);
    insert.run({ run_id: 'r1', session_id: 's1', story_id: 'st1', phase: 'dev-story', attempt: 1, ipc_dir: 'd1', t: '2026-01-01T00:00:00+08:00' });
    expect(() => insert.run({ run_id: 'r-dup', session_id: 's1', story_id: 'st1', phase: 'dev-story', attempt: 1, ipc_dir: 'd1', t: '2026-01-01T00:00:00+08:00' }))
      .toThrow(/UNIQUE constraint failed/);
  });

  it('the guardian hot query (lifecycle=reported AND ack_at IS NULL) uses the partial index', () => {
    const plan = ctx.db.prepare(
      "EXPLAIN QUERY PLAN SELECT run_id FROM worker_runs WHERE lifecycle='reported' AND ack_at IS NULL"
    ).all();
    const usesPartialIndex = plan.some(p => typeof p.detail === 'string' && p.detail.includes('ix_worker_runs_pending_ack'));
    expect(usesPartialIndex).toBe(true);
  });

  it('BR-025: ix_worker_runs_pending_ack is the only partial index (sql contains WHERE) among the 8 new indexes', () => {
    const rows = ctx.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('worker_runs','worker_messages','worker_handoffs') AND sql LIKE '% WHERE %'"
    ).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ix_worker_runs_pending_ack');
  });
});

describe('AC3: guardian_heartbeat singleton (BR-005)', () => {
  it('inserting id=1 succeeds', () => {
    const info = ctx.db.prepare(
      "INSERT INTO guardian_heartbeat (id, updated_at) VALUES (1, '2026-01-01T00:00:00+08:00')"
    ).run();
    expect(info.changes).toBe(1);
  });

  it('inserting id=2 is rejected by the CHECK constraint', () => {
    expect(() => ctx.db.prepare(
      "INSERT INTO guardian_heartbeat (id, updated_at) VALUES (2, '2026-01-01T00:00:00+08:00')"
    ).run()).toThrow(/CHECK constraint failed/);
  });
});

describe('BR-006: worker_handoffs gate CAS', () => {
  it('first conditional UPDATE succeeds (changes=1); second (already moved) loses (changes=0)', () => {
    ctx.db.prepare(`
      INSERT INTO worker_handoffs (run_id, story_id, phase, gate_result, created_at, updated_at)
      VALUES ('r1', 'st1', 'dev-story', 'pending', '2026-01-01T00:00:00+08:00', '2026-01-01T00:00:00+08:00')
    `).run();

    const first = ctx.db.prepare(
      "UPDATE worker_handoffs SET gate_result='approved' WHERE run_id='r1' AND gate_result='pending'"
    ).run();
    expect(first.changes).toBe(1);

    const second = ctx.db.prepare(
      "UPDATE worker_handoffs SET gate_result='approved' WHERE run_id='r1' AND gate_result='pending'"
    ).run();
    expect(second.changes).toBe(0);
  });
});

describe('BR-007: ux_worker_messages_run_seq', () => {
  it('a duplicate (run_id, seq) pair is rejected', () => {
    const insert = ctx.db.prepare(`
      INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, created_at)
      VALUES (@run_id, @seq, @direction, @msg_type, @body, @author, @t)
    `);
    insert.run({ run_id: 'r1', seq: 1, direction: 'controller-to-worker', msg_type: 'directive', body: 'x', author: 'controller', t: '2026-01-01T00:00:00+08:00' });
    expect(() => insert.run({ run_id: 'r1', seq: 1, direction: 'worker-to-controller', msg_type: 'reply', body: 'y', author: 'worker', t: '2026-01-01T00:00:00+08:00' }))
      .toThrow(/UNIQUE constraint failed: worker_messages.run_id, worker_messages.seq/);
  });
});
