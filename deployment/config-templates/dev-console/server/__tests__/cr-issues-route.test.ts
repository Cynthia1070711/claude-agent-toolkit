// ============================================================
// cr-issues-route.test.ts — CR Issue API 路由測試
// DVS-07 AC-3: severity/resolution 篩選、stats、分頁
// 策略：mock crIssueService，直接測試路由邏輯
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/crIssueService.js', () => ({
  listCrIssues: vi.fn(),
  getCrIssueStats: vi.fn(),
}));

import express from 'express';
import { createServer, type Server } from 'http';
import crIssuesRouter from '../routes/cr-issues.js';
import * as crIssueService from '../services/crIssueService.js';
import type { Mock } from 'vitest';

const listCrIssuesMock = crIssueService.listCrIssues as Mock;
const getCrIssueStatsMock = crIssueService.getCrIssueStats as Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cr-issues', crIssuesRouter);
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

const FIXTURE_ISSUES = [
  {
    id: 1, story_id: 'dvs-01', reviewer: 'CC-OPUS',
    severity: 'high' as const, category: 'Architecture',
    description: 'Missing error handling in route', resolution: 'fixed' as const,
    file_path: 'server/index.ts', line_info: '34',
  },
  {
    id: 2, story_id: 'dvs-02', reviewer: 'CC-OPUS',
    severity: 'medium' as const, category: 'TestCoverage',
    description: 'Insufficient test coverage', resolution: 'deferred' as const,
    file_path: null, line_info: null,
  },
];

const FIXTURE_STATS = {
  total: 10, critical: 1, high: 3, medium: 4, low: 2,
  fixed: 7, deferred: 2, wont_fix: 1, pending: 0,
};

beforeEach(() => {
  listCrIssuesMock.mockReset();
  getCrIssueStatsMock.mockReset();
});

// ────────────────────────────────────────────────────────────
// TC-CR1: GET /api/cr-issues 回傳格式
// ────────────────────────────────────────────────────────────
describe('TC-CR1: GET /api/cr-issues 回傳格式', () => {
  it('應回傳 { items, total, page } 格式', async () => {
    listCrIssuesMock.mockReturnValue({ items: FIXTURE_ISSUES, total: 2, page: 1 });
    const { status, body } = await doGet('/api/cr-issues');
    expect(status).toBe(200);
    const b = body as { items: unknown[]; total: number; page: number };
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
  });

  it('每筆應包含必要欄位', async () => {
    listCrIssuesMock.mockReturnValue({ items: FIXTURE_ISSUES, total: 2, page: 1 });
    const { body } = await doGet('/api/cr-issues');
    const b = body as { items: Record<string, unknown>[] };
    for (const item of b.items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('story_id');
      expect(item).toHaveProperty('severity');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('resolution');
    }
  });
});

// ────────────────────────────────────────────────────────────
// TC-CR2: severity 篩選
// ────────────────────────────────────────────────────────────
describe('TC-CR2: severity 篩選', () => {
  it('severity=high 應傳遞至 service', async () => {
    listCrIssuesMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/cr-issues?severity=high');
    expect(listCrIssuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'high' }),
    );
  });

  it('severity=critical 應傳遞至 service', async () => {
    listCrIssuesMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/cr-issues?severity=critical');
    expect(listCrIssuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
  });
});

// ────────────────────────────────────────────────────────────
// TC-CR3: resolution 篩選
// ────────────────────────────────────────────────────────────
describe('TC-CR3: resolution 篩選', () => {
  it('resolution=deferred 應傳遞至 service', async () => {
    listCrIssuesMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/cr-issues?resolution=deferred');
    expect(listCrIssuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: 'deferred' }),
    );
  });
});

// ────────────────────────────────────────────────────────────
// TC-CR4: GET /api/cr-issues/stats
// ────────────────────────────────────────────────────────────
describe('TC-CR4: GET /api/cr-issues/stats', () => {
  it('應回傳統計物件', async () => {
    getCrIssueStatsMock.mockReturnValue(FIXTURE_STATS);
    const { status, body } = await doGet('/api/cr-issues/stats');
    expect(status).toBe(200);
    const b = body as typeof FIXTURE_STATS;
    expect(typeof b.total).toBe('number');
    expect(typeof b.critical).toBe('number');
    expect(typeof b.fixed).toBe('number');
  });

  it('統計應包含完整 severity + resolution 欄位', async () => {
    getCrIssueStatsMock.mockReturnValue(FIXTURE_STATS);
    const { body } = await doGet('/api/cr-issues/stats');
    const b = body as Record<string, unknown>;
    expect(b).toHaveProperty('total');
    expect(b).toHaveProperty('critical');
    expect(b).toHaveProperty('high');
    expect(b).toHaveProperty('medium');
    expect(b).toHaveProperty('low');
    expect(b).toHaveProperty('fixed');
    expect(b).toHaveProperty('deferred');
    expect(b).toHaveProperty('wont_fix');
  });
});

// ────────────────────────────────────────────────────────────
// TC-CR5: 分頁
// ────────────────────────────────────────────────────────────
describe('TC-CR5: 分頁', () => {
  it('page / pageSize 應傳遞至 service', async () => {
    listCrIssuesMock.mockReturnValue({ items: [], total: 0, page: 2 });
    await doGet('/api/cr-issues?page=2&pageSize=10');
    expect(listCrIssuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });
});
