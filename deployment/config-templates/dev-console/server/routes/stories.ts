// ============================================================
// GET  /api/stories         — Story 列表（含篩選）
// GET  /api/stories/stats   — 狀態統計
// GET  /api/stories/epics   — Epic 清單
// PATCH /api/stories/:key/status — 狀態變更（DB-only,sprint-status.yaml 已凍結 2026-07-28）
// GET  /api/stories/:id/content  — Story Markdown 內容（DVS-06 AC-5）
// DVS-03 AC-1~4, DVS-06 AC-5
// [tdb-2 BR-012] yaml best-effort 同步寫回已移除 — updateDbStoryStatus() 為唯一寫入路徑。
// ============================================================
import { Router, Request, Response } from 'express';
import { VALID_STATUSES } from '../services/yaml-service.js';
import {
  getDbStoryList,
  getDbStoryStats,
  getDbEpicList,
  getDbStory,
  updateDbStoryStatus,
  type StoryFilters,
} from '../services/db-story-service.js';
import { getStoryContent, getStructuredStoryDetail } from '../services/storyDetailService.js';

const router = Router();

// ── GET /api/stories（DB-first）──
router.get('/', (_req: Request, res: Response) => {
  const filters: StoryFilters = {};

  const epicId = _req.query['epicId'] as string | undefined;
  const status = _req.query['status'] as string | undefined;
  const search = _req.query['search'] as string | undefined;
  const dateRange = _req.query['dateRange'] as string | undefined;
  const sort = _req.query['sort'] as string | undefined;

  if (epicId) filters.epicId = epicId;
  if (status) filters.status = status;
  if (search) filters.search = search;
  if (dateRange && ['today', '3d', 'week', 'month'].includes(dateRange)) {
    filters.dateRange = dateRange as StoryFilters['dateRange'];
  }
  if (sort && ['date_desc', 'date_asc', 'epic_asc', 'epic_desc'].includes(sort)) {
    filters.sortBy = sort as StoryFilters['sortBy'];
  }

  const stories = getDbStoryList(Object.keys(filters).length > 0 ? filters : undefined);
  res.json(stories);
});

// ── GET /api/stories/stats（DB-first）──
router.get('/stats', (_req: Request, res: Response) => {
  const epicId = _req.query['epicId'] as string | undefined;
  const dateRange = _req.query['dateRange'] as string | undefined;
  const dr = dateRange && ['today', '3d', 'week', 'month'].includes(dateRange)
    ? dateRange as 'today' | '3d' | 'week' | 'month'
    : undefined;
  const stats = getDbStoryStats(epicId, dr);
  res.json(stats);
});

// ── GET /api/stories/epics（DB-first）──
router.get('/epics', (_req: Request, res: Response) => {
  const epics = getDbEpicList();
  res.json(epics);
});

// ── PATCH /api/stories/:key/status（DB-first + YAML 同步）──
router.patch('/:key/status', (req: Request, res: Response) => {
  const key = req.params['key'] as string;
  const { status } = req.body as { status?: string };

  if (!status || !VALID_STATUSES.has(status)) {
    res.status(400).json({
      error: `Invalid status "${status}". Valid values: ${[...VALID_STATUSES].join(', ')}`,
    });
    return;
  }

  // DB 更新
  const story = getDbStory(key);
  if (!story) {
    res.status(404).json({ error: `Story "${key}" not found in DB` });
    return;
  }

  console.log(`[Stories] PATCH ${key}: ${story.status} → ${status}`);
  const ok = updateDbStoryStatus(key, status);
  if (!ok) {
    res.status(500).json({ error: `Failed to update story "${key}" in DB` });
    return;
  }

  res.json({ ...story, status });
});

// ── GET /api/stories/:id/detail ── (DVS-07: 結構化詳情)
router.get('/:id/detail', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  if (!id) {
    res.status(400).json({ error: 'Missing story id' });
    return;
  }

  const detail = getStructuredStoryDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }

  res.json(detail);
});

// ── GET /api/stories/:id/content ── (DVS-06 AC-5)
router.get('/:id/content', (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  if (!id) {
    res.status(400).json({ error: 'Missing story id' });
    return;
  }

  const result = getStoryContent(id);

  if (result.error === 'STORY_NOT_FOUND') {
    res.status(404).json({ content: null, error: result.error, story: null });
    return;
  }
  if (result.error === 'PATH_TRAVERSAL_BLOCKED') {
    res.status(403).json({ content: null, error: result.error, story: result.story });
    return;
  }

  res.json(result);
});

export default router;
