// ============================================================
// channel.ts — 型別鏡像自 server/services/channelService.ts（ccb-3-devconsole-channel-page）
// ============================================================

export interface ChannelStats {
  tracks: string[];
  /** DB 全量 DISTINCT category（BR-026）— Tab2 下拉選項來源。 */
  categories: string[];
  open_threads: number;
  closed_threads: number;
  total_messages: number;
  unread_total: number;
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

export type CellState = 'self' | 'signed' | 'unsigned' | 'observed' | 'not-addressed';

export interface MatrixRow {
  msg_id: number;
  thread_id: string;
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
  /** 動態軌欄（spec §4.5）— 由 read-matrix 自身回傳，不再依賴 /stats。 */
  tracks: string[];
  rows: MatrixRow[];
  truncated: boolean;
}

export type ChannelTabId = 'live' | 'archive' | 'matrix';

/** BR-020 契約五 key —— 與 MsgBlock 的 chip 渲染分支為同一份 SSoT（原缺 thread_id 造成兩處漂移）。 */
export const REF_JSON_KEYS = ['story_id', 'commit', 'file', 'board_id', 'thread_id'] as const;
export type RefJsonKey = (typeof REF_JSON_KEYS)[number];
