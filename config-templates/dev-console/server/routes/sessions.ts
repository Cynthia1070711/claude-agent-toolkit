// ============================================================
// GET  /api/sessions         — Session 時間軸查詢（合併兩表）
// GET  /api/sessions/filters — 可用 Agent + 標籤列表
// DVS-06 AC-1
// ============================================================
import { Router, Request, Response } from 'express';
import {
  getSessionTimeline,
  getAvailableAgents,
  getAvailableTags,
  type SessionQueryParams,
} from '../services/sessionService.js';

const router = Router();

// ── GET /api/sessions ──
router.get('/', (req: Request, res: Response) => {
  const params: SessionQueryParams = {};

  const startDate = req.query['startDate'] as string | undefined;
  const endDate = req.query['endDate'] as string | undefined;
  const agent = req.query['agent'] as string | undefined;
  const tags = req.query['tags'] as string | undefined;
  const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : undefined;
  const pageSize = req.query['pageSize']
    ? parseInt(req.query['pageSize'] as string, 10)
    : undefined;

  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (agent) params.agent = agent;
  if (tags) params.tags = tags;
  if (page && !isNaN(page)) params.page = page;
  if (pageSize && !isNaN(pageSize)) params.pageSize = pageSize;

  try {
    const result = getSessionTimeline(params);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/sessions/filters ──
router.get('/filters', (_req: Request, res: Response) => {
  try {
    const agents = getAvailableAgents();
    const tags = getAvailableTags();
    res.json({ agents, tags });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: msg });
  }
});

export default router;
