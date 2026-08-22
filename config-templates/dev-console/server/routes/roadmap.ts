// ============================================================
// roadmap.ts — GET /api/roadmap 單一唯讀 endpoint（tdb-1-track-plan-roadmap）
// 503（DB 不可用）與 500（service 例外）分流照 channel.ts:20-22 fail-open 範式。
// ============================================================
import { Router, type Request, type Response } from 'express';
import { getRoadmap, isDbReady } from '../services/roadmapService.js';

const router = Router();

function dbUnavailable(res: Response, message: string): void {
  res.status(503).json({ error: message, dbUnavailable: true });
}

router.get('/', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢推進地圖'); return; }
  try {
    res.json(getRoadmap());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
