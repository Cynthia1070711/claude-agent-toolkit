// ============================================================
// DecisionCard.tsx — 技術決策卡片（展開/收合）
// DVS-07 AC-2: 標題、來源 badge、日期、摘要（前 200 字）、展開詳情
// ============================================================
import { useState } from 'react';
import type { DecisionEntry, DecisionSource } from '../types/decisions.js';

interface DecisionCardProps {
  item: DecisionEntry;
}

const SOURCE_LABEL: Record<DecisionSource, string> = {
  context: 'Context',
  tech: 'Tech',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', // TZ FIX 2026-05-29: pin 台灣時區(對齊 GodNodes/System CR F-L2),禁隱式瀏覽器本地
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function DecisionCard({ item }: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = item.content ? item.content.slice(0, 200) : '';
  const hasMore = item.content ? item.content.length > 200 : false;

  return (
    <div className="decision-card">
      <div className="decision-card__header">
        <span className={`decision-card__badge decision-card__badge--${item.source}`}>
          {SOURCE_LABEL[item.source]}
        </span>
        <span className="decision-card__date">{formatDate(item.timestamp)}</span>
      </div>
      <h3 className="decision-card__title">{item.title}</h3>
      {item.story_id && (
        <span className="decision-card__meta">Story: {item.story_id}</span>
      )}
      <p className="decision-card__content">
        {expanded ? item.content : preview}
        {hasMore && !expanded && <span className="decision-card__ellipsis">…</span>}
      </p>
      {hasMore && (
        <button
          type="button"
          className="decision-card__expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收合' : '展開完整內容'}
        </button>
      )}
    </div>
  );
}
