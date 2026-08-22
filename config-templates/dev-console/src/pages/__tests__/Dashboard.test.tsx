// ============================================================
// Dashboard.test.tsx — dvs-07 AC-1/2/3/4 前端元件測試
// 驗證：WFQ KPI 卡片 + 趨勢圖區域 + 模型分佈圖區域 + i18n
// 策略：mock API + mock 圖表元件（canvas 不支援 jsdom）
// ============================================================
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock API modules ──────────────────────────────────────────

vi.mock('../../services/dashboardApi.js', () => ({
  fetchDashboardData: vi.fn(),
}));

vi.mock('../../services/workflowApi.js', () => ({
  fetchWorkflowStats: vi.fn(),
  fetchWorkflowTrend: vi.fn(),
  fetchModelDistribution: vi.fn(),
}));

// ── Mock CSS imports ──────────────────────────────────────────

vi.mock('../../styles/dashboard.css', () => ({}));

// ── Mock chart components (canvas not supported in jsdom) ─────

vi.mock('../../components/WfqTrendChart.js', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="wfq-trend-chart-mock">
      {data.length === 0 ? '暫無趨勢資料' : `Trend: ${data.length} days`}
    </div>
  ),
}));

vi.mock('../../components/ModelDistributionChart.js', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="wfq-model-chart-mock">
      {data.length === 0 ? '暫無 WFQ 資料' : `Models: ${data.length}`}
    </div>
  ),
}));

vi.mock('../../components/RecentActivity.js', () => ({
  default: () => <div data-testid="recent-activity" />,
}));

vi.mock('../../components/KpiCard.js', () => ({
  default: ({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) => (
    <div data-testid={`kpi-card-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <span data-testid="kpi-label">{label}</span>
      <span data-testid="kpi-value">{value}</span>
      {subtitle && <span data-testid="kpi-subtitle">{subtitle}</span>}
    </div>
  ),
  KpiCardSkeleton: () => <div data-testid="kpi-skeleton" />,
}));

// ── Import modules after mocks ────────────────────────────────

import Dashboard from '../Dashboard';
import * as dashboardApi from '../../services/dashboardApi.js';
import * as workflowApi from '../../services/workflowApi.js';
import { I18nProvider } from '../../i18n/I18nProvider.js';

// ── Fixtures ──────────────────────────────────────────────────

const MOCK_DASHBOARD_DATA = {
  storyStats: {
    total: 10,
    done: 5,
    inProgress: 2,
    review: 1,
    readyForDev: 2,
    backlog: 0,
    cancelled: 0,
  },
  memoryStats: null,
  recentActivity: [],
  embeddingStats: null,
};

const MOCK_WFQ_STATS = {
  totalWorkflows: 42,
  totalInputTokens: 150000,
  totalOutputTokens: 60000,
  totalCacheReadTokens: 20000,
  totalCacheCreationTokens: 5000,
  totalCostUsd: 2.34,
  successRate: 88.5,
  avgDurationMs: 180000,
  from: '2026-04-01',
  to: '2026-04-30',
  pendingTokens: 0,
  usdToTwd: 32.5,
  zeroTokenPct: 10,
};

const MOCK_WFQ_TREND = [
  { date: '2026-03-29', input_tokens: 10000, output_tokens: 5000, cache_read_tokens: 2000, cache_creation_tokens: 500, workflow_count: 3, cost_usd: 0.15 },
  { date: '2026-03-30', input_tokens: 20000, output_tokens: 8000, cache_read_tokens: 3000, cache_creation_tokens: 800, workflow_count: 5, cost_usd: 0.28 },
];

const MOCK_MODEL_DIST = [
  { model: 'claude-opus-4-6', count: 20, input_tokens: 100000, output_tokens: 40000, total_tokens: 140000, token_percentage: 66.7, cost_usd: 1.8 },
  { model: 'claude-sonnet-4-6', count: 22, input_tokens: 50000, output_tokens: 20000, total_tokens: 70000, token_percentage: 33.3, cost_usd: 0.54 },
];

// ── Helpers ───────────────────────────────────────────────────

function renderDashboard() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </I18nProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe('Dashboard — dvs-07 WFQ 視覺化元件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── AC-1: Pipeline KPI 卡片 ─────────────────────────────────

  describe('AC-1: Pipeline KPI 卡片', () => {
    it('應渲染 3 張 WFQ KPI 卡片（Token消耗 / 成功率 / 平均耗時）', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue(MOCK_WFQ_TREND);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue(MOCK_MODEL_DIST);

      renderDashboard();

      // 等待載入完成
      await waitFor(() => {
        expect(screen.queryAllByTestId('kpi-skeleton').length).toBeLessThan(10);
      });

      // AC-1: Token 消耗卡片（label 含 Token）
      const labels = screen.getAllByTestId('kpi-label');
      const labelTexts = labels.map(el => el.textContent);

      // 應有 wfqTokenConsumption / wfqPipelineSuccessRate / wfqAvgDuration
      expect(labelTexts.some(t => t?.includes('Token'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('Pipeline'))).toBe(true);
      expect(labelTexts.some(t => t?.includes('耗時') || t?.includes('Duration'))).toBe(true);
    });

    it('Token 消耗 KPI 卡片顯示 totalInputTokens + totalOutputTokens 加總', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        // 總 token = 150000 + 60000 = 210000
        const values = screen.getAllByTestId('kpi-value');
        const valueTexts = values.map(el => el.textContent);
        expect(valueTexts.some(t => t?.replace(/,/g, '') === '210000')).toBe(true);
      });
    });

    it('成功率 KPI 卡片顯示 successRate + % 符號', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        const values = screen.getAllByTestId('kpi-value');
        const valueTexts = values.map(el => el.textContent);
        expect(valueTexts.some(t => t?.includes('88.5%'))).toBe(true);
      });
    });

    it('WFQ API 失敗時顯示 wfqNoData 訊息（至少一處）', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockRejectedValue(new Error('DB offline'));
      vi.mocked(workflowApi.fetchWorkflowTrend).mockRejectedValue(new Error('DB offline'));
      vi.mocked(workflowApi.fetchModelDistribution).mockRejectedValue(new Error('DB offline'));

      renderDashboard();

      await waitFor(() => {
        const noDataEls = screen.getAllByText('暫無 WFQ 資料');
        expect(noDataEls.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── AC-2: Token 趨勢折線圖 ──────────────────────────────────

  describe('AC-2: Token 趨勢折線圖', () => {
    it('wfq-trend-chart 容器應存在於 DOM', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue(MOCK_WFQ_TREND);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('wfq-trend-chart')).toBeInTheDocument();
      });
    });

    it('WfqTrendChart 接收 2 天趨勢資料', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue(MOCK_WFQ_TREND);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        // Mock component renders "Trend: N days"
        expect(screen.getByText('Trend: 2 days')).toBeInTheDocument();
      });
    });

    it('趨勢資料為空時顯示無資料訊息', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('暫無趨勢資料')).toBeInTheDocument();
      });
    });
  });

  // ── AC-3: 模型分佈圓餅圖 ────────────────────────────────────

  describe('AC-3: 模型分佈圓餅圖', () => {
    it('wfq-model-chart 容器應存在於 DOM', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue(MOCK_MODEL_DIST);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByTestId('wfq-model-chart')).toBeInTheDocument();
      });
    });

    it('ModelDistributionChart 接收 2 種模型資料', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue(MOCK_MODEL_DIST);

      renderDashboard();

      await waitFor(() => {
        // Mock component renders "Models: N"
        expect(screen.getByText('Models: 2')).toBeInTheDocument();
      });
    });
  });

  // ── AC-4: i18n 支援 ─────────────────────────────────────────

  describe('AC-4: i18n 支援', () => {
    it('預設語系 zh-TW 時顯示中文標題「儀表板」', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('儀表板')).toBeInTheDocument();
      });
    });

    it('WFQ 分節標題使用 i18n（zh-TW: Pipeline 運營）', async () => {
      vi.mocked(dashboardApi.fetchDashboardData).mockResolvedValue(MOCK_DASHBOARD_DATA as never);
      vi.mocked(workflowApi.fetchWorkflowStats).mockResolvedValue(MOCK_WFQ_STATS);
      vi.mocked(workflowApi.fetchWorkflowTrend).mockResolvedValue([]);
      vi.mocked(workflowApi.fetchModelDistribution).mockResolvedValue([]);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Pipeline 運營')).toBeInTheDocument();
      });
    });
  });
});
