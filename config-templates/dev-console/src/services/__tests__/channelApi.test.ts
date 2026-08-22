// ============================================================
// channelApi.test.ts — /channel 前端 API client 純函式測試（ccb-3-devconsole-channel-page）
// BR-009：thread_id 含空白/冒號時，路徑組裝必 encodeURIComponent。
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchChannelThreadMessages, fetchChannelThreads } from '../channelApi';

describe('channelApi', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('BR009_ThreadId_EncodedInUrl: thread_id 含空白與冒號時路徑組裝 encodeURIComponent', async () => {
    const weirdId = '2026-05-26 18:40:45';
    await fetchChannelThreadMessages(weirdId);
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain(encodeURIComponent(weirdId));
    expect(calledUrl).not.toContain('2026-05-26 18:40:45');
  });

  it('fetchChannelThreads 省略 undefined 過濾參數，不產生空 query key', async () => {
    await fetchChannelThreads({ state: 'open', category: undefined, page: 1 });
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('state=open');
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).not.toContain('category=');
  });
});
