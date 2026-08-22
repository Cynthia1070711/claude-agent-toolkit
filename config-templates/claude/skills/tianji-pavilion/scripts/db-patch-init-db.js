#!/usr/bin/env node
/**
 * db-patch-init-db.js — Tianji-Pavilion DB schema patch
 *
 * Adds baseline_snapshots + external_evaluations tables to .context-db/context.db.
 * Idempotent: uses CREATE TABLE IF NOT EXISTS. Safe to run multiple times.
 *
 * Usage:
 *   node db-patch-init-db.js apply     # create tables
 *   node db-patch-init-db.js verify    # check schema
 *   node db-patch-init-db.js status    # show row counts
 *
 * Integration with existing init-db.js:
 *   This script can either run standalone or be require()d from init-db.js:
 *   ```js
 *   const { applyTianjiSchema } = require(
 *     '.claude/skills/tianji-pavilion/scripts/db-patch-init-db.js'
 *   );
 *   applyTianjiSchema(db);
 *   ```
 *
 * Exit codes:
 *   0 — success
 *   1 — verify failed (schema mismatch)
 *   2 — apply/IO error
 */

'use strict';

const path = require('path');
const fs = require('fs');

// PhyCool patch (2026-05-18): default to phycool.db (project SSoT per
// `.context-db/scripts/init-db.js:21` + `.context-db/server.js:33`).
// Override path via 3rd CLI arg if needed.
const DEFAULT_DB_PATH = path.join(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  '.context-db', 'phycool.db'
);

const SCHEMA_BASELINE_SNAPSHOTS = `
CREATE TABLE IF NOT EXISTS baseline_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'workflow', 'skill', 'hook', 'rule', 'agent',
    'mcp_server', 'methodology', 'prompt_template', 'other'
  )),
  source_url TEXT,
  first_seen_date TEXT NOT NULL,
  evaluator_session TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'pain', 'quarterly', 'active_monitor', 'impulse'
  )),
  cold_storage_until TEXT,
  q1_answer TEXT,
  q2_answer TEXT,
  q3_answer TEXT,
  q4_audit_score REAL,
  q4_feature_match_pct INTEGER,
  q4_verdict TEXT CHECK (q4_verdict IN (
    'activate_existing', 'partial_coverage', 'invocation_fix', 'proceed'
  )),
  audit_json TEXT,
  baseline_tokens INTEGER,
  baseline_time_sec REAL,
  baseline_success_rate REAL,
  baseline_bug_freq REAL,
  baseline_maint_cost_hrs REAL,
  predicted_quadrant TEXT CHECK (predicted_quadrant IN ('A', 'B', 'C', 'D')),
  supreme_conflicts TEXT,
  baseline_record_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const SCHEMA_EXTERNAL_EVALUATIONS = `
CREATE TABLE IF NOT EXISTS external_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baseline_id INTEGER NOT NULL REFERENCES baseline_snapshots(id),
  evaluation_round INTEGER NOT NULL DEFAULT 1,
  exit_phase TEXT NOT NULL CHECK (exit_phase IN (
    'phase0', 'phase1_2', 'phase3', 'phase4', 'phase5'
  )),
  decision TEXT NOT NULL CHECK (decision IN (
    'GO', 'PILOT', 'REJECT', 'ACTIVATE_EXISTING'
  )),
  quadrant TEXT CHECK (quadrant IN ('A', 'B', 'B-prime', 'C', 'D')),
  estimated_gain_pct REAL,
  is_safety_exception INTEGER DEFAULT 0,
  reject_reason TEXT,
  cooldown_until TEXT,
  re_eval_trigger_condition TEXT,
  pilot_size TEXT CHECK (pilot_size IN ('small', 'medium', 'large')),
  pilot_worktree TEXT,
  pilot_start TEXT,
  pilot_end TEXT,
  pilot_timebox_days INTEGER,
  kill_switch_triggered TEXT,
  adversarial_pass_count INTEGER,
  adversarial_total INTEGER DEFAULT 3,
  scope_creep_detected INTEGER DEFAULT 0,
  scope_in_scope_paths TEXT,
  ssot_updates_json TEXT,
  actual_tokens INTEGER,
  actual_time_sec REAL,
  actual_success_rate REAL,
  actual_bug_freq REAL,
  actual_maint_cost_hrs REAL,
  estimate_accuracy_delta_pct REAL,
  side_effects TEXT,
  adr_path TEXT,
  observation_end_date TEXT,
  -- v1.3.0 GitNexus integration: blast radius tracking (JSON)
  estimated_blast_radius TEXT,
  actual_blast_radius TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_baseline_external_id ON baseline_snapshots(external_id);',
  'CREATE INDEX IF NOT EXISTS idx_baseline_q4_verdict ON baseline_snapshots(q4_verdict);',
  'CREATE INDEX IF NOT EXISTS idx_baseline_created_at ON baseline_snapshots(created_at);',
  'CREATE INDEX IF NOT EXISTS idx_eval_baseline_id ON external_evaluations(baseline_id);',
  'CREATE INDEX IF NOT EXISTS idx_eval_decision ON external_evaluations(decision);',
  'CREATE INDEX IF NOT EXISTS idx_eval_cooldown ON external_evaluations(cooldown_until);',
  'CREATE INDEX IF NOT EXISTS idx_eval_pilot_end ON external_evaluations(pilot_end);',
];

// Includes id (PK), created_at, updated_at + 22/32 domain columns.
// v1.3.0 (2026-05-18): external_evaluations gained 2 GitNexus columns
// (estimated_blast_radius, actual_blast_radius) — 33 → 35.
const EXPECTED_BASELINE_COLS = 25;
const EXPECTED_EVAL_COLS = 35;

/**
 * Open DB. Returns null if better-sqlite3 not installed.
 */
function openDb(dbPath) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('[tianji-db-patch] better-sqlite3 not found. Install via:');
    console.error('  npm install better-sqlite3');
    console.error('Or run from within .context-db where it is already installed.');
    return null;
  }
  if (!fs.existsSync(dbPath)) {
    console.error(`[tianji-db-patch] DB not found: ${dbPath}`);
    console.error('Run init-db.js first to create the .context-db.');
    return null;
  }
  return new Database(dbPath);
}

function applyTianjiSchema(db) {
  db.exec(SCHEMA_BASELINE_SNAPSHOTS);
  db.exec(SCHEMA_EXTERNAL_EVALUATIONS);
  for (const idx of INDEXES) {
    db.exec(idx);
  }
  return { applied: true };
}

function verifyTianjiSchema(db) {
  const baselineCols = db.prepare(`PRAGMA table_info(baseline_snapshots)`).all();
  const evalCols = db.prepare(`PRAGMA table_info(external_evaluations)`).all();
  const errors = [];
  if (baselineCols.length === 0) {
    errors.push('baseline_snapshots table missing');
  } else if (baselineCols.length !== EXPECTED_BASELINE_COLS) {
    errors.push(`baseline_snapshots has ${baselineCols.length} cols, expected ${EXPECTED_BASELINE_COLS}`);
  }
  if (evalCols.length === 0) {
    errors.push('external_evaluations table missing');
  } else if (evalCols.length !== EXPECTED_EVAL_COLS) {
    errors.push(`external_evaluations has ${evalCols.length} cols, expected ${EXPECTED_EVAL_COLS}`);
  }
  return { ok: errors.length === 0, errors, baselineCols, evalCols };
}

function statusTianjiSchema(db) {
  let baselineCount = null;
  let evalCount = null;
  try {
    baselineCount = db.prepare('SELECT COUNT(*) as n FROM baseline_snapshots').get().n;
    evalCount = db.prepare('SELECT COUNT(*) as n FROM external_evaluations').get().n;
  } catch (e) {
    return { error: e.message };
  }
  return { baselineCount, evalCount };
}

function main(argv) {
  const cmd = argv[2] || 'apply';
  const dbPath = argv[3] || DEFAULT_DB_PATH;

  const db = openDb(dbPath);
  if (!db) return 2;

  try {
    if (cmd === 'apply') {
      applyTianjiSchema(db);
      const verify = verifyTianjiSchema(db);
      if (verify.ok) {
        console.log('[tianji-db-patch] applied');
        console.log(`  baseline_snapshots schema: ${verify.baselineCols.length} columns`);
        console.log(`  external_evaluations schema: ${verify.evalCols.length} columns`);
        return 0;
      } else {
        console.error('[tianji-db-patch] applied but verify failed:');
        for (const e of verify.errors) console.error('  - ' + e);
        return 1;
      }
    } else if (cmd === 'verify') {
      const verify = verifyTianjiSchema(db);
      if (verify.ok) {
        console.log('[tianji-db-patch] verify OK');
        console.log(`  baseline_snapshots: ${verify.baselineCols.length} columns`);
        console.log(`  external_evaluations: ${verify.evalCols.length} columns`);
        return 0;
      } else {
        console.error('[tianji-db-patch] verify FAILED:');
        for (const e of verify.errors) console.error('  - ' + e);
        return 1;
      }
    } else if (cmd === 'status') {
      const s = statusTianjiSchema(db);
      if (s.error) {
        console.error('[tianji-db-patch] status error: ' + s.error);
        return 1;
      }
      console.log('[tianji-db-patch] status:');
      console.log(`  baseline_snapshots rows: ${s.baselineCount}`);
      console.log(`  external_evaluations rows: ${s.evalCount}`);
      return 0;
    } else {
      console.error(`[tianji-db-patch] unknown command: ${cmd}`);
      console.error('Usage: node db-patch-init-db.js [apply|verify|status] [db_path]');
      return 2;
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  applyTianjiSchema,
  verifyTianjiSchema,
  statusTianjiSchema,
  SCHEMA_BASELINE_SNAPSHOTS,
  SCHEMA_EXTERNAL_EVALUATIONS,
  INDEXES,
};
