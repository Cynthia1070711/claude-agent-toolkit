// ============================================================
// TechDebt.tsx — Tech Debt 追蹤板頁面
// DVS-07 AC-6: 狀態分組 (Pending/Resolved/Won't Fix) + 篩選 + 統計 + 搜尋
// AC-7: URL 查詢參數同步（status, severity, dimension, search）
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar.js';
import DebtCard from '../components/DebtCard.js';
import { fetchTechDebt, fetchTechDebtStats } from '../services/techDebtApi.js';
import type { TechDebtEntry, TechDebtStats, DebtStatus, DebtSeverity } from '../types/tech-debt.js';
import { DEBT_SEVERITIES } from '../types/tech-debt.js';
import '../styles/tech-debt.css';

const STATUS_GROUPS: { value: DebtStatus; label: string }[] = [
  { value: 'open', label: '⏳ 開放' },
  { value: 'deferred', label: '⏸️ 延後' },
  { value: 'fixed', label: '✅ 已修復' },
  { value: 'wont-fix', label: '🚫 不修復' },
];

export default function TechDebt() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allItems, setAllItems] = useState<TechDebtEntry[]>([]);
  const [stats, setStats] = useState<TechDebtStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const severity = (searchParams.get('severity') ?? '') as DebtSeverity | '';
  const dimension = searchParams.get('dimension') ?? '';
  const search = searchParams.get('search') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listResult, statsResult] = await Promise.all([
        fetchTechDebt({ severity: severity || undefined, dimension: dimension || undefined, search }),
        fetchTechDebtStats(),
      ]);
      setAllItems(listResult.items);
      setStats(statsResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [severity, dimension, search]);

  useEffect(() => { load(); }, [load]);

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }

  function handleSearch(q: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('search', q); else next.delete('search');
      return next;
    });
  }

  // 抽取所有 dimension 值（用於下拉篩選）
  const dimensions = [...new Set(allItems.map((e) => e.dimension).filter(Boolean))].sort();

  // 按狀態分組
  function getGroup(status: DebtStatus): TechDebtEntry[] {
    return allItems.filter((e) => e.status === status);
  }

  return (
    <div className="debt-page">
      <div className="debt-page__header">
        <h1 className="debt-page__title">Tech Debt 追蹤板</h1>
        <p className="debt-page__desc">
          來源：tech_debt_items（DB-first，{stats?.total ?? 0} 筆）
        </p>
      </div>

      {/* 統計列 */}
      {stats && (
        <div className="debt-stats">
          <div className="debt-stat-card">
            <span className="debt-stat-count">{stats.total}</span>
            <span className="debt-stat-label">Total</span>
          </div>
          <div className="debt-stat-card debt-stat-card--pending">
            <span className="debt-stat-count">{stats.open}</span>
            <span className="debt-stat-label">開放</span>
          </div>
          <div className="debt-stat-card">
            <span className="debt-stat-count">{stats.deferred}</span>
            <span className="debt-stat-label">延後</span>
          </div>
          <div className="debt-stat-card debt-stat-card--resolved">
            <span className="debt-stat-count">{stats.fixed}</span>
            <span className="debt-stat-label">已修復</span>
          </div>
          <div className="debt-stat-card debt-stat-card--wontfix">
            <span className="debt-stat-count">{stats.wont_fix}</span>
            <span className="debt-stat-label">不修復</span>
          </div>
          <div className="debt-stat-card debt-stat-card--critical">
            <span className="debt-stat-count">{stats.critical}</span>
            <span className="debt-stat-label">Critical</span>
          </div>
          <div className="debt-stat-card debt-stat-card--high">
            <span className="debt-stat-count">{stats.high}</span>
            <span className="debt-stat-label">High</span>
          </div>
        </div>
      )}

      {/* 搜尋 + 篩選 */}
      <div className="debt-page__controls">
        <SearchBar
          onSearch={handleSearch}
          placeholder="搜尋技術債（>= 2 字元）…"
          initialValue={search}
        />
        <div className="debt-page__filters">
          <select
            className="debt-filter-select"
            value={severity}
            onChange={(e) => setParam('severity', e.target.value)}
          >
            <option value="">All Severity</option>
            {DEBT_SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="debt-filter-select"
            value={dimension}
            onChange={(e) => setParam('dimension', e.target.value)}
          >
            <option value="">All Dimensions</option>
            {dimensions.map((d) => (
              <option key={d} value={d!}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="debt-page__error">⚠️ {error}</div>}

      {loading ? (
        <div className="debt-page__loading">載入中…</div>
      ) : (
        <div className="debt-groups">
          {STATUS_GROUPS.map(({ value, label }) => {
            const group = getGroup(value);
            return (
              <div key={value} className={`debt-group debt-group--${value}`}>
                <div className="debt-group__heading">
                  <span className="debt-group__title">{label}</span>
                  <span className="debt-group__count">{group.length}</span>
                </div>
                {group.length === 0 ? (
                  <p className="debt-group__empty">無項目</p>
                ) : (
                  <div className="debt-card-list">
                    {group.map((item) => (
                      <DebtCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
