// ============================================================
// Stories.tsx — Story Kanban 看板主頁面 + i18n
// DVS-07: 時間篩選 + 搜尋 + 排序 + 獨立捲動
// [tdb-2 BR-014, 2026-07-28] Sync 流程（preview → Modal → execute）已隨
// sprint-status.yaml 凍結整體退場 — 狀態變更改直接 PATCH /api/stories/:key/status
// （DB-only，無需比對 yaml 漂移的預覽步驟）。
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Story, StoryStats, EpicSummary } from '../types/stories';
import { useI18n } from '../i18n/I18nProvider';
import StatsBar from '../components/StatsBar';
import KanbanBoard from '../components/KanbanBoard';
import '../styles/kanban.css';

const API_BASE = 'http://127.0.0.1:3001/api';

type DateRange = 'today' | '3d' | 'week' | 'month' | '';
type SortBy = 'date_desc' | 'date_asc' | 'epic_asc' | 'epic_desc';
type CompletionFilter = 'incomplete' | 'completed' | 'all';

const DONE_STATUSES = ['done', 'cancelled', 'skipped', 'split', 'superseded'];

const DATE_RANGE_OPTIONS: { value: DateRange; labelKey: 'today' | 'threeDays' | 'thisWeek' | 'thisMonth' | 'all' }[] = [
  { value: 'today', labelKey: 'today' },
  { value: '3d', labelKey: 'threeDays' },
  { value: 'week', labelKey: 'thisWeek' },
  { value: 'month', labelKey: 'thisMonth' },
  { value: '', labelKey: 'all' },
];

export default function Stories() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const epicId = searchParams.get('epicId') ?? '';

  const [stories, setStories] = useState<Story[]>([]);
  const [allStories, setAllStories] = useState<Story[]>([]); // 全量（不受日期篩選）用於 Epic 完成度判定
  const [stats, setStats] = useState<StoryStats | null>(null);
  const [epics, setEpics] = useState<EpicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── DVS-07 篩選狀態 ──
  const [dateRange, setDateRange] = useState<DateRange>('');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('incomplete');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── 載入資料（含所有篩選參數）──
  const fetchData = useCallback(async (
    filterEpicId: string,
    filterDateRange: DateRange,
    filterSearch: string,
    filterSort: SortBy,
  ) => {
    // 取消前一個進行中的請求（BR-004 快速切換）
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterEpicId) params.set('epicId', filterEpicId);
      if (filterDateRange) params.set('dateRange', filterDateRange);
      if (filterSearch) params.set('search', filterSearch);
      if (filterSort !== 'date_desc') params.set('sort', filterSort);

      const qs = params.toString() ? `?${params.toString()}` : '';

      // Stats 也需要 dateRange + epicId（BR-010）
      const statsParams = new URLSearchParams();
      if (filterEpicId) statsParams.set('epicId', filterEpicId);
      if (filterDateRange) statsParams.set('dateRange', filterDateRange);
      const statsQs = statsParams.toString() ? `?${statsParams.toString()}` : '';

      // 全量查詢（不帶任何篩選）用於 Epic 完成度判定
      const allQs = '';

      const [storiesRes, statsRes, epicsRes, allStoriesRes] = await Promise.all([
        fetch(`${API_BASE}/stories${qs}`, { signal: controller.signal }),
        fetch(`${API_BASE}/stories/stats${statsQs}`, { signal: controller.signal }),
        fetch(`${API_BASE}/stories/epics`, { signal: controller.signal }),
        fetch(`${API_BASE}/stories${allQs}`, { signal: controller.signal }),
      ]);

      if (!storiesRes.ok || !statsRes.ok || !epicsRes.ok || !allStoriesRes.ok) {
        throw new Error(t.stories.errorLoad);
      }

      const [storiesData, statsData, epicsData, allStoriesData] = await Promise.all([
        storiesRes.json() as Promise<Story[]>,
        statsRes.json() as Promise<StoryStats>,
        epicsRes.json() as Promise<EpicSummary[]>,
        allStoriesRes.json() as Promise<Story[]>,
      ]);

      setStories(storiesData);
      setAllStories(allStoriesData);
      setStats(statsData);
      setEpics(epicsData);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData(epicId, dateRange, searchText, sortBy);
  }, [epicId, dateRange, sortBy, fetchData]);
  // searchText 透過 debounce 觸發，不在此 effect 中

  // ── 切換完成度篩選時，若已選的 Epic 不在新清單中則重置 ──
  useEffect(() => {
    if (epicId && completionFilter !== 'all' && allStories.length > 0) {
      const exists = filteredEpics.some(e => e.epicId === epicId);
      if (!exists) handleEpicChange('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionFilter, allStories.length]);

  // ── 搜尋 debounce（300ms，BR-005）──
  function handleSearchChange(value: string) {
    setSearchText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void fetchData(epicId, dateRange, value, sortBy);
    }, 300);
  }

  function handleEpicChange(newEpicId: string) {
    if (newEpicId) {
      setSearchParams({ epicId: newEpicId });
    } else {
      setSearchParams({});
    }
  }

  async function handleStatusChange(key: string, newStatus: string) {
    try {
      const res = await fetch(`${API_BASE}/stories/${encodeURIComponent(key)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Status update failed');
      }

      await fetchData(epicId, dateRange, searchText, sortBy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    }
  }

  // ── Epic 級別完成度判定（使用全量 stories，不受日期篩選影響）──
  const epicDoneMap = new Map<string, boolean>();
  for (const s of allStories) {
    if (!s.epicId) continue;
    const prev = epicDoneMap.get(s.epicId);
    const isDone = DONE_STATUSES.includes(s.status);
    epicDoneMap.set(s.epicId, prev === undefined ? isDone : (prev && isDone));
  }

  // 過濾 Stories
  const filteredStories = completionFilter === 'all'
    ? stories
    : stories.filter(s => {
        const epicAllDone = epicDoneMap.get(s.epicId) ?? false;
        return completionFilter === 'incomplete' ? !epicAllDone : epicAllDone;
      });

  // 過濾 Epic 下拉選單（只顯示符合完成度篩選的 Epic）
  const filteredEpics = completionFilter === 'all'
    ? epics
    : epics.filter(e => {
        const allDone = epicDoneMap.get(e.epicId) ?? false;
        return completionFilter === 'incomplete' ? !allDone : allDone;
      });

  // ── 完成度篩選後的 Stats（client-side 計算）──
  const filteredStats: StoryStats | null = stats ? (() => {
    if (completionFilter === 'all') return stats;
    const src = filteredStories;
    const CANCEL = new Set(['cancelled', 'skipped', 'split', 'superseded']);
    return {
      total: src.length,
      backlog: src.filter(s => s.status === 'backlog' || s.status === 'creating').length,
      readyForDev: src.filter(s => s.status === 'ready-for-dev').length,
      inProgress: src.filter(s => s.status === 'in-progress').length,
      review: src.filter(s => s.status === 'review' || s.status === 'reviewing').length,
      done: src.filter(s => s.status === 'done').length,
      cancelled: src.filter(s => CANCEL.has(s.status)).length,
      other: 0,
    };
  })() : null;

  // ── 空狀態訊息（BR-003）──
  const isEmpty = !loading && filteredStories.length === 0;

  return (
    <div>
      {/* 頁面標題 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--dvc-text-primary)' }}>
          📋 {t.stories.title}
        </h1>
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--dvc-text-muted)' }}>{t.stories.loading}</span>
        )}
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--dvc-status-error)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--dvc-status-error)',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* 統計列 */}
      {filteredStats && <StatsBar stats={filteredStats} />}

      {/* ── DVS-07: Filter Bar（Epic + 時間篩選 + 搜尋 + 排序）── */}
      <div className="dvc-kanban-filter-bar">
        {/* Epic 篩選 */}
        <div className="dvc-kanban-filter">
          <label htmlFor="epic-filter">{t.stories.epicLabel}</label>
          <select
            id="epic-filter"
            value={epicId}
            onChange={e => handleEpicChange(e.target.value)}
          >
            <option value="">{t.stories.allEpics}</option>
            {filteredEpics.map(epic => (
              <option key={epic.epicId} value={epic.epicId}>
                {epic.epicId} ({epic.storyCount})
              </option>
            ))}
          </select>
        </div>

        {/* 完成度篩選 */}
        <div className="dvc-date-range-segmented">
          {([
            { value: 'incomplete' as CompletionFilter, label: '未完成' },
            { value: 'completed' as CompletionFilter, label: '已完成' },
            { value: 'all' as CompletionFilter, label: '全部' },
          ]).map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`dvc-segment-btn${completionFilter === opt.value ? ' is-active' : ''}`}
              onClick={() => setCompletionFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 時間範圍 Segmented Control（BR-002~BR-004）*/}
        <div className="dvc-date-range-segmented">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`dvc-segment-btn${dateRange === opt.value ? ' is-active' : ''}`}
              onClick={() => setDateRange(opt.value)}
            >
              {t.stories.dateRange[opt.labelKey]}
            </button>
          ))}
        </div>

        {/* 搜尋框（BR-005）*/}
        <div className="dvc-search-input-wrapper">
          <input
            type="text"
            className="dvc-search-input"
            placeholder={t.stories.searchPlaceholder}
            value={searchText}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {searchText && (
            <button
              type="button"
              className="dvc-search-clear"
              onClick={() => handleSearchChange('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* 排序控制（BR-006）*/}
        <div className="dvc-kanban-filter">
          <label htmlFor="sort-select">{t.stories.sortLabel}</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
          >
            <option value="date_desc">{t.stories.sortDateDesc}</option>
            <option value="date_asc">{t.stories.sortDateAsc}</option>
            <option value="epic_asc">{t.stories.sortEpicAZ}</option>
            <option value="epic_desc">{t.stories.sortEpicZA}</option>
          </select>
        </div>
      </div>

      {/* 空狀態訊息（BR-003）*/}
      {isEmpty && (
        <div className="dvc-kanban-empty-state">
          {dateRange === 'today'
            ? t.stories.emptyToday
            : t.stories.emptyFiltered}
        </div>
      )}

      {/* Kanban 看板 */}
      {!loading && !isEmpty && (
        <KanbanBoard stories={filteredStories} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}
