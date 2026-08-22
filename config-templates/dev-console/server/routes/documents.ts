// ============================================================
// documents.ts — Document API Routes (Express Router)
// P1: 文檔瀏覽、搜尋、內容讀取、Embedding 統計
// ============================================================
import { Router, Request, Response } from 'express';
import * as documentService from '../services/documentService.js';

const router = Router();

// ── GET /api/documents — 文檔列表（分頁 + 篩選）──
router.get('/', (req: Request, res: Response) => {
  const { category, epic_id, page, pageSize } = req.query;

  try {
    const result = documentService.browseDocuments(
      category ? String(category) : undefined,
      epic_id ? String(epic_id) : undefined,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/documents/search — Hybrid 搜尋 ──
router.get('/search', (req: Request, res: Response) => {
  const { q = '', category, limit } = req.query;
  const query = String(q).trim();

  if (query.length < 2) {
    res.status(400).json({ error: '搜尋關鍵字須 >= 2 字元' });
    return;
  }

  try {
    const result = documentService.searchDocuments(
      query,
      category ? String(category) : undefined,
      Number(limit) || 10,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/documents/stats — Embedding 統計 ──
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = documentService.getEmbeddingStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/documents/related — 相關文檔查詢 ──
router.get('/related', (req: Request, res: Response) => {
  const { storyId, epicId, keywords, limit } = req.query;

  try {
    const result = documentService.getRelatedDocuments(
      storyId ? String(storyId) : undefined,
      epicId ? String(epicId) : undefined,
      keywords ? String(keywords) : undefined,
      Number(limit) || 10,
    );
    res.json({ items: result, total: result.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /api/documents/:id — 單一文檔完整內容 ──
router.get('/:id', (req: Request, res: Response) => {
  const docId = Number(req.params['id']);
  if (!Number.isInteger(docId) || docId <= 0) {
    res.status(400).json({ error: 'id 必須為正整數' });
    return;
  }

  try {
    const result = documentService.getDocumentContent(docId);
    if (!result.doc) {
      res.status(404).json({ error: result.error ?? '文檔不存在' });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
