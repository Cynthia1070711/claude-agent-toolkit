// ============================================================
// Roadmap.test.tsx — 五態 / hover 暫停 / ?lane=bogus 回退 / 空表引導 / Link 語意（tdb-1-track-plan-roadmap）
// ============================================================
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Roadmap from '../Roadmap';
import type { RoadmapCard, RoadmapResult } from '../../types/roadmap';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('../../services/roadmapApi.js', () => ({
  fetchRoadmap: vi.fn(),
}));

import * as api from '../../services/roadmapApi.js';

function makeCard(overrides: Partial<RoadmapCard> = {}): RoadmapCard {
  return {
    story_id: 'x-1', title: 'X-1 標題', title_short: 'X-1 標題', priority: 'P1', complexity: 'M',
    gate: 'unlocked', gate_note: null, gate_since: '2026-07-28T09:00:00+08:00',
    unlock_note: null, unlock_leverage: 0, deps_raw: null, blocked_by: [],
    children_progress: null, unplanned: false, seq: 1, updated_at: '2026-07-28T09:00:00+08:00',
    ...overrides,
  };
}

function makeResult(overrides: Partial<RoadmapResult> = {}): RoadmapResult {
  return {
    kpi: { total: 30, done: 13, unplanned: 0, pending: 17, inflight: 0, paused: 0 },
    lanes: [
      { lane: 'manual', cards: [makeCard({ story_id: 'bwu-3-dev-consume-review-audit', priority: 'P0' })] },
      { lane: 'dispatch', cards: [] },
      { lane: 'reconcile', cards: [] },
    ],
    generated_at: '2026-07-28T09:00:00+08:00',
    ...overrides,
  };
}

function renderRoadmap(initialEntry = '/roadmap') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/stories/:id" element={<div>story detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Roadmap page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('BR043_AppRoutes_RoadmapPathRendersPage: heading 存在（推進地圖）', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap();
    expect(await screen.findByRole('heading', { name: /推進地圖/ })).toBeInTheDocument();
  });

  it('BR049_RoadmapCard_IsNativeLinkNotButton: 卡片為原生 <a> 且 href 指向 /stories/{id}', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap();
    const links = await screen.findAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toBe('/stories/bwu-3-dev-consume-review-audit');
  });

  it('五態逐區可達：unlocked/inflight/waiting-external/blocked/paused 各自顯示字形圖示', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          {
            lane: 'manual',
            cards: [
              makeCard({ story_id: 's-inflight', gate: 'inflight' }),
              makeCard({ story_id: 's-unlocked', gate: 'unlocked' }),
              makeCard({ story_id: 's-waiting', gate: 'waiting-external', unlock_note: '等待外部條件' }),
              makeCard({ story_id: 's-blocked', gate: 'blocked', gate_note: '等待: dep-1' }),
              makeCard({ story_id: 's-paused', gate: 'paused', gate_note: '暫停原因' }),
            ],
          },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    renderRoadmap();
    await screen.findByText('s-inflight');
    // 範圍限定 #dvc-plan-lanes 內：KPI 列本身也用 ✅/⏳/🔄 當 icon（見 Roadmap.tsx:180-184），
    // 全文檔查詢會與 gate 圖示碰撞誤判為 multiple elements。
    const lanes = within(document.getElementById('dvc-plan-lanes')!);
    expect(lanes.getByText('🔄')).toBeInTheDocument();
    expect(lanes.getByText('✅')).toBeInTheDocument();
    expect(lanes.getByText('⏳')).toBeInTheDocument();
    expect(lanes.getByText('🕐')).toBeInTheDocument();
    expect(lanes.getByText('⏸')).toBeInTheDocument();
  });

  it('空 lane 顯示「本軌暫無待推卡」', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({ lanes: [{ lane: 'manual', cards: [] }, { lane: 'dispatch', cards: [] }, { lane: 'reconcile', cards: [] }] }),
    );
    renderRoadmap();
    const empties = await screen.findAllByText('本軌暫無待推卡');
    expect(empties.length).toBe(3);
  });

  it('BR053_RoadmapPage_WhenTrackPlanEmpty_ShowsMigrationGuidance: 空表顯示遷移引導，不顯示「全數收口」', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({ kpi: { total: 0, done: 0, unplanned: 0, pending: 0, inflight: 0, paused: 0 }, lanes: [] }),
    );
    renderRoadmap();
    expect(await screen.findByText(/migrate-track-plan/)).toBeInTheDocument();
    expect(screen.queryByText(/全數收口/)).toBeNull();
  });

  it('BR054_RoadmapPage_InvalidLaneParam_FallsBackToAllLanes: ?lane=bogus 三欄皆渲染', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap('/roadmap?lane=bogus');
    await screen.findByText('bwu-3-dev-consume-review-audit');
    expect(document.querySelectorAll('.dvc-plan-lane').length).toBe(3);
  });

  it('?lane=manual 僅渲染該欄', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap('/roadmap?lane=manual');
    await screen.findByText('bwu-3-dev-consume-review-audit');
    expect(document.querySelectorAll('.dvc-plan-lane').length).toBe(1);
  });

  it('BR050_RoadmapPolling_FiresEveryThirtySeconds: advanceTimersByTime(30000) 觸發第二次 fetch', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap();
    await vi.waitFor(() => expect(api.fetchRoadmap).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect((api.fetchRoadmap as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it('BR052_RoadmapPolling_WhileHovered_DoesNotReorder: hover 期間新資料不重排，離開後套用', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          { lane: 'manual', cards: [makeCard({ story_id: 'card-a', seq: 1 }), makeCard({ story_id: 'card-b', seq: 2 })] },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    renderRoadmap();
    await screen.findByText('card-a');

    const laneEl = document.getElementById('dvc-plan-lanes')!;
    // [bwu-12] act() 包 mouseEnter(既有 mouseLeave 呼叫皆已包,此處原缺)。isHoveringRef 本身是
    // ref 非 state,不觸發 re-render,但缺 act() 讓這次同步事件與後續 fake-timer 推進之間少了一次
    // React 排程邊界保證,在跑滿 57 檔全套件時偶發與其他檔的排程競速(單檔/隔離跑 100% 穩定,
    // 全套件跑 2 次各 1 次此類失敗)。與下方 F4 案例同一根因,一併補上。
    act(() => { fireEvent.mouseEnter(laneEl); });

    // 下一輪回傳順序反轉的資料
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          { lane: 'manual', cards: [makeCard({ story_id: 'card-b', seq: 2 }), makeCard({ story_id: 'card-a', seq: 1 })] },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect((api.fetchRoadmap as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);

    // hover 期間 DOM 順序不變（仍是 card-a, card-b）
    const manualLane = document.querySelector<HTMLElement>('.dvc-plan-lane[data-lane="manual"]')!;
    let ids = within(manualLane).getAllByRole('link').map((el) => el.textContent);
    expect(ids[0]).toContain('card-a');

    act(() => { fireEvent.mouseLeave(laneEl); });
    ids = within(manualLane).getAllByRole('link').map((el) => el.textContent);
    expect(ids[0]).toContain('card-b');
  });

  // [tdb-1 CR F4] BR052 原測試只在容器層 fireEvent.mouseLeave（relatedTarget 預設 null）,
  // 測不到真實瀏覽器裡「卡片 A → 卡片 B」的移動：mouseenter/mouseleave 不冒泡,監聽以 capture
  // 掛在容器上會收到卡片層事件,故離開卡片 A 即觸發 mouseleave → 修復前會立即套用 pending 資料,
  // 游標仍在欄內卻發生重排（正是 BR052 要防的抖動）。以 relatedTarget 仍在容器內為判準。
  it('F4_HoverBetweenCards_DoesNotResumeReorder: 卡片間移動（relatedTarget 仍在容器內）不得套用新資料', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          { lane: 'manual', cards: [makeCard({ story_id: 'card-a', seq: 1 }), makeCard({ story_id: 'card-b', seq: 2 })] },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    renderRoadmap();
    await screen.findByText('card-a');

    const laneEl = document.getElementById('dvc-plan-lanes')!;
    // [bwu-12] act() 包 mouseEnter — 見 BR052 案例同一修復的完整理由註解。
    act(() => { fireEvent.mouseEnter(laneEl); });

    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          { lane: 'manual', cards: [makeCard({ story_id: 'card-b', seq: 2 }), makeCard({ story_id: 'card-a', seq: 1 })] },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });

    const manualLane = document.querySelector<HTMLElement>('.dvc-plan-lane[data-lane="manual"]')!;
    const cardBEl = within(manualLane).getAllByRole('link')[1];

    // 模擬「離開卡片 A、進入卡片 B」——relatedTarget 仍在 #dvc-plan-lanes 內
    act(() => { fireEvent.mouseLeave(laneEl, { relatedTarget: cardBEl }); });
    let ids = within(manualLane).getAllByRole('link').map((el) => el.textContent);
    expect(ids[0], '游標仍在欄內時不得重排').toContain('card-a');

    // 真正移出容器（relatedTarget 在容器外）才恢復
    act(() => { fireEvent.mouseLeave(laneEl, { relatedTarget: document.body }); });
    ids = within(manualLane).getAllByRole('link').map((el) => el.textContent);
    expect(ids[0], '真正離開後應套用暫存結果').toContain('card-b');
  });

  // [tdb-1 CR F7] deps_raw 原本只存在於 API payload,頁面從不渲染 → resolver 表達力不足時零信號。
  it('F7_DepsRawWarning_IsRenderedAsText: deps_raw 非 null 時以文字告警呈現（色彩非唯一載體,對齊 AC10）', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({
        lanes: [
          { lane: 'manual', cards: [makeCard({ story_id: 'card-unparsed', deps_raw: '等待某個沒有卡號的外部條件' })] },
          { lane: 'dispatch', cards: [] },
          { lane: 'reconcile', cards: [] },
        ],
      }),
    );
    renderRoadmap();
    expect(await screen.findByText(/依賴未解析/)).toBeInTheDocument();
    expect(screen.getByText(/等待某個沒有卡號的外部條件/)).toBeInTheDocument();
  });

  it('F7_DepsRawWarning_AbsentWhenNull: deps_raw 為 null 時不顯示告警（避免恆真斷言）', async () => {
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult());
    renderRoadmap();
    await screen.findByText('bwu-3-dev-consume-review-audit');
    expect(screen.queryByText(/依賴未解析/)).toBeNull();
  });

  it('BR055_RoadmapLane_WithThirtyFiveCards_ScrollsWithinColumn: 35 卡全渲染於單一 lane + 欄內捲動 CSS 生效（非 kanban 320px 固定值）', async () => {
    const cards = Array.from({ length: 35 }, (_, i) => makeCard({ story_id: `s-${i}`, seq: i + 1 }));
    (api.fetchRoadmap as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResult({ lanes: [{ lane: 'manual', cards }, { lane: 'dispatch', cards: [] }, { lane: 'reconcile', cards: [] }] }),
    );
    renderRoadmap();
    await screen.findByText('s-0');
    const cardsEl = document.querySelector('.dvc-plan-lane__cards')!;
    // jsdom 不做真實 layout（scrollHeight/clientHeight 恆回 0，見 testing-library FAQ），
    // 故欄內捲動改靜態驗證 roadmap.css 規則本身（overflow-y:auto + 自算 max-height，非固定 320px）。
    expect(cardsEl.children.length).toBe(35);
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'roadmap.css'), 'utf8');
    const block = css.match(/\.dvc-plan-lane__cards\s*\{[^}]*\}/)![0];
    expect(block).toContain('overflow-y: auto');
    // 實際宣告用自算 calc() 而非 kanban.css 的固定 max-height: 320px；註解本身提及
    // 320px 屬正常對照說明，故驗證改抓「有無 `max-height: 320px` 這個具體宣告」而非裸子字串比對。
    expect(block).not.toMatch(/max-height:\s*320px/);
    expect(block).toContain('max-height: calc(');
  });
});

describe('BR044_NavItems_RoadmapEntryHasEndKey', () => {
  it('Layout.tsx NAV_ITEMS 的 /roadmap 項具 to/label/icon/end 四鍵且 end===false', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'Layout.tsx'), 'utf8');
    const m = src.match(/\{ to: '\/roadmap', label: t\.nav\.roadmap, icon: '[^']+', end: (true|false) \}/);
    expect(m, 'NAV_ITEMS must contain a /roadmap entry with explicit end key').not.toBeNull();
    expect(m![1]).toBe('false');
  });
});

describe('BR045_I18n_EnLocale_HasRoadmapNavKey', () => {
  it('en.ts 與 zh-TW.ts 皆含 nav.roadmap', async () => {
    const zhTW = (await import('../../i18n/zh-TW')).default;
    const en = (await import('../../i18n/en')).default;
    expect(zhTW.nav.roadmap).toBe('推進地圖');
    expect(en.nav.roadmap).toBe('Roadmap');
  });
});

describe('BR046_RoadmapCss_ZeroRawHexAndZeroNewTokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'roadmap.css'), 'utf8');

  it('裸 hex 命中為 0', () => {
    const hits = css.match(/#[0-9a-fA-F]{3,8}/g) || [];
    expect(hits).toEqual([]);
  });

  it('未新增 --dvc-* 變數定義（只讀取既有 token）', () => {
    const defs = css.match(/^\s*--dvc-[a-z0-9-]+\s*:/gm) || [];
    expect(defs).toEqual([]);
  });
});

describe('BR047_RoadmapCard_P0LeftBorderIsStatusError', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'roadmap.css'), 'utf8');

  it('roadmap.css 對 .dvc-plan-card--p0 宣告 3px solid + var(--dvc-status-error)', () => {
    const block = css.match(/\.dvc-plan-card--p0\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('3px solid var(--dvc-status-error)');
  });

  // [tdb-1 CR F1] 上面那條只驗「宣告存在」,無法偵測 cascade 覆蓋 —— 而 AC9 要求的是 **computed**
  // border-left 色值解析為 --dvc-status-error。gate 規則用 `border-color` 簡寫（含 border-left-color）,
  // 與 --p0 同為單一 class 特異度 (0,1,0),故由後出現者決勝。dev-story 交付版本 --p0 排在 gate 之前,
  // computed 實際取到 gate 色（indigo/ok/slate/warning）,P0 紅緣完全消失,而本檔原測試照樣綠燈。
  // jsdom 不做真實 CSS cascade（getComputedStyle 讀不到外部樣式表）,故以「原始碼順序」為等價判準。
  it('F1_P0Rule_MustComeAfterGateRules: --p0 區塊必須排在 --gate-* 之後,否則紅緣被 border-color 靜默覆蓋', () => {
    const p0Idx = css.indexOf('.dvc-plan-card--p0');
    const gateIdxs = ['inflight', 'unlocked', 'waiting-external', 'blocked', 'paused']
      .map((g) => css.indexOf(`.dvc-plan-card--gate-${g}`));

    expect(p0Idx).toBeGreaterThan(-1);
    for (const gi of gateIdxs) expect(gi).toBeGreaterThan(-1);
    // 同特異度下「後出現者勝」→ --p0 必須大於所有 gate 規則的位移
    expect(p0Idx).toBeGreaterThan(Math.max(...gateIdxs));
  });

  it('F1_GateRules_UseBorderColorShorthand: 確認前提成立（gate 用 border-color 而非 border-top-color 等長寫）', () => {
    const gateBlock = css.slice(css.indexOf('.dvc-plan-card--gate-inflight'), css.indexOf('.dvc-plan-card--gate-paused') + 120);
    expect(gateBlock).toContain('border-color:');
  });
});

describe('BR048_RoadmapLanes_ThreeEqualColumnsAndReusedBadges', () => {
  it('容器宣告三等分 grid-template-columns', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'roadmap.css'), 'utf8');
    const block = css.match(/\.dvc-plan-lanes\s*\{[^}]*\}/);
    expect(block![0]).toContain('repeat(3, 1fr)');
  });

  it('Roadmap.tsx 徽章複用既有 .dvc-badge-priority-* / .dvc-badge-complexity-*', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Roadmap.tsx'), 'utf8');
    expect(src).toContain('dvc-badge-priority-');
    expect(src).toContain('dvc-badge-complexity-');
  });
});

describe('AC12: 禁 dangerouslySetInnerHTML', () => {
  it('Roadmap.tsx 命中數為 0', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Roadmap.tsx'), 'utf8');
    expect((src.match(/dangerouslySetInnerHTML/g) || []).length).toBe(0);
  });
});
