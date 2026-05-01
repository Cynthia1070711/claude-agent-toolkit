// ============================================================
// Smart Review-Fix — 修復驗證與回填工具
// 用途：驗證 Bug 已修復、批次更新 fix_status、產出驗證報告
// ============================================================
// 使用方式:
//   node .context-db/scripts/verify-fixes-against-findings.js --epic <id> --prepare
//   node .context-db/scripts/verify-fixes-against-findings.js --epic <id> --verify <finding_id> --status fixed --agent CC-OPUS
//   node .context-db/scripts/verify-fixes-against-findings.js --epic <id> --batch-verify --input <json> --agent CC-OPUS
//   node .context-db/scripts/verify-fixes-against-findings.js --epic <id> --stats
//   node .context-db/scripts/verify-fixes-against-findings.js --epic <id> --remaining
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

function nowTs() {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace('T', ' ').split('.')[0];
}

// ──── Query findings linked to an epic ────
function getEpicFindings(db, epicId) {
  const prefix = epicId.replace('epic-', '');
  return db.prepare(`
    SELECT f.*, s.status as story_status
    FROM review_findings f
    LEFT JOIN stories s ON f.fix_story_id = s.story_id
    WHERE f.fix_story_id LIKE ?
    ORDER BY
      CASE f.severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
      f.module_code, f.finding_id
  `).all(`${prefix}-%`);
}

// ──── Mode: --prepare ────
function prepareVerification(epicId) {
  const db = getDb();
  const findings = getEpicFindings(db, epicId);

  // Filter: linked to done stories + not yet verified
  const needVerify = findings.filter(f =>
    f.story_status === 'done' &&
    f.fix_status !== 'fixed' &&
    f.fix_status !== 'wont_fix' &&
    f.fix_status !== 'deferred'
  );

  const alreadyFixed = findings.filter(f => f.fix_status === 'fixed');
  const notDone = findings.filter(f => f.story_status !== 'done' && f.fix_status !== 'fixed');

  console.log(`\n=== Verification Preparation: ${epicId} ===`);
  console.log(`Total findings linked: ${findings.length}`);
  console.log(`Already verified (fixed): ${alreadyFixed.length}`);
  console.log(`Story not done yet: ${notDone.length}`);
  console.log(`Need verification: ${needVerify.length}\n`);

  if (needVerify.length === 0) {
    console.log('No findings need verification at this time.');
    db.close();
    return;
  }

  // Group by Story for organized verification
  const byStory = {};
  for (const f of needVerify) {
    const sid = f.fix_story_id || 'unlinked';
    if (!byStory[sid]) byStory[sid] = [];
    byStory[sid].push(f);
  }

  let noPathCount = 0;
  for (const [storyId, items] of Object.entries(byStory)) {
    console.log(`\n--- Story: ${storyId} (${items.length} findings) ---`);
    for (const f of items) {
      const hasPath = f.file_path && f.file_path.trim() !== '';
      const pathTag = hasPath ? '' : ' [NO FILE PATH — manual verify]';
      if (!hasPath) noPathCount++;

      console.log(`  [${f.severity}] ${f.finding_id}${pathTag}`);
      console.log(`    Title: ${f.title || '(no title)'}`);
      console.log(`    File: ${f.file_path || '(no path)'}:${f.line_number || '-'}`);
      console.log(`    Root Cause: ${(f.root_cause || '-').slice(0, 150)}`);
      console.log(`    Fix Suggestion: ${(f.fix_suggestion || '-').slice(0, 150)}`);
      if (f.regression_risk) {
        console.log(`    Regression Risk: ${f.regression_risk.slice(0, 100)}`);
      }
      console.log('');
    }
  }

  if (noPathCount > 0) {
    console.log(`\n⚠️ ${noPathCount} findings have no file_path — cannot verify by reading code.`);
    console.log(`   These require manual verification or architecture-level review.`);
  }

  // Output JSON for batch processing
  const outputPath = path.join(__dirname, '..', `verify-prep-${epicId}.json`);
  const prepData = needVerify.map(f => ({
    finding_id: f.finding_id,
    severity: f.severity,
    module_code: f.module_code,
    title: f.title,
    file_path: f.file_path,
    line_number: f.line_number,
    root_cause: f.root_cause,
    fix_suggestion: f.fix_suggestion,
    fix_story_id: f.fix_story_id,
    // Agent fills these:
    status: null,  // 'fixed' | 'open' | 'deferred'
    evidence: null, // 'file:line description'
  }));

  fs.writeFileSync(outputPath, JSON.stringify(prepData, null, 2), 'utf-8');
  console.log(`\nVerification template saved to: ${outputPath}`);
  console.log(`Agent: Read each file:line, fill status + evidence, then run --batch-verify`);

  db.close();
}

// ──── Mode: --verify (single finding) ────
function verifySingle(epicId, findingId, status, agent, notes) {
  const db = getDb();
  const ts = nowTs();

  const updates = {
    fix_status: status,
    verified_at: ts,
    verified_by: agent || 'CC-OPUS',
  };

  if (status === 'fixed') {
    updates.fixed_at = ts;
    updates.fixed_by = agent || 'CC-OPUS';
  }

  if (notes) {
    updates.fix_notes = notes;
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), ts, findingId];

  db.prepare(`
    UPDATE review_findings
    SET ${setClauses}, updated_at = ?
    WHERE finding_id = ?
  `).run(...values);

  console.log(`✅ ${findingId} → ${status} (by ${agent || 'CC-OPUS'} at ${ts})`);
  db.close();
}

// ──── Mode: --batch-verify ────
function batchVerify(epicId, inputPath, agent) {
  const db = getDb();
  const ts = nowTs();

  let items;
  if (inputPath.startsWith('{') || inputPath.startsWith('[')) {
    items = JSON.parse(inputPath);
  } else if (fs.existsSync(inputPath)) {
    items = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } else {
    console.error(`Error: Cannot read input: ${inputPath}`);
    process.exit(1);
  }

  if (!Array.isArray(items)) items = [items];

  const update = db.prepare(`
    UPDATE review_findings
    SET fix_status = ?,
        fixed_at = CASE WHEN ? = 'fixed' THEN ? ELSE fixed_at END,
        fixed_by = CASE WHEN ? = 'fixed' THEN ? ELSE fixed_by END,
        verified_at = ?,
        verified_by = ?,
        fix_notes = COALESCE(?, fix_notes),
        updated_at = ?
    WHERE finding_id = ?
  `);

  let updated = 0;
  let skipped = 0;

  const transaction = db.transaction(() => {
    for (const item of items) {
      if (!item.finding_id || !item.status) {
        console.warn(`  ⚠️ Skipping: missing finding_id or status — ${JSON.stringify(item).slice(0, 80)}`);
        skipped++;
        continue;
      }

      update.run(
        item.status,
        item.status, ts,
        item.status, agent || 'CC-OPUS',
        ts,
        agent || 'CC-OPUS',
        item.evidence || item.notes || null,
        ts,
        item.finding_id
      );
      updated++;
    }
  });

  transaction();

  console.log(`\n=== Batch Verification Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Agent: ${agent || 'CC-OPUS'}`);
  console.log(`Timestamp: ${ts}`);

  db.close();
}

// ──── Mode: --stats ────
function showStats(epicId) {
  const db = getDb();
  const findings = getEpicFindings(db, epicId);

  const stats = {
    total: findings.length,
    fixed: findings.filter(f => f.fix_status === 'fixed').length,
    open: findings.filter(f => f.fix_status === 'open').length,
    fixing: findings.filter(f => f.fix_status === 'fixing').length,
    deferred: findings.filter(f => f.fix_status === 'deferred').length,
    wont_fix: findings.filter(f => f.fix_status === 'wont_fix').length,
  };

  const fixRate = stats.total > 0 ? ((stats.fixed / stats.total) * 100).toFixed(1) : '0.0';

  console.log(`\n=== Verification Stats: ${epicId} ===`);
  console.log(`Total: ${stats.total}`);
  console.log(`Fixed: ${stats.fixed} (${fixRate}%)`);
  console.log(`Open: ${stats.open}`);
  console.log(`Fixing: ${stats.fixing}`);
  console.log(`Deferred: ${stats.deferred}`);
  console.log(`Won't Fix: ${stats.wont_fix}`);

  // Breakdown by severity
  console.log(`\n| Severity | Total | Fixed | Open | Rate |`);
  console.log(`|----------|-------|-------|------|------|`);

  for (const sev of ['P0', 'P1', 'P2', 'P3', 'P4']) {
    const sevFindings = findings.filter(f => f.severity === sev);
    const sevFixed = sevFindings.filter(f => f.fix_status === 'fixed').length;
    const sevOpen = sevFindings.filter(f => f.fix_status !== 'fixed' && f.fix_status !== 'deferred' && f.fix_status !== 'wont_fix').length;
    const rate = sevFindings.length > 0 ? ((sevFixed / sevFindings.length) * 100).toFixed(0) : '-';
    if (sevFindings.length > 0) {
      console.log(`| ${sev} | ${sevFindings.length} | ${sevFixed} | ${sevOpen} | ${rate}% |`);
    }
  }

  // Breakdown by module
  console.log(`\n| Module | Total | Fixed | Open | Rate |`);
  console.log(`|--------|-------|-------|------|------|`);

  const byMod = {};
  for (const f of findings) {
    const mod = f.module_code || 'unknown';
    if (!byMod[mod]) byMod[mod] = { total: 0, fixed: 0, open: 0 };
    byMod[mod].total++;
    if (f.fix_status === 'fixed') byMod[mod].fixed++;
    else if (f.fix_status !== 'deferred' && f.fix_status !== 'wont_fix') byMod[mod].open++;
  }

  for (const [mod, m] of Object.entries(byMod).sort((a, b) => b[1].open - a[1].open)) {
    const rate = m.total > 0 ? ((m.fixed / m.total) * 100).toFixed(0) : '-';
    console.log(`| ${mod} | ${m.total} | ${m.fixed} | ${m.open} | ${rate}% |`);
  }

  db.close();
}

// ──── Mode: --remaining ────
function showRemaining(epicId) {
  const db = getDb();
  const findings = getEpicFindings(db, epicId);

  const remaining = findings.filter(f =>
    f.fix_status !== 'fixed' &&
    f.fix_status !== 'deferred' &&
    f.fix_status !== 'wont_fix'
  );

  console.log(`\n=== Remaining Unfixed: ${epicId} (${remaining.length}) ===\n`);

  for (const f of remaining) {
    console.log(`  [${f.severity}] ${f.finding_id} — ${f.title || '(no title)'}`);
    console.log(`    Module: ${f.module_code} | Status: ${f.fix_status} | Story: ${f.fix_story_id || '-'}`);
    console.log(`    File: ${f.file_path || '-'}:${f.line_number || '-'}`);
    console.log('');
  }

  if (remaining.length === 0) {
    console.log('All findings are resolved (fixed/deferred/wont_fix).');
  }

  db.close();
}

// ──── CLI Router ────
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const epicId = getArg('--epic');
const findingId = getArg('--verify');
const status = getArg('--status');
const agent = getArg('--agent');
const inputPath = getArg('--input');
const notes = getArg('--notes');

if (args.includes('--prepare')) {
  if (!epicId) { console.error('Error: --epic required'); process.exit(1); }
  prepareVerification(epicId);
} else if (findingId && args.includes('--verify')) {
  if (!status) { console.error('Error: --status required (fixed/open/deferred)'); process.exit(1); }
  verifySingle(epicId, findingId, status, agent, notes);
} else if (args.includes('--batch-verify')) {
  if (!inputPath) { console.error('Error: --input required for --batch-verify'); process.exit(1); }
  batchVerify(epicId, inputPath, agent);
} else if (args.includes('--stats')) {
  if (!epicId) { console.error('Error: --epic required'); process.exit(1); }
  showStats(epicId);
} else if (args.includes('--remaining')) {
  if (!epicId) { console.error('Error: --epic required'); process.exit(1); }
  showRemaining(epicId);
} else {
  console.log(`
Usage:
  --epic <id> --prepare                               List findings needing verification
  --epic <id> --verify <finding_id> --status <s>      Mark single finding (fixed/open/deferred)
  --epic <id> --batch-verify --input <json> --agent <id>  Batch update from JSON
  --epic <id> --stats                                 Verification progress
  --epic <id> --remaining                             List unfixed findings
  `);
}
