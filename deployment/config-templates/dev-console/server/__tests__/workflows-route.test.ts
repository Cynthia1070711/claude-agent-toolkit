// ============================================================
// workflows-route.test.ts — Workflow API 路由整合測試
// dvs-06: HTTP 狀態碼 + 邊界值驗證
// 策略：mock workflowService，測試路由層 HTTP 行為
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/workflowService.js', () => ({
  getWorkflowExecutions: vi.fn(),
  getWorkflowStats: vi.fn(),
  getWorkflowTrend: vi.fn(),
  getModelDistribution: vi.fn(),
}));

import express from 'express';
import { createServer, type Server } from 'http';
import workflowsRouter from '../routes/workflows.js';
import * as workflowService from '../services/workflowService.js';
import type { Mock } from 'vitest';

const getExecutionsMock = workflowService.getWorkflowExecutions as Mock;
const getStatsMock = workflowService.getWorkflowStats as Mock;
const getTrendMock = workflowService.getWorkflowTrend as Mock;
const getDistMock = workflowService.getModelDistribution as Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/workflows', workflowsRouter);
  return app;
}

async function doGet(url: string): Promise<{ status: number; body: unknown }> {
  const app = makeApp();
  return new Promise((resolve, reject) => {
    const server: Server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const http = require('http');
      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path: url, method: 'GET' },
        (res: NodeJS.ReadableStream & { statusCode: number }) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        },
      );
      req.on('error', (e: Error) => { server.close(); reject(e); });
      req.end();
    });
  });
}

// ── Fixtures ──────────────────────────────────────────────────

const FIXTURE_LIST = {
  items: [
    {
      id: 1, workflow_type: 'dev-story', story_id: 'dvs-06', agent_id: 'CC-OPUS',
      status: 'completed', started_at: '2026-04-01T10:00:00+08:00',
      completed_at: '2026-04-01T10:05:00+08:00',
      input_tokens: 1000, output_tokens: 500, cache_read_tokens: 200,
      cache_creation_tokens: 100, cost_usd: 0.015, model: 'claude-opus-4-6',
      duration_ms: 300000, error_message: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

const FIXTURE_STATS = {
  totalWorkflows: 3, totalInputTokens: 3000, totalOutputTokens: 1500,
  totalCacheReadTokens: 600, totalCacheCreationTokens: 300,
  totalCostUsd: 0.05, successRate: 66.7, avgDurationMs: 300000,
  zeroTokenPct: 0,
};

const FIXTURE_TREND = [
  { date: '2026-04-01', input_tokens: 1000, output_tokens: 500,
    cache_read_tokens: 200, cache_creation_tokens: 100, workflow_count: 1, cost_usd: 0.015 },
];

const FIXTURE_DIST = [
  { model: 'claude-opus-4-6', count: 2, input_tokens: 2000, output_tokens: 1000,
    total_tokens: 3000, token_percentage: 66.7, cost_usd: 0.03 },
  { model: 'claude-sonnet-4-6', count: 1, input_tokens: 1000, output_tokens: 500,
    total_tokens: 1500, token_percentage: 33.3, cost_usd: 0.015 },
];

beforeEach(() => {
  getExecutionsMock.mockReset();
  getStatsMock.mockReset();
  getTrendMock.mockReset();
  getDistMock.mockReset();
});

// ─────────────────────────────────────────────────────────────
// TC-WF1: GET /api/workflows/executions
// ─────────────────────────────────────────────────────────────

describe('TC-WF1: GET /api/workflows/executions', () => {
  it('HTTP 200 + 回傳 items/total/page/pageSize', async () => {
    getExecutionsMock.mockReturnValue(FIXTURE_LIST);
    const { status, body } = await doGet('/api/workflows/executions');
    expect(status).toBe(200);
    const b = body as typeof FIXTURE_LIST;
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
    expect(typeof b.page).toBe('number');
    expect(typeof b.pageSize).toBe('number');
  });

  it('傳遞 page/pageSize 參數至 service', async () => {
    getExecutionsMock.mockReturnValue({ items: [], total: 0, page: 2, pageSize: 10 });
    await doGet('/api/workflows/executions?page=2&pageSize=10');
    expect(getExecutionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });

  it('傳遞 status 篩選至 service', async () => {
    getExecutionsMock.mockReturnValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await doGet('/api/workflows/executions?status=completed');
    expect(getExecutionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('page=0 邊界值 — service 接收 page=0（service 內部修正）', async () => {
    getExecutionsMock.mockReturnValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const { status } = await doGet('/api/workflows/executions?page=0');
    expect(status).toBe(200);
    expect(getExecutionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// TC-WF2: GET /api/workflows/stats
// ─────────────────────────────────────────────────────────────

describe('TC-WF2: GET /api/workflows/stats', () => {
  it('HTTP 200 + 回傳聚合欄位', async () => {
    getStatsMock.mockReturnValue(FIXTURE_STATS);
    const { status, body } = await doGet('/api/workflows/stats');
    expect(status).toBe(200);
    const b = body as typeof FIXTURE_STATS;
    expect(typeof b.totalWorkflows).toBe('number');
    expect(typeof b.successRate).toBe('number');
    expect(typeof b.avgDurationMs).toBe('number');
  });

  it('傳遞 status 篩選至 service', async () => {
    getStatsMock.mockReturnValue(FIXTURE_STATS);
    await doGet('/api/workflows/stats?status=completed');
    expect(getStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// TC-WF3: GET /api/workflows/trend
// ─────────────────────────────────────────────────────────────

describe('TC-WF3: GET /api/workflows/trend', () => {
  it('HTTP 200 + 回傳陣列', async () => {
    getTrendMock.mockReturnValue(FIXTURE_TREND);
    const { status, body } = await doGet('/api/workflows/trend');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('傳遞 days 參數至 service', async () => {
    getTrendMock.mockReturnValue([]);
    await doGet('/api/workflows/trend?days=30');
    expect(getTrendMock).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30 }),
    );
  });

  it('days=91 邊界值 — service 接收 91（service 內部截斷至 90）', async () => {
    getTrendMock.mockReturnValue([]);
    const { status } = await doGet('/api/workflows/trend?days=91');
    expect(status).toBe(200);
    expect(getTrendMock).toHaveBeenCalledWith(
      expect.objectContaining({ days: 91 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// TC-WF4: GET /api/workflows/model-distribution
// ─────────────────────────────────────────────────────────────

describe('TC-WF4: GET /api/workflows/model-distribution', () => {
  it('HTTP 200 + 回傳陣列含 model/count/token_percentage', async () => {
    getDistMock.mockReturnValue(FIXTURE_DIST);
    const { status, body } = await doGet('/api/workflows/model-distribution');
    expect(status).toBe(200);
    const b = body as typeof FIXTURE_DIST;
    expect(Array.isArray(b)).toBe(true);
    if (b.length > 0) {
      expect(b[0]).toHaveProperty('model');
      expect(b[0]).toHaveProperty('count');
      expect(b[0]).toHaveProperty('token_percentage');
    }
  });

  it('空結果時回傳空陣列', async () => {
    getDistMock.mockReturnValue([]);
    const { status, body } = await doGet('/api/workflows/model-distribution');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
