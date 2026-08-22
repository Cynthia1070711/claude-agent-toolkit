// ============================================================
// [ccb-1-db-mcp-import] One-shot idempotent import — 2 主 .md 聊天室 + 15 封存檔
// → ctrl_threads / ctrl_messages / ctrl_message_reads / ctrl_boards
//
// 用法:
//   node .context-db/scripts/import-ctrl-channel.js --report
//   node .context-db/scripts/import-ctrl-channel.js --report --db <path>   (測試用隔離 DB)
//
// 設計依據:SDD Spec §2.6-2.7(BR-029~BR-042)。全程單一 transaction,
// INSERT OR IGNORE 為冪等鍵(UNIQUE(thread_id,seq) / PK(msg_id,track) / PK(thread_id) / PK(board_id)),
// 對帳以「解析 blocks 數」vs「DB 內 ref_json.source_file 實際列數」逐檔比對。
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'phycool.db');

// ============================================================
// §1 Source file list(固定順序 = source_rank,對齊 AC8 逐檔對帳表順序)
// ============================================================

const ARCHIVE_DIR = path.join(REPO_ROOT, 'docs', 'tracking', 'active', 'phycool資訊校正任務', '留言區封存');

function buildFileList() {
  const files = [
    {
      key: 'orig',
      sourceRank: 0,
      channel: 'general',
      category: null,
      absPath: path.join(REPO_ROOT, 'claude token減量策略研究分析', 'AGENT溝通管道', '非同步聊天訊息討論專區.md'),
    },
    {
      key: 'corr',
      sourceRank: 1,
      channel: 'correction',
      category: null,
      absPath: path.join(REPO_ROOT, 'docs', 'tracking', 'active', 'phycool資訊校正任務', '非同步聊天訊息討論專區-校正區.md'),
    },
  ];
  const archiveNames = fs.readdirSync(ARCHIVE_DIR)
    .filter(f => /^\d{2}-.+\.md$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (const name of archiveNames) {
    const m = name.match(/^(\d{2})-(.+)\.md$/);
    files.push({
      key: `arch${m[1]}`,
      sourceRank: 2 + (parseInt(m[1], 10) - 1),
      channel: 'correction',
      category: m[2],
      absPath: path.join(ARCHIVE_DIR, name),
    });
  }
  return files;
}

// ============================================================
// §2 Block parser(BR-029/BR-030)— 以行首 `流水號` 為 block 起點,
// 只認 9 個已知欄位名為欄位起點,其餘行(含分隔線 / 標題 / 行首反引號內容行)歸入當前欄位內容。
// ============================================================

const FIELD_NAMES = ['流水號', '留言AGENT', '留言時間', '主旨', '留言內容', '留言對象', '對象已讀', '讀取時間', '通話狀態'];
const FIELD_START_RE = new RegExp('^\\s*`(' + FIELD_NAMES.join('|') + ')`[ \\t]?(.*)$');
const SEPARATOR_RE = /^-{20,}$/;
const HEADING_RE = /^#{1,6}\s/;
const FLOW_ID_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function normalizeText(raw) {
  return raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function parseBlocksFromContent(content, fileMeta) {
  const lines = normalizeText(content).split('\n');
  const blocks = [];
  let current = null;
  let blockIndex = 0;

  function flush() {
    if (!current) return;
    const fields = {};
    for (const [k, v] of Object.entries(current)) fields[k] = v.join('\n').trim();
    blocks.push({ fields, sourceFile: fileMeta.key, sourceRank: fileMeta.sourceRank, blockIndex, channel: fileMeta.channel, category: fileMeta.category });
    blockIndex++;
    current = null;
  }

  let activeField = null;
  for (const rawLine of lines) {
    const trimmedForMatch = rawLine.replace(/[ \t]+$/, '');
    const m = trimmedForMatch.match(FIELD_START_RE);
    if (m) {
      const fieldName = m[1];
      if (fieldName === '流水號') {
        flush();
        current = {};
      }
      if (!current) continue; // stray field line before any 流水號 seen — ignore
      activeField = fieldName;
      current[fieldName] = current[fieldName] || [];
      current[fieldName].push(m[2] || '');
      continue;
    }
    if (SEPARATOR_RE.test(rawLine.trim()) || HEADING_RE.test(rawLine)) {
      continue; // structural noise — never content
    }
    if (current && activeField) {
      current[activeField] = current[activeField] || [];
      current[activeField].push(rawLine);
    }
  }
  flush();
  return blocks;
}

// ============================================================
// §3 軌別正規化(BR-035)
// ============================================================

const TRACK_PATTERNS = [
  { canonical: '前台軌', re: /前台/ },
  { canonical: '後台軌', re: /後台|維運後台/ },
  { canonical: 'azure佈署軌', re: /azure|佈署|部署/i },
  { canonical: '賦能軌', re: /賦能|ECC|檢索架構|開發環境/ },
];

function matchedTracks(rawText) {
  if (!rawText) return [];
  const hit = [];
  for (const p of TRACK_PATTERNS) {
    if (p.re.test(rawText)) hit.push(p.canonical);
  }
  return hit;
}

/** BR-035: from_track 單值 — 取第一個命中(canonical 優先序),無命中回 unspecified。 */
function normalizeFromTrack(raw) {
  const hits = matchedTracks(raw);
  if (hits.length > 0) return { track: hits[0], raw_from: undefined };
  return { track: 'unspecified', raw_from: (raw || '').trim() };
}

/** BR-035: to_tracks 多值 — 收集所有命中(dedup),無命中回 ['unspecified']。 */
function normalizeToTracks(raw) {
  const hits = matchedTracks(raw);
  if (hits.length > 0) return { tracks: [...new Set(hits)], raw_to: undefined };
  return { tracks: ['unspecified'], raw_to: (raw || '').trim() };
}

// ============================================================
// §4 msg_type 推導(BR-037)— 主旨關鍵字優先序
// ============================================================

const MSG_TYPE_PRIORITY = [
  { type: 'inform', re: /知會/ },
  { type: 'handoff', re: /交辦|交接|移交/ },
  { type: 'decision', re: /裁定|決議|定案/ },
  { type: 'request', re: /請求/ },
  { type: 'state', re: /看板|登記|開關|窗口/ },
];

function classifyMsgType(subject) {
  for (const { type, re } of MSG_TYPE_PRIORITY) {
    if (re.test(subject || '')) return { msg_type: type, inferred: false };
  }
  return { msg_type: 'inform', inferred: true };
}

/**
 * BR-034: 通話狀態「含結束」不可整段 substring 比對 —— 實測大量「通話中(...結束由 XX 決定)」
 * 「...XX 已結束」把「結束」用在「未來誰有權結束」或「他方任務已結束」的無關語意上,
 * substring 比對會誤判為 closed。真正代表「已結束」的只有兩種可辨識形態:
 *   ① 開頭即為 結束 / 通話結束(含大小同義的「通話結束」複合詞)
 *   ② 內文出現顯式狀態轉換箭頭 →結束 / → **結束**(原通話中,事後同行補記轉為結束)
 */
function isCallStateClosed(rawValue) {
  const val = (rawValue || '').trim();
  if (!val) return false;
  if (/→\s*\*{0,2}結束/.test(val)) return true;
  if (/^(通話)?結束/.test(val)) return true;
  return false;
}

// ============================================================
// §5 時間戳工具 — 留言時間 / 流水號 → offset-aware(BR-029/BR-032 邊界:尾註保留 raw_time)
// ============================================================

const TIME_PREFIX_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/;

function parseMessageTime(raw) {
  const trimmed = (raw || '').trim();
  const m = trimmed.match(TIME_PREFIX_RE);
  if (!m) return { sortKey: trimmed, iso: null, raw_time: trimmed || undefined };
  const clean = m[1];
  const iso = `${clean.replace(' ', 'T')}:00.000+08:00`;
  return { sortKey: clean, iso, raw_time: trimmed !== clean ? trimmed : undefined };
}

function flowIdToIso(flowId) {
  return `${flowId.replace(' ', 'T')}.000+08:00`;
}

// ============================================================
// §6 讀取時間 × 對象已讀 配對(BR-036)
// ============================================================

const PAIRED_READ_RE = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\(([^)]*?)讀取\)/g;

function deriveReads(msg, toTracksNormalized) {
  const objRead = (msg.fields['對象已讀'] || '').trim();
  const readTimeRaw = (msg.fields['讀取時間'] || '').trim();

  // 只有欄位真正確認「已讀」(含具名軌別「XX已讀」或裸「已讀」)才視為有簽收訊號;
  // 「待對象讀取」「(待前台軌讀取)」等待讀提示雖非空值,語意上等同「尚未讀」,
  // 不得誤判為簽收缺時間戳(該字串內含「前台」等軌別關鍵字,naive substring 比對會誤觸)。
  if (!objRead || !/已讀/.test(objRead)) return { reads: [], skippedNoTimestamp: false };

  // 決定「哪些軌讀了」
  const namedTracks = matchedTracks(objRead);
  const readingTracks = namedTracks.length > 0 ? namedTracks : toTracksNormalized; // 裸「已讀」或「其他」形態 fallback 至 to_tracks(dev_notes §5)

  if (!readTimeRaw) return { reads: [], skippedNoTimestamp: true };

  // 雙戳配對格式:"2026-05-31 16:44(後台軌讀取) · 2026-05-31 23:22(前台軌讀取)"
  const pairs = [...readTimeRaw.matchAll(PAIRED_READ_RE)];
  if (pairs.length > 0) {
    const byTrack = new Map();
    for (const p of pairs) {
      const ts = p[1];
      const hits = matchedTracks(p[2]);
      for (const t of hits) byTrack.set(t, ts);
    }
    const firstTs = pairs[0][1];
    const reads = readingTracks.map(t => ({
      track: t,
      read_at: flowIdToIso(`${byTrack.get(t) || firstTs}:00`),
    }));
    return { reads, skippedNoTimestamp: false };
  }

  // 單戳格式
  const single = readTimeRaw.match(TIME_PREFIX_RE);
  if (!single) return { reads: [], skippedNoTimestamp: true };
  const ts = flowIdToIso(`${single[1]}:00`);
  return { reads: readingTracks.map(t => ({ track: t, read_at: ts })), skippedNoTimestamp: false };
}

// ============================================================
// §7 Staging DB 看板解析(校正區 §二之二,BoardState shape)
// ============================================================

function parseStagingBoard(corrContent) {
  const content = normalizeText(corrContent);
  const dbStateM = content.match(/\*\*DB 狀態\*\*\s*\|\s*(.+?)\s*\|/);
  const holderM = content.match(/\*\*使用中軌別\*\*\s*\|\s*(.+?)\s*\|/);
  const remainM = content.match(/\*\*本月額度餘量\*\*\s*\|\s*(.+?)\s*\|/);

  const holderRaw = (holderM ? holderM[1] : '').trim();
  const holderTracks = matchedTracks(holderRaw);
  const holder = holderRaw && !/（無）|^\(無\)$/.test(holderRaw) ? (holderTracks[0] || holderRaw) : null;
  const status = holder ? 'held' : 'idle';

  // 開關歷史表(3 列 → 6 筆 history)
  const tableRe = /\|\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*[^|]*\|/g;
  const history = [];
  let hm;
  while ((hm = tableRe.exec(content)) !== null) {
    const [, openTs, closeTs, trackRaw] = hm;
    const tracks = matchedTracks(trackRaw);
    const track = tracks[0] || trackRaw.trim();
    history.push({ ts: flowIdToIso(`${openTs}:00`), track, action: 'open' });
    history.push({ ts: flowIdToIso(`${closeTs}:00`), track, action: 'close' });
  }

  const state = {
    status,
    holder,
    history,
    ...(remainM ? { note: `本月額度餘量 ${remainM[1].trim()}` } : {}),
  };
  return { board_id: 'staging-db', title: 'Staging DB 使用登記制', state, dbStateRaw: (dbStateM ? dbStateM[1] : '').trim() };
}

// ============================================================
// §8 Thread 組裝 — 依 (留言時間,source_rank,block_index) 全序指派 seq(BR-032)
// ============================================================

function buildThreadsAndMessages(allBlocks) {
  const valid = allBlocks.filter(b => FLOW_ID_RE.test((b.fields['流水號'] || '').trim()));
  const byThread = new Map();
  for (const b of valid) {
    const threadId = b.fields['流水號'].trim();
    if (!byThread.has(threadId)) byThread.set(threadId, []);
    byThread.get(threadId).push(b);
  }

  const threads = [];
  const messages = [];
  let crossChannelCount = 0;
  let typeInferredCount = 0;
  let unspecifiedFrom = 0;
  let unspecifiedTo = 0;
  let readsSkippedNoTimestamp = 0;

  for (const [threadId, blocks] of byThread.entries()) {
    const withTime = blocks.map(b => ({ b, time: parseMessageTime(b.fields['留言時間']) }));
    withTime.sort((x, y) => {
      if (x.time.sortKey !== y.time.sortKey) return x.time.sortKey < y.time.sortKey ? -1 : 1;
      if (x.b.sourceRank !== y.b.sourceRank) return x.b.sourceRank - y.b.sourceRank;
      return x.b.blockIndex - y.b.blockIndex;
    });

    const distinctFiles = new Set(blocks.map(b => b.sourceFile));
    if (distinctFiles.size > 1) crossChannelCount++;

    const first = withTime[0];
    const fromFirst = normalizeFromTrack(first.b.fields['留言AGENT']);
    if (fromFirst.track === 'unspecified') unspecifiedFrom++;

    const last = withTime[withTime.length - 1];
    const lastCallState = (last.b.fields['通話狀態'] || '').trim();
    const allArchived = blocks.every(b => b.sourceRank >= 2);
    const isClosed = isCallStateClosed(lastCallState) || allArchived;

    threads.push({
      thread_id: threadId,
      topic: first.b.fields['主旨'] || threadId,
      category: first.b.category,
      channel: first.b.channel,
      initiator_track: fromFirst.track,
      state: isClosed ? 'closed' : 'open',
      must_read: 0,
      closed_at: isClosed ? (last.time.iso || flowIdToIso(`${threadId}`)) : null,
      created_at: flowIdToIso(threadId),
    });

    withTime.forEach((entry, idx) => {
      const seq = idx + 1;
      const b = entry.b;
      const from = normalizeFromTrack(b.fields['留言AGENT']);
      if (from.track === 'unspecified' && b !== first.b) unspecifiedFrom++;
      const to = normalizeToTracks(b.fields['留言對象']);
      if (to.tracks[0] === 'unspecified') unspecifiedTo++;
      const { msg_type, inferred } = classifyMsgType(b.fields['主旨']);
      if (inferred) typeInferredCount++;

      const { reads, skippedNoTimestamp } = deriveReads(b, to.tracks);
      if (skippedNoTimestamp) readsSkippedNoTimestamp++;

      const refJson = {
        source_file: b.sourceFile,
        ...(from.raw_from !== undefined ? { raw_from: from.raw_from } : {}),
        ...(to.raw_to !== undefined ? { raw_to: to.raw_to } : {}),
        ...(entry.time.raw_time !== undefined ? { raw_time: entry.time.raw_time } : {}),
        ...(inferred ? { type_inferred: true } : {}),
      };

      messages.push({
        thread_id: threadId,
        seq,
        from_track: from.track,
        to_tracks: to.tracks,
        msg_type,
        body: b.fields['留言內容'] || '',
        ref_json: refJson,
        created_at: entry.time.iso || flowIdToIso(threadId),
        reads,
      });
    });
  }

  return {
    threads, messages,
    stats: { crossChannelCount, typeInferredCount, unspecifiedFrom, unspecifiedTo, readsSkippedNoTimestamp },
  };
}

// ============================================================
// §9 DB writer — 全程單一 transaction,INSERT OR IGNORE 冪等
// ============================================================

function openDb(dbPath) {
  const db = new Database(dbPath || DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** @param {{files?: Array}} [opts] — opts.files overrides buildFileList() (tests inject fixture file lists). */
function runImport(dbPath, opts = {}) {
  const files = opts.files || buildFileList();
  const allBlocks = [];
  const fileBlockCounts = {};

  for (const f of files) {
    const raw = fs.readFileSync(f.absPath, 'utf8');
    const blocks = parseBlocksFromContent(raw, f);
    const validBlocks = blocks.filter(b => FLOW_ID_RE.test((b.fields['流水號'] || '').trim()));
    fileBlockCounts[f.key] = validBlocks.length;
    allBlocks.push(...blocks);
  }

  const { threads, messages, stats } = buildThreadsAndMessages(allBlocks);

  const corrFile = files.find(f => f.key === 'corr') || files[0];
  const board = parseStagingBoard(fs.readFileSync(corrFile.absPath, 'utf8'));

  const db = openDb(dbPath);
  let threadsInserted = 0, messagesInserted = 0, readsInserted = 0, boardsInserted = 0;
  const bodyConflicts = [];

  const txn = db.transaction(() => {
    const now = getTaiwanTimestamp();

    // 冪等鍵是 (thread_id, seq),但 seq 每次都由全序排序重新推導(BR-032)。若某來源檔被
    // 追加一則「時間戳早於既有訊息」的 block,該話題後續每則都往後位移一格 —— INSERT OR
    // IGNORE 會把新 block 靜默丟棄、同時把最後一則複製到空出來的尾格,而逐檔 blocks/rows
    // 計數仍然相等,§9 對帳因此回報 PASS(只比數量不比內容)。這裡先以內容比對偵測位移:
    // 任何目標格已被「不同 body」占用的話題,整條話題一律不寫入,並強制 reconcile=FAIL。
    const existingBody = db.prepare('SELECT body FROM ctrl_messages WHERE thread_id=? AND seq=?');
    const conflictedThreads = new Set();
    for (const m of messages) {
      const row = existingBody.get(m.thread_id, m.seq);
      if (row && row.body !== m.body) {
        conflictedThreads.add(m.thread_id);
        bodyConflicts.push({ thread_id: m.thread_id, seq: m.seq });
      }
    }

    const insThread = db.prepare(`
      INSERT OR IGNORE INTO ctrl_threads (thread_id, topic, category, channel, initiator_track, state, must_read, closed_at, created_at)
      VALUES (@thread_id, @topic, @category, @channel, @initiator_track, @state, @must_read, @closed_at, @created_at)
    `);
    for (const t of threads) {
      const info = insThread.run(t);
      if (info.changes > 0) threadsInserted++;
    }

    const insMsg = db.prepare(`
      INSERT OR IGNORE INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, ref_json, created_at)
      VALUES (@thread_id, @seq, @from_track, @to_tracks, @msg_type, @body, @ref_json, @created_at)
    `);
    const getMsgId = db.prepare('SELECT msg_id FROM ctrl_messages WHERE thread_id=? AND seq=?');
    const insRead = db.prepare(`
      INSERT OR IGNORE INTO ctrl_message_reads (msg_id, track, read_at) VALUES (@msg_id, @track, @read_at)
    `);

    for (const m of messages) {
      if (conflictedThreads.has(m.thread_id)) continue; // 位移偵測命中 —— 整條話題不寫入
      const info = insMsg.run({
        thread_id: m.thread_id, seq: m.seq, from_track: m.from_track,
        to_tracks: JSON.stringify(m.to_tracks), msg_type: m.msg_type,
        body: m.body, ref_json: JSON.stringify(m.ref_json), created_at: m.created_at,
      });
      if (info.changes > 0) messagesInserted++;

      const row = getMsgId.get(m.thread_id, m.seq);
      if (!row) continue; // should not happen — thread_id/seq always inserted or pre-existing
      for (const r of m.reads) {
        const rInfo = insRead.run({ msg_id: row.msg_id, track: r.track, read_at: r.read_at });
        if (rInfo.changes > 0) readsInserted++;
      }
    }

    const insBoard = db.prepare(`
      INSERT OR IGNORE INTO ctrl_boards (board_id, title, state_json, version, updated_by, updated_at)
      VALUES (@board_id, @title, @state_json, 0, 'import-ctrl-channel', @updated_at)
    `);
    const bInfo = insBoard.run({
      board_id: board.board_id, title: board.title,
      state_json: JSON.stringify(board.state), updated_at: now,
    });
    if (bInfo.changes > 0) boardsInserted++;
  });

  try {
    txn.immediate();

    // 對帳:逐檔比對「解析 blocks 數」vs「DB 內 ref_json.source_file 實際列數」
    const dbCountByFile = db.prepare(`
      SELECT json_extract(ref_json, '$.source_file') AS src, count(*) AS c
      FROM ctrl_messages GROUP BY src
    `).all();
    const dbCountMap = Object.fromEntries(dbCountByFile.map(r => [r.src, r.c]));

    const reconcileRows = files.map(f => ({
      file: f.key,
      blocks: fileBlockCounts[f.key],
      rows: dbCountMap[f.key] || 0,
    }));
    // 計數相符「且」無內容衝突才算 PASS —— 兩者缺一,對帳都可能對位移視而不見。
    const reconcilePass = reconcileRows.every(r => r.blocks === r.rows) && bodyConflicts.length === 0;

    const closedCount = db.prepare("SELECT count(*) c FROM ctrl_threads WHERE state='closed'").get().c;
    const openCount = db.prepare("SELECT count(*) c FROM ctrl_threads WHERE state='open'").get().c;

    return {
      threadsInserted, messagesInserted, readsInserted, boardsInserted,
      reconcileRows, reconcilePass, bodyConflicts,
      totals: { threads: threads.length, messages: messages.length, closedCount, openCount },
      stats,
    };
  } finally {
    db.close();
  }
}

// ============================================================
// §10 CLI
// ============================================================

function printReport(result) {
  console.log('=== import-ctrl-channel 對帳報告 ===');
  console.log('檔案                 | blocks | rows | match');
  for (const r of result.reconcileRows) {
    console.log(`${r.file.padEnd(20)} | ${String(r.blocks).padStart(6)} | ${String(r.rows).padStart(4)} | ${r.blocks === r.rows ? 'OK' : 'MISMATCH'}`);
  }
  console.log('---');
  console.log(`threads_inserted=${result.threadsInserted} · messages_inserted=${result.messagesInserted} · reads_inserted=${result.readsInserted} · boards_updated=${result.boardsInserted}`);
  console.log(`cross_channel_threads=${result.stats.crossChannelCount} · type_inferred=${result.stats.typeInferredCount} · reads_skipped_no_timestamp=${result.stats.readsSkippedNoTimestamp}`);
  if (result.bodyConflicts && result.bodyConflicts.length > 0) {
    console.log(`🔴 body_conflicts=${result.bodyConflicts.length}(目標 (thread_id,seq) 已被不同內容占用 —— 該話題整條未寫入,通常代表某來源檔被追加了時間戳早於既有訊息的 block):`);
    for (const c of result.bodyConflicts) console.log(`   - thread_id="${c.thread_id}" seq=${c.seq}`);
  }
  console.log(`from_track=unspecified: ${result.stats.unspecifiedFrom} · to_tracks=unspecified: ${result.stats.unspecifiedTo}`);
  console.log(`threads total=${result.totals.threads}(closed=${result.totals.closedCount} / open=${result.totals.openCount}) · messages total=${result.totals.messages}`);
  console.log(`reconcile=${result.reconcilePass ? 'PASS' : 'FAIL'}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const wantsReport = args.includes('--report');
  const dbIdx = args.indexOf('--db');
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;

  try {
    const result = runImport(dbPath);
    if (wantsReport) printReport(result);
    process.exit(result.reconcilePass ? 0 : 1);
  } catch (err) {
    console.error(`❌ import-ctrl-channel 失敗: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  }
}

export {
  runImport, parseBlocksFromContent, buildThreadsAndMessages,
  normalizeFromTrack, normalizeToTracks, classifyMsgType, buildFileList,
  parseStagingBoard, isCallStateClosed, deriveReads, parseMessageTime,
};
