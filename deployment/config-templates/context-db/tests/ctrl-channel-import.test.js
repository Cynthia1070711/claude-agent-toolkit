// ccb-1-db-mcp-import — import parser/mapper/reconcile tests(BR-029~BR-039)
// 走隔離 temp DB(createTestDb + migration SQL exec)+ tests/fixtures/ctrl-channel/*.md 小型 fixture,
// 絕不連 phycool.db。真實 17 檔對帳於 T13 以 --report 人工核對(見 dev_notes)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { postCtrlMessage } from '../scripts/ctrl-channel-ops.js';
import {
  runImport, parseBlocksFromContent, buildThreadsAndMessages,
  normalizeFromTrack, normalizeToTracks, classifyMsgType, deriveReads,
} from '../scripts/import-ctrl-channel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql'),
  'utf8'
);
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ctrl-channel');

function fixturePath(name) {
  return path.join(FIXTURE_DIR, name);
}

function loadBlocks(fileName, meta) {
  const raw = fs.readFileSync(fixturePath(fileName), 'utf8');
  return parseBlocksFromContent(raw, meta);
}

let ctx;

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  ctx.cleanup();
});

// ============================================================
// BR-029: CRLF + BOM normalize
// ============================================================
describe('BR-029: CRLF+BOM normalize', () => {
  it('BR029_CrlfBomFixture_SameBlockCountAsLf: CRLF+BOM fixture parses to the same block count and field values as the LF version', () => {
    const lfBlocks = loadBlocks('sample-lf.md', { key: 'lf', sourceRank: 0, channel: 'general', category: null });
    const crlfBlocks = loadBlocks('sample-crlf-bom.md', { key: 'crlf', sourceRank: 0, channel: 'general', category: null });
    expect(crlfBlocks.length).toBe(lfBlocks.length);
    for (let i = 0; i < lfBlocks.length; i++) {
      expect(crlfBlocks[i].fields['流水號']).toBe(lfBlocks[i].fields['流水號']);
      expect(crlfBlocks[i].fields['留言內容']).toBe(lfBlocks[i].fields['留言內容']);
      expect(crlfBlocks[i].fields['主旨']).toBe(lfBlocks[i].fields['主旨']);
    }
  });
});

// ============================================================
// BR-030 / BR-031: block splitting boundaries
// ============================================================
describe('BR-030/BR-031: block splitting boundaries', () => {
  const FLOW_ID_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

  it('BR030_BacktickLineInsideBody_NotTreatedAsField: backtick-prefixed content lines (`git diff`) stay inside 留言內容, do not split the block', () => {
    const blocks = loadBlocks('sample-lf.md', { key: 'lf', sourceRank: 0, channel: 'general', category: null });
    const target = blocks.find(b => b.fields['主旨'] === '交辦:含反引號內容行的 fixture');
    expect(target).toBeDefined();
    expect(target.fields['留言內容']).toContain('`git diff`');
    expect(target.fields['留言內容']).toContain('`main.bicep`');
  });

  it('BR031_ExampleBlock_ExcludedFromImport: the format-example block (placeholder 流水號) is excluded by the timestamp regex', () => {
    const blocks = loadBlocks('sample-lf.md', { key: 'lf', sourceRank: 0, channel: 'general', category: null });
    const valid = blocks.filter(b => FLOW_ID_RE.test((b.fields['流水號'] || '').trim()));
    // 4 raw blocks in the fixture: 1 example + 3 real
    expect(blocks.length).toBe(4);
    expect(valid.length).toBe(3);
  });

  it('missing-field block (BR-034/BR-035/BR-036 boundary) does not throw and yields empty strings for absent fields', () => {
    const blocks = loadBlocks('sample-lf.md', { key: 'lf', sourceRank: 0, channel: 'general', category: null });
    const target = blocks.find(b => b.fields['流水號'] === '2026-06-03 09:00:00');
    expect(target).toBeDefined();
    expect(target.fields['留言對象'] || '').toBe('');
    expect(target.fields['對象已讀'] || '').toBe('');
    expect(target.fields['通話狀態'] || '').toBe('');
  });
});

// ============================================================
// BR-032 / BR-033: cross-file seq ordering + thread merge
// ============================================================
describe('BR-032/BR-033: cross-file seq ordering and thread merge', () => {
  it('BR032_SeqOrdering_FollowsTimeThenSourceRank: seq 1..4 follow (留言時間,source_rank,block_index), not file append order', () => {
    const a = loadBlocks('cross-file-a.md', { key: 'a', sourceRank: 0, channel: 'general', category: null });
    const b = loadBlocks('cross-file-b.md', { key: 'b', sourceRank: 1, channel: 'correction', category: null });
    const { messages } = buildThreadsAndMessages([...a, ...b]);
    const thread = messages.filter(m => m.thread_id === '2026-06-05 14:00:00').sort((x, y) => x.seq - y.seq);
    expect(thread.map(m => m.seq)).toEqual([1, 2, 3, 4]);
    expect(thread.map(m => m.created_at)).toEqual([
      '2026-06-05T14:00:00.000+08:00',
      '2026-06-05T14:05:00.000+08:00',
      '2026-06-05T15:00:00.000+08:00',
      '2026-06-05T20:00:00.000+08:00',
    ]);
  });

  it('BR033_CrossFileThread_MergesToSingleThread: the shared flow-id merges to exactly one thread, channel taken from the seq=1 source file', () => {
    const a = loadBlocks('cross-file-a.md', { key: 'a', sourceRank: 0, channel: 'general', category: null });
    const b = loadBlocks('cross-file-b.md', { key: 'b', sourceRank: 1, channel: 'correction', category: null });
    const { threads, stats } = buildThreadsAndMessages([...a, ...b]);
    const merged = threads.filter(t => t.thread_id === '2026-06-05 14:00:00');
    expect(merged).toHaveLength(1);
    expect(merged[0].channel).toBe('general'); // seq=1 message came from file 'a' (rank 0)
    expect(stats.crossChannelCount).toBe(1);
  });

  it('the merged cross-file thread stays open (last message is 通話中 with future-tense 結束由XX決定, not an actual closure)', () => {
    const a = loadBlocks('cross-file-a.md', { key: 'a', sourceRank: 0, channel: 'general', category: null });
    const b = loadBlocks('cross-file-b.md', { key: 'b', sourceRank: 1, channel: 'correction', category: null });
    const { threads } = buildThreadsAndMessages([...a, ...b]);
    const merged = threads.find(t => t.thread_id === '2026-06-05 14:00:00');
    expect(merged.state).toBe('open');
  });
});

// ============================================================
// BR-034: archive-only thread with an open-looking last block is closed
// ============================================================
describe('BR-034: archive-only thread closure', () => {
  it('BR034_ArchiveOnlyThreadWithOpenLastBlock_IsClosed: all-messages-from-archive overrides a last block that still reads 通話中', () => {
    const raw = fs.readFileSync(fixturePath('cross-file-b.md'), 'utf8');
    // sourceRank>=2 simulates "all from 留言區封存/"
    const blocks = parseBlocksFromContent(raw, { key: 'archXX', sourceRank: 5, channel: 'correction', category: 'archived-topic' });
    const { threads } = buildThreadsAndMessages(blocks);
    const t = threads.find(x => x.thread_id === '2026-06-05 14:00:00');
    expect(t.state).toBe('closed'); // last block literally reads 通話中(...) but allArchived overrides
    expect(t.closed_at).not.toBeNull();
  });
});

// ============================================================
// BR-035: unknown from_track falls back to unspecified with raw preserved
// ============================================================
describe('BR-035: track normalization fallback', () => {
  it('BR035_UnknownAgentString_FallsBackToUnspecified: an unrecognised 留言AGENT string normalizes to unspecified with raw_from preserved', () => {
    const r = normalizeFromTrack('不明身分寫法測試軌');
    expect(r.track).toBe('unspecified');
    expect(r.raw_from).toBe('不明身分寫法測試軌');
  });

  it('a recognised keyword anywhere in the string still matches (substring match against the whole field)', () => {
    expect(normalizeFromTrack('phycool 前台軌(Phase D)+ CC-OPUS').track).toBe('前台軌');
    expect(normalizeFromTrack('智能開發環境賦能(全平台 TZ 審計)+ CC-OPUS').track).toBe('賦能軌');
  });

  it('to_tracks collects every matching canonical track, deduped, and falls back to [unspecified] on zero hits', () => {
    const multi = normalizeToTracks('phycool 資訊校正前台軌(前台用戶端 4 區)+ phycool 資訊校正後台軌(維運後台 M0)');
    expect(multi.tracks.sort()).toEqual(['前台軌', '後台軌'].sort());
    const none = normalizeToTracks('phycool 資訊校正(全平台校正)');
    expect(none.tracks).toEqual(['unspecified']);
    expect(none.raw_to).toBe('phycool 資訊校正(全平台校正)');
  });
});

// ============================================================
// BR-036: reads derivation
// ============================================================
describe('BR-036: reads derivation from 對象已讀 × 讀取時間', () => {
  it('BR036_ReadTimeWithoutTimestamp_SkipsReadRow: 已讀 present but 讀取時間 empty skips the read row and flags the guard', () => {
    const msg = { fields: { '對象已讀': '已讀', '讀取時間': '' } };
    const { reads, skippedNoTimestamp } = deriveReads(msg, ['前台軌']);
    expect(reads).toEqual([]);
    expect(skippedNoTimestamp).toBe(true);
  });

  it('BR036_PendingReadPlaceholder_IsNotASignoff: "待對象讀取"-style placeholders are not read signals and never trigger the timestamp guard', () => {
    const msg = { fields: { '對象已讀': '待對象讀取', '讀取時間': '' } };
    const { reads, skippedNoTimestamp } = deriveReads(msg, ['前台軌']);
    expect(reads).toEqual([]);
    expect(skippedNoTimestamp).toBe(false);
  });

  it('BR036b_PairedReadTimestamps_MapToCorrectTracks: paired "TS(track讀取)" annotations map to the correct track each', () => {
    const msg = {
      fields: {
        '對象已讀': '後台軌已讀 + 前台軌已讀',
        '讀取時間': '2026-05-31 16:44(後台軌讀取) · 2026-05-31 23:22(前台軌讀取)',
      },
    };
    const { reads } = deriveReads(msg, ['後台軌', '前台軌']);
    const byTrack = Object.fromEntries(reads.map(r => [r.track, r.read_at]));
    expect(byTrack['後台軌']).toBe('2026-05-31T16:44:00.000+08:00');
    expect(byTrack['前台軌']).toBe('2026-05-31T23:22:00.000+08:00');
  });

  it('a bare "已讀" with a single timestamp signs off every to_tracks recipient at that same timestamp', () => {
    const msg = { fields: { '對象已讀': '已讀', '讀取時間': '2026-06-01 10:05' } };
    const { reads } = deriveReads(msg, ['前台軌', '後台軌']);
    expect(reads).toHaveLength(2);
    expect(reads.every(r => r.read_at === '2026-06-01T10:05:00.000+08:00')).toBe(true);
  });
});

// ============================================================
// BR-037: msg_type keyword priority + inferred flag
// ============================================================
describe('BR-037: msg_type classification', () => {
  it('BR037_NoSubjectKeywordMatch_DefaultsInformWithFlag: an unmatched subject defaults to inform with type_inferred', () => {
    const r = classifyMsgType('沒有任何已知關鍵字的主旨文字');
    expect(r.msg_type).toBe('inform');
    expect(r.inferred).toBe(true);
  });

  it('keyword priority: 知會 > 交辦/交接/移交 > 裁定/決議/定案 > 請求 > 看板/登記/開關/窗口', () => {
    expect(classifyMsgType('知會:同時也交辦一下').msg_type).toBe('inform'); // 知會 wins over 交辦
    expect(classifyMsgType('交辦事項').msg_type).toBe('handoff');
    expect(classifyMsgType('裁定結果').msg_type).toBe('decision');
    expect(classifyMsgType('請求協助').msg_type).toBe('request');
    expect(classifyMsgType('看板登記').msg_type).toBe('state');
    expect(classifyMsgType('交辦事項').inferred).toBe(false);
  });
});

// ============================================================
// BR-038 / BR-039: idempotent rerun + reconciliation
// ============================================================
describe('BR-038/BR-039: idempotent rerun and reconciliation', () => {
  function fixtureFiles() {
    return [
      { key: 'lf', sourceRank: 0, channel: 'general', category: null, absPath: fixturePath('sample-lf.md') },
    ];
  }

  it('BR038_RerunImport_ZeroInsertAndPreservesNativeMessage: a second run inserts nothing and a native post survives untouched', () => {
    const first = runImport(ctx.dbPath, { files: fixtureFiles() });
    expect(first.reconcilePass).toBe(true);
    expect(first.messagesInserted).toBe(3);

    // 2026-06-02 11:00:00's imported 通話狀態 is 通話中(等前台軌確認)— thread stays open,
    // unlike 2026-06-01 10:00:00 whose sole message already reads 結束(closed on import).
    const native = postCtrlMessage(
      { thread_id: '2026-06-02 11:00:00', from_track: '前台軌', to_tracks: ['後台軌'], msg_type: 'inform', body: '原生新增訊息' },
      { dbPath: ctx.dbPath }
    );
    expect(native.ok).toBe(true);

    const second = runImport(ctx.dbPath, { files: fixtureFiles() });
    expect(second.messagesInserted).toBe(0);
    expect(second.threadsInserted).toBe(0);
    expect(second.readsInserted).toBe(0);
    expect(second.reconcilePass).toBe(true);

    const row = ctx.db.prepare('SELECT body, seq FROM ctrl_messages WHERE msg_id=?').get(native.msg_id);
    expect(row.body).toBe('原生新增訊息');
    expect(row.seq).toBe(native.seq);
  });

  it('BR038b_OutOfOrderAppend_IsBodyConflictNotSilentLoss: a retroactively-dated block shifts seq; the shift is caught, nothing is written, reconcile=FAIL', () => {
    // Regression (CR F1): seq is re-derived from the full-order sort every run, so appending a
    // block dated *between* existing messages shifts every later message one slot. INSERT OR
    // IGNORE then dropped the new block and duplicated the last one, while per-file counts still
    // matched — reconcile reported PASS over corrupted data. Verified empirically before the fix.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccb1-ooo-'));
    const md = path.join(dir, 'chan.md');
    const files = [{ key: 'chan', sourceRank: 0, channel: 'general', category: null, absPath: md }];
    const SEP = '-'.repeat(87);
    const blk = (time, subject, body) => [
      '`流水號` 2026-06-01 10:00:00', '`留言AGENT` phycool 前台軌 + CC-OPUS',
      '`留言時間` ' + time, '`主旨` ' + subject, '`留言內容`', body,
      '`留言對象` 後台軌', '`對象已讀`', '`讀取時間`', '`通話狀態` 通話中', '', SEP, '',
    ].join('\n');

    fs.writeFileSync(md, blk('2026-06-01 10:00', 'A', 'MSG-A') + blk('2026-06-01 14:00', 'C', 'MSG-C'), 'utf8');
    expect(runImport(ctx.dbPath, { files }).reconcilePass).toBe(true);

    // retroactive block D lands chronologically between A and C
    fs.appendFileSync(md, blk('2026-06-01 11:00', 'D', 'MSG-D-NEW'), 'utf8');
    const second = runImport(ctx.dbPath, { files });

    expect(second.reconcilePass).toBe(false);
    expect(second.bodyConflicts.length).toBeGreaterThan(0);
    expect(second.messagesInserted).toBe(0); // whole thread skipped — no duplicate written

    const bodies = ctx.db.prepare('SELECT body FROM ctrl_messages ORDER BY seq').all().map(r => r.body);
    expect(bodies).toEqual(['MSG-A', 'MSG-C']); // untouched: no duplicate, no reordering
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a chronologically-last append still imports cleanly (the shift guard must not over-block)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccb1-tail-'));
    const md = path.join(dir, 'chan.md');
    const files = [{ key: 'chan', sourceRank: 0, channel: 'general', category: null, absPath: md }];
    const SEP = '-'.repeat(87);
    const blk = (time, subject, body) => [
      '`流水號` 2026-06-01 10:00:00', '`留言AGENT` phycool 前台軌 + CC-OPUS',
      '`留言時間` ' + time, '`主旨` ' + subject, '`留言內容`', body,
      '`留言對象` 後台軌', '`對象已讀`', '`讀取時間`', '`通話狀態` 通話中', '', SEP, '',
    ].join('\n');

    fs.writeFileSync(md, blk('2026-06-01 10:00', 'A', 'MSG-A'), 'utf8');
    runImport(ctx.dbPath, { files });
    fs.appendFileSync(md, blk('2026-06-01 16:00', 'E', 'MSG-E-NEW'), 'utf8');
    const second = runImport(ctx.dbPath, { files });

    expect(second.reconcilePass).toBe(true);
    expect(second.bodyConflicts).toEqual([]);
    expect(second.messagesInserted).toBe(1);
    expect(ctx.db.prepare('SELECT body FROM ctrl_messages ORDER BY seq').all().map(r => r.body))
      .toEqual(['MSG-A', 'MSG-E-NEW']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('BR039_ReconcileMismatch_FailsWithNonZeroExit: a pre-existing row occupying an import target (thread_id,seq) makes that file blocks!=rows and reconcile=FAIL', () => {
    // Force a collision: seed a native row at the exact (thread_id,seq) the first fixture
    // block would occupy, so INSERT OR IGNORE silently skips it — rows ends up short of blocks.
    ctx.db.prepare(`
      INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at)
      VALUES ('2026-06-01 10:00:00', 'pre-existing', '前台軌', '2026-01-01T00:00:00+08:00')
    `).run();
    ctx.db.prepare(`
      INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
      VALUES ('2026-06-01 10:00:00', 1, '前台軌', '["後台軌"]', 'inform', 'collision row', '2026-01-01T00:00:00+08:00')
    `).run();

    const result = runImport(ctx.dbPath, { files: fixtureFiles() });
    expect(result.reconcilePass).toBe(false);
    const mismatched = result.reconcileRows.find(r => r.blocks !== r.rows);
    expect(mismatched).toBeDefined();
  });
});
