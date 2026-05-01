// ============================================================
// PCPT Context Memory DB — Unified Stale Report (AC-11)
// DLA-04: Runs Layer 1 + Layer 2 in sequence, merges JSON output.
// ============================================================
// 使用方式:
//   node .context-db/scripts/debt-stale-report.js              # dry-run (預設)
//   node .context-db/scripts/debt-stale-report.js --execute    # 實際修改 DB
//   node .context-db/scripts/debt-stale-report.js --commits 100 # Layer 2 scan 100 commits
// ============================================================
// AC-11 canonical report keys:
//   schema_columns_added | normalized{status,category,severity}
//   stale_file_not_exist | stale_pattern_not_found
//   auto_fixed_by_commit | skill_review | deduped | archived
//   remaining_open | total_records
// ============================================================

import { fileURLToPath } from 'url';
import path from 'path';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const layer1Path = path.join(__dirname, 'debt-layer1-hygiene.js');
const layer2Path = path.join(__dirname, 'debt-layer2-stale.js');

const passthroughArgs = process.argv.slice(2);

function runLayer(scriptPath, label) {
  console.log(`\n━━━ ${label} ━━━`);
  let output;
  try {
    output = execFileSync(
      'node',
      [scriptPath, ...passthroughArgs],
      { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }
    );
  } catch (e) {
    console.error(`[error] ${label} failed: ${e.message}`);
    process.exit(1);
  }
  // Echo script stdout so user sees progress
  process.stdout.write(output);
  // Extract the trailing JSON block (after "=== Layer X Report ===")
  const match = output.match(/\n(\{[\s\S]*?\})\s*$/);
  if (!match) {
    console.error(`[error] ${label}: could not parse JSON report`);
    process.exit(1);
  }
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    console.error(`[error] ${label}: JSON parse failed — ${e.message}`);
    process.exit(1);
  }
}

// Sequential execution: Layer 1 MUST precede Layer 2 (normalization dependency)
const layer1 = runLayer(layer1Path, 'LAYER 1: DB Hygiene');
const layer2 = runLayer(layer2Path, 'LAYER 2: Stale Detection');

// Merge per AC-11 spec — use Layer 2's remaining_open (post-stale-detection is authoritative)
const unified = {
  timestamp: layer2.timestamp || layer1.timestamp,
  mode: layer1.mode,
  // Layer 1 metrics
  schema_columns_added: layer1.schema_columns_added ?? 0,
  normalized: layer1.normalized ?? { status: 0, category: 0, severity: 0 },
  stale_file_not_exist: layer1.stale_file_not_exist ?? 0,
  deduped: layer1.deduped ?? 0,
  cross_story_dedup: layer1.cross_story_dedup ?? 0,
  // Layer 2 metrics
  stale_pattern_not_found: layer2.stale_pattern_not_found ?? 0,
  auto_fixed_by_commit: layer2.auto_fixed_by_commit ?? 0,
  skill_review: layer2.skill_review ?? 0,
  // Final state (Layer 2 query is authoritative — runs after all Phase 3-5 work)
  archived: layer1.archived ?? 0,
  remaining_open: layer2.remaining_open ?? layer1.remaining_open ?? 0,
  total_records: layer1.total_records ?? 0,
};

console.log('\n━━━ UNIFIED STALE REPORT (AC-11) ━━━');
console.log(JSON.stringify(unified, null, 2));
