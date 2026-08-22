// ============================================================
// Workers.test.tsx — 路由 / Tabs a11y / 頁首 / 輪詢生命週期（whp-10-devconsole-ui）
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Layout from '../../components/Layout';
import { I18nProvider } from '../../i18n/I18nProvider';
import Workers from '../Workers';
import type { LiveBoard, WorkerRunView } from '../../types/workers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// react-chartjs-2 於 jsdom 無 canvas 2D context / ResizeObserver，沿用既有
// charts/__tests__/charts.test.tsx 範式以 div stub 取代，避免 Chart.js resize crash。
vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data?: unknown }) => React.createElement('div', { 'data-testid': 'chart-bar', 'data-chart-data': JSON.stringify(props.data) }),
  Line: (props: { data?: unknown }) => React.createElement('div', { 'data-testid': 'chart-line', 'data-chart-data': JSON.stringify(props.data) }),
  Pie: (props: { data?: unknown }) => React.createElement('div', { 'data-testid': 'chart-pie', 'data-chart-data': JSON.stringify(props.data) }),
}));
vi.mock('../../utils/chartConfig.js', () => ({}));

vi.mock('../../services/workersApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
  return {
    ...actual,
    fetchLiveBoard: vi.fn(),
    listWorkerRuns: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1 }),
    fetchWorkerRunDetail: vi.fn().mockResolvedValue({
      run: {
        run_id: 'r-detail', session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
        attempt: 1, controller_track: 'backend', run_mode: 'window', wrapper_pid: 1, claude_pid: null,
        cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null, effort: null, work_root: null,
        baseline_commit: null, lifecycle: 'running', close_source: null, last_status: null, evidence_incomplete: 0,
        turn_count: 0, files_modified: null, health_flag: null, stall_rounds: 0, reported_at: null, ack_at: null,
        ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null, abandoned_at_stage: null,
        requires_attention: 0, guardian_exit_reason: null, started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null,
        closed_at: null, closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
      },
      messages: [],
      handoff: null,
    }),
    ackWorkerRun: vi.fn(),
    addWorkerMessage: vi.fn(),
    gateWorkerRun: vi.fn(),
    closeWorkerRun: vi.fn(),
    reapWorkerRuns: vi.fn(),
    ackAttention: vi.fn(),
  };
});

function makeBoard(overrides: Partial<LiveBoard> = {}): LiveBoard {
  return {
    guardian: { present: false },
    kpi: { running: 0, pendingAck: 0, pendingReview: 0, pendingClose: 0 },
    running: [],
    queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
    ...overrides,
  };
}

async function getWorkersApi() {
  return (await import('../../services/workersApi.js')) as unknown as {
    fetchLiveBoard: ReturnType<typeof vi.fn>;
  };
}

function renderWorkers(initialEntry = '/workers') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:runId" element={<Workers />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Workers 頁面 — 路由 + 導覽掛載（AC1）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR001: App.tsx 已註冊 /workers 與 /workers/:runId 兩條 Route（同一元件）', () => {
    // App.tsx 內建自有 BrowserRouter（非 injectable），無法安全巢狀 MemoryRouter 測試導航；
    // 對齊既有慣例（StoryDetail.test.tsx 等）改直接渲染頁面元件本身驗證行為，
    // 本案例靜態驗證路由確實已掛載於 App.tsx。
    const src = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf-8');
    expect(src).toMatch(/<Route path="workers" element=\{<Workers \/>\}/);
    expect(src).toMatch(/<Route path="workers\/:runId" element=\{<Workers \/>\}/);
  });

  it('BR001: 渲染 Workers 頁面元件本身，主體元素存在於 DOM', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    renderWorkers();
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3));
  });

  it('BR002: NAV_ITEMS 長度為 20（tdb-1 append 🗺️ 推進地圖後由 19→20），側邊導覽可見「Pipeline 工作台」連結', () => {
    render(
      <MemoryRouter initialEntries={['/workers']}>
        <I18nProvider>
          <Layout />
        </I18nProvider>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Pipeline 工作台/ });
    expect(link).toBeInTheDocument();
    const navLinks = screen.getAllByRole('link');
    expect(navLinks.length).toBe(20);
  });

  it('BR003: 以帶 runId 的 URL 渲染時，工作台主體與抽屜（role=dialog）同時存在於 DOM', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    renderWorkers('/workers/11111111-2222-3333-4444-555555555555');

    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('BR003: 點抽屜關閉鈕後 URL 變為 /workers，DOM 中不再有 role=dialog', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    renderWorkers('/workers/11111111-2222-3333-4444-555555555555');

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '關閉抽屜' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Workers 頁首常駐（AC2）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR007: KPI 四卡直接取 kpi 物件；queues 清空後 kpi 不變則四卡仍相同', async () => {
    const api = await getWorkersApi();
    const board = makeBoard({
      guardian: { present: true, stale: true, guardianPid: 1, host: 'h', startedAt: null, lastBeatAt: new Date(Date.now() - 180_000).toISOString(), fastTickSec: 30, slowTickSec: 600, watchedRuns: 3, lastError: null },
      kpi: { running: 2, pendingAck: 1, pendingReview: 1, pendingClose: 1 },
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
    });
    api.fetchLiveBoard.mockResolvedValue(board);
    renderWorkers();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3);
  });

  it('BR005: guardian stale 時同時含警示圖示、明文「心跳逾時」、class 含 is-stale', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      guardian: { present: true, stale: true, guardianPid: 1, host: 'h', startedAt: null, lastBeatAt: new Date(Date.now() - 180_000).toISOString(), fastTickSec: 30, slowTickSec: 600, watchedRuns: 3, lastError: null },
    }));
    renderWorkers();

    await waitFor(() => expect(document.querySelector('.workers-guardian-bar')?.textContent).toContain('心跳逾時'));
    const bar = document.querySelector('.workers-guardian-bar');
    expect(bar?.className).toContain('is-stale');
    expect(bar?.textContent).toMatch(/⚠️/);
  });

  it('BR006: 心跳顯示「3 分鐘前」且節點 title 以 2026/ 開頭', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      guardian: { present: true, stale: false, guardianPid: 1, host: 'h', startedAt: null, lastBeatAt: new Date(Date.now() - 180_000).toISOString(), fastTickSec: 30, slowTickSec: 600, watchedRuns: 3, lastError: null },
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('3 分鐘前')).toBeInTheDocument());
    expect(screen.getByText('3 分鐘前').title).toMatch(/^2026\//);
  });

  it('BR004: guardian present:false 時顯示「守護未登記」，不含 undefined', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    renderWorkers();

    await waitFor(() => expect(screen.getByText('守護未登記')).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('BR008: 需注意徽章取 queues.attention.length；切分頁後仍在 DOM', async () => {
    const api = await getWorkersApi();
    const run: WorkerRunView = {
      run_id: 'r1', session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
      attempt: 1, controller_track: 'backend', run_mode: 'window', wrapper_pid: 1, claude_pid: null,
      cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null, effort: null, work_root: null,
      baseline_commit: null, lifecycle: 'abandoned', close_source: null, last_status: null, evidence_incomplete: 0,
      turn_count: 0, files_modified: null, health_flag: null, stall_rounds: 0, reported_at: null, ack_at: null,
      ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null, abandoned_at_stage: 'running',
      requires_attention: 1, guardian_exit_reason: null, started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null,
      closed_at: null, closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
      executionOwner: 'none', closable: false,
    };
    api.fetchLiveBoard.mockResolvedValue(makeBoard({ queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [run, run, run] } }));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: '歷程' }));
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '稽核' }));
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('WAI-ARIA APG Tabs（AC3 / BR-050）', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
  });

  it('3 個 tab，aria-selected=true 恰 1 個且預設為現場', async () => {
    renderWorkers();
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3));
    const tabs = screen.getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected.length).toBe(1);
    expect(selected[0]).toHaveTextContent('現場');
  });

  it('每個 tab 的 aria-controls 對得上一個 tabpanel id；tabpanel aria-labelledby 指回 tab id', async () => {
    renderWorkers();
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3));
    const liveTab = screen.getByRole('tab', { name: '現場' });
    const panelId = liveTab.getAttribute('aria-controls');
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-labelledby')).toBe(liveTab.id);
  });

  it('tablist 具 aria-label', async () => {
    renderWorkers();
    await waitFor(() => expect(screen.getByRole('tablist')).toHaveAttribute('aria-label'));
  });

  it('ArrowRight 環繞切換；ArrowLeft 反向；Home/End 跳頭尾', async () => {
    renderWorkers();
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBe(3));
    const [live, history, audit] = screen.getAllByRole('tab');

    fireEvent.keyDown(live!, { key: 'ArrowRight' });
    expect(history).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(audit!, { key: 'ArrowRight' });
    expect(live).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(live!, { key: 'ArrowLeft' });
    expect(audit).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(audit!, { key: 'Home' });
    expect(live).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(live!, { key: 'End' });
    expect(audit).toHaveAttribute('aria-selected', 'true');
  });
});

describe('輪詢生命週期（AC17 / BR-041/042/044）', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('自動開啟時每 10 秒輪詢一次，30 秒內 +3 次', async () => {
    const api = await getWorkersApi();
    renderWorkers();
    await vi.waitFor(() => expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.fetchLiveBoard).toHaveBeenCalledTimes(4); // 1 初次 + 3
  });

  it('關閉自動後不再輪詢', async () => {
    const api = await getWorkersApi();
    renderWorkers();
    await vi.waitFor(() => expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('checkbox'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1);
  });

  it('切到分頁 B 後不再輪詢', async () => {
    const api = await getWorkersApi();
    renderWorkers();
    await vi.waitFor(() => expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: '歷程' }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1);
  });

  it('grep POLL_MS 具名常數（10000）存在於 Workers.tsx', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../Workers.tsx'), 'utf-8');
    expect((src.match(/10000/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((src.match(/clearInterval/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('單次輪詢失敗時保留上一次成功資料並顯示錯誤列', async () => {
    const api = await getWorkersApi();
    api.fetchLiveBoard.mockResolvedValueOnce(makeBoard({ kpi: { running: 5, pendingAck: 0, pendingReview: 0, pendingClose: 0 } }));
    renderWorkers();
    await vi.waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());

    api.fetchLiveBoard.mockRejectedValueOnce(new Error('network down'));
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument(); // 上次資料仍在
  });
});

describe('WorkersCss 硬編碼防護（BR-052）', () => {
  it('workers.css 無 hardcoded hex', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../styles/workers.css'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
