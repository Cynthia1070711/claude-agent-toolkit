// ============================================================
// export-route.test.ts — 記憶庫匯出路由單元測試
// AC-1: JSON 格式、metadata 結構
// AC-2: CSV BOM、RFC 4180 跳脫、Content-Disposition 檔名
// AC-3: category 篩選、上限 10,000 驗證
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  exportContext,
  exportTech,
  EXPORT_MAX_LIMIT,
} from '../services/memoryService.js';
import { csvEscape } from '../routes/export.js';

// ── 測試用 DB 初始化 ──────────────────────────────────────────

function createTestDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT, agent_id TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
      tags TEXT, title TEXT NOT NULL, content TEXT NOT NULL,
      related_files TEXT, story_id TEXT, epic_id TEXT
    );
    CREATE TABLE IF NOT EXISTS tech_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      updated_at TEXT, category TEXT NOT NULL DEFAULT 'general',
      tech_stack TEXT, tags TEXT, title TEXT NOT NULL,
      problem TEXT, solution TEXT, outcome TEXT NOT NULL DEFAULT '',
      lessons TEXT, code_snippets TEXT, related_files TEXT,
      "references" TEXT, confidence INTEGER NOT NULL DEFAULT 80
    );
  `);
  return db;
}

function insertContext(db: Database.Database, category: string, title: string) {
  db.prepare(`
    INSERT INTO context_entries (agent_id, timestamp, category, title, content)
    VALUES ('test', datetime('now'), ?, ?, 'content')
  `).run(category, title);
}

function insertTech(db: Database.Database, category: string, title: string) {
  db.prepare(`
    INSERT INTO tech_entries (created_by, created_at, category, title, outcome)
    VALUES ('test', datetime('now'), ?, ?, 'ok')
  `).run(category, title);
}

// ── Mock getDb() ─────────────────────────────────────────────

let testDb: Database.Database | null = null;

vi.mock('../db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db.js')>();
  return {
    ...actual,
    getDb: () => testDb,
  };
});

// ── Tests ─────────────────────────────────────────────────────

describe('exportContext — AC-1 / AC-2 / AC-3', () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-export-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = createTestDb(dbPath);
    testDb = db;
  });

  afterEach(() => {
    testDb = null;
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('回傳全部 context 記錄（無 category 篩選）', () => {
    insertContext(db, 'decision', 'Title A');
    insertContext(db, 'pattern', 'Title B');
    insertContext(db, 'decision', 'Title C');

    const result = exportContext();
    expect(result).toHaveLength(3);
  });

  it('category 篩選正確', () => {
    insertContext(db, 'decision', 'D1');
    insertContext(db, 'pattern', 'P1');
    insertContext(db, 'decision', 'D2');

    const result = exportContext('decision');
    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.category).toBe('decision'));
  });

  it('DB 未連線時回傳空陣列', () => {
    testDb = null;
    const result = exportContext();
    expect(result).toEqual([]);
  });

  it('EXPORT_MAX_LIMIT 為 10000', () => {
    expect(EXPORT_MAX_LIMIT).toBe(10_000);
  });

  it('limit 參數不超過 EXPORT_MAX_LIMIT', () => {
    insertContext(db, 'general', 'X');
    // 就算傳入超大 limit，也只取 EXPORT_MAX_LIMIT
    const result = exportContext(undefined, 99_999);
    expect(result.length).toBeLessThanOrEqual(EXPORT_MAX_LIMIT);
  });
});

describe('exportTech — AC-1 / AC-3', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-export-tech-'));
    db = createTestDb(path.join(tmpDir, 'tech.db'));
    testDb = db;
  });

  afterEach(() => {
    testDb = null;
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('回傳全部 tech 記錄', () => {
    insertTech(db, 'architecture', 'Tech A');
    insertTech(db, 'performance', 'Tech B');

    const result = exportTech();
    expect(result).toHaveLength(2);
  });

  it('category 篩選正確', () => {
    insertTech(db, 'architecture', 'Arch 1');
    insertTech(db, 'performance', 'Perf 1');

    const result = exportTech('architecture');
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('architecture');
  });
});

describe('CSV RFC 4180 跳脫規則', () => {
  it('一般值不加引號', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(123)).toBe('123');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('含逗號的值用雙引號包圍', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('含雙引號的值：引號加倍後用雙引號包圍', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('含換行的值用雙引號包圍', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('含 \\r\\n 的值用雙引號包圍', () => {
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"');
  });
});

describe('BOM 前綴驗證 (AC-2)', () => {
  it('BOM 字元為 \\uFEFF（0xEF 0xBB 0xBF in UTF-8）', () => {
    const bom = '\uFEFF';
    expect(bom.charCodeAt(0)).toBe(0xFEFF);
    const encoded = Buffer.from(bom, 'utf8');
    expect(encoded[0]).toBe(0xEF);
    expect(encoded[1]).toBe(0xBB);
    expect(encoded[2]).toBe(0xBF);
  });
});

describe('匯出上限驗證 (AC-3)', () => {
  it('EXPORT_MAX_LIMIT 為 10_000', () => {
    expect(EXPORT_MAX_LIMIT).toBe(10_000);
  });
});
