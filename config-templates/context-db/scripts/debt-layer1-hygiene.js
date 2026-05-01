// ============================================================
// PCPT Context Memory DB — Debt Layer 1: DB Hygiene
// DLA-04: Schema Migration + Normalization + File Check + Dedup + Archive
// ============================================================
// 使用方式:
//   node .context-db/scripts/debt-layer1-hygiene.js              # dry-run (預設)
//   node .context-db/scripts/debt-layer1-hygiene.js --execute    # 實際修改 DB
//   node .context-db/scripts/debt-layer1-hygiene.js --normalize  # 只做正規化 (跳過 Phase 3-5)
// ============================================================
// Unified report (AC-11): 執行 Layer 1 + Layer 2 合併報告請用
//   node .context-db/scripts/debt-stale-report.js [flags]
// ============================================================

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const normalizeOnly = args.includes('--normalize');
const dryRun = !execute;

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

// Parse affected_files: JSON array, comma-separated, or single path
// Strip both :line and :line-range suffixes (CR-L11: handle :207-275 format)
function parseAffectedFiles(raw) {
  if (!raw) return [];
  let files;
  try {
    files = JSON.parse(raw);
    if (!Array.isArray(files)) files = [String(files)];
  } catch {
    files = raw.split(',').map(f => f.trim()).filter(Boolean);
  }
  return files
    .map(f => f.replace(/:\d+(?:-\d+)?$/, '')) // strip :N or :N-M suffix
    .filter(Boolean);
}

// ── Phase 1: Schema Migration (idempotent ALTER TABLE) ──────────
function phase1SchemaMigration(db) {
  const existingCols = db.prepare('PRAGMA table_info(tech_debt_items)').all().map(r => r.name);
  const v3Columns = [
    { name: 'priority_score',      sql: 'ALTER TABLE tech_debt_items ADD COLUMN priority_score REAL' },
    { name: 'blast_radius',        sql: 'ALTER TABLE tech_debt_items ADD COLUMN blast_radius TEXT' },
    { name: 'business_impact',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN business_impact TEXT' },
    { name: 'fix_cost',            sql: 'ALTER TABLE tech_debt_items ADD COLUMN fix_cost TEXT' },
    { name: 'related_skills',      sql: 'ALTER TABLE tech_debt_items ADD COLUMN related_skills TEXT' },
    { name: 'platform_modules',    sql: 'ALTER TABLE tech_debt_items ADD COLUMN platform_modules TEXT' },
    { name: 'review_date',         sql: 'ALTER TABLE tech_debt_items ADD COLUMN review_date TEXT' },
    { name: 'accepted_reason',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN accepted_reason TEXT' },
    { name: 'boy_scout_fixed',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN boy_scout_fixed INTEGER DEFAULT 0' },
    { name: 'quick_fix_candidate', sql: 'ALTER TABLE tech_debt_items ADD COLUMN quick_fix_candidate INTEGER DEFAULT 0' },
    { name: 'stale_reason',        sql: 'ALTER TABLE tech_debt_items ADD COLUMN stale_reason TEXT' },
  ];

  const addedNames = [];
  for (const col of v3Columns) {
    if (!existingCols.includes(col.name)) {
      if (dryRun) {
        console.log(`[dry-run] Would add column: ${col.name}`);
      } else {
        db.exec(col.sql);
      }
      addedNames.push(col.name);
    }
  }

  if (!dryRun) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_debt_stale ON tech_debt_items(stale_reason)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_debt_category_v3 ON tech_debt_items(category)');
  }

  const added = addedNames.length;
  const suffix = added > 0 ? ` (${addedNames.join(', ')})` : '';
  console.log(`[Phase 1] Schema migration: ${added} columns ${dryRun ? 'to add' : 'added'}${suffix}`);
  return added;
}

// ── Phase 2: Status / Category / Severity Normalization ─────────
// Wrapped in db.transaction() for atomic execution (CR-M5): partial normalization
// leaks inconsistent state if process is interrupted; single transaction = all-or-nothing.
function phase2Normalization(db) {
  const result = { status: 0, category: 0, severity: 0 };

  // Status normalization (BR-002) — static constants, no SQL injection risk
  const statusMappings = [
    { where: "status IN ('wont_fix','WONT_FIX','WON_T_FIX')", to: 'wont-fix' },
    { where: "status IN ('DEFERRED','deferred','pending')",    to: 'open' },
    { where: "status = 'resolved'",                            to: 'fixed' },
  ];

  // Phase 1: dry-run preview (read-only counts)
  for (const m of statusMappings) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items WHERE ${m.where}`).get().c;
    result.status += count;
    if (count > 0 && dryRun) {
      console.log(`[dry-run] Status: ${count} rows WHERE ${m.where} → '${m.to}'`);
    }
  }
  const catCount = db.prepare(
    "SELECT COUNT(*) as c FROM tech_debt_items WHERE category IN ('wont_fix','deferred','WONT_FIX','WON_T_FIX','DEFERRED')"
  ).get().c;
  result.category = catCount;
  if (catCount > 0 && dryRun) {
    console.log(`[dry-run] Category: ${catCount} rows with status values → 'TD'`);
  }
  const sevCount = db.prepare(
    "SELECT COUNT(*) as c FROM tech_debt_items WHERE severity != LOWER(severity)"
  ).get().c;
  result.severity = sevCount;
  if (sevCount > 0 && dryRun) {
    console.log(`[dry-run] Severity: ${sevCount} rows with mixed case → lowercase`);
  }

  // Phase 2: atomic write (execute mode only)
  if (!dryRun) {
    const txn = db.transaction(() => {
      for (const m of statusMappings) {
        db.exec(`UPDATE tech_debt_items SET status = '${m.to}' WHERE ${m.where}`);
      }
      if (catCount > 0) {
        db.exec("UPDATE tech_debt_items SET category = 'TD' WHERE category IN ('wont_fix','deferred','WONT_FIX','WON_T_FIX','DEFERRED')");
      }
      if (sevCount > 0) {
        db.exec("UPDATE tech_debt_items SET severity = LOWER(severity)");
      }
    });
    txn();
  }

  console.log(`[Phase 2] Normalization: status=${result.status}, category=${result.category}, severity=${result.severity}`);
  return result;
}

// ── Phase 3: File Existence Check (BR-005) ──────────────────────
function phase3FileCheck(db) {
  const openDebts = db.prepare(
    "SELECT id, affected_files FROM tech_debt_items WHERE status = 'open' AND affected_files IS NOT NULL AND affected_files != ''"
  ).all();

  let staleCount = 0;
  const ts = getTaiwanTimestamp();

  for (const debt of openDebts) {
    const files = parseAffectedFiles(debt.affected_files);
    if (files.length === 0) continue;

    const allMissing = files.every(f => {
      const fullPath = path.resolve(PROJECT_ROOT, f);
      if (!fullPath.startsWith(PROJECT_ROOT)) return false; // L-02: path traversal boundary guard
      return !fs.existsSync(fullPath);
    });

    if (allMissing) {
      staleCount++;
      if (dryRun) {
        console.log(`[dry-run] File stale: id=${debt.id} — all files missing`);
      } else {
        db.prepare(
          "UPDATE tech_debt_items SET status = 'pending_archive', stale_reason = 'file_not_exist', resolved_at = ? WHERE id = ?"
        ).run(ts, debt.id);
      }
    }
  }

  console.log(`[Phase 3] File existence check: ${staleCount} stale (${openDebts.length} checked)`);
  return staleCount;
}

// ── Phase 4: Dedup Detection (BR-006) ───────────────────────────
// Returns { archived, cross_story } to feed unified report (CR-L3).
// Uses archivedSet to avoid counter inflation when >=3 records form a duplicate group (CR-L6).
function phase4Dedup(db) {
  const dupes = db.prepare(`
    SELECT t1.id as old_id, t2.id as new_id, t1.title,
           t1.story_id as old_story, t2.story_id as new_story
    FROM tech_debt_items t1
    JOIN tech_debt_items t2 ON t1.title = t2.title
      AND COALESCE(t1.affected_files, '') = COALESCE(t2.affected_files, '')
      AND t1.id < t2.id
    WHERE t1.status NOT IN ('archived', 'pending_archive', 'fixed', 'wont-fix')
      AND t2.status NOT IN ('archived', 'pending_archive', 'fixed', 'wont-fix')
  `).all();

  const archivedSet = new Set();
  let crossStoryCount = 0;
  const ts = getTaiwanTimestamp();

  for (const d of dupes) {
    if (d.old_story !== d.new_story) {
      crossStoryCount++;
      console.log(`[info] Cross-story dup: id=${d.old_id} (${d.old_story}) ↔ id=${d.new_id} (${d.new_story}) — manual review`);
      continue;
    }
    if (archivedSet.has(d.old_id)) continue; // already archived earlier in this group
    archivedSet.add(d.old_id);
    if (dryRun) {
      console.log(`[dry-run] Dedup: archive id=${d.old_id}, keep id=${d.new_id} — "${d.title.slice(0, 60)}"`);
    } else {
      db.prepare(
        "UPDATE tech_debt_items SET status = 'archived', stale_reason = 'duplicate', resolved_at = ? WHERE id = ?"
      ).run(ts, d.old_id);
    }
  }

  const dedupCount = archivedSet.size;
  console.log(`[Phase 4] Dedup: ${dedupCount} archived, ${crossStoryCount} cross-story flagged`);
  return { archived: dedupCount, cross_story: crossStoryCount };
}

// ── Phase 5a: Compaction Preprune Cleanup (td-37, 14-day retention) ────
function phase5aCompactionPrepruneCleanup(db) {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';

  const count = db.prepare(
    "SELECT COUNT(*) as c FROM context_entries WHERE category = 'compaction_preprune' AND timestamp < ?"
  ).get(cutoff).c;

  if (count > 0) {
    if (dryRun) {
      console.log(`[dry-run] Compaction preprune cleanup: ${count} records older than 14 days`);
    } else {
      db.prepare(
        "DELETE FROM context_entries WHERE category = 'compaction_preprune' AND timestamp < ?"
      ).run(cutoff);
    }
  }

  console.log(`[Phase 5a] Compaction preprune cleanup: ${count} ${dryRun ? 'to delete' : 'deleted'} (> 14 days)`);
  return count;
}

// ── Phase 5: Archive Lifecycle (BR-010/011) ─────────────────────
function phase5Archive(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00'; // M-02: align with getTaiwanTimestamp() format

  const pendingOld = db.prepare(
    "SELECT id FROM tech_debt_items WHERE status = 'pending_archive' AND resolved_at IS NOT NULL AND resolved_at < ?"
  ).all(thirtyDaysAgo);

  let archivedCount = 0;
  for (const row of pendingOld) {
    archivedCount++;
    if (dryRun) {
      console.log(`[dry-run] Archive: id=${row.id} — pending_archive > 30 days`);
    } else {
      db.prepare("UPDATE tech_debt_items SET status = 'archived' WHERE id = ?").run(row.id);
    }
  }

  console.log(`[Phase 5] Archive lifecycle: ${archivedCount} archived (> 30 days)`);
  return archivedCount;
}

// ── Main ────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('[ERROR] DB not found:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Report uses AC-11 canonical key names (CR-M3):
  //   stale_file_not_exist / deduped / cross_story_dedup / archived / remaining_open / total_records
  const report = {
    timestamp: getTaiwanTimestamp(),
    mode: dryRun ? 'dry-run' : 'execute',
    schema_columns_added: 0,
    normalized: { status: 0, category: 0, severity: 0 },
    stale_file_not_exist: 0,
    deduped: 0,
    cross_story_dedup: 0,
    archived: 0,
    preprune_cleaned: 0,
    remaining_open: 0,
    total_records: 0,
  };

  try {
    report.schema_columns_added = phase1SchemaMigration(db);
    report.normalized = phase2Normalization(db);

    if (!normalizeOnly) {
      report.stale_file_not_exist = phase3FileCheck(db);
      const dedupResult = phase4Dedup(db);
      report.deduped = dedupResult.archived;
      report.cross_story_dedup = dedupResult.cross_story;
      report.archived = phase5Archive(db);
      report.preprune_cleaned = phase5aCompactionPrepruneCleanup(db);
    }

    report.remaining_open = db.prepare("SELECT COUNT(*) as c FROM tech_debt_items WHERE status = 'open'").get().c;
    report.total_records = db.prepare("SELECT COUNT(*) as c FROM tech_debt_items").get().c;
  } finally {
    db.close();
  }

  console.log('\n=== Layer 1 Report ===');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { parseAffectedFiles, phase1SchemaMigration, phase2Normalization, phase3FileCheck, phase4Dedup, phase5Archive, phase5aCompactionPrepruneCleanup };
