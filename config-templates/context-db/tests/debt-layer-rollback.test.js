import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

// We test createBackup, rollbackFromBackup, listBackups
// These functions use DB_PATH and BACKUPS_DIR from tech-debt-schema.js
// We need to mock those to use temp dirs

let tempDir;
let tempDbPath;
let tempBackupsDir;

vi.mock('../scripts/_migrations/tech-debt-schema.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    get DB_PATH() { return tempDbPath; },
    get BACKUPS_DIR() { return tempBackupsDir; },
  };
});

const { createBackup, rollbackFromBackup, listBackups } = await import('../scripts/debt-layer-rollback.js');

function createTempDbWithData(dbPath, rowCount = 5) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_debt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id TEXT UNIQUE NOT NULL,
      story_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'CQD',
      severity TEXT NOT NULL DEFAULT 'low',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );
  `);
  const stmt = db.prepare('INSERT INTO tech_debt_items (debt_id, story_id, title, created_at) VALUES (?, ?, ?, ?)');
  for (let i = 1; i <= rowCount; i++) {
    stmt.run(`TD-R-${i}`, 'test-story', `Rollback test ${i}`, '2026-01-01T00:00:00+08:00');
  }
  db.close();
}

describe('createBackup', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
    tempDbPath = path.join(tempDir, 'phycool.db');
    tempBackupsDir = path.join(tempDir, 'backups');

    createTempDbWithData(tempDbPath, 5);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates backup file with size > 0', () => {
    const result = createBackup('test');
    expect(result.size_bytes).toBeGreaterThan(0);
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.filename).toContain('test');
  });

  it('adds HHmm suffix when same-day backup exists', () => {
    const first = createBackup('test');
    const second = createBackup('test');
    expect(second.filename).not.toBe(first.filename);
    expect(second.filename).toMatch(/-\d{4}$/);
  });
});

describe('rollbackFromBackup', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
    tempDbPath = path.join(tempDir, 'phycool.db');
    tempBackupsDir = path.join(tempDir, 'backups');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('restores row count to match backup (BR-RB-03)', () => {
    // Create DB with 10 rows, backup it
    createTempDbWithData(tempDbPath, 10);
    const backupResult = createBackup('test');

    // Add more rows to main DB (simulating changes)
    const db = new Database(tempDbPath);
    const stmt = db.prepare('INSERT INTO tech_debt_items (debt_id, story_id, title, created_at) VALUES (?, ?, ?, ?)');
    for (let i = 11; i <= 15; i++) {
      stmt.run(`TD-R-${i}`, 'test-story', `Extra ${i}`, '2026-01-01T00:00:00+08:00');
    }
    const beforeCount = db.prepare('SELECT COUNT(*) c FROM tech_debt_items').get().c;
    expect(beforeCount).toBe(15);
    db.close();

    // Rollback
    const result = rollbackFromBackup(backupResult.path);
    expect(result.backup_count).toBe(10);
    expect(result.restored_count).toBe(10);
  });

  it('throws E-DLA-RB-01 when backup file not found', () => {
    createTempDbWithData(tempDbPath, 1);
    try {
      rollbackFromBackup('/nonexistent/path/backup.db');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.code).toBe('E-DLA-RB-01');
      expect(err.message).toContain('backup file not found');
    }
  });

  it('throws E-DLA-RB-03 on row count mismatch after restore', () => {
    // Create DB with 3 rows and backup it
    createTempDbWithData(tempDbPath, 3);
    const backupResult = createBackup('test');

    // Add a trigger on main that silently skips rows with id > 2
    // This simulates schema drift causing partial restore
    const db = new Database(tempDbPath);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS block_high_id
      BEFORE INSERT ON tech_debt_items
      WHEN NEW.id > 2
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);
    db.close();

    // Rollback: backup has 3 rows, but trigger blocks id=3 → restored=2 → mismatch
    try {
      rollbackFromBackup(backupResult.path);
      expect.fail('Should have thrown E-DLA-RB-03');
    } catch (err) {
      expect(err.message).toContain('E-DLA-RB-03');
      expect(err.message).toContain('row count mismatch');
    }
  });
});

describe('listBackups', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
    tempDbPath = path.join(tempDir, 'phycool.db');
    tempBackupsDir = path.join(tempDir, 'backups');

    createTempDbWithData(tempDbPath, 3);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns backups sorted by mtime descending', () => {
    createBackup('first');
    createBackup('second');
    const list = listBackups();
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    if (list.length >= 2) {
      expect(list[0].mtime >= list[1].mtime).toBe(true);
    }
  });

  it('returns empty array when no backups exist', () => {
    fs.mkdirSync(tempBackupsDir, { recursive: true });
    const list = listBackups();
    expect(list).toEqual([]);
  });
});
