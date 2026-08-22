// ============================================================
// MsgBlock.tsx — 單則訊息（ccb-3-devconsole-channel-page AC7/AC13）
// ref chips 僅定義的五 key 全數支援；未知 key 整塊不渲染（BR-020）。
// body 純文字渲染（pre-wrap，禁 innerHTML — BR-048/AC13）。
// ============================================================
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MessageWithReads } from '../../types/channel.js';
import { REF_JSON_KEYS } from '../../types/channel.js';
import { formatTimestamp } from '../../lib/naturalLanguage.js';

interface MsgBlockProps {
  message: MessageWithReads;
  onNavigateBoard: (boardId: string) => void;
  onNavigateThread: (threadId: string) => void;
}

/** BR-020 契約五 key — 直接引用 types/channel.ts 的 SSoT，避免本檔與型別檔各維護一份而漂移。 */
const KNOWN_REF_KEYS = REF_JSON_KEYS;

/** CSS 以 -webkit-line-clamp: 6 夾斷 body，故展開鈕門檻必須同時看「行數」，
 *  只看字元數會讓「多短行但總字元少」的訊息被夾斷卻無展開鈕（內容永久不可達）。 */
function needsExpandToggle(body: string): boolean {
  return body.length > 240 || body.split('\n').length > 6;
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 權限被拒時靜默失敗（dev tool 內部用途，非關鍵路徑）
    }
  }
  return (
    <button type="button" className="channel-ref-chip" onClick={handleClick}>
      ⧉ {label} {copied ? '(已複製)' : ''}
    </button>
  );
}

export default function MsgBlock({ message, onNavigateBoard, onNavigateThread }: MsgBlockProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const refJson = message.ref_json ?? {};
  const hasKnownKey = KNOWN_REF_KEYS.some((k) => k in refJson);

  const isSuperseded = message.superseded_by !== null;
  const sameThreadTarget = isSuperseded && message.superseded_by_thread_id === message.thread_id;

  const bodyCls = `channel-msg__body${expanded ? ' is-expanded' : ''}`;

  const chips: ReactNode[] = [];
  if (typeof refJson['story_id'] === 'string') {
    const storyId = refJson['story_id'] as string;
    chips.push(
      <button key="story_id" type="button" className="channel-ref-chip" onClick={() => navigate(`/stories/${encodeURIComponent(storyId)}`)}>
        ⧉ {storyId}
      </button>,
    );
  }
  if (typeof refJson['commit'] === 'string') {
    chips.push(<CopyChip key="commit" label={(refJson['commit'] as string).slice(0, 8)} value={refJson['commit'] as string} />);
  }
  if (typeof refJson['file'] === 'string') {
    const full = refJson['file'] as string;
    const tail = full.split('/').pop() ?? full;
    chips.push(<CopyChip key="file" label={tail} value={full} />);
  }
  if (typeof refJson['board_id'] === 'string') {
    const boardId = refJson['board_id'] as string;
    chips.push(
      <button key="board_id" type="button" className="channel-ref-chip" onClick={() => onNavigateBoard(boardId)}>
        ⧉ 看板:{boardId}
      </button>,
    );
  }
  if (typeof refJson['thread_id'] === 'string') {
    const tid = refJson['thread_id'] as string;
    chips.push(
      <button key="thread_id" type="button" className="channel-ref-chip" onClick={() => onNavigateThread(tid)}>
        ⧉ 話題:{tid}
      </button>,
    );
  }

  return (
    <div id={`msg-${message.msg_id}`} className={`channel-msg${isSuperseded ? ' channel-msg--superseded' : ''}`}>
      <div className="channel-msg__head">
        <span className="channel-msg__seq">#{message.seq}</span>
        <span className="channel-msg__from">[{message.from_track}]</span>
        <span className="channel-msg__time">{formatTimestamp(message.created_at)}</span>
        <span className="channel-msg__reads">
          {message.reads.map((r) => (
            <span key={r.track} title={formatTimestamp(r.read_at)}>
              ✅{r.track}
            </span>
          ))}
        </span>
      </div>

      {isSuperseded && (
        <p className="channel-msg__superseded-notice">
          {/* 刪除線由 channel.css `.channel-msg--superseded .channel-msg__body` 提供；
              此處先前寫成字面 `~~已更正~~`，JSX 不解析 markdown，使用者會看到裸波浪號。 */}
          已更正 →{' '}
          {sameThreadTarget ? (
            <a href={`#msg-${message.superseded_by}`}>見 #{message.superseded_by_seq}</a>
          ) : (
            <button type="button" className="channel-ref-chip" onClick={() => onNavigateThread(message.superseded_by_thread_id!)}>
              見「{message.superseded_by_thread_id}」#{message.superseded_by_seq}
            </button>
          )}
        </p>
      )}

      <pre className={bodyCls}>{message.body}</pre>
      {needsExpandToggle(message.body) && (
        <button type="button" className="channel-msg__expand-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收合' : '展開'}
        </button>
      )}

      {hasKnownKey && <div className="channel-msg__ref-chips">{chips}</div>}
    </div>
  );
}
