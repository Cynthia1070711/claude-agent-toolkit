import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchReviewStats, fetchReviewReports } from '../services/reviewsApi';
import type { ReviewReport, ReviewStats, ReviewStatus, ModuleProgress } from '../types/reviews';
import Pagination from '../components/Pagination';
import '../styles/reviews.css';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待執行', color: '#6b7280' },
  'in-progress': { label: '執行中', color: '#3b82f6' },
  completed: { label: '已完成', color: '#22c55e' },
  failed: { label: '失敗', color: '#ef4444' },
};
const ENGINE_LABELS: Record<string, string> = {
  'cc-opus': 'Claude', gemini: 'Gemini', antigravity: 'Antigravity',
};

export default function Reviews() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [moduleProgress, setModuleProgress] = useState<ModuleProgress[]>([]);
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const page = Number(searchParams.get('page') || '1');
  const statusFilter = searchParams.get('status') || '';
  const engineFilter = searchParams.get('engine') || '';
  const moduleFilter = searchParams.get('module') || '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, reportsData] = await Promise.all([
        fetchReviewStats(),
        fetchReviewReports({
          status: (statusFilter as ReviewStatus) || undefined,
          engine: engineFilter as any || undefined,
          module_code: moduleFilter || undefined,
          page, pageSize: 20,
        }),
      ]);
      setStats(statsData.reportStats);
      setModuleProgress(statsData.moduleProgress || []);
      setReports(reportsData.reports);
      setTotal(reportsData.total);
    } catch (e) {
      console.error('Load reviews failed:', e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, engineFilter, moduleFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.set('page', '1');
    setSearchParams(next);
  };

  return (
    <div className="reviews-page">
      <h1>審查報告追蹤</h1>

      {/* 統計卡片 */}
      {stats && (
        <div className="review-stats-grid">
          <div className="stat-card"><div className="stat-value">{stats.total_reports}</div><div className="stat-label">總報告數</div></div>
          <div className="stat-card stat-ok"><div className="stat-value">{stats.completed}</div><div className="stat-label">已完成</div></div>
          <div className="stat-card stat-warn"><div className="stat-value">{stats.pending}</div><div className="stat-label">待執行</div></div>
          <div className="stat-card"><div className="stat-value">{stats.avg_score ?? '—'}</div><div className="stat-label">平均評分</div></div>
          <div className="stat-card stat-critical"><div className="stat-value">{stats.total_p0}</div><div className="stat-label">P0 Critical</div></div>
          <div className="stat-card stat-high"><div className="stat-value">{stats.total_p1}</div><div className="stat-label">P1 High</div></div>
          <div className="stat-card"><div className="stat-value">{stats.total_bugs}</div><div className="stat-label">Bug 總數</div></div>
        </div>
      )}

      {/* 模組進度矩陣 */}
      {moduleProgress.length > 0 && (
        <div className="module-progress-section">
          <h2>模組審查進度</h2>
          <table className="module-progress-table">
            <thead>
              <tr><th>模組</th><th>引擎</th><th>模式</th><th>報告數</th><th>Bug</th><th>評分</th></tr>
            </thead>
            <tbody>
              {moduleProgress.map(m => (
                <tr key={m.module_code}>
                  <td><strong>{m.module_code}</strong></td>
                  <td>{m.engines}</td>
                  <td>{m.modes}</td>
                  <td>{m.report_count}</td>
                  <td>{m.bugs}</td>
                  <td>{m.avg_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 篩選 */}
      <div className="review-filters">
        <select value={statusFilter} onChange={e => updateFilter('status', e.target.value)}>
          <option value="">全部狀態</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={engineFilter} onChange={e => updateFilter('engine', e.target.value)}>
          <option value="">全部引擎</option>
          {Object.entries(ENGINE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text" placeholder="模組代碼篩選..."
          value={moduleFilter} onChange={e => updateFilter('module', e.target.value)}
        />
      </div>

      {/* 報告列表 */}
      {loading ? <p>載入中...</p> : (
        <table className="review-reports-table">
          <thead>
            <tr>
              <th>報告 ID</th><th>模組</th><th>模式</th><th>引擎</th>
              <th>狀態</th><th>評分</th><th>Bug</th><th>已審查</th><th>日期</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.report_id}>
                <td><Link to={`/reviews/${encodeURIComponent(r.report_id)}`}>{r.report_id}</Link></td>
                <td><strong>{r.module_code}</strong></td>
                <td><span className={`mode-badge mode-${r.review_mode}`}>{r.review_mode}</span></td>
                <td>{ENGINE_LABELS[r.engine] || r.engine}</td>
                <td>
                  <span className="status-dot" style={{ backgroundColor: STATUS_LABELS[r.status]?.color || '#6b7280' }} />
                  {STATUS_LABELS[r.status]?.label || r.status}
                </td>
                <td>{r.score_total ?? '—'}</td>
                <td>
                  {(r.findings_count ?? r.bugs_total) > 0 ? (
                    <span className="bug-summary" title={`P0:${r.findings_p0 ?? r.bugs_p0} P1:${r.findings_p1 ?? r.bugs_p1} P2:${r.findings_p2 ?? r.bugs_p2} P3:${r.findings_p3 ?? r.bugs_p3} P4:${r.findings_p4 ?? r.bugs_p4}`}>
                      <strong>{r.findings_count ?? r.bugs_total}</strong>
                      <span className="bug-breakdown">
                        {(r.findings_p0 ?? r.bugs_p0) > 0 && <span className="bug-count p0">{r.findings_p0 ?? r.bugs_p0}</span>}
                        {(r.findings_p1 ?? r.bugs_p1) > 0 && <span className="bug-count p1">{r.findings_p1 ?? r.bugs_p1}</span>}
                        {(r.findings_p2 ?? r.bugs_p2) > 0 && <span className="bug-count p2">{r.findings_p2 ?? r.bugs_p2}</span>}
                        {(r.findings_p3 ?? r.bugs_p3) > 0 && <span className="bug-count p3">{r.findings_p3 ?? r.bugs_p3}</span>}
                        {(r.findings_p4 ?? r.bugs_p4) > 0 && <span className="bug-count p4">{r.findings_p4 ?? r.bugs_p4}</span>}
                      </span>
                    </span>
                  ) : '—'}
                </td>
                <td>{r.reviewed_by ? `✅ ${r.reviewed_by}` : '—'}</td>
                <td>{r.created_at?.split('T')[0] || r.created_at?.split(' ')[0]}</td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={9} className="empty-row">尚無審查報告。執行 <code>/phycool-review-analyst plan</code> 開始規劃。</td></tr>
            )}
          </tbody>
        </table>
      )}

      <Pagination page={page} pageSize={20} total={total}
        onPageChange={p => { const next = new URLSearchParams(searchParams); next.set('page', String(p)); setSearchParams(next); }} />
    </div>
  );
}
