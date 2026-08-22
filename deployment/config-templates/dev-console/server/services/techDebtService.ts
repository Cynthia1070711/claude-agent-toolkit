// ============================================================
// techDebtService.ts — Tech Debt DB 查詢服務
// 資料來源：tech_debt_items 表（DB-first，registry.yaml 已廢止）
// ============================================================
import { getDb } from '../db.js';

export type DebtStatus = 'open' | 'fixed' | 'wont-fix' | 'deferred';
export type DebtSeverity = 'critical' | 'high' | 'medium' | 'low';

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

export function listTechDebt(options: {
  status?: string;
  severity?: string;
  dimension?: string;
  search?: string;
}): TechDebtListResult {
  const db = getDb();
  if (!db) return { items: [], total: 0 };

  const { status, severity, dimension, search = '' } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (severity) {
    conditions.push('LOWER(severity) = LOWER(?)');
    params.push(severity);
  }
  if (dimension) {
    conditions.push('LOWER(dimension) = LOWER(?)');
    params.push(dimension);
  }
  if (search.trim().length >= 2) {
    conditions.push('(title LIKE ? OR description LIKE ? OR debt_id LIKE ?)');
    const searchParam = `%${search.trim()}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const items = db.prepare(
    `SELECT * FROM tech_debt_items ${where} ORDER BY created_at DESC`
  ).all(...params) as TechDebtEntry[];

  return { items, total: items.length };
}

export function getTechDebtStats(): TechDebtStats {
  const db = getDb();
  if (!db) {
    return { total: 0, open: 0, fixed: 0, deferred: 0, wont_fix: 0, critical: 0, high: 0, medium: 0, low: 0 };
  }

  const rows = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'fixed' THEN 1 ELSE 0 END) as fixed,
      SUM(CASE WHEN status = 'deferred' THEN 1 ELSE 0 END) as deferred,
      SUM(CASE WHEN status = 'wont-fix' THEN 1 ELSE 0 END) as wont_fix,
      SUM(CASE WHEN LOWER(severity) = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN LOWER(severity) = 'high' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN LOWER(severity) = 'medium' THEN 1 ELSE 0 END) as medium,
      SUM(CASE WHEN LOWER(severity) = 'low' THEN 1 ELSE 0 END) as low
    FROM tech_debt_items
  `).get() as TechDebtStats;

  return rows;
}
