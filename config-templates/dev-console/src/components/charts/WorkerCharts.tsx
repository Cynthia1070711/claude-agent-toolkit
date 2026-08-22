// ============================================================
// WorkerCharts.tsx — 分頁 B 歷程四張圖表（react-chartjs-2，色票集中常數）
// whp-10-devconsole-ui Task 9.2；對齊 charts/TechDebtSeverityChart.tsx 集中宣告範式
// ============================================================
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  aggregateTrackStackedByLifecycle,
  aggregateAvgDurationByPhase,
  aggregateAttemptDistribution,
  aggregateDailyDispatchTrend,
  aggregateCloseSourceDistribution,
} from '../../lib/workerCharts.js';
import type { WorkerRun } from '../../types/workers.js';
import '../../utils/chartConfig.js';

/** lifecycle → 色票（集中宣告，非散落 hardcode；chart.js dataset 色票豁免 CSS hex 禁令）。 */
const LIFECYCLE_PALETTE: Record<string, string> = {
  dispatching: '#818cf8',
  running: '#6366f1',
  reported: '#f59e0b',
  'awaiting-review': '#f97316',
  revising: '#a78bfa',
  approved: '#22c55e',
  closed: '#64748b',
  failed: '#ef4444',
  abandoned: '#475569',
};

const AXIS_STYLE = { grid: { color: '#334155' }, ticks: { font: { size: 10 }, color: '#94a3b8' } };

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const, labels: { boxWidth: 8, padding: 6, font: { size: 9 } } },
  },
  scales: {
    x: AXIS_STYLE,
    y: { ...AXIS_STYLE, beginAtZero: true },
  },
};

interface ChartProps {
  items: WorkerRun[];
}

/** ① 每軌派發次數（依 lifecycle 分層堆疊）。 */
export function TrackStackedChart({ items }: ChartProps) {
  const rows = aggregateTrackStackedByLifecycle(items);
  const labels = rows.map((r) => r.track);
  const lifecycles = Array.from(new Set(rows.flatMap((r) => Object.keys(r.byLifecycle))));
  const datasets = lifecycles.map((lc) => ({
    label: lc,
    data: rows.map((r) => r.byLifecycle[lc] ?? 0),
    backgroundColor: LIFECYCLE_PALETTE[lc] ?? '#64748b',
    stack: 'track',
  }));
  const options = { ...BASE_OPTIONS, scales: { x: { ...AXIS_STYLE, stacked: true }, y: { ...AXIS_STYLE, stacked: true, beginAtZero: true } } };
  return <Bar data={{ labels, datasets }} options={options} />;
}

/** ② 每 phase 平均執行時長（分鐘，只採 closed_at 樣本）。 */
export function PhaseDurationChart({ items }: ChartProps) {
  const rows = aggregateAvgDurationByPhase(items);
  const data = {
    labels: rows.map((r) => r.phase),
    datasets: [
      {
        label: '平均執行時長（分鐘）',
        data: rows.map((r) => Math.round(r.avgMs / 60000)),
        backgroundColor: '#6366f1',
      },
    ],
  };
  return <Bar data={data} options={BASE_OPTIONS} />;
}

/** ③ attempt 分布。 */
export function AttemptDistributionChart({ items }: ChartProps) {
  const rows = aggregateAttemptDistribution(items);
  const data = {
    labels: rows.map((r) => `第 ${r.attempt} 次`),
    datasets: [{ label: '次數', data: rows.map((r) => r.count), backgroundColor: '#818cf8' }],
  };
  return <Bar data={data} options={BASE_OPTIONS} />;
}

/** ④ 每日派發趨勢。 */
export function DailyDispatchTrendChart({ items }: ChartProps) {
  const rows = aggregateDailyDispatchTrend(items);
  const data = {
    labels: rows.map((r) => r.date),
    datasets: [
      {
        label: '每日派發數',
        data: rows.map((r) => r.count),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.2)',
        fill: true,
      },
    ],
  };
  return <Line data={data} options={BASE_OPTIONS} />;
}

/** close_source 九分類（8 具名值 + NULL 獨立「未記錄」）。分頁 C 稽核使用。 */
const CLOSE_SOURCE_PALETTE: Record<string, string> = {
  ControllerAfterHandshake: '#22c55e',
  ControllerForce: '#f59e0b',
  UserClosed: '#6366f1',
  ExternalKill: '#ef4444',
  PowerFailure: '#dc2626',
  DispatchFailed: '#f97316',
  StartupFailed: '#eab308',
  Unknown: '#64748b',
  未記錄: '#334155',
};

export function CloseSourcePieChart({ items }: ChartProps) {
  const slices = aggregateCloseSourceDistribution(items).filter((s) => s.count > 0);
  const data = {
    labels: slices.map((s) => s.label),
    datasets: [
      {
        data: slices.map((s) => s.count),
        backgroundColor: slices.map((s) => CLOSE_SOURCE_PALETTE[s.label] ?? '#64748b'),
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 8, padding: 6, font: { size: 9 } } } },
  };
  return <Pie data={data} options={options} />;
}
