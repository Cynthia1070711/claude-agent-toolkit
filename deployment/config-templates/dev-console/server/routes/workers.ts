// ============================================================
// workers.ts — /api/workers 9 支 endpoint（whp-9 開 8 支；第 9 支 /:runId/attention/ack
// 由 whp-10-devconsole-ui 承接 TD-WHP9-ATTENTION-QUEUE-UNBOUNDED 新增）
// 🔴 route 註冊順序：/live、/reap（literal path）必須先於 /:runId（parameterized）
// 註冊，否則 Express first-match 會把 'live'/'reap' 解析成 runId（F4，AC1）。
// ============================================================
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { isRunning, runScriptWithArgs } from '../services/scriptRunnerService.js';
import {
  getLiveBoard,
  listWorkerRuns,
  getWorkerRunDetail,
  ackWorkerRun,
  addWorkerMessage,
  gateWorkerRun,
  checkClosePreconditions,
  ackAttention,
  isDbReady,
  type ServiceResult,
} from '../services/workerRunService.js';

const router = Router();

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * spawn 類 endpoint 的 CSRF 前置：只接受 application/json。
 * 跨站 `Content-Type: text/plain` 的 POST 屬 CORS「simple request」不觸發 preflight，
 * 瀏覽器仍會把請求送達本機 —— CORS 只擋「讀回應」不擋「送出」。若不擋，任何被瀏覽的
 * 網頁都能觸發 /reap（非 dry-run 會寫 lifecycle='abandoned'）與 /close 的外部行程 spawn。
 */
function requireJsonBody(req: Request, res: Response): boolean {
  if (!req.is('application/json')) {
    res.status(415).json({ error: '此端點僅接受 Content-Type: application/json' });
    return false;
  }
  return true;
}

function sendResult<T>(res: Response, result: ServiceResult<T>, successStatus = 200): void {
  if (result.ok) {
    res.status(successStatus).json(result.data);
    return;
  }
  res.status(result.status).json(result.body);
}

// ── GET /live（分頁 A：守護 + KPI + 執行中 + 四段佇列）────────────

router.get('/live', (_req: Request, res: Response) => {
  try {
    res.json(getLiveBoard());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /reap（手動觸發對帳，委派 Node 腳本）─────────────────────

router.post('/reap', async (req: Request, res: Response) => {
  if (!requireJsonBody(req, res)) return;
  if (isRunning('reap')) {
    res.status(409).json({ error: '對帳腳本正在執行中，請等待完成後再試' });
    return;
  }

  const dryRun = (req.body as { dryRun?: unknown } | undefined)?.dryRun === true;
  const scriptPath = path.resolve(config.projectRoot, '.context-db', 'scripts', 'reap-worker-runs.js');
  const args = ['--json', ...(dryRun ? ['--dry-run'] : [])];

  try {
    const result = await runScriptWithArgs('reap', 'node', scriptPath, args);
    if (result.exitCode !== 0) {
      res.status(500).json({ error: '對帳腳本執行失敗', exitCode: result.exitCode, output: result.output });
      return;
    }
    // AC13：原樣回傳腳本 report。只解析 stdout —— 合流後的 output 會被任何一個
    // stderr 位元組（Node warning 等）污染，令成功的對帳被誤報成 spawn 失敗。
    let report: unknown;
    try {
      report = JSON.parse(result.stdout);
    } catch (parseErr) {
      console.error('[workers] /reap report parse failed:', (parseErr as Error).message);
      res.status(500).json({
        error: '對帳腳本輸出非合法 JSON，無法解析 report',
        parseError: (parseErr as Error).message,
        stdout: result.stdout,
        output: result.output,
      });
      return;
    }
    res.json(report);
  } catch (err) {
    console.error('[workers] /reap spawn failed:', (err as Error).message);
    res.status(500).json({ error: `對帳腳本 spawn 失敗: ${(err as Error).message}` });
  }
});

// ── GET /（分頁 B：篩選 + 分頁查詢）───────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const q = req.query;
  try {
    const result = listWorkerRuns({
      storyId: q['storyId'] ? String(q['storyId']) : undefined,
      phase: q['phase'] ? String(q['phase']) : undefined,
      track: q['track'] ? String(q['track']) : undefined,
      lifecycle: q['lifecycle'] ? String(q['lifecycle']) : undefined,
      closeSource: q['closeSource'] ? String(q['closeSource']) : undefined,
      runMode: q['runMode'] ? String(q['runMode']) : undefined,
      sessionId: q['sessionId'] ? String(q['sessionId']) : undefined,
      page: q['page'] ? parseInt(String(q['page']), 10) : undefined,
      pageSize: q['pageSize'] ? parseInt(String(q['pageSize']), 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /:runId（詳情三合一：run + messages + handoff）───────────

router.get('/:runId', (req: Request, res: Response) => {
  try {
    const detail = getWorkerRunDetail(req.params['runId'] as string);
    if (!detail) {
      // DB 掉線與「查無此列」必須分開回報，否則事故當下拿到的是錯誤診斷（AC15 fail-open）
      if (!isDbReady()) {
        res.status(503).json({ error: 'DB 未連線，無法查詢 run 詳情', dbUnavailable: true });
        return;
      }
      res.status(404).json({ error: `run_id "${req.params['runId']}" 不存在` });
      return;
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /:runId/ack（簽收）────────────────────────────────────

router.post('/:runId/ack', (req: Request, res: Response) => {
  try {
    const { ackBy } = req.body as { ackBy?: string };
    const result = ackWorkerRun(req.params['runId'] as string, ackBy);
    sendResult(res, result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /:runId/attention/ack（第 9 支：清除需注意旗標，AC15）───────
// UUID 前置驗證，不套 requireJsonBody —— 不 spawn 行程，與既有 /ack 一致。

router.post('/:runId/attention/ack', (req: Request, res: Response) => {
  const runId = req.params['runId'] as string;
  if (!UUID_REGEX.test(runId)) {
    res.status(400).json({ error: `runId "${runId}" 格式不合法（需為 UUID），拒絕處理` });
    return;
  }
  try {
    const { ackBy } = (req.body ?? {}) as { ackBy?: string };
    const result = ackAttention(runId, ackBy);
    sendResult(res, result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /:runId/messages（發指示 / 喚醒 / 回覆）──────────────────

router.post('/:runId/messages', (req: Request, res: Response) => {
  try {
    const result = addWorkerMessage(req.params['runId'] as string, req.body ?? {});
    sendResult(res, result, 201);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /:runId/gate（核可 / 要求修正）───────────────────────────

router.post('/:runId/gate', (req: Request, res: Response) => {
  try {
    const result = gateWorkerRun(req.params['runId'] as string, req.body ?? {});
    sendResult(res, result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /:runId/close（關窗；四前置後端再驗一次 + 委派 close-worker.ps1）──

router.post('/:runId/close', async (req: Request, res: Response) => {
  const runId = req.params['runId'] as string;

  // AC12：UUID 格式驗證必須在組 argv 之前（spawn 安全第一防線）
  if (!UUID_REGEX.test(runId)) {
    res.status(400).json({ error: `runId "${runId}" 格式不合法（需為 UUID），拒絕處理` });
    return;
  }
  if (!requireJsonBody(req, res)) return;

  // express.json() 遇非 JSON Content-Type 時不設 req.body（值為 undefined），
  // 直接解構會拋 TypeError → 500。此處與同 router 其餘端點一致用 `?? {}` 收斂。
  const { callerTrack, override, overrideReason } = (req.body ?? {}) as {
    callerTrack?: string;
    override?: boolean;
    overrideReason?: string;
  };

  if (override && (!overrideReason || !overrideReason.trim())) {
    res.status(400).json({ error: 'override=true 時 overrideReason 為必填字串' });
    return;
  }

  const precheck = checkClosePreconditions(runId, callerTrack, override);
  if (precheck.failedChecks.includes('db-unavailable')) {
    res.status(503).json({ error: 'DB 未連線，無法驗證關窗前置條件', dbUnavailable: true });
    return;
  }
  if (!precheck.run) {
    res.status(404).json({ error: `run_id "${runId}" 不存在` });
    return;
  }
  if (!precheck.ok) {
    res.status(409).json({ error: '關窗前置條件未通過', failedChecks: precheck.failedChecks });
    return;
  }

  // close-worker.ps1 屬 whp-6 交付物，未交付前一律 503 降級（零 DB 改動、零 spawn）
  const scriptPath = path.resolve(config.projectRoot, '.claude', 'skills', 'party-to-pipeline', 'scripts', 'close-worker.ps1');
  if (!fs.existsSync(scriptPath)) {
    res.status(503).json({
      error: 'close-worker.ps1 尚未交付（whp-6-directive-delivery-and-close），無法關窗。',
      missingScript: 'close-worker.ps1',
      blockedBy: 'whp-6-directive-delivery-and-close',
    });
    return;
  }

  const key = `close-${runId}`;
  if (isRunning(key)) {
    res.status(409).json({ error: '此 run 的關窗腳本正在執行中' });
    return;
  }

  try {
    // Node 端不寫 lifecycle='closed'/closed_at/close_source —— 這三欄由 close-worker.ps1 C4 寫入
    const result = await runScriptWithArgs(key, 'powershell', scriptPath, ['-RunId', runId]);
    if (result.exitCode !== 0) {
      res.status(500).json({ error: 'close-worker.ps1 執行失敗', exitCode: result.exitCode, output: result.output });
      return;
    }
    res.json({ success: true, output: result.output, exitCode: result.exitCode, durationMs: result.durationMs });
  } catch (err) {
    console.error('[workers] /close spawn failed:', (err as Error).message);
    res.status(500).json({ error: `close-worker.ps1 spawn 失敗: ${(err as Error).message}` });
  }
});

export default router;
