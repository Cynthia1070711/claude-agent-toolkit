// ============================================================
// [ccb-1-db-mcp-import] Controller chat board — single write path (A1) behind
// `.context-db/server.js`'s thin MCP handlers:
//   postCtrlMessage / readCtrlMessages / closeCtrlThread / updateCtrlBoard
//
// Placement decision (SDD Spec §4.1, mirrors whp-5): `server.js` cannot be
// imported by tests without dragging in the embedder stack, so all CAS logic
// lives here as a plain ESM module instead. `server.js` supplies `onWrite`
// (its existing `appendLedger`) as an injected callback — this module never
// imports server.js and never touches the ledger directly.
//
// Structural reference: `worker-protocol-ops.js` (openDb / validationError /
// casRejection / safeOnWrite / isSqliteBusy / busy-retry loop). This module
// does not import its symbols — only mirrors its shape, per SDD Spec §7.
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';

const require = createRequire(import.meta.url);
// ccb-4 BR-009: 未讀述詞的唯一定義站點。ctrl-unread-sql 是 CommonJS(.cjs)—— 本目錄
// package.json 宣告 "type":"module",而 `.claude/hooks/*.js` 那三個消費端是 CJS,兩邊要
// 共用同一份定義只能走 .cjs。同 knock-worker-ops.js:27-30 消費 worker-directive-poll.cjs。
const { UNREAD_PREDICATE } = require('./ctrl-unread-sql.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

export const MSG_TYPES = new Set(['inform', 'discuss', 'request', 'handoff', 'decision', 'state']);

function openDb(dbPath) {
  const db = new Database(dbPath || DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Validation-tier failure — maps to MCP isError:true at the thin handler (CCB1-E01/E02/E03). */
function validationError(code, reason) {
  return { ok: false, isError: true, code, reason };
}

/** CAS-tier rejection — a legitimate zero-row outcome, never isError (BR-013/BR-023/BR-026). */
function casRejection(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

/** BR-043: ledger callback never blocks the main flow, and never fires on a failed/rejected call. */
function safeOnWrite(onWrite, table, op, data) {
  if (typeof onWrite !== 'function') return;
  try { onWrite(table, op, data); } catch { /* ledger failure must never fail the call */ }
}

function isSqliteBusy(err) {
  return !!err && (err.code === 'SQLITE_BUSY' || /SQLITE_BUSY/.test(err.message || ''));
}

/** Default synchronous backoff (better-sqlite3 has no async API). Tests inject a no-op. */
function blockingSleep(ms) {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

/**
 * BR-045: exponential backoff retry (200/400/600ms, 3 attempts) around a single
 * immediate-mode transaction call. Shared by all 3 mutating ops (post/close/board)
 * per §2.8's "任一寫入型 tool" framing — read_ctrl_messages reuses it too since its
 * signoff step is itself a write.
 */
function retryOnBusy(runImmediate, opts = {}) {
  const { sleepFn, onRetry } = opts;
  const sleep = sleepFn || blockingSleep;
  const notifyRetry = onRetry || (() => {});
  const delays = [200, 400, 600];
  let attempt = 0;
  for (;;) {
    try {
      return runImmediate();
    } catch (err) {
      if (isSqliteBusy(err) && attempt < delays.length) {
        notifyRetry(attempt, delays[attempt]);
        sleep(delays[attempt]);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/** BR-027/§4.5: BoardState shape guard — returns an error string, or null when valid. */
function validateBoardStateShape(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'state 必須為物件(BoardState shape:status/holder/history 必填)';
  }
  if (typeof state.status !== 'string' || state.status === '') {
    return 'state.status 必填且為非空 string';
  }
  if (!('holder' in state) || (state.holder !== null && typeof state.holder !== 'string')) {
    return 'state.holder 必填,型別為 string 或 null';
  }
  if (!Array.isArray(state.history)) {
    return 'state.history 必填且為陣列(可為空陣列)';
  }
  for (const h of state.history) {
    if (!h || typeof h.ts !== 'string' || typeof h.track !== 'string' || typeof h.action !== 'string') {
      return 'state.history 每筆須含 ts/track/action(皆 string)';
    }
  }
  if ('until' in state && state.until !== undefined && state.until !== null && typeof state.until !== 'string') {
    return 'state.until 若提供須為 string';
  }
  if ('note' in state && state.note !== undefined && state.note !== null && typeof state.note !== 'string') {
    return 'state.note 若提供須為 string';
  }
  return null;
}

// ============================================================
// postCtrlMessage — send / open-thread (BR-008~BR-015, BR-043~BR-045)
// ============================================================

/**
 * @param {object} args
 * @param {{dbPath?: string, onWrite?: Function, sleepFn?: Function, onRetry?: Function, _simulateBusyAttempts?: number}} [opts]
 *   `sleepFn`/`onRetry`/`_simulateBusyAttempts` exist purely so BR-045's retry path is
 *   assertable without wall-clock timing (SDD §2.8 validation column); production
 *   callers never pass them.
 */
export function postCtrlMessage(args = {}, opts = {}) {
  const { dbPath, onWrite, sleepFn, onRetry, _simulateBusyAttempts = 0 } = opts;
  const {
    thread_id, topic, category, channel, must_read,
    from_track, to_tracks, msg_type, body, ref_json, superseded_by,
  } = args;

  const caller = from_track || process.env.PHYCOOL_CONTROLLER_TRACK;
  if (!caller) return validationError('CCB1-E01', '缺少必填參數 from_track(或環境變數 PHYCOOL_CONTROLLER_TRACK 未設)');
  if (!Array.isArray(to_tracks) || to_tracks.length === 0) {
    return validationError('CCB1-E01', '缺少必填參數 to_tracks(必為非空陣列,顯式收件無預設值)');
  }
  if (!MSG_TYPES.has(msg_type)) {
    return validationError('CCB1-E01', `msg_type 必為 ${[...MSG_TYPES].join('/')} 之一,收到 "${msg_type}"`);
  }
  if (!body) return validationError('CCB1-E01', '缺少必填參數 body');
  if (!thread_id && !topic) return validationError('CCB1-E01', '未提供 thread_id 時,topic 為開新題必填參數');

  const db = openDb(dbPath);
  try {
    let busySimRemaining = _simulateBusyAttempts;

    const txn = db.transaction(() => {
      if (busySimRemaining > 0) {
        busySimRemaining--;
        const e = new Error('SQLITE_BUSY: simulated for retry test');
        e.code = 'SQLITE_BUSY';
        throw e;
      }

      const now = getTaiwanTimestamp();
      let resolvedThreadId = thread_id;

      if (!resolvedThreadId) {
        // BR-008: 沿用流水號格式('YYYY-MM-DD HH:mm:ss'),取自 getTaiwanTimestamp() 前 19 字元。
        resolvedThreadId = now.slice(0, 19).replace('T', ' ');
        try {
          db.prepare(
            `INSERT INTO ctrl_threads (thread_id, topic, category, channel, initiator_track, state, must_read, created_at)
             VALUES (@thread_id, @topic, @category, @channel, @initiator_track, 'open', @must_read, @created_at)`
          ).run({
            thread_id: resolvedThreadId,
            topic,
            category: category ?? null,
            channel: channel || 'general',
            initiator_track: caller,
            must_read: must_read ? 1 : 0,
            created_at: now,
          });
        } catch (err) {
          // 同秒兩個不同新題自動產生的 thread_id 撞號(second 級粒度)——CAS 拒絕而非 E04,
          // 呼叫端可原樣重試(下一秒即得新 ID)或改帶明確 thread_id。
          if (/UNIQUE constraint failed:\s*ctrl_threads\.thread_id/.test(err.message)) {
            return {
              reject: casRejection(`自動產生的 thread_id ${resolvedThreadId} 與既有話題同秒衝突,請重試(下一秒可得新 ID)或改帶明確 thread_id`, {
                thread_id: resolvedThreadId,
              }),
            };
          }
          throw err;
        }
      } else {
        const thread = db.prepare('SELECT thread_id, state FROM ctrl_threads WHERE thread_id=?').get(resolvedThreadId);
        if (!thread) return { reject: validationError('CCB1-E03', `thread_id "${resolvedThreadId}" 不存在`) };
        if (thread.state === 'closed') {
          return {
            reject: casRejection(`thread ${resolvedThreadId} 已 closed,續談請開新題並以 ref_json.thread_id 引用此題`, {
              thread_id: resolvedThreadId, current: { state: 'closed' },
            }),
          };
        }
      }

      // BR-014: superseded_by 僅允許更新呼叫端自己 from_track 的既有訊息,且不得修改 body。
      // 驗證放在 INSERT 之前 —— AC7 要求 cross-track 嘗試「全部逐字不變」(零新訊息落地)。
      if (superseded_by !== undefined && superseded_by !== null) {
        const target = db.prepare('SELECT msg_id, from_track FROM ctrl_messages WHERE msg_id=?').get(superseded_by);
        if (!target || target.from_track !== caller) {
          return {
            reject: casRejection(`superseded_by=${superseded_by} 非本軌(${caller})訊息或不存在,無法標記更正鏈`, {
              msg_id: superseded_by,
            }),
          };
        }
      }

      // BR-010: MAX(seq)+1 取號與 INSERT 同一 transaction,避免併發取到同號。
      const seqRow = db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS next_seq FROM ctrl_messages WHERE thread_id=?').get(resolvedThreadId);
      const seq = seqRow.next_seq;
      const refJsonStr = ref_json ? JSON.stringify(ref_json) : null;
      const info = db.prepare(
        `INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, ref_json, created_at)
         VALUES (@thread_id, @seq, @from_track, @to_tracks, @msg_type, @body, @ref_json, @created_at)`
      ).run({
        thread_id: resolvedThreadId, seq, from_track: caller,
        to_tracks: JSON.stringify(to_tracks), msg_type, body, ref_json: refJsonStr, created_at: now,
      });
      const newMsgId = Number(info.lastInsertRowid);

      if (superseded_by !== undefined && superseded_by !== null) {
        db.prepare('UPDATE ctrl_messages SET superseded_by=@new_msg_id WHERE msg_id=@old_msg_id AND from_track=@caller')
          .run({ new_msg_id: newMsgId, old_msg_id: superseded_by, caller });
      }

      return { thread_id: resolvedThreadId, msg_id: newMsgId, seq, created_at: now };
    });

    let result;
    try {
      result = retryOnBusy(() => txn.immediate(), { sleepFn, onRetry });
    } catch (err) {
      return validationError('CCB1-E04', `post_ctrl_message 失敗(${isSqliteBusy(err) ? 'SQLITE_BUSY 重試耗盡,交易已回滾未寫入任何列' : 'DB 錯誤'}):${err.message}`);
    }

    if (result.reject) return result.reject;

    safeOnWrite(onWrite, 'ctrl_messages', 'post', {
      thread_id: result.thread_id, msg_id: result.msg_id, seq: result.seq,
      from_track: caller, msg_type, to_tracks,
    });
    return { ok: true, thread_id: result.thread_id, msg_id: result.msg_id, seq: result.seq, created_at: result.created_at };
  } finally {
    db.close();
  }
}

// ============================================================
// readCtrlMessages — read / list / unread / signoff (BR-016~BR-021)
// ============================================================

/** @param {{dbPath?: string, onWrite?: Function, sleepFn?: Function, onRetry?: Function}} [opts] */
export function readCtrlMessages(args = {}, opts = {}) {
  const { dbPath, sleepFn, onRetry } = opts;
  const {
    reader_track, thread_id, channel, category, state,
    unread_only, must_read_only, limit,
  } = args;

  const reader = reader_track || process.env.PHYCOOL_CONTROLLER_TRACK;
  if (!reader) return validationError('CCB1-E01', '缺少必填參數 reader_track(或環境變數 PHYCOOL_CONTROLLER_TRACK 未設)');

  const db = openDb(dbPath);
  try {
    const where = [];
    const params = {};
    if (thread_id) { where.push('m.thread_id = @thread_id'); params.thread_id = thread_id; }
    if (channel) { where.push('t.channel = @channel'); params.channel = channel; }
    if (category) { where.push('t.category = @category'); params.category = category; }
    if (state) { where.push('t.state = @state'); params.state = state; }
    if (must_read_only) { where.push('t.must_read = 1'); }
    if (unread_only) {
      // ccb-4 BR-010 / BR-012:此分支原本只檢查「有無簽收列」,缺收件人與防自發自收兩條
      // (TD-CCB1-READCTRLMESSAGES-NO-RECIPIENT-FILTER)。使用者核可的選項 (b) 是「只掛
      // unread_only 分支」—— 全查詢範圍(thread_id / channel / category / state / must_read_only)
      // 一律不變,因為 DevConsole /channel 與跨軌對帳都依賴 thread_id 查得到完整 thread(BR-011)。
      where.push(UNREAD_PREDICATE);
      params.track = reader;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // BR-021: 預設 20,硬上限 100。
    const cappedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    params.limit = cappedLimit;

    const rows = db.prepare(`
      SELECT m.msg_id, m.thread_id, m.seq, m.from_track, m.to_tracks, m.msg_type, m.body,
             m.ref_json, m.superseded_by, m.created_at,
             t.topic AS thread_topic, t.category AS thread_category, t.channel AS thread_channel,
             t.state AS thread_state, t.must_read AS thread_must_read
      FROM ctrl_messages m
      JOIN ctrl_threads t ON t.thread_id = m.thread_id
      ${whereSql}
      ORDER BY m.created_at ASC, m.seq ASC
      LIMIT @limit
    `).all(params);

    const messages = rows.map(r => ({
      msg_id: r.msg_id, thread_id: r.thread_id, seq: r.seq, from_track: r.from_track,
      to_tracks: JSON.parse(r.to_tracks), msg_type: r.msg_type, body: r.body,
      ref_json: r.ref_json ? JSON.parse(r.ref_json) : null,
      superseded_by: r.superseded_by, created_at: r.created_at,
      thread: {
        topic: r.thread_topic, category: r.thread_category, channel: r.thread_channel,
        state: r.thread_state, must_read: r.thread_must_read,
      },
    }));

    if (messages.length === 0) return { messages: [], count: 0, signed: 0 };

    // BR-016/BR-021: 讀取即簽收,只對「實際回傳」(已截斷至 limit)的訊息 UPSERT。
    const now = getTaiwanTimestamp();
    let signed;
    try {
      signed = retryOnBusy(() => {
        const txn = db.transaction(() => {
          const upsert = db.prepare(`
            INSERT INTO ctrl_message_reads (msg_id, track, read_at) VALUES (@msg_id, @track, @read_at)
            ON CONFLICT(msg_id, track) DO UPDATE SET read_at=excluded.read_at
          `);
          for (const m of messages) upsert.run({ msg_id: m.msg_id, track: reader, read_at: now });
          return messages.length;
        });
        return txn.immediate();
      }, { sleepFn, onRetry });
    } catch (err) {
      return validationError('CCB1-E04', `read_ctrl_messages 簽收失敗(${isSqliteBusy(err) ? 'SQLITE_BUSY 重試耗盡' : 'DB 錯誤'}):${err.message}`);
    }

    // BR-043 scopes the ledger to the 3 mutating tools(post/close/board);read's signoff
    // is a DB-native read-side effect, not a new coordination fact worth disaster-recovery tracking.
    return { messages, count: messages.length, signed };
  } finally {
    db.close();
  }
}

// ============================================================
// closeCtrlThread — initiator-only CAS close (BR-022~BR-024)
// ============================================================

/** @param {{dbPath?: string, onWrite?: Function, sleepFn?: Function, onRetry?: Function}} [opts] */
export function closeCtrlThread(args = {}, opts = {}) {
  const { dbPath, onWrite, sleepFn, onRetry } = opts;
  const { thread_id, caller_track } = args;

  if (!thread_id) return validationError('CCB1-E01', '缺少必填參數 thread_id');
  const caller = caller_track || process.env.PHYCOOL_CONTROLLER_TRACK;
  if (!caller) return validationError('CCB1-E01', '缺少必填參數 caller_track(或環境變數 PHYCOOL_CONTROLLER_TRACK 未設)');

  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();
    let info;
    try {
      info = retryOnBusy(() => db.prepare(
        `UPDATE ctrl_threads SET state='closed', closed_at=@now
         WHERE thread_id=@thread_id AND initiator_track=@caller AND state='open'`
      ).run({ thread_id, caller, now }), { sleepFn, onRetry });
    } catch (err) {
      return validationError('CCB1-E04', `close_ctrl_thread 失敗(${isSqliteBusy(err) ? 'SQLITE_BUSY 重試耗盡' : 'DB 錯誤'}):${err.message}`);
    }

    if (info.changes === 0) {
      const current = db.prepare('SELECT state, initiator_track FROM ctrl_threads WHERE thread_id=?').get(thread_id);
      if (!current) return validationError('CCB1-E03', `thread_id "${thread_id}" 不存在`);
      if (current.initiator_track !== caller) {
        return casRejection(`thread ${thread_id} 由 ${current.initiator_track} 發起,非發起軌無法關閉,請發起軌執行`, {
          thread_id, current,
        });
      }
      return casRejection(`thread ${thread_id} 已於先前關閉(state=${current.state})`, { thread_id, current });
    }

    safeOnWrite(onWrite, 'ctrl_threads', 'close', { thread_id, caller_track: caller, closed_at: now });
    return { ok: true, thread_id, state: 'closed', closed_at: now };
  } finally {
    db.close();
  }
}

// ============================================================
// updateCtrlBoard — optimistic-lock blackboard (BR-025~BR-028)
// ============================================================

/** @param {{dbPath?: string, onWrite?: Function, sleepFn?: Function, onRetry?: Function}} [opts] */
export function updateCtrlBoard(args = {}, opts = {}) {
  const { dbPath, onWrite, sleepFn, onRetry } = opts;
  const { board_id, expected_version, state, updated_by } = args;

  if (!board_id) return validationError('CCB1-E01', '缺少必填參數 board_id');
  if (expected_version === undefined || expected_version === null) {
    return validationError('CCB1-E01', '缺少必填參數 expected_version');
  }
  // MCP inputSchema 宣告 type:'number' 但不強制,呼叫端仍可能送字串。SQLite 的 INTEGER
  // 欄位親和性會把 '7' 隱式轉成 7 讓 CAS 成功,但下方 `expected_version + 1` 會變成字串
  // 串接('7'+1 = '71'),回傳給呼叫端一個不存在的 version。在入口擋掉才不會寫對讀錯。
  if (!Number.isInteger(expected_version)) {
    return validationError('CCB1-E01', `expected_version 必為整數,收到 ${JSON.stringify(expected_version)}(${typeof expected_version})`);
  }
  const shapeError = validateBoardStateShape(state);
  if (shapeError) return validationError('CCB1-E02', shapeError);

  const by = updated_by || process.env.PHYCOOL_CONTROLLER_TRACK;
  if (!by) return validationError('CCB1-E01', '缺少必填參數 updated_by(或環境變數 PHYCOOL_CONTROLLER_TRACK 未設)');

  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();
    const stateJson = JSON.stringify(state);
    let info;
    try {
      info = retryOnBusy(() => db.prepare(
        `UPDATE ctrl_boards SET state_json=@state_json, version=version+1, updated_by=@by, updated_at=@now
         WHERE board_id=@board_id AND version=@expected_version`
      ).run({ board_id, state_json: stateJson, by, now, expected_version }), { sleepFn, onRetry });
    } catch (err) {
      return validationError('CCB1-E04', `update_ctrl_board 失敗(${isSqliteBusy(err) ? 'SQLITE_BUSY 重試耗盡' : 'DB 錯誤'}):${err.message}`);
    }

    if (info.changes === 0) {
      const current = db.prepare('SELECT version, state_json FROM ctrl_boards WHERE board_id=?').get(board_id);
      if (!current) return validationError('CCB1-E03', `board_id "${board_id}" 不存在(board 由 import 或明確建立產生,update 不隱式建列)`);
      return casRejection(
        `board ${board_id} 的 version 不符(expected=${expected_version}, current=${current.version}),請重讀最新 version 後重試`,
        { board_id, current: { version: current.version, state: JSON.parse(current.state_json) } }
      );
    }

    safeOnWrite(onWrite, 'ctrl_boards', 'update', { board_id, version_from: expected_version, updated_by: by });
    return { ok: true, board_id, version: expected_version + 1 };
  } finally {
    db.close();
  }
}
