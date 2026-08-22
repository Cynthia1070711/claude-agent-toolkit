#!/usr/bin/env node
/**
 * ctrl-channel-probe (BR-013~BR-019 / BR-041, ccb-4-ctrl-notify-knock)
 *
 * Event:  PostToolUse
 * Action: While a controller's turn is still running, inject a one-line unread count for
 *         its own track next to a tool result. Knock only -- never any message body.
 *
 * Why this event: `ccb-2` delivers unread notices on `UserPromptSubmit` only, so a window is
 * deaf for the entire span of a long multi-tool turn. `PostToolUse` is the one event that
 * fires repeatedly inside a turn, and it officially supports
 * `hookSpecificOutput.additionalContext`, delivered "next to the tool result"
 * [Source: https://code.claude.com/docs/en/hooks | Fetched 2026-08-03]. Local precedent for
 * the exact shape: `.claude/hooks/db-first-write-guard.js:77-79`.
 *
 * Why it needs the registry: `PostToolUse` stdin carries `session_id` but **no `prompt`**, and
 * three of `ctrl-channel-inject.js`'s four resolution paths read prompt text. Without an
 * explicit session -> track binding this hook structurally cannot know which track it is.
 * No registry row -> silent exit 0. Not-applicable is not message loss: the window collects
 * its full backlog on its first read after binding.
 *
 * Cost discipline (BR-041): this runs after *every* tool call, so the non-emitting path must
 * stay cheap. Throttle is checked from the row already fetched, before any count query, and a
 * writable connection is opened only on the turns that actually emit (BR-018). The ancestor
 * process probe is never called here at all -- binding is `ctrl-channel-inject.js`'s job.
 *
 * Two non-emitting paths exist, and they do not cost the same (measured 2026-08-03 against the
 * live 415-message / 1405-receipt DB, CR of this card):
 *   - inside the throttle window   -> one indexed SELECT on controller_windows, ~0.014ms
 *   - throttle elapsed, count unchanged -> that SELECT plus a config read and countUnread, ~0.33ms
 * The second path recurs on every tool call, because `last_probe_at` advances only when a line is
 * actually emitted -- a deliberate reading of BR-014 ("since the last *emission*"), not an
 * oversight: refreshing it on a silent turn would let a genuinely new count wait out a fresh
 * window. Both figures sit far under the 15ms budget, so the recurrence is accepted rather than
 * optimised; if the message table ever grows by orders of magnitude, revisit this before BR-041.
 *
 * Never blocks. fail-open on every error path (BR-019): bad stdin, missing DB, failed query
 * all fall through to a silent exit 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./_lib');
const { countUnread } = require('../../.context-db/scripts/ctrl-unread-sql.cjs');
const windowOps = require('../../.context-db/scripts/ctrl-window-ops.cjs');

// BR-017: the line reports counts, never bodies, so its length is bounded by the digits in
// two numbers plus a fixed template -- 300 leaves generous room for the longest track name.
const CONTEXT_CAP = 300;
const DEFAULT_THROTTLE_SEC = 180;
const CONFIG_PATH = path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json');

/**
 * `ctrlChannel.probeThrottleSec` from pipeline-config.json.
 * Falls back on a missing file, malformed JSON, or a non-number value: a config typo must not
 * turn the throttle off (that direction floods every tool call), so the fallback is the
 * configured default rather than 0.
 */
function resolveThrottleSec(configPath) {
  try {
    const raw = fs.readFileSync(configPath || CONFIG_PATH, 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    const v = cfg && cfg.ctrlChannel ? cfg.ctrlChannel.probeThrottleSec : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return DEFAULT_THROTTLE_SEC;
    return v;
  } catch {
    return DEFAULT_THROTTLE_SEC;
  }
}

/** Offset-aware ISO strings compare correctly through Date.parse. Unparseable -> treat as
 *  "never emitted", which lets a corrupted timestamp self-heal on the next emission. */
function throttleElapsed(lastProbeAt, throttleSec, nowMs) {
  if (!lastProbeAt) return true;
  const t = Date.parse(lastProbeAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t >= throttleSec * 1000;
}

function buildContext(track, total, mustReadCount) {
  const text = `[聊天室] ${track} 未讀 ${total} 則(${mustReadCount} 必讀)— 可用 read_ctrl_messages 讀取簽收`;
  return text.length <= CONTEXT_CAP ? text : text.slice(0, CONTEXT_CAP);
}

(function main() {
  try {
    // BR-013: worker sub-windows are excluded before the DB is opened. This guard must stay
    // above lib.openContextDb() -- the test asserts that source ordering directly, mirroring
    // ctrl-channel-inject.test.js's existing guard/open line-order assertion.
    if (process.env.PIPELINE_RUN_ID) {
      process.exit(0);
    }

    const input = lib.readHookInput();
    const sessionId = input && input.session_id ? String(input.session_id) : '';
    if (!sessionId) {
      process.exit(0);
    }

    const db = lib.openContextDb();
    if (!db) {
      process.exit(0);
    }

    // Nested ifs rather than early returns: a `return` inside try/finally leaves *main*, so
    // anything below the finally would be unreachable. Harmless on this hook's silent paths, but
    // the same shape hid a real defect in ctrl-channel-stop-check.js -- keep both readable the
    // same way rather than relying on "it happens to be fine here".
    let emit = null;
    try {
      // BR-008: no registry row -> zero output, zero inference, zero row creation.
      const row = windowOps.getWindow(db, sessionId);
      // BR-014 checked first: it is the cheapest branch, and it short-circuits the count query
      // entirely while the window is open. Once the window elapses the count runs on every tool
      // call until it changes (see the header note on the two non-emitting paths and their
      // measured cost) -- still ~0.33ms, well inside the BR-041 budget.
      if (row && throttleElapsed(row.last_probe_at, resolveThrottleSec(), Date.now())) {
        const { total, mustReadCount } = countUnread(db, row.track);
        // BR-015: emit only when the count is non-zero AND differs from the last emitted count.
        // "0" is deliberately never announced -- a drop to zero is not news worth a line.
        if (total > 0 && total !== row.last_probe_count) {
          emit = { track: row.track, total, mustReadCount };
        }
      }
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }

    if (!emit) return;

    // BR-018: the writable connection exists only on emitting turns. Recording state before
    // writing stdout means a crash between the two costs one suppressed notice rather than a
    // repeated one every tool call for the rest of the throttle window.
    let wdb = null;
    try {
      wdb = windowOps.openWritable(lib.resolveDbPath());
      if (wdb) {
        wdb.prepare(
          `UPDATE controller_windows
             SET last_probe_at = @now, last_probe_count = @count, last_seen_at = @now
           WHERE session_id = @sessionId`
        ).run({ now: windowOps.getTaiwanTimestamp(), count: emit.total, sessionId });
      }
    } catch (err) {
      try {
        process.stderr.write(`[ctrl-channel-probe] state write skipped: ${err.message}\n`);
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

    lib.emitAdditionalContext(buildContext(emit.track, emit.total, emit.mustReadCount), 'PostToolUse');
  } catch (err) {
    // BR-019: nothing this hook can fail at is worth costing the user a tool call.
    try {
      process.stderr.write(`[ctrl-channel-probe] error: ${err.message}\n`);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
})();
