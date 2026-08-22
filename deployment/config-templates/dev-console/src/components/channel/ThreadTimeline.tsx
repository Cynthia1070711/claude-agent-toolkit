// ============================================================
// ThreadTimeline.tsx — thread 時間軸容器（ccb-3-devconsole-channel-page AC7）
// seq 升序渲染（後端已排序，前端不重排）+ 返回。
// ============================================================
import { useEffect, useState } from 'react';
import { fetchChannelThreadMessages } from '../../services/channelApi.js';
import type { ThreadMessagesResult } from '../../types/channel.js';
import MsgBlock from './MsgBlock.js';

interface ThreadTimelineProps {
  threadId: string;
  onBack: () => void;
  onNavigateBoard: (boardId: string) => void;
  onNavigateThread: (threadId: string) => void;
}

export default function ThreadTimeline({ threadId, onBack, onNavigateBoard, onNavigateThread }: ThreadTimelineProps) {
  const [data, setData] = useState<ThreadMessagesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChannelThreadMessages(threadId)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [threadId]);

  return (
    <div className="channel-timeline">
      <div className="channel-timeline__header">
        <button type="button" className="channel-timeline__back" onClick={onBack}>
          ← 返回
        </button>
        {data && (
          <span className="channel-timeline__title">
            {data.thread.must_read === 1 && <span aria-hidden="true">🔴必讀 · </span>}
            {data.thread.topic}
            {' · '}● {data.thread.state === 'open' ? 'open' : 'closed'}
          </span>
        )}
      </div>

      {loading && <p className="channel-timeline__loading">載入中…</p>}
      {error && (
        <div className="channel-block-error">
          <p>時間軸載入失敗:{error}</p>
        </div>
      )}
      {data && data.messages.length === 0 && <p className="channel-list-empty">0 則 · 尚無訊息</p>}

      {data &&
        data.messages.map((m) => (
          <MsgBlock key={m.msg_id} message={m} onNavigateBoard={onNavigateBoard} onNavigateThread={onNavigateThread} />
        ))}
    </div>
  );
}
