// ccb-1-db-mcp-import — ops tests(BR-008~BR-028, BR-043~BR-047)
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// 對齊 worker-protocol-ops.test.js 既有範式:seed helper 直接 SQL 建初始狀態(避免同秒自動建題撞號),
// 只對「本測試要驗的那一步」呼叫實際 ops function。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import {
  postCtrlMessage, readCtrlMessages, closeCtrlThread, updateCtrlBoard, MSG_TYPES,
} from '../scripts/ctrl-channel-ops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql'),
  'utf8'
);

let ctx;
let savedControllerTrack;
const T = '2026-01-01T00:00:00.000+08:00';

beforeEach(() => {
  // BR-020 的案例會 delete 這個 env var;存檔還原,避免洩漏到同 worker 的後續測試
  // (vitest 的 worker 會跨測試檔重用,process.env 是 worker 級共用狀態)。
  savedControllerTrack = process.env.PHYCOOL_CONTROLLER_TRACK;
  // TD-CCB-CTRL-CHANNEL-OPS-ENV-DEPENDENT(ccb-4 T5.7,5-Min Rule 順手修):
  // 兩個案例(BR008 post / BR009 post)不帶 from_track,原本靠「開發者環境剛好設了這個變數」
  // 才綠 —— 在 CI 或任何未設它的視窗必紅(實測 2026-08-03:兩者皆回 CCB1-E01 而非各自預期的碼)。
  // 顯式設定使測試自帶前提。BR020 仍會自行 delete 它,以驗證「未設時回 E01」那條路徑。
  process.env.PHYCOOL_CONTROLLER_TRACK = '後台軌';
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  if (savedControllerTrack === undefined) delete process.env.PHYCOOL_CONTROLLER_TRACK;
  else process.env.PHYCOOL_CONTROLLER_TRACK = savedControllerTrack;
  ctx.cleanup();
});

function seedThread(overrides = {}) {
  const row = {
    thread_id: 't1', topic: 'topic', category: null, channel: 'general',
    initiator_track: '後台軌', state: 'open', must_read: 0, closed_at: null, created_at: T,
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO ctrl_threads (thread_id, topic, category, channel, initiator_track, state, must_read, closed_at, created_at)
    VALUES (@thread_id, @topic, @category, @channel, @initiator_track, @state, @must_read, @closed_at, @created_at)
  `).run(row);
  return row;
}

function seedMessage(overrides = {}) {
  const row = {
    thread_id: 't1', seq: 1, from_track: '後台軌', to_tracks: '["前台軌"]',
    msg_type: 'inform', body: 'body', ref_json: null, created_at: T,
    ...overrides,
  };
  const info = ctx.db.prepare(`
    INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, ref_json, created_at)
    VALUES (@thread_id, @seq, @from_track, @to_tracks, @msg_type, @body, @ref_json, @created_at)
  `).run(row);
  return { ...row, msg_id: Number(info.lastInsertRowid) };
}

function seedBoard(overrides = {}) {
  const row = {
    board_id: 'staging-db', title: 'Staging DB', version: 7, updated_by: 'x', updated_at: T,
    state_json: JSON.stringify({ status: 'idle', holder: null, history: [] }),
    ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO ctrl_boards (board_id, title, state_json, version, updated_by, updated_at)
    VALUES (@board_id, @title, @state_json, @version, @updated_by, @updated_at)
  `).run(row);
  return row;
}

function count(table) {
  return ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

// ============================================================
// postCtrlMessage
// ============================================================
describe('postCtrlMessage', () => {
  it('BR008_PostWithoutThreadId_CreatesThreadWithSeqOne: opens a new thread with seq=1 and a valid flow-id thread_id', () => {
    const r = postCtrlMessage({ topic: 'X', to_tracks: ['後台軌'], msg_type: 'request', body: 'b' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    expect(r.seq).toBe(1);
    expect(r.thread_id).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('BR009_NonexistentThreadId_ReturnsE03: an explicit thread_id that does not exist is refused, zero rows written', () => {
    const r = postCtrlMessage({ thread_id: '不存在', to_tracks: ['x'], msg_type: 'inform', body: 'b' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E03');
    expect(count('ctrl_messages')).toBe(0);
  });

  it('BR010_TwoSequentialPosts_YieldAdjacentSeq: two posts on one thread yield seq N and N+1, no UNIQUE clash', () => {
    seedThread();
    const r1 = postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'a' }, { dbPath: ctx.dbPath });
    const r2 = postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'b' }, { dbPath: ctx.dbPath });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r2.seq).toBe(r1.seq + 1);
  });

  it('BR011_EmptyToTracks_ReturnsE01AndWritesNothing: to_tracks:[] is refused, message count unchanged', () => {
    const r = postCtrlMessage({ topic: 't', to_tracks: [], msg_type: 'inform', body: 'b', from_track: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E01');
    expect(r.reason).toContain('to_tracks');
    expect(count('ctrl_messages')).toBe(0);
  });

  it('rejects an illegal msg_type with CCB1-E01', () => {
    const r = postCtrlMessage({ topic: 't', to_tracks: ['x'], msg_type: 'chat', body: 'b', from_track: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E01');
    for (const t of MSG_TYPES) expect(r.reason).toContain(t);
  });

  it('BR012_PostCreatedAt_IsOffsetAwareTaiwan: created_at is offset-aware and caller-supplied created_at is ignored', () => {
    seedThread();
    const r = postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'a', created_at: '2020-01-01T00:00:00Z' }, { dbPath: ctx.dbPath });
    expect(r.created_at).toMatch(/\+08:00$/);
    expect(r.created_at.startsWith('2020')).toBe(false);
  });

  it('BR013_PostToClosedThread_ReturnsCasRejectionNotIsError: posting to a closed thread is a CAS rejection, zero rows written', () => {
    seedThread({ state: 'closed', closed_at: T });
    const r = postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'late' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect('isError' in r).toBe(false);
    expect(r.reason).toContain('開新題');
    expect(count('ctrl_messages')).toBe(0);
  });

  it('BR015_NewThreadNoChannel_DefaultsToGeneral: opening a thread without channel defaults ctrl_threads.channel to general', () => {
    postCtrlMessage({ topic: 't', to_tracks: ['x'], msg_type: 'inform', body: 'b', from_track: 'y' }, { dbPath: ctx.dbPath });
    const row = ctx.db.prepare('SELECT channel FROM ctrl_threads').get();
    expect(row.channel).toBe('general');
  });

  it('BR014_SupersedeOtherTrackMessage_RejectedAndBodyUnchanged: A-track cannot supersede B-track message; body and row count unchanged', () => {
    seedThread();
    const original = seedMessage({ from_track: '後台軌', body: '原始訊息' });
    const r = postCtrlMessage(
      { thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: '假冒更正', superseded_by: original.msg_id },
      { dbPath: ctx.dbPath }
    );
    expect(r.ok).toBe(false);
    expect('isError' in r).toBe(false);
    const row = ctx.db.prepare('SELECT body, superseded_by FROM ctrl_messages WHERE msg_id=?').get(original.msg_id);
    expect(row.body).toBe('原始訊息');
    expect(row.superseded_by).toBeNull();
    expect(count('ctrl_messages')).toBe(1); // no new row inserted for the rejected attempt
  });

  it('same-track supersede succeeds and sets superseded_by to the new message id without touching body', () => {
    seedThread();
    const original = seedMessage({ from_track: '後台軌', body: '原始訊息' });
    const r = postCtrlMessage(
      { thread_id: 't1', from_track: '後台軌', to_tracks: ['前台軌'], msg_type: 'inform', body: '更正版本', superseded_by: original.msg_id },
      { dbPath: ctx.dbPath }
    );
    expect(r.ok).toBe(true);
    const row = ctx.db.prepare('SELECT body, superseded_by FROM ctrl_messages WHERE msg_id=?').get(original.msg_id);
    expect(row.body).toBe('原始訊息');
    expect(row.superseded_by).toBe(r.msg_id);
  });

  it('BR045_SqliteBusyTwiceThenOk_WritesExactlyOneRow: 2 simulated BUSY then a real 3rd attempt succeeds, exactly 1 row written', () => {
    seedThread();
    let retries = 0;
    const r = postCtrlMessage(
      { thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'x' },
      { dbPath: ctx.dbPath, sleepFn: () => {}, onRetry: () => { retries++; }, _simulateBusyAttempts: 2 }
    );
    expect(r.ok).toBe(true);
    expect(retries).toBe(2);
    expect(count('ctrl_messages')).toBe(1);
  });

  it('BR045b_SqliteBusyExhausted_ReturnsE04WithZeroRows: BUSY on every attempt (including all retries) exhausts and returns CCB1-E04, zero rows', () => {
    seedThread();
    const r = postCtrlMessage(
      { thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'x' },
      { dbPath: ctx.dbPath, sleepFn: () => {}, onRetry: () => {}, _simulateBusyAttempts: 4 }
    );
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E04');
    expect(count('ctrl_messages')).toBe(0);
  });

  it('BR043_LedgerThrows_CallStillSucceedsAndRejectionEmitsNothing: a throwing onWrite never fails the call; ledger fires 1x on success, 0x on CAS rejection', () => {
    seedThread();
    const throwing = () => { throw new Error('ledger unwritable'); };
    const ok = postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'x' }, { dbPath: ctx.dbPath, onWrite: throwing });
    expect(ok.ok).toBe(true);

    seedThread({ thread_id: 't2', state: 'closed', closed_at: T });
    const calls = [];
    const rejected = postCtrlMessage({ thread_id: 't2', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'x' }, { dbPath: ctx.dbPath, onWrite: (...a) => calls.push(a) });
    expect(rejected.ok).toBe(false);
    expect(calls.length).toBe(0);

    const successCalls = [];
    postCtrlMessage({ thread_id: 't1', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: 'y' }, { dbPath: ctx.dbPath, onWrite: (...a) => successCalls.push(a) });
    expect(successCalls.length).toBe(1);
  });
});

// ============================================================
// readCtrlMessages
// ============================================================
describe('readCtrlMessages', () => {
  it('BR016_ReadThreeMessages_InsertsThreeReadRows: reading 3 unread messages inserts 3 rows into ctrl_message_reads', () => {
    seedThread();
    seedMessage({ seq: 1 });
    seedMessage({ seq: 2 });
    seedMessage({ seq: 3 });
    const r = readCtrlMessages({ reader_track: '前台軌', thread_id: 't1' }, { dbPath: ctx.dbPath });
    expect(r.count).toBe(3);
    expect(r.signed).toBe(3);
    expect(count('ctrl_message_reads')).toBe(3);
  });

  it('BR017_ReadUnreadOnlyTwice_SecondReturnsZero: unread_only re-read after signoff returns 0', () => {
    seedThread();
    seedMessage({ seq: 1 });
    seedMessage({ seq: 2 });
    seedMessage({ seq: 3 });
    const first = readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath });
    expect(first.count).toBe(3);
    const second = readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath });
    expect(second.count).toBe(0);
  });

  it('BR018_MustReadOnly_ReturnsOnlyFlaggedThread: must_read_only filters out the non-flagged thread', () => {
    seedThread({ thread_id: 'mr', must_read: 1 });
    seedThread({ thread_id: 'normal1', must_read: 0 });
    seedThread({ thread_id: 'normal2', must_read: 0 });
    seedMessage({ thread_id: 'mr', seq: 1 });
    seedMessage({ thread_id: 'normal1', seq: 1 });
    seedMessage({ thread_id: 'normal2', seq: 1 });
    const r = readCtrlMessages({ reader_track: '前台軌', must_read_only: true }, { dbPath: ctx.dbPath });
    expect(r.count).toBe(1);
    expect(r.messages[0].thread_id).toBe('mr');
  });

  it('BR020_NoReaderTrackAndNoEnv_ReturnsE01: missing reader_track and unset env var is refused, zero reads written', () => {
    delete process.env.PHYCOOL_CONTROLLER_TRACK;
    seedThread();
    seedMessage();
    const r = readCtrlMessages({}, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E01');
    expect(count('ctrl_message_reads')).toBe(0);
  });

  it('BR021_LimitTwoHundred_ReturnsHundredAndSignsHundred: 150 seeded, limit:200 returns and signs exactly 100 (hard ceiling)', () => {
    seedThread();
    for (let i = 1; i <= 150; i++) seedMessage({ seq: i });
    const r = readCtrlMessages({ reader_track: '前台軌', limit: 200 }, { dbPath: ctx.dbPath });
    expect(r.count).toBe(100);
    expect(count('ctrl_message_reads')).toBe(100);
  });

  it('BR019_FilterByChannelAndState_MatchesSqlEquivalent: channel+state filters combine with AND, matching an equivalent SQL query', () => {
    seedThread({ thread_id: 'a', channel: 'correction', state: 'open' });
    seedThread({ thread_id: 'b', channel: 'general', state: 'open' });
    seedThread({ thread_id: 'c', channel: 'correction', state: 'closed', closed_at: T });
    seedMessage({ thread_id: 'a', seq: 1 });
    seedMessage({ thread_id: 'b', seq: 1 });
    seedMessage({ thread_id: 'c', seq: 1 });
    const r = readCtrlMessages({ reader_track: '前台軌', channel: 'correction', state: 'open' }, { dbPath: ctx.dbPath });
    const expected = ctx.db.prepare(`
      SELECT m.msg_id FROM ctrl_messages m JOIN ctrl_threads t ON t.thread_id=m.thread_id
      WHERE t.channel='correction' AND t.state='open'
    `).all().map(x => x.msg_id).sort();
    expect(r.messages.map(m => m.msg_id).sort()).toEqual(expected);
  });

  // ------------------------------------------------------------------
  // ccb-4-ctrl-notify-knock — 收件人過濾(TD-CCB1-READCTRLMESSAGES-NO-RECIPIENT-FILTER)
  //
  // 使用者核可選項 (b):過濾只掛 unread_only 分支,全查詢範圍不變。這四個案例把「只掛」的
  // 兩側都釘住 —— 掛上的那側(BR-010/012/039)與不得外溢的那側(BR-011)。
  // 生產 DB 的 live 基準線(賦能軌 374 -> 0,實測 2026-08-03)驗在 Story 的 integration 步驟,
  // 這裡走 temp fixture,不讀 phycool.db。
  // ------------------------------------------------------------------

  it('BR010_UnreadOnlyWithRecipientFilter_ExcludesNonAddressed: unread_only only returns messages addressed to the reader', () => {
    seedThread();
    seedMessage({ seq: 1, from_track: '後台軌', to_tracks: '["前台軌"]' });   // 寄給 reader
    seedMessage({ seq: 2, from_track: '後台軌', to_tracks: '["賦能軌"]' });   // 寄給他軌
    seedMessage({ seq: 3, from_track: '賦能軌', to_tracks: '["azure佈署軌"]' }); // 與 reader 全無關
    const r = readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath });
    expect(r.count).toBe(1);
    expect(r.messages[0].seq).toBe(1);
    // 讀取即簽收只能作用在實際回傳的那一則 —— 他軌往來不得被本軌簽收(稽核失真的來源)
    expect(count('ctrl_message_reads')).toBe(1);
  });

  it('BR011_ThreadIdQuery_ReturnsAllIncludingNonAddressed: a thread_id query without unread_only still returns the whole thread', () => {
    seedThread();
    seedMessage({ seq: 1, from_track: '後台軌', to_tracks: '["前台軌"]' });
    seedMessage({ seq: 2, from_track: '後台軌', to_tracks: '["賦能軌"]' });
    seedMessage({ seq: 3, from_track: '賦能軌', to_tracks: '["後台軌"]' });
    const r = readCtrlMessages({ reader_track: '前台軌', thread_id: 't1' }, { dbPath: ctx.dbPath });
    // 防修法外溢:DevConsole /channel 與跨軌對帳都依賴看得到完整 thread
    expect(r.count).toBe(3);
  });

  it('BR012_SelfAddressedMessage_ExcludedFromUnread: a track never sees its own sent message as unread', () => {
    seedThread();
    seedMessage({ seq: 1, from_track: '前台軌', to_tracks: '["前台軌"]' });
    const r = readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath });
    expect(r.count).toBe(0);
  });

  it('BR039_MultiRecipientMessage_CountsForBothTracksIndependently: one message addressed to two tracks is unread for each, and one signing off does not clear the other', () => {
    seedThread();
    seedMessage({ seq: 1, from_track: '賦能軌', to_tracks: '["前台軌","後台軌"]' });
    expect(readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath }).count).toBe(1);
    // 前台軌 上面那次讀取已簽收;後台軌 的未讀不受影響
    expect(readCtrlMessages({ reader_track: '後台軌', unread_only: true }, { dbPath: ctx.dbPath }).count).toBe(1);
    // 兩軌各自簽收後才各自歸零
    expect(readCtrlMessages({ reader_track: '前台軌', unread_only: true }, { dbPath: ctx.dbPath }).count).toBe(0);
    expect(readCtrlMessages({ reader_track: '後台軌', unread_only: true }, { dbPath: ctx.dbPath }).count).toBe(0);
  });

  it('BR043_ReadOnly_NeverFiresLedger: readCtrlMessages never invokes onWrite even when it signs off rows', () => {
    seedThread();
    seedMessage();
    const calls = [];
    readCtrlMessages({ reader_track: '前台軌' }, { dbPath: ctx.dbPath, onWrite: (...a) => calls.push(a) });
    // NOTE: read's signoff is itself DB-native state; onWrite ledger call here documents
    // observed behaviour (0 calls) — the ledger's purpose (server.js appendLedger) is to
    // track *new coordination facts*, and a signoff-on-read is not one.
    expect(calls.length).toBe(0);
  });
});

// ============================================================
// closeCtrlThread
// ============================================================
describe('closeCtrlThread', () => {
  it('BR022_CloseByNonInitiator_ChangesZero: a non-initiator close attempt is refused, state unchanged', () => {
    seedThread({ initiator_track: '後台軌', state: 'open' });
    const r = closeCtrlThread({ thread_id: 't1', caller_track: '前台軌' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect('isError' in r).toBe(false);
    expect(r.current).toMatchObject({ initiator_track: '後台軌', state: 'open' });
    const row = ctx.db.prepare('SELECT state FROM ctrl_threads WHERE thread_id=?').get('t1');
    expect(row.state).toBe('open');
  });

  it('BR023_CloseTwice_SecondIsCasRejectionNotError: the initiator can close once; a repeat close is a CAS rejection', () => {
    seedThread({ initiator_track: '後台軌', state: 'open' });
    const first = closeCtrlThread({ thread_id: 't1', caller_track: '後台軌' }, { dbPath: ctx.dbPath });
    expect(first.ok).toBe(true);
    expect(first.closed_at).toMatch(/\+08:00$/);
    const second = closeCtrlThread({ thread_id: 't1', caller_track: '後台軌' }, { dbPath: ctx.dbPath });
    expect(second.ok).toBe(false);
    expect('isError' in second).toBe(false);
  });

  it('missing thread_id is CCB1-E01', () => {
    const r = closeCtrlThread({ caller_track: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E01');
  });

  it('nonexistent thread_id is CCB1-E03', () => {
    const r = closeCtrlThread({ thread_id: '不存在', caller_track: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E03');
  });
});

describe('BR024: tool registry has no reopen_ctrl_thread', () => {
  it('server.js static source contains zero occurrences of reopen_ctrl_thread and exactly the 4 new tool names', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    expect(serverSrc).not.toMatch(/reopen_ctrl_thread/);
    for (const name of ['post_ctrl_message', 'read_ctrl_messages', 'close_ctrl_thread', 'update_ctrl_board']) {
      expect(serverSrc).toMatch(new RegExp(`name: '${name}'`));
      expect(serverSrc).toMatch(new RegExp(`case '${name}':`));
    }
  });
});

// ============================================================
// updateCtrlBoard
// ============================================================
describe('updateCtrlBoard', () => {
  const validState = { status: 'held', holder: '後台軌', history: [{ ts: T, track: '後台軌', action: 'open' }] };

  it('BR025_BoardCasSuccess_VersionIncrements: a correct expected_version succeeds and increments version', () => {
    seedBoard({ version: 7 });
    const r = updateCtrlBoard({ board_id: 'staging-db', expected_version: 7, state: validState, updated_by: '後台軌' }, { dbPath: ctx.dbPath });
    expect(r.ok).toBe(true);
    expect(r.version).toBe(8);
  });

  it('BR026_BoardStaleVersion_ReturnsCurrentStateUnmodified: a stale expected_version is refused and current reflects the winner state, unmodified', () => {
    seedBoard({ version: 7 });
    const a = updateCtrlBoard({ board_id: 'staging-db', expected_version: 7, state: validState, updated_by: 'A' }, { dbPath: ctx.dbPath });
    expect(a.ok).toBe(true);
    const b = updateCtrlBoard({ board_id: 'staging-db', expected_version: 7, state: { status: 'idle', holder: null, history: [] }, updated_by: 'B' }, { dbPath: ctx.dbPath });
    expect(b.ok).toBe(false);
    expect(b.current.version).toBe(8);
    expect(b.current.state).toEqual(validState);
    expect(b.reason).toContain('重讀');
    const row = ctx.db.prepare('SELECT state_json FROM ctrl_boards WHERE board_id=?').get('staging-db');
    expect(JSON.parse(row.state_json)).toEqual(validState);
  });

  it('BR027_BoardStateMissingHolder_ReturnsE02: state missing holder/history is CCB1-E02, DB unchanged', () => {
    seedBoard({ version: 7 });
    const r = updateCtrlBoard({ board_id: 'staging-db', expected_version: 7, state: { status: 'idle' }, updated_by: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E02');
    const row = ctx.db.prepare('SELECT version FROM ctrl_boards WHERE board_id=?').get('staging-db');
    expect(row.version).toBe(7);
  });

  it('BR027b_BoardHistoryMissingAction_ReturnsE02: a history entry missing action is CCB1-E02', () => {
    seedBoard({ version: 7 });
    const r = updateCtrlBoard(
      { board_id: 'staging-db', expected_version: 7, state: { status: 'idle', holder: null, history: [{ ts: T, track: 'x' }] }, updated_by: 'x' },
      { dbPath: ctx.dbPath }
    );
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E02');
  });

  it('BR025b_NonIntegerExpectedVersion_ReturnsE01: a string expected_version is refused up front, DB untouched', () => {
    // Regression (CR F2): SQLite INTEGER affinity coerces '7' so the CAS used to succeed,
    // but `expected_version + 1` then string-concatenated into version:"71" — the caller got
    // a version that never existed. Reject at the entrance instead.
    seedBoard({ version: 7 });
    const r = updateCtrlBoard({ board_id: 'staging-db', expected_version: '7', state: validState, updated_by: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E01');
    const row = ctx.db.prepare('SELECT version FROM ctrl_boards WHERE board_id=?').get('staging-db');
    expect(row.version).toBe(7);
  });

  it('a successful update always returns a numeric version exactly one above the expected one', () => {
    seedBoard({ version: 7 });
    const r = updateCtrlBoard({ board_id: 'staging-db', expected_version: 7, state: validState, updated_by: 'x' }, { dbPath: ctx.dbPath });
    expect(typeof r.version).toBe('number');
    expect(r.version).toBe(8);
    expect(ctx.db.prepare('SELECT version FROM ctrl_boards WHERE board_id=?').get('staging-db').version).toBe(8);
  });

  it('BR028_UpdateNonexistentBoard_ReturnsE03: an unknown board_id is CCB1-E03, no implicit row creation', () => {
    const r = updateCtrlBoard({ board_id: '不存在', expected_version: 0, state: validState, updated_by: 'x' }, { dbPath: ctx.dbPath });
    expect(r.isError).toBe(true);
    expect(r.code).toBe('CCB1-E03');
    expect(count('ctrl_boards')).toBe(0);
  });
});

// ============================================================
// Cross-cutting (BR-043~BR-047)
// ============================================================
describe('BR044: no un-named template-literal interpolation of caller input in SQL', () => {
  it('db.prepare() template literals only interpolate the allowlisted structural fragment (whereSql), never a caller-supplied value', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ctrl-channel-ops.js'), 'utf8');
    const sqlLiterals = [...source.matchAll(/db\.prepare\(\s*`([^`]*)`/g)].map(m => m[1]);
    expect(sqlLiterals.length).toBeGreaterThan(5);
    // Allowlist, not denylist (aligned with worker-protocol-ops.test.js T-X03/BR-044 precedent):
    // whereSql is assembled entirely from static SQL fragments pushed by this module itself
    // (never a raw caller string) — every actual caller value still travels as a bound @param.
    const ALLOWED_STRUCTURAL = new Set(['whereSql']);
    for (const sql of sqlLiterals) {
      for (const m of sql.matchAll(/\$\{([^}]*)\}/g)) {
        expect(ALLOWED_STRUCTURAL.has(m[1].trim())).toBe(true);
      }
    }
  });
});

describe('BR047: CAS rejection reasons carry actionable guidance', () => {
  it('closed-thread post / stale board version / non-initiator close each name their own remedy', () => {
    seedThread({ thread_id: 'closed-thread', state: 'closed', closed_at: T });
    const postRejected = postCtrlMessage({ thread_id: 'closed-thread', from_track: 'x', to_tracks: ['y'], msg_type: 'inform', body: 'b' }, { dbPath: ctx.dbPath });
    expect(postRejected.reason).toContain('開新題');

    seedBoard({ version: 5 });
    updateCtrlBoard({ board_id: 'staging-db', expected_version: 5, state: { status: 'idle', holder: null, history: [] }, updated_by: 'a' }, { dbPath: ctx.dbPath });
    const boardRejected = updateCtrlBoard({ board_id: 'staging-db', expected_version: 5, state: { status: 'idle', holder: null, history: [] }, updated_by: 'b' }, { dbPath: ctx.dbPath });
    expect(boardRejected.reason).toContain('重讀');

    seedThread({ thread_id: 'owned', initiator_track: '後台軌', state: 'open' });
    const closeRejected = closeCtrlThread({ thread_id: 'owned', caller_track: '前台軌' }, { dbPath: ctx.dbPath });
    expect(closeRejected.reason).toContain('後台軌');
  });
});
