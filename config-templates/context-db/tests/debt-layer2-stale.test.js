import { describe, it, expect } from 'vitest';
import { extractKeywords, inferRelatedSkills, SKILL_KEYWORD_MAP, STOP_WORDS } from '../scripts/debt-layer2-stale.js';

// ── extractKeywords tests ──
describe('extractKeywords', () => {
  it('extracts meaningful keywords from title', () => {
    const result = extractKeywords('DLA-04 Stale Detection Layer');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('stale');
    expect(result).toContain('detection');
  });

  it('filters stop words', () => {
    const result = extractKeywords('Fix the bug in the editor');
    // "fix", "the", "bug", "in" are all stop words
    expect(result).not.toContain('the');
    expect(result).not.toContain('bug');
    expect(result).not.toContain('fix');
    expect(result).toContain('editor');
  });

  it('returns empty for null', () => {
    expect(extractKeywords(null)).toEqual([]);
  });

  it('returns empty for short title (< 5 chars)', () => {
    expect(extractKeywords('abc')).toEqual([]);
  });

  it('filters words shorter than 3 chars', () => {
    const result = extractKeywords('A B CD EFG HIJK');
    const short = result.filter(w => w.length < 3);
    expect(short).toHaveLength(0);
  });

  it('converts to lowercase', () => {
    const result = extractKeywords('MissingTypeCheck');
    expect(result.every(w => w === w.toLowerCase())).toBe(true);
  });

  it('limits to max 5 keywords', () => {
    const result = extractKeywords('alpha bravo charlie delta echo foxtrot golf hotel india');
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('handles special characters', () => {
    const result = extractKeywords('file-existence check_validation test.runner');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ── inferRelatedSkills tests ──
describe('inferRelatedSkills', () => {
  it('maps "editor" keyword to phycool-editor-arch', () => {
    const result = inferRelatedSkills('editor panel issue', '');
    expect(result).toContain('phycool-editor-arch');
  });

  it('maps "payment" to phycool-payment-subscription', () => {
    const result = inferRelatedSkills('payment webhook error', '');
    expect(result).toContain('phycool-payment-subscription');
  });

  it('maps "debt" to phycool-debt-registry', () => {
    const result = inferRelatedSkills('debt registry priority', '');
    expect(result).toContain('phycool-debt-registry');
  });

  it('maps multiple keywords from title + description', () => {
    const result = inferRelatedSkills('admin dashboard', 'RBAC permission issue');
    expect(result).toContain('phycool-admin-module');
    expect(result).toContain('phycool-admin-dashboard');
    expect(result).toContain('phycool-admin-rbac');
  });

  it('returns empty for unrelated text', () => {
    const result = inferRelatedSkills('unrelated topic xyz', 'nothing matches');
    expect(result).toHaveLength(0);
  });

  it('handles null title and description', () => {
    const result = inferRelatedSkills(null, null);
    expect(result).toHaveLength(0);
  });

  it('deduplicates skills', () => {
    const result = inferRelatedSkills('editor canvas fabric', '');
    // "editor", "canvas", "fabric" all map to phycool-editor-arch
    const editorCount = result.filter(s => s === 'phycool-editor-arch').length;
    expect(editorCount).toBe(1);
  });
});

// ── SKILL_KEYWORD_MAP tests ──
describe('SKILL_KEYWORD_MAP', () => {
  it('has expected keyword entries', () => {
    expect(SKILL_KEYWORD_MAP['editor']).toBe('phycool-editor-arch');
    expect(SKILL_KEYWORD_MAP['zustand']).toBe('phycool-zustand-patterns');
    expect(SKILL_KEYWORD_MAP['pdf']).toBe('phycool-pdf-engine');
    expect(SKILL_KEYWORD_MAP['sql']).toBe('phycool-sqlserver');
  });

  it('has at least 20 keyword mappings', () => {
    expect(Object.keys(SKILL_KEYWORD_MAP).length).toBeGreaterThanOrEqual(20);
  });
});

// ── STOP_WORDS tests ──
describe('STOP_WORDS', () => {
  it('contains common English stop words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
    expect(STOP_WORDS.has('for')).toBe(true);
  });

  it('contains dev-specific stop words', () => {
    expect(STOP_WORDS.has('fix')).toBe(true);
    expect(STOP_WORDS.has('bug')).toBe(true);
    expect(STOP_WORDS.has('todo')).toBe(true);
  });

  it('does not contain domain-specific terms', () => {
    expect(STOP_WORDS.has('editor')).toBe(false);
    expect(STOP_WORDS.has('payment')).toBe(false);
  });
});
