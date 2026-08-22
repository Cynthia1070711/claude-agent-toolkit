'use strict';

// whp-11-d2-inline-revise: D2 bounded-wait poll -- peek for a pending controller-to-worker
// directive and stamp it "knocked" (loop-bound, BR-010) without touching state/delivered_via
// (BR-009: read-worker-directives.js's own selection stays untouched) or body (BR-012: only
// knocks a signal, never carries directive content into stop-report.ps1's stdout).
//
// Same query shape as read-worker-directives.js:45-49 (readDirectives), plus one predicate
// (`AND knocked_at IS NULL`) -- the loop-bound is an orthogonal nullable column, not a new
// `state` value, so that file's selection needs zero changes (dev_notes "設計要點：為什麼是
// 新增欄位而不是新增 state 值").
//
// Pure functions -- caller owns the db connection's lifecycle (open/close, readonly-or-not),
// same signature shape as worker-lifecycle-advance.cjs's advanceToReported(db, {...}). Fail-
// open: never throws. Any DB failure surfaces as {ok:false, error} so stop-report.ps1 can log
// D2-POLL-FAILED without losing the heartbeat/worker_handoffs writes that already ran (AC6).

/** BR-001/BR-003/BR-006: readonly peek, never mutates. body deliberately not selected -- D2
 * only ever knocks a signal (BR-012), so there is nothing to accidentally leak downstream.
 * prepare-per-call is deliberate: the caller is a short-lived hook process (one poll loop per
 * process), so hoisting/caching the statement saves ~2.4ms per 120s cycle -- revisit only if
 * intervalSec ever drops below ~0.5s (whp-11 CR, Layer E measured). */
function peekPending(db, { runId }) {
  try {
    const rows = db.prepare(`
      SELECT msg_id, seq, msg_type FROM worker_messages
      WHERE run_id=@runId AND direction='controller-to-worker' AND state='pending' AND knocked_at IS NULL
      ORDER BY seq ASC
    `).all({ runId });
    return { ok: true, rows, error: null };
  } catch (e) {
    return { ok: false, rows: [], error: e.message };
  }
}

/** BR-008/BR-009: stamps only the given msg_ids -- never touches state/delivered_via, never a
 * bare `WHERE run_id` (msgIds is already the caller's exact peekPending result for one run, so
 * per-id targeting is both sufficient and the narrower, safer write).
 * WHERE re-checks state='pending' AND knocked_at IS NULL (whp-11 CR, TOCTOU guard): if D1
 * (read-worker-directives.js) delivered the row between peek and stamp, changes drops to 0 and
 * the caller treats it as a miss instead of knocking for an already-delivered directive. */
function stampKnocked(db, { msgIds, now }) {
  try {
    if (!Array.isArray(msgIds) || msgIds.length === 0) {
      return { ok: true, changes: 0, error: null };
    }
    const stmt = db.prepare(`UPDATE worker_messages SET knocked_at=@now WHERE msg_id=@id AND state='pending' AND knocked_at IS NULL`);
    const txn = db.transaction((ids) => {
      let changes = 0;
      for (const id of ids) {
        changes += stmt.run({ id, now }).changes;
      }
      return changes;
    });
    const changes = txn.immediate(msgIds);
    return { ok: true, changes, error: null };
  } catch (e) {
    return { ok: false, changes: 0, error: e.message };
  }
}

/** AC1/BR011/BR012: builds the Stop-hook `decision:block` payload from peekPending's rows.
 * Pure data transform -- never touches the DB, never includes `body` (rows from peekPending
 * never carry it, per BR012 "只敲門不推內容"), reason names the read path + the first pending
 * msg_id so a human/CR can trace which directive triggered the knock without its content ever
 * leaving the DB. Returns null when there is nothing to knock (caller's cue to fall through to
 * the existing miss path unchanged). */
function buildKnockDecision(rows, runId) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // BR-012: the knock names the COUNT and ALL msg_ids (spec §5 boundary: "one knock naming both
  // msg_ids" for the two-directives case) -- never the body. Format keeps the `msg_id=` prefix
  // followed by the first id so single-directive assertions (msg_id=42) keep matching.
  const idList = rows.map((r) => r.msg_id).join(',');
  const reason = `Pending controller directive(s) x${rows.length} for run ${runId} -- read via node .context-db/scripts/read-worker-directives.js --run-id ${runId} (msg_id=${idList})`;
  return {
    decision: 'block',
    reason,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: reason,
    },
  };
}

/** AC12/BR-025/BR-026 (whp-11 T6): resolves workerProtocol.hookGraceSec -- default 120 when
 * absent, clamped to [0,300] otherwise. 0 is a valid, unclamped value (AC12's documented
 * zero-cost opt-out: single immediate check, zero wait). `clamped` tells the caller whether to
 * log D2-GRACE-CLAMPED -- this module has no logging I/O of its own, same separation as the DB
 * functions above returning data for the caller to act on. */
function resolveGraceSec(config) {
  const DEFAULT_SEC = 120;
  const MIN_SEC = 0;
  const MAX_SEC = 300;
  const raw = config && typeof config === 'object' ? config.hookGraceSec : undefined;
  if (raw === undefined || raw === null) {
    return { value: DEFAULT_SEC, clamped: false };
  }
  // Strict typeof guard (whp-11 CR): Number('') / Number([]) / Number(false) all coerce to 0,
  // which is the FULL OPT-OUT value -- a typo'd config ("hookGraceSec": "") must fail toward
  // the default (D2 stays on), never silently disable the channel. BR-025's "non-numeric ->
  // default" therefore includes numeric strings: JSON numbers must be numbers.
  const n = typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) {
    return { value: DEFAULT_SEC, clamped: false };
  }
  if (n < MIN_SEC) return { value: MIN_SEC, clamped: true };
  if (n > MAX_SEC) return { value: MAX_SEC, clamped: true };
  return { value: n, clamped: false };
}

module.exports = { peekPending, stampKnocked, buildKnockDecision, resolveGraceSec };
