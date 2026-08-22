// ============================================================
// sprintApi.ts — Sprint API fetch wrapper
// DVS-05 AC-2: Sprint 統計端點
// ============================================================
import type { EpicProgress, ComplexityDistribution } from '../types/sprint.js';
import type { StoryStats } from '../types/stories.js';
import { apiFetch } from './apiClient.js';

export async function fetchSprintStats(epicId?: string): Promise<StoryStats> {
  const qs = epicId ? `?epicId=${encodeURIComponent(epicId)}` : '';
  return apiFetch<StoryStats>(`/sprint/stats${qs}`);
}

export async function fetchEpicProgress(): Promise<EpicProgress[]> {
  return apiFetch<EpicProgress[]>('/sprint/epics');
}

export async function fetchComplexityDistribution(epicId?: string): Promise<ComplexityDistribution> {
  const qs = epicId ? `?epicId=${encodeURIComponent(epicId)}` : '';
  return apiFetch<ComplexityDistribution>(`/sprint/complexity${qs}`);
}
