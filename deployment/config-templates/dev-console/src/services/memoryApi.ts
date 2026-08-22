// ============================================================
// memoryApi.ts — Memory API fetch wrapper
// AC-6/7: 前端與後端 Memory API 通訊層
// ============================================================
import type {
  ContextEntry,
  TechEntry,
  SearchResult,
  BrowseResult,
  MemoryStats,
  CrudResponse,
  MemoryType,
} from '../types/memory.js';

const API_BASE = 'http://localhost:3001/api/memory';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── 搜尋 ──────────────────────────────────────────────────────

export function searchMemory(
  query: string,
  type: MemoryType = 'context',
  category?: string,
  limit?: number,
): Promise<SearchResult<ContextEntry> | SearchResult<TechEntry>> {
  const params = new URLSearchParams({ q: query, type });
  if (category) params.set('category', category);
  if (limit) params.set('limit', String(limit));
  return apiFetch(`/search?${params}`);
}

// ── 瀏覽 ──────────────────────────────────────────────────────

export function browseMemory(
  type: MemoryType = 'context',
  category?: string,
  page?: number,
  pageSize?: number,
): Promise<BrowseResult<ContextEntry> | BrowseResult<TechEntry>> {
  const params = new URLSearchParams({ type });
  if (category) params.set('category', category);
  if (page) params.set('page', String(page));
  if (pageSize) params.set('pageSize', String(pageSize));
  return apiFetch(`/browse?${params}`);
}

// ── 統計 ──────────────────────────────────────────────────────

export function getMemoryStats(): Promise<MemoryStats> {
  return apiFetch('/stats');
}

// ── 單筆詳情 ─────────────────────────────────────────────────

export function getMemoryById(
  type: MemoryType,
  id: number,
): Promise<ContextEntry | TechEntry> {
  return apiFetch(`/${type}/${id}`);
}

// ── CRUD ─────────────────────────────────────────────────────

export function createMemory(
  type: MemoryType,
  data: Partial<ContextEntry | TechEntry>,
): Promise<CrudResponse> {
  return apiFetch(`/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateMemory(
  type: MemoryType,
  id: number,
  data: Partial<ContextEntry | TechEntry>,
): Promise<CrudResponse> {
  return apiFetch(`/${type}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteMemory(type: MemoryType, id: number): Promise<CrudResponse> {
  return apiFetch(`/${type}/${id}`, { method: 'DELETE' });
}
