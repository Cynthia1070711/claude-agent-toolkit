// ============================================================
// ChannelChips.tsx — 頻道 chips + KPI chips（ccb-3-devconsole-channel-page）
// KPI chip 範式對齊 RuleViolations.tsx:73-96（__kpi-chip，非 KpiCard 卡片）。
// ============================================================
import type { ChannelStats } from '../../types/channel.js';

const CHANNEL_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'general', label: 'general' },
  { value: 'correction', label: 'correction' },
] as const;

interface ChannelFilterChipsProps {
  activeChannel: string;
  onChannelChange: (channel: string) => void;
  stats: ChannelStats | null;
}

export function ChannelFilterChips({ activeChannel, onChannelChange, stats }: ChannelFilterChipsProps) {
  return (
    <div className="channel-chips-row">
      <div className="channel-chips-row__channels" role="group" aria-label="依頻道過濾">
        {CHANNEL_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`channel-chip channel-chip--filter${activeChannel === c.value ? ' is-active' : ''}`}
            aria-pressed={activeChannel === c.value}
            onClick={() => onChannelChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="channel-chips-row__kpis">
        <span className="channel-kpi-chip">
          開放 <b>{stats?.open_threads ?? 0}</b>
        </span>
        <span className="channel-kpi-chip" aria-live="polite">
          未簽 <b>{stats?.unread_total ?? 0}</b>
        </span>
        <span className="channel-kpi-chip">
          今日訊息 <b>{stats?.today_messages ?? 0}</b>
        </span>
      </div>
    </div>
  );
}

interface AppliedFilterChipsProps {
  category: string;
  mustRead: boolean;
  onClearCategory: () => void;
  onClearMustRead: () => void;
}

export function AppliedFilterChips({ category, mustRead, onClearCategory, onClearMustRead }: AppliedFilterChipsProps) {
  if (!category && !mustRead) return null;
  return (
    <div className="channel-applied-chips">
      <span className="channel-applied-chips__label">已套用:</span>
      {category && (
        <button type="button" className="channel-applied-chip" onClick={onClearCategory}>
          {category} <span aria-hidden="true">✕</span>
        </button>
      )}
      {mustRead && (
        <button type="button" className="channel-applied-chip" onClick={onClearMustRead}>
          必讀 <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}
