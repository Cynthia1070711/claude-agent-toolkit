// ============================================================
// godnodes.ts — God Node Treemap REST endpoints
// Story: td-devconsole-godnode-and-mem-dashboard (BR-VIS-001 ~ 005)
// GET /api/godnodes — list god nodes
// GET /api/godnodes/distribution — distribution stats (P50/P75/P95/P99)
// ============================================================
import { Router, type Request, type Response } from 'express';
import { listGodNodes, getDistribution, hasCentralityScore } from '../services/godNodeService.js';

const router = Router();

// ── GET /api/godnodes ──
router.get('/', (req: Request, res: Response) => {
  try {
    if (!hasCentralityScore()) {
      res.status(503).json({
        error: 'E-DEVCONS-002: symbol_index.centrality_score column missing — run .context-db/migrations/2026-05-02-add-symbol-centrality-score.sql first',
      });
      return;
    }

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    if (Number.isNaN(limit) || limit > 100) {
      res.status(400).json({ error: 'E-DEVCONS-001: limit must be a number ≤ 100' });
      return;
    }

    const namespace = typeof req.query.namespace === 'string' && req.query.namespace.length > 0
      ? req.query.namespace
      : null;
    const include_generated = req.query.include_generated === 'true' || req.query.include_generated === '1';

    const result = listGodNodes({ limit, namespace, include_generated });
    res.json(result);
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client (no info disclosure)
    console.error('[godnodes route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

// ── GET /api/godnodes/distribution ──
router.get('/distribution', (req: Request, res: Response) => {
  try {
    if (!hasCentralityScore()) {
      res.status(503).json({
        error: 'E-DEVCONS-002: symbol_index.centrality_score column missing',
      });
      return;
    }

    const include_generated = req.query.include_generated === 'true' || req.query.include_generated === '1';
    const result = getDistribution({ include_generated });
    res.json(result);
  } catch (err) {
    // CR F-H2 fix: log full error server-side; return generic E-DEVCONS-003 to client (no info disclosure)
    console.error('[godnodes route]', err);
    res.status(500).json({ error: 'E-DEVCONS-003: internal error', code: 'E-DEVCONS-003' });
  }
});

export default router;
