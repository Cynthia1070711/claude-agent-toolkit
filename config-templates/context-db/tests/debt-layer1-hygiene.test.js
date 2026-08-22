import { describe, it, expect } from 'vitest';
import { parseAffectedFiles } from '../scripts/debt-layer1-hygiene.js';

// ── parseAffectedFiles tests ──
describe('parseAffectedFiles', () => {
  it('parses JSON array ["a.js","b.ts"]', () => {
    const result = parseAffectedFiles('["a.js","b.ts"]');
    expect(result).toEqual(['a.js', 'b.ts']);
  });

  it('parses CSV "a.js,b.ts"', () => {
    const result = parseAffectedFiles('a.js,b.ts');
    expect(result).toEqual(['a.js', 'b.ts']);
  });

  it('parses single string "a.js:207" and strips :N suffix', () => {
    const result = parseAffectedFiles('a.js:207');
    expect(result).toEqual(['a.js']);
  });

  it('strips :N-M range suffix', () => {
    const result = parseAffectedFiles('a.js:207-275');
    expect(result).toEqual(['a.js']);
  });

  it('returns empty array for null', () => {
    expect(parseAffectedFiles(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseAffectedFiles(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseAffectedFiles('')).toEqual([]);
  });

  it('handles JSON array with single non-array value', () => {
    const result = parseAffectedFiles('"single-file.ts"');
    expect(result).toEqual(['single-file.ts']);
  });

  it('handles JSON array with line numbers', () => {
    const result = parseAffectedFiles('["src/a.js:10","src/b.ts:20-30"]');
    expect(result).toEqual(['src/a.js', 'src/b.ts']);
  });

  it('filters out empty entries from CSV', () => {
    const result = parseAffectedFiles('a.js,,b.ts,');
    expect(result).toEqual(['a.js', 'b.ts']);
  });

  it('trims whitespace in CSV entries', () => {
    const result = parseAffectedFiles(' a.js , b.ts ');
    expect(result).toEqual(['a.js', 'b.ts']);
  });
});
