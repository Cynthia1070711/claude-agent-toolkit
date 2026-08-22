// ============================================================
// rule-violations-route.test.ts — Rule Violations API 路由測試
// Story: ctr-p2-violation-tracker Task 7.4 — AC4 supertest 整合
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../services/ruleViolationService.js', () => ({
  getStats: vi.fn(),
  getRecent: vi.fn(),
}));

vi.mock('../db.js', () => ({
  getDb: vi.fn(),
  createDbConnection: vi.fn(),
  resetDb: vi.fn(),
}));

import express, { type Application } from 'express';
import { createServer, type Server } from 'http';
import ruleViolationsRouter from '../routes/rule-violations.js';
import * as svc from '../services/ruleViolationService.js';
import * as dbModule from '../db.js';

// ── Lightweight HTTP helper(沿用 memoryRoutes.test.ts pattern)──
async function doRequest(
  app: Application,
  method: string,
  url: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const options = {
        hostname: '127.0.0.1',
        port: addr.port,
        path: url,
        method: method.toUpperCase(),
      };
      const { request } = require('http');
      const req = request(options, (res: NodeJS.ReadableStream & { statusCode: number }) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', (err: Error) => { server.close(); reject(err); });
      req.end();
    });
  });
}

function makeApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api/rule-violations', ruleViolationsRouter);
  return app;
}

// ── GET /stats ────────────────────────────────────────────────
describe('GET /api/rule-violations/stats', () => {
  const mockStats = {
    total_60d: 5,
    total_30d_rolling: 3,
    baseline: 8,
    baseline_compare_pct: -62,
    status: 'GREEN' as const,
    by_rule: [{ rule: 'memory/a.md', count: 3, last_timestamp: '2026-04-15' }],
    by_phase: [{ phase: 'create-story', count: 3 }],
  };

  beforeEach(() => {
    vi.mocked(dbModule.getDb).mockReturnValue({} as never); // non-null → passes guard
    (svc.getStats as Mock).mockReturnValue(mockStats);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('returns 200 with stats JSON shape', async () => {
    const { status, body } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats');
    expect(status).toBe(200);
    const b = body as typeof mockStats;
    expect(b.total_60d).toBe(5);
    expect(b.status).toBe('GREEN');
    expect(b.by_rule).toHaveLength(1);
    expect(b.by_phase[0].phase).toBe('create-story');
  });

  it('returns 503 when DB not connected', async () => {
    vi.mocked(dbModule.getDb).mockReturnValue(null);
    const { status, body } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats');
    expect(status).toBe(503);
    expect((body as { error: string }).error).toMatch(/DB 未連線/);
  });

  it('accepts ?days=30 and passes to service', async () => {
    await doRequest(makeApp(), 'GET', '/api/rule-violations/stats?days=30');
    expect(svc.getStats).toHaveBeenCalledWith(30);
  });

  it('rejects invalid days param (0)', async () => {
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats?days=0');
    expect(status).toBe(400);
  });

  it('rejects days > 365', async () => {
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats?days=999');
    expect(status).toBe(400);
  });

  it('rejects non-numeric days', async () => {
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats?days=abc');
    expect(status).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    (svc.getStats as Mock).mockImplementation(() => { throw new Error('boom'); });
    const { status, body } = await doRequest(makeApp(), 'GET', '/api/rule-violations/stats');
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('boom');
  });
});

// ── GET /recent ───────────────────────────────────────────────
describe('GET /api/rule-violations/recent', () => {
  const mockEntry = {
    id: 1, agent_id: 'CC-OPUS', timestamp: '2026-04-15', title: 't',
    content: '{}', tags: null, related_files: 'memory/a.md',
    story_id: null, epic_id: null, metadata: null,
  };

  beforeEach(() => {
    vi.mocked(dbModule.getDb).mockReturnValue({} as never);
    (svc.getRecent as Mock).mockReturnValue([mockEntry]);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('returns 200 with items + total', async () => {
    const { status, body } = await doRequest(makeApp(), 'GET', '/api/rule-violations/recent');
    expect(status).toBe(200);
    const b = body as { items: typeof mockEntry[]; total: number };
    expect(b.items).toHaveLength(1);
    expect(b.total).toBe(1);
  });

  it('returns 503 when DB not connected', async () => {
    vi.mocked(dbModule.getDb).mockReturnValue(null);
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/recent');
    expect(status).toBe(503);
  });

  it('accepts ?limit=50 and passes to service', async () => {
    await doRequest(makeApp(), 'GET', '/api/rule-violations/recent?limit=50');
    expect(svc.getRecent).toHaveBeenCalledWith(50);
  });

  it('defaults to limit=20 when param omitted', async () => {
    await doRequest(makeApp(), 'GET', '/api/rule-violations/recent');
    expect(svc.getRecent).toHaveBeenCalledWith(20);
  });

  it('rejects invalid limit (0)', async () => {
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/recent?limit=0');
    expect(status).toBe(400);
  });

  it('rejects limit > 200', async () => {
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/recent?limit=999');
    expect(status).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    (svc.getRecent as Mock).mockImplementation(() => { throw new Error('svc-err'); });
    const { status } = await doRequest(makeApp(), 'GET', '/api/rule-violations/recent');
    expect(status).toBe(500);
  });
});
