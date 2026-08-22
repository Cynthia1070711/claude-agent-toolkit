// ============================================================
// Sessions.test.tsx — DVS-06 AC-8 React 組件測試
// 案例 1: 時間軸渲染  案例 2: 空結果狀態
// ============================================================
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Sessions from '../Sessions';
import type { SessionTimelineResponse, SessionFiltersResponse } from '../../types/session';

// ── Mock API modules ──
vi.mock('../../services/sessionApi.js', () => ({
  fetchSessionTimeline: vi.fn(),
  fetchSessionFilters: vi.fn(),
}));

// ── Mock CSS imports ──
vi.mock('../../styles/sessions.css', () => ({}));

// ── Mock child components to avoid deep dependency issues ──
vi.mock('../../components/TimelineNode.js', () => ({
  default: ({ item }: { item: { title: string } }) => (
    <div data-testid="timeline-node">{item.title}</div>
  ),
}));

vi.mock('../../components/SessionFilterPanel.js', () => ({
  default: ({ onFiltersChange }: { onFiltersChange: (f: unknown) => void }) => (
    <div data-testid="filter-panel">
      <button
        type="button"
        data-testid="filter-apply-btn"
        onClick={() => onFiltersChange({ startDate: '2026-03-01', endDate: '2026-03-08' })}
      >
        Apply
      </button>
    </div>
  ),
}));

// ── Dynamic import after vi.mock ──
async function getSessionApi() {
  const mod = await import('../../services/sessionApi.js');
  return mod as {
    fetchSessionTimeline: ReturnType<typeof vi.fn>;
    fetchSessionFilters: ReturnType<typeof vi.fn>;
  };
}

function renderSessions() {
  return render(
    <MemoryRouter>
      <Sessions />
    </MemoryRouter>,
  );
}

describe('Sessions 頁面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 案例 1: 時間軸渲染 ──
  it('應正確渲染時間軸節點', async () => {
    const api = await getSessionApi();

    const mockResponse: SessionTimelineResponse = {
      items: [
        {
          id: '1',
          source: 'context',
          title: 'Session A',
          content: '工作摘要 A',
          summary: 'Summary A',
          agent: 'CC-OPUS',
          tags: '["test"]',
          related_files: null,
          timestamp: '2026-03-08T10:00:00Z',
          created_at: '2026-03-08T10:00:00Z',
        },
        {
          id: '2',
          source: 'conversation',
          title: 'Session B',
          content: '工作摘要 B',
          summary: null,
          agent: null,
          tags: null,
          related_files: null,
          timestamp: '2026-03-07T10:00:00Z',
          created_at: '2026-03-07T10:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    };

    const mockFilters: SessionFiltersResponse = { agents: ['CC-OPUS'], tags: ['test'] };

    api.fetchSessionTimeline.mockResolvedValue(mockResponse);
    api.fetchSessionFilters.mockResolvedValue(mockFilters);

    renderSessions();

    // 等待非同步載入完成
    await waitFor(() => {
      expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
    });

    // 應顯示兩筆 TimelineNode
    const nodes = screen.getAllByTestId('timeline-node');
    expect(nodes).toHaveLength(2);
    expect(screen.getByText('Session A')).toBeInTheDocument();
    expect(screen.getByText('Session B')).toBeInTheDocument();

    // 應顯示 record count
    expect(screen.getByText('共 2 筆記錄')).toBeInTheDocument();
  });

  // ── 案例 2: 空結果狀態 ──
  it('無 Session 記錄時應顯示空狀態', async () => {
    const api = await getSessionApi();

    const emptyResponse: SessionTimelineResponse = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    };

    api.fetchSessionTimeline.mockResolvedValue(emptyResponse);
    api.fetchSessionFilters.mockResolvedValue({ agents: [], tags: [] });

    renderSessions();

    await waitFor(() => {
      expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
    });

    // 應顯示空狀態訊息
    expect(screen.getByText('沒有符合條件的 Session 記錄')).toBeInTheDocument();
    expect(screen.queryAllByTestId('timeline-node')).toHaveLength(0);
  });
});
