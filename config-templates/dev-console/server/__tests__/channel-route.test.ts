// ============================================================
// channel-route.test.ts — /api/channel 路由層測試（ccb-3-devconsole-channel-page）
// vi.mock service 層（route 層不測 DB 邏輯，僅測掛載形態 + 參數防護 + 503/404 分流）。
// ============================================================
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../services/channelService.js', () => ({
  getStats: vi.fn(),
  listBoards: vi.fn(),
  listThreads: vi.fn(),
  getThreadMessages: vi.fn(),
  getReadMatrix: vi.fn(),
  searchThreads: vi.fn(),
  isDbReady: vi.fn(),
}));

import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTestApp } from './test-app.js';
import channelRouter from '../routes/channel.js';
import * as channelSvc from '../services/channelService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('/api/channel routes', () => {
  // per-suite 建一次（phycool-integration-testing §6.1 FORBIDDEN 明列禁 per-test 重建）。
  const testApp = buildTestApp([['/api/channel', channelRouter]]);

  beforeEach(() => {
    vi.clearAllMocks();
    (channelSvc.isDbReady as Mock).mockReturnValue(true);
  });

  function app() {
    return testApp;
  }

  // ── BR046：字面路徑不被 /threads/:threadId/messages 捕獲 ──────

  describe('route ordering (BR046)', () => {
    it('GET /api/channel/stats 回 200，且未觸發 getThreadMessages', async () => {
      (channelSvc.getStats as Mock).mockReturnValue({ tracks: ['前台軌'], open_threads: 1, closed_threads: 0, total_messages: 1 });
      const res = await request(app()).get('/api/channel/stats');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tracks');
      expect(channelSvc.getThreadMessages).not.toHaveBeenCalled();
    });

    it('GET /api/channel/boards 回 200，未觸發 getThreadMessages', async () => {
      (channelSvc.listBoards as Mock).mockReturnValue({ items: [] });
      const res = await request(app()).get('/api/channel/boards');
      expect(res.status).toBe(200);
      expect(channelSvc.getThreadMessages).not.toHaveBeenCalled();
    });

    it('GET /api/channel/read-matrix 回 200，未觸發 getThreadMessages', async () => {
      (channelSvc.getReadMatrix as Mock).mockReturnValue({ rows: [], truncated: false });
      const res = await request(app()).get('/api/channel/read-matrix');
      expect(res.status).toBe(200);
      expect(channelSvc.getThreadMessages).not.toHaveBeenCalled();
    });

    it('GET /api/channel/search 回 200，未觸發 getThreadMessages', async () => {
      (channelSvc.searchThreads as Mock).mockReturnValue({ items: [], total: 0, page: 1, pageSize: 50 });
      const res = await request(app()).get('/api/channel/search');
      expect(res.status).toBe(200);
      expect(channelSvc.getThreadMessages).not.toHaveBeenCalled();
    });

    it('GET /api/channel/threads 回 200，未觸發 getThreadMessages', async () => {
      (channelSvc.listThreads as Mock).mockReturnValue({ items: [], total: 0, page: 1, pageSize: 20 });
      const res = await request(app()).get('/api/channel/threads');
      expect(res.status).toBe(200);
      expect(channelSvc.getThreadMessages).not.toHaveBeenCalled();
    });

    it('server/routes/channel.ts 恰有 6 個 router.get 呼叫', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../routes/channel.ts'), 'utf8');
      const matches = src.match(/router\.get\(/g) ?? [];
      expect(matches.length).toBe(6);
    });
  });

  // ── GET /threads/:threadId/messages ───────────────────────

  describe('GET /threads/:threadId/messages', () => {
    it('查無此列（DB 可用）回 404', async () => {
      (channelSvc.getThreadMessages as Mock).mockReturnValue(null);
      const res = await request(app()).get('/api/channel/threads/does-not-exist/messages');
      expect(res.status).toBe(404);
    });

    it('查有此列回 200 + thread/messages', async () => {
      (channelSvc.getThreadMessages as Mock).mockReturnValue({ thread: { thread_id: 't-1' }, messages: [] });
      const res = await request(app()).get('/api/channel/threads/t-1/messages');
      expect(res.status).toBe(200);
      expect(res.body.thread.thread_id).toBe('t-1');
    });
  });

  // ── BR045：DB 不可用 503 dbUnavailable ──────────────────────

  describe('BR045 — DB unavailable fail-open (503 vs 404 分流)', () => {
    it.each([
      ['/api/channel/stats'],
      ['/api/channel/boards'],
      ['/api/channel/threads'],
      ['/api/channel/read-matrix'],
      ['/api/channel/search'],
      ['/api/channel/threads/t-1/messages'],
    ])('%s → DB 不可用回 503 且 dbUnavailable=true', async (url) => {
      (channelSvc.isDbReady as Mock).mockReturnValue(false);
      const res = await request(app()).get(url);
      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
    });
  });

  // ── BR047：無效參數一律 200 + 預設/夾限值，不得 500 ──────────

  describe('BR047 — invalid numeric params return 200 with defaults', () => {
    it('GET /threads?page=abc&days=-1&limit=99999 回 200，不拋 500', async () => {
      (channelSvc.listThreads as Mock).mockImplementation((params: { page?: number }) => ({
        items: [],
        total: 0,
        page: Math.max(Math.trunc(params.page ?? 1), 1),
        pageSize: 20,
      }));
      const res = await request(app()).get('/api/channel/threads?page=abc&days=-1&limit=99999');
      expect(res.status).toBe(200);
      // route 層對非數值 page 傳 undefined 給 service，service 落回預設 1
      expect(res.body.page).toBe(1);
    });

    it('GET /read-matrix?days=abc&limit=99999 回 200，params 傳 undefined 交服務層決定預設', async () => {
      (channelSvc.getReadMatrix as Mock).mockImplementation(() => ({ rows: [], truncated: false }));
      const res = await request(app()).get('/api/channel/read-matrix?days=abc&limit=99999');
      expect(res.status).toBe(200);
      const call = (channelSvc.getReadMatrix as Mock).mock.calls[0]?.[0];
      expect(call.days).toBeUndefined();
      expect(call.limit).toBe(99999); // 有效數值原樣傳遞，由服務層夾限至 200
    });

    it('GET /threads?must_read=1 正確轉為 boolean true', async () => {
      (channelSvc.listThreads as Mock).mockReturnValue({ items: [], total: 0, page: 1, pageSize: 20 });
      await request(app()).get('/api/channel/threads?must_read=1');
      const call = (channelSvc.listThreads as Mock).mock.calls[0]?.[0];
      expect(call.must_read).toBe(true);
    });
  });

  // ── channelService.ts 唯讀邊界（AC11，靜態原始碼斷言）──────

  describe('channelService.ts 唯讀邊界（BR043/BR044）', () => {
    it('channelService.ts 不含 INSERT/UPDATE/DELETE 語句', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../services/channelService.ts'), 'utf8');
      const matches = src.match(/\b(INSERT|UPDATE|DELETE)\b/g) ?? [];
      expect(matches.length).toBe(0);
    });

    it('channelService.ts 內所有 SQL template literal 的 ${} 插值均屬已審查安全模式（WHERE 子句組裝 / IN 子句佔位符生成 / 已驗證數值），無使用者輸入值直接嵌入 SQL 字串', () => {
      // 對照 server/services/workerRunService.ts 既有範式(`${where}` 動態子句組裝 + `?` 綁定值)：
      // 動態組出的變數(where/orderBy/extraWhere/conditions.join)本身只含欄位名/運算子/`?`，
      // 真正的使用者輸入值一律經 db.prepare(...).get(...args)/.all(...args) 以 `?` 綁定傳遞，
      // 而非直接嵌入 SQL 文字 —— 這才是本規則要防的注入風險，而非泛用的模板插值本身。
      const src = fs.readFileSync(path.resolve(__dirname, '../services/channelService.ts'), 'utf8');
      const SAFE_INTERPOLATIONS = new Set([
        'placeholders',
        "msgIds.map(() => '?').join(',')",
        'where',
        'orderBy',
        'extraWhere',
        "conditions.join(' AND ')",
        'days',
        'escapeLikeQuery(q)',
        "threadIds.map(() => '?').join(',')",
        "extraConditions.join(' AND ')",
      ]);
      const matches = [...src.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]!.trim());
      const unsafe = matches.filter((expr) => !SAFE_INTERPOLATIONS.has(expr));
      expect(unsafe).toEqual([]);
    });
  });
});
