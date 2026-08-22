// ============================================================
// ComplexityBarChart.tsx — 複雜度柱狀圖
// DVS-05 AC-7
// ============================================================
import { Bar } from 'react-chartjs-2';
import type { ComplexityDistribution } from '../types/sprint.js';
import { COMPLEXITY_COLORS } from '../utils/chartConfig.js';

interface ComplexityBarChartProps {
  distribution: ComplexityDistribution;
}

const LEVELS = ['XS', 'S', 'M', 'L', 'XL', 'untagged'] as const;
const LABELS = ['XS', 'S', 'M', 'L', 'XL', '未標記'];

export default function ComplexityBarChart({ distribution }: ComplexityBarChartProps) {
  const values = LEVELS.map(l => distribution[l]);
  const hasData = values.some(v => v > 0);

  if (!hasData) {
    return <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32 }}>暫無資料</div>;
  }

  const chartData = {
    labels: LABELS,
    datasets: [
      {
        label: 'Story 數量',
        data: values,
        backgroundColor: LEVELS.map(l => COMPLEXITY_COLORS[l] ?? '#475569'),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number } }) => ` ${ctx.parsed.y} Stories`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { font: { size: 11 } },
      },
      y: {
        grid: { color: '#334155' },
        ticks: { font: { size: 11 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="dvc-chart-container">
      <Bar data={chartData} options={options} />
    </div>
  );
}
