// ============================================================
// DebtCard.tsx — 技術債卡片（可展開查看詳細內容）
// ============================================================
import { useState } from 'react';
import type { TechDebtEntry } from '../types/tech-debt.js';

interface DebtCardProps {
  item: TechDebtEntry;
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'badge--critical',
  high: 'badge--high',
  medium: 'badge--medium',
  low: 'badge--low',
};

const STATUS_LABEL: Record<string, string> = {
  open: '⏳ 開放',
  deferred: '⏸️ 延後',
  fixed: '✅ 已修復',
  'wont-fix': '🚫 不修復',
};

export default function DebtCard({ item }: DebtCardProps) {
  const [expanded, setExpanded] = useState(false);
  const severityKey = (item.severity || 'low').toLowerCase();
  const statusKey = (item.status || 'open').toLowerCase();

  return (
    <div
      className={`debt-card debt-card--${statusKey} ${expanded ? 'debt-card--expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="debt-card__header">
        <span className="debt-card__id">{item.debt_id || `#${item.id}`}</span>
        <span className={`badge ${SEVERITY_CLASS[severityKey] || 'badge--low'}`}>
          {(item.severity || 'low').toUpperCase()}
        </span>
        {item.dimension && (
          <span className="badge badge--dimension">{item.dimension}</span>
        )}
        <span className="debt-card__status-label">
          {STATUS_LABEL[statusKey] || statusKey}
        </span>
        <span className="debt-card__expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      <p className="debt-card__summary">{item.title || '(無標題)'}</p>

      <div className="debt-card__meta">
        {item.story_id && (
          <span className="debt-card__meta-item">
            <span className="debt-card__meta-label">來源:</span> {item.story_id}
          </span>
        )}
        {item.target_story && (
          <span className="debt-card__meta-item">
            <span className="debt-card__meta-label">目標:</span> {item.target_story}
          </span>
        )}
        {item.created_at && (
          <span className="debt-card__meta-item">
            <span className="debt-card__meta-label">建立:</span> {item.created_at.slice(0, 10)}
          </span>
        )}
      </div>

      {expanded && (
        <div className="debt-card__detail">
          {item.description && (
            <div className="debt-card__detail-section">
              <h4>說明</h4>
              <p>{item.description}</p>
            </div>
          )}
          {item.root_cause && (
            <div className="debt-card__detail-section">
              <h4>根因</h4>
              <p>{item.root_cause}</p>
            </div>
          )}
          {item.fix_guidance && (
            <div className="debt-card__detail-section">
              <h4>修復指引</h4>
              <p>{item.fix_guidance}</p>
            </div>
          )}
          {item.affected_files && (
            <div className="debt-card__detail-section">
              <h4>受影響檔案</h4>
              <code className="debt-card__files">{item.affected_files}</code>
            </div>
          )}
          {item.wont_fix_reason && (
            <div className="debt-card__detail-section">
              <h4>不修復原因</h4>
              <p>{item.wont_fix_reason}</p>
            </div>
          )}
          {item.resolved_at && (
            <div className="debt-card__detail-section">
              <h4>解決資訊</h4>
              <p>
                {item.resolved_by && `由 ${item.resolved_by} `}
                於 {item.resolved_at.slice(0, 10)} 解決
                {item.resolved_in_story && ` (${item.resolved_in_story})`}
              </p>
            </div>
          )}
          {!item.description && !item.root_cause && !item.fix_guidance && (
            <p className="debt-card__no-detail">此項目尚無詳細資訊</p>
          )}
        </div>
      )}
    </div>
  );
}
