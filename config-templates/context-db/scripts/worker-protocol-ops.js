// ============================================================
// [whp-5-message-bus-mcp] Message bus + execution-right CAS ops
// Four operations behind `.context-db/server.js`'s thin MCP handlers:
//   searchWorkerRuns / ackWorkerRun / gateWorkerRun / addWorkerMessage
//
// Placement decision (SDD Spec §4.1): `server.js` cannot be imported by
// tests without dragging in the embedder stack, so all CAS logic lives
// here as a plain ESM module instead. `server.js` supplies `onWrite`
// (its existing `appendLedger`) as an injected callback — this module
// never imports server.js and never touches the ledger directly.
//
// LIFECYCLES / CLOSE_SOURCES are imported from upsert-worker-run.js,
// never re-declared (that file's header names whp-5 as a downstream
// consumer of its exports).
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';
import { LIFECYCLES, CLOSE_SOURCES } from './upsert-worker-run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

export const VERDICTS = new Set(['approved', 'revise', 'rejected']);

export const MSG_TYPES_BY_DIRECTION = {
  'controller-to-worker': new Set(['verdict-approved', 'revise', 'wake', 'probe', 'answer', 'close']),
  'worker-to-controller': new Set(['progress', 'blocker', 'question', 'report']),
};

const DIRECTIONS = new Set(Object.keys(MSG_TYPES_BY_DIRECTION));

// Referenced so `LIFECYCLES` / `CLOSE_SOURCES` are demonstrably consumed
// (both are the enum SSoT for worker_runs.lifecycle / close_source; this
// module writes values drawn from them rather than re-declaring the sets).
void LIFECYCLES;
void CLOSE_SOURCES;

function openDb(dbPath) {
  const db = new Database(dbPath || DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Validation-tier failure — maps to MCP isError:true at the thin handler (WHP5-E01/E02/E03). */
function validationError(code, reason) {
  return { ok: false, isError: true, code, reason };
}

/** CAS-tier rejection — a legitimate zero-row outcome, never isError (BR-031). */
function casRejection(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

/** BR-032: audit callback never blocks the main flow, and never fires on a failed/rejected call. */
function safeOnWrite(onWrite, table, op, data) {
  if (typeof onWrite !== 'function') return;
  try { onWrite(table, op, data); } catch { /* ledger failure must never fail the call */ }
}

function isSqliteBusy(err) {
  return !!err && (err.code === 'SQLITE_BUSY' || /SQLITE_BUSY/.test(err.message || ''));
}

/** Default synchronous backoff (better-sqlite3 has no async API). Tests inject a no-op. */
function blockingSleep(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

// ============================================================
// searchWorkerRuns — read-only (BR-001~BR-006, BR-037, BR-038)
// ============================================================

/**
 * @param {object} args
 * @param {{dbPath?: string}} [opts] — no `onWrite`: this op never emits (BR-006/BR-032).
 */
export function searchWorkerRuns(args = {}, opts = {}) {
  const { dbPath } = opts;
  const { story_id, phase, lifecycle, controller_track, run_mode, requires_attention, pending_ack, include_messages, limit } = args;

  const db = openDb(dbPath);
  try {
    const where = [];
    const params = {};

    if (pending_ack) {
      // BR-004/BR-001a: this shape is the one verified (SDD §9 V14) to hit
      // ix_worker_runs_pending_ack. Do not "unify" this with the general
      // updated_at DESC ordering below — see T-S06's negative control.
      //
      // `lifecycle` is deliberately NOT combined here: pending_ack already pins it
      // to 'reported', and adding a second lifecycle predicate changes the query
      // shape enough to lose the partial index. Documented as mutually exclusive
      // in the tool's inputSchema (server.js `pending_ack` description).
      where.push("lifecycle = 'reported'", 'ack_at IS NULL');
    } else if (lifecycle) {
      const list = Array.isArray(lifecycle)
        ? lifecycle
        : String(lifecycle).split(',').map(s => s.trim()).filter(Boolean);
      if (list.length === 1) {
        where.push('lifecycle = @lifecycle');
        params.lifecycle = list[0];
      } else if (list.length > 1) {
        const placeholders = list.map((_, i) => `@lifecycle_${i}`);
        list.forEach((v, i) => { params[`lifecycle_${i}`] = v; });
        where.push(`lifecycle IN (${placeholders.join(', ')})`);
      }
    }

    if (story_id) { where.push('story_id = @story_id'); params.story_id = story_id; }
    if (phase) { where.push('phase = @phase'); params.phase = phase; }
    if (controller_track) { where.push('controller_track = @controller_track'); params.controller_track = controller_track; }
    if (run_mode) { where.push('run_mode = @run_mode'); params.run_mode = run_mode; }
    if (requires_attention !== undefined) {
      where.push('requires_attention = @requires_attention');
      params.requires_attention = requires_attention ? 1 : 0;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const cappedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const orderSql = pending_ack ? 'ORDER BY reported_at ASC' : 'ORDER BY updated_at DESC';
    params.limit = cappedLimit;

    const runs = db.prepare(`SELECT * FROM worker_runs ${whereSql} ${orderSql} LIMIT @limit`).all(params);

    if (include_messages && runs.length > 0) {
      // BR-038: exactly one batched statement, never one query per run.
      const runIds = runs.map(r => r.run_id);
      const msgParams = {};
      const placeholders = runIds.map((id, i) => { msgParams[`rid_${i}`] = id; return `@rid_${i}`; });
      const messages = db.prepare(
        `SELECT * FROM worker_messages WHERE run_id IN (${placeholders.join(', ')}) ORDER BY seq ASC`
      ).all(msgParams);
      const byRun = new Map();
      for (const m of messages) {
        if (!byRun.has(m.run_id)) byRun.set(m.run_id, []);
        byRun.get(m.run_id).push(m);
      }
      for (const r of runs) r.messages = byRun.get(r.run_id) || [];
    }

    return { runs, count: runs.length };
  } finally {
    db.close();
  }
}

// ============================================================
// ackWorkerRun — controller sign-off (BR-007~BR-010)
// ============================================================

/** @param {{dbPath?: string, onWrite?: Function}} [opts] */
export function ackWorkerRun(args = {}, opts = {}) {
  const { dbPath, onWrite } = opts;
  const { run_id, ack_by } = args;

  if (!run_id) return validationError('WHP5-E01', '缺少必填參數 run_id');
  if (!ack_by) return validationError('WHP5-E01', '缺少必填參數 ack_by(不得為空字串)');

  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();
    const info = db.prepare(
      `UPDATE worker_runs SET lifecycle='awaiting-review', ack_at=@now, ack_by=@ack_by, updated_at=@now
       WHERE run_id=@run_id AND lifecycle='reported'`
    ).run({ run_id, ack_by, now });

    if (info.changes === 0) {
      const current = db.prepare('SELECT lifecycle, ack_at, ack_by FROM worker_runs WHERE run_id=?').get(run_id);
      if (!current) return validationError('WHP5-E03', `run_id "${run_id}" 不存在`);
      if (current.ack_at) {
        return casRejection(`run ${run_id} 已於 ${current.ack_at} 由 ${current.ack_by} 確認`, { run_id, current });
      }
      return casRejection(`run ${run_id} 目前 lifecycle='${current.lifecycle}',非 'reported',尚無法簽收`, { run_id, current });
    }

    safeOnWrite(onWrite, 'worker_runs', 'ack', { run_id, ack_by, ack_at: now });
    return { ok: true, run_id, lifecycle: 'awaiting-review', ack_at: now, ack_by };
  } finally {
    db.close();
  }
}

// ============================================================
// gateWorkerRun — controller verdict (BR-011~BR-021, BR-039)
// ============================================================

/** @param {{dbPath?: string, onWrite?: Function}} [opts] */
export function gateWorkerRun(args = {}, opts = {}) {
  const { dbPath, onWrite } = opts;
  const { run_id, verdict, gate_by, gate_notes, next_phase, controller_track, override, override_reason } = args;

  if (!run_id) return validationError('WHP5-E01', '缺少必填參數 run_id');
  if (!gate_by) return validationError('WHP5-E01', '缺少必填參數 gate_by');
  if (!verdict) return validationError('WHP5-E01', '缺少必填參數 verdict');
  if (!VERDICTS.has(verdict)) {
    return validationError('WHP5-E02', `verdict 必為 ${[...VERDICTS].join('/')} 之一,收到 "${verdict}"`);
  }
  if (verdict === 'revise' && !gate_notes) {
    return validationError('WHP5-E01', "verdict='revise' 時 gate_notes 為必填(將成為指示訊息 body)");
  }

  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();

    // Guard order matters (SDD §4.4): each failure must be distinguishable
    // and must not have attempted the checks after it.
    //
    // All guard reads run INSIDE the same BEGIN IMMEDIATE transaction as the
    // writes. A guard read outside the transaction would observe an earlier
    // snapshot than the handoff CAS commits against, and `worker_runs` has a
    // live concurrent writer today (`reap-worker-runs.js` sets
    // lifecycle='abandoned'), so a stale `lifecycle`/`ack_at` read could let a
    // gate overwrite a state the guard never actually saw.
    const txn = db.transaction(() => {
      const run = db.prepare('SELECT * FROM worker_runs WHERE run_id=?').get(run_id);
      if (!run) return { reject: validationError('WHP5-E03', `run_id "${run_id}" 不存在`) };

      if (!run.ack_at) {
        return {
          reject: casRejection(`run ${run_id} 尚未簽收(ack_at IS NULL),必須先 ack_worker_run`, {
            run_id, current: { lifecycle: run.lifecycle, ack_at: null },
          }),
        };
      }
      if (run.lifecycle !== 'awaiting-review') {
        return {
          reject: casRejection(`run ${run_id} 目前 lifecycle='${run.lifecycle}',非 'awaiting-review',無法裁決`, {
            run_id, current: { lifecycle: run.lifecycle, ack_at: run.ack_at },
          }),
        };
      }

      const callerTrack = controller_track || run.controller_track;
      if (callerTrack !== run.controller_track) {
        if (!override || !override_reason) {
          return {
            reject: casRejection(
              `run ${run_id} 屬 controller_track='${run.controller_track}',呼叫端為 '${callerTrack}',跨軌裁決須 override:true 且非空 override_reason`,
              { run_id, current: { controller_track: run.controller_track } }
            ),
          };
        }
      }

      const handoff = db.prepare('SELECT run_id FROM worker_handoffs WHERE run_id=?').get(run_id);
      if (!handoff) {
        // BR-039: distinct from BR-012's "already decided" — no production path writes
        // worker_handoffs before whp-4, so this is the common case in that window, not
        // an anomaly. current.gate_result must read null, not a fabricated all-NULL verdict.
        return {
          reject: casRejection(`run ${run_id} 尚無交接證據列(worker_handoffs 無此列)—— 寫入端由 whp-4 承接,非已被裁決`, {
            run_id, current: { gate_result: null },
          }),
        };
      }

      let newLifecycle;
      let inlineClose = null;
      if (verdict === 'approved') {
        if (run.run_mode === 'inline') {
          newLifecycle = 'closed';
          inlineClose = { close_source: 'ControllerAfterHandshake', closed_at: now };
        } else {
          newLifecycle = 'approved';
        }
      } else if (verdict === 'revise') {
        newLifecycle = 'revising';
      } else {
        newLifecycle = 'failed';
      }

      // BR-016 (Gap 1 / whp-11): revise is a mid-loop verdict, not terminal — reset
      // gate_result back to 'pending' so a second round can be gated again. approved/
      // rejected keep the literal verdict (BR-019). The re-gate race this reset might
      // appear to reopen is already closed by the `run.lifecycle !== 'awaiting-review'`
      // guard above: a revise verdict also drives worker_runs.lifecycle to 'revising'
      // in this same transaction, so any immediate re-gate attempt is rejected there
      // before it ever reaches this UPDATE, regardless of gate_result's value (BR-017).
      // Mirrors tools/dev-console/server/services/workerRunService.ts on the approved/revise
      // subset only (G25 parity — that DevConsole path independently reached the same
      // semantics). 'rejected' has no DevConsole counterpart (workerRunService accepts only
      // approved/revise and 400s the rest), so parity claims do not extend to it: here it
      // stamps gate_result='rejected' + lifecycle='failed' (whp-11 CR calibration).
      const gateResultValue = verdict === 'revise' ? 'pending' : verdict;
      const handoffInfo = db.prepare(
        `UPDATE worker_handoffs SET gate_result=@gate_result, gate_by=@gate_by, gate_notes=@gate_notes,
           override_reason=@override_reason, gate_at=@now, next_phase=@next_phase, updated_at=@now
         WHERE run_id=@run_id AND gate_result='pending'`
      ).run({
        run_id, gate_result: gateResultValue, gate_by,
        gate_notes: gate_notes ?? null,
        override_reason: override_reason ?? null,
        next_phase: next_phase ?? null,
        now,
      });

      if (handoffInfo.changes === 0) {
        const current = db.prepare('SELECT gate_result, gate_by, gate_at FROM worker_handoffs WHERE run_id=?').get(run_id);
        return {
          reject: casRejection(`run ${run_id} 已於 ${current.gate_at} 由 ${current.gate_by} 裁決為 '${current.gate_result}'`, {
            run_id, current,
          }),
        };
      }

      if (verdict === 'revise') {
        db.prepare(
          `UPDATE worker_runs SET lifecycle=@lifecycle, reported_at=NULL, ack_at=NULL, ack_by=NULL,
             notify_count=0, updated_at=@now WHERE run_id=@run_id`
        ).run({ run_id, lifecycle: newLifecycle, now });
      } else if (inlineClose) {
        db.prepare(
          `UPDATE worker_runs SET lifecycle=@lifecycle, close_source=@close_source, closed_at=@closed_at,
             updated_at=@now WHERE run_id=@run_id`
        ).run({ run_id, lifecycle: newLifecycle, close_source: inlineClose.close_source, closed_at: inlineClose.closed_at, now });
      } else {
        db.prepare(`UPDATE worker_runs SET lifecycle=@lifecycle, updated_at=@now WHERE run_id=@run_id`)
          .run({ run_id, lifecycle: newLifecycle, now });
      }

      let messageSeq = null;
      if (verdict === 'approved' || verdict === 'revise') {
        const seqRow = db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM worker_messages WHERE run_id=?').get(run_id);
        messageSeq = seqRow.next_seq;
        const msgType = verdict === 'approved' ? 'verdict-approved' : 'revise';
        const body = verdict === 'revise' ? gate_notes : 'Verdict: approved';
        db.prepare(
          `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at)
           VALUES (@run_id, @seq, 'controller-to-worker', @msg_type, @body, @author, 'pending', @now)`
        ).run({ run_id, seq: messageSeq, msg_type: msgType, body, author: gate_by, now });
      }

      return { messageSeq, newLifecycle };
    });

    // .immediate() takes the write lock up front, so the guard reads above cannot
    // be invalidated by a concurrent writer between read and write (a deferred
    // transaction would start read-only and only upgrade at the first UPDATE).
    const result = txn.immediate();

    if (result.reject) return result.reject;

    safeOnWrite(onWrite, 'worker_handoffs', 'gate', {
      run_id, verdict, gate_by,
      gate_notes: gate_notes ?? null,
      next_phase: next_phase ?? null,
      override_reason: override_reason ?? null,
    });
    return { ok: true, run_id, gate_result: verdict, lifecycle: result.newLifecycle, message_seq: result.messageSeq };
  } finally {
    db.close();
  }
}

// ============================================================
// addWorkerMessage — directive / wake / answer (BR-022~BR-029)
// ============================================================

/**
 * @param {{dbPath?: string, onWrite?: Function, sleepFn?: Function, onRetry?: Function, _simulateBusyAttempts?: number}} [opts]
 *   `sleepFn`/`onRetry`/`_simulateBusyAttempts` exist purely so BR-023's retry path is
 *   assertable without wall-clock timing (SDD §2.4 validation column) — production
 *   callers never pass them.
 */
export function addWorkerMessage(args = {}, opts = {}) {
  const { dbPath, onWrite, sleepFn, onRetry, _simulateBusyAttempts = 0 } = opts;
  const { run_id, msg_type, body, author, mode, direction = 'controller-to-worker' } = args;

  if (!run_id) return validationError('WHP5-E01', '缺少必填參數 run_id');
  if (!msg_type) return validationError('WHP5-E01', '缺少必填參數 msg_type');
  if (!body) return validationError('WHP5-E01', '缺少必填參數 body');
  if (!author) return validationError('WHP5-E01', '缺少必填參數 author');
  if (mode !== 'append' && mode !== 'replace') {
    return validationError('WHP5-E01', '缺少必填參數 mode — 必須明示 "append"(追加)或 "replace"(取代),無預設值');
  }
  if (!DIRECTIONS.has(direction)) {
    return validationError('WHP5-E02', `direction 必為 ${[...DIRECTIONS].join('/')} 之一`);
  }
  const legalTypes = MSG_TYPES_BY_DIRECTION[direction];
  if (!legalTypes.has(msg_type)) {
    const otherDirection = direction === 'controller-to-worker' ? 'worker-to-controller' : 'controller-to-worker';
    const belongsToOther = MSG_TYPES_BY_DIRECTION[otherDirection].has(msg_type);
    const reason = belongsToOther
      ? `msg_type "${msg_type}" 屬於 '${otherDirection}' 方向,'${direction}' 方向合法值為:${[...legalTypes].join(', ')}`
      : `msg_type "${msg_type}" 非合法值,'${direction}' 方向合法值為:${[...legalTypes].join(', ')}`;
    return validationError('WHP5-E02', reason);
  }

  const db = openDb(dbPath);
  try {
    const run = db.prepare('SELECT run_id FROM worker_runs WHERE run_id=?').get(run_id);
    if (!run) return validationError('WHP5-E03', `run_id "${run_id}" 不存在`);

    let busySimRemaining = _simulateBusyAttempts;

    const doWrite = db.transaction(() => {
      if (busySimRemaining > 0) {
        busySimRemaining--;
        const e = new Error('SQLITE_BUSY: simulated for retry test');
        e.code = 'SQLITE_BUSY';
        throw e;
      }

      const warnings = [];
      const superseded = [];
      if (mode === 'replace') {
        // Scoped to the *new* message's own direction. BR-025 only describes the
        // controller-to-worker case (the schema default), which this still satisfies;
        // hard-coding that literal would let a worker-to-controller replace silently
        // withdraw the controller's pending directives.
        const existing = db.prepare(
          `SELECT msg_id, state FROM worker_messages WHERE run_id=@run_id AND direction=@direction AND state IN ('pending','delivered')`
        ).all({ run_id, direction });
        for (const row of existing) {
          if (row.state === 'pending') {
            db.prepare(`UPDATE worker_messages SET state='superseded' WHERE msg_id=?`).run(row.msg_id);
            superseded.push(row.msg_id);
          } else {
            warnings.push(`msg_id=${row.msg_id} 已送達(delivered),無法撤回,請發新指示`);
          }
        }
      }

      const seqRow = db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM worker_messages WHERE run_id=?').get(run_id);
      const seq = seqRow.next_seq;
      const now = getTaiwanTimestamp();
      const info = db.prepare(
        `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at)
         VALUES (@run_id, @seq, @direction, @msg_type, @body, @author, 'pending', @now)`
      ).run({ run_id, seq, direction, msg_type, body, author, now });

      return { msg_id: Number(info.lastInsertRowid), seq, warnings, superseded };
    });

    const sleep = sleepFn || blockingSleep;
    const notifyRetry = onRetry || (() => {});
    const delays = [200, 400, 600];

    let outcome;
    let attempt = 0;
    for (;;) {
      try {
        outcome = doWrite.immediate();
        break;
      } catch (err) {
        if (isSqliteBusy(err) && attempt < delays.length) {
          notifyRetry(attempt, delays[attempt]);
          sleep(delays[attempt]);
          attempt++;
          continue;
        }
        throw err;
      }
    }

    // Ledger payload carries identity + classification, matching the house shape of
    // the other appendLedger call sites (server.js:1524/:3340). run_id+seq alone
    // cannot answer "what directive, from whom" during a disaster-recovery read.
    safeOnWrite(onWrite, 'worker_messages', mode, {
      run_id, seq: outcome.seq, msg_id: outcome.msg_id, direction, msg_type, author,
      superseded: outcome.superseded,
    });
    return {
      ok: true,
      msg_id: outcome.msg_id,
      seq: outcome.seq,
      state: 'pending',
      superseded: outcome.superseded,
      ...(outcome.warnings.length ? { warnings: outcome.warnings } : {}),
    };
  } finally {
    db.close();
  }
}
