// ============================================================
// Workers.charts.test.tsx — 分頁 B 歷程：篩選 / 分頁 / 四圖 shape + closed_at only（AC12）
// whp-10-devconsole-ui
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Workers from '../Workers';
import type { LiveBoard, WorkerRunListResult } from '../../types/workers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data?: { datasets?: unknown[] } }) => React.createElement('canvas', { 'data-testid': 'chart-bar', 'data-dataset-count': props.data?.datasets?.length ?? 0 }),
  Line: (props: { data?: { datasets?: unknown[] } }) => React.createElement('canvas', { 'data-testid': 'chart-line', 'data-dataset-count': props.data?.datasets?.length ?? 0 }),
  Pie: (props: { data?: { datasets?: unknown[] } }) => React.createElement('canvas', { 'data-testid': 'chart-pie', 'data-dataset-count': props.data?.datasets?.length ?? 0 }),
}));
vi.mock('../../utils/chartConfig.js', () => ({}));

vi.mock('../../services/workersApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
  return {
    ...actual,
    fetchLiveBoard: vi.fn(),
    listWorkerRuns: vi.fn(),
    fetchWorkerRunDetail: vi.fn(),
    ackWorkerRun: vi.fn(),
    addWorkerMessage: vi.fn(),
    gateWorkerRun: vi.fn(),
    closeWorkerRun: vi.fn(),
    reapWorkerRuns: vi.fn(),
    ackAttention: vi.fn(),
  };
});

async function getApi() {
  return (await import('../../services/workersApi.js')) as unknown as {
    fetchLiveBoard: ReturnType<typeof vi.fn>;
    listWorkerRuns: ReturnType<typeof vi.fn>;
  };
}

function makeBoard(): LiveBoard {
  return {
    guardian: { present: false },
    kpi: { running: 0, pendingAck: 0, pendingReview: 0, pendingClose: 0 },
    running: [],
    queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: `run-${Math.random()}`, session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
    attempt: 1, controller_track: 'backend', run_mode: 'window', wrapper_pid: 1, claude_pid: null,
    cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null, effort: null, work_root: null,
    baseline_commit: null, lifecycle: 'closed', close_source: 'UserClosed', last_status: null, evidence_incomplete: 0,
    turn_count: 0, files_modified: null, health_flag: null, stall_rounds: 0, reported_at: null, ack_at: null,
    ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null, abandoned_at_stage: null,
    requires_attention: 0, guardian_exit_reason: null, started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null,
    closed_at: '2026-07-28T01:00:00+08:00', closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
    ...overrides,
  };
}

function renderWorkersOnHistoryTab() {
  render(
    <MemoryRouter initialEntries={['/workers']}>
      <Routes>
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:runId" element={<Workers />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: '歷程' }));
}

describe('分頁 B 歷程 — 篩選 + 分頁 + 四張圖（AC12）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR025: 設定 lifecycle+track 篩選 → listWorkerRuns 收到白名單參數（workersApi.listWorkerRuns 內部再組 URL query，見 workers-route.test.ts 後端轉發驗證）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: Array.from({ length: 20 }, () => makeRunRow()), total: 137, page: 1 });
    renderWorkersOnHistoryTab();

    await waitFor(() => expect(api.listWorkerRuns).toHaveBeenCalled());
    api.listWorkerRuns.mockClear();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0]!, { target: { value: 'closed' } }); // lifecycle select
    const trackInput = screen.getByPlaceholderText('track');
    fireEvent.change(trackInput, { target: { value: 'backend' } });
    fireEvent.click(screen.getByText('查詢'));

    await waitFor(() => expect(api.listWorkerRuns).toHaveBeenCalledTimes(1));
    const call = api.listWorkerRuns.mock.calls[0][0];
    expect(call.lifecycle).toBe('closed');
    expect(call.track).toBe('backend');
  });

  it('BR025: listWorkerRuns 白名單 query 建構本身只送 workerRunService.ts:154-162 定義的欄位（實測 URL）', async () => {
    const { listWorkerRuns } = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 1 }),
    } as Response);

    await listWorkerRuns({ lifecycle: 'closed', track: 'backend', notWhitelisted: 'evil' } as never);

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('lifecycle=closed');
    expect(url).toContain('track=backend');
    expect(url).not.toContain('notWhitelisted');
    expect(url).not.toContain('evil');
    fetchSpy.mockRestore();
  });

  it('BR026: total=137 顯示「1–20 / 共 137 筆」；total=0 顯示查無資料且無 Pagination 控制項', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: Array.from({ length: 20 }, () => makeRunRow()), total: 137, page: 1 });
    renderWorkersOnHistoryTab();

    await waitFor(() => expect(screen.getByText('1–20 / 共 137 筆')).toBeInTheDocument());

    const empty: WorkerRunListResult = { items: [], total: 0, page: 1 };
    api.listWorkerRuns.mockResolvedValue(empty);
    fireEvent.click(screen.getByText('查詢'));

    await waitFor(() => expect(screen.getByText('查無符合條件的派發紀錄')).toBeInTheDocument());
    expect(screen.queryByLabelText('上一頁')).toBeNull();
  });

  it('BR027: 四個 chart 元件皆渲染，各自 data.datasets 長度 ≥1', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: Array.from({ length: 20 }, () => makeRunRow()), total: 20, page: 1 });
    renderWorkersOnHistoryTab();

    await waitFor(() => expect(screen.getAllByTestId(/chart-/).length).toBe(4));
    for (const el of screen.getAllByTestId(/chart-/)) {
      expect(Number(el.getAttribute('data-dataset-count'))).toBeGreaterThanOrEqual(1);
    }
  });

  it('BR028: closed_at 為 null 但 closed_detected_at 有值的列不計入平均時長樣本', async () => {
    const { aggregateAvgDurationByPhase } = await import('../../lib/workerCharts.js');
    const rows = [
      makeRunRow({ phase: 'dev-story', closed_at: null, closed_detected_at: '2026-07-28T01:00:00+08:00' }),
    ];
    const result = aggregateAvgDurationByPhase(rows as never);
    expect(result.find((r) => r.phase === 'dev-story')).toBeUndefined();
  });

  it('圖表計算檔 workerCharts.ts 不含 closed_detected_at', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../lib/workerCharts.ts'), 'utf-8');
    expect((src.match(/closed_detected_at/g) ?? []).length).toBe(0);
  });

  it('BR029: 四張圖上方含「基於當前查詢結果」字樣；route 數未因圖表再增（恰 9）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: [makeRunRow()], total: 1, page: 1 });
    renderWorkersOnHistoryTab();

    await waitFor(() => expect(screen.getByText('基於當前查詢結果')).toBeInTheDocument());

    const routeSrc = fs.readFileSync(path.resolve(__dirname, '../../../server/routes/workers.ts'), 'utf-8');
    const matches = routeSrc.match(/router\.(get|post)\(/g) ?? [];
    expect(matches.length).toBe(9);
  });

  it('?page=abc 落回預設值場景（後端回 {items:[],total:0,page:1}）前端不另行報錯', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: [], total: 0, page: 1 });
    renderWorkersOnHistoryTab();

    await waitFor(() => expect(screen.getByText('查無符合條件的派發紀錄')).toBeInTheDocument());
    expect(document.querySelector('.worker-queue-warning')).toBeNull();
  });
});
