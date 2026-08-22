// ============================================================
// workers-route.test.ts — /api/workers 路由層測試（whp-9-devconsole-api）
// 掛載形態 route ordering + body 驗證分流(400/409/503) + spawn 守衛。
// vi.mock service + scriptRunnerService 層（route 層不測 DB 邏輯）。
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../services/workerRunService.js', () => ({
  getLiveBoard: vi.fn(),
  listWorkerRuns: vi.fn(),
  getWorkerRunDetail: vi.fn(),
  ackWorkerRun: vi.fn(),
  addWorkerMessage: vi.fn(),
  gateWorkerRun: vi.fn(),
  checkClosePreconditions: vi.fn(),
  ackAttention: vi.fn(),
  isDbReady: vi.fn(),
}));

vi.mock('../services/scriptRunnerService.js', () => ({
  isRunning: vi.fn(),
  runScriptWithArgs: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: { dbPath: '', port: 3001, allowedOrigin: 'http://localhost:5174', projectRoot: '' },
}));

import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { buildTestApp } from './test-app.js';
import workersRouter from '../routes/workers.js';
import { config } from '../config.js';
import * as workerSvc from '../services/workerRunService.js';
import * as scriptSvc from '../services/scriptRunnerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

function ensureCloseScriptDir(tmpDir: string): string {
  const dir = path.join(tmpDir, '.claude', 'skills', 'party-to-pipeline', 'scripts');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'close-worker.ps1');
}

describe('/api/workers routes', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-workers-route-'));
    (config as { projectRoot: string }).projectRoot = tmpDir;
    vi.clearAllMocks();
    // 預設 DB 可用；fail-open 案例各自覆寫（CR R1 F11）
    (workerSvc.isDbReady as Mock).mockReturnValue(true);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── AC1：route 順序（🔴 必掛載形態，隔離測試會誤綠）─────────────

  describe('route ordering (AC1 — mounted form required)', () => {
    it('GET /api/workers/live 回 200 且 body 含 guardian+kpi，不被 /:runId 捕獲', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.getLiveBoard as Mock).mockReturnValue({ guardian: { present: false }, kpi: {}, running: [], queues: {} });

      const res = await request(app).get('/api/workers/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('guardian');
      expect(res.body).toHaveProperty('kpi');
      expect(workerSvc.getWorkerRunDetail).not.toHaveBeenCalled();
    });

    it('POST /api/workers/reap 不被 /:runId 捕獲', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      const emptyReport = JSON.stringify({ scanned: 0, alive: 0, reaped: 0 });
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({
        exitCode: 0, output: emptyReport, stdout: emptyReport, startedAt: '', completedAt: '', durationMs: 1,
      });

      const res = await request(app).post('/api/workers/reap').send({});

      expect(res.status).toBe(200);
      expect(workerSvc.gateWorkerRun).not.toHaveBeenCalled();
    });

    it('server/routes/workers.ts 恰有 9 個 router.get/post 呼叫（whp-10 新增第 9 支 attention/ack）', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../routes/workers.ts'), 'utf-8');
      const matches = source.match(/router\.(get|post)\(/g) ?? [];
      expect(matches.length).toBe(9);
    });
  });

  // ── GET /（分頁 B）+ GET /:runId ───────────────────────────

  describe('GET / 與 GET /:runId', () => {
    it('GET /api/workers 呼叫 listWorkerRuns 並轉發查詢參數', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.listWorkerRuns as Mock).mockReturnValue({ items: [], total: 0, page: 1 });

      const res = await request(app).get('/api/workers?lifecycle=closed&track=backend-track&page=1&pageSize=999');

      expect(res.status).toBe(200);
      expect(workerSvc.listWorkerRuns).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'closed', track: 'backend-track', page: 1, pageSize: 999 }),
      );
    });

    it('GET /api/workers/:runId 未知 runId → 404', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.getWorkerRunDetail as Mock).mockReturnValue(null);

      const res = await request(app).get(`/api/workers/${VALID_UUID}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/workers/:runId 存在 → 200 回 {run,messages,handoff}', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.getWorkerRunDetail as Mock).mockReturnValue({ run: { run_id: VALID_UUID }, messages: [], handoff: null });

      const res = await request(app).get(`/api/workers/${VALID_UUID}`);

      expect(res.status).toBe(200);
      expect(res.body.handoff).toBeNull();
    });
  });

  // ── ack / messages / gate — service ServiceResult → HTTP status 轉發 ──

  describe('POST /:runId/ack', () => {
    it('service 回 409 conflict → route 轉 409', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackWorkerRun as Mock).mockReturnValue({ ok: false, status: 409, body: { error: '此 run 目前為 running，尚未回報，無法簽收。' } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/ack`).send({});

      expect(res.status).toBe(409);
    });

    it('service 回成功 → route 200', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackWorkerRun as Mock).mockReturnValue({ ok: true, data: { run_id: VALID_UUID, lifecycle: 'awaiting-review' } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/ack`).send({ ackBy: 'CC-OPUS' });

      expect(res.status).toBe(200);
      expect(workerSvc.ackWorkerRun).toHaveBeenCalledWith(VALID_UUID, 'CC-OPUS');
    });
  });

  describe('POST /:runId/messages（G4：缺 mode → 400）', () => {
    it('service 回 400（缺 mode）→ route 轉 400', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.addWorkerMessage as Mock).mockReturnValue({ ok: false, status: 400, body: { error: 'mode 為必填字串' } });

      const res = await request(app)
        .post(`/api/workers/${VALID_UUID}/messages`)
        .send({ direction: 'controller-to-worker', msgType: 'wake', body: 'x', author: 'CC-OPUS' });

      expect(res.status).toBe(400);
    });

    it('service 回成功 → route 201', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.addWorkerMessage as Mock).mockReturnValue({ ok: true, data: { message: { seq: 1 }, supersededCount: 0 } });

      const res = await request(app)
        .post(`/api/workers/${VALID_UUID}/messages`)
        .send({ direction: 'controller-to-worker', msgType: 'wake', body: 'x', author: 'CC-OPUS', mode: 'append' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /:runId/gate', () => {
    it('service 回 409（未簽收）→ route 轉 409，且 scriptRunner 零呼叫', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.gateWorkerRun as Mock).mockReturnValue({ ok: false, status: 409, body: { error: '未簽收不得裁決' } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/gate`).send({ verdict: 'approved', gateBy: 'CC-OPUS' });

      expect(res.status).toBe(409);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('approve 成功 → 200，scriptRunner 仍零呼叫（核可不關窗）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.gateWorkerRun as Mock).mockReturnValue({
        ok: true, data: { run: { lifecycle: 'approved' }, handoff: { gate_result: 'approved' }, hint: '關窗請走 POST /close' },
      });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/gate`).send({ verdict: 'approved', gateBy: 'CC-OPUS' });

      expect(res.status).toBe(200);
      expect(res.body.hint).toBeTruthy();
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });
  });

  // ── AC15/BR-049：POST /:runId/attention/ack（第 9 支）──────────

  describe('POST /:runId/attention/ack', () => {
    it('runId 非 UUID → 400，service 零呼叫', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);

      const res = await request(app).post('/api/workers/not-a-uuid/attention/ack').send({});

      expect(res.status).toBe(400);
      expect(workerSvc.ackAttention).not.toHaveBeenCalled();
    });

    it('service 回成功 → route 200', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackAttention as Mock).mockReturnValue({ ok: true, data: { run_id: VALID_UUID, requires_attention: 0 } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/attention/ack`).send({});

      expect(res.status).toBe(200);
      expect(workerSvc.ackAttention).toHaveBeenCalledWith(VALID_UUID, undefined);
    });

    it('service 回 409（CAS 命中 0 列）→ route 轉 409 附 currentValue', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackAttention as Mock).mockReturnValue({ ok: false, status: 409, body: { error: '此 run 目前無需注意旗標', currentValue: 0 } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/attention/ack`).send({});

      expect(res.status).toBe(409);
      expect(res.body.currentValue).toBe(0);
    });

    it('service 回 404（未知 runId）→ route 轉 404', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackAttention as Mock).mockReturnValue({ ok: false, status: 404, body: { error: `run_id "${VALID_UUID}" 不存在` } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/attention/ack`).send({});

      expect(res.status).toBe(404);
    });

    it('service 回 503（DB 不可用）→ route 轉 503 附 dbUnavailable', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackAttention as Mock).mockReturnValue({ ok: false, status: 503, body: { error: 'DB 未連線，無法清除需注意旗標', dbUnavailable: true } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/attention/ack`).send({});

      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
    });
  });

  // ── AC11/AC12：POST /:runId/close ──────────────────────────

  describe('POST /:runId/close', () => {
    it('AC12: runId 含注入字元 → 400，且未曾成為 spawn 引數（零呼叫）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);

      const res = await request(app).post('/api/workers/a; whoami/close').send({});

      expect(res.status).toBe(400);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
      expect(workerSvc.checkClosePreconditions).not.toHaveBeenCalled();
    });

    it('四前置任一不符 → 409 具名，scriptRunner 零呼叫', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.checkClosePreconditions as Mock).mockReturnValue({ ok: false, run: { run_id: VALID_UUID }, failedChecks: ['lifecycle-not-approved'] });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).send({});

      expect(res.status).toBe(409);
      expect(res.body.failedChecks).toContain('lifecycle-not-approved');
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('AC11: close-worker.ps1 不存在 → 503 具名 whp-6，零 spawn', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.checkClosePreconditions as Mock).mockReturnValue({ ok: true, run: { run_id: VALID_UUID }, failedChecks: [] });
      // tmpDir 下未建立 close-worker.ps1 → fs.existsSync 天然為 false

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).send({});

      expect(res.status).toBe(503);
      expect(res.body.missingScript).toBe('close-worker.ps1');
      expect(res.body.blockedBy).toBe('whp-6-directive-delivery-and-close');
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('腳本存在 + 四前置通過 → 委派並回 200', async () => {
      const scriptPath = ensureCloseScriptDir(tmpDir);
      fs.writeFileSync(scriptPath, '# stub');
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.checkClosePreconditions as Mock).mockReturnValue({ ok: true, run: { run_id: VALID_UUID }, failedChecks: [] });
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({ exitCode: 0, output: 'ok', stdout: 'ok', startedAt: '', completedAt: '', durationMs: 1 });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).send({});

      expect(res.status).toBe(200);
      expect(scriptSvc.runScriptWithArgs).toHaveBeenCalledWith(`close-${VALID_UUID}`, 'powershell', scriptPath, ['-RunId', VALID_UUID]);
    });

    it('同一 run 關窗腳本執行中時再次呼叫 → 409', async () => {
      const scriptPath = ensureCloseScriptDir(tmpDir);
      fs.writeFileSync(scriptPath, '# stub');
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.checkClosePreconditions as Mock).mockReturnValue({ ok: true, run: { run_id: VALID_UUID }, failedChecks: [] });
      (scriptSvc.isRunning as Mock).mockReturnValue(true);

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).send({});

      expect(res.status).toBe(409);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });
  });

  // ── AC13：POST /reap ────────────────────────────────────────

  describe('POST /reap', () => {
    it('spawn 第一引數為 node（非 powershell），原樣回傳 9 鍵 report', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      const report = {
        scanned: 12, alive: 9, reaped: 2, skipped_inline: 1, skipped_cas_lost: 0,
        skipped_terminal: 0, probe_unavailable: false, dry_run: false, runs: [],
      };
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({
        exitCode: 0, output: JSON.stringify(report), stdout: JSON.stringify(report), startedAt: '', completedAt: '', durationMs: 1,
      });

      const res = await request(app).post('/api/workers/reap').send({ dryRun: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
      const callArgs = (scriptSvc.runScriptWithArgs as Mock).mock.calls[0];
      expect(callArgs[1]).toBe('node');
    });

    it('AC12: dryRun 帶惡意字串 → argv 不含該值（布林化後只附常數 --dry-run）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({ exitCode: 0, output: '{}', stdout: '{}', startedAt: '', completedAt: '', durationMs: 1 });

      await request(app).post('/api/workers/reap').send({ dryRun: '--evil' });

      const callArgs = (scriptSvc.runScriptWithArgs as Mock).mock.calls[0];
      const args: string[] = callArgs[3];
      expect(args).not.toContain('--evil');
      expect(args).toContain('--json');
      expect(args).not.toContain('--dry-run'); // dryRun:'--evil' !== true → 布林化為 false
    });

    it('連按 10 次只會有 1 個行程（isRunning 並行守衛）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(true);

      const responses = await Promise.all(Array.from({ length: 10 }, () => request(app).post('/api/workers/reap').send({})));

      for (const res of responses) expect(res.status).toBe(409);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('腳本 exit code 非 0 → 500 附輸出，不得假裝成功', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({ exitCode: 1, output: 'stderr: DB open failed', stdout: '', startedAt: '', completedAt: '', durationMs: 1 });

      const res = await request(app).post('/api/workers/reap').send({});

      expect(res.status).toBe(500);
      expect(res.body.output).toContain('DB open failed');
    });

    // ── CR R1 F4：stderr 污染不得把成功的對帳誤判成失敗 ────────────
    it('CR-F4: exit 0 且 stdout 為合法 JSON 時，stderr 有 Node warning 仍原樣回傳 report', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      const report = { scanned: 3, alive: 3, reaped: 0, skipped_inline: 0, skipped_cas_lost: 0, skipped_terminal: 0, probe_unavailable: false, dry_run: true, runs: [] };
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({
        exitCode: 0,
        // output = stdout + stderr 合流（含 Node warning）；stdout = 純 JSON
        output: '(node:1234) ExperimentalWarning: x\n' + JSON.stringify(report),
        stdout: JSON.stringify(report),
        startedAt: '', completedAt: '', durationMs: 1,
      });

      const res = await request(app).post('/api/workers/reap').send({ dryRun: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(report);
    });

    it('CR-F4: stdout 非合法 JSON → 500 且錯誤具名為 parse 失敗（非 spawn 失敗）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);
      (scriptSvc.runScriptWithArgs as Mock).mockResolvedValue({
        exitCode: 0, output: 'not json', stdout: 'not json', startedAt: '', completedAt: '', durationMs: 1,
      });

      const res = await request(app).post('/api/workers/reap').send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('非合法 JSON');
      expect(res.body).toHaveProperty('parseError');
    });
  });

  // ── CR R1 F7：spawn 類端點的 CSRF 前置（只收 application/json）──────
  describe('spawn 端點 Content-Type 守衛（CR-F7）', () => {
    it('POST /reap 帶 text/plain（跨站 simple request 形態）→ 415，零 spawn', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (scriptSvc.isRunning as Mock).mockReturnValue(false);

      const res = await request(app).post('/api/workers/reap').set('Content-Type', 'text/plain').send('hello');

      expect(res.status).toBe(415);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('POST /:runId/close 帶 text/plain → 415，不因 req.body undefined 解構而 500', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).set('Content-Type', 'text/plain').send('hello');

      expect(res.status).toBe(415);
      expect(workerSvc.checkClosePreconditions).not.toHaveBeenCalled();
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });
  });

  // ── CR R1 F11：DB 不可用與查無此列必須分開回報（AC15 fail-open）──────
  describe('fail-open 狀態碼區分（CR-F2 / CR-F11）', () => {
    it('GET /:runId 在 DB 不可用時回 503（非 404「不存在」）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.getWorkerRunDetail as Mock).mockReturnValue(null);
      (workerSvc.isDbReady as Mock).mockReturnValue(false);

      const res = await request(app).get(`/api/workers/${VALID_UUID}`);

      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
    });

    it('GET /:runId 在 DB 正常但查無此列時仍回 404', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.getWorkerRunDetail as Mock).mockReturnValue(null);
      (workerSvc.isDbReady as Mock).mockReturnValue(true);

      const res = await request(app).get(`/api/workers/${VALID_UUID}`);

      expect(res.status).toBe(404);
    });

    it('POST /:runId/close 在 DB 不可用時回 503（非 404），零 spawn', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.checkClosePreconditions as Mock).mockReturnValue({ ok: false, failedChecks: ['db-unavailable'] });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/close`).send({});

      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
      expect(scriptSvc.runScriptWithArgs).not.toHaveBeenCalled();
    });

    it('寫入類 service 回 503 時 route 原樣轉 503（AC15 寫入類 fail-open）', async () => {
      const app = buildTestApp([['/api/workers', workersRouter]]);
      (workerSvc.ackWorkerRun as Mock).mockReturnValue({ ok: false, status: 503, body: { error: 'DB 未連線，無法簽收', dbUnavailable: true } });

      const res = await request(app).post(`/api/workers/${VALID_UUID}/ack`).send({});

      expect(res.status).toBe(503);
      expect(res.body.dbUnavailable).toBe(true);
    });
  });
});
