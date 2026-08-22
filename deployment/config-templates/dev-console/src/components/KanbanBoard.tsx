// ============================================================
// KanbanBoard.tsx — 五欄 Kanban 看板容器 + i18n
// DVS-03 AC-5
// ============================================================
import type { Story } from '../types/stories';
import { CANCELLED_STATUSES } from '../types/stories';
import { useI18n } from '../i18n/I18nProvider';
import StoryCard from './StoryCard';

interface KanbanBoardProps {
  stories: Story[];
  onStatusChange: (key: string, newStatus: string) => Promise<void>;
}

export default function KanbanBoard({ stories, onStatusChange }: KanbanBoardProps) {
  const { t } = useI18n();

  const columns = [
    { key: 'backlog', label: t.kanban.backlog },
    { key: 'ready-for-dev', label: t.kanban.readyForDev },
    { key: 'in-progress', label: t.kanban.inProgress },
    { key: 'review', label: t.kanban.review },
    { key: 'done', label: t.kanban.done },
  ];

  function getColumnStories(colKey: string): Story[] {
    if (colKey === 'done') {
      return stories.filter(
        s => s.status === 'done' || CANCELLED_STATUSES.has(s.status),
      );
    }
    if (colKey === 'review') {
      return stories.filter(s => s.status === 'review' || s.status === 'reviewing');
    }
    if (colKey === 'backlog') {
      return stories.filter(s => s.status === 'backlog' || s.status === 'creating');
    }
    return stories.filter(s => s.status === colKey);
  }

  return (
    <div className="dvc-kanban-board">
      {columns.map(col => {
        const colStories = getColumnStories(col.key);
        return (
          <div
            key={col.key}
            className="dvc-kanban-column"
            data-status={col.key}
          >
            <div className="dvc-kanban-col-header">
              <span className="col-name">{col.label}</span>
              <span className="dvc-kanban-col-badge">{colStories.length}</span>
            </div>

            <div className="dvc-kanban-col-cards">
              {colStories.map(story => (
                <StoryCard
                  key={story.key}
                  story={story}
                  onStatusChange={onStatusChange}
                />
              ))}
              {colStories.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--dvc-text-muted)', padding: '4px 0' }}>
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
