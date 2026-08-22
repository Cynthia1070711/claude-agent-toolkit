// ============================================================
// decisions-route.test.ts — decisions API 路由測試
// DVS-07 AC-1: 搜尋、source 篩選、分頁、空結果
// 策略：mock decisionService，直接測試路由邏輯
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/decisionService.js', () => ({
  listDecisions: vi.fn(),
}));

import express from 'express';
import { createServer, type Server } from 'http';
import decisionsRouter from '../routes/decisions.js';
import * as decisionService from '../services/decisionService.js';
import type { Mock } from 'vitest';

const listDecisionsMock = decisionService.listDecisions as Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/decisions', decisionsRouter);
  return app;
}

async function doGet(
  url: string,
): Promise<{ status: number; body: unknown }> {
  const app = makeApp();
  return new Promise((resolve, reject) => {
    const server: Server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const http = require('http');
      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path: url, method: 'GET' },
        (res: NodeJS.ReadableStream & { statusCode: number }) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        },
      );
      req.on('error', (e: Error) => { server.close(); reject(e); });
      req.end();
    });
  });
}

// ── 共用 fixture ──────────────────────────────────────────────
const FIXTURE_ITEMS = [
  {
    id: 1,
    source: 'context' as const,
    title: '決策：使用 WAL 模式',
    content: 'WAL 模式允許並發讀寫，適合多客戶端場景',
    timestamp: '2026-01-01T00:00:00Z',
    tags: '["sqlite","wal"]',
    story_id: 'dvs-01',
    epic_id: 'dvs',
  },
  {
    id: 2,
    source: 'tech' as const,
    title: '決策：採用 React Router v7',
    content: 'React Router v7 提供更好的 TypeScript 支援',
    timestamp: '2026-01-02T00:00:00Z',
    tags: null,
    story_id: null,
    epic_id: null,
  },
];

beforeEach(() => {
  listDecisionsMock.mockReset();
});

// ────────────────────────────────────────────────────────────
// TC-D1: GET /api/decisions 回傳正確格式
// ────────────────────────────────────────────────────────────
describe('TC-D1: GET /api/decisions 回傳格式', () => {
  it('應回傳 { items, total, page } 格式', async () => {
    listDecisionsMock.mockReturnValue({ items: FIXTURE_ITEMS, total: 2, page: 1 });
    const { status, body } = await doGet('/api/decisions');
    expect(status).toBe(200);
    const b = body as { items: unknown[]; total: number; page: number };
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
    expect(typeof b.page).toBe('number');
  });

  it('每筆應包含必要欄位: id, source, title, content, timestamp', async () => {
    listDecisionsMock.mockReturnValue({ items: FIXTURE_ITEMS, total: 2, page: 1 });
    const { body } = await doGet('/api/decisions');
    const b = body as { items: Record<string, unknown>[] };
    for (const item of b.items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('timestamp');
    }
  });
});

// ────────────────────────────────────────────────────────────
// TC-D2: source 篩選
// ────────────────────────────────────────────────────────────
describe('TC-D2: source 篩選', () => {
  it('source=context 時，service 應收到 source=context', async () => {
    listDecisionsMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/decisions?source=context');
    expect(listDecisionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'context' }),
    );
  });

  it('source=tech 時，service 應收到 source=tech', async () => {
    listDecisionsMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/decisions?source=tech');
    expect(listDecisionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'tech' }),
    );
  });

  it('source=invalid 應回傳 400', async () => {
    const { status } = await doGet('/api/decisions?source=invalid');
    expect(status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// TC-D3: 搜尋參數傳遞
// ────────────────────────────────────────────────────────────
describe('TC-D3: 搜尋參數', () => {
  it('search 參數應傳遞至 service', async () => {
    listDecisionsMock.mockReturnValue({ items: [], total: 0, page: 1 });
    await doGet('/api/decisions?search=WAL');
    expect(listDecisionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'WAL' }),
    );
  });
});

// ────────────────────────────────────────────────────────────
// TC-D4: 空結果
// ────────────────────────────────────────────────────────────
describe('TC-D4: 空結果', () => {
  it('無結果時應回傳空 items 陣列', async () => {
    listDecisionsMock.mockReturnValue({ items: [], total: 0, page: 1 });
    const { status, body } = await doGet('/api/decisions');
    expect(status).toBe(200);
    const b = body as { items: unknown[] };
    expect(b.items).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// TC-D5: 分頁參數
// ────────────────────────────────────────────────────────────
describe('TC-D5: 分頁', () => {
  it('page / pageSize 參數應傳遞至 service', async () => {
    listDecisionsMock.mockReturnValue({ items: [], total: 0, page: 2 });
    await doGet('/api/decisions?page=2&pageSize=10');
    expect(listDecisionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });
});
