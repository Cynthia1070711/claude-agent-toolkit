// ============================================================
// tech-debt.ts — Tech Debt API Routes (Express Router)
// DVS-07 AC-5: GET /api/tech-debt + GET /api/tech-debt/stats
// ============================================================
import { Router, Request, Response } from 'express';
import * as techDebtService from '../services/techDebtService.js';

const router = Router();

// ── GET /api/tech-debt/stats ──────────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = techDebtService.getTechDebtStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/tech-debt ────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const { status, severity, dimension, search = '' } = req.query;

  try {
    const result = techDebtService.listTechDebt({
      status: status ? String(status) : undefined,
      severity: severity ? String(severity) : undefined,
      dimension: dimension ? String(dimension) : undefined,
      search: String(search),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
