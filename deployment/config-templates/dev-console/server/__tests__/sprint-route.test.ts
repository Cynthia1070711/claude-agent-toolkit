// ============================================================
// sprint-route.test.ts — /api/sprint 路由層測試
// [tdb-2 BR-013] 資料源改 stories 表(DB-first)— sprint-status.yaml 已凍結 2026-07-28。
// vi.mock service 層（route 層不測聚合邏輯，該邏輯測試見 db-story-service.test.ts）。
// 模式對齊 roadmap-route.test.ts（tdb-1-track-plan-roadmap）。
// ============================================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../services/db-story-service.js', () => ({
  getDbStoryStats: vi.fn(),
  getDbEpicProgress: vi.fn(),
  getDbComplexityDistribution: vi.fn(),
  isDbReady: vi.fn(() => true),
}));

import request from 'supertest';
import { buildTestApp } from './test-app.js';
import sprintRouter from '../routes/sprint.js';
import * as dbStorySvc from '../services/db-story-service.js';

describe('/api/sprint routes', () => {
  const testApp = buildTestApp([['/api/sprint', sprintRouter]]);

  beforeEach(() => {
    vi.clearAllMocks();
    (dbStorySvc.isDbReady as Mock).mockReturnValue(true);
  });

  // ── [tdb-2 AC10 / BR-017] DB 不可用 → 503,禁回退讀已凍結的 sprint-status.yaml ──
  describe('DB 不可用分流（AC10）', () => {
    it.each([
      ['/api/sprint/stats'],
      ['/api/sprint/epics'],
      ['/api/sprint/complexity'],
    ])('BR017_%s_WhenDbNotReady_Returns503NotFrozenYamlFallback', async (url) => {
      (dbStorySvc.isDbReady as Mock).mockReturnValue(false);
      const res = await request(testApp).get(url);
      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
      // 不得回退讀凍結檔:三個聚合函式一次都不該被呼叫
      expect(dbStorySvc.getDbStoryStats).not.toHaveBeenCalled();
      expect(dbStorySvc.getDbEpicProgress).not.toHaveBeenCalled();
      expect(dbStorySvc.getDbComplexityDistribution).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/sprint/stats', () => {
    it('BR013_GetSprintStats_ReturnsDbStoryStats: 200 且回傳統計物件', async () => {
      const stats = { total: 10, backlog: 2, readyForDev: 1, inProgress: 3, review: 1, done: 3, cancelled: 0, other: 0 };
      (dbStorySvc.getDbStoryStats as Mock).mockReturnValue(stats);
      const res = await request(testApp).get('/api/sprint/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(stats);
      expect(dbStorySvc.getDbStoryStats).toHaveBeenCalledWith(undefined);
    });

    it('?epicId=dvs 透傳至 getDbStoryStats', async () => {
      (dbStorySvc.getDbStoryStats as Mock).mockReturnValue({});
      await request(testApp).get('/api/sprint/stats?epicId=dvs');
      expect(dbStorySvc.getDbStoryStats).toHaveBeenCalledWith('dvs');
    });
  });

  describe('GET /api/sprint/epics', () => {
    it('BR013_GetSprintEpics_ReturnsDbEpicProgress: 200 且回傳 EpicProgress 陣列', async () => {
      const epics = [
        { epicId: 'cat', epicStatus: 'done', totalStories: 1, doneCount: 1, inProgressCount: 0, reviewCount: 0, readyForDevCount: 0, backlogCount: 0, cancelledCount: 0, completionPct: 100 },
      ];
      (dbStorySvc.getDbEpicProgress as Mock).mockReturnValue(epics);
      const res = await request(testApp).get('/api/sprint/epics');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(epics);
    });
  });

  describe('GET /api/sprint/complexity', () => {
    it('BR013_GetSprintComplexity_ReturnsDbComplexityDistribution: 200 且回傳分佈物件', async () => {
      const dist = { XS: 0, S: 1, M: 2, L: 0, XL: 0, untagged: 1 };
      (dbStorySvc.getDbComplexityDistribution as Mock).mockReturnValue(dist);
      const res = await request(testApp).get('/api/sprint/complexity');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(dist);
      expect(dbStorySvc.getDbComplexityDistribution).toHaveBeenCalledWith(undefined);
    });

    it('?epicId=dvs 透傳至 getDbComplexityDistribution', async () => {
      (dbStorySvc.getDbComplexityDistribution as Mock).mockReturnValue({ XS: 0, S: 0, M: 0, L: 0, XL: 0, untagged: 0 });
      await request(testApp).get('/api/sprint/complexity?epicId=dvs');
      expect(dbStorySvc.getDbComplexityDistribution).toHaveBeenCalledWith('dvs');
    });
  });
});
