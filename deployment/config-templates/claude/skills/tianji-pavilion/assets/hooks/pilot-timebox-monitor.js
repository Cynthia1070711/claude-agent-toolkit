#!/usr/bin/env node
/**
 * tianji-pilot-timebox-monitor (F5)
 *
 * Forbidden Pattern F5: "Pilot drifts past its timebox without decision."
 *
 * Event:    SessionStart (matcher: startup|resume)
 * Action:   Scan DB for pilots past their timebox. Emit additionalContext
 *           listing them so Claude proactively surfaces the issue.
 *
 * Why: AI-agent variant timeboxes (small=3d, medium=7d, large=14d) are
 * already aggressive. Drifting past them indicates either the resource
 * is harder than estimated (data point for Principle 5) or attention has
 * shifted. Either way: surface, force decision.
 *
 * This hook never blocks. It only injects advisory context.
 */

'use strict';

const lib = require('./_lib');

(function main() {
  // SessionStart provides minimal stdin; we don't need it but read to drain.
  lib.readHookInput();

  const db = lib.openContextDb();
  if (!db) {
    // No DB = no pilots to monitor. Silent exit.
    process.exit(0);
  }

  try {
    const overdue = db
      .prepare(
        `SELECT bs.external_id,
                ee.pilot_start,
                ee.pilot_timebox_days,
                ee.pilot_size,
                ee.pilot_worktree,
                CAST(julianday('now') - julianday(ee.pilot_start) AS REAL) AS days_elapsed
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE ee.decision = 'PILOT'
            AND ee.pilot_end IS NULL
            AND julianday('now') - julianday(ee.pilot_start) > ee.pilot_timebox_days
          ORDER BY days_elapsed DESC`
      )
      .all();

    const active = db
      .prepare(
        `SELECT bs.external_id, ee.pilot_start, ee.pilot_timebox_days,
                CAST(julianday('now') - julianday(ee.pilot_start) AS REAL) AS days_elapsed
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE ee.decision = 'PILOT' AND ee.pilot_end IS NULL`
      )
      .all();

    if (active.length === 0) {
      process.exit(0); // nothing active, silent
    }

    let msg = `[tianji] ${active.length} active pilot(s):\n`;
    for (const p of active) {
      const over = p.days_elapsed > p.pilot_timebox_days;
      const marker = over ? '⚠ OVERDUE' : 'on track';
      msg +=
        `  - ${p.external_id}: ${p.days_elapsed.toFixed(1)}d elapsed / ` +
        `${p.pilot_timebox_days}d timebox  (${marker})\n`;
    }

    if (overdue.length > 0) {
      msg +=
        `\n${overdue.length} pilot(s) past timebox — Phase 4 requires ` +
        `integrate-or-rollback decision NOW. F5 violation if left unresolved.`;
    }

    lib.emitAdditionalContext(msg, 'SessionStart');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[tianji] pilot-timebox-monitor error: ${err.message}\n`);
    process.exit(0); // never block session start
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
