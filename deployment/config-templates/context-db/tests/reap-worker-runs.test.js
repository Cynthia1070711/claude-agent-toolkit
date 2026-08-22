// whp-3-db-schema-registry — AC5 (4-Tuple 判活 + 標記語意 + CAS + 批次探測) + AC6 (fail-open / dry-run)
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// liveness 探測以注入式假 probeFn 取代真實 PowerShell(測試不得依賴當下機器上真的有 worker 在跑)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { reap, phaseToSuffix, judgeLiveness, cliMain, WhpCliError, loadDispatchGraceConfig } from '../scripts/reap-worker-runs.js';
import { fullUpsert, mergeRun } from '../scripts/upsert-worker-run.js';

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

function seed(row) {
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, wrapper_pid, run_mode, lifecycle, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @wrapper_pid, @run_mode, @lifecycle, @t, @t)
  `).run({ run_mode: 'window', t: T, ...row });
}

describe('phaseToSuffix (SDD Spec §4.3 table)', () => {
  it.each([
    ['create-story', 'create'],
    ['dev-story', 'dev'],
    ['dev-story-complex', 'dev'],
    ['dev-story-fix-R1', 'dev'],
    ['dev-story-fix-R99', 'dev'],
    ['code-review', 'review'],
    ['code-review-R2', 'review'],
    ['general', 'general'],
    ['some-unknown-phase', 'some-unknown-phase'],
  ])('%s -> %s', (phase, expected) => {
    expect(phaseToSuffix(phase)).toBe(expected);
  });
});

describe('judgeLiveness — 4-Tuple (BR-016)', () => {
  it('tuple 1 fail: wrapper_pid missing -> not-registered', () => {
    const v = judgeLiveness({ wrapper_pid: null, ipc_dir: 'd', phase: 'dev-story' }, new Map());
    expect(v).toEqual({ alive: false, reason: 'not-registered' });
  });

  it('tuple 2 fail: pid not in live process map -> window-gone', () => {
    const v = judgeLiveness({ wrapper_pid: 123, ipc_dir: 'd', phase: 'dev-story' }, new Map());
    expect(v).toEqual({ alive: false, reason: 'window-gone' });
  });

  it('tuple 3 fail: pid exists but cmdline lacks ipc_dir -> pid-reused', () => {
    const map = new Map([[123, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\other']]);
    const v = judgeLiveness({ wrapper_pid: 123, ipc_dir: 'C:\\mine', phase: 'dev-story' }, map);
    expect(v).toEqual({ alive: false, reason: 'pid-reused' });
  });

  it('tuple 4 fail: cmdline has ipc_dir but wrong worker-{suffix}.ps1 -> cmdline-mismatch', () => {
    const map = new Map([[123, 'powershell.exe -File worker-review.ps1 -IpcDir C:\\mine']]);
    const v = judgeLiveness({ wrapper_pid: 123, ipc_dir: 'C:\\mine', phase: 'dev-story' }, map);
    expect(v).toEqual({ alive: false, reason: 'cmdline-mismatch' });
  });

  it('all 4 tuples pass -> alive', () => {
    const map = new Map([[123, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\mine']]);
    const v = judgeLiveness({ wrapper_pid: 123, ipc_dir: 'C:\\mine', phase: 'dev-story' }, map);
    expect(v).toEqual({ alive: true });
  });

  it('PID-reuse defence: a real 33 zombies audit found live PID owned by an unrelated process (e.g. svchost) — tuple 3 catches it', () => {
    const map = new Map([[4242, 'C:\\Windows\\System32\\svchost.exe -k netsvcs']]);
    const v = judgeLiveness({ wrapper_pid: 4242, ipc_dir: 'C:\\ipc\\somestory', phase: 'dev-story' }, map);
    expect(v.alive).toBe(false);
    expect(v.reason).toBe('pid-reused');
  });

  // CR R1 F2 regression — 原判準 shared-utils.ps1:440/:455 用 PowerShell `-notmatch`(預設
  // case-insensitive),Windows 路徑也大小寫不敏感。JS 端若用 case-sensitive `.includes`,
  // 只是大小寫不同的同一個 worker 會被判 pid-reused → 活著的視窗被標 abandoned。
  it('tuples 3+4 compare case-insensitively, matching the PowerShell -notmatch original', () => {
    const map = new Map([[123, 'C:\\WINDOWS\\SYSTEM32\\WINDOWSPOWERSHELL\\V1.0\\POWERSHELL.EXE -File C:\\IPC\\MyStory\\Worker-Dev.PS1 -IpcDir C:\\IPC\\MyStory']]);
    const v = judgeLiveness({ wrapper_pid: 123, ipc_dir: 'c:\\ipc\\mystory', phase: 'dev-story' }, map);
    expect(v).toEqual({ alive: true });
  });
});

describe('AC5: full reap() scan', () => {
  it('BR-014: scanned excludes the 3 terminal lifecycles entirely; a terminal row is left byte-identical', () => {
    seed({ run_id: 'r-alive', session_id: 's', story_id: 'stA', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stA', wrapper_pid: 999, lifecycle: 'running' });
    seed({ run_id: 'r-closed', session_id: 's', story_id: 'stF', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stF', wrapper_pid: 1, lifecycle: 'closed' });
    seed({ run_id: 'r-failed', session_id: 's', story_id: 'stX', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stX', wrapper_pid: 1, lifecycle: 'failed' });
    seed({ run_id: 'r-abandoned', session_id: 's', story_id: 'stY', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stY', wrapper_pid: 1, lifecycle: 'abandoned' });

    const before = ctx.db.prepare("SELECT run_id, lifecycle FROM worker_runs WHERE lifecycle IN ('closed','failed','abandoned') ORDER BY run_id").all();
    const fakeProbe = () => new Map([[999, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\stA']]);
    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: fakeProbe });

    expect(report.scanned).toBe(1); // only r-alive is non-terminal
    expect(report.skipped_terminal).toBe(3);

    const after = ctx.db.prepare("SELECT run_id, lifecycle FROM worker_runs WHERE lifecycle IN ('closed','failed','abandoned') ORDER BY run_id").all();
    expect(after).toEqual(before);
  });

  it('BR-015: run_mode=inline is skipped before liveness is attempted, never marked abandoned', () => {
    seed({ run_id: 'r-inline', session_id: 's', story_id: 'stE', phase: 'general', ipc_dir: 'C:\\ipc\\stE', wrapper_pid: null, run_mode: 'inline', lifecycle: 'running' });

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map() });

    expect(report.skipped_inline).toBe(1);
    expect(report.reaped).toBe(0);
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-inline'").get();
    expect(row.lifecycle).toBe('running');
  });

  it('BR-017/BR-018: a dead run is marked abandoned with full evidence, and closed_at is NEVER written', () => {
    seed({ run_id: 'r-dead', session_id: 's', story_id: 'stB', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stB', wrapper_pid: 998, lifecycle: 'running' });

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map() }); // pid absent -> window-gone

    expect(report.reaped).toBe(1);
    const row = ctx.db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get('r-dead');
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('running');
    expect(row.close_source).toBe('Unknown');
    expect(row.requires_attention).toBe(1);
    expect(row.closed_detected_at).toMatch(/\+08:00$/);
    expect(row.closed_at).toBeNull();
  });

  it('BR-019: CAS — a row that advanced between read and write yields changes=0 and keeps its new lifecycle', () => {
    seed({ run_id: 'r-cas', session_id: 's', story_id: 'stG', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stG', wrapper_pid: 4000, lifecycle: 'running' });

    // Simulate an external actor (e.g. controller) advancing the row's lifecycle right before reap()
    // would have written its CAS UPDATE, by using a probeFn side-effect timed against a DEAD pid,
    // then racing the DB row forward first (reap()'s own SELECT already captured 'running' as the
    // observed value it will condition on).
    const fakeProbe = () => {
      ctx.db.prepare("UPDATE worker_runs SET lifecycle='approved' WHERE run_id='r-cas'").run();
      return new Map(); // pid 4000 absent from probe -> DEAD verdict for the (now stale) 'running' snapshot
    };

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: fakeProbe });

    expect(report.skipped_cas_lost).toBe(1);
    expect(report.reaped).toBe(0);
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-cas'").get();
    expect(row.lifecycle).toBe('approved'); // 保留推進後的值,未被 reaper 蓋回 abandoned
  });

  it('AC6/BR-021: probe failure fails open — probe_unavailable=true, 0 rows modified, no throw', () => {
    seed({ run_id: 'r-x', session_id: 's', story_id: 'stI', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stI', wrapper_pid: 777, lifecycle: 'running' });

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => { throw new Error('CIM unavailable'); } });

    expect(report.probe_unavailable).toBe(true);
    expect(report.reaped).toBe(0);
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-x'").get();
    expect(row.lifecycle).toBe('running');
  });

  it('AC6/BR-022: --dry-run reports what would be reaped but writes nothing', () => {
    seed({ run_id: 'r-dry', session_id: 's', story_id: 'stJ', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stJ', wrapper_pid: 6000, lifecycle: 'running' });

    const report = reap({ dbPath: ctx.dbPath, dryRun: true, probeFn: () => new Map() });

    expect(report.dry_run).toBe(true);
    expect(report.reaped).toBe(1);
    expect(report.runs.find(r => r.run_id === 'r-dry')).toBeTruthy();
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-dry'").get();
    expect(row.lifecycle).toBe('running'); // 未寫入
  });

  it('BR-023: exactly one probe invocation per run() call regardless of candidate row count', () => {
    for (let i = 0; i < 5; i++) {
      seed({ run_id: `r-batch-${i}`, session_id: 's', story_id: `st${i}`, phase: 'dev-story', ipc_dir: `C:\\ipc\\st${i}`, wrapper_pid: 1000 + i, lifecycle: 'running' });
    }
    let calls = 0;
    reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => { calls++; return new Map(); } });
    expect(calls).toBe(1);
  });
});

describe('BR-129: dispatch-grace age rule (isomorphic with guardian-tick.js BR-G08, TD-WHP3-REAPER-DISPATCH-RACE-NO-GRACE-WINDOW)', () => {
  const GRACE_CFG = { dispatchConfirmSec: 60, guardianDispatchGraceSec: 120 }; // graceMs = 180000

  it('positive arm: a dispatching ghost older than the grace window is marked abandoned with reason dispatch-grace-expired', () => {
    seed({ run_id: 'r-ghost-old', session_id: 's', story_id: 'stGhost1', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost1', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:05:00+08:00', // +300s, > 180s grace
      config: GRACE_CFG,
    });

    expect(report.skipped_dispatch_grace).toBe(0);
    expect(report.reaped).toBe(1);
    expect(report.runs.find(r => r.run_id === 'r-ghost-old').reason).toBe('dispatch-grace-expired');
    const row = ctx.db.prepare("SELECT lifecycle, abandoned_at_stage FROM worker_runs WHERE run_id='r-ghost-old'").get();
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('dispatching');
  });

  it('negative arm: a dispatching ghost within the grace window is left untouched, never reaches the 4-Tuple, and is counted', () => {
    seed({ run_id: 'r-ghost-young', session_id: 's', story_id: 'stGhost2', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost2', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:02:00+08:00', // +120s, < 180s grace
      config: GRACE_CFG,
    });

    expect(report.skipped_dispatch_grace).toBe(1);
    expect(report.reaped).toBe(0);
    expect(report.alive).toBe(0); // never reached judgeLiveness either
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-ghost-young'").get();
    expect(row.lifecycle).toBe('dispatching');
  });

  it('boundary: elapsed exactly equal to the grace window does NOT abandon (strict > per BR-G08)', () => {
    seed({ run_id: 'r-ghost-boundary', session_id: 's', story_id: 'stGhost3', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost3', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:03:00+08:00', // exactly +180s == grace
      config: GRACE_CFG,
    });

    expect(report.skipped_dispatch_grace).toBe(1);
    expect(report.reaped).toBe(0);
  });

  it('wrapper_pid<=0 (not just null) also routes through the grace-window path, per the BR-G08 predicate', () => {
    seed({ run_id: 'r-ghost-zero-pid', session_id: 's', story_id: 'stGhost4', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost4', wrapper_pid: 0, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:05:00+08:00',
      config: GRACE_CFG,
    });

    expect(report.reaped).toBe(1);
    expect(report.runs.find(r => r.run_id === 'r-ghost-zero-pid').reason).toBe('dispatch-grace-expired');
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-ghost-zero-pid'").get();
    expect(row.lifecycle).toBe('abandoned');
  });

  it('a dispatching row that already has a registered wrapper_pid skips the grace path and falls through to the 4-Tuple instead', () => {
    seed({ run_id: 'r-dispatching-registered', session_id: 's', story_id: 'stGhost5', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost5', wrapper_pid: 5555, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(), // pid absent -> window-gone
      now: '2026-01-01T00:00:01+08:00', // 1s later -- would stay in grace if it took that path
      config: GRACE_CFG,
    });

    expect(report.skipped_dispatch_grace).toBe(0);
    expect(report.reaped).toBe(1);
    expect(report.runs.find(r => r.run_id === 'r-dispatching-registered').reason).toBe('window-gone');
  });

  it('probe failure fail-open also blankets the grace-window path (BR-G19 parity): an expired ghost survives untouched', () => {
    seed({ run_id: 'r-ghost-probe-fail', session_id: 's', story_id: 'stGhost6', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost6', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => { throw new Error('CIM unavailable'); },
      now: '2026-01-01T00:10:00+08:00', // far past grace -- would abandon if the probe worked
      config: GRACE_CFG,
    });

    expect(report.probe_unavailable).toBe(true);
    expect(report.skipped_dispatch_grace).toBe(0);
    expect(report.reaped).toBe(0);
    const row = ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-ghost-probe-fail'").get();
    expect(row.lifecycle).toBe('dispatching');
  });

  it('config injection genuinely changes the threshold -- zero hardcoded seconds', () => {
    seed({ run_id: 'r-ghost-tight-skip', session_id: 's', story_id: 'stGhost7a', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost7a', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });
    seed({ run_id: 'r-ghost-tight-abandon', session_id: 's', story_id: 'stGhost7b', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost7b', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });
    const tightCfg = { dispatchConfirmSec: 2, guardianDispatchGraceSec: 3 }; // graceMs = 5000

    // +4s: inside the tight 5s grace (would be well inside GRACE_CFG's 180s grace too, but that's not the config in play here)
    const reportSkip = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:00:04+08:00',
      config: tightCfg,
    });
    expect(reportSkip.skipped_dispatch_grace).toBeGreaterThanOrEqual(1);
    expect(ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-ghost-tight-skip'").get().lifecycle).toBe('dispatching');

    // +6s: past the SAME tight 5s grace -- proves the injected numbers, not a hardcoded value, drive the outcome
    const reportAbandon = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:00:06+08:00',
      config: tightCfg,
    });
    expect(ctx.db.prepare("SELECT lifecycle FROM worker_runs WHERE run_id='r-ghost-tight-abandon'").get().lifecycle).toBe('abandoned');
    expect(reportAbandon.runs.find(r => r.run_id === 'r-ghost-tight-abandon').reason).toBe('dispatch-grace-expired');
  });

  it('defaults to DEFAULT_DISPATCH_GRACE_CFG (30+120=150s) when no config is injected', () => {
    seed({ run_id: 'r-ghost-default-cfg', session_id: 's', story_id: 'stGhost8', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stGhost8', wrapper_pid: null, lifecycle: 'dispatching', t: '2026-01-01T00:00:00+08:00' });

    const report = reap({
      dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map(),
      now: '2026-01-01T00:02:00+08:00', // +120s, < 150s default grace
    });

    expect(report.skipped_dispatch_grace).toBe(1);
    expect(report.reaped).toBe(0);
  });
});

describe('loadDispatchGraceConfig() reads the same scripts/pipeline-config.json workerProtocol as guardian-tick.js loadFileConfig()', () => {
  it('returns the real project config with numeric dispatchConfirmSec and guardianDispatchGraceSec', () => {
    const cfg = loadDispatchGraceConfig();
    expect(typeof cfg.dispatchConfirmSec).toBe('number');
    expect(typeof cfg.guardianDispatchGraceSec).toBe('number');
    expect(cfg.dispatchConfirmSec).toBeGreaterThan(0);
    expect(cfg.guardianDispatchGraceSec).toBeGreaterThan(0);
  });
});

describe('CR R1 F1 regression: the module is import-safe as a library', () => {
  // 🔴 這條只有用 child process 才測得到。vitest 自己永遠不是 node 的執行入口,
  // 舊的 `!process.env.VITEST` 判準在測試程序內恆為 false —— 缺陷結構上對測試隱形,
  // 實測 `node -e "import('./scripts/reap-worker-runs.js')"` 會直接對 live phycool.db
  // 跑完一輪對帳並寫入 abandoned 標記。whp-7 守護要複用 judgeLiveness/phaseToSuffix。
  it('importing from a plain Node process exports the API without executing the CLI', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', "import('./scripts/reap-worker-runs.js').then(m => console.log('IMPORTED:' + m.NON_TERMINAL_LIFECYCLES.length))"],
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
    );
    expect(out).toContain('IMPORTED:6');
    expect(out).not.toMatch(/Scanned:/); // CLI 報告不得因 import 而被觸發
  });
});

describe('BR-020: zero kill primitives in the shipped file', () => {
  it('contains no taskkill / Stop-Process / process.kill / .kill( anywhere', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'reap-worker-runs.js'), 'utf8');
    expect(source).not.toMatch(/taskkill|Stop-Process|process\.kill|\.kill\(/);
  });
});

describe('Cross-task integration: upsert-worker-run.js -> reap-worker-runs.js pipeline (step-06 gap)', () => {
  it('a row created via fullUpsert() with a dead pid is correctly reaped end-to-end', () => {
    fullUpsert(
      { run_id: 'r-e2e-dead', session_id: 's1', story_id: 'st-e2e', phase: 'code-review', ipc_dir: 'C:\\ipc\\st-e2e', wrapper_pid: 8000, lifecycle: 'running' },
      { dbPath: ctx.dbPath, quiet: true }
    );

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map() }); // 8000 absent -> window-gone

    expect(report.reaped).toBe(1);
    const row = ctx.db.prepare("SELECT * FROM worker_runs WHERE run_id='r-e2e-dead'").get();
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('running');
    expect(row.closed_at).toBeNull();
  });

  it('a row created via fullUpsert(), then merged with a matching alive probe, survives reap() untouched', () => {
    fullUpsert(
      { run_id: 'r-e2e-alive', session_id: 's1', story_id: 'st-e2e2', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-e2e2', wrapper_pid: 9000, lifecycle: 'dispatching' },
      { dbPath: ctx.dbPath, quiet: true }
    );
    mergeRun('r-e2e-alive', { lifecycle: 'running', turn_count: 3 }, { dbPath: ctx.dbPath, quiet: true });

    const fakeProbe = () => new Map([[9000, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-e2e2']]);
    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: fakeProbe });

    expect(report.alive).toBe(1);
    expect(report.reaped).toBe(0);
    const row = ctx.db.prepare("SELECT lifecycle, turn_count FROM worker_runs WHERE run_id='r-e2e-alive'").get();
    expect(row.lifecycle).toBe('running');
    expect(row.turn_count).toBe(3); // merge 之前寫入的欄位存活,未被 reap 動過
  });

  it('reap() never reaps a row whose lifecycle is a terminal state reached via mergeRun()', () => {
    fullUpsert(
      { run_id: 'r-e2e-closed', session_id: 's1', story_id: 'st-e2e3', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-e2e3', wrapper_pid: 7000, lifecycle: 'running' },
      { dbPath: ctx.dbPath, quiet: true }
    );
    mergeRun('r-e2e-closed', { lifecycle: 'closed', close_source: 'UserClosed' }, { dbPath: ctx.dbPath, quiet: true });

    const report = reap({ dbPath: ctx.dbPath, dryRun: false, probeFn: () => new Map() });

    expect(report.runs.find(r => r.run_id === 'r-e2e-closed')).toBeUndefined();
    const row = ctx.db.prepare("SELECT lifecycle, close_source FROM worker_runs WHERE run_id='r-e2e-closed'").get();
    expect(row.lifecycle).toBe('closed');
    expect(row.close_source).toBe('UserClosed'); // reap 完全未觸碰,真實關閉來源保留
  });
});

describe('AC6: CLI usage / --help', () => {
  it('--help prints usage and returns exit code 0', () => {
    const orig = console.log;
    const logs = [];
    console.log = (...a) => logs.push(a.join(' '));
    let code;
    try {
      code = cliMain(['--help']);
    } finally {
      console.log = orig;
    }
    expect(code).toBe(0);
    expect(logs.join('\n')).toMatch(/Usage:/);
  });
});
