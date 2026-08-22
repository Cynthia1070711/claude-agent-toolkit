// ============================================================
// cr-issues.ts — CR Issue API Routes (Express Router)
// DVS-07 AC-3: GET /api/cr-issues + GET /api/cr-issues/stats
// ============================================================
import { Router, Request, Response } from 'express';
import * as crIssueService from '../services/crIssueService.js';

const router = Router();

// ── GET /api/cr-issues/stats ──────────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = crIssueService.getCrIssueStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/cr-issues ────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const { severity, resolution, storyId, search = '', page, pageSize } = req.query;

  try {
    const result = crIssueService.listCrIssues({
      severity: severity ? String(severity) : undefined,
      resolution: resolution ? String(resolution) : undefined,
      storyId: storyId ? String(storyId) : undefined,
      search: String(search),
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
