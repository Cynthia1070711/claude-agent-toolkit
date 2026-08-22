// ============================================================
// Workers.queue.test.tsx — 四段佇列 / 一鍵 vs 二次確認 / warnings / 503 降級
// whp-10-devconsole-ui（AC7-AC11）
// ============================================================
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Workers from '../Workers';
import type { LiveBoard, WorkerRunView } from '../../types/workers';

vi.mock('react-chartjs-2', () => ({
  Bar: () => null,
  Line: () => null,
  Pie: () => null,
}));
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
    ackWorkerRun: ReturnType<typeof vi.fn>;
    addWorkerMessage: ReturnType<typeof vi.fn>;
    gateWorkerRun: ReturnType<typeof vi.fn>;
    closeWorkerRun: ReturnType<typeof vi.fn>;
    ackAttention: ReturnType<typeof vi.fn>;
  };
}

function makeRun(overrides: Partial<WorkerRunView> = {}): WorkerRunView {
  return {
    run_id: 'r1', session_id: 's', resumed_from_run_id: null, story_id: 'story-a', phase: 'dev-story',
    attempt: 1, controller_track: 'backend', run_mode: 'window', wrapper_pid: 1, claude_pid: null,
    cmd_line: null, window_title: null, ipc_dir: 'c', model_id: null, effort: null, work_root: null,
    baseline_commit: null, lifecycle: 'reported', close_source: null, last_status: null, evidence_incomplete: 0,
    turn_count: 0, files_modified: null, health_flag: null, stall_rounds: 0, reported_at: '2026-07-28T00:00:00+08:00',
    ack_at: null, ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null,
    abandoned_at_stage: null, requires_attention: 0, guardian_exit_reason: null,
    started_at: '2026-07-28T00:00:00+08:00', last_turn_at: null, closed_at: null, closed_detected_at: null,
    updated_at: '2026-07-28T00:00:00+08:00', executionOwner: 'controller', closable: false,
    ...overrides,
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

describe('四段佇列以動作分段 + 需注意置頂（AC7）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('四個 region accessible name 依序可查得「待確認」「待驗證」「待關窗」「需注意」，不含協議英文字面', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: {
        pendingAck: [makeRun({ run_id: 'ack-1', lifecycle: 'reported' })],
        pendingReview: [makeRun({ run_id: 'rev-1', lifecycle: 'awaiting-review' })],
        pendingClose: [makeRun({ run_id: 'close-1', lifecycle: 'approved' })],
        attention: [makeRun({ run_id: 'att-1', requires_attention: 1 })],
      },
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getByRole('region', { name: '待確認' })).toBeInTheDocument());
    expect(screen.getByRole('region', { name: '待驗證' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '待關窗' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '需注意' })).toBeInTheDocument();

    for (const raw of ['reported', 'awaiting-review', 'approved']) {
      expect(document.body.textContent).not.toContain(raw);
    }
  });

  it('queues.attention 非空時「需注意」region 置頂於其餘三段之前，class 含 is-attention', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: {
        pendingAck: [makeRun({ run_id: 'ack-1' })],
        pendingReview: [],
        pendingClose: [],
        attention: [makeRun({ run_id: 'att-1', requires_attention: 1 })],
      },
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getByRole('region', { name: '需注意' })).toBeInTheDocument());
    const attention = screen.getByRole('region', { name: '需注意' });
    const ack = screen.getByRole('region', { name: '待確認' });
    // eslint-disable-next-line no-bitwise
    expect(attention.compareDocumentPosition(ack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attention.className).toContain('is-attention');
  });

  it('一列同時滿足 reported 且 requires_attention=1 時同時出現在待確認與需注意兩段', async () => {
    const api = await getApi();
    const overlap = makeRun({ run_id: 'overlap-1', lifecycle: 'reported', requires_attention: 1 });
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [overlap], pendingReview: [], pendingClose: [], attention: [overlap] },
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getAllByText(/overlap-1|story-a/).length).toBeGreaterThan(0));
    const ackSection = screen.getByRole('region', { name: '待確認' });
    const attentionSection = screen.getByRole('region', { name: '需注意' });
    expect(ackSection.textContent).toContain('story-a');
    expect(attentionSection.textContent).toContain('story-a');
  });

  it('各段標題顯示筆數；queues.attention 為空時仍渲染並標「目前沒有需要注意的項目」', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard());
    renderWorkers();

    await waitFor(() => expect(screen.getByRole('region', { name: '需注意' })).toBeInTheDocument());
    expect(screen.getByText('目前沒有需要注意的項目')).toBeInTheDocument();
  });
});

describe('安全動作一鍵（AC8）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('點「✔ 已收到」無確認框，ackWorkerRun 呼叫 1 次參數為 (r1, undefined)，/live 重拉 +1', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [makeRun({ run_id: 'r1' })], pendingReview: [], pendingClose: [], attention: [] },
    }));
    api.ackWorkerRun.mockResolvedValue({ run_id: 'r1', lifecycle: 'awaiting-review' });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('✔ 已收到')).toBeInTheDocument());
    expect(api.fetchLiveBoard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('✔ 已收到'));

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(api.ackWorkerRun).toHaveBeenCalledTimes(1));
    expect(api.ackWorkerRun).toHaveBeenCalledWith('r1', undefined);
    await waitFor(() => expect(api.fetchLiveBoard).toHaveBeenCalledTimes(2));
  });
});

describe('危險動作二次確認（AC9）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('關閉視窗：單擊出現 dialog 且呼叫 0 次；取消→仍 0；再單擊+確認→ 1 次', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [makeRun({ run_id: 'r3', lifecycle: 'approved' })], attention: [] },
    }));
    api.closeWorkerRun.mockResolvedValue({ success: true, output: '', exitCode: 0, durationMs: 1 });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('🚪 關閉視窗')).toBeInTheDocument());
    fireEvent.click(screen.getByText('🚪 關閉視窗'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.closeWorkerRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.closeWorkerRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('🚪 關閉視窗'));
    fireEvent.click(screen.getByText('確認'));
    await waitFor(() => expect(api.closeWorkerRun).toHaveBeenCalledTimes(1));
  });

  it('要求修正：textarea 空時送出鈕 disabled；填字後 gateWorkerRun 收到 {verdict:revise, gateNotes}', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [makeRun({ run_id: 'r2', lifecycle: 'awaiting-review' })], pendingClose: [], attention: [] },
    }));
    api.gateWorkerRun.mockResolvedValue({ run: {}, handoff: null });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('✏️ 要求修正')).toBeInTheDocument());
    fireEvent.click(screen.getByText('✏️ 要求修正'));

    const textarea = screen.getByRole('textbox');
    expect(screen.getByText('確認')).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'AC3 的 file:line 抽樣對不上' } });
    expect(screen.getByText('確認')).not.toBeDisabled();
    fireEvent.click(screen.getByText('確認'));

    await waitFor(() => expect(api.gateWorkerRun).toHaveBeenCalledWith('r2', { verdict: 'revise', gateNotes: 'AC3 的 file:line 抽樣對不上' }));
  });

  it('核可：先出現確認框，確認後 gateWorkerRun 收到 {verdict:approved}', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [makeRun({ run_id: 'r2', lifecycle: 'awaiting-review' })], pendingClose: [], attention: [] },
    }));
    api.gateWorkerRun.mockResolvedValue({ run: {}, handoff: null });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('✅ 核可')).toBeInTheDocument());
    fireEvent.click(screen.getByText('✅ 核可'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.gateWorkerRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('確認'));
    await waitFor(() => expect(api.gateWorkerRun).toHaveBeenCalledWith('r2', { verdict: 'approved' }));
  });
});

describe('需注意段四動作 + 訊息 mode 顯式 + warnings（AC10）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('顯示四顆動作鈕 + 「連續 2 輪零變動」', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', health_flag: 'stalled-suspect', stall_rounds: 2, requires_attention: 1 })] },
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('續等')).toBeInTheDocument());
    expect(screen.getByText('喚醒')).toBeInTheDocument();
    expect(screen.getByText('關窗重派')).toBeInTheDocument();
    expect(screen.getByText('☑ 已知悉')).toBeInTheDocument();
    expect(screen.getByText('連續 2 輪零變動')).toBeInTheDocument();
  });

  it('點續等：addWorkerMessage 收到 progress/append/非空 body+author', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', requires_attention: 1 })] },
    }));
    api.addWorkerMessage.mockResolvedValue({ message: { msg_id: 1, seq: 1, state: 'pending' }, supersededCount: 0, warnings: [] });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('續等')).toBeInTheDocument());
    fireEvent.click(screen.getByText('續等'));

    await waitFor(() => expect(api.addWorkerMessage).toHaveBeenCalledTimes(1));
    const [runId, input] = api.addWorkerMessage.mock.calls[0];
    expect(runId).toBe('r4');
    expect(input.direction).toBe('worker-to-controller');
    expect(input.msgType).toBe('progress');
    expect(input.mode).toBe('append');
    expect(input.body).toBeTruthy();
    expect(input.author).toBeTruthy();
  });

  it('點喚醒：addWorkerMessage 收到 wake/controller-to-worker，送出後畫面顯示 state（pending→未送達）', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', requires_attention: 1 })] },
    }));
    api.addWorkerMessage.mockResolvedValue({ message: { msg_id: 2, seq: 2, state: 'pending' }, supersededCount: 0, warnings: [] });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('喚醒')).toBeInTheDocument());
    fireEvent.click(screen.getByText('喚醒'));

    await waitFor(() => expect(api.addWorkerMessage).toHaveBeenCalledTimes(1));
    const [, input] = api.addWorkerMessage.mock.calls[0];
    expect(input.direction).toBe('controller-to-worker');
    expect(input.msgType).toBe('wake');
    expect(input.mode).toBe('append');

    await waitFor(() => expect(screen.getByText(/未送達/)).toBeInTheDocument());
  });

  it('喚醒後 message.state=delivered 時顯示已送達', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', requires_attention: 1 })] },
    }));
    api.addWorkerMessage.mockResolvedValue({ message: { msg_id: 2, seq: 2, state: 'delivered' }, supersededCount: 0, warnings: [] });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('喚醒')).toBeInTheDocument());
    fireEvent.click(screen.getByText('喚醒'));
    await waitFor(() => expect(screen.getByText(/已送達/)).toBeInTheDocument());
  });

  it('☑ 已知悉：呼叫第 9 支 ackAttention', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', requires_attention: 1 })] },
    }));
    api.ackAttention.mockResolvedValue({ requires_attention: 0 });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('☑ 已知悉')).toBeInTheDocument());
    fireEvent.click(screen.getByText('☑ 已知悉'));
    await waitFor(() => expect(api.ackAttention).toHaveBeenCalledWith('r4', undefined));
  });

  // ── CR 回歸鎖：BR-045 降旗 CAS 與 BR-055 聯集 filter 的接縫 ──────────────
  // getLiveBoard 的 attention 段是聯集（requires_attention=1 OR health_flag='stalled-suspect'，
  // workerRunService.ts:231），但降旗 CAS 只認 requires_attention=1（:641）。守護
  // writeStallIncrement（guardian-tick.js:283）同時寫兩欄，清旗只清得掉前者，health_flag
  // 依 Spec §3.4 屬守護職責本卡不寫 → 該列清旗後仍留在本段。此時若仍渲染「已知悉」，
  // 使用者每按一次就吃一個 409。本測鎖住「旗標已放下的列不再提供按鈕，改給狀態說明」。
  it('CR-F1: attention 列 requires_attention=0（僅因 stalled-suspect 在段內）時不提供「已知悉」按鈕', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: {
        pendingAck: [], pendingReview: [], pendingClose: [],
        attention: [makeRun({ run_id: 'r-stalled', lifecycle: 'running', requires_attention: 0, health_flag: 'stalled-suspect', stall_rounds: 3 })],
      },
    }));
    renderWorkers();

    // 該列仍在需注意段（聯集成立），且停滯輪數仍呈現
    await waitFor(() => expect(screen.getByText(/連續 3 輪零變動/)).toBeInTheDocument());
    // 但不得再出現一顆按了必 409 的按鈕
    expect(screen.queryByRole('button', { name: '☑ 已知悉' })).toBeNull();
    expect(screen.getByText('☑ 已知悉 · 守護仍判定停滯')).toBeInTheDocument();
    // 對停滯仍有意義的三個動作必須保留
    expect(screen.getByText('續等')).toBeInTheDocument();
    expect(screen.getByText('喚醒')).toBeInTheDocument();
    expect(screen.getByText('關窗重派')).toBeInTheDocument();
    expect(api.ackAttention).not.toHaveBeenCalled();
  });

  it('mock 回傳 warnings 時，該整句出現在畫面上', async () => {
    const api = await getApi();
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [makeRun({ run_id: 'r4', requires_attention: 1 })] },
    }));
    api.addWorkerMessage.mockResolvedValue({
      message: { msg_id: 2, seq: 2, state: 'pending' },
      supersededCount: 0,
      warnings: ['msg_id=7 已送達（delivered），無法撤回，請發新指示'],
    });
    renderWorkers();

    await waitFor(() => expect(screen.getByText('續等')).toBeInTheDocument());
    fireEvent.click(screen.getByText('續等'));
    await waitFor(() => expect(screen.getByText('msg_id=7 已送達（delivered），無法撤回，請發新指示')).toBeInTheDocument());
  });

  it('msgType 白名單無 directive/reply 字面（grep workersApi.ts）', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../services/workersApi.ts'), 'utf-8');
    expect((src.match(/'(directive|reply)'/g) ?? []).length).toBe(0);
  });
});

describe('POST /close 503 具名降級（AC11）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('畫面顯示訊息含 whp-6-directive-delivery-and-close；按鈕保持可見', async () => {
    const api = await getApi();
    const { WorkersApiError } = await vi.importActual<typeof import('../../services/workersApi.js')>('../../services/workersApi.js');
    api.fetchLiveBoard.mockResolvedValue(makeBoard({
      queues: { pendingAck: [], pendingReview: [], pendingClose: [makeRun({ run_id: 'r3', lifecycle: 'approved' })], attention: [] },
    }));
    api.closeWorkerRun.mockRejectedValue(new WorkersApiError(503, {
      error: 'close-worker.ps1 尚未交付（whp-6-directive-delivery-and-close），無法關窗。',
      missingScript: 'close-worker.ps1',
      blockedBy: 'whp-6-directive-delivery-and-close',
    }));
    renderWorkers();

    await waitFor(() => expect(screen.getByText('🚪 關閉視窗')).toBeInTheDocument());
    fireEvent.click(screen.getByText('🚪 關閉視窗'));
    fireEvent.click(screen.getByText('確認'));

    await waitFor(() => expect(document.body.textContent).toContain('whp-6-directive-delivery-and-close'));
    expect(screen.getByText('🚪 關閉視窗')).toBeInTheDocument();
  });
});
