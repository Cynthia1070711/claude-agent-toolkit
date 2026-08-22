// ============================================================
// godnodes.route.test.ts — Route-layer supertest tests for /api/godnodes
// Story: td-devconsole-godnode-route-tests-supertest (BR-RT-002)
// 9 cases: limit clamping / NaN rejection / 503 hasCentralityScore guard
//          / 500 err.message non-disclosure / namespace decode / distribution 503/200/500
// Mock strategy: vi.mock service layer (not db), align memoryRoutes.test.ts:8-22 pattern
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../../services/godNodeService.js', () => ({
  hasCentralityScore: vi.fn(),
  listGodNodes: vi.fn(),
  getDistribution: vi.fn(),
}));

import request from 'supertest';
import { buildTestApp } from '../test-app.js';
import godnodesRouter from '../../routes/godnodes.js';
import * as godSvc from '../../services/godNodeService.js';

const app = buildTestApp([['/api/godnodes', godnodesRouter]]);

describe('GET /api/godnodes (BR-RT-002)', () => {
  beforeEach(() => {
    (godSvc.hasCentralityScore as Mock).mockReturnValue(true);
    (godSvc.listGodNodes as Mock).mockReturnValue({
      total: 0,
      filter: { limit: 10, namespace: null, include_generated: false, excluded_namespaces: [] },
      god_nodes: [],
    });
    (godSvc.getDistribution as Mock).mockReturnValue({
      total: 0,
      non_zero_count: 0,
      non_zero_pct: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p50: 0,
      p75: 0,
      p95: 0,
      p99: 0,
      include_generated: false,
      last_computed: null,
      by_namespace: [],
      by_namespace_total: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Case 1: limit=abc (NaN) → 400 E-DEVCONS-001', async () => {
    const res = await request(app).get('/api/godnodes?limit=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^E-DEVCONS-001/);
  });

  it('Case 2: limit=999 (> 100) → 400 with "limit must be a number ≤ 100"', async () => {
    const res = await request(app).get('/api/godnodes?limit=999');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit must be a number ≤ 100/);
  });

  it('Case 3: hasCentralityScore=false → 503 E-DEVCONS-002', async () => {
    (godSvc.hasCentralityScore as Mock).mockReturnValue(false);
    const res = await request(app).get('/api/godnodes?limit=10');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/^E-DEVCONS-002/);
  });

  it('Case 4: limit=-5 (valid route, service clamps to 1) → 200, body.filter.limit === 1', async () => {
    (godSvc.listGodNodes as Mock).mockReturnValue({
      total: 0,
      filter: { limit: 1, namespace: null, include_generated: false, excluded_namespaces: [] },
      god_nodes: [],
    });
    const res = await request(app).get('/api/godnodes?limit=-5');
    expect(res.status).toBe(200);
    expect(res.body.filter.limit).toBe(1);
  });

  it('Case 5: namespace=Test%25 → 200, Express percent-decodes to namespace="Test%"', async () => {
    // Route-layer scope: verify Express qs auto-decodes the query string before reaching the handler.
    // SQL escapeLike safety is service-layer concern — covered by godNodeService.test.ts:113-120
    // (service is mocked here, so escapeLike branch is intentionally NOT exercised).
    const res = await request(app).get('/api/godnodes?namespace=Test%25');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(godSvc.listGodNodes).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'Test%' }),
    );
  });

  it('Case 6: listGodNodes throws → 500 E-DEVCONS-003, err.message not disclosed', async () => {
    const secretMsg = 'secret-db-error-detail';
    (godSvc.listGodNodes as Mock).mockImplementation(() => {
      throw new Error(secretMsg);
    });
    const res = await request(app).get('/api/godnodes');
    expect(res.status).toBe(500);
    // Strict envelope match — toEqual ensures NO extra fields (e.g., err.message / stack) leaked.
    expect(res.body).toEqual({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
    expect(JSON.stringify(res.body)).not.toContain(secretMsg);
  });

  it('Case 7: /distribution, hasCentralityScore=false → 503 E-DEVCONS-002', async () => {
    (godSvc.hasCentralityScore as Mock).mockReturnValue(false);
    const res = await request(app).get('/api/godnodes/distribution');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/^E-DEVCONS-002/);
  });

  it('Case 8: /distribution?include_generated=true → 200, GodNodeDistribution shape', async () => {
    (godSvc.getDistribution as Mock).mockReturnValue({
      total: 100,
      non_zero_count: 80,
      non_zero_pct: 0.8,
      min: 0,
      max: 10,
      mean: 2.5,
      median: 2.0,
      p50: 2.0,
      p75: 4.0,
      p95: 8.0,
      p99: 9.5,
      include_generated: true,
      last_computed: '2026-05-03',
      by_namespace: [{ namespace: 'PhyCool', count: 50, avg: 3.0, max: 10 }],
      by_namespace_total: 1,
    });
    const res = await request(app).get('/api/godnodes/distribution?include_generated=true');
    expect(res.status).toBe(200);
    expect(res.body.include_generated).toBe(true);
    expect(typeof res.body.by_namespace_total).toBe('number');
  });

  it('Case 9: /distribution getDistribution throws → 500 E-DEVCONS-003, err.message not disclosed', async () => {
    // CR F1 fix — symmetric coverage with main endpoint Case 6;
    // closes godnodes.ts:55-59 catch block (was uncovered by 8-case suite).
    const secretMsg = 'secret-distribution-error';
    (godSvc.getDistribution as Mock).mockImplementation(() => {
      throw new Error(secretMsg);
    });
    const res = await request(app).get('/api/godnodes/distribution');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
    expect(JSON.stringify(res.body)).not.toContain(secretMsg);
  });
});
