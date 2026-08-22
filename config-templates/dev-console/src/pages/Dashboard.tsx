// ============================================================
// Dashboard.tsx — Dashboard 總覽頁 + i18n
// DVS-05 AC-3, AC-4 (original KPI cards + RecentActivity)
// dvs-07 AC-1/2/3/4 (WFQ KPI cards + Trend chart + Model chart)
// ============================================================
import { useEffect, useState } from 'react';
import KpiCard, { KpiCardSkeleton } from '../components/KpiCard.js';
import RecentActivity from '../components/RecentActivity.js';
import WfqTrendChart from '../components/WfqTrendChart.js';
import ModelDistributionChart from '../components/ModelDistributionChart.js';
import { fetchDashboardData } from '../services/dashboardApi.js';
import { fetchWorkflowStats, fetchWorkflowTrend, fetchModelDistribution } from '../services/workflowApi.js';
import { timeAgo } from '../utils/timeAgo.js';
import { useI18n } from '../i18n/I18nProvider.js';
import type { DashboardData } from '../types/dashboard.js';
import type { WorkflowStatsDto, WorkflowTrendDay, ModelDistributionItem, DateRange } from '../services/workflowApi.js';
import '../styles/dashboard.css';

/** 預設統計區間 = 本月全部（1 號 ~ 月底），台灣日 */
function defaultRange(): DateRange {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 下月第 0 日 = 本月最後一日
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/** 金額雙幣別：匯率為 0（未設定）時只顯示 USD，不臆測換算 */
function formatCost(usd: number, usdToTwd: number): string {
  const usdPart = `$${usd.toFixed(2)} USD`;
  if (!usdToTwd) return usdPart;
  return `${usdPart} / NT$${Math.round(usd * usdToTwd).toLocaleString()}`;
}

/** 大數 token 縮寫（1_392_804 → 1.4M）*/
function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export default function Dashboard() {
  const { t } = useI18n();

  // ── 原有 Dashboard 資料 ────────────────────────────────────
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── dvs-07: WFQ 資料 ──────────────────────────────────────
  const [wfqStats, setWfqStats] = useState<WorkflowStatsDto | null>(null);
  const [wfqTrend, setWfqTrend] = useState<WorkflowTrendDay[]>([]);
  const [wfqModels, setWfqModels] = useState<ModelDistributionItem[]>([]);
  const [wfqLoading, setWfqLoading] = useState(true);   // KPI 卡（隨區間重抓）
  const [chartsLoading, setChartsLoading] = useState(true); // 趨勢 / 模型分佈（只抓一次）
  // 統計區間：起日 ~ 迄日，預設本月全部
  const [range, setRange] = useState<DateRange>(defaultRange);

  useEffect(() => {
    // 原有 Dashboard 資料
    fetchDashboardData()
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));

    // dvs-07: WFQ 圖表資料（並行抓取，各自獨立容錯；不隨區間切換重抓）
    Promise.allSettled([
      fetchWorkflowTrend(7),
      fetchModelDistribution(),
    ]).then(([trendResult, modelsResult]) => {
      if (trendResult.status === 'fulfilled') setWfqTrend(trendResult.value);
      if (modelsResult.status === 'fulfilled') setWfqModels(modelsResult.value);
    }).finally(() => setChartsLoading(false));
  }, []);

  // 區間變更 → 只重抓 stats（趨勢圖固定 7 天、模型分佈為全時段）
  useEffect(() => {
    let cancelled = false;
    setWfqLoading(true);
    fetchWorkflowStats(range)
      .then(s => { if (!cancelled) setWfqStats(s); })
      .catch(() => { if (!cancelled) setWfqStats(null); })
      .finally(() => { if (!cancelled) setWfqLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const completionPct = data
    ? data.storyStats.total > 0
      ? Math.round((data.storyStats.done / data.storyStats.total) * 100)
      : 0
    : 0;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--dvc-text-primary)' }}>
        {t.dashboard.title}
      </h1>

      {error && (
        <div style={{ color: 'var(--dvc-status-error)', marginBottom: 16, fontSize: 13 }}>
          ⚠ {t.dashboard.loadError}: {error}
        </div>
      )}

      {/* ── Story / Memory KPI 卡片區 ── */}
      <div className="dvc-kpi-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : data ? (
          <>
            <KpiCard
              icon="📊"
              label={t.dashboard.totalStories}
              value={data.storyStats.total}
              subtitle={`Done: ${data.storyStats.done} | In-Progress: ${data.storyStats.inProgress}`}
            />
            <KpiCard
              icon="✅"
              label={t.dashboard.completionRate}
              value={`${completionPct}%`}
              subtitle={`${data.storyStats.done} / ${data.storyStats.total} Stories`}
            />
            <KpiCard
              icon="🔧"
              label={t.dashboard.inProgress}
              value={data.storyStats.inProgress}
              subtitle={`Review: ${data.storyStats.review} | Ready: ${data.storyStats.readyForDev}`}
            />
            <KpiCard
              icon="🧠"
              label={t.dashboard.memoryRecords}
              value={data.memoryStats ? data.memoryStats.contextEntries + data.memoryStats.techEntries : '—'}
              subtitle={data.memoryStats ? `Context: ${data.memoryStats.contextEntries} | Tech: ${data.memoryStats.techEntries}` : t.dashboard.dbOffline}
            />
            <KpiCard
              icon="💾"
              label={t.dashboard.dbSize}
              value={data.memoryStats ? formatBytes(data.memoryStats.dbSizeBytes) : '—'}
              subtitle={data.memoryStats ? `${t.dashboard.conversations}: ${data.memoryStats.conversations}` : ''}
            />
            <KpiCard
              icon="🕐"
              label={t.dashboard.lastUpdated}
              value={data.memoryStats ? timeAgo(data.memoryStats.lastModified) : '—'}
              subtitle={data.memoryStats?.lastModified
                ? new Date(data.memoryStats.lastModified).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
                : ''}
            />
            <KpiCard
              icon="📄"
              label={t.dashboard.docCount}
              value={data.embeddingStats?.docIndex ?? '—'}
              subtitle={data.embeddingStats
                ? `${t.dashboard.chunkCount}: ${data.embeddingStats.documentChunks.toLocaleString()}`
                : ''}
            />
            <KpiCard
              icon="🧬"
              label={t.dashboard.symbolCoverage}
              value={data.embeddingStats
                ? `${data.embeddingStats.symbolEmbeddings.toLocaleString()} / ${data.embeddingStats.symbolIndex.toLocaleString()}`
                : '—'}
              subtitle={data.embeddingStats && data.embeddingStats.symbolIndex > 0
                ? `${Math.round((data.embeddingStats.symbolEmbeddings / data.embeddingStats.symbolIndex) * 100)}%`
                : ''}
            />
            <KpiCard
              icon="🔗"
              label={t.dashboard.embeddingModel}
              value={data.embeddingStats?.modelName ?? '—'}
              subtitle={data.embeddingStats
                ? `${data.embeddingStats.dimensions}D | ${formatBytes(data.embeddingStats.totalTextBytes)}`
                : ''}
            />
          </>
        ) : null}
      </div>

      {/* ── dvs-07 AC-1: Pipeline 運營 KPI 卡片 ── */}
      <div className="dvc-section-header">
        <div className="dvc-section-title">{t.dashboard.wfqSectionTitle}</div>
        {/* 區間篩選：原生 date input，max/min 互鎖避免起日晚於迄日（後端另有 normalizeRange 兜底）*/}
        <div className="dvc-range-filter" data-testid="wfq-range-filter">
          <label className="dvc-range-label" htmlFor="wfq-range-from">{t.dashboard.wfqRangeFrom}</label>
          <input
            id="wfq-range-from"
            type="date"
            className="dvc-range-input"
            value={range.from}
            max={range.to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
          />
          <span className="dvc-range-sep">~</span>
          <label className="dvc-range-label" htmlFor="wfq-range-to">{t.dashboard.wfqRangeTo}</label>
          <input
            id="wfq-range-to"
            type="date"
            className="dvc-range-input"
            value={range.to}
            min={range.from}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
          />
          <button
            type="button"
            className="dvc-range-reset"
            onClick={() => setRange(defaultRange())}
          >
            {t.dashboard.wfqRangeReset}
          </button>
        </div>
      </div>

      {/* 數據品質警告：token=0 佔比超過 80% 時顯示 */}
      {!wfqLoading && wfqStats && wfqStats.zeroTokenPct > 80 && wfqStats.totalWorkflows > 0 && (
        <div
          data-testid="wfq-token-warning"
          style={{
            background: 'rgba(255, 193, 7, 0.12)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            borderRadius: 8,
            padding: '10px 16px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--dvc-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>&#9888;</span>
          <span>{t.dashboard.wfqTokenIncomplete}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
            {Math.round(wfqStats.zeroTokenPct)}% zero
          </span>
        </div>
      )}

      <div className="dvc-kpi-grid" data-testid="wfq-kpi-grid">
        {wfqLoading ? (
          Array.from({ length: 3 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : wfqStats ? (
          <>
            {/* AC-1: Token 消耗 + Cost（USD / NT 雙幣別；含尚未落盤的即時量）*/}
            <KpiCard
              icon="🪙"
              label={`${t.dashboard.wfqTokenConsumption}（${wfqStats.from} ~ ${wfqStats.to}）`}
              value={(wfqStats.totalInputTokens + wfqStats.totalOutputTokens).toLocaleString()}
              subtitle={
                `${t.dashboard.wfqCostHint}: ${formatCost(wfqStats.totalCostUsd, wfqStats.usdToTwd)}` +
                (wfqStats.pendingTokens > 0
                  ? ` · ${t.dashboard.wfqPendingHint} ${formatTokensShort(wfqStats.pendingTokens)}`
                  : '')
              }
            />
            {/* AC-1: Pipeline 成功率 */}
            <KpiCard
              icon="🎯"
              label={t.dashboard.wfqPipelineSuccessRate}
              value={`${wfqStats.successRate}%`}
              subtitle={`${wfqStats.totalWorkflows} ${t.dashboard.wfqRuns}`}
            />
            {/* AC-1: 平均耗時 */}
            <KpiCard
              icon="⏱️"
              label={t.dashboard.wfqAvgDuration}
              value={formatDurationMs(wfqStats.avgDurationMs)}
              subtitle={`Cache Read: ${wfqStats.totalCacheReadTokens.toLocaleString()}`}
            />
          </>
        ) : (
          <div style={{ color: 'var(--dvc-text-muted)', fontSize: 13, gridColumn: '1/-1' }}>
            {t.dashboard.wfqNoData}
          </div>
        )}
      </div>

      {/* ── dvs-07 AC-2/3: Token 趨勢圖 + 模型分佈圖 ── */}
      <div className="dvc-wfq-charts" data-testid="wfq-charts-grid">
        {/* AC-2: Token 趨勢折線圖 */}
        <div className="dvc-chart-card">
          <div className="dvc-chart-title">{t.dashboard.wfqTrendTitle}</div>
          <div className="dvc-chart-inner" data-testid="wfq-trend-chart">
            {chartsLoading ? (
              <div className="dvc-skeleton-line lg" style={{ width: '100%', height: '100%' }} />
            ) : (
              <WfqTrendChart
                data={wfqTrend}
                noDataLabel={t.dashboard.wfqNoData}
                labels={{
                  input: t.dashboard.wfqTrendInput,
                  output: t.dashboard.wfqTrendOutput,
                  cache: t.dashboard.wfqTrendCache,
                }}
              />
            )}
          </div>
        </div>

        {/* AC-3: 模型使用分佈圓餅圖 */}
        <div className="dvc-chart-card">
          <div className="dvc-chart-title">{t.dashboard.wfqModelTitle}</div>
          <div className="dvc-chart-inner" data-testid="wfq-model-chart">
            {chartsLoading ? (
              <div className="dvc-skeleton-line lg" style={{ width: '100%', height: '100%' }} />
            ) : (
              <ModelDistributionChart
                data={wfqModels}
                noDataLabel={t.dashboard.wfqNoData}
              />
            )}
          </div>
        </div>
      </div>

      {/* 最近活動 */}
      {loading ? (
        <div className="dvc-activity-section">
          <div className="dvc-activity-title">{t.dashboard.recentActivity}</div>
          <div className="dvc-activity-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="dvc-activity-item">
                <div className="dvc-skeleton-line sm" style={{ width: '30%', marginBottom: 6 }} />
                <div className="dvc-skeleton-line sm" style={{ width: '70%', marginBottom: 4 }} />
                <div className="dvc-skeleton-line sm" />
              </div>
            ))}
          </div>
        </div>
      ) : data ? (
        <RecentActivity items={data.recentActivity} />
      ) : null}
    </div>
  );
}
