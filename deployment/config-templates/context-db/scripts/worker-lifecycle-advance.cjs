'use strict';

// whp-8-report-ack-notify: CAS lifecycle advance running/revising -> reported.
// Extracted as a standalone module (same pattern as workflow-invoked-detect.js) so
// stop-report.ps1's inline JS template can require() it AND worker-notify-inject.test.js
// can import + exercise it directly against createTestDb() without spawning PowerShell.
//
// Fail-open: never throws. A DB-unwritable / locked connection surfaces as
// { ok: false, error } so the caller (stop-report.ps1) can log LIFECYCLE-WRITE-FAILED
// without losing the heartbeat/worker_handoffs writes that already ran (BR-006).
function advanceToReported(db, { runId, now }) {
  try {
    // updated_at belongs in this same statement (BR-001 / spec §3.3): today the sibling
    // heartbeat UPDATE happens to stamp it with the same @now, but this module is the seam
    // whp-11 will call on its own -- a standalone caller must not leave updated_at stale.
    const info = db.prepare(`
      UPDATE worker_runs SET
        lifecycle = 'reported',
        reported_at = @now,
        updated_at = @now
      WHERE run_id = @runId AND lifecycle IN ('running', 'revising')
    `).run({ runId, now });
    return { ok: true, changes: info.changes, error: null };
  } catch (e) {
    return { ok: false, changes: 0, error: e.message };
  }
}

module.exports = { advanceToReported };
