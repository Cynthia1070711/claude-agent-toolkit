// ============================================================
// emergence-route.test.ts — Emergence API 路由測試
// Story: ecc-emergence-ui-core Task 6.4
// AC7: GET /pipeline + GET /instincts + PUT /instincts/:id/note 三端點 200/503
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined }),
}));

import express, { type Application } from 'express';
import { createServer, type Server } from 'http';
import { spawnSync } from 'child_process';
import emergenceRouter from '../routes/emergence.js';
import * as dbModule from '../db.js';

// ── Lightweight HTTP helper(沿用 rule-violations-route.test.ts pattern)──
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
      const postData = body ? JSON.stringify(body) : undefined;
      const options = {
        hostname: '127.0.0.1',
        port: addr.port,
        path: url,
        method: method.toUpperCase(),
        headers: postData
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          : {},
      };
      const { request } = require('http');
      const req = request(options, (res: NodeJS.ReadableStream & { statusCode: number }) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', (err: Error) => { server.close(); reject(err); });
      if (postData) req.write(postData);
      req.end();
    });
  });
}

function makeApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api/emergence', emergenceRouter);
  return app;
}

// ── Mock DB 回傳資料 ──────────────────────────────────────────
const mockInstinct = {
  id: 'inst_test_001',
  trigger: 'test_trigger',
  action: 'test_action',
  confidence: 0.85,
  verifier_status: 'approved',
  verifier_reason: 'Test reason',
  adoption_score: 3,
  domain: 'testing',
  scope: 'global',
  evidence_jsonb: JSON.stringify([{ session: 's1', observation: 'test' }]),
  source: 'auto',
  source_session_id: 'sess_001',
  created_at: '2026-05-28T00:00:00+08:00',
  last_seen: '2026-05-28T10:00:00+08:00',
  decay_at: null,
  project_type: null,
  business: null,
  description_zh: '用途：測試本能。改善內容：測試用。使用場景：測試時觸發。',
  user_note: null,
};

// ── GET /api/emergence/pipeline ───────────────────────────────
describe('GET /api/emergence/pipeline', () => {
  beforeEach(() => {
    // Mock 對齊 route 真實 SQL alias `AS n`(CR F5 修復:原 mock 用 .total/.cnt/.processed_count 與 route 讀取的 .n 不符,
    // 導致 route 算出 undefined/NaN 卻因測試僅斷言 toHaveProperty 而假性通過)
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (sql: string) => ({
        get: () => {
          if (sql.includes('observations_queue') && sql.includes('processed')) return { n: 529 };
          if (sql.includes('observations_queue')) return { n: 875 };
          if (sql.includes('instincts_rejected')) return { n: 0 };
          return { n: 0 };
        },
        all: () => {
          if (sql.includes('verifier_status')) {
            return [
              { verifier_status: 'approved', n: 12 },
              { verifier_status: 'needs-more-evidence', n: 2 },
            ];
          }
          return [];
        },
      }),
    });
  });

  it('DB 連線時回傳 200 + 漏斗各階數值正確', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/pipeline');
    expect(result.status).toBe(200);
    const body = result.body as {
      observations: { total: number; processed: number; processedPct: number };
      instincts: { total: number; approved: number; needsEvidence: number; rejected: number };
      rejected: { total: number };
      conversionRate: { obsToInstinct: number; approvedPct: number };
    };
    // 階 1+2:observations(processedPct = processed/total)
    expect(body.observations.total).toBe(875);
    expect(body.observations.processed).toBe(529);
    expect(body.observations.processedPct).toBeCloseTo(529 / 875, 4);
    // 階 3:instincts(total = 各 verifier_status 分組加總)
    expect(body.instincts.total).toBe(14);
    expect(body.instincts.approved).toBe(12);
    expect(body.instincts.needsEvidence).toBe(2);
    // 階 4:rejected
    expect(body.rejected.total).toBe(0);
    // 轉化率
    expect(body.conversionRate.obsToInstinct).toBeCloseTo(14 / 875, 4);
    expect(body.conversionRate.approvedPct).toBeCloseTo(12 / 14, 4);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/pipeline');
    expect(result.status).toBe(503);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('error');
  });
});

// ── GET /api/emergence/instincts ──────────────────────────────
describe('GET /api/emergence/instincts', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        all: () => [mockInstinct],
      }),
    });
  });

  it('DB 連線時回傳 200 + instinct 陣列含 machine_star(AC2 SSoT)', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/instincts');
    expect(result.status).toBe(200);
    const body = result.body as unknown[];
    expect(Array.isArray(body)).toBe(true);
    const first = body[0] as Record<string, unknown>;
    expect(first).toHaveProperty('machine_star');
    // confidence=0.85 → machine_star=9 (round(8.5)→9 in JS rounds to 9)
    expect(first.machine_star).toBe(9);
    // AC2: star_source 已移除(不再由 API 回傳 user/machine 區分)
    expect(first).not.toHaveProperty('star_source');
  });

  it('AC2: user_star_rating 不影響 API 回傳(star_source 已移除)', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        all: () => [{ ...mockInstinct, user_star_rating: 7 }],
      }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/instincts');
    const body = result.body as unknown[];
    const first = body[0] as Record<string, unknown>;
    // AC2: star_source 已移除，只有 machine_star
    expect(first).not.toHaveProperty('star_source');
    expect(first.machine_star).toBe(9);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/instincts');
    expect(result.status).toBe(503);
  });
});

// ── PUT /api/emergence/instincts/:id/note ─────────────────────
describe('PUT /api/emergence/instincts/:id/note', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        // SELECT ... WHERE id = ? → return existing row
        get: () => ({ id: 'inst_test_001' }),
        run: () => ({ changes: 1 }),
      }),
    });
  });

  it('DB 連線時寫入 note 回傳 200 ok:true', async () => {
    const app = makeApp();
    const result = await doRequest(
      app,
      'PUT',
      '/api/emergence/instincts/inst_test_001/note',
      { user_note: '這條我常用' },
    );
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(
      app,
      'PUT',
      '/api/emergence/instincts/inst_test_001/note',
      { user_note: '測試' },
    );
    expect(result.status).toBe(503);
  });
});

// ── PUT /api/emergence/instincts/:id/like (AC2) ───────────────
describe('PUT /api/emergence/instincts/:id/like', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 'inst_test_001' }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 'inst_test_001', new_confidence: 0.9 }),
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
  });

  it('讚成功回傳 200 + new_confidence', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/like');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('new_confidence');
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/like');
    expect(result.status).toBe(503);
  });
});

// ── POST /api/emergence/instincts/:id/reject (AC3) ────────────
describe('POST /api/emergence/instincts/:id/reject', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 'inst_test_001' }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 'inst_test_001', norm_key: 'test_trigger|test_action' }),
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
  });

  it('否決成功回傳 200 + ok:true + norm_key', async () => {
    const app = makeApp();
    const result = await doRequest(
      app,
      'POST',
      '/api/emergence/instincts/inst_test_001/reject',
      { reason: '與既有 hook 重複' },
    );
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('norm_key');
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(
      app,
      'POST',
      '/api/emergence/instincts/inst_test_001/reject',
      { reason: '測試' },
    );
    expect(result.status).toBe(503);
  });

  // CR F3 回歸:reason 空字串 → 400(reject_reason schema NOT NULL + AC3「填理由」defense-in-depth)
  it('reason 為空時回傳 400', async () => {
    const app = makeApp();
    const result = await doRequest(
      app,
      'POST',
      '/api/emergence/instincts/inst_test_001/reject',
      { reason: '   ' },
    );
    expect(result.status).toBe(400);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('error');
  });
});

// ── GET /api/emergence/layer12 (AC5) ─────────────────────────
describe('GET /api/emergence/layer12', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        all: () => [
          { trigger: 'edit layout file', action: '提醒 100 行 SOP', adoption_score: 4, confidence: 0.85 },
        ],
      }),
    });
  });

  it('DB 連線時回傳 200 + 正確格式(cap/used/pct/injected)', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/layer12');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('cap', 450);
    expect(body).toHaveProperty('used');
    expect(body).toHaveProperty('pct');
    expect(body).toHaveProperty('injected');
    expect(body).toHaveProperty('projectType');
    const used = body.used as number;
    expect(used).toBeLessThanOrEqual(450);
  });

  // CR F1 回歸:零列時 used/pct 必為 0。hook 側 `pre-prompt-rag.js` 的
  // `if (!rows.length) return ''` 是整層不注入(連 header 都不輸出),端點若仍無條件從
  // INSTINCT_HEADER.length 起算,儀表板會在「無 instinct」狀態回報 94/450 已用,而下方
  // 列表同時顯示「目前無符合條件的 instinct 注入」—— 觀測工具自相矛盾。修前為 RED。
  it('無符合條件的 instinct 時 used/pct 為 0(與 hook 側零列語意一致)', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({ all: () => [] }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/layer12');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.injected).toEqual([]);
    expect(body.used).toBe(0);
    expect(body.pct).toBe(0);
  });

  it('projectType 參數傳遞正確', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/layer12?projectType=env-tooling');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.projectType).toBe('env-tooling');
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/layer12');
    expect(result.status).toBe(503);
  });
});

// ── GET /api/emergence/evolve-candidates (Story C AC6) ─────────
const mockEvolveCandidatesOutput = {
  candidates: [
    {
      type: 'skill',
      domain: 'skill',
      business: 'ai-agent-infra',
      project_type: 'env-tooling',
      member_ids: ['inst_1', 'inst_2'],
      members: [
        { id: 'inst_1', trigger: 'T1', action: 'A1', confidence: 0.8, adoption_score: 3, rejected_count: 0 },
        { id: 'inst_2', trigger: 'T2', action: 'A2', confidence: 0.8, adoption_score: 3, rejected_count: 0 },
      ],
      avg_confidence: 0.8,
      avg_adoption_score: 3,
      rejected_total: 0,
      suggested_action: 'Skill(saas-to-skill) Mode A',
    },
  ],
  total: 1,
  skillCapStatus: { phycoolCount: 50, phycoolCap: 100, generalCount: 47, generalCap: 60, totalCount: 97, totalCap: 160 },
  generatedAt: '2026-05-28T12:00:00+08:00',
};

describe('GET /api/emergence/evolve-candidates (Story C AC6)', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: () => ({ all: () => [] }),
    });
  });

  it('DB 連線 + spawnSync 成功時回傳 200 + candidates 結構', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify(mockEvolveCandidatesOutput),
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/evolve-candidates');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('candidates');
    expect(body).toHaveProperty('total', 1);
    expect(body).toHaveProperty('skillCapStatus');
    // skillCapStatus 結構完整
    const cap = body.skillCapStatus as Record<string, unknown>;
    expect(cap).toHaveProperty('phycoolCap', 100);
    expect(cap).toHaveProperty('generalCap', 60);
    expect(cap).toHaveProperty('totalCap', 160);
  });

  it('DB 連線 + spawnSync 成功 + 0 候選時回傳 200 + empty candidates', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ candidates: [], total: 0, skillCapStatus: mockEvolveCandidatesOutput.skillCapStatus, generatedAt: '2026-05-28T12:00:00+08:00' }),
      stderr: '',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/evolve-candidates');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 0);
    expect(Array.isArray(body.candidates)).toBe(true);
    expect((body.candidates as unknown[]).length).toBe(0);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/evolve-candidates');
    expect(result.status).toBe(503);
    const body = result.body as Record<string, unknown>;
    expect(body).toHaveProperty('error');
  });

  it('spawnSync 失敗時回傳 500', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'SyntaxError: unexpected token',
      error: undefined,
      pid: 0,
      output: [],
      signal: null,
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/evolve-candidates');
    expect(result.status).toBe(500);
  });
});

// ── GET /instincts — rejected_count 欄位(AC4) ──────────────────
describe('GET /api/emergence/instincts — rejected_count(AC4)', () => {
  it('命中 norm_key 時 rejected_count > 0', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (sql: string) => ({
        all: () => {
          if (sql.includes('instincts_rejected')) {
            return [{ norm_key: 'test_trigger|test_action', reject_count: 2 }];
          }
          return [{ ...mockInstinct }];
        },
      }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/instincts');
    expect(result.status).toBe(200);
    const body = result.body as unknown[];
    const first = body[0] as Record<string, unknown>;
    expect(first).toHaveProperty('rejected_count');
  });
});

// ── PUT /api/emergence/instincts/:id/dislike (ecc-emergence-ui-v2 AC4) ───
describe('PUT /api/emergence/instincts/:id/dislike (AC4)', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 'inst_test_001' }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 'inst_test_001', new_confidence: 0.7 }),
      stderr: '', error: undefined, pid: 0, output: [], signal: null,
    });
  });

  it('扣分成功回傳 200 + confidence 映射(F1b 範式)', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/dislike');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.confidence).toBe(0.7);
  });

  it('instinct 不存在時回傳 404', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({ get: () => undefined }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_missing/dislike');
    expect(result.status).toBe(404);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/dislike');
    expect(result.status).toBe(503);
  });
});

// ── PUT /api/emergence/instincts/:id/restore (ecc-emergence-ui-v2 AC5) ────
describe('PUT /api/emergence/instincts/:id/restore (AC5)', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 'inst_test_001' }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 'inst_test_001', norm_key: 'test|action', restored_at: '2026-05-28T15:00:00+08:00' }),
      stderr: '', error: undefined, pid: 0, output: [], signal: null,
    });
  });

  it('還原成功回傳 200 + ok:true', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/restore');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it('spawnSync 失敗時回傳 500', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1, stdout: '', stderr: 'restore failed', error: undefined,
      pid: 0, output: [], signal: null,
    });
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/restore');
    expect(result.status).toBe(500);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/instincts/inst_test_001/restore');
    expect(result.status).toBe(503);
  });
});

// ── GET /api/emergence/generated-skills (AC6) ────────────────────────────
describe('GET /api/emergence/generated-skills (AC6)', () => {
  it('回傳 200 + skills 陣列(含 LEFT JOIN effect_metrics 欄位)', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        all: () => [{
          id: 1, instinct_cluster_id: 'inst_x', skill_path: '.claude/skills/test-skill',
          status: 'active', generated_at: '2026-05-28T10:00:00+08:00',
          paused_at: null, deleted_at: null,
          improvement_pct: 75, before_freq: 10, after_freq: 2,
        }],
      }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/generated-skills');
    expect(result.status).toBe(200);
    const body = result.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('skill_path');
    expect(body[0]).toHaveProperty('improvement_pct', 75);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/generated-skills');
    expect(result.status).toBe(503);
  });
});

// ── PUT /api/emergence/generated-skills/:id/pause (AC6) ──────────────────
describe('PUT /api/emergence/generated-skills/:id/pause (AC6)', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 1 }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 1, status: 'paused' }),
      stderr: '', error: undefined, pid: 0, output: [], signal: null,
    });
  });

  it('停用成功回傳 200 + status:paused', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/generated-skills/1/pause');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('paused');
  });

  it('skill 不存在時回傳 404', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({ get: () => undefined }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'PUT', '/api/emergence/generated-skills/999/pause');
    expect(result.status).toBe(404);
  });
});

// ── DELETE /api/emergence/generated-skills/:id (AC6) ─────────────────────
describe('DELETE /api/emergence/generated-skills/:id (AC6)', () => {
  beforeEach(() => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        get: () => ({ id: 1, instinct_cluster_id: 'inst_x' }),
        run: () => ({ changes: 1 }),
      }),
    });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ ok: true, id: 1, status: 'deleted' }),
      stderr: '', error: undefined, pid: 0, output: [], signal: null,
    });
  });

  it('刪除成功回傳 200 + status:deleted', async () => {
    const app = makeApp();
    const result = await doRequest(app, 'DELETE', '/api/emergence/generated-skills/1');
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('deleted');
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'DELETE', '/api/emergence/generated-skills/1');
    expect(result.status).toBe(503);
  });
});

// ── GET /api/emergence/rejected (AC5) ────────────────────────────────────
describe('GET /api/emergence/rejected (AC5)', () => {
  it('回傳 200 + rejected 陣列(LEFT JOIN instincts 含 confidence/machine_star)', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      prepare: (_sql: string) => ({
        all: () => [{
          id: 1, trigger: 'T', action: 'A', reject_reason: '與既有 hook 重複',
          reject_count: 2, rejected_at: '2026-05-28T10:00:00+08:00',
          restored_at: null, norm_key: 't|a',
          confidence: 0.4, machine_star: 4, adoption_score: 1,
        }],
      }),
    });
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/rejected');
    expect(result.status).toBe(200);
    const body = result.body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('reject_count', 2);
    expect(body[0]).toHaveProperty('machine_star', 4);
  });

  it('DB 未連線時回傳 503', async () => {
    (dbModule.getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const app = makeApp();
    const result = await doRequest(app, 'GET', '/api/emergence/rejected');
    expect(result.status).toBe(503);
  });
});
