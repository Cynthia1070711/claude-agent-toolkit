// ============================================================
// [whp-6-directive-delivery-and-close] 關窗前置檢查 + 4-Tuple 判活 + CAS 終態寫入
//
// DD-1(Spec §7):C2(五項前置)/ C3(判活 + 分支)/ C4(CAS 寫入)必須是同一原子單位且必須
// 複用 judgeLiveness() —— 在 PowerShell 重寫 WMI cmdline 比對會產生第二套與 reaper 漂移
// 的判活。close-worker.ps1(PowerShell)只做「只有 PowerShell 能做的事」:C1 入口 /
// C5 taskkill / C6 有界確認 / C7 成功輸出 / C8 -DryRun 顯示。
//
// checkClosePreconditions() 與 closeWorkerRun() 皆為純函式(不呼叫 process.exit),
// 供 CLI 層與測試各自呼叫。
// ============================================================
// 使用方式:
//   node close-worker-ops.js --run-id <uuid> [--caller-track <track>] [--override]
//     [--override-reason <text>] [--force] [--dry-run] [--db <path>]
// Exit codes: 0=成功關閉(含 already-closed / dry-run) / 1=CAS 落空(WHP6-E04)
//             2=前置未過(WHP6-E01/E02/E03/E05)
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';
import { judgeLiveness, probeLiveProcesses } from './reap-worker-runs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

function openDb(dbPath) {
  const db = new Database(dbPath || DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * C2: 五項前置(is-not-inline + 4 項),零副作用(BR-024/BR-038)。
 * @returns {{ok:boolean, code:string|null, notFound:boolean, failedChecks:string[], run:object|null}}
 */
export function checkClosePreconditions(runId, opts = {}) {
  const { dbPath, callerTrack = '', override = false, overrideReason = '' } = opts;
  const db = openDb(dbPath);
  try {
    const run = db.prepare('SELECT * FROM worker_runs WHERE run_id=?').get(runId);
    if (!run) {
      return { ok: false, code: 'WHP6-E02', notFound: true, failedChecks: [], run: null };
    }

    // whp-9 parity (Spec Phase 5): inline runs never route through this script -- gateWorkerRun
    // already drives them straight to closed. Checked in isolation from the other 4 (BR-037/AC13).
    if (run.run_mode === 'inline') {
      return { ok: false, code: 'WHP6-E05', notFound: false, failedChecks: ['run-mode-inline'], run };
    }

    const failedChecks = [];
    if (run.lifecycle !== 'approved') failedChecks.push('lifecycle');
    if (!run.ack_at) failedChecks.push('ack_at');
    // Independent evidence check against worker_handoffs -- whp-5's gateWorkerRun writes
    // worker_runs.lifecycle and worker_handoffs.gate_result in the same transaction, but this
    // script does not assume that invariant always held; it re-verifies from the handoff row.
    const handoff = db.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id=?').get(runId);
    if (!handoff || handoff.gate_result === 'pending') failedChecks.push('gate_result');
    const effectiveTrack = callerTrack || run.controller_track;
    if (effectiveTrack !== run.controller_track && !(override && overrideReason)) {
      failedChecks.push('controller_track');
    }

    if (failedChecks.length > 0) {
      return { ok: false, code: 'WHP6-E01', notFound: false, failedChecks, run };
    }
    return { ok: true, code: null, notFound: false, failedChecks: [], run };
  } finally {
    db.close();
  }
}

/**
 * C3 + C4 combined (DD-1 atomic unit): 4-Tuple 判活 → 3 分支之一。
 * Branch 1 (PID already dead: not-registered / window-gone) → CAS closed/UserClosed(closed_at 留 NULL,
 *   BR-026)。Branch 2 (pid-reused / cmdline-mismatch) → ABORT,零寫入零殺(BR-027)。Branch 3 (alive)
 *   → CAS closed/ControllerAfterHandshake(或 -Force 時 ControllerForce)寫在 taskkill 之前(BR-028/BR-035),
 *   CAS 0 列 = precheck 與此刻之間 lifecycle 已被推進 → cas-lost(BR-029)。
 * @param {{dbPath?, probeFn?, dryRun?, force?, now?}} opts
 * @returns {{outcome:string, code?:string, wrapper_pid?:number, closed_at?:string, reason?:string}}
 */
export function closeWorkerRun(runId, opts = {}) {
  const { dbPath, probeFn = probeLiveProcesses, dryRun = false, force = false, now = getTaiwanTimestamp() } = opts;
  const db = openDb(dbPath);
  try {
    const run = db.prepare('SELECT * FROM worker_runs WHERE run_id=?').get(runId);
    if (!run) return { outcome: 'not-found', code: 'WHP6-E02' };

    let liveProcMap;
    try {
      liveProcMap = probeFn();
    } catch (err) {
      // Probe failure is not evidence of death. Unlike the rest of the chain (which fails open),
      // close is the one path that must fail CLOSED (SDD BC-12) -- the caller turns this into
      // exit 2 and performs no kill, rather than guessing liveness from a failed probe.
      return { outcome: 'probe-unavailable', code: 'WHP6-E07', message: err.message };
    }

    const verdict = judgeLiveness(run, liveProcMap);
    const alreadyDead = !verdict.alive && (verdict.reason === 'not-registered' || verdict.reason === 'window-gone');
    const reused = !verdict.alive && !alreadyDead;

    if (alreadyDead) {
      if (dryRun) return { outcome: 'dry-run-already-closed', wrapper_pid: run.wrapper_pid };
      const info = db.prepare(`
        UPDATE worker_runs
        SET lifecycle='closed', close_source='UserClosed', closed_detected_at=@now, updated_at=@now
        WHERE run_id=@run_id AND lifecycle='approved'
      `).run({ run_id: runId, now });
      if (info.changes === 0) return { outcome: 'cas-lost', code: 'WHP6-E04' };
      // close_source echoed back so callers (close-worker.ps1) display what Node actually wrote
      // rather than hard-coding the literal themselves (keeps 'UserClosed' out of the .ps1 source).
      return { outcome: 'already-closed', wrapper_pid: run.wrapper_pid, close_source: 'UserClosed' };
    }

    if (reused) {
      return { outcome: 'pid-reused', code: 'WHP6-E03', reason: verdict.reason };
    }

    // Branch 3: genuinely alive. CAS write happens BEFORE the caller (close-worker.ps1) sends
    // taskkill -- if this process dies between the CAS commit and the kill, the guardian would
    // otherwise mark a normal close as 'abandoned' (dev_notes 高風險點 #2). -DryRun stops here.
    if (dryRun) return { outcome: 'dry-run-alive', wrapper_pid: run.wrapper_pid };
    const closeSource = force ? 'ControllerForce' : 'ControllerAfterHandshake';
    const info = db.prepare(`
      UPDATE worker_runs
      SET lifecycle='closed', close_source=@close_source, closed_at=@now, updated_at=@now
      WHERE run_id=@run_id AND lifecycle='approved'
    `).run({ run_id: runId, close_source: closeSource, now });
    if (info.changes === 0) return { outcome: 'cas-lost', code: 'WHP6-E04' };
    return { outcome: 'alive-closed', wrapper_pid: run.wrapper_pid, closed_at: now, close_source: closeSource };
  } finally {
    db.close();
  }
}

// ---------- CLI 入口 ----------

export function parseArgs(argv) {
  const out = {
    runId: null, callerTrack: '', override: false, overrideReason: '',
    force: false, dryRun: false, dbPath: null, error: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run-id') { out.runId = argv[++i]; }
    else if (a === '--caller-track') { out.callerTrack = argv[++i]; }
    else if (a === '--override') { out.override = true; }
    else if (a === '--override-reason') { out.overrideReason = argv[++i]; }
    else if (a === '--force') { out.force = true; }
    else if (a === '--dry-run') { out.dryRun = true; }
    else if (a === '--db') { out.dbPath = argv[++i]; }
    else { out.error = `未知參數: ${a}`; return out; }
  }
  if (!out.runId) { out.error = '缺少必填參數 --run-id'; }
  return out;
}

export function cliMain(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.log(JSON.stringify({ ok: false, code: 'WHP6-E08', message: args.error }));
    return 2;
  }

  const dbOpts = { dbPath: args.dbPath };
  const pre = checkClosePreconditions(args.runId, {
    ...dbOpts, callerTrack: args.callerTrack, override: args.override, overrideReason: args.overrideReason,
  });
  if (!pre.ok) {
    console.log(JSON.stringify({
      ok: false, code: pre.code, notFound: pre.notFound, failedChecks: pre.failedChecks, run_id: args.runId,
    }));
    return 2;
  }

  const result = closeWorkerRun(args.runId, { ...dbOpts, dryRun: args.dryRun, force: args.force });
  // PowerShell callers run under Set-StrictMode -- every key close-worker.ps1 ever reads off this
  // object must always be present (even when null/empty) or `$result.xxx` throws "property cannot
  // be found" for whichever outcome branch didn't happen to set it. `...result` overrides these
  // defaults when the outcome did set a real value.
  console.log(JSON.stringify({
    ok: !result.code, run_id: args.runId,
    code: null, close_source: null, closed_at: null, failedChecks: [], wrapper_pid: null, reason: null, message: null,
    ...result,
  }));
  // WHP6-E02 included: closeWorkerRun re-reads the row, so a run deleted between the precheck and
  // here lands on outcome='not-found'. Without it that path returned exit 0 while the JSON said
  // ok:false -- a direct `node close-worker-ops.js` caller would read success (CR 2026-08-01).
  if (result.code === 'WHP6-E02' || result.code === 'WHP6-E03' || result.code === 'WHP6-E07') return 2;
  if (result.code === 'WHP6-E04') return 1;
  return 0;
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  process.exit(cliMain(process.argv.slice(2)));
}
