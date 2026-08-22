// ============================================================
// dashboard-route.test.ts — /api/dashboard 路由層測試
// [tdb-2 BR-013] storyStats 資料源改 stories 表(DB-first)— sprint-status.yaml 已凍結 2026-07-28。
// vi.mock service 層（route 層不測聚合邏輯，該邏輯測試見 db-story-service.test.ts）。
// 模式對齊 roadmap-route.test.ts（tdb-1-track-plan-roadmap）。
// ============================================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../services/db-story-service.js', () => ({
  getDbStoryStats: vi.fn(),
}));
vi.mock('../services/memoryService.js', () => ({
  getStats: vi.fn(),
}));
vi.mock('../services/documentService.js', () => ({
  getEmbeddingStats: vi.fn(),
}));
vi.mock('../db.js', () => ({
  getDb: vi.fn(),
}));

import request from 'supertest';
import { buildTestApp } from './test-app.js';
import dashboardRouter from '../routes/dashboard.js';
import * as dbStorySvc from '../services/db-story-service.js';
import * as memorySvc from '../services/memoryService.js';
import * as documentSvc from '../services/documentService.js';
import * as dbMod from '../db.js';

describe('/api/dashboard route', () => {
  const testApp = buildTestApp([['/api', dashboardRouter]]);

  beforeEach(() => {
    vi.clearAllMocks();
    (dbMod.getDb as Mock).mockReturnValue(null);
    (memorySvc.getStats as Mock).mockReturnValue(null);
    (documentSvc.getEmbeddingStats as Mock).mockReturnValue(null);
  });

  it('BR013_GetDashboard_StoryStatsSourcedFromDb: storyStats 等於 getDbStoryStats() 回傳值', async () => {
    const stats = { total: 10, backlog: 2, readyForDev: 1, inProgress: 3, review: 1, done: 3, cancelled: 0, other: 0 };
    (dbStorySvc.getDbStoryStats as Mock).mockReturnValue(stats);

    const res = await request(testApp).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.storyStats).toEqual(stats);
  });

  it('getDbStoryStats 拋例外時 storyStats 回退全零', async () => {
    (dbStorySvc.getDbStoryStats as Mock).mockImplementation(() => { throw new Error('boom'); });

    const res = await request(testApp).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.storyStats).toEqual({
      total: 0, backlog: 0, readyForDev: 0, inProgress: 0, review: 0, done: 0, cancelled: 0, other: 0,
    });
  });

  it('memoryService 不可用（getStats 拋例外）時 memoryStats 回 null', async () => {
    (dbStorySvc.getDbStoryStats as Mock).mockReturnValue({});
    (memorySvc.getStats as Mock).mockImplementation(() => { throw new Error('no db'); });

    const res = await request(testApp).get('/api/dashboard');
    expect(res.body.memoryStats).toBeNull();
  });

  it('DB 不存在（getDb 回 null）時 recentActivity 回空陣列', async () => {
    (dbStorySvc.getDbStoryStats as Mock).mockReturnValue({});

    const res = await request(testApp).get('/api/dashboard');
    expect(res.body.recentActivity).toEqual([]);
  });

  it('回傳結構含四個必要欄位', async () => {
    (dbStorySvc.getDbStoryStats as Mock).mockReturnValue({});

    const res = await request(testApp).get('/api/dashboard');
    expect(res.body).toHaveProperty('storyStats');
    expect(res.body).toHaveProperty('memoryStats');
    expect(res.body).toHaveProperty('recentActivity');
    expect(res.body).toHaveProperty('embeddingStats');
  });
});
