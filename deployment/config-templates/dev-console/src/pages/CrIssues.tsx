// ============================================================
// CrIssues.tsx — CR Issue 追蹤列表頁面
// DVS-07 AC-4: Severity Tabs + Resolution 下拉 + 表格 + 搜尋 + 統計列 + 分頁
// AC-7: URL 查詢參數同步（severity, resolution, search, page）
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar.js';
import Pagination from '../components/Pagination.js';
import IssueTable from '../components/IssueTable.js';
import { fetchCrIssues, fetchCrIssueStats } from '../services/crIssuesApi.js';
import type { CrIssue, CrIssueStats, CrSeverity } from '../types/cr-issues.js';
import '../styles/cr-issues.css';

type SeverityTab = 'all' | CrSeverity;
const SEVERITY_TABS: { value: SeverityTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const RESOLUTION_OPTIONS = [
  { value: '', label: 'All Resolutions' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'wont_fix', label: "Won't Fix" },
  { value: 'pending', label: 'Pending' },
];

const PAGE_SIZE = 20;

export default function CrIssues() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<CrIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CrIssueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const severity = (searchParams.get('severity') ?? 'all') as SeverityTab;
  const resolution = searchParams.get('resolution') ?? '';
  const search = searchParams.get('search') ?? '';
  const page = Math.max(Number(searchParams.get('page') ?? '1'), 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResult, statsResult] = await Promise.all([
        fetchCrIssues({
          severity: severity !== 'all' ? severity : undefined,
          resolution: resolution || undefined,
          search,
          page,
          pageSize: PAGE_SIZE,
        }),
        fetchCrIssueStats(),
      ]);
      setItems(listResult.items);
      setTotal(listResult.total);
      setStats(statsResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [severity, resolution, search, page]);

  useEffect(() => { load(); }, [load]);

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      next.set('page', '1');
      return next;
    });
  }

  function handleSearch(q: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('search', q); else next.delete('search');
      next.set('page', '1');
      return next;
    });
  }

  function handlePage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  }

  return (
    <div className="cr-page">
      <div className="cr-page__header">
        <h1 className="cr-page__title">CR Issue 追蹤</h1>
        <p className="cr-page__desc">Code Review 問題記錄 — 修復狀態追蹤</p>
      </div>

      {/* 統計列 */}
      {stats && (
        <div className="cr-stats">
          <div className="cr-stat-card cr-stat-card--total">
            <span className="cr-stat-count">{stats.total}</span>
            <span className="cr-stat-label">Total</span>
          </div>
          <div className="cr-stat-card cr-stat-card--critical">
            <span className="cr-stat-count">{stats.critical}</span>
            <span className="cr-stat-label">Critical</span>
          </div>
          <div className="cr-stat-card cr-stat-card--high">
            <span className="cr-stat-count">{stats.high}</span>
            <span className="cr-stat-label">High</span>
          </div>
          <div className="cr-stat-card cr-stat-card--medium">
            <span className="cr-stat-count">{stats.medium}</span>
            <span className="cr-stat-label">Medium</span>
          </div>
          <div className="cr-stat-card cr-stat-card--low">
            <span className="cr-stat-count">{stats.low}</span>
            <span className="cr-stat-label">Low</span>
          </div>
        </div>
      )}

      <div className="cr-page__controls">
        <SearchBar
          onSearch={handleSearch}
          placeholder="搜尋 CR Issue（>= 3 字元）…"
          initialValue={search}
        />
        <div className="cr-page__filters">
          {/* Severity Tabs */}
          <div className="cr-severity-tabs">
            {SEVERITY_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`cr-tab ${severity === tab.value ? 'cr-tab--active' : ''} cr-tab--${tab.value}`}
                onClick={() => setParam('severity', tab.value === 'all' ? '' : tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Resolution 下拉 */}
          <select
            className="cr-resolution-select"
            value={resolution}
            onChange={(e) => setParam('resolution', e.target.value)}
          >
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="cr-page__error">⚠️ {error}</div>}

      {loading ? (
        <div className="cr-page__loading">載入中…</div>
      ) : (
        <>
          <div className="cr-page__count">顯示 {items.length} / 共 {total} 筆</div>
          <IssueTable items={items} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={handlePage} />
        </>
      )}
    </div>
  );
}
