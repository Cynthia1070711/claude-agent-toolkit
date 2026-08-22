// ============================================================
// crIssuesApi.ts — CR Issue API fetch wrappers
// DVS-07 AC-3/4
// ============================================================
import type { CrIssueListResult, CrIssueStats } from '../types/cr-issues.js';

const BASE = '/api/cr-issues';

export interface CrIssuesQuery {
  severity?: string;
  resolution?: string;
  storyId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchCrIssues(q: CrIssuesQuery = {}): Promise<CrIssueListResult> {
  const params = new URLSearchParams();
  if (q.severity) params.set('severity', q.severity);
  if (q.resolution) params.set('resolution', q.resolution);
  if (q.storyId) params.set('storyId', q.storyId);
  if (q.search) params.set('search', q.search);
  if (q.page) params.set('page', String(q.page));
  if (q.pageSize) params.set('pageSize', String(q.pageSize));

  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`cr-issues API error: ${res.status}`);
  return res.json() as Promise<CrIssueListResult>;
}

export async function fetchCrIssueStats(): Promise<CrIssueStats> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`cr-issues stats API error: ${res.status}`);
  return res.json() as Promise<CrIssueStats>;
}
