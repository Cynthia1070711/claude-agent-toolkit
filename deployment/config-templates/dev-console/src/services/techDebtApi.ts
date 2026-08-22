// ============================================================
// techDebtApi.ts — Tech Debt API fetch wrappers
// DVS-07 AC-5/6
// ============================================================
import type { TechDebtListResult, TechDebtStats } from '../types/tech-debt.js';

const BASE = '/api/tech-debt';

export interface TechDebtQuery {
  status?: string;
  severity?: string;
  dimension?: string;
  search?: string;
}

export async function fetchTechDebt(q: TechDebtQuery = {}): Promise<TechDebtListResult> {
  const params = new URLSearchParams();
  if (q.status) params.set('status', q.status);
  if (q.severity) params.set('severity', q.severity);
  if (q.dimension) params.set('dimension', q.dimension);
  if (q.search) params.set('search', q.search);

  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`tech-debt API error: ${res.status}`);
  return res.json() as Promise<TechDebtListResult>;
}

export async function fetchTechDebtStats(): Promise<TechDebtStats> {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error(`tech-debt stats API error: ${res.status}`);
  return res.json() as Promise<TechDebtStats>;
}
