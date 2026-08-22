#!/usr/bin/env node
/**
 * tianji-baseline-snapshot-gate (F2)
 *
 * Forbidden Pattern F2: "Skip baseline measurement before pilot."
 *
 * Event:    PreToolUse on Bash
 * Trigger:  command matches `git worktree add ... -b pilot/<id>`
 * Action:   Block (exit 2) if no row in baseline_snapshots WHERE external_id = <id>.
 *
 * Why: A pilot without a baseline cannot produce a quantitative outcome
 * comparison in Phase 5. Tianji-Pavilion Principle 4 (verifiability) is
 * unenforceable without recorded baseline indicators.
 *
 * Bypass: If .context-db not initialised yet, hook soft-skips so the very
 * first project setup is not bricked. Run `db-patch-init-db.js apply` first.
 */

'use strict';

const lib = require('./_lib');

(function main() {
  const input = lib.readHookInput();
  const command = input?.tool_input?.command;

  if (!lib.isGitWorktreeAdd(command)) {
    process.exit(0); // not our concern
  }

  const externalId = lib.parseExternalIdFromCommand(command);
  if (!externalId) {
    // worktree add without pilot/<id> naming → not a tianji pilot, allow.
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    lib.softSkip('context-db unavailable; cannot enforce F2');
  }

  try {
    const row = db
      .prepare(
        'SELECT id FROM baseline_snapshots WHERE external_id = ? LIMIT 1'
      )
      .get(externalId);

    if (!row) {
      lib.block(
        `F2 violation — no baseline_snapshots row for external_id="${externalId}".\n` +
          `  Action required: complete Phase 0 Baseline Record and persist to DB ` +
          `before creating pilot worktree.\n` +
          `  Template: .claude/skills/tianji-pavilion/assets/templates/baseline-record.md`
      );
    }
    process.exit(0);
  } catch (err) {
    lib.softSkip(`F2 query error: ${err.message}`);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
