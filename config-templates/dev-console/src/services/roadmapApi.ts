// ============================================================
// roadmapApi.ts — /api/roadmap 前端 API client（tdb-1-track-plan-roadmap）
// GET-only（唯讀頁），走既有 apiFetch。
// ============================================================
import { apiFetch } from './apiClient.js';
import type { RoadmapResult } from '../types/roadmap.js';

export async function fetchRoadmap(): Promise<RoadmapResult> {
  return apiFetch<RoadmapResult>('/roadmap');
}
