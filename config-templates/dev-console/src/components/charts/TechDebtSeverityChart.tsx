// ============================================================
// TechDebtSeverityChart.tsx — Tech Debt severity x status stacked bar
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-002)
// ============================================================
import { Bar } from 'react-chartjs-2';
import type { DebtSeverityRow } from '../../services/dashboardChartsApi.js';
import '../../utils/chartConfig.js';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_PALETTE: Record<string, string> = {
  open: '#ef4444',
  'in-progress': '#f59e0b',
  pending: '#f97316',
  pending_archive: '#a78bfa',
  fixed: '#22c55e',
  resolved: '#22c55e',
  accepted: '#06b6d4',
  deferred: '#8b5cf6',
  archived: '#64748b',
  'wont-fix': '#475569',
};

export interface TechDebtSeverityChartProps {
  data: DebtSeverityRow[];
  severities: string[];
  statuses: string[];
  noDataLabel: string;
}

export default function TechDebtSeverityChart({ data, severities, statuses, noDataLabel }: TechDebtSeverityChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ color: 'var(--dvc-text-muted)', textAlign: 'center', paddingTop: 32, fontSize: 13 }}>
        {noDataLabel}
      </div>
    );
  }

  // x-axis: severity(已知 4-5 種 + 自定義 P2 等);y-axis: count split by status
  const xLabels = SEVERITY_ORDER.filter(s => severities.includes(s)).concat(
    severities.filter(s => !SEVERITY_ORDER.includes(s)),
  );

  const datasets = statuses.map(status => {
    const map = new Map<string, number>();
    data.filter(r => r.status === status).forEach(r => map.set(r.severity, r.cnt));
    return {
      label: status,
      data: xLabels.map(sev => map.get(sev) ?? 0),
      backgroundColor: STATUS_PALETTE[status] ?? '#64748b',
      stack: 'debt',
    };
  });

  const chartData = { labels: xLabels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 8, padding: 6, font: { size: 9 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: { stacked: true, grid: { color: '#334155' }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
      y: { stacked: true, grid: { color: '#334155' }, ticks: { font: { size: 10 }, color: '#94a3b8' }, beginAtZero: true },
    },
  };

  return <Bar data={chartData} options={options} />;
}
