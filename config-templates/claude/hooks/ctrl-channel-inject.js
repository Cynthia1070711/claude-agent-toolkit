#!/usr/bin/env node
/**
 * ctrl-channel-inject (BR-001~012, ccb-2-unread-inject-hook)
 *
 * Event:  UserPromptSubmit (4th hook in the chain, after pre-prompt-rag.js
 *         and bmad-slash-story-inject.js)
 * Action: Resolve which controller/manual track this main-window session
 *         belongs to, then inject a compact unread-summary of ctrl-channel
 *         messages addressed to that track as additionalContext. Read-only
 *         (DB opened readonly via lib's shared helper): this never
 *         substitutes for an explicit read_ctrl_messages() sign-off -- see
 *         the phycool-ctrl-channel skill for that distinction.
 *
 * Why: main-window sessions (controller tracks or the manual lane) had no
 * notification channel for ctrl-channel messages other than a human polling
 * every ~10 minutes. Worker sub-windows are excluded on purpose
 * (PIPELINE_RUN_ID check) per the user's 2026-08-01 ruling: dispatched
 * workers should not read the cross-track chat room, to avoid context
 * pollution.
 *
 * env guard: PIPELINE_RUN_ID is set only for dispatched worker sub-windows
 * (dispatch-general.ps1:193) -- exit before opening the DB so no query or
 * additionalContext is ever produced for a worker.
 *
 * Track resolution priority (BR-002), evaluated in order, first hit wins. Every
 * path validates against the canonical list -- BR-003 admits only names the DB
 * actually knows, regardless of which source proposed them:
 *   1. PHYCOOL_CONTROLLER_TRACK env (reserved for future session-level use;
 *      main windows never set this today)
 *   2. current prompt text contains a DB canonical track name as a literal
 *      substring (controller windows announce their track on their first
 *      prompt of a task, e.g. "我們是後台軌中控")
 *   3. prompt is a bmad slash invocation -> resolve the story_id in its
 *      tail -> look up track_plan.lane; lane='manual' maps to 主視窗手動軌
 *   4. this session's own conversation_turns history (rows written earlier
 *      in the same UserPromptSubmit chain by pre-prompt-rag.js) -- take the
 *      most recent user turn that matches rule 2's substring test
 * Unresolvable at every step -> silent empty output (general window, zero
 * cost).
 *
 * Canonical track list is DISTINCT from_track, minus SENTINEL_TRACKS, and is
 * never unioned with to_tracks: to_tracks has carried a documented typo ("BMAD升級軌中控",
 * msg_id 1119/1120/1121/1126 -- verified live 2026-08-01) that from_track has
 * never contained. Unioning would silently re-admit exactly the "軌名雙生"
 * confusion BR-003 exists to guard against (e.g. it would make prompt
 * "我們是BMAD升級軌中控" ambiguous between the two names instead of resolving
 * cleanly to BMAD升級軌).
 *
 * Never blocks (advisory only, no `decision` field). fail-open on any
 * error: bad stdin JSON, missing DB, or a failed query all fall through to
 * a silent exit 0.
 */
'use strict';

const lib = require('./_lib');
// ccb-4 BR-009:未讀述詞的唯一定義站點。本檔原本自帶一份(下方 UNREAD_FROM_WHERE),
// `ctrl-channel-ops.js` 另有一份缺兩條件的 —— 兩份漂移正是 ccb-4 要消滅的缺陷本體。
const { UNREAD_PREDICATE } = require('../../.context-db/scripts/ctrl-unread-sql.cjs');
const windowOps = require('../../.context-db/scripts/ctrl-window-ops.cjs');

const CHAR_CAP = 800;
const ELLIPSIS = '…';
// 800-char cap fits ~8 rows in practice (live-measured 2026-08-01: 前台軌 with 8
// unread renders 803 chars). A larger LIMIT only fetches rows that truncation
// would discard, so keep it just above what the cap can show.
const MAX_UNREAD_ROWS = 12;
const BMAD_SLASH_RE = /^\/bmad:bmm:workflows:\S+([\s\S]*)$/;
const CANDIDATE_TOKEN_RE = /[A-Za-z][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)+/g;
const MAX_CANDIDATES = 40;

// The one lane with a fixed 1:1 track -- see laneToTrack's JSDoc.
const MANUAL_LANE_TRACK = '主視窗手動軌';

// Priority-4 history scan bound. Live max is 208 user turns in one session
// (2026-08-01), index-backed, so this is a guard against unbounded growth rather
// than a fix for a present cost. A declaration older than this many turns back is
// not a useful signal anyway.
const MAX_HISTORY_TURNS = 60;

// ccb-4: the canonical list (and the SENTINEL_TRACKS reasoning that used to sit above it) moved
// to ctrl-window-ops.cjs, because the knock path needs the same list for its CCB4-E01 check.
// Behaviour is unchanged -- same query, same sentinel filter, same longest-first ordering.
const loadCanonicalTracks = windowOps.loadCanonicalTracks;

function matchCanonicalSubstring(text, canonicalTracks) {
  if (!text) return null;
  for (const track of canonicalTracks) {
    if (text.includes(track)) return track;
  }
  return null;
}

function findStoryIdInTail(db, tail) {
  const candidates = tail.match(CANDIDATE_TOKEN_RE) || [];
  const stmt = db.prepare('SELECT 1 FROM track_plan WHERE story_id = ?');
  const limit = Math.min(candidates.length, MAX_CANDIDATES);
  for (let i = 0; i < limit; i++) {
    if (stmt.get(candidates[i])) return candidates[i];
  }
  return null;
}

/**
 * lane -> track mapping (BR-002 priority 3). 'manual' is the only lane with
 * a fixed 1:1 track (主視窗手動軌 -- a manual-lane card is by definition run
 * from the main window). 'dispatch'/'reconcile' lanes have no single owning
 * track in track_plan (a dispatch card can be dispatched by any controller
 * track depending on its epic -- verified live: epic-bwu/epic-whp/epic-ccb/
 * epic-tdb all have dispatch-lane rows, no 1:1 epic-to-track column exists),
 * so this returns null for those and lets priority 4 (conversation_turns)
 * resolve them from the session's own history instead.
 * Maintenance note: if lane semantics gain a 4th value, or dispatch/reconcile
 * ever gain a per-epic owning-track column, extend this function -- callers
 * should not need to change.
 *
 * The literal is still validated against the canonical list rather than trusted
 * outright: BR-003 admits only names the DB actually knows, and that has to hold
 * for every resolution path, not just the substring ones.
 */
function laneToTrack(lane, canonicalTracks) {
  if (lane !== 'manual') return null;
  return canonicalTracks.includes(MANUAL_LANE_TRACK) ? MANUAL_LANE_TRACK : null;
}

/**
 * Priority 4: this session's own earlier user turns.
 *
 * The current prompt is already among these rows (pre-prompt-rag.js runs first in
 * the same UserPromptSubmit chain and writes it), and that is deliberately left
 * alone rather than filtered out: priority 2 has already tested the current
 * prompt against the same substring rule, so if it were going to match it would
 * never have reached here. Re-testing it costs one no-op comparison and removes
 * the need to guess at a turn_index boundary.
 */
function resolveFromSessionHistory(db, sessionId, canonicalTracks) {
  if (!sessionId) return null;
  const rows = db
    .prepare(
      `SELECT content FROM conversation_turns
       WHERE session_id = ? AND role = ? ORDER BY turn_index DESC LIMIT ?`
    )
    .all(sessionId, 'user', MAX_HISTORY_TURNS);
  for (const row of rows) {
    const hit = matchCanonicalSubstring(row.content, canonicalTracks);
    if (hit) return hit;
  }
  return null;
}

/**
 * Priority 0 (ccb-4 BR-036/BR-037): the controller_windows registry.
 *
 * This exists because inference was measurably wrong. Live 2026-08-02, in the BMAD升級軌
 * controller window, this hook persistently injected `[聊天室] 主視窗手動軌 未讀 1 則` -- priority 4
 * scans conversation_turns, and that table is written by every window sharing the session id
 * space (dispatched workers, other windows' declarations). The window that most needed the
 * notification was shown another track's count and never saw its own.
 *
 * The registry value is still canonical-validated (BR-037) rather than trusted outright: BR-003
 * admits only names the DB actually knows, and that has to hold for every path including this one.
 * Fails soft -- a missing table (old DB, bare fixture) falls through to the four existing paths,
 * which is exactly the BR-038 no-regression requirement.
 */
function resolveFromRegistry(db, sessionId, canonicalTracks) {
  try {
    const track = windowOps.resolveTrackBySession(db, sessionId);
    return track && canonicalTracks.includes(track) ? track : null;
  } catch {
    return null;
  }
}

/**
 * Bind (or heartbeat) this session's registry row -- ccb-4 BR-001..BR-004.
 *
 * Opened as a separate short-lived writable connection: the read path above is readonly
 * (lib.openContextDb), and the two new hooks need "readonly unless actually writing" to be the
 * shape they can copy (BR-018). Fails soft in every direction -- a missing table, a locked DB, or
 * an unavailable process probe must never cost this hook its injection, which is what it is for.
 *
 * The console PID probe (BR-004) runs at most once per session: bindWindow skips it entirely when
 * a row already exists (BR-041), so the ~580ms full-process scan is paid on the first prompt of a
 * window and never again.
 */
function bindRegistry(sessionId, track) {
  if (!sessionId) return;
  let wdb = null;
  try {
    wdb = windowOps.openWritable(lib.resolveDbPath());
    if (!wdb) return;
    windowOps.bindWindow(wdb, { sessionId, track, now: windowOps.getTaiwanTimestamp() });
  } catch (err) {
    try {
      process.stderr.write(`[ctrl-channel-inject] registry bind skipped: ${err.message}\n`);
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

function resolveTrack(db, prompt, sessionId) {
  const canonicalTracks = loadCanonicalTracks(db);

  // Canonical-validated like every other path (BR-003): an env value the DB has
  // never seen is not a track, so fall through rather than query for a name that
  // can only ever return zero rows.
  const envTrack = process.env.PHYCOOL_CONTROLLER_TRACK || '';
  if (envTrack && canonicalTracks.includes(envTrack)) return envTrack;

  const registryHit = resolveFromRegistry(db, sessionId, canonicalTracks);
  if (registryHit) return registryHit;

  const promptHit = matchCanonicalSubstring(prompt, canonicalTracks);
  if (promptHit) return promptHit;

  const slashMatch = prompt.replace(/^\s+/, '').match(BMAD_SLASH_RE);
  if (slashMatch) {
    const storyId = findStoryIdInTail(db, slashMatch[1]);
    if (storyId) {
      const row = db.prepare('SELECT lane FROM track_plan WHERE story_id = ?').get(storyId);
      if (row) {
        const laneHit = laneToTrack(row.lane, canonicalTracks);
        if (laneHit) return laneHit;
      }
    }
  }

  return resolveFromSessionHistory(db, sessionId, canonicalTracks);
}

// ccb-4 BR-009 (2026-08-03): the three conditions themselves moved to
// `.context-db/scripts/ctrl-unread-sql.cjs`, the single definition site now shared by this
// hook, the two new hooks, and `read_ctrl_messages`. The rationale that used to live here
// -- from_track != @track because to_tracks is not guaranteed self-exclusive across
// historical/imported rows (36 self-addressed rows live 2026-08-03) -- moved with it.
// Only the FROM/JOIN shape is local, because only this hook needs t.topic / t.must_read.
const UNREAD_FROM_WHERE = `
  FROM ctrl_messages m
  JOIN ctrl_threads t ON t.thread_id = m.thread_id
  WHERE ${UNREAD_PREDICATE}`;

/**
 * Returns the rows to render plus the true unread totals.
 *
 * The totals are counted separately rather than derived from rows.length: rows is
 * bounded by MAX_UNREAD_ROWS and then further trimmed by the 800-char cap, so
 * using its length would under-report the backlog in exactly the situation where
 * the count matters most -- "未讀 12 則" when 40 are waiting reads as "all shown".
 */
function fetchUnread(db, track) {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN t.must_read THEN 1 ELSE 0 END) AS must
       ${UNREAD_FROM_WHERE}`
    )
    .get({ track });
  const rows = db
    .prepare(
      `SELECT m.msg_id, m.from_track, m.body, m.created_at, t.must_read, t.topic
       ${UNREAD_FROM_WHERE}
       ORDER BY t.must_read DESC, m.created_at ASC
       LIMIT @limit`
    )
    .all({ track, limit: MAX_UNREAD_ROWS });
  return { rows, total: totals.total || 0, mustReadCount: totals.must || 0 };
}

function truncate(text) {
  if (text.length <= CHAR_CAP) return text;
  return text.slice(0, CHAR_CAP - ELLIPSIS.length) + ELLIPSIS;
}

function buildContext(track, rows, total, mustReadCount) {
  if (rows.length === 0) return '';
  const header = `[聊天室] ${track} 未讀 ${total} 則(${mustReadCount} 必讀)\n`;
  const lines = rows.map((r) => {
    const flag = r.must_read ? '🔴 ' : '';
    const ts = (r.created_at || '').slice(0, 16).replace('T', ' ');
    const topic = (r.topic || '').slice(0, 20);
    const bodyPreview = (r.body || '').replace(/\s+/g, ' ').slice(0, 40);
    return `${flag}#${r.msg_id} ${r.from_track} ${ts} ${topic} — ${bodyPreview}`;
  });
  const footer = '\n（可用 read_ctrl_messages 讀全文並簽收）';
  return truncate(header + lines.join('\n') + footer);
}

(function main() {
  try {
    if (process.env.PIPELINE_RUN_ID) {
      process.exit(0);
    }

    const input = lib.readHookInput();
    const prompt = input?.prompt_text ?? input?.prompt ?? input?.user_prompt ?? '';
    const sessionId = input?.session_id || '';
    if (!prompt || typeof prompt !== 'string') {
      process.exit(0);
    }

    const db = lib.openContextDb();
    if (!db) {
      process.exit(0);
    }

    // Returns rather than process.exit() from here on: process.exit() terminates
    // synchronously and would skip the finally block entirely, making the close()
    // below dead code (and risking a truncated stdout write on the emit path).
    try {
      const track = resolveTrack(db, prompt, sessionId);
      if (!track) return;

      bindRegistry(sessionId, track);

      const { rows, total, mustReadCount } = fetchUnread(db, track);
      const text = buildContext(track, rows, total, mustReadCount);
      if (!text) return;

      lib.emitAdditionalContext(text, 'UserPromptSubmit');
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    try {
      process.stderr.write(`[ctrl-channel-inject] error: ${err.message}\n`);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
})();
