// ============================================================
// charts.test.tsx — chart components props 傳遞 / data transformation
// Story: td-devconsole-godnode-and-mem-dashboard (BR-INTEG-002 / Phase 4.1)
// 4 chart components × render no-data + render with data
// (CR F-H3+M17: Treemap + DistributionStats removed — R2 redesign 取消 Treemap,
//  DistributionStats 改 inline 至 GodNodes.tsx;見 Story dev_notes Task 2.2/2.3 R2)
// ============================================================
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

// Mock react-chartjs-2 to avoid jsdom canvas issues
vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data?: unknown }) => React.createElement(
    'div',
    { 'data-testid': 'chart-bar', 'data-chart-data': JSON.stringify(props.data) },
  ),
  Line: (props: { data?: unknown }) => React.createElement(
    'div',
    { 'data-testid': 'chart-line', 'data-chart-data': JSON.stringify(props.data) },
  ),
  Doughnut: (props: { data?: unknown }) => React.createElement(
    'div',
    { 'data-testid': 'chart-doughnut', 'data-chart-data': JSON.stringify(props.data) },
  ),
}));

// Stub out chartConfig side-effects
vi.mock('../../../utils/chartConfig.js', () => ({}));

import DailyContextTrendChart from '../DailyContextTrendChart';
import TechDebtSeverityChart from '../TechDebtSeverityChart';
import IDDSubtypesChart from '../IDDSubtypesChart';
import StoryStatusFunnel from '../StoryStatusFunnel';

describe('DailyContextTrendChart (BR-MEM-001)', () => {
  it('renders no-data label when empty', () => {
    render(<DailyContextTrendChart data={[]} categories={[]} noDataLabel="empty" />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders Line chart with by-category datasets', () => {
    const data = [
      { day: '2026-05-01', category: 'decision', cnt: 5 },
      { day: '2026-05-02', category: 'decision', cnt: 8 },
      { day: '2026-05-01', category: 'pattern', cnt: 3 },
    ];
    render(<DailyContextTrendChart data={data} categories={['decision', 'pattern']} noDataLabel="-" />);
    const chart = screen.getByTestId('chart-line');
    const cd = JSON.parse(chart.getAttribute('data-chart-data') ?? '{}');
    expect(cd.labels).toEqual(['2026-05-01', '2026-05-02']);
    expect(cd.datasets).toHaveLength(2);
    expect(cd.datasets[0].label).toBe('decision');
    expect(cd.datasets[0].data).toEqual([5, 8]);
  });
});

describe('TechDebtSeverityChart (BR-MEM-002)', () => {
  it('renders no-data label when empty', () => {
    render(<TechDebtSeverityChart data={[]} severities={[]} statuses={[]} noDataLabel="empty" />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders Bar chart with stacked datasets', () => {
    const data = [
      { severity: 'high', status: 'fixed', cnt: 26 },
      { severity: 'high', status: 'open', cnt: 8 },
      { severity: 'low', status: 'fixed', cnt: 37 },
    ];
    render(<TechDebtSeverityChart
      data={data}
      severities={['high', 'low']}
      statuses={['fixed', 'open']}
      noDataLabel="-"
    />);
    const chart = screen.getByTestId('chart-bar');
    const cd = JSON.parse(chart.getAttribute('data-chart-data') ?? '{}');
    expect(cd.datasets).toHaveLength(2); // fixed + open
    expect(cd.datasets[0].stack).toBe('debt');
  });
});

describe('IDDSubtypesChart (BR-MEM-003)', () => {
  it('renders no-data label when empty', () => {
    render(<IDDSubtypesChart data={[]} types={['COM', 'STR', 'REG', 'USR']} noDataLabel="empty" />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('aggregates COM/STR/REG/USR with total in center', () => {
    const data = [
      { idd_type: 'COM', status: 'active', cnt: 5 },
      { idd_type: 'STR', status: 'active', cnt: 3 },
      { idd_type: 'REG', status: 'active', cnt: 5 },
      { idd_type: 'USR', status: 'active', cnt: 2 },
    ];
    render(<IDDSubtypesChart data={data} types={['COM', 'STR', 'REG', 'USR']} noDataLabel="-" />);
    expect(screen.getByText('15')).toBeInTheDocument(); // total
    expect(screen.getByText('IDDs')).toBeInTheDocument();
  });
});

describe('StoryStatusFunnel (BR-MEM-004)', () => {
  it('renders no-data when empty + no other', () => {
    render(<StoryStatusFunnel data={[]} stages={['backlog', 'done']} otherCount={0} noDataLabel="empty" />);
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders horizontal Bar with 5 stages + Other', () => {
    const data = [
      { status: 'backlog', cnt: 12 },
      { status: 'ready-for-dev', cnt: 5 },
      { status: 'in-progress', cnt: 2 },
      { status: 'review', cnt: 1 },
      { status: 'done', cnt: 287 },
    ];
    render(<StoryStatusFunnel
      data={data}
      stages={['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']}
      otherCount={10}
      noDataLabel="-"
    />);
    const chart = screen.getByTestId('chart-bar');
    const cd = JSON.parse(chart.getAttribute('data-chart-data') ?? '{}');
    expect(cd.labels).toHaveLength(6); // 5 stages + Other
    expect(cd.datasets[0].data).toEqual([12, 5, 2, 1, 287, 10]);
  });
});
