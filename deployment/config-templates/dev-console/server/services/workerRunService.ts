// ============================================================
// workerRunService.ts — epic-whp worker 協議四表查詢 + CAS 寫入服務
// whp-9-devconsole-api：8 支 /api/workers endpoint 的邏輯層
// whp-10-devconsole-ui：+ 第 9 支 ackAttention（requires_attention 降旗）與 attention 段聯集補齊
// G25：四道 CAS 條件須與 whp-5 message-bus-mcp 的 4 支 MCP tool 逐字相同，
//      每道 WHERE 子句上方標註 // [G25] 對照 whp-5 {tool} 供機械 diff。
// ============================================================
import { getDb } from '../db.js';
import { getTaiwanTimestamp } from '../utils/taiwanTime.js';

// ── 型別（對齊 whp-3 DDL / upsert-worker-run.js ALL_ROW_COLUMNS）──────

export interface WorkerRun {
  run_id: string;
  session_id: string;
  resumed_from_run_id: string | null;
  story_id: string;
  phase: string;
  attempt: number;
  controller_track: string;
  run_mode: string;
  wrapper_pid: number | null;
  claude_pid: number | null;
  cmd_line: string | null;
  window_title: string | null;
  ipc_dir: string;
  model_id: string | null;
  effort: string | null;
  work_root: string | null;
  baseline_commit: string | null;
  lifecycle: string;
  close_source: string | null;
  last_status: string | null;
  evidence_incomplete: number;
  turn_count: number;
  files_modified: string | null;
  health_flag: string | null;
  stall_rounds: number;
  reported_at: string | null;
  ack_at: string | null;
  ack_by: string | null;
  notify_count: number;
  last_notified_at: string | null;
  window_vanished_at: string | null;
  abandoned_at_stage: string | null;
  requires_attention: number;
  guardian_exit_reason: string | null;
  started_at: string;
  last_turn_at: string | null;
  closed_at: string | null;
  closed_detected_at: string | null;
  updated_at: string;
}

export interface WorkerRunView extends WorkerRun {
  executionOwner: 'worker' | 'controller' | 'none';
  closable: boolean;
}

export interface WorkerMessage {
  msg_id: number;
  run_id: string;
  seq: number;
  direction: string;
  msg_type: string;
  body: string;
  author: string;
  state: string;
  delivered_via: string | null;
  created_at: string;
  delivered_at: string | null;
  consumed_at: string | null;
}

export interface WorkerHandoff {
  run_id: string;
  story_id: string;
  phase: string;
  evidence_json: string | null;
  deliverables: string | null;
  gate_result: string;
  gate_by: string | null;
  gate_notes: string | null;
  override_reason: string | null;
  gate_at: string | null;
  next_phase: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianHeartbeatRow {
  id: number;
  guardian_pid: number | null;
  host: string | null;
  started_at: string | null;
  last_beat_at: string | null;
  fast_tick_sec: number;
  slow_tick_sec: number;
  watched_runs: number;
  last_error: string | null;
  updated_at: string;
}

export type GuardianStatus =
  | { present: false }
  | {
      present: true;
      stale: boolean;
      guardianPid: number | null;
      host: string | null;
      startedAt: string | null;
      lastBeatAt: string | null;
      fastTickSec: number;
      slowTickSec: number;
      watchedRuns: number;
      lastError: string | null;
    };

export interface LiveBoard {
  guardian: GuardianStatus;
  kpi: { running: number; pendingAck: number; pendingReview: number; pendingClose: number };
  running: WorkerRunView[];
  queues: {
    pendingAck: WorkerRunView[];
    pendingReview: WorkerRunView[];
    pendingClose: WorkerRunView[];
    attention: WorkerRunView[];
  };
}

export interface WorkerRunListResult {
  items: WorkerRun[];
  total: number;
  page: number;
}

export interface WorkerRunDetail {
  run: WorkerRun;
  messages: WorkerMessage[];
  handoff: WorkerHandoff | null;
}

// ── Conflict/失敗 result（route 層轉 HTTP status 用）──────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 404 | 409 | 503; body: Record<string, unknown> };

// ── 常數 ─────────────────────────────────────────────────────────

/** 執行中看板：worker 持有執行權的三態（"執行中看板"，非終態子集）。*/
const RUNNING_LIFECYCLES = new Set(['dispatching', 'running', 'revising']);

/** listWorkerRuns 篩選欄位白名單（欄位名取自程式內常數，禁字串拼接）。*/
const FILTERABLE_COLUMNS: Record<string, string> = {
  storyId: 'story_id',
  phase: 'phase',
  track: 'controller_track',
  lifecycle: 'lifecycle',
  closeSource: 'close_source',
  runMode: 'run_mode',
  sessionId: 'session_id',
};

/**
 * direction → 合法 msgType 白名單。
 * [G25] 對照 whp-5 addWorkerMessage —— 逐字取自 `.context-db/scripts/worker-protocol-ops.js:28-31`
 * 的 MSG_TYPES_BY_DIRECTION（whp-5 為送達模型 SSoT §20 的權威落地）。
 * ⚠ 本表若與該檔不一致，Web UI 會寫出 delivery 層無法識別的 msg_type（G25 破口），
 * 故兩處必須逐字相同；whp-5 更新時本表須同步。
 */
const MSG_TYPES_BY_DIRECTION: Record<string, string[]> = {
  'controller-to-worker': ['verdict-approved', 'revise', 'wake', 'probe', 'answer', 'close'],
  'worker-to-controller': ['progress', 'blocker', 'question', 'report'],
};

/** 守護心跳新鮮度門檻倍數：stale 判定 = fast_tick_sec × 此倍數。*/
const GUARDIAN_STALE_MULTIPLIER = 3;

// ── 推導欄位（AC2）─────────────────────────────────────────────

function deriveExecutionOwner(lifecycle: string): 'worker' | 'controller' | 'none' {
  if (lifecycle === 'dispatching' || lifecycle === 'running' || lifecycle === 'revising') return 'worker';
  if (lifecycle === 'reported' || lifecycle === 'awaiting-review' || lifecycle === 'approved') return 'controller';
  return 'none';
}

function deriveClosable(lifecycle: string): boolean {
  return lifecycle === 'approved';
}

function toView(row: WorkerRun): WorkerRunView {
  return { ...row, executionOwner: deriveExecutionOwner(row.lifecycle), closable: deriveClosable(row.lifecycle) };
}

/**
 * fail-open 判別（AC15 / SSoT G22 F10）：讀取類 endpoint 在 DB 不可用時回空集合，
 * 但 route 層需能把「基礎設施不可用」與「查無此列」分開 —— 否則 DB 掉線會被誤報成 404
 * 「run 不存在」，中控在事故當下拿到的是錯誤診斷。
 */
export function isDbReady(): boolean {
  return getDb() !== null;
}

// ── AC2/AC3/AC4：GET /live ────────────────────────────────────

export function getLiveBoard(): LiveBoard {
  const db = getDb();
  if (!db) {
    return {
      guardian: { present: false },
      kpi: { running: 0, pendingAck: 0, pendingReview: 0, pendingClose: 0 },
      running: [],
      queues: { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] },
    };
  }

  const heartbeat = db.prepare('SELECT * FROM guardian_heartbeat WHERE id = 1').get() as GuardianHeartbeatRow | undefined;
  const guardian = toGuardianStatus(heartbeat);

  // 不分頁、無 LIMIT（視窗不再自動關閉，佇列長度即真實待辦量）；只發 2 次查詢（≤6 上界）。
  const rows = db
    .prepare(`SELECT * FROM worker_runs WHERE lifecycle NOT IN ('closed', 'failed') ORDER BY started_at DESC`)
    .all() as WorkerRun[];
  const views = rows.map(toView);

  const running = views.filter((r) => RUNNING_LIFECYCLES.has(r.lifecycle));
  const pendingAck = views.filter((r) => r.lifecycle === 'reported');
  const pendingReview = views.filter((r) => r.lifecycle === 'awaiting-review');
  const pendingClose = views.filter((r) => r.lifecycle === 'approved');
  // BR-055 / whp-9 spec BR-006 conformance：requires_attention=1 OR health_flag='stalled-suspect'（聯集，非取代）
  const attention = views.filter((r) => r.requires_attention === 1 || r.health_flag === 'stalled-suspect');

  return {
    guardian,
    kpi: {
      running: running.length,
      pendingAck: pendingAck.length,
      pendingReview: pendingReview.length,
      pendingClose: pendingClose.length,
    },
    running,
    queues: { pendingAck, pendingReview, pendingClose, attention },
  };
}

function toGuardianStatus(row: GuardianHeartbeatRow | undefined): GuardianStatus {
  if (!row) return { present: false };
  const lastBeatMs = row.last_beat_at ? new Date(row.last_beat_at).getTime() : NaN;
  const staleMs = Number.isNaN(lastBeatMs) ? Infinity : Date.now() - lastBeatMs;
  const stale = staleMs > row.fast_tick_sec * GUARDIAN_STALE_MULTIPLIER * 1000;
  return {
    present: true,
    stale,
    guardianPid: row.guardian_pid,
    host: row.host,
    startedAt: row.started_at,
    lastBeatAt: row.last_beat_at,
    fastTickSec: row.fast_tick_sec,
    slowTickSec: row.slow_tick_sec,
    watchedRuns: row.watched_runs,
    lastError: row.last_error,
  };
}

// ── AC5：GET / ─────────────────────────────────────────────────

export interface ListWorkerRunsOptions {
  storyId?: string;
  phase?: string;
  track?: string;
  lifecycle?: string;
  closeSource?: string;
  runMode?: string;
  sessionId?: string;
  page?: number;
  pageSize?: number;
}

export function listWorkerRuns(options: ListWorkerRunsOptions): WorkerRunListResult {
  const db = getDb();
  if (!db) return { items: [], total: 0, page: 1 };

  // 非數值輸入（?page=abc → parseInt 得 NaN）必須先落回預設值，否則 NaN 會一路
  // 傳到 LIMIT/OFFSET 綁定，better-sqlite3 拋 SqliteError('datatype mismatch') → 500。
  const page = Number.isFinite(options.page) ? (options.page as number) : 1;
  const pageSize = Number.isFinite(options.pageSize) ? (options.pageSize as number) : 20;
  const safePage = Math.max(Math.trunc(page), 1);
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize), 1), 100);
  const offset = (safePage - 1) * safePageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const [optionKey, column] of Object.entries(FILTERABLE_COLUMNS)) {
    const value = (options as Record<string, unknown>)[optionKey];
    if (value !== undefined && value !== null && value !== '') {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const items = db
    .prepare(`SELECT * FROM worker_runs ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, safePageSize, offset) as WorkerRun[];
  const total = (db.prepare(`SELECT COUNT(*) AS cnt FROM worker_runs ${where}`).get(...params) as { cnt: number }).cnt;

  return { items, total, page: safePage };
}

// ── AC6：GET /:runId ───────────────────────────────────────────

export function getWorkerRunDetail(runId: string): WorkerRunDetail | null {
  const db = getDb();
  if (!db) return null;

  const run = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun | undefined;
  if (!run) return null;

  const messages = db
    .prepare('SELECT * FROM worker_messages WHERE run_id = ? ORDER BY seq ASC')
    .all(runId) as WorkerMessage[];
  const handoff = (db.prepare('SELECT * FROM worker_handoffs WHERE run_id = ?').get(runId) as WorkerHandoff | undefined) ?? null;

  return { run, messages, handoff };
}

// ── AC7：POST /:runId/ack ──────────────────────────────────────

export function ackWorkerRun(runId: string, ackBy: string | undefined): ServiceResult<WorkerRun> {
  const db = getDb();
  // AC15 / SSoT G22 F10 fail-open：讀取類回空集合，寫入類回 503（非 409 —— 409 語意是
  // CAS 衝突，會讓呼叫端誤以為狀態不符而非基礎設施不可用）。
  if (!db) return { ok: false, status: 503, body: { error: 'DB 未連線，無法簽收', dbUnavailable: true } };

  return db.transaction((): ServiceResult<WorkerRun> => {
    const run = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun | undefined;
    if (!run) return { ok: false, status: 404, body: { error: `run_id "${runId}" 不存在` } };

    if (run.lifecycle !== 'reported') {
      if (run.ack_at) {
        return {
          ok: false,
          status: 409,
          body: {
            error: `此 run 已於 ${run.ack_at} 由 ${run.ack_by} 簽收，無法重複簽收。`,
            currentLifecycle: run.lifecycle,
            ackAt: run.ack_at,
            ackBy: run.ack_by,
          },
        };
      }
      return {
        ok: false,
        status: 409,
        body: {
          error: `此 run 目前為 ${run.lifecycle}，尚未回報，無法簽收。請待 worker 回報後再簽收。`,
          currentLifecycle: run.lifecycle,
        },
      };
    }

    const now = getTaiwanTimestamp();
    const effectiveAckBy = ackBy && ackBy.trim() ? ackBy : 'devconsole-ui';

    // [G25] 對照 whp-5 ack_worker_run
    const info = db
      .prepare(`UPDATE worker_runs SET lifecycle = 'awaiting-review', ack_at = ?, ack_by = ?, updated_at = ? WHERE run_id=? AND lifecycle='reported'`)
      .run(now, effectiveAckBy, now, runId);

    if (info.changes === 0) {
      // 交易內競態輸家（極罕見：兩併發 ack 只有一個能贏），回覆同上「尚未回報」語意保守處理
      return { ok: false, status: 409, body: { error: '簽收競態失敗，請重新查詢 run 狀態後再試。', currentLifecycle: run.lifecycle } };
    }

    const updated = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun;
    return { ok: true, data: updated };
  })();
}

// ── AC8：POST /:runId/messages ─────────────────────────────────

export interface AddWorkerMessageInput {
  direction?: string;
  msgType?: string;
  body?: string;
  author?: string;
  mode?: string;
}

export interface AddWorkerMessageResult {
  message: WorkerMessage;
  supersededCount: number;
  /** mode='replace' 時無法撤回（已 delivered）的舊指示告警，對照 whp-5 同名回傳欄位。*/
  warnings: string[];
}

export function addWorkerMessage(runId: string, input: AddWorkerMessageInput): ServiceResult<AddWorkerMessageResult> {
  const db = getDb();
  if (!db) return { ok: false, status: 503, body: { error: 'DB 未連線，無法發送訊息', dbUnavailable: true } };

  const { direction, msgType, body, author, mode } = input;

  if (direction !== 'controller-to-worker' && direction !== 'worker-to-controller') {
    return { ok: false, status: 400, body: { error: 'direction 必為 controller-to-worker 或 worker-to-controller' } };
  }
  if (!mode) {
    return { ok: false, status: 400, body: { error: 'mode 為必填字串（append | replace）' } };
  }
  if (mode !== 'append' && mode !== 'replace') {
    return { ok: false, status: 400, body: { error: `mode "${mode}" 不合法，僅接受 append 或 replace` } };
  }
  if (!body || !author) {
    return { ok: false, status: 400, body: { error: 'body 與 author 為必填字串' } };
  }
  const legalMsgTypes = MSG_TYPES_BY_DIRECTION[direction] ?? [];
  if (!msgType || !legalMsgTypes.includes(msgType)) {
    return {
      ok: false,
      status: 400,
      body: { error: `msgType "${msgType}" 不合法`, direction, legalValues: legalMsgTypes },
    };
  }

  const run = db.prepare('SELECT run_id FROM worker_runs WHERE run_id = ?').get(runId);
  if (!run) return { ok: false, status: 404, body: { error: `run_id "${runId}" 不存在` } };

  return db.transaction((): ServiceResult<AddWorkerMessageResult> => {
    let supersededCount = 0;
    const warnings: string[] = [];
    if (mode === 'replace') {
      // [G25] 對照 whp-5 addWorkerMessage（worker-protocol-ops.js:367-379）：
      // 只有 pending 可撤回；已 delivered 的指示無法撤回，必須明白回報呼叫端，
      // 否則 UI 的「取代」會讓使用者誤以為舊指示已作廢，而 worker 仍會照舊執行。
      const existing = db
        .prepare(
          `SELECT msg_id, state FROM worker_messages WHERE run_id = ? AND direction = ? AND state IN ('pending', 'delivered')`,
        )
        .all(runId, direction) as Array<{ msg_id: number; state: string }>;
      for (const row of existing) {
        if (row.state === 'pending') {
          db.prepare(`UPDATE worker_messages SET state = 'superseded' WHERE msg_id = ?`).run(row.msg_id);
          supersededCount += 1;
        } else {
          warnings.push(`msg_id=${row.msg_id} 已送達（delivered），無法撤回，請發新指示`);
        }
      }
    }

    // seq 於同一 transaction 內取號並 INSERT，避免撞 ux_worker_messages_run_seq
    const maxSeqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM worker_messages WHERE run_id = ?').get(runId) as {
      maxSeq: number;
    };
    const nextSeq = maxSeqRow.maxSeq + 1;
    const now = getTaiwanTimestamp();

    const insertInfo = db
      .prepare(
        `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, delivered_via, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`,
      )
      .run(runId, nextSeq, direction, msgType, body, author, now);

    const message = db.prepare('SELECT * FROM worker_messages WHERE msg_id = ?').get(insertInfo.lastInsertRowid) as WorkerMessage;
    return { ok: true, data: { message, supersededCount, warnings } };
  })();
}

// ── AC9/AC10：POST /:runId/gate ────────────────────────────────

export interface GateWorkerRunInput {
  verdict?: string;
  gateBy?: string;
  gateNotes?: string;
  callerTrack?: string;
  override?: boolean;
  overrideReason?: string;
}

export interface GateWorkerRunResult {
  run: WorkerRun;
  handoff: WorkerHandoff | null;
  hint?: string;
}

export function gateWorkerRun(runId: string, input: GateWorkerRunInput): ServiceResult<GateWorkerRunResult> {
  const db = getDb();
  if (!db) return { ok: false, status: 503, body: { error: 'DB 未連線，無法裁決', dbUnavailable: true } };

  const { verdict, gateBy, gateNotes, callerTrack, override, overrideReason } = input;

  if (verdict !== 'approved' && verdict !== 'revise') {
    return { ok: false, status: 400, body: { error: `verdict "${verdict}" 不合法，僅接受 approved 或 revise` } };
  }
  // 參數驗證層先於 CAS 層（對照 whp-5 worker-protocol-ops.js:193-200 的 validationError 前置）
  if (override && (!overrideReason || !overrideReason.trim())) {
    return { ok: false, status: 400, body: { error: 'override=true 時 overrideReason 為必填字串' } };
  }

  return db.transaction((): ServiceResult<GateWorkerRunResult> => {
    const run = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun | undefined;
    if (!run) return { ok: false, status: 404, body: { error: `run_id "${runId}" 不存在` } };

    // [G25] 對照 whp-5 gateWorkerRun guard 順序（worker-protocol-ops.js:209-228）：
    // ack → lifecycle → 跨軌，三段各自可辨識、不得合併 —— whp-5 SDD §4.4 明訂
    // 「each failure must be distinguishable and must not have attempted the checks after it」。
    if (!run.ack_at) {
      return {
        ok: false,
        status: 409,
        body: {
          error: '未簽收不得裁決：此 run 尚未簽收（ack_at 為空）。請先呼叫 POST /:runId/ack 簽收後再裁決。',
          currentLifecycle: run.lifecycle,
          ackAt: null,
        },
      };
    }
    if (run.lifecycle !== 'awaiting-review') {
      return {
        ok: false,
        status: 409,
        body: {
          error: `此 run 目前為 ${run.lifecycle}，非 awaiting-review，無法裁決。請待 worker 回報並完成簽收後再裁決。`,
          currentLifecycle: run.lifecycle,
        },
      };
    }
    if (callerTrack && callerTrack !== run.controller_track && !override) {
      return {
        ok: false,
        status: 409,
        body: {
          error: `跨軌裁決：呼叫者軌別 "${callerTrack}" 與 run 軌別 "${run.controller_track}" 不符。請改由該軌中控裁決，或帶 override:true 與 overrideReason。`,
          runTrack: run.controller_track,
        },
      };
    }

    const handoff = db.prepare('SELECT * FROM worker_handoffs WHERE run_id = ?').get(runId) as WorkerHandoff | undefined;
    if (!handoff) {
      return { ok: false, status: 409, body: { error: `run_id "${runId}" 尚無 worker_handoffs 記錄，無法裁決（待寫入端接線後才會建立）` } };
    }
    if (handoff.gate_result !== 'pending') {
      return { ok: false, status: 409, body: { error: '此 run 已裁決過，無法重複裁決。', gateResult: handoff.gate_result } };
    }

    const now = getTaiwanTimestamp();
    const nextGateResult = verdict === 'approved' ? 'approved' : 'pending';

    // [whp-6 BR-036] G25 parity with whp-5's gateWorkerRun (worker-protocol-ops.js:266-272):
    // an inline run's approved verdict must reach a terminal state in this same transaction,
    // not the intermediate 'approved' lifecycle — inline runs have no window afterwards for a
    // controller to call close-worker.ps1 (its C2 five preconditions refuse run_mode='inline'
    // outright, see checkClosePreconditions below), so 'approved' would strand the row forever.
    const isInlineApprove = verdict === 'approved' && run.run_mode === 'inline';
    const nextLifecycle = verdict === 'approved' ? (isInlineApprove ? 'closed' : 'approved') : 'revising';

    // [G25] 對照 whp-5 gate_worker_run
    const runsInfo = isInlineApprove
      ? db
          .prepare(
            `UPDATE worker_runs SET lifecycle = ?, close_source = ?, closed_at = ?, updated_at = ? WHERE run_id=? AND lifecycle='awaiting-review' AND ack_at IS NOT NULL`,
          )
          .run(nextLifecycle, 'ControllerAfterHandshake', now, now, runId)
      : db
          .prepare(
            `UPDATE worker_runs SET lifecycle = ?, updated_at = ? WHERE run_id=? AND lifecycle='awaiting-review' AND ack_at IS NOT NULL`,
          )
          .run(nextLifecycle, now, runId);
    if (runsInfo.changes === 0) {
      return { ok: false, status: 409, body: { error: '裁決競態失敗，run 狀態已被其他呼叫變更。', currentLifecycle: run.lifecycle } };
    }

    // [G25] 對照 whp-5 gate_worker_run
    const handoffInfo = db
      .prepare(
        // override_reason 用 COALESCE 保留既有值：revise 後 gate_result 仍為 'pending'，
        // 第二輪 approve 若直接寫 NULL 會把前一輪的跨軌授權理由（稽核痕跡）抹除。
        `UPDATE worker_handoffs SET gate_result = ?, gate_by = ?, gate_notes = ?, override_reason = COALESCE(?, override_reason), gate_at = ?, updated_at = ? WHERE run_id=? AND gate_result='pending'`,
      )
      .run(nextGateResult, gateBy ?? null, gateNotes ?? null, overrideReason ?? null, now, now, runId);
    if (handoffInfo.changes === 0) {
      return { ok: false, status: 409, body: { error: '裁決競態失敗，handoff 狀態已被其他呼叫變更。' } };
    }

    if (verdict === 'revise') {
      // G24：同一 transaction 內清空回報欄位，避免第二輪回報永遠不被催辦
      db.prepare(
        `UPDATE worker_runs SET reported_at = NULL, ack_at = NULL, ack_by = NULL, notify_count = 0, updated_at = ? WHERE run_id = ?`,
      ).run(now, runId);

      const maxSeqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM worker_messages WHERE run_id = ?').get(runId) as {
        maxSeq: number;
      };
      db.prepare(
        `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, delivered_via, created_at)
         VALUES (?, ?, 'controller-to-worker', 'revise', ?, ?, 'pending', NULL, ?)`,
      ).run(runId, maxSeqRow.maxSeq + 1, gateNotes ?? '請修正後重新回報', gateBy ?? 'devconsole-ui', now);
    }

    const updatedRun = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun;
    const updatedHandoff = db.prepare('SELECT * FROM worker_handoffs WHERE run_id = ?').get(runId) as WorkerHandoff;
    const hint = verdict === 'approved' ? '核可完成，視窗仍開著，關窗請走 POST /:runId/close' : undefined;
    return { ok: true, data: { run: updatedRun, handoff: updatedHandoff, hint } };
  })();
}

// ── AC11：POST /:runId/close 前置檢查（route 層驗過 UUID 格式後呼叫）──

export interface ClosePreconditionResult {
  ok: boolean;
  run?: WorkerRun;
  failedChecks: string[];
}

export function checkClosePreconditions(runId: string, callerTrack: string | undefined, override: boolean | undefined): ClosePreconditionResult {
  const db = getDb();
  if (!db) return { ok: false, failedChecks: ['db-unavailable'] };

  const run = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun | undefined;
  if (!run) return { ok: false, failedChecks: ['run-not-found'] };

  const handoff = db.prepare('SELECT * FROM worker_handoffs WHERE run_id = ?').get(runId) as WorkerHandoff | undefined;

  const failedChecks: string[] = [];

  // [whp-6 BR-037] inline runs never route through close-worker.ps1 — gateWorkerRun's approved
  // branch already drives them straight to 'closed' in the same transaction (see above), so a
  // POST here against one is always a caller error, not a race to retry.
  if (run.run_mode === 'inline') failedChecks.push('run-mode-inline');

  // [G25] 對照 whp-5 close_worker_run（讀取型前置檢查；權威 CAS 在 close-worker.ps1 C4 執行實際 UPDATE，Node 端不寫終態）
  const approvedMatch = db.prepare(`SELECT run_id FROM worker_runs WHERE run_id=? AND lifecycle='approved'`).get(runId);
  if (!approvedMatch) failedChecks.push('lifecycle-not-approved');

  if (!run.ack_at) failedChecks.push('not-acked');
  if (!handoff || handoff.gate_result !== 'approved') failedChecks.push('gate-not-approved');
  if (callerTrack && callerTrack !== run.controller_track && !override) failedChecks.push('track-mismatch');

  return { ok: failedChecks.length === 0, run, failedChecks };
}

// ── AC15：POST /:runId/attention/ack（第 9 支，承接 TD-WHP9-ATTENTION-QUEUE-UNBOUNDED）──
// 升旗有兩條（reap-worker-runs.js 標 abandoned 時 / guardian-tick.js 標 stalled-suspect 時），
// 但降旗路徑本卡之前全庫零命中——guardian-tick.js writeStallReset 刻意只清 health_flag，
// 把 requires_attention 的降旗指派給中控（該卡 :341 註解明寫），本 endpoint 補上這條路徑。

export function ackAttention(runId: string, ackBy: string | undefined): ServiceResult<WorkerRun> {
  const db = getDb();
  if (!db) return { ok: false, status: 503, body: { error: 'DB 未連線，無法清除需注意旗標', dbUnavailable: true } };

  return db.transaction((): ServiceResult<WorkerRun> => {
    const run = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun | undefined;
    if (!run) return { ok: false, status: 404, body: { error: `run_id "${runId}" 不存在` } };

    const now = getTaiwanTimestamp();
    const effectiveAckBy = ackBy && ackBy.trim() ? ackBy : 'devconsole-ui';

    // 欄位範圍 UPDATE：只動 requires_attention + updated_at 兩欄，不觸碰 lifecycle（終態不被改寫）
    const info = db
      .prepare(`UPDATE worker_runs SET requires_attention = 0, updated_at = ? WHERE run_id = ? AND requires_attention = 1`)
      .run(now, runId);

    if (info.changes === 0) {
      // CAS 命中 0 列：可能已被清除過（冪等），回報目前實際值供呼叫端核對
      return {
        ok: false,
        status: 409,
        body: { error: '此 run 目前無需注意旗標（可能已被清除），無法重複清除。', currentValue: run.requires_attention },
      };
    }

    // 同一 transaction 內留痕：誰放下了紅旗（SSoT E23，非只改前端狀態）
    const maxSeqRow = db.prepare('SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM worker_messages WHERE run_id = ?').get(runId) as {
      maxSeq: number;
    };
    db.prepare(
      `INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, delivered_via, created_at)
       VALUES (?, ?, 'worker-to-controller', 'progress', ?, ?, 'pending', NULL, ?)`,
    ).run(runId, maxSeqRow.maxSeq + 1, '已知悉，requires_attention 旗標已由中控清除', effectiveAckBy, now);

    const updated = db.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as WorkerRun;
    return { ok: true, data: updated };
  })();
}
