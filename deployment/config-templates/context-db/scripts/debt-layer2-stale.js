// ============================================================
// PCPT Context Memory DB — Debt Layer 2: Stale Detection
// DLA-04: Pattern Grep + Commit Diff + Skill-aware Detection
// ============================================================
// 使用方式:
//   node .context-db/scripts/debt-layer2-stale.js              # dry-run (預設)
//   node .context-db/scripts/debt-layer2-stale.js --execute    # 實際修改 DB
//   node .context-db/scripts/debt-layer2-stale.js --commits 100 # git log + diff scan 最近 100 commits
// ============================================================
// Unified report (AC-11): 執行 Layer 1 + Layer 2 合併報告請用
//   node .context-db/scripts/debt-stale-report.js [flags]
// ============================================================
// Prerequisites: Layer 1 (normalization) 必須先執行
// ============================================================

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const dryRun = !execute;
const commitLimit = (() => {
  const idx = args.indexOf('--commits');
  if (idx < 0 || !args[idx + 1]) return 50;
  const parsed = parseInt(args[idx + 1], 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : 50; // M-01: guard against NaN from non-numeric input
})();

// Stop words for keyword extraction (short/generic terms to skip)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were',
  'and', 'or', 'but', 'not', 'no', 'with', 'from', 'by', 'as', 'this', 'that',
  'it', 'be', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'use', 'used', 'using',
  'add', 'fix', 'bug', 'issue', 'error', 'todo', 'hack', 'temp', 'tmp',
  'missing', 'unused', 'remove', 'delete', 'update', 'change', 'modify',
]);

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

// Parse affected_files: JSON array, comma-separated, or single path
// Strip both :line and :line-range suffixes (CR-L11: handle :207-275 format)
// BR-TDI-06 (dla-08 TD-DLA04-06): detect directory paths + skip with warn
function parseAffectedFiles(raw) {
  if (!raw) return [];
  let files;
  try {
    files = JSON.parse(raw);
    if (!Array.isArray(files)) files = [String(files)];
  } catch {
    files = raw.split(',').map(f => f.trim()).filter(Boolean);
  }
  const cleaned = files
    .map(f => f.replace(/:\d+(?:-\d+)?$/, '')) // strip :N or :N-M suffix
    .filter(Boolean);

  // BR-TDI-06: skip directory paths (isDirectory check) with console.warn
  const result = [];
  for (const f of cleaned) {
    try {
      const stat = fs.statSync(f);
      if (stat.isDirectory()) {
        console.warn(`  ⚠ parseAffectedFiles: skipping directory path "${f}" (BR-TDI-06 dla-08 BF1 fix)`);
        continue;
      }
    } catch {
      // File may not exist — let caller handle, don't block
    }
    result.push(f);
  }
  return result;
}

// Extract meaningful keywords from title (BR-007: skip if title < 5 chars)
function extractKeywords(title) {
  if (!title || title.length < 5) return [];
  return title
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s_-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()))
    .map(w => w.toLowerCase())
    .slice(0, 5);
}

// Check if git is available
function isGitAvailable() {
  try {
    execFileSync('git', ['--version'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
    return true;
  } catch (e) {
    console.warn(`[warn] git not available: ${e.message}`);
    return false;
  }
}

// Map skill-related keywords from title/description to skill names
const SKILL_KEYWORD_MAP = {
  'editor': 'pcpt-editor-arch',
  'canvas': 'pcpt-editor-arch',
  'fabric': 'pcpt-editor-arch',
  'zustand': 'pcpt-zustand-patterns',
  'store': 'pcpt-zustand-patterns',
  'payment': 'pcpt-payment-subscription',
  'ecpay': 'pcpt-payment-subscription',
  'invoice': 'pcpt-invoice-receipt',
  'admin': 'pcpt-admin-module',
  'dashboard': 'pcpt-admin-dashboard',
  'rbac': 'pcpt-admin-rbac',
  'auth': 'pcpt-auth-identity',
  'login': 'pcpt-auth-identity',
  'pdf': 'pcpt-pdf-engine',
  'migration': 'pcpt-sqlserver',
  'database': 'pcpt-sqlserver',
  'sql': 'pcpt-sqlserver',
  'signalr': 'pcpt-signalr-realtime',
  'tooltip': 'pcpt-tooltip',
  'animation': 'pcpt-progress-animation',
  'i18n': 'pcpt-i18n-seo',
  'seo': 'pcpt-i18n-seo',
  'route': 'pcpt-routing-convention',
  'routing': 'pcpt-routing-convention',
  'design': 'pcpt-design-system',
  'css': 'pcpt-design-system',
  'type': 'pcpt-type-canonical',
  'typescript': 'pcpt-type-canonical',
  'license': 'pcpt-license-key',
  'member': 'pcpt-member-plans',
  'plan': 'pcpt-member-plans',
  'announcement': 'pcpt-announcement-system',
  'debt': 'pcpt-debt-registry',
  'security': 'pcpt-security-middleware',
  'background': 'pcpt-background-services',
  'maintenance': 'pcpt-maintenance-mode',
};

function inferRelatedSkills(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const skills = new Set();
  for (const [keyword, skill] of Object.entries(SKILL_KEYWORD_MAP)) {
    if (text.includes(keyword)) {
      skills.add(skill);
    }
  }
  return [...skills];
}

// ── Phase 1: Pattern Grep Verification (BR-007) ────────────────
function phase1PatternGrep(db) {
  const openDebts = db.prepare(
    "SELECT id, title, affected_files FROM tech_debt_items WHERE status = 'open' AND affected_files IS NOT NULL AND affected_files != ''"
  ).all();

  let staleCount = 0;
  let skippedShort = 0;
  const ts = getTaiwanTimestamp();

  for (const debt of openDebts) {
    const keywords = extractKeywords(debt.title);
    if (keywords.length === 0) {
      skippedShort++;
      continue;
    }

    const files = parseAffectedFiles(debt.affected_files);
    if (files.length === 0) continue;

    // Only check files that exist (file_not_exist already handled by Layer 1)
    const existingFiles = files.filter(f => {
      const fullPath = path.resolve(PROJECT_ROOT, f);
      return fullPath.startsWith(PROJECT_ROOT) && fs.existsSync(fullPath); // L-02: path traversal boundary guard
    });
    if (existingFiles.length === 0) continue;

    let anyMatch = false;
    for (const filePath of existingFiles) {
      try {
        const content = fs.readFileSync(path.resolve(PROJECT_ROOT, filePath), 'utf8').toLowerCase();
        if (keywords.some(kw => content.includes(kw))) {
          anyMatch = true;
          break;
        }
      } catch (e) {
        console.warn(`[warn] Phase 1 read failed: ${filePath} — ${e.message}`);
      }
    }

    if (!anyMatch) {
      staleCount++;
      if (dryRun) {
        console.log(`[dry-run] Pattern stale: id=${debt.id} — keywords [${keywords.join(',')}] not found in files`);
      } else {
        db.prepare(
          "UPDATE tech_debt_items SET status = 'pending_archive', stale_reason = 'pattern_not_found', resolved_at = ? WHERE id = ?"
        ).run(ts, debt.id);
      }
    }
  }

  console.log(`[Phase 1] Pattern grep: ${staleCount} stale, ${skippedShort} skipped (title too short or all-stop-words), ${openDebts.length} total checked`); // L-01: accurate skip reason
  return staleCount;
}

// ── Phase 2: Commit Diff Verification (BR-008) ─────────────────
function phase2CommitDiff(db) {
  if (!isGitAvailable()) {
    console.log('[Phase 2] Commit diff: SKIPPED (git not available)');
    return 0;
  }

  const openDebts = db.prepare(
    "SELECT id, title, affected_files FROM tech_debt_items WHERE status = 'open' AND affected_files IS NOT NULL AND affected_files != ''"
  ).all();

  let autoFixedCount = 0;
  const ts = getTaiwanTimestamp();

  for (const debt of openDebts) {
    const keywords = extractKeywords(debt.title);
    if (keywords.length === 0) continue;

    const files = parseAffectedFiles(debt.affected_files);
    if (files.length === 0) continue;

    // Get recent commits touching these files (CR-M1: execFileSync avoids shell injection)
    let commits;
    try {
      const output = execFileSync(
        'git',
        ['log', `-${commitLimit}`, '--format=%H', '--', ...files],
        { cwd: PROJECT_ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 10000 }
      ).trim();
      commits = output ? output.split('\n') : [];
    } catch (e) {
      console.warn(`[warn] Phase 2 git log failed for debt ${debt.id}: ${e.message}`);
      continue;
    }

    if (commits.length === 0) continue;

    // Check if pattern was removed in any commit (CR-M4: honor commitLimit instead of hardcoded 5)
    let patternRemoved = false;
    let fixCommitSha = null;

    const scanDepth = Math.min(commitLimit, commits.length);
    for (const sha of commits.slice(0, scanDepth)) {
      try {
        const diff = execFileSync(
          'git',
          ['diff', `${sha}^..${sha}`, '--', ...files],
          { cwd: PROJECT_ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 10000 }
        ).toLowerCase();

        const removedLines = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
        const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));

        for (const kw of keywords) {
          const inRemoved = removedLines.some(l => l.includes(kw));
          const inAdded = addedLines.some(l => l.includes(kw));
          if (inRemoved && !inAdded) {
            patternRemoved = true;
            fixCommitSha = sha;
            break;
          }
        }
        if (patternRemoved) break;
      } catch (e) {
        console.warn(`[warn] Phase 2 git diff failed for ${sha.slice(0, 8)}: ${e.message}`);
        continue;
      }
    }

    if (patternRemoved) {
      autoFixedCount++;
      // Try to extract story_id from commit message (CR-M1: execFileSync)
      let resolvedInStory = null;
      try {
        const msg = execFileSync(
          'git',
          ['log', '-1', '--format=%s', fixCommitSha],
          { cwd: PROJECT_ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 5000 }
        ).trim();
        const storyMatch = msg.match(/\b([a-z]{2,8}-\d{2,4}-[a-z][a-z0-9-]{2,})\b/i); // L-03: tighter pattern excludes release-1-hotfix style false positives
        if (storyMatch) resolvedInStory = storyMatch[1];
      } catch (e) {
        console.warn(`[warn] Phase 2 git log story extract failed: ${e.message}`);
      }

      // CR-L4: Always log SHA for traceability (both dry-run and execute)
      const shaShort = fixCommitSha?.slice(0, 8);
      const storyTag = resolvedInStory ? ` (in ${resolvedInStory})` : '';
      if (dryRun) {
        console.log(`[dry-run] Auto-fixed: id=${debt.id} — pattern removed in commit ${shaShort}${storyTag}`);
      } else {
        console.log(`[exec] Auto-fixed: id=${debt.id} — commit ${shaShort}${storyTag}`);
        db.prepare(
          "UPDATE tech_debt_items SET status = 'fixed', resolved_at = ?, resolved_in_story = COALESCE(resolved_in_story, ?) WHERE id = ?"
        ).run(ts, resolvedInStory, debt.id);
      }
    }
  }

  console.log(`[Phase 2] Commit diff: ${autoFixedCount} auto-fixed (checked ${commitLimit} commits)`);
  return autoFixedCount;
}

// ── Phase 3: Skill-aware Detection (BR-009) ────────────────────
function phase3SkillAware(db) {
  const openDebts = db.prepare(
    "SELECT id, title, description, related_skills, created_at FROM tech_debt_items WHERE status = 'open'"
  ).all();

  let reviewCount = 0;

  for (const debt of openDebts) {
    // Get related skills from v3.0 field or infer from title/description
    let skills;
    if (debt.related_skills) {
      try {
        skills = JSON.parse(debt.related_skills);
      } catch {
        skills = [debt.related_skills];
      }
    } else {
      skills = inferRelatedSkills(debt.title, debt.description);
    }
    if (skills.length === 0) continue;

    // Check if any related skill was updated after debt creation
    let skillUpdated = false;
    for (const skillName of skills) {
      const skillDir = skillName.startsWith('pcpt-') ? skillName : `pcpt-${skillName}`;
      const skillPath = path.join(PROJECT_ROOT, '.claude', 'skills', skillDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        const updatedMatch = content.match(/^updated:\s*(.+)$/m);
        if (updatedMatch) {
          const skillDate = updatedMatch[1].trim();
          const debtDate = debt.created_at || '';
          if (skillDate > debtDate.slice(0, 10)) {
            skillUpdated = true;
            break;
          }
        }
      } catch (e) {
        console.warn(`[warn] Phase 3 skill read failed: ${skillPath} — ${e.message}`);
      }
    }

    if (skillUpdated) {
      reviewCount++;
      if (dryRun) {
        console.log(`[dry-run] Skill review: id=${debt.id} — related skills updated after debt creation`);
      } else {
        // BR-009: 不改 status,只加 stale_reason 標記
        db.prepare(
          "UPDATE tech_debt_items SET stale_reason = 'skill_updated_may_resolve' WHERE id = ? AND stale_reason IS NULL"
        ).run(debt.id);
      }
    }
  }

  console.log(`[Phase 3] Skill-aware detection: ${reviewCount} needs review`);
  return reviewCount;
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
  //   stale_pattern_not_found / auto_fixed_by_commit / skill_review / remaining_open
  const report = {
    timestamp: getTaiwanTimestamp(),
    mode: dryRun ? 'dry-run' : 'execute',
    stale_pattern_not_found: 0,
    auto_fixed_by_commit: 0,
    skill_review: 0,
    remaining_open: 0,
  };

  try {
    report.stale_pattern_not_found = phase1PatternGrep(db);
    report.auto_fixed_by_commit = phase2CommitDiff(db);
    report.skill_review = phase3SkillAware(db);
    report.remaining_open = db.prepare("SELECT COUNT(*) as c FROM tech_debt_items WHERE status = 'open'").get().c;
  } finally {
    db.close();
  }

  console.log('\n=== Layer 2 Report ===');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { extractKeywords, inferRelatedSkills, SKILL_KEYWORD_MAP, STOP_WORDS, parseAffectedFiles as parseAffectedFilesL2 };
