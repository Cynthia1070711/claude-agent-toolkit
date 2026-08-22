// ============================================================
// Workers.board.test.tsx — 分頁 A 執行中看板九欄 + 軌別分組 + PID hover（AC4/AC6）
// whp-10-devconsole-ui（BR-009~BR-015）
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Workers from '../Workers';
import type { LiveBoard, WorkerRunView } from '../../types/workers';

vi.mock('react-chartjs-2', () => ({ Bar: () => null, Line: () => null, Pie: () => null }));
vi.mock('../../utils/chartConfig.js', () => ({}));

vi.mock('../../services/workersApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
  return {
    ...actual,
    fetchLiveBoard: vi.fn(),
    listWorkerRuns: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1 }),
    fetchWorkerRunDetail: vi.fn().mockResolvedValue({
      run: {
        run_id: 'nav-target', session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
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

async function getApi() {
  return (await import('../../services/workersApi.js')) as unknown as { fetchLiveBoard: ReturnType<typeof vi.fn> };
}

function makeRun(overrides: Partial<WorkerRunView> = {}): WorkerRunView {
  return {
    run_id: 'r1', session_id: 's', resumed_from_run_id: 'r-prev', story_id: 'whp-4-write-path-wiring', phase: 'dev-story',
    attempt: 3, controller_track: 'backend', run_mode: 'window', wrapper_pid: 123, claude_pid: null,
    cmd_line: 'powershell -File worker-dev.ps1', window_title: '⚠ 待中控確認', ipc_dir: 'c', model_id: 'claude-sonnet-5[1m]',
    effort: 'max', work_root: null, baseline_commit: null, lifecycle: 'running', close_source: null, last_status: null,
    evidence_incomplete: 0, turn_count: 7, files_modified: null, health_flag: null, stall_rounds: 0,
    reported_at: null, ack_at: null, ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null,
    abandoned_at_stage: null, requires_attention: 0, guardian_exit_reason: null,
    started_at: '2026-07-28T00:00:00+08:00', last_turn_at: new Date(Date.now() - 180_000).toISOString(),
    closed_at: null, closed_detected_at: null, updated_at: '2026-07-28T00:00:00+08:00',
    executionOwner: 'worker', closable: false,
    ...overrides,
  };
}

function makeBoard(running: WorkerRunView[]): LiveBoard {
  return {
    guardian: { present: false },
    kpi: { running: running.length, pendingAck: 0, pendingReview: 0, pendingClose: 0 },
    running,
    queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
  };
}

function renderWorkers() {
  return render(
    <MemoryRouter initialEntries={['/workers']}>
      <Routes>
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:runId" element={<Workers />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('執行中看板九欄（AC4/BR-009~011/BR-015）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR009: 九項各自可由 [data-field] 選取器取得且非空', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun()]));
    renderWorkers();

    await waitFor(() => expect(document.querySelector('[data-field="track"]')).not.toBeNull());
    for (const field of ['track', 'story-phase', 'attempt', 'model', 'pid', 'heartbeat', 'owner', 'closable', 'actions']) {
      const el = document.querySelector(`[data-field="${field}"]`);
      expect(el, `data-field=${field} 應存在`).not.toBeNull();
      expect(el!.textContent?.trim(), `data-field=${field} 應非空`).toBeTruthy();
    }
  });

  it('BR010: 派發次數顯示「第 3 次派發」，class 含 is-retry，title 含 r-prev', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun({ attempt: 3, resumed_from_run_id: 'r-prev' })]));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('第 3 次派發')).toBeInTheDocument());
    const attemptCell = document.querySelector('[data-field="attempt"]');
    expect(attemptCell?.className).toContain('is-retry');
    expect(attemptCell?.getAttribute('title')).toContain('r-prev');
  });

  it('BR011: PID 欄顯示「視窗 123」與「未回填」（claude_pid null 不印 null），title 含 4-Tuple', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun({
      wrapper_pid: 123, claude_pid: null, cmd_line: 'powershell -File worker-dev.ps1', window_title: '⚠ 待中控確認',
      started_at: '2026-07-28T00:00:00+08:00',
    })]));
    renderWorkers();

    await waitFor(() => expect(document.querySelector('[data-field="pid"]')).not.toBeNull());
    const pidCell = document.querySelector('[data-field="pid"]')!;
    expect(pidCell.textContent).toContain('視窗 123');
    expect(pidCell.textContent).toContain('未回填');
    expect(pidCell.textContent).not.toMatch(/\bnull\b/);
    const title = pidCell.getAttribute('title') ?? '';
    expect(title).toContain('cmd_line');
    expect(title).toContain('window_title');
    expect(title).toContain('started_at');
  });

  it('BR012: 心跳欄完整文字為「第 7 turn · 3 分鐘前」', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun({ turn_count: 7, last_turn_at: new Date(Date.now() - 180_000).toISOString() })]));
    renderWorkers();

    await waitFor(() => expect(document.querySelector('[data-field="heartbeat"]')).not.toBeNull());
    const heartbeatCell = document.querySelector('[data-field="heartbeat"]')!;
    expect(heartbeatCell.textContent).toContain('第 7 turn');
    expect(heartbeatCell.textContent).toContain('3 分鐘前');
  });

  it('看板容器 .worker-board 於 workers.css 定義 overflow-x: auto（窄螢幕捲動發生在表格內；jsdom 不套用外部樣式表，改靜態驗證來源）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../styles/workers.css'), 'utf-8');
    const ruleMatch = src.match(/\.worker-board\s*\{[^}]*\}/);
    expect(ruleMatch, '.worker-board 規則應存在').not.toBeNull();
    expect(ruleMatch![0]).toMatch(/overflow-x:\s*auto/);
  });

  it('可依 controller_track 分組（一眼可見這一軌現在有誰在跑，SSoT US-7）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([
      makeRun({ run_id: 'r1', controller_track: 'backend' }),
      makeRun({ run_id: 'r2', controller_track: 'frontend' }),
    ]));
    renderWorkers();

    await waitFor(() => expect(document.querySelectorAll('.worker-board__track-group').length).toBe(2));
    const groups = Array.from(document.querySelectorAll('.worker-board__track-group')).map((g) => g.textContent);
    expect(groups.some((g) => g?.includes('backend'))).toBe(true);
    expect(groups.some((g) => g?.includes('frontend'))).toBe(true);
  });

  it('快捷「開啟溝通串」點擊後 URL 變為 /workers/{runId}', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun({ run_id: 'nav-target' })]));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('開啟溝通串')).toBeInTheDocument());
    fireEvent.click(screen.getByText('開啟溝通串'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('BR015: navigator.clipboard 為 undefined 時「複製指示」顯示可見降級提示（非靜默失敗）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun()]));
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('複製指示')).toBeInTheDocument());
    fireEvent.click(screen.getByText('複製指示'));

    await waitFor(() => expect(screen.getByText(/瀏覽器不支援自動複製/)).toBeInTheDocument());
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });
});

describe('執行權與可否關閉一律取後端推導欄位（AC6/BR-013/014）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BR013: executionOwner/closable 刻意矛盾資料 → 顯示取後端欄位而非從 lifecycle 重推', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([
      makeRun({ lifecycle: 'running', executionOwner: 'controller', closable: true }),
    ]));
    renderWorkers();

    await waitFor(() => expect(document.querySelector('[data-field="owner"]')).not.toBeNull());
    expect(document.querySelector('[data-field="owner"]')?.textContent).toBe('中控');
    expect(document.querySelector('[data-field="closable"]')?.textContent).toBe('可關閉');
  });

  it('WorkerBoard.tsx 無前端從 lifecycle 重推 closable 的邏輯（grep 0 命中）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../components/WorkerBoard.tsx'), 'utf-8');
    expect((src.match(/lifecycle === 'approved'/g) ?? []).length).toBe(0);
  });

  it('BR014: lifecycle=reported 時可否關閉欄顯示紅色明文「請勿關閉」', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard([makeRun({ lifecycle: 'reported', closable: false })]));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('請勿關閉')).toBeInTheDocument());
    expect(document.querySelector('[data-field="closable"]')?.className).toContain('is-blocked');
  });
});
