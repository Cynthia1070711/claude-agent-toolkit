// ============================================================
// RecentActivity.tsx — 最近活動列表
// DVS-05 AC-4
// ============================================================
import { useState } from 'react';
import type { ActivityItem } from '../types/dashboard.js';
import { timeAgo } from '../utils/timeAgo.js';

// category badge 配色
function getBadgeClass(category: string): string {
  switch (category) {
    case 'session': return 'dvc-badge-session';
    case 'debug': return 'dvc-badge-debug';
    case 'decision': return 'dvc-badge-decision';
    case 'pattern': return 'dvc-badge-pattern';
    case 'workflow': return 'dvc-badge-workflow';
    default: return 'dvc-badge-default';
  }
}

function ActivityItemRow({ item }: { item: ActivityItem }) {
  const [expanded, setExpanded] = useState(false);
  const MAX_CHARS = 150;
  const isTruncatable = item.content.length > MAX_CHARS;
  const displayContent = expanded ? item.content : item.content.slice(0, MAX_CHARS);

  return (
    <div className="dvc-activity-item">
      <div className="dvc-activity-meta">
        <span className="dvc-activity-time">{timeAgo(item.timestamp)}</span>
        <span className={`dvc-activity-badge ${getBadgeClass(item.category)}`}>
          {item.category}
        </span>
      </div>
      <div className="dvc-activity-heading">{item.title}</div>
      <div className="dvc-activity-content">
        {displayContent}
        {isTruncatable && !expanded && '…'}
      </div>
      {isTruncatable && (
        <button
          className="dvc-activity-expand-btn"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? '收合' : '展開'}
        </button>
      )}
    </div>
  );
}

interface RecentActivityProps {
  items: ActivityItem[];
}

export default function RecentActivity({ items }: RecentActivityProps) {
  if (items.length === 0) {
    return (
      <div className="dvc-activity-section">
        <div className="dvc-activity-title">最近活動</div>
        <div className="dvc-no-activity">目前無最近活動</div>
      </div>
    );
  }

  return (
    <div className="dvc-activity-section">
      <div className="dvc-activity-title">最近活動</div>
      <div className="dvc-activity-list">
        {items.map(item => (
          <ActivityItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
