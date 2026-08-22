// ============================================================
// workersApi.ts — epic-whp worker 協議 API wrapper（whp-10-devconsole-ui）
// GET 走既有 apiFetch（GET-only）；POST 一律走原生 fetch 並顯式帶
// method + Content-Type（apiFetch 第二參數會被靜默忽略 → 退化成 GET → 404，
// 對照 emergenceApi.ts CR F1 事故註記）。
// ============================================================
import { apiFetch, API_BASE } from './apiClient.js';
import type {
  WorkerRun,
  WorkerRunListResult,
  WorkerRunDetail,
  WorkerHandoff,
  WorkerMessage,
  LiveBoard,
  ReapReport,
  AttentionAckResult,
  MessageDirection,
  MsgType,
} from '../types/workers.js';

// ── 統一錯誤處理（Task 2.5）─────────────────────────────────────

export class WorkersApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  dbUnavailable: boolean;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body['error'] === 'string' ? (body['error'] as string) : `HTTP ${status}`);
    this.name = 'WorkersApiError';
    this.status = status;
    this.body = body;
    this.dbUnavailable = body['dbUnavailable'] === true;
  }
}

async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({ error: res.statusText }))) as Record<string, unknown>;
    throw new WorkersApiError(res.status, errBody);
  }
  return res.json() as Promise<T>;
}

// ── GET 系（Task 2.1）───────────────────────────────────────────

export async function fetchLiveBoard(): Promise<LiveBoard> {
  return apiFetch<LiveBoard>('/workers/live');
}

export interface ListWorkerRunsFilters {
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

/** server/services/workerRunService.ts:154-162 FILTERABLE_COLUMNS 白名單（逐字對齊）。 */
const LIST_FILTER_KEYS = [
  'storyId', 'phase', 'track', 'lifecycle', 'closeSource', 'runMode', 'sessionId', 'page', 'pageSize',
] as const;

export async function listWorkerRuns(filters: ListWorkerRunsFilters = {}): Promise<WorkerRunListResult> {
  const params = new URLSearchParams();
  for (const key of LIST_FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return apiFetch<WorkerRunListResult>(`/workers${qs ? `?${qs}` : ''}`);
}

export async function fetchWorkerRunDetail(runId: string): Promise<WorkerRunDetail> {
  return apiFetch<WorkerRunDetail>(`/workers/${encodeURIComponent(runId)}`);
}

// ── POST 系（Task 2.2/2.3/2.4）───────────────────────────────────

export async function ackWorkerRun(runId: string, ackBy?: string): Promise<WorkerRun> {
  return postJson<WorkerRun>(`/workers/${encodeURIComponent(runId)}/ack`, { ackBy });
}

export interface AddWorkerMessageInput {
  direction: MessageDirection;
  msgType: MsgType;
  body: string;
  author: string;
  /** 必填，追加/取代二選一無預設值（G4：缺它後端 400 且零寫入）。 */
  mode: 'append' | 'replace';
}

export interface AddWorkerMessageResult {
  message: WorkerMessage;
  supersededCount: number;
  warnings: string[];
}

export async function addWorkerMessage(runId: string, input: AddWorkerMessageInput): Promise<AddWorkerMessageResult> {
  return postJson<AddWorkerMessageResult>(`/workers/${encodeURIComponent(runId)}/messages`, input);
}

export interface GateWorkerRunInput {
  verdict: 'approved' | 'revise';
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

export async function gateWorkerRun(runId: string, input: GateWorkerRunInput): Promise<GateWorkerRunResult> {
  return postJson<GateWorkerRunResult>(`/workers/${encodeURIComponent(runId)}/gate`, input);
}

export interface CloseWorkerRunInput {
  callerTrack?: string;
  override?: boolean;
  overrideReason?: string;
}

export interface CloseWorkerRunResult {
  success: boolean;
  output: string;
  exitCode: number;
  durationMs: number;
}

/** 必帶 Content-Type: application/json（缺此標頭後端回 415，CSRF 前置守衛）。 */
export async function closeWorkerRun(runId: string, input: CloseWorkerRunInput = {}): Promise<CloseWorkerRunResult> {
  return postJson<CloseWorkerRunResult>(`/workers/${encodeURIComponent(runId)}/close`, input);
}

/** 必帶 Content-Type: application/json（缺此標頭後端回 415，CSRF 前置守衛）。 */
export async function reapWorkerRuns(dryRun: boolean): Promise<ReapReport> {
  return postJson<ReapReport>('/workers/reap', { dryRun });
}

/** 第 9 支 endpoint（AC15）— 清 requires_attention 旗標，CAS 冪等（第二次呼叫回 409）。 */
export async function ackAttention(runId: string, ackBy?: string): Promise<AttentionAckResult> {
  return postJson<AttentionAckResult>(`/workers/${encodeURIComponent(runId)}/attention/ack`, { ackBy });
}

// ── 統一錯誤顯示（BR-044）─────────────────────────────────────

/** dbUnavailable 時附加「資料庫未連線」前綴，其餘原樣回傳後端 error 字串。 */
export function describeWorkersApiError(err: unknown): string {
  if (err instanceof WorkersApiError) {
    return err.dbUnavailable ? `資料庫未連線：${err.message}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
