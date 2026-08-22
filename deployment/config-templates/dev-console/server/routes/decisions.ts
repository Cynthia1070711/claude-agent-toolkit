// ============================================================
// decisions.ts — 技術決策 API Routes (Express Router)
// DVS-07 AC-1: GET /api/decisions（搜尋 + 分頁 + source 篩選）
// ============================================================
import { Router, Request, Response } from 'express';
import * as decisionService from '../services/decisionService.js';

const router = Router();

// ── GET /api/decisions ────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const { search = '', source = 'all', page, pageSize } = req.query;

  const sourceValue = String(source);
  if (sourceValue !== 'context' && sourceValue !== 'tech' && sourceValue !== 'all') {
    res.status(400).json({ error: 'source 必須為 context | tech | all' });
    return;
  }

  try {
    const result = decisionService.listDecisions({
      search: String(search),
      source: sourceValue as 'context' | 'tech' | 'all',
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
