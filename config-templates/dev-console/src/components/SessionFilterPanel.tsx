// ============================================================
// SessionFilterPanel.tsx — Session 篩選面板
// DVS-06 AC-3: 日期預設選項 / Agent 下拉 / 標籤多選 Chip
// ============================================================
import { useState } from 'react';
import type { SessionQueryParams } from '../types/session.js';

interface SessionFilterPanelProps {
  filters: SessionQueryParams;
  agents: string[];
  tags: string[];
  onFiltersChange: (newFilters: SessionQueryParams) => void;
}

type DatePreset = 'today' | 'week' | 'month' | 'custom';

function getDatePreset(startDate?: string, endDate?: string): DatePreset {
  if (!startDate && !endDate) return 'month';
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (startDate === today && (!endDate || endDate === today)) return 'today';
  if (startDate === weekAgo) return 'week';
  if (startDate === monthAgo) return 'month';
  return 'custom';
}

function applyDatePreset(preset: DatePreset): Partial<SessionQueryParams> {
  const today = new Date().toISOString().slice(0, 10);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'week':
      return {
        startDate: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        endDate: today,
      };
    case 'month':
      return {
        startDate: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        endDate: today,
      };
    default:
      return {};
  }
}

export default function SessionFilterPanel({
  filters,
  agents,
  tags,
  onFiltersChange,
}: SessionFilterPanelProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const currentPreset = getDatePreset(filters.startDate, filters.endDate);

  const selectedTags = filters.tags ? filters.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  function handlePresetChange(preset: DatePreset) {
    if (preset === 'custom') return;
    onFiltersChange({ ...filters, ...applyDatePreset(preset), page: 1 });
  }

  function handleStartDateChange(value: string) {
    onFiltersChange({ ...filters, startDate: value || undefined, page: 1 });
  }

  function handleEndDateChange(value: string) {
    onFiltersChange({ ...filters, endDate: value || undefined, page: 1 });
  }

  function handleAgentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onFiltersChange({ ...filters, agent: e.target.value || undefined, page: 1 });
  }

  function handleTagToggle(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onFiltersChange({ ...filters, tags: next.join(',') || undefined, page: 1 });
  }

  return (
    <div className="dvc-session-filter">
      {/* 日期範圍快選 */}
      <div className="dvc-session-filter-row">
        <label className="dvc-session-filter-label">日期範圍</label>
        <div className="dvc-session-filter-presets">
          {(['today', 'week', 'month'] as DatePreset[]).map(preset => (
            <button
              key={preset}
              className={`dvc-session-preset-btn${currentPreset === preset ? ' is-active' : ''}`}
              onClick={() => handlePresetChange(preset)}
              type="button"
            >
              {preset === 'today' ? '今天' : preset === 'week' ? '本週' : '本月'}
            </button>
          ))}
        </div>
      </div>

      {/* 自訂日期範圍 */}
      <div className="dvc-session-filter-row">
        <label className="dvc-session-filter-label">自訂</label>
        <input
          type="date"
          className="dvc-session-date-input"
          value={filters.startDate ?? ''}
          onChange={e => handleStartDateChange(e.target.value)}
        />
        <span style={{ color: 'var(--dvc-text-muted)', margin: '0 4px' }}>—</span>
        <input
          type="date"
          className="dvc-session-date-input"
          value={filters.endDate ?? ''}
          onChange={e => handleEndDateChange(e.target.value)}
        />
      </div>

      {/* Agent 篩選 */}
      {agents.length > 0 && (
        <div className="dvc-session-filter-row">
          <label htmlFor="session-agent-filter" className="dvc-session-filter-label">
            Agent
          </label>
          <select
            id="session-agent-filter"
            className="dvc-session-select"
            value={filters.agent ?? ''}
            onChange={handleAgentChange}
          >
            <option value="">全部 Agent</option>
            {agents.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {/* 標籤篩選 */}
      {tags.length > 0 && (
        <div className="dvc-session-filter-row">
          <label className="dvc-session-filter-label">標籤</label>
          <div className="dvc-session-tag-chips">
            {(tagsExpanded ? tags : tags.slice(0, 10)).map(tag => (
              <button
                key={tag}
                type="button"
                className={`dvc-chip dvc-chip--toggleable${selectedTags.includes(tag) ? ' is-selected' : ''}`}
                onClick={() => handleTagToggle(tag)}
              >
                {tag}
              </button>
            ))}
            {tags.length > 10 && (
              <button
                type="button"
                className="dvc-chip dvc-chip--toggle-more"
                onClick={() => setTagsExpanded(!tagsExpanded)}
              >
                {tagsExpanded ? '收合' : `+${tags.length - 10} 更多`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
