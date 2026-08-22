// ============================================================
// memoryService.test.ts — Memory Service 層單元測試
// AC-9: Service 層 >= 15 個測試，FTS5 安全化、CRUD、邊界條件
// 測試使用暫存 SQLite 實體檔案（FTS5 trigram 需物理 DB）
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── FTS5 Schema 建立（取自 init-db.js） ────────────────────────
function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('busy_timeout = 5000');

  conn.exec(`
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

  return conn;
}

// ── Module mock 設定 ────────────────────────────────────────────
vi.mock('../db.js', async () => {
  const { createDbConnection } = await import('../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

vi.mock('../config.js', () => ({
  config: { dbPath: '', port: 3001, allowedOrigin: 'http://localhost:5174', projectRoot: '' },
}));

import * as db from '../db.js';
import { config } from '../config.js';

// ── 測試 suite ──────────────────────────────────────────────────
describe('memoryService — searchContext', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-mem-svc-'));
    tmpDbPath = path.join(tmpDir, 'test.db');
    conn = initTestDb(tmpDbPath);

    // 注入測試 DB 至 getDb mock
    vi.mocked(db.getDb).mockReturnValue(conn);
    (config as { dbPath: string }).dbPath = tmpDbPath;

    // 插入測試資料
    conn
      .prepare(
        `INSERT INTO context_entries (agent_id, timestamp, category, tags, title, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('CC-OPUS', new Date().toISOString(), 'debug', 'sqlite,fts5', 'SQLite FTS5 測試記錄', 'FTS5 trigram 查詢測試內容，支援中文搜尋');

    conn
      .prepare(
        `INSERT INTO context_entries (agent_id, timestamp, category, tags, title, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('CC-SONNET', new Date().toISOString(), 'pattern', 'react,zustand', 'React Zustand 狀態管理', 'Zustand store 測試模式說明');
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('searchContext — 正常查詢回傳相符結果', async () => {
    const { searchContext } = await import('../services/memoryService.js');
    const result = searchContext('FTS5');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].title).toContain('FTS5');
  });

  it('searchContext — category 過濾', async () => {
    const { searchContext } = await import('../services/memoryService.js');
    const result = searchContext('FTS5', 'debug');
    expect(result.items.every((i) => i.category === 'debug')).toBe(true);
  });

  it('searchContext — 查詢 < 3 字元回傳空結果', async () => {
    const { searchContext } = await import('../services/memoryService.js');
    const result = searchContext('ab');
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('searchContext — 空字串回傳空結果', async () => {
    const { searchContext } = await import('../services/memoryService.js');
    const result = searchContext('');
    expect(result.items).toHaveLength(0);
  });

  it('searchContext — 特殊字元不 crash（雙引號轉義）', async () => {
    const { searchContext } = await import('../services/memoryService.js');
    expect(() => searchContext('"bad query"')).not.toThrow();
  });
});

describe('memoryService — browseContext', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-mem-browse-'));
    tmpDbPath = path.join(tmpDir, 'browse.db');
    conn = initTestDb(tmpDbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);

    // 插入 5 筆資料
    for (let i = 1; i <= 5; i++) {
      conn
        .prepare(
          `INSERT INTO context_entries (agent_id, timestamp, category, title, content)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('CC-OPUS', new Date().toISOString(), 'debug', `記錄 ${i}`, `內容 ${i}`);
    }
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('browseContext — 回傳正確分頁資訊', async () => {
    const { browseContext } = await import('../services/memoryService.js');
    const result = browseContext(undefined, 1, 3);
    expect(result.total).toBe(5);
    expect(result.items.length).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);
  });

  it('browseContext — 第 2 頁正確', async () => {
    const { browseContext } = await import('../services/memoryService.js');
    const result = browseContext(undefined, 2, 3);
    expect(result.items.length).toBe(2);
    expect(result.page).toBe(2);
  });

  it('browseContext — pageSize 上限 100', async () => {
    const { browseContext } = await import('../services/memoryService.js');
    const result = browseContext(undefined, 1, 9999);
    expect(result.pageSize).toBe(100);
  });

  it('browseContext — category 過濾', async () => {
    const { browseContext } = await import('../services/memoryService.js');
    const result = browseContext('debug', 1, 20);
    expect(result.items.every((i) => i.category === 'debug')).toBe(true);
  });
});

describe('memoryService — CRUD', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-mem-crud-'));
    tmpDbPath = path.join(tmpDir, 'crud.db');
    conn = initTestDb(tmpDbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);
    (config as { dbPath: string }).dbPath = tmpDbPath;
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createContext — 新增成功回傳 id', async () => {
    const { createContext } = await import('../services/memoryService.js');
    const result = createContext({
      title: '新測試記錄',
      content: '測試內容',
      category: 'debug',
    });
    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it('getContextById — 取得剛建立的記錄', async () => {
    const { createContext, getContextById } = await import('../services/memoryService.js');
    const { id } = createContext({ title: '查詢測試', content: '內容', category: 'pattern' });
    const item = getContextById(id!);
    expect(item).not.toBeNull();
    expect(item?.title).toBe('查詢測試');
  });

  it('getContextById — 不存在的 id 回傳 null', async () => {
    const { getContextById } = await import('../services/memoryService.js');
    const item = getContextById(99999);
    expect(item).toBeNull();
  });

  it('updateContext — 更新成功', async () => {
    const { createContext, updateContext, getContextById } = await import(
      '../services/memoryService.js'
    );
    const { id } = createContext({ title: '原標題', content: '內容', category: 'debug' });
    const r = updateContext(id!, { title: '新標題' });
    expect(r.success).toBe(true);
    const item = getContextById(id!);
    expect(item?.title).toBe('新標題');
  });

  it('deleteContext — 刪除成功後查無記錄', async () => {
    const { createContext, deleteContext, getContextById } = await import(
      '../services/memoryService.js'
    );
    const { id } = createContext({ title: '待刪除', content: '內容', category: 'debug' });
    const r = deleteContext(id!);
    expect(r.success).toBe(true);
    const item = getContextById(id!);
    expect(item).toBeNull();
  });

  it('createTech — 新增 tech entry 成功', async () => {
    const { createTech } = await import('../services/memoryService.js');
    const result = createTech({
      title: 'Tech 測試',
      outcome: '成功',
      category: 'architecture',
    });
    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it('getTechById — 取得 tech entry', async () => {
    const { createTech, getTechById } = await import('../services/memoryService.js');
    const { id } = createTech({ title: 'Tech 查詢', outcome: '成功', category: 'architecture' });
    const item = getTechById(id!);
    expect(item).not.toBeNull();
    expect(item?.title).toBe('Tech 查詢');
  });

  it('deleteTech — 刪除不存在 id 回傳 success=false', async () => {
    const { deleteTech } = await import('../services/memoryService.js');
    const result = deleteTech(99999);
    expect(result.success).toBe(false);
  });
});

describe('ftsHelper — sanitizeFtsQuery', () => {
  it('長度 < 3 回傳 null', async () => {
    const { sanitizeFtsQuery } = await import('../services/ftsHelper.js');
    expect(sanitizeFtsQuery('ab')).toBeNull();
    expect(sanitizeFtsQuery('')).toBeNull();
    expect(sanitizeFtsQuery('  ')).toBeNull();
  });

  it('長度 >= 3 回傳雙引號包裹的字串', async () => {
    const { sanitizeFtsQuery } = await import('../services/ftsHelper.js');
    expect(sanitizeFtsQuery('abc')).toBe('"abc"');
    expect(sanitizeFtsQuery('FTS5')).toBe('"FTS5"');
  });

  it('內含雙引號時正確轉義', async () => {
    const { sanitizeFtsQuery } = await import('../services/ftsHelper.js');
    expect(sanitizeFtsQuery('bad "query"')).toBe('"bad ""query"""');
  });

  it('前後空白自動去除', async () => {
    const { sanitizeFtsQuery } = await import('../services/ftsHelper.js');
    expect(sanitizeFtsQuery('  abc  ')).toBe('"abc"');
  });
});
