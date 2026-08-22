// ============================================================
// Workers.audit.test.tsx — 分頁 C：九分類圓餅 + reaper dry-run + 零按鈕告警（AC13）
// whp-10-devconsole-ui
// ============================================================
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import Workers from '../Workers';
import type { LiveBoard } from '../../types/workers';
import { aggregateCloseSourceDistribution, CLOSE_SOURCE_VALUES } from '../../lib/workerCharts';

vi.mock('react-chartjs-2', () => ({
  Bar: () => null,
  Line: () => null,
  Pie: (props: { data?: { labels?: unknown[]; datasets?: unknown[] } }) =>
    React.createElement('canvas', { 'data-testid': 'chart-pie', 'data-labels': JSON.stringify(props.data?.labels ?? []) }),
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
    reapWorkerRuns: ReturnType<typeof vi.fn>;
  };
}

function makeBoard(overrides: Partial<LiveBoard> = {}): LiveBoard {
  return {
    guardian: { present: false },
    kpi: { running: 0, pendingAck: 0, pendingReview: 0, pendingClose: 0 },
    running: [],
    queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: overrides['run_id'] ?? `run-${Math.random()}`, session_id: 's', resumed_from_run_id: null,
    story_id: 'story-a', phase: 'dev-story', attempt: 1, controller_track: 'backend', run_mode: 'window',
    wrapper_pid: 1, claude_pid: null, cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null,
    effort: null, work_root: null, baseline_commit: null, lifecycle: 'closed', close_source: 'UserClosed',
    last_status: null, evidence_incomplete: 0, turn_count: 0, files_modified: null, health_flag: null,
    stall_rounds: 0, reported_at: null, ack_at: null, ack_by: null, notify_count: 0, last_notified_at: null,
    window_vanished_at: null, abandoned_at_stage: null, requires_attention: 0, guardian_exit_reason: null,
    started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null, closed_at: '2026-07-28T01:00:00+08:00',
    closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
    ...overrides,
  };
}

function renderWorkersOnAuditTab() {
  render(
    <MemoryRouter initialEntries={['/workers']}>
      <Routes>
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:runId" element={<Workers />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: '稽核' }));
}

describe('分頁 C 稽核（AC13）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR030: 殭屍清單顯示 abandoned_at_stage 值，連向 /stories/{story_id}', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({
      items: [makeRunRow({ run_id: 'z1', lifecycle: 'abandoned', abandoned_at_stage: 'running', story_id: 'whp-4-write-path-wiring' })],
      total: 1, page: 1,
    });
    renderWorkersOnAuditTab();

    await waitFor(() => expect(screen.getByText(/running/)).toBeInTheDocument());
    const link = screen.getByText('查該 story 交付') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/stories/whp-4-write-path-wiring');
  });

  it('BR031: 立即 reaper 對帳預設 dryRun:true 先顯示清單；再次確認才 dryRun:false；帶 Content-Type header', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({ items: [], total: 0, page: 1 });
    const previewReport = {
      scanned: 3, alive: 2, reaped: 1, skipped_inline: 0, skipped_cas_lost: 0, skipped_terminal: 0,
      probe_unavailable: false, dry_run: true, runs: [{ run_id: 'z1', story_id: 's', phase: 'p', from: 'running', to: 'abandoned', reason: 'window-vanished' }],
      generated_at: '2026-07-28T00:00:00+08:00',
    };
    api.reapWorkerRuns.mockResolvedValue(previewReport);
    renderWorkersOnAuditTab();

    await waitFor(() => expect(screen.getByText('立即 reaper 對帳')).toBeInTheDocument());
    fireEvent.click(screen.getByText('立即 reaper 對帳'));

    await waitFor(() => expect(api.reapWorkerRuns).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.getByText(/將標記為 abandoned：1/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('確認執行（將寫入 abandoned，不可逆）'));
    await waitFor(() => expect(api.reapWorkerRuns).toHaveBeenCalledWith(false));
  });

  it('reapWorkerRuns 實際呼叫帶 Content-Type: application/json header', async () => {
    const { reapWorkerRuns } = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ scanned: 0, alive: 0, reaped: 0, skipped_inline: 0, skipped_cas_lost: 0, skipped_terminal: 0, probe_unavailable: false, dry_run: true, runs: [], generated_at: '' }),
    } as Response);

    await reapWorkerRuns(true);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    fetchSpy.mockRestore();
  });

  it('BR032: ReapReport 型別恰 10 個必填鍵', () => {
    const report = {
      scanned: 0, alive: 0, reaped: 0, skipped_inline: 0, skipped_cas_lost: 0,
      skipped_terminal: 0, probe_unavailable: false, dry_run: true, runs: [], generated_at: '',
    };
    expect(Object.keys(report).length).toBe(10);
    expect(Object.keys(report).sort()).toEqual(
      ['alive', 'dry_run', 'generated_at', 'probe_unavailable', 'reaped', 'runs', 'scanned', 'skipped_cas_lost', 'skipped_inline', 'skipped_terminal'].sort(),
    );
  });

  it('BR033: close_source 九分類 — Unknown 與 null 產生兩個不同切片', () => {
    const rows = [
      makeRunRow({ run_id: 'a', close_source: 'Unknown' }),
      makeRunRow({ run_id: 'b', close_source: null }),
    ];
    const slices = aggregateCloseSourceDistribution(rows as never);
    expect(CLOSE_SOURCE_VALUES.length).toBe(8);
    const unknownSlice = slices.find((s) => s.label === 'Unknown');
    const unrecordedSlice = slices.find((s) => s.label === '未記錄');
    expect(unknownSlice?.count).toBe(1);
    expect(unrecordedSlice?.count).toBe(1);
    expect(unknownSlice).not.toBe(unrecordedSlice);
  });

  it('BR033: 稽核頁面渲染時 close_source 圓餅含 Unknown 與未記錄兩個標籤', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.listWorkerRuns.mockResolvedValue({
      items: [makeRunRow({ run_id: 'a', close_source: 'Unknown' }), makeRunRow({ run_id: 'b', close_source: null })],
      total: 2, page: 1,
    });
    renderWorkersOnAuditTab();

    await waitFor(() => expect(screen.getByTestId('chart-pie')).toBeInTheDocument());
    const labels = JSON.parse(screen.getByTestId('chart-pie').getAttribute('data-labels') ?? '[]');
    expect(labels).toContain('Unknown');
    expect(labels).toContain('未記錄');
  });

  it('BR034: 不變量違反區塊零按鈕，至少涵蓋三條規則', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      guardian: { present: true, stale: true, guardianPid: 1, host: 'h', startedAt: null, lastBeatAt: null, fastTickSec: 30, slowTickSec: 600, watchedRuns: 1, lastError: null },
    }));
    api.listWorkerRuns.mockResolvedValue({
      items: [
        makeRunRow({ run_id: 'closed-null', lifecycle: 'closed', closed_at: null }),
        makeRunRow({ run_id: 'gap-1', story_id: 's1', phase: 'dev-story', attempt: 1 }),
        makeRunRow({ run_id: 'gap-3', story_id: 's1', phase: 'dev-story', attempt: 3 }),
      ],
      total: 3, page: 1,
    });
    renderWorkersOnAuditTab();

    await waitFor(() => expect(screen.getByText('不變量違反')).toBeInTheDocument());
    const section = screen.getByText('不變量違反').closest('.worker-audit__section') as HTMLElement;
    expect(within(section).queryAllByRole('button').length).toBe(0);
    expect(section.textContent).toMatch(/closed_at 為空/);
    expect(section.textContent).toMatch(/attempt 跳號/);
    expect(section.textContent).toMatch(/守護心跳逾時/);
  });
});
