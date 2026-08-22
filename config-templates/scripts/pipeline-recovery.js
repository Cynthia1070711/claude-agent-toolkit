#!/usr/bin/env node
/**
 * pipeline-recovery.js — wfq-03 BR-005
 * 新 Session 啟動時掃描中斷 Story，提供恢復建議。
 *
 * Usage:
 *   node scripts/pipeline-recovery.js                  # 掃描全部非完成 Story
 *   node scripts/pipeline-recovery.js --story wfq-03   # 指定 Story
 *   node scripts/pipeline-recovery.js --verbose         # 顯示 log 匹配細節
 *   node scripts/pipeline-recovery.js --json            # JSON 輸出
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── CLI Args ──
const args    = process.argv.slice(2);
const storyId = args.includes('--story') ? args[args.indexOf('--story') + 1] : null;
const verbose = args.includes('--verbose');
const jsonOut = args.includes('--json');

const projectRoot = path.resolve(__dirname, '..');
const logsDir     = path.join(projectRoot, 'logs');
const dbPath      = path.join(projectRoot, '.context-db', 'phycool.db');
const nodeModDir  = path.join(projectRoot, '.context-db', 'node_modules');

// ── 29 error patterns ──
const QUOTA_PATTERNS = [
  'QUOTA_EXHAUSTED',
  'rate_limit_error',
  "You've hit your limit",
  'quota exceeded',
  'ResourceExhausted',
  'overloaded_error',
];

const MODEL_PATTERNS = [
  'MODEL_DEGRADED',
];

// ── Helpers ──
function loadDb() {
  try {
    const Database = require(path.join(nodeModDir, 'better-sqlite3'));
    return new Database(dbPath, { readonly: true });
  } catch (e) {
    console.error('[pipeline-recovery] Cannot open DB:', e.message);
    process.exit(1);
  }
}

function getIncompleteStories(db, filterStoryId) {
  let query = `
    SELECT story_id, status, title, complexity, updated_at
    FROM stories
    WHERE status NOT IN ('done', 'backlog')
  `;
  const params = [];
  if (filterStoryId) {
    query += ' AND story_id = ?';
    params.push(filterStoryId);
  }
  query += ' ORDER BY updated_at DESC LIMIT 50';
  return db.prepare(query).all(...params);
}

function scanLogs(sid) {
  // Look for pipeline log files matching story id
  const logFiles = [];
  try {
    const files = fs.readdirSync(logsDir);
    for (const f of files) {
      if (f.includes(sid) && (f.endsWith('.log') || f.endsWith('.txt'))) {
        logFiles.push(path.join(logsDir, f));
      }
    }
  } catch (_) { /* no logs dir */ }
  return logFiles;
}

function diagnose(story) {
  const sid = story.story_id;
  const logFiles = scanLogs(sid);

  let quotaHit   = false;
  let modelDeg   = false;
  let logMatches = [];

  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      for (const pat of QUOTA_PATTERNS) {
        if (content.includes(pat)) {
          quotaHit = true;
          logMatches.push({ file: path.basename(logFile), pattern: pat });
          if (verbose) console.error(`  [MATCH] ${path.basename(logFile)}: "${pat}"`);
        }
      }
      for (const pat of MODEL_PATTERNS) {
        if (content.includes(pat)) {
          modelDeg = true;
          logMatches.push({ file: path.basename(logFile), pattern: pat });
          if (verbose) console.error(`  [MATCH] ${path.basename(logFile)}: "${pat}"`);
        }
      }
    } catch (_) { /* skip unreadable file */ }
  }

  // Check git diff
  let hasUncommitted = false;
  try {
    const diff = execSync('git diff --stat', { cwd: projectRoot, timeout: 5000 }).toString().trim();
    hasUncommitted = diff.length > 0;
  } catch (_) { /* ignore */ }

  // Classify
  let diagnosis;
  let action;
  const st = story.status;

  if (quotaHit) {
    diagnosis = 'QUOTA_EXHAUSTED';
    action    = '等待配額恢復 → 確認配額 → 以 --skip-dev/--skip-create 重試 Pipeline';
  } else if (modelDeg) {
    diagnosis = 'MODEL_DEGRADED';
    action    = '確認模型可用 → 手動設 status 回前一階段 → 重試 Pipeline';
  } else if (st === 'creating') {
    diagnosis = 'INTERRUPTED_CREATE';
    action    = hasUncommitted
      ? '有未提交變更 → 確認 Story.md 完整 → --skip-create 繼續'
      : '從頭重試 Pipeline（無已儲存進度）';
  } else if (st === 'in-progress') {
    diagnosis = 'INTERRUPTED_DEV';
    action    = hasUncommitted
      ? '有未提交變更 → 確認實作完整 → --skip-dev 繼續'
      : 'NORMAL_TIMEOUT → 增加 timeout 或拆分 Story → 重試 dev-story';
  } else if (st === 'review') {
    diagnosis = 'INTERRUPTED_REVIEW';
    action    = '以 --skip-create --skip-dev 重試 code-review';
  } else {
    diagnosis = 'NORMAL_TIMEOUT';
    action    = '增加 phaseTimeout 或拆分 Story → 重試 Pipeline';
  }

  return { diagnosis, action, logMatches, hasUncommitted, logFiles: logFiles.map(f => path.basename(f)) };
}

// ── Main ──
const db = loadDb();
const stories = getIncompleteStories(db, storyId);
db.close();

if (stories.length === 0) {
  console.log('\n✅ 無中斷 Story，Pipeline 狀態正常。\n');
  process.exit(0);
}

const results = stories.map(s => {
  const info = diagnose(s);
  return {
    story_id:    s.story_id,
    status:      s.status,
    title:       s.title,
    complexity:  s.complexity,
    updated_at:  s.updated_at,
    diagnosis:   info.diagnosis,
    action:      info.action,
    log_files:   info.logFiles,
    log_matches: info.logMatches,
    has_uncommitted: info.hasUncommitted,
  };
});

if (jsonOut) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

// Table output
console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log('  Pipeline Recovery Diagnosis — wfq-03');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

const colWidths = { story_id: 28, status: 14, diagnosis: 22, action: 38 };
const header = [
  'Story ID'.padEnd(colWidths.story_id),
  'Status'.padEnd(colWidths.status),
  'Diagnosis'.padEnd(colWidths.diagnosis),
  'Suggested Action',
].join(' │ ');
console.log('  ' + header);
console.log('  ' + '─'.repeat(header.length));

for (const r of results) {
  const row = [
    r.story_id.padEnd(colWidths.story_id),
    r.status.padEnd(colWidths.status),
    r.diagnosis.padEnd(colWidths.diagnosis),
    r.action,
  ].join(' │ ');
  console.log('  ' + row);
  if (verbose && r.log_matches.length > 0) {
    for (const m of r.log_matches) {
      console.log(`      └─ [${m.file}] matched: "${m.pattern}"`);
    }
  }
}

console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log('  Recovery SOP: docs/implementation-artifacts/specs/pipeline-recovery-sop.md');
console.log('════════════════════════════════════════════════════════════════════════════════\n');
