// ============================================================
// WfqTrendChart.tsx — Token 消耗趨勢折線圖
// dvs-07 AC-2: 7天 Input/Output/Cache 三條折線 + hover tooltip
// ============================================================
import { Line } from 'react-chartjs-2';
import type { WorkflowTrendDay } from '../services/workflowApi.js';
import '../utils/chartConfig.js';

interface WfqTrendChartProps {
  data: WorkflowTrendDay[];
  noDataLabel: string;
  labels: {
    input: string;
    output: string;
    cache: string;
  };
}

export default function WfqTrendChart({ data, noDataLabel, labels }: WfqTrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  const chartData = {
    labels: data.map(d => d.date),
    datasets: [
      {
        label: labels.input,
        data: data.map(d => d.input_tokens),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: labels.output,
        data: data.map(d => d.output_tokens),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.05)',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: labels.cache,
        data: data.map(d => d.cache_read_tokens),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.05)',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 10,
          padding: 12,
          font: { size: 11 },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        grid: { color: '#334155' },
        ticks: { font: { size: 10 }, color: '#94a3b8' },
      },
      y: {
        grid: { color: '#334155' },
        ticks: { font: { size: 10 }, color: '#94a3b8' },
        beginAtZero: true,
      },
    },
  };

  return <Line data={chartData} options={options} />;
}
