#!/usr/bin/env node
/**
 * ctrl-channel-stop-check (BR-020~BR-027, ccb-4-ctrl-notify-knock)
 *
 * Event:  Stop
 * Action: When a controller's turn is about to end with mail addressed to its own track still
 *         unread, emit `decision:"block"` exactly once per count level so the turn continues in
 *         the same window and the agent reads and signs off before stopping. Knock only --
 *         the reason line carries a count, never a message body.
 *
 * Why top-level `decision` and not `hookSpecificOutput` (BR-026): the official decision table
 * assigns `Stop`/`SubagentStop` to a **top-level** `decision` field; `additionalContext` is
 * additionally accepted for non-blocking feedback but is not the carrier that blocks.
 * [Source: https://code.claude.com/docs/en/hooks | Fetched 2026-08-03]
 *
 * 🔴 Why the loop bound is a DB column and not `stop_hook_active`:
 * the field does not exist in the current `Stop` stdin schema. The documented loop signal is
 * **`stopped_by_hook`** (boolean) [same source, same fetch]. Six in-repo references still call
 * `stop_hook_active` "鐵則" (hooks-mechanization references/event-schemas.md:152 among them) --
 * those are stale and are deliberately left alone here (changing a methodology skill that 11
 * hooks depend on is not this card's surface; see the Story's dev_notes). `whp-11` reached the
 * same conclusion independently on 2026-08-02 and moved its own loop bound onto a DB column
 * (`worker_messages.knocked_at`). So: the primary bound is `last_stop_block_count`, and
 * `stopped_by_hook` is a documented secondary guard only (BR-024).
 *
 * Self-terminating by construction: blocking is gated on the count being *greater* than the
 * count already blocked on, so an agent that signs off drops the count to zero and is never
 * blocked again, and an agent that ignores the block is blocked exactly once regardless.
 *
 * fail-open on every error path (BR-027): a hook that cannot read its own DB must never be
 * able to trap a user's turn.
 */
'use strict';

const lib = require('./_lib');
const { countUnread } = require('../../.context-db/scripts/ctrl-unread-sql.cjs');
const windowOps = require('../../.context-db/scripts/ctrl-window-ops.cjs');

const NEVER_BLOCKED = -1;

function buildReason(track, total) {
  return `[聊天室] ${track} 有 ${total} 則未讀他軌留言 — 請呼叫 read_ctrl_messages 讀取並簽收後再結束`;
}

/** BR-026: top level carries the verdict; hookSpecificOutput mirrors it for readability. */
function emitBlock(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason,
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reason },
  }));
}

/**
 * Persist the count this session has now blocked on (or reset it).
 *
 * The reset arm is not in the BR list and is deliberate. BR-021 only says a zero count must not
 * block; without a reset, `last_stop_block_count` would stay at its high-water mark forever, so
 * after one "2 unread, then signed off" cycle a subsequent single unread message (1 > 2 false)
 * would never block again -- the mechanism would quietly stop working for the rest of the
 * session. Resetting on zero keeps the bound "once per count level" rather than "once per
 * session high-water mark". Written only when the stored value is not already NEVER_BLOCKED,
 * so an idle window with no mail opens no writable connection at all.
 */
function recordBlockCount(sessionId, count) {
  let wdb = null;
  try {
    wdb = windowOps.openWritable(lib.resolveDbPath());
    if (!wdb) return;
    wdb.prepare(
      `UPDATE controller_windows
         SET last_stop_block_at = @now, last_stop_block_count = @count, last_seen_at = @now
       WHERE session_id = @sessionId`
    ).run({ now: windowOps.getTaiwanTimestamp(), count, sessionId });
  } catch (err) {
    try {
      process.stderr.write(`[ctrl-channel-stop-check] state write skipped: ${err.message}\n`);
    } catch {
      /* ignore */
    }
  } finally {
    if (wdb) {
      try {
        wdb.close();
      } catch {
        /* ignore */
      }
    }
  }
}

(function main() {
  try {
    // BR-020: worker sub-windows exit before the DB is opened -- their Stop chain belongs to
    // stop-report.ps1, and ctrl-channel is controller-only. Guard stays above openContextDb().
    if (process.env.PIPELINE_RUN_ID) {
      process.exit(0);
    }

    const input = lib.readHookInput();
    // BR-024: secondary guard only. See the header for why the primary bound is the DB column.
    if (input && input.stopped_by_hook === true) {
      process.exit(0);
    }

    const sessionId = input && input.session_id ? String(input.session_id) : '';
    if (!sessionId) {
      process.exit(0);
    }

    const db = lib.openContextDb();
    if (!db) {
      process.exit(0);
    }

    // Nested ifs rather than early returns: a `return` inside try/finally leaves *main*, not just
    // the try block, so everything below the finally would be unreachable. That is not a
    // hypothetical -- the reset arm was first written with an early return, and its
    // recordBlockCount call was dead code until BR023_SigningOffResetsTheBound caught it.
    let verdict = null;
    try {
      // BR-008: unbound window -> zero bytes, exit 0, no inference.
      const row = windowOps.getWindow(db, sessionId);
      if (row) {
        const { total } = countUnread(db, row.track);
        if (total === 0) {
          // BR-021 + the reset arm documented on recordBlockCount.
          if (row.last_stop_block_count !== NEVER_BLOCKED) verdict = { reset: true };
        } else if (total > row.last_stop_block_count) {
          // BR-022 / BR-023: strictly greater than the count already blocked on.
          verdict = { block: true, track: row.track, total };
        }
      }
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }

    if (!verdict) return;

    if (verdict.reset) {
      recordBlockCount(sessionId, NEVER_BLOCKED);
      return;
    }

    // Record before emitting: if the process dies between the two, the cost is one missed
    // block rather than a turn that cannot end.
    recordBlockCount(sessionId, verdict.total);
    emitBlock(buildReason(verdict.track, verdict.total));
  } catch (err) {
    // BR-027: never emit a decision from an error path -- a hook that fails must not be able
    // to hold a turn open.
    try {
      process.stderr.write(`[ctrl-channel-stop-check] error: ${err.message}\n`);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
})();
