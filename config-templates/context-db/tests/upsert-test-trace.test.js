// upsert-test-trace.test.js — bwu-3-dev-consume-review-audit T2.3 (BR-026/027/028)
//
// Isolated temp DB only (createTestDb) — never connects phycool.db.

import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb, seedTestTraceability } from './helpers/test-db.js';
import { writeTrace } from '../scripts/upsert-test-trace.js';

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = undefined;
});

const ROW = (overrides = {}) => ({
  case: 'BR005_Conflict_Returns409',
  br: 'BR-005',
  level: 'integration',
  testHit: 'src/Foo.cs:87',
  ...overrides,
});

describe('idempotent UPSERT (BR-026)', () => {
  it('BR026_UpsertTwice_RowCountStableVerifiedAtRefreshed', () => {
    ctx = createTestDb();
    writeTrace(ctx.dbPath, 's1', [ROW()]);
    const firstVerifiedAt = ctx.db.prepare('SELECT verified_at FROM test_traceability WHERE story_id=?').get('s1').verified_at;

    writeTrace(ctx.dbPath, 's1', [ROW()]);
    const rows = ctx.db.prepare('SELECT COUNT(*) as c FROM test_traceability WHERE story_id=?').get('s1');
    const secondVerifiedAt = ctx.db.prepare('SELECT verified_at FROM test_traceability WHERE story_id=?').get('s1').verified_at;

    expect(rows.c).toBe(1);
    expect(secondVerifiedAt >= firstVerifiedAt).toBe(true);
  });

  it('BR026_TimestampsAreOffsetAware_PlusZeroEight', () => {
    ctx = createTestDb();
    writeTrace(ctx.dbPath, 's2', [ROW()]);
    const row = ctx.db.prepare('SELECT linked_at, verified_at FROM test_traceability WHERE story_id=?').get('s2');
    expect(row.linked_at).toMatch(/\+08:00$/);
    expect(row.verified_at).toMatch(/\+08:00$/);
  });
});

// bwu-3 code-review: UNIQUE(ac_id, test_file, test_name) keys on the file, so a case
// whose test moves — or whose testHit is downgraded to null by §6.2's three-axis
// verdict — used to leave the previous row behind still reading `covered`.
describe('stale-row eviction on test_file change (bwu-3 CR)', () => {
  it('BR026_TestFileChanges_OldRowEvictedNotOrphaned', () => {
    ctx = createTestDb();
    writeTrace(ctx.dbPath, 's7', [ROW({ testHit: 'tests/Old.cs:12' })]);
    writeTrace(ctx.dbPath, 's7', [ROW({ testHit: 'tests/New.cs:34' })]);

    const rows = ctx.db
      .prepare('SELECT test_file, status FROM test_traceability WHERE story_id=?')
      .all('s7');
    expect(rows).toEqual([{ test_file: 'tests/New.cs', status: 'covered' }]);
  });

  it('BR027_CoveredCaseLaterUncovered_FlipsToPendingWithoutLeavingCoveredRow', () => {
    ctx = createTestDb();
    writeTrace(ctx.dbPath, 's8', [ROW({ testHit: 'tests/Gone.cs:12' })]);
    writeTrace(ctx.dbPath, 's8', [ROW({ testHit: null })]);

    const rows = ctx.db
      .prepare('SELECT test_file, status FROM test_traceability WHERE story_id=?')
      .all('s8');
    expect(rows).toEqual([{ test_file: '— (not found)', status: 'pending' }]);
  });
});

describe('uncovered-case placeholder (BR-027)', () => {
  it('BR027_UncoveredCase_WritesPendingWithNotFoundPlaceholder', () => {
    ctx = createTestDb();
    writeTrace(ctx.dbPath, 's3', [ROW({ testHit: null })]);
    const row = ctx.db.prepare('SELECT status, test_file FROM test_traceability WHERE story_id=?').get('s3');
    expect(row.status).toBe('pending');
    expect(row.test_file).toBe('— (not found)');
  });

  it('BR027_RowPerReconciledCase_CountMatchesAuditRows', () => {
    ctx = createTestDb();
    const rows = [
      ROW({ case: 'BR001_A_B', br: 'BR-001', testHit: 'a.cs:1' }),
      ROW({ case: 'BR002_A_B', br: 'BR-002', testHit: null }),
      ROW({ case: 'BR003_A_B', br: 'BR-003', testHit: 'c.cs:3' }),
    ];
    writeTrace(ctx.dbPath, 's4', rows);
    const count = ctx.db.prepare('SELECT COUNT(*) as c FROM test_traceability WHERE story_id=?').get('s4').c;
    expect(count).toBe(3);
    const persisted = ctx.db.prepare('SELECT ac_id, test_name, test_type FROM test_traceability WHERE story_id=? ORDER BY ac_id').all('s4');
    expect(persisted).toEqual([
      { ac_id: 'BR-001', test_name: 'BR001_A_B', test_type: 'integration' },
      { ac_id: 'BR-002', test_name: 'BR002_A_B', test_type: 'integration' },
      { ac_id: 'BR-003', test_name: 'BR003_A_B', test_type: 'integration' },
    ]);
  });
});

describe('schema and seed-row isolation (BR-028)', () => {
  it('BR028_WriterRun_LeavesSchemaAndSeedRowsIntact', () => {
    ctx = createTestDb();
    seedTestTraceability(ctx.db, [
      { ac_id: 'AC-1', story_id: 'dvc-01', test_file: 'a.test.ts', test_name: 'seed one', linked_at: '2026-03-28T22:03:09.965+08:00' },
      { ac_id: 'AC-2', story_id: 'dvc-01', test_file: 'b.test.ts', test_name: 'seed two', linked_at: '2026-03-28T22:03:09.965+08:00' },
    ]);
    const pragmaBefore = ctx.db.prepare("PRAGMA table_info('test_traceability')").all();
    const seedBefore = ctx.db.prepare('SELECT * FROM test_traceability WHERE story_id=? ORDER BY ac_id').all('dvc-01');

    writeTrace(ctx.dbPath, 's5', [ROW()]);

    const pragmaAfter = ctx.db.prepare("PRAGMA table_info('test_traceability')").all();
    const seedAfter = ctx.db.prepare('SELECT * FROM test_traceability WHERE story_id=? ORDER BY ac_id').all('dvc-01');
    expect(pragmaAfter).toEqual(pragmaBefore);
    expect(seedAfter).toEqual(seedBefore);
  });

  it('--dry-run prints intended rows and writes nothing', () => {
    ctx = createTestDb();
    const result = writeTrace(ctx.dbPath, 's6', [ROW()], { dryRun: true });
    expect(result.wouldWrite).toHaveLength(1);
    const count = ctx.db.prepare('SELECT COUNT(*) as c FROM test_traceability').get().c;
    expect(count).toBe(0);
  });
});
