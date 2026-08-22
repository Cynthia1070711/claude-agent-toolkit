// ============================================================
// dashboard-charts.ts — Memory DB Dashboard 4 chart endpoints
// Story: td-devconsole-godnode-and-mem-dashboard (BR-MEM-001 ~ 004)
// GET /api/dashboard/daily-context  — daily context trend by category
// GET /api/dashboard/debt-severity  — debt severity × status matrix
// GET /api/dashboard/idd-subtypes   — IDD COM/STR/REG/USR pie
// GET /api/dashboard/story-funnel   — Story status pipeline funnel
// ============================================================
import { Router, type Request, type Response } from 'express';
import {
  getDailyContextTrend,
  getDebtSeverityMatrix,
  getIddSubtypes,
  getStoryFunnel,
} from '../services/memoryDashboardService.js';

const router = Router();

router.get('/daily-context', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    if (Number.isNaN(days) || days < 1 || days > 365) {
      res.status(400).json({ error: 'E-DEVCONS-001: days must be 1..365' });
      return;
    }
    res.json(getDailyContextTrend(days));
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client
    console.error('[dashboard-charts route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

router.get('/debt-severity', (_req: Request, res: Response) => {
  try {
    res.json(getDebtSeverityMatrix());
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client
    console.error('[dashboard-charts route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

router.get('/idd-subtypes', (_req: Request, res: Response) => {
  try {
    res.json(getIddSubtypes());
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client
    console.error('[dashboard-charts route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

router.get('/story-funnel', (_req: Request, res: Response) => {
  try {
    res.json(getStoryFunnel());
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client
    console.error('[dashboard-charts route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

export default router;
