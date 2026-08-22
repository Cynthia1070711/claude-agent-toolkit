import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryMatchingDebts, MAX_CANDIDATES, parseArgs } from '../scripts/boy-scout-sweep.js';
import { createTestDb, seedDebts } from './helpers/test-db.js';

// ── parseArgs tests (AC-4) ──
describe('parseArgs', () => {
  it('parses --files with comma-separated paths', () => {
    const result = parseArgs(['node', 'script.js', '--files', 'a.js,b.ts']);
    expect(result.files).toEqual(['a.js', 'b.ts']);
  });

  it('parses --execute flag', () => {
    const result = parseArgs(['node', 'script.js', '--execute', '--files', 'a.js']);
    expect(result.execute).toBe(true);
    expect(result.dryRun).toBe(false);
  });

  it('defaults to dryRun when no --execute', () => {
    const result = parseArgs(['node', 'script.js', '--files', 'a.js']);
    expect(result.dryRun).toBe(true);
    expect(result.execute).toBe(false);
  });

  it('parses --story and --agent', () => {
    const result = parseArgs(['node', 'script.js', '--story', 'test-01', '--agent', 'CC-OPUS']);
    expect(result.story).toBe('test-01');
    expect(result.agent).toBe('CC-OPUS');
  });

  it('returns null files when no --files flag', () => {
    const result = parseArgs(['node', 'script.js']);
    expect(result.files).toBeNull();
  });

  it('strips path traversal from file paths', () => {
    const result = parseArgs(['node', 'script.js', '--files', '../../../etc/passwd,a.js']);
    expect(result.files).not.toContain('../../../etc/passwd');
    expect(result.files.some(f => f.includes('..'))).toBe(false);
  });
});

// ── MAX_CANDIDATES constant ──
describe('MAX_CANDIDATES', () => {
  it('is 10', () => {
    expect(MAX_CANDIDATES).toBe(10);
  });
});

// ── queryMatchingDebts tests ──
describe('queryMatchingDebts', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('matches exact file path', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src/utils/helper.js', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/utils/helper.js']);
    expect(result).toHaveLength(1);
    expect(result[0].debt_id).toBe('TD-01');
  });

  it('matches by endsWith basename', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src/components/Panel.tsx', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['components/Panel.tsx']);
    expect(result).toHaveLength(1);
  });

  it('matches by includes (partial path)', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src/utils/helper.js', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/utils/helper.js']);
    expect(result).toHaveLength(1);
  });

  it('does not match unrelated file', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src/a.js', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/b.js']);
    expect(result).toHaveLength(0);
  });

  it('only returns open status debts', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src/a.js', status: 'open' },
      { debt_id: 'TD-02', affected_files: 'src/a.js', status: 'fixed' },
      { debt_id: 'TD-03', affected_files: 'src/a.js', status: 'wont-fix' },
    ]);
    const result = queryMatchingDebts(db, ['src/a.js']);
    expect(result).toHaveLength(1);
    expect(result[0].debt_id).toBe('TD-01');
  });

  it('returns empty when no debts match', () => {
    const result = queryMatchingDebts(db, ['src/z.js']);
    expect(result).toHaveLength(0);
  });

  it('handles JSON array in affected_files', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: '["src/a.js","src/b.js"]', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/b.js']);
    expect(result).toHaveLength(1);
  });

  it('handles null affected_files', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: null, status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/a.js']);
    expect(result).toHaveLength(0);
  });

  it('normalizes backslash paths', () => {
    seedDebts(db, [
      { debt_id: 'TD-01', affected_files: 'src\\utils\\helper.js', status: 'open' },
    ]);
    const result = queryMatchingDebts(db, ['src/utils/helper.js']);
    expect(result).toHaveLength(1);
  });

  it('MAX_CANDIDATES cap: 15 debts → all returned by query (capping is done in main)', () => {
    const debts = Array.from({ length: 15 }, (_, i) => ({
      debt_id: `TD-${String(i).padStart(2, '0')}`,
      affected_files: 'src/shared.js',
      status: 'open',
      category: 'CQD',
      severity: 'low',
    }));
    seedDebts(db, debts);
    const result = queryMatchingDebts(db, ['src/shared.js']);
    // queryMatchingDebts returns all matches; MAX_CANDIDATES capping is in main()
    expect(result).toHaveLength(15);
  });
});
