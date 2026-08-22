// ============================================================
// Workers.drawer.test.tsx — 抽屜三段 + Esc + focus return + handoff null（AC14）
// whp-10-devconsole-ui
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Workers from '../Workers';
import type { LiveBoard, WorkerRunDetail } from '../../types/workers';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null, Pie: () => null }));
vi.mock('../../utils/chartConfig.js', () => ({}));

vi.mock('../../services/workersApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
  return {
    ...actual,
    fetchLiveBoard: vi.fn(),
    listWorkerRuns: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1 }),
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
    fetchWorkerRunDetail: ReturnType<typeof vi.fn>;
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

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    run_id: 'r-detail', session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
    attempt: 1, controller_track: 'backend', run_mode: 'window', wrapper_pid: 1, claude_pid: null,
    cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null, effort: null, work_root: null,
    baseline_commit: null, lifecycle: 'running', close_source: null, last_status: null, evidence_incomplete: 0,
    turn_count: 0, files_modified: null, health_flag: null, stall_rounds: 0, reported_at: null, ack_at: null,
    ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null, abandoned_at_stage: null,
    requires_attention: 0, guardian_exit_reason: null, started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null,
    closed_at: null, closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
    ...overrides,
  };
}

const RUN_ID = '11111111-2222-3333-4444-555555555555';

function renderWithDrawerOpen() {
  return render(
    <MemoryRouter initialEntries={[`/workers/${RUN_ID}`]}>
      <Routes>
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:runId" element={<Workers />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('右側抽屜（AC14）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR035: 三個小節皆渲染（概況時間軸/溝通串/交接證據鏈）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    const detail: WorkerRunDetail = {
      run: makeRun() as never,
      messages: [],
      handoff: null,
    };
    api.fetchWorkerRunDetail.mockResolvedValue(detail);
    renderWithDrawerOpen();

    await waitFor(() => expect(screen.getByText('概況時間軸')).toBeInTheDocument());
    expect(screen.getByText('溝通串')).toBeInTheDocument();
    expect(screen.getByText('交接證據鏈')).toBeInTheDocument();
  });

  it('BR036: 溝通串三則依後端 seq 1→2→3 呈現，每則顯示 seq/direction/msg_type/state/created_at', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    const detail: WorkerRunDetail = {
      run: makeRun() as never,
      messages: [
        { msg_id: 1, run_id: RUN_ID, seq: 1, direction: 'worker-to-controller', msg_type: 'report', body: 'm1', author: 'a', state: 'delivered', delivered_via: null, created_at: '2026-07-28T00:01:00+08:00', delivered_at: null, consumed_at: null },
        { msg_id: 2, run_id: RUN_ID, seq: 2, direction: 'controller-to-worker', msg_type: 'wake', body: 'm2', author: 'a', state: 'pending', delivered_via: null, created_at: '2026-07-28T00:02:00+08:00', delivered_at: null, consumed_at: null },
        { msg_id: 3, run_id: RUN_ID, seq: 3, direction: 'worker-to-controller', msg_type: 'progress', body: 'm3', author: 'a', state: 'pending', delivered_via: null, created_at: '2026-07-28T00:03:00+08:00', delivered_at: null, consumed_at: null },
      ],
      handoff: null,
    };
    api.fetchWorkerRunDetail.mockResolvedValue(detail);
    renderWithDrawerOpen();

    await waitFor(() => expect(screen.getByText(/#1/)).toBeInTheDocument());
    const messageNodes = document.querySelectorAll('.worker-drawer__message');
    expect(messageNodes.length).toBe(3);
    expect(messageNodes[0]!.textContent).toContain('#1');
    expect(messageNodes[0]!.textContent).toContain('report');
    expect(messageNodes[1]!.textContent).toContain('#2');
    expect(messageNodes[2]!.textContent).toContain('#3');
  });

  it('BR037: handoff:null 時顯示「尚無交接紀錄」，無 console error', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.fetchWorkerRunDetail.mockResolvedValue({ run: makeRun() as never, messages: [], handoff: null });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithDrawerOpen();

    await waitFor(() => expect(screen.getByText('尚無交接紀錄')).toBeInTheDocument());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('BR038: role=dialog + aria-modal=true；開啟後 activeElement 在抽屜內；Esc 關閉且焦點回觸發按鈕', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue({
      ...makeBoard(),
      running: [{ ...makeRun({ run_id: RUN_ID }), executionOwner: 'worker', closable: false }] as never,
    });
    api.fetchWorkerRunDetail.mockResolvedValue({ run: makeRun({ run_id: RUN_ID }) as never, messages: [], handoff: null });

    render(
      <MemoryRouter initialEntries={['/workers']}>
        <Routes>
          <Route path="/workers" element={<Workers />} />
          <Route path="/workers/:runId" element={<Workers />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('開啟溝通串')).toBeInTheDocument());
    const trigger = screen.getByText('開啟溝通串');
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // CR 回歸鎖：本案例原本只斷言 dialog 消失，測試名稱卻宣稱驗了焦點返回 —— 而
    // Workers.tsx:152 從未把 trigger 傳進 openDrawer，drawerTriggerRef 恆 null、
    // .focus() 恆 no-op，BR-038 的焦點返回實際上未實作卻是綠燈。補上真正的斷言。
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('BR039: 只有 started_at 有值時，其餘五節點仍渲染並標「尚未發生」', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    api.fetchWorkerRunDetail.mockResolvedValue({
      run: makeRun({ started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null, reported_at: null, ack_at: null, closed_at: null }) as never,
      messages: [],
      handoff: null,
    });
    renderWithDrawerOpen();

    await waitFor(() => expect(document.querySelectorAll('.worker-drawer__timeline-node').length).toBe(6));
    const pendingNodes = document.querySelectorAll('.worker-drawer__timeline-node.is-pending');
    expect(pendingNodes.length).toBe(5);
    expect(document.querySelector('.worker-drawer__timeline')?.textContent).toMatch(/尚未發生/);
  });
});
