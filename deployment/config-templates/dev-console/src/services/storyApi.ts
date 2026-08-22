// ============================================================
// storyApi.ts — Story API fetch wrapper
// DVS-06 AC-5: fetchStoryContent
// ============================================================
import type { StoryContentResponse, StructuredStoryDetail } from '../types/stories.js';

const API_BASE = '/api/stories';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchStoryContent(storyId: string): Promise<StoryContentResponse> {
  return apiFetch<StoryContentResponse>(`/${encodeURIComponent(storyId)}/content`);
}

/** DVS-07: 結構化 Story 詳情 */
export function fetchStoryDetail(storyId: string): Promise<StructuredStoryDetail> {
  return apiFetch<StructuredStoryDetail>(`/${encodeURIComponent(storyId)}/detail`);
}
