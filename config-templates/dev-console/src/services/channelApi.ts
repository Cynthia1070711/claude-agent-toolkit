// ============================================================
// channelApi.ts — /api/channel 前端 API client（ccb-3-devconsole-channel-page）
// GET-only（唯讀頁），走既有 apiFetch；thread_id 含空白/冒號，路徑組裝一律 encodeURIComponent。
// ============================================================
import { apiFetch } from './apiClient.js';
import type {
  ChannelStats,
  ChannelBoard,
  ThreadListResult,
  ThreadMessagesResult,
  ReadMatrixResult,
} from '../types/channel.js';

export interface ListThreadsFilters {
  state?: 'open' | 'closed';
  category?: string;
  must_read?: boolean;
  channel?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchThreadsFilters {
  q?: string;
  category?: string;
  must_read?: boolean;
  channel?: string;
  page?: number;
  pageSize?: number;
}

export interface ReadMatrixFilters {
  days?: number;
  limit?: number;
  channel?: string;
  category?: string;
}

function toQueryString(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function fetchChannelStats(): Promise<ChannelStats> {
  return apiFetch<ChannelStats>('/channel/stats');
}

export async function fetchChannelBoards(): Promise<{ items: ChannelBoard[] }> {
  return apiFetch<{ items: ChannelBoard[] }>('/channel/boards');
}

export async function fetchChannelThreads(filters: ListThreadsFilters = {}): Promise<ThreadListResult> {
  return apiFetch<ThreadListResult>(`/channel/threads${toQueryString(filters)}`);
}

export async function fetchChannelThreadMessages(threadId: string): Promise<ThreadMessagesResult> {
  return apiFetch<ThreadMessagesResult>(`/channel/threads/${encodeURIComponent(threadId)}/messages`);
}

export async function fetchChannelReadMatrix(filters: ReadMatrixFilters = {}): Promise<ReadMatrixResult> {
  return apiFetch<ReadMatrixResult>(`/channel/read-matrix${toQueryString(filters)}`);
}

export async function fetchChannelSearch(filters: SearchThreadsFilters = {}): Promise<ThreadListResult> {
  return apiFetch<ThreadListResult>(`/channel/search${toQueryString(filters)}`);
}
