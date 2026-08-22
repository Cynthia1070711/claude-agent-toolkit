// ============================================================
// ThreadList.tsx — Tab1 通話中 / Tab2 封存查詢共用列表（ccb-3-devconsole-channel-page）
// 列為 <button> 語意（AC9/BR018）；aria-label 格式對齊 03 章 §六。
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ThreadListItem } from '../../types/channel.js';
import { formatRelativeTime } from '../../lib/channelTime.js';

interface ThreadListProps {
  items: ThreadListItem[];
  mode: 'live' | 'archive';
  onSelectThread: (threadId: string) => void;
  emptyMessage: string;
}

function renderSnippet(snippet: string): ReactNode {
  const parts = snippet.split(/(\[[^\]]*\])/g).filter((p) => p !== '');
  return parts.map((part, i) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <mark key={i}>{part.slice(1, -1)}</mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function buildAriaLabel(item: ThreadListItem): string {
  const dest = item.latest_msg ? item.latest_msg.to_tracks.join('、') : '—';
  return `${item.ordinal} ${item.topic},${item.initiator_track}→${dest},${item.msg_count} 則,未簽 ${item.read_stats.unsigned_count}`;
}

export default function ThreadList({ items, mode, onSelectThread, emptyMessage }: ThreadListProps) {
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentIds = new Set(items.map((i) => i.thread_id));
    if (prevIdsRef.current) {
      const fresh = new Set<string>();
      for (const id of currentIds) {
        if (!prevIdsRef.current.has(id)) fresh.add(id);
      }
      if (fresh.size > 0) {
        setNewIds(fresh);
        const timer = setTimeout(() => setNewIds(new Set()), 2000);
        prevIdsRef.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    prevIdsRef.current = currentIds;
    return undefined;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="channel-list-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="channel-thread-list">
      {items.map((item) => {
        const rowCls = [
          'channel-row',
          item.must_read === 1 ? 'channel-row--must-read' : '',
          newIds.has(item.thread_id) ? 'channel-row--new' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li key={item.thread_id}>
            <button type="button" className={rowCls} onClick={() => onSelectThread(item.thread_id)} aria-label={buildAriaLabel(item)}>
              <span className="channel-row__ordinal">#{item.ordinal}</span>
              {mode === 'archive' && <span className="channel-row__state" aria-hidden="true">○</span>}
              <span className="channel-row__topic" title={item.topic}>
                {item.topic}
              </span>
              {item.category && <span className="channel-row__category">⟨{item.category}⟩</span>}

              {item.msg_count === 0 ? (
                <span className="channel-row__degraded">0 則 · 尚無訊息</span>
              ) : (
                <>
                  <span className="channel-row__msgtype">《{item.latest_msg?.msg_type ?? ''}》</span>
                  <span className="channel-row__count">{item.msg_count} 則</span>
                  <span className="channel-row__time">
                    {formatRelativeTime(item.msg_count > 0 ? item.latest_msg?.created_at ?? item.created_at : item.created_at)}
                  </span>
                  <span className="channel-row__route">
                    {item.initiator_track} → {item.latest_msg ? item.latest_msg.to_tracks.join('、') : '—'}
                  </span>
                </>
              )}

              {mode === 'live' && (
                <span className="channel-row__signoff" aria-live="polite">
                  簽收 ◇{item.initiator_track}
                  {item.read_stats.expected.map((track) => (
                    <span key={track}>
                      {' '}
                      {item.read_stats.signed.includes(track) ? '✅' : '⬜'}
                      {track}
                    </span>
                  ))}
                </span>
              )}

              {item.match_snippet && <span className="channel-row__snippet">{renderSnippet(item.match_snippet)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
