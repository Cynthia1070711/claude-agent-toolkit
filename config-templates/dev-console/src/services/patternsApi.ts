// ============================================================
// patternsApi.ts — Continuous Learning Patterns API wrapper
// Phase 4: 持續學習模式觀察端點
// ============================================================
import { apiFetch } from './apiClient.js';

export interface PatternObservation {
  id: number;
  file_path: string;
  domain: string;
  tool_name: string;
  change_type: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  confidence: number;
}

export interface DomainStat {
  domain: string;
  count: number;
  total_ops: number;
  avg_confidence: number;
}

export interface QueueItem {
  id: number;
  file_path: string;
  queued_at: string;
  processed: number;
}

export interface QueueStats {
  processed: number;
  count: number;
}

export interface MemoryCoverage {
  name: string;
  emb: number;
  src: number;
}

export interface EmbeddingHealth {
  symbolEmbeddings: number;
  symbolIndex: number;
  documentEmbeddings: number;
  memory: MemoryCoverage[];
  queuePending: number;
  queueProcessed: number;
  modelName: string;
  dimensions: number;
}

export async function fetchObservations(domain?: string): Promise<{ observations: PatternObservation[]; domainStats: DomainStat[] }> {
  const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
  return apiFetch<{ observations: PatternObservation[]; domainStats: DomainStat[] }>(`/patterns/observations${params}`);
}

export interface RecentObservations {
  observations: PatternObservation[];
  todayCount: number;
  total: number;
  latest: string | null;
}

// 即時原始觀測 feed(last_seen DESC · 輕量 · 供湧現迴路頁輪詢)
export async function fetchRecentObservations(limit = 20): Promise<RecentObservations> {
  return apiFetch<RecentObservations>(`/patterns/recent?limit=${limit}`);
}

export async function fetchQueue(): Promise<{ pending: QueueItem[]; recentProcessed: QueueItem[]; stats: QueueStats[] }> {
  return apiFetch<{ pending: QueueItem[]; recentProcessed: QueueItem[]; stats: QueueStats[] }>('/patterns/queue');
}

export interface ToolStat {
  tool_name: string;
  call_count: number;
  avg_results: number;
  avg_similarity: number | null;
  avg_duration_ms: number;
  last_called: string;
}

export interface HotEntry {
  source_table: string;
  entry_id: string;
  entry_title: string;
  hit_count: number;
  confidence: number;
  last_query: string;
  last_seen: string;
}

export interface TopKeyword {
  keyword: string;
  hit_count: number;
  last_seen: string;
}

export interface RetrievalStats {
  toolStats: ToolStat[];
  totalCalls: number;
  modeStats: { search_mode: string; count: number }[];
  hotEntries: HotEntry[];
  topKeywords: TopKeyword[];
}

export async function fetchEmbeddingHealth(): Promise<EmbeddingHealth> {
  return apiFetch<EmbeddingHealth>('/patterns/embedding-health');
}

export async function fetchRetrievalStats(): Promise<RetrievalStats> {
  return apiFetch<RetrievalStats>('/patterns/retrieval-stats');
}
