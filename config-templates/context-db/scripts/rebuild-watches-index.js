// ============================================================
// rebuild-watches-index.js — Skill Watches Index Builder
// 掃描 .claude/skills/*/SKILL.md 的 watches frontmatter
// 清空並重建 skill_watches_index 表
//
// 執行: node .context-db/scripts/rebuild-watches-index.js
// 輸出: Indexed N watches from M skills
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  console.error('[watches-index] better-sqlite3 not found — abort');
  process.exit(1);
}

// ============================================================
// DB Schema (幂等建立)
// ============================================================

export function ensureWatchesTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_watches_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_name TEXT NOT NULL,
      glob_pattern TEXT NOT NULL,
      watch_domain TEXT,
      indexed_at TEXT NOT NULL,
      stale INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_swi_skill ON skill_watches_index(skill_name);

    CREATE TABLE IF NOT EXISTS watches_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      watch_glob TEXT NOT NULL,
      watch_domain TEXT,
      hit_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wh_skill ON watches_hits(skill_name);
    CREATE INDEX IF NOT EXISTS idx_wh_hit_at ON watches_hits(hit_at);
  `);
}

// ============================================================
// YAML frontmatter 解析 — 提取 watches 欄位
// ============================================================

/**
 * 從 SKILL.md 內容解析 YAML frontmatter 中的 watches 欄位
 * 格式:
 *   watches:
 *     - glob: "src/**\/*.cs"
 *       domain: payment
 *
 * @param {string} content
 * @returns {{ glob: string, domain: string }[]}
 */
export function parseWatchesFrontmatter(content) {
  // 提取 frontmatter 區段 (--- ... ---)
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return [];

  const fm = fmMatch[1];
  const lines = fm.split(/\r?\n/);

  const watches = [];
  let inWatches = false;
  let current = null;

  for (const line of lines) {
    if (!inWatches) {
      // watches: 區段開始
      if (/^watches:\s*$/.test(line)) {
        inWatches = true;
      }
      continue;
    }

    // 遇到非縮排行（同或更低層級）→ 離開 watches 區段
    if (/^\S/.test(line)) break;

    const globMatch = line.match(/^\s+-\s+glob:\s+"?([^"]+?)"?\s*$/);
    if (globMatch) {
      if (current) watches.push(current);
      current = { glob: globMatch[1].trim(), domain: null };
      continue;
    }

    const domainMatch = line.match(/^\s+domain:\s+(\S+)\s*$/);
    if (domainMatch && current) {
      current.domain = domainMatch[1].trim();
      continue;
    }
  }

  if (current) watches.push(current);
  return watches;
}

// ============================================================
// Glob-to-Regex 轉換 (T3)
// ============================================================

/**
 * 將 glob pattern 轉為 RegExp (記憶體比對，非 filesystem)
 *
 * 支援:
 *   **  → 任意深度目錄
 *   *   → 單層任意字元 (不含 /)
 *   ?   → 單一字元 (不含 /)
 *   .   → 字面 dot
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegex(glob) {
  const normalized = glob.replace(/\\/g, '/');
  let regex = '';

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '*' && normalized[i + 1] === '*') {
      // ** — 任意深度
      if (normalized[i + 2] === '/') {
        regex += '(?:.*/)?';
        i += 2; // skip **/ (3 chars total: **, /)
      } else {
        regex += '.*';
        i += 1; // skip second *
      }
    } else if (c === '*') {
      regex += '[^/]*';
    } else if (c === '?') {
      regex += '[^/]';
    } else if (c === '{') {
      // {a,b,c} brace expansion → (?:a|b|c)
      const closeIdx = normalized.indexOf('}', i);
      if (closeIdx !== -1) {
        const alternatives = normalized.substring(i + 1, closeIdx).split(',');
        regex += '(?:' + alternatives.map(a => a.replace(/\./g, '\\.')).join('|') + ')';
        i = closeIdx; // skip to }
      } else {
        regex += '\\{';
      }
    } else if (c === '}') {
      // Unmatched } — escape it
      regex += '\\}';
    } else if (c === '.') {
      regex += '\\.';
    } else if (/[+^$()|[\]]/.test(c)) {
      regex += '\\' + c;
    } else {
      regex += c;
    }
  }

  return new RegExp(regex + '$', 'i');
}

// ============================================================
// 主執行邏輯
// ============================================================

/**
 * 掃描所有 SKILL.md，重建 skill_watches_index 表
 *
 * @param {object} db - better-sqlite3 DB instance (可選，不傳則自建)
 * @returns {{ watchCount: number, skillCount: number }}
 */
export function rebuildWatchesIndex(db) {
  const shouldClose = !db;
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }

  try {
    ensureWatchesTables(db);

    // 掃描所有 SKILL.md
    const skillsDir = path.join(PROJECT_ROOT, '.claude', 'skills');
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const now = getTaiwanTimestamp();
    let watchCount = 0;
    let skillCount = 0;
    const insertRows = [];

    for (const skillDir of skillDirs) {
      const skillMdPath = path.join(skillsDir, skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      let content;
      try {
        content = fs.readFileSync(skillMdPath, 'utf-8');
      } catch {
        continue;
      }

      const watches = parseWatchesFrontmatter(content);
      if (watches.length === 0) continue;

      skillCount++;
      for (const w of watches) {
        insertRows.push({ skill_name: skillDir, glob_pattern: w.glob, watch_domain: w.domain, indexed_at: now });
        watchCount++;
      }
    }

    // 使用 transaction 清空後批量插入 (原子操作)
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM skill_watches_index').run();
      const insert = db.prepare(
        'INSERT INTO skill_watches_index (skill_name, glob_pattern, watch_domain, indexed_at, stale) VALUES (?, ?, ?, ?, 0)'
      );
      for (const row of insertRows) {
        insert.run(row.skill_name, row.glob_pattern, row.watch_domain, row.indexed_at);
      }
    });
    tx();

    return { watchCount, skillCount };
  } finally {
    if (shouldClose && db) db.close();
  }
}

// ============================================================
// CLI 入口
// ============================================================

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { watchCount, skillCount } = rebuildWatchesIndex();
  console.log(`Indexed ${watchCount} watches from ${skillCount} skills`);
}
