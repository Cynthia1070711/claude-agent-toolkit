// ============================================================
// channelService.ts — /api/channel 唯讀查詢層（ccb-3-devconsole-channel-page）
// 資料來源唯一：ctrl_threads / ctrl_messages / ctrl_message_reads / ctrl_boards
// + ctrl_messages_fts（見 .context-db/migrations/2026-07-28-add-ctrl-channel-tables.sql）。
// 零寫入路徑（AC11）；查詢數與 pageSize 脫鉤（AC14）。
// ============================================================
import { getDb } from '../db.js';
import { sanitizeFtsQuery, escapeLikeQuery } from './ftsHelper.js';

/**
 * BR-025：q 長度 1-2 一律回退 LIKE。
 * 刻意不用 ftsHelper.isShortQuery —— 其定義為 `len >= 2 && len < 3`（只涵蓋 2），
 * 長度 1 會兩個分支都不進而落到 FTS 分支，再被 sanitizeFtsQuery 的 `< 3` 擋成 null，
 * 最終靜默回 0 筆。繁中語料單字查詢（軌／債／卡）是真實用法，不可靜默吞掉。
 * ftsHelper 為他卡共用資產（whp-9 起既有），故在本服務層修正語意而不改動共用檔。
 */
function needsLikeFallback(q: string): boolean {
  const trimmed = q.trim();
  return trimmed.length > 0 && trimmed.length < 3;
}

// ── 型別 ─────────────────────────────────────────────────────────

export interface ChannelStats {
  tracks: string[];
  /** DB 全量 DISTINCT category（非當前頁可見值）— 供 Tab2 下拉選項，BR-026。 */
  categories: string[];
  open_threads: number;
  closed_threads: number;
  total_messages: number;
  /** 開放話題中「收件對象尚未簽收」的 cell 數（排除 self）— 供 KPI chip「未簽 N」(spec §4.1)。 */
  unread_total: number;
  /** 今日(台灣時區日曆日)訊息數 — 供 KPI chip「今日訊息 N」。 */
  today_messages: number;
  last_message_at: string | null;
}

export interface BoardHistoryEntry {
  ts: string;
  track: string;
  action: string;
}

export interface BoardState {
  status: string;
  holder: string | null;
  history: BoardHistoryEntry[];
  until?: string;
  note?: string;
}

export interface ChannelBoard {
  board_id: string;
  title: string;
  version: number;
  updated_by: string;
  updated_at: string;
  state: BoardState | null;
  state_raw: string | null;
}

export interface LatestMsg {
  msg_id: number;
  seq: number;
  from_track: string;
  to_tracks: string[];
  msg_type: string;
  body: string;
  created_at: string;
}

export interface ReadStats {
  expected: string[];
  signed: string[];
  unsigned_count: number;
}

export interface ThreadListItem {
  thread_id: string;
  ordinal: number;
  topic: string;
  category: string | null;
  channel: string;
  must_read: number;
  initiator_track: string;
  state: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  msg_count: number;
  latest_msg: LatestMsg | null;
  read_stats: ReadStats;
  match_snippet?: string | null;
}

export interface ThreadListResult {
  items: ThreadListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MessageWithReads {
  msg_id: number;
  thread_id: string;
  seq: number;
  from_track: string;
  to_tracks: string[];
  msg_type: string;
  body: string;
  ref_json: Record<string, unknown> | null;
  superseded_by: number | null;
  superseded_by_seq: number | null;
  superseded_by_thread_id: string | null;
  created_at: string;
  reads: { track: string; read_at: string }[];
}

export interface ThreadMessagesResult {
  thread: {
    thread_id: string;
    topic: string;
    category: string | null;
    channel: string;
    initiator_track: string;
    state: 'open' | 'closed';
    must_read: number;
    created_at: string;
    closed_at: string | null;
  };
  messages: MessageWithReads[];
}

/** 對齊 03 章 §七 API 契約 TS interface 命名（非收件旁聽 = 'observed'，非隨意命名）。 */
export type CellState = 'self' | 'signed' | 'unsigned' | 'observed' | 'not-addressed';

export interface MatrixRow {
  msg_id: number;
  thread_id: string;
  /** 建立序短號（同 listThreads 的 ordinal），供顯示 "#{thread_ordinal}-{seq}"（03 章 §2.3 線框）。 */
  thread_ordinal: number;
  seq: number;
  from_track: string;
  to_tracks: string[];
  msg_type: string;
  channel: string;
  topic: string;
  must_read: number;
  created_at: string;
  cells: Record<string, { state: CellState; read_at?: string }>;
}

export interface ReadMatrixResult {
  /** 動態軌欄來源（spec §4.5）— 與 rows[].cells 的 key 集合一致，故矩陣不需再依賴 /stats。 */
  tracks: string[];
  rows: MatrixRow[];
  truncated: boolean;
}

interface ListThreadsParams {
  state?: 'open' | 'closed';
  category?: string;
  must_read?: boolean;
  channel?: string;
  page?: number;
  pageSize?: number;
}

interface SearchThreadsParams {
  q?: string;
  /** spec §4.6 契約參數；預設 'closed'（Tab2 封存查詢語意，BR-023）。 */
  state?: 'open' | 'closed';
  category?: string;
  must_read?: boolean;
  channel?: string;
  page?: number;
  pageSize?: number;
}

interface ReadMatrixParams {
  days?: number;
  limit?: number;
  channel?: string;
  category?: string;
}

const MATRIX_LIMIT_DEFAULT = 200;
const MATRIX_LIMIT_MAX = 200;
const MATRIX_DAYS_DEFAULT = 7;

// ── 內部共用 helper ────────────────────────────────────────────

type Row = Record<string, unknown>;

/** 三來源聯集（reads.track ∪ messages.from_track ∪ json_each(to_tracks).value），排除字面 "broadcast"。1 次 db.prepare()。 */
function getAllTracks(db: import('better-sqlite3').Database): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT track AS t FROM ctrl_message_reads
       UNION SELECT DISTINCT from_track AS t FROM ctrl_messages
       UNION SELECT DISTINCT je.value AS t FROM ctrl_messages, json_each(ctrl_messages.to_tracks) je WHERE je.value != 'broadcast'`,
    )
    .all() as Row[];
  return rows.map((r) => String(r['t'])).filter((t) => t !== 'broadcast').sort();
}

/** BR-027：state_json try/catch + shape guard（鏡像 ctrl-channel-ops.js validateBoardStateShape，跨 rootDir 不可 import，故本地重建同語意）。 */
function parseBoardState(raw: string): BoardState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const s = parsed as Record<string, unknown>;
  if (typeof s['status'] !== 'string' || s['status'] === '') return null;
  if (!('holder' in s) || (s['holder'] !== null && typeof s['holder'] !== 'string')) return null;
  if (!Array.isArray(s['history'])) return null;
  for (const h of s['history'] as unknown[]) {
    if (
      !h ||
      typeof h !== 'object' ||
      typeof (h as Record<string, unknown>)['ts'] !== 'string' ||
      typeof (h as Record<string, unknown>)['track'] !== 'string' ||
      typeof (h as Record<string, unknown>)['action'] !== 'string'
    ) {
      return null;
    }
  }
  return {
    status: s['status'] as string,
    holder: s['holder'] as string | null,
    history: s['history'] as BoardHistoryEntry[],
    ...(typeof s['until'] === 'string' ? { until: s['until'] } : {}),
    ...(typeof s['note'] === 'string' ? { note: s['note'] } : {}),
  };
}

function safeParseToTracks(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function resolveAddressees(toTracks: string[], fromTrack: string, allTracks: string[]): string[] {
  if (toTracks.includes('broadcast')) return allTracks.filter((t) => t !== fromTrack);
  return toTracks;
}

interface RawMsgRow {
  msg_id: number;
  thread_id: string;
  seq: number;
  from_track: string;
  to_tracks: string;
  msg_type: string;
  body: string;
  created_at: string;
}

/**
 * BR-049/AC14：批次取「頁面內」threadIds 的訊息 + 簽收，於 JS 端推導 msg_count / latest_msg / read_stats。
 * 只發 2 次 db.prepare()（不隨 threadIds 數量增加而增加查詢次數）。
 */
function computeThreadExtras(
  db: import('better-sqlite3').Database,
  threadIds: string[],
  allTracks: string[],
): Map<string, { msg_count: number; latest_msg: LatestMsg | null; read_stats: ReadStats }> {
  const result = new Map<string, { msg_count: number; latest_msg: LatestMsg | null; read_stats: ReadStats }>();
  if (threadIds.length === 0) return result;

  const placeholders = threadIds.map(() => '?').join(',');
  const msgRows = db
    .prepare(
      `SELECT msg_id, thread_id, seq, from_track, to_tracks, msg_type, body, created_at
       FROM ctrl_messages WHERE thread_id IN (${placeholders})
       ORDER BY created_at DESC, seq DESC`,
    )
    .all(...threadIds) as RawMsgRow[];

  const msgIds = msgRows.map((m) => m.msg_id);
  const readRows: { msg_id: number; track: string }[] =
    msgIds.length === 0
      ? []
      : (db
          .prepare(`SELECT msg_id, track FROM ctrl_message_reads WHERE msg_id IN (${msgIds.map(() => '?').join(',')})`)
          .all(...msgIds) as { msg_id: number; track: string }[]);

  const readSetByMsg = new Map<number, Set<string>>();
  for (const r of readRows) {
    if (!readSetByMsg.has(r.msg_id)) readSetByMsg.set(r.msg_id, new Set());
    readSetByMsg.get(r.msg_id)!.add(r.track);
  }

  const byThread = new Map<string, RawMsgRow[]>();
  for (const m of msgRows) {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
    byThread.get(m.thread_id)!.push(m);
  }

  for (const threadId of threadIds) {
    const msgs = byThread.get(threadId) ?? [];
    const latest = msgs[0] ?? null;
    const latestMsg: LatestMsg | null = latest
      ? {
          msg_id: latest.msg_id,
          seq: latest.seq,
          from_track: latest.from_track,
          to_tracks: safeParseToTracks(latest.to_tracks),
          msg_type: latest.msg_type,
          body: latest.body,
          created_at: latest.created_at,
        }
      : null;

    // addressed[track] = 該軌被指名的訊息 id 集合；readOk[track] = 該軌已簽收的「被指名訊息」id 集合
    const addressed = new Map<string, Set<number>>();
    for (const m of msgs) {
      const toTracks = safeParseToTracks(m.to_tracks);
      const addressees = resolveAddressees(toTracks, m.from_track, allTracks);
      for (const track of addressees) {
        if (!addressed.has(track)) addressed.set(track, new Set());
        addressed.get(track)!.add(m.msg_id);
      }
    }
    const expected: string[] = [];
    const signed: string[] = [];
    for (const [track, msgIdSet] of addressed) {
      expected.push(track);
      const allRead = [...msgIdSet].every((id) => readSetByMsg.get(id)?.has(track));
      if (allRead) signed.push(track);
    }

    result.set(threadId, {
      msg_count: msgs.length,
      latest_msg: latestMsg,
      read_stats: { expected, signed, unsigned_count: expected.length - signed.length },
    });
  }

  return result;
}

// ── §1 getStats ────────────────────────────────────────────────

export function getStats(): ChannelStats {
  const db = getDb();
  if (!db) {
    return { tracks: [], categories: [], open_threads: 0, closed_threads: 0, total_messages: 0, unread_total: 0, today_messages: 0, last_message_at: null };
  }

  const tracks = getAllTracks(db);
  const categories = (
    db.prepare(`SELECT DISTINCT category FROM ctrl_threads WHERE category IS NOT NULL AND category != '' ORDER BY category`).all() as Row[]
  ).map((r) => String(r['category']));
  const open = (db.prepare(`SELECT COUNT(*) AS c FROM ctrl_threads WHERE state='open'`).get() as { c: number }).c;
  const closed = (db.prepare(`SELECT COUNT(*) AS c FROM ctrl_threads WHERE state='closed'`).get() as { c: number }).c;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ctrl_messages`).get() as { c: number }).c;
  const lastMsgRow = db.prepare(`SELECT MAX(created_at) AS m FROM ctrl_messages`).get() as { m: string | null };
  // 台灣日曆日：created_at 為 offset-aware +08:00，故日界必須用 '+8 hours' 位移後的日期，
  // 否則台灣 00:00-08:00 這 8 小時窗口內 date('now')（UTC）會落在前一日（Constitutional §Timestamp Mandate）。
  const todayRow = db.prepare(`SELECT COUNT(*) AS c FROM ctrl_messages WHERE created_at >= date('now', '+8 hours')`).get() as { c: number };

  const openThreadIds = (db.prepare(`SELECT thread_id FROM ctrl_threads WHERE state='open'`).all() as Row[]).map((r) => String(r['thread_id']));
  const extras = computeThreadExtras(db, openThreadIds, tracks);
  // spec §4.1：unread_total = 「收件對象尚未簽收」的 cell 數（排除 self），非「有未簽的話題數」。
  const unreadTotal = [...extras.values()].reduce((sum, e) => sum + e.read_stats.unsigned_count, 0);

  return {
    tracks,
    categories,
    open_threads: open,
    closed_threads: closed,
    total_messages: total,
    unread_total: unreadTotal,
    today_messages: todayRow.c,
    last_message_at: lastMsgRow.m,
  };
}

// ── §2 listBoards ──────────────────────────────────────────────

export function listBoards(): { items: ChannelBoard[] } {
  const db = getDb();
  if (!db) return { items: [] };

  const rows = db.prepare(`SELECT board_id, title, state_json, version, updated_by, updated_at FROM ctrl_boards`).all() as Row[];
  const items: ChannelBoard[] = rows.map((r) => {
    const raw = String(r['state_json']);
    const state = parseBoardState(raw);
    return {
      board_id: String(r['board_id']),
      title: String(r['title']),
      version: Number(r['version']),
      updated_by: String(r['updated_by']),
      updated_at: String(r['updated_at']),
      state,
      state_raw: state === null ? raw : null,
    };
  });
  return { items };
}

// ── §3 listThreads（Tab1 通話中 / state=closed 供 BR-023）───────

export function listThreads(params: ListThreadsParams): ThreadListResult {
  const db = getDb();
  const page = Math.max(Math.trunc(params.page ?? 1), 1);
  // 預設 50 對齊 spec §4.3 與 BR-028（Pagination 每頁 50）；上限 200 對齊 BR-047。
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 50), 1), 200);
  if (!db) return { items: [], total: 0, page, pageSize };

  const state = params.state === 'closed' ? 'closed' : 'open';
  const conditions: string[] = ['t.state = ?'];
  const args: unknown[] = [state];
  if (params.category) { conditions.push('t.category = ?'); args.push(params.category); }
  if (params.channel) { conditions.push('t.channel = ?'); args.push(params.channel); }
  if (params.must_read) { conditions.push('t.must_read = 1'); }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ctrl_threads t ${where}`).get(...args) as { c: number }).c;

  // 排序：state=open → must_read 優先 + 最新訊息時間倒序（AC2）；state=closed → closed_at 倒序（BR-023）
  const orderBy =
    state === 'open'
      ? `t.must_read DESC, latest_created_at IS NULL, latest_created_at DESC, t.thread_id DESC`
      : `t.closed_at DESC, t.thread_id DESC`;

  const pageRows = db
    .prepare(
      `WITH latest AS (
         SELECT thread_id, MAX(created_at) AS latest_created_at
         FROM ctrl_messages GROUP BY thread_id
       )
       SELECT t.thread_id, t.topic, t.category, t.channel, t.must_read, t.initiator_track,
              t.state, t.created_at, t.closed_at, l.latest_created_at
       FROM ctrl_threads t
       LEFT JOIN latest l ON l.thread_id = t.thread_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, (page - 1) * pageSize) as Row[];

  const threadIds = pageRows.map((r) => String(r['thread_id']));
  const allTracks = getAllTracks(db);
  const extras = computeThreadExtras(db, threadIds, allTracks);

  // ordinal：全域(不受過濾影響) — ROW_NUMBER() OVER (ORDER BY created_at, thread_id)，1 次查詢建 Map
  const ordinalRows = db.prepare(`SELECT thread_id FROM ctrl_threads ORDER BY created_at, thread_id`).all() as Row[];
  const ordinalMap = new Map<string, number>();
  ordinalRows.forEach((r, i) => ordinalMap.set(String(r['thread_id']), i + 1));

  const items: ThreadListItem[] = pageRows.map((r) => {
    const threadId = String(r['thread_id']);
    const extra = extras.get(threadId) ?? { msg_count: 0, latest_msg: null, read_stats: { expected: [], signed: [], unsigned_count: 0 } };
    return {
      thread_id: threadId,
      ordinal: ordinalMap.get(threadId) ?? 0,
      topic: String(r['topic']),
      category: r['category'] === null ? null : String(r['category']),
      channel: String(r['channel']),
      must_read: Number(r['must_read']),
      initiator_track: String(r['initiator_track']),
      state: r['state'] as 'open' | 'closed',
      created_at: String(r['created_at']),
      closed_at: r['closed_at'] === null ? null : String(r['closed_at']),
      msg_count: extra.msg_count,
      latest_msg: extra.latest_msg,
      read_stats: extra.read_stats,
    };
  });

  return { items, total, page, pageSize };
}

// ── §4 getThreadMessages ───────────────────────────────────────

export function getThreadMessages(threadId: string): ThreadMessagesResult | null {
  const db = getDb();
  if (!db) return null;

  const thread = db
    .prepare(`SELECT thread_id, topic, category, channel, initiator_track, state, must_read, created_at, closed_at FROM ctrl_threads WHERE thread_id = ?`)
    .get(threadId) as Row | undefined;
  if (!thread) return null;

  const msgRows = db
    .prepare(
      `SELECT m.msg_id, m.thread_id, m.seq, m.from_track, m.to_tracks, m.msg_type, m.body,
              m.ref_json, m.superseded_by, m.created_at,
              nxt.seq AS superseded_by_seq, nxt.thread_id AS superseded_by_thread_id
       FROM ctrl_messages m
       LEFT JOIN ctrl_messages nxt ON nxt.msg_id = m.superseded_by
       WHERE m.thread_id = ?
       ORDER BY m.seq ASC`,
    )
    .all(threadId) as Row[];

  const msgIds = msgRows.map((r) => Number(r['msg_id']));
  const readRows: { msg_id: number; track: string; read_at: string }[] =
    msgIds.length === 0
      ? []
      : (db
          .prepare(`SELECT msg_id, track, read_at FROM ctrl_message_reads WHERE msg_id IN (${msgIds.map(() => '?').join(',')})`)
          .all(...msgIds) as { msg_id: number; track: string; read_at: string }[]);

  const readsByMsg = new Map<number, { track: string; read_at: string }[]>();
  for (const r of readRows) {
    if (!readsByMsg.has(r.msg_id)) readsByMsg.set(r.msg_id, []);
    readsByMsg.get(r.msg_id)!.push({ track: r.track, read_at: r.read_at });
  }

  const messages: MessageWithReads[] = msgRows.map((r) => {
    const refJsonRaw = r['ref_json'] === null ? null : String(r['ref_json']);
    let refJson: Record<string, unknown> | null = null;
    if (refJsonRaw) {
      try { refJson = JSON.parse(refJsonRaw); } catch { refJson = null; }
    }
    const msgId = Number(r['msg_id']);
    return {
      msg_id: msgId,
      thread_id: String(r['thread_id']),
      seq: Number(r['seq']),
      from_track: String(r['from_track']),
      to_tracks: safeParseToTracks(String(r['to_tracks'])),
      msg_type: String(r['msg_type']),
      body: String(r['body']),
      ref_json: refJson,
      superseded_by: r['superseded_by'] === null ? null : Number(r['superseded_by']),
      superseded_by_seq: r['superseded_by_seq'] === null ? null : Number(r['superseded_by_seq']),
      superseded_by_thread_id: r['superseded_by_thread_id'] === null ? null : String(r['superseded_by_thread_id']),
      created_at: String(r['created_at']),
      reads: readsByMsg.get(msgId) ?? [],
    };
  });

  return {
    thread: {
      thread_id: String(thread['thread_id']),
      topic: String(thread['topic']),
      category: thread['category'] === null ? null : String(thread['category']),
      channel: String(thread['channel']),
      initiator_track: String(thread['initiator_track']),
      state: thread['state'] as 'open' | 'closed',
      must_read: Number(thread['must_read']),
      created_at: String(thread['created_at']),
      closed_at: thread['closed_at'] === null ? null : String(thread['closed_at']),
    },
    messages,
  };
}

// ── §5 getReadMatrix ───────────────────────────────────────────

export function getReadMatrix(params: ReadMatrixParams): ReadMatrixResult {
  const db = getDb();
  if (!db) return { tracks: [], rows: [], truncated: false };

  const days = Number.isFinite(params.days) && (params.days as number) > 0 ? Math.trunc(params.days as number) : MATRIX_DAYS_DEFAULT;
  const limit = Math.min(Math.max(Number.isFinite(params.limit) ? Math.trunc(params.limit as number) : MATRIX_LIMIT_DEFAULT, 1), MATRIX_LIMIT_MAX);

  // created_at 形如 '2026-07-26T17:14:00.000+08:00'（T 分隔 + 台灣 offset），全表同 offset 故字典序 == 時序。
  // 截止點必須產出同格式：datetime() 預設回 '2026-07-20 22:55:50'（空格分隔 + UTC），
  // 字串比較在第 11 字元遇 'T'(0x54) > ' '(0x20)，會讓截止當日「任何時刻」都通過 → 窗口多算近一天。
  // 故改用 strftime 的 T 分隔格式並先 '+8 hours' 位移為台灣時間。
  const conditions: string[] = [`m.created_at >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '+8 hours', ?)`];
  const args: unknown[] = [`-${days} days`];
  if (params.channel) { conditions.push('t.channel = ?'); args.push(params.channel); }
  if (params.category) { conditions.push('t.category = ?'); args.push(params.category); }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM ctrl_messages m JOIN ctrl_threads t ON t.thread_id = m.thread_id ${where}`).get(...args) as { c: number };

  const rows = db
    .prepare(
      `SELECT m.msg_id, m.thread_id, m.seq, m.from_track, m.to_tracks, m.msg_type, m.created_at,
              t.channel, t.topic, t.must_read
       FROM ctrl_messages m
       JOIN ctrl_threads t ON t.thread_id = m.thread_id
       ${where}
       ORDER BY t.must_read DESC, m.created_at DESC
       LIMIT ?`,
    )
    .all(...args, limit) as Row[];

  const msgIds = rows.map((r) => Number(r['msg_id']));
  const readRows: { msg_id: number; track: string; read_at: string }[] =
    msgIds.length === 0
      ? []
      : (db
          .prepare(`SELECT msg_id, track, read_at FROM ctrl_message_reads WHERE msg_id IN (${msgIds.map(() => '?').join(',')})`)
          .all(...msgIds) as { msg_id: number; track: string; read_at: string }[]);
  const readMapByMsg = new Map<number, Map<string, string>>();
  for (const r of readRows) {
    if (!readMapByMsg.has(r.msg_id)) readMapByMsg.set(r.msg_id, new Map());
    readMapByMsg.get(r.msg_id)!.set(r.track, r.read_at);
  }

  const allTracks = getAllTracks(db);

  // thread_ordinal（同 listThreads D-3 決策：ROW_NUMBER() OVER 全域穩定序號，1 次查詢建 Map）
  const ordinalRows = db.prepare(`SELECT thread_id FROM ctrl_threads ORDER BY created_at, thread_id`).all() as Row[];
  const ordinalMap = new Map<string, number>();
  ordinalRows.forEach((r, i) => ordinalMap.set(String(r['thread_id']), i + 1));

  const matrixRows: MatrixRow[] = rows.map((r) => {
    const msgId = Number(r['msg_id']);
    const threadId = String(r['thread_id']);
    const fromTrack = String(r['from_track']);
    const toTracks = safeParseToTracks(String(r['to_tracks']));
    const addressees = new Set(resolveAddressees(toTracks, fromTrack, allTracks));
    const readMap = readMapByMsg.get(msgId) ?? new Map<string, string>();

    const cells: Record<string, { state: CellState; read_at?: string }> = {};
    for (const track of allTracks) {
      const readAt = readMap.get(track);
      if (track === fromTrack) {
        cells[track] = { state: 'self' };
      } else if (addressees.has(track)) {
        cells[track] = readAt ? { state: 'signed', read_at: readAt } : { state: 'unsigned' };
      } else {
        cells[track] = readAt ? { state: 'observed', read_at: readAt } : { state: 'not-addressed' };
      }
    }

    return {
      msg_id: msgId,
      thread_id: threadId,
      thread_ordinal: ordinalMap.get(threadId) ?? 0,
      seq: Number(r['seq']),
      from_track: fromTrack,
      to_tracks: toTracks,
      msg_type: String(r['msg_type']),
      channel: String(r['channel']),
      topic: String(r['topic']),
      must_read: Number(r['must_read']),
      created_at: String(r['created_at']),
      cells,
    };
  });

  return { tracks: allTracks, rows: matrixRows, truncated: totalRow.c > limit };
}

// ── §6 searchThreads（Tab2 封存查詢，FTS5 trigram + LIKE fallback）──

export function searchThreads(params: SearchThreadsParams): ThreadListResult {
  const db = getDb();
  const page = Math.max(Math.trunc(params.page ?? 1), 1);
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 50), 1), 200);
  if (!db) return { items: [], total: 0, page, pageSize };

  const q = (params.q ?? '').trim();
  const state = params.state === 'open' ? 'open' : 'closed';
  const extraConditions: string[] = [];
  const extraArgs: unknown[] = [];
  if (params.category) { extraConditions.push('t.category = ?'); extraArgs.push(params.category); }
  if (params.channel) { extraConditions.push('t.channel = ?'); extraArgs.push(params.channel); }
  if (params.must_read) { extraConditions.push('t.must_read = 1'); }
  const extraWhere = extraConditions.length ? `AND ${extraConditions.join(' AND ')}` : '';

  // 每 thread 取「最先命中」的一則訊息當代表 snippet；thread_id ASC 保序穩定 dedupe。
  let matchRows: { thread_id: string; match_snippet: string }[] = [];

  if (q.length === 0) {
    // 未過濾：直接列該 state 的 threads（無 snippet）
    matchRows = (
      db
        .prepare(`SELECT DISTINCT t.thread_id FROM ctrl_threads t WHERE t.state = ? ${extraWhere}`)
        .all(state, ...extraArgs) as Row[]
    ).map((r) => ({ thread_id: String(r['thread_id']), match_snippet: '' }));
  } else if (needsLikeFallback(q)) {
    const likePattern = `%${escapeLikeQuery(q)}%`;
    matchRows = (
      db
        .prepare(
          `SELECT m.thread_id AS thread_id, MIN(m.body) AS body
           FROM ctrl_messages m JOIN ctrl_threads t ON t.thread_id = m.thread_id
           WHERE m.body LIKE ? ESCAPE '\\' AND t.state = ? ${extraWhere}
           GROUP BY m.thread_id`,
        )
        .all(likePattern, state, ...extraArgs) as Row[]
    ).map((r) => ({ thread_id: String(r['thread_id']), match_snippet: String(r['body']).slice(0, 60) }));
  } else {
    const ftsQuery = sanitizeFtsQuery(q);
    if (ftsQuery) {
      const ftsRows = db
        .prepare(
          `SELECT m.thread_id AS thread_id, m.msg_id AS msg_id,
                  snippet(ctrl_messages_fts, 0, '[', ']', '…', 12) AS match_snippet
           FROM ctrl_messages_fts
           JOIN ctrl_messages m ON m.msg_id = ctrl_messages_fts.rowid
           JOIN ctrl_threads t ON t.thread_id = m.thread_id
           WHERE ctrl_messages_fts MATCH ? AND t.state = ? ${extraWhere}
           ORDER BY m.thread_id, m.msg_id`,
        )
        .all(ftsQuery, state, ...extraArgs) as Row[];
      const seen = new Set<string>();
      for (const r of ftsRows) {
        const tid = String(r['thread_id']);
        if (seen.has(tid)) continue;
        seen.add(tid);
        matchRows.push({ thread_id: tid, match_snippet: String(r['match_snippet']) });
      }
    }
  }

  // 取 thread 元資料 + closed_at 排序 + 分頁（分頁在 JS 端切，因命中 thread 集合已由上方查詢框限）
  const threadIds = matchRows.map((m) => m.thread_id);
  if (threadIds.length === 0) return { items: [], total: 0, page, pageSize };

  const metaRows = db
    .prepare(
      `SELECT thread_id, topic, category, channel, must_read, initiator_track, state, created_at, closed_at
       FROM ctrl_threads WHERE thread_id IN (${threadIds.map(() => '?').join(',')})
       ORDER BY closed_at DESC, thread_id DESC`,
    )
    .all(...threadIds) as Row[];

  const snippetByThread = new Map(matchRows.map((m) => [m.thread_id, m.match_snippet]));
  const allTracks = getAllTracks(db);

  const total = metaRows.length;
  const pageMeta = metaRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  // extras 只對「當頁」thread 計算 —— 對全部命中 thread 計算會連帶把它們的訊息 body 全載入
  // （q='' 時即整個 closed 集合），只用其中一頁，屬純浪費。查詢次數仍為常數（BR-049 不受影響）。
  const extras = computeThreadExtras(db, pageMeta.map((r) => String(r['thread_id'])), allTracks);

  const ordinalRows = db.prepare(`SELECT thread_id FROM ctrl_threads ORDER BY created_at, thread_id`).all() as Row[];
  const ordinalMap = new Map<string, number>();
  ordinalRows.forEach((r, i) => ordinalMap.set(String(r['thread_id']), i + 1));

  const items: ThreadListItem[] = pageMeta.map((r) => {
    const threadId = String(r['thread_id']);
    const extra = extras.get(threadId) ?? { msg_count: 0, latest_msg: null, read_stats: { expected: [], signed: [], unsigned_count: 0 } };
    return {
      thread_id: threadId,
      ordinal: ordinalMap.get(threadId) ?? 0,
      topic: String(r['topic']),
      category: r['category'] === null ? null : String(r['category']),
      channel: String(r['channel']),
      must_read: Number(r['must_read']),
      initiator_track: String(r['initiator_track']),
      state: r['state'] as 'open' | 'closed',
      created_at: String(r['created_at']),
      closed_at: r['closed_at'] === null ? null : String(r['closed_at']),
      msg_count: extra.msg_count,
      latest_msg: extra.latest_msg,
      read_stats: extra.read_stats,
      match_snippet: snippetByThread.get(threadId) || null,
    };
  });

  return { items, total, page, pageSize };
}

export function isDbReady(): boolean {
  return getDb() !== null;
}
