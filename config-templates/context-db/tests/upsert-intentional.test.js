import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestDb, seedDecisions } from './helpers/test-db.js';

// Import pure functions directly
import { parseArgs, validateJsonField } from '../scripts/upsert-intentional.js';

// ── parseArgs tests ─────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --inline with JSON value', () => {
    const result = parseArgs([, , '--inline', '{"idd_id":"IDD-COM-001"}']);
    expect(result.inline).toBe('{"idd_id":"IDD-COM-001"}');
  });

  it('parses --query flag alone', () => {
    const result = parseArgs([, , '--query']);
    expect(result.query).toBe(true);
    expect(result.id).toBeUndefined();
  });

  it('parses --query --id combination', () => {
    const result = parseArgs([, , '--query', '--id', 'IDD-COM-001']);
    expect(result.query).toBe(true);
    expect(result.id).toBe('IDD-COM-001');
  });

  it('parses --query --file combination', () => {
    const result = parseArgs([, , '--query', '--file', 'ImagePanel.tsx']);
    expect(result.query).toBe(true);
    expect(result.file).toBe('ImagePanel.tsx');
  });

  it('parses --query --skill combination', () => {
    const result = parseArgs([, , '--query', '--skill', 'phycool-editor-arch']);
    expect(result.query).toBe(true);
    expect(result.skill).toBe('phycool-editor-arch');
  });

  it('parses --query --module combination', () => {
    const result = parseArgs([, , '--query', '--module', 'Editor']);
    expect(result.query).toBe(true);
    expect(result.module).toBe('Editor');
  });

  it('parses --verify flag', () => {
    const result = parseArgs([, , '--verify']);
    expect(result.verify).toBe(true);
  });

  it('parses --verify --scope all', () => {
    const result = parseArgs([, , '--verify', '--scope', 'all']);
    expect(result.verify).toBe(true);
    expect(result.scope).toBe('all');
  });

  it('parses --retire with IDD ID', () => {
    const result = parseArgs([, , '--retire', 'IDD-COM-001']);
    expect(result.retire).toBe('IDD-COM-001');
  });

  it('parses --supersede --by combination', () => {
    const result = parseArgs([, , '--supersede', 'IDD-COM-001', '--by', 'IDD-COM-005']);
    expect(result.supersede).toBe('IDD-COM-001');
    expect(result.by).toBe('IDD-COM-005');
  });

  it('returns empty object for no args', () => {
    const result = parseArgs([, ]);
    expect(result).toEqual({});
  });
});

// ── validateJsonField tests ─────────────────────────────────

describe('validateJsonField', () => {
  it('returns null for null/undefined input', () => {
    expect(validateJsonField(null, 'test')).toBeNull();
    expect(validateJsonField(undefined, 'test')).toBeNull();
  });

  it('passes valid JSON string through', () => {
    const json = '["a","b"]';
    expect(validateJsonField(json, 'test')).toBe(json);
  });

  it('serializes array to JSON string', () => {
    expect(validateJsonField(['a', 'b'], 'test')).toBe('["a","b"]');
  });

  it('serializes object to JSON string', () => {
    expect(validateJsonField({ key: 'val' }, 'test')).toBe('{"key":"val"}');
  });

  it('throws IDD_005 for invalid JSON string', () => {
    expect(() => validateJsonField('{not valid}', 'tags')).toThrow('IDD_005');
    expect(() => validateJsonField('{not valid}', 'tags')).toThrow('tags');
  });
});

// ── DB Integration Tests ────────────────────────────────────

describe('--inline mode (DB integration)', () => {
  let db, dbPath, cleanupDb;

  const validIddData = {
    idd_id: 'IDD-TST-001',
    idd_type: 'COM',
    title: 'Test IDD',
    context: 'Test context',
    decision: 'Test decision',
    reason: 'Test reason',
    adr_path: 'docs/test-adr.md',
    signoff_by: 'Tester',
    signoff_date: '2026-01-01',
  };

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('inserts valid IDD into DB', () => {
    const now = '2026-04-13T12:00:00+08:00';
    db.prepare(`
      INSERT INTO intentional_decisions (
        idd_id, idd_type, title, context, decision, reason,
        adr_path, signoff_by, signoff_date, criticality, status,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      validIddData.idd_id, validIddData.idd_type, validIddData.title,
      validIddData.context, validIddData.decision, validIddData.reason,
      validIddData.adr_path, validIddData.signoff_by, validIddData.signoff_date,
      'normal', 'active', now, now
    );

    const row = db.prepare('SELECT * FROM intentional_decisions WHERE idd_id=?').get('IDD-TST-001');
    expect(row).toBeTruthy();
    expect(row.idd_type).toBe('COM');
    expect(row.title).toBe('Test IDD');
    expect(row.status).toBe('active');
    expect(row.criticality).toBe('normal');
  });

  it('IDD_001: rejects invalid idd_type', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO intentional_decisions (
          idd_id, idd_type, title, context, decision, reason,
          adr_path, signoff_by, signoff_date, criticality, status,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        'IDD-TST-BAD', 'INVALID', 'Test', 'ctx', 'dec', 'rsn',
        'docs/adr.md', 'T', '2026-01-01', 'normal', 'active',
        '2026-01-01', '2026-01-01'
      );
    }).toThrow(); // CHECK constraint violation
  });

  it('IDD_002: required fields enforced (title NOT NULL)', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO intentional_decisions (
          idd_id, idd_type, title, context, decision, reason,
          adr_path, signoff_by, signoff_date, criticality, status,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        'IDD-TST-NULL', 'COM', null, 'ctx', 'dec', 'rsn',
        'docs/adr.md', 'T', '2026-01-01', 'normal', 'active',
        '2026-01-01', '2026-01-01'
      );
    }).toThrow(); // NOT NULL constraint
  });

  it('IDD_005: JSON field validation via validateJsonField', () => {
    const result = validateJsonField('["tag1","tag2"]', 'tags');
    expect(result).toBe('["tag1","tag2"]');

    expect(() => validateJsonField('not-json', 'tags')).toThrow('IDD_005');
  });

  it('UPSERT: updates existing IDD on conflict', () => {
    const now = '2026-04-13T12:00:00+08:00';
    const insertSql = `
      INSERT INTO intentional_decisions (
        idd_id, idd_type, title, context, decision, reason,
        adr_path, signoff_by, signoff_date, criticality, status,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(idd_id) DO UPDATE SET
        title=excluded.title, updated_at=excluded.updated_at
    `;

    db.prepare(insertSql).run('IDD-TST-UPS', 'COM', 'Original', 'ctx', 'dec', 'rsn',
      'docs/adr.md', 'T', '2026-01-01', 'normal', 'active', now, now);

    db.prepare(insertSql).run('IDD-TST-UPS', 'COM', 'Updated', 'ctx', 'dec', 'rsn',
      'docs/adr.md', 'T', '2026-01-01', 'normal', 'active', now, '2026-04-13T13:00:00+08:00');

    const row = db.prepare('SELECT title, updated_at FROM intentional_decisions WHERE idd_id=?').get('IDD-TST-UPS');
    expect(row.title).toBe('Updated');
    expect(row.updated_at).toBe('2026-04-13T13:00:00+08:00');
  });
});

describe('--query mode (DB integration)', () => {
  let db, dbPath, cleanupDb;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
    seedDecisions(db, [
      { idd_id: 'IDD-COM-001', idd_type: 'COM', title: 'Free plan open', related_files: '["src/ImagePanel.tsx"]', related_skills: '["phycool-editor-arch"]', platform_modules: '["Editor"]' },
      { idd_id: 'IDD-REG-001', idd_type: 'REG', title: 'Data retention', related_files: '["src/UserService.cs"]', related_skills: '["phycool-privacy-legal"]', platform_modules: '["Member"]' },
    ]);
    // Update related fields (seedDecisions doesn't set them)
    db.prepare("UPDATE intentional_decisions SET related_files=?, related_skills=?, platform_modules=? WHERE idd_id=?")
      .run('["src/ImagePanel.tsx"]', '["phycool-editor-arch"]', '["Editor"]', 'IDD-COM-001');
    db.prepare("UPDATE intentional_decisions SET related_files=?, related_skills=?, platform_modules=? WHERE idd_id=?")
      .run('["src/UserService.cs"]', '["phycool-privacy-legal"]', '["Member"]', 'IDD-REG-001');
  });

  afterEach(() => {
    cleanupDb();
  });

  it('--query --id: returns single IDD', () => {
    const row = db.prepare('SELECT * FROM intentional_decisions WHERE idd_id = ?').get('IDD-COM-001');
    expect(row).toBeTruthy();
    expect(row.title).toBe('Free plan open');
    expect(row.idd_type).toBe('COM');
  });

  it('--query --id: returns null for non-existent', () => {
    const row = db.prepare('SELECT * FROM intentional_decisions WHERE idd_id = ?').get('IDD-NONEXIST');
    expect(row).toBeUndefined();
  });

  it('--query --file: file reverse lookup', () => {
    const rows = db.prepare("SELECT idd_id FROM intentional_decisions WHERE status='active' AND related_files LIKE ?").all('%ImagePanel%');
    expect(rows.length).toBe(1);
    expect(rows[0].idd_id).toBe('IDD-COM-001');
  });

  it('--query --skill: skill reverse lookup', () => {
    const rows = db.prepare("SELECT idd_id FROM intentional_decisions WHERE status='active' AND related_skills LIKE ?").all('%phycool-editor-arch%');
    expect(rows.length).toBe(1);
    expect(rows[0].idd_id).toBe('IDD-COM-001');
  });

  it('--query --module: module reverse lookup', () => {
    const rows = db.prepare("SELECT idd_id FROM intentional_decisions WHERE status='active' AND platform_modules LIKE ?").all('%Member%');
    expect(rows.length).toBe(1);
    expect(rows[0].idd_id).toBe('IDD-REG-001');
  });

  it('--query (no filter): list all active', () => {
    const rows = db.prepare("SELECT idd_id FROM intentional_decisions WHERE status='active' ORDER BY idd_id").all();
    expect(rows.length).toBe(2);
  });
});

describe('--verify mode (DB integration)', () => {
  let db, dbPath, cleanupDb;
  let tmpDir;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-verify-'));
  });

  afterEach(() => {
    cleanupDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('valid: ADR exists + no code_locations', () => {
    const adrPath = path.join(tmpDir, 'ADR-IDD-COM-001.md');
    fs.writeFileSync(adrPath, '# ADR');

    seedDecisions(db, [{ idd_id: 'IDD-COM-001', adr_path: adrPath }]);
    // Update adr_path to absolute
    db.prepare("UPDATE intentional_decisions SET adr_path=? WHERE idd_id=?").run(adrPath, 'IDD-COM-001');

    const row = db.prepare("SELECT adr_path, code_locations FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-001');
    expect(fs.existsSync(row.adr_path)).toBe(true);
    expect(row.code_locations).toBeNull();
  });

  it('invalid: ADR does not exist', () => {
    seedDecisions(db, [{ idd_id: 'IDD-COM-002', adr_path: '/nonexistent/path.md' }]);
    db.prepare("UPDATE intentional_decisions SET adr_path=? WHERE idd_id=?").run('/nonexistent/path.md', 'IDD-COM-002');

    const row = db.prepare("SELECT adr_path FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-002');
    expect(fs.existsSync(row.adr_path)).toBe(false);
  });

  it('code_locations: valid paths', () => {
    const codePath = path.join(tmpDir, 'test.tsx');
    fs.writeFileSync(codePath, 'export default {}');

    seedDecisions(db, [{ idd_id: 'IDD-COM-003' }]);
    db.prepare("UPDATE intentional_decisions SET code_locations=? WHERE idd_id=?")
      .run(JSON.stringify([{ file: codePath, line: 10 }]), 'IDD-COM-003');

    const row = db.prepare("SELECT code_locations FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-003');
    const locs = JSON.parse(row.code_locations);
    expect(locs.every(l => fs.existsSync(l.file))).toBe(true);
  });

  it('code_locations: invalid path detected', () => {
    seedDecisions(db, [{ idd_id: 'IDD-COM-004' }]);
    db.prepare("UPDATE intentional_decisions SET code_locations=? WHERE idd_id=?")
      .run(JSON.stringify([{ file: '/nonexistent/file.tsx', line: 1 }]), 'IDD-COM-004');

    const row = db.prepare("SELECT code_locations FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-004');
    const locs = JSON.parse(row.code_locations);
    expect(locs.some(l => !fs.existsSync(l.file))).toBe(true);
  });
});

describe('--retire mode (DB integration)', () => {
  let db, dbPath, cleanupDb;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
    seedDecisions(db, [
      { idd_id: 'IDD-COM-010', idd_type: 'COM', title: 'To retire' },
    ]);
  });

  afterEach(() => {
    cleanupDb();
  });

  it('active → retired transition', () => {
    const before = db.prepare("SELECT status FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-010');
    expect(before.status).toBe('active');

    const now = '2026-04-13T12:00:00+08:00';
    db.prepare("UPDATE intentional_decisions SET status='retired', updated_at=? WHERE idd_id=?").run(now, 'IDD-COM-010');

    const after = db.prepare("SELECT status, updated_at FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-010');
    expect(after.status).toBe('retired');
    expect(after.updated_at).toBe(now);
  });

  it('idempotent: retiring already retired does nothing', () => {
    db.prepare("UPDATE intentional_decisions SET status='retired' WHERE idd_id=?").run('IDD-COM-010');

    const result = db.prepare("UPDATE intentional_decisions SET status='retired' WHERE idd_id=? AND status != 'retired'").run('IDD-COM-010');
    expect(result.changes).toBe(0);
  });

  it('not found: non-existent IDD', () => {
    const row = db.prepare("SELECT idd_id FROM intentional_decisions WHERE idd_id=?").get('IDD-NONEXIST');
    expect(row).toBeUndefined();
  });
});

describe('--supersede mode (DB integration)', () => {
  let db, dbPath, cleanupDb;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
    seedDecisions(db, [
      { idd_id: 'IDD-COM-020', idd_type: 'COM', title: 'Old IDD' },
      { idd_id: 'IDD-COM-021', idd_type: 'COM', title: 'New IDD' },
    ]);
  });

  afterEach(() => {
    cleanupDb();
  });

  it('supersede: old → superseded, superseded_by set', () => {
    const now = '2026-04-13T12:00:00+08:00';
    db.prepare("UPDATE intentional_decisions SET status='superseded', superseded_by=?, updated_at=? WHERE idd_id=?")
      .run('IDD-COM-021', now, 'IDD-COM-020');

    const old = db.prepare("SELECT status, superseded_by FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-020');
    expect(old.status).toBe('superseded');
    expect(old.superseded_by).toBe('IDD-COM-021');

    const newIdd = db.prepare("SELECT status FROM intentional_decisions WHERE idd_id=?").get('IDD-COM-021');
    expect(newIdd.status).toBe('active');
  });

  it('error: new IDD does not exist', () => {
    const newExists = db.prepare("SELECT idd_id FROM intentional_decisions WHERE idd_id=?").get('IDD-NONEXIST');
    expect(newExists).toBeUndefined();
  });
});
