// whp-7-guardian-daemon — guardianTick() 全 26 條 BR(BR-G01~BR-G26)覆蓋測試。
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// 4-Tuple 判活與 phase→suffix 判準 import 自 reap-worker-runs.js,不重寫。
// 走訪測試(BR-G22~G24)用真實 temp 目錄樹(fs.mkdtempSync),mtime 一律由注入式 mtimeFn 控制
// (不依賴真實檔案系統時間戳精度),故仍是完全確定性、零真實 worker 依賴。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import {
  guardianTick,
  DEFAULT_CONFIG,
  WhpGuardianError,
  cliMain,
  printUsage,
  resolveControlPlaneRoot,
  runStatusQuery,
  loadFileConfig,
} from '../scripts/guardian-tick.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);

// ---------- offset-aware Taiwan timestamp helpers(machine-timezone-independent) ----------

const T0 = '2026-01-01T00:00:00.000+08:00';

function twTimestamp(epochMs) {
  const shifted = new Date(epochMs + 8 * 3600000);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const y = shifted.getUTCFullYear();
  const M = pad(shifted.getUTCMonth() + 1);
  const d = pad(shifted.getUTCDate());
  const h = pad(shifted.getUTCHours());
  const m = pad(shifted.getUTCMinutes());
  const s = pad(shifted.getUTCSeconds());
  const ms = pad(shifted.getUTCMilliseconds(), 3);
  return `${y}-${M}-${d}T${h}:${m}:${s}.${ms}+08:00`;
}
function minutesBefore(baseIso, minutes) {
  return twTimestamp(Date.parse(baseIso) - minutes * 60000);
}
function minutesAfter(baseIso, minutes) {
  return twTimestamp(Date.parse(baseIso) + minutes * 60000);
}
function secondsBefore(baseIso, seconds) {
  return twTimestamp(Date.parse(baseIso) - seconds * 1000);
}

// ---------- DB fixture ----------

let ctx;
const FAKE_CONTROL_ROOT = 'C:\\fake\\control-root';

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  ctx.cleanup();
});

function seed(row) {
  const base = {
    session_id: 's1',
    resumed_from_run_id: null,
    attempt: 1,
    controller_track: 'unspecified',
    run_mode: 'window',
    wrapper_pid: null,
    claude_pid: null,
    cmd_line: null,
    window_title: null,
    model_id: null,
    effort: null,
    work_root: null,
    baseline_commit: null,
    lifecycle: 'running',
    close_source: null,
    last_status: null,
    evidence_incomplete: 0,
    turn_count: 0,
    files_modified: null,
    health_flag: null,
    stall_rounds: 0,
    reported_at: null,
    ack_at: null,
    ack_by: null,
    notify_count: 0,
    last_notified_at: null,
    window_vanished_at: null,
    abandoned_at_stage: null,
    requires_attention: 0,
    guardian_exit_reason: null,
    last_turn_at: null,
    closed_at: null,
    closed_detected_at: null,
    started_at: T0,
    updated_at: T0,
  };
  const full = { ...base, ...row };
  const cols = Object.keys(full);
  ctx.db.prepare(`INSERT INTO worker_runs (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`).run(full);
  return full;
}

function getRun(runId) {
  return ctx.db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId);
}

function getHeartbeat() {
  return ctx.db.prepare('SELECT * FROM guardian_heartbeat WHERE id = 1').get();
}

function baseCfg(overrides) {
  return {
    ...DEFAULT_CONFIG,
    controlPlaneRoot: FAKE_CONTROL_ROOT,
    guardianPid: 55555,
    ...overrides,
  };
}

function tick(opts) {
  return guardianTick({ dbPath: ctx.dbPath, now: T0, ...opts });
}

// ============================================================
// 鐵則(靜態掃描)— BR-G01
// ============================================================

describe('BR-G01: 零殺傷 / 零刪檔原語(靜態掃描)', () => {
  const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'guardian-tick.js'), 'utf8');

  it('contains no taskkill / Stop-Process / process.kill / .kill( / Remove-Item anywhere', () => {
    expect(SOURCE).not.toMatch(/taskkill|Stop-Process|process\.kill|\.kill\(|Remove-Item/);
  });

  it('contains no naive datetime(\'now\') or toISOString() timestamp writes', () => {
    expect(SOURCE).not.toMatch(/datetime\('now'\)|toISOString\(\)/);
  });

  it('does not re-implement the 4-Tuple (zero Win32_Process/CommandLine literals outside the import)', () => {
    const withoutImportLine = SOURCE.split('\n').filter(l => !l.includes("from './reap-worker-runs.js'")).join('\n');
    expect(withoutImportLine).not.toMatch(/Win32_Process|CommandLine/);
  });

  it('BR-G12: the fingerprint is never computed from a repository-wide dirty-file scan', () => {
    expect(SOURCE).not.toMatch(/git status|git diff|--porcelain/);
  });
});

// ============================================================
// BR-G02: approved 存活時零觸碰
// ============================================================

describe('BR-G02: lifecycle=approved 且存活 — 快 tick 後 byte-identical(僅 updated_at 免疫於本檢查)', () => {
  it('a live approved row is left completely untouched', () => {
    seed({
      run_id: 'r-approved-alive', story_id: 'stA', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stA',
      wrapper_pid: 111, lifecycle: 'approved', updated_at: T0,
    });
    const fakeProbe = () => new Map([[111, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\stA']]);
    const before = getRun('r-approved-alive');
    tick({ mode: 'fast', config: baseCfg(), probeFn: fakeProbe });
    const after = getRun('r-approved-alive');
    expect(after).toEqual(before);
  });
});

// ============================================================
// BR-G03~G06: 判準複用 + abandoned 欄位集 + closed_at 永空 + CAS
// ============================================================

describe('BR-G04~G06: abandoned 欄位集 + closed_at 永空 + CAS', () => {
  it('BR-G04: a dead run gets the full abandoned field set; pre-set window_vanished_at is preserved', () => {
    seed({ run_id: 'r-dead1', story_id: 'stB', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stB', wrapper_pid: 999, lifecycle: 'running' });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.abandoned).toBe(1);
    const row = getRun('r-dead1');
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('running');
    expect(row.close_source).toBe('Unknown');
    expect(row.requires_attention).toBe(1);
    expect(row.closed_detected_at).toMatch(/\+08:00$/);

    seed({ run_id: 'r-dead2', story_id: 'stB2', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stB2', wrapper_pid: 998, lifecycle: 'running', window_vanished_at: '2025-12-31T00:00:00.000+08:00' });
    tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    const row2 = getRun('r-dead2');
    expect(row2.window_vanished_at).toBe('2025-12-31T00:00:00.000+08:00');
  });

  it('BR-G05: closed_at is never written by any tick', () => {
    seed({ run_id: 'r-dead3', story_id: 'stC', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stC', wrapper_pid: 997, lifecycle: 'running' });
    tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(getRun('r-dead3').closed_at).toBeNull();
  });

  it('BR-G06: CAS — a row that advanced between read and write yields skipped_cas_lost and keeps its new lifecycle', () => {
    seed({ run_id: 'r-cas', story_id: 'stD', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stD', wrapper_pid: 4000, lifecycle: 'running' });
    const fakeProbe = () => {
      ctx.db.prepare("UPDATE worker_runs SET lifecycle='approved' WHERE run_id='r-cas'").run();
      return new Map();
    };
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: fakeProbe });
    expect(report.skipped_cas_lost).toBe(1);
    expect(report.abandoned).toBe(0);
    expect(getRun('r-cas').lifecycle).toBe('approved');
  });

  it('BR-G03: alive verdict leaves the row untouched and counts under alive', () => {
    seed({ run_id: 'r-alive', story_id: 'stE', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stE', wrapper_pid: 222, lifecycle: 'running' });
    const fakeProbe = () => new Map([[222, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\stE']]);
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: fakeProbe });
    expect(report.alive).toBe(1);
    expect(getRun('r-alive').lifecycle).toBe('running');
  });

  it('a PID-reused row (cmdline lacks ipc_dir) is correctly marked abandoned via the imported 4-Tuple', () => {
    seed({ run_id: 'r-reused', story_id: 'stF', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stF', wrapper_pid: 333, lifecycle: 'running' });
    const fakeProbe = () => new Map([[333, 'C:\\Windows\\System32\\svchost.exe -k netsvcs']]);
    tick({ mode: 'fast', config: baseCfg(), probeFn: fakeProbe });
    expect(getRun('r-reused').lifecycle).toBe('abandoned');
  });

  it('terminal-lifecycle rows are never scanned at all (scanned excludes them)', () => {
    seed({ run_id: 'r-closed', story_id: 'stG', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stG', lifecycle: 'closed', wrapper_pid: 1 });
    const before = getRun('r-closed');
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.scanned).toBe(0);
    expect(getRun('r-closed')).toEqual(before);
  });
});

// ============================================================
// BR-G07: inline 排除(僅存活層)
// ============================================================

describe('BR-G07: run_mode=inline — 僅跳過存活判定,催辦迴圈仍納入', () => {
  it('an inline running row is skipped_inline and untouched by loop A', () => {
    seed({ run_id: 'r-inline', story_id: 'stH', phase: 'general', ipc_dir: 'C:\\ipc\\stH', run_mode: 'inline', wrapper_pid: null, lifecycle: 'running' });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.skipped_inline).toBe(1);
    expect(getRun('r-inline').lifecycle).toBe('running');
  });

  it('an inline reported row IS included in the first-notify loop', () => {
    seed({ run_id: 'r-inline-rep', story_id: 'stI', phase: 'general', ipc_dir: 'C:\\ipc\\stI', run_mode: 'inline', wrapper_pid: null, lifecycle: 'reported', ack_at: null, notify_count: 0 });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.notified_first).toBe(1);
    expect(getRun('r-inline-rep').notify_count).toBe(1);
  });
});

// ============================================================
// BR-G08 / BC-10: dispatching grace 兩臂
// ============================================================

describe('BR-G08: dispatching 幽靈的年齡規則(不進 4-Tuple)', () => {
  it('arm 1: started_at=now -> untouched, counted skipped_dispatch_grace', () => {
    seed({ run_id: 'r-disp-fresh', story_id: 'stJ', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stJ', lifecycle: 'dispatching', wrapper_pid: null, started_at: T0 });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.skipped_dispatch_grace).toBe(1);
    expect(getRun('r-disp-fresh').lifecycle).toBe('dispatching');
  });

  it('arm 2: started_at=now-600s -> marked abandoned with abandoned_at_stage=dispatching', () => {
    seed({ run_id: 'r-disp-stale', story_id: 'stK', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stK', lifecycle: 'dispatching', wrapper_pid: null, started_at: secondsBefore(T0, 600) });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    expect(report.abandoned).toBe(1);
    const row = getRun('r-disp-stale');
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('dispatching');
  });
});

// ============================================================
// BR-G09~G11: 催辦計數
// ============================================================

describe('BR-G09~G11: 催辦計數(首次 / 不重複 / 逾期 / 未逾期 / ack 後停)', () => {
  it('BR-G09: first tick sets notify_count=1; an immediately following tick does not double-count', () => {
    // wrapper_pid must be alive in the probe map, otherwise loop A (which also scans 'reported'
    // as a non-terminal lifecycle) would judge it DEAD via 4-Tuple tuple-1 and mark it abandoned
    // before loop B ever gets a chance to notify -- loop A and loop B run in the same fast tick.
    seed({ run_id: 'r-notify1', story_id: 'stL', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stL', lifecycle: 'reported', ack_at: null, notify_count: 0, wrapper_pid: 5001 });
    const probeFn = () => new Map([[5001, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\stL']]);
    tick({ mode: 'fast', config: baseCfg(), probeFn });
    expect(getRun('r-notify1').notify_count).toBe(1);
    tick({ mode: 'fast', config: baseCfg(), probeFn });
    expect(getRun('r-notify1').notify_count).toBe(1);
  });

  it('BR-G10: overdue last_notified_at (11min, interval=10) escalates notify_count 1->2; 4min does not', () => {
    seed({ run_id: 'r-esc', story_id: 'stM', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stM', lifecycle: 'reported', ack_at: null, notify_count: 1, last_notified_at: minutesBefore(T0, 11) });
    const r1 = tick({ mode: 'slow', config: baseCfg({ ackCheckIntervalMin: 10 }), probeFn: () => new Map() });
    expect(r1.notified_escalated).toBe(1);
    expect(getRun('r-esc').notify_count).toBe(2);

    seed({ run_id: 'r-noesc', story_id: 'stM2', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stM2', lifecycle: 'reported', ack_at: null, notify_count: 1, last_notified_at: minutesBefore(T0, 4) });
    const r2 = tick({ mode: 'slow', config: baseCfg({ ackCheckIntervalMin: 10 }), probeFn: () => new Map() });
    expect(getRun('r-noesc').notify_count).toBe(1);
  });

  it('BR-G11: once ack_at is set, neither fast nor slow tick touches notify_count again', () => {
    seed({ run_id: 'r-acked', story_id: 'stN', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stN', lifecycle: 'reported', ack_at: T0, notify_count: 2, last_notified_at: minutesBefore(T0, 20) });
    tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    tick({ mode: 'slow', config: baseCfg(), probeFn: () => new Map() });
    expect(getRun('r-acked').notify_count).toBe(2);
  });
});

// ============================================================
// BR-G13: 有效 scope 判準三臂(含 post-whp-4)
// ============================================================

describe('BR-G13: 判準鍵在「BR-G22 排除後的有效 scope」,非欄位 NULL-ness', () => {
  it('arm 1 (today): work_root=NULL, files_modified=NULL, started_at=-5h -> stall_rounds stays 0, skipped_no_scope', () => {
    seed({ run_id: 'r-arm1', story_id: 'stO', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stO', lifecycle: 'running', work_root: null, files_modified: null, started_at: minutesBefore(T0, 300) });
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn: () => null });
    expect(report.skipped_no_scope).toBe(1);
    expect(getRun('r-arm1').stall_rounds).toBe(0);
    expect(getRun('r-arm1').health_flag).toBeNull();
  });

  it('arm 2 (post-whp-4): work_root=project root, files_modified=NULL, started_at=-5h -> STILL stall_rounds=0', () => {
    seed({ run_id: 'r-arm2', story_id: 'stP', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stP', lifecycle: 'running', work_root: FAKE_CONTROL_ROOT, files_modified: null, started_at: minutesBefore(T0, 300) });
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn: () => null });
    expect(report.skipped_no_scope).toBe(1);
    expect(getRun('r-arm2').stall_rounds).toBe(0);
    expect(report.scope_work_root_excluded).toBe(1);
  });

  it('arm 3: files_modified non-empty -> evaluation proceeds normally (not skipped_no_scope)', () => {
    seed({
      run_id: 'r-arm3', story_id: 'stQ', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stQ', lifecycle: 'running',
      work_root: FAKE_CONTROL_ROOT, files_modified: JSON.stringify(['x.txt']), started_at: minutesBefore(T0, 300),
    });
    const mtimeFn = (p) => (p.endsWith('x.txt') ? Date.parse(T0) - 1000 : null); // fresh (1s old)
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(report.skipped_no_scope).toBe(0);
    expect(report.stall_reset).toBe(1);
  });
});

// ============================================================
// BR-G14~G16: 30/10/10 時序與判定
// ============================================================

describe('BR-G14~G16: T+30/+10 首檢閘門 + stall_rounds 遞增/重置 + 達門檻標旗', () => {
  it('BR-G14: 35min elapsed (< 40min gate) -> stall_rounds stays 0 (not yet due)', () => {
    seed({
      run_id: 'r-t35', story_id: 'stR', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stR', lifecycle: 'running',
      work_root: 'C:\\worktree\\stR', files_modified: null, started_at: minutesBefore(T0, 35), stall_rounds: 0,
    });
    tick({ mode: 'slow', config: baseCfg({ stallFirstCheckMin: 30, stallRecheckMin: 10 }), mtimeFn: () => null });
    expect(getRun('r-t35').stall_rounds).toBe(0);
  });

  it('BR-G14/G15: 41min elapsed (>= 40min gate) + stale scope -> stall_rounds becomes 1', () => {
    seed({
      run_id: 'r-t41', story_id: 'stS', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stS', lifecycle: 'running',
      work_root: 'C:\\worktree\\stS', files_modified: null, started_at: minutesBefore(T0, 41), stall_rounds: 0,
    });
    const report = tick({ mode: 'slow', config: baseCfg({ stallFirstCheckMin: 30, stallRecheckMin: 10 }), mtimeFn: () => null });
    expect(report.stall_incremented).toBe(1);
    expect(getRun('r-t41').stall_rounds).toBe(1);
  });

  it('BR-G15: fresh activity resets stall_rounds to 0 and clears health_flag', () => {
    seed({
      run_id: 'r-reset', story_id: 'stT', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stT', lifecycle: 'running',
      work_root: 'C:\\worktree\\stT', files_modified: null, started_at: minutesBefore(T0, 45), stall_rounds: 1, health_flag: 'stalled-suspect',
    });
    const mtimeFn = (p) => (p === 'C:\\worktree\\stT\\fresh.txt' ? Date.parse(T0) - 2 * 60000 : null);
    // simulate one fresh file existing under the worktree by injecting via files_modified instead
    // (avoids needing a real directory tree for this specific assertion)
    ctx.db.prepare("UPDATE worker_runs SET files_modified = ? WHERE run_id = 'r-reset'").run(JSON.stringify(['fresh.txt']));
    const report = tick({ mode: 'slow', config: baseCfg({ stallFirstCheckMin: 30, stallRecheckMin: 10 }), mtimeFn: (p) => (p.endsWith('fresh.txt') ? Date.parse(T0) - 2 * 60000 : null) });
    expect(report.stall_reset).toBe(1);
    const row = getRun('r-reset');
    expect(row.stall_rounds).toBe(0);
    expect(row.health_flag).toBeNull();
  });

  it('BR-G16: two consecutive stale slow ticks reach stallRoundsToFlag=2 -> health_flag set, lifecycle unchanged', () => {
    seed({
      run_id: 'r-flag', story_id: 'stU', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stU', lifecycle: 'running',
      work_root: 'C:\\worktree\\stU', files_modified: JSON.stringify(['a.txt']), started_at: minutesBefore(T0, 41), stall_rounds: 1,
    });
    const cfg = baseCfg({ stallFirstCheckMin: 30, stallRecheckMin: 10, stallRoundsToFlag: 2 });
    const report = tick({ mode: 'slow', config: cfg, mtimeFn: () => null });
    expect(report.stall_flagged).toBe(1);
    const row = getRun('r-flag');
    expect(row.stall_rounds).toBe(2);
    expect(row.health_flag).toBe('stalled-suspect');
    expect(row.requires_attention).toBe(1);
    expect(row.lifecycle).toBe('running');
  });
});

// ============================================================
// BR-G22~G24: G17 範圍限縮
// ============================================================

describe('BR-G22: work_root = 控制平面 root 時排除出 scope,worktree-local 時納入', () => {
  it('work_root=project root -> the walk never descends into it (mtimeFn only called for ipc_dir paths)', () => {
    const tmpIpc = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-ipc-'));
    fs.writeFileSync(path.join(tmpIpc, 'task.json'), '{}');
    seed({
      run_id: 'r-excl', story_id: 'stV', phase: 'dev-story', ipc_dir: tmpIpc, lifecycle: 'running',
      work_root: FAKE_CONTROL_ROOT, files_modified: null, started_at: minutesBefore(T0, 45),
    });
    const calledPaths = [];
    const mtimeFn = (p) => { calledPaths.push(p); return null; };
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(report.scope_work_root_excluded).toBe(1);
    for (const p of calledPaths) {
      expect(p.toLowerCase().startsWith(FAKE_CONTROL_ROOT.toLowerCase())).toBe(false);
    }
    fs.rmSync(tmpIpc, { recursive: true, force: true });
  });

  it('work_root=worktree path (differs from control root) -> IS walked', () => {
    const tmpWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-wt-'));
    fs.writeFileSync(path.join(tmpWorktree, 'src.txt'), 'x');
    seed({
      run_id: 'r-wt', story_id: 'stW', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stW-nonexistent', lifecycle: 'running',
      work_root: tmpWorktree, files_modified: null, started_at: minutesBefore(T0, 45),
    });
    let sawWorktreeFile = false;
    const mtimeFn = (p) => { if (p === path.join(tmpWorktree, 'src.txt')) sawWorktreeFile = true; return null; };
    tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(sawWorktreeFile).toBe(true);
    fs.rmSync(tmpWorktree, { recursive: true, force: true });
  });

  it('G17 cross-run isolation: two runs share work_root=project root with disjoint files_modified -- activity in A does not reset B\'s stall_rounds', () => {
    seed({
      run_id: 'r-A', story_id: 'stX-A', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stX-A', lifecycle: 'running',
      work_root: FAKE_CONTROL_ROOT, files_modified: JSON.stringify(['fileA.txt']), started_at: minutesBefore(T0, 45),
    });
    seed({
      run_id: 'r-B', story_id: 'stX-B', phase: 'dev-story', ipc_dir: 'C:\\ipc\\stX-B', lifecycle: 'running',
      work_root: FAKE_CONTROL_ROOT, files_modified: JSON.stringify(['fileB.txt']), started_at: minutesBefore(T0, 45), stall_rounds: 1,
    });
    // Only run A's file is "fresh"; run B's file is old/unreadable (mtimeFn returns null for it).
    const mtimeFn = (p) => (p.toLowerCase().endsWith('filea.txt') ? Date.parse(T0) - 1000 : null);
    tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(getRun('r-A').stall_rounds).toBe(0); // reset by its own fresh file
    expect(getRun('r-B').stall_rounds).toBe(2); // unaffected by run A's activity, its own scope is stale
  });
});

describe('BR-G23: 目錄排除 + cap + 早退 + 走訪順序防截斷反轉', () => {
  // BR-G13 gate 需要「有效 scope」才會進入走訪(files_modified 非空 或 work_root worktree-local)。
  // 這三個測試聚焦 ipc_dir 子樹走訪行為本身(排除規則/早退/cap),故用一個獨立、內容為空的
  // worktree-local work_root 純粹滿足 gate,不干擾 ipc_dir 走訪的呼叫計數斷言。
  it('node_modules is never descended into; mtimeFn never called for any path under it', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-nm-'));
    fs.mkdirSync(path.join(tmpRoot, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'node_modules', 'pkg', 'index.js'), 'x');
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src', 'y.js'), 'y');
    const gateWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-gate-'));
    seed({
      run_id: 'r-nm', story_id: 'stY', phase: 'dev-story', ipc_dir: tmpRoot, lifecycle: 'running',
      work_root: gateWorkRoot, files_modified: null, started_at: minutesBefore(T0, 45),
    });
    const calledPaths = [];
    const mtimeFn = (p) => { calledPaths.push(p); return null; };
    tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(calledPaths.some(p => p.includes('node_modules'))).toBe(false);
    expect(calledPaths.some(p => p.endsWith('y.js'))).toBe(true);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(gateWorkRoot, { recursive: true, force: true });
  });

  it('early-exits after exactly 1 mtimeFn call when the first file is recent', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-early-'));
    fs.writeFileSync(path.join(tmpRoot, 'a.txt'), 'a');
    const gateWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-gate-'));
    seed({
      run_id: 'r-early', story_id: 'stZ', phase: 'dev-story', ipc_dir: tmpRoot, lifecycle: 'running',
      work_root: gateWorkRoot, files_modified: null, started_at: minutesBefore(T0, 45),
    });
    let calls = 0;
    const mtimeFn = () => { calls++; return Date.parse(T0) - 60000; }; // 1min old, fresher than stallRecheckMin=10
    const report = tick({ mode: 'slow', config: baseCfg({ stallRecheckMin: 10 }), mtimeFn });
    expect(calls).toBe(1);
    expect(report.stall_reset).toBe(1);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(gateWorkRoot, { recursive: true, force: true });
  });

  it('a scope of 5000 stale files with cap=2000 -> at most 2000 calls, verdict stale, scope_truncated=true', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-cap-'));
    for (let i = 0; i < 2500; i++) fs.writeFileSync(path.join(tmpRoot, `f${i}.txt`), '');
    const gateWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-gate-'));
    seed({
      run_id: 'r-cap', story_id: 'st-cap', phase: 'dev-story', ipc_dir: tmpRoot, lifecycle: 'running',
      work_root: gateWorkRoot, files_modified: null, started_at: minutesBefore(T0, 45),
    });
    let calls = 0;
    const mtimeFn = () => { calls++; return null; }; // always stale/unreadable
    const report = tick({ mode: 'slow', config: baseCfg({ guardianScopeMaxFiles: 2000 }), mtimeFn });
    expect(calls).toBeLessThanOrEqual(2000);
    expect(report.scope_truncated).toBe(true);
    fs.rmSync(gateWorkRoot, { recursive: true, force: true });
    expect(getRun('r-cap').stall_rounds).toBe(1);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }, 20000);

  it('ordering arm: 5000 stale work_root files + 1 fresh files_modified entry, cap=2000 -> active with exactly 1 mtimeFn call', () => {
    const tmpWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-order-'));
    for (let i = 0; i < 2500; i++) fs.writeFileSync(path.join(tmpWorktree, `stale${i}.txt`), '');
    seed({
      run_id: 'r-order', story_id: 'st-order', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-order-nonexistent', lifecycle: 'running',
      work_root: tmpWorktree, files_modified: JSON.stringify(['fresh.txt']), started_at: minutesBefore(T0, 45),
    });
    let calls = 0;
    const mtimeFn = (p) => {
      calls++;
      return p.endsWith('fresh.txt') ? Date.parse(T0) - 1000 : null;
    };
    const report = tick({ mode: 'slow', config: baseCfg({ guardianScopeMaxFiles: 2000 }), mtimeFn });
    expect(calls).toBe(1);
    expect(report.stall_reset).toBe(1);
    expect(report.scope_truncated).toBe(false);
    fs.rmSync(tmpWorktree, { recursive: true, force: true });
  }, 20000);
});

describe('BR-G24: 路徑 confinement — 拒絕表外路徑,絕不 stat', () => {
  it('a relative escape and an unrelated absolute path are both rejected, never stat-ed', () => {
    seed({
      run_id: 'r-escape', story_id: 'st-esc', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-esc', lifecycle: 'running',
      work_root: 'C:\\worktree\\st-esc',
      files_modified: JSON.stringify(['../../../Windows/System32/drivers/etc/hosts', 'C:\\Windows\\win.ini']),
      started_at: minutesBefore(T0, 45),
    });
    const statedPaths = [];
    const mtimeFn = (p) => { statedPaths.push(p); return null; };
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    expect(report.scope_rejected_paths).toBe(2);
    expect(statedPaths.some(p => p.toLowerCase().includes('system32') || p.toLowerCase().includes('win.ini'))).toBe(false);
  });

  it('the walk function performs no content read/write/delete (static scan scoped to the walk functions only -- the CLI layer legitimately uses readFileSync to load pipeline-config.json, which is unrelated to BR-G24)', () => {
    const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'guardian-tick.js'), 'utf8');
    const startMarker = '// ---------- BR-G23/BR-G24: 指紋範圍走訪';
    const endMarker = '// ---------- Loop A(快 tick';
    const start = SOURCE.indexOf(startMarker);
    const end = SOURCE.indexOf(endMarker);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const walkSection = SOURCE.slice(start, end);
    expect(walkSection).not.toMatch(/readFileSync|writeFileSync|unlink|rmSync/);
  });
});

// ============================================================
// BR-G17 / BR-G20: 心跳 + 閒置退出
// ============================================================

describe('BR-G17: guardian_heartbeat 每輪快 tick upsert', () => {
  it('after a fast tick, exactly 1 heartbeat row exists with offset-aware last_beat_at and correct watched_runs', () => {
    seed({ run_id: 'r-hb1', story_id: 'st-hb', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-hb', lifecycle: 'running', wrapper_pid: 1, });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-hb']]) });
    const hb = getHeartbeat();
    expect(hb).toBeTruthy();
    expect(hb.last_beat_at).toMatch(/\+08:00$/);
    expect(hb.watched_runs).toBe(report.scanned);
    expect(hb.guardian_pid).toBe(55555);
  });
});

describe('BR-G20: 全 run 終態且閒置逾 guardianIdleExitMin -> idle_exit + guardian_pid 清 NULL', () => {
  it('with guardianIdleExitMin=0 and only terminal rows, idle_exit is recommended and guardian_pid is cleared; started_at/last_beat_at retained', () => {
    seed({ run_id: 'r-term', story_id: 'st-term', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-term', lifecycle: 'closed' });
    const report = tick({ mode: 'fast', config: baseCfg({ guardianIdleExitMin: 0 }), probeFn: () => new Map() });
    expect(report.idle_exit).toBe(true);
    const hb = getHeartbeat();
    expect(hb.guardian_pid).toBeNull();
    expect(hb.started_at).toBeTruthy();
    expect(hb.last_beat_at).toBeTruthy();
  });

  it('with active non-terminal runs present, idle_exit is never recommended even if idleExitMin=0', () => {
    seed({ run_id: 'r-active', story_id: 'st-active', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-active', lifecycle: 'running', wrapper_pid: 1 });
    const report = tick({ mode: 'fast', config: baseCfg({ guardianIdleExitMin: 0 }), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-active']]) });
    expect(report.idle_exit).toBe(false);
    expect(getHeartbeat().guardian_pid).toBe(55555);
  });

  it('BC-12: worker_runs is completely empty (today\'s actual state) -- idle timer STARTS on the first tick, does not fire immediately, even with a non-zero guardianIdleExitMin', () => {
    // Regression lock: this is the real, current state of the project (whp-4 has not landed yet,
    // so worker_runs genuinely has 0 rows). A naive "no historical activity -> already idle" reading
    // of BC-12 would make the guardian idle-exit on its very first tick, forever unable to stay
    // resident. The correct reading is "the idle countdown begins now" (anchored on the guardian's
    // own persisted started_at, not an immediate verdict).
    const cfg = baseCfg({ guardianIdleExitMin: 60 });
    const firstTick = tick({ mode: 'fast', config: cfg, probeFn: () => new Map() });
    expect(firstTick.idle_exit).toBe(false);
    expect(getHeartbeat().guardian_pid).toBe(55555);

    // 61 minutes later, still nothing in worker_runs -- NOW it should recommend idle-exit.
    const laterReport = guardianTick({ dbPath: ctx.dbPath, now: minutesAfter(T0, 61), mode: 'fast', config: cfg, probeFn: () => new Map() });
    expect(laterReport.idle_exit).toBe(true);
    expect(getHeartbeat().guardian_pid).toBeNull();
  });
});

// ============================================================
// BR-G18: 單例無條件宣告(PID-reuse 自癒)
// ============================================================

describe('BR-G18: guardian_heartbeat 寫入為無條件宣告(不以既存 guardian_pid 存活性為前提的 CAS)', () => {
  it('PID-reuse self-heal: a stale guardian_pid pointing to another live process is unconditionally overwritten', () => {
    // Simulate a prior guardian that crashed uncleanly, leaving a stale (now-reused) PID.
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, updated_at)
      VALUES (1, 99999, 'old-host', ?, ?, 30, 600, 0, ?)
    `).run(minutesBefore(T0, 120), minutesBefore(T0, 120), minutesBefore(T0, 120));
    // A live non-terminal run keeps idle-exit from firing, isolating this test to the PID-reuse
    // assertion only (idle-exit's own guardian_pid=NULL behaviour is covered separately by BR-G20).
    seed({ run_id: 'r-keepalive', story_id: 'st-keepalive', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-keepalive', lifecycle: 'running', wrapper_pid: 1 });

    const report = tick({ mode: 'fast', config: baseCfg({ guardianPid: 12345 }), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-keepalive']]) });
    const hb = getHeartbeat();
    expect(hb.guardian_pid).toBe(12345); // new guardian's PID unconditionally wins, no liveness CAS on old value
    expect(report.mode).toBe('fast');
  });

  it('started_at is set once and preserved across subsequent ticks (not refreshed every tick per BR-G17 field list)', () => {
    seed({ run_id: 'r-any', story_id: 'st-any', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-any', lifecycle: 'running', wrapper_pid: 1 });
    tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-any']]) });
    const firstStartedAt = getHeartbeat().started_at;
    const laterNow = minutesAfter(T0, 5);
    guardianTick({ dbPath: ctx.dbPath, now: laterNow, mode: 'fast', config: baseCfg(), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-any']]) });
    expect(getHeartbeat().started_at).toBe(firstStartedAt);
  });
});

// ============================================================
// BR-G25: stall 重置只清 health_flag,requires_attention 留給中控
// ============================================================

describe('BR-G25: stall 重置時 requires_attention 不清', () => {
  it('resetting a stall clears health_flag but leaves requires_attention set', () => {
    seed({
      run_id: 'r-clear', story_id: 'st-clear', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-clear', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['x.txt']), started_at: minutesBefore(T0, 45),
      stall_rounds: 2, health_flag: 'stalled-suspect', requires_attention: 1,
    });
    const mtimeFn = (p) => (p.endsWith('x.txt') ? Date.parse(T0) - 1000 : null);
    tick({ mode: 'slow', config: baseCfg(), mtimeFn });
    const row = getRun('r-clear');
    expect(row.health_flag).toBeNull();
    expect(row.stall_rounds).toBe(0);
    expect(row.requires_attention).toBe(1);
  });
});

// ============================================================
// BR-G19: fail-open
// ============================================================

describe('BR-G19: fail-open — probe 不可用 / DB 開不起來 / config 壞掉皆不視為死亡', () => {
  it('probeFn throwing -> probe_unavailable=true, 0 worker_runs rows modified, exit-equivalent (no throw)', () => {
    seed({ run_id: 'r-probe-fail', story_id: 'st-pf', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-pf', lifecycle: 'running', wrapper_pid: 1 });
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => { throw new Error('CIM unavailable'); } });
    expect(report.probe_unavailable).toBe(true);
    expect(report.abandoned).toBe(0);
    expect(getRun('r-probe-fail').lifecycle).toBe('running');
    expect(getHeartbeat().last_error).toMatch(/probe unavailable/);
  });

  it('DB cannot be opened -> WhpGuardianError WHP7-E01, nothing written', () => {
    expect(() => guardianTick({ dbPath: 'Z:\\nonexistent\\path\\phycool.db', mode: 'fast', config: baseCfg() }))
      .toThrow(WhpGuardianError);
  });

  it('a throwing step in slow mode still allows heartbeat-independent completion without crashing the process (fail-open at tick level)', () => {
    seed({
      run_id: 'r-walk-throw', story_id: 'st-wt', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-wt', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['y.txt']), started_at: minutesBefore(T0, 45),
    });
    const mtimeFn = () => { throw new Error('stat exploded'); };
    expect(() => tick({ mode: 'slow', config: baseCfg(), mtimeFn })).not.toThrow();
  });
});

// ============================================================
// BR-G21: 時間戳 offset-aware + 漏跑 tick 等價性
// ============================================================

describe('BR-G21: offset-aware timestamps + 漏跑 tick 等價性(不依賴本地計時器累加)', () => {
  it('every _at value written by a tick matches the +08:00 suffix', () => {
    seed({ run_id: 'r-ts', story_id: 'st-ts', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-ts', lifecycle: 'reported', ack_at: null, notify_count: 0, wrapper_pid: 5002 });
    tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map([[5002, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-ts']]) });
    const row = getRun('r-ts');
    expect(row.last_notified_at).toMatch(/\+08:00$/);
    expect(row.updated_at).toMatch(/\+08:00$/);
    expect(getHeartbeat().last_beat_at).toMatch(/\+08:00$/);
  });

  it('missed-tick equivalence: a guardian suspended for many nominal cadence cycles produces the same single-evaluation verdict as one barely past the gate -- no local tick-counter accumulation', () => {
    // guardianTick has no memory of "how many cycles it should have run" -- it only ever computes
    // (now - started_at) via DB timestamp subtraction. If it instead accumulated a local counter
    // (e.g. incrementing once per nominal guardianSlowTickSec interval that elapsed), a run whose
    // guardian was suspended for a long stretch would show an inflated stall_rounds proportional to
    // the missed cycle count. Both arms below are evaluated for the very first time (stall_rounds
    // starts at 0) -- the ONLY difference is how far past the gate started_at happens to be.
    const cfg = baseCfg({ stallFirstCheckMin: 30, stallRecheckMin: 10 });

    seed({
      run_id: 'r-barely-due', story_id: 'st-barely', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-barely', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['always-stale.txt']), started_at: minutesBefore(T0, 41), stall_rounds: 0,
    });
    seed({
      run_id: 'r-long-suspended', story_id: 'st-suspended', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-suspended', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['always-stale.txt']), started_at: minutesBefore(T0, 500), stall_rounds: 0,
    });

    guardianTick({ dbPath: ctx.dbPath, now: T0, mode: 'slow', config: cfg, mtimeFn: () => null });

    const barelyDue = getRun('r-barely-due').stall_rounds;
    const longSuspended = getRun('r-long-suspended').stall_rounds;
    expect(barelyDue).toBe(1);
    expect(longSuspended).toBe(1); // not 46 (= floor(459/10)) or any count tied to nominal missed cycles
  });
});

// ============================================================
// BC-09 / Loop E: 待審逾期(report-only)
// ============================================================

describe('BC-09: awaiting-review/approved 逾期 — 僅計入報告,不寫 DB', () => {
  it('an overdue awaiting-review row is counted but not modified', () => {
    seed({ run_id: 'r-overdue', story_id: 'st-ov', phase: 'code-review', ipc_dir: 'C:\\ipc\\st-ov', lifecycle: 'awaiting-review', updated_at: minutesBefore(T0, 45) });
    const before = getRun('r-overdue');
    const report = tick({ mode: 'slow', config: baseCfg({ reviewReminderMin: 30 }), mtimeFn: () => null });
    expect(report.awaiting_review_overdue).toBe(1);
    expect(getRun('r-overdue')).toEqual(before);
  });

  it('a fresh awaiting-review row is not counted as overdue', () => {
    seed({ run_id: 'r-fresh-review', story_id: 'st-fr', phase: 'code-review', ipc_dir: 'C:\\ipc\\st-fr', lifecycle: 'awaiting-review', updated_at: minutesBefore(T0, 5) });
    const report = tick({ mode: 'slow', config: baseCfg({ reviewReminderMin: 30 }), mtimeFn: () => null });
    expect(report.awaiting_review_overdue).toBe(0);
  });
});

// ============================================================
// AC11 / CLI: --dry-run 零寫入 + --help + --json shape
// ============================================================

describe('CLI: dry-run 零寫入 + --help + report shape', () => {
  it('--dry-run reports what would happen but writes nothing to worker_runs', () => {
    seed({ run_id: 'r-dry', story_id: 'st-dry', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-dry', lifecycle: 'running', wrapper_pid: 6000 });
    const report = tick({ mode: 'fast', dryRun: true, config: baseCfg(), probeFn: () => new Map() });
    expect(report.dry_run).toBe(true);
    expect(report.abandoned).toBe(1);
    expect(getRun('r-dry').lifecycle).toBe('running'); // 未寫入
  });

  it('--dry-run also skips the heartbeat write', () => {
    seed({ run_id: 'r-dry2', story_id: 'st-dry2', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-dry2', lifecycle: 'running', wrapper_pid: 1 });
    tick({ mode: 'fast', dryRun: true, config: baseCfg(), probeFn: () => new Map([[1, 'powershell.exe -File worker-dev.ps1 -IpcDir C:\\ipc\\st-dry2']]) });
    expect(getHeartbeat()).toBeUndefined();
  });

  it('--help via cliMain prints usage and returns exit code 0', () => {
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

  it('printUsage does not throw', () => {
    const orig = console.log;
    console.log = () => {};
    try {
      expect(() => printUsage()).not.toThrow();
    } finally {
      console.log = orig;
    }
  });

  it('report contains all §4.3.3 documented fields', () => {
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    for (const field of [
      'mode', 'scanned', 'alive', 'abandoned', 'notified_first', 'notified_escalated',
      'stall_incremented', 'stall_reset', 'stall_flagged', 'awaiting_review_overdue',
      'skipped_inline', 'skipped_dispatch_grace', 'skipped_no_scope', 'skipped_cas_lost',
      'scope_work_root_excluded', 'scope_rejected_paths', 'scope_truncated',
      'probe_unavailable', 'dry_run', 'generated_at',
    ]) {
      expect(report).toHaveProperty(field);
    }
  });
});

describe('resolveControlPlaneRoot', () => {
  it('resolves to a directory containing .claude when PIPELINE_CONTROL_ROOT is unset (repo root itself)', () => {
    const root = resolveControlPlaneRoot();
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(true);
  });
});

// ============================================================
// BR-G26: -Status read-only query  (CR F2 — previously the ONE rule with zero automated coverage)
// ============================================================

const STATUS_KEYS = ['guardian_pid', 'host', 'freshness_sec', 'watched_runs', 'last_error'];

describe('BR-G26: runStatusQuery — read-only, safe with or without a live guardian', () => {
  it('with NO heartbeat row: reports guardian_pid "(none)" and still returns every documented key', () => {
    const status = runStatusQuery(ctx.dbPath);
    expect(status.guardian_pid).toBe('(none)');
    for (const k of STATUS_KEYS) expect(status).toHaveProperty(k);
  });

  it('🔴 both branches expose an IDENTICAL key set — PowerShell Set-StrictMode -Version Latest throws on a missing property, so a shape divergence turns `-Status` from "prints status" into "throws"', () => {
    const emptyShape = Object.keys(runStatusQuery(ctx.dbPath)).sort();
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
      VALUES (1, 4242, 'test-host', ?, ?, 30, 600, 7, 'boom', ?)
    `).run(T0, T0, T0);
    const populatedShape = Object.keys(runStatusQuery(ctx.dbPath)).sort();
    expect(populatedShape).toEqual(emptyShape);
    expect(populatedShape).toEqual([...STATUS_KEYS].sort());
  });

  it('reports live values and a freshness computed by offset-aware subtraction (not a naive string swap)', () => {
    const recent = twTimestamp(Date.now() - 5000); // 5s ago, +08:00 offset-aware
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
      VALUES (1, 32208, 'SunDay1229-Home', ?, ?, 30, 600, 3, NULL, ?)
    `).run(recent, recent, recent);
    const status = runStatusQuery(ctx.dbPath);
    expect(status.guardian_pid).toBe(32208);
    expect(status.host).toBe('SunDay1229-Home');
    expect(status.watched_runs).toBe(3);
    expect(typeof status.freshness_sec).toBe('number');
    // 🔴 Regression lock for the AC8/spec-§1.4#6 defect: a `replace('+08:00','Z')`-style
    // comparison relabels Taiwan wall-clock as UTC and lands ~-28800s here, which would pass
    // any naive "< 60" assertion even for a guardian dead for hours. Bound it on BOTH sides.
    expect(status.freshness_sec).toBeGreaterThanOrEqual(0);
    expect(status.freshness_sec).toBeLessThan(120);
  });

  it('writes nothing — guardian_heartbeat.updated_at is byte-identical before and after', () => {
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
      VALUES (1, 1, 'h', ?, ?, 30, 600, 0, NULL, ?)
    `).run(T0, T0, T0);
    const before = getHeartbeat();
    runStatusQuery(ctx.dbPath);
    runStatusQuery(ctx.dbPath);
    expect(getHeartbeat()).toEqual(before);
  });
});

// ============================================================
// WHP7-E04: config unreadable / malformed  (CR F2 — the third fail-open arm the
// testing strategy claimed but never covered)
// ============================================================

describe('WHP7-E04: loadFileConfig', () => {
  it('a malformed config throws, so cliMain falls back to DEFAULT_CONFIG and records last_error instead of dying', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whp7-cfg-'));
    const bad = path.join(tmp, 'pipeline-config.json');
    fs.writeFileSync(bad, '{ "workerProtocol": { broken', 'utf8');
    expect(() => loadFileConfig(bad)).toThrow();
    const missing = path.join(tmp, 'does-not-exist.json');
    expect(() => loadFileConfig(missing)).toThrow();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('AC12 lock: the real pipeline-config.json carries this card\'s 9 keys, and none belonging to whp-10', () => {
    const real = path.join(resolveControlPlaneRoot(), 'scripts', 'pipeline-config.json');
    const wp = loadFileConfig(real);
    for (const k of [
      'guardianFastTickSec', 'guardianSlowTickSec', 'guardianIdleExitMin',
      'guardianDispatchGraceSec', 'guardianScopeMaxFiles',
      'stallFirstCheckMin', 'stallRecheckMin', 'stallRoundsToFlag', 'ackCheckIntervalMin',
    ]) {
      expect(wp).toHaveProperty(k);
    }
    // whp-8-report-ack-notify (2026-08-02) landed this key -- the seam this lock was written to
    // guard: ackEscalateAfterRounds is now a real config value (its owning card's L4 escalation
    // threshold), not merely absent-and-reserved. See pipeline-config.json's workerProtocol
    // _comment for the create-story misreading this correction is documenting.
    expect(wp).toHaveProperty('ackEscalateAfterRounds');
    expect(wp).not.toHaveProperty('reviewReminderMin'); // whp-10 owns it
  });
});

// ============================================================
// CR regression locks (F4 / F5 / F6)
// ============================================================

describe('CR F4: loop B runs before loop A, so a reported run whose window vanished still gets its first-notify counted', () => {
  it('reported + ack_at NULL + notify_count 0 + dead window -> notify_count becomes 1 AND the row is marked abandoned in the same fast tick', () => {
    seed({
      run_id: 'r-reported-gone', story_id: 'st-rg', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-rg',
      lifecycle: 'reported', ack_at: null, notify_count: 0, wrapper_pid: 7001,
    });
    // Empty proc map == the worker reported and then its window disappeared (user closed it,
    // crash, hibernate). Loop A judges it DEAD; loop B keys on lifecycle='reported'.
    const report = tick({ mode: 'fast', config: baseCfg(), probeFn: () => new Map() });
    const row = getRun('r-reported-gone');
    // 🔴 Before the fix loop A ran first, flipped lifecycle to 'abandoned', and loop B's
    // SELECT then found nothing -> notify_count stayed 0 forever and whp-8's escalation
    // ladder could never pick this un-acked report up. That is precisely the "回報有沒有人收"
    // black hole this card exists to close (spec §1.1 failure surface 2).
    expect(row.notify_count).toBe(1);
    expect(row.last_notified_at).toMatch(/\+08:00$/);
    expect(report.notified_first).toBe(1);
    // Loop A still does its job — the abandoned field set is unaffected by the reordering.
    expect(row.lifecycle).toBe('abandoned');
    expect(row.abandoned_at_stage).toBe('reported');
    expect(row.requires_attention).toBe(1);
    expect(report.abandoned).toBe(1);
  });
});

describe('CR F5: a slow tick that throws still records last_error on the accountability surface', () => {
  it('slow-mode failure lands in guardian_heartbeat.last_error without forging a heartbeat (last_beat_at / watched_runs untouched)', () => {
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
      VALUES (1, 999, 'h', ?, ?, 30, 600, 5, NULL, ?)
    `).run(T0, T0, T0);
    const beatBefore = getHeartbeat().last_beat_at;
    const watchedBefore = getHeartbeat().watched_runs;

    seed({
      run_id: 'r-slow-err', story_id: 'st-se', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-se', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['z.txt']), started_at: minutesBefore(T0, 45),
    });
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn: () => { throw new Error('stat exploded'); } });

    expect(report.last_error).toMatch(/stat exploded/);
    const hb = getHeartbeat();
    expect(hb.last_error).toMatch(/stat exploded/);
    expect(hb.last_beat_at).toBe(beatBefore);   // BR-G17: only a fast tick writes a heartbeat
    expect(hb.watched_runs).toBe(watchedBefore);
  });

  it('--dry-run never writes last_error either', () => {
    ctx.db.prepare(`
      INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
      VALUES (1, 999, 'h', ?, ?, 30, 600, 0, NULL, ?)
    `).run(T0, T0, T0);
    seed({
      run_id: 'r-slow-dry', story_id: 'st-sd', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-sd', lifecycle: 'running',
      work_root: null, files_modified: JSON.stringify(['z.txt']), started_at: minutesBefore(T0, 45),
    });
    tick({ mode: 'slow', dryRun: true, config: baseCfg(), mtimeFn: () => { throw new Error('stat exploded'); } });
    expect(getHeartbeat().last_error).toBeNull();
  });
});

describe('CR F6: BR-G22 path comparison is case-insensitive (Windows paths are)', () => {
  it('a work_root differing from the control-plane root ONLY by letter case is still excluded from the scope', () => {
    seed({
      run_id: 'r-case', story_id: 'st-case', phase: 'dev-story', ipc_dir: 'C:\\ipc\\st-case', lifecycle: 'running',
      work_root: FAKE_CONTROL_ROOT.toLowerCase(), files_modified: null, started_at: minutesBefore(T0, 300),
    });
    const calledPaths = [];
    const report = tick({ mode: 'slow', config: baseCfg(), mtimeFn: (p) => { calledPaths.push(p); return null; } });
    // 🔴 With a case-sensitive `!==` this repo-root work_root was judged "worktree-local",
    // pulling the whole repository into the fingerprint scope — every non-worktree run would
    // then share one scope and stalls become undetectable by construction (the exact G17
    // pollution BR-G22 exists to prevent). Same defect class as whp-3 CR F2 in judgeLiveness.
    expect(report.scope_work_root_excluded).toBe(1);
    expect(report.skipped_no_scope).toBe(1);
    expect(getRun('r-case').stall_rounds).toBe(0);
    for (const p of calledPaths) {
      expect(p.toLowerCase().startsWith(FAKE_CONTROL_ROOT.toLowerCase())).toBe(false);
    }
  });
});
