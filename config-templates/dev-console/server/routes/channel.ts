// ============================================================
// channel.ts — /api/channel 6 支唯讀 GET endpoint（ccb-3-devconsole-channel-page）
// 🔴 字面路徑（/stats /boards /read-matrix /search /threads）先於
// /threads/:threadId/messages（參數路徑）註冊（AC11/BR046）。
// 503（DB 不可用）與 404（查無此列）分流照 workers.ts:126-142 fail-open 範式。
// ============================================================
import { Router, type Request, type Response } from 'express';
import {
  getStats,
  listBoards,
  listThreads,
  getThreadMessages,
  getReadMatrix,
  searchThreads,
  isDbReady,
} from '../services/channelService.js';

const router = Router();

function dbUnavailable(res: Response, message: string): void {
  res.status(503).json({ error: message, dbUnavailable: true });
}

/** 界限化 int 解析：非數值 → undefined（交服務層決定預設值），有效數值原樣傳遞（服務層再夾限）。 */
function parseOptionalInt(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseBoolFlag(raw: unknown): boolean {
  return raw === 'true' || raw === '1' || raw === true;
}

// ── GET /stats ───────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢頻道統計'); return; }
  try {
    res.json(getStats());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /boards ──────────────────────────────────────────────

router.get('/boards', (_req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢看板'); return; }
  try {
    res.json(listBoards());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /read-matrix ─────────────────────────────────────────

router.get('/read-matrix', (req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢簽收矩陣'); return; }
  try {
    const q = req.query;
    res.json(
      getReadMatrix({
        days: parseOptionalInt(q['days']),
        limit: parseOptionalInt(q['limit']),
        channel: q['channel'] ? String(q['channel']) : undefined,
        category: q['category'] ? String(q['category']) : undefined,
      }),
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /search ──────────────────────────────────────────────

router.get('/search', (req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法搜尋話題'); return; }
  try {
    const q = req.query;
    res.json(
      searchThreads({
        q: q['q'] ? String(q['q']) : '',
        state: q['state'] === 'open' ? 'open' : 'closed',
        category: q['category'] ? String(q['category']) : undefined,
        must_read: parseBoolFlag(q['must_read']),
        channel: q['channel'] ? String(q['channel']) : undefined,
        page: parseOptionalInt(q['page']),
        pageSize: parseOptionalInt(q['pageSize']),
      }),
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /threads（Tab1 通話中 / state=closed 供 BR-023）───────

router.get('/threads', (req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢話題列表'); return; }
  try {
    const q = req.query;
    const state = q['state'] === 'closed' ? 'closed' : 'open';
    res.json(
      listThreads({
        state,
        category: q['category'] ? String(q['category']) : undefined,
        must_read: parseBoolFlag(q['must_read']),
        channel: q['channel'] ? String(q['channel']) : undefined,
        page: parseOptionalInt(q['page']),
        pageSize: parseOptionalInt(q['pageSize']),
      }),
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /threads/:threadId/messages（詳情時間軸）──────────────

router.get('/threads/:threadId/messages', (req: Request, res: Response) => {
  if (!isDbReady()) { dbUnavailable(res, 'DB 未連線，無法查詢話題訊息'); return; }
  try {
    const threadId = req.params['threadId'] as string;
    const result = getThreadMessages(threadId);
    if (!result) {
      res.status(404).json({ error: `thread_id "${threadId}" 不存在` });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
