// ============================================================
// workerRunService.test.ts — whp-9-devconsole-api Service 層測試
// 對隔離 temp DB 跑真 SQL（不 mock DB）：四道 CAS 0-rows 行為、G24 transaction
// rollback、三並行寫入者不互蓋、時間戳 +08:00、/live 查詢數與延遲界。
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Temp DB schema（逐字對齊 .context-db/migrations/2026-07-27-add-worker-protocol-tables.sql）──

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.exec(`
    CREATE TABLE worker_runs (
      run_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, resumed_from_run_id TEXT,
      story_id TEXT NOT NULL, phase TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
      controller_track TEXT NOT NULL DEFAULT 'unspecified', run_mode TEXT NOT NULL DEFAULT 'window',
      wrapper_pid INTEGER, claude_pid INTEGER, cmd_line TEXT, window_title TEXT,
      ipc_dir TEXT NOT NULL, model_id TEXT, effort TEXT, work_root TEXT, baseline_commit TEXT,
      lifecycle TEXT NOT NULL DEFAULT 'dispatching', close_source TEXT, last_status TEXT,
      evidence_incomplete INTEGER NOT NULL DEFAULT 0, turn_count INTEGER NOT NULL DEFAULT 0,
      files_modified TEXT, health_flag TEXT, stall_rounds INTEGER NOT NULL DEFAULT 0,
      reported_at TEXT, ack_at TEXT, ack_by TEXT, notify_count INTEGER NOT NULL DEFAULT 0,
      last_notified_at TEXT, window_vanished_at TEXT, abandoned_at_stage TEXT,
      requires_attention INTEGER NOT NULL DEFAULT 0, guardian_exit_reason TEXT,
      started_at TEXT NOT NULL, last_turn_at TEXT, closed_at TEXT, closed_detected_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE worker_messages (
      msg_id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
      direction TEXT NOT NULL, msg_type TEXT NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', delivered_via TEXT, created_at TEXT NOT NULL,
      delivered_at TEXT, consumed_at TEXT
    );
    CREATE UNIQUE INDEX ux_worker_messages_run_seq ON worker_messages(run_id, seq);
    CREATE TABLE worker_handoffs (
      run_id TEXT PRIMARY KEY, story_id TEXT NOT NULL, phase TEXT NOT NULL,
      evidence_json TEXT, deliverables TEXT, gate_result TEXT NOT NULL DEFAULT 'pending',
      gate_by TEXT, gate_notes TEXT, override_reason TEXT, gate_at TEXT, next_phase TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE guardian_heartbeat (
      id INTEGER PRIMARY KEY CHECK (id = 1), guardian_pid INTEGER, host TEXT,
      started_at TEXT, last_beat_at TEXT, fast_tick_sec INTEGER NOT NULL DEFAULT 30,
      slow_tick_sec INTEGER NOT NULL DEFAULT 600, watched_runs INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, updated_at TEXT NOT NULL
    );
  `);
  return conn;
}

let runSeq = 0;
function makeRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  runSeq += 1;
  const now = '2026-07-28T00:00:00.000+08:00';
  return {
    run_id: `run-${String(runSeq).padStart(4, '0')}`,
    session_id: 'sess-1', resumed_from_run_id: null, story_id: 'whp-9-devconsole-api',
    phase: 'dev-story', attempt: 1, controller_track: 'backend-track', run_mode: 'window',
    wrapper_pid: 1000 + runSeq, claude_pid: 2000 + runSeq, cmd_line: null, window_title: null,
    ipc_dir: 'C:/ipc/test', model_id: null, effort: null, work_root: null, baseline_commit: null,
    lifecycle: 'running', close_source: null, last_status: null, evidence_incomplete: 0, turn_count: 0,
    files_modified: null, health_flag: null, stall_rounds: 0, reported_at: null, ack_at: null,
    ack_by: null, notify_count: 0, last_notified_at: null, window_vanished_at: null,
    abandoned_at_stage: null, requires_attention: 0, guardian_exit_reason: null,
    started_at: now, last_turn_at: null, closed_at: null, closed_detected_at: null, updated_at: now,
    ...overrides,
  };
}

function insertRun(conn: Database.Database, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row = makeRun(overrides);
  const cols = Object.keys(row);
  conn.prepare(`INSERT INTO worker_runs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
    ...cols.map((c) => row[c]),
  );
  return row;
}

function insertHandoff(conn: Database.Database, runId: string, overrides: Record<string, unknown> = {}): void {
  const now = '2026-07-28T00:00:00.000+08:00';
  const row = {
    run_id: runId, story_id: 'whp-9-devconsole-api', phase: 'dev-story',
    evidence_json: null, deliverables: null, gate_result: 'pending', gate_by: null,
    gate_notes: null, override_reason: null, gate_at: null, next_phase: null,
    created_at: now, updated_at: now, ...overrides,
  };
  const cols = Object.keys(row);
  conn.prepare(`INSERT INTO worker_handoffs (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
    ...cols.map((c) => (row as Record<string, unknown>)[c]),
  );
}

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

import * as db from '../../db.js';
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
} from '../workerRunService.js';
import { fileURLToPath, pathToFileURL } from 'url';

/** repo root（本檔位於 tools/dev-console/server/services/__tests__/）*/
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('workerRunService', () => {
  let tmpDir: string;
  let conn: Database.Database;

  beforeEach(() => {
    runSeq = 0;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-worker-svc-'));
    conn = initTestDb(path.join(tmpDir, 'worker.db'));
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── AC2/AC3/AC4：getLiveBoard ──────────────────────────────

  describe('getLiveBoard', () => {
    it('AC2: kpi 四數 + 四段佇列 + attention/pendingAck 可重疊', () => {
      insertRun(conn, { lifecycle: 'running' });
      insertRun(conn, { lifecycle: 'revising' });
      const reportedRun = insertRun(conn, { lifecycle: 'reported' });
      insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00' });
      insertRun(conn, { lifecycle: 'approved' });
      insertRun(conn, { lifecycle: 'abandoned', requires_attention: 1 });
      // overlap case：reported + requires_attention=1 同時出現在 pendingAck 與 attention
      insertRun(conn, { lifecycle: 'reported', requires_attention: 1, run_id: 'run-overlap' });

      const board = getLiveBoard();
      expect(board.kpi).toEqual({ running: 2, pendingAck: 2, pendingReview: 1, pendingClose: 1 });
      expect(Object.keys(board.queues).sort()).toEqual(['attention', 'pendingAck', 'pendingClose', 'pendingReview'].sort());
      expect(board.queues.attention.some((r) => r.run_id === 'run-overlap')).toBe(true);
      expect(board.queues.pendingAck.some((r) => r.run_id === 'run-overlap')).toBe(true);
      expect(board.queues.attention.some((r) => r.lifecycle === 'abandoned')).toBe(true);
      expect(reportedRun).toBeTruthy();

      const running = board.queues.pendingClose.find((r) => r.lifecycle === 'approved');
      expect(running).toMatchObject({ executionOwner: 'controller', closable: true });
      const runningRow = board.running.find((r) => r.lifecycle === 'running');
      expect(runningRow).toMatchObject({ executionOwner: 'worker', closable: false });
    });

    it('AC3: guardian_heartbeat 空表 → {present:false}', () => {
      const board = getLiveBoard();
      expect(board.guardian).toEqual({ present: false });
    });

    it('AC3: fast_tick_sec=30 且 last_beat_at 為 100 秒前 → stale=true', () => {
      const staleMs = Date.now() - 100_000;
      conn.prepare(
        `INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
         VALUES (1, 111, 'host-1', ?, ?, 30, 600, 0, NULL, ?)`,
      ).run(new Date(staleMs).toISOString(), new Date(staleMs).toISOString(), new Date().toISOString());
      const board = getLiveBoard();
      expect(board.guardian).toMatchObject({ present: true, stale: true });
    });

    it('AC3: last_beat_at 為 10 秒前(閾值 90 秒) → stale=false', () => {
      const freshMs = Date.now() - 10_000;
      conn.prepare(
        `INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
         VALUES (1, 111, 'host-1', ?, ?, 30, 600, 0, NULL, ?)`,
      ).run(new Date(freshMs).toISOString(), new Date(freshMs).toISOString(), new Date().toISOString());
      const board = getLiveBoard();
      expect(board.guardian).toMatchObject({ present: true, stale: false });
    });

    it('AC4: 60 列全數出現在 running+四段佇列聯集，≤6 次 prepare 查詢，<300ms', () => {
      const lifecycles = ['dispatching', 'running', 'reported', 'awaiting-review', 'revising', 'approved'];
      for (let i = 0; i < 60; i += 1) {
        insertRun(conn, { lifecycle: lifecycles[i % lifecycles.length] });
      }
      const prepareSpy = vi.spyOn(conn, 'prepare');
      const start = Date.now();
      const board = getLiveBoard();
      const elapsed = Date.now() - start;

      expect(prepareSpy.mock.calls.length).toBeLessThanOrEqual(6);
      expect(elapsed).toBeLessThan(300);

      const unionIds = new Set([
        ...board.running.map((r) => r.run_id),
        ...board.queues.pendingAck.map((r) => r.run_id),
        ...board.queues.pendingReview.map((r) => r.run_id),
        ...board.queues.pendingClose.map((r) => r.run_id),
        ...board.queues.attention.map((r) => r.run_id),
      ]);
      expect(unionIds.size).toBe(60);
    });

    it('AC15: getDb() 回 null → 讀取類 fail-open 回空集合，不崩潰', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const board = getLiveBoard();
      expect(board.guardian).toEqual({ present: false });
      expect(board.running).toEqual([]);
    });

    // ── AC16/BR-055：attention 聯集補 stalled-suspect（whp-9 spec BR-006 conformance）──
    it('AC16: health_flag=stalled-suspect 且 requires_attention=0 → 仍出現在 attention（且同時在 running）', () => {
      const stalled = insertRun(conn, { lifecycle: 'running', requires_attention: 0, health_flag: 'stalled-suspect' });
      const board = getLiveBoard();
      expect(board.queues.attention.some((r) => r.run_id === stalled.run_id)).toBe(true);
      expect(board.running.some((r) => r.run_id === stalled.run_id)).toBe(true);
    });

    it('AC16: requires_attention=1 且 health_flag=null 仍出現在 attention（聯集，非取代）', () => {
      const flagged = insertRun(conn, { lifecycle: 'abandoned', requires_attention: 1, health_flag: null });
      const board = getLiveBoard();
      expect(board.queues.attention.some((r) => r.run_id === flagged.run_id)).toBe(true);
    });
  });

  // ── AC5：listWorkerRuns ────────────────────────────────────

  describe('listWorkerRuns', () => {
    beforeEach(() => {
      insertRun(conn, { story_id: 'story-a', phase: 'dev-story', controller_track: 'backend-track', lifecycle: 'closed', close_source: 'UserClosed' });
      insertRun(conn, { story_id: 'story-b', phase: 'code-review', controller_track: 'frontend-track', lifecycle: 'running' });
      insertRun(conn, { story_id: 'story-a', phase: 'dev-story', controller_track: 'backend-track', lifecycle: 'closed', close_source: 'ControllerAfterHandshake' });
    });

    it('lifecycle + track 篩選 + pageSize clamp 至 100 + total 為未分頁列數', () => {
      const result = listWorkerRuns({ lifecycle: 'closed', track: 'backend-track', page: 1, pageSize: 999 });
      expect(result.items.length).toBeLessThanOrEqual(100);
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('page=0 視為 1（下限 clamp）', () => {
      const result = listWorkerRuns({ page: 0 });
      expect(result.page).toBe(1);
    });

    it('預設排序為 started_at DESC', () => {
      const result = listWorkerRuns({});
      const startedAts = result.items.map((r) => r.started_at);
      const sorted = [...startedAts].sort().reverse();
      expect(startedAts).toEqual(sorted);
    });

    it('storyId 注入字串 → 0 列（parameterized 綁定，非全表）', () => {
      const result = listWorkerRuns({ storyId: "' OR 1=1--" });
      expect(result.items.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('getDb() 回 null → fail-open 空集合', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const result = listWorkerRuns({});
      expect(result).toEqual({ items: [], total: 0, page: 1 });
    });
  });

  // ── AC6：getWorkerRunDetail ────────────────────────────────

  describe('getWorkerRunDetail', () => {
    it('run + messages(seq ASC) + handoff 三合一', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      const now = '2026-07-28T00:00:00+08:00';
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, created_at) VALUES (?,3,'controller-to-worker','wake','c','a',?)`).run(runId, now);
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, created_at) VALUES (?,1,'controller-to-worker','wake','a','a',?)`).run(runId, now);
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, created_at) VALUES (?,2,'controller-to-worker','wake','b','a',?)`).run(runId, now);
      insertHandoff(conn, runId);

      const detail = getWorkerRunDetail(runId);
      expect(detail).not.toBeNull();
      expect(detail!.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
      expect(detail!.handoff).not.toBeNull();
    });

    it('尚無 worker_handoffs 列 → handoff===null（非拋錯）', () => {
      const run = insertRun(conn);
      const detail = getWorkerRunDetail(run.run_id as string);
      expect(detail!.handoff).toBeNull();
    });

    it('未知 runId → null（route 轉 404）', () => {
      expect(getWorkerRunDetail('does-not-exist')).toBeNull();
    });
  });

  // ── AC7/AC15：ackWorkerRun ─────────────────────────────────

  describe('ackWorkerRun', () => {
    it('lifecycle=running → 409 具名訊息 + currentLifecycle', () => {
      const run = insertRun(conn, { lifecycle: 'running' });
      const result = ackWorkerRun(run.run_id as string, 'CC-OPUS');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.body['error']).toContain('running');
        expect(result.body['currentLifecycle']).toBe('running');
      }
    });

    it('lifecycle=reported → 200，轉 awaiting-review，ack_at 符合 +08:00 offset', () => {
      const run = insertRun(conn, { lifecycle: 'reported' });
      const result = ackWorkerRun(run.run_id as string, 'CC-OPUS');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.lifecycle).toBe('awaiting-review');
        expect(result.data.ack_at).toMatch(/\+08:00$/);
        expect(result.data.ack_by).toBe('CC-OPUS');
      }
    });

    it('未帶 ackBy 時 ack_by 預設 devconsole-ui', () => {
      const run = insertRun(conn, { lifecycle: 'reported' });
      const result = ackWorkerRun(run.run_id as string, undefined);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.ack_by).toBe('devconsole-ui');
    });

    it('重複呼叫第二次 → 409 附既有 ackAt/ackBy（E19）', () => {
      const run = insertRun(conn, { lifecycle: 'reported' });
      ackWorkerRun(run.run_id as string, 'CC-OPUS');
      const second = ackWorkerRun(run.run_id as string, 'CC-SONNET');
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.status).toBe(409);
        expect(second.body['ackBy']).toBe('CC-OPUS');
        expect(second.body['ackAt']).toMatch(/\+08:00$/);
      }
    });

    it('AC15：三並行寫入者不互蓋 — 先寫 health_flag，ack 後仍存活', () => {
      const run = insertRun(conn, { lifecycle: 'reported' });
      const runId = run.run_id as string;
      conn.prepare('UPDATE worker_runs SET health_flag = ? WHERE run_id = ?').run('stalled-suspect', runId);
      ackWorkerRun(runId, 'CC-OPUS');
      const row = conn.prepare('SELECT health_flag FROM worker_runs WHERE run_id = ?').get(runId) as { health_flag: string };
      expect(row.health_flag).toBe('stalled-suspect');
    });

    it('未知 runId → 404', () => {
      const result = ackWorkerRun('does-not-exist', 'CC-OPUS');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(404);
    });
  });

  // ── AC8：addWorkerMessage ──────────────────────────────────

  describe('addWorkerMessage', () => {
    it('缺 mode → 400，零寫入', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      const before = (conn.prepare('SELECT COUNT(*) c FROM worker_messages').get() as { c: number }).c;
      const result = addWorkerMessage(runId, { direction: 'controller-to-worker', msgType: 'wake', body: 'x', author: 'CC-OPUS' });
      const after = (conn.prepare('SELECT COUNT(*) c FROM worker_messages').get() as { c: number }).c;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
      expect(after).toBe(before);
    });

    it('mode=append → 201，舊列仍 pending，新列 pending 且 delivered_via 為 null', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      const now = '2026-07-28T00:00:00+08:00';
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES (?,1,'controller-to-worker','wake','old','a','pending',?)`).run(runId, now);

      const result = addWorkerMessage(runId, { direction: 'controller-to-worker', msgType: 'wake', body: 'new', author: 'CC-OPUS', mode: 'append' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.message.state).toBe('pending');
        expect(result.data.message.delivered_via).toBeNull();
      }
      const old = conn.prepare('SELECT state FROM worker_messages WHERE seq = 1 AND run_id = ?').get(runId) as { state: string };
      expect(old.state).toBe('pending');
    });

    it('mode=replace → 201，舊列變 superseded（非刪除），supersededCount=1', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      const now = '2026-07-28T00:00:00+08:00';
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES (?,1,'controller-to-worker','wake','old','a','pending',?)`).run(runId, now);

      const result = addWorkerMessage(runId, { direction: 'controller-to-worker', msgType: 'wake', body: 'new', author: 'CC-OPUS', mode: 'replace' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.supersededCount).toBe(1);
      const old = conn.prepare('SELECT state FROM worker_messages WHERE seq = 1 AND run_id = ?').get(runId) as { state: string };
      expect(old.state).toBe('superseded');
      const count = (conn.prepare('SELECT COUNT(*) c FROM worker_messages WHERE run_id = ?').get(runId) as { c: number }).c;
      expect(count).toBe(2); // 非刪除
    });

    it('同一 run 連寫 3 則 → seq 為 1、2、3', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      for (let i = 0; i < 3; i += 1) {
        addWorkerMessage(runId, { direction: 'controller-to-worker', msgType: 'wake', body: `m${i}`, author: 'CC-OPUS', mode: 'append' });
      }
      const rows = conn.prepare('SELECT seq FROM worker_messages WHERE run_id = ? ORDER BY seq ASC').all(runId) as Array<{ seq: number }>;
      expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    });

    it('msgType=nonsense → 400 且列出該 direction 合法值集合', () => {
      const run = insertRun(conn);
      const result = addWorkerMessage(run.run_id as string, {
        direction: 'controller-to-worker', msgType: 'nonsense', body: 'x', author: 'CC-OPUS', mode: 'append',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(Array.isArray(result.body['legalValues'])).toBe(true);
        expect((result.body['legalValues'] as string[]).length).toBeGreaterThan(0);
      }
    });
  });

  // ── AC9/AC10/AC15：gateWorkerRun ───────────────────────────

  describe('gateWorkerRun', () => {
    it('AC9: lifecycle=reported 且 ack_at IS NULL → 409「未簽收不得裁決」，零欄位變動', () => {
      const run = insertRun(conn, { lifecycle: 'reported', ack_at: null });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);
      const result = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.body['error']).toContain('未簽收');
      }
      const after = conn.prepare('SELECT lifecycle FROM worker_runs WHERE run_id = ?').get(runId) as { lifecycle: string };
      expect(after.lifecycle).toBe('reported');
      const handoff = conn.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id = ?').get(runId) as { gate_result: string };
      expect(handoff.gate_result).toBe('pending');
    });

    it('AC9: 正常路徑 verdict=approved → 200，handoff.gate_result=approved + run.lifecycle=approved', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);
      const result = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.run.lifecycle).toBe('approved');
        expect(result.data.handoff?.gate_result).toBe('approved');
        expect(result.data.hint).toMatch(/POST \/:runId\/close/);
      }
    });

    it('AC9: 對同一 run 第二次 gate → 409（gate_result CAS 命中 0 列，E8）', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);
      gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      const second = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.status).toBe(409);
    });

    it('AC9: 跨軌未帶 override → 409；帶 override+overrideReason → 200 且 override_reason 非空', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', controller_track: 'backend-track' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      const blocked = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS', callerTrack: 'frontend-track' });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.status).toBe(409);

      const overridden = gateWorkerRun(runId, {
        verdict: 'approved', gateBy: 'CC-OPUS', callerTrack: 'frontend-track', override: true, overrideReason: '跨軌緊急處理',
      });
      expect(overridden.ok).toBe(true);
      if (overridden.ok) expect(overridden.data.handoff?.override_reason).toBe('跨軌緊急處理');
    });

    it('verdict=rejected → 400', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00' });
      const result = gateWorkerRun(run.run_id as string, { verdict: 'rejected', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    });

    it('尚無 worker_handoffs 列 → 409（非靜默建立）', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00' });
      const result = gateWorkerRun(run.run_id as string, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(409);
    });

    it('AC10: verdict=revise 同一 transaction 清空四欄 + INSERT pending revise 訊息', () => {
      const run = insertRun(conn, {
        lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', ack_by: 'CC-OPUS',
        reported_at: '2026-07-28T00:00:00+08:00', notify_count: 2,
      });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      const result = gateWorkerRun(runId, { verdict: 'revise', gateBy: 'CC-OPUS', gateNotes: 'AC3 的 file:line 抽樣對不上' });
      expect(result.ok).toBe(true);

      const after = conn.prepare('SELECT lifecycle, reported_at, ack_at, ack_by, notify_count FROM worker_runs WHERE run_id = ?').get(runId) as {
        lifecycle: string; reported_at: string | null; ack_at: string | null; ack_by: string | null; notify_count: number;
      };
      expect(after).toEqual({ lifecycle: 'revising', reported_at: null, ack_at: null, ack_by: null, notify_count: 0 });

      const msg = conn.prepare(`SELECT msg_type, state FROM worker_messages WHERE run_id = ? AND msg_type = 'revise'`).get(runId) as {
        msg_type: string; state: string;
      };
      expect(msg).toEqual({ msg_type: 'revise', state: 'pending' });
    });

    it('AC10: 插訊息階段強制拋錯 → 整筆 rollback（lifecycle 仍 awaiting-review，四欄未清空）', () => {
      // 以 trigger 模擬插訊息階段失敗（非 mock DB，真實 SQLite 層 abort）
      conn.exec(`
        CREATE TRIGGER trg_force_fail BEFORE INSERT ON worker_messages
        WHEN NEW.body = '__FORCE_FAIL_TEST__'
        BEGIN SELECT RAISE(ABORT, 'forced test failure'); END;
      `);
      const run = insertRun(conn, {
        lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', ack_by: 'CC-OPUS',
        reported_at: '2026-07-28T00:00:00+08:00', notify_count: 2,
      });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      expect(() => gateWorkerRun(runId, { verdict: 'revise', gateBy: 'CC-OPUS', gateNotes: '__FORCE_FAIL_TEST__' })).toThrow();

      const after = conn.prepare('SELECT lifecycle, reported_at, ack_at, ack_by, notify_count FROM worker_runs WHERE run_id = ?').get(runId) as {
        lifecycle: string; reported_at: string | null; ack_at: string | null; ack_by: string | null; notify_count: number;
      };
      expect(after).toEqual({
        lifecycle: 'awaiting-review', reported_at: '2026-07-28T00:00:00+08:00', ack_at: '2026-07-28T00:00:00+08:00',
        ack_by: 'CC-OPUS', notify_count: 2,
      });
      const handoff = conn.prepare('SELECT gate_result FROM worker_handoffs WHERE run_id = ?').get(runId) as { gate_result: string };
      expect(handoff.gate_result).toBe('pending');
    });

    it('AC13/BR-036: run_mode=inline + verdict=approved → 同一 transaction 直達 closed（非中繼態 approved），close_source=ControllerAfterHandshake 且 closed_at 非空', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', run_mode: 'inline' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      const result = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.run.lifecycle).toBe('closed');
        expect(result.data.run.close_source).toBe('ControllerAfterHandshake');
        expect(result.data.run.closed_at).not.toBeNull();
        expect(result.data.handoff?.gate_result).toBe('approved');
      }
    });

    it('AC13/BR-036: run_mode=window（既有路徑）+ verdict=approved → 仍停在 approved 不回歸，close_source/closed_at 維持 null', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', run_mode: 'window' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      const result = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.run.lifecycle).toBe('approved');
        expect(result.data.run.close_source).toBeNull();
        expect(result.data.run.closed_at).toBeNull();
      }
    });
  });

  // ── AC11 前置：checkClosePreconditions ─────────────────────

  describe('checkClosePreconditions', () => {
    it('四前置皆符合 → ok=true', () => {
      const run = insertRun(conn, { lifecycle: 'approved', ack_at: '2026-07-28T00:00:00+08:00', controller_track: 'backend-track' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId, { gate_result: 'approved' });
      const result = checkClosePreconditions(runId, undefined, undefined);
      expect(result.ok).toBe(true);
      expect(result.failedChecks).toEqual([]);
    });

    it('lifecycle 非 approved → failedChecks 含 lifecycle-not-approved', () => {
      const run = insertRun(conn, { lifecycle: 'running' });
      const result = checkClosePreconditions(run.run_id as string, undefined, undefined);
      expect(result.ok).toBe(false);
      expect(result.failedChecks).toContain('lifecycle-not-approved');
    });

    it('尚無 handoff 列 → failedChecks 含 gate-not-approved', () => {
      const run = insertRun(conn, { lifecycle: 'approved', ack_at: '2026-07-28T00:00:00+08:00' });
      const result = checkClosePreconditions(run.run_id as string, undefined, undefined);
      expect(result.failedChecks).toContain('gate-not-approved');
    });

    it('跨軌未帶 override → failedChecks 含 track-mismatch；帶 override 則不含', () => {
      const run = insertRun(conn, { lifecycle: 'approved', ack_at: '2026-07-28T00:00:00+08:00', controller_track: 'backend-track' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId, { gate_result: 'approved' });
      const blocked = checkClosePreconditions(runId, 'frontend-track', undefined);
      expect(blocked.failedChecks).toContain('track-mismatch');
      const allowed = checkClosePreconditions(runId, 'frontend-track', true);
      expect(allowed.failedChecks).not.toContain('track-mismatch');
    });

    it('AC13/BR-037: run_mode=inline → failedChecks 含 run-mode-inline，即使其餘四項前置皆符合', () => {
      const run = insertRun(conn, {
        lifecycle: 'approved', ack_at: '2026-07-28T00:00:00+08:00', controller_track: 'backend-track', run_mode: 'inline',
      });
      const runId = run.run_id as string;
      insertHandoff(conn, runId, { gate_result: 'approved' });
      const result = checkClosePreconditions(runId, undefined, undefined);
      expect(result.ok).toBe(false);
      expect(result.failedChecks).toContain('run-mode-inline');
    });
  });

  // ── AC15：ackAttention（第 9 支，承接 TD-WHP9-ATTENTION-QUEUE-UNBOUNDED）──

  describe('ackAttention', () => {
    it('BR045: CAS 降旗 → 200，requires_attention 為 0，UPDATE 只動 requires_attention+updated_at 兩欄', () => {
      const run = insertRun(conn, { lifecycle: 'abandoned', requires_attention: 1 });
      const runId = run.run_id as string;
      const before = conn.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as Record<string, unknown>;

      const result = ackAttention(runId, 'CC-OPUS');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.requires_attention).toBe(0);
        expect(result.data.lifecycle).toBe('abandoned'); // BR-047：終態不被改寫
      }

      const after = conn.prepare('SELECT * FROM worker_runs WHERE run_id = ?').get(runId) as Record<string, unknown>;
      // 除 requires_attention / updated_at 外，其餘欄位皆與寫入前一致（欄位範圍 UPDATE 驗證）
      for (const key of Object.keys(before)) {
        if (key === 'requires_attention' || key === 'updated_at') continue;
        expect(after[key]).toEqual(before[key]);
      }
    });

    it('BR046: 再按一次（CAS 命中 0 列）→ 409 附 currentValue:0（冪等）', () => {
      const run = insertRun(conn, { lifecycle: 'abandoned', requires_attention: 1 });
      const runId = run.run_id as string;
      ackAttention(runId, 'CC-OPUS');
      const second = ackAttention(runId, 'CC-SONNET');
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.status).toBe(409);
        expect(second.body['currentValue']).toBe(0);
      }
    });

    it('BR048: 同交易內寫一則 worker_messages，未帶 ackBy 時 author 預設 devconsole-ui', () => {
      const run = insertRun(conn, { lifecycle: 'running', requires_attention: 1 });
      const runId = run.run_id as string;
      ackAttention(runId, undefined);
      const msg = conn.prepare(
        `SELECT direction, msg_type, author FROM worker_messages WHERE run_id = ? ORDER BY seq DESC LIMIT 1`,
      ).get(runId) as { direction: string; msg_type: string; author: string };
      expect(msg).toEqual({ direction: 'worker-to-controller', msg_type: 'progress', author: 'devconsole-ui' });
    });

    it('未知 runId → 404', () => {
      const result = ackAttention('does-not-exist', 'CC-OPUS');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(404);
    });

    it('getDb() 回 null → 503 附 dbUnavailable:true', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const result = ackAttention('any-run', 'CC-OPUS');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(503);
        expect(result.body['dbUnavailable']).toBe(true);
      }
    });
  });

  // ── AC14：時間戳 offset-aware ──────────────────────────────

  describe('時間戳 offset-aware（AC14）', () => {
    it('ack 寫入的 ack_at/updated_at 皆符合 +08:00 結尾', () => {
      const run = insertRun(conn, { lifecycle: 'reported' });
      const result = ackWorkerRun(run.run_id as string, 'CC-OPUS');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ack_at).toMatch(/\+08:00$/);
        expect(result.data.updated_at).toMatch(/\+08:00$/);
      }
    });

    // CR R1 F6：AC14 明訂「本地 helper 與 .context-db/scripts/timezone.js 的
    // getTaiwanTimestamp() 前 19 字元相同且皆以 +08:00 結尾」，原測試缺此斷言。
    // 用 runtime dynamic import（非靜態 specifier）取得權威實作 —— TypeScript 不會
    // 把該檔納入 program，故不違反 tsconfig.server.json 的 rootDir:"server" 邊界。
    it('CR-F6/AC14: 本地 helper 與 .context-db timezone.js 輸出前 19 字元相同', async () => {
      const tzPath = path.resolve(REPO_ROOT, '.context-db/scripts/timezone.js');
      expect(fs.existsSync(tzPath)).toBe(true);

      const tzUrl = pathToFileURL(tzPath).href;
      const authoritative = (await import(/* @vite-ignore */ tzUrl)) as { getTaiwanTimestamp: () => string };
      const { getTaiwanTimestamp: local } = await import('../../utils/taiwanTime.js');

      // 兩次時鐘讀取可能跨秒；最多重試 3 輪（連續跨秒機率可忽略）
      let localTs = '';
      let authTs = '';
      for (let i = 0; i < 3; i += 1) {
        localTs = local();
        authTs = authoritative.getTaiwanTimestamp();
        if (localTs.slice(0, 19) === authTs.slice(0, 19)) break;
      }

      expect(localTs.slice(0, 19)).toBe(authTs.slice(0, 19));
      expect(localTs).toMatch(/\+08:00$/);
      expect(authTs).toMatch(/\+08:00$/);
    });
  });

  // ── CR R1 F2：寫入類 fail-open 必須回 503（AC15）─────────────

  describe('fail-open 狀態碼（CR-F2 / AC15）', () => {
    it('getDb() 回 null 時 ack/messages/gate 三支寫入類皆回 503（非 409）', () => {
      vi.mocked(db.getDb).mockReturnValue(null);

      const ack = ackWorkerRun('any-run', 'CC-OPUS');
      const msg = addWorkerMessage('any-run', { direction: 'controller-to-worker', msgType: 'wake', body: 'x', author: 'a', mode: 'append' });
      const gate = gateWorkerRun('any-run', { verdict: 'approved', gateBy: 'CC-OPUS' });

      for (const r of [ack, msg, gate]) {
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.status).toBe(503);
          expect(r.body['dbUnavailable']).toBe(true);
        }
      }
    });

    it('checkClosePreconditions 在 DB 不可用時具名 db-unavailable（供 route 轉 503）', () => {
      vi.mocked(db.getDb).mockReturnValue(null);
      const result = checkClosePreconditions('any-run', undefined, undefined);
      expect(result.ok).toBe(false);
      expect(result.failedChecks).toContain('db-unavailable');
    });

    it('isDbReady 反映 getDb() 可用性', () => {
      expect(isDbReady()).toBe(true);
      vi.mocked(db.getDb).mockReturnValue(null);
      expect(isDbReady()).toBe(false);
    });
  });

  // ── CR R1 F3：非數值分頁參數不得打到 SQL 綁定 ─────────────────

  describe('分頁參數邊界（CR-F3）', () => {
    it('page/pageSize 為 NaN（?page=abc 的 parseInt 結果）→ 落回預設值，不拋 SqliteError', () => {
      insertRun(conn);
      expect(() => listWorkerRuns({ page: NaN, pageSize: NaN })).not.toThrow();
      const result = listWorkerRuns({ page: NaN, pageSize: NaN });
      expect(result.page).toBe(1);
      expect(result.items.length).toBe(1);
    });

    it('page/pageSize 為小數 → 取整後仍為合法綁定值', () => {
      insertRun(conn);
      const result = listWorkerRuns({ page: 1.7, pageSize: 5.9 });
      expect(result.page).toBe(1);
      expect(result.items.length).toBe(1);
    });
  });

  // ── CR R1 F1/F9/F10：與 whp-5 的協議層一致性（G25）───────────

  describe('G25 協議層對照 whp-5（CR-F1 / F9 / F10）', () => {
    it('CR-F1: msg_type 白名單與 whp-5 worker-protocol-ops.js 逐字相同', () => {
      const opsPath = path.resolve(REPO_ROOT, '.context-db/scripts/worker-protocol-ops.js');
      expect(fs.existsSync(opsPath)).toBe(true);
      const src = fs.readFileSync(opsPath, 'utf-8').replace(/\r\n/g, '\n');

      const extract = (direction: string): string[] => {
        const re = new RegExp(`'${direction}':\\s*new Set\\(\\[([^\\]]*)\\]\\)`);
        const m = src.match(re);
        expect(m, `worker-protocol-ops.js 未找到 ${direction} 的 msg_type 集合`).toBeTruthy();
        return (m as RegExpMatchArray)[1]!.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
      };

      // 對照本服務的白名單（透過一次「非法值」呼叫把合法值集合取回，避免匯出私有常數）
      const run = insertRun(conn);
      const probe = (direction: string): string[] => {
        const r = addWorkerMessage(run.run_id as string, { direction, msgType: '__illegal__', body: 'x', author: 'a', mode: 'append' });
        expect(r.ok).toBe(false);
        if (r.ok) return [];
        return r.body['legalValues'] as string[];
      };

      expect(probe('controller-to-worker').sort()).toEqual(extract('controller-to-worker').sort());
      expect(probe('worker-to-controller').sort()).toEqual(extract('worker-to-controller').sort());
    });

    it('CR-F9: mode=replace 對 delivered 舊指示回 warning（不可撤回），僅 supersede pending', () => {
      const run = insertRun(conn);
      const runId = run.run_id as string;
      const now = '2026-07-28T00:00:00+08:00';
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES (?,1,'controller-to-worker','wake','pend','a','pending',?)`).run(runId, now);
      conn.prepare(`INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, created_at) VALUES (?,2,'controller-to-worker','wake','deliv','a','delivered',?)`).run(runId, now);

      const result = addWorkerMessage(runId, { direction: 'controller-to-worker', msgType: 'wake', body: 'new', author: 'CC-OPUS', mode: 'replace' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.supersededCount).toBe(1);
        expect(result.data.warnings.length).toBe(1);
        expect(result.data.warnings[0]).toContain('已送達');
      }
      const states = conn.prepare('SELECT seq, state FROM worker_messages WHERE run_id = ? ORDER BY seq').all(runId) as Array<{ seq: number; state: string }>;
      expect(states.find((s) => s.seq === 1)!.state).toBe('superseded');
      expect(states.find((s) => s.seq === 2)!.state).toBe('delivered'); // delivered 不被改動
    });

    it('CR-F10: revise 後第二輪 approve 不得把 override_reason 覆寫為 NULL', () => {
      const run = insertRun(conn, { lifecycle: 'awaiting-review', ack_at: '2026-07-28T00:00:00+08:00', controller_track: 'backend-track' });
      const runId = run.run_id as string;
      insertHandoff(conn, runId);

      // 第一輪：跨軌 override 要求修正
      const first = gateWorkerRun(runId, {
        verdict: 'revise', gateBy: 'CC-OPUS', gateNotes: '請補測試',
        callerTrack: 'frontend-track', override: true, overrideReason: '跨軌緊急處理',
      });
      expect(first.ok).toBe(true);

      // worker 重新回報並簽收後，第二輪同軌核可（不帶 override）
      conn.prepare(`UPDATE worker_runs SET lifecycle='awaiting-review', ack_at=?, ack_by='CC-OPUS' WHERE run_id=?`).run('2026-07-28T01:00:00+08:00', runId);
      const second = gateWorkerRun(runId, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(second.ok).toBe(true);

      const handoff = conn.prepare('SELECT override_reason FROM worker_handoffs WHERE run_id = ?').get(runId) as { override_reason: string | null };
      expect(handoff.override_reason).toBe('跨軌緊急處理');
    });

    it('CR-F8: gate 三段 guard 各自可辨識 — 未 ack / 非 awaiting-review 訊息不同', () => {
      const notAcked = insertRun(conn, { lifecycle: 'reported', ack_at: null });
      insertHandoff(conn, notAcked.run_id as string);
      const r1 = gateWorkerRun(notAcked.run_id as string, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(r1.ok).toBe(false);
      if (!r1.ok) expect(r1.body['error']).toContain('未簽收');

      // ack 有值但 lifecycle 仍非 awaiting-review → 走第二段 guard，訊息不同
      const wrongLifecycle = insertRun(conn, { lifecycle: 'running', ack_at: '2026-07-28T00:00:00+08:00' });
      insertHandoff(conn, wrongLifecycle.run_id as string);
      const r2 = gateWorkerRun(wrongLifecycle.run_id as string, { verdict: 'approved', gateBy: 'CC-OPUS' });
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.body['error']).toContain('非 awaiting-review');
        expect(r2.body['error']).not.toContain('未簽收');
      }
    });
  });
});
