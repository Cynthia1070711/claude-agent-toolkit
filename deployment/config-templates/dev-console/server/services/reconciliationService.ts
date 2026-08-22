// ============================================================
// reconciliationService.ts — Review Findings → Tech Debt 同步服務
// dla-06: DevConsole ↔ DB Reconciliation
// 資料來源：review_findings (read) → tech_debt_items (write)
// ============================================================
import { getDb } from '../db.js';

// ── Types ──

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  error_detail?: string;
}

export interface ReconciliationStatus {
  last_sync_at: string | null;
  review_findings_total: number;
  review_findings_actionable: number;
  tech_debt_total: number;
  tech_debt_from_sync: number;
  unsynced_count: number;
  status: 'healthy' | 'needs_sync' | 'error';
}

// ── Severity Mapping (BR-REC-SYNC-MAP) ──

export function mapSeverity(severity: string | null | undefined): string {
  if (!severity) return 'low';
  switch (severity.toUpperCase()) {
    case 'P0': return 'critical';
    case 'P1': return 'high';
    case 'P2': return 'medium';
    case 'P3':
    case 'P4':
    default: return 'low';
  }
}

// ── Fix Status → Debt Status Mapping ──

function mapFixStatus(fixStatus: string): string {
  switch (fixStatus) {
    case 'deferred': return 'open';
    case 'wont_fix': return 'wont-fix';
    default: return 'open';
  }
}

// ── Sync: review_findings → tech_debt_items (BR-REC-SYNC-MAP, BR-REC-DEDUP, BR-REC-ROLLBACK) ──

export function syncReviewFindings(): SyncResult {
  const start = Date.now();
  const db = getDb();

  if (!db) {
    return { synced: 0, skipped: 0, errors: 1, duration_ms: 0, error_detail: 'DB 未連線' };
  }

  try {
    // Query only actionable findings (deferred + wont_fix)
    // JOIN review_reports to resolve story_id from module_code (Spec §3.2)
    const findings = db.prepare(`
      SELECT rf.finding_id, rf.report_id, rf.severity, rf.dimension, rf.title, rf.description,
             rf.file_path, rf.root_cause, rf.fix_suggestion, rf.suggested_story, rf.fix_status, rf.fix_notes,
             COALESCE(rr.module_code, rf.report_id) as resolved_story_id
      FROM review_findings rf
      LEFT JOIN review_reports rr ON rf.report_id = rr.report_id
      WHERE rf.fix_status IN ('deferred', 'wont_fix')
    `).all() as Array<{
      finding_id: string;
      report_id: string | null;
      severity: string | null;
      dimension: string | null;
      title: string | null;
      description: string | null;
      file_path: string | null;
      root_cause: string | null;
      fix_suggestion: string | null;
      suggested_story: string | null;
      fix_status: string;
      fix_notes: string | null;
      resolved_story_id: string | null;
    }>;

    if (findings.length === 0) {
      return { synced: 0, skipped: 0, errors: 0, duration_ms: Date.now() - start };
    }

    let synced = 0;
    let skipped = 0;

    // Use transaction for atomicity (BR-REC-ROLLBACK)
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO tech_debt_items
        (debt_id, story_id, category, severity, dimension, title, description,
         affected_files, fix_guidance, root_cause, target_story, status,
         wont_fix_reason, source_review_date, created_at)
      VALUES
        (@debt_id, @story_id, @category, @severity, @dimension, @title, @description,
         @affected_files, @fix_guidance, @root_cause, @target_story, @status,
         @wont_fix_reason, @source_review_date, @created_at)
    `);

    const now = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';

    const runSync = db.transaction(() => {
      for (const f of findings) {
        const debtId = `RF-${f.finding_id}`;
        const mapped = {
          debt_id: debtId,
          story_id: f.resolved_story_id ?? null,
          category: 'review-finding-sync',
          severity: mapSeverity(f.severity),
          dimension: f.dimension ?? null,
          title: f.title ?? 'Untitled finding',
          description: f.description ?? null,
          affected_files: f.file_path ?? null,
          fix_guidance: f.fix_suggestion ?? null,
          root_cause: f.root_cause ?? null,
          target_story: f.suggested_story ?? null,
          status: mapFixStatus(f.fix_status),
          wont_fix_reason: f.fix_status === 'wont_fix' ? (f.fix_notes ?? null) : null,
          source_review_date: now,
          created_at: now,
        };

        const result = insertStmt.run(mapped);
        if (result.changes > 0) {
          synced++;
        } else {
          skipped++;
        }
      }
    });

    runSync();

    return { synced, skipped, errors: 0, duration_ms: Date.now() - start };
  } catch (err) {
    console.error('[reconciliation-sync] Error:', (err as Error).message);
    return {
      synced: 0,
      skipped: 0,
      errors: 1,
      duration_ms: Date.now() - start,
      error_detail: (err as Error).message,
    };
  }
}

// ── Status: 雙表計數 + 差異分析 (BR-REC-STATUS) ──

export function getReconciliationStatus(): ReconciliationStatus {
  const db = getDb();

  if (!db) {
    return {
      last_sync_at: null,
      review_findings_total: 0,
      review_findings_actionable: 0,
      tech_debt_total: 0,
      tech_debt_from_sync: 0,
      unsynced_count: 0,
      status: 'error',
    };
  }

  try {
    const rfTotal = (db.prepare(
      `SELECT COUNT(*) as cnt FROM review_findings`
    ).get() as { cnt: number }).cnt;

    const rfActionable = (db.prepare(
      `SELECT COUNT(*) as cnt FROM review_findings WHERE fix_status IN ('deferred', 'wont_fix')`
    ).get() as { cnt: number }).cnt;

    const tdTotal = (db.prepare(
      `SELECT COUNT(*) as cnt FROM tech_debt_items`
    ).get() as { cnt: number }).cnt;

    const tdFromSync = (db.prepare(
      `SELECT COUNT(*) as cnt FROM tech_debt_items WHERE debt_id LIKE 'RF-%'`
    ).get() as { cnt: number }).cnt;

    const unsynced = (db.prepare(`
      SELECT COUNT(*) as cnt FROM review_findings rf
      WHERE rf.fix_status IN ('deferred', 'wont_fix')
      AND NOT EXISTS (
        SELECT 1 FROM tech_debt_items td WHERE td.debt_id = 'RF-' || rf.finding_id
      )
    `).get() as { cnt: number }).cnt;

    const lastSync = db.prepare(
      `SELECT MAX(created_at) as last_sync FROM tech_debt_items WHERE debt_id LIKE 'RF-%'`
    ).get() as { last_sync: string | null };

    return {
      last_sync_at: lastSync?.last_sync ?? null,
      review_findings_total: rfTotal,
      review_findings_actionable: rfActionable,
      tech_debt_total: tdTotal,
      tech_debt_from_sync: tdFromSync,
      unsynced_count: unsynced,
      status: unsynced === 0 ? 'healthy' : 'needs_sync',
    };
  } catch (err) {
    console.error('[reconciliation-status] Error:', (err as Error).message);
    return {
      last_sync_at: null,
      review_findings_total: 0,
      review_findings_actionable: 0,
      tech_debt_total: 0,
      tech_debt_from_sync: 0,
      unsynced_count: 0,
      status: 'error',
    };
  }
}
