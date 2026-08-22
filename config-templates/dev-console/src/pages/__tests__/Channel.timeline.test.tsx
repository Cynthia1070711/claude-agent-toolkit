// ============================================================
// Channel.timeline.test.tsx — ref chips / superseded / XSS 純文字渲染（ccb-3-devconsole-channel-page）
// ============================================================
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ThreadTimeline from '../../components/channel/ThreadTimeline';
import type { ThreadMessagesResult, MessageWithReads } from '../../types/channel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('../../services/channelApi.js', () => ({
  fetchChannelThreadMessages: vi.fn(),
}));

import * as api from '../../services/channelApi.js';

function makeMsg(overrides: Partial<MessageWithReads> = {}): MessageWithReads {
  return {
    msg_id: 1, thread_id: 't-1', seq: 1, from_track: '前台軌', to_tracks: ['後台軌'],
    msg_type: 'request', body: '請後台軌讓出 Migration 窗口', ref_json: null,
    superseded_by: null, superseded_by_seq: null, superseded_by_thread_id: null,
    created_at: '2026-07-27T21:33:12+08:00', reads: [],
    ...overrides,
  };
}

function makeResult(messages: MessageWithReads[]): ThreadMessagesResult {
  return {
    thread: { thread_id: 't-1', topic: 'Migration 窗口協調', category: null, channel: 'general', initiator_track: '前台軌', state: 'open', must_read: 0, created_at: '', closed_at: null },
    messages,
  };
}

function renderTimeline(result: ThreadMessagesResult) {
  (api.fetchChannelThreadMessages as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return render(
    <MemoryRouter>
      <ThreadTimeline threadId="t-1" onBack={vi.fn()} onNavigateBoard={vi.fn()} onNavigateThread={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('ThreadTimeline / MsgBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('BR019_Timeline_RendersMessagesInGivenOrder: 依 API 回傳順序渲染（後端已 seq 升序，前端不重排）', async () => {
    const result = makeResult([makeMsg({ msg_id: 1, seq: 1 }), makeMsg({ msg_id: 2, seq: 2 }), makeMsg({ msg_id: 3, seq: 3 })]);
    renderTimeline(result);
    const seqEls = await screen.findAllByText(/^#[123]$/);
    expect(seqEls.map((e) => e.textContent)).toEqual(['#1', '#2', '#3']);
  });

  it('BR020_UnknownRefJsonKeys_NotRendered: 未知 key(source_file/type_inferred)整塊不渲染', async () => {
    const { container } = renderTimeline(
      makeResult([makeMsg({ ref_json: { source_file: 'orig.md', type_inferred: true } as unknown as Record<string, unknown> })]),
    );
    await screen.findByText(/請後台軌讓出/);
    expect(container.textContent).not.toContain('source_file');
    expect(container.querySelector('.channel-msg__ref-chips')).toBeNull();
  });

  it('AC7：story_id ref chip 顯示可用連結', async () => {
    renderTimeline(makeResult([makeMsg({ ref_json: { story_id: 'ccb-1-db-mcp-import' } })]));
    expect(await screen.findByText(/ccb-1-db-mcp-import/)).toBeInTheDocument();
  });

  it('AC7：commit ref chip 點擊複製', async () => {
    renderTimeline(makeResult([makeMsg({ ref_json: { commit: '7ea873c6' } })]));
    const chip = await screen.findByText(/7ea873c6/);
    fireEvent.click(chip);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('7ea873c6'));
  });

  it('AC7：file ref chip 顯示尾段且點擊複製全路徑', async () => {
    renderTimeline(makeResult([makeMsg({ ref_json: { file: 'scripts/x.ps1' } })]));
    const chip = await screen.findByText(/x\.ps1/);
    fireEvent.click(chip);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('scripts/x.ps1'));
  });

  it('AC7：board_id ref chip 點擊呼叫 onNavigateBoard', async () => {
    const onNavigateBoard = vi.fn();
    (api.fetchChannelThreadMessages as ReturnType<typeof vi.fn>).mockResolvedValue(makeResult([makeMsg({ ref_json: { board_id: 'staging-db' } })]));
    render(
      <MemoryRouter>
        <ThreadTimeline threadId="t-1" onBack={vi.fn()} onNavigateBoard={onNavigateBoard} onNavigateThread={vi.fn()} />
      </MemoryRouter>,
    );
    const chip = await screen.findByText(/staging-db/);
    fireEvent.click(chip);
    expect(onNavigateBoard).toHaveBeenCalledWith('staging-db');
  });

  it('BR021_SupersededMessage_ShowsTargetSeq: 同 thread 顯「見 #{seq}」錨點 + 刪除線', async () => {
    const { container } = renderTimeline(
      makeResult([
        makeMsg({ msg_id: 10, seq: 3, superseded_by: 11, superseded_by_seq: 4, superseded_by_thread_id: 't-1' }),
        makeMsg({ msg_id: 11, seq: 4 }),
      ]),
    );
    expect(await screen.findByText(/見 #4/)).toBeInTheDocument();
    expect(container.querySelector('.channel-msg--superseded')).not.toBeNull();
  });

  it('BR048_ScriptInBody_RenderedAsText: body 含 <img onerror> 純文字呈現，不建立真 img 節點', async () => {
    renderTimeline(makeResult([makeMsg({ body: '<img src=x onerror="window.__pwned=1">' })]));
    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelectorAll('img').length).toBe(0);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('body 含 <script> 標籤純文字呈現，不建立真 script 節點', async () => {
    renderTimeline(makeResult([makeMsg({ body: '<script>alert(1)</script>' })]));
    expect(await screen.findByText(/<script>alert\(1\)/)).toBeInTheDocument();
  });

  it('0 則訊息顯示降級文案', async () => {
    renderTimeline(makeResult([]));
    expect(await screen.findByText('0 則 · 尚無訊息')).toBeInTheDocument();
  });
});

describe('禁 dangerouslySetInnerHTML（BR-048 靜態原始碼斷言）', () => {
  const channelDir = path.resolve(__dirname, '../../components/channel');
  const files = ['MsgBlock.tsx', 'ThreadTimeline.tsx', 'ThreadList.tsx', 'ReadMatrix.tsx', 'BoardCard.tsx', 'ChannelChips.tsx'];

  it.each(files)('%s 不含 dangerouslySetInnerHTML', (file) => {
    const src = fs.readFileSync(path.join(channelDir, file), 'utf8');
    expect(src).not.toContain('dangerouslySetInnerHTML');
  });

  it('src/pages/Channel.tsx 不含 dangerouslySetInnerHTML', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../Channel.tsx'), 'utf8');
    expect(src).not.toContain('dangerouslySetInnerHTML');
  });
});
