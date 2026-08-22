// ============================================================
// EmergenceRecentList.tsx — 湧現迴路資料清單 (ecc-emergence-ui-v2 AC10)
// 顯示全部項目 + 固定高度直式滾軸(對齊 live-obs 設計);截斷由 CSS ellipsis 處理。
// ============================================================
import type { InstinctCard } from '../types/emergence.js';

interface Props {
  instincts: InstinctCard[];
  onSelect?: (card: InstinctCard) => void;  // BUG 7 fix: 清單項可點開 Modal
}

// 排序對齊 Layer 12 注入順序 (adoption_score DESC, confidence DESC)
function scoreSort(a: InstinctCard, b: InstinctCard): number {
  const ad = (b.adoption_score ?? 0) - (a.adoption_score ?? 0);
  return ad !== 0 ? ad : b.confidence - a.confidence;
}

export default function EmergenceRecentList({ instincts, onSelect }: Props) {
  const sorted = [...instincts].sort(scoreSort);

  return (
    <div className="emergence-recent-list">
      <h3 className="emergence-recent-list__title">湧現迴路資料清單（對應 Layer 12 注入）</h3>
      <ul className="emergence-recent-list__items">
        {sorted.map(inst => {
          const starN = Math.max(1, Math.min(10, inst.machine_star || 1));
          return (
            <li
              key={inst.id}
              className="emergence-recent-list__item"
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(inst)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(inst);
                }
              }}
              style={onSelect ? { cursor: 'pointer' } : undefined}
              aria-label={`查看詳情：${inst.trigger}`}
            >
              <span className="emergence-recent-list__star" aria-label={`${starN} 星`}>
                ⭐ {starN}
              </span>
              <span className="emergence-recent-list__score-pill" aria-label={`分數 ${inst.adoption_score ?? 0}`}>
                score {inst.adoption_score ?? 0}
              </span>
              <span className="emergence-recent-list__text">
                {`${inst.trigger} → ${inst.action}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
