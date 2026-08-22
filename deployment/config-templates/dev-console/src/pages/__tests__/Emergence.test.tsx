// ============================================================
// Emergence.test.tsx — ecc-emergence-governance Task 5.2
// AC3 卡片渲染 + AC2 漏斗 + AC6 星數來源 + 治理互動 + deriveTrends
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Emergence, { deriveTrends } from '../Emergence';
import type { InstinctCard, EmergenceFunnel, EvolveCandidate, EvolveCandidatesResponse } from '../../types/emergence';

// ── Mock API modules ──
vi.mock('../../services/emergenceApi.js', () => ({
  fetchPipeline: vi.fn(),
  fetchInstincts: vi.fn(),
  putInstinctNote: vi.fn(),
  fetchLayer12: vi.fn().mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] }),
  putInstinctLike: vi.fn().mockResolvedValue({ ok: true, confidence: 0.9 }),
  postInstinctReject: vi.fn().mockResolvedValue({ ok: true }),
  putInstinctDislike: vi.fn().mockResolvedValue({ ok: true, confidence: 0.75 }),
  putInstinctRestore: vi.fn().mockResolvedValue({ ok: true }),
  fetchRejectedInstincts: vi.fn().mockResolvedValue([]),
  fetchGeneratedSkills: vi.fn().mockResolvedValue([]),
  putSkillPause: vi.fn().mockResolvedValue({ ok: true }),
  deleteGeneratedSkill: vi.fn().mockResolvedValue({ ok: true }),
  fetchEvolveCandidates: vi.fn().mockResolvedValue({
    candidates: [],
    total: 0,
    skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 },
    generatedAt: '2026-05-28T12:00:00+08:00',
  }),
}));

// ── Mock CSS ──
vi.mock('../../styles/emergence.css', () => ({}));

// ── Mock i18n ──
// [bwu-12 CR F4] mock 改餵**真實** zh-TW 字典 — 完整理由見 Emergence.a11y.test.tsx 同一處註解。
// 本檔「4 池 i18n 空態文案」案例因此斷言的是真實字典內容,而非測試自己寫死的字串。
vi.mock('../../i18n/I18nProvider.js', async () => {
  const zhTW = (await import('../../i18n/zh-TW.js')).default;
  return {
    useI18n: () => ({ t: zhTW }),
    I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ── Mock data ──
const mockFunnel: EmergenceFunnel = {
  observations: { total: 875, processed: 42, processedPct: 0.048 },
  instincts: { total: 14, approved: 8, needsEvidence: 6, rejected: 0 },
  rejected: { total: 0 },
  conversionRate: { obsToInstinct: 0.016, approvedPct: 0.571 },
};

const mockInstinct: InstinctCard = {
  id: 'inst_test_001',
  trigger: 'test_trigger',
  action: 'do_something',
  confidence: 0.85,
  verifier_status: 'approved',
  verifier_reason: 'Verified by test',
  adoption_score: 3,
  domain: 'testing',
  scope: 'global',
  evidence_jsonb: JSON.stringify([{ session: 's1', observation: 'test evidence' }]),
  source: 'auto',
  source_session_id: 'sess_001',
  created_at: '2026-05-28T00:00:00+08:00',
  last_seen: '2026-05-28T10:00:00+08:00',
  decay_at: null,
  project_type: null,
  business: null,
  description_zh: '用途：測試本能。改善內容：確認渲染正常。使用場景：測試期間觸發。',
  user_note: null,
  machine_star: 9,
  rejected_count: 0,
};

async function getApi() {
  const mod = await import('../../services/emergenceApi.js');
  return mod as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

// ── Story C mock 資料 ──
const mockEvolveCandidate: EvolveCandidate = {
  type: 'skill',
  domain: 'skill',
  business: 'ai-agent-infra',
  project_type: 'env-tooling',
  member_ids: ['inst_1', 'inst_2'],
  members: [
    { id: 'inst_1', trigger: 'when editing skill files', action: 'invoke saas-to-skill', confidence: 0.85, adoption_score: 3, rejected_count: 0 },
    { id: 'inst_2', trigger: 'when creating new skill', action: 'check skill-creation-discipline', confidence: 0.75, adoption_score: 3, rejected_count: 1 },
  ],
  avg_confidence: 0.8,
  avg_adoption_score: 3,
  rejected_total: 1,
  suggested_action: 'Skill(saas-to-skill) Mode A',
};

const mockEvolveCandidatesResponse: EvolveCandidatesResponse = {
  candidates: [mockEvolveCandidate],
  total: 1,
  skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 },
  generatedAt: '2026-05-28T12:00:00+08:00',
};

function renderEmergence() {
  return render(
    <MemoryRouter>
      <Emergence />
    </MemoryRouter>,
  );
}

// ============================================================
// AC3 — 卡片渲染
// ============================================================
describe('Emergence 頁面 — 卡片渲染(AC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('載入後應顯示 instinct 卡片', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('卡片應含 trigger + action 摘要', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/do_something/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('空結果時應顯示空態訊息(AC1 — 尚無觀察中本能)', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getByText(/尚無觀察中本能/i)).toBeInTheDocument();
    });
  });

  // [bwu-12 CR F10] 上一個案例只覆蓋 4 個池中的觀察池。bwu-12 修的死碼(PoolSection children 在
  // count===0 時不渲染,故寫在 children 內的空態文字永遠觸及不到)是 4 池同型缺陷,若只有 1 池有
  // 迴歸測試,另外 3 池的空態可以再次悄悄消失而測試全綠 —— 這正是本卡診斷的病。四段文案來自
  // i18n emergence.pools.*.emptyHint(CR F4 由硬編字面值改為 i18n 消費),故此處一併鎖住該接線。
  it('空結果時 4 池應各自顯示自己的 i18n 空態文案(非 PoolSection 的通用 fallback「暫無資料」)', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getByText(/尚無已生成技能/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/目前無成熟候選/i)).toBeInTheDocument();
    expect(screen.getByText(/尚無觀察中本能/i)).toBeInTheDocument();
    expect(screen.getByText(/尚無否決記錄/i)).toBeInTheDocument();
    // 通用 fallback 出現 = emptyText prop 沒接上(退回 PoolSection.tsx:43 的 '暫無資料')
    expect(screen.queryByText('暫無資料')).not.toBeInTheDocument();
  });
});

// ============================================================
// AC2 — 漏斗顯示
// ============================================================
describe('Emergence 頁面 — 漏斗顯示(AC2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應顯示 observations 總計', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/875/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('應顯示 instincts 總計', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getByText(/14/)).toBeInTheDocument();
    });
  });
});

// ============================================================
// AC2 — 星數顯示(machine_star SSoT — ecc-emergence-ui-v2)
// ============================================================
describe('Emergence 頁面 — machine_star 顯示(AC2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('卡片應顯示 ⭐ machine_star 數字', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([{ ...mockInstinct, machine_star: 9 }]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' });

    renderEmergence();

    await waitFor(() => {
      // ⭐ 9 顯示於卡片左上角
      expect(screen.getAllByText(/⭐\s*9/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('不應再顯示「機器衍生」或「使用者評分」文字(AC2 移除手動覆寫)', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' });

    renderEmergence();

    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
    expect(screen.queryByText(/機器衍生/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/使用者評分/i)).not.toBeInTheDocument();
  });
});

// ============================================================
// AC4 — 曾被否決 N 次徽章
// ============================================================
describe('Emergence 頁面 — 否決徽章(AC4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejected_count > 0 時應顯示否決徽章', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([{ ...mockInstinct, rejected_count: 2 }]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getByText(/曾被否決 2 次/i)).toBeInTheDocument();
    });
  });

  it('rejected_count = 0 時不應顯示否決徽章', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([{ ...mockInstinct, rejected_count: 0 }]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/曾被否決/i)).not.toBeInTheDocument();
  });
});

// ============================================================
// AC2 — 讚按鈕
// ============================================================
describe('Emergence 頁面 — 讚按鈕(AC2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應渲染讚按鈕', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
    });

    const likeBtn = screen.getByTitle(/讚/i);
    expect(likeBtn).toBeInTheDocument();
  });

  it('點讚後應呼叫 putInstinctLike', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.putInstinctLike.mockResolvedValue({ ok: true, confidence: 0.9 });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
    });

    const likeBtn = screen.getByTitle(/讚/i);
    fireEvent.click(likeBtn);

    await waitFor(() => {
      expect(api.putInstinctLike).toHaveBeenCalledWith('inst_test_001');
    });
  });
});

// ============================================================
// AC3 — 否決按鈕
// ============================================================
describe('Emergence 頁面 — 否決按鈕(AC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應渲染否決按鈕', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/test_trigger/i).length).toBeGreaterThanOrEqual(1);
    });

    const rejectBtn = screen.getByTitle(/否決/i);
    expect(rejectBtn).toBeInTheDocument();
  });
});

// ============================================================
// AC5 — Layer 12 注入觀測區
// ============================================================
describe('Emergence 頁面 — Layer 12 觀測(AC5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應顯示 Layer 12 注入清單區塊', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([]);
    api.fetchLayer12.mockResolvedValue({
      cap: 450,
      used: 340,
      pct: 0.283,
      projectType: null,
      injected: [{ score: 4, trigger: 'edit layout', action: '提醒 100 行 SOP' }],
    });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getAllByText(/Layer 12/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('字元用量顯示正確', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([]);
    api.fetchLayer12.mockResolvedValue({
      cap: 450,
      used: 340,
      pct: 0.283,
      projectType: null,
      injected: [],
    });

    renderEmergence();

    await waitFor(() => {
      expect(screen.getByText(/340/)).toBeInTheDocument();
      expect(screen.getByText(/450/)).toBeInTheDocument();
    });
  });
});

// ============================================================
// AC6 — deriveTrends 純函式單元測試
// ============================================================
describe('deriveTrends 純函式(AC6)', () => {
  const base: InstinctCard = {
    id: 'a',
    trigger: 'T',
    action: 'A',
    confidence: 0.8,
    verifier_status: 'approved',
    verifier_reason: null,
    adoption_score: 3,
    domain: 'test',
    scope: 'global',
    evidence_jsonb: '[]',
    source: 'auto',
    source_session_id: null,
    created_at: '2026-01-01T00:00:00+08:00',
    last_seen: '2026-05-01T00:00:00+08:00',
    decay_at: null,
    project_type: null,
    business: null,
    description_zh: null,
    user_note: null,
    machine_star: 5,
    rejected_count: 0,
  };

  it('ranking 應依 adoption_score DESC 排序', () => {
    const instincts: InstinctCard[] = [
      { ...base, id: 'low', adoption_score: 1 },
      { ...base, id: 'high', adoption_score: 5 },
      { ...base, id: 'mid', adoption_score: 3 },
    ];

    const { ranking } = deriveTrends(instincts);
    expect(ranking[0].id).toBe('high');
    expect(ranking[1].id).toBe('mid');
    expect(ranking[2].id).toBe('low');
  });

  it('同分時 ranking 應依 confidence DESC 排序', () => {
    const instincts: InstinctCard[] = [
      { ...base, id: 'lo-conf', adoption_score: 3, confidence: 0.3 },
      { ...base, id: 'hi-conf', adoption_score: 3, confidence: 0.9 },
    ];

    const { ranking } = deriveTrends(instincts);
    expect(ranking[0].id).toBe('hi-conf');
  });

  it('confidence < 0.3 的 instinct 應進入 decaying', () => {
    const instincts: InstinctCard[] = [
      { ...base, id: 'ok', confidence: 0.8, decay_at: null },
      { ...base, id: 'low', confidence: 0.2, decay_at: null },
    ];

    const { decaying } = deriveTrends(instincts);
    expect(decaying.map(i => i.id)).toContain('low');
    expect(decaying.map(i => i.id)).not.toContain('ok');
  });

  it('decay_at 非 null 的 instinct 應進入 decaying', () => {
    const instincts: InstinctCard[] = [
      { ...base, id: 'decaying', confidence: 0.8, decay_at: '2026-06-01T00:00:00+08:00' },
      { ...base, id: 'fresh', confidence: 0.8, decay_at: null },
    ];

    const { decaying } = deriveTrends(instincts);
    expect(decaying.map(i => i.id)).toContain('decaying');
    expect(decaying.map(i => i.id)).not.toContain('fresh');
  });

  // suppress unused import lint
  void (null as unknown as EvolveCandidatesResponse);

  it('timeline 應依 last_seen DESC 排序', () => {
    const instincts: InstinctCard[] = [
      { ...base, id: 'old', last_seen: '2026-01-01T00:00:00+08:00' },
      { ...base, id: 'new', last_seen: '2026-05-28T00:00:00+08:00' },
      { ...base, id: 'mid', last_seen: '2026-03-01T00:00:00+08:00' },
    ];

    const { timeline } = deriveTrends(instincts);
    expect(timeline[0].id).toBe('new');
    expect(timeline[1].id).toBe('mid');
    expect(timeline[2].id).toBe('old');
  });
});

// ============================================================
// Story C — EvolveSection + HITLModal (AC3/AC4/AC5)
// ============================================================
describe('EvolveSection — 演化候選渲染(Story C AC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function setupWithCandidates() {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchEvolveCandidates.mockResolvedValue(mockEvolveCandidatesResponse);
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    renderEmergence();
    // [bwu-12] 候選池預設即展開(Emergence.tsx:203 `{ skill:false, candidate:false, ... }`——
    // "BUG 2a fix: 全展開 預設都顯示一排"),資料到位後卡片直接可見。舊版在此點擊候選池 header
    // 假設它預設收合、點擊才展開，實際上點的是「已展開」的池，結果收合掉——正是本檔 4 個
    // EvolveSection 案例("generate button not found" / "rejected_total")的根因，移除該點擊。
    await waitFor(() => {
      expect(document.querySelector('.emergence-pool--candidate')).not.toBeNull();
    });
    return api;
  }

  it('應渲染候選池(🧬 候選池)', async () => {
    await setupWithCandidates();
    await waitFor(() => {
      expect(screen.getByText(/候選池/i)).toBeInTheDocument();
    });
  });

  it('候選卡片應顯示 type badge', async () => {
    await setupWithCandidates();
    await waitFor(() => {
      expect(screen.getAllByText(/skill/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('rejected_total ≥ 1 時應顯示否決徽章', async () => {
    await setupWithCandidates();
    await waitFor(() => {
      expect(screen.getAllByText(/1 次否決|1 次/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('點擊[生成]按鈕應開啟 HITLModal', async () => {
    await setupWithCandidates();

    await waitFor(() => {
      const generateBtn = screen.queryByRole('button', { name: /生成/i });
      if (!generateBtn) throw new Error('generate button not found');
      fireEvent.click(generateBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/HITL 生成引導/i)).toBeInTheDocument();
    });
  });

  it('HITLModal 應顯示字面 Skill 調用樣本', async () => {
    await setupWithCandidates();

    await waitFor(() => {
      const generateBtn = screen.queryByRole('button', { name: /生成/i });
      if (!generateBtn) throw new Error('generate button not found');
      fireEvent.click(generateBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/saas-to-skill/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('[關閉] 按鈕不發 API mutation、Modal 消失', async () => {
    await setupWithCandidates();

    await waitFor(() => {
      const generateBtn = screen.queryByRole('button', { name: /生成/i });
      if (!generateBtn) throw new Error('generate button not found');
      fireEvent.click(generateBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/HITL 生成引導/i)).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /我已了解/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/HITL 生成引導/i)).not.toBeInTheDocument();
    });

    const api = await getApi();
    // 確認沒有發出任何 mutation API
    expect(api.putInstinctNote).not.toHaveBeenCalled();
    expect(api.putInstinctLike).not.toHaveBeenCalled();
    expect(api.postInstinctReject).not.toHaveBeenCalled();
  });
});

// ============================================================
// ecc-emergence-ui-v2 — 4 池架構 + Modal + 治理按鈕
// ============================================================
describe('Emergence v2 — 4 池架構(ecc-emergence-ui-v2 AC1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('4 個 PoolSection region 應渲染', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '2026-05-28T12:00:00+08:00' });

    renderEmergence();

    await waitFor(() => {
      const regions = document.querySelectorAll('[role="region"].emergence-pool');
      expect(regions.length).toBe(4);
    });
  });

  it('預設 4 池全展開(BUG 2a fix:全展開一排模式,取代舊版 1 展開 3 收合假設)', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    api.fetchInstincts.mockResolvedValue([mockInstinct]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '2026-05-28T12:00:00+08:00' });

    renderEmergence();

    // [bwu-12] Emergence.tsx:203 collapsed 初始值全 4 池皆 false(全展開)。查詢限定
    // `.emergence-pool__header`(PoolSection.tsx:30),避免與人口池內「展開全部/收合一排」
    // 按鈕(PoolSection.tsx:52-58,亦帶 aria-expanded)混淆——populated pool 會多出一個
    // aria-expanded="false" 的列內按鈕,不屬於池的收合狀態。
    await waitFor(() => {
      const expandedHeaders = document.querySelectorAll('.emergence-pool__header[aria-expanded="true"]');
      const collapsedHeaders = document.querySelectorAll('.emergence-pool__header[aria-expanded="false"]');
      expect(expandedHeaders.length).toBe(4);
      expect(collapsedHeaders.length).toBe(0);
    });
  });
});

describe('Emergence v2 — AC9 衰退警示色', () => {
  it('deriveTrends 衰退警示色 block CSS token 應包含衰退警示', async () => {
    const api = await getApi();
    api.fetchPipeline.mockResolvedValue(mockFunnel);
    const decayingCard = { ...mockInstinct, id: 'decaying', confidence: 0.2, decay_at: '2026-06-01T00:00:00+08:00' };
    api.fetchInstincts.mockResolvedValue([decayingCard]);
    api.fetchLayer12.mockResolvedValue({ cap: 450, used: 0, pct: 0, projectType: null, injected: [] });
    api.fetchRejectedInstincts.mockResolvedValue([]);
    api.fetchGeneratedSkills.mockResolvedValue([]);
    api.fetchEvolveCandidates.mockResolvedValue({ candidates: [], total: 0, skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 }, generatedAt: '' });

    renderEmergence();

    await waitFor(() => {
      const decayBlock = document.querySelector('.emergence-trends__block--decaying');
      expect(decayBlock).not.toBeNull();
    });
  });
});
