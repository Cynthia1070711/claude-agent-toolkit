// ============================================================
// PoolSection.tsx — 可摺疊池區塊 (BUG fix: 統一外觀 + 池內限一排)
// ============================================================
import { useState, type ReactNode } from 'react';
import type { PoolKey } from '../types/emergence.js';

interface Props {
  poolKey: PoolKey;
  icon: string;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  emptyText?: string;
}

// BUG 2b fix: 移除 POOL_BORDER_STYLE (原 solid/dashed/dotted/double) — 統一 solid

export default function PoolSection({ poolKey, icon, title, count, collapsed, onToggle, children, emptyText }: Props) {
  const [showAll, setShowAll] = useState(false);  // BUG 2a fix: 池內限一排
  const labelId = `pool-label-${poolKey}`;

  return (
    <section
      className={`emergence-pool emergence-pool--${poolKey}`}
      role="region"
      aria-labelledby={labelId}
    >
      <div className="emergence-pool__header" onClick={onToggle} role="button" tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <span id={labelId} className="emergence-pool__title">
          <span className="emergence-pool__icon" aria-hidden="true">{icon}</span>
          {title}
        </span>
        <span className="emergence-pool__count-chip" aria-label={`${count} 項`}>{count}</span>
        <span className={`emergence-pool__chevron${collapsed ? '' : ' emergence-pool__chevron--open'}`} aria-hidden="true">▾</span>
      </div>
      {!collapsed && count === 0 && (
        <div className="emergence-pool__body">
          <p className="emergence-pool__empty">{emptyText ?? '暫無資料'}</p>
        </div>
      )}
      {!collapsed && count > 0 && (
        <>
          <div className={`emergence-pool__body${!showAll ? ' emergence-pool__body--row-limited' : ''}`}>
            {children}
          </div>
          {/* BUG 2a fix: 池內展開全部 / 收合一排 切換 */}
          <button
            className="emergence-pool__expand-btn"
            onClick={() => setShowAll(v => !v)}
            aria-expanded={showAll}
          >
            {showAll ? '收合一排' : '展開全部'}
          </button>
        </>
      )}
    </section>
  );
}
