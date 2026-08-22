// upsert-test-trace.js — bwu-3-dev-consume-review-audit T1.5 (BR-026/027/028)
//
// test_traceability's first writer (self-built — the card's own background claim
// of an existing "testarch-trace workflow writer" was checked and found false: that
// workflow only writes traceability-matrix.md, never touches the DB; the table's 7
// existing rows all carry the same linked_at, i.e. one seeding transaction, not a
// running writer).
//
// Usage:
//   node .context-db/scripts/upsert-test-trace.js --story <story_id> [--from-audit <json-file>] [--dry-run]

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';
import { runAudit } from './test-spec-audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'phycool.db');

const NOT_FOUND_PLACEHOLDER = '— (not found)';

function toTraceRow(row) {
  const testHit = row.testHit || null;
  return {
    ac_id: row.br,
    test_file: testHit ? testHit.substring(0, testHit.lastIndexOf(':')) : NOT_FOUND_PLACEHOLDER,
    test_name: row.case,
    test_type: row.level || 'unit',
    status: testHit ? 'covered' : 'pending',
  };
}

/**
 * @param {string|undefined} dbPath — undefined uses production phycool.db
 * @param {string} storyId
 * @param {Array<{case:string, br:string, level?:string, testHit:string|null}>} rows — audit rows
 * @param {{dryRun?: boolean}} [opts]
 * @returns {{wouldWrite: object[]}|{written: number}}
 */
export function writeTrace(dbPath, storyId, rows, opts = {}) {
  const traceRows = rows.map(toTraceRow);
  if (opts.dryRun) {
    return { wouldWrite: traceRows.map((r) => ({ ...r, story_id: storyId })) };
  }

  const db = new Database(dbPath || DEFAULT_DB_PATH);
  db.pragma('busy_timeout = 5000');
  try {
    const now = getTaiwanTimestamp();
    const stmt = db.prepare(`
      INSERT INTO test_traceability (ac_id, story_id, test_file, test_name, test_type, status, linked_at, verified_at)
      VALUES (@ac_id, @story_id, @test_file, @test_name, @test_type, @status, @linked_at, @verified_at)
      ON CONFLICT(ac_id, test_file, test_name) DO UPDATE SET
        status = excluded.status,
        verified_at = excluded.verified_at
    `);
    // The pre-existing UNIQUE key includes test_file, so a case whose test moved file —
    // or whose testHit went away (rename, deletion, or code-review §6.2 downgrading a
    // failed axis to the "— (not found)" placeholder) — INSERTs a second row and leaves
    // the old one behind still reading `covered`. One case = one test method = one file,
    // so drop the stale sibling first. Scoped by story_id + ac_id + test_name, so the
    // table's 7 seed rows (different stories) are untouched (BR-028).
    const dropStale = db.prepare(
      'DELETE FROM test_traceability WHERE story_id = @story_id AND ac_id = @ac_id AND test_name = @test_name AND test_file <> @test_file',
    );
    const txn = db.transaction(() => {
      for (const r of traceRows) {
        dropStale.run({ ...r, story_id: storyId });
        stmt.run({ ...r, story_id: storyId, linked_at: now, verified_at: now });
      }
    });
    txn.immediate();
    return { written: traceRows.length };
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const storyIdx = args.indexOf('--story');
  const fromAuditIdx = args.indexOf('--from-audit');

  if (storyIdx < 0 || !args[storyIdx + 1]) {
    console.error('❌ --story <story_id> 為必填參數');
    process.exit(1);
  }
  const storyId = args[storyIdx + 1];

  let rows;
  if (fromAuditIdx >= 0) {
    if (!args[fromAuditIdx + 1]) {
      console.error('❌ --from-audit 缺少路徑參數');
      process.exit(1);
    }
    const audit = JSON.parse(fs.readFileSync(args[fromAuditIdx + 1], 'utf8'));
    rows = audit.rows;
  } else {
    const { exitCode, result, error } = runAudit(storyId);
    if (exitCode !== 0) {
      console.error(`❌ audit failed: ${error}`);
      process.exit(exitCode);
    }
    rows = result.rows;
  }

  if (!rows || rows.length === 0) {
    console.log(`ℹ️  ${storyId}: 0 rows to trace (verdict was not consume, or table has no rows)`);
    process.exit(0);
  }

  const outcome = writeTrace(undefined, storyId, rows, { dryRun });
  if (dryRun) {
    console.log(JSON.stringify(outcome.wouldWrite, null, 2));
  } else {
    console.log(`✅ ${storyId}: wrote ${outcome.written} test_traceability row(s)`);
  }
  process.exit(0);
}
