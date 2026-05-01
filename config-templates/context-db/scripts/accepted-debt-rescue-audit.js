// ============================================================
// PCPT Context Memory DB — Accepted/Deferred Debt R3-Rescue Audit
// td-accepted-debt-r3-rescue-sweep (epic-dla, P2/S)
// ============================================================
// 目的: 系統性掃描所有 ACCEPTED/DEFERRED tech debt，
//       套用 R3-rescue feasibility scoring + Orphan/Zombie detection
//       驗證 eft-dashboard-monetization-funnel F7 10x-bias 是孤例或系統性問題。
//
// Usage:
//   node .context-db/scripts/accepted-debt-rescue-audit.js --feasibility all
//   node .context-db/scripts/accepted-debt-rescue-audit.js --feasibility all --output <path>
//   node .context-db/scripts/accepted-debt-rescue-audit.js --resolve-top --by <agent> --in <story>
//   node .context-db/scripts/accepted-debt-rescue-audit.js --explain <debt-id>
//   node .context-db/scripts/accepted-debt-rescue-audit.js --mode backfill-rationale --by <agent> --in <story>
//
// Exit codes: 0=success, 1=argument error, 2=DB error, 3=report write failure
// ============================================================
//
// Feasibility Scoring Formula (R3-rescue 10x ratio calibration, v2 + orphan detection):
//   Base score: 40
//   Delta rules (12 rules total):
//     D1 : severity=low                   → +10 (低嚴重度更可能被高估 FixCost)
//     D2 : category=CQD/TD                → +10 (程式碼質量 debt 通常修復快)
//     D3 : fix_cost IS NULL               → +10 (尚未 spike,潛在高估;v2 下調 15→10 避免 97% 觸發)
//     D4 : affected_files ≤ 1             → +10 (單一檔案修復 FixCost 最低)
//     D5 : description 含 empirical keyword → +10
//     D6 : description 含 blocker keyword → -20
//     D7 : target_story 非 null           → -5 (已有歸因 Story,本 sweep 範疇外)
//     D8 : severity=critical/high         → -20 (高嚴重度有特定修復流程)
//     D9 : category=IDD/intentional       → -999 (絕對排除)
//     D10: origin_story.status='done'     → +10 (殭屍 debt,源 Story 已 close)
//     D11: target_story.status='done'     → +20 (孤兒 debt,target 已失去承接能力)
//     D12: target_story 不存在 stories 表 → +15 (虛構 cleanup story 名,承接失效)
//   Bucket: Low(0-39) / Medium(40-64) / High(65-100)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DB_PATH,
  REPORTS_DIR,
  getTaiwanTimestamp,
  reportTimestamp,
  parseAffectedFiles,
} from './_migrations/tech-debt-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Audit target categories (non-IDD, non-production era) ──
// BR-SWEEP-AUDIT-01: category IN ('accepted','deferred','TD','CQD','test','test-coverage','migration')
export const AUDIT_CATEGORIES = new Set([
  'accepted', 'deferred', 'TD', 'CQD', 'test', 'test-coverage', 'migration',
  // additional legacy aliases that map to same semantic
  'test-quality', 'verification',
]);

// ── Status values treated as "still open" (case-insensitive variants) ──
// CR finding F4: DB 有 'ACCEPTED'/'accepted'/'deferred'/'open'/'pending_archive' 等變體
export const OPEN_STATUSES = new Set(['open', 'accepted', 'deferred', 'pending_archive']);

// ── Empirical keyword patterns (D5: infrastructure already available) ──
const EMPIRICAL_KEYWORDS = [
  /WebApplicationFactory/i,
  /已就緒/,
  /既有/,
  /已存在/,
  /already\s+exist/i,
  /existing\s+(infra|test|factory|pattern)/i,
  /available/i,
  /Testcontainers/i,
  /AssetServiceFix10Tests/i,  // known working pattern in this codebase
];

// ── Blocker keyword patterns (D6: genuine blockers) ──
const BLOCKER_KEYWORDS = [
  /schema\s+migration/i,
  /production\s+data/i,
  /需要(?:重新)?設計/,
  /needs?\s+design/i,
  /API\s+breaking/i,
  /DB\s+migration/i,
  /breaking\s+change/i,
  /cross[- ]epic\s+refactor/i,
  /ARCHITECTURE_REDESIGN/i,
  /INFRASTRUCTURE_CHANGE/i,
];

// ── Story status lookup helper ──
// Returns Map<story_id, status>. Accepts (db, stories?) where stories optional pre-fetched rows.
export function buildStoryStatusMap(db, stories) {
  const map = new Map();
  const rows = stories || db.prepare('SELECT story_id, status FROM stories').all();
  for (const r of rows) {
    if (r && r.story_id) map.set(r.story_id, r.status);
  }
  return map;
}

// ── R3-Rescue Feasibility Score — 12 delta rules (v2) ──
// Returns: { score, bucket, deltas, origin_status, target_status, is_zombie, is_orphan, is_phantom_target }
export function calculateFeasibility(debt, storyStatusMap) {
  let score = 40;  // v2: 50→40 (D3 reduced from +15 to +10, rebalance base)
  const deltas = {};

  const category = (debt.category || '').toLowerCase();
  const severity = (debt.severity || '').toLowerCase();
  const description = (debt.description || '').toLowerCase() + ' ' + (debt.description || '');
  const fixGuidance = debt.fix_guidance || '';
  const targetStory = debt.target_story;
  const fixCost = debt.fix_cost;
  const affectedFiles = parseAffectedFiles(debt.affected_files);

  // D1: severity=low → +10
  if (severity === 'low') {
    deltas.D1_low_severity = +10;
    score += 10;
  }

  // D2: category=CQD or TD → +10
  if (category === 'cqd' || category === 'td') {
    deltas.D2_cqd_td_category = +10;
    score += 10;
  }

  // D3: fix_cost=NULL → +10 (v2: reduced from +15)
  if (fixCost === null || fixCost === undefined || fixCost === '') {
    deltas.D3_no_fix_cost_spike = +10;
    score += 10;
  }

  // D4: affected_files ≤ 1 → +10
  if (affectedFiles.length <= 1) {
    deltas.D4_single_file = +10;
    score += 10;
  }

  // D5: description/guidance 含 empirical keyword → +10
  const combinedText = description + ' ' + fixGuidance;
  const empiricalHit = EMPIRICAL_KEYWORDS.some(re => re.test(combinedText));
  if (empiricalHit) {
    deltas.D5_empirical_keyword = +10;
    score += 10;
  }

  // D6: description 含 blocker keyword → -20
  const blockerHit = BLOCKER_KEYWORDS.some(re => re.test(combinedText));
  if (blockerHit) {
    deltas.D6_blocker_keyword = -20;
    score -= 20;
  }

  // D7: target_story 非 null → -5 (已歸因,非本 sweep 重點)
  if (targetStory && targetStory.trim() !== '') {
    deltas.D7_has_target_story = -5;
    score -= 5;
  }

  // D8: severity=critical/high → -20
  if (severity === 'critical' || severity === 'high') {
    deltas.D8_high_severity = -20;
    score -= 20;
  }

  // D9: IDD/intentional 完全排除
  if (category === 'idd' || category === 'intentional') {
    deltas.D9_idd_excluded = -999;
    score = -999;
  }

  // ── v2 additions: Orphan / Zombie detection (D10-D12) ──
  const originStatus = debt.story_id && storyStatusMap ? storyStatusMap.get(debt.story_id) : undefined;
  const targetStatus = targetStory && storyStatusMap ? storyStatusMap.get(targetStory) : undefined;

  // D10: origin story.status='done' → +10 (殭屍 debt — 源 Story 已 close)
  const isZombie = originStatus === 'done';
  if (isZombie) {
    deltas.D10_zombie_origin_done = +10;
    score += 10;
  }

  // D11: target_story.status='done' → +20 (孤兒 — target 已無承接能力)
  const isOrphan = targetStory && targetStatus === 'done';
  if (isOrphan) {
    deltas.D11_orphan_target_done = +20;
    score += 20;
  }

  // D12: target_story 非 null 且 stories 表查無 → +15 (虛構 cleanup story)
  const isPhantomTarget = Boolean(targetStory) && storyStatusMap && !storyStatusMap.has(targetStory);
  if (isPhantomTarget) {
    deltas.D12_phantom_target = +15;
    score += 15;
  }

  // Clamp to 0-100 (IDD keeps -999 sentinel via D9 override)
  if (score !== -999) {
    score = Math.max(0, Math.min(100, score));
  }

  const bucket = scoreToBucket(score);
  return {
    score,
    bucket,
    deltas,
    origin_status: originStatus || null,
    target_status: targetStatus || null,
    is_zombie: isZombie,
    is_orphan: Boolean(isOrphan),
    is_phantom_target: isPhantomTarget,
  };
}

// ── Bucket mapping ──
export function scoreToBucket(score) {
  if (score < 0) return 'Excluded';
  if (score >= 65) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

// ── fix_cost_guess from empirical heuristics (AC-1 schema requirement) ──
export function guessFixCost(debt) {
  if (debt.fix_cost) return debt.fix_cost;
  const files = parseAffectedFiles(debt.affected_files);
  const severity = (debt.severity || '').toLowerCase();
  const text = `${debt.description || ''} ${debt.fix_guidance || ''} ${debt.root_cause || ''}`.toLowerCase();

  if (BLOCKER_KEYWORDS.some(re => re.test(text))) return 'L';
  if (severity === 'critical' || severity === 'high') return 'M';
  if (files.length === 0) return 'S';
  if (files.length <= 1) {
    if (EMPIRICAL_KEYWORDS.some(re => re.test(text))) return 'XS';
    return 'S';
  }
  if (files.length <= 3) return 'S';
  return 'M';
}

// ── spike_evidence_exists: description 中是否已含 R3_RESCUE_META blob ──
export function hasSpikeEvidence(debt) {
  const desc = debt.description || '';
  return /R3_RESCUE_META/.test(desc) || Boolean(debt.resolved_at);
}

// ── recommendation 建議 (AC-1 schema) ──
export function buildRecommendation(debt, feas) {
  if (feas.is_orphan) return 'Orphan: target_story done → 改 ACCEPTED +365d 或改派新 cleanup Story';
  if (feas.is_phantom_target) return `Phantom target: 建立 '${debt.target_story}' Story 或改 ACCEPTED`;
  if (feas.is_zombie && !debt.target_story) return 'Zombie: origin done 且無 target → 評估 inline FIX 或建 cleanup Story';
  if (feas.bucket === 'High' && guessFixCost(debt) === 'XS') return 'Spike XS: inline FIX within 5-Min Rule';
  if (feas.bucket === 'High') return 'Spike: 先試修 1 筆驗證 FixCost,成功則批次';
  if (feas.bucket === 'Medium') return 'Track: review_date +90d,觀察是否升為 High';
  return 'Accept: +365d long-term,低可行度';
}

// ── Parse CLI args ──
export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    feasibility: null,
    output: null,
    resolveTop: args.includes('--resolve-top'),
    explain: null,
    mode: null,
    by: null,
    in: null,
    dryRun: !args.includes('--resolve-top'),
  };

  const feasIdx = args.indexOf('--feasibility');
  if (feasIdx >= 0 && args[feasIdx + 1]) {
    result.feasibility = args[feasIdx + 1]; // 'all' or 'high'
  }

  const outputIdx = args.indexOf('--output');
  if (outputIdx >= 0 && args[outputIdx + 1]) {
    result.output = args[outputIdx + 1];
  }

  const explainIdx = args.indexOf('--explain');
  if (explainIdx >= 0 && args[explainIdx + 1]) {
    result.explain = args[explainIdx + 1];
  }

  const modeIdx = args.indexOf('--mode');
  if (modeIdx >= 0 && args[modeIdx + 1]) {
    result.mode = args[modeIdx + 1];
  }

  const byIdx = args.indexOf('--by');
  if (byIdx >= 0 && args[byIdx + 1]) {
    result.by = args[byIdx + 1];
  }

  const inIdx = args.indexOf('--in');
  if (inIdx >= 0 && args[inIdx + 1]) {
    result.in = args[inIdx + 1];
  }

  return result;
}

// ── Validate args ──
export function validateArgs(opts) {
  if (!opts.feasibility && !opts.explain && !opts.resolveTop && !opts.mode) {
    console.error('❌ Missing --feasibility <all|high> OR --explain <id> OR --mode backfill-rationale');
    process.exit(1);
  }
  if (opts.resolveTop && !opts.by) {
    console.error('❌ --resolve-top requires --by <agent-id>');
    process.exit(1);
  }
  if (opts.resolveTop && !opts.in) {
    console.error('❌ --resolve-top requires --in <story-id>');
    process.exit(1);
  }
  if (opts.mode === 'backfill-rationale' && !opts.in) {
    console.error('❌ --mode backfill-rationale requires --in <sweep-story-id>');
    process.exit(1);
  }
  const validFeas = ['all', 'high', null];
  if (opts.feasibility && !validFeas.includes(opts.feasibility)) {
    console.error(`❌ --feasibility value must be 'all' or 'high', got: ${opts.feasibility}`);
    process.exit(1);
  }
  const validModes = ['backfill-rationale', null];
  if (opts.mode && !validModes.includes(opts.mode)) {
    console.error(`❌ --mode must be 'backfill-rationale', got: ${opts.mode}`);
    process.exit(1);
  }
}

// ── Query audit candidates from DB (BR-SWEEP-AUDIT-01, F4 case-insensitive) ──
export function queryAuditCandidates(db) {
  // case-insensitive status filter: OPEN_STATUSES list includes 'open'/'accepted'/'deferred'/'pending_archive'
  const placeholders = [...OPEN_STATUSES].map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      id, debt_id, story_id, category, severity, dimension, title,
      description, affected_files, fix_guidance, root_cause,
      target_story, status, created_at, fix_cost,
      accepted_reason, resolved_at, resolved_by, resolved_in_story
    FROM tech_debt_items
    WHERE LOWER(status) IN (${placeholders})
    ORDER BY severity DESC, id ASC
  `).all(...[...OPEN_STATUSES].map(s => s.toLowerCase()));
  return rows;
}

// ── Build candidate entry (AC-1 schema — 13 fields) ──
export function buildCandidateEntry(debt, feasResult) {
  return {
    debt_id: debt.debt_id,
    title: debt.title,
    category: debt.category,
    severity: debt.severity,
    fix_cost: debt.fix_cost || null,
    fix_cost_guess: guessFixCost(debt),
    spike_evidence_exists: hasSpikeEvidence(debt),
    affected_files: parseAffectedFiles(debt.affected_files),
    created_at: debt.created_at,
    target_story: debt.target_story || null,
    r3_rescue_feasibility_score: feasResult.score,
    bucket: feasResult.bucket,
    recommendation: buildRecommendation(debt, feasResult),
    score_deltas: feasResult.deltas,
    fix_cost_null: debt.fix_cost === null || debt.fix_cost === undefined,
    story_id: debt.story_id,
    origin_story_status: feasResult.origin_status,
    target_story_status: feasResult.target_status,
    is_zombie: feasResult.is_zombie,
    is_orphan: feasResult.is_orphan,
    is_phantom_target: feasResult.is_phantom_target,
  };
}

// ── Write JSON output ──
function writeOutputJson(data, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return filePath;
  } catch (err) {
    console.error(`❌ Cannot write JSON to ${filePath}: ${err.message}`);
    process.exit(3);
  }
}

// ── Write CSV output (AC-1 header) ──
function writeOutputCsv(candidates, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const headers = [
    'debt_id', 'severity', 'category',
    'fix_cost', 'fix_cost_guess', 'spike_evidence_exists',
    'r3_rescue_feasibility_score', 'bucket', 'recommendation',
    'affected_files', 'target_story',
    'is_zombie', 'is_orphan', 'is_phantom_target',
  ];
  const escCsv = v => {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) v = v.join('; ');
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...candidates.map(c =>
      headers.map(h => escCsv(c[h])).join(',')
    ),
  ];
  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } catch (err) {
    console.error(`❌ Cannot write CSV to ${filePath}: ${err.message}`);
    process.exit(3);
  }
  return filePath;
}

// ── Resolve a debt entry via DB update (used by --resolve-top) ──
function resolveDebtInDb(db, debtId, resolvedBy, resolvedInStory, timestamp) {
  const result = db.prepare(`
    UPDATE tech_debt_items
    SET status = 'fixed',
        resolved_at = ?,
        resolved_by = ?,
        resolved_in_story = ?
    WHERE debt_id = ? AND status != 'fixed'
  `).run(timestamp, resolvedBy, resolvedInStory, debtId);
  return result.changes > 0;
}

// ── Append R3-rescue metadata JSON blob to description ──
// Prevents duplicate appends via "R3_RESCUE_META:" marker check.
export function appendRescueMetaToDescription(db, debtId, meta) {
  const row = db.prepare('SELECT description FROM tech_debt_items WHERE debt_id = ?').get(debtId);
  if (!row) return false;
  const desc = row.description || '';
  if (/R3_RESCUE_META/.test(desc)) return false;  // idempotent: skip if already present

  const blob = `<!-- R3_RESCUE_META:${JSON.stringify(meta)} -->`;
  const newDesc = desc + '\n' + blob;
  db.prepare('UPDATE tech_debt_items SET description = ? WHERE debt_id = ?')
    .run(newDesc, debtId);
  return true;
}

// ── Backfill rationale mode: 為所有 High/Medium bucket debt 補 R3_RESCUE_META blob ──
// AC-4: 補齊 pre_production_rationale + fix_cost_spike_evidence
export function runBackfillRationale(db, candidates, sweepStoryId, sweepedBy, timestamp) {
  let appended = 0, skipped = 0;
  for (const entry of candidates) {
    if (entry.bucket === 'Excluded' || entry.bucket === 'Low') {
      skipped++;
      continue;
    }
    const meta = {
      sweep_story: sweepStoryId,
      swept_at: timestamp,
      swept_by: sweepedBy,
      score: entry.r3_rescue_feasibility_score,
      bucket: entry.bucket,
      fix_cost_guess: entry.fix_cost_guess,
      pre_production_rationale: entry.is_orphan
        ? `target_story '${entry.target_story}' 已 done,debt 失去承接;localhost dev 階段不修因 origin story '${entry.story_id}' 已 done 且 scope 不在本 sweep。R3-Rescue 建議改 ACCEPTED +365d 或拉回 inline FIX。`
        : entry.is_zombie
          ? `origin_story '${entry.story_id}' 已 done,debt 成為殭屍;localhost dev 階段不修因不在當前 Sprint scope。R3-Rescue 建議評估 inline FIX 或建立 cleanup Story。`
          : `localhost dev 階段 FixCost guess=${entry.fix_cost_guess}, 因無 spike 實測 (D3 觸發),score 基於 heuristics。R3-Rescue 建議: ${entry.recommendation}`,
      fix_cost_spike_evidence: entry.spike_evidence_exists
        ? 'spike evidence 已存在於 description 或 resolved metadata'
        : `無 spike 實測,guess=${entry.fix_cost_guess} 依 heuristics (files=${entry.affected_files.length}, sev=${entry.severity})。R3-rescue sweep 建議下一 CR cycle 實測。`,
      review_trigger: entry.is_orphan || entry.is_phantom_target
        ? 'next-sprint-planning'
        : 'azure-deployment-kickoff-minus-90d',
      actual_fix_cost: null,  // unknown until spike executed
    };
    const ok = appendRescueMetaToDescription(db, entry.debt_id, meta);
    if (ok) appended++;
    else skipped++;
  }
  return { appended, skipped };
}

// ── Main ──
function main() {
  const opts = parseArgs(process.argv);
  validateArgs(opts);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB not found at ${DB_PATH}`);
    process.exit(2);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  let rows;
  try {
    rows = queryAuditCandidates(db);
  } catch (err) {
    console.error(`❌ DB query failed: ${err.message}`);
    db.close();
    process.exit(2);
  }

  const storyStatusMap = buildStoryStatusMap(db);

  // --explain mode
  if (opts.explain) {
    const debt = rows.find(r => r.debt_id === opts.explain || String(r.id) === String(opts.explain));
    if (!debt) {
      console.error(`Debt not found in audit candidates: ${opts.explain}`);
      db.close();
      process.exit(1);
    }
    const feas = calculateFeasibility(debt, storyStatusMap);
    console.log(`\nR3-Rescue Feasibility Analysis: ${debt.debt_id}`);
    console.log(`  Title        : ${debt.title}`);
    console.log(`  Category     : ${debt.category} / Severity: ${debt.severity}`);
    console.log(`  Origin Story : ${debt.story_id} [${feas.origin_status || 'NOT_FOUND'}]`);
    console.log(`  Target Story : ${debt.target_story || '-'} [${feas.target_status || '-'}]`);
    console.log(`  Zombie/Orphan/Phantom: ${feas.is_zombie}/${feas.is_orphan}/${feas.is_phantom_target}`);
    console.log(`  Score        : ${feas.score} → Bucket: ${feas.bucket}`);
    console.log(`  fix_cost_guess: ${guessFixCost(debt)}`);
    console.log(`  Deltas       :`);
    for (const [k, v] of Object.entries(feas.deltas)) {
      const sign = v > 0 ? '+' : '';
      console.log(`    ${k.padEnd(30)}: ${sign}${v}`);
    }
    db.close();
    process.exit(0);
  }

  // Score all candidates
  const timestamp = getTaiwanTimestamp();
  const candidates = [];
  const byBucket = { High: [], Medium: [], Low: [], Excluded: [] };

  for (const debt of rows) {
    const feas = calculateFeasibility(debt, storyStatusMap);
    const entry = buildCandidateEntry(debt, feas);
    candidates.push(entry);
    (byBucket[feas.bucket] || byBucket.Low).push(entry);
  }

  // --mode backfill-rationale: F2 auto-fix
  if (opts.mode === 'backfill-rationale') {
    const { appended, skipped } = runBackfillRationale(
      db, candidates, opts.in || 'td-accepted-debt-r3-rescue-sweep',
      opts.by || 'CC-OPUS', timestamp
    );
    console.log(`\n📝 Rationale Backfill — ${timestamp}`);
    console.log(`   Appended R3_RESCUE_META blob: ${appended} debts`);
    console.log(`   Skipped (already has blob or Low/Excluded): ${skipped} debts`);
    db.close();
    process.exit(0);
  }

  // Filter to requested feasibility
  const filterBucket = opts.feasibility === 'high' ? 'High' : null;
  const outputCandidates = filterBucket
    ? candidates.filter(c => c.bucket === filterBucket)
    : candidates;

  // Sort: High first, then by score desc
  outputCandidates.sort((a, b) => {
    const bucketOrder = { High: 0, Medium: 1, Low: 2, Excluded: 3 };
    const bDiff = (bucketOrder[a.bucket] ?? 4) - (bucketOrder[b.bucket] ?? 4);
    if (bDiff !== 0) return bDiff;
    return b.r3_rescue_feasibility_score - a.r3_rescue_feasibility_score;
  });

  // Orphan / Zombie / Phantom counts for summary
  const orphanCount = candidates.filter(c => c.is_orphan).length;
  const zombieCount = candidates.filter(c => c.is_zombie).length;
  const phantomCount = candidates.filter(c => c.is_phantom_target).length;

  // Build output JSON schema: { run_at, total, by_bucket, systemic_flags, candidates }
  const output = {
    run_at: timestamp,
    total: rows.length,
    by_bucket: {
      High: byBucket.High.length,
      Medium: byBucket.Medium.length,
      Low: byBucket.Low.length,
      Excluded: byBucket.Excluded.length,
    },
    systemic_flags: {
      zombie_count: zombieCount,
      zombie_pct: rows.length > 0 ? +(zombieCount / rows.length * 100).toFixed(1) : 0,
      orphan_count: orphanCount,
      phantom_target_count: phantomCount,
    },
    candidates: outputCandidates,
  };

  // Write JSON
  const defaultJsonPath = path.join(
    __dirname, '..', '..',
    'docs/implementation-artifacts/sweeps/td-accepted-debt-r3-rescue-sweep-candidates.json'
  );
  const jsonPath = opts.output || defaultJsonPath;
  writeOutputJson(output, jsonPath);

  // Write CSV (always alongside JSON)
  const csvPath = jsonPath.replace(/\.json$/, '.csv');
  writeOutputCsv(outputCandidates, csvPath);

  // --resolve-top: mark High bucket as fixed
  if (opts.resolveTop) {
    const toResolve = byBucket.High.slice();
    let resolvedCount = 0;
    for (const entry of toResolve) {
      appendRescueMetaToDescription(db, entry.debt_id, {
        sweep_story: opts.in,
        score: entry.r3_rescue_feasibility_score,
        bucket: entry.bucket,
        swept_at: timestamp,
      });
      const resolved = resolveDebtInDb(db, entry.debt_id, opts.by, opts.in, timestamp);
      if (resolved) resolvedCount++;
    }
    console.log(`✅ Resolved ${resolvedCount} / ${toResolve.length} High-bucket debts via R3-rescue`);
  }

  db.close();

  // Summary output
  console.log(`\n🔍 R3-Rescue Audit v2 — ${timestamp}`);
  console.log(`   Scanned : ${rows.length} open debt candidates (incl. accepted/deferred variants)`);
  console.log(`   By bucket: High=${byBucket.High.length}, Medium=${byBucket.Medium.length}, Low=${byBucket.Low.length}, Excluded=${byBucket.Excluded.length}`);
  console.log(`   Systemic: Zombie=${zombieCount} (${output.systemic_flags.zombie_pct}%), Orphan=${orphanCount}, Phantom=${phantomCount}`);
  console.log(`   Output  : ${jsonPath}`);
  console.log(`   CSV     : ${csvPath}`);

  // Framework bias check — High bucket transfer rate (candidate pool), not actual FIX rate
  const transferRate = rows.length > 0
    ? (byBucket.High.length / rows.length * 100).toFixed(1)
    : '0.0';
  const biasVerdict = parseFloat(transferRate) >= 15
    ? '⚠ ≥15% — R1 bias 非孤例 (系統性問題)'
    : `✅ <15% — R3 F7 為高變異個案 (outlier)`;
  console.log(`\n   High-bucket pool rate: ${transferRate}% → ${biasVerdict}`);
  console.log(`   NOTE: 'transfer rate' 指 High bucket 候選佔比,非實際 status=fixed 轉換率。`);

  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) main();

// Named exports already declared with `export function` / `export const` above
