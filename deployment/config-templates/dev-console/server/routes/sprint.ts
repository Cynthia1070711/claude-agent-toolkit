// ============================================================
// GET /api/sprint/stats?epicId=  — Story 狀態統計
// GET /api/sprint/epics          — Epic 完成進度
// GET /api/sprint/complexity?epicId= — 複雜度分佈
// DVS-05 AC-2
// [tdb-2 BR-013] 資料源改 stories 表(DB-first)— sprint-status.yaml 已凍結 2026-07-28。
// 回應 JSON shape 逐一比對 yaml-service 等價函式保持不變,前端 Sprint.tsx 零改動。
// ============================================================
import { Router, Request, Response } from 'express';
import {
  getDbStoryStats,
  getDbEpicProgress,
  getDbComplexityDistribution,
  isDbReady,
} from '../services/db-story-service.js';

const router = Router();

// [tdb-2 AC10] DB 不可用 → 503 明示,**不**回退讀已凍結的 sprint-status.yaml。
// 對齊 ccb-3 範式(routes/channel.ts / roadmap.ts)。前端 Sprint.tsx 既有 state.error
// 分支會顯示「⚠ 資料載入失敗」,故本分流不需改動前端(對齊 AC6「Sprint.tsx 零改動」)。
function dbUnavailable(res: Response, message: string): void {
  res.status(503).json({ error: message, dbUnavailable: true });
}

// ── GET /api/sprint/stats?epicId= ──
router.get('/stats', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢 Story 統計'); return; }
  const epicId = _req.query['epicId'] as string | undefined;
  const stats = getDbStoryStats(epicId || undefined);
  res.json(stats);
});

// ── GET /api/sprint/epics ──
router.get('/epics', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢 Epic 進度'); return; }
  const epics = getDbEpicProgress();
  res.json(epics);
});

// ── GET /api/sprint/complexity?epicId= ──
router.get('/complexity', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢複雜度分佈'); return; }
  const epicId = _req.query['epicId'] as string | undefined;
  const dist = getDbComplexityDistribution(epicId || undefined);
  res.json(dist);
});

export default router;
