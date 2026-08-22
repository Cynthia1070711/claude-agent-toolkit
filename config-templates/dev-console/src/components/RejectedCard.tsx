// ============================================================
// RejectedCard.tsx — 否決池卡片 (ecc-emergence-ui-v2 AC5/AC8)
// ============================================================
import type { RejectedInstinct } from '../types/emergence.js';
import { calcMixedScore } from '../lib/naturalLanguage.js';

interface Props {
  rejected: RejectedInstinct;
  onRestore: (id: string) => void;
  restoring?: boolean;
}

export default function RejectedCard({ rejected, onRestore, restoring }: Props) {
  const conf = rejected.confidence ?? 0;
  const adoption = rejected.adoption_score ?? 0;
  const mixedScore = calcMixedScore(conf, adoption);

  return (
    <div className="emergence-card emergence-card--v2" role="article"
      aria-label={`否決：${rejected.trigger} → ${rejected.action}`}
    >
      {rejected.machine_star != null && (
        <div className="emergence-card__star-badge" aria-label={`${rejected.machine_star} 星`}>
          {'⭐'.repeat(Math.max(1, Math.min(10, rejected.machine_star)))}
        </div>
      )}

      <div className="emergence-card__trigger">{rejected.trigger}</div>
      <div className="emergence-card__action">→ {rejected.action}</div>

      {/* 計分長條（仍顯示） */}
      <div className="emergence-effect-bar__track" role="progressbar" aria-valuenow={mixedScore} aria-valuemin={0} aria-valuemax={100}>
        <div className="emergence-effect-bar__fill emergence-effect-bar--rejected" style={{ width: `${mixedScore}%` }} />
      </div>
      <span className="emergence-card__score-pct">{mixedScore}%</span>

      {/* Chips */}
      <div className="emergence-card__chips">
        <span className="emergence-card__rejected-badge">曾被否決 {rejected.reject_count} 次</span>
        {rejected.reject_reason && (
          <span className="emergence-card__reject-reason" title={rejected.reject_reason}>
            理由：{rejected.reject_reason.length > 30 ? rejected.reject_reason.slice(0, 30) + '…' : rejected.reject_reason}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="emergence-card__footer" onClick={(e) => e.stopPropagation()}>
        <button
          className="emergence-card__gov-btn emergence-card__gov-btn--restore"
          onClick={() => onRestore(String(rejected.id))}
          disabled={!!restoring}
          title="還原至觀察池"
        >{restoring ? '…' : '↩️ 還原'}</button>
      </div>
    </div>
  );
}
