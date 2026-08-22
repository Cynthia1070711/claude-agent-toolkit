import { describe, it, expect } from 'vitest';
import { parseArgs, extractKeyTerms, checkViolations } from '../scripts/skill-idd-sync-check.js';

// ── parseArgs tests ──
describe('parseArgs', () => {
  it('parses --changed-files with comma-separated paths', () => {
    const result = parseArgs(['node', 'script.js', '--changed-files', 'src/A.cs,src/B.tsx']);
    expect(result.mode).toBe('changed-files');
    expect(result.files).toEqual(['src/A.cs', 'src/B.tsx']);
  });

  it('trims whitespace from file paths', () => {
    const result = parseArgs(['node', 'script.js', '--changed-files', ' src/A.cs , src/B.tsx ']);
    expect(result.files).toEqual(['src/A.cs', 'src/B.tsx']);
  });

  it('parses --full-audit mode', () => {
    const result = parseArgs(['node', 'script.js', '--full-audit']);
    expect(result.mode).toBe('full-audit');
  });

  it('parses --skill mode with skill name', () => {
    const result = parseArgs(['node', 'script.js', '--skill', 'phycool-editor-arch']);
    expect(result.mode).toBe('skill');
    expect(result.skillName).toBe('phycool-editor-arch');
  });

  it('returns null mode when no flags', () => {
    const result = parseArgs(['node', 'script.js']);
    expect(result.mode).toBeNull();
  });

  it('filters empty strings from files', () => {
    const result = parseArgs(['node', 'script.js', '--changed-files', 'src/A.cs,,']);
    expect(result.files).toEqual(['src/A.cs']);
  });
});

// ── extractKeyTerms tests ──
describe('extractKeyTerms', () => {
  it('extracts camelCase terms ≥ 4 chars', () => {
    const terms = extractKeyTerms('請勿加 isFreeUser 阻擋 ImagePanel');
    expect(terms).toContain('isFreeUser');
    expect(terms).toContain('ImagePanel');
  });

  it('extracts backtick-quoted code', () => {
    const terms = extractKeyTerms('Do not add `isFreePlan` check');
    expect(terms).toContain('isFreePlan');
  });

  it('filters out short terms (< 4 chars)', () => {
    const terms = extractKeyTerms('Do not add abc xyz');
    const shortTerms = terms.filter(t => t.length < 4);
    expect(shortTerms).toHaveLength(0);
  });

  it('deduplicates extracted terms', () => {
    const terms = extractKeyTerms('isFreeUser check isFreeUser again');
    const isFreeUserCount = terms.filter(t => t === 'isFreeUser').length;
    expect(isFreeUserCount).toBeLessThanOrEqual(1);
  });

  it('returns empty for short text with no code terms', () => {
    const terms = extractKeyTerms('no');
    expect(terms).toHaveLength(0);
  });

  it('extracts PascalCase terms', () => {
    const terms = extractKeyTerms('Do not modify EditorPanel component');
    expect(terms).toContain('EditorPanel');
  });
});

// ── checkViolations tests ──
describe('checkViolations', () => {
  it('returns empty when no forbidden_changes', () => {
    const idd = { idd_id: 'IDD-COM-001', forbidden_changes: '[]', related_files: '["src/A.cs"]' };
    const result = checkViolations(['src/A.cs'], idd);
    expect(result).toHaveLength(0);
  });

  it('returns empty when forbidden_changes is null', () => {
    const idd = { idd_id: 'IDD-COM-001', forbidden_changes: null, related_files: '["src/A.cs"]' };
    const result = checkViolations(['src/A.cs'], idd);
    expect(result).toHaveLength(0);
  });

  it('returns empty when changed files do not match related_files', () => {
    const idd = {
      idd_id: 'IDD-COM-001',
      forbidden_changes: '["請勿加 isFreeUser 阻擋"]',
      related_files: '["src/Other.cs"]',
    };
    const result = checkViolations(['src/A.cs'], idd);
    expect(result).toHaveLength(0);
  });

  it('returns empty when related_files is null', () => {
    const idd = {
      idd_id: 'IDD-COM-001',
      forbidden_changes: '["請勿修改"]',
      related_files: null,
    };
    const result = checkViolations(['src/A.cs'], idd);
    expect(result).toHaveLength(0);
  });

  it('handles invalid JSON in forbidden_changes gracefully', () => {
    const idd = {
      idd_id: 'IDD-COM-001',
      forbidden_changes: 'not-json',
      related_files: '["src/A.cs"]',
    };
    const result = checkViolations(['src/A.cs'], idd);
    expect(result).toHaveLength(0);
  });
});
