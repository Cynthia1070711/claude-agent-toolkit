// ============================================================
// CandidateCardV2.tsx — 候選池卡片 (ecc-emergence-ui-v2 AC7/AC8)
// ============================================================
import { useState } from 'react';
import type { EvolveCandidate } from '../types/emergence.js';
import { calcMixedScore } from '../lib/naturalLanguage.js';

interface Props {
  candidate: EvolveCandidate;
  onGenerate: (candidate: EvolveCandidate) => void;
  onReject?: (candidate: EvolveCandidate, reason: string) => void;
  onOpenModal?: (candidate: EvolveCandidate) => void;
}

export default function CandidateCardV2({ candidate, onGenerate, onReject, onOpenModal }: Props) {
  const avgScore = calcMixedScore(candidate.avg_confidence, candidate.avg_adoption_score ?? 0);
  const handleCardClick = () => onOpenModal?.(candidate);
  const starN = Math.max(1, Math.min(10, Math.ceil(avgScore / 10)));
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const handleRejectConfirm = () => {
    if (!rejectReason.trim() || !onReject) return;
    onReject(candidate, rejectReason.trim());
    setShowRejectInput(false);
    setRejectReason('');
  };

  return (
    <div
      className={`emergence-card emergence-card--v2${candidate.redundant ? ' emergence-card--redundant' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); }
      }}
      aria-label={`候選：${candidate.domain} ${candidate.type}`}
    >
      {/* BUG fix: 加 ⭐ 星數展開 */}
      <div className="emergence-card__star-badge" aria-label={`${starN} 星`}>
        {'⭐'.repeat(starN)}
      </div>
      <div className="emergence-card__type-badge">
        {candidate.type === 'skill' ? '🔧 skill' : '🪝 agent-hook'}
      </div>
      <div className="emergence-card__domain">{candidate.domain}</div>
      {candidate.redundant && (
        <div
          className="emergence-card__redundant-badge"
          title={`已被既有 rule/skill 涵蓋（生成前請確認非重複）:\n${(candidate.covered_by ?? []).join('\n')}`}
        >
          ⚠️ 已被既有 rule/skill 涵蓋 · 建議駁回
        </div>
      )}
      <div className="emergence-card__action">建議：{candidate.suggested_action}</div>
      <div className="emergence-card__meta">
        {candidate.members.length} instincts · 否決 {candidate.rejected_total} 次
      </div>

      {/* 計分長條 */}
      <div className="emergence-effect-bar__track" role="progressbar" aria-valuenow={avgScore} aria-valuemin={0} aria-valuemax={100}>
        <div className="emergence-effect-bar__fill emergence-effect-bar--observe" style={{ width: `${avgScore}%` }} />
      </div>
      <span className="emergence-card__score-pct">{avgScore}%</span>

      {/* Footer (stopPropagation 防觸發 Modal) */}
      <div className="emergence-card__footer" onClick={(e) => e.stopPropagation()}>
        <button
          className={`emergence-card__gov-btn emergence-card__gov-btn--generate${candidate.redundant ? ' emergence-card__gov-btn--warn' : ''}`}
          onClick={() => onGenerate(candidate)}
          title={candidate.redundant ? '⚠️ 此候選已被既有 rule/skill 涵蓋，生成前請確認非重複' : '生成 Skill'}
        >{candidate.redundant ? '⚠️ 生成' : '✨ 生成'}</button>
        {onReject && (
          <button
            className="emergence-card__gov-btn emergence-card__gov-btn--reject"
            onClick={() => setShowRejectInput(v => !v)}
            title={`否決此候選 — 批次否決 ${candidate.members.length} 個成員 instinct 並移入否決池`}
          >🚫 否決</button>
        )}
      </div>
      {/* 否決理由輸入(對齊 InstinctCardV2 inline 範式) */}
      {onReject && showRejectInput && (
        <div className="emergence-card__reject-input" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="否決理由（必填）"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <button onClick={handleRejectConfirm} disabled={!rejectReason.trim()}>確認否決</button>
          <button onClick={() => { setShowRejectInput(false); setRejectReason(''); }}>取消</button>
        </div>
      )}
    </div>
  );
}
