// ============================================================
// stories-route.test.ts — /api/stories 路由層測試
// [tdb-2 BR-012] sprint-status.yaml 已凍結,route 改為 DB-first(db-story-service)。
// vi.mock service 層（route 層不測聚合邏輯，該邏輯測試見 db-story-service.test.ts）。
// 模式對齊 roadmap-route.test.ts（tdb-1-track-plan-roadmap）。
// ============================================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../services/db-story-service.js', () => ({
  getDbStoryList: vi.fn(),
  getDbStoryStats: vi.fn(),
  getDbEpicList: vi.fn(),
  getDbStory: vi.fn(),
  updateDbStoryStatus: vi.fn(),
}));

import request from 'supertest';
import { buildTestApp } from './test-app.js';
import storiesRouter from '../routes/stories.js';
import * as dbStorySvc from '../services/db-story-service.js';
import type { StoryEntry } from '../services/yaml-service.js';

function makeStory(overrides: Partial<StoryEntry> = {}): StoryEntry {
  return {
    id: 'dvs-01-scaffold', key: 'dvs-01-scaffold', epicId: 'dvs', title: 'Scaffold',
    status: 'done', isEpic: false,
    metadata: {
      complexity: 'M', priority: 'P0', crScore: 93, testCount: 7,
      devAgent: 'CC-SONNET', reviewAgent: 'CC-OPUS', createdAgent: null,
      lastUpdated: '2026-07-28', comment: 'M, P0, CR:93, 7 tests',
      rerun: null,
    },
    ...overrides,
  };
}

describe('/api/stories routes', () => {
  const testApp = buildTestApp([['/api/stories', storiesRouter]]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/stories', () => {
    it('BR012_GetStories_ReturnsDbStoryList: 200 且回傳 db-story-service 陣列', async () => {
      (dbStorySvc.getDbStoryList as Mock).mockReturnValue([makeStory()]);
      const res = await request(testApp).get('/api/stories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].key).toBe('dvs-01-scaffold');
    });

    it('?epicId=dvs 篩選透傳至 getDbStoryList filters', async () => {
      (dbStorySvc.getDbStoryList as Mock).mockReturnValue([]);
      await request(testApp).get('/api/stories?epicId=dvs&status=done');
      expect(dbStorySvc.getDbStoryList).toHaveBeenCalledWith({ epicId: 'dvs', status: 'done' });
    });

    it('無 query 時 filters 傳 undefined（非空物件）', async () => {
      (dbStorySvc.getDbStoryList as Mock).mockReturnValue([]);
      await request(testApp).get('/api/stories');
      expect(dbStorySvc.getDbStoryList).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /api/stories/stats', () => {
    it('BR013_GetStoriesStats_ReturnsDbStoryStats: 200 且回傳統計物件', async () => {
      const stats = { total: 10, backlog: 2, readyForDev: 1, inProgress: 3, review: 1, done: 3, cancelled: 0, other: 0 };
      (dbStorySvc.getDbStoryStats as Mock).mockReturnValue(stats);
      const res = await request(testApp).get('/api/stories/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(stats);
    });
  });

  describe('GET /api/stories/epics', () => {
    it('BR013_GetStoriesEpics_ReturnsDbEpicList: 200 且回傳 Epic 陣列', async () => {
      (dbStorySvc.getDbEpicList as Mock).mockReturnValue([{ epicId: 'dvs', storyCount: 4, epicStatus: 'active' }]);
      const res = await request(testApp).get('/api/stories/epics');
      expect(res.status).toBe(200);
      expect(res.body[0].epicId).toBe('dvs');
    });
  });

  describe('PATCH /api/stories/:key/status', () => {
    it('BR012_PatchStatus_InvalidStatus_Returns400: 不合法 status 回 400,不呼叫 DB', async () => {
      const res = await request(testApp)
        .patch('/api/stories/dvs-01-scaffold/status')
        .send({ status: 'not-a-real-status' });
      expect(res.status).toBe(400);
      expect(dbStorySvc.getDbStory).not.toHaveBeenCalled();
    });

    it('空 status body 回 400', async () => {
      const res = await request(testApp).patch('/api/stories/dvs-01-scaffold/status').send({});
      expect(res.status).toBe(400);
    });

    it('BR012_PatchStatus_StoryNotFoundInDb_Returns404', async () => {
      (dbStorySvc.getDbStory as Mock).mockReturnValue(null);
      const res = await request(testApp)
        .patch('/api/stories/nonexistent/status')
        .send({ status: 'done' });
      expect(res.status).toBe(404);
      expect(dbStorySvc.updateDbStoryStatus).not.toHaveBeenCalled();
    });

    it('BR012_PatchStatus_ValidTransition_WritesDbOnlyNotYaml: 200,只呼叫 updateDbStoryStatus 一次,無 yaml 寫入路徑', async () => {
      (dbStorySvc.getDbStory as Mock).mockReturnValue(makeStory({ status: 'review' }));
      (dbStorySvc.updateDbStoryStatus as Mock).mockReturnValue(true);
      const res = await request(testApp)
        .patch('/api/stories/dvs-01-scaffold/status')
        .send({ status: 'done' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(dbStorySvc.updateDbStoryStatus).toHaveBeenCalledWith('dvs-01-scaffold', 'done');
      expect(dbStorySvc.updateDbStoryStatus).toHaveBeenCalledTimes(1);
    });

    it('DB 更新失敗回 500', async () => {
      (dbStorySvc.getDbStory as Mock).mockReturnValue(makeStory());
      (dbStorySvc.updateDbStoryStatus as Mock).mockReturnValue(false);
      const res = await request(testApp)
        .patch('/api/stories/dvs-01-scaffold/status')
        .send({ status: 'done' });
      expect(res.status).toBe(500);
    });
  });
});
