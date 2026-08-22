// ============================================================
// memory.ts — Memory API Routes (Express Router)
// AC-1~5: 搜尋、瀏覽、統計、CRUD
// ============================================================
import { Router, Request, Response } from 'express';
import * as memoryService from '../services/memoryService.js';

const router = Router();

// ── AC-3: GET /api/memory/stats ───────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = memoryService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-1: GET /api/memory/search ─────────────────────────────
router.get('/search', (req: Request, res: Response) => {
  const { q = '', type = 'context', category, limit } = req.query;
  const query = String(q);
  const safeLimit = Math.min(Number(limit) || 20, 100);

  if (query.trim().length < 3) {
    res.status(400).json({ error: 'query 參數須 >= 3 字元' });
    return;
  }
  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }

  try {
    const result =
      type === 'tech'
        ? memoryService.searchTech(query, category ? String(category) : undefined, safeLimit)
        : memoryService.searchContext(query, category ? String(category) : undefined, safeLimit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-2: GET /api/memory/browse ─────────────────────────────
router.get('/browse', (req: Request, res: Response) => {
  const { type = 'context', category, page, pageSize } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Number(pageSize) || 20, 100);

  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }

  try {
    const result =
      type === 'tech'
        ? memoryService.browseTech(category ? String(category) : undefined, safePage, safePageSize)
        : memoryService.browseContext(
            category ? String(category) : undefined,
            safePage,
            safePageSize,
          );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-4: GET /api/memory/:type/:id ─────────────────────────
router.get('/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const numId = Number(id);

  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({ error: 'id 必須為正整數' });
    return;
  }

  try {
    const item =
      type === 'tech'
        ? memoryService.getTechById(numId)
        : memoryService.getContextById(numId);

    if (!item) {
      res.status(404).json({ error: '記錄不存在' });
      return;
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-5: POST /api/memory/:type ─────────────────────────────
router.post('/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  const data = req.body;

  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }
  if (!data.title || String(data.title).trim() === '') {
    res.status(400).json({ error: 'title 為必填欄位' });
    return;
  }
  if (String(data.title).length > 200) {
    res.status(400).json({ error: 'title 不得超過 200 字元' });
    return;
  }
  if (!data.content || String(data.content).trim() === '') {
    res.status(400).json({ error: 'content 為必填欄位' });
    return;
  }

  try {
    const result =
      type === 'tech' ? memoryService.createTech(data) : memoryService.createContext(data);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-5: PUT /api/memory/:type/:id ──────────────────────────
router.put('/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const numId = Number(id);
  const data = req.body;

  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({ error: 'id 必須為正整數' });
    return;
  }
  if (data.title !== undefined && String(data.title).length > 200) {
    res.status(400).json({ error: 'title 不得超過 200 字元' });
    return;
  }

  try {
    const result =
      type === 'tech'
        ? memoryService.updateTech(numId, data)
        : memoryService.updateContext(numId, data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── AC-5: DELETE /api/memory/:type/:id ───────────────────────
router.delete('/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const numId = Number(id);

  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 必須為 context 或 tech' });
    return;
  }
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({ error: 'id 必須為正整數' });
    return;
  }

  try {
    const result =
      type === 'tech' ? memoryService.deleteTech(numId) : memoryService.deleteContext(numId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
