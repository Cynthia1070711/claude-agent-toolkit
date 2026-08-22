// ============================================================
// EpicProgressBar.tsx — Epic 完成進度條（堆疊式 CSS bar）
// DVS-05 AC-6
// ============================================================
import { useState } from 'react';
import type { EpicProgress } from '../types/sprint.js';

interface EpicProgressBarProps {
  epics: EpicProgress[];
}

interface SegmentDef {
  key: keyof EpicProgress;
  cls: string;
  label: string;
}

const SEGMENTS: SegmentDef[] = [
  { key: 'doneCount', cls: 'dvc-seg-done', label: 'Done' },
  { key: 'reviewCount', cls: 'dvc-seg-review', label: 'Review' },
  { key: 'inProgressCount', cls: 'dvc-seg-progress', label: 'In Progress' },
  { key: 'readyForDevCount', cls: 'dvc-seg-ready', label: 'Ready' },
  { key: 'backlogCount', cls: 'dvc-seg-backlog', label: 'Backlog' },
  { key: 'cancelledCount', cls: 'dvc-seg-cancelled', label: 'Cancelled' },
];

function EpicRow({ epic }: { epic: EpicProgress }) {
  const [collapsed, setCollapsed] = useState(epic.completionPct === 100);

  return (
    <div className={`dvc-epic-row ${collapsed ? 'completed' : ''}`}>
      <div
        className="dvc-epic-id"
        title={epic.epicId}
        style={{ cursor: epic.completionPct === 100 ? 'pointer' : 'default' }}
        onClick={() => epic.completionPct === 100 && setCollapsed(c => !c)}
      >
        {epic.completionPct === 100 && (
          <span style={{ marginRight: 4 }}>{collapsed ? '▶' : '▼'}</span>
        )}
        {epic.epicId}
      </div>
      <div className="dvc-progress-bar" title={`${epic.totalStories} stories`}>
        {epic.totalStories === 0 ? null : SEGMENTS.map(seg => {
          const count = epic[seg.key] as number;
          if (count === 0) return null;
          const pct = (count / epic.totalStories) * 100;
          return (
            <div
              key={seg.key}
              className={`dvc-progress-segment ${seg.cls}`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${count}`}
            />
          );
        })}
      </div>
      <div className="dvc-epic-pct">{epic.completionPct}%</div>
    </div>
  );
}

export default function EpicProgressBar({ epics }: EpicProgressBarProps) {
  if (epics.length === 0) {
    return <div className="dvc-sprint-empty">暫無 Epic 資料</div>;
  }

  return (
    <div className="dvc-epic-list">
      {epics.map(epic => (
        <EpicRow key={epic.epicId} epic={epic} />
      ))}
    </div>
  );
}
