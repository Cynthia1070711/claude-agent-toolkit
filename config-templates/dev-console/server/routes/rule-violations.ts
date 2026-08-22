// ============================================================
// rule-violations.ts — Rule Violation API Routes (Express Router)
// Story: ctr-p2-violation-tracker Task 4 (AC4)
// GET /api/rule-violations/stats?days=60
// GET /api/rule-violations/recent?limit=20
// ============================================================
import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';
import { getStats, getRecent } from '../services/ruleViolationService.js';

const router = Router();

// ── GET /stats ────────────────────────────────────────────────
router.get('/stats', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const rawDays = req.query.days;
    let days = 60;
    if (rawDays !== undefined) {
      const n = Number(rawDays);
      if (!Number.isFinite(n) || n <= 0 || n > 365) {
        res.status(400).json({ error: 'days 必須為 1 – 365' });
        return;
      }
      days = Math.floor(n);
    }

    const stats = getStats(days);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /recent ───────────────────────────────────────────────
router.get('/recent', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const rawLimit = req.query.limit;
    let limit = 20;
    if (rawLimit !== undefined) {
      const n = Number(rawLimit);
      if (!Number.isFinite(n) || n <= 0 || n > 200) {
        res.status(400).json({ error: 'limit 必須為 1 – 200' });
        return;
      }
      limit = Math.floor(n);
    }

    const items = getRecent(limit);
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
