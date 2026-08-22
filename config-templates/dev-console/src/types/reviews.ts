// PhyCool Review Analyst — TypeScript 型別定義

export type ReviewMode = 'code' | 'e2e';
export type ReviewEngine = 'cc-opus' | 'gemini' | 'antigravity';
export type ReviewStatus = 'pending' | 'in-progress' | 'completed' | 'failed';
export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type FixStatus = 'open' | 'fixing' | 'fixed' | 'wont_fix' | 'deferred';

export interface ReviewPlan {
  id: number;
  plan_id: string;
  plan_date: string;
  status: string;
  total_modules: number;
  total_groups: number;
  completed_modules: number;
  failed_modules: number;
  created_by: string;
  created_at: string;
}

export interface ReviewReport {
  id: number;
  report_id: string;
  plan_id: string | null;
  module_code: string;
  review_mode: ReviewMode;
  engine: ReviewEngine;
  status: ReviewStatus;
  score_functional: number | null;
  score_data_consistency: number | null;
  score_authorization: number | null;
  score_billing: number | null;
  score_error_recovery: number | null;
  score_security: number | null;
  score_observability: number | null;
  score_uiux: number | null;
  score_total: number | null;
  bugs_p0: number;
  bugs_p1: number;
  bugs_p2: number;
  bugs_p3: number;
  bugs_p4: number;
  bugs_total: number;
  findings_count?: number;
  findings_p0?: number;
  findings_p1?: number;
  findings_p2?: number;
  findings_p3?: number;
  findings_p4?: number;
  lifecycle_pass: number;
  lifecycle_warn: number;
  lifecycle_fail: number;
  lifecycle_skip: number;
  started_at: string | null;
  completed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  report_path: string | null;
  created_at: string;
}

export interface ReviewFinding {
  id: number;
  finding_id: string;
  report_id: string;
  module_code: string;
  severity: FindingSeverity;
  bug_type: string;
  dimension: string | null;
  title: string;
  description: string | null;
  file_path: string | null;
  line_number: number | null;
  root_cause: string | null;
  fix_suggestion: string | null;
  affected_files: string | null;
  regression_risk: string | null;
  suggested_story: string | null;
  engine: ReviewEngine;
  cross_confirmed: number;
  cross_engines: string | null;
  repro_steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  screenshot_before: string | null;
  screenshot_after: string | null;
  fix_status: FixStatus;
  fix_story_id: string | null;
  fix_notes: string | null;
  fixed_at: string | null;
  fixed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface ReviewStats {
  total_reports: number;
  completed: number;
  pending: number;
  failed: number;
  avg_score: number | null;
  total_p0: number;
  total_p1: number;
  total_p2: number;
  total_p3: number;
  total_p4: number;
  total_bugs: number;
}

export interface FindingStats {
  fix_status: FixStatus;
  count: number;
}

export interface ModuleProgress {
  module_code: string;
  engines: string;
  modes: string;
  report_count: number;
  bugs: number;
  avg_score: number | null;
}

export interface ReviewReportListResult {
  reports: ReviewReport[];
  total: number;
}

export interface ReviewFindingListResult {
  findings: ReviewFinding[];
  total: number;
}

export interface ReviewReportsQuery {
  plan_id?: string;
  module_code?: string;
  engine?: ReviewEngine;
  status?: ReviewStatus;
  page?: number;
  pageSize?: number;
}

export interface ReviewFindingsQuery {
  report_id?: string;
  module_code?: string;
  severity?: FindingSeverity;
  fix_status?: FixStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}
