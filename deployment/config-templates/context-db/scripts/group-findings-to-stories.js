// ============================================================
// Smart Review-Fix — Bug 分組 → Story 建立工具
// 用途：查詢 open findings、按模組分組、產生 Story、關聯 findings
// ============================================================
// 使用方式:
//   node .context-db/scripts/group-findings-to-stories.js --plan <id> --summary
//   node .context-db/scripts/group-findings-to-stories.js --plan <id> --epic <id> --group
//   node .context-db/scripts/group-findings-to-stories.js --plan <id> --epic <id> --create
//   node .context-db/scripts/group-findings-to-stories.js --plan <id> --epic <id> --link
//   node .context-db/scripts/group-findings-to-stories.js --next-epic-id
//   node .context-db/scripts/group-findings-to-stories.js --query --fix-status open [--severity P0]
//   node .context-db/scripts/group-findings-to-stories.js --stats [--epic <id>]
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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

// ──── Module → Skill mapping for AC generation ────
const MODULE_SKILL_MAP = {
  'editor-core': ['pcpt-editor-arch', 'pcpt-zustand-patterns'],
  'datasource': ['pcpt-editor-arch'],
  'image-asset': ['pcpt-editor-arch'],
  'qr-barcode-serial': ['pcpt-editor-arch'],
  'table-shape': ['pcpt-editor-arch'],
  'pdf-engine': ['pcpt-pdf-engine'],
  'payment-subscription': ['pcpt-payment-subscription'],
  'business-api': ['pcpt-business-api'],
  'auth': ['pcpt-auth-identity'],
  'dashboard': ['pcpt-design-system'],
  'admin-auth': ['pcpt-admin-module', 'pcpt-auth-identity'],
  'admin-member': ['pcpt-admin-module', 'pcpt-admin-data-ops'],
  'admin-product': ['pcpt-admin-module'],
  'admin-order': ['pcpt-admin-module', 'pcpt-payment-subscription'],
  'admin-content': ['pcpt-admin-module'],
  'admin-settings': ['pcpt-admin-module', 'pcpt-branding-siteinfo'],
  'admin-reports': ['pcpt-admin-module', 'pcpt-admin-data-ops'],
  'admin-templates': ['pcpt-admin-module'],
};

// ──── Complexity estimation ────
function estimateComplexity(bugCount, fileCount) {
  if (bugCount <= 3 && fileCount <= 1) return 'S';
  if (bugCount <= 8 || fileCount <= 3) return 'M';
  if (bugCount <= 15 || fileCount <= 6) return 'L';
  return 'XL';
}

// ──── Priority: highest severity in group ────
function groupPriority(findings) {
  const severities = findings.map(f => f.severity);
  if (severities.includes('P0')) return 'P0';
  if (severities.includes('P1')) return 'P1';
  if (severities.includes('P2')) return 'P2';
  if (severities.includes('P3')) return 'P3';
  return 'P4';
}

// ──── Collect unique affected files ────
function collectFiles(findings) {
  const files = new Set();
  for (const f of findings) {
    if (f.file_path) files.add(f.file_path);
    if (f.affected_files) {
      try {
        const arr = JSON.parse(f.affected_files);
        arr.forEach(p => files.add(p));
      } catch { /* ignore */ }
    }
  }
  return [...files];
}

// ──── Build AC from findings ────
function buildAC(findings) {
  return findings.map((f, i) => {
    const given = `Given ${f.module_code} 模組中存在 ${f.severity} Bug`;
    const when = `When 修復 ${f.title || f.finding_id}`;
    const then = f.fix_suggestion
      ? `Then ${f.fix_suggestion.slice(0, 200)}`
      : `Then ${f.description ? f.description.slice(0, 200) : '問題已解決'}`;
    return `AC-${i + 1}: ${given} → ${when} → ${then} [Verifies: BUG-${f.finding_id}]`;
  }).join('\n');
}

// ──── Group findings by module ────
function groupByModule(findings) {
  const groups = {};
  for (const f of findings) {
    const mod = f.module_code || 'unknown';
    if (!groups[mod]) groups[mod] = [];
    groups[mod].push(f);
  }
  return groups;
}

// ──── Query open findings ────
function queryFindings(db, planId, fixStatus, severity) {
  let sql = `SELECT f.* FROM review_findings f`;
  const params = [];
  const conditions = [];

  if (planId) {
    sql += ` JOIN review_reports r ON f.report_id = r.report_id`;
    conditions.push(`r.plan_id = ?`);
    params.push(planId);
  }

  if (fixStatus) {
    conditions.push(`f.fix_status = ?`);
    params.push(fixStatus);
  }

  if (severity) {
    conditions.push(`f.severity = ?`);
    params.push(severity);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  sql += ` ORDER BY
    CASE f.severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
    f.module_code`;

  return db.prepare(sql).all(...params);
}

// ──── Mode: --summary ────
function showSummary(planId) {
  const db = getDb();
  try {
    const findings = queryFindings(db, planId, 'open', null);
    const groups = groupByModule(findings);

    console.log(`\n=== Smart Review-Fix Summary: Plan ${planId || 'ALL'} ===`);
    console.log(`Total open findings: ${findings.length}\n`);

    console.log('| Module | Total | P0 | P1 | P2 | P3 | P4 | Files |');
    console.log('|--------|-------|----|----|----|----|----|-------|');

    for (const [mod, items] of Object.entries(groups)) {
      const p0 = items.filter(f => f.severity === 'P0').length;
      const p1 = items.filter(f => f.severity === 'P1').length;
      const p2 = items.filter(f => f.severity === 'P2').length;
      const p3 = items.filter(f => f.severity === 'P3').length;
      const p4 = items.filter(f => f.severity === 'P4').length;
      const files = collectFiles(items).length;
      console.log(`| ${mod} | ${items.length} | ${p0} | ${p1} | ${p2} | ${p3} | ${p4} | ${files} |`);
    }

    console.log(`\nModules: ${Object.keys(groups).length}`);
  } finally {
    db.close();
  }
}

// ──── Mode: --group (dry-run preview) ────
function showGrouping(planId, epicId) {
  const db = getDb();
  const findings = queryFindings(db, planId, 'open', null);
  const groups = groupByModule(findings);
  const storyPlan = buildStoryPlan(groups, epicId);

  console.log(`\n=== Story Grouping Preview: ${epicId} ===\n`);
  console.log('| # | Story ID | Module | Bugs | Severity | Complexity | Skills | Conflicts |');
  console.log('|---|----------|--------|------|----------|------------|--------|-----------|');

  const allFiles = {};
  storyPlan.forEach((s, i) => {
    const sevStr = Object.entries(s.severityCounts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v}x${k}`)
      .join(', ');
    const skills = (MODULE_SKILL_MAP[s.module] || []).join(', ');

    // Conflict detection
    s.files.forEach(f => {
      if (!allFiles[f]) allFiles[f] = [];
      allFiles[f].push(s.storyId);
    });

    console.log(`| ${i + 1} | ${s.storyId} | ${s.module} | ${s.bugCount} | ${sevStr} | ${s.complexity} | ${skills} | - |`);
  });

  // Print conflict matrix
  const conflicts = Object.entries(allFiles).filter(([, stories]) => stories.length > 1);
  if (conflicts.length > 0) {
    console.log(`\n=== Conflict Matrix ===`);
    for (const [file, stories] of conflicts) {
      console.log(`  ${file} → shared by: ${stories.join(', ')} (SERIALIZE)`);
    }
  } else {
    console.log(`\nNo file conflicts detected — all Stories can run in parallel.`);
  }

  console.log(`\nTotal Stories: ${storyPlan.length}`);
  db.close();
}

// ──── Build Story plan from grouped findings ────
function buildStoryPlan(groups, epicId) {
  const stories = [];
  let seq = 1;

  for (const [mod, items] of Object.entries(groups)) {
    // Sub-group if > 10 bugs: security vs functional
    if (items.length > 10) {
      const secBugs = items.filter(f =>
        (f.bug_type || '').toLowerCase().includes('security') ||
        (f.bug_type || '').toLowerCase().includes('owasp') ||
        (f.dimension || '').includes('安全')
      );
      const funcBugs = items.filter(f => !secBugs.includes(f));

      if (secBugs.length > 0) {
        stories.push(buildStoryEntry(epicId, seq++, mod, 'security', secBugs));
      }
      if (funcBugs.length > 0) {
        stories.push(buildStoryEntry(epicId, seq++, mod, 'functional', funcBugs));
      }
    } else {
      stories.push(buildStoryEntry(epicId, seq++, mod, 'fixes', items));
    }
  }

  return stories;
}

function buildStoryEntry(epicId, seq, module, type, findings) {
  const files = collectFiles(findings);
  const priority = groupPriority(findings);
  const complexity = estimateComplexity(findings.length, files.length);
  const storyId = `${epicId.replace('epic-', '')}-${String(seq).padStart(2, '0')}-${module}-${type}`;

  return {
    storyId,
    epicId,
    module,
    type,
    bugCount: findings.length,
    priority,
    complexity,
    files,
    findings,
    severityCounts: {
      P0: findings.filter(f => f.severity === 'P0').length,
      P1: findings.filter(f => f.severity === 'P1').length,
      P2: findings.filter(f => f.severity === 'P2').length,
      P3: findings.filter(f => f.severity === 'P3').length,
      P4: findings.filter(f => f.severity === 'P4').length,
    },
  };
}

// ──── Mode: --create ────
function createStories(planId, epicId) {
  const db = getDb();
  const findings = queryFindings(db, planId, 'open', null);
  const groups = groupByModule(findings);
  const storyPlan = buildStoryPlan(groups, epicId);

  console.log(`\n=== Creating ${storyPlan.length} Stories for ${epicId} ===\n`);

  const scriptDir = __dirname;
  const upsertScript = path.join(scriptDir, 'upsert-story.js');
  const createdStories = [];

  for (const story of storyPlan) {
    // E2 fix: Skip stories that already exist (idempotent re-run protection)
    const existing = db.prepare('SELECT story_id, status FROM stories WHERE story_id = ?').get(story.storyId);
    if (existing && existing.status !== 'backlog') {
      console.log(`  ⏭️ ${story.storyId} — already exists (status: ${existing.status}), skipping`);
      continue;
    }

    const findingIds = story.findings.map(f => f.finding_id);
    const ac = buildAC(story.findings);
    const skills = MODULE_SKILL_MAP[story.module] || [];

    const storyData = {
      story_id: story.storyId,
      epic_id: epicId,
      domain: story.module,
      title: `[${story.module}] ${story.type === 'security' ? '安全性' : '功能性'}修復 (${story.bugCount} bugs)`,
      status: 'backlog',
      priority: story.priority,
      complexity: story.complexity,
      story_type: 'Bug Fix',
      source_file: 'db-first',
      discovery_source: `Smart Review-Fix Pipeline ${nowTs().split(' ')[0]} Plan:${planId}`,
      user_story: `As a developer, I want to fix ${story.bugCount} ${story.type} bugs in ${story.module}, so that the module quality improves.`,
      background: `Smart Review-Fix Pipeline 自動分組。\n\n關聯 Findings: ${findingIds.join(', ')}\n\n影響檔案: ${story.files.join(', ')}`,
      acceptance_criteria: ac,
      required_skills: skills.join(', '),
      affected_files: JSON.stringify(story.files),
    };

    // C2 fix: Write JSON to temp file to avoid Windows single-quote issues
    const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
    const tmpFile = path.join(tmpDir, `srf-story-${story.storyId}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(storyData, null, 2), 'utf-8');

    try {
      execSync(`node "${upsertScript}" "${tmpFile}"`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      console.log(`  ✅ ${story.storyId} — ${story.bugCount} bugs, ${story.complexity}, ${story.priority}`);
      createdStories.push(story);
    } catch (err) {
      console.error(`  ❌ ${story.storyId} — ${err.message}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  console.log(`\nCreated: ${createdStories.length}/${storyPlan.length} Stories`);
  db.close();
  return createdStories;
}

// ──── Mode: --link ────
function linkFindings(planId, epicId) {
  const db = getDb();
  const findings = queryFindings(db, planId, 'open', null);
  const groups = groupByModule(findings);
  const storyPlan = buildStoryPlan(groups, epicId);

  const update = db.prepare(`
    UPDATE review_findings
    SET fix_story_id = ?, fix_status = 'fixing', updated_at = ?
    WHERE finding_id = ?
  `);

  let linked = 0;
  const ts = nowTs();

  const transaction = db.transaction(() => {
    for (const story of storyPlan) {
      for (const finding of story.findings) {
        update.run(story.storyId, ts, finding.finding_id);
        linked++;
      }
    }
  });

  transaction();
  console.log(`✅ Linked ${linked} findings to ${storyPlan.length} Stories in ${epicId}`);
  db.close();
}

// ──── Mode: --next-epic-id ────
function suggestNextEpicId() {
  const db = getDb();

  // Find highest fix epic number
  const result = db.prepare(`
    SELECT epic_id FROM stories
    WHERE epic_id LIKE 'epic-fix%'
    GROUP BY epic_id
    ORDER BY epic_id DESC
    LIMIT 1
  `).get();

  let nextNum = 1;
  if (result) {
    const match = result.epic_id.match(/epic-fix(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  console.log(`epic-fix${nextNum}`);
  db.close();
}

// ──── Mode: --stats ────
function showStats(epicId) {
  const db = getDb();

  let sql, params;
  if (epicId) {
    sql = `SELECT fix_status, severity, COUNT(*) as cnt
           FROM review_findings
           WHERE fix_story_id LIKE ?
           GROUP BY fix_status, severity
           ORDER BY fix_status, severity`;
    params = [`${epicId.replace('epic-', '')}-%`];
  } else {
    sql = `SELECT fix_status, severity, COUNT(*) as cnt
           FROM review_findings
           GROUP BY fix_status, severity
           ORDER BY fix_status, severity`;
    params = [];
  }

  const rows = db.prepare(sql).all(...params);

  console.log(`\n=== Fix Progress Stats${epicId ? ': ' + epicId : ''} ===\n`);

  const statusMap = {};
  for (const r of rows) {
    if (!statusMap[r.fix_status]) statusMap[r.fix_status] = {};
    statusMap[r.fix_status][r.severity] = r.cnt;
  }

  console.log('| Status | P0 | P1 | P2 | P3 | P4 | Total |');
  console.log('|--------|----|----|----|----|----| ------|');

  for (const [status, sevs] of Object.entries(statusMap)) {
    const p0 = sevs.P0 || 0;
    const p1 = sevs.P1 || 0;
    const p2 = sevs.P2 || 0;
    const p3 = sevs.P3 || 0;
    const p4 = sevs.P4 || 0;
    const total = p0 + p1 + p2 + p3 + p4;
    console.log(`| ${status.padEnd(8)} | ${p0} | ${p1} | ${p2} | ${p3} | ${p4} | ${total} |`);
  }

  db.close();
}

// ──── Mode: --query ────
function queryMode(fixStatus, severity) {
  const db = getDb();
  const findings = queryFindings(db, null, fixStatus, severity);

  console.log(`\nFound ${findings.length} findings (fix_status=${fixStatus || 'any'}, severity=${severity || 'any'}):\n`);

  for (const f of findings.slice(0, 50)) {
    console.log(`  [${f.severity}] ${f.finding_id} — ${f.title || '(no title)'} | ${f.module_code} | ${f.fix_status} | ${f.file_path || '-'}:${f.line_number || '-'}`);
  }

  if (findings.length > 50) {
    console.log(`  ... and ${findings.length - 50} more`);
  }

  db.close();
}

// ──── CLI Router ────
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const planId = getArg('--plan');
const epicId = getArg('--epic');
const fixStatus = getArg('--fix-status');
const severity = getArg('--severity');

if (args.includes('--summary')) {
  showSummary(planId);
} else if (args.includes('--group')) {
  if (!epicId) { console.error('Error: --epic required for --group'); process.exit(1); }
  showGrouping(planId, epicId);
} else if (args.includes('--create')) {
  if (!planId || !epicId) { console.error('Error: --plan and --epic required for --create'); process.exit(1); }
  createStories(planId, epicId);
} else if (args.includes('--link')) {
  if (!planId || !epicId) { console.error('Error: --plan and --epic required for --link'); process.exit(1); }
  linkFindings(planId, epicId);
} else if (args.includes('--next-epic-id')) {
  suggestNextEpicId();
} else if (args.includes('--stats')) {
  showStats(epicId);
} else if (args.includes('--query')) {
  queryMode(fixStatus, severity);
} else {
  console.log(`
Usage:
  --plan <id> --summary              Show open findings summary by module
  --plan <id> --epic <id> --group    Preview Story groupings (dry-run)
  --plan <id> --epic <id> --create   Create Stories via upsert-story.js
  --plan <id> --epic <id> --link     Link findings to Stories (update fix_story_id)
  --next-epic-id                     Suggest next fix Epic ID
  --query --fix-status <s> [--severity <P>]  Query findings
  --stats [--epic <id>]              Fix progress statistics
  `);
}
