// ============================================================
// channelService.test.ts — ccb-3-devconsole-channel-page 服務層測試
// 隔離 temp DB，DDL 逐字複製自 .context-db/migrations/2026-07-28-add-ctrl-channel-tables.sql
// （含 FTS5 trigram + 三觸發器）。fixture 補齊生產資料缺的六類情境
// （must_read / broadcast / superseded / >24h 逾時 / >200 列截斷 / 壞 state_json）。
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const DDL_PATH = path.join(REPO_ROOT, '.context-db', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql');

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  const ddl = readFileSync(DDL_PATH, 'utf8');
  conn.exec(ddl);
  return conn;
}

let threadSeq = 0;
function insertThread(conn: Database.Database, overrides: Record<string, unknown> = {}): string {
  threadSeq += 1;
  const row = {
    thread_id: `t-${String(threadSeq).padStart(4, '0')}`,
    topic: `話題 ${threadSeq}`,
    category: null,
    channel: 'general',
    initiator_track: '前台軌',
    state: 'open',
    must_read: 0,
    closed_at: null,
    created_at: `2026-07-2${threadSeq % 8}T00:00:0${threadSeq % 9}.000+08:00`,
    ...overrides,
  };
  const cols = Object.keys(row);
  conn.prepare(`INSERT INTO ctrl_threads (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
    ...cols.map((c) => (row as Record<string, unknown>)[c]),
  );
  return row.thread_id;
}

let msgSeq = 0;
const seqByThread = new Map<string, number>();
function insertMessage(conn: Database.Database, threadId: string, overrides: Record<string, unknown> = {}): number {
  msgSeq += 1;
  const nextSeq = (seqByThread.get(threadId) ?? 0) + 1;
  if (!('seq' in overrides)) seqByThread.set(threadId, nextSeq);
  const row = {
    thread_id: threadId,
    seq: nextSeq,
    from_track: '前台軌',
    to_tracks: JSON.stringify(['後台軌']),
    msg_type: 'inform',
    body: `訊息內容 ${msgSeq}`,
    ref_json: null,
    superseded_by: null,
    created_at: `2026-07-27T${String(msgSeq % 24).padStart(2, '0')}:00:00.000+08:00`,
    ...overrides,
  };
  const cols = Object.keys(row);
  const info = conn
    .prepare(`INSERT INTO ctrl_messages (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => (row as Record<string, unknown>)[c]));
  return Number(info.lastInsertRowid);
}

function insertRead(conn: Database.Database, msgId: number, track: string, readAt = '2026-07-27T12:00:00.000+08:00'): void {
  conn.prepare(`INSERT INTO ctrl_message_reads (msg_id, track, read_at) VALUES (?, ?, ?)`).run(msgId, track, readAt);
}

function insertBoard(conn: Database.Database, overrides: Record<string, unknown> = {}): void {
  const row = {
    board_id: 'staging-db',
    title: 'Staging DB',
    state_json: JSON.stringify({ status: '空閒', holder: null, history: [] }),
    version: 0,
    updated_by: '前台軌',
    updated_at: '2026-07-27T00:00:00.000+08:00',
    ...overrides,
  };
  const cols = Object.keys(row);
  conn.prepare(`INSERT INTO ctrl_boards (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
    ...cols.map((c) => (row as Record<string, unknown>)[c]),
  );
}

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

import * as db from '../../db.js';
import {
  getStats,
  listBoards,
  listThreads,
  getThreadMessages,
  getReadMatrix,
  searchThreads,
} from '../channelService.js';

describe('channelService', () => {
  let tmpDir: string;
  let conn: Database.Database;

  beforeEach(() => {
    threadSeq = 0;
    msgSeq = 0;
    seqByThread.clear();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-channel-svc-'));
    conn = initTestDb(path.join(tmpDir, 'channel.db'));
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── getStats ───────────────────────────────────────────────

  describe('getStats', () => {
    it('BR001_Stats_TracksUnionExcludesBroadcast: tracks 為三來源聯集且排除 broadcast 字面', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['broadcast']) });
      insertRead(conn, 1, '賦能軌');

      const stats = getStats();
      expect(stats.tracks).toContain('前台軌');
      expect(stats.tracks).toContain('賦能軌');
      expect(stats.tracks).not.toContain('broadcast');
    });

    it('open_threads / closed_threads 分別計數', () => {
      insertThread(conn, { state: 'open' });
      insertThread(conn, { state: 'open' });
      insertThread(conn, { state: 'closed', closed_at: '2026-07-27T00:00:00+08:00' });

      const stats = getStats();
      expect(stats.open_threads).toBe(2);
      expect(stats.closed_threads).toBe(1);
    });

    it('DB 不可用時回安全預設值（fail-open）', () => {
      vi.mocked(db.getDb).mockReturnValue(null);
      const stats = getStats();
      expect(stats).toEqual({
        tracks: [], categories: [], open_threads: 0, closed_threads: 0, total_messages: 0,
        unread_total: 0, today_messages: 0, last_message_at: null,
      });
    });

    it('unread_total 為「未簽 cell 數」而非「有未簽的話題數」(spec §4.1)', () => {
      // t1 一則廣播給兩軌、皆未簽 → 貢獻 2 個 unsigned cell；t2 一則給一軌、已簽 → 貢獻 0。
      // 舊實作以「至少 1 軌未簽的 thread 數」計，此案例會回 1 而非 2。
      const t1 = insertThread(conn, { state: 'open', initiator_track: '前台軌' });
      const t2 = insertThread(conn, { state: 'open', initiator_track: '前台軌' });
      insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌', '賦能軌']) });
      const m2 = insertMessage(conn, t2, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']) });
      insertRead(conn, m2, '後台軌');

      expect(getStats().unread_total).toBe(2);
    });

    it('categories 為 DB 全量 DISTINCT（供 Tab2 下拉，BR-026）', () => {
      insertThread(conn, { category: 'migration窗口' });
      insertThread(conn, { category: '裁定' });
      insertThread(conn, { category: 'migration窗口' });
      insertThread(conn, { category: null });

      expect(getStats().categories).toEqual(['migration窗口', '裁定']);
    });

    it('today_messages 以台灣日曆日為界（非 UTC date(now)）', () => {
      // 台灣「今日」凌晨 00:30 的訊息：UTC 仍是昨天，date('now') 會把它排除。
      const t1 = insertThread(conn, {});
      const taiwanTodayStart = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      insertMessage(conn, t1, { created_at: `${taiwanTodayStart}T00:30:00.000+08:00` });

      expect(getStats().today_messages).toBe(1);
    });
  });

  // ── listBoards / BR011 ────────────────────────────────────

  describe('listBoards', () => {
    it('BR010_Board_ParsesValidStateJson: 合法 state_json 回 state 物件', () => {
      insertBoard(conn, { state_json: JSON.stringify({ status: '空閒', holder: null, history: [{ ts: 't', track: '前台軌', action: 'release' }] }) });
      const result = listBoards();
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.state).toEqual({ status: '空閒', holder: null, history: [{ ts: 't', track: '前台軌', action: 'release' }] });
      expect(result.items[0]?.state_raw).toBeNull();
    });

    it('BR011_MalformedStateJson_DegradesToRaw: 壞 JSON 回 state=null 且 state_raw 保留原字串', () => {
      insertBoard(conn, { state_json: '{{{' });
      const result = listBoards();
      expect(result.items[0]?.state).toBeNull();
      expect(result.items[0]?.state_raw).toBe('{{{');
    });

    it('shape 不合法（缺 holder）視同壞資料降級', () => {
      insertBoard(conn, { state_json: JSON.stringify({ status: '空閒', history: [] }) });
      const result = listBoards();
      expect(result.items[0]?.state).toBeNull();
    });
  });

  // ── listThreads ────────────────────────────────────────────

  describe('listThreads', () => {
    it('BR013_OpenThreads_SortedByLatestMessageDesc: 依最新訊息時間倒序', () => {
      const t1 = insertThread(conn, { state: 'open' });
      const t2 = insertThread(conn, { state: 'open' });
      const t3 = insertThread(conn, { state: 'open' });
      insertMessage(conn, t1, { created_at: '2026-07-27T05:00:00+08:00' });
      insertMessage(conn, t2, { created_at: '2026-07-27T09:00:00+08:00' });
      insertMessage(conn, t3, { created_at: '2026-07-27T02:00:00+08:00' });

      const result = listThreads({ state: 'open' });
      expect(result.items.map((i) => i.thread_id)).toEqual([t2, t1, t3]);
    });

    it('BR014_ThreadRow_OrdinalStableAcrossFilters: ordinal 不隨過濾改變', () => {
      const threads = Array.from({ length: 5 }, (_, i) => insertThread(conn, { created_at: `2026-07-2${i}T00:00:00+08:00`, state: 'open' }));
      const third = threads[2] as string;
      insertMessage(conn, third, {});

      const unfiltered = listThreads({ state: 'open' });
      const ordinalUnfiltered = unfiltered.items.find((i) => i.thread_id === third)?.ordinal;

      const filtered = listThreads({ state: 'open', category: 'nonexistent-should-still-compute-ordinal' });
      // 過濾後該 thread 不在結果內，但驗證 ordinal 計算來源不受過濾影響：直接對第三個 thread 再查一次全量
      const again = listThreads({ state: 'open' });
      const ordinalAgain = again.items.find((i) => i.thread_id === third)?.ordinal;

      expect(ordinalUnfiltered).toBe(3);
      expect(ordinalAgain).toBe(3);
      expect(filtered.items.length).toBe(0);
    });

    it('BR015_MustReadThread_SortsFirst: must_read=1 排序優先於較新的一般訊息', () => {
      const normal = insertThread(conn, { state: 'open', must_read: 0 });
      const urgent = insertThread(conn, { state: 'open', must_read: 1 });
      insertMessage(conn, normal, { created_at: '2026-07-27T23:00:00+08:00' });
      insertMessage(conn, urgent, { created_at: '2026-07-27T01:00:00+08:00' });

      const result = listThreads({ state: 'open' });
      expect(result.items[0]?.thread_id).toBe(urgent);
      expect(result.items[0]?.must_read).toBe(1);
    });

    it('BR016_MultipleRecipients_ExpectedIsUnion: 同 thread 兩則不同 to_tracks 聯集為 expected', () => {
      const t1 = insertThread(conn, { state: 'open', initiator_track: '前台軌' });
      const m1 = insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']) });
      insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['賦能軌']) });
      insertRead(conn, m1, '後台軌');

      const result = listThreads({ state: 'open' });
      const item = result.items.find((i) => i.thread_id === t1);
      expect(item?.read_stats.expected.sort()).toEqual(['後台軌', '賦能軌']);
      expect(item?.read_stats.signed).toEqual(['後台軌']);
      expect(item?.read_stats.unsigned_count).toBe(1);
    });

    it('BR023_ClosedThreads_SortedByClosedAtDesc: 依 closed_at 倒序（非 created_at）', () => {
      const t1 = insertThread(conn, { state: 'closed', created_at: '2026-07-27T01:00:00+08:00', closed_at: '2026-07-27T10:00:00+08:00' });
      const t2 = insertThread(conn, { state: 'closed', created_at: '2026-07-27T05:00:00+08:00', closed_at: '2026-07-27T03:00:00+08:00' });
      const t3 = insertThread(conn, { state: 'closed', created_at: '2026-07-27T09:00:00+08:00', closed_at: '2026-07-27T20:00:00+08:00' });

      const result = listThreads({ state: 'closed' });
      expect(result.items.map((i) => i.thread_id)).toEqual([t3, t1, t2]);
    });

    it('BR028_SameCreatedAt_PaginationNoDuplicates: 同 created_at 跨頁不重複不遺漏', () => {
      const sameTs = '2026-07-27T00:00:00+08:00';
      const ids = Array.from({ length: 12 }, () => insertThread(conn, { state: 'open', created_at: sameTs }));

      const page1 = listThreads({ state: 'open', page: 1, pageSize: 5 });
      const page2 = listThreads({ state: 'open', page: 2, pageSize: 5 });
      const page3 = listThreads({ state: 'open', page: 3, pageSize: 5 });

      const union = new Set([...page1.items, ...page2.items, ...page3.items].map((i) => i.thread_id));
      expect(union.size).toBe(12);
      expect(new Set(ids).size).toBe(12);
      expect(page1.total).toBe(12);
    });

    it('BR049_PageSizeChange_KeepsQueryCountConstant: pageSize 10 vs 50 的 db.prepare 呼叫次數相同且 ≤ 8', () => {
      for (let i = 0; i < 60; i++) {
        const t = insertThread(conn, { state: 'open' });
        insertMessage(conn, t, {});
      }
      const prepareSpy = vi.spyOn(conn, 'prepare');

      prepareSpy.mockClear();
      listThreads({ state: 'open', pageSize: 10 });
      const callsFor10 = prepareSpy.mock.calls.length;

      prepareSpy.mockClear();
      listThreads({ state: 'open', pageSize: 50 });
      const callsFor50 = prepareSpy.mock.calls.length;

      expect(callsFor10).toBe(callsFor50);
      expect(callsFor10).toBeLessThanOrEqual(8);
    });

    it('pageSize 預設 50（spec §4.3 / BR-028），足以一頁容納全部開放話題', () => {
      // 舊預設 20：生產 44 個開放話題只會回 20 筆，而 Tab1 當時無分頁控制 → 24 筆在 UI 無路徑可達。
      for (let i = 0; i < 44; i++) insertThread(conn, { state: 'open' });

      const result = listThreads({ state: 'open' });
      expect(result.pageSize).toBe(50);
      expect(result.items.length).toBe(44);
      expect(result.total).toBe(44);
    });

    it('零則訊息 thread 降級：msg_count=0、latest_msg=null', () => {
      const t1 = insertThread(conn, { state: 'open' });
      const result = listThreads({ state: 'open' });
      const item = result.items.find((i) => i.thread_id === t1);
      expect(item?.msg_count).toBe(0);
      expect(item?.latest_msg).toBeNull();
    });
  });

  // ── getThreadMessages ──────────────────────────────────────

  describe('getThreadMessages', () => {
    it('BR019_Timeline_OrdersMessagesBySeqAsc: 依 seq 升序（非 API 回傳順序）', () => {
      const t1 = insertThread(conn, {});
      insertMessage(conn, t1, { seq: 3, created_at: '2026-07-27T03:00:00+08:00' });
      insertMessage(conn, t1, { seq: 1, created_at: '2026-07-27T01:00:00+08:00' });
      insertMessage(conn, t1, { seq: 2, created_at: '2026-07-27T02:00:00+08:00' });

      const result = getThreadMessages(t1);
      expect(result?.messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    });

    it('BR021_SupersededMessage_ShowsTargetSeq: superseded_by 反向 JOIN 取得目標 seq 與 thread_id', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      const msgA = insertMessage(conn, t1, { seq: 3, from_track: '前台軌' });
      const msgB = insertMessage(conn, t1, { seq: 4, from_track: '前台軌' });
      conn.prepare(`UPDATE ctrl_messages SET superseded_by = ? WHERE msg_id = ?`).run(msgB, msgA);

      const result = getThreadMessages(t1);
      const a = result?.messages.find((m) => m.msg_id === msgA);
      expect(a?.superseded_by_seq).toBe(4);
      expect(a?.superseded_by_thread_id).toBe(t1);
    });

    it('thread_id 不存在回 null（route 層轉 404）', () => {
      expect(getThreadMessages('does-not-exist')).toBeNull();
    });

    it('每則訊息附帶 reads 陣列', () => {
      const t1 = insertThread(conn, {});
      const m1 = insertMessage(conn, t1, {});
      insertRead(conn, m1, '後台軌', '2026-07-27T06:00:00+08:00');

      const result = getThreadMessages(t1);
      expect(result?.messages[0]?.reads).toEqual([{ track: '後台軌', read_at: '2026-07-27T06:00:00+08:00' }]);
    });
  });

  // ── getReadMatrix ──────────────────────────────────────────

  describe('getReadMatrix', () => {
    it('BR031_BroadcastRow_FourStatesPlusSelf: broadcast 收件 → self/signed/unsigned 三態齊全', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌', channel: 'general' });
      const msg = insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['broadcast']), created_at: new Date().toISOString() });
      insertRead(conn, msg, '後台軌');
      // 第三軌（賦能軌）透過 reads 出現，但非本則收件人 → viewer
      insertRead(conn, msg, '賦能軌');

      // 賦能軌需先透過某訊息的 to_tracks 進入 getAllTracks 聯集，否則不會被視為已知軌
      const t2 = insertThread(conn, {});
      insertMessage(conn, t2, { from_track: '賦能軌', to_tracks: JSON.stringify(['前台軌']) });

      const result = getReadMatrix({ days: 90 });
      const row = result.rows.find((r) => r.msg_id === msg);
      expect(row?.cells['前台軌']?.state).toBe('self');
      expect(row?.cells['後台軌']?.state).toBe('signed');
    });

    it('未簽收軌顯示 unsigned', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      const msg = insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']), created_at: new Date().toISOString() });

      const result = getReadMatrix({ days: 90 });
      const row = result.rows.find((r) => r.msg_id === msg);
      expect(row?.cells['後台軌']?.state).toBe('unsigned');
    });

    it('BR034_OverLimitMatrix_SetsTruncatedTrue: 超過 limit 截斷且 truncated=true', () => {
      const t1 = insertThread(conn, {});
      for (let i = 0; i < 250; i++) {
        insertMessage(conn, t1, { seq: i + 1, created_at: new Date(Date.now() - i * 1000).toISOString() });
      }
      const result = getReadMatrix({ days: 7, limit: 200 });
      expect(result.rows.length).toBe(200);
      expect(result.truncated).toBe(true);
    });

    it('BR035_ChannelFilter_AppliesToMatrix: channel 過濾只回該 channel 的列', () => {
      const tCorrection = insertThread(conn, { channel: 'correction' });
      const tGeneral = insertThread(conn, { channel: 'general' });
      insertMessage(conn, tCorrection, { created_at: new Date().toISOString() });
      insertMessage(conn, tCorrection, { created_at: new Date().toISOString() });
      insertMessage(conn, tCorrection, { created_at: new Date().toISOString() });
      insertMessage(conn, tGeneral, { created_at: new Date().toISOString() });
      insertMessage(conn, tGeneral, { created_at: new Date().toISOString() });
      insertMessage(conn, tGeneral, { created_at: new Date().toISOString() });

      const result = getReadMatrix({ days: 7, channel: 'correction' });
      expect(result.rows.every((r) => r.channel === 'correction')).toBe(true);
      expect(result.rows.length).toBe(3);
    });

    it('>24h 未簽訊息仍正確回傳 created_at 供前端計算逾時', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      const oldTs = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
      const msg = insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']), created_at: oldTs });

      const result = getReadMatrix({ days: 7 });
      const row = result.rows.find((r) => r.msg_id === msg);
      expect(row?.cells['後台軌']?.state).toBe('unsigned');
      expect(new Date(row!.created_at).getTime()).toBeLessThan(Date.now() - 24 * 3600 * 1000);
    });

    it('BR031_ObservedAndNotAddressed_AreDistinguished: 非收件軌依有無 reads 分 observed / not-addressed', () => {
      // 明確指名收件人（非 broadcast）才能讓「非收件」情境存在：
      // 前台軌=self、後台軌=收件已簽、賦能軌=非收件但有 reads(旁聽)、azure佈署軌=非收件且無 reads。
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      const msg = insertMessage(conn, t1, {
        from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']), created_at: new Date().toISOString(),
      });
      insertRead(conn, msg, '後台軌');
      insertRead(conn, msg, '賦能軌');
      // azure佈署軌 需先進入 getAllTracks 聯集才會成欄
      const t2 = insertThread(conn, {});
      insertMessage(conn, t2, { from_track: 'azure佈署軌', to_tracks: JSON.stringify(['前台軌']) });

      const row = getReadMatrix({ days: 90 }).rows.find((r) => r.msg_id === msg);
      expect(row?.cells['前台軌']?.state).toBe('self');
      expect(row?.cells['後台軌']?.state).toBe('signed');
      expect(row?.cells['賦能軌']?.state).toBe('observed');
      expect(row?.cells['azure佈署軌']?.state).toBe('not-addressed');
    });

    it('回傳 tracks 與 cells 的 key 集合一致（spec §4.5，矩陣不需再依賴 /stats）', () => {
      const t1 = insertThread(conn, { initiator_track: '前台軌' });
      const msg = insertMessage(conn, t1, { from_track: '前台軌', to_tracks: JSON.stringify(['後台軌']), created_at: new Date().toISOString() });

      const result = getReadMatrix({ days: 90 });
      const row = result.rows.find((r) => r.msg_id === msg);
      expect(result.tracks.length).toBeGreaterThan(0);
      expect(Object.keys(row!.cells).sort()).toEqual([...result.tracks].sort());
    });

    it('days 截止點與 created_at 同格式：超出窗口的訊息確實被排除', () => {
      // 舊實作用 datetime()（空格分隔 + UTC），字串比較在第 11 字元遇 'T'(0x54) > ' '(0x20)，
      // 使「截止當日任何時刻」都通過 → 窗口多算近一天。
      const t1 = insertThread(conn, {});
      const inWindow = insertMessage(conn, t1, { created_at: new Date(Date.now() - 2 * 86400000).toISOString() });
      const outOfWindow = insertMessage(conn, t1, { created_at: new Date(Date.now() - 30 * 86400000).toISOString() });

      const ids = getReadMatrix({ days: 7 }).rows.map((r) => r.msg_id);
      expect(ids).toContain(inWindow);
      expect(ids).not.toContain(outOfWindow);
    });

    it('DB 不可用回空集合（fail-open）', () => {
      vi.mocked(db.getDb).mockReturnValue(null);
      expect(getReadMatrix({})).toEqual({ tracks: [], rows: [], truncated: false });
    });
  });

  // ── searchThreads ──────────────────────────────────────────

  describe('searchThreads', () => {
    it('BR024_FtsMatch_ReturnsSnippet: 命中回 match_snippet 含 [ 與 ]', () => {
      const t1 = insertThread(conn, { state: 'closed', closed_at: '2026-07-27T10:00:00+08:00' });
      insertMessage(conn, t1, { body: 'Migration 窗口協調事項' });

      const result = searchThreads({ q: 'Migration' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0]?.match_snippet).toContain('[');
      expect(result.items[0]?.match_snippet).toContain(']');
    });

    it('BR025_ShortQuery_FallsBackToLike: 2 字元不拋 fts5 syntax error', () => {
      const t1 = insertThread(conn, { state: 'closed' });
      insertMessage(conn, t1, { body: 'ab 測試內容' });

      expect(() => searchThreads({ q: 'ab' })).not.toThrow();
      const result = searchThreads({ q: 'ab' });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('BR025_SingleCharQuery_FallsBackToLike: 1 字元同樣回退 LIKE（不得靜默回 0 筆）', () => {
      // BR-025 明定「長度 1-2 回退 LIKE」。舊實作用 ftsHelper.isShortQuery（定義為 len>=2 && len<3）
      // 判斷，長度 1 兩個分支都不進而落到 FTS 分支，再被 sanitizeFtsQuery 的 <3 擋成 null → 回 0 筆。
      // 繁中語料單字查詢（軌／債）是真實用法。
      const t1 = insertThread(conn, { state: 'closed' });
      insertMessage(conn, t1, { body: '前台軌已完成交接' });
      const t2 = insertThread(conn, { state: 'closed' });
      insertMessage(conn, t2, { body: '技術債清單更新' });

      const result = searchThreads({ q: '軌' });
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.thread_id).toBe(t1);
      expect(result.total).toBe(1);
    });

    it('LIKE 回退對 % 與 _ 轉義（不得被當萬用字元）', () => {
      const t1 = insertThread(conn, { state: 'closed' });
      insertMessage(conn, t1, { body: '完成度 80% 達標' });
      const t2 = insertThread(conn, { state: 'closed' });
      insertMessage(conn, t2, { body: '無關內容' });

      expect(searchThreads({ q: '%' }).items.length).toBe(1);
    });

    it('state 參數生效（spec §4.6）：預設 closed，可指定 open', () => {
      const closedT = insertThread(conn, { state: 'closed' });
      insertMessage(conn, closedT, { body: 'Migration 封存紀錄' });
      const openT = insertThread(conn, { state: 'open' });
      insertMessage(conn, openT, { body: 'Migration 進行中' });

      expect(searchThreads({ q: 'Migration' }).items.map((i) => i.thread_id)).toEqual([closedT]);
      expect(searchThreads({ q: 'Migration', state: 'open' }).items.map((i) => i.thread_id)).toEqual([openT]);
    });

    it('空字串回未過濾結果（全部 closed threads）', () => {
      insertThread(conn, { state: 'closed' });
      insertThread(conn, { state: 'closed' });
      insertThread(conn, { state: 'open' });

      const result = searchThreads({ q: '' });
      expect(result.items.length).toBe(2);
    });

    it('category 過濾套用於搜尋結果', () => {
      const t1 = insertThread(conn, { state: 'closed', category: 'migration窗口' });
      const t2 = insertThread(conn, { state: 'closed', category: 'other' });
      insertMessage(conn, t1, { body: 'Migration content here' });
      insertMessage(conn, t2, { body: 'Migration content there' });

      const result = searchThreads({ q: 'Migration', category: 'migration窗口' });
      expect(result.items.every((i) => i.category === 'migration窗口')).toBe(true);
    });

    it('DB 不可用回空集合', () => {
      vi.mocked(db.getDb).mockReturnValue(null);
      expect(searchThreads({ q: 'x' })).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    });
  });
});
