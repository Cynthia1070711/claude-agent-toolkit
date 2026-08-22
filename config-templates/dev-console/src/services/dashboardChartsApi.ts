// ============================================================
// dashboardChartsApi.ts — Memory DB Dashboard chart endpoints
// Story: td-devconsole-godnode-and-mem-dashboard (Phase 3.6)
// ============================================================
import { apiFetch } from './apiClient.js';

export interface DailyContextRow {
  day: string;
  category: string;
  cnt: number;
}

export interface DailyContextResponse {
  data: DailyContextRow[];
  categories: string[];
  days: number;
}

export interface DebtSeverityRow {
  severity: string;
  status: string;
  cnt: number;
}

export interface DebtSeverityResponse {
  data: DebtSeverityRow[];
  severities: string[];
  statuses: string[];
}

export interface IddSubtypeRow {
  idd_type: string;
  status: string;
  cnt: number;
}

export interface IddSubtypeResponse {
  data: IddSubtypeRow[];
  types: string[];
  // CR F-M12 fix: non-canonical IDD type rows aggregated for asymmetric drift visibility
  other_count?: number;
}

export interface StoryFunnelRow {
  status: string;
  cnt: number;
}

export interface StoryFunnelResponse {
  data: StoryFunnelRow[];
  stages: string[];
  other_count: number;
}

export async function fetchDailyContext(days = 30): Promise<DailyContextResponse> {
  return apiFetch<DailyContextResponse>(`/dashboard/daily-context?days=${days}`);
}

export async function fetchDebtSeverity(): Promise<DebtSeverityResponse> {
  return apiFetch<DebtSeverityResponse>('/dashboard/debt-severity');
}

export async function fetchIddSubtypes(): Promise<IddSubtypeResponse> {
  return apiFetch<IddSubtypeResponse>('/dashboard/idd-subtypes');
}

export async function fetchStoryFunnel(): Promise<StoryFunnelResponse> {
  return apiFetch<StoryFunnelResponse>('/dashboard/story-funnel');
}
