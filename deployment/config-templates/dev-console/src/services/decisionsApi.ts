// ============================================================
// decisionsApi.ts — 技術決策 API fetch wrapper
// DVS-07 AC-1/2
// ============================================================
import type { DecisionListResult } from '../types/decisions.js';

const BASE = '/api/decisions';

export interface DecisionsQuery {
  search?: string;
  source?: 'context' | 'tech' | 'all';
  page?: number;
  pageSize?: number;
}

export async function fetchDecisions(q: DecisionsQuery = {}): Promise<DecisionListResult> {
  const params = new URLSearchParams();
  if (q.search) params.set('search', q.search);
  if (q.source) params.set('source', q.source);
  if (q.page) params.set('page', String(q.page));
  if (q.pageSize) params.set('pageSize', String(q.pageSize));

  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`decisions API error: ${res.status}`);
  return res.json() as Promise<DecisionListResult>;
}
