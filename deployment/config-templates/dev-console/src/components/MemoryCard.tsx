// ============================================================
// MemoryCard.tsx — Memory 結果卡片（展開/收合）
// AC-6: 標題、category badge、時間戳、content 預覽 200 字元
// ============================================================
import { useState } from 'react';
import type { ContextEntry, TechEntry, MemoryType } from '../types/memory.js';

interface MemoryCardProps {
  item: ContextEntry | TechEntry;
  type: MemoryType;
  onEdit: (item: ContextEntry | TechEntry) => void;
  onDelete: (id: number) => void;
}

function getTimestamp(item: ContextEntry | TechEntry, type: MemoryType): string {
  if (type === 'context') return (item as ContextEntry).timestamp;
  return (item as TechEntry).created_at;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', // TZ FIX 2026-05-29: pin 台灣時區(對齊 GodNodes/System CR F-L2)
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

export default function MemoryCard({ item, type, onEdit, onDelete }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const content =
    type === 'context'
      ? (item as ContextEntry).content
      : (item as TechEntry).solution ?? (item as TechEntry).problem ?? (item as TechEntry).outcome;

  const preview = content ? content.slice(0, 200) : '';
  const hasMore = content ? content.length > 200 : false;

  return (
    <div className="memory-card">
      <div className="memory-card__header">
        <span className="memory-card__category">{item.category}</span>
        <span className="memory-card__time">{formatDate(getTimestamp(item, type))}</span>
      </div>
      <h3 className="memory-card__title">{item.title}</h3>
      <p className="memory-card__content">
        {expanded ? content : preview}
        {hasMore && !expanded && <span className="memory-card__ellipsis">…</span>}
      </p>
      {hasMore && (
        <button
          type="button"
          className="memory-card__expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收合' : '展開完整內容'}
        </button>
      )}
      <div className="memory-card__actions">
        <button
          type="button"
          className="memory-card__btn memory-card__btn--edit"
          onClick={() => onEdit(item)}
        >
          編輯
        </button>
        <button
          type="button"
          className="memory-card__btn memory-card__btn--delete"
          onClick={() => onDelete(item.id)}
        >
          刪除
        </button>
      </div>
    </div>
  );
}
