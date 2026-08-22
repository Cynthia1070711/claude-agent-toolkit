// ccb-4-ctrl-notify-knock — 中控域敲門決策層(BR-028~BR-035 / BR-040)
// 走隔離 temp DB + 注入 probe/log stub,絕不連 phycool.db、絕不真的碰任何 console。
//
// 這一層的所有「不做」都比「做」重要:零未讀不敲、判活不符不敲、速率上界內不敲、
// 探測不可用不敲。每一條都有對應案例,因為敲門的副作用落在使用者看得見的視窗上。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { decideKnock, stampAfterKnock, buildKnockText, resolveKnockConfig, parseArgs } from '../scripts/knock-controller-ops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const CTRL_SQL = fs.readFileSync(path.join(__dirname, '..', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql'), 'utf8');
const WINDOW_SQL = fs.readFileSync(path.join(__dirname, '..', 'migrations', '2026-08-03-add-controller-windows.sql'), 'utf8');

const T1 = '2026-08-03T10:00:00.000+08:00';
const CLAUDE_CMD = '"${USER_HOME}\\.local\\bin\\claude.exe" --dangerously-skip-permissions';
const SENTINEL = 'SENTINEL-CCB4-BODY-LEAK';
const ALIVE = () => new Map([[49500, CLAUDE_CMD]]);

let ctx;
let logPath;

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(CTRL_SQL);
  ctx.db.exec(WINDOW_SQL);
  logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ccb4-log-')), 'knock.log');
});
afterEach(() => {
  ctx.cleanup();
  try { fs.rmSync(path.dirname(logPath), { recursive: true, force: true }); } catch { /* ignore */ }
});

/**
 * 綁定一個視窗。預設順帶讓該軌進入 canonical 清單 —— 這反映真實不變量:registry 只收
 * `ctrl-channel-inject.js` 驗過的 canonical 軌名,所以「有 registry 列的軌必然 canonical」。
 * `canonical:false` 供刻意測試非 canonical 軌名被拒的案例。
 */
function seedWindow(o = {}) {
  const { canonical = true, ...row } = {
    session_id: 's1', track: '前台軌', console_pid: 49500, console_cmdline: CLAUDE_CMD,
    bound_at: T1, last_seen_at: T1, last_knock_at: null, ...o,
  };
  ctx.db.prepare(`
    INSERT INTO controller_windows (session_id, track, console_pid, console_cmdline, bound_at, last_seen_at, last_knock_at)
    VALUES (@session_id, @track, @console_pid, @console_cmdline, @bound_at, @last_seen_at, @last_knock_at)
  `).run(row);
  if (canonical) makeCanonical(row.track);
}

/** canonical 清單來自 DISTINCT from_track,故要讓一個軌名 canonical 就得有它寄出過的訊息。 */
function seedMessage({ from = '後台軌', to = ['前台軌'], seq = 1, body = 'body', thread = 't1' } = {}) {
  ctx.db.prepare(`INSERT OR IGNORE INTO ctrl_threads (thread_id, topic, initiator_track, created_at) VALUES (?,?,?,?)`)
    .run(thread, 'topic', from, T1);
  ctx.db.prepare(`
    INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
    VALUES (?,?,?,?,'inform',?,?)
  `).run(thread, seq, from, JSON.stringify(to), body, T1);
}

/**
 * 讓 track 進入 canonical 清單(= 它得寄出過訊息,因為 canonical 取 DISTINCT from_track)
 * 但不製造任何寄給它的未讀。冪等 —— 同一軌重複呼叫不會撞 (thread_id, seq) 唯一索引。
 */
function makeCanonical(track) {
  const has = ctx.db.prepare('SELECT 1 FROM ctrl_messages WHERE from_track = ? LIMIT 1').get(track);
  if (!has) seedMessage({ from: track, to: ['某個不存在的軌'], seq: 1, thread: 'canon-' + track });
}

const opts = (extra = {}) => ({ dbPath: ctx.dbPath, probeFn: ALIVE, logPath, ...extra });

describe('decideKnock — 前置與 no-op', () => {
  it('BR029_KnockText_PureAsciiOmitsCjkTrackNameCarriesCountAndPointer: the payload survives console-knock.ps1\'s ASCII guard', () => {
    const text = buildKnockText(3);
    expect(text).toMatch(/^[\x20-\x7E]+$/);          // console-knock.ps1:93-97 的拒絕域之外
    expect(text).toContain('3');
    expect(text).toContain('read_ctrl_messages');
    for (const t of ['前台軌', '後台軌', '賦能軌', 'azure佈署軌', '主視窗手動軌', 'BMAD升級軌']) {
      expect(text).not.toContain(t);                 // 6 個 canonical 軌名皆為 CJK,必被省略
    }
  });

  it('BR030_KnockText_ExcludesMessageBody: a sentinel body never reaches the payload', () => {
    seedWindow();
    seedMessage({ body: SENTINEL });
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(true);
    expect(JSON.stringify(d)).not.toContain(SENTINEL);
  });

  it('BR031_KnockWithZeroUnread_LegitimateNoOp: an empty queue is a no-op with exit 0, not an error', () => {
    seedWindow();
    makeCanonical('前台軌');
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(false);
    expect(d.exit).toBe(0);
    expect(d.reason).toBe('no-unread');
    expect(d.text).toBeNull();
  });

  it('CCB4E01_NonCanonicalTrack_RefusedExitTwo: only names the DB actually knows are accepted', () => {
    seedWindow({ track: '不存在的軌XYZ', canonical: false });
    const d = decideKnock('不存在的軌XYZ', opts());
    expect(d.code).toBe('CCB4-E01');
    expect(d.exit).toBe(2);
  });

  it('CCB4E01_EmptyTrack_RefusedBeforeOpeningDb: a missing -Track is refused up front', () => {
    const d = decideKnock('', opts());
    expect(d.code).toBe('CCB4-E01');
    expect(d.exit).toBe(2);
  });

  it('CCB4E02_NoBoundWindow_NoOpExitZero: a track with no registered window is a legitimate no-op', () => {
    seedMessage();
    makeCanonical('前台軌');   // 軌名合法,只是沒有任何視窗綁定到它
    const d = decideKnock('前台軌', opts());
    expect(d.code).toBe('CCB4-E02');
    expect(d.exit).toBe(0);
  });

  it('BR005_NullConsolePid_RefusedExitTwo: a window bound without a console PID is not knockable', () => {
    seedWindow({ console_pid: null, console_cmdline: null });
    seedMessage();
    const d = decideKnock('前台軌', opts());
    expect(d.code).toBe('CCB4-E03');
    expect(d.exit).toBe(2);
    expect(d.targetPid).toBeNull();
  });
});

describe('decideKnock — 判活與 fail 方向', () => {
  it('BR032_LivenessFail_SkipsWithExactlyOneAuditLineAndZeroInjection: a mismatched command line is skipped, audited once, and never injected', () => {
    seedWindow();
    seedMessage();
    const d = decideKnock('前台軌', opts({ probeFn: () => new Map([[49500, 'C:\\Windows\\notepad.exe']]) }));
    expect(d.exit).toBe(2);
    expect(d.code).toBe('CCB4-E04');
    expect(d.reason).toBe('pid-reused');
    expect(d.text).toBeNull();                      // 沒有可注入的承載 = 零注入
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);                  // 恰一行
    expect(lines[0]).toContain('49500');            // 含 target PID
    expect(lines[0]).toContain('CCB4-E04');         // 含原因碼
  });

  it('BR034_ProbeUnavailable_FailsClosedExitTwo: an unavailable liveness probe must never lead to an injection', () => {
    seedWindow();
    seedMessage();
    const d = decideKnock('前台軌', opts({ probeFn: () => { throw new Error('WMI unavailable'); } }));
    expect(d.code).toBe('CCB4-E05');
    expect(d.exit).toBe(2);
    expect(d.text).toBeNull();
  });

  it('BR034_DbUnreadable_FailsOpenExitZero: an unreadable DB is not worth blocking on -- not knocking is harmless', () => {
    const d = decideKnock('前台軌', opts({ dbPath: path.join(os.tmpdir(), 'ccb4-no-such-db-' + Date.now(), 'x.db') }));
    expect(d.code).toBe('CCB4-E06');
    expect(d.exit).toBe(0);
  });

  it('does not write an audit line on the happy path', () => {
    seedWindow();
    seedMessage();
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(true);
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

describe('decideKnock — 速率上界與 kill switch', () => {
  it('BR040_SecondKnockInsideMinInterval_IsNoOp: a second call inside the interval cannot flood a console', () => {
    const justKnocked = new Date(Date.now() - 5000).toISOString().replace('Z', '+00:00');
    seedWindow({ last_knock_at: justKnocked });
    seedMessage();
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(false);
    expect(d.exit).toBe(0);
    expect(d.reason).toContain('rate-limited');
  });

  it('BR040_KnockAfterIntervalElapsed_ProceedsNormally: once the interval has passed the target is knockable again', () => {
    seedWindow({ last_knock_at: '2026-08-03T09:00:00.000+08:00' });
    seedMessage();
    const d = decideKnock('前台軌', opts({ nowMs: Date.parse('2026-08-03T10:00:00.000+08:00') }));
    expect(d.ok).toBe(true);
  });

  it('BR040_UnparseableLastKnockAt_TreatedAsNeverKnocked: a corrupted timestamp self-heals rather than locking the target out forever', () => {
    seedWindow({ last_knock_at: 'not-a-timestamp' });
    seedMessage();
    expect(decideKnock('前台軌', opts()).ok).toBe(true);
  });

  it('KillSwitchOff_IsATrueNoOp: knockEnabled=false means zero DB reads and zero injection', () => {
    const cfg = path.join(path.dirname(logPath), 'cfg-off.json');
    fs.writeFileSync(cfg, JSON.stringify({ ctrlChannel: { knockEnabled: false } }), 'utf8');
    seedWindow();
    seedMessage();
    const d = decideKnock('前台軌', opts({ configPath: cfg }));
    expect(d.reason).toBe('disabled');
    expect(d.exit).toBe(0);
    expect(d.text).toBeNull();
  });

  it('KillSwitchNonBoolean_StaysOnButIsReported: a typo must not silently disable the switch without saying so', () => {
    const cfg = path.join(path.dirname(logPath), 'cfg-bad.json');
    fs.writeFileSync(cfg, JSON.stringify({ ctrlChannel: { knockEnabled: 'false' } }), 'utf8');
    const r = resolveKnockConfig(cfg);
    expect(r.enabled).toBe(true);
    expect(r.invalid).toBe(true);
    seedWindow();
    seedMessage();
    expect(decideKnock('前台軌', opts({ configPath: cfg })).configWarning).toContain('knockEnabled');
  });

  it('MissingConfig_FallsBackToDefaults: an unreadable config keeps the verified channel working', () => {
    const r = resolveKnockConfig(path.join(os.tmpdir(), 'ccb4-no-such-config.json'));
    expect(r).toEqual({ enabled: true, minIntervalSec: 60, invalid: false });
  });

  it('reads the live pipeline-config.json and finds a real consumer for all three keys', () => {
    // AC4 明列:每個鍵都要有真實消費端,避免重蹈 TD-WHP2-AUTOCLOSE-FLAG-NO-CONSUMER
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'pipeline-config.json'), 'utf8'));
    expect(cfg.ctrlChannel).toBeDefined();
    expect(typeof cfg.ctrlChannel.probeThrottleSec).toBe('number');
    expect(typeof cfg.ctrlChannel.knockMinIntervalSec).toBe('number');
    expect(typeof cfg.ctrlChannel.knockEnabled).toBe('boolean');
    const probeSrc = fs.readFileSync(path.join(REPO, '.claude', 'hooks', 'ctrl-channel-probe.js'), 'utf8');
    const opsSrc = fs.readFileSync(path.join(REPO, '.context-db', 'scripts', 'knock-controller-ops.js'), 'utf8');
    expect(probeSrc).toContain('probeThrottleSec');
    expect(opsSrc).toContain('knockMinIntervalSec');
    expect(opsSrc).toContain('knockEnabled');
  });
});

describe('stampAfterKnock', () => {
  it('BR033_StampsOnlyTheTargetedWindow: the stamp lands on the same row findKnockTarget picks', () => {
    seedWindow({ session_id: 'old', last_seen_at: '2026-08-03T09:00:00.000+08:00' });
    seedWindow({ session_id: 'new', last_seen_at: '2026-08-03T11:00:00.000+08:00' });
    const r = stampAfterKnock('前台軌', { dbPath: ctx.dbPath, now: T1 });
    expect(r.ok).toBe(true);
    const rows = ctx.db.prepare('SELECT session_id, last_knock_at FROM controller_windows ORDER BY session_id').all();
    expect(rows.find(x => x.session_id === 'new').last_knock_at).toBe(T1);
    expect(rows.find(x => x.session_id === 'old').last_knock_at).toBeNull();
  });

  it('BR033_DecideKnockNeverStamps: the decision layer has zero side effects -- stamping is the caller\'s job after a successful injection', () => {
    seedWindow();
    seedMessage();
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(true);
    expect(ctx.db.prepare('SELECT last_knock_at FROM controller_windows WHERE session_id=?').get('s1').last_knock_at).toBeNull();
  });

  it('reports a miss rather than throwing when the track has no window', () => {
    const r = stampAfterKnock('賦能軌', { dbPath: ctx.dbPath });
    expect(r.ok).toBe(false);
    expect(r.changes).toBe(0);
  });

  // ---- CR(2026-08-03):決策與蓋章之間的 TOCTOU ----
  // 上面 BR033_StampsOnlyTheTargetedWindow 驗的是「重算 last_seen_at 最新」,那正是問題所在:
  // 同軌多視窗時,決策選中 A 之後、蓋章之前若 B 送出 prompt 更新 last_seen_at,重算就會選到 B。
  // 後果是敲 A 卻蓋 B —— A 的速率上界失效(可被連續敲),B 的敲門預算被平白吃掉。
  // 修法是把決策當下的 session_id 一路帶到蓋章,不讓它重算。
  it('CR_DecideKnockExposesSessionId: the decision carries the row identity so the caller need not recompute it', () => {
    seedWindow({ session_id: 'target' });
    seedMessage();
    const d = decideKnock('前台軌', opts());
    expect(d.ok).toBe(true);
    expect(d.sessionId).toBe('target');
  });

  it('CR_StampWithSessionIdSurvivesAHeartbeatRace: a rival window overtaking last_seen_at must not steal the stamp', () => {
    seedWindow({ session_id: 'knocked', last_seen_at: '2026-08-03T11:00:00.000+08:00' });
    seedWindow({ session_id: 'rival', last_seen_at: '2026-08-03T09:00:00.000+08:00' });
    // 決策選中 'knocked'(當下 last_seen_at 較新)
    const target = 'knocked';
    // 注入期間 'rival' 送出 prompt,心跳把它推到最前
    ctx.db.prepare("UPDATE controller_windows SET last_seen_at=? WHERE session_id='rival'")
      .run('2026-08-03T11:30:00.000+08:00');

    const r = stampAfterKnock('前台軌', { dbPath: ctx.dbPath, sessionId: target, now: T1 });
    expect(r.ok).toBe(true);
    const rows = ctx.db.prepare('SELECT session_id, last_knock_at FROM controller_windows').all();
    expect(rows.find(x => x.session_id === 'knocked').last_knock_at).toBe(T1);
    expect(rows.find(x => x.session_id === 'rival').last_knock_at).toBeNull();
  });

  it('CR_StampSessionIdIsTrackScoped: a session_id from another track is a miss, not a cross-track stamp', () => {
    seedWindow({ session_id: 's-front', track: '前台軌' });
    seedWindow({ session_id: 's-back', track: '後台軌' });
    const r = stampAfterKnock('前台軌', { dbPath: ctx.dbPath, sessionId: 's-back', now: T1 });
    expect(r.ok).toBe(false);
    expect(r.changes).toBe(0);
    expect(ctx.db.prepare("SELECT last_knock_at FROM controller_windows WHERE session_id='s-back'").get().last_knock_at).toBeNull();
  });

  it('CR_StampFallsBackWhenNoSessionId: omitting the id keeps the pre-CR behaviour for direct callers', () => {
    seedWindow({ session_id: 'old', last_seen_at: '2026-08-03T09:00:00.000+08:00' });
    seedWindow({ session_id: 'new', last_seen_at: '2026-08-03T11:00:00.000+08:00' });
    const r = stampAfterKnock('前台軌', { dbPath: ctx.dbPath, now: T1 });
    expect(r.ok).toBe(true);
    expect(ctx.db.prepare("SELECT last_knock_at FROM controller_windows WHERE session_id='new'").get().last_knock_at).toBe(T1);
  });

  it('CR_ParseArgsAcceptsStampSession: the CLI can forward the row identity', () => {
    const a = parseArgs(['--stamp', '前台軌', '--stamp-session', 'abc']);
    expect(a.error).toBeNull();
    expect(a.stampTrack).toBe('前台軌');
    expect(a.stampSession).toBe('abc');
  });
});

describe('靜態守護', () => {
  it('BR035_KnockScripts_ZeroTerminationPrimitives: neither new file names a termination, window-closing, console-control or focus API -- comments included', () => {
    // 對齊 whp-12 smoke Group 16:守護不對註解開例外,否則「零命中」不再是零命中。
    const FORBIDDEN = [
      'taskkill', 'Stop-Process', 'TerminateProcess', 'GenerateConsoleCtrlEvent',
      'SetForegroundWindow', 'ShowWindow', 'CloseMainWindow', 'ExitProcess',
      'process.kill', '.Kill(', 'FreeConsole', 'AttachConsole', 'WriteConsoleInput',
    ];
    const files = [
      path.join(REPO, '.context-db', 'scripts', 'knock-controller-ops.js'),
      path.join(REPO, '.claude', 'skills', 'party-to-pipeline', 'scripts', 'knock-controller.ps1'),
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const word of FORBIDDEN) {
        expect(src, `${path.basename(f)} must not name ${word}`).not.toContain(word);
      }
    }
  });

  it('BR028_ConsoleKnockPrimitive_ByteIdentical: the whp-12 primitive is consumed unmodified', () => {
    const out = execFileSync('git', ['diff', '--stat', '--', '.claude/skills/party-to-pipeline/scripts/console-knock.ps1'],
      { cwd: REPO, encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });

  // CR(2026-08-03)補:BR-009 在 §6.2 逐案例對帳中是全表唯一「查無對映測試」的一列。
  // 該不變量原本只有人工 grep 驗過 —— 而它正是本卡最容易靜默回歸的一項:任何消費端
  // 圖方便內聯一份自己的 WHERE,四處漂移的舊病就復發(修前 inject 三條齊備、ops 只有一條,
  // 誤撈率 94.7-100% 即由此而來)。靜態斷言比照上方 BR035 範式。
  it('BR009_UnreadPredicate_SingleDefinitionSite: exactly one file defines the predicate; every other file only consumes it', () => {
    const DEFINITION = path.join(REPO, '.context-db', 'scripts', 'ctrl-unread-sql.cjs');
    const CONSUMERS = [
      ['.context-db', 'scripts', 'ctrl-channel-ops.js'],
      ['.context-db', 'scripts', 'knock-controller-ops.js'],
      ['.claude', 'hooks', 'ctrl-channel-inject.js'],
      ['.claude', 'hooks', 'ctrl-channel-probe.js'],
      ['.claude', 'hooks', 'ctrl-channel-stop-check.js'],
    ].map(p => path.join(REPO, ...p));

    // 定義站點恰一處
    const defSrc = fs.readFileSync(DEFINITION, 'utf8');
    const defCount = (defSrc.match(/const\s+UNREAD_PREDICATE\s*=/g) || []).length;
    expect(defCount, 'ctrl-unread-sql.cjs should define UNREAD_PREDICATE exactly once').toBe(1);

    // 消費端只引用不自訂:不得出現第二份定義,也不得內聯等價 SQL 片段
    for (const f of CONSUMERS) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, `${path.basename(f)} must not redefine the predicate`).not.toMatch(/const\s+UNREAD_PREDICATE\s*=/);
      expect(src, `${path.basename(f)} must not inline its own json_each(to_tracks) recipient filter`)
        .not.toMatch(/FROM\s+json_each\s*\(\s*m?\.?to_tracks\s*\)/i);
      expect(src, `${path.basename(f)} should consume ctrl-unread-sql`).toContain('ctrl-unread-sql');
    }
  });
});

describe('parseArgs', () => {
  it('requires either --track or --stamp', () => {
    expect(parseArgs([]).error).toBeTruthy();
    expect(parseArgs(['--track', '前台軌']).error).toBeNull();
    expect(parseArgs(['--stamp', '前台軌']).error).toBeNull();
  });

  it('rejects an unknown flag instead of silently ignoring it', () => {
    expect(parseArgs(['--track', 'x', '--bogus']).error).toContain('未知參數');
  });
});
