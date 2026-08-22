import { describe, it, expect } from 'vitest';
import {
  canonicalizeCategory,
  canonicalizeSeverity,
  parseAffectedFiles,
  getTaiwanTimestamp,
  reportTimestamp,
  CANONICAL_CATEGORIES,
  CANONICAL_SEVERITIES,
  CATEGORY_LEGACY_MAP,
  SEVERITY_LEGACY_MAP,
} from '../scripts/_migrations/tech-debt-schema.js';

describe('canonicalizeCategory', () => {
  it('passes through canonical values unchanged', () => {
    for (const cat of CANONICAL_CATEGORIES) {
      expect(canonicalizeCategory(cat)).toBe(cat);
    }
  });

  it('maps legacy "refactor" to CQD', () => {
    expect(canonicalizeCategory('refactor')).toBe('CQD');
  });

  it('maps legacy "security" to SD', () => {
    expect(canonicalizeCategory('security')).toBe('SD');
  });

  it('maps legacy "documentation" to DD', () => {
    expect(canonicalizeCategory('documentation')).toBe('DD');
  });

  it('maps legacy "migration" to DpD', () => {
    expect(canonicalizeCategory('migration')).toBe('DpD');
  });

  it('maps legacy "test-coverage" to CQD', () => {
    expect(canonicalizeCategory('test-coverage')).toBe('CQD');
  });

  it('maps legacy "frontend" to TD', () => {
    expect(canonicalizeCategory('frontend')).toBe('TD');
  });

  it('returns TD for null input', () => {
    expect(canonicalizeCategory(null)).toBe('TD');
  });

  it('returns TD for undefined input', () => {
    expect(canonicalizeCategory(undefined)).toBe('TD');
  });

  it('returns TD for unknown string', () => {
    expect(canonicalizeCategory('unknown-category')).toBe('TD');
  });
});

describe('canonicalizeSeverity', () => {
  it('passes through canonical values unchanged', () => {
    for (const sev of CANONICAL_SEVERITIES) {
      expect(canonicalizeSeverity(sev)).toBe(sev);
    }
  });

  it('maps p0 to critical', () => {
    expect(canonicalizeSeverity('p0')).toBe('critical');
  });

  it('maps P3 (uppercase) to medium', () => {
    expect(canonicalizeSeverity('P3')).toBe('medium');
  });

  it('maps p3 (lowercase) to medium', () => {
    expect(canonicalizeSeverity('p3')).toBe('medium');
  });

  it('maps P4 to low', () => {
    expect(canonicalizeSeverity('P4')).toBe('low');
  });

  it('maps P2 to high', () => {
    expect(canonicalizeSeverity('P2')).toBe('high');
  });

  it('returns low for null input', () => {
    expect(canonicalizeSeverity(null)).toBe('low');
  });

  it('returns low for undefined input', () => {
    expect(canonicalizeSeverity(undefined)).toBe('low');
  });

  it('returns low for unknown string', () => {
    expect(canonicalizeSeverity('unknown')).toBe('low');
  });
});

describe('parseAffectedFiles', () => {
  it('parses JSON array and strips :line suffix', () => {
    const result = parseAffectedFiles('["src/a.js:10","src/b.ts:20-30"]');
    expect(result).toEqual(['src/a.js', 'src/b.ts']);
  });

  it('parses comma-separated string', () => {
    const result = parseAffectedFiles('src/a.js, src/b.ts');
    expect(result).toEqual(['src/a.js', 'src/b.ts']);
  });

  it('returns empty array for null', () => {
    expect(parseAffectedFiles(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseAffectedFiles(undefined)).toEqual([]);
  });

  it('strips :line suffix from comma-separated', () => {
    const result = parseAffectedFiles('src/a.js:42');
    expect(result).toEqual(['src/a.js']);
  });

  it('handles non-JSON non-comma string as single file', () => {
    const result = parseAffectedFiles('src/single-file.js');
    expect(result).toEqual(['src/single-file.js']);
  });

  it('handles JSON array with no :line suffix', () => {
    const result = parseAffectedFiles('["src/a.js","src/b.ts"]');
    expect(result).toEqual(['src/a.js', 'src/b.ts']);
  });

  it('filters empty strings from result', () => {
    const result = parseAffectedFiles('src/a.js,,');
    expect(result).toEqual(['src/a.js']);
  });

  it('wraps JSON non-array value as single-element array', () => {
    const result = parseAffectedFiles('"src/single.js"');
    expect(result).toEqual(['src/single.js']);
  });
});

describe('getTaiwanTimestamp', () => {
  it('returns ISO-like string with +08:00 suffix', () => {
    const ts = getTaiwanTimestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  });
});

describe('reportTimestamp', () => {
  it('returns YYYYMMDD-HHMM format', () => {
    const ts = reportTimestamp();
    expect(ts).toMatch(/^\d{8}-\d{4}$/);
  });
});
