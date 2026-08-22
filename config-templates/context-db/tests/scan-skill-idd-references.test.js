import { describe, it, expect } from 'vitest';
import { getContextLines, IDD_PATTERNS } from '../scripts/scan-skill-idd-references.js';

// ── getContextLines tests ──
describe('getContextLines', () => {
  const lines = ['line0', 'line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7', 'line8', 'line9'];

  it('returns context around middle of array (default 3)', () => {
    const result = getContextLines(lines, 5, 3);
    expect(result).toBe('line2\nline3\nline4\nline5\nline6\nline7\nline8');
  });

  it('handles boundary at start (lineIndex=0)', () => {
    const result = getContextLines(lines, 0, 3);
    expect(result).toBe('line0\nline1\nline2\nline3');
    expect(result).toContain('line0');
  });

  it('handles boundary at end (lineIndex=9)', () => {
    const result = getContextLines(lines, 9, 3);
    expect(result).toBe('line6\nline7\nline8\nline9');
    expect(result).toContain('line9');
  });

  it('handles small array (fewer lines than context)', () => {
    const small = ['only', 'two'];
    const result = getContextLines(small, 0, 3);
    expect(result).toBe('only\ntwo');
  });

  it('uses default contextSize=3 when not specified', () => {
    const result = getContextLines(lines, 5);
    expect(result).toBe('line2\nline3\nline4\nline5\nline6\nline7\nline8');
  });

  it('handles contextSize=0 (only the target line)', () => {
    const result = getContextLines(lines, 5, 0);
    expect(result).toBe('line5');
  });

  it('handles single-element array', () => {
    const result = getContextLines(['solo'], 0, 3);
    expect(result).toBe('solo');
  });
});

// ── IDD_PATTERNS tests ──
describe('IDD_PATTERNS', () => {
  it('has 5 pattern types', () => {
    expect(IDD_PATTERNS).toHaveLength(5);
  });

  it('intentional_annotation matches [Intentional: IDD-COM-001]', () => {
    const p = IDD_PATTERNS.find(pp => pp.name === 'intentional_annotation');
    p.regex.lastIndex = 0;
    expect(p.regex.test('[Intentional: IDD-COM-001]')).toBe(true);
  });

  it('intentional_annotation matches [Intentional] without ID', () => {
    const p = IDD_PATTERNS.find(pp => pp.name === 'intentional_annotation');
    p.regex.lastIndex = 0;
    expect(p.regex.test('[Intentional]')).toBe(true);
  });

  it('idd_id matches IDD-REG-003', () => {
    const p = IDD_PATTERNS.find(pp => pp.name === 'idd_id');
    p.regex.lastIndex = 0;
    expect(p.regex.test('IDD-REG-003')).toBe(true);
  });

  it('forbidden_changes pattern matches the keyword', () => {
    const p = IDD_PATTERNS.find(pp => pp.name === 'forbidden_changes');
    p.regex.lastIndex = 0;
    expect(p.regex.test('forbidden_changes')).toBe(true);
  });

  it('phycool_idd_skill pattern matches skill name', () => {
    const p = IDD_PATTERNS.find(pp => pp.name === 'phycool_idd_skill');
    p.regex.lastIndex = 0;
    expect(p.regex.test('phycool-intentional-decisions')).toBe(true);
  });
});
