// ============================================================
// Emergence.a11y.test.tsx — ecc-emergence-ui-v2 AC13 a11y
// NOTE: jest-axe not yet installed; ARIA attribute validation
// via Testing Library queries. Full axe scan pending:
//   npm i -D jest-axe @types/jest-axe
// ============================================================
// [bwu-12 CR Boy Scout] screen / fireEvent 自本檔建立起即未被使用(TS6133 noUnusedLocals),
// 本檔全數斷言走 document.querySelector*。順手移除,不新增依賴。
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Emergence from '../Emergence';
import type { EmergenceFunnel } from '../../types/emergence';

vi.mock('../../services/emergenceApi.js', () => ({
  fetchPipeline: vi.fn(),
  fetchInstincts: vi.fn().mockResolvedValue([]),
  putInstinctNote: vi.fn(),
  fetchLayer12: vi.fn().mockResolvedValue({ cap: 1200, used: 0, pct: 0, projectType: null, injected: [] }),
  putInstinctLike: vi.fn(),
  postInstinctReject: vi.fn(),
  putInstinctDislike: vi.fn(),
  putInstinctRestore: vi.fn(),
  fetchRejectedInstincts: vi.fn().mockResolvedValue([]),
  fetchGeneratedSkills: vi.fn().mockResolvedValue([]),
  putSkillPause: vi.fn(),
  deleteGeneratedSkill: vi.fn(),
  fetchEvolveCandidates: vi.fn().mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' }),
}));

vi.mock('../../styles/emergence.css', () => ({}));
// [bwu-12 CR F4] mock 改餵**真實** zh-TW 字典,不再手寫只含 nav.emergence 的存根。
// 原存根與元件實際需求脫節:Emergence.tsx 消費 t.emergence.pools.*.emptyHint 時,存根缺該鍵即
// TypeError。真實字典是嚴格超集(nav.emergence 值相同,zh-TW.ts:22),既有斷言不受影響,且往後
// 元件新增任何 t.* 消費點都不需再同步維護一份手寫存根。
vi.mock('../../i18n/I18nProvider.js', async () => {
  const zhTW = (await import('../../i18n/zh-TW.js')).default;
  return {
    useI18n: () => ({ t: zhTW }),
    I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockFunnel: EmergenceFunnel = {
  observations: { total: 100, processed: 50, processedPct: 0.5 },
  instincts: { total: 5, approved: 3, needsEvidence: 2, rejected: 0 },
  rejected: { total: 0 },
  conversionRate: { obsToInstinct: 0.05, approvedPct: 0.6 },
};

async function setup() {
  const api = (await import('../../services/emergenceApi.js')) as unknown as Record<string, ReturnType<typeof vi.fn>>;
  api.fetchPipeline.mockResolvedValue(mockFunnel);
  render(<MemoryRouter><Emergence /></MemoryRouter>);
  await waitFor(() => {
    expect(document.querySelector('.emergence-pool')).not.toBeNull();
  });
  return api;
}

describe('Emergence a11y — AC13 ARIA 基礎驗證', () => {
  beforeEach(() => vi.clearAllMocks());

  it('4 池均有 role=region', async () => {
    await setup();
    const regions = document.querySelectorAll('[role="region"].emergence-pool');
    expect(regions.length).toBe(4);
  });

  it('4 池 region 均有 aria-labelledby', async () => {
    await setup();
    const regions = document.querySelectorAll('[role="region"].emergence-pool');
    regions.forEach(r => {
      expect(r.getAttribute('aria-labelledby')).not.toBeNull();
    });
  });

  it('collapsible header 有 aria-expanded', async () => {
    await setup();
    const expandedBtns = document.querySelectorAll('[aria-expanded]');
    expect(expandedBtns.length).toBeGreaterThanOrEqual(4);
  });

  it('observe 池預設 aria-expanded=true', async () => {
    await setup();
    const observePool = document.querySelector('.emergence-pool--observe');
    expect(observePool).not.toBeNull();
    const header = observePool!.querySelector('[aria-expanded]');
    expect(header?.getAttribute('aria-expanded')).toBe('true');
  });

  it('4 池預設皆展開(BUG 2a fix:全展開一排模式,取代舊版其他 3 池收合假設)', async () => {
    await setup();
    // [bwu-12] Emergence.tsx:203 collapsed 初始值全 4 池皆 false(全展開)——「其他 3 池預設收合」
    // 已非現行行為。查詢限定 `.emergence-pool__header`,避免與池內「展開全部」按鈕(同帶
    // aria-expanded)混淆;本測試 setup() 的 fetchInstincts 回空陣列,4 池 count 皆 0,不會有
    // 該按鈕出現,故此處單純為與 Emergence.test.tsx 同案例保持一致的防禦性寫法。
    const headers = document.querySelectorAll('.emergence-pool__header[aria-expanded]');
    expect(headers.length).toBe(4);
    headers.forEach(h => expect(h.getAttribute('aria-expanded')).toBe('true'));
  });

  it('衰退警示區塊 CSS class 存在', async () => {
    const api = (await import('../../services/emergenceApi.js')) as unknown as Record<string, ReturnType<typeof vi.fn>>;
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([{
      id: 'decaying_001', trigger: 'T', action: 'A', confidence: 0.15,
      verifier_status: 'approved', verifier_reason: null, adoption_score: 0,
      domain: null, scope: 'project', evidence_jsonb: null, source: null,
      source_session_id: null, created_at: '2026-05-28T00:00:00+08:00',
      last_seen: '2026-05-28T00:00:00+08:00', decay_at: '2026-05-29T00:00:00+08:00',
      project_type: null, business: null, description_zh: null, user_note: null,
      machine_star: 2, rejected_count: 0,
    }]);
    render(<MemoryRouter><Emergence /></MemoryRouter>);
    await waitFor(() => {
      const block = document.querySelector('.emergence-trends__block--decaying');
      expect(block).not.toBeNull();
    });
  });
});
