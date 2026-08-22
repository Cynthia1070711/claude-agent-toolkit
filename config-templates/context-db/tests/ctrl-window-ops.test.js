// ccb-4-ctrl-notify-knock — controller window registry ops(BR-001~BR-008)
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db
// (TD-CCB2-INJECT-TEST-READS-LIVE-DB-NONDETERMINISTIC 正是以生產 DB 為 fixture 造成的債)。
//
// 判活的 procMap 一律用注入的 stub:形狀與 reap-worker-runs.js 的 probeLiveProcesses()
// 回傳值相同(Map<pid, cmdLine>),故這裡的 stub 範式與 whp-3/whp-12 既有測試同構。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import windowOps from '../scripts/ctrl-window-ops.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CTRL_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-ctrl-channel-tables.sql'), 'utf8'
);
const WINDOW_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-08-03-add-controller-windows.sql'), 'utf8'
);

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+08:00$/;
const T1 = '2026-08-03T10:00:00.000+08:00';
const T2 = '2026-08-03T11:00:00.000+08:00';
const CLAUDE_CMD = '"${USER_HOME}\\.local\\bin\\claude.exe" --dangerously-skip-permissions';

let ctx;
const noProbe = () => null;                                   // 探測不可用 → console_pid 維持 NULL
const probeOk = () => ({ pid: 49500, cmdline: CLAUDE_CMD });  // 探測成功

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(CTRL_SQL);
  ctx.db.exec(WINDOW_SQL);
});
afterEach(() => ctx.cleanup());

function rows() {
  return ctx.db.prepare('SELECT * FROM controller_windows ORDER BY session_id').all();
}
function seedWindow(o = {}) {
  const row = {
    session_id: 's1', track: '前台軌', console_pid: 49500, console_cmdline: CLAUDE_CMD,
    bound_at: T1, last_seen_at: T1, last_knock_at: null, ...o,
  };
  ctx.db.prepare(`
    INSERT INTO controller_windows (session_id, track, console_pid, console_cmdline, bound_at, last_seen_at, last_knock_at)
    VALUES (@session_id, @track, @console_pid, @console_cmdline, @bound_at, @last_seen_at, @last_knock_at)
  `).run(row);
  return row;
}

describe('bindWindow', () => {
  it('BR001_FirstResolveOnUnboundSession_InsertsOneRow: a first resolution inserts exactly one row with offset-aware timestamps', () => {
    const r = windowOps.bindWindow(ctx.db, { sessionId: 'sess-a', track: '前台軌', now: windowOps.getTaiwanTimestamp(), probeFn: probeOk });
    expect(r.inserted).toBe(true);
    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0].session_id).toBe('sess-a');
    expect(all[0].track).toBe('前台軌');
    expect(all[0].bound_at).toMatch(TS_RE);
    expect(all[0].last_seen_at).toMatch(TS_RE);
    expect(all[0].console_pid).toBe(49500);
  });

  it('BR002_ReResolveDifferentTrack_UpdatesInPlace: the same session resolving a different track updates rather than inserts', () => {
    windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T1, probeFn: probeOk });
    windowOps.bindWindow(ctx.db, { sessionId: 's', track: '後台軌', now: T2, probeFn: probeOk });
    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0].track).toBe('後台軌');
  });

  it('BR003_Heartbeat_PreservesBoundAtAdvancesLastSeen: a heartbeat refreshes last_seen_at and leaves bound_at byte-identical', () => {
    windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T1, probeFn: probeOk });
    const before = rows()[0];
    windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T2, probeFn: probeOk });
    const after = rows()[0];
    expect(after.bound_at).toBe(before.bound_at);
    expect(after.last_seen_at).toBe(T2);
    expect(Date.parse(after.last_seen_at)).toBeGreaterThan(Date.parse(before.last_seen_at));
  });

  it('BR004_AncestorProbeUnavailable_BindStillSucceeds: an unavailable process probe leaves console_pid NULL but the bind still succeeds', () => {
    const r = windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T1, probeFn: noProbe });
    expect(r.inserted).toBe(true);
    const row = rows()[0];
    expect(row).toBeDefined();
    expect(row.console_pid).toBeNull();
    expect(row.console_cmdline).toBeNull();
  });

  it('BR041_BoundSession_AncestorProbeNeverRunsAgain: the ancestor probe is not invoked on a session that already has a row', () => {
    let calls = 0;
    const counting = () => { calls++; return probeOk(); };
    windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T1, probeFn: counting });
    expect(calls).toBe(1);
    for (let i = 0; i < 20; i++) {
      windowOps.bindWindow(ctx.db, { sessionId: 's', track: '前台軌', now: T2, probeFn: counting });
    }
    expect(calls).toBe(1);   // 20 次心跳,零額外探測
  });

  it('rejects a call missing its required arguments rather than writing a half row', () => {
    expect(() => windowOps.bindWindow(ctx.db, { sessionId: 's', track: '', now: T1 })).toThrow();
    expect(rows()).toHaveLength(0);
  });
});

describe('resolveTrackBySession / getWindow', () => {
  it('BR008_UnboundSession_ResolvesToNull: a session with no row resolves to null -- no inference, no row creation', () => {
    seedWindow({ session_id: 'known' });
    expect(windowOps.resolveTrackBySession(ctx.db, 'unknown')).toBeNull();
    expect(windowOps.getWindow(ctx.db, 'unknown')).toBeUndefined();
    expect(rows()).toHaveLength(1);   // 查詢不得建列
  });

  it('resolves the bound track for a known session', () => {
    seedWindow({ session_id: 'known', track: 'BMAD升級軌' });
    expect(windowOps.resolveTrackBySession(ctx.db, 'known')).toBe('BMAD升級軌');
  });

  it('treats an empty session id as unresolvable', () => {
    seedWindow();
    expect(windowOps.resolveTrackBySession(ctx.db, '')).toBeNull();
  });
});

describe('judgeWindowLiveness (2-Tuple)', () => {
  it('BR005_NullConsolePid_JudgedNotKnockableWithCode: a NULL console_pid is refused before any injection is considered', () => {
    const v = windowOps.judgeWindowLiveness({ console_pid: null, console_cmdline: null }, new Map());
    expect(v.alive).toBe(false);
    expect(v.code).toBe('CCB4-E03');
  });

  it('BR006_PidPresentAndCmdlineMatches_JudgedAlive: both tuples satisfied means alive', () => {
    const v = windowOps.judgeWindowLiveness(seedWindow(), new Map([[49500, CLAUDE_CMD]]));
    expect(v.alive).toBe(true);
  });

  it('BR006_CmdlineMismatch_JudgedPidReused: a reused Windows PID is caught by the stored command line', () => {
    const v = windowOps.judgeWindowLiveness(seedWindow(), new Map([[49500, 'C:\\Windows\\notepad.exe']]));
    expect(v.alive).toBe(false);
    expect(v.reason).toBe('pid-reused');
    expect(v.code).toBe('CCB4-E04');
  });

  it('BR006_PidAbsentFromProcMap_JudgedWindowGone: a PID no longer running is not alive', () => {
    const v = windowOps.judgeWindowLiveness(seedWindow(), new Map());
    expect(v.alive).toBe(false);
    expect(v.reason).toBe('window-gone');
  });

  it('BR006_CmdlineComparisonIsCaseInsensitive: Windows paths are case-insensitive, so casing alone must not read as pid-reuse', () => {
    const v = windowOps.judgeWindowLiveness(seedWindow(), new Map([[49500, CLAUDE_CMD.toUpperCase()]]));
    expect(v.alive).toBe(true);
  });

  it('treats a missing row as not alive rather than throwing', () => {
    const v = windowOps.judgeWindowLiveness(undefined, new Map());
    expect(v.alive).toBe(false);
    expect(v.code).toBe('CCB4-E02');
  });
});

describe('findKnockTarget', () => {
  it('picks the most recently seen window and flags the ambiguity when a track has more than one', () => {
    seedWindow({ session_id: 'old', track: '前台軌', last_seen_at: T1 });
    seedWindow({ session_id: 'new', track: '前台軌', last_seen_at: T2 });
    const r = windowOps.findKnockTarget(ctx.db, '前台軌');
    expect(r.row.session_id).toBe('new');
    expect(r.ambiguous).toBe(true);
  });

  it('reports no ambiguity for the ordinary single-window case', () => {
    seedWindow({ session_id: 'only', track: '後台軌' });
    const r = windowOps.findKnockTarget(ctx.db, '後台軌');
    expect(r.row.session_id).toBe('only');
    expect(r.ambiguous).toBe(false);
  });

  it('returns undefined for a track with no bound window', () => {
    expect(windowOps.findKnockTarget(ctx.db, '賦能軌').row).toBeUndefined();
  });
});

describe('loadCanonicalTracks', () => {
  it('excludes the unspecified sentinel and sorts longest-first', () => {
    ctx.db.prepare(`INSERT INTO ctrl_threads (thread_id, topic, initiator_track, created_at) VALUES ('t','x','後台軌',?)`).run(T1);
    for (const [seq, from] of [[1, '後台軌'], [2, 'unspecified'], [3, '主視窗手動軌']]) {
      ctx.db.prepare(`
        INSERT INTO ctrl_messages (thread_id, seq, from_track, to_tracks, msg_type, body, created_at)
        VALUES ('t', ?, ?, '["前台軌"]', 'inform', 'b', ?)
      `).run(seq, from, T1);
    }
    const list = windowOps.loadCanonicalTracks(ctx.db);
    expect(list).not.toContain('unspecified');
    expect(list).toEqual(['主視窗手動軌', '後台軌']);   // 長度由長到短
  });
});

describe('probeAncestorConsole', () => {
  const chain = JSON.stringify([
    { ProcessId: 100, ParentProcessId: 200, Name: 'node.exe', CommandLine: 'node hook.js' },
    { ProcessId: 200, ParentProcessId: 300, Name: 'pwsh.exe', CommandLine: 'pwsh -Command x' },
    { ProcessId: 300, ParentProcessId: 400, Name: 'claude.exe', CommandLine: CLAUDE_CMD },
    { ProcessId: 400, ParentProcessId: 0, Name: 'explorer.exe', CommandLine: 'explorer' },
  ]);

  it('BR004_WalksAncestorChainToTheClaudeConsole: the nearest claude.exe ancestor supplies pid and command line', () => {
    const hit = windowOps.probeAncestorConsole({ startPid: 100, execFn: () => chain });
    expect(hit).toEqual({ pid: 300, cmdline: CLAUDE_CMD });
  });

  it('BR004_ProbeThrows_ReturnsNullRatherThanPropagating: an unavailable probe degrades to null so the bind can still succeed', () => {
    const hit = windowOps.probeAncestorConsole({ startPid: 100, execFn: () => { throw new Error('WMI unavailable'); } });
    expect(hit).toBeNull();
  });

  it('returns null when no ancestor is a claude console', () => {
    const noClaude = JSON.stringify([
      { ProcessId: 100, ParentProcessId: 400, Name: 'node.exe', CommandLine: 'node hook.js' },
      { ProcessId: 400, ParentProcessId: 0, Name: 'explorer.exe', CommandLine: 'explorer' },
    ]);
    expect(windowOps.probeAncestorConsole({ startPid: 100, execFn: () => noClaude })).toBeNull();
  });

  it('stops instead of looping when the ancestor chain points back at itself', () => {
    const cyclic = JSON.stringify([{ ProcessId: 7, ParentProcessId: 7, Name: 'x.exe', CommandLine: 'x' }]);
    expect(windowOps.probeAncestorConsole({ startPid: 7, execFn: () => cyclic })).toBeNull();
  });

  it('does not mistake the hook\'s own node process for a claude console', () => {
    // 刻意不把判準放寬成「Name=node.exe 且 cmd 含 claude」—— hook 自己的命令列必然含
    // `.claude/hooks/...`,放寬會讓它命中自己,拿到一個不承載 console 的短命 PID。
    const decoy = JSON.stringify([
      { ProcessId: 100, ParentProcessId: 0, Name: 'node.exe', CommandLine: 'node .claude/hooks/ctrl-channel-inject.js' },
    ]);
    expect(windowOps.probeAncestorConsole({ startPid: 100, execFn: () => decoy })).toBeNull();
  });
});
