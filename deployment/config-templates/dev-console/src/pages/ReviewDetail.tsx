import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchReviewReport, fetchReviewFindings, updateFindingStatus, markReportReviewed } from '../services/reviewsApi';
import type { ReviewReport, ReviewFinding, FixStatus } from '../types/reviews';
import '../styles/reviews.css';

const SEVERITY_COLORS: Record<string, string> = {
  P0: '#ef4444', P1: '#f97316', P2: '#eab308', P3: '#3b82f6', P4: '#6b7280',
};
const FIX_STATUS_OPTIONS: { value: FixStatus; label: string }[] = [
  { value: 'open', label: '未修復' },
  { value: 'fixing', label: '修復中' },
  { value: 'fixed', label: '已修復' },
  { value: 'wont_fix', label: '不修復' },
  { value: 'deferred', label: '延後' },
];
const SCORE_LABELS = [
  { key: 'score_functional', label: '功能完整性' },
  { key: 'score_data_consistency', label: '資料一致性' },
  { key: 'score_authorization', label: '權限邊界' },
  { key: 'score_billing', label: '計費正確性' },
  { key: 'score_error_recovery', label: '錯誤恢復' },
  { key: 'score_security', label: '安全合規' },
  { key: 'score_observability', label: '可觀測性' },
  { key: 'score_uiux', label: 'UI/UX 風格' },
];

export default function ReviewDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    try {
      const [reportData, findingsData] = await Promise.all([
        fetchReviewReport(reportId),
        fetchReviewFindings({ report_id: reportId, pageSize: 100 }),
      ]);
      setReport(reportData);
      setFindings(findingsData.findings);
    } catch (e) {
      console.error('Load review detail failed:', e);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFixStatusChange = async (findingId: string, newStatus: FixStatus) => {
    try {
      await updateFindingStatus(findingId, { fix_status: newStatus, fixed_by: 'Alan' });
      setFindings(prev => prev.map(f => f.finding_id === findingId ? { ...f, fix_status: newStatus } : f));
    } catch (e) {
      console.error('Update fix status failed:', e);
    }
  };

  const handleMarkReviewed = async () => {
    if (!reportId) return;
    try {
      await markReportReviewed(reportId, reviewNotes);
      // TZ FIX 2026-05-29: optimistic 值對齊後端 reviewService datetime('now','+8 hours') 的 'YYYY-MM-DD HH:mm:ss' 台灣格式(原 toISOString() 為 UTC 早 8h + 格式不符)
      setReport(prev => prev ? { ...prev, reviewed_by: 'Alan', reviewed_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) } : prev);
    } catch (e) {
      console.error('Mark reviewed failed:', e);
    }
  };

  if (loading) return <div className="reviews-page"><p>載入中...</p></div>;
  if (!report) return <div className="reviews-page"><p>報告不存在</p></div>;

  return (
    <div className="reviews-page">
      <Link to="/reviews" className="back-link">← 返回審查報告列表</Link>

      {/* 報告標頭 */}
      <div className="report-header">
        <h1>{report.module_code} — {report.review_mode.toUpperCase()} Review</h1>
        <div className="report-meta">
          <span>引擎: {report.engine}</span>
          <span>評分: <strong>{report.score_total ?? '—'}</strong>/100</span>
          <span>Bug: <strong>{report.findings_count ?? report.bugs_total}</strong></span>
          <span>日期: {report.completed_at || report.created_at}</span>
        </div>
      </div>

      {/* 八維度評分 */}
      <div className="scores-section">
        <h2>SaaS SOP 八大維度評分</h2>
        <div className="scores-grid">
          {SCORE_LABELS.map(({ key, label }) => {
            const val = (report as any)[key] as number | null;
            const color = val === null ? '#6b7280' : val >= 7 ? '#22c55e' : val >= 5 ? '#eab308' : '#ef4444';
            return (
              <div key={key} className="score-card">
                <div className="score-value" style={{ color }}>{val ?? '—'}</div>
                <div className="score-label">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 人工審查區 */}
      <div className="review-action-section">
        <h2>人工審查</h2>
        {report.reviewed_by ? (
          <div className="reviewed-badge">✅ 已由 {report.reviewed_by} 審查 ({report.reviewed_at})</div>
        ) : (
          <div className="review-form">
            <textarea
              placeholder="審查備註（選填）..."
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              rows={3}
            />
            <button onClick={handleMarkReviewed} className="btn-review">標記為已審查</button>
          </div>
        )}
      </div>

      {/* Bug 發現清單 */}
      <div className="findings-section">
        <h2>Bug 發現清單 ({findings.length})</h2>
        {findings.length === 0 ? <p>本報告無 Bug 發現。</p> : (
          <div className="findings-list">
            {findings.map(f => (
              <div key={f.finding_id} className={`finding-card severity-${f.severity.toLowerCase()}`}>
                <div className="finding-header" onClick={() => setExpandedId(expandedId === f.finding_id ? null : f.finding_id)}>
                  <span className="severity-badge" style={{ backgroundColor: SEVERITY_COLORS[f.severity] }}>{f.severity}</span>
                  <span className="finding-title">{f.finding_id}: {f.title}</span>
                  <span className="finding-type">{f.bug_type}</span>
                  {f.cross_confirmed ? <span className="cross-badge">多引擎確認</span> : null}
                  <select
                    className="fix-status-select"
                    value={f.fix_status}
                    onChange={e => handleFixStatusChange(f.finding_id, e.target.value as FixStatus)}
                    onClick={e => e.stopPropagation()}
                  >
                    {FIX_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {expandedId === f.finding_id && (
                  <div className="finding-detail">
                    {f.file_path && <div><strong>檔案:</strong> {f.file_path}{f.line_number ? `:${f.line_number}` : ''}</div>}
                    {f.description && <div><strong>描述:</strong> {f.description}</div>}
                    {f.root_cause && <div><strong>根因:</strong> {f.root_cause}</div>}
                    {f.fix_suggestion && <div><strong>修復建議:</strong> {f.fix_suggestion}</div>}
                    {f.regression_risk && <div><strong>迴歸風險:</strong> {f.regression_risk}</div>}
                    {f.suggested_story && <div><strong>建議 Story:</strong> {f.suggested_story}</div>}
                    {f.repro_steps && <div><strong>重現步驟:</strong><pre>{f.repro_steps}</pre></div>}
                    {f.fix_story_id && <div><strong>修復 Story:</strong> {f.fix_story_id}</div>}
                    {f.fix_notes && <div><strong>修復備註:</strong> {f.fix_notes}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
