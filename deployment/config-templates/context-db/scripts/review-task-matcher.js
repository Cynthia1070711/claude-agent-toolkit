// ============================================================
// Review Task Matcher — 自動匹配待執行的審查任務
// 查詢 DB 已完成 vs Plan 全量 → 產出待執行清單
// ============================================================
// Usage:
//   node .context-db/scripts/review-task-matcher.js --engine cc-opus
//   node .context-db/scripts/review-task-matcher.js --engine gemini
//   node .context-db/scripts/review-task-matcher.js --engine antigravity
//   node .context-db/scripts/review-task-matcher.js --engine gemini --next
//   node .context-db/scripts/review-task-matcher.js --all
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const ALL_MODULES = [
  'payment-subscription', 'auth', 'pdf-engine', 'editor-core',
  'admin-auth', 'business-api', 'admin-order',
  'dashboard', 'datasource', 'image-asset',
  'admin-member', 'admin-settings',
  'qr-barcode-serial', 'table-shape', 'admin-content',
  'admin-reports', 'admin-product', 'admin-templates'
];

const ENGINES = ['cc-opus', 'gemini', 'antigravity'];

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

function getCompletedTasks(db, engine) {
  return db.prepare(`
    SELECT module_code, review_mode, engine, score_total, bugs_total
    FROM review_reports
    WHERE status = 'completed' AND engine LIKE ?
    ORDER BY module_code
  `).all(`%${engine}%`);
}

function matchTasks(engine) {
  const db = getDb();
  const completed = getCompletedTasks(db, engine);
  const completedSet = new Set(completed.map(r => `${r.module_code}::${r.review_mode}`));

  const pending = [];
  for (const mod of ALL_MODULES) {
    if (!completedSet.has(`${mod}::code`)) {
      pending.push({ module: mod, mode: 'code', engine });
    }
  }
  // E2E only for antigravity
  if (engine === 'antigravity') {
    for (const mod of ALL_MODULES) {
      if (!completedSet.has(`${mod}::e2e`)) {
        pending.push({ module: mod, mode: 'e2e', engine });
      }
    }
  }

  db.close();
  return { engine, completed: completed.length, pending, total: ALL_MODULES.length };
}

function showAll() {
  const db = getDb();
  const results = {};
  for (const eng of ENGINES) {
    const completed = getCompletedTasks(db, eng);
    const completedMods = new Set(completed.map(r => r.module_code));
    const pendingMods = ALL_MODULES.filter(m => !completedMods.has(m));
    results[eng] = {
      completed: completed.length,
      completed_modules: completed.map(r => `${r.module_code} (${r.score_total})`),
      pending: pendingMods.length,
      pending_modules: pendingMods
    };
  }
  db.close();
  console.log(JSON.stringify(results, null, 2));
}

// CLI
const args = process.argv.slice(2);
const engineIdx = args.indexOf('--engine');
const engine = engineIdx >= 0 ? args[engineIdx + 1] : null;
const showNext = args.includes('--next');
const showAllFlag = args.includes('--all');

if (showAllFlag) {
  showAll();
} else if (engine) {
  const result = matchTasks(engine);
  if (showNext && result.pending.length > 0) {
    // Output just the next task (for script consumption)
    const next = result.pending[0];
    console.log(JSON.stringify(next));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} else {
  console.log(`Usage:
  --engine <cc-opus|gemini|antigravity>  Show completed/pending for engine
  --engine <engine> --next               Output next pending task (JSON)
  --all                                  Show all engines status`);
}
