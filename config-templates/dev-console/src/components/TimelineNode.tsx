// ============================================================
// TimelineNode.tsx — 時間軸可展開節點元件
// DVS-06 AC-4: 點擊展開/摺疊，鍵盤 Enter 觸發，related_files 顯示
// ============================================================
import { useState } from 'react';
import type { SessionTimelineItemDto } from '../types/session.js';

interface TimelineNodeProps {
  item: SessionTimelineItemDto;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', // TZ FIX 2026-05-29: pin 台灣時區(對齊 GodNodes/System CR F-L2)
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* ignore */ }
  return tags.split(',').map(t => t.trim()).filter(Boolean);
}

function parseRelatedFiles(files: string | null): string[] {
  if (!files) return [];
  try {
    const parsed = JSON.parse(files);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* ignore */ }
  return files.split(',').map(f => f.trim()).filter(Boolean);
}

export default function TimelineNode({ item }: TimelineNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const tags = parseTags(item.tags);
  const relatedFiles = parseRelatedFiles(item.related_files);

  const sourceBadgeClass =
    item.source === 'context'
      ? 'dvc-timeline-badge dvc-timeline-badge--context'
      : 'dvc-timeline-badge dvc-timeline-badge--conversation';

  function handleToggle() {
    setExpanded(v => !v);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded(v => !v);
    }
  }

  return (
    <div className="dvc-timeline-node">
      {/* 時間軸連接線 */}
      <div className="dvc-timeline-line" />

      {/* 節點圓點 */}
      <div className="dvc-timeline-dot" />

      {/* 內容區 */}
      <div className="dvc-timeline-content">
        {/* 頭部（點擊展開） */}
        <div
          className="dvc-timeline-header"
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={expanded}
        >
          {/* 時間戳 */}
          <span className="dvc-timeline-timestamp">
            {formatTimestamp(item.timestamp)}
          </span>

          {/* Source Badge */}
          <span className={sourceBadgeClass}>
            {item.source === 'context' ? '記憶庫' : '對話'}
          </span>

          {/* Agent Badge */}
          {item.agent && (
            <span className="dvc-timeline-agent">{item.agent}</span>
          )}

          {/* 標題 */}
          <span className="dvc-timeline-title">{item.title}</span>

          {/* 展開指示 */}
          <span className="dvc-timeline-chevron">{expanded ? '▲' : '▼'}</span>
        </div>

        {/* 摘要（預覽，收合時顯示） */}
        {!expanded && item.summary && (
          <div className="dvc-timeline-summary">{item.summary}</div>
        )}

        {/* 標籤 Chips */}
        {tags.length > 0 && (
          <div className="dvc-timeline-tags">
            {tags.map(tag => (
              <span key={tag} className="dvc-chip">{tag}</span>
            ))}
          </div>
        )}

        {/* 展開區域（完整內容 + related_files） */}
        {expanded && (
          <div className="dvc-timeline-expanded">
            <div className="dvc-timeline-full-content">{item.content}</div>

            {relatedFiles.length > 0 && (
              <div className="dvc-timeline-related-files">
                <div className="dvc-timeline-related-files-label">相關檔案</div>
                {relatedFiles.map(f => (
                  <code key={f} className="dvc-timeline-file">{f}</code>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
