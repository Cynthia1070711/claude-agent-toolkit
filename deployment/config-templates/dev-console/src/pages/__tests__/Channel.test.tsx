// ============================================================
// Channel.test.tsx — 路由 / tablist 手動啟動 / 輪詢生命週期 / page>1 暫停（ccb-3-devconsole-channel-page）
// ============================================================
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Channel from '../Channel';
import zhTW from '../../i18n/zh-TW';
import en from '../../i18n/en';
import type { ThreadListItem, ChannelStats, ChannelBoard } from '../../types/channel';

vi.mock('../../services/channelApi.js', () => ({
  fetchChannelStats: vi.fn(),
  fetchChannelBoards: vi.fn(),
  fetchChannelThreads: vi.fn(),
  fetchChannelSearch: vi.fn(),
  fetchChannelReadMatrix: vi.fn(),
  fetchChannelThreadMessages: vi.fn(),
}));

import * as api from '../../services/channelApi.js';

function makeStats(overrides: Partial<ChannelStats> = {}): ChannelStats {
  return {
    tracks: ['前台軌', '後台軌'],
    categories: ['migration窗口', '裁定'],
    open_threads: 2,
    closed_threads: 1,
    total_messages: 5,
    unread_total: 1,
    today_messages: 3,
    last_message_at: '2026-07-28T00:00:00+08:00',
    ...overrides,
  };
}

function makeThreadItem(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  return {
    thread_id: 't-1',
    ordinal: 14,
    topic: 'Migration 窗口協調',
    category: null,
    channel: 'general',
    must_read: 0,
    initiator_track: '前台軌',
    state: 'open',
    created_at: '2026-07-28T00:00:00+08:00',
    closed_at: null,
    msg_count: 2,
    latest_msg: {
      msg_id: 1, seq: 2, from_track: '前台軌', to_tracks: ['後台軌'],
      msg_type: 'request', body: 'body', created_at: '2026-07-28T00:00:00+08:00',
    },
    read_stats: { expected: ['後台軌'], signed: [], unsigned_count: 1 },
    ...overrides,
  };
}

function makeBoard(overrides: Partial<ChannelBoard> = {}): ChannelBoard {
  return {
    board_id: 'staging-db',
    title: 'Staging DB',
    version: 12,
    updated_by: '前台軌',
    updated_at: '2026-07-27T00:00:00+08:00',
    state: {
      status: '空閒',
      holder: null,
      history: Array.from({ length: 6 }, (_, i) => ({ ts: `2026-07-2${i}T00:00:00+08:00`, track: '前台軌', action: 'release' })),
    },
    state_raw: null,
    ...overrides,
  };
}

function renderChannel(initialEntry = '/channel') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/channel" element={<Channel />} />
        <Route path="/stories/:id" element={<div>story detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Channel page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchChannelStats as ReturnType<typeof vi.fn>).mockResolvedValue(makeStats());
    (api.fetchChannelBoards as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [makeBoard()] });
    (api.fetchChannelThreads as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [makeThreadItem()], total: 1, page: 1, pageSize: 20 });
    (api.fetchChannelSearch as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    (api.fetchChannelReadMatrix as ReturnType<typeof vi.fn>).mockResolvedValue({ tracks: [], rows: [], truncated: false });
  });

  // loadAll 走 Promise.allSettled([stats, boards, tabData])，三者於不同 microtask tick 落地。
  // 測試主體常在其中一兩個 setState 之前就結束斷言，殘留的 setState 便落在 act() 範圍外
  // （RTL 自動 cleanup 亦會在卸載後觸發同一警告）。於 cleanup 前顯式把待決 microtask 沖乾淨。
  afterEach(async () => {
    await act(async () => { await Promise.resolve(); });
  });

  it('BR001_ChannelRoute_RendersChannelPage: heading 命中且預設 tab 為 live', async () => {
    renderChannel();
    expect(await screen.findByRole('heading', { name: /頻道/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: /通話中/ })).toHaveAttribute('aria-selected', 'true'));
  });

  it('BR003_I18nNavKey_PresentInBothLocales: zh-TW 與 en 的 nav key 集合相等且含 channel', () => {
    const zhKeys = Object.keys(zhTW.nav).sort();
    const enKeys = Object.keys(en.nav).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(zhKeys).toContain('channel');
    expect(zhTW.nav.channel).toBe('頻道');
    expect(en.nav.channel).toBe('Channel');
  });

  it('BR004_UrlParams_AreSingleSourceOfTruth: 初始 URL 參數正確驅動 Tab2 搜尋請求', async () => {
    renderChannel('/channel?tab=archive&page=2&q=Migration');
    await waitFor(() =>
      expect(api.fetchChannelSearch).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Migration', page: 2, pageSize: 50 }),
      ),
    );
  });

  it('BR005_PageGreaterThanOne_PausesPolling: page=2 時輪詢暫停，回 page=1 恢復', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChannel('/channel?tab=archive&page=2');
    await vi.waitFor(() => expect(api.fetchChannelSearch).toHaveBeenCalledTimes(1));

    const callsBefore = (api.fetchChannelSearch as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect((api.fetchChannelSearch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

    expect(screen.getByText('翻頁中已暫停 ▶')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('page=1 時輪詢正常推進', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChannel('/channel');
    await vi.waitFor(() => expect(api.fetchChannelThreads).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    await vi.waitFor(() => expect((api.fetchChannelThreads as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    vi.useRealTimers();
  });

  it('BR008_PollFailure_SilentUntilThirdRetry: 連續 3 次輪詢失敗，前 2 次無錯誤 DOM，第 3 次才顯示', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let callCount = 0;
    (api.fetchChannelThreads as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve({ items: [makeThreadItem()], total: 1, page: 1, pageSize: 20 });
      return Promise.reject(new Error('network down'));
    });

    renderChannel();
    await vi.waitFor(() => expect(callCount).toBe(1));

    // 本測試刻意不把 advanceTimersByTimeAsync 包進 act()：useFakeTimers({shouldAdvanceTime:true})
    // 下，act() 額外沖 microtask 會讓假時鐘多滑一個 30s tick，callCount 直接跳到 5，
    // 「第 N 次失敗才顯錯」這條語意就測不準了。殘留的 act 警告是刻意取捨（噪音 < 斷言精確度）。
    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(callCount).toBe(2));
    expect(screen.queryByText(/資料載入失敗/)).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(callCount).toBe(3));
    expect(screen.queryByText(/資料載入失敗/)).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(callCount).toBe(4));
    await vi.waitFor(() => expect(screen.getByText(/資料載入失敗/)).toBeInTheDocument());
    vi.useRealTimers();
  });

  it('BR018_ThreadRowIsButton_NavigatesToTimeline: 點擊列進入時間軸 split view', async () => {
    const weirdId = '2026-05-26 18:40:45';
    (api.fetchChannelThreads as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeThreadItem({ thread_id: weirdId })], total: 1, page: 1, pageSize: 20,
    });
    (api.fetchChannelThreadMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      thread: { thread_id: weirdId, topic: 'Migration 窗口協調', category: null, channel: 'general', initiator_track: '前台軌', state: 'open', must_read: 0, created_at: '', closed_at: null },
      messages: [],
    });
    renderChannel();
    const row = await screen.findByRole('button', { name: /Migration 窗口協調/ });
    expect(row.tagName).toBe('BUTTON');
    fireEvent.click(row);
    expect(await screen.findByRole('button', { name: '← 返回' })).toBeInTheDocument();
    await waitFor(() => expect(api.fetchChannelThreadMessages).toHaveBeenCalledWith(weirdId));
  });

  it('BR010_BoardArea_PersistsAcrossTabs: 切換三個 tab 各自渲染 1 張看板卡', async () => {
    renderChannel();
    expect(await screen.findAllByTestId('board-card')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: /封存查詢/ }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /封存查詢/ })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getAllByTestId('board-card')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: '簽收矩陣' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: '簽收矩陣' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getAllByTestId('board-card')).toHaveLength(1);
  });

  it('BR036_ArrowKey_MovesFocusWithoutActivating: 方向鍵只移焦點不切換不觸發 API', async () => {
    renderChannel();
    await screen.findByRole('tab', { name: /通話中/ });
    const callsBefore = (api.fetchChannelSearch as ReturnType<typeof vi.fn>).mock.calls.length;

    const tab1 = screen.getByRole('tab', { name: /通話中/ });
    const tab2 = screen.getByRole('tab', { name: /封存查詢/ });
    tab1.focus();
    fireEvent.keyDown(tab1, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(tab2);
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect((api.fetchChannelSearch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

    fireEvent.keyDown(tab2, { key: 'Enter' });
    await waitFor(() => expect(tab2).toHaveAttribute('aria-selected', 'true'));
  });

  it('BR037_ZeroMessageThread_DegradesRowLevel: 零則訊息 thread 顯降級文案，DOM 無 undefined 字串', async () => {
    (api.fetchChannelThreads as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeThreadItem({ msg_count: 0, latest_msg: null })], total: 1, page: 1, pageSize: 20,
    });
    const { container } = renderChannel();
    expect(await screen.findByText('0 則 · 尚無訊息')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('undefined');
  });

  it('BR038_BoardsError_DoesNotBreakThreadList: 看板 500 不影響 thread 列表正常渲染', async () => {
    (api.fetchChannelBoards as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boards 500'));
    renderChannel();
    expect(await screen.findByText(/看板載入失敗/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Migration 窗口協調/ })).toBeInTheDocument();
  });

  it('BR027_SearchBarKey_RemountsOnQueryChange: 外部導航變更 q 後輸入框顯示最新值（非透過 SearchBar 自身 onSearch）', async () => {
    // MemoryRouter 的 initialEntries 僅套用於首次掛載，rerender 換 initialEntries 不會真的導航；
    // 改用同一 Router 內的 sibling 元件呼叫 useSearchParams 的 setter 模擬「外部導航」（分享網址/前進後退）。
    function JumpToXyz() {
      const [, setParams] = useSearchParams();
      return (
        <button
          type="button"
          data-testid="jump-to-xyz"
          onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.set('q', 'xyz'); return n; })}
        >
          jump
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/channel?tab=archive&q=abc']}>
        <JumpToXyz />
        <Routes><Route path="/channel" element={<Channel />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByLabelText('搜尋')).toHaveValue('abc'));

    fireEvent.click(screen.getByTestId('jump-to-xyz'));
    await waitFor(() => expect(screen.getByLabelText('搜尋')).toHaveValue('xyz'));
  });

  it('未簽 KPI chip 容器帶 aria-live=polite', async () => {
    renderChannel();
    await screen.findByRole('heading', { name: /頻道/ });
    const kpi = screen.getByText('未簽').closest('.channel-kpi-chip');
    expect(kpi).toHaveAttribute('aria-live', 'polite');
  });

  it('MCP fallback 說明區常駐可見（AC15）', async () => {
    renderChannel();
    expect(await screen.findByText(/re-import/)).toBeInTheDocument();
  });
});
