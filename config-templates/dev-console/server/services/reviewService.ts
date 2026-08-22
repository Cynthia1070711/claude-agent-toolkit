import { getDb } from '../db.js';

const EMPTY_STATS = {
  reportStats: { total_reports: 0, completed: 0, pending: 0, failed: 0, avg_score: null, total_p0: 0, total_p1: 0, total_p2: 0, total_p3: 0, total_p4: 0, total_bugs: 0 },
  findingStats: [],
  moduleProgress: [],
  plans: [],
};

// ─── 報告查詢 ───
export function listReviewReports(filters: {
  plan_id?: string;
  module_code?: string;
  engine?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  if (!db) return { reports: [], total: 0 };

  const { plan_id, module_code, engine, status, page = 1, pageSize = 20 } = filters;

  let where = '1=1';
  const params: Record<string, unknown> = {};
  if (plan_id) { where += ' AND plan_id = @plan_id'; params.plan_id = plan_id; }
  if (module_code) { where += ' AND module_code = @module_code'; params.module_code = module_code; }
  if (engine) { where += ' AND engine = @engine'; params.engine = engine; }
  if (status) { where += ' AND status = @status'; params.status = status; }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM review_reports WHERE ${where}`).get(params) as { cnt: number };
  const reports = db.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id) as findings_count,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P0') as findings_p0,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P1') as findings_p1,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P2') as findings_p2,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P3') as findings_p3,
       (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P4') as findings_p4
     FROM review_reports r WHERE ${where} ORDER BY r.created_at DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  return { reports, total: total.cnt };
}

// ─── 單一報告 ───
export function getReviewReport(reportId: string) {
  const db = getDb();
  if (!db) return null;
  return db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id) as findings_count,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P0') as findings_p0,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P1') as findings_p1,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P2') as findings_p2,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P3') as findings_p3,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id AND f.severity = 'P4') as findings_p4
    FROM review_reports r WHERE r.report_id = ?
  `).get(reportId);
}

// ─── 發現查詢 ───
export function listReviewFindings(filters: {
  report_id?: string;
  module_code?: string;
  severity?: string;
  fix_status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  if (!db) return { findings: [], total: 0 };

  const { report_id, module_code, severity, fix_status, search, page = 1, pageSize = 20 } = filters;

  let where = '1=1';
  const params: Record<string, unknown> = {};

  if (report_id) { where += ' AND report_id = @report_id'; params.report_id = report_id; }
  if (module_code) { where += ' AND module_code = @module_code'; params.module_code = module_code; }
  if (severity) { where += ' AND severity = @severity'; params.severity = severity; }
  if (fix_status) { where += ' AND fix_status = @fix_status'; params.fix_status = fix_status; }

  // FTS5 搜尋（>= 3 字元）
  if (search && search.length >= 3) {
    const ftsIds = db.prepare(
      `SELECT rowid FROM review_findings_fts WHERE review_findings_fts MATCH @search`
    ).all({ search: `"${search}"` }).map((r: any) => r.rowid);

    if (ftsIds.length === 0) return { findings: [], total: 0 };
    where += ` AND id IN (${ftsIds.join(',')})`;
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM review_findings WHERE ${where}`).get(params) as { cnt: number };
  const findings = db.prepare(
    `SELECT * FROM review_findings WHERE ${where}
     ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END
     LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  return { findings, total: total.cnt };
}

// ─── 更新發現修復狀態 ───
export function updateFindingFixStatus(findingId: string, updates: {
  fix_status?: string;
  fix_story_id?: string;
  fix_notes?: string;
  fixed_by?: string;
}) {
  const db = getDb();
  if (!db) return { changes: 0 };

  const fields: string[] = [];
  const params: Record<string, unknown> = { finding_id: findingId };

  if (updates.fix_status) { fields.push('fix_status = @fix_status'); params.fix_status = updates.fix_status; }
  if (updates.fix_story_id) { fields.push('fix_story_id = @fix_story_id'); params.fix_story_id = updates.fix_story_id; }
  if (updates.fix_notes !== undefined) { fields.push('fix_notes = @fix_notes'); params.fix_notes = updates.fix_notes; }
  if (updates.fixed_by) { fields.push('fixed_by = @fixed_by'); params.fixed_by = updates.fixed_by; }

  // TZ FIX (2026-05-29 Constitutional Timestamp Mandate UTC+8): datetime('now') 回 UTC(早 8h)
  //   → datetime('now','+8 hours') 寫台灣時間;格式維持 'YYYY-MM-DD HH:mm:ss'(與 review 表既有欄一致)
  if (updates.fix_status === 'fixed') {
    fields.push("fixed_at = datetime('now','+8 hours')");
  }

  fields.push("updated_at = datetime('now','+8 hours')");

  const result = db.prepare(
    `UPDATE review_findings SET ${fields.join(', ')} WHERE finding_id = @finding_id`
  ).run(params);

  return { changes: result.changes };
}

// ─── 更新報告人工審查 ───
export function updateReportReview(reportId: string, updates: {
  reviewed_by?: string;
  review_notes?: string;
}) {
  const db = getDb();
  if (!db) return { changes: 0 };

  const result = db.prepare(`
    UPDATE review_reports
    SET reviewed_by = @reviewed_by,
        reviewed_at = datetime('now','+8 hours'),
        review_notes = @review_notes,
        updated_at = datetime('now','+8 hours')
    WHERE report_id = @report_id
  `).run({
    report_id: reportId,
    reviewed_by: updates.reviewed_by || 'Alan',
    review_notes: updates.review_notes || null,
  });

  return { changes: result.changes };
}

// ─── 統計 ───
export function getReviewStats(planId?: string) {
  const db = getDb();
  if (!db) return EMPTY_STATS;

  const planFilter = planId ? `AND plan_id = '${planId}'` : '';

  const reportStats = db.prepare(`
    SELECT
      COUNT(*) as total_reports,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      ROUND(AVG(score_total), 1) as avg_score,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter}) AND f2.severity = 'P0') as total_p0,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter}) AND f2.severity = 'P1') as total_p1,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter}) AND f2.severity = 'P2') as total_p2,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter}) AND f2.severity = 'P3') as total_p3,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter}) AND f2.severity = 'P4') as total_p4,
      (SELECT COUNT(*) FROM review_findings f2 WHERE f2.report_id IN (SELECT report_id FROM review_reports r2 WHERE 1=1 ${planFilter})) as total_bugs
    FROM review_reports WHERE 1=1 ${planFilter}
  `).get();

  const findingStats = db.prepare(`
    SELECT fix_status, COUNT(*) as count
    FROM review_findings
    ${planId ? `WHERE report_id IN (SELECT report_id FROM review_reports WHERE plan_id = '${planId}')` : ''}
    GROUP BY fix_status
  `).all();

  const moduleProgress = db.prepare(`
    SELECT
      module_code,
      GROUP_CONCAT(DISTINCT engine) as engines,
      GROUP_CONCAT(DISTINCT review_mode) as modes,
      COUNT(*) as report_count,
      (SELECT COUNT(*) FROM review_findings f3 WHERE f3.module_code = r.module_code AND f3.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter})) as bugs,
      ROUND(AVG(score_total), 1) as avg_score
    FROM review_reports r WHERE r.status = 'completed' ${planFilter}
    GROUP BY module_code
    ORDER BY module_code
  `).all();

  const plans = db.prepare('SELECT * FROM review_plans ORDER BY created_at DESC').all();

  return { reportStats, findingStats, moduleProgress, plans };
}
