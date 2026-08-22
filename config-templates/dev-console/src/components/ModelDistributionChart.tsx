// ============================================================
// ModelDistributionChart.tsx — 模型使用分佈圓餅圖
// dvs-07 AC-3: Opus/Sonnet/Haiku 佔比（token 數為基數）
// ============================================================
import { Doughnut } from 'react-chartjs-2';
import type { ModelDistributionItem } from '../services/workflowApi.js';
import '../utils/chartConfig.js';

// 依模型名稱對應顏色（indigo=Opus / green=Sonnet / amber=Haiku）
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#475569'];

function getShortName(model: string): string {
  if (model.toLowerCase().includes('opus')) return 'Opus';
  if (model.toLowerCase().includes('sonnet')) return 'Sonnet';
  if (model.toLowerCase().includes('haiku')) return 'Haiku';
  if (model === 'unknown') return 'Unknown';
  return model.split('-').slice(-2).join('-');
}

interface ModelDistributionChartProps {
  data: ModelDistributionItem[];
  noDataLabel: string;
}

export default function ModelDistributionChart({ data, noDataLabel }: ModelDistributionChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  const chartData = {
    labels: data.map(d => `${getShortName(d.model)} (${d.token_percentage}%)`),
    datasets: [
      {
        data: data.map(d => d.total_tokens),
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
        borderColor: '#1e293b',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const grandTotal = data.reduce((s, d) => s + d.count, 0);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 10,
          padding: 10,
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataIndex: number }) => {
            const item = data[ctx.dataIndex];
            return ` ${getShortName(item.model)}: ${item.count} 次, ${item.token_percentage}%`;
          },
        },
      },
    },
  };

  return (
    <div style={{ position: 'relative' }}>
      <Doughnut data={chartData} options={options} />
      <div style={{
        position: 'absolute',
        top: '42%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--dvc-text-primary)' }}>{grandTotal}</div>
        <div style={{ fontSize: 10, color: 'var(--dvc-text-muted)' }}>Runs</div>
      </div>
    </div>
  );
}
