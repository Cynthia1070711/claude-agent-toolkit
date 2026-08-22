// ============================================================
// DailyContextTrendChart.tsx — Daily add_context 趨勢 (Line by category)
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-001)
// ============================================================
import { Line } from 'react-chartjs-2';
import type { DailyContextRow } from '../../services/dashboardChartsApi.js';
import '../../utils/chartConfig.js';

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316',
];

export interface DailyContextTrendChartProps {
  data: DailyContextRow[];
  categories: string[];
  noDataLabel: string;
}

export default function DailyContextTrendChart({ data, categories, noDataLabel }: DailyContextTrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  // 取所有 distinct day,排序後當作 x-axis
  const days = Array.from(new Set(data.map(r => r.day))).sort();

  // 為每個 category 組 dataset(對齊每個 day 的 cnt)
  const datasets = categories.map((cat, i) => {
    const map = new Map<string, number>();
    data.filter(r => r.category === cat).forEach(r => map.set(r.day, r.cnt));
    return {
      label: cat,
      data: days.map(d => map.get(d) ?? 0),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length] + '20',
      pointRadius: 2,
      pointHoverRadius: 4,
      fill: false,
      tension: 0.3,
      borderWidth: 1.5,
    };
  });

  const chartData = { labels: days, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { boxWidth: 8, padding: 8, font: { size: 10 } },
      },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: { grid: { color: '#334155' }, ticks: { font: { size: 9 }, color: '#94a3b8', maxRotation: 45, minRotation: 45 } },
      y: { grid: { color: '#334155' }, ticks: { font: { size: 10 }, color: '#94a3b8' }, beginAtZero: true },
    },
  };

  return <Line data={chartData} options={options} />;
}
