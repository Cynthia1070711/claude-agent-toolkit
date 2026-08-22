#!/usr/bin/env node
/**
 * tianji-impulse-cooldown-guard (Principle 1.1 enforcement)
 *
 * Event:    PreToolUse on Bash
 * Trigger:  command matches `git worktree add ... -b pilot/<id>`
 * Action:   Block if baseline_snapshots.trigger_type='impulse' AND
 *           cold_storage_until > today.
 *
 * Why: Tianji-Pavilion Principle 1 — defend against impulse adoption.
 * AI-agent variant uses 3-day cold storage (vs original 7-day human variant)
 * because AI iteration cycles are faster but novelty bias is just as real.
 *
 * Edge case: If trigger_type IS NULL → assume non-impulse (allow).
 * If cold_storage_until IS NULL → not in cooldown (allow).
 */

'use strict';

const lib = require('./_lib');

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
    lib.softSkip('context-db unavailable; cannot enforce impulse cooldown');
  }

  try {
    const row = db
      .prepare(
        `SELECT trigger_type, cold_storage_until, first_seen_date
           FROM baseline_snapshots
          WHERE external_id = ?
          LIMIT 1`
      )
      .get(externalId);

    if (!row) {
      // F2 handles missing baseline; we only enforce when row exists.
      process.exit(0);
    }

    if (row.trigger_type !== 'impulse') {
      process.exit(0);
    }

    if (!row.cold_storage_until) {
      // Impulse-flagged but no cooldown date set → data error, advise.
      process.stderr.write(
        `[tianji] WARN: trigger_type='impulse' but cold_storage_until is NULL ` +
          `for "${externalId}". Allowing but log this.\n`
      );
      process.exit(0);
    }

    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // TZ FIX 2026-05-29: 台灣日界(對齊 _lib.js daysFromNow 寫入端,避傍晚後 over-block 8h)
    if (row.cold_storage_until > today) {
      const daysRemain = lib.daysBetween(row.cold_storage_until, today);
      lib.block(
        `Impulse cooldown violation — external_id="${externalId}" is ` +
          `impulse-triggered and still in cold storage.\n` +
          `  First seen: ${row.first_seen_date}\n` +
          `  Cold storage until: ${row.cold_storage_until} ` +
          `(${daysRemain !== null ? daysRemain.toFixed(0) : '?'} days remaining)\n` +
          `  Tianji AI-agent variant: 3-day cold storage protects against novelty bias.\n` +
          `  If the resource is still compelling after the cooldown, re-evaluate then.`
      );
    }

    process.exit(0);
  } catch (err) {
    lib.softSkip(`impulse cooldown query error: ${err.message}`);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
