// ============================================================
// PCPT Context Memory DB — Boy Scout Sweep
// DLA-05 Task 1 / AC-1~6 (BR-BS-01~08)
// ============================================================
// Usage:
//   node .context-db/scripts/boy-scout-sweep.js --files "a.ts,b.cs"            # dry-run (default)
//   node .context-db/scripts/boy-scout-sweep.js --files "a.ts,b.cs" --execute --story {id} --agent {id}
//   node .context-db/scripts/boy-scout-sweep.js --files "..." --output <path>  # custom report path
// ============================================================
// Contract (BR-BS-01~08):
//   BR-BS-01: Executes at dev-story Step 9, between Tasks Backfill (§7) and Skill Sync Gate (§8)
//   BR-BS-02: Accepts story file_list, queries tech_debt_items WHERE status='open' AND affected_files LIKE
//   BR-BS-03: 5-Min Rule 4-signal classifier (S1..S4 strict AND) = sweep candidate
//   BR-BS-04: IDD blacklist protection (S4=false → never sweep)
//   BR-BS-05: --execute resolves via upsert-debt.js --resolve + "boyscout-fixed" tag
//   BR-BS-06: --dry-run (default) outputs report only, no DB modification
//   BR-BS-07: 0 candidates → "Boy Scout Sweep: 0 candidates — clean pass"
//   BR-BS-08: Results recorded in Story tracking + dev_notes
// ============================================================
// Exit codes: 0=success, 1=argument error, 2=DB error, 3=report write failure
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import {
  DB_PATH,
  REPORTS_DIR,
  getTaiwanTimestamp,
  reportTimestamp,
  parseAffectedFiles,
} from './_migrations/tech-debt-schema.js';
import { classifyOne } from './debt-layer3-quickfix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Max candidates per sweep (BR-BS-03 boundary) ──
const MAX_CANDIDATES = 10;

// ── Parse CLI args ──
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    files: null,
    execute: args.includes('--execute'),
    dryRun: !args.includes('--execute'),
    story: null,
    agent: null,
    output: null,
  };

  const filesIdx = args.indexOf('--files');
  if (filesIdx >= 0 && args[filesIdx + 1]) {
    result.files = args[filesIdx + 1]
      .split(',')
      .map(f => f.trim().replace(/\.\.\//g, '').replace(/\.\.\\/g, '').replace(/^[/\\]+/, ''))
      .filter(Boolean);
  }

  const storyIdx = args.indexOf('--story');
  if (storyIdx >= 0 && args[storyIdx + 1]) result.story = args[storyIdx + 1];

  const agentIdx = args.indexOf('--agent');
  if (agentIdx >= 0 && args[agentIdx + 1]) result.agent = args[agentIdx + 1];

  const outputIdx = args.indexOf('--output');
  if (outputIdx >= 0 && args[outputIdx + 1]) result.output = args[outputIdx + 1];

  // --dry-run is also accepted explicitly (it's the default)
  return result;
}

// ── Validate args ──
function validateArgs(opts) {
  if (!opts.files || opts.files.length === 0) {
    console.log('Boy Scout Sweep: No files provided — clean pass ✅');
    process.exit(0);
  }
  if (opts.execute && !opts.story) {
    console.error('❌ Missing --story for execute mode');
    process.exit(1);
  }
  if (opts.execute && !opts.agent) {
    console.error('❌ Missing --agent for execute mode');
    process.exit(1);
  }
}

// ── Query open debts matching any file in file_list (BR-BS-02) ──
function queryMatchingDebts(db, files) {
  const allDebts = db.prepare(
    `SELECT id, debt_id, story_id, category, severity, title, affected_files,
            target_story, status, created_at, stale_reason
     FROM tech_debt_items
     WHERE status = 'open'
     ORDER BY id`
  ).all();

  const matched = [];
  for (const debt of allDebts) {
    const debtFiles = parseAffectedFiles(debt.affected_files);
    if (debtFiles.length === 0) continue;

    const debtFilesNorm = debtFiles.map(f => f.replace(/\\/g, '/'));
    let hit = false;

    for (const inputFile of files) {
      const inputNorm = inputFile.replace(/\\/g, '/');
      for (const df of debtFilesNorm) {
        // Match: exact, endsWith, or contains basename
        if (df === inputNorm ||
            df.endsWith('/' + inputNorm) ||
            inputNorm.endsWith('/' + df) ||
            df.includes(inputNorm) ||
            inputNorm.includes(df)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }

    if (hit) matched.push(debt);
  }

  return matched;
}

// ── Load intentional file set for S4 (reuse pattern from debt-layer3-quickfix.js) ──
function loadIntentionalFileSet() {
  const scannerPath = path.join(__dirname, 'scan-code-idd-references.js');
  if (!fs.existsSync(scannerPath)) {
    return new Set();
  }
  try {
    const out = execFileSync('node', [scannerPath, '--output', 'json'], {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    const fileSet = new Set();
    for (const a of (parsed.all_annotations ?? [])) {
      if (a.file) fileSet.add(a.file.replace(/\\/g, '/'));
    }
    return fileSet;
  } catch {
    return new Set();
  }
}

// ── Resolve a single debt via upsert-debt.js (BR-BS-05) ──
function resolveDebt(debtId, agent, story) {
  const upsertPath = path.join(__dirname, 'upsert-debt.js');
  try {
    execFileSync('node', [
      upsertPath, '--resolve', String(debtId),
      '--by', agent,
      '--in', story,
    ], {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Mark boyscout-fixed flag + stale_reason tag (BR-BS-05) ──
function markBoyscoutFixed(db, debtId, timestamp) {
  db.prepare(
    `UPDATE tech_debt_items
     SET boy_scout_fixed = 1,
         stale_reason = COALESCE(stale_reason,'') || CASE WHEN stale_reason IS NULL OR stale_reason='' THEN '' ELSE '; ' END || ?
     WHERE id = ?`
  ).run(`boyscout-fixed@${timestamp}`, debtId);
}

// ── Write JSON report ──
function writeReport(report, customPath) {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const reportPath = customPath || path.join(REPORTS_DIR, `boy-scout-sweep-${reportTimestamp()}.json`);
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    return reportPath;
  } catch (err) {
    console.error(`❌ Cannot write report to ${reportPath}: ${err.message}`);
    process.exit(3);
  }
}

// ── Main ──
function main() {
  const opts = parseArgs(process.argv);
  validateArgs(opts);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB not found at ${DB_PATH}`);
    process.exit(2);
  }

  const intentionalFiles = loadIntentionalFileSet();
  const db = new Database(DB_PATH);

  let matched;
  try {
    matched = queryMatchingDebts(db, opts.files);
  } catch (err) {
    console.error(`❌ DB query failed: ${err.message}`);
    db.close();
    process.exit(2);
  }

  // Classify each matched debt using the shared 4-signal classifier
  const candidates = [];
  const skipped = [];

  for (const debt of matched) {
    const { bucket, signals, exclusion_reason } = classifyOne(debt, intentionalFiles);
    const entry = {
      debt_id: debt.id,
      td_id: debt.debt_id,
      title: debt.title,
      affected_files: debt.affected_files,
      signals: {
        S1: signals.S1_single_file,
        S2: signals.S2_low_severity,
        S3: signals.S3_refactor_category,
        S4: signals.S4_not_intentional,
      },
    };

    if (bucket === 'quickFix') {
      entry.action = 'sweep-candidate';
      candidates.push(entry);
    } else {
      // Build reason string from failed signals
      const reasons = [];
      if (!signals.S1_single_file) reasons.push('S1=false (multi-file)');
      if (!signals.S2_low_severity) reasons.push(`S2=false (severity=${debt.severity})`);
      if (!signals.S3_refactor_category) reasons.push(`S3=false (category=${debt.category})`);
      if (!signals.S4_not_intentional) reasons.push('S4=false (intentional overlap)');
      entry.reason = reasons.join(', ') || exclusion_reason || 'does not pass 4-signal';
      skipped.push(entry);
    }
  }

  // Cap at MAX_CANDIDATES (BR boundary condition)
  const cappedCandidates = candidates.slice(0, MAX_CANDIDATES);
  const deferredCount = Math.max(0, candidates.length - MAX_CANDIDATES);

  const timestamp = getTaiwanTimestamp();
  const report = {
    metadata: {
      version: '1.0.0',
      script: 'boy-scout-sweep.js',
      timestamp,
      mode: opts.execute ? 'execute' : 'dry-run',
      story_id: opts.story || null,
      agent_id: opts.agent || null,
      files_scanned: opts.files,
      total_open_debts_matched: matched.length,
      sweep_candidates: cappedCandidates.length,
      sweep_skipped: skipped.length,
      deferred_to_next_sweep: deferredCount,
    },
    candidates: cappedCandidates,
    skipped,
  };

  // Execute mode: resolve each candidate (BR-BS-05)
  if (opts.execute) {
    const resolveResults = [];
    for (const c of cappedCandidates) {
      const result = resolveDebt(c.debt_id, opts.agent, opts.story);
      if (result.success) {
        markBoyscoutFixed(db, c.debt_id, timestamp);
        resolveResults.push({ debt_id: c.debt_id, status: 'resolved' });
      } else {
        // Non-fatal: log error but continue (boundary condition from Spec §5)
        resolveResults.push({ debt_id: c.debt_id, status: 'failed', error: result.error });
        console.warn(`⚠ Failed to resolve debt ${c.debt_id}: ${result.error}`);
      }
    }
    report.resolve_results = resolveResults;
  }

  // Write report
  const reportPath = writeReport(report, opts.output);

  db.close();

  // Output summary (BR-BS-07 / BR-BS-08)
  if (cappedCandidates.length === 0) {
    console.log('🧹 Boy Scout Sweep: 0 candidates — clean pass ✅');
  } else {
    const action = opts.execute ? 'fixed' : 'found';
    console.log(`🧹 Boy Scout Sweep: ${action} ${cappedCandidates.length} / skipped ${skipped.length} debts`);
    if (deferredCount > 0) {
      console.log(`   (${deferredCount} candidates deferred — cap at ${MAX_CANDIDATES} per sweep)`);
    }
  }
  console.log(`   report: ${reportPath}`);

  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) main();

export { queryMatchingDebts, MAX_CANDIDATES, parseArgs };
