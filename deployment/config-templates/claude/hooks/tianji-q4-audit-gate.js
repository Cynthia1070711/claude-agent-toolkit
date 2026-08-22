#!/usr/bin/env node
/**
 * tianji-q4-audit-gate (F11)
 *
 * Forbidden Pattern F11: "Skip Q4 audit (existing capability check)."
 *
 * Event:    PreToolUse on Bash
 * Trigger:  command matches `git worktree add ... -b pilot/<id>`
 * Action:   Block if baseline_snapshots.audit_json IS NULL OR audit older
 *           than 3 days (codebase may have shifted).
 *
 * Why: Q4 asks "does the existing codebase already do this?" Skipping it
 * is how teams reinvent already-implemented capabilities. The 3-day
 * freshness window matches the AI-agent variant's cold-storage cadence.
 *
 * Threshold: Q4 staleness >= 3 days → block.
 */

'use strict';

const lib = require('./_lib');

const STALE_DAYS = 3;

(function main() {
  const input = lib.readHookInput();
  const command = input?.tool_input?.command;

  if (!lib.isGitWorktreeAdd(command)) {
    process.exit(0);
  }

  const externalId = lib.parseExternalIdFromCommand(command);
  if (!externalId) {
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    lib.softSkip('context-db unavailable; cannot enforce F11');
  }

  try {
    const row = db
      .prepare(
        `SELECT audit_json, q4_audit_score, q4_feature_match_pct,
                q4_verdict, created_at, updated_at
           FROM baseline_snapshots
          WHERE external_id = ?
          LIMIT 1`
      )
      .get(externalId);

    if (!row) {
      // F2 will catch this; F11 only fires when a row exists.
      process.exit(0);
    }

    if (!row.audit_json || row.audit_json === 'null') {
      lib.block(
        `F11 violation — Q4 audit (audit_json) is NULL for external_id="${externalId}".\n` +
          `  Action required: run audit-capability-reachability.cjs and persist ` +
          `the JSON result before piloting.\n` +
          `  Skipping Q4 risks re-implementing capabilities the codebase already has.`
      );
    }

    const stamp = row.updated_at || row.created_at;
    const ageDays = lib.daysBetween(new Date().toISOString(), stamp);
    if (ageDays !== null && ageDays > STALE_DAYS) {
      lib.block(
        `F11 violation — Q4 audit is ${ageDays.toFixed(1)} days old ` +
          `(threshold ${STALE_DAYS}d) for external_id="${externalId}".\n` +
          `  Action required: re-run audit-capability-reachability.cjs. ` +
          `Codebase may have shifted; stale audits hide newly-shipped capabilities.`
      );
    }

    // Optional advisory: warn if verdict was "activate existing" but pilot
    // is still proceeding. Do not block — that's a judgment call.
    if (row.q4_verdict === 'activate_existing') {
      process.stderr.write(
        `[tianji] NOTE: Q4 verdict was 'activate_existing' for "${externalId}". ` +
          `Confirm a separate pilot is genuinely needed.\n`
      );
    }

    process.exit(0);
  } catch (err) {
    lib.softSkip(`F11 query error: ${err.message}`);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
