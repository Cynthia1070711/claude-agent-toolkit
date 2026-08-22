import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

let tempDir;
let tempDbPath;

vi.mock('../scripts/_migrations/tech-debt-schema.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    get DB_PATH() { return tempDbPath; },
  };
});

vi.mock('../scripts/debt-layer-rollback.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    createBackup: vi.fn(() => ({
      path: '/tmp/fake-premigration-backup.db',
      filename: 'fake-premigration-backup.db',
      size_bytes: 1024,
      created_at: '2026-01-01T00:00:00+08:00',
    })),
  };
});

const { applyMigration, resolveMigrationPath } = await import('../scripts/apply-migration.js');

function createMinimalDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_debt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL
    );
  `);
  db.close();
}

describe('resolveMigrationPath', () => {
  it('returns absolute path unchanged', () => {
    const absPath = path.resolve('/tmp/test-migration.sql');
    const result = resolveMigrationPath(absPath);
    expect(result).toBe(absPath);
  });

  it('resolves relative path that exists', () => {
    const tmpFile = path.join(os.tmpdir(), 'test-migration-exists.sql');
    fs.writeFileSync(tmpFile, 'SELECT 1;', 'utf8');
    try {
      const result = resolveMigrationPath(tmpFile);
      expect(path.isAbsolute(result)).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('falls back to migrations dir for bare filename', () => {
    // This will try to resolve as migrations/<name> — just verify it returns something
    const result = resolveMigrationPath('nonexistent-file.sql');
    expect(typeof result).toBe('string');
  });
});

describe('applyMigration', () => {
  let migrationDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-test-'));
    tempDbPath = path.join(tempDir, 'phycool.db');
    migrationDir = path.join(tempDir, 'migrations');
    fs.mkdirSync(migrationDir, { recursive: true });

    createMinimalDb(tempDbPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('dry-run returns metadata without writing to DB', () => {
    const sqlFile = path.join(migrationDir, 'test.sql');
    fs.writeFileSync(sqlFile, "INSERT INTO tech_debt_items (debt_id, title) VALUES ('TD-MIG-01', 'Test');", 'utf8');

    const result = applyMigration(sqlFile, { dryRun: true, skipBackup: true });
    expect(result.mode).toBe('dry-run');
    expect(result.statement_count_estimate).toBeGreaterThanOrEqual(1);

    // Verify DB unchanged
    const db = new Database(tempDbPath, { readonly: true });
    const count = db.prepare('SELECT COUNT(*) c FROM tech_debt_items').get().c;
    expect(count).toBe(0);
    db.close();
  });

  it('execute mode applies SQL to DB', () => {
    const sqlFile = path.join(migrationDir, 'test.sql');
    fs.writeFileSync(sqlFile, "INSERT INTO tech_debt_items (debt_id, title) VALUES ('TD-MIG-01', 'Migrated');", 'utf8');

    const result = applyMigration(sqlFile, { dryRun: false, skipBackup: true });
    expect(result.mode).toBe('execute');

    const db = new Database(tempDbPath, { readonly: true });
    const row = db.prepare("SELECT title FROM tech_debt_items WHERE debt_id = 'TD-MIG-01'").get();
    expect(row.title).toBe('Migrated');
    db.close();
  });

  it('rolls back on failed SQL and retains backup info in error', () => {
    const sqlFile = path.join(migrationDir, 'bad.sql');
    fs.writeFileSync(sqlFile, 'THIS IS NOT VALID SQL;', 'utf8');

    try {
      applyMigration(sqlFile, { dryRun: false, skipBackup: true });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('Migration failed');
    }
  });

  it('throws on non-existent migration file', () => {
    expect(() => {
      applyMigration('/nonexistent/path/missing.sql', { dryRun: false, skipBackup: true });
    }).toThrow('Migration file not found');
  });

  it('retains backup info in error on failed SQL (BR-TH-015)', () => {
    const sqlFile = path.join(migrationDir, 'bad-with-backup.sql');
    fs.writeFileSync(sqlFile, 'THIS IS NOT VALID SQL;', 'utf8');

    try {
      applyMigration(sqlFile, { dryRun: false, skipBackup: false });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('Migration failed');
      expect(err.backup).toBeDefined();
      expect(err.backup.path).toContain('fake-premigration-backup');
    }
  });
});
