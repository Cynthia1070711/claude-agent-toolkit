// whp-5-message-bus-mcp — AC1-AC7 behavioural tests for worker-protocol-ops.js
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// Test IDs (T-S/T-A/T-G/T-M/T-X/T-I/T-Z) map 1:1 to the Story's testing_strategy table.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import {
  searchWorkerRuns,
  ackWorkerRun,
  gateWorkerRun,
  addWorkerMessage,
  MSG_TYPES_BY_DIRECTION,
  VERDICTS,
} from '../scripts/worker-protocol-ops.js';

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
});

afterEach(() => {
  ctx.cleanup();
});

function seedRun(overrides = {}) {
  const row = {
    run_id: 'r1', session_id: 's1', story_id: 'st1', phase: 'dev-story',
    ipc_dir: 'C:\\ipc\\st1', run_mode: 'window', lifecycle: 'reported',
    controller_track: 'backend', ack_at: null, ack_by: null,
    reported_at: T, started_at: T, updated_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle,
      controller_track, ack_at, ack_by, reported_at, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @run_mode, @lifecycle,
      @controller_track, @ack_at, @ack_by, @reported_at, @started_at, @updated_at)
  `).run(row);
  return row;
}

function seedHandoff(overrides = {}) {
  const row = {
    run_id: 'r1', story_id: 'st1', phase: 'dev-story',
    gate_result: 'pending', gate_by: null, gate_at: null,
    created_at: T, updated_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_handoffs (run_id, story_id, phase, gate_result, gate_by, gate_at, created_at, updated_at)
    VALUES (@run_id, @story_id, @phase, @gate_result, @gate_by, @gate_at, @created_at, @updated_at)
  `).run(row);
  return row;
}

function seedMessage(overrides = {}) {
  const row = {
    run_id: 'r1', seq: 1, direction: 'controller-to-worker', msg_type: 'wake',
    body: 'test', author: 'CC-FABLE', state: 'pending', created_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at)
    VALUES (@run_id, @seq, @direction, @msg_type, @body, @author, @state, @created_at)
  `).run(row);
  return row;
}

function tableCount(table) {
  return ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

// ============================================================
// AC1 — search_worker_runs
// ============================================================
describe('AC1: searchWorkerRuns', () => {
  it('T-S01 (BR-001): no args returns 20 newest by updated_at DESC; limit:200 caps at 100', () => {
    for (let i = 0; i < 30; i++) {
      seedRun({ run_id: `r${i}`, story_id: `st${i}`, updated_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}+08:00`, reported_at: T });
    }
    const def = searchWorkerRuns({}, { dbPath: ctx.dbPath });
    expect(def.runs.length).toBe(20);
    expect(def.runs[0].run_id).toBe('r29');
    const capped = searchWorkerRuns({ limit: 200 }, { dbPath: ctx.dbPath });
    expect(capped.runs.length).toBe(30); // only 30 rows exist here — the 100 ceiling itself is T-S01c
  });

  it('T-S01c (BR-001, CR-F1): the 100-row hard ceiling is real — 105 rows seeded, limit above the cap still returns exactly 100', () => {
    for (let i = 0; i < 105; i++) {
      seedRun({
        run_id: `r${String(i).padStart(3, '0')}`,
        story_id: `st${i}`,
        updated_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}+08:00`,
      });
    }
    expect(searchWorkerRuns({ limit: 200 }, { dbPath: ctx.dbPath }).runs.length).toBe(100);
    expect(searchWorkerRuns({ limit: 101 }, { dbPath: ctx.dbPath }).runs.length).toBe(100);
    expect(searchWorkerRuns({ limit: 100 }, { dbPath: ctx.dbPath }).runs.length).toBe(100);
    expect(searchWorkerRuns({}, { dbPath: ctx.dbPath }).runs.length).toBe(20);
  });

  it('T-S10 (BR-002, CR-F11): the remaining four equality filters (story_id / phase / run_mode / requires_attention) each narrow the result set', () => {
    seedRun({ run_id: 'r-a', story_id: 'stA', phase: 'dev-story', run_mode: 'window' });
    seedRun({ run_id: 'r-b', story_id: 'stB', phase: 'code-review', run_mode: 'inline' });
    ctx.db.prepare('UPDATE worker_runs SET requires_attention=1 WHERE run_id=?').run('r-b');

    expect(searchWorkerRuns({ story_id: 'stA' }, { dbPath: ctx.dbPath }).runs.map(r => r.run_id)).toEqual(['r-a']);
    expect(searchWorkerRuns({ phase: 'code-review' }, { dbPath: ctx.dbPath }).runs.map(r => r.run_id)).toEqual(['r-b']);
    expect(searchWorkerRuns({ run_mode: 'inline' }, { dbPath: ctx.dbPath }).runs.map(r => r.run_id)).toEqual(['r-b']);
    expect(searchWorkerRuns({ requires_attention: true }, { dbPath: ctx.dbPath }).runs.map(r => r.run_id)).toEqual(['r-b']);
    expect(searchWorkerRuns({ requires_attention: false }, { dbPath: ctx.dbPath }).runs.map(r => r.run_id)).toEqual(['r-a']);
  });

  it('T-S01b (BR-001a): pending_ack orders by reported_at ASC (oldest first); general listing unaffected', () => {
    seedRun({ run_id: 'r-old', story_id: 'stA', lifecycle: 'reported', ack_at: null, reported_at: '2026-01-01T00:00:01+08:00', updated_at: '2026-01-01T00:00:05+08:00' });
    seedRun({ run_id: 'r-new', story_id: 'stB', lifecycle: 'reported', ack_at: null, reported_at: '2026-01-01T00:00:09+08:00', updated_at: '2026-01-01T00:00:01+08:00' });
    const q = searchWorkerRuns({ pending_ack: true }, { dbPath: ctx.dbPath });
    expect(q.runs[0].run_id).toBe('r-old');
    const general = searchWorkerRuns({}, { dbPath: ctx.dbPath });
    expect(general.runs[0].run_id).toBe('r-old'); // updated_at DESC: r-old(:05) before r-new(:01)
  });

  it('T-S02 (BR-001): empty table returns {runs:[],count:0}, does not throw', () => {
    const r = searchWorkerRuns({}, { dbPath: ctx.dbPath });
    expect(r).toEqual({ runs: [], count: 0 });
  });

  it('T-S03 (BR-002): multiple filters combine with AND', () => {
    seedRun({ run_id: 'r-match', story_id: 'stA', lifecycle: 'reported', controller_track: 'backend' });
    seedRun({ run_id: 'r-diff-track', story_id: 'stB', lifecycle: 'reported', controller_track: 'frontend' });
    seedRun({ run_id: 'r-diff-lifecycle', story_id: 'stC', lifecycle: 'running', controller_track: 'backend' });
    const r = searchWorkerRuns({ lifecycle: 'reported', controller_track: 'backend' }, { dbPath: ctx.dbPath });
    expect(r.runs.map(x => x.run_id)).toEqual(['r-match']);
  });

  it('T-S04 (BR-003): comma-separated lifecycle list expands to IN(...)', () => {
    seedRun({ run_id: 'r-rep', story_id: 'stA', lifecycle: 'reported' });
    seedRun({ run_id: 'r-awr', story_id: 'stB', lifecycle: 'awaiting-review' });
    seedRun({ run_id: 'r-run', story_id: 'stC', lifecycle: 'running' });
    const r = searchWorkerRuns({ lifecycle: 'reported,awaiting-review' }, { dbPath: ctx.dbPath });
    expect(r.runs.map(x => x.run_id).sort()).toEqual(['r-awr', 'r-rep']);
  });

  it('T-S05 (BR-004): pending_ack returns exactly lifecycle=reported AND ack_at IS NULL rows', () => {
    seedRun({ run_id: 'r-pending', story_id: 'stA', lifecycle: 'reported', ack_at: null, reported_at: T });
    seedRun({ run_id: 'r-acked', story_id: 'stB', lifecycle: 'reported', ack_at: T, reported_at: T });
    seedRun({ run_id: 'r-running', story_id: 'stC', lifecycle: 'running', ack_at: null, reported_at: T });
    const r = searchWorkerRuns({ pending_ack: true }, { dbPath: ctx.dbPath });
    expect(r.runs.map(x => x.run_id)).toEqual(['r-pending']);
  });

  it('T-S06 (BR-037 + negative control): pending_ack query plan hits ix_worker_runs_pending_ack; ORDER BY updated_at DESC falls to ix_worker_runs_lifecycle', () => {
    seedRun({ run_id: 'r1', story_id: 'st1', lifecycle: 'reported', ack_at: null });
    const goodPlan = ctx.db.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM worker_runs WHERE lifecycle = 'reported' AND ack_at IS NULL ORDER BY reported_at ASC LIMIT 20"
    ).all();
    expect(goodPlan.some(r => /ix_worker_runs_pending_ack/.test(r.detail))).toBe(true);

    // Negative control — must NOT hit the partial index once sorted by updated_at.
    // If a future edit "unifies" pending_ack onto updated_at DESC, this assertion goes red.
    const badPlan = ctx.db.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM worker_runs WHERE lifecycle = 'reported' AND ack_at IS NULL ORDER BY updated_at DESC LIMIT 20"
    ).all();
    expect(badPlan.some(r => /ix_worker_runs_pending_ack/.test(r.detail))).toBe(false);
    expect(badPlan.some(r => /ix_worker_runs_lifecycle/.test(r.detail))).toBe(true);
  });

  it('T-S07 (BR-005): include_messages shape — absent field vs populated array', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1 });
    seedMessage({ run_id: 'r1', seq: 2 });
    const without = searchWorkerRuns({}, { dbPath: ctx.dbPath });
    expect('messages' in without.runs[0]).toBe(false);
    const withMsgs = searchWorkerRuns({ include_messages: true }, { dbPath: ctx.dbPath });
    expect(withMsgs.runs[0].messages[0].seq).toBe(1);
    expect(withMsgs.runs[0].messages.length).toBe(2);
  });

  it('T-S08 (BR-038): include_messages issues exactly one batched statement regardless of N runs', () => {
    for (let i = 0; i < 5; i++) {
      seedRun({ run_id: `r${i}`, story_id: `st${i}` });
      seedMessage({ run_id: `r${i}`, seq: 1 });
    }
    let prepareCallsForMessages = 0;
    const Database = ctx.db.constructor;
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (sql, ...rest) {
      if (/FROM worker_messages/.test(sql)) prepareCallsForMessages++;
      return originalPrepare.call(this, sql, ...rest);
    };
    try {
      const r = searchWorkerRuns({ include_messages: true }, { dbPath: ctx.dbPath });
      expect(r.runs.length).toBe(5);
    } finally {
      Database.prototype.prepare = originalPrepare;
    }
    expect(prepareCallsForMessages).toBe(1);
  });

  it('T-S09: read-only — row counts unchanged before/after any call shape', () => {
    seedRun({ run_id: 'r1' });
    seedHandoff({ run_id: 'r1' });
    seedMessage({ run_id: 'r1' });
    const before = [tableCount('worker_runs'), tableCount('worker_messages'), tableCount('worker_handoffs')];
    searchWorkerRuns({ pending_ack: true, include_messages: true }, { dbPath: ctx.dbPath });
    const after = [tableCount('worker_runs'), tableCount('worker_messages'), tableCount('worker_handoffs')];
    expect(after).toEqual(before);
  });
});

// ============================================================
// AC2 — ack_worker_run
// ============================================================
describe('AC2: ackWorkerRun', () => {
  it('T-A01 (BR-007): ack success — changes semantics, lifecycle transition, offset-aware timestamp', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    const r = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    expect(r.lifecycle).toBe('awaiting-review');
    expect(r.ack_at).toMatch(/\+08:00$/);
    const row = ctx.db.prepare('SELECT lifecycle, ack_at, ack_by FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.lifecycle).toBe('awaiting-review');
    expect(row.ack_by).toBe('CC-FABLE');
  });

  it('T-A02 (BR-008): second ack is a named rejection with no isError, DB unchanged', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    const r1 = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r1.ok).toBe(true);
    const r2 = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain(r1.ack_at);
    expect(r2.reason).toContain('CC-FABLE');
    expect('isError' in r2).toBe(false);
    const row = ctx.db.prepare('SELECT ack_by FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.ack_by).toBe('CC-FABLE'); // unchanged by the second call
  });

  it('T-A03 (BR-009): wrong lifecycle refused, names the observed lifecycle, ack_at stays NULL', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running', ack_at: null });
    const r = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('running');
    const row = ctx.db.prepare('SELECT ack_at FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.ack_at).toBeNull();
  });

  it('T-A04 (BR-010): ack never touches worker_handoffs', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    const h = ctx.db.prepare('SELECT gate_result, gate_at FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
    expect(h.gate_at).toBeNull();
  });

  it('T-A05: empty ack_by is rejected (attribution must not be silently empty)', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported' });
    const r = ackWorkerRun({ run_id: 'r1', ack_by: '' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.isError).toBe(true);
  });
});

// ============================================================
// AC3 — gate_worker_run guard chain
// ============================================================
describe('AC3: gateWorkerRun guard chain', () => {
  it('T-G01 (BR-014): running with ack_at artificially set is still refused — lifecycle guard independent of ack guard', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running', ack_at: T });
    seedHandoff({ run_id: 'r1' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('running');
  });

  it('T-G02 (BR-013, core): reported+ack_at IS NULL refused before touching worker_handoffs', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ack');
    const h = ctx.db.prepare('SELECT gate_result, gate_at FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
    expect(h.gate_at).toBeNull();
  });

  it('T-G03 (BR-011): normal gate on awaiting-review+acked+pending handoff succeeds', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
  });

  it('T-G04 (BR-012): handoff CAS — gate_result already decided is rejected naming the existing decision, without disturbing it', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'approved', gate_by: 'CC-OTHER', gate_at: '2026-01-01T00:00:05+08:00' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'rejected', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('CC-OTHER');
    expect(r.reason).toContain('2026-01-01T00:00:05+08:00');
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('approved'); // unchanged — the first verdict survives
  });

  it('T-G05 (BR-020): cross-track — no override rejected; override without reason rejected; both present succeeds and reason is readable back', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T, controller_track: 'backend' });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });

    const noOverride = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE', controller_track: 'frontend' }, { dbPath: ctx.dbPath });
    expect(noOverride.ok).toBe(false);
    expect(noOverride.reason).toContain('backend');
    expect(noOverride.reason).toContain('frontend');

    const emptyReason = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE', controller_track: 'frontend', override: true, override_reason: '' }, { dbPath: ctx.dbPath });
    expect(emptyReason.ok).toBe(false);

    const both = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE', controller_track: 'frontend', override: true, override_reason: 'incident response' }, { dbPath: ctx.dbPath });
    expect(both.ok).toBe(true);
    const h = ctx.db.prepare('SELECT override_reason FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.override_reason).toBe('incident response');
  });

  it('T-G06 (BR-011): illegal verdict lists the 3 legal values, zero writes', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'ok', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    for (const v of VERDICTS) expect(r.reason).toContain(v);
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
  });

  it('T-G14 (BR-013/BR-014, CR-F3): the ack/lifecycle guards read inside the write transaction — a concurrent worker_runs writer cannot slip between the guard and the verdict', () => {
    // Pre-fix the guards ran on a SELECT issued before db.transaction(), so the
    // lifecycle they validated could already be stale by the time the handoff CAS
    // committed. reap-worker-runs.js is a live concurrent writer of this column
    // (it sets lifecycle='abandoned'), so the window was reachable, and the
    // handoff CAS does not cover it (gate_result would still be 'pending').
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });

    const Database = ctx.db.constructor;
    const rival = new Database(ctx.dbPath);
    rival.pragma('busy_timeout = 0');

    let rivalError = null;
    let probed = false;
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (sql, ...rest) {
      const stmt = originalPrepare.call(this, sql, ...rest);
      if (!probed && /SELECT \* FROM worker_runs WHERE run_id=\?/.test(sql)) {
        probed = true;
        try {
          rival.prepare("UPDATE worker_runs SET lifecycle='abandoned' WHERE run_id='r1'").run();
        } catch (e) { rivalError = e; }
      }
      return stmt;
    };

    let r;
    try {
      r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    } finally {
      Database.prototype.prepare = originalPrepare;
      rival.close();
    }

    expect(probed).toBe(true);
    expect(rivalError).not.toBeNull();
    expect(/SQLITE_BUSY|database is locked/i.test(rivalError.message)).toBe(true);
    expect(r.ok).toBe(true);
    expect(ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1').lifecycle).toBe('approved');
  });

  it('T-G13 (§4.7, CR-F10): an omitted verdict is WHP5-E01 (missing argument), an illegal one stays WHP5-E02', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    expect(gateWorkerRun({ run_id: 'r1', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath }).code).toBe('WHP5-E01');
    expect(gateWorkerRun({ run_id: 'r1', verdict: 'ok', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath }).code).toBe('WHP5-E02');
    expect(ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1').gate_result).toBe('pending');
  });

  it('T-G12 (BR-039): missing handoff row is refused distinctly from "already decided", current.gate_result is null, zero writes', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    // no seedHandoff() call — the row genuinely does not exist
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('尚無交接證據列');
    expect(r.reason).toContain('whp-4');
    expect(r.current.gate_result).toBeNull();

    // Distinctness check against the "already decided" message (T-G04's shape)
    seedRun({ run_id: 'r2', lifecycle: 'awaiting-review', ack_at: T, story_id: 'st2' });
    seedHandoff({ run_id: 'r2', story_id: 'st2', gate_result: 'approved', gate_by: 'X', gate_at: T });
    const r2 = gateWorkerRun({ run_id: 'r2', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r2.reason).not.toBe(r.reason);

    expect(tableCount('worker_handoffs')).toBe(1); // only r2's seeded row; r1 never got one written
  });
});

// ============================================================
// AC4 — gate atomicity, G24 clearing, verdict routing
// ============================================================
describe('AC4: gateWorkerRun atomic 3-table write', () => {
  it('T-G07 (BR-015): approve on window run stops at approved; closed_at/close_source/closed_detected_at stay NULL', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T, run_mode: 'window' });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    const row = ctx.db.prepare('SELECT lifecycle, closed_at, close_source, closed_detected_at FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.lifecycle).toBe('approved');
    expect(row.closed_at).toBeNull();
    expect(row.close_source).toBeNull();
    expect(row.closed_detected_at).toBeNull();
  });

  it('T-G08 (BR-016, G24): revise clears reported_at/ack_at/ack_by and zeroes notify_count in the same statement', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T, ack_by: 'CC-FABLE', reported_at: T, notify_count: 2 });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-FABLE', gate_notes: 'please fix X' }, { dbPath: ctx.dbPath });
    const row = ctx.db.prepare('SELECT lifecycle, reported_at, ack_at, ack_by, notify_count FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.lifecycle).toBe('revising');
    expect(row.reported_at).toBeNull();
    expect(row.ack_at).toBeNull();
    expect(row.ack_by).toBeNull();
    expect(row.notify_count).toBe(0);
  });

  it('T-G09 (BR-017): revise inserts exactly one controller-to-worker "revise" message carrying gate_notes as body', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-FABLE', gate_notes: 'AC3 的 file:line 對不上,請補實測' }, { dbPath: ctx.dbPath });
    const msg = ctx.db.prepare("SELECT msg_type, state, body FROM worker_messages WHERE run_id='r1' ORDER BY seq DESC LIMIT 1").get();
    expect(msg.msg_type).toBe('revise');
    expect(msg.state).toBe('pending');
    expect(msg.body).toBe('AC3 的 file:line 對不上,請補實測');
  });

  it('T-G10 (BR-018): approve inserts one verdict-approved message; reject changes lifecycle to failed and inserts nothing', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM worker_messages WHERE run_id='r1' AND msg_type='verdict-approved'").get().n).toBe(1);

    seedRun({ run_id: 'r2', story_id: 'st2', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r2', story_id: 'st2', gate_result: 'pending' });
    const before = tableCount('worker_messages');
    gateWorkerRun({ run_id: 'r2', verdict: 'rejected', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(tableCount('worker_messages')).toBe(before);
    const row = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r2');
    expect(row.lifecycle).toBe('failed');
  });

  it('T-G11 (BR-019): forcing the message insert to fail rolls back the whole transaction — no verdict without its message', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });

    // MAX(seq)+1 is computed inside the same transaction as the INSERT, so a plain
    // pre-seeded row at the "next" seq is always seen and skipped past — no real
    // collision is reachable single-threaded. Intercept the INSERT itself instead
    // (test-side monkeypatch only; no injection seam added to the shipped module).
    const Database = ctx.db.constructor;
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (sql, ...rest) {
      if (/INSERT INTO worker_messages/.test(sql)) {
        return { run: () => { throw new Error('UNIQUE constraint failed: worker_messages.run_id, worker_messages.seq'); } };
      }
      return originalPrepare.call(this, sql, ...rest);
    };
    try {
      expect(() => gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath })).toThrow();
    } finally {
      Database.prototype.prepare = originalPrepare;
    }

    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
    const row = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1');
    expect(row.lifecycle).toBe('awaiting-review');
  });
});

// ============================================================
// AC5 — add_worker_message
// ============================================================
describe('AC5: addWorkerMessage', () => {
  it('T-M01 (BR-022): 20 sequential calls on one run yield seq 1..20 with no gaps/dupes, no leaked UNIQUE error', () => {
    seedRun({ run_id: 'r1' });
    const seqs = [];
    for (let i = 0; i < 20; i++) {
      const r = addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: `msg ${i}`, author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
      expect(r.ok).toBe(true);
      seqs.push(r.seq);
    }
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(seqs).size).toBe(20);
  });

  it('T-M02 (BR-023): SQLITE_BUSY retry — injected counter proves 3 attempts before success, no wall-clock wait', () => {
    seedRun({ run_id: 'r1' });
    let retries = 0;
    const r = addWorkerMessage(
      { run_id: 'r1', msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'append' },
      { dbPath: ctx.dbPath, sleepFn: () => {}, onRetry: () => { retries++; }, _simulateBusyAttempts: 3 }
    );
    expect(r.ok).toBe(true);
    expect(retries).toBe(3);
  });

  it('T-M03 (BR-024): mode has no default — omission is a named rejection listing both legal values; "Replace" (capitalised) also rejected', () => {
    seedRun({ run_id: 'r1' });
    const omitted = addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: 'x', author: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(omitted.ok).toBe(false);
    expect(omitted.reason).toContain('append');
    expect(omitted.reason).toContain('replace');
    expect(tableCount('worker_messages')).toBe(0);

    const wrongCase = addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'Replace' }, { dbPath: ctx.dbPath });
    expect(wrongCase.ok).toBe(false);
  });

  it('T-M04 (BR-025): replace marks existing pending controller-to-worker rows superseded (not deleted); new row is pending with next seq', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, direction: 'controller-to-worker', state: 'pending' });
    seedMessage({ run_id: 'r1', seq: 2, direction: 'controller-to-worker', state: 'pending' });
    const r = addWorkerMessage({ run_id: 'r1', msg_type: 'revise', body: 'new plan', author: 'CC-FABLE', mode: 'replace' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    expect(r.seq).toBe(3);
    const rows = ctx.db.prepare("SELECT seq, state FROM worker_messages WHERE run_id='r1' ORDER BY seq").all();
    expect(rows).toHaveLength(3);
    expect(rows[0].state).toBe('superseded');
    expect(rows[1].state).toBe('superseded');
    expect(rows[2].state).toBe('pending');
  });

  it('T-M05 (BR-026): replace does not touch an already-delivered row and warns that it cannot be withdrawn', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, direction: 'controller-to-worker', state: 'delivered' });
    seedMessage({ run_id: 'r1', seq: 2, direction: 'controller-to-worker', state: 'pending' });
    const r = addWorkerMessage({ run_id: 'r1', msg_type: 'revise', body: 'new plan', author: 'CC-FABLE', mode: 'replace' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toContain('無法撤回');
    const rows = ctx.db.prepare("SELECT seq, state FROM worker_messages WHERE run_id='r1' ORDER BY seq").all();
    expect(rows[0].state).toBe('delivered'); // untouched
    expect(rows[1].state).toBe('superseded');
  });

  it('T-M06 (BR-027): msg_type validated per-direction, not as a union', () => {
    seedRun({ run_id: 'r1' });
    const bad = addWorkerMessage({ run_id: 'r1', msg_type: 'nudge', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    expect(bad.ok).toBe(false);
    for (const t of MSG_TYPES_BY_DIRECTION['controller-to-worker']) expect(bad.reason).toContain(t);

    const crossDirection = addWorkerMessage(
      { run_id: 'r1', direction: 'controller-to-worker', msg_type: 'blocker', body: 'x', author: 'CC-FABLE', mode: 'append' },
      { dbPath: ctx.dbPath }
    );
    expect(crossDirection.ok).toBe(false);
    expect(crossDirection.reason).toContain('worker-to-controller');
    expect(tableCount('worker_messages')).toBe(0);
  });

  it('T-M07 (BR-029): unknown run_id is a named rejection, zero writes', () => {
    const r = addWorkerMessage({ run_id: 'ghost', msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('ghost');
    expect(tableCount('worker_messages')).toBe(0);
  });

  it('T-M09 (BR-022, CR-F2): the seq read+insert holds a real write lock for its whole duration — a competing writer is locked out, so two callers cannot land the same seq', () => {
    // T-M01 is 20 *sequential* calls: with better-sqlite3's synchronous API a single
    // process cannot interleave, so it can never exercise BR-022's actual promise.
    // This probes the mechanism directly: a second connection (busy_timeout=0) tries
    // to write at the exact moment the seq is being read. With BEGIN IMMEDIATE the
    // rival is refused; with a deferred transaction it would win the race and the
    // caller would then hit ux_worker_messages_run_seq.
    seedRun({ run_id: 'r1' });
    const Database = ctx.db.constructor;
    const rival = new Database(ctx.dbPath);
    rival.pragma('busy_timeout = 0');

    let rivalError = null;
    let probed = false;
    const originalPrepare = Database.prototype.prepare;
    Database.prototype.prepare = function (sql, ...rest) {
      const stmt = originalPrepare.call(this, sql, ...rest);
      if (!probed && /COALESCE\(MAX\(seq\)/.test(sql)) {
        probed = true;
        try {
          rival.prepare(
            `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at)
             VALUES ('r1', 1, 'controller-to-worker', 'wake', 'rival', 'RIVAL', 'pending', @now)`
          ).run({ now: T });
        } catch (e) { rivalError = e; }
      }
      return stmt;
    };

    let r;
    try {
      r = addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: 'mine', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    } finally {
      Database.prototype.prepare = originalPrepare;
      rival.close();
    }

    expect(probed).toBe(true);
    expect(rivalError).not.toBeNull();
    expect(/SQLITE_BUSY|database is locked/i.test(rivalError.message)).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.seq).toBe(1);
    expect(tableCount('worker_messages')).toBe(1); // rival never landed; no UNIQUE error escaped
  });

  it('T-M10 (BR-025, CR-F8): replace supersedes only the new message\'s own direction — a worker-to-controller replace leaves controller directives alone', () => {
    seedRun({ run_id: 'r1' });
    seedMessage({ run_id: 'r1', seq: 1, direction: 'controller-to-worker', msg_type: 'revise', state: 'pending' });
    seedMessage({ run_id: 'r1', seq: 2, direction: 'worker-to-controller', msg_type: 'progress', state: 'pending' });

    const r = addWorkerMessage(
      { run_id: 'r1', direction: 'worker-to-controller', msg_type: 'report', body: 'done', author: 'WORKER', mode: 'replace' },
      { dbPath: ctx.dbPath }
    );
    expect(r.ok).toBe(true);
    const rows = ctx.db.prepare("SELECT seq, direction, state FROM worker_messages WHERE run_id='r1' ORDER BY seq").all();
    expect(rows[0]).toMatchObject({ seq: 1, direction: 'controller-to-worker', state: 'pending' }); // untouched
    expect(rows[1]).toMatchObject({ seq: 2, direction: 'worker-to-controller', state: 'superseded' });
    expect(rows[2]).toMatchObject({ seq: 3, direction: 'worker-to-controller', state: 'pending' });

    // The default (controller-to-worker) path BR-025 actually describes is unchanged.
    const c2w = addWorkerMessage({ run_id: 'r1', msg_type: 'revise', body: 'new plan', author: 'CC-FABLE', mode: 'replace' }, { dbPath: ctx.dbPath });
    expect(c2w.superseded).toEqual([1]);
  });

  it('T-M11 (§4.7, CR-F10): an omitted required argument is WHP5-E01, not the enum label WHP5-E02', () => {
    seedRun({ run_id: 'r1' });
    const noMsgType = addWorkerMessage({ run_id: 'r1', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    expect(noMsgType.code).toBe('WHP5-E01');
    const badMsgType = addWorkerMessage({ run_id: 'r1', msg_type: 'nudge', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    expect(badMsgType.code).toBe('WHP5-E02'); // illegal value stays E02
    expect(tableCount('worker_messages')).toBe(0);
  });

  it('T-M08 (BR-028): a new row is always state=pending with delivered_via/delivered_at/consumed_at NULL', () => {
    seedRun({ run_id: 'r1' });
    addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
    const row = ctx.db.prepare("SELECT state, delivered_via, delivered_at, consumed_at FROM worker_messages WHERE run_id='r1'").get();
    expect(row.state).toBe('pending');
    expect(row.delivered_via).toBeNull();
    expect(row.delivered_at).toBeNull();
    expect(row.consumed_at).toBeNull();
  });
});

// ============================================================
// AC6 — cross-cutting: timestamps, response shape, ledger, parametrisation
// ============================================================
describe('AC6: cross-cutting contracts', () => {
  it('T-X01 (BR-030): every written _at value is offset-aware; source has no datetime(now)/toISOString()', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    const r = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ack_at).toMatch(/\+08:00$/);
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-protocol-ops.js'), 'utf8');
    expect(source).not.toMatch(/datetime\('now'\)|toISOString\(\)/);
  });

  it('T-X02 (BR-031): CAS zero-row has no isError; missing required arg has isError:true + WHP5-E01', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: T, ack_by: 'CC-FABLE' });
    const casFail = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect('isError' in casFail).toBe(false);
    const missing = ackWorkerRun({ run_id: 'r1' }, { dbPath: ctx.dbPath });
    expect(missing.isError).toBe(true);
    expect(missing.code).toBe('WHP5-E01');
  });

  it('T-X03 (BR-035): SQL literals passed to db.prepare() never interpolate a caller-supplied scalar value', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-protocol-ops.js'), 'utf8');
    const sqlLiterals = [...source.matchAll(/db\.prepare\(\s*`([^`]*)`/g)].map(m => m[1]);
    expect(sqlLiterals.length).toBeGreaterThan(5);
    // CR-F12: allowlist, not denylist. AC6 requires "no template literal puts a
    // caller-supplied value into SQL" — a denylist of known names would silently
    // pass ${limit} / ${mode} / ${next_phase}. Only these three structural
    // fragments (all built from module-level constants / generated @param names)
    // may be interpolated; every caller scalar must travel as a bound @param.
    const ALLOWED_STRUCTURAL = new Set(['whereSql', 'orderSql', "placeholders.join(', ')"]);
    for (const sql of sqlLiterals) {
      for (const m of sql.matchAll(/\$\{([^}]*)\}/g)) {
        expect(ALLOWED_STRUCTURAL.has(m[1].trim())).toBe(true);
      }
    }
  });

  it('T-X04: enums are imported from upsert-worker-run.js, not re-declared', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-protocol-ops.js'), 'utf8');
    expect((source.match(/const LIFECYCLES = new Set/g) || []).length).toBe(0);
    expect((source.match(/from '\.\/upsert-worker-run\.js'/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('T-X05 (BR-032): onWrite fires exactly once per mutating op, correct table per call, zero times for search', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const calls = [];
    const onWrite = (table, op, data) => calls.push({ table, op, data });

    ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath, onWrite });
    gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath, onWrite });
    addWorkerMessage({ run_id: 'r1', msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath, onWrite });

    expect(calls.length).toBe(3);
    expect(calls.map(c => c.table)).toEqual(['worker_runs', 'worker_handoffs', 'worker_messages']);

    // CR-F4: the ledger is the only filesystem counterpart these DB-native tables
    // have (server.js:56-57). run_id+seq alone cannot answer "what directive, from
    // whom" on a recovery read, so the payload carries identity + classification —
    // matching the shape of every other appendLedger call site (server.js:1524/:3340).
    expect(calls[2].data).toMatchObject({
      run_id: 'r1', msg_type: 'wake', author: 'CC-FABLE', direction: 'controller-to-worker',
    });
    expect(typeof calls[2].data.seq).toBe('number');
    expect(calls[1].data).toMatchObject({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-FABLE' });

    const searchCalls = [];
    searchWorkerRuns({}, { dbPath: ctx.dbPath, onWrite: (...a) => searchCalls.push(a) });
    expect(searchCalls.length).toBe(0);
  });

  it('T-X06 (BR-032): a throwing onWrite never fails the call', () => {
    seedRun({ run_id: 'r1', lifecycle: 'reported', ack_at: null });
    const throwing = () => { throw new Error('ledger unwritable'); };
    const r = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath, onWrite: throwing });
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// AC7 — run_mode='inline' parity + collapse
// ============================================================
describe('AC7: inline run_mode', () => {
  it('T-I01 (BR-033): ack + gate(revise) + message suite behaves identically for inline vs window', () => {
    for (const mode of ['inline', 'window']) {
      const runId = `r-${mode}`;
      seedRun({ run_id: runId, story_id: `st-${mode}`, run_mode: mode, lifecycle: 'reported', ack_at: null });
      seedHandoff({ run_id: runId, story_id: `st-${mode}`, gate_result: 'pending' });

      const ackR = ackWorkerRun({ run_id: runId, ack_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
      expect(ackR.ok).toBe(true);

      const gateR = gateWorkerRun({ run_id: runId, verdict: 'revise', gate_by: 'CC-FABLE', gate_notes: 'fix it' }, { dbPath: ctx.dbPath });
      expect(gateR.ok).toBe(true);
      const row = ctx.db.prepare('SELECT lifecycle, ack_at FROM worker_runs WHERE run_id=?').get(runId);
      expect(row.lifecycle).toBe('revising');
      expect(row.ack_at).toBeNull();

      const msgR = addWorkerMessage({ run_id: runId, msg_type: 'wake', body: 'x', author: 'CC-FABLE', mode: 'append' }, { dbPath: ctx.dbPath });
      expect(msgR.ok).toBe(true);
    }
  });

  it('T-I02 (BR-034): inline approve collapses straight to closed with ControllerAfterHandshake; closed_detected_at stays NULL', () => {
    seedRun({ run_id: 'inline-1', run_mode: 'inline', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'inline-1', gate_result: 'pending' });
    const r = gateWorkerRun({ run_id: 'inline-1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    const row = ctx.db.prepare('SELECT lifecycle, close_source, closed_at, closed_detected_at FROM worker_runs WHERE run_id=?').get('inline-1');
    expect(row.lifecycle).toBe('closed');
    expect(row.close_source).toBe('ControllerAfterHandshake');
    expect(row.closed_at).toMatch(/\+08:00$/);
    expect(row.closed_detected_at).toBeNull();
  });

  it('T-I03 (BR-034): the same approve call on a window run stops at approved, closed_at stays NULL', () => {
    seedRun({ run_id: 'window-1', run_mode: 'window', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'window-1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'window-1', verdict: 'approved', gate_by: 'CC-FABLE' }, { dbPath: ctx.dbPath });
    const row = ctx.db.prepare('SELECT lifecycle, closed_at FROM worker_runs WHERE run_id=?').get('window-1');
    expect(row.lifecycle).toBe('approved');
    expect(row.closed_at).toBeNull();
  });
});

// ============================================================
// whp-11-d2-inline-revise Gap 1 — revise is a mid-loop verdict, not
// terminal: gate_result must return to 'pending' after a revise verdict
// so the second round can be gated again. Case names are byte-identical
// to `stories.testing_strategy` (test-spec-audit.js consume mode).
// ============================================================
describe('AC7 (whp-11 Gap 1): gateWorkerRun revise re-verdict path', () => {
  it('BR016_GateRevise_ResetsGateResultToPendingKeepsNotes', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r = gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-OPUS', gate_notes: '請補 AC3 測試' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    const h = ctx.db.prepare('SELECT gate_result, gate_notes, gate_at FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
    expect(h.gate_notes).toBe('請補 AC3 測試');
    expect(h.gate_at).toMatch(/\+08:00$/);
  });

  it('BR017_GateDuringRevising_StillRejectedByLifecycleGuard', () => {
    // Isolates the lifecycle guard (worker-protocol-ops.js ~line 232) the way the AC
    // names it — seeded directly (same technique as T-G01 above) rather than reached
    // via a natural revise call, because G24 clears ack_at in the very same
    // transaction that sets lifecycle='revising' (see T-G08), so the *natural*
    // revise → immediate re-gate sequence actually trips the earlier ack_at guard
    // first (proven separately below). Both guards independently protect; this case
    // proves the lifecycle guard's contribution specifically.
    seedRun({ run_id: 'r1', lifecycle: 'revising', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });

    const r2 = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("lifecycle='revising'");

    const run = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1');
    expect(run.lifecycle).toBe('revising');
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
  });

  it('(defense-in-depth) natural revise → immediate re-gate is rejected by the earlier ack_at guard, not the lifecycle guard', () => {
    // Documents the actual guard that fires in the real call sequence (not one of
    // the 29 byte-identical consume-mode cases — a supplementary regression lock so
    // a future refactor of guard order does not silently reopen AC8's protection).
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-OPUS', gate_notes: '請補測試' }, { dbPath: ctx.dbPath });

    const r2 = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('尚未簽收');

    const run = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1');
    expect(run.lifecycle).toBe('revising');
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('pending');
  });

  it('BR018_SecondRoundAfterRevise_ReachesApproved', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-OPUS', gate_notes: '請補測試' }, { dbPath: ctx.dbPath });

    // Second round: worker re-reports (stop-report.ps1's job in production, out of
    // this unit's scope — simulate the resulting DB state directly).
    ctx.db.prepare("UPDATE worker_runs SET lifecycle='reported' WHERE run_id=?").run('r1');
    const ackR = ackWorkerRun({ run_id: 'r1', ack_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(ackR.ok).toBe(true);

    const r = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    const run = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1');
    expect(run.lifecycle).toBe('approved');
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('approved');
  });

  it('BR019_ApprovedAndFailedVerdicts_DoNotResetGateResult', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r1 = gateWorkerRun({ run_id: 'r1', verdict: 'approved', gate_by: 'CC-OPUS' }, { dbPath: ctx.dbPath });
    expect(r1.ok).toBe(true);

    const r2 = gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-OPUS', gate_notes: 'too late' }, { dbPath: ctx.dbPath });
    expect(r2.ok).toBe(false);
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('approved'); // not reset — only revise resets
  });

  it('(whp-11 CR) rejected verdict keeps the literal gate_result and drives lifecycle to failed -- the third VERDICTS member is not silently reset', () => {
    // BR019's name covers approved+failed but its body only exercised approved; this locks the
    // remaining member of the VERDICTS named set (rejected -> lifecycle 'failed', no reset).
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', ack_at: T });
    seedHandoff({ run_id: 'r1', gate_result: 'pending' });
    const r1 = gateWorkerRun({ run_id: 'r1', verdict: 'rejected', gate_by: 'CC-OPUS', gate_notes: '不合格' }, { dbPath: ctx.dbPath });
    expect(r1.ok).toBe(true);

    const run = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r1');
    expect(run.lifecycle).toBe('failed');
    const h = ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1');
    expect(h.gate_result).toBe('rejected');

    const r2 = gateWorkerRun({ run_id: 'r1', verdict: 'revise', gate_by: 'CC-OPUS', gate_notes: 'too late' }, { dbPath: ctx.dbPath });
    expect(r2.ok).toBe(false);
    expect(ctx.db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get('r1').gate_result).toBe('rejected');
  });
});

// ============================================================
// Zero kill primitives (static source assertion)
// ============================================================
describe('T-Z01 (BR-021): zero kill primitives in the ops module', () => {
  it('contains no taskkill / Stop-Process / process.kill / .kill( anywhere', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-protocol-ops.js'), 'utf8');
    expect(source).not.toMatch(/taskkill|Stop-Process|process\.kill|\.kill\(/);
  });
});
