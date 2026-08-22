// ============================================================
// naturalLanguage.test.ts — ecc-emergence-ui-v2 AC12
// ============================================================
import { describe, it, expect } from 'vitest';
import { formatAdoption, formatConfidence, formatVerifier, formatDecay } from '../naturalLanguage.js';

describe('formatAdoption', () => {
  it('score=0 → 尚未跨視窗使用', () => {
    expect(formatAdoption(0)).toBe('尚未跨視窗使用');
  });
  it('score=1 → 使用 1 次', () => {
    expect(formatAdoption(1)).toBe('使用 1 次');
  });
  it('score=2 → 使用 2 次', () => {
    expect(formatAdoption(2)).toBe('使用 2 次');
  });
  it('score=3 → 同情境通用 3 次', () => {
    expect(formatAdoption(3)).toBe('同情境通用 3 次');
  });
  it('score=5 → 全視窗通用 5 次', () => {
    expect(formatAdoption(5)).toBe('全視窗通用 5 次');
  });
});

describe('formatConfidence', () => {
  it('0 → ⭐', () => {
    expect(formatConfidence(0)).toBe('⭐');
  });
  it('0.2 → ⭐⭐', () => {
    expect(formatConfidence(0.2)).toBe('⭐⭐');
  });
  it('0.5 → ⭐⭐⭐', () => {
    expect(formatConfidence(0.5)).toBe('⭐⭐⭐');
  });
  it('0.78 → ⭐⭐⭐⭐', () => {
    expect(formatConfidence(0.78)).toBe('⭐⭐⭐⭐');
  });
  it('1.0 → ⭐⭐⭐⭐⭐', () => {
    expect(formatConfidence(1.0)).toBe('⭐⭐⭐⭐⭐');
  });
  it('clamp negative → ⭐', () => {
    expect(formatConfidence(-0.5)).toBe('⭐');
  });
});

describe('formatVerifier', () => {
  it('approved → ✓ 已驗證', () => {
    expect(formatVerifier('approved')).toBe('✓ 已驗證');
  });
  it('needs-more-evidence → ⚠ 待佐證', () => {
    expect(formatVerifier('needs-more-evidence')).toBe('⚠ 待佐證');
  });
  it('rejected → ✗ 已否決', () => {
    expect(formatVerifier('rejected')).toBe('✗ 已否決');
  });
  it('null → —', () => {
    expect(formatVerifier(null)).toBe('—');
  });
  it('undefined → —', () => {
    expect(formatVerifier(undefined)).toBe('—');
  });
});

describe('formatDecay', () => {
  it('null → 不會衰退', () => {
    expect(formatDecay(null)).toBe('不會衰退');
  });
  it('未來 decay → 再 N 天衰退', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const result = formatDecay(future);
    expect(result).toMatch(/^再 \d+ 天衰退$/);
  });
  it('已過 decay → 已衰退', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(formatDecay(past)).toBe('已衰退');
  });
  it('異常字串 → 不會衰退', () => {
    expect(formatDecay('not-a-date')).toBe('不會衰退');
  });
  it('空字串 → 不會衰退', () => {
    expect(formatDecay('')).toBe('不會衰退');
  });
});
