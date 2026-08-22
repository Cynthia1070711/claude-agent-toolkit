// ============================================================
// crIssueService.ts — CR Issue 查詢服務
// DVS-07 AC-3: cr_issues 表查詢（FTS5 + severity/resolution/storyId 篩選 + 統計）
// 使用 getDb() singleton；FTS5 安全化使用 sanitizeFtsQuery()
// ============================================================
import { getDb } from '../db.js';
import { sanitizeFtsQuery } from './ftsHelper.js';

export type CrSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CrResolution = 'fixed' | 'deferred' | 'wont_fix' | 'pending';

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

export function listCrIssues(options: {
  severity?: string;
  resolution?: string;
  storyId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): CrIssueListResult {
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1 };

  const { severity, resolution, storyId, search = '', page = 1, pageSize = 20 } = options;
  const safePage = Math.max(page, 1);
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const offset = (safePage - 1) * safePageSize;
  const searchTrimmed = search.trim();

  const params: unknown[] = [];
  let whereClause = '';
  const conditions: string[] = [];

  const ftsQuery = searchTrimmed.length >= 3 ? sanitizeFtsQuery(searchTrimmed) : null;

  let fromClause = 'FROM cr_issues ci';
  if (ftsQuery) {
    fromClause = 'FROM cr_issues ci JOIN cr_issues_fts f ON ci.rowid = f.rowid';
    conditions.push('cr_issues_fts MATCH ?');
    params.push(ftsQuery);
  }

  if (severity) {
    conditions.push('ci.severity = ?');
    params.push(severity);
  }
  if (resolution) {
    conditions.push('ci.resolution = ?');
    params.push(resolution);
  }
  if (storyId) {
    conditions.push('ci.story_id = ?');
    params.push(storyId);
  }

  if (conditions.length > 0) {
    whereClause = 'WHERE ' + conditions.join(' AND ');
  }

  const orderBy = ftsQuery ? 'ORDER BY rank' : 'ORDER BY ci.id DESC';

  const sql = `
    SELECT ci.id, ci.story_id, ci.issue_code, ci.severity, ci.dimension,
           ci.summary, ci.resolution, ci.file_path, ci.target_story, ci.created_at
    ${fromClause}
    ${whereClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS cnt ${fromClause} ${whereClause}`;

  const items = db.prepare(sql).all(...params, safePageSize, offset) as CrIssue[];
  const total = (db.prepare(countSql).get(...params) as { cnt: number }).cnt;

  return { items, total, page: safePage };
}

export function getCrIssueStats(): CrIssueStats {
  const db = getDb();
  if (!db) {
    return { total: 0, critical: 0, high: 0, medium: 0, low: 0, fixed: 0, deferred: 0, wont_fix: 0, pending: 0 };
  }

  const severityRows = db
    .prepare(`SELECT severity, COUNT(*) AS cnt FROM cr_issues GROUP BY severity`)
    .all() as Array<{ severity: string; cnt: number }>;

  const resolutionRows = db
    .prepare(`SELECT resolution, COUNT(*) AS cnt FROM cr_issues GROUP BY resolution`)
    .all() as Array<{ resolution: string; cnt: number }>;

  const total = (db.prepare(`SELECT COUNT(*) AS cnt FROM cr_issues`).get() as { cnt: number }).cnt;

  const bySeverity: Record<string, number> = {};
  for (const r of severityRows) bySeverity[r.severity] = r.cnt;

  const byResolution: Record<string, number> = {};
  for (const r of resolutionRows) byResolution[r.resolution] = r.cnt;

  return {
    total,
    critical: bySeverity['critical'] ?? 0,
    high: bySeverity['high'] ?? 0,
    medium: bySeverity['medium'] ?? 0,
    low: bySeverity['low'] ?? 0,
    fixed: byResolution['fixed'] ?? 0,
    deferred: byResolution['deferred'] ?? 0,
    wont_fix: byResolution['wont_fix'] ?? 0,
    pending: byResolution['pending'] ?? 0,
  };
}
