// ============================================================
// schema.ts — Schema Explorer API Routes (Express Router)
// GET /api/schema/tables              — list all tables with row/column counts
// GET /api/schema/tables/:name        — column + index info for a specific table
// GET /api/schema/tables/:name/rows   — paginated row browsing
// ============================================================
import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// ── GET /tables ───────────────────────────────────────────────
router.get('/tables', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const tables = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '%_config'
         AND name NOT LIKE '%_data'
         AND name NOT LIKE '%_idx'
         AND name NOT LIKE '%_docsize'
       ORDER BY name`,
    ).all() as { name: string }[];

    const result = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
      const cols  = db.prepare(`PRAGMA table_info("${t.name}")`).all();
      return {
        name: t.name,
        row_count: count.cnt,
        column_count: cols.length,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /tables/:name ─────────────────────────────────────────
router.get('/tables/:name', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const tableName = req.params.name;

    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    ).get(tableName);
    if (!exists) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    const indexes = db.prepare(`PRAGMA index_list("${tableName}")`).all();
    const count   = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as { cnt: number };

    res.json({ name: tableName, columns, indexes, row_count: count.cnt });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /tables/:name/rows ────────────────────────────────────
router.get('/tables/:name/rows', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const tableName = req.params.name;
    const page     = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset   = (page - 1) * pageSize;

    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    ).get(tableName);
    if (!exists) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }

    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as { cnt: number }).cnt;
    const rows  = db.prepare(
      `SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT ? OFFSET ?`,
    ).all(pageSize, offset);

    res.json({ rows, total, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
