// ============================================================
// cr-issues.ts — CR Issue 前端型別定義
// DVS-07 AC-3/4: cr_issues 表查詢與統計
// ============================================================

export type CrSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CrResolution = 'fixed' | 'deferred' | 'wont_fix' | 'pending';

export const CR_SEVERITIES: CrSeverity[] = ['critical', 'high', 'medium', 'low'];
export const CR_RESOLUTIONS: CrResolution[] = ['fixed', 'deferred', 'wont_fix', 'pending'];

export interface CrIssue {
  id: number;
  story_id: string;
  issue_code: string;
  severity: CrSeverity;
  dimension: string | null;
  summary: string;
  resolution: CrResolution;
  file_path: string | null;
  target_story: string | null;
  created_at: string;
}

export interface CrIssueStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixed: number;
  deferred: number;
  wont_fix: number;
  pending: number;
}

export interface CrIssueListResult {
  items: CrIssue[];
  total: number;
  page: number;
}
