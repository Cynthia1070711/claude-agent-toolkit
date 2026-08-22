// ============================================================
// lifecycleView.test.ts — 九態三重編碼 + 未知值 fallback（AC18 / BR-051）
// 純函式，無 fixture、無 DOM、無 mock。
// ============================================================
import { describe, it, expect } from 'vitest';
import { lifecycleView, QUEUE_SECTION_META } from '../lifecycleView.js';

const NINE_LIFECYCLES = [
  'dispatching', 'running', 'reported', 'awaiting-review', 'revising',
  'approved', 'closed', 'failed', 'abandoned',
];

describe('lifecycleView', () => {
  it.each(NINE_LIFECYCLES)('BR051_%s_ReturnsNonEmptyIconLabelTone', (lifecycle) => {
    const view = lifecycleView(lifecycle);
    expect(view.icon).toBeTruthy();
    expect(view.label).toBeTruthy();
    expect(view.tone).toBeTruthy();
    // label 不得為協議英文字面（不得等於原始 lifecycle 字串本身）
    expect(view.label).not.toBe(lifecycle);
  });

  it('BR051_UnknownLifecycle_ReturnsFallbackWithOriginalString', () => {
    const view = lifecycleView('some-unknown-value');
    expect(view).toEqual({ icon: '❓', label: 'some-unknown-value', tone: 'none' });
  });
});

describe('QUEUE_SECTION_META', () => {
  it('四段標題為繁中動作詞，不含協議英文字面', () => {
    const titles = QUEUE_SECTION_META.map((m) => m.title);
    expect(titles).toEqual(['待確認', '待驗證', '待關窗', '需注意']);
    for (const raw of ['reported', 'awaiting-review', 'approved', 'requires_attention']) {
      expect(titles.some((t) => t.includes(raw))).toBe(false);
    }
  });

  it('attention 段 tone 為 attention，其餘三段為 action', () => {
    const attention = QUEUE_SECTION_META.find((m) => m.key === 'attention');
    expect(attention?.tone).toBe('attention');
    const others = QUEUE_SECTION_META.filter((m) => m.key !== 'attention');
    expect(others.every((m) => m.tone === 'action')).toBe(true);
  });
});
