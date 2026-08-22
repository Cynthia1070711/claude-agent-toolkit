// ============================================================
// system.ts — 系統工具路由
// AC-4: GET /api/system/health
// AC-5: POST /api/system/run-script
// AC-6: GET /api/system/history
// ============================================================
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import { getDb, getDbStats } from '../db.js';
import { config } from '../config.js';
import {
  isWhitelisted,
  isRunning,
  runScript,
  getHistory,
} from '../services/scriptRunnerService.js';

const router = Router();

// ── GET /health ───────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  const dbStats = getDbStats();
  const db = getDb();

  let records = { context: 0, tech: 0, cr_issues: 0, conversations: 0 };
  let lastWriteTime: string | null = null;

  if (db) {
    try {
      records.context = (db.prepare('SELECT COUNT(*) as cnt FROM context_entries').get() as { cnt: number }).cnt;
    } catch (e) { console.warn('[health] context_entries 查詢失敗:', (e as Error).message); }
    try {
      records.tech = (db.prepare('SELECT COUNT(*) as cnt FROM tech_entries').get() as { cnt: number }).cnt;
    } catch (e) { console.warn('[health] tech_entries 查詢失敗:', (e as Error).message); }
    try {
      records.cr_issues = (db.prepare('SELECT COUNT(*) as cnt FROM cr_issues').get() as { cnt: number }).cnt;
    } catch (e) { console.warn('[health] cr_issues 查詢失敗:', (e as Error).message); }
    try {
      records.conversations = (db.prepare('SELECT COUNT(*) as cnt FROM conversation_sessions').get() as { cnt: number }).cnt;
    } catch (e) { console.warn('[health] conversation_sessions 查詢失敗:', (e as Error).message); }
  }

  // lastWriteTime：DB 檔案的最後修改時間
  try {
    const stat = fs.statSync(config.dbPath);
    lastWriteTime = stat.mtime.toISOString();
  } catch { /* 忽略 */ }

  res.json({
    db: {
      connected: dbStats.connected,
      path: dbStats.path,
      sizeBytes: dbStats.sizeBytes,
      tableCount: dbStats.tableCount,
      lastWriteTime,
    },
    records,
  });
});

// ── POST /run-script ──────────────────────────────────────────

router.post('/run-script', async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'body.name 為必填字串' });
    return;
  }

  if (!isWhitelisted(name)) {
    res.status(400).json({
      error: `腳本 "${name}" 不在白名單中，允許的腳本: check-hygiene, batch-audit`,
    });
    return;
  }

  if (isRunning(name)) {
    res.status(409).json({ error: `腳本 "${name}" 正在執行中，請等待完成後再試` });
    return;
  }

  try {
    const result = await runScript(name);
    res.json({
      success: result.exitCode === 0,
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
  } catch (err) {
    res.status(500).json({ error: `腳本執行失敗: ${(err as Error).message}` });
  }
});

// ── GET /history ──────────────────────────────────────────────

router.get('/history', (_req: Request, res: Response) => {
  res.json(getHistory());
});

export default router;
