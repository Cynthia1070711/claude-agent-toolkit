// ============================================================
// documentsApi.ts — Documents API fetch wrappers
// CMI-4: 文檔瀏覽 + 搜尋
// ============================================================
import { API_BASE } from './apiClient.js';

export interface DocIndexEntry {
  id: number;
  title: string;
  path: string;
  category: string | null;
  epic_id: string | null;
  chunk_count: number;
  total_tokens: number;
  last_updated: string;
}

export interface DocBrowseResult {
  items: DocIndexEntry[];
  total: number;
  page: number;
  pageSize: number;
  categories: { category: string; count: number }[];
}

export interface DocSearchChunk {
  id: number;
  heading_path: string;
  content: string;
  token_count: number;
  score?: number;
}

export interface DocSearchResult {
  items: DocSearchChunk[];
  total: number;
  query: string;
}

export interface DocContentResult {
  doc: DocIndexEntry;
  content: string | null;
  error?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function browseDocuments(
  category?: string,
  page = 1,
  pageSize = 20,
): Promise<DocBrowseResult> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return fetchJson<DocBrowseResult>(`${API_BASE}/documents?${params}`);
}

export function searchDocuments(
  query: string,
  category?: string,
  limit = 20,
): Promise<DocSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (category) params.set('category', category);
  params.set('limit', String(limit));
  return fetchJson<DocSearchResult>(`${API_BASE}/documents/search?${params}`);
}

export function getDocumentContent(id: number): Promise<DocContentResult> {
  return fetchJson<DocContentResult>(`${API_BASE}/documents/${id}`);
}

export interface RelatedDocsResult {
  items: DocIndexEntry[];
  total: number;
}

export function getRelatedDocuments(
  storyId?: string,
  epicId?: string,
  keywords?: string,
): Promise<RelatedDocsResult> {
  const params = new URLSearchParams();
  if (storyId) params.set('storyId', storyId);
  if (epicId) params.set('epicId', epicId);
  if (keywords) params.set('keywords', keywords);
  return fetchJson<RelatedDocsResult>(`${API_BASE}/documents/related?${params}`);
}
