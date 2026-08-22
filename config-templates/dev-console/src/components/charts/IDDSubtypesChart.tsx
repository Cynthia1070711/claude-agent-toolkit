// ============================================================
// IDDSubtypesChart.tsx — IDD COM/STR/REG/USR pie (Doughnut)
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-003)
// ============================================================
import { Doughnut } from 'react-chartjs-2';
import type { IddSubtypeRow } from '../../services/dashboardChartsApi.js';
import '../../utils/chartConfig.js';

const TYPE_PALETTE: Record<string, string> = {
  COM: '#6366f1',  // 商業 - indigo
  STR: '#22c55e',  // 策略 - green
  REG: '#f59e0b',  // 法規 - amber
  USR: '#8b5cf6',  // 使用者 - purple
  Other: '#94a3b8', // CR F-M12 fix: legacy/typo/non-canonical idd_type slice
};

const TYPE_LABELS: Record<string, string> = {
  COM: 'COM 商業',
  STR: 'STR 策略',
  REG: 'REG 法規',
  USR: 'USR 使用者',
  Other: 'Other 其他',
};

export interface IDDSubtypesChartProps {
  data: IddSubtypeRow[];
  types: string[];
  noDataLabel: string;
  // CR F-M12 fix: render Other slice when service returns non-canonical idd_type rows
  otherCount?: number;
}

export default function IDDSubtypesChart({ data, types, noDataLabel, otherCount = 0 }: IDDSubtypesChartProps) {
  if (data.length === 0 && otherCount === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  // 聚合 by idd_type(active + retired + superseded 全合)
  const typeTotals = new Map<string, number>();
  for (const row of data) {
    typeTotals.set(row.idd_type, (typeTotals.get(row.idd_type) ?? 0) + row.cnt);
  }

  const labels = [...types];
  const counts = types.map(t => typeTotals.get(t) ?? 0);
  if (otherCount > 0) {
    labels.push('Other');
    counts.push(otherCount);
  }
  const total = counts.reduce((s, n) => s + n, 0);

  const chartData = {
    labels: labels.map(t => `${TYPE_LABELS[t] ?? t}: ${typeTotals.get(t) ?? 0}`),
    datasets: [
      {
        data: counts,
        backgroundColor: labels.map(t => TYPE_PALETTE[t] ?? '#475569'),
        borderColor: '#1e293b',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%',
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataIndex: number }) => {
            const t = labels[ctx.dataIndex];
            const cnt = counts[ctx.dataIndex];
            const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0';
            return ` ${TYPE_LABELS[t] ?? t}: ${cnt} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Doughnut data={chartData} options={options} />
      <div style={{
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--dvc-text-primary)' }}>{total}</div>
        <div style={{ fontSize: 10, color: 'var(--dvc-text-muted)' }}>IDDs</div>
      </div>
    </div>
  );
}
