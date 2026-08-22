// ============================================================
// StoryDetail.tsx — Inline 展開詳情面板 + i18n
// DVS-03 AC-8
// ============================================================
import { useState } from 'react';
import type { Story } from '../types/stories';
import { VALID_PATCH_STATUSES } from '../types/stories';
import { useI18n } from '../i18n/I18nProvider';

interface StoryDetailProps {
  story: Story;
  onStatusChange: (key: string, newStatus: string) => Promise<void>;
}

export default function StoryDetail({ story, onStatusChange }: StoryDetailProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(newStatus: string) {
    if (newStatus === story.status) return;
    setLoading(true);
    setError(null);
    try {
      await onStatusChange(story.key, newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.storyDetail.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dvc-kanban-detail">
      {/* 完整 YAML 註解 metadata */}
      <div className="dvc-kanban-detail-comment">
        <span style={{ color: 'var(--dvc-text-muted)', marginRight: 6 }}>#</span>
        {story.metadata.comment || t.storyDetail.noComment}
      </div>

      {/* 狀態變更按鈕組 */}
      <div className="dvc-kanban-detail-actions">
        {VALID_PATCH_STATUSES.map(status => (
          <button
            key={status}
            className={`dvc-kanban-detail-btn${story.status === status ? ' is-current' : ''}`}
            onClick={() => handleStatusChange(status)}
            disabled={loading || story.status === status}
          >
            {status}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--dvc-text-muted)' }}>{t.storyDetail.updating}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--dvc-status-error)' }}>{error}</div>
      )}
    </div>
  );
}
