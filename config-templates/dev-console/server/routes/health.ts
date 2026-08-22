// ============================================================
// GET /api/health — DB 連線狀態 + 時間戳
// AC-2: 回傳 { status, db: { connected, path, sizeBytes }, timestamp }
// ============================================================
import { Router } from 'express';
import path from 'path';
import { getDbStats } from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const dbStats = getDbStats();
  res.json({
    status: 'ok',
    db: {
      connected: dbStats.connected,
      path: path.basename(dbStats.path),
      sizeBytes: dbStats.sizeBytes,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
