// ============================================================
// Sessions.tsx — Session 工作時間軸頁面
// DVS-06 AC-2~4: 垂直時間軸 + 篩選面板 + 展開節點
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionTimelineItemDto, SessionQueryParams } from '../types/session.js';
import { fetchSessionTimeline, fetchSessionFilters } from '../services/sessionApi.js';
import TimelineNode from '../components/TimelineNode.js';
import SessionFilterPanel from '../components/SessionFilterPanel.js';
import '../styles/sessions.css';

const DEFAULT_PAGE_SIZE = 20;

function buildInitialFilters(searchParams: URLSearchParams): SessionQueryParams {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    startDate: searchParams.get('startDate') ?? monthAgo,
    endDate: searchParams.get('endDate') ?? today,
    agent: searchParams.get('agent') ?? undefined,
    tags: searchParams.get('tags') ?? undefined,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

export default function Sessions() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<SessionQueryParams>(() =>
    buildInitialFilters(searchParams),
  );
  const [items, setItems] = useState<SessionTimelineItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [agents, setAgents] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── 載入篩選選項（僅一次）──
  useEffect(() => {
    fetchSessionFilters()
      .then(data => {
        setAgents(data.agents);
        setTags(data.tags);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // ── 載入時間軸資料 ──
  const fetchTimeline = useCallback(async (params: SessionQueryParams) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSessionTimeline(params);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTimeline(filters);
    // 同步 URL query string（可分享連結）
    const params: Record<string, string> = {};
    if (filters.startDate) params['startDate'] = filters.startDate;
    if (filters.endDate) params['endDate'] = filters.endDate;
    if (filters.agent) params['agent'] = filters.agent;
    if (filters.tags) params['tags'] = filters.tags;
    setSearchParams(params, { replace: true });
  }, [filters, fetchTimeline, setSearchParams]);

  function handleFiltersChange(newFilters: SessionQueryParams) {
    setFilters({ ...newFilters, page: 1 });
  }

  const totalPages = Math.ceil(total / DEFAULT_PAGE_SIZE);
  const currentPage = filters.page ?? 1;

  return (
    <div>
      {/* 頁面標題 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--dvc-text-primary)' }}>
          ⏱ Session 時間軸
        </h1>
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--dvc-text-muted)' }}>載入中…</span>
        )}
        {!loading && (
          <span style={{ fontSize: 12, color: 'var(--dvc-text-muted)' }}>
            共 {total} 筆記錄
          </span>
        )}
      </div>

      {/* 篩選面板 */}
      <SessionFilterPanel
        filters={filters}
        agents={agents}
        tags={tags}
        onFiltersChange={handleFiltersChange}
      />

      {/* 錯誤提示 */}
      {error && (
        <div className="dvc-error-block" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* 時間軸 */}
      {!loading && items.length === 0 && !error && (
        <div className="dvc-empty-state">
          <div className="dvc-empty-state-icon">📭</div>
          <div>沒有符合條件的 Session 記錄</div>
          <div className="dvc-empty-state-hint">試著調整篩選條件或擴大日期範圍</div>
        </div>
      )}

      {items.length > 0 && (
        <div className="dvc-timeline">
          {items.map(item => (
            <TimelineNode key={`${item.source}-${item.id}`} item={item} />
          ))}
        </div>
      )}

      {/* 分頁 */}
      {totalPages > 1 && (
        <div className="dvc-session-pagination">
          <button
            className="dvc-session-page-btn"
            disabled={currentPage <= 1}
            onClick={() => setFilters(f => ({ ...f, page: currentPage - 1 }))}
            type="button"
          >
            ←
          </button>
          <span className="dvc-session-page-info">
            {currentPage} / {totalPages}
          </span>
          <button
            className="dvc-session-page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setFilters(f => ({ ...f, page: currentPage + 1 }))}
            type="button"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
