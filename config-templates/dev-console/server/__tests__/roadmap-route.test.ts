// ============================================================
// roadmap-route.test.ts — /api/roadmap 路由層測試（tdb-1-track-plan-roadmap）
// vi.mock service 層（route 層不測投影邏輯，僅測掛載形態 + 503/500 分流 + payload 透傳 + 效能）。
// ============================================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../services/roadmapService.js', () => ({
  getRoadmap: vi.fn(),
  isDbReady: vi.fn(),
}));

import request from 'supertest';
import { buildTestApp } from './test-app.js';
import roadmapRouter from '../routes/roadmap.js';
import * as roadmapSvc from '../services/roadmapService.js';
import type { RoadmapCard, RoadmapResult } from '../services/roadmapService.js';

function makeCard(overrides: Partial<RoadmapCard> = {}): RoadmapCard {
  return {
    story_id: 'x-1', title: 'Title', title_short: 'Title', priority: 'P1', complexity: 'M',
    gate: 'unlocked', gate_note: null, gate_since: '2026-07-28T09:00:00+08:00',
    unlock_note: null, unlock_leverage: 0, deps_raw: null, blocked_by: [],
    children_progress: null, unplanned: false, seq: 1, updated_at: '2026-07-28T09:00:00+08:00',
    ...overrides,
  };
}

function makeResult(overrides: Partial<RoadmapResult> = {}): RoadmapResult {
  return {
    kpi: { total: 30, done: 13, unplanned: 0, pending: 17, inflight: 0, paused: 0 },
    lanes: [
      { lane: 'manual', cards: [makeCard()] },
      { lane: 'dispatch', cards: [] },
      { lane: 'reconcile', cards: [] },
    ],
    generated_at: '2026-07-28T09:00:00+08:00',
    ...overrides,
  };
}

describe('/api/roadmap routes', () => {
  const testApp = buildTestApp([['/api/roadmap', roadmapRouter]]);

  beforeEach(() => {
    vi.clearAllMocks();
    (roadmapSvc.isDbReady as Mock).mockReturnValue(true);
  });

  function app() {
    return testApp;
  }

  it('BR036_RoadmapRouter_MountedAtApiRoadmap: GET / 回 200 且 body 具 kpi/lanes/generated_at', async () => {
    (roadmapSvc.getRoadmap as Mock).mockReturnValue(makeResult());
    const res = await request(app()).get('/api/roadmap');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kpi');
    expect(res.body).toHaveProperty('lanes');
    expect(res.body).toHaveProperty('generated_at');
  });

  it('BR038_GetRoadmapRoute_WhenDbNotReady_Returns503: DB 未就緒回 503 + dbUnavailable=true', async () => {
    (roadmapSvc.isDbReady as Mock).mockReturnValue(false);
    const res = await request(app()).get('/api/roadmap');
    expect(res.status).toBe(503);
    expect(res.body.dbUnavailable).toBe(true);
    expect(roadmapSvc.getRoadmap).not.toHaveBeenCalled();
  });

  it('service 拋例外時回 500', async () => {
    (roadmapSvc.getRoadmap as Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    const res = await request(app()).get('/api/roadmap');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('BR039_GetRoadmapRoute_KpiPending_ExcludesInflightAndPaused: kpi.pending 透傳 service 計算值（不含 inflight/paused）', async () => {
    (roadmapSvc.getRoadmap as Mock).mockReturnValue(
      makeResult({ kpi: { total: 33, done: 13, unplanned: 0, pending: 16, inflight: 1, paused: 0 } }),
    );
    const res = await request(app()).get('/api/roadmap');
    expect(res.body.kpi.pending).toBe(16);
  });

  it('BR040_GetRoadmapRoute_GeneratedAt_IsOffsetAware: generated_at 符合 +08:00 結尾', async () => {
    (roadmapSvc.getRoadmap as Mock).mockReturnValue(makeResult({ generated_at: '2026-07-28T12:34:56+08:00' }));
    const res = await request(app()).get('/api/roadmap');
    expect(res.body.generated_at).toMatch(/\+08:00$/);
  });

  it('BR041_GetRoadmapRoute_CardPayload_HasAllSixteenFields: 每張 card 具 16 個指定鍵', async () => {
    (roadmapSvc.getRoadmap as Mock).mockReturnValue(makeResult());
    const res = await request(app()).get('/api/roadmap');
    const card = res.body.lanes[0].cards[0];
    const expectedKeys = [
      'story_id', 'title', 'title_short', 'priority', 'complexity', 'gate', 'gate_note',
      'gate_since', 'unlock_note', 'unlock_leverage', 'deps_raw', 'blocked_by',
      'children_progress', 'unplanned', 'seq', 'updated_at',
    ].sort();
    expect(Object.keys(card).sort()).toEqual(expectedKeys);
  });

  it('效能：本機回應時間 ≤ 200ms（supertest 量測，mock service 零額外延遲）', async () => {
    (roadmapSvc.getRoadmap as Mock).mockReturnValue(makeResult());
    const start = Date.now();
    await request(app()).get('/api/roadmap');
    expect(Date.now() - start).toBeLessThanOrEqual(200);
  });
});
