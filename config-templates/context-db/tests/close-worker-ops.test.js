// whp-6-directive-delivery-and-close — Phase 4 (BR-024~BR-029) behavioural tests for close-worker-ops.js
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。liveness 探測以注入式
// 假 probeFn 取代真實 PowerShell(對齊 reap-worker-runs.test.js 既有範式,測試不依賴機器上真有 worker)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { checkClosePreconditions, closeWorkerRun } from '../scripts/close-worker-ops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);

let ctx;
const T = '2026-01-01T00:00:00+08:00';

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
    ipc_dir: 'C:\\ipc\\st1', run_mode: 'window', lifecycle: 'approved',
    controller_track: 'backend', wrapper_pid: 4242, ack_at: T,
    started_at: T, updated_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle,
      controller_track, wrapper_pid, ack_at, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @run_mode, @lifecycle,
      @controller_track, @wrapper_pid, @ack_at, @started_at, @updated_at)
  `).run(row);
  return row;
}

function seedHandoff(overrides = {}) {
  const row = {
    run_id: 'r1', story_id: 'st1', phase: 'dev-story',
    gate_result: 'approved', gate_by: 'CC-TEST', gate_at: T,
    created_at: T, updated_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_handoffs (run_id, story_id, phase, gate_result, gate_by, gate_at, created_at, updated_at)
    VALUES (@run_id, @story_id, @phase, @gate_result, @gate_by, @gate_at, @created_at, @updated_at)
  `).run(row);
  return row;
}

/** All 5 preconditions satisfied: window mode, approved, ack'd, gate approved, matching track. */
function seedFullyEligible(overrides = {}) {
  const run = seedRun(overrides);
  seedHandoff({ run_id: run.run_id, story_id: run.story_id, phase: run.phase });
  return run;
}

function aliveProbe(pid, ipcDir, phase) {
  return () => new Map([[pid, `powershell.exe -File worker-${phase === 'dev-story' ? 'dev' : phase}.ps1 -IpcDir ${ipcDir}`]]);
}

describe('close-worker-ops.js — Phase 4', () => {
  describe('BR024_EachOfFivePreconditionsViolated_RefusesWithZeroSideEffect', () => {
    it('(a) lifecycle != approved -> WHP6-E01 names "lifecycle", zero side effect', () => {
      const run = seedFullyEligible({ lifecycle: 'reported' });
      const before = ctx.db.prepare('SELECT lifecycle, close_source, closed_at, updated_at FROM worker_runs WHERE run_id=?').get(run.run_id);
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'backend' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E01');
      expect(result.failedChecks).toContain('lifecycle');
      const msgCountBefore = ctx.db.prepare('SELECT COUNT(*) n FROM worker_messages').get().n;
      const after = ctx.db.prepare('SELECT lifecycle, close_source, closed_at, updated_at FROM worker_runs WHERE run_id=?').get(run.run_id);
      expect(after).toEqual(before);
      expect(ctx.db.prepare('SELECT COUNT(*) n FROM worker_messages').get().n).toBe(msgCountBefore);
    });

    it('(b) ack_at IS NULL -> WHP6-E01 names "ack_at"', () => {
      const run = seedFullyEligible({ ack_at: null });
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'backend' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E01');
      expect(result.failedChecks).toContain('ack_at');
    });

    it('(c) gate_result=pending -> WHP6-E01 names "gate_result"', () => {
      const run = seedRun();
      seedHandoff({ run_id: run.run_id, gate_result: 'pending', gate_at: null, gate_by: null });
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'backend' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E01');
      expect(result.failedChecks).toContain('gate_result');
    });

    it('(d) controller_track mismatch without -Override -> WHP6-E01 names "controller_track"', () => {
      const run = seedFullyEligible({ controller_track: 'backend' });
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'frontend' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E01');
      expect(result.failedChecks).toContain('controller_track');

      // Override + non-empty reason lifts the block (still needs the other 4 to pass).
      const overridden = checkClosePreconditions(run.run_id, {
        dbPath: ctx.dbPath, callerTrack: 'frontend', override: true, overrideReason: 'emergency handoff',
      });
      expect(overridden.ok).toBe(true);
    });

    it('(e) run_mode=inline -> WHP6-E05 (isolated from the other 4, BR-037/AC13 parity)', () => {
      const run = seedFullyEligible({ run_mode: 'inline' });
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'backend' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E05');
      expect(result.failedChecks).toEqual(['run-mode-inline']);
    });

    it('run_id not found -> WHP6-E02, zero side effect', () => {
      const result = checkClosePreconditions('nonexistent-run-id', { dbPath: ctx.dbPath });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('WHP6-E02');
      expect(result.notFound).toBe(true);
    });

    it('all 5 preconditions satisfied -> ok=true, code=null', () => {
      const run = seedFullyEligible();
      const result = checkClosePreconditions(run.run_id, { dbPath: ctx.dbPath, callerTrack: 'backend' });
      expect(result.ok).toBe(true);
      expect(result.code).toBeNull();
      expect(result.failedChecks).toEqual([]);
    });
  });

  it('BR025_LivenessJudgement_ReusesReapWorkerRunsExports (static: zero Win32_Process hits, no second liveness scheme)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'close-worker-ops.js'), 'utf8');
    expect(src).toMatch(/from ['"]\.\/reap-worker-runs\.js['"]/);
    expect((src.match(/Win32_Process/g) || []).length).toBe(0);
  });

  it('BR026_WrapperPidAlreadyDead_MarksUserClosedWithoutKill (exit-0 path, closed_at stays NULL)', () => {
    const run = seedFullyEligible({ wrapper_pid: 99999 });
    const deadProbe = () => new Map(); // pid not found anywhere -> window-gone
    const result = closeWorkerRun(run.run_id, { dbPath: ctx.dbPath, probeFn: deadProbe });
    expect(result.outcome).toBe('already-closed');
    expect(result.code).toBeUndefined();
    const after = ctx.db.prepare('SELECT lifecycle, close_source, closed_at, closed_detected_at FROM worker_runs WHERE run_id=?').get(run.run_id);
    expect(after.lifecycle).toBe('closed');
    expect(after.close_source).toBe('UserClosed');
    expect(after.closed_at).toBeNull();
    expect(after.closed_detected_at).toBeTruthy();
  });

  it('BR027_PidReusedByForeignProcess_AbortsWithoutWriteOrKill (exit-2 path, lifecycle untouched)', () => {
    const run = seedFullyEligible({ wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\mine' });
    const foreignProbe = () => new Map([[4242, 'C:\\Windows\\System32\\svchost.exe -k netsvcs']]);
    const before = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get(run.run_id);
    const result = closeWorkerRun(run.run_id, { dbPath: ctx.dbPath, probeFn: foreignProbe });
    expect(result.outcome).toBe('pid-reused');
    expect(result.code).toBe('WHP6-E03');
    const after = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get(run.run_id);
    expect(after).toEqual(before);
  });

  it('BR027b: alive + matching cmdline -> proceeds to CAS closed/ControllerAfterHandshake (feeds .ps1 C5 taskkill)', () => {
    const run = seedFullyEligible({ wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\mine', phase: 'dev-story' });
    const result = closeWorkerRun(run.run_id, { dbPath: ctx.dbPath, probeFn: aliveProbe(4242, 'C:\\ipc\\mine', 'dev-story') });
    expect(result.outcome).toBe('alive-closed');
    expect(result.wrapper_pid).toBe(4242);
    const after = ctx.db.prepare('SELECT lifecycle, close_source, closed_at FROM worker_runs WHERE run_id=?').get(run.run_id);
    expect(after.lifecycle).toBe('closed');
    expect(after.close_source).toBe('ControllerAfterHandshake');
    expect(after.closed_at).toBeTruthy();
  });

  it('BR027c: -Force -> close_source=ControllerForce', () => {
    const run = seedFullyEligible({ wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\mine', phase: 'dev-story' });
    closeWorkerRun(run.run_id, { dbPath: ctx.dbPath, probeFn: aliveProbe(4242, 'C:\\ipc\\mine', 'dev-story'), force: true });
    const after = ctx.db.prepare('SELECT close_source FROM worker_runs WHERE run_id=?').get(run.run_id);
    expect(after.close_source).toBe('ControllerForce');
  });

  it('BR029_LifecycleAdvancedBetweenPrecheckAndWrite_ZeroRowsAborts (CAS-lost)', () => {
    const run = seedFullyEligible({ wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\mine', phase: 'dev-story' });
    // Simulate a concurrent writer advancing lifecycle between the precheck and this call
    // (e.g. the guardian reaping it, or a second controller racing the same run).
    ctx.db.prepare("UPDATE worker_runs SET lifecycle='revising' WHERE run_id=?").run(run.run_id);
    const result = closeWorkerRun(run.run_id, { dbPath: ctx.dbPath, probeFn: aliveProbe(4242, 'C:\\ipc\\mine', 'dev-story') });
    expect(result.outcome).toBe('cas-lost');
    expect(result.code).toBe('WHP6-E04');
    const after = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get(run.run_id);
    expect(after.lifecycle).toBe('revising'); // untouched by the failed CAS
  });

  it('-DryRun performs zero writes for both the already-closed and alive branches', () => {
    const runDead = seedFullyEligible({ run_id: 'r-dead', story_id: 'st-dead', wrapper_pid: 55555 });
    const beforeDead = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r-dead');
    const dryDead = closeWorkerRun('r-dead', { dbPath: ctx.dbPath, probeFn: () => new Map(), dryRun: true });
    expect(dryDead.outcome).toBe('dry-run-already-closed');
    expect(ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r-dead')).toEqual(beforeDead);

    const runAlive = seedFullyEligible({ run_id: 'r-alive', story_id: 'st-alive', wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\mine', phase: 'dev-story' });
    const beforeAlive = ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r-alive');
    const dryAlive = closeWorkerRun('r-alive', { dbPath: ctx.dbPath, probeFn: aliveProbe(4242, 'C:\\ipc\\mine', 'dev-story'), dryRun: true });
    expect(dryAlive.outcome).toBe('dry-run-alive');
    expect(ctx.db.prepare('SELECT lifecycle FROM worker_runs WHERE run_id=?').get('r-alive')).toEqual(beforeAlive);
    void runAlive; void runDead;
  });
});
