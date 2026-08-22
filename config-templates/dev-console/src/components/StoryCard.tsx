// ============================================================
// StoryCard.tsx — Story 看板卡片 + i18n + SDD Spec badge
// DVS-03 AC-6
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Story } from '../types/stories';
import { CANCELLED_STATUSES } from '../types/stories';
import { useI18n } from '../i18n/I18nProvider';
import StoryDetail from './StoryDetail';

interface StoryCardProps {
  story: Story;
  onStatusChange: (key: string, newStatus: string) => Promise<void>;
}

const SDD_COMPLEXITIES = new Set(['M', 'L', 'XL']);

// ── 重跑徽章排序（tdb-5）：create → dev → review → 其餘字典序 ──
const RERUN_PHASE_ORDER = ['create', 'dev', 'review'];

// +CR F6：徽章可見文字改走 i18n 查表(原為內部 phase key 直出,zh-TW 環境看到英文)。
// 未列於對照表的 phase(如 Mode C 的 general)原樣 fallback,與修改前行為一致。
function phaseLabel(phase: string, labels: Record<string, string>): string {
  return labels[phase] ?? phase;
}

function sortRerunEntries(rerun: Record<string, number>): Array<[string, number]> {
  return Object.entries(rerun).sort(([a], [b]) => {
    const ia = RERUN_PHASE_ORDER.indexOf(a);
    const ib = RERUN_PHASE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function StoryCard({ story, onStatusChange }: StoryCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isCancelled = CANCELLED_STATUSES.has(story.status);

  const { complexity, priority, crScore, devAgent, reviewAgent, rerun } = story.metadata;
  const hasSddSpec = complexity !== null && SDD_COMPLEXITIES.has(complexity);

  return (
    <div>
      {/* ── 卡片 ── */}
      <div
        className={`dvc-kanban-card${isCancelled ? ' is-cancelled' : ''}`}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
        aria-expanded={expanded}
      >
        {/* Story Key */}
        <div className="dvc-kanban-card-key">{story.key}</div>

        {/* 標題 */}
        <div className="dvc-kanban-card-title">{story.title}</div>

        {/* 複雜度 + 優先級 + SDD badge */}
        <div className="dvc-kanban-card-badges">
          {complexity && (
            <span className={`dvc-badge dvc-badge-complexity-${complexity}`}>
              {complexity}
            </span>
          )}
          {priority && (
            <span className={`dvc-badge dvc-badge-priority-${priority}`}>
              {priority}
            </span>
          )}
          {hasSddSpec && (
            <span className="dvc-badge dvc-badge-sdd" title={t.storyDetail.sddSpec}>
              SDD
            </span>
          )}
          {rerun && sortRerunEntries(rerun).map(([phase, count]) => (
            <span
              key={phase}
              data-phase={phase}
              className="dvc-badge dvc-badge-rerun"
              title={t.stories.rerunBadgeTitle}
            >
              ↻{phaseLabel(phase, t.stories.rerunPhase)}×{count}
            </span>
          ))}
        </div>

        {/* 底部 footer */}
        <div className="dvc-kanban-card-footer">
          <span className="dvc-kanban-card-epic">{story.epicId}</span>
          {devAgent && (
            <span className="dvc-kanban-card-agent" title="Dev Agent">
              {devAgent}
            </span>
          )}
          {reviewAgent && (
            <span className="dvc-kanban-card-agent" title="Review Agent">
              ✓ {reviewAgent}
            </span>
          )}
          {crScore !== null && (
            <span className="dvc-kanban-card-cr">CR:{crScore}</span>
          )}
        </div>

        {/* 查看 Story 詳情連結 */}
        <Link
          to={`/stories/${encodeURIComponent(story.key)}`}
          className="dvc-kanban-card-detail-link"
          onClick={e => e.stopPropagation()}
        >
          {t.stories.viewDetail} →
        </Link>
      </div>

      {/* ── 展開詳情面板 ── */}
      {expanded && (
        <StoryDetail
          story={story}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  );
}
