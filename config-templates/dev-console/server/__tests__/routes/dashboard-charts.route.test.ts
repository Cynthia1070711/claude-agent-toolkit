// ============================================================
// dashboard-charts.route.test.ts — Route-layer supertest tests for /api/dashboard/*
// Story: td-devconsole-godnode-route-tests-supertest (BR-RT-003)
// 8 cases: days validation 1..365 / NaN / default / 4 endpoints shape / 500 envelope
// Mock strategy: vi.mock service layer, align memoryRoutes.test.ts:8-22 pattern
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../../services/memoryDashboardService.js', () => ({
  getDailyContextTrend: vi.fn(),
  getDebtSeverityMatrix: vi.fn(),
  getIddSubtypes: vi.fn(),
  getStoryFunnel: vi.fn(),
}));

import request from 'supertest';
import { buildTestApp } from '../test-app.js';
import dashboardChartsRouter from '../../routes/dashboard-charts.js';
import * as dashSvc from '../../services/memoryDashboardService.js';

const app = buildTestApp([['/api/dashboard', dashboardChartsRouter]]);

describe('GET /api/dashboard/* (BR-RT-003)', () => {
  beforeEach(() => {
    (dashSvc.getDailyContextTrend as Mock).mockReturnValue({
      data: [],
      categories: [],
      days: 30,
    });
    (dashSvc.getDebtSeverityMatrix as Mock).mockReturnValue({
      data: [],
      severities: [],
      statuses: [],
    });
    (dashSvc.getIddSubtypes as Mock).mockReturnValue({
      data: [],
      types: [],
      other_count: 0,
    });
    (dashSvc.getStoryFunnel as Mock).mockReturnValue({
      data: [],
      stages: ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'],
      other_count: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Case 1: days=400 (> 365) → 400 E-DEVCONS-001 days must be 1..365', async () => {
    const res = await request(app).get('/api/dashboard/daily-context?days=400');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toMatch(/^E-DEVCONS-001.*days must be 1\.\.365/);
  });

  it('Case 2: days=abc (NaN) → 400 E-DEVCONS-001', async () => {
    const res = await request(app).get('/api/dashboard/daily-context?days=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^E-DEVCONS-001/);
  });

  it('Case 2a: days=1 (lower boundary, valid) → 200, service called with 1', async () => {
    // CR F3 fix — explicit lower boundary verification (BR-RT-003 days range 1..365).
    const res = await request(app).get('/api/dashboard/daily-context?days=1');
    expect(res.status).toBe(200);
    expect(dashSvc.getDailyContextTrend).toHaveBeenCalledWith(1);
  });

  it('Case 2b: days=365 (upper boundary, valid) → 200, service called with 365', async () => {
    // CR F3 fix — explicit upper boundary verification.
    const res = await request(app).get('/api/dashboard/daily-context?days=365');
    expect(res.status).toBe(200);
    expect(dashSvc.getDailyContextTrend).toHaveBeenCalledWith(365);
  });

  it('Case 2c: days=0 (just below lower boundary) → 400 E-DEVCONS-001', async () => {
    // CR F3 fix — boundary-1 negative case ensures `days < 1` guard works.
    const res = await request(app).get('/api/dashboard/daily-context?days=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^E-DEVCONS-001/);
  });

  it('Case 3: days=30 → 200, response shape match DailyContextResult', async () => {
    (dashSvc.getDailyContextTrend as Mock).mockReturnValue({
      data: [{ day: '2026-05-01', category: 'decision', cnt: 3 }],
      categories: ['decision'],
      days: 30,
    });
    const res = await request(app).get('/api/dashboard/daily-context?days=30');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('categories');
    expect(res.body).toHaveProperty('days');
  });

  it('Case 4: no query params → 200, getDailyContextTrend called with default 30', async () => {
    const res = await request(app).get('/api/dashboard/daily-context');
    expect(res.status).toBe(200);
    expect(dashSvc.getDailyContextTrend).toHaveBeenCalledWith(30);
  });

  it('Case 5: /debt-severity → 200, shape match DebtSeverityResult', async () => {
    (dashSvc.getDebtSeverityMatrix as Mock).mockReturnValue({
      data: [{ severity: 'high', status: 'pending', cnt: 5 }],
      severities: ['high'],
      statuses: ['pending'],
    });
    const res = await request(app).get('/api/dashboard/debt-severity');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('severities');
    expect(res.body).toHaveProperty('statuses');
  });

  it('Case 6: /idd-subtypes → 200, response includes other_count (non-canonical idd_type fallback)', async () => {
    // Non-canonical idd_type rows must be aggregated into other_count instead of silently
    // dropped — keeps idd-subtypes payload symmetric with story-funnel (Case 7).
    (dashSvc.getIddSubtypes as Mock).mockReturnValue({
      data: [{ idd_type: 'COM', status: 'active', cnt: 2 }],
      types: ['COM'],
      other_count: 1,
    });
    const res = await request(app).get('/api/dashboard/idd-subtypes');
    expect(res.status).toBe(200);
    expect(typeof res.body.other_count).toBe('number');
  });

  it('Case 7: /story-funnel → 200, stages = 5-step pipeline + other_count', async () => {
    const res = await request(app).get('/api/dashboard/story-funnel');
    expect(res.status).toBe(200);
    expect(res.body.stages).toEqual([
      'backlog',
      'ready-for-dev',
      'in-progress',
      'review',
      'done',
    ]);
    expect(typeof res.body.other_count).toBe('number');
  });

  it('Case 8: /daily-context service throws → 500 E-DEVCONS-003, err.message not disclosed', async () => {
    const secretMsg = 'secret-db-error-detail';
    (dashSvc.getDailyContextTrend as Mock).mockImplementation(() => {
      throw new Error(secretMsg);
    });
    const res = await request(app).get('/api/dashboard/daily-context?days=30');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    // Strict envelope match — ensures NO extra fields (e.g., err.message / stack) leaked.
    expect(res.body).toEqual({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
    expect(JSON.stringify(res.body)).not.toContain(secretMsg);
  });

  it('Case 9: /debt-severity service throws → 500 E-DEVCONS-003', async () => {
    (dashSvc.getDebtSeverityMatrix as Mock).mockImplementation(() => {
      throw new Error('debt-error');
    });
    const res = await request(app).get('/api/dashboard/debt-severity');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('E-DEVCONS-003: internal error');
    expect(res.body.code).toBe('E-DEVCONS-003');
  });

  it('Case 10: /idd-subtypes service throws → 500 E-DEVCONS-003', async () => {
    (dashSvc.getIddSubtypes as Mock).mockImplementation(() => {
      throw new Error('idd-error');
    });
    const res = await request(app).get('/api/dashboard/idd-subtypes');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('E-DEVCONS-003: internal error');
    expect(res.body.code).toBe('E-DEVCONS-003');
  });

  it('Case 11: /story-funnel service throws → 500 E-DEVCONS-003', async () => {
    (dashSvc.getStoryFunnel as Mock).mockImplementation(() => {
      throw new Error('funnel-error');
    });
    const res = await request(app).get('/api/dashboard/story-funnel');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('E-DEVCONS-003: internal error');
    expect(res.body.code).toBe('E-DEVCONS-003');
  });
});
