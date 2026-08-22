// ============================================================
// WorkerHistory.tsx — 分頁 B：篩選 + Pagination + 四張圖（whp-10-devconsole-ui Task 9）
// 圖表由前端對「當前查詢結果」聚合，不新增後端聚合 endpoint（BR-029）。
// ============================================================
import { useEffect, useState } from 'react';
import { listWorkerRuns, describeWorkersApiError } from '../services/workersApi.js';
import type { WorkerRunListResult } from '../types/workers.js';
import Pagination from './Pagination.js';
import {
  TrackStackedChart,
  PhaseDurationChart,
  AttemptDistributionChart,
  DailyDispatchTrendChart,
} from './charts/WorkerCharts.js';

const PAGE_SIZE = 20;

const LIFECYCLE_OPTIONS = [
  'dispatching', 'running', 'reported', 'awaiting-review', 'revising', 'approved', 'closed', 'failed', 'abandoned',
];
const CLOSE_SOURCE_OPTIONS = [
  'ControllerAfterHandshake', 'ControllerForce', 'UserClosed', 'ExternalKill',
  'PowerFailure', 'DispatchFailed', 'StartupFailed', 'Unknown',
];

interface HistoryFilters {
  storyId: string;
  phase: string;
  track: string;
  lifecycle: string;
  closeSource: string;
}

const EMPTY_FILTERS: HistoryFilters = { storyId: '', phase: '', track: '', lifecycle: '', closeSource: '' };

export default function WorkerHistory() {
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [result, setResult] = useState<WorkerRunListResult>({ items: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runQuery(nextPage: number): Promise<void> {
    setLoading(true);
    try {
      const data = await listWorkerRuns({ ...filters, page: nextPage, pageSize: PAGE_SIZE });
      setResult(data);
      setError(null);
    } catch (err) {
      setError(describeWorkersApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void runQuery(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(): void {
    void runQuery(1);
  }

  function handlePageChange(nextPage: number): void {
    void runQuery(nextPage);
  }

  return (
    <div className="worker-history">
      <div className="worker-history__filters">
        {/* placeholder 不是 accessible name（WCAG 3.3.2 / 4.1.2）—— 五個控制項各自具名。 */}
        <input
          aria-label="篩選 story_id"
          placeholder="story_id"
          value={filters.storyId}
          onChange={(e) => setFilters((f) => ({ ...f, storyId: e.target.value }))}
        />
        <input
          aria-label="篩選 phase"
          placeholder="phase"
          value={filters.phase}
          onChange={(e) => setFilters((f) => ({ ...f, phase: e.target.value }))}
        />
        <input
          aria-label="篩選軌別"
          placeholder="track"
          value={filters.track}
          onChange={(e) => setFilters((f) => ({ ...f, track: e.target.value }))}
        />
        <select aria-label="篩選 lifecycle" value={filters.lifecycle} onChange={(e) => setFilters((f) => ({ ...f, lifecycle: e.target.value }))}>
          <option value="">全部 lifecycle</option>
          {LIFECYCLE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="篩選 close_source" value={filters.closeSource} onChange={(e) => setFilters((f) => ({ ...f, closeSource: e.target.value }))}>
          <option value="">全部 close_source</option>
          {CLOSE_SOURCE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" onClick={handleSearch}>查詢</button>
      </div>

      {error && <p className="worker-queue-warning">{error}</p>}

      {!loading && result.total === 0 ? (
        <p className="worker-history__empty">查無符合條件的派發紀錄</p>
      ) : (
        <Pagination page={result.page} pageSize={PAGE_SIZE} total={result.total} onPageChange={handlePageChange} />
      )}

      <div className="worker-history__charts">
        <p className="worker-chart-card__scope-note">基於當前查詢結果</p>
        <div className="worker-chart-card">
          <h4 className="worker-chart-card__title">① 每軌派發次數</h4>
          <TrackStackedChart items={result.items} />
        </div>
        <div className="worker-chart-card">
          <h4 className="worker-chart-card__title">② 每 phase 平均執行時長</h4>
          <PhaseDurationChart items={result.items} />
        </div>
        <div className="worker-chart-card">
          <h4 className="worker-chart-card__title">③ attempt 分布</h4>
          <AttemptDistributionChart items={result.items} />
        </div>
        <div className="worker-chart-card">
          <h4 className="worker-chart-card__title">④ 每日派發趨勢</h4>
          <DailyDispatchTrendChart items={result.items} />
        </div>
      </div>
    </div>
  );
}
