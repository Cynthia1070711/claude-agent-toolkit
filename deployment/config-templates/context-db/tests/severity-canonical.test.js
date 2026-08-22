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

const { scanAndNormalize } = await import('../scripts/_helpers/severity-canonical.js');

function createDbWithSeverities(dbPath, rows) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_debt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id TEXT UNIQUE NOT NULL,
      severity TEXT NOT NULL
    );
  `);
  const stmt = db.prepare('INSERT INTO tech_debt_items (debt_id, severity) VALUES (?, ?)');
  for (const row of rows) {
    stmt.run(row.debt_id, row.severity);
  }
  db.close();
}

describe('scanAndNormalize', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'severity-test-'));
    tempDbPath = path.join(tempDir, 'phycool.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('dry-run finds non-canonical severities but does not modify DB', () => {
    createDbWithSeverities(tempDbPath, [
      { debt_id: 'TD-S-01', severity: 'p3' },
      { debt_id: 'TD-S-02', severity: 'low' },
    ]);

    const result = scanAndNormalize({ execute: false });
    expect(result.scanned).toBe(1);
    expect(result.normalized).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].from).toBe('p3');
    expect(result.rows[0].to).toBe('medium');

    // Verify DB unchanged
    const db = new Database(tempDbPath, { readonly: true });
    const row = db.prepare("SELECT severity FROM tech_debt_items WHERE debt_id = 'TD-S-01'").get();
    expect(row.severity).toBe('p3');
    db.close();
  });

  it('execute mode normalizes non-canonical severity in DB', () => {
    createDbWithSeverities(tempDbPath, [
      { debt_id: 'TD-S-01', severity: 'P2' },
      { debt_id: 'TD-S-02', severity: 'medium' },
    ]);

    const result = scanAndNormalize({ execute: true });
    expect(result.scanned).toBe(1);
    expect(result.normalized).toBe(1);
    expect(result.rows[0].from).toBe('P2');
    expect(result.rows[0].to).toBe('high');

    // Verify DB updated
    const db = new Database(tempDbPath, { readonly: true });
    const row = db.prepare("SELECT severity FROM tech_debt_items WHERE debt_id = 'TD-S-01'").get();
    expect(row.severity).toBe('high');
    db.close();
  });

  it('returns scanned=0 when all severities are canonical', () => {
    createDbWithSeverities(tempDbPath, [
      { debt_id: 'TD-S-01', severity: 'critical' },
      { debt_id: 'TD-S-02', severity: 'high' },
      { debt_id: 'TD-S-03', severity: 'medium' },
      { debt_id: 'TD-S-04', severity: 'low' },
    ]);

    const result = scanAndNormalize({ execute: false });
    expect(result.scanned).toBe(0);
    expect(result.rows).toEqual([]);
  });
});
