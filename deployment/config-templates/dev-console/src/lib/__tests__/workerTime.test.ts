// ============================================================
// workerTime.test.ts — 相對時間色階四組斷言（AC5 / BR-012）
// 純函式，無 fixture、無 DOM、無 mock。
// ============================================================
import { describe, it, expect } from 'vitest';
import { formatRelativeHeartbeat } from '../workerTime.js';

describe('formatRelativeHeartbeat', () => {
  const now = Date.parse('2026-07-28T12:00:00+08:00');

  it('BR012_ThreeMinutesAgo_ReturnsFreshTone', () => {
    const iso = new Date(now - 180_000).toISOString();
    expect(formatRelativeHeartbeat(iso, now)).toEqual({ text: '3 分鐘前', tone: 'fresh' });
  });

  it('BR012_TwelveMinutesAgo_ReturnsWarnTone', () => {
    const iso = new Date(now - 720_000).toISOString();
    expect(formatRelativeHeartbeat(iso, now)).toEqual({ text: '12 分鐘前', tone: 'warn' });
  });

  it('BR012_FortyFiveMinutesAgo_ReturnsStaleTone', () => {
    const iso = new Date(now - 2_700_000).toISOString();
    expect(formatRelativeHeartbeat(iso, now)).toEqual({ text: '45 分鐘前', tone: 'stale' });
  });

  it('BR012_NullIso_ReturnsDashNoneTone', () => {
    expect(formatRelativeHeartbeat(null, now)).toEqual({ text: '—', tone: 'none' });
  });

  it('BR012_ExactlyFiveMinutes_BoundaryIsFresh', () => {
    const iso = new Date(now - 300_000).toISOString();
    expect(formatRelativeHeartbeat(iso, now).tone).toBe('fresh');
  });

  it('BR012_ExactlyThirtyMinutes_BoundaryIsWarn', () => {
    const iso = new Date(now - 1_800_000).toISOString();
    expect(formatRelativeHeartbeat(iso, now).tone).toBe('warn');
  });

  it('BR012_InvalidIso_ReturnsDashNoneTone', () => {
    expect(formatRelativeHeartbeat('not-a-date', now)).toEqual({ text: '—', tone: 'none' });
  });
});
