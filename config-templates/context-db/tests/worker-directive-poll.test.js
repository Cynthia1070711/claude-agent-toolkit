// whp-11-d2-inline-revise T3 — behavioural tests for worker-directive-poll.cjs
// 走隔離 temp DB(createTestDb + migration SQL exec + additive knocked_at ALTER),絕不連 phycool.db。
// Case names are byte-identical to stories.testing_strategy (test-spec-audit.js consume mode) for
// the unit-level BRs this module owns (peekPending/stampKnocked/buildKnockDecision, → AC1/AC3/AC6).
// The bounded-wait loop itself (BR002/003/005/007/010/013, real timing / real stop-report.ps1 spawn)
// is integration-level and lives in smoke-test.ps1 (T5's own coverage), not here.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createTestDb } from './helpers/test-db.js';
import { peekPending, stampKnocked, buildKnockDecision, resolveGraceSec } from '../scripts/worker-directive-poll.cjs';
import { readDirectives } from '../scripts/read-worker-directives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);

let ctx;
const T = '2026-01-01T00:00:00.000+08:00';

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
  // whp-11: knocked_at post-dates the whp-3 migration snapshot -- additive ALTER here mirrors
  // init-db.js's production migration (T1); a single-column add to an existing table does not
  // get its own migrations/*.sql in this project's established practice (only new tables do).
  ctx.db.exec(`ALTER TABLE worker_messages ADD COLUMN knocked_at TEXT`);
});

afterEach(() => {
  ctx.cleanup();
});

function seedRun(overrides = {}) {
  const row = {
    run_id: 'r1', session_id: 's1', story_id: 'st1', phase: 'dev-story',
    ipc_dir: 'C:\\ipc\\st1', run_mode: 'window', lifecycle: 'running',
    controller_track: 'backend', started_at: T, updated_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle,
      controller_track, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @run_mode, @lifecycle,
      @controller_track, @started_at, @updated_at)
  `).run(row);
  return row;
}

function seedMessage(overrides = {}) {
  const row = {
    run_id: 'r1', seq: 1, direction: 'controller-to-worker', msg_type: 'wake',
    body: 'test body', author: 'CC-OPUS', state: 'pending', delivered_via: null,
    created_at: T, knocked_at: null,
    ...overrides,
  };
  const info = ctx.db.prepare(`
    INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, delivered_via, created_at, knocked_at)
    VALUES (@run_id, @seq, @direction, @msg_type, @body, @author, @state, @delivered_via, @created_at, @knocked_at)
  `).run(row);
  return Number(info.lastInsertRowid);
}

// ============================================================
// peekPending — AC3/AC6
// ============================================================
describe('peekPending', () => {
  it('BR001_PendingDirectiveAtTurnEnd_EmitsDecisionBlock (peekPending half): finds the pending row', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running' });
    const msgId = seedMessage({ run_id: 'r1', seq: 1 });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].msg_id).toBe(msgId);
  });

  it('filters out rows already knocked (knocked_at IS NOT NULL) -- the loop-bound predicate', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, knocked_at: T });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(0);
  });

  it('filters by run_id -- another run\'s pending row is invisible', () => {
    seedRun({ run_id: 'r1' });
    seedRun({ run_id: 'r2', story_id: 'st2' });
    seedMessage({ run_id: 'r2', seq: 1 });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(0);
  });

  it('filters by state=pending -- a delivered row is invisible', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, state: 'delivered', delivered_via: 'D1' });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.rows).toHaveLength(0);
  });

  it('filters by direction=controller-to-worker -- a worker-to-controller row is invisible', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, direction: 'worker-to-controller', msg_type: 'progress' });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.rows).toHaveLength(0);
  });

  it('never selects body -- BR012 data-minimization at the source, not just at output time', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, body: 'ZZQQ-SECRET' });
    const r = peekPending(ctx.db, { runId: 'r1' });
    expect(r.rows[0]).not.toHaveProperty('body');
  });

  it('BR006_PollConnection_OpensReadonly: a readonly connection throws SQLITE_READONLY on write, proving the design (poll connection opened readonly by the caller) is structurally enforced', () => {
    seedRun({ run_id: 'r1' });
    const readonlyDb = new Database(ctx.dbPath, { readonly: true });
    try {
      let caught = null;
      try {
        readonlyDb.prepare(
          `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES ('r1', 99, 'controller-to-worker', 'wake', 'x', 'CC-OPUS', 'pending', @now)`
        ).run({ now: T });
      } catch (e) {
        caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught.code).toBe('SQLITE_READONLY');
      // the read itself works fine over the same readonly connection
      const r = peekPending(readonlyDb, { runId: 'r1' });
      expect(r.ok).toBe(true);
    } finally {
      readonlyDb.close();
    }
  });

  it('fail-open: a closed/unusable db handle returns {ok:false, error} instead of throwing', () => {
    const { db: deadDb, dbPath, cleanup } = createTestDb();
    cleanup(); // closes + unlinks -- deadDb is now unusable
    const r = peekPending(deadDb, { runId: 'r1' });
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
    expect(typeof r.error).toBe('string');
  });
});

// ============================================================
// stampKnocked — AC1/AC3/AC4
// ============================================================
describe('stampKnocked', () => {
  it('BR008_KnockHit_StampsKnockedAtOnMatchedIdsOnly', () => {
    seedRun({ run_id: 'r1' });
    seedRun({ run_id: 'r2', story_id: 'st2' });
    const id42 = seedMessage({ run_id: 'r1', seq: 1 });
    const id43 = seedMessage({ run_id: 'r1', seq: 2 });
    const id44 = seedMessage({ run_id: 'r2', seq: 1 });

    const r = stampKnocked(ctx.db, { msgIds: [id42, id43], now: T });
    expect(r.ok).toBe(true);
    expect(r.changes).toBe(2);

    const rows = ctx.db.prepare('SELECT msg_id, knocked_at FROM worker_messages ORDER BY msg_id').all();
    const byId = Object.fromEntries(rows.map(r => [r.msg_id, r.knocked_at]));
    expect(byId[id42]).toMatch(/\+08:00$/);
    expect(byId[id43]).toMatch(/\+08:00$/);
    expect(byId[id44]).toBeNull();
  });

  it('BR009_KnockHit_LeavesDeliveryLedgerUntouched', () => {
    seedRun({ run_id: 'r1' });
    const id42 = seedMessage({ run_id: 'r1', seq: 1 });

    stampKnocked(ctx.db, { msgIds: [id42], now: T });
    const afterKnock = ctx.db.prepare('SELECT state, delivered_via FROM worker_messages WHERE msg_id=?').get(id42);
    expect(afterKnock.state).toBe('pending');
    expect(afterKnock.delivered_via).toBeNull();

    // read-worker-directives.js must still find and deliver it -- the knock never touched the
    // predicate (state='pending') that file's own selection depends on.
    const { rows } = readDirectives('r1', { dbPath: ctx.dbPath });
    expect(rows).toHaveLength(1);
    expect(rows[0].msg_id).toBe(id42);

    const afterDeliver = ctx.db.prepare('SELECT state, delivered_via FROM worker_messages WHERE msg_id=?').get(id42);
    expect(afterDeliver.state).toBe('delivered');
    expect(afterDeliver.delivered_via).toBe('D1');
  });

  it('is idempotent -- stamping an already-knocked id a second time is a 0-change no-op (WHERE guards knocked_at IS NULL, whp-11 CR)', () => {
    seedRun({ run_id: 'r1' });
    const id42 = seedMessage({ run_id: 'r1', seq: 1 });
    const first = stampKnocked(ctx.db, { msgIds: [id42], now: T });
    expect(first.changes).toBe(1);
    const firstKnockedAt = ctx.db.prepare('SELECT knocked_at FROM worker_messages WHERE msg_id=?').get(id42).knocked_at;

    const laterTs = '2026-01-01T00:05:00.000+08:00';
    const second = stampKnocked(ctx.db, { msgIds: [id42], now: laterTs });
    expect(second.ok).toBe(true);
    expect(second.changes).toBe(0); // write guard itself now enforces at-most-once, not just peekPending's re-selection filter
    expect(ctx.db.prepare('SELECT knocked_at FROM worker_messages WHERE msg_id=?').get(id42).knocked_at).toBe(firstKnockedAt);
  });

  it('TOCTOU guard (whp-11 CR): a row D1-delivered between peek and stamp is not stamped -- changes=0 tells the caller to fall through as a miss', () => {
    seedRun({ run_id: 'r1' });
    const id42 = seedMessage({ run_id: 'r1', seq: 1 });
    // simulate D1 winning the race after peek returned this row
    readDirectives('r1', { dbPath: ctx.dbPath });
    const r = stampKnocked(ctx.db, { msgIds: [id42], now: T });
    expect(r.ok).toBe(true);
    expect(r.changes).toBe(0);
    const row = ctx.db.prepare('SELECT state, knocked_at FROM worker_messages WHERE msg_id=?').get(id42);
    expect(row.state).toBe('delivered');
    expect(row.knocked_at).toBeNull();
  });

  it('empty msgIds is a no-op, not an error', () => {
    seedRun({ run_id: 'r1' });
    const r = stampKnocked(ctx.db, { msgIds: [], now: T });
    expect(r).toEqual({ ok: true, changes: 0, error: null });
  });

  it('fail-open: a closed/unusable db handle returns {ok:false, error} instead of throwing', () => {
    const { db: deadDb, cleanup } = createTestDb();
    cleanup();
    const r = stampKnocked(deadDb, { msgIds: [1], now: T });
    expect(r.ok).toBe(false);
    expect(r.changes).toBe(0);
    expect(typeof r.error).toBe('string');
  });
});

// ============================================================
// buildKnockDecision — AC1/BR011/BR012 (pure, no DB)
// ============================================================
describe('buildKnockDecision', () => {
  it('BR011_BlockPayload_ShapeAndExitZero (shape half — exit-code half lives in stop-report.ps1, T5)', () => {
    const decision = buildKnockDecision([{ msg_id: 42, seq: 1, msg_type: 'wake' }], 'r1');
    expect(decision.decision).toBe('block');
    expect(decision.hookSpecificOutput.hookEventName).toBe('Stop');
  });

  it('BR012_BlockPayload_CarriesNoDirectiveBody', () => {
    // rows passed in already lack `body` (peekPending's own contract) -- this proves
    // buildKnockDecision does not require it and never echoes anything except msg_id.
    const decision = buildKnockDecision([{ msg_id: 42, seq: 1, msg_type: 'wake' }], 'r1');
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toMatch(/ZZQQ-SECRET/);
    expect(serialized).toContain('read-worker-directives.js');
    expect(serialized).toContain('42');
  });

  it('returns null when rows is empty -- caller\'s cue to fall through to the miss path', () => {
    expect(buildKnockDecision([], 'r1')).toBeNull();
  });

  it('multi-directive knock names the count and ALL msg_ids (BR-012 / spec §5 boundary "one knock naming both msg_ids", whp-11 CR)', () => {
    const decision = buildKnockDecision([
      { msg_id: 42, seq: 1, msg_type: 'wake' },
      { msg_id: 43, seq: 2, msg_type: 'revise' },
    ], 'r1');
    expect(decision.reason).toContain('x2');
    expect(decision.reason).toContain('msg_id=42,43');
    expect(decision.reason).toContain('read-worker-directives.js --run-id r1');
  });

  it('BR014_KnockHit_DoesNotAdvanceLifecycle (via composition: peekPending + buildKnockDecision never touch worker_runs)', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running' });
    seedMessage({ run_id: 'r1', seq: 1 });
    const { rows } = peekPending(ctx.db, { runId: 'r1' });
    buildKnockDecision(rows, 'r1');
    const row = ctx.db.prepare('SELECT lifecycle, reported_at FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.lifecycle).toBe('running');
    expect(row.reported_at).toBeNull();
  });
});

// ============================================================
// resolveGraceSec — AC12 (whp-11 T6, pure config reader, no DB)
// ============================================================
describe('resolveGraceSec', () => {
  it('BR025_HookGraceSecAbsent_DefaultsTo120', () => {
    expect(resolveGraceSec({})).toEqual({ value: 120, clamped: false });
    expect(resolveGraceSec(undefined)).toEqual({ value: 120, clamped: false });
  });

  it('BR026_HookGraceSecOutOfRange_ClampedAndLogged', () => {
    expect(resolveGraceSec({ hookGraceSec: 9999 })).toEqual({ value: 300, clamped: true });
    expect(resolveGraceSec({ hookGraceSec: -5 })).toEqual({ value: 0, clamped: true });
  });

  it('AC12: hookGraceSec=0 passes through unclamped -- the documented zero-cost opt-out', () => {
    expect(resolveGraceSec({ hookGraceSec: 0 })).toEqual({ value: 0, clamped: false });
  });

  it('an in-range value passes through unchanged', () => {
    expect(resolveGraceSec({ hookGraceSec: 45 })).toEqual({ value: 45, clamped: false });
  });

  it('a non-numeric value falls back to the default rather than propagating NaN', () => {
    expect(resolveGraceSec({ hookGraceSec: 'not-a-number' })).toEqual({ value: 120, clamped: false });
  });

  it('loosely-zero non-number values ("" / false / []) fall back to the default, never the 0 opt-out (whp-11 CR: Number("")===0 trap)', () => {
    expect(resolveGraceSec({ hookGraceSec: '' })).toEqual({ value: 120, clamped: false });
    expect(resolveGraceSec({ hookGraceSec: false })).toEqual({ value: 120, clamped: false });
    expect(resolveGraceSec({ hookGraceSec: [] })).toEqual({ value: 120, clamped: false });
    expect(resolveGraceSec({ hookGraceSec: true })).toEqual({ value: 120, clamped: false });
    // numeric STRING is also non-numeric per BR-025 -- JSON numbers must be numbers
    expect(resolveGraceSec({ hookGraceSec: '120' })).toEqual({ value: 120, clamped: false });
  });

  it('matches the real pipeline-config.json value (120) -- catches drift between the config file and this default', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json'), 'utf8').replace(/^﻿/, ''));
    expect(resolveGraceSec(cfg.workerProtocol)).toEqual({ value: 120, clamped: false });
  });
});

// ============================================================
// Static template lock (whp-11 CR) — BR-006 production connection shape.
// Same static-source-assertion pattern as worker-protocol-ops.test.js's
// zero-kill-primitives lock: the unit layer cannot spawn the hook, but it CAN
// pin the template so a future refactor widening the poll connection to
// read-write (or dropping the separate stamp connection) fails a test instead
// of silently voiding BR-006.
// ============================================================
describe('stop-report.ps1 D2 template (static source lock)', () => {
  const STOP_REPORT = fs.readFileSync(
    path.join(__dirname, '..', '..', '.claude', 'skills', 'party-to-pipeline', 'scripts', 'stop-report.ps1'),
    'utf8'
  );

  it('BR-006: poll connection opens readonly; the knocked_at stamp gets its own short-lived writable connection', () => {
    expect(STOP_REPORT).toMatch(/db = new Database\('__DB_PATH__', \{ readonly: true \}\);/);
    expect(STOP_REPORT).toMatch(/wdb = new Database\('__DB_PATH__'\);/);
    expect(STOP_REPORT).toMatch(/stampKnocked\(wdb,/);
  });
});
