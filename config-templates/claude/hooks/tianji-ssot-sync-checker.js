#!/usr/bin/env node
/**
 * tianji-ssot-sync-checker (F7)
 *
 * Forbidden Pattern F7: "Integrate a pilot without updating the SSoT
 * (Single Source of Truth) files — ADR, CHANGELOG, dependency manifest,
 * docs cross-references."
 *
 * Event:    PostToolUse on Bash
 * Trigger:  command matched `git commit` (any variant)
 * Action:   If the commit message contains a `tianji:` tag or mentions
 *           pilot integration, compare planned SSoT updates (stored in
 *           external_evaluations.ssot_updates_json) against the actual
 *           files changed in the commit. Emit advisory if planned files
 *           are missing.
 *
 * Never blocks. The user has already committed; this is post-hoc audit
 * that surfaces to Claude for the *next* turn so a follow-up commit can
 * close the gap.
 */

'use strict';

const { execSync } = require('child_process');
const lib = require('./_lib');

function isCommitCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  return /\bgit\s+commit\b/.test(cmd);
}

function getLastCommitMessage(cwd) {
  try {
    return execSync('git log -1 --pretty=%B', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
  } catch {
    return '';
  }
}

function getLastCommitFiles(cwd) {
  try {
    const out = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
      cwd,
      encoding: 'utf8',
      timeout: 2000,
    });
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractExternalIdFromMessage(msg) {
  // Recognise patterns:
  //   "tianji: integrate <external_id>"
  //   "[tianji/<external_id>] ..."
  //   "tianji(<external_id>): ..."
  const patterns = [
    /tianji:\s*(?:integrate|adopt|merge)\s+([A-Za-z0-9._-]+)/i,
    /\[tianji\/([A-Za-z0-9._-]+)\]/i,
    /tianji\(([A-Za-z0-9._-]+)\)/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) return m[1];
  }
  return null;
}

(function main() {
  const input = lib.readHookInput();
  const command = input?.tool_input?.command;
  const cwd = input?.cwd || process.cwd();

  if (!isCommitCommand(command)) {
    process.exit(0);
  }

  const msg = getLastCommitMessage(cwd);
  if (!msg) process.exit(0);

  const externalId = extractExternalIdFromMessage(msg);
  if (!externalId) {
    // Not a tianji-tagged commit; nothing to verify.
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    lib.softSkip('context-db unavailable; cannot verify SSoT sync');
  }

  try {
    const row = db
      .prepare(
        `SELECT ee.ssot_updates_json, ee.adr_path
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE bs.external_id = ?
          ORDER BY ee.id DESC
          LIMIT 1`
      )
      .get(externalId);

    if (!row || !row.ssot_updates_json) {
      // No planned SSoT files recorded → cannot verify. Advisory only.
      lib.emitAdditionalContext(
        `[tianji] F7 advisory — commit references "${externalId}" but no ` +
          `ssot_updates_json recorded. Confirm ADR + CHANGELOG + dependency ` +
          `manifest were updated.`,
        'PostToolUse'
      );
      process.exit(0);
    }

    let planned;
    try {
      planned = JSON.parse(row.ssot_updates_json);
    } catch {
      process.stderr.write(
        `[tianji] ssot_updates_json malformed for ${externalId}; skipping.\n`
      );
      process.exit(0);
    }
    if (!Array.isArray(planned)) planned = [];

    const actual = new Set(getLastCommitFiles(cwd));
    const missing = planned.filter((p) => {
      // Tolerate path separators (Windows vs POSIX).
      const norm = p.replace(/\\/g, '/');
      return !Array.from(actual).some(
        (a) => a.replace(/\\/g, '/') === norm
      );
    });

    if (missing.length > 0) {
      lib.emitAdditionalContext(
        `[tianji] F7 violation — pilot "${externalId}" integration commit is ` +
          `missing planned SSoT updates:\n` +
          missing.map((m) => `  - ${m}`).join('\n') +
          `\n\nAction: amend or add follow-up commit to update these files. ` +
          `An integrated pilot without SSoT sync leaves the codebase out-of-` +
          `band with its decision record.`,
        'PostToolUse'
      );
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`[tianji] ssot-sync-checker error: ${err.message}\n`);
    process.exit(0);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
})();
