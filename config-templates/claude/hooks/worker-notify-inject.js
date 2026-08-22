#!/usr/bin/env node
/**
 * worker-notify-inject (BR-007~029, whp-8-report-ack-notify)
 *
 * Event:  UserPromptSubmit (5th hook in the chain, after ctrl-channel-inject.js)
 * Action: Read-only digest of six worker_runs/guardian_heartbeat categories the
 *         controller needs to see -- pending ack, pending verify, pending close,
 *         requires-attention, workflow-invoked anomalies, and a stale guardian
 *         heartbeat -- injected as additionalContext. This is the L2 channel
 *         (SSoT §22.3): the most reliable delivery path, because the controller
 *         sees it just by doing anything, without having to poll.
 *
 * Why: whp-7's guardian writes reported_at/notify_count/requires_attention, but
 * until this hook existed nothing surfaced those columns to a human. whp-4's
 * stop-report.ps1 CAS advance (this same Story, Phase 1) is what makes 'reported'
 * rows exist in the first place; this hook is the other half of the seam -- the
 * delivery side.
 *
 * env guard: PIPELINE_RUN_ID is set only for dispatched worker sub-windows
 * (dispatch-general.ps1:193) -- exit before opening the DB, mirroring
 * ctrl-channel-inject.js's worker exclusion (worker sub-windows should not see
 * cross-run controller digests, and the digest's own categories are meaningless
 * inside a single worker's own context).
 *
 * Never blocks (advisory only). Fail-open on any error: bad stdin JSON, missing
 * DB, or a failed query all fall through to a silent exit 0. Entirely readonly
 * (lib.openContextDb() opens with { readonly: true }); this hook never writes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./_lib');

const CHAR_CAP = 800;
const ELLIPSIS = '…';
const DEFAULT_WORKER_NOTIFY_CONFIG = {
  guardianStaleMin: 5,
  digestDetailCap: 5,
  ackEscalateAfterRounds: 3,
};

// BR-008: requires_attention=1 alone is not the whole story -- a run whose handshake already
// completed (closed / done-exited) may still carry the flag until someone lowers it in
// DevConsole (whp-10 ackAttention). The digest is the "needs you NOW" surface, so
// terminal-and-handled lifecycles drop out here while L3 keeps the full ledger until the
// flag is acknowledged. Caught live at code-review: the first-ever fully-handshaken run
// (reported -> 39 notifies -> ack -> approve -> closed) kept raising 🚨 on every prompt.
const ATTENTION_WHERE = `requires_attention = 1 AND lifecycle NOT IN ('closed', 'done-exited')`;

// ---------- config ----------

function loadConfig() {
  try {
    const configPath = path.join(
      process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      'scripts',
      'pipeline-config.json'
    );
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_WORKER_NOTIFY_CONFIG, ...(parsed.workerProtocol || {}) };
  } catch {
    // AC11(a): config file missing / unreadable / workerProtocol missing any of these
    // keys -- built-in defaults keep the hook operating.
    return { ...DEFAULT_WORKER_NOTIFY_CONFIG };
  }
}

// ---------- time helpers ----------

function relativeTime(iso, nowMs) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffMin = Math.max(0, Math.round((nowMs - then) / 60000));
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  return `${Math.round(diffHr / 24)} 天前`;
}

// ---------- category queries (each independent COUNT(*), BR-010) ----------
// Every SELECT lists columns explicitly -- never `SELECT *` -- so evidence_json
// (which may carry file paths / session_id, AC13) can never leak through a
// column this hook did not intend to read.

function queryPendingAck(db) {
  const total = db
    .prepare(`SELECT COUNT(*) c FROM worker_runs WHERE lifecycle = 'reported' AND ack_at IS NULL`)
    .get().c;
  const rows = db
    .prepare(
      `SELECT story_id, phase, controller_track, notify_count, reported_at AS ts
       FROM worker_runs WHERE lifecycle = 'reported' AND ack_at IS NULL
       ORDER BY reported_at ASC`
    )
    .all();
  return { total, rows };
}

function queryPendingVerify(db) {
  const total = db.prepare(`SELECT COUNT(*) c FROM worker_runs WHERE lifecycle = 'awaiting-review'`).get().c;
  const rows = db
    .prepare(
      `SELECT story_id, phase, controller_track, notify_count, updated_at AS ts
       FROM worker_runs WHERE lifecycle = 'awaiting-review'
       ORDER BY updated_at ASC`
    )
    .all();
  return { total, rows };
}

function queryPendingClose(db) {
  const total = db.prepare(`SELECT COUNT(*) c FROM worker_runs WHERE lifecycle = 'approved'`).get().c;
  const rows = db
    .prepare(
      `SELECT story_id, phase, controller_track, notify_count, updated_at AS ts
       FROM worker_runs WHERE lifecycle = 'approved'
       ORDER BY updated_at ASC`
    )
    .all();
  return { total, rows };
}

function queryRequiresAttention(db) {
  const total = db.prepare(`SELECT COUNT(*) c FROM worker_runs WHERE ${ATTENTION_WHERE}`).get().c;
  const rows = db
    .prepare(
      `SELECT story_id, phase, controller_track, notify_count, abandoned_at_stage, health_flag, updated_at AS ts
       FROM worker_runs WHERE ${ATTENTION_WHERE}
       ORDER BY updated_at ASC`
    )
    .all();
  return { total, rows };
}

// BR-019/BR-020: only the literal string 'false' counts as an anomaly. NULL
// (evidence_json absent), a missing key, and the literal 'unknown' are all
// excluded by the same `= 'false'` comparison (json_extract returns NULL for
// the first two, and 'unknown' fails a strict equality) -- collapsing them
// would manufacture a false-signal flood (whp-4 T4.4 already distinguishes
// 'unknown' as an evidence-collection failure, not a workflow-skip signal).
// BR-021: duplicates of the same story_id+phase collapse to one row with a
// ×N count.
function queryWorkflowAnomaly(db) {
  const rows = db
    .prepare(
      `SELECT story_id, phase, COUNT(*) AS occurrences
       FROM worker_handoffs
       WHERE json_extract(evidence_json, '$.workflow_invoked') = 'false'
       GROUP BY story_id, phase
       ORDER BY story_id, phase`
    )
    .all();
  const total = rows.reduce((sum, r) => sum + r.occurrences, 0);
  return { total, rows };
}

function queryGuardianHeartbeat(db, staleMin, nowMs) {
  const row = db.prepare(`SELECT last_beat_at, guardian_pid FROM guardian_heartbeat WHERE id = 1`).get();
  if (!row || !row.last_beat_at) return { state: 'never' };
  // guardian_pid NULL = idle_exit 乾淨退場標記(guardian-tick.js pidToWrite = idleExit ? null : ...):
  // 全 run 終態且閒置逾期時守護依 BR-G20 自行退出,此後心跳靜止屬預期,非異常。
  // 只有 pid 仍在(未曾乾淨退場)而心跳過期,才是真正的守護失聯。
  if (row.guardian_pid === null || row.guardian_pid === undefined) return { state: 'idle-exited' };
  const lastBeatMs = Date.parse(row.last_beat_at);
  if (Number.isNaN(lastBeatMs)) return { state: 'never' };
  const elapsedMin = Math.round((nowMs - lastBeatMs) / 60000);
  if (elapsedMin > staleMin) return { state: 'stale', elapsedMin };
  return { state: 'fresh' };
}

// ---------- rendering ----------

// digestDetailCap-bounded detail lines for one category. `renderLine` maps a
// row to its final text (category-specific field set, BR-013 vs BR-019).
function renderSection(header, rows, cap, renderLine) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, cap);
  const lines = shown.map(renderLine);
  const remainder = rows.length - shown.length;
  if (remainder > 0) lines.push(`（另有 ${remainder} 筆）`);
  return `${header}\n${lines.join('\n')}`;
}

function truncate(text) {
  if (text.length <= CHAR_CAP) return text;
  return text.slice(0, CHAR_CAP - ELLIPSIS.length) + ELLIPSIS;
}

// BR-017: additionalContext must sit nested under hookSpecificOutput, not as a
// bare top-level field -- the CLI silently drops the latter (bwu-5 CR,
// TD-RAG-USERPROMPT-INJECT-FORMAT-INVALID). Extracted so this shape is directly
// unit-testable without spawning the hook as a child process.
function buildPayload(additionalContext, systemMessage) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  if (systemMessage) payload.systemMessage = systemMessage;
  return payload;
}

/**
 * Pure render: takes the six already-queried category results + config, returns
 * { additionalContext, systemMessage }. No DB / stdin / process access here, so
 * this is directly unit-testable against hand-built fixtures (BR-008~BR-025).
 */
function renderDigest({ ack, verify, close, attention, anomaly, heartbeat }, cfg, nowMs) {
  const sections = [];

  sections.push(
    renderSection(
      `🔔 待確認 ${ack.total} 筆`,
      ack.rows,
      cfg.digestDetailCap,
      (r) => `${r.story_id} · ${r.phase} · ${r.controller_track} · ${relativeTime(r.ts, nowMs)}`
    )
  );
  sections.push(
    renderSection(
      `🔍 待驗證 ${verify.total} 筆`,
      verify.rows,
      cfg.digestDetailCap,
      (r) => `${r.story_id} · ${r.phase} · ${r.controller_track} · ${relativeTime(r.ts, nowMs)}`
    )
  );
  sections.push(
    renderSection(
      `🚪 待關窗 ${close.total} 筆`,
      close.rows,
      cfg.digestDetailCap,
      (r) => `${r.story_id} · ${r.phase} · ${r.controller_track} · ${relativeTime(r.ts, nowMs)}`
    )
  );
  sections.push(
    renderSection(
      `🔴 需注意 ${attention.total} 筆`,
      attention.rows,
      cfg.digestDetailCap,
      // BR-013: a stalled-suspect row is NOT dead -- the guardian only suspects it (2 quiet
      // rounds, zero kill). Rendering it as 死於 would misinform exactly the judgment this
      // digest exists to support (worker-lifecycle-judgment.md: 續等/喚醒/重派 is a live call).
      (r) =>
        `${r.story_id} · ${r.phase} · ${r.controller_track} · ${
          r.health_flag === 'stalled-suspect' ? '疑似停滯' : `死於 ${r.abandoned_at_stage || '未知階段'}`
        } · ${relativeTime(r.ts, nowMs)}`
    )
  );
  sections.push(
    renderSection(
      `⚠ 流程異常 ${anomaly.total} 筆`,
      anomaly.rows,
      cfg.digestDetailCap,
      (r) => `${r.story_id} · ${r.phase}${r.occurrences > 1 ? ` ×${r.occurrences}` : ''}`
    )
  );

  if (heartbeat.state === 'stale') {
    sections.push(`👁 守護心跳異常 ${heartbeat.elapsedMin} 分鐘未回報`);
  } else if (heartbeat.state === 'never') {
    sections.push('👁 守護從未啟動');
  }

  const nonEmpty = sections.filter(Boolean);
  const escalatedCount = [ack, verify, close, attention].reduce(
    (sum, cat) => sum + cat.rows.filter((r) => (r.notify_count || 0) >= cfg.ackEscalateAfterRounds).length,
    0
  );

  let additionalContext = '';
  if (nonEmpty.length > 0) {
    const header = '[待辦]';
    const footer = '（詳見 DevConsole /workers）';
    additionalContext = truncate([header, ...nonEmpty, footer].join('\n'));
  }

  // BR-023/BR-024: systemMessage fires on EITHER escalated notify_count OR the
  // mere presence of a workflow anomaly -- the two are independent triggers,
  // not a shared threshold (an anomaly is a correctness signal, not a wait-time one).
  let systemMessage = '';
  if (escalatedCount > 0 || anomaly.total > 0) {
    const parts = [];
    // 逾期未處理 not 逾期未確認: escalatedCount spans ack/verify/close/attention, and a row
    // past the ack stage IS confirmed -- what it has not been is fully handled (handshake
    // incomplete until closed).
    if (escalatedCount > 0) parts.push(`${escalatedCount} 筆逾期未處理`);
    if (anomaly.total > 0) parts.push(`${anomaly.total} 筆流程異常`);
    systemMessage = `🚨 待辦升級：${parts.join('、')}，詳見 DevConsole /workers`;
  }

  return { additionalContext, systemMessage };
}

// ---------- main ----------
// Named + guarded by require.main (not a bare top-level IIFE like ctrl-channel-inject.js):
// this module's query/render functions are required directly by its test file for in-process
// fixture-DB testing, and an unguarded IIFE would run lib.readHookInput()'s synchronous stdin
// read at require() time -- blocking forever under a test runner whose own stdin is never
// closed. Behaviorally identical when invoked the real way (`node worker-notify-inject.js`
// as a hook), since require.main === module holds there.

function main() {
  try {
    // BR-007: this check MUST precede openContextDb() -- worker sub-windows never
    // open the DB for this hook, not even to find zero rows.
    if (process.env.PIPELINE_RUN_ID) {
      process.exit(0);
    }

    // stdin is consumed (pipe etiquette: a guard-exited or non-draining child breaks the
    // writer) but NEVER gates the digest: the output is 100% query-derived (BR-014,
    // track-agnostic), and real shell plumbing feeds this hook garbage legitimately --
    // PowerShell 5.1 stacks up to TWO UTF-8 BOMs onto piped stdin (every party-to-pipeline
    // script header sets [Console]::InputEncoding to the BOM-emitting UTF8 static, and
    // shared-utils.ps1:19 sets $OutputEncoding to the same; hex-verified efbbbf efbbbf 7b...,
    // 2026-08-02, smoke T-WHP8-LC-7 failing three full runs straight). A strict
    // unparseable-stdin -> silent-exit reading of BR-016 silences the operator's only
    // passive channel under exactly those legitimate plumbings -- the one failure mode this
    // card exists to eliminate. Spec BR-016 amended accordingly (v1.1): stdin anomalies are
    // ignored; silence stays reserved for DB-unavailable / query-throw / all-empty.
    lib.readHookInput();

    const db = lib.openContextDb();
    if (!db) {
      process.exit(0);
    }

    try {
      const cfg = loadConfig();
      const nowMs = Date.now();

      const ack = queryPendingAck(db);
      const verify = queryPendingVerify(db);
      const close = queryPendingClose(db);
      const attention = queryRequiresAttention(db);
      const anomaly = queryWorkflowAnomaly(db);
      const heartbeat = queryGuardianHeartbeat(db, cfg.guardianStaleMin, nowMs);

      const { additionalContext, systemMessage } = renderDigest(
        { ack, verify, close, attention, anomaly, heartbeat },
        cfg,
        nowMs
      );

      if (!additionalContext) return; // BR-011: all six categories empty -> zero bytes

      // BR-025: systemMessage and hookSpecificOutput share this one stdout write --
      // a second process.stdout.write() call would concatenate into invalid JSON.
      process.stdout.write(JSON.stringify(buildPayload(additionalContext, systemMessage)));
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    try {
      process.stderr.write(`[worker-notify-inject] error: ${err.message}\n`);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadConfig,
  relativeTime,
  queryPendingAck,
  queryPendingVerify,
  queryPendingClose,
  queryRequiresAttention,
  queryWorkflowAnomaly,
  queryGuardianHeartbeat,
  renderDigest,
  buildPayload,
  truncate,
  DEFAULT_WORKER_NOTIFY_CONFIG,
};
