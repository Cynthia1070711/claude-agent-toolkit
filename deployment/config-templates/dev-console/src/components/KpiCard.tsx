// ============================================================
// KpiCard.tsx — KPI 統計卡片
// DVS-05 AC-3
// ============================================================

interface KpiCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
}

export default function KpiCard({ icon, label, value, subtitle }: KpiCardProps) {
  return (
    <div className="dvc-kpi-card">
      <span className="dvc-kpi-icon">{icon}</span>
      <span className="dvc-kpi-label">{label}</span>
      <span className="dvc-kpi-value">{value}</span>
      {subtitle && <span className="dvc-kpi-subtitle">{subtitle}</span>}
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="dvc-kpi-skeleton">
      <div className="dvc-skeleton-line sm" style={{ width: '30%', height: 12 }} />
      <div className="dvc-skeleton-line sm" />
      <div className="dvc-skeleton-line lg" />
      <div className="dvc-skeleton-line sm" style={{ width: '50%' }} />
    </div>
  );
}
