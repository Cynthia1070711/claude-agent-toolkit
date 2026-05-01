// ============================================================
// PCPT Context Memory DB — Skill-IDD Sync Check Tool
// DLA-09: 驗證 code/skill 變更是否違反 IDD forbidden_changes
// BR-SYNC-CHECK: 三模式 (--changed-files / --full-audit / --skill)
//
// Exit codes:
//   0 = PASS (no violations)
//   1 = BLOCKED (violations found)
//   2 = ERROR (tool execution failure)
// ============================================================
// 使用方式:
//   node .context-db/scripts/skill-idd-sync-check.js --changed-files "src/A.cs,src/B.tsx"
//   node .context-db/scripts/skill-idd-sync-check.js --full-audit
//   node .context-db/scripts/skill-idd-sync-check.js --skill pcpt-editor-arch
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const CROSS_REF_PATH = path.join(__dirname, '..', 'idd-cross-reference.json');
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { mode: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--changed-files' && args[i + 1]) {
      result.mode = 'changed-files';
      result.files = args[++i].split(',').map(f => f.trim()).filter(Boolean);
    } else if (args[i] === '--full-audit') {
      result.mode = 'full-audit';
    } else if (args[i] === '--skill' && args[i + 1]) {
      result.mode = 'skill';
      result.skillName = args[++i];
    }
  }
  return result;
}

function getActiveIdds(db, filter = {}) {
  let sql = `
    SELECT idd_id, idd_type, title, criticality, status,
           forbidden_changes, related_files, related_skills,
           code_locations, adr_path
    FROM intentional_decisions
    WHERE status = 'active'
  `;
  const params = [];

  if (filter.relatedFile) {
    sql += ` AND related_files LIKE ?`;
    params.push(`%${filter.relatedFile}%`);
  }
  if (filter.skill) {
    sql += ` AND related_skills LIKE ?`;
    params.push(`%${filter.skill}%`);
  }

  return db.prepare(sql).all(...params);
}

function checkViolations(changedFiles, idd) {
  const violations = [];
  let forbidden = [];
  try { forbidden = JSON.parse(idd.forbidden_changes || '[]'); } catch { return []; }

  if (!forbidden.length) return [];

  // Check if any changed file matches the IDD's related_files
  let relatedFiles = [];
  try { relatedFiles = JSON.parse(idd.related_files || '[]'); } catch { /* ignore */ }

  const affectedFiles = changedFiles.filter(changed => {
    // Normalize paths for comparison
    const normalizedChanged = changed.replace(/\\/g, '/');
    return relatedFiles.some(rf => {
      const normalizedRf = rf.replace(/\\/g, '/');
      return normalizedChanged.includes(normalizedRf) ||
             normalizedRf.includes(normalizedChanged) ||
             path.basename(normalizedChanged) === path.basename(normalizedRf);
    });
  });

  if (affectedFiles.length === 0) return [];

  // Read file contents to check if forbidden patterns appear in diffs/changes
  // Since we don't have actual git diff here, we check file contents for suspicious patterns
  for (const filePath of affectedFiles) {
    const fullPath = path.join(PROJECT_ROOT, filePath);
    if (!fs.existsSync(fullPath)) continue;

    let content;
    try { content = fs.readFileSync(fullPath, 'utf8'); } catch { continue; }

    for (const forbiddenAction of forbidden) {
      // Extract key terms from forbidden action for pattern matching
      // e.g., "請勿加 isFreeUser 阻擋" → check for "isFreeUser"
      const keyTerms = extractKeyTerms(forbiddenAction);
      for (const term of keyTerms) {
        if (term.length >= 4 && content.includes(term)) {
          violations.push({
            idd_id: idd.idd_id,
            file: filePath,
            forbidden_change: forbiddenAction,
            detected_pattern: term,
            note: `Pattern "${term}" found in ${filePath} — may violate forbidden change`,
          });
          break; // one violation per forbidden action per file
        }
      }
    }
  }

  return violations;
}

function extractKeyTerms(text) {
  // Extract code-like terms (camelCase, PascalCase, snake_case, method names, etc.)
  const terms = [];
  const camelCase = text.match(/[a-z][a-zA-Z0-9]{3,}/g) || [];
  const pascalCase = text.match(/[A-Z][a-zA-Z0-9]{3,}/g) || [];
  const codePattern = text.match(/`([^`]+)`/g) || [];
  terms.push(...camelCase.filter(t => t.length >= 4));
  terms.push(...pascalCase.filter(t => t.length >= 4));
  terms.push(...codePattern.map(t => t.replace(/`/g, '')));
  return [...new Set(terms)];
}

function verifyIddIntegrity(idd) {
  const issues = [];

  // Check ADR file exists
  if (!idd.adr_path) {
    issues.push({ type: 'missing_adr', detail: 'adr_path is empty' });
  } else {
    const adrFull = path.join(PROJECT_ROOT, idd.adr_path);
    if (!fs.existsSync(adrFull)) {
      issues.push({ type: 'missing_adr', detail: `ADR file not found: ${idd.adr_path}` });
    }
  }

  // Check code_locations exist
  if (idd.code_locations) {
    try {
      const locs = JSON.parse(idd.code_locations);
      for (const loc of locs) {
        if (loc.file) {
          const fullPath = path.join(PROJECT_ROOT, loc.file);
          if (!fs.existsSync(fullPath)) {
            issues.push({ type: 'stale_location', detail: `Code location not found: ${loc.file}:${loc.line}` });
          }
        }
      }
    } catch {
      issues.push({ type: 'invalid_json', detail: 'code_locations JSON parse error' });
    }
  }

  // Check forbidden_changes exists (warning, not blocking)
  if (!idd.forbidden_changes || idd.forbidden_changes === '[]') {
    issues.push({ type: 'missing_forbidden_changes', detail: 'No forbidden_changes defined — consider adding', severity: 'warning' });
  }

  return issues;
}

function checkSkillForConflicts(skillName) {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { found: false, reason: `SKILL.md not found: ${skillPath}` };
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  return { found: true, content, path: skillPath };
}

function modeChangedFiles(db, args) {
  console.log(`\n🔍 Checking ${args.files.length} changed file(s) against active IDDs...\n`);
  console.log(`  Files: ${args.files.join(', ')}\n`);

  // Find all active IDDs that have related_files matching the changed files
  const allActiveIdds = getActiveIdds(db);
  const violations = [];
  const checked = [];

  for (const idd of allActiveIdds) {
    let relatedFiles = [];
    try { relatedFiles = JSON.parse(idd.related_files || '[]'); } catch { /* ignore */ }
    if (!relatedFiles.length) continue;

    const matchedFiles = args.files.filter(changed => {
      const normalizedChanged = changed.replace(/\\/g, '/');
      return relatedFiles.some(rf => {
        const normalizedRf = rf.replace(/\\/g, '/');
        return normalizedChanged.includes(normalizedRf) ||
               normalizedRf.includes(normalizedChanged) ||
               path.basename(normalizedChanged) === path.basename(normalizedRf);
      });
    });

    if (matchedFiles.length === 0) continue;

    checked.push({ idd_id: idd.idd_id, matched_files: matchedFiles });
    const iddViolations = checkViolations(args.files, idd);
    violations.push(...iddViolations);

    console.log(`  📋 ${idd.idd_id} (${idd.idd_type}/${idd.criticality}): ${idd.title}`);
    console.log(`     Matched files: ${matchedFiles.join(', ')}`);

    let forbidden = [];
    try { forbidden = JSON.parse(idd.forbidden_changes || '[]'); } catch { /* ignore */ }
    if (forbidden.length) {
      console.log(`     ❌ Forbidden changes:`);
      for (const f of forbidden) {
        console.log(`        - ${f}`);
      }
    }

    if (iddViolations.length > 0) {
      console.log(`     ⚠️  POTENTIAL VIOLATIONS DETECTED:`);
      for (const v of iddViolations) {
        console.log(`        [${v.idd_id}] ${v.detected_pattern} found in ${v.file}`);
        console.log(`        Forbidden: ${v.forbidden_change}`);
      }
    } else {
      console.log(`     ✓ No forbidden patterns detected in changed files`);
    }
    console.log('');
  }

  return { violations, checked };
}

function modeFullAudit(db) {
  console.log('\n🔍 Full Audit — checking all active IDDs for integrity...\n');

  const allActiveIdds = getActiveIdds(db);
  if (!allActiveIdds.length) {
    console.log('  ℹ️  No active IDD records in DB\n');
    return { violations: [], issues: [] };
  }

  const issues = [];
  const violations = [];

  for (const idd of allActiveIdds) {
    const iddIssues = verifyIddIntegrity(idd);

    const errors = iddIssues.filter(i => i.severity !== 'warning');
    const warnings = iddIssues.filter(i => i.severity === 'warning');

    const icon = errors.length > 0 ? '❌' : warnings.length > 0 ? '⚠️ ' : '✓ ';
    console.log(`  ${icon} ${idd.idd_id} (${idd.idd_type}/${idd.criticality}): ${idd.title}`);

    for (const issue of iddIssues) {
      const symbol = issue.severity === 'warning' ? '⚠️ ' : '  ❌';
      console.log(`     ${symbol} [${issue.type}] ${issue.detail}`);
      if (issue.severity !== 'warning') {
        issues.push({ idd_id: idd.idd_id, ...issue });
        violations.push({ idd_id: idd.idd_id, type: 'integrity', detail: issue.detail });
      }
    }
  }

  return { violations, issues, total_checked: allActiveIdds.length };
}

function modeSkill(db, skillName) {
  console.log(`\n🔍 Checking skill "${skillName}" against related IDDs...\n`);

  // Find IDDs related to this skill
  const relatedIdds = getActiveIdds(db, { skill: skillName });

  if (!relatedIdds.length) {
    console.log(`  ℹ️  No active IDD records reference skill "${skillName}"\n`);
    return { violations: [], idds_checked: 0 };
  }

  const skillCheck = checkSkillForConflicts(skillName);
  if (!skillCheck.found) {
    console.log(`  ⚠️  ${skillCheck.reason}\n`);
    return { violations: [], idds_checked: relatedIdds.length };
  }

  console.log(`  📖 SKILL.md found: ${path.relative(PROJECT_ROOT, skillCheck.path)}`);
  console.log(`  📋 Related IDDs: ${relatedIdds.map(i => i.idd_id).join(', ')}\n`);

  const violations = [];

  for (const idd of relatedIdds) {
    let forbidden = [];
    try { forbidden = JSON.parse(idd.forbidden_changes || '[]'); } catch { /* ignore */ }

    console.log(`  🔒 ${idd.idd_id}: ${idd.title}`);

    if (!forbidden.length) {
      console.log(`     ✓ No forbidden_changes defined\n`);
      continue;
    }

    const skillViolations = [];
    for (const forbiddenAction of forbidden) {
      const keyTerms = extractKeyTerms(forbiddenAction);
      for (const term of keyTerms) {
        if (term.length >= 4 && skillCheck.content.includes(term)) {
          skillViolations.push({
            idd_id: idd.idd_id,
            skill: skillName,
            forbidden_change: forbiddenAction,
            detected_pattern: term,
          });
        }
      }
    }

    if (skillViolations.length === 0) {
      console.log(`     ✓ No forbidden patterns found in SKILL.md`);
    } else {
      console.log(`     ❌ Potential conflicts detected:`);
      for (const v of skillViolations) {
        console.log(`        Pattern "${v.detected_pattern}" found — Forbidden: ${v.forbidden_change}`);
      }
      violations.push(...skillViolations);
    }
    console.log('');
  }

  return { violations, idds_checked: relatedIdds.length };
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.mode) {
    console.error(`
Skill-IDD Sync Check Tool (DLA-09)

用法:
  node .context-db/scripts/skill-idd-sync-check.js --changed-files "src/A.cs,src/B.tsx"
  node .context-db/scripts/skill-idd-sync-check.js --full-audit
  node .context-db/scripts/skill-idd-sync-check.js --skill pcpt-editor-arch

Exit codes: 0=PASS, 1=BLOCKED, 2=ERROR
    `);
    process.exit(2);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB not found: ${DB_PATH}`);
    process.exit(2);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  } catch (err) {
    console.error(`❌ Cannot open DB: ${err.message}`);
    process.exit(2);
  }

  let result;
  try {
    if (args.mode === 'changed-files') {
      result = modeChangedFiles(db, args);
    } else if (args.mode === 'full-audit') {
      result = modeFullAudit(db);
    } else if (args.mode === 'skill') {
      result = modeSkill(db, args.skillName);
    }
  } catch (err) {
    console.error(`❌ Check failed: ${err.message}`);
    db.close();
    process.exit(2);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  const violations = result?.violations || [];
  // Non-blocking: integrity issues with severity='warning' (e.g., missing_forbidden_changes)
  // Blocking: all other violations (forbidden_change detected, stale locations, etc.)
  const isNonBlockingWarning = (v) => v.type === 'integrity' && v.severity === 'warning';
  const hasBlockingViolations = violations.some(v => !isNonBlockingWarning(v));

  console.log('─'.repeat(60));
  if (violations.length === 0) {
    console.log(`✓ PASS: 0 violations`);
    process.exit(0);
  } else {
    console.log(`✗ BLOCKED: ${violations.length} violation(s) found`);
    for (const v of violations) {
      console.log(`\n  IDD-ID: ${v.idd_id}`);
      if (v.forbidden_change) console.log(`  Forbidden: ${v.forbidden_change}`);
      if (v.detected_pattern) console.log(`  Detected: ${v.detected_pattern}`);
      if (v.file) console.log(`  File: ${v.file}`);
      if (v.detail) console.log(`  Detail: ${v.detail}`);
    }
    process.exit(hasBlockingViolations ? 1 : 0);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { parseArgs, extractKeyTerms, checkViolations, getActiveIdds, verifyIddIntegrity };
