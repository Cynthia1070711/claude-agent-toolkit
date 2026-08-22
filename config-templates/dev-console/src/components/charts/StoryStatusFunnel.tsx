// ============================================================
// StoryStatusFunnel.tsx — Story status pipeline funnel (horizontal Bar)
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-004)
// 5 stages: backlog → ready-for-dev → in-progress → review → done + Other
// ============================================================
import { Bar } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import type { StoryFunnelRow } from '../../services/dashboardChartsApi.js';
import '../../utils/chartConfig.js';

// 對齊 chartConfig.ts STATUS_COLORS,但獨立定義避免循環 import
const STAGE_COLORS: Record<string, string> = {
  backlog: '#475569',
  'ready-for-dev': '#6366f1',
  'in-progress': '#f59e0b',
  review: '#8b5cf6',
  done: '#22c55e',
  other: '#94a3b8',
};

const STAGE_LABELS: Record<string, string> = {
  backlog: '待辦',
  'ready-for-dev': '待開發',
  'in-progress': '開發中',
  review: '審查中',
  done: '完成',
};

export interface StoryStatusFunnelProps {
  data: StoryFunnelRow[];
  stages: string[];
  otherCount: number;
  noDataLabel: string;
}

export default function StoryStatusFunnel({ data, stages, otherCount, noDataLabel }: StoryStatusFunnelProps) {
  if (data.length === 0 && otherCount === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  const stageMap = new Map<string, number>();
  data.forEach(r => stageMap.set(r.status, r.cnt));

  const labels = stages.map(s => STAGE_LABELS[s] ?? s);
  const counts = stages.map(s => stageMap.get(s) ?? 0);
  const colors = stages.map(s => STAGE_COLORS[s] ?? '#475569');

  if (otherCount > 0) {
    labels.push(`其他 (skipped/split/cancelled)`);
    counts.push(otherCount);
    colors.push(STAGE_COLORS.other);
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Story 數',
        data: counts,
        backgroundColor: colors,
        borderColor: '#1e293b',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // CR F-C2 fix: TooltipItem<'bar'> typing aligns with chart.js Tooltip callback contract
          label: (ctx: TooltipItem<'bar'>) => ` ${ctx.raw as number} 個 Story`,
        },
      },
    },
    scales: {
      x: { grid: { color: '#334155' }, ticks: { font: { size: 10 }, color: '#94a3b8' }, beginAtZero: true },
      y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#cbd5e1' } },
    },
  };

  return <Bar data={chartData} options={options} />;
}
