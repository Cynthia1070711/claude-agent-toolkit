// ============================================================
// Sprint.tsx — Sprint 進度頁面
// DVS-05 AC-5~AC-8
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import StatusPieChart from '../components/StatusPieChart.js';
import ComplexityBarChart from '../components/ComplexityBarChart.js';
import EpicProgressBar from '../components/EpicProgressBar.js';
import { fetchSprintStats, fetchEpicProgress, fetchComplexityDistribution } from '../services/sprintApi.js';
import type { StoryStats } from '../types/stories.js';
import type { EpicProgress, ComplexityDistribution } from '../types/sprint.js';
// Import Chart.js registration (side-effect)
import '../utils/chartConfig.js';
import '../styles/sprint.css';

interface SprintState {
  stats: StoryStats | null;
  epics: EpicProgress[];
  complexity: ComplexityDistribution | null;
  loading: boolean;
  error: string | null;
}

export default function Sprint() {
  const [searchParams, setSearchParams] = useSearchParams();
  const epicId = searchParams.get('epicId') ?? '';

  // 從後端取得 Epic 清單（用於 dropdown）
  const [allEpics, setAllEpics] = useState<EpicProgress[]>([]);

  const [state, setState] = useState<SprintState>({
    stats: null,
    epics: [],
    complexity: null,
    loading: true,
    error: null,
  });

  const loadData = useCallback(async (eid: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const [statsRes, complexityRes] = await Promise.allSettled([
      fetchSprintStats(eid || undefined),
      fetchComplexityDistribution(eid || undefined),
    ]);

    setState(prev => ({
      ...prev,
      loading: false,
      stats: statsRes.status === 'fulfilled' ? statsRes.value : null,
      complexity: complexityRes.status === 'fulfilled' ? complexityRes.value : null,
      error:
        statsRes.status === 'rejected'
          ? (statsRes.reason as Error).message
          : null,
    }));
  }, []);

  // 載入 Epic 清單（僅一次）
  useEffect(() => {
    fetchEpicProgress()
      .then(epics => {
        setAllEpics(epics);
        setState(prev => ({ ...prev, epics }));
      })
      .catch(() => {});
  }, []);

  // 依 epicId 查詢參數載入圖表資料
  useEffect(() => {
    loadData(epicId);
  }, [epicId, loadData]);

  const handleEpicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      setSearchParams({ epicId: val });
    } else {
      setSearchParams({});
    }
  };

  // 依 epicId 過濾 Epic 進度條
  const displayedEpics = epicId
    ? state.epics.filter(e => e.epicId === epicId)
    : state.epics;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--dvc-text-primary)' }}>
        Sprint 進度
      </h1>

      {/* Epic 篩選工具列（AC-8）*/}
      <div className="dvc-sprint-toolbar">
        <span className="dvc-sprint-filter-label">Epic 篩選：</span>
        <select
          className="dvc-sprint-filter-select"
          value={epicId}
          onChange={handleEpicChange}
        >
          <option value="">全部 Epics</option>
          {allEpics.map(e => (
            <option key={e.epicId} value={e.epicId}>
              {e.epicId}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <div style={{ color: 'var(--dvc-status-error)', marginBottom: 16, fontSize: 13 }}>
          ⚠ 資料載入失敗：{state.error}
        </div>
      )}

      {/* 圖表上方區（圓餅圖 + 柱狀圖）*/}
      <div className="dvc-sprint-charts">
        {/* Story 狀態圓餅圖（AC-5）*/}
        <div className="dvc-chart-card">
          <div className="dvc-chart-title">Story 狀態分佈</div>
          {state.loading ? (
            <div className="dvc-chart-container" style={{ justifyContent: 'center' }}>
              <span style={{ color: 'var(--dvc-text-muted)', fontSize: 13 }}>載入中…</span>
            </div>
          ) : state.stats ? (
            <StatusPieChart stats={state.stats} />
          ) : (
            <div className="dvc-sprint-empty">暫無資料</div>
          )}
        </div>

        {/* 複雜度柱狀圖（AC-7）*/}
        <div className="dvc-chart-card">
          <div className="dvc-chart-title">複雜度分佈</div>
          {state.loading ? (
            <div className="dvc-chart-container" style={{ justifyContent: 'center' }}>
              <span style={{ color: 'var(--dvc-text-muted)', fontSize: 13 }}>載入中…</span>
            </div>
          ) : state.complexity ? (
            <ComplexityBarChart distribution={state.complexity} />
          ) : (
            <div className="dvc-sprint-empty">暫無資料</div>
          )}
        </div>
      </div>

      {/* Epic 進度條（AC-6）*/}
      <div className="dvc-epic-progress">
        <div className="dvc-epic-progress-title">Epic 完成進度</div>
        <EpicProgressBar epics={displayedEpics} />
      </div>
    </div>
  );
}
