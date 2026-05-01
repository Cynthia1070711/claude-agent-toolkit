// ============================================================
// query-watches-hits.js — Watches Hits Query Interface
// 供 Skill Sync Gate 或 MCP 工具查詢近期 watches 命中紀錄
//
// 執行: node .context-db/scripts/query-watches-hits.js --since "2026-04-05T10:00:00"
// 輸出: JSON 陣列 (skill_name, hit_count, files, watch_domains)
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  console.error('[query-watches-hits] better-sqlite3 not found');
  process.exit(1);
}

// ============================================================
// 查詢邏輯 (BR-03)
// ============================================================

/**
 * 查詢指定時間點之後的 watches 命中記錄，聚合為 per-skill 格式
 *
 * @param {object} db - better-sqlite3 DB instance
 * @param {string} since - ISO 8601 時間戳 (e.g. "2026-04-05T10:00:00")
 * @returns {{ skill_name: string, hit_count: number, files: string[], watch_domains: string[] }[]}
 */
export function queryWatchesHits(db, since) {
  // 確認表存在
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='watches_hits'"
  ).get();

  if (!tableExists) return [];

  let rows;
  if (since) {
    rows = db.prepare(
      'SELECT skill_name, file_path, watch_domain FROM watches_hits WHERE hit_at >= ? ORDER BY skill_name'
    ).all(since);
  } else {
    rows = db.prepare(
      'SELECT skill_name, file_path, watch_domain FROM watches_hits ORDER BY skill_name'
    ).all();
  }

  if (rows.length === 0) return [];

  // 按 skill_name 聚合
  const skillMap = new Map();
  for (const row of rows) {
    if (!skillMap.has(row.skill_name)) {
      skillMap.set(row.skill_name, { skill_name: row.skill_name, hit_count: 0, files: new Set(), watch_domains: new Set() });
    }
    const entry = skillMap.get(row.skill_name);
    entry.hit_count++;
    // 只取檔名（不含路徑）以簡化輸出
    const filename = row.file_path.replace(/\\/g, '/').split('/').pop() || row.file_path;
    entry.files.add(filename);
    if (row.watch_domain) entry.watch_domains.add(row.watch_domain);
  }

  // 轉為陣列並序列化 Set
  return Array.from(skillMap.values()).map(e => ({
    skill_name: e.skill_name,
    hit_count: e.hit_count,
    files: Array.from(e.files),
    watch_domains: Array.from(e.watch_domains),
  }));
}

// ============================================================
// CLI 入口
// ============================================================

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);

  // 解析 --since 參數
  let since = null;
  const sinceIdx = args.indexOf('--since');
  if (sinceIdx !== -1 && args[sinceIdx + 1]) {
    since = args[sinceIdx + 1];
  }

  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    const result = queryWatchesHits(db, since);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[query-watches-hits]', err.message);
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}
