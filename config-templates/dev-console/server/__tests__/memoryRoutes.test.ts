// ============================================================
// memoryRoutes.test.ts — Memory API 路由測試
// AC-9: 參數驗證、正確回傳格式、404 處理
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// ── Service mock ────────────────────────────────────────────────
vi.mock('../services/memoryService.js', () => ({
  searchContext: vi.fn(),
  searchTech: vi.fn(),
  browseContext: vi.fn(),
  browseTech: vi.fn(),
  getStats: vi.fn(),
  getContextById: vi.fn(),
  getTechById: vi.fn(),
  createContext: vi.fn(),
  updateContext: vi.fn(),
  deleteContext: vi.fn(),
  createTech: vi.fn(),
  updateTech: vi.fn(),
  deleteTech: vi.fn(),
}));

import express from 'express';
import type { Application } from 'express';
import memoryRouter from '../routes/memory.js';
import * as memSvc from '../services/memoryService.js';

// ── 輕量 HTTP request helper（不需啟動真實 server）─────────────
import { createServer, type Server } from 'http';

async function doRequest(
  app: Application,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const options = {
        hostname: '127.0.0.1',
        port: addr.port,
        path: url,
        method: method.toUpperCase(),
        headers: body ? { 'Content-Type': 'application/json' } : {},
      };
      const { request } = require('http');
      const req = request(options, (res: NodeJS.ReadableStream & { statusCode: number }) => {
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
      });
      req.on('error', (err: Error) => {
        server.close();
        reject(err);
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// ── 測試 suite ──────────────────────────────────────────────────

describe('GET /api/memory/stats', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
    (memSvc.getStats as Mock).mockReturnValue({
      contextEntries: 10,
      techEntries: 5,
      stories: 3,
      conversations: 2,
      dbSizeBytes: 1024,
      lastModified: '2026-03-08T00:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('回傳正確格式的統計資料', async () => {
    const { status, body } = await doRequest(app, 'GET', '/api/memory/stats');
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.contextEntries).toBe(10);
    expect(b.techEntries).toBe(5);
    expect(b.dbSizeBytes).toBe(1024);
  });
});

describe('GET /api/memory/search', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
    (memSvc.searchContext as Mock).mockReturnValue({ items: [], total: 0 });
    (memSvc.searchTech as Mock).mockReturnValue({ items: [], total: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('query < 3 字元回傳 400', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/search?q=ab');
    expect(status).toBe(400);
  });

  it('空 query 回傳 400', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/search?q=');
    expect(status).toBe(400);
  });

  it('query >= 3 字元回傳 200', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/search?q=abc');
    expect(status).toBe(200);
  });

  it('type=tech 呼叫 searchTech', async () => {
    await doRequest(app, 'GET', '/api/memory/search?q=abc&type=tech');
    expect(memSvc.searchTech).toHaveBeenCalledOnce();
  });

  it('無效 type 回傳 400', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/search?q=abc&type=invalid');
    expect(status).toBe(400);
  });
});

describe('GET /api/memory/browse', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
    (memSvc.browseContext as Mock).mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    (memSvc.browseTech as Mock).mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('預設 type=context 回傳 200', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/browse');
    expect(status).toBe(200);
    expect(memSvc.browseContext).toHaveBeenCalledOnce();
  });

  it('type=tech 呼叫 browseTech', async () => {
    await doRequest(app, 'GET', '/api/memory/browse?type=tech');
    expect(memSvc.browseTech).toHaveBeenCalledOnce();
  });

  it('無效 type 回傳 400', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/browse?type=bad');
    expect(status).toBe(400);
  });
});

describe('GET /api/memory/:type/:id', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('id 存在時回傳 200', async () => {
    (memSvc.getContextById as Mock).mockReturnValue({ id: 1, title: '測試', content: '內容' });
    const { status } = await doRequest(app, 'GET', '/api/memory/context/1');
    expect(status).toBe(200);
  });

  it('id 不存在時回傳 404', async () => {
    (memSvc.getContextById as Mock).mockReturnValue(null);
    const { status } = await doRequest(app, 'GET', '/api/memory/context/99999');
    expect(status).toBe(404);
  });

  it('無效 type 回傳 400', async () => {
    const { status } = await doRequest(app, 'GET', '/api/memory/invalid/1');
    expect(status).toBe(400);
  });
});

describe('POST /api/memory/:type', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
    (memSvc.createContext as Mock).mockReturnValue({ success: true, id: 42 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('有效資料回傳 201', async () => {
    const { status, body } = await doRequest(app, 'POST', '/api/memory/context', {
      title: '新記錄',
      content: '內容',
    });
    expect(status).toBe(201);
    const b = body as Record<string, unknown>;
    expect(b.success).toBe(true);
    expect(b.id).toBe(42);
  });

  it('缺少 title 回傳 400', async () => {
    const { status } = await doRequest(app, 'POST', '/api/memory/context', {
      content: '內容',
    });
    expect(status).toBe(400);
  });

  it('title 超過 200 字元回傳 400', async () => {
    const { status } = await doRequest(app, 'POST', '/api/memory/context', {
      title: 'a'.repeat(201),
      content: '內容',
    });
    expect(status).toBe(400);
  });

  it('缺少 content 回傳 400', async () => {
    const { status } = await doRequest(app, 'POST', '/api/memory/context', {
      title: '標題',
    });
    expect(status).toBe(400);
  });
});

describe('DELETE /api/memory/:type/:id', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/memory', memoryRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('刪除成功回傳 { success: true }', async () => {
    (memSvc.deleteContext as Mock).mockReturnValue({ success: true });
    const { status, body } = await doRequest(app, 'DELETE', '/api/memory/context/1');
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).success).toBe(true);
  });

  it('無效 id 回傳 400', async () => {
    const { status } = await doRequest(app, 'DELETE', '/api/memory/context/abc');
    expect(status).toBe(400);
  });
});
