// ============================================================
// workers.ts — epic-whp worker 協議型別鏡像（whp-10-devconsole-ui）
// 鏡像自 server/services/workerRunService.ts:12-140，欄位名逐字對齊；
// src/types/__tests__/contract.test.ts 靜態比對兩檔欄位名集合防止漂移。
// ============================================================

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

// ── 本卡專屬型別（Task 1.2）─────────────────────────────────────

/** reap-worker-runs.js:131-142 逐字對齊的 10 鍵 report 形狀。 */
export interface ReapReport {
  scanned: number;
  alive: number;
  reaped: number;
  skipped_inline: number;
  skipped_cas_lost: number;
  skipped_terminal: number;
  probe_unavailable: boolean;
  dry_run: boolean;
  runs: Array<{ run_id: string; story_id: string; phase: string; from: string; to: string; reason: string }>;
  generated_at: string;
}

/** POST /:runId/attention/ack 成功回應（第 9 支 endpoint，AC15）— 對稱 ackWorkerRun 回傳更新後 row。 */
export type AttentionAckResult = WorkerRun;

/** workerRunService.ts:171-174 兩個 direction 的 msgType 白名單（逐字對齊，G4/G25）。 */
export type ControllerToWorkerMsgType = 'verdict-approved' | 'revise' | 'wake' | 'probe' | 'answer' | 'close';
export type WorkerToControllerMsgType = 'progress' | 'blocker' | 'question' | 'report';
export type MsgType = ControllerToWorkerMsgType | WorkerToControllerMsgType;
export type MessageDirection = 'controller-to-worker' | 'worker-to-controller';
