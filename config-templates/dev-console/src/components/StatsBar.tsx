// ============================================================
// StatsBar.tsx — 統計列（7 個狀態卡片）
// DVS-03 AC-5 + i18n
// ============================================================
import type { StoryStats } from '../types/stories';
import { useI18n } from '../i18n/I18nProvider';

interface StatsBarProps {
  stats: StoryStats;
}

export default function StatsBar({ stats }: StatsBarProps) {
  const { t } = useI18n();

  const STAT_ITEMS = [
    { key: 'total' as const, label: t.stats.total, cls: 'stat-total' },
    { key: 'backlog' as const, label: t.stats.backlog, cls: 'stat-backlog' },
    { key: 'readyForDev' as const, label: t.stats.ready, cls: 'stat-ready' },
    { key: 'inProgress' as const, label: t.stats.inProgress, cls: 'stat-dev' },
    { key: 'review' as const, label: t.stats.review, cls: 'stat-review' },
    { key: 'done' as const, label: t.stats.done, cls: 'stat-done' },
    { key: 'cancelled' as const, label: t.stats.cancelled, cls: 'stat-backlog' },
  ];

  return (
    <div className="dvc-kanban-stats">
      {STAT_ITEMS.map(item => (
        <div key={item.key} className={`dvc-kanban-stat-card ${item.cls}`}>
          <span className="stat-count">{stats[item.key]}</span>
          <span className="stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
