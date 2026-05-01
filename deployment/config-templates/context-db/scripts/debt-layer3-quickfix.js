// ============================================================
// PCPT Context Memory DB — Debt Layer 3: Multi-Signal Quick-Fix Classifier
// DLA-08 Task 1 / AC-1 (BR-L3-01~05) — v2.0 業界標準 multi-signal pattern
// ============================================================
// 使用方式:
//   node .context-db/scripts/debt-layer3-quickfix.js              # dry-run (預設, BR-L3-05)
//   node .context-db/scripts/debt-layer3-quickfix.js --execute    # 寫入 stale_reason layer3 tag
//   node .context-db/scripts/debt-layer3-quickfix.js --output <path>  # 自訂報告路徑
//   node .context-db/scripts/debt-layer3-quickfix.js --explain <id>   # 顯示單筆 signal 分析
// ============================================================
// Contract (BR-L3-01~05):
//   BR-L3-01: Read all status='open' debts → quickFix + semantic (100% coverage)
//   BR-L3-02: Quick-Fix = multi-signal classifier (S1..S4 all true)
//   BR-L3-03: Semantic = NOT QuickFix (remainder)
//   BR-L3-04: Report to .context-db/reports/debt-layer3-{YYYYMMDD-HHMM}.json
//             with metadata + candidates + signal_breakdown
//   BR-L3-05: Default dry-run, --execute writes metadata tag
// ============================================================
// Multi-Signal Classifier (industry pattern: Snorkel / weak supervision)
//
//   S1 single_file        : affected_files.length ≤ 1
//   S2 low_severity       : severity_raw ∈ {low, p3, p4}    (raw, not canonicalized)
//   S3 refactor_category  : category (raw or canonical) ∈ refactor set
//   S4 not_intentional    : NO overlap with [Intentional:] code regions
//                           (BLOCKING — Skill §6.3 line 322 blacklist)
//
//   QuickFix  := S1 AND S2 AND S3 AND S4  (strict 4-of-4)
//   Semantic  := otherwise
//   Exclusion := S4 = false → ALWAYS semantic (IDD boundary protection)
//
// Additional observability signals (not used in classification, but reported):
//   S5 has_affected_files : affected_files IS NOT NULL
//   S6 stale              : age_days ≥ 180 (from created_at)
// ============================================================
// Exit codes:
//   0 — success
//   1 — argument error
//   2 — DB error
//   3 — report write failure
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
import { createBackup } from './debt-layer-rollback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Refactor category set (raw + canonical — handles mixed legacy data) ──
const REFACTOR_CATEGORIES = new Set([
  // canonical
  'CQD', 'TD', 'DD',
  // legacy aliases (from dla-04 pre-normalization)
  'duplication', 'refactor', 'documentation', 'code-quality',
  'defensive-coding', 'test-quality', 'verification', 'architecture',
]);

// ── Low-severity set (raw — NO canonicalization, handles p3/p4 literals) ──
const LOW_SEVERITIES = new Set(['low', 'p3', 'p4', 'P3', 'P4']);

// ── Intentional file set (loaded once via scan-code-idd-references.js) ──
// NOTE (CR fix dla-08 F-04): S4 exclusion only fires when Task 4.7b inline annotations exist.
// As of dla-08, ~150 expected annotation locations are deferred to Boy Scout sweep.
// scan-code-idd-references.js will return total=0 until annotations are added.
// While total=0: S4 is always TRUE for every debt, meaning IDD boundary protection
// is logically inactive. Layer 5 Alan review remains the safety net.
/* v8 ignore start — internal CLI-only function, not exported */
function loadIntentionalFileSet() {
  const scannerPath = path.join(__dirname, 'scan-code-idd-references.js');
  if (!fs.existsSync(scannerPath)) {
    console.warn('⚠ scan-code-idd-references.js not found — [Intentional:] exclusion skipped');
    return { files: new Set(), total: 0 };
  }
  try {
    const out = execFileSync('node', [scannerPath, '--output', 'json'], {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    const fileSet = new Set();
    const allAnnotations = parsed.all_annotations ?? [];
    for (const a of allAnnotations) {
      if (a.file) fileSet.add(a.file.replace(/\\/g, '/'));
    }
    if (allAnnotations.length === 0) {
      console.warn('⚠ S4 [Intentional:] exclusion DEACTIVATED — 0 annotations in code (Task 4.7b deferred). Falling back to Alan review (Layer 5) for IDD boundary protection.');
    }
    return { files: fileSet, total: allAnnotations.length };
  } catch (err) {
    console.warn(`⚠ scan-code-idd-references.js failed: ${err.message} — [Intentional:] exclusion skipped`);
    return { files: new Set(), total: 0 };
  }
}
/* v8 ignore stop */

// ── Age helper ──
function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ── Compute signals for one debt row ──
function computeSignals(row, intentionalFiles) {
  const files = parseAffectedFiles(row.affected_files);
  const fileNorm = files.map(f => f.replace(/\\/g, '/'));

  // S4: any overlap with intentional file regions?
  let intersectsIntentional = false;
  for (const f of fileNorm) {
    for (const iFile of intentionalFiles) {
      if (f === iFile || f.endsWith('/' + iFile) || iFile.endsWith('/' + f)) {
        intersectsIntentional = true;
        break;
      }
    }
    if (intersectsIntentional) break;
  }

  const sevRaw = row.severity ?? '';
  const catRaw = row.category ?? '';

  return {
    S1_single_file: files.length <= 1,
    S2_low_severity: LOW_SEVERITIES.has(sevRaw),
    S3_refactor_category: REFACTOR_CATEGORIES.has(catRaw),
    S4_not_intentional: !intersectsIntentional,
    S5_has_affected_files: files.length > 0,
    S6_stale: (() => {
      const d = daysSince(row.created_at);
      return d !== null && d >= 180;
    })(),
    file_count: files.length,
    age_days: daysSince(row.created_at),
  };
}

// ── Classify based on signals ──
function classifyOne(row, intentionalFiles) {
  const signals = computeSignals(row, intentionalFiles);
  const isQuickFix =
    signals.S1_single_file &&
    signals.S2_low_severity &&
    signals.S3_refactor_category &&
    signals.S4_not_intentional;

  const bucket = isQuickFix ? 'quickFix' : 'semantic';
  const exclusion_reason = !signals.S4_not_intentional
    ? 'S4:intersects_intentional_code_region'
    : null;

  return { bucket, signals, exclusion_reason };
}

/* v8 ignore start — internal CLI-only functions, not exported */
function toCandidate(row, classified) {
  return {
    id: row.id,
    debt_id: row.debt_id,
    title: row.title,
    category_raw: row.category,
    severity_raw: row.severity,
    affected_files: parseAffectedFiles(row.affected_files),
    story_id: row.story_id,
    target_story: row.target_story,
    created_at: row.created_at,
    bucket: classified.bucket,
    signals: classified.signals,
    exclusion_reason: classified.exclusion_reason,
  };
}

function writeReport(report, customPath) {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const reportPath = customPath || path.join(REPORTS_DIR, `debt-layer3-${reportTimestamp()}.json`);
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    return reportPath;
  } catch (err) {
    const e = new Error(`E-DLA-L3-02: cannot write report to ${reportPath}: ${err.message}`);
    e.code = 'E-DLA-L3-02';
    throw e;
  }
}

// ── Main ──
function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const outputIdx = args.indexOf('--output');
  const customOutput = outputIdx >= 0 ? args[outputIdx + 1] : null;
  const explainIdx = args.indexOf('--explain');
  const explainId = explainIdx >= 0 ? args[explainIdx + 1] : null;

  if (!fs.existsSync(DB_PATH)) {
    console.error(`E-DLA-L3-DB: DB not found at ${DB_PATH}`);
    process.exit(2);
  }

  const intentionalInfo = loadIntentionalFileSet();
  const intentionalFiles = intentionalInfo.files;

  const db = new Database(DB_PATH);
  let rows;
  try {
    rows = db.prepare(
      `SELECT id, debt_id, story_id, category, severity, title, affected_files, target_story, status, created_at
       FROM tech_debt_items
       WHERE status = 'open'
       ORDER BY id`
    ).all();
  } catch (err) {
    console.error(`E-DLA-L3-DB: query failed: ${err.message}`);
    db.close();
    process.exit(2);
  }

  // --explain mode: show signals for one debt
  if (explainId) {
    const row = rows.find(r => String(r.id) === String(explainId) || r.debt_id === explainId);
    if (!row) {
      console.error(`Debt not found: ${explainId}`);
      db.close();
      process.exit(1);
    }
    const { bucket, signals, exclusion_reason } = classifyOne(row, intentionalFiles);
    console.log(`Debt ${row.debt_id} (id=${row.id})`);
    console.log(`  title     : ${row.title}`);
    console.log(`  category  : ${row.category} / severity: ${row.severity}`);
    console.log(`  bucket    : ${bucket}`);
    console.log(`  signals   :`);
    for (const [k, v] of Object.entries(signals)) {
      console.log(`    ${k.padEnd(22)} = ${v}`);
    }
    if (exclusion_reason) console.log(`  exclusion : ${exclusion_reason}`);
    db.close();
    process.exit(0);
  }

  if (rows.length === 0) {
    console.log('ℹ  No open debts to classify (BR-L3-01: empty set) — exit 0');
    db.close();
    process.exit(0);
  }

  const quickFix = [];
  const semantic = [];
  const signalCounts = {
    S1_single_file: 0,
    S2_low_severity: 0,
    S3_refactor_category: 0,
    S4_not_intentional: 0,
    S5_has_affected_files: 0,
    S6_stale: 0,
  };

  for (const row of rows) {
    const classified = classifyOne(row, intentionalFiles);
    const candidate = toCandidate(row, classified);
    for (const key of Object.keys(signalCounts)) {
      if (classified.signals[key]) signalCounts[key] += 1;
    }
    (classified.bucket === 'quickFix' ? quickFix : semantic).push(candidate);
  }

  if (quickFix.length + semantic.length !== rows.length) {
    console.error(`BR-L3-01 violation: quickFix(${quickFix.length}) + semantic(${semantic.length}) != total(${rows.length})`);
    db.close();
    process.exit(2);
  }

  const timestamp = getTaiwanTimestamp();
  const report = {
    metadata: {
      version: '2.0.0',
      script: 'debt-layer3-quickfix.js',
      story_id: 'dla-08-current-debt-migration',
      timestamp,
      total: rows.length,
      quickFixCount: quickFix.length,
      semanticCount: semantic.length,
      mode: execute ? 'execute' : 'dry-run',
      classifier: 'multi-signal (S1..S4 strict AND)',
      intentional_files_count: intentionalFiles.size,
      intentional_annotations_total: intentionalInfo.total,
      signal_breakdown: signalCounts,
      br_reference: ['BR-L3-01', 'BR-L3-02', 'BR-L3-03', 'BR-L3-04', 'BR-L3-05'],
    },
    candidates: {
      quickFix,
      semantic,
    },
  };

  let reportPath;
  try {
    reportPath = writeReport(report, customOutput);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    db.close();
    process.exit(3);
  }

  if (execute) {
    // BR-RB-01: backup before any --execute write (CR fix dla-08 F-06)
    // Even though Layer 3 only appends to stale_reason metadata (non-destructive),
    // BR-RB-01 mandates "任何 --execute" — keep contract uniform across layers.
    try {
      const backup = createBackup('dla08-layer3-execute');
      console.log(`✅ pre-execute backup: ${backup.path} (${(backup.size_bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`❌ Backup failed, aborting Layer 3 execute: ${err.message}`);
      db.close();
      process.exit(2);
    }
    try {
      const updateStmt = db.prepare(
        `UPDATE tech_debt_items
         SET stale_reason = COALESCE(stale_reason,'') || CASE WHEN stale_reason IS NULL OR stale_reason='' THEN '' ELSE '; ' END || ?
         WHERE id = ?`
      );
      const tx = db.transaction(items => {
        for (const it of items) {
          const tag = `layer3:v2:${it.bucket}@${timestamp}`;
          updateStmt.run(tag, it.id);
        }
      });
      tx([...quickFix, ...semantic]);
      console.log(`✅ Layer 3 executed: wrote stale_reason tag on ${rows.length} rows`);
    } catch (err) {
      console.error(`❌ write failed: ${err.message}`);
      db.close();
      process.exit(2);
    }
  }

  db.close();

  console.log(`✅ Layer 3 v2.0 classified: ${rows.length} open → ${quickFix.length} quick-fix + ${semantic.length} semantic`);
  console.log(`   mode: ${execute ? 'execute' : 'dry-run (BR-L3-05 default)'}`);
  console.log(`   classifier: multi-signal S1..S4 strict AND`);
  console.log(`   [Intentional:] files loaded: ${intentionalFiles.size} (${intentionalInfo.total} annotations)`);
  console.log(`   report: ${reportPath}`);
  console.log(`   signal counts (of ${rows.length}):`);
  for (const [k, v] of Object.entries(signalCounts)) {
    const pct = ((v / rows.length) * 100).toFixed(0);
    console.log(`     ${k.padEnd(22)} = ${String(v).padStart(3)} (${pct}%)`);
  }

  process.exit(0);
}

/* v8 ignore start — CLI entry, tested via manual integration */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) main();
/* v8 ignore stop */

export { computeSignals, classifyOne, REFACTOR_CATEGORIES, LOW_SEVERITIES };
