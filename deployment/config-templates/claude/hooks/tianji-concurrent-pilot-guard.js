#!/usr/bin/env node
/**
 * tianji-concurrent-pilot-guard (F3)
 *
 * Forbidden Pattern F3: "Run more than one pilot at a time."
 *
 * Event:    PreToolUse on Bash
 * Trigger:  command matches `git worktree add ... -b pilot/<id>`
 * Action:   Block if any external_evaluations row has decision='PILOT' AND
 *           pilot_end IS NULL (an active pilot already exists).
 *
 * Why: Concurrent pilots violate Principle 4 (single-variable causal
 * isolation). When two pilots run simultaneously, attribution of any
 * observed gain/regression becomes impossible.
 *
 * Override (rare): manually mark the prior pilot's pilot_end in DB
 * (rollback path) before starting a new one. There is no auto-override.
 */

'use strict';

const lib = require('./_lib');

(function main() {
  const input = lib.readHookInput();
  const command = input?.tool_input?.command;

  if (!lib.isGitWorktreeAdd(command)) {
    process.exit(0);
  }

  // Only enforce on pilot/* branches. Non-pilot worktrees are fine.
  const externalId = lib.parseExternalIdFromCommand(command);
  if (!externalId) {
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    lib.softSkip('context-db unavailable; cannot enforce F3');
  }

  try {
    const active = db
      .prepare(
        `SELECT ee.id, bs.external_id, ee.pilot_start, ee.pilot_timebox_days
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE ee.decision = 'PILOT' AND ee.pilot_end IS NULL`
      )
      .all();

    if (active.length > 0) {
      const summary = active
        .map(
          (r) =>
            `    - ${r.external_id} (started ${r.pilot_start}, ` +
            `timebox ${r.pilot_timebox_days}d)`
        )
        .join('\n');
      lib.block(
        `F3 violation — ${active.length} active pilot(s) detected:\n${summary}\n` +
          `  Action required: complete or rollback the existing pilot ` +
          `(set pilot_end) before starting a new one.\n` +
          `  Tianji-Pavilion enforces serial pilots to preserve causal attribution.`
      );
    }
    process.exit(0);
  } catch (err) {
    lib.softSkip(`F3 query error: ${err.message}`);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
