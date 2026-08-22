// ============================================================
// InstinctCardV2.tsx — 觀察池卡片 (ecc-emergence-ui-v2 AC2/AC4/AC8/AC12)
// ============================================================
import { useState } from 'react';
import type { InstinctCard } from '../types/emergence.js';
import { formatAdoption, formatVerifier, calcMixedScore } from '../lib/naturalLanguage.js';

interface Props {
  card: InstinctCard;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onOpenModal: (card: InstinctCard) => void;
  liking?: boolean;
  disliking?: boolean;
  rejecting?: boolean;
}

export default function InstinctCardV2({ card, onLike, onDislike, onReject, onOpenModal, liking, disliking, rejecting }: Props) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const mixedScore = calcMixedScore(card.confidence, card.adoption_score ?? 0);
  const isRejected = card.verifier_status === 'rejected';

  const handleCardClick = () => onOpenModal(card);

  const handleRejectConfirm = () => {
    if (!rejectReason.trim()) return;
    onReject(card.id, rejectReason.trim());
    setShowRejectInput(false);
    setRejectReason('');
  };

  return (
    <div className="emergence-card emergence-card--v2" onClick={handleCardClick} role="button" tabIndex={0}
      onKeyDown={(e) => {
        // CR Bug B — AC13 ARIA button: 對齊 PoolSection 範式雙鍵(Enter + Space)且 Space 必 preventDefault 防頁面滾動
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); }
      }}
      aria-label={`本能：${card.trigger} → ${card.action}`}
    >
      {/* 左上星數 BUG fix: 展開 N 顆 ⭐ */}
      <div className="emergence-card__star-badge" aria-label={`${card.machine_star} 星`}>
        {'⭐'.repeat(Math.max(1, Math.min(10, card.machine_star || 1)))}
      </div>

      {/* 主內容 */}
      <div className="emergence-card__trigger">{card.trigger}</div>
      <div className="emergence-card__action">→ {card.action}</div>

      {/* 計分長條 */}
      <div className="emergence-effect-bar__track" role="progressbar" aria-valuenow={mixedScore} aria-valuemin={0} aria-valuemax={100}>
        <div className="emergence-effect-bar__fill emergence-effect-bar--observe" style={{ width: `${mixedScore}%` }} />
      </div>
      <span className="emergence-card__score-pct">{mixedScore}%</span>

      {/* Chips */}
      <div className="emergence-card__chips">
        <span className="emergence-card__verifier-chip">{formatVerifier(card.verifier_status)}</span>
        <span className="emergence-card__adoption-chip">{formatAdoption(card.adoption_score ?? 0)}</span>
        {(card.rejected_count ?? 0) > 0 && (
          <span className="emergence-card__rejected-badge">⚠ 曾被否決 {card.rejected_count} 次</span>
        )}
      </div>

      {/* Footer 治理按鈕 */}
      <div className="emergence-card__footer" onClick={(e) => e.stopPropagation()}>
        <button
          className="emergence-card__gov-btn emergence-card__gov-btn--like"
          onClick={() => onLike(card.id)}
          disabled={!!liking || isRejected}
          title="讚：提升信心值"
        >{liking ? '…' : '👍 讚'}</button>
        <button
          className="emergence-card__gov-btn emergence-card__gov-btn--dislike"
          onClick={() => onDislike(card.id)}
          disabled={!!disliking || isRejected}
          title="扣分：降低信心值"
        >{disliking ? '…' : '👎 扣分'}</button>
        <button
          className="emergence-card__gov-btn emergence-card__gov-btn--reject"
          onClick={() => setShowRejectInput(v => !v)}
          disabled={!!rejecting || isRejected}
          title="否決此本能"
        >{rejecting ? '…' : '❌ 否決'}</button>
      </div>

      {/* 否決理由輸入 */}
      {showRejectInput && (
        <div className="emergence-card__reject-input" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="否決理由（必填）"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <button onClick={handleRejectConfirm} disabled={!rejectReason.trim() || !!rejecting}>確認否決</button>
          <button onClick={() => { setShowRejectInput(false); setRejectReason(''); }}>取消</button>
        </div>
      )}
    </div>
  );
}
