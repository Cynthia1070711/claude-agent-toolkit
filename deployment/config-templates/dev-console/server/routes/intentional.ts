// ============================================================
// intentional.ts — IDD (Intentional Decision Debt) API Routes
// DLA-07 AC-12: GET /api/intentional + GET /api/intentional/:id
// ============================================================
import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// ── GET /api/intentional ─────────────────────────────────────
// 查詢 active IDD 清單（含 type/criticality/status 篩選）
router.get('/', (req: Request, res: Response) => {
  const { idd_type, criticality, status = 'active', search = '' } = req.query;

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'DB 未連線' });
    return;
  }

  try {
    const params: unknown[] = [];
    let sql = `
      SELECT idd_id, idd_type, title, decision, reason, criticality, status,
             signoff_by, signoff_date, forbidden_changes, related_skills,
             platform_modules, adr_path, code_locations, last_verified_at, updated_at
      FROM intentional_decisions WHERE 1=1
    `;

    if (status) { sql += ' AND status = ?'; params.push(String(status)); }
    if (idd_type) { sql += ' AND idd_type = ?'; params.push(String(idd_type)); }
    if (criticality) { sql += ' AND criticality = ?'; params.push(String(criticality)); }
    if (search) { sql += " AND (title LIKE ? OR decision LIKE ? OR idd_id LIKE ?)"; const s = `%${String(search)}%`; params.push(s, s, s); }

    sql += " ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC";

    const items = db.prepare(sql).all(...params);

    // Stats
    const stats = db.prepare(`
      SELECT idd_type, criticality, COUNT(*) as count
      FROM intentional_decisions WHERE status='active'
      GROUP BY idd_type, criticality
    `).all();

    res.json({ items, stats, total: items.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/intentional/:id ──────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'DB 未連線' });
    return;
  }

  try {
    const row = db.prepare('SELECT * FROM intentional_decisions WHERE idd_id = ?').get(req.params.id);
    if (!row) {
      res.status(404).json({ error: `IDD not found: ${req.params.id}` });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
