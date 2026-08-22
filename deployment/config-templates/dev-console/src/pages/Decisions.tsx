// ============================================================
// Decisions.tsx — 技術決策索引頁面
// DVS-07 AC-2: 搜尋 + Source Tab (All/Context/Tech) + 卡片列表 + 分頁
// AC-7: URL 查詢參數同步（search, source, page）
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar.js';
import Pagination from '../components/Pagination.js';
import DecisionCard from '../components/DecisionCard.js';
import { fetchDecisions } from '../services/decisionsApi.js';
import type { DecisionEntry, DecisionSource } from '../types/decisions.js';
import '../styles/decisions.css';

type SourceTab = 'all' | DecisionSource;
const SOURCE_TABS: { value: SourceTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'context', label: 'Context' },
  { value: 'tech', label: 'Tech' },
];

const PAGE_SIZE = 20;

export default function Decisions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<DecisionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get('search') ?? '';
  const source = (searchParams.get('source') ?? 'all') as SourceTab;
  const page = Math.max(Number(searchParams.get('page') ?? '1'), 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDecisions({ search, source, page, pageSize: PAGE_SIZE });
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, source, page]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(q: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('search', q); else next.delete('search');
      next.set('page', '1');
      return next;
    });
  }

  function handleSource(s: SourceTab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (s === 'all') next.delete('source'); else next.set('source', s);
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
    <div className="decisions-page">
      <div className="decisions-page__header">
        <h1 className="decisions-page__title">技術決策索引</h1>
        <p className="decisions-page__desc">
          彙整 Context Memory DB 中的架構與技術決策記錄
        </p>
      </div>

      <div className="decisions-page__controls">
        <SearchBar
          onSearch={handleSearch}
          placeholder="搜尋決策記錄（>= 3 字元）…"
          initialValue={search}
        />
        <div className="decisions-page__tabs">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`decisions-tab ${source === tab.value ? 'decisions-tab--active' : ''}`}
              onClick={() => handleSource(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="decisions-page__error">⚠️ {error}</div>}

      {loading ? (
        <div className="decisions-page__loading">載入中…</div>
      ) : (
        <>
          <div className="decisions-page__count">共 {total} 筆決策記錄</div>
          <div className="decisions-card-list">
            {items.map((item) => (
              <DecisionCard key={`${item.source}-${item.id}`} item={item} />
            ))}
            {!loading && items.length === 0 && (
              <p className="decisions-page__empty">無符合條件的決策記錄</p>
            )}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={handlePage} />
        </>
      )}
    </div>
  );
}
