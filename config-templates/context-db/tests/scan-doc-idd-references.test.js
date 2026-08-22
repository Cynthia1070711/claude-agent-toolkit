import { describe, it, expect } from 'vitest';
import { extractIddIds, hasIddSection, DOC_PATTERNS, IDD_SECTION_PATTERNS } from '../scripts/scan-doc-idd-references.js';

// ── extractIddIds tests ──
describe('extractIddIds', () => {
  it('extracts single IDD ID', () => {
    const result = extractIddIds('See IDD-COM-001 for details');
    expect(result).toEqual(['IDD-COM-001']);
  });

  it('extracts multiple unique IDD IDs', () => {
    const result = extractIddIds('IDD-COM-001 and IDD-STR-002 plus IDD-COM-001 again');
    expect(result).toHaveLength(2);
    expect(result).toContain('IDD-COM-001');
    expect(result).toContain('IDD-STR-002');
  });

  it('returns empty for no IDD references', () => {
    const result = extractIddIds('No IDD references here');
    expect(result).toEqual([]);
  });

  it('returns empty for empty string', () => {
    const result = extractIddIds('');
    expect(result).toEqual([]);
  });

  it('handles all four IDD types', () => {
    const text = 'IDD-COM-001 IDD-STR-002 IDD-REG-003 IDD-USR-004';
    const result = extractIddIds(text);
    expect(result).toHaveLength(4);
  });

  it('does not match lowercase idd-com-001', () => {
    const result = extractIddIds('idd-com-001');
    expect(result).toEqual([]);
  });

  it('matches IDD in markdown link context', () => {
    const result = extractIddIds('[Intentional: IDD-COM-001]');
    expect(result).toEqual(['IDD-COM-001']);
  });
});

// ── hasIddSection tests ──
describe('hasIddSection', () => {
  it('detects "## Intentional Decision" heading', () => {
    const content = '# Doc\n\n## Intentional Decision\n\nSome content';
    expect(hasIddSection(content)).toBe(true);
  });

  it('detects "### IDD Coverage" heading', () => {
    const content = '# Doc\n\n### IDD Coverage\n\nContent';
    expect(hasIddSection(content)).toBe(true);
  });

  it('detects "## [Intentional..." heading', () => {
    const content = '# Doc\n\n## [Intentional: IDD-COM-001]\n\nContent';
    expect(hasIddSection(content)).toBe(true);
  });

  it('detects Chinese "## 故意決策" heading', () => {
    const content = '# Doc\n\n## 故意的決策\n\nContent';
    expect(hasIddSection(content)).toBe(true);
  });

  it('returns false when no IDD section', () => {
    const content = '# Doc\n\n## Overview\n\nRegular content';
    expect(hasIddSection(content)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(hasIddSection('')).toBe(false);
  });
});

// ── DOC_PATTERNS tests ──
describe('DOC_PATTERNS', () => {
  it('has three pattern types', () => {
    expect(DOC_PATTERNS).toHaveLength(3);
    const names = DOC_PATTERNS.map(p => p.name);
    expect(names).toContain('idd_id');
    expect(names).toContain('intentional_bracket');
    expect(names).toContain('intentional_decisions');
  });

  it('idd_id pattern matches IDD-COM-001', () => {
    const pattern = DOC_PATTERNS.find(p => p.name === 'idd_id');
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test('IDD-COM-001')).toBe(true);
  });

  it('intentional_bracket pattern matches [Intentional:', () => {
    const pattern = DOC_PATTERNS.find(p => p.name === 'intentional_bracket');
    pattern.regex.lastIndex = 0;
    expect(pattern.regex.test('[Intentional: IDD-COM-001]')).toBe(true);
  });
});

// ── IDD_SECTION_PATTERNS tests ──
describe('IDD_SECTION_PATTERNS', () => {
  it('has at least 4 patterns', () => {
    expect(IDD_SECTION_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  it('matches "## Intentional Decision"', () => {
    expect(IDD_SECTION_PATTERNS.some(p => p.test('## Intentional Decision'))).toBe(true);
  });

  it('matches "### IDD Overview"', () => {
    expect(IDD_SECTION_PATTERNS.some(p => p.test('### IDD Overview'))).toBe(true);
  });
});
