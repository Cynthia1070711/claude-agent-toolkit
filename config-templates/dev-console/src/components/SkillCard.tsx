// ============================================================
// SkillCard.tsx — 技能池卡片 (ecc-emergence-ui-v2 AC6/AC8)
// ============================================================
import type { GeneratedSkill } from '../types/emergence.js';
import { calcImprovementPct } from '../lib/naturalLanguage.js';

interface Props {
  skill: GeneratedSkill;
  onPause: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenModal?: (skill: GeneratedSkill) => void;
  pausing?: boolean;
  deleting?: boolean;
}

function effectBarClass(pct: number): string {
  if (pct > 70) return 'emergence-effect-bar--green';
  if (pct >= 30) return 'emergence-effect-bar--yellow';
  return 'emergence-effect-bar--red';
}

export default function SkillCard({ skill, onPause, onDelete, onOpenModal, pausing, deleting }: Props) {
  // CR Bug A — AC8 「before_freq=0 視為 null 顯示『樣本不足』」:
  // 後端 schema improvement_pct REAL NOT NULL → CLI bf=0 寫 0(非 null),?? 只 fallback null/undefined,
  // 故需顯式檢查 before_freq === 0 / null,避免 UI 將「無樣本」誤渲染為「0% 紅色長條」。
  const hasSample = skill.before_freq != null && skill.before_freq > 0;
  const pct = hasSample
    ? (skill.improvement_pct ?? calcImprovementPct(skill.before_freq, skill.after_freq ?? null))
    : null;
  const isPaused = skill.status === 'paused';

  return (
    <div
      className={`emergence-card emergence-card--v2${isPaused ? ' emergence-card--paused' : ''}`}
      onClick={() => onOpenModal?.(skill)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenModal?.(skill); }
      }}
      aria-label={`技能：${skill.skill_path}`}
    >
      {/* BUG fix: 加 ⭐ 星數展開 (pct 高 = 多星) */}
      {pct !== null && (
        <div className="emergence-card__star-badge" aria-label={`效果 ${pct}%`}>
          {'⭐'.repeat(Math.max(1, Math.min(10, Math.ceil(pct / 10))))}
        </div>
      )}
      <div className="emergence-card__skill-path">{skill.skill_path}</div>
      {isPaused && <span className="emergence-card__paused-chip">⏸ 已停用</span>}

      {/* 效果改善率長條 */}
      {pct !== null ? (
        <div className="emergence-effect-bar">
          <svg className="emergence-effect-bar__svg" width="100%" height="10" aria-hidden="true">
            <defs>
              <pattern id="effect-diagonal" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" className="emergence-effect-bar__pattern-stroke" />
              </pattern>
              <pattern id="effect-dots" patternUnits="userSpaceOnUse" width="6" height="6">
                <circle cx="3" cy="3" r="1.5" fill="currentColor" className="emergence-effect-bar__pattern-dot" />
              </pattern>
            </defs>
            <rect width={`${Math.max(0, pct)}%`} height="10" rx="3"
              fill={pct > 70 ? 'url(#effect-diagonal)' : pct >= 30 ? 'url(#effect-dots)' : 'var(--dvc-bar-effect-red)'}
              className={effectBarClass(pct)}
            />
          </svg>
          <span className="emergence-effect-bar__label">
            {pct > 70 ? null : pct >= 30 ? null : <span aria-label="警告">⚠</span>}
            {pct}% 改善
          </span>
        </div>
      ) : (
        <span className="emergence-card__sample-insufficient">樣本不足</span>
      )}

      {/* Footer */}
      <div className="emergence-card__footer" onClick={(e) => e.stopPropagation()}>
        <button
          className="emergence-card__gov-btn"
          onClick={() => onPause(skill.id)}
          disabled={!!pausing || isPaused}
          title="停用此技能"
        >{pausing ? '…' : '⏸ 停用'}</button>
        <button
          className="emergence-card__gov-btn emergence-card__gov-btn--danger"
          onClick={() => onDelete(skill.id)}
          disabled={!!deleting}
          title="刪除此技能"
        >{deleting ? '…' : '🗑 刪除'}</button>
      </div>
    </div>
  );
}
