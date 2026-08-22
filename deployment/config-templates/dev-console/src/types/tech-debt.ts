// ============================================================
// tech-debt.ts — Tech Debt 前端型別定義
// DB-first: 對齊 tech_debt_items 表 schema
// ============================================================

export type DebtStatus = 'open' | 'fixed' | 'deferred' | 'wont-fix';
export type DebtSeverity = 'critical' | 'high' | 'medium' | 'low';

export const DEBT_STATUSES: DebtStatus[] = ['open', 'deferred', 'fixed', 'wont-fix'];
export const DEBT_SEVERITIES: DebtSeverity[] = ['critical', 'high', 'medium', 'low'];

export interface TechDebtEntry {
  id: number;
  debt_id: string;
  story_id: string | null;
  category: string | null;
  severity: DebtSeverity;
  dimension: string | null;
  title: string;
  description: string | null;
  affected_files: string | null;
  fix_guidance: string | null;
  root_cause: string | null;
  target_story: string | null;
  status: DebtStatus;
  wont_fix_reason: string | null;
  source_review_date: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_in_story: string | null;
}

export interface TechDebtStats {
  total: number;
  open: number;
  fixed: number;
  deferred: number;
  wont_fix: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TechDebtListResult {
  items: TechDebtEntry[];
  total: number;
}
