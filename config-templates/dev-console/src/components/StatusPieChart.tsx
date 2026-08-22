// ============================================================
// StatusPieChart.tsx — Story 狀態圓餅圖
// DVS-05 AC-5
// ============================================================
import { Doughnut } from 'react-chartjs-2';
import type { StoryStats } from '../types/stories.js';
import { STATUS_COLORS } from '../utils/chartConfig.js';

interface StatusPieChartProps {
  stats: StoryStats;
}

export default function StatusPieChart({ stats }: StatusPieChartProps) {
  const entries = [
    { key: 'done', label: 'Done', value: stats.done },
    { key: 'in-progress', label: 'In Progress', value: stats.inProgress },
    { key: 'review', label: 'Review', value: stats.review },
    { key: 'ready-for-dev', label: 'Ready', value: stats.readyForDev },
    { key: 'backlog', label: 'Backlog', value: stats.backlog },
    { key: 'cancelled', label: 'Cancelled', value: stats.cancelled },
  ].filter(e => e.value > 0);

  if (entries.length === 0) {
    return <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32 }}>暫無資料</div>;
  }

  const chartData = {
    labels: entries.map(e => e.label),
    datasets: [
      {
        data: entries.map(e => e.value),
        backgroundColor: entries.map(e => STATUS_COLORS[e.key] ?? '#475569'),
        borderColor: '#1e293b',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 12,
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label: string; parsed: number }) => {
            const pct = stats.total > 0 ? Math.round((ctx.parsed / stats.total) * 100) : 0;
            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="dvc-chart-container" style={{ position: 'relative' }}>
      <Doughnut data={chartData} options={options} />
      {/* 中間顯示總數 */}
      <div style={{
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--dvc-text-primary)' }}>{stats.total}</div>
        <div style={{ fontSize: 10, color: 'var(--dvc-text-muted)' }}>Stories</div>
      </div>
    </div>
  );
}
