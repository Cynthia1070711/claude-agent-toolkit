// ============================================================
// sessionApi.ts — Session 時間軸 API fetch wrapper
// DVS-06 AC-1~4
// ============================================================
import type {
  SessionTimelineResponse,
  SessionQueryParams,
  SessionFiltersResponse,
} from '../types/session.js';

const API_BASE = '/api/sessions';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSessionTimeline(
  params: SessionQueryParams = {},
): Promise<SessionTimelineResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.agent) query.set('agent', params.agent);
  if (params.tags) query.set('tags', params.tags);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return apiFetch<SessionTimelineResponse>(qs ? `?${qs}` : '/');
}

export function fetchSessionFilters(): Promise<SessionFiltersResponse> {
  return apiFetch<SessionFiltersResponse>('/filters');
}
