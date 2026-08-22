// ============================================================
// reconciliation-sync.test.ts — Reconciliation Sync 測試
// dla-06 AC-3~AC-8: sync mapping, dedup, rollback, status API
// 策略：mock DB (better-sqlite3 in-memory)，測試 service 邏輯
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ── mock getDb to return in-memory DB ──
let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
}));

import {
  syncReviewFindings,
  getReconciliationStatus,
  mapSeverity,
} from '../services/reconciliationService.js';

// ── Helper: create tables matching production schema ──
function setupTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_findings (
      id INTEGER PRIMARY KEY,
      finding_id TEXT NOT NULL,
      report_id TEXT,
      module_code TEXT,
      severity TEXT,
      dimension TEXT,
      title TEXT,
      description TEXT,
      file_path TEXT,
      root_cause TEXT,
      fix_suggestion TEXT,
      affected_files TEXT,
      suggested_story TEXT,
      fix_status TEXT,
      fix_notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS review_reports (
      id INTEGER PRIMARY KEY,
      report_id TEXT NOT NULL,
      module_code TEXT
    );

    CREATE TABLE IF NOT EXISTS tech_debt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id TEXT UNIQUE NOT NULL,
      story_id TEXT,
      category TEXT,
      severity TEXT,
      dimension TEXT,
      title TEXT,
      description TEXT,
      affected_files TEXT,
      fix_guidance TEXT,
      root_cause TEXT,
      target_story TEXT,
      status TEXT,
      wont_fix_reason TEXT,
      source_review_date TEXT,
      created_at TEXT
    );
  `);
}

function insertFinding(
  db: Database.Database,
  overrides: Partial<{
    finding_id: string;
    report_id: string;
    severity: string;
    title: string;
    description: string;
    file_path: string;
    root_cause: string;
    fix_suggestion: string;
    dimension: string;
    suggested_story: string;
    fix_status: string;
    fix_notes: string;
  }> = {},
) {
  const defaults = {
    finding_id: `F-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    report_id: 'REP-001',
    severity: 'P2',
    title: 'Test finding',
    description: 'Test description',
    file_path: 'src/test.ts',
    root_cause: null,
    fix_suggestion: null,
    dimension: 'CodeQuality',
    suggested_story: null,
    fix_status: 'fixed',
    fix_notes: null,
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO review_findings (finding_id, report_id, severity, title, description, file_path, root_cause, fix_suggestion, dimension, suggested_story, fix_status, fix_notes)
    VALUES (@finding_id, @report_id, @severity, @title, @description, @file_path, @root_cause, @fix_suggestion, @dimension, @suggested_story, @fix_status, @fix_notes)
  `).run(row);
  return row;
}

beforeEach(() => {
  testDb = new Database(':memory:');
  setupTables(testDb);
});

afterEach(() => {
  testDb.close();
});

// ────────────────────────────────────────────────────────────
// TC-1: mapSeverity 映射 (AC-3 BR-REC-SYNC-MAP)
// ───��────────────────────��───────────────────────────────────
describe('TC-1: mapSeverity', () => {
  it('P0 → critical', () => expect(mapSeverity('P0')).toBe('critical'));
  it('P1 → high', () => expect(mapSeverity('P1')).toBe('high'));
  it('P2 → medium', () => expect(mapSeverity('P2')).toBe('medium'));
  it('P3 → low', () => expect(mapSeverity('P3')).toBe('low'));
  it('P4 → low', () => expect(mapSeverity('P4')).toBe('low'));
  it('NULL → low (AC-8 boundary)', () => expect(mapSeverity(null)).toBe('low'));
  it('unknown → low', () => expect(mapSeverity('unknown')).toBe('low'));
});

// ────────────────────────────────────────────────────────────
// TC-2: 空表 sync (AC-8 boundary)
// ─────────────────────────────────────────────��──────────────
describe('TC-2: empty review_findings table', () => {
  it('synced=0, skipped=0, errors=0', () => {
    const result = syncReviewFindings();
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// TC-3: fixed only skip (AC-3 BR-REC-SYNC-SKIP)
// ─���───────────────���──────────────────────────────────��───────
describe('TC-3: only fixed findings → all skipped', () => {
  it('synced=0 when all findings are fixed', () => {
    insertFinding(testDb, { finding_id: 'F-001', fix_status: 'fixed' });
    insertFinding(testDb, { finding_id: 'F-002', fix_status: 'fixed' });
    insertFinding(testDb, { finding_id: 'F-003', fix_status: 'fixed' });

    const result = syncReviewFindings();
    expect(result.synced).toBe(0);
    // fixed findings are not even queried, so skipped = 0 (only dedup counts as skip)
  });
});

// ─────────��──────────────────────────────────────────────────
// TC-4: deferred finding mapping (AC-3 BR-REC-SYNC-MAP)
// ──────────────────��────────────────────────────────────���────
describe('TC-4: deferred finding → open debt', () => {
  it('maps deferred to open status with correct severity', () => {
    insertFinding(testDb, {
      finding_id: 'BUG-SEC-003',
      severity: 'P1',
      fix_status: 'deferred',
      title: 'XSS 風險',
      description: 'Unescaped output',
      dimension: 'Security',
      fix_suggestion: 'Sanitize HTML',
      suggested_story: 'fix-xss-01',
    });

    const result = syncReviewFindings();
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);

    // Verify tech_debt_items content
    const debt = testDb
      .prepare('SELECT * FROM tech_debt_items WHERE debt_id = ?')
      .get('RF-BUG-SEC-003') as Record<string, unknown>;
    expect(debt).toBeTruthy();
    expect(debt.severity).toBe('high');
    expect(debt.status).toBe('open');
    expect(debt.title).toBe('XSS 風險');
    expect(debt.fix_guidance).toBe('Sanitize HTML');
    expect(debt.target_story).toBe('fix-xss-01');
    expect(debt.dimension).toBe('Security');
  });
});

// ───────────��───────────────────────────────────���────────────
// TC-5: wont_fix finding mapping (AC-3 BR-REC-SYNC-MAP)
// ──────────────────────────────────────────────���─────────────
describe('TC-5: wont_fix finding → wont-fix debt', () => {
  it('maps wont_fix to wont-fix status with reason', () => {
    insertFinding(testDb, {
      finding_id: 'STYLE-001',
      severity: 'P3',
      fix_status: 'wont_fix',
      title: 'Verbose logging',
      fix_notes: 'Design decision — needed for debugging',
    });

    const result = syncReviewFindings();
    expect(result.synced).toBe(1);

    const debt = testDb
      .prepare('SELECT * FROM tech_debt_items WHERE debt_id = ?')
      .get('RF-STYLE-001') as Record<string, unknown>;
    expect(debt).toBeTruthy();
    expect(debt.status).toBe('wont-fix');
    expect(debt.severity).toBe('low');
    expect(debt.wont_fix_reason).toBe('Design decision — needed for debugging');
  });
});

// ─────────────────────────────────────────────���──────────────
// TC-6: dedup — 重複執行不產生重複記錄 (AC-5 BR-REC-DEDUP)
// ���──────────────────────────────────────────────���────────────
describe('TC-6: dedup on re-sync', () => {
  it('second sync skips already-synced items', () => {
    insertFinding(testDb, {
      finding_id: 'DUP-001',
      severity: 'P2',
      fix_status: 'deferred',
      title: 'Duplicate test',
    });

    // First sync
    const first = syncReviewFindings();
    expect(first.synced).toBe(1);

    // Second sync — should skip
    const second = syncReviewFindings();
    expect(second.synced).toBe(0);
    expect(second.skipped).toBe(1);

    // Only 1 record in tech_debt_items
    const count = testDb
      .prepare('SELECT COUNT(*) as cnt FROM tech_debt_items WHERE debt_id = ?')
      .get('RF-DUP-001') as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// TC-7: NULL severity → low (AC-8 boundary)
// ─��──────────────────────────────────────────────────────────
describe('TC-7: NULL severity mapping', () => {
  it('NULL severity maps to low', () => {
    insertFinding(testDb, {
      finding_id: 'NULL-SEV-001',
      severity: null as unknown as string,
      fix_status: 'deferred',
      title: 'Null severity finding',
    });

    syncReviewFindings();

    const debt = testDb
      .prepare('SELECT severity FROM tech_debt_items WHERE debt_id = ?')
      .get('RF-NULL-SEV-001') as { severity: string };
    expect(debt.severity).toBe('low');
  });
});

// ──���─────────────────────────────────────────────────────────
// TC-8: status API (AC-7 BR-REC-STATUS)
// ──────���──────────���──────────────────────────────────────────
describe('TC-8: getReconciliationStatus', () => {
  it('returns correct structure and counts', () => {
    // Insert mixed findings
    insertFinding(testDb, { finding_id: 'S-001', fix_status: 'fixed' });
    insertFinding(testDb, { finding_id: 'S-002', fix_status: 'deferred' });
    insertFinding(testDb, { finding_id: 'S-003', fix_status: 'wont_fix' });

    // Sync first
    syncReviewFindings();

    const status = getReconciliationStatus();
    expect(status.review_findings_total).toBe(3);
    expect(status.review_findings_actionable).toBe(2); // deferred + wont_fix
    expect(status.unsynced_count).toBe(0);
    expect(status.status).toBe('healthy');
    expect(status).toHaveProperty('tech_debt_total');
    expect(status).toHaveProperty('tech_debt_from_sync');
  });

  it('unsynced_count > 0 when items not yet synced', () => {
    insertFinding(testDb, { finding_id: 'US-001', fix_status: 'deferred' });
    // Don't sync — should show unsynced
    const status = getReconciliationStatus();
    expect(status.unsynced_count).toBe(1);
    expect(status.status).toBe('needs_sync');
  });
});

// ────��─────────────────────────��─────────────────────────────
// TC-9: DB 錯誤安全處理 (AC-6 BR-REC-ROLLBACK)
// ────────────────��──────────────────────────────────────��────
describe('TC-9: DB error handling', () => {
  it('returns error result when DB is unavailable', () => {
    // Close DB to simulate unavailable
    testDb.close();
    // Re-assign to a closed DB so getDb() returns it but queries fail
    const result = syncReviewFindings();
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(result.synced).toBe(0);
    // Re-open for afterEach cleanup
    testDb = new Database(':memory:');
  });
});
