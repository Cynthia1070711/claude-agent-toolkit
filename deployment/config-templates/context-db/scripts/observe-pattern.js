// ============================================================
// Phase 4: Continuous Learning — PostToolUse Observer
// Observes Edit/Write patterns, queues embedding updates
// ============================================================
// Input (stdin): { tool_name, tool_input: { file_path, ... } }
// Output: none (side-effect: DB writes)
// Safety: write connection, silent failure, < 2000ms
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { getTaiwanTimestamp } from './timezone.js';
import { ensureWatchesTables, globToRegex, rebuildWatchesIndex } from './rebuild-watches-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  process.exit(0);
}

// Source file patterns that have symbols in symbol_index
const SOURCE_PATTERNS = [
  /\.cs$/,
  /\.ts$/,
  /\.tsx$/,
];

// Domain detection from file path
function detectDomain(filePath) {
  const fp = filePath.replace(/\\/g, '/').toLowerCase();

  // AI Agent infrastructure
  if (fp.includes('/.claude/skills/') || fp.includes('/.gemini/skills/') || fp.includes('/.agent/skills/')) return 'skill';
  if (fp.includes('/.claude/rules/') || fp.includes('/.claude/hooks/')) return 'rules';
  if (fp.includes('.context-db/scripts/') || fp.includes('.context-db/server')) return 'memory-infra';
  if (fp.includes('dev-console/')) return 'dev-console';
  if (fp.includes('/_bmad/') || fp.includes('/bmad/')) return 'bmad';

  // Documentation
  if (fp.includes('/docs/implementation-artifacts/stories/')) return 'story';
  if (fp.includes('/docs/implementation-artifacts/reviews/')) return 'review';
  if (fp.includes('/docs/tracking/')) return 'tracking';
  if (fp.includes('/docs/') || fp.endsWith('.md')) return 'docs';

  // Pipeline / scripts
  if (fp.includes('/scripts/') && !fp.includes('.context-db')) return 'scripts';

  // Frontend (check /store before canvas — canvasStore.ts is state, not editor)
  if (fp.includes('/clientapp/')) {
    if (fp.includes('/store')) return 'state';
    if (fp.includes('/editor/') || fp.includes('/canvas/')) return 'editor';
    if (fp.includes('/component')) return 'component';
    if (fp.includes('/type')) return 'types';
    return 'frontend';
  }

  // Backend
  if (fp.includes('/admin/') || fp.includes('backoffice')) return 'admin';
  if (fp.includes('/service')) return 'service';
  if (fp.includes('/controller')) return 'controller';
  if (fp.includes('/model') || fp.includes('/entit')) return 'model';
  if (fp.includes('/migration')) return 'migration';
  if (fp.includes('/test') || fp.includes('.test.')) return 'test';

  // Config files
  if (fp.endsWith('.json') || fp.endsWith('.yaml') || fp.endsWith('.yml') || fp.endsWith('.csproj')) return 'config';

  return 'other';
}

// ============================================================
// Watches matching helpers (BR-02, BR-05, BR-06)
// ============================================================

/**
 * 從 DB 載入 watches 索引（含 stale 狀態檢查）
 * @param {object} db
 * @returns {{ stale: boolean, entries: {skill_name, glob_pattern, watch_domain}[] }}
 */
function loadWatchesIndex(db) {
  try {
    const staleCheck = db.prepare(
      'SELECT COUNT(*) as cnt FROM skill_watches_index WHERE stale = 1'
    ).get();
    const entries = db.prepare(
      'SELECT skill_name, glob_pattern, watch_domain FROM skill_watches_index WHERE stale = 0'
    ).all();
    const isEmpty = entries.length === 0;
    return { stale: staleCheck.cnt > 0 || isEmpty, entries };
  } catch {
    return { stale: true, entries: [] };
  }
}

/**
 * 比對 filePath 與 watches 索引，回傳所有命中項目
 * @param {string} filePath - 正規化後的 forward-slash 路徑
 * @param {{ skill_name: string, glob_pattern: string, watch_domain: string }[]} entries
 * @returns {{ skill_name: string, glob_pattern: string, watch_domain: string }[]}
 */
function matchWatches(filePath, entries) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const hits = [];

  for (const entry of entries) {
    try {
      const regex = globToRegex(entry.glob_pattern);
      if (regex.test(normalizedPath)) {
        hits.push(entry);
      }
    } catch {
      // 忽略無效的 glob pattern
    }
  }
  return hits;
}

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    process.exit(0);
  }

  const toolName = input.tool_name;
  const filePath = input.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const isSource = SOURCE_PATTERNS.some(p => p.test(filePath));
  const domain = detectDomain(filePath);
  const now = getTaiwanTimestamp();

  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Ensure tables exist (idempotent)
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        processed INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pattern_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        domain TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        change_type TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        occurrences INTEGER DEFAULT 1,
        confidence REAL DEFAULT 0.1
      );
    `);

    // Ensure watches tables exist
    ensureWatchesTables(db);

    // Queue for re-embedding if source file
    if (isSource) {
      const existing = db.prepare(
        'SELECT id FROM embedding_queue WHERE file_path = ? AND processed = 0'
      ).get(filePath);
      if (!existing) {
        db.prepare(
          'INSERT INTO embedding_queue (file_path, queued_at) VALUES (?, ?)'
        ).run(filePath, now);
      }
    }

    // Upsert pattern observation
    const existingPattern = db.prepare(
      'SELECT id, occurrences, confidence FROM pattern_observations WHERE file_path = ? AND domain = ? AND tool_name = ?'
    ).get(filePath, domain, toolName);

    if (existingPattern) {
      const newOcc = existingPattern.occurrences + 1;
      // Confidence grows logarithmically: 0.1 * ln(occurrences + 1), capped at 1.0
      const newConf = Math.min(1.0, 0.1 * Math.log(newOcc + 1));
      db.prepare(
        'UPDATE pattern_observations SET last_seen = ?, occurrences = ?, confidence = ? WHERE id = ?'
      ).run(now, newOcc, newConf, existingPattern.id);
    } else {
      db.prepare(`
        INSERT INTO pattern_observations (file_path, domain, tool_name, change_type, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(filePath, domain, toolName, isSource ? 'source' : 'config', now, now);
    }

    // === NEW: Watches matching (BR-02, BR-05, BR-06) ===

    // BR-06: 若編輯的是 SKILL.md，標記索引為 stale
    const normalizedFp = filePath.replace(/\\/g, '/').toLowerCase();
    if (domain === 'skill' && normalizedFp.endsWith('skill.md')) {
      try {
        db.prepare('UPDATE skill_watches_index SET stale = 1').run();
      } catch {
        // 表可能尚未建立 — 忽略
      }
    }

    // BR-02: 比對 watches 索引
    // 1. 載入索引（檢查 stale）
    let watchesIndex = loadWatchesIndex(db);

    // 2. 若 stale 或空，重建索引
    if (watchesIndex.stale) {
      try {
        rebuildWatchesIndex(db);
        watchesIndex = loadWatchesIndex(db);
      } catch {
        // 重建失敗 — 跳過 watches 比對，不阻塞主流程
        watchesIndex = { stale: false, entries: [] };
      }
    }

    // 3. 比對命中
    if (watchesIndex.entries.length > 0) {
      const hits = matchWatches(filePath, watchesIndex.entries);

      // 4. 寫入 watches_hits
      if (hits.length > 0) {
        const insertHit = db.prepare(
          'INSERT INTO watches_hits (file_path, skill_name, watch_glob, watch_domain, hit_at) VALUES (?, ?, ?, ?, ?)'
        );
        const insertAllHits = db.transaction((hitList) => {
          for (const hit of hitList) {
            insertHit.run(filePath, hit.skill_name, hit.glob_pattern, hit.watch_domain, now);
          }
        });
        insertAllHits(hits);
      }
    }
  } catch {
    // Silent failure — never block user
  } finally {
    if (db) db.close();
  }
}

main();
