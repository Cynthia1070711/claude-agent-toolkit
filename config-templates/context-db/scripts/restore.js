// ============================================================
// PCPT Context Memory DB — Ledger Disaster Recovery
// Replays ledger.jsonl into a fresh or corrupted DB
// ============================================================
// Usage:
//   node .context-db/scripts/restore.js                 # dry-run (report only)
//   node .context-db/scripts/restore.js --apply         # actually replay into DB
//   node .context-db/scripts/restore.js --apply --force # skip confirmation
//
// Prerequisite: DB must exist with tables created (run init-db.js first if needed)
// Ledger format: one JSON object per line { ts, table, op, data }
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const CONTEXT_DB_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(CONTEXT_DB_DIR, 'context-memory.db');
const LEDGER_PATH = path.join(CONTEXT_DB_DIR, 'ledger.jsonl');

const Database = require(path.join(CONTEXT_DB_DIR, 'node_modules', 'better-sqlite3'));

const isApply = process.argv.includes('--apply');
const isForce = process.argv.includes('--force');

// ──────────────────────────────────────────────
// Table → INSERT statement mapping
// ──────────────────────────────────────────────
const INSERT_MAP = {
  context_entries: {
    sql: `INSERT OR IGNORE INTO context_entries (agent_id, timestamp, category, title, content, tags, story_id, epic_id, related_files, session_id)
          VALUES (@agent_id, @timestamp, @category, @title, @content, @tags, @story_id, @epic_id, @related_files, @session_id)`,
    extract: (d) => ({
      agent_id: d.agent_id || 'restored',
      timestamp: d.timestamp || d.ts || null,
      category: d.category || 'session',
      title: d.title || '(restored from ledger)',
      content: d.content || '',
      tags: d.tags || null,
      story_id: d.story_id || null,
      epic_id: d.epic_id || null,
      related_files: d.related_files || null,
      session_id: d.session_id || null,
    }),
  },
  tech_entries: {
    sql: `INSERT OR IGNORE INTO tech_entries (created_by, created_at, category, title, outcome, problem, solution, lessons, tech_stack, tags, code_snippets, related_files, "references", confidence)
          VALUES (@created_by, @created_at, @category, @title, @outcome, @problem, @solution, @lessons, @tech_stack, @tags, @code_snippets, @related_files, @references, @confidence)`,
    extract: (d) => ({
      created_by: d.created_by || d.agent_id || 'restored',
      created_at: d.created_at || d.ts || null,
      category: d.category || 'review',
      title: d.title || '(restored from ledger)',
      outcome: d.outcome || 'success',
      problem: d.problem || null,
      solution: d.solution || null,
      lessons: d.lessons || null,
      tech_stack: d.tech_stack || null,
      tags: d.tags || null,
      code_snippets: d.code_snippets || null,
      related_files: d.related_files || null,
      references: d.references || null,
      confidence: d.confidence || 80,
    }),
  },
  workflow_executions: {
    sql: `INSERT OR IGNORE INTO workflow_executions (workflow_type, story_id, agent_id, status, started_at, completed_at, input_tokens, output_tokens, duration_ms, error_message)
          VALUES (@workflow_type, @story_id, @agent_id, @status, @started_at, @completed_at, @input_tokens, @output_tokens, @duration_ms, @error_message)`,
    extract: (d) => ({
      workflow_type: d.workflow_type || 'unknown',
      story_id: d.story_id || null,
      agent_id: d.agent_id || null,
      status: d.status || 'completed',
      started_at: d.started_at || d.ts || null,
      completed_at: d.completed_at || null,
      input_tokens: d.input_tokens || 0,
      output_tokens: d.output_tokens || 0,
      duration_ms: d.duration_ms || null,
      error_message: d.error_message || null,
    }),
  },
  benchmarks: {
    sql: `INSERT OR REPLACE INTO benchmarks (metric_name, context, baseline_value, current_value, unit, measured_at, notes)
          VALUES (@metric_name, @context, @baseline_value, @current_value, @unit, @measured_at, @notes)`,
    extract: (d) => ({
      metric_name: d.metric_name || 'unknown',
      context: d.context || 'global',
      baseline_value: d.baseline_value || null,
      current_value: d.current_value || 0,
      unit: d.unit || 'count',
      measured_at: d.measured_at || d.ts || null,
      notes: d.notes || null,
    }),
  },
};

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  console.log('=== PCPT Ledger Disaster Recovery ===');
  console.log(`Mode: ${isApply ? 'APPLY (write to DB)' : 'DRY-RUN (report only)'}`);
  console.log(`DB:     ${DB_PATH}`);
  console.log(`Ledger: ${LEDGER_PATH}`);
  console.log('');

  // Verify files exist
  if (!fs.existsSync(LEDGER_PATH)) {
    console.error('[ERROR] ledger.jsonl not found. Nothing to restore.');
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error('[ERROR] context-memory.db not found. Run init-db.js first.');
    process.exit(1);
  }

  // Read ledger
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(l => l.trim());
  console.log(`Ledger entries: ${lines.length}`);

  // Parse and categorize
  const stats = { total: 0, parsed: 0, skipped: 0, errors: 0, byTable: {} };
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    stats.total++;
    try {
      const entry = JSON.parse(lines[i]);
      if (!entry.table || !INSERT_MAP[entry.table]) {
        stats.skipped++;
        continue;
      }
      entries.push(entry);
      stats.parsed++;
      stats.byTable[entry.table] = (stats.byTable[entry.table] || 0) + 1;
    } catch (err) {
      stats.errors++;
      console.error(`  Line ${i + 1}: parse error — ${err.message}`);
    }
  }

  console.log('');
  console.log('--- Parse Summary ---');
  console.log(`Total lines:  ${stats.total}`);
  console.log(`Parsed:       ${stats.parsed}`);
  console.log(`Skipped:      ${stats.skipped} (unknown table)`);
  console.log(`Parse errors: ${stats.errors}`);
  console.log('');
  console.log('By table:');
  for (const [table, count] of Object.entries(stats.byTable)) {
    console.log(`  ${table}: ${count}`);
  }

  if (!isApply) {
    console.log('');
    console.log('[DRY-RUN] No changes made. Use --apply to replay into DB.');
    return;
  }

  // Confirmation (unless --force)
  if (!isForce) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question(`\nReplay ${stats.parsed} entries into DB? (yes/no): `, resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      return;
    }
  }

  // Apply
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const stmts = {};
  for (const [table, config] of Object.entries(INSERT_MAP)) {
    stmts[table] = db.prepare(config.sql);
  }

  let applied = 0;
  let duplicates = 0;

  const applyAll = db.transaction(() => {
    for (const entry of entries) {
      const config = INSERT_MAP[entry.table];
      const params = config.extract(entry.data || {});
      try {
        const result = stmts[entry.table].run(params);
        if (result.changes > 0) {
          applied++;
        } else {
          duplicates++;
        }
      } catch (err) {
        console.error(`  Replay error (${entry.table}): ${err.message}`);
      }
    }
  });

  applyAll();
  db.close();

  console.log('');
  console.log('--- Replay Summary ---');
  console.log(`Applied:    ${applied}`);
  console.log(`Duplicates: ${duplicates} (already in DB, skipped)`);
  console.log('');
  console.log('[OK] Restore complete.');
}

main().catch(err => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
