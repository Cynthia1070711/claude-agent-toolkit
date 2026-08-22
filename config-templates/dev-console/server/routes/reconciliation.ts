// ============================================================
// reconciliation.ts — Reconciliation API Routes (Express Router)
// dla-06 AC-7: GET /api/reconciliation/status
// dla-06 AC-3: POST /api/reconciliation/sync
// ============================================================
import { Router, Request, Response } from 'express';
import {
  syncReviewFindings,
  getReconciliationStatus,
} from '../services/reconciliationService.js';

const router = Router();

// ── GET /api/reconciliation/status (AC-7 BR-REC-STATUS) ──
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = getReconciliationStatus();
    res.json(status);
  } catch (err) {
    console.error('[reconciliation] status error:', (err as Error).message);
    res.status(503).json({ error: 'DB 未連線' });
  }
});

// ── POST /api/reconciliation/sync (AC-3 BR-REC-SYNC-MAP) ──
router.post('/sync', (_req: Request, res: Response) => {
  try {
    const result = syncReviewFindings();
    res.json(result);
  } catch (err) {
    console.error('[reconciliation] sync error:', (err as Error).message);
    res.status(500).json({ error: '同步執行失敗' });
  }
});

export default router;
