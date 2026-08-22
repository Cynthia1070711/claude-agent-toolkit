// ============================================================
// dashboardApi.ts — Dashboard API fetch wrapper
// DVS-05 AC-1: 聚合資料端點
// ============================================================
import type { DashboardData } from '../types/dashboard.js';
import { apiFetch } from './apiClient.js';

export async function fetchDashboardData(): Promise<DashboardData> {
  return apiFetch<DashboardData>('/dashboard');
}
