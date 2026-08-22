// ============================================================
// godNodesApi.test.ts — namespace cluster color hash deterministic test
// Story: td-devconsole-godnode-and-mem-dashboard (BR-DESIGN-001)
// ============================================================
import { describe, it, expect } from 'vitest';
import { hslByCluster, extractCluster } from '../godNodesApi.js';

describe('godNodesApi — hslByCluster (BR-DESIGN-001)', () => {
  it('returns same hue for same namespace (deterministic)', () => {
    const ns = 'PhyCool.Web.Services.BackOffice';
    expect(hslByCluster(ns)).toBe(hslByCluster(ns));
    expect(hslByCluster(ns)).toBe(hslByCluster(ns));
  });

  it('returns different hue for different namespace', () => {
    const a = hslByCluster('PhyCool.Web.Services.BackOffice');
    const b = hslByCluster('PhyCool.Web.Data.ModelSnapshot');
    expect(a).not.toBe(b);
  });

  it('uses fixed saturation 60% and lightness 50% (WCAG AA contrast)', () => {
    const result = hslByCluster('TestNamespace');
    expect(result).toMatch(/^hsl\(\d+, 60%, 50%\)$/);
  });

  it('hue is between 0 and 359', () => {
    for (let i = 0; i < 100; i++) {
      const result = hslByCluster(`ns-${i}`);
      const match = result.match(/^hsl\((\d+),/);
      expect(match).not.toBeNull();
      const hue = Number(match![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('handles empty string gracefully', () => {
    expect(hslByCluster('')).toBe('hsl(0, 60%, 50%)');
  });
});

describe('godNodesApi — extractCluster', () => {
  it('returns first 3 segments for 4+ segments', () => {
    expect(extractCluster('PhyCool.Web.Services.BackOffice')).toBe('PhyCool.Web.Services');
    expect(extractCluster('PhyCool.Web.Services.BackOffice.Sub')).toBe('PhyCool.Web.Services');
  });

  it('returns full namespace for ≤3 segments', () => {
    expect(extractCluster('PhyCool.Web.Data')).toBe('PhyCool.Web.Data');
    expect(extractCluster('Foo.Bar')).toBe('Foo.Bar');
    expect(extractCluster('Solo')).toBe('Solo');
  });

  it('handles empty string', () => {
    expect(extractCluster('')).toBe('');
  });
});
