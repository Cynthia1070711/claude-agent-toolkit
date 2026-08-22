// ============================================================
// db.test.ts — SQLite 連線層單元測試
// AC-3: WAL 模式、busy_timeout 5000ms、graceful handling
// 5.2: SQLite 連線成功、WAL 模式、busy_timeout、DB 不存在 graceful
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createDbConnection, getDbStats } from '../db.js';

describe('createDbConnection', () => {
  let tmpDir: string;
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-db-test-'));
    tmpDbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('DB 不存在時回傳 null（graceful，不 crash）', () => {
    const result = createDbConnection(path.join(tmpDir, 'nonexistent.db'));
    expect(result).toBeNull();
  });

  it('DB 存在時回傳 Database 實例', () => {
    new Database(tmpDbPath).close();
    const conn = createDbConnection(tmpDbPath);
    expect(conn).not.toBeNull();
    conn?.close();
  });

  it('WAL 模式啟用驗證', () => {
    new Database(tmpDbPath).close();
    const conn = createDbConnection(tmpDbPath);
    expect(conn).not.toBeNull();

    if (conn) {
      const rows = conn.pragma('journal_mode') as Array<{ journal_mode: string }>;
      expect(rows[0].journal_mode).toBe('wal');
      conn.close();
    }
  });

  it('busy_timeout 設定為 5000ms', () => {
    new Database(tmpDbPath).close();
    const conn = createDbConnection(tmpDbPath);
    expect(conn).not.toBeNull();

    try {
      if (conn) {
        // SQLite PRAGMA busy_timeout 回傳欄位名為 "timeout"
        const rows = conn.pragma('busy_timeout') as Array<{ timeout: number }>;
        expect(rows[0].timeout).toBe(5000);
      }
    } finally {
      // 確保 WAL 檔案解鎖後 afterEach 可刪除目錄
      conn?.close();
    }
  });
});

describe('getDbStats', () => {
  let tmpDir: string;
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-stats-test-'));
    tmpDbPath = path.join(tmpDir, 'stats.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('DB 不存在時回傳 connected=false, sizeBytes=0', () => {
    const stats = getDbStats(path.join(tmpDir, 'missing.db'));
    expect(stats.connected).toBe(false);
    expect(stats.sizeBytes).toBe(0);
    expect(stats.tableCount).toBe(0);
  });

  it('DB 存在時回傳 connected=true, sizeBytes > 0', () => {
    const seed = new Database(tmpDbPath);
    seed.exec('CREATE TABLE test_tbl (id INTEGER PRIMARY KEY)');
    seed.close();

    const stats = getDbStats(tmpDbPath);
    expect(stats.connected).toBe(true);
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(stats.path).toBe(tmpDbPath);
  });

  it('DB 存在且有資料表時 tableCount > 0', () => {
    const seed = new Database(tmpDbPath);
    seed.exec('CREATE TABLE context_entries (id INTEGER PRIMARY KEY, title TEXT)');
    seed.exec('CREATE TABLE tech_entries (id INTEGER PRIMARY KEY, tech TEXT)');
    seed.close();

    const stats = getDbStats(tmpDbPath);
    expect(stats.tableCount).toBeGreaterThanOrEqual(2);
  });
});
