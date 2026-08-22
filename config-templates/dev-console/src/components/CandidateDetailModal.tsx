// ============================================================
// CandidateDetailModal.tsx — 候選池詳情 Modal (BUG 5 fix)
// ============================================================
import { useEffect, useCallback } from 'react';
import type { EvolveCandidate } from '../types/emergence.js';
import { calcMixedScore } from '../lib/naturalLanguage.js';

interface Props {
  candidate: EvolveCandidate;
  onClose: () => void;
  onGenerate?: (candidate: EvolveCandidate) => void;
}

export default function CandidateDetailModal({ candidate, onClose, onGenerate }: Props) {
  // ESC handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // body overflow:hidden
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);
  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const avgScore = calcMixedScore(candidate.avg_confidence, candidate.avg_adoption_score ?? 0);
  const starN = Math.max(1, Math.min(10, Math.ceil(avgScore / 10)));
  const typeLabel = candidate.type === 'skill' ? '🔧 Skill' : '🪝 Agent-Hook';

  return (
    <div className="emergence-detail-modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="emergence-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`候選詳情：${candidate.domain} ${candidate.type}`}
        onClick={stopProp}
      >
        {/* Header */}
        <div className="emergence-detail-modal__header">
          <div className="emergence-detail-modal__star" aria-label={`${starN} 星`}>
            {'⭐'.repeat(starN)}
          </div>
          <div className="emergence-detail-modal__title-area">
            <div className="emergence-detail-modal__trigger">{typeLabel} · {candidate.domain}</div>
            <div className="emergence-detail-modal__action">建議：{candidate.suggested_action}</div>
          </div>
          <button className="emergence-detail-modal__close" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {/* Body */}
        <div className="emergence-detail-modal__body">
          <div className="emergence-detail-modal__overview">
            <section className="emergence-detail-modal__section">
              <h3 className="emergence-detail-modal__section-title">主要用途</h3>
              <p className="emergence-detail-modal__section-body">
                {candidate.type === 'skill'
                  ? `這是一個「${candidate.domain}」領域的候選技能，由 ${candidate.members.length} 條相關本能聚類而成，建議走 saas-to-skill 生成為正式技能。`
                  : `這是一個「${candidate.domain}」領域的候選代理/Hook，由 ${candidate.members.length} 條相關本能聚類而成，建議走 hooks-mechanization 生成為自動化規則。`}
              </p>
            </section>

            <section className="emergence-detail-modal__section">
              <h3 className="emergence-detail-modal__section-title">當前狀況</h3>
              <div className="emergence-detail-modal__status-row">
                <span>聚類成員 {candidate.members.length} 條</span>
                <span>平均信心 {Math.round(candidate.avg_confidence * 100)}%</span>
                <span>已被否決 {candidate.rejected_total} 次</span>
              </div>
              <div className="emergence-detail-modal__score-bar-wrap">
                <div className="emergence-detail-modal__score-bar-track">
                  <div className="emergence-detail-modal__score-bar" style={{ width: `${avgScore}%` }} />
                </div>
                <span className="emergence-detail-modal__score-pct">{avgScore}分</span>
              </div>
            </section>

            <section className="emergence-detail-modal__section">
              <h3 className="emergence-detail-modal__section-title">影響</h3>
              <p className="emergence-detail-modal__section-body">
                若採用此候選，將會把 {candidate.members.length} 條相關本能整合為一條正式{candidate.type === 'skill' ? '技能' : 'Hook 規則'}，
                在「{candidate.domain}」場景下統一觸發行為。
              </p>
            </section>

            <section className="emergence-detail-modal__section">
              <h3 className="emergence-detail-modal__section-title">改善建議</h3>
              <p className="emergence-detail-modal__section-body">
                {candidate.rejected_total > 0
                  ? `此候選曾被否決 ${candidate.rejected_total} 次，建議先審視成員本能再決定生成。`
                  : '可以直接走「生成」流程，加入正式技能池。生成後系統會追蹤效果（長條 % 改善率）。'}
              </p>
            </section>
          </div>

          {onGenerate && (
            <div className="emergence-detail-modal__footer">
              <button
                className="emergence-card__gov-btn emergence-card__gov-btn--generate"
                onClick={() => { onGenerate(candidate); onClose(); }}
              >✨ 生成此候選</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
