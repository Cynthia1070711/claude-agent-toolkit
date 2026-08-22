// whp-8-report-ack-notify — Phase 1 (worker_runs lifecycle CAS advance) behavioural tests.
// Covers BR-001~BR-006, i.e. stop-report.ps1's write path via scripts/worker-lifecycle-advance.cjs.
// Phase 2 (the L2 notify hook, BR-007~BR-029) lives in its own sibling test file next to the
// hook it exercises: .claude/hooks/worker-notify-inject.test.js — see that file's header for why
// hook tests in .claude/hooks/ use node:test + execFileSync (matching ctrl-channel-inject.test.js)
// while this file uses vitest + createTestDb() (matching every other .context-db/tests/*.test.js
// sibling, e.g. guardian-tick.test.js / worker-protocol-ops.test.js). Same reasoning either way:
// code is the true state (spec-timeliness.md) — each location's actual, established convention
// wins over the Story prose's one-size-fits-all "node --test" phrasing.
//
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// Case names are byte-identical to stories.testing_strategy (test-spec-audit.js consume mode) —
// dev does not invent case names, levels, fixtures, inputs or expectations (§0.4.2).
//
// BR-003/BR-006 assert properties of stop-report.ps1's *source* (its lifecycle-advance call must
// sit inside the existing PIPELINE_RUN_ID gate, and must be a statement independent of the
// heartbeat UPDATE) — same [Pattern: WORKFLOW-CONTRACT-ASSERTION] this Story's own table already
// uses for BR-026/BR-027, since spawning powershell.exe per-case is not this suite's style.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { advanceToReported } from '../scripts/worker-lifecycle-advance.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);
const STOP_REPORT_PS1 = fs.readFileSync(
  path.join(__dirname, '..', '..', '.claude', 'skills', 'party-to-pipeline', 'scripts', 'stop-report.ps1'),
  'utf8'
);

const T0 = '2026-01-01T00:00:00+08:00';

let ctx;

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
    ipc_dir: 'C:\\ipc\\st1', run_mode: 'window', lifecycle: 'running',
    controller_track: 'unspecified', reported_at: null, ack_at: null,
    started_at: T0, updated_at: T0,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle,
      controller_track, reported_at, ack_at, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @run_mode, @lifecycle,
      @controller_track, @reported_at, @ack_at, @started_at, @updated_at)
  `).run(row);
  return row;
}

function getRun(runId) {
  return ctx.db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId);
}

describe('Phase 1 — worker_runs lifecycle CAS advance (stop-report.ps1 write path)', () => {
  it('BR001_RunningRunAtTurnEnd_LifecycleBecomesReported', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running' });
    const now = '2026-08-02T00:10:00+08:00';
    const result = advanceToReported(ctx.db, { runId: 'r1', now });
    expect(result.ok).toBe(true);
    expect(result.changes).toBe(1);
    const row = getRun('r1');
    expect(row.lifecycle).toBe('reported');
    expect(row.reported_at).toBe(now);
    expect(row.reported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    // BR-001 (CR fix): updated_at is stamped by this same statement, not left to the sibling
    // heartbeat UPDATE -- a future standalone caller (whp-11) gets a self-consistent row.
    expect(row.updated_at).toBe(now);
  });

  it('BR002_AlreadyAckedRun_ReportedAtLeftUnchanged', () => {
    seedRun({ run_id: 'r1', lifecycle: 'awaiting-review', reported_at: '2026-08-01T10:00:00+08:00' });
    const result = advanceToReported(ctx.db, { runId: 'r1', now: '2026-08-02T00:10:00+08:00' });
    expect(result.ok).toBe(true);
    expect(result.changes).toBe(0);
    const row = getRun('r1');
    expect(row.reported_at).toBe('2026-08-01T10:00:00+08:00');
    expect(row.lifecycle).toBe('awaiting-review');
    expect(row.updated_at).toBe(T0); // CAS matched 0 rows -> updated_at untouched too
  });

  it('BR003_NoPipelineRunId_WorkerRunsUntouched', () => {
    // [Pattern: WORKFLOW-CONTRACT-ASSERTION] — the lifecycle-advance call must be nested inside
    // the existing `if ($runId) { ... }` gate (line ~321), not hoisted above it. That gate is
    // what actually guarantees "PIPELINE_RUN_ID unset -> zero DB writes"; this locks placement.
    const gateStart = STOP_REPORT_PS1.indexOf('if ($runId) {');
    expect(gateStart).toBeGreaterThan(-1);
    const gateEnd = STOP_REPORT_PS1.indexOf('\n}\n', gateStart);
    const gateBody = STOP_REPORT_PS1.slice(gateStart, gateEnd);
    expect(gateBody).toContain('advanceToReported');
  });

  it('BR004_ReportedAtFormat_IsOffsetAwareTaiwan', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running' });
    const now = '2026-08-02T00:10:00+08:00'; // same value stop-report.ps1 passes to heartbeat's last_turn_at
    advanceToReported(ctx.db, { runId: 'r1', now });
    const row = getRun('r1');
    expect(row.reported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    expect(row.reported_at).toBe(now); // pass-through, not reformatted -- guarantees equality with last_turn_at
  });

  it('BR005_DbUnwritable_LogsFailureAndKeepsStatusFile', () => {
    seedRun({ run_id: 'r1', lifecycle: 'running' });
    ctx.db.close();
    const Database = require('better-sqlite3');
    const readonlyDb = new Database(ctx.dbPath, { readonly: true });
    const result = advanceToReported(readonlyDb, { runId: 'r1', now: '2026-08-02T00:10:00+08:00' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    readonlyDb.close();
    ctx.db = new Database(ctx.dbPath); // restore so afterEach's cleanup() can close+unlink normally
  });

  it('BR006_LifecycleWrite_IsSeparateStatementFromHeartbeat', () => {
    // [Pattern: WORKFLOW-CONTRACT-ASSERTION] — the lifecycle CAS UPDATE must not be merged into
    // the heartbeat UPDATE (which would make the heartbeat's turn_count/last_turn_at conditional
    // on the same CAS and silently drop them when lifecycle isn't running/revising).
    const heartbeatStart = STOP_REPORT_PS1.indexOf('UPDATE worker_runs SET\n      turn_count');
    const heartbeatEnd = STOP_REPORT_PS1.indexOf('WHERE run_id = @runId\n  `).run({', heartbeatStart);
    const heartbeatSql = STOP_REPORT_PS1.slice(heartbeatStart, heartbeatEnd);
    expect(heartbeatSql).not.toContain('lifecycle');
    // lifecycle-advance runs via its own module call, evidenced by requiring it once elsewhere
    const requireCount = (STOP_REPORT_PS1.match(/worker-lifecycle-advance/g) || []).length;
    expect(requireCount).toBeGreaterThan(0);
  });
});
