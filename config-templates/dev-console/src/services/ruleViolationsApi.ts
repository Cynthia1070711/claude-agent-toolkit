// ============================================================
// ruleViolationsApi.ts — Rule Violation Tracker API wrapper
// Story: ctr-p2-violation-tracker Task 6.2
// ============================================================
import { apiFetch } from './apiClient.js';

export interface ViolationMetadata {
  violated_rule_path: string;
  rule_loaded_at_time: boolean;
  cli_enforcement: boolean;
  workflow_phase: string;
  severity: string;
  incident_summary: string;
}

export interface ViolationEntry {
  id: number;
  agent_id: string;
  timestamp: string;
  title: string;
  content: string;
  tags: string | null;
  related_files: string | null;
  story_id: string | null;
  epic_id: string | null;
  metadata: ViolationMetadata | null;
}

export interface ViolationStats {
  total_60d: number;
  total_30d_rolling: number;
  baseline: number;
  baseline_compare_pct: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  by_rule: Array<{ rule: string; count: number; last_timestamp: string }>;
  by_phase: Array<{ phase: string; count: number }>;
}

export async function fetchViolationStats(days = 60): Promise<ViolationStats> {
  return apiFetch<ViolationStats>(`/rule-violations/stats?days=${days}`);
}

export async function fetchViolationRecent(limit = 20): Promise<{ items: ViolationEntry[]; total: number }> {
  return apiFetch<{ items: ViolationEntry[]; total: number }>(`/rule-violations/recent?limit=${limit}`);
}
