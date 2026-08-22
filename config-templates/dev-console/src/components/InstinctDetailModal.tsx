// ============================================================
// InstinctDetailModal.tsx — 卡片詳情 Modal (ecc-emergence-ui-v2 AC3/AC11/AC12)
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import type { InstinctCard, GeneratedSkill } from '../types/emergence.js';
import { formatAdoption, formatConfidence, formatVerifier, formatDecay, formatTimestamp, calcMixedScore } from '../lib/naturalLanguage.js';

interface Props {
  card: InstinctCard;
  generatedSkill?: GeneratedSkill | null;
  onClose: () => void;
}

export default function InstinctDetailModal({ card, generatedSkill, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'advanced'>('overview');

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

  const mixedScore = calcMixedScore(card.confidence, card.adoption_score ?? 0);
  const improvementPct = generatedSkill?.improvement_pct ?? null;

  return (
    <div
      className="emergence-detail-modal-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className="emergence-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${card.trigger} → ${card.action}`}
        onClick={stopProp}
      >
        {/* Header */}
        <div className="emergence-detail-modal__header">
          <div className="emergence-detail-modal__star">⭐ {card.machine_star}</div>
          <div className="emergence-detail-modal__title-area">
            <div className="emergence-detail-modal__trigger">{card.trigger}</div>
            <div className="emergence-detail-modal__action">→ {card.action}</div>
          </div>
          <button className="emergence-detail-modal__close" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        {/* Tab bar */}
        <div className="emergence-detail-modal__tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`emergence-detail-modal__tab${activeTab === 'overview' ? ' emergence-detail-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >概覽</button>
          <button
            role="tab"
            aria-selected={activeTab === 'advanced'}
            className={`emergence-detail-modal__tab${activeTab === 'advanced' ? ' emergence-detail-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >進階</button>
        </div>

        {/* Tab content */}
        <div className="emergence-detail-modal__body">
          {activeTab === 'overview' ? (
            <div className="emergence-detail-modal__overview">
              {/* ① 主要用途 */}
              <section className="emergence-detail-modal__section">
                <h3 className="emergence-detail-modal__section-title">主要用途</h3>
                <p className="emergence-detail-modal__section-body">
                  {card.description_zh
                    ? card.description_zh
                    : `當「${card.trigger}」發生時，自動執行「${card.action}」。`}
                </p>
              </section>

              {/* ② 當前狀況 */}
              <section className="emergence-detail-modal__section">
                <h3 className="emergence-detail-modal__section-title">當前狀況</h3>
                <div className="emergence-detail-modal__status-row">
                  <span>{formatAdoption(card.adoption_score ?? 0)}</span>
                  <span>{formatConfidence(card.confidence)}</span>
                  <span>{formatVerifier(card.verifier_status)}</span>
                </div>
                <div className="emergence-detail-modal__score-bar-wrap">
                  <div className="emergence-detail-modal__score-bar-track">
                    <div className="emergence-detail-modal__score-bar" style={{ width: `${mixedScore}%` }} />
                  </div>
                  <span className="emergence-detail-modal__score-pct">{mixedScore}分</span>
                </div>
                <p className="emergence-detail-modal__decay">{formatDecay(card.decay_at)}</p>
              </section>

              {/* ③ 影響 */}
              <section className="emergence-detail-modal__section">
                <h3 className="emergence-detail-modal__section-title">影響</h3>
                <p className="emergence-detail-modal__section-body">
                  {generatedSkill && improvementPct !== null
                    ? `上線後此類問題改善約 ${improvementPct}%。`
                    : `若採用此本能，有助於減少「${card.domain ?? '相關'}」領域的問題發生。`}
                </p>
              </section>

              {/* ④ 改善建議 */}
              <section className="emergence-detail-modal__section">
                <h3 className="emergence-detail-modal__section-title">改善</h3>
                <p className="emergence-detail-modal__section-body">
                  {generatedSkill && improvementPct !== null
                    ? `效果量測改善率：${improvementPct}%（樣本取自 7 天觀測窗）。`
                    : (card.adoption_score ?? 0) >= 5 && card.verifier_status === 'approved'
                      ? '可考慮 promote 至 global，在更多情境下適用。'
                      : '需更多採用累積證據，繼續觀察後再評估。'}
                </p>
              </section>
            </div>
          ) : (
            <div className="emergence-detail-modal__advanced">
              <dl className="emergence-detail-modal__dl">
                <dt>信心值</dt><dd>{card.confidence.toFixed(4)}</dd>
                <dt>採用分</dt><dd>{card.adoption_score ?? 0}/5</dd>
                <dt>來源</dt><dd>{card.source ?? '—'}</dd>
                <dt>工作階段</dt><dd>{card.source_session_id ?? '—'}</dd>
                <dt>建立</dt><dd>{formatTimestamp(card.created_at)}</dd>
                <dt>最後活動</dt><dd>{formatTimestamp(card.last_seen)}</dd>
                <dt>衰退時間</dt><dd>{formatTimestamp(card.decay_at)}</dd>
                <dt>範疇</dt><dd>{card.scope}</dd>
                {card.evidence_jsonb && (
                  <><dt>佐證資料</dt><dd><pre className="emergence-detail-modal__pre">{card.evidence_jsonb}</pre></dd></>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
