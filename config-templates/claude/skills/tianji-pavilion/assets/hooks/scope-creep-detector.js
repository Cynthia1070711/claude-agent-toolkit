#!/usr/bin/env node
/**
 * tianji-scope-creep-detector (F8)
 *
 * Forbidden Pattern F8: "Pilot expands beyond its declared spec-lite scope."
 *
 * Event:    PostToolUse on Edit|Write|MultiEdit
 * Action:   When the edited file is inside a `pilot/*` worktree (or the
 *           current cwd resolves to a pilot worktree), check whether the
 *           file_path falls within external_evaluations.scope_in_scope_paths.
 *           If outside → advisory + mark scope_creep_detected=1.
 *
 * Why: Pilots that creep beyond their spec-lite scope violate Principle 4
 * (single-variable causal isolation). The wider the change-surface, the
 * harder it becomes to attribute the post-pilot indicator delta to the
 * external resource specifically vs incidental refactors.
 *
 * Behaviour:
 *   - Never blocks. Edit/Write already completed by the time hook fires.
 *   - Emits additionalContext + writes a flag row to DB for Phase 5 review.
 *   - Uses a separate writable DB connection (not _lib's readonly default).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const lib = require('./_lib');

function getWorktreeName(cwd) {
  try {
    // Resolve to worktree root via git, then take basename. If the worktree
    // branch is `pilot/foo-bar`, we cannot get it cheaply here — instead we
    // match against external_evaluations.pilot_worktree which stores the path.
    const out = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      timeout: 1500,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function openWritableDb() {
  // PhyCool patch (2026-05-18): align to phycool.db SSoT (see _lib.js comment).
  // Also fall back to process.cwd() for parity with _lib.js resolveDbPath.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!projectDir) return null;
  const dbPath = path.join(projectDir, '.context-db', 'phycool.db');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const Database = require('better-sqlite3');
    return new Database(dbPath, { readonly: false, fileMustExist: true });
  } catch (err) {
    process.stderr.write(
      `[tianji] scope-creep-detector: cannot open DB writable: ${err.message}\n`
    );
    return null;
  }
}

function isInScope(filePath, scopePathsCsvOrJson, projectRoot) {
  if (!scopePathsCsvOrJson) return null; // no scope defined → cannot judge
  let scope;
  try {
    scope = JSON.parse(scopePathsCsvOrJson);
  } catch {
    scope = scopePathsCsvOrJson
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(scope) || scope.length === 0) return null;

  const absFile = path.resolve(filePath);
  for (const entry of scope) {
    const absEntry = path.resolve(projectRoot, entry);
    // Match if filePath is exactly absEntry OR is a descendant.
    if (absFile === absEntry) return true;
    const sep = absEntry.endsWith(path.sep) ? '' : path.sep;
    if (absFile.startsWith(absEntry + sep)) return true;
    // Also support glob-ish prefix without filesystem path normalization.
    if (entry.endsWith('/*') || entry.endsWith('\\*')) {
      const prefix = entry.slice(0, -2);
      if (filePath.includes(prefix)) return true;
    }
  }
  return false;
}

(function main() {
  const input = lib.readHookInput();
  const filePath =
    input?.tool_input?.file_path ||
    input?.tool_input?.path ||
    null;

  if (!filePath) {
    process.exit(0);
  }

  const cwd = input?.cwd || process.cwd();
  const worktreeRoot = getWorktreeName(cwd);
  if (!worktreeRoot) {
    process.exit(0);
  }

  const db = lib.openContextDb();
  if (!db) {
    process.exit(0); // silent
  }

  let row;
  try {
    row = db
      .prepare(
        `SELECT ee.id, ee.scope_in_scope_paths, ee.scope_creep_detected,
                bs.external_id
           FROM external_evaluations ee
           JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
          WHERE ee.pilot_worktree = ?
            AND ee.decision = 'PILOT'
            AND ee.pilot_end IS NULL
          LIMIT 1`
      )
      .get(worktreeRoot);
  } catch (err) {
    process.stderr.write(`[tianji] scope-creep query error: ${err.message}\n`);
    process.exit(0);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  if (!row) {
    process.exit(0); // not an active pilot worktree
  }

  const inScope = isInScope(filePath, row.scope_in_scope_paths, worktreeRoot);
  if (inScope === null) {
    process.stderr.write(
      `[tianji] WARN: pilot "${row.external_id}" has no scope_in_scope_paths; ` +
        `cannot enforce F8.\n`
    );
    process.exit(0);
  }
  if (inScope === true) {
    process.exit(0);
  }

  // Outside scope → mark and advise.
  const writable = openWritableDb();
  if (writable) {
    try {
      writable
        .prepare(
          `UPDATE external_evaluations
              SET scope_creep_detected = 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
        )
        .run(row.id);
    } catch (err) {
      process.stderr.write(
        `[tianji] scope-creep DB write error: ${err.message}\n`
      );
    } finally {
      try { writable.close(); } catch { /* ignore */ }
    }
  }

  lib.emitAdditionalContext(
    `[tianji] F8 advisory — edit to "${filePath}" is outside declared scope ` +
      `for pilot "${row.external_id}".\n` +
      `In-scope paths: ${row.scope_in_scope_paths}\n` +
      `scope_creep_detected has been flagged in DB. Phase 5 ADR must explain ` +
      `why the scope widened, or this pilot's outcome attribution is suspect.`,
    'PostToolUse'
  );
  process.exit(0);
})();
