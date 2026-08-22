// ============================================================
// apiClient.ts — 共用 API fetch 工具
// DVS-05: Dashboard + Sprint API 共用
// ============================================================

export const API_BASE = 'http://127.0.0.1:3001/api';

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
