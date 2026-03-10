// ============================================================
// Context Memory DB — Schema 初始化
// 通用版：適用於任何使用 BMAD Method 的專案
// ============================================================
// 執行方式: node .context-db/scripts/init-db.js
// 冪等設計: 重複執行不報錯 (CREATE TABLE IF NOT EXISTS)
// FTS5 trigram: 查詢字串須 >= 3 字元
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'context-memory.db');

function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ── 1. 上下文記憶表 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT,
      agent_id        TEXT NOT NULL,
      timestamp       TEXT NOT NULL,
      category        TEXT NOT NULL,
      tags            TEXT,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      related_files   TEXT,
      story_id        TEXT,
      epic_id         TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
      title, content, tags,
      content=context_entries,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS context_ai AFTER INSERT ON context_entries BEGIN
      INSERT INTO context_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS context_ad AFTER DELETE ON context_entries BEGIN
      INSERT INTO context_fts(context_fts, rowid, title, content, tags)
      VALUES('delete', old.id, old.title, old.content, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS context_au AFTER UPDATE ON context_entries BEGIN
      INSERT INTO context_fts(context_fts, rowid, title, content, tags)
      VALUES('delete', old.id, old.title, old.content, old.tags);
      INSERT INTO context_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  // ── 2. 技術知識庫表 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by      TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT,
      category        TEXT NOT NULL,
      tech_stack      TEXT,
      tags            TEXT,
      title           TEXT NOT NULL,
      problem         TEXT,
      solution        TEXT,
      outcome         TEXT NOT NULL,
      lessons         TEXT,
      code_snippets   TEXT,
      related_files   TEXT,
      "references"    TEXT,
      confidence      INTEGER DEFAULT 80
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS tech_fts USING fts5(
      title, problem, solution, lessons, tags,
      content=tech_entries,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tech_ai AFTER INSERT ON tech_entries BEGIN
      INSERT INTO tech_fts(rowid, title, problem, solution, lessons, tags)
      VALUES (new.id, new.title, new.problem, new.solution, new.lessons, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tech_ad AFTER DELETE ON tech_entries BEGIN
      INSERT INTO tech_fts(tech_fts, rowid, title, problem, solution, lessons, tags)
      VALUES('delete', old.id, old.title, old.problem, old.solution, old.lessons, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tech_au AFTER UPDATE ON tech_entries BEGIN
      INSERT INTO tech_fts(tech_fts, rowid, title, problem, solution, lessons, tags)
      VALUES('delete', old.id, old.title, old.problem, old.solution, old.lessons, old.tags);
      INSERT INTO tech_fts(rowid, title, problem, solution, lessons, tags)
      VALUES (new.id, new.title, new.problem, new.solution, new.lessons, new.tags);
    END;
  `);

  // ── 3. Sprint 狀態索引 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_index (
      story_id        TEXT PRIMARY KEY,
      epic_id         TEXT NOT NULL,
      title           TEXT NOT NULL,
      status          TEXT NOT NULL,
      priority        TEXT,
      assigned_agent  TEXT,
      last_updated    TEXT
    );
  `);

  db.close();

  console.log('Context Memory DB initialized successfully');
  console.log(`  Path: ${DB_PATH}`);
  console.log('  Tables: context_entries, context_fts, tech_entries, tech_fts, sprint_index');
  console.log('  Triggers: context_ai/ad/au, tech_ai/ad/au (FTS5 auto-sync)');
  console.log('  Mode: WAL');
}

try {
  initDb();
} catch (err) {
  console.error('Initialization failed:', err.message);
  process.exit(1);
}
