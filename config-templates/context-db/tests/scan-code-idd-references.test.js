import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActiveIddIds, scanFile, walkDir, ANNOTATION_REGEX } from '../scripts/scan-code-idd-references.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── ANNOTATION_REGEX tests ──
describe('ANNOTATION_REGEX', () => {
  beforeEach(() => { ANNOTATION_REGEX.lastIndex = 0; });

  it('matches valid [Intentional: IDD-COM-001]', () => {
    const text = '// [Intentional: IDD-COM-001] Free plan editor';
    ANNOTATION_REGEX.lastIndex = 0;
    const match = ANNOTATION_REGEX.exec(text);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('IDD-COM-001');
  });

  it('matches without space [Intentional:IDD-STR-002]', () => {
    const text = '// [Intentional:IDD-STR-002]';
    ANNOTATION_REGEX.lastIndex = 0;
    const match = ANNOTATION_REGEX.exec(text);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('IDD-STR-002');
  });

  it('matches multiple annotations on same line', () => {
    const text = '[Intentional: IDD-COM-001] [Intentional: IDD-REG-003]';
    ANNOTATION_REGEX.lastIndex = 0;
    const matches = [...text.matchAll(ANNOTATION_REGEX)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe('IDD-COM-001');
    expect(matches[1][1]).toBe('IDD-REG-003');
  });

  it('does not match invalid format IDD-com-001 (lowercase type)', () => {
    const text = '[Intentional: IDD-com-001]';
    ANNOTATION_REGEX.lastIndex = 0;
    const match = ANNOTATION_REGEX.exec(text);
    expect(match).toBeNull();
  });

  it('does not match plain text without brackets', () => {
    const text = 'Intentional: IDD-COM-001';
    ANNOTATION_REGEX.lastIndex = 0;
    const match = ANNOTATION_REGEX.exec(text);
    expect(match).toBeNull();
  });
});

// ── getActiveIddIds tests ──
describe('getActiveIddIds', () => {
  let db, dbPath;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-scan-code-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE intentional_decisions (
        idd_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);
  });

  afterEach(() => {
    try { db.close(); } catch {}
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it('returns Set of active IDD IDs', () => {
    db.exec("INSERT INTO intentional_decisions (idd_id, status) VALUES ('IDD-COM-001', 'active')");
    db.exec("INSERT INTO intentional_decisions (idd_id, status) VALUES ('IDD-STR-002', 'retired')");
    db.exec("INSERT INTO intentional_decisions (idd_id, status) VALUES ('IDD-REG-003', 'active')");
    const result = getActiveIddIds(db);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has('IDD-COM-001')).toBe(true);
    expect(result.has('IDD-REG-003')).toBe(true);
    expect(result.has('IDD-STR-002')).toBe(false);
  });

  it('returns empty Set when no records', () => {
    const result = getActiveIddIds(db);
    expect(result.size).toBe(0);
  });

  it('returns empty Set when table does not exist', () => {
    db.exec('DROP TABLE intentional_decisions');
    const result = getActiveIddIds(db);
    expect(result.size).toBe(0);
  });
});

// ── scanFile tests ──
describe('scanFile', () => {
  let tempDir, tempFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-code-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds valid annotations and marks as valid', () => {
    tempFile = path.join(tempDir, 'test.cs');
    fs.writeFileSync(tempFile, `line1\n// [Intentional: IDD-COM-001] reason\nline3`);
    const activeIds = new Set(['IDD-COM-001']);
    const result = scanFile(tempFile, activeIds);
    expect(result).toHaveLength(1);
    expect(result[0].idd_id).toBe('IDD-COM-001');
    expect(result[0].status).toBe('valid');
    expect(result[0].line).toBe(2);
  });

  it('marks orphaned when IDD not in active set', () => {
    tempFile = path.join(tempDir, 'test.ts');
    fs.writeFileSync(tempFile, `// [Intentional: IDD-USR-099]`);
    const activeIds = new Set(['IDD-COM-001']);
    const result = scanFile(tempFile, activeIds);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('orphaned');
  });

  it('returns empty array for file without annotations', () => {
    tempFile = path.join(tempDir, 'clean.js');
    fs.writeFileSync(tempFile, 'const x = 1;\nconst y = 2;');
    const result = scanFile(tempFile, new Set());
    expect(result).toHaveLength(0);
  });

  it('handles multiple annotations on same line', () => {
    tempFile = path.join(tempDir, 'multi.cs');
    fs.writeFileSync(tempFile, '// [Intentional: IDD-COM-001] [Intentional: IDD-STR-002]');
    const activeIds = new Set(['IDD-COM-001', 'IDD-STR-002']);
    const result = scanFile(tempFile, activeIds);
    expect(result).toHaveLength(2);
  });

  it('truncates snippet to 120 chars', () => {
    tempFile = path.join(tempDir, 'long.cs');
    const longLine = '// [Intentional: IDD-COM-001] ' + 'x'.repeat(200);
    fs.writeFileSync(tempFile, longLine);
    const result = scanFile(tempFile, new Set(['IDD-COM-001']));
    expect(result[0].snippet.length).toBeLessThanOrEqual(120);
  });

  it('normalizes backslash paths to forward slash in file field', () => {
    tempFile = path.join(tempDir, 'test.js');
    fs.writeFileSync(tempFile, '// [Intentional: IDD-COM-001]');
    const result = scanFile(tempFile, new Set(['IDD-COM-001']));
    expect(result[0].file).not.toContain('\\');
  });

  it('returns correct line number (1-indexed)', () => {
    tempFile = path.join(tempDir, 'lines.js');
    fs.writeFileSync(tempFile, 'line1\nline2\n// [Intentional: IDD-COM-001]\nline4');
    const result = scanFile(tempFile, new Set(['IDD-COM-001']));
    expect(result[0].line).toBe(3);
  });
});

// ── walkDir tests ──
describe('walkDir', () => {
  it('returns empty for non-existent directory', () => {
    const result = walkDir('/non/existent/path', ['.js']);
    expect(result).toEqual([]);
  });
});
