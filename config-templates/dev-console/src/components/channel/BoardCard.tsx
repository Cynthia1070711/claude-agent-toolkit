// ============================================================
// BoardCard.tsx — 看板卡（ccb-3-devconsole-channel-page AC5）
// 常駐顯示 version + 狀態；state_json parse 失敗降級為 ⚠ 格式異常 + state_raw 前 120 字。
// ============================================================
import { useState } from 'react';
import type { ChannelBoard } from '../../types/channel.js';
import { formatTimestamp } from '../../lib/naturalLanguage.js';

interface BoardCardProps {
  board: ChannelBoard;
  highlighted?: boolean;
}

export default function BoardCard({ board, highlighted = false }: BoardCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const cls = `channel-board-card${highlighted ? ' channel-board-card--highlight' : ''}`;

  if (board.state === null) {
    const preview = (board.state_raw ?? '').slice(0, 120);
    return (
      <div className={cls} data-testid="board-card" id={`board-card-${board.board_id}`}>
        <div className="channel-board-card__head">
          <span className="channel-board-card__title">{board.title}</span>
          <span className="channel-board-card__version">v{board.version}</span>
        </div>
        <p className="channel-board-card__degraded">⚠ 格式異常</p>
        <pre className="channel-board-card__raw">{preview}</pre>
      </div>
    );
  }

  const state = board.state;
  const historyDesc = [...state.history].slice(-6).reverse();

  return (
    <div className={cls} data-testid="board-card" id={`board-card-${board.board_id}`}>
      <div className="channel-board-card__head">
        <span className="channel-board-card__title">{board.title}</span>
        <span className="channel-board-card__version">v{board.version}</span>
      </div>
      <p className="channel-board-card__status">
        <span aria-hidden="true">●</span> {state.status}
        {state.holder && <span className="channel-board-card__holder">{' · '}{state.holder} 持有</span>}
        {state.until && <span className="channel-board-card__until">{' · 至 '}{formatTimestamp(state.until)}</span>}
      </p>
      <p className="channel-board-card__updated">更新於 {formatTimestamp(board.updated_at)}</p>
      {state.note && <p className="channel-board-card__note">{state.note}</p>}

      <button
        type="button"
        className="channel-board-card__history-toggle"
        aria-expanded={historyOpen}
        onClick={() => setHistoryOpen((v) => !v)}
      >
        歷史 {historyOpen ? '▴' : '▾'}
      </button>
      {historyOpen && (
        <ul className="channel-board-card__history-list">
          {historyDesc.length === 0 && <li className="channel-board-card__history-empty">尚無歷史紀錄</li>}
          {historyDesc.map((h, i) => (
            <li key={`${h.ts}-${i}`}>
              <span className="channel-board-card__history-time">{formatTimestamp(h.ts)}</span>
              {' · '}
              <span className="channel-board-card__history-track">{h.track}</span>
              {' · '}
              <span className="channel-board-card__history-action">{h.action}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
