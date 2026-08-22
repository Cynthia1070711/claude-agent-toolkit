// ============================================================
// patterns.ts — Phase 4 Pattern Observations API Routes (Express Router)
// GET /api/patterns/observations — list pattern observations with domain stats
// GET /api/patterns/queue        — embedding queue status
// ============================================================
import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// ── GET /observations ─────────────────────────────────────────
router.get('/observations', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const { domain, minConfidence } = req.query;

    let sql = 'SELECT * FROM pattern_observations';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (domain) {
      conditions.push('domain = ?');
      params.push(domain);
    }
    if (minConfidence) {
      conditions.push('confidence >= ?');
      params.push(Number(minConfidence));
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY occurrences DESC, last_seen DESC LIMIT 200';

    const rows = db.prepare(sql).all(...params);

    const domainStats = db.prepare(
      `SELECT domain,
              COUNT(*) as count,
              SUM(occurrences) as total_ops,
              AVG(confidence) as avg_confidence
       FROM pattern_observations
       GROUP BY domain
       ORDER BY total_ops DESC`,
    ).all();

    res.json({ observations: rows, domainStats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /recent ─ 即時原始觀測 feed(last_seen DESC · 輕量供前端輪詢)──
// 純讀 pattern_observations,非侵入式;供湧現迴路頁「即時觀測」面板驗證觀測迴路運作。
router.get('/recent', (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 20));
    const observations = db.prepare(
      `SELECT id, file_path, domain, tool_name, change_type, first_seen, last_seen, occurrences, confidence
       FROM pattern_observations
       ORDER BY last_seen DESC
       LIMIT ?`,
    ).all(limit);
    // 今日(台灣日界)觀測筆數 — 用 substr 比對日期前綴(非 DATE() 避免 +08:00 → UTC 日界偏移)
    const todayPrefix = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
    const todayRow = db.prepare(
      'SELECT COUNT(*) AS c FROM pattern_observations WHERE substr(last_seen,1,10) = ?',
    ).get(todayPrefix) as { c: number };
    const metaRow = db.prepare(
      'SELECT COUNT(*) AS total, MAX(last_seen) AS latest FROM pattern_observations',
    ).get() as { total: number; latest: string | null };
    res.json({ observations, todayCount: todayRow.c, total: metaRow.total, latest: metaRow.latest });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /queue ────────────────────────────────────────────────
router.get('/queue', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const pending = db.prepare(
      'SELECT * FROM embedding_queue WHERE processed = 0 ORDER BY queued_at DESC',
    ).all();

    const recentProcessed = db.prepare(
      'SELECT * FROM embedding_queue WHERE processed = 1 ORDER BY queued_at DESC LIMIT 20',
    ).all();

    const stats = db.prepare(
      'SELECT processed, COUNT(*) as count FROM embedding_queue GROUP BY processed',
    ).all();

    res.json({ pending, recentProcessed, stats });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /embedding-health ────────────────────────────────────
router.get('/embedding-health', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    const cnt = (tbl: string) => (db.prepare(`SELECT COUNT(*) as cnt FROM ${tbl}`).get() as { cnt: number }).cnt;

    const symbolEmb = cnt('symbol_embeddings');
    const symbolIdx = cnt('symbol_index');
    const docEmb = cnt('document_embeddings');

    // Memory embedding coverage (5 tables)
    const memory = [
      { name: 'context', emb: cnt('context_embeddings'), src: cnt('context_entries') },
      { name: 'tech', emb: cnt('tech_embeddings'), src: cnt('tech_entries') },
      { name: 'stories', emb: cnt('stories_embeddings'), src: cnt('stories') },
      { name: 'conversations', emb: cnt('conversation_embeddings'), src: cnt('conversation_sessions') },
      { name: 'debt', emb: cnt('debt_embeddings'), src: cnt('tech_debt_items') },
    ];

    const queueStats = db.prepare(
      'SELECT processed, COUNT(*) as count FROM embedding_queue GROUP BY processed',
    ).all() as { processed: number; count: number }[];

    const queuePending = queueStats.find(s => s.processed === 0)?.count ?? 0;
    const queueProcessed = queueStats.find(s => s.processed === 1)?.count ?? 0;

    let modelName = 'N/A';
    let dimensions = 0;
    try {
      const row = db.prepare('SELECT model, dimensions FROM symbol_embeddings LIMIT 1').get() as { model: string; dimensions: number } | undefined;
      if (row) { modelName = row.model; dimensions = row.dimensions; }
      else {
        const docRow = db.prepare('SELECT model, dimensions FROM document_embeddings LIMIT 1').get() as { model: string; dimensions: number } | undefined;
        if (docRow) { modelName = docRow.model; dimensions = docRow.dimensions; }
      }
    } catch { /* tables may not exist */ }

    res.json({
      symbolEmbeddings: symbolEmb,
      symbolIndex: symbolIdx,
      documentEmbeddings: docEmb,
      memory,
      queuePending,
      queueProcessed,
      modelName,
      dimensions,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /retrieval-stats ─────────────────────────────────────
router.get('/retrieval-stats', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'DB 未連線' });
      return;
    }

    // Check if table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='retrieval_observations'",
    ).get();
    if (!tableExists) {
      res.json({ toolStats: [], recentQueries: [], totalCalls: 0 });
      return;
    }

    const toolStats = db.prepare(`
      SELECT tool_name,
             COUNT(*) as call_count,
             ROUND(AVG(result_count), 1) as avg_results,
             ROUND(AVG(avg_similarity), 4) as avg_similarity,
             ROUND(AVG(duration_ms), 0) as avg_duration_ms,
             MAX(timestamp) as last_called
      FROM retrieval_observations
      GROUP BY tool_name
      ORDER BY call_count DESC
    `).all();

    const recentQueries = db.prepare(`
      SELECT tool_name, query_text, result_count, search_mode,
             avg_similarity, duration_ms, timestamp
      FROM retrieval_observations
      WHERE query_text IS NOT NULL AND query_text != ''
      ORDER BY timestamp DESC
      LIMIT 20
    `).all();

    const totalCalls = (db.prepare('SELECT COUNT(*) as c FROM retrieval_observations').get() as { c: number }).c;

    // Search mode distribution
    const modeStats = db.prepare(`
      SELECT search_mode, COUNT(*) as count
      FROM retrieval_observations
      WHERE search_mode IS NOT NULL
      GROUP BY search_mode
      ORDER BY count DESC
    `).all();

    // Hot entries (most retrieved memory entries)
    let hotEntries: unknown[] = [];
    const hitsExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='retrieval_hits'",
    ).get();
    if (hitsExists) {
      hotEntries = db.prepare(`
        SELECT source_table, entry_id, entry_title, hit_count,
               ROUND(confidence, 4) as confidence, last_query, last_seen
        FROM retrieval_hits
        ORDER BY hit_count DESC
        LIMIT 20
      `).all();
    }

    // Top keywords
    let topKeywords: unknown[] = [];
    const kwExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='retrieval_keywords'",
    ).get();
    if (kwExists) {
      topKeywords = db.prepare(`
        SELECT keyword, hit_count, last_seen
        FROM retrieval_keywords
        ORDER BY hit_count DESC
        LIMIT 30
      `).all();
    }

    res.json({ toolStats, recentQueries, totalCalls, modeStats, hotEntries, topKeywords });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
