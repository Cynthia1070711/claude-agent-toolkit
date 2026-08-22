import { describe, it, expect } from 'vitest';
import { computeSignals, classifyOne, REFACTOR_CATEGORIES, LOW_SEVERITIES } from '../scripts/debt-layer3-quickfix.js';

describe('computeSignals', () => {
  const emptyIntentional = new Set();

  it('returns all true for ideal quickFix candidate', () => {
    const row = {
      affected_files: 'src/utils/helper.js',
      severity: 'low',
      category: 'CQD',
      created_at: '2025-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S1_single_file).toBe(true);
    expect(signals.S2_low_severity).toBe(true);
    expect(signals.S3_refactor_category).toBe(true);
    expect(signals.S4_not_intentional).toBe(true);
    expect(signals.file_count).toBe(1);
  });

  it('returns S1=false for multi-file debt', () => {
    const row = {
      affected_files: '["src/a.js","src/b.js"]',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S1_single_file).toBe(false);
    expect(signals.file_count).toBe(2);
  });

  it('returns S2=false for high severity', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'high',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S2_low_severity).toBe(false);
  });

  it('returns S3=false for non-refactor category (SD)', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'SD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S3_refactor_category).toBe(false);
  });

  it('returns S4=false when file intersects intentional set', () => {
    const intentional = new Set(['src/components/EditorPanel.tsx']);
    const row = {
      affected_files: 'src/components/EditorPanel.tsx',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, intentional);
    expect(signals.S4_not_intentional).toBe(false);
  });

  it('handles empty intentionalFiles set', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, new Set());
    expect(signals.S4_not_intentional).toBe(true);
  });

  it('handles 0 affected_files (null)', () => {
    const row = {
      affected_files: null,
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S1_single_file).toBe(true);
    expect(signals.S5_has_affected_files).toBe(false);
    expect(signals.file_count).toBe(0);
  });

  it('handles null severity and category', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: null,
      category: null,
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S2_low_severity).toBe(false);
    expect(signals.S3_refactor_category).toBe(false);
  });

  it('calculates S6_stale correctly for old debts', () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'CQD',
      created_at: oldDate,
    };
    const signals = computeSignals(row, emptyIntentional);
    expect(signals.S6_stale).toBe(true);
    expect(signals.age_days).toBeGreaterThanOrEqual(180);
  });
});

describe('classifyOne', () => {
  const emptyIntentional = new Set();

  it('classifies as quickFix when all S1-S4 are true', () => {
    const row = {
      affected_files: 'src/utils/helper.js',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const result = classifyOne(row, emptyIntentional);
    expect(result.bucket).toBe('quickFix');
    expect(result.exclusion_reason).toBeNull();
  });

  it('classifies as semantic when S1=false (multi-file)', () => {
    const row = {
      affected_files: '["src/a.js","src/b.js"]',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const result = classifyOne(row, emptyIntentional);
    expect(result.bucket).toBe('semantic');
  });

  it('classifies as semantic when S2=false (high severity)', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'high',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const result = classifyOne(row, emptyIntentional);
    expect(result.bucket).toBe('semantic');
  });

  it('provides exclusion_reason when S4=false (intentional overlap)', () => {
    const intentional = new Set(['src/components/EditorPanel.tsx']);
    const row = {
      affected_files: 'src/components/EditorPanel.tsx',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const result = classifyOne(row, intentional);
    expect(result.bucket).toBe('semantic');
    expect(result.exclusion_reason).toBe('S4:intersects_intentional_code_region');
  });

  it('classifies as semantic with 3/4 signals true', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'SD',  // S3 false
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const result = classifyOne(row, emptyIntentional);
    expect(result.bucket).toBe('semantic');
    expect(result.exclusion_reason).toBeNull();
  });
});

describe('REFACTOR_CATEGORIES', () => {
  it('includes canonical CQD, TD, DD', () => {
    expect(REFACTOR_CATEGORIES.has('CQD')).toBe(true);
    expect(REFACTOR_CATEGORIES.has('TD')).toBe(true);
    expect(REFACTOR_CATEGORIES.has('DD')).toBe(true);
  });

  it('includes legacy aliases', () => {
    expect(REFACTOR_CATEGORIES.has('refactor')).toBe(true);
    expect(REFACTOR_CATEGORIES.has('documentation')).toBe(true);
  });
});

describe('LOW_SEVERITIES', () => {
  it('includes low and P-codes', () => {
    expect(LOW_SEVERITIES.has('low')).toBe(true);
    expect(LOW_SEVERITIES.has('p3')).toBe(true);
    expect(LOW_SEVERITIES.has('P4')).toBe(true);
  });

  it('does not include high/critical', () => {
    expect(LOW_SEVERITIES.has('high')).toBe(false);
    expect(LOW_SEVERITIES.has('critical')).toBe(false);
  });
});

describe('computeSignals — path matching edge cases', () => {
  it('matches intentional file via suffix match (partial path)', () => {
    const intentional = new Set(['components/EditorPanel.tsx']);
    const row = {
      affected_files: 'src/components/EditorPanel.tsx',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, intentional);
    expect(signals.S4_not_intentional).toBe(false);
  });

  it('does not match unrelated intentional file', () => {
    const intentional = new Set(['src/services/AuthService.ts']);
    const row = {
      affected_files: 'src/utils/helper.js',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, intentional);
    expect(signals.S4_not_intentional).toBe(true);
  });

  it('handles backslash paths by normalizing to forward slash', () => {
    const intentional = new Set(['src/utils/helper.js']);
    const row = {
      affected_files: 'src\\utils\\helper.js',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, intentional);
    expect(signals.S4_not_intentional).toBe(false);
  });

  it('handles invalid created_at for daysSince', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'CQD',
      created_at: 'not-a-date',
    };
    const signals = computeSignals(row, new Set());
    expect(signals.age_days).toBeNull();
    expect(signals.S6_stale).toBe(false);
  });

  it('handles null created_at for daysSince', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'CQD',
      created_at: null,
    };
    const signals = computeSignals(row, new Set());
    expect(signals.age_days).toBeNull();
  });

  it('S6_stale=false for recent debts', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'CQD',
      created_at: new Date().toISOString(),
    };
    const signals = computeSignals(row, new Set());
    expect(signals.S6_stale).toBe(false);
    expect(signals.age_days).toBeLessThan(2);
  });

  it('matches multiple files against intentional set', () => {
    const intentional = new Set(['src/b.js']);
    const row = {
      affected_files: '["src/a.js","src/b.js"]',
      severity: 'low',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, intentional);
    expect(signals.S4_not_intentional).toBe(false);
  });

  it('S2=true for p4 severity', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'p4',
      category: 'CQD',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, new Set());
    expect(signals.S2_low_severity).toBe(true);
  });

  it('S3=true for legacy category "test-quality"', () => {
    const row = {
      affected_files: 'src/a.js',
      severity: 'low',
      category: 'test-quality',
      created_at: '2026-01-01T00:00:00+08:00',
    };
    const signals = computeSignals(row, new Set());
    expect(signals.S3_refactor_category).toBe(true);
  });
});
