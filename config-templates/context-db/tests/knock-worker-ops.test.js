// whp-12 code-review F1:補 smoke Group 16 結構上到不了的那一半覆蓋。
//
// Group 16 的 temp-DB 案例全數止步於 4-Tuple 判活 —— 它的 `wrapper_pid` 只能填 0 或 smoke 自己的
// `$PID`,兩者的 CommandLine 都不可能含測試捏造的 `ipc_dir`,故 `peekPending` 之後的每一條規則
// (BR-018 / BR-019 / BR-020 / BR-021 / BR-022 的零 mutation)實際上從未被執行過,斷言卻全綠。
// 本檔以 `decideKnock` 早已備妥的 `probeFn` 注入點餵一份假的 proc map,讓判活通過,
// 那幾條規則才第一次真的跑到。
//
// 另一半原因也在此鎖住:Group 16 的 seeder 漏了 `worker_messages.author`(NOT NULL),
// 每一筆訊息 INSERT 都會拋、被 New-G16Db 的 try/catch 吞掉,於是所有 temp DB 其實零訊息。
// 本檔的 seeder 欄位完整,`BR019_ZeroPending...` 與 `BR020_TwoPending...` 的對照才有意義。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import {
  decideKnock,
  stampAfterKnock,
  resolveKnockEnabled,
  secondPrecision,
  KNOCKABLE_LIFECYCLES,
} from '../scripts/knock-worker-ops.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql');

const IPC_DIR = 'C:\\whp12-test\\ipc';
const LIVE_PID = 424242;
const LIVE_CMDLINE = `powershell.exe -NoExit -File C:\\x\\worker-dev.ps1 -IpcDir ${IPC_DIR}`;

/** 判活通過用的假探測。judgeLiveness 的 4 個 Tuple 全部對得上。 */
const passingProbe = () => new Map([[LIVE_PID, LIVE_CMDLINE]]);

let tmpDir;
let seq = 0;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whp12-ops-'));
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 隔離 temp DB(範式取自 worker-directive-poll.test.js 的 createTestDb)。 */
function seedDb({ lifecycle = 'reported', pending = 0, knocked = 0, wrapperPid = LIVE_PID } = {}) {
  seq += 1;
  const runId = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const dbPath = path.join(tmpDir, `run-${seq}.db`);
  const db = new Database(dbPath);
  db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  try { db.exec('ALTER TABLE worker_messages ADD COLUMN knocked_at TEXT'); } catch { /* 已有 */ }

  const T = '2026-01-01T00:00:00+08:00';
  db.prepare(`INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode,
    lifecycle, controller_track, wrapper_pid, started_at, updated_at)
    VALUES (?,?,?,?,?,'window',?,'test',?,?,?)`)
    .run(runId, runId, 'whp12-test', 'dev-story', IPC_DIR, lifecycle, wrapperPid, T, T);

  // author 為 NOT NULL —— 漏填會讓整批訊息 INSERT 靜默消失(Group 16 seeder 的實際狀況)
  const ins = db.prepare(`INSERT INTO worker_messages
    (run_id, seq, direction, msg_type, body, author, state, created_at, knocked_at)
    VALUES (?,?,'controller-to-worker','directive','BODY-MUST-NOT-LEAK','controller','pending',?,?)`);
  let s = 1;
  for (let i = 0; i < pending; i += 1) ins.run(runId, s++, T, null);
  for (let i = 0; i < knocked; i += 1) ins.run(runId, s++, T, T);

  const msgIds = db.prepare('SELECT msg_id FROM worker_messages WHERE run_id=? ORDER BY seq')
    .all(runId).map((r) => r.msg_id);
  db.close();
  return { runId, dbPath, msgIds };
}

function readMessages(dbPath, runId) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT msg_id, state, knocked_at FROM worker_messages WHERE run_id=? ORDER BY seq').all(runId);
  db.close();
  return rows;
}

function writeConfig(name, json) {
  const p = path.join(tmpDir, `${name}.json`);
  fs.writeFileSync(p, json, 'utf8');
  return p;
}

describe('resolveKnockEnabled — kill switch 型別紀律 (BR-022)', () => {
  it('BR022_BooleanFalse_DisablesTheChannel', () => {
    const p = writeConfig('off', '{"workerProtocol":{"knockEnabled":false}}');
    expect(resolveKnockEnabled(p)).toEqual({ enabled: false, invalid: false });
  });

  it('BR022_BooleanTrue_EnablesTheChannel', () => {
    const p = writeConfig('on', '{"workerProtocol":{"knockEnabled":true}}');
    expect(resolveKnockEnabled(p)).toEqual({ enabled: true, invalid: false });
  });

  // CR F1/F2 回歸鎖:`v !== false` 之下這三個全部靜默落在「開」,操作者以為關掉了其實沒有。
  it.each([
    ['string "false"', '{"workerProtocol":{"knockEnabled":"false"}}'],
    ['number 0', '{"workerProtocol":{"knockEnabled":0}}'],
    ['string "off"', '{"workerProtocol":{"knockEnabled":"off"}}'],
  ])('BR022_NonBooleanValue_StaysEnabledButIsFlaggedInvalid (%s)', (_label, json) => {
    const p = writeConfig(`bad-${_label.replace(/\W/g, '')}`, json);
    expect(resolveKnockEnabled(p)).toEqual({ enabled: true, invalid: true });
  });

  it('BR022_AbsentOrUnreadableConfig_DefaultsToEnabledAndValid', () => {
    const absent = writeConfig('absent', '{"workerProtocol":{}}');
    expect(resolveKnockEnabled(absent)).toEqual({ enabled: true, invalid: false });
    expect(resolveKnockEnabled(path.join(tmpDir, 'nope.json'))).toEqual({ enabled: true, invalid: false });
  });

  it('BR022_KillSwitchOff_ShortCircuitsBeforeAnyDbRead', () => {
    const p = writeConfig('off2', '{"workerProtocol":{"knockEnabled":false}}');
    // dbPath 指向不存在的檔:若 kill switch 沒有先短路,開 DB 就會走進 fail-open 分支回 E09
    const d = decideKnock('irrelevant', { dbPath: path.join(tmpDir, 'never.db'), configPath: p, probeFn: passingProbe });
    expect(d).toMatchObject({ ok: false, reason: 'disabled', exit: 0, code: null });
  });

  it('BR022_NonBooleanValue_SurfacesConfigWarningInTheDecision', () => {
    const p = writeConfig('bad-warn', '{"workerProtocol":{"knockEnabled":"false"}}');
    const { runId, dbPath } = seedDb({ pending: 1 });
    const d = decideKnock(runId, { dbPath, configPath: p, probeFn: passingProbe });
    expect(d.ok).toBe(true);                       // 仍然開著(方向不變)
    expect(d.configWarning).toMatch(/knockEnabled/); // 但看得見(不再靜默)
  });
});

describe('decideKnock — lifecycle 白名單 (BR-017)', () => {
  it.each(KNOCKABLE_LIFECYCLES)('BR017_AllowListedLifecycle_ReachesReady (%s)', (lifecycle) => {
    const { runId, dbPath } = seedDb({ lifecycle, pending: 1 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d).toMatchObject({ ok: true, reason: 'ready', exit: 0, targetPid: LIVE_PID });
  });

  it.each(['running', 'dispatching', 'abandoned', 'done-exited'])(
    'BR017_LifecycleOutsideAllowList_Exit2WithNoText (%s)', (lifecycle) => {
      const { runId, dbPath } = seedDb({ lifecycle, pending: 1 });
      const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
      expect(d).toMatchObject({ exit: 2, code: 'WHP12-E07', ok: false, text: null });
      expect(d.reason).toContain(lifecycle);
    },
  );
});

describe('decideKnock — pending 選取 (BR-018 / BR-019 / BR-020)', () => {
  it('BR019_ZeroPending_BenignNoOpExit0', () => {
    const { runId, dbPath } = seedDb({ pending: 0 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d).toMatchObject({ ok: false, exit: 0, reason: 'no-pending', text: null, code: null });
  });

  it('BR018_AlreadyKnockedDirective_ExcludedByPeek', () => {
    // knocked_at 非 NULL 的兩筆是 D2 快環敲過的 —— 兩環共用同一個迴圈上界,故慢環不得再敲
    const { runId, dbPath } = seedDb({ pending: 0, knocked: 2 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d).toMatchObject({ ok: false, exit: 0, reason: 'no-pending' });
  });

  it('BR018_MixedKnockedAndPending_OnlyThePendingOnesAreNamed', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 2, knocked: 1 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d.msgIds).toEqual(msgIds.slice(0, 2));   // seq 1,2 = pending;seq 3 = 已敲過
  });

  it('BR020_TwoPending_SingleKnockNamingBothMsgIdsAndNeverTheBody', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 2 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d.ok).toBe(true);
    expect(d.msgIds).toEqual(msgIds);
    expect(d.text).toContain('x2');
    expect(d.text).toContain(`msg_id=${msgIds.join(',')}`);
    expect(d.text).toContain('read-worker-directives.js');
    expect(d.text).not.toContain('BODY-MUST-NOT-LEAK');
  });

  it('BR020_KnockTextIsVerbatimFromBuildKnockDecision', async () => {
    const { buildKnockDecision } = (await import('../scripts/worker-directive-poll.cjs')).default
      ?? await import('../scripts/worker-directive-poll.cjs');
    const { runId, dbPath, msgIds } = seedDb({ pending: 1 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    const expected = buildKnockDecision(msgIds.map((id) => ({ msg_id: id })), runId).reason;
    expect(d.text).toBe(expected);   // 一分歧,收件端就需要第二套協議
  });
});

describe('decideKnock — 判活與 fail 分野 (BR-015 / BR-016 / BR-023)', () => {
  it('BR016_UnregisteredPid_Exit2WithZeroText', () => {
    const { runId, dbPath } = seedDb({ pending: 1, wrapperPid: 0 });
    const d = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(d).toMatchObject({ exit: 2, code: 'WHP12-E06', reason: 'not-registered', text: null });
  });

  it('BR016_WindowGone_Exit2WithZeroText', () => {
    const { runId, dbPath } = seedDb({ pending: 1 });
    const d = decideKnock(runId, { dbPath, probeFn: () => new Map() });
    expect(d).toMatchObject({ exit: 2, code: 'WHP12-E06', reason: 'window-gone', text: null });
  });

  it('BR016_PidReused_Exit2WithZeroText', () => {
    const { runId, dbPath } = seedDb({ pending: 1 });
    const d = decideKnock(runId, { dbPath, probeFn: () => new Map([[LIVE_PID, 'powershell.exe -File other.ps1']]) });
    expect(d).toMatchObject({ exit: 2, code: 'WHP12-E06', reason: 'pid-reused', text: null });
  });

  it('BR023_DbUnreadable_FailsOpenWithExit0', () => {
    const d = decideKnock('00000000-0000-4000-8000-000000000000', {
      dbPath: path.join(tmpDir, 'no-such-dir', 'nope.db'), probeFn: passingProbe,
    });
    expect(d.exit).toBe(0);          // 不敲門本身無害
    expect(d.ok).toBe(false);
    expect(d.code).toBe('WHP12-E09');
  });

  it('BR023_ProbeUnavailable_FailsClosedWithExit2', () => {
    const { runId, dbPath } = seedDb({ pending: 1 });
    const d = decideKnock(runId, {
      dbPath,
      probeFn: () => { throw new Error('WMI unavailable'); },
    });
    expect(d).toMatchObject({ exit: 2, code: 'WHP12-E08', text: null });  // 對未驗證的 PID 注入 = 對陌生 console 打字
  });

  it('BR016_RunNotFound_Exit2', () => {
    const { dbPath } = seedDb({ pending: 1 });
    const d = decideKnock('11111111-1111-4111-8111-111111111111', { dbPath, probeFn: passingProbe });
    expect(d).toMatchObject({ exit: 2, code: 'WHP12-E06', reason: 'run-not-found' });
  });
});

describe('stampAfterKnock — 迴圈上界與時間戳精度 (BR-021)', () => {
  it('BR021_StampMarksEveryPeekedDirective_AndClosesTheLoopBound', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 2 });
    const before = decideKnock(runId, { dbPath, probeFn: passingProbe });
    expect(before.ok).toBe(true);

    const res = stampAfterKnock(runId, before.msgIds, { dbPath });
    expect(res).toMatchObject({ ok: true, changes: 2 });
    expect(readMessages(dbPath, runId).every((m) => m.knocked_at)).toBe(true);

    // 上界關上之後同一則不會被再敲一次
    expect(decideKnock(runId, { dbPath, probeFn: passingProbe }).reason).toBe('no-pending');
    expect(msgIds.length).toBe(2);
  });

  it('BR021_StampNeverTouchesState_OnlyKnockedAt', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 1 });
    stampAfterKnock(runId, msgIds, { dbPath });
    expect(readMessages(dbPath, runId)[0].state).toBe('pending');
  });

  it('BR021_StampIsIdempotent_SecondCallChangesNothing', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 1 });
    expect(stampAfterKnock(runId, msgIds, { dbPath }).changes).toBe(1);
    expect(stampAfterKnock(runId, msgIds, { dbPath }).changes).toBe(0);  // TOCTOU 守衛
  });

  // CR F3 回歸鎖:同一欄位由 D2(stop-report.ps1 的 Get-Date,秒精度)與慢環共寫,
  // 精度必須一致 —— whp-11 的 T-WHP11-D2-16 正是以秒精度 regex 釘住此欄。
  it('BR021_KnockedAtMatchesTheSecondPrecisionFormatD2Writes', () => {
    const { runId, dbPath, msgIds } = seedDb({ pending: 1 });
    stampAfterKnock(runId, msgIds, { dbPath });
    expect(readMessages(dbPath, runId)[0].knocked_at)
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  });

  it('SecondPrecision_StripsFractionOnlyAndKeepsTheOffset', () => {
    expect(secondPrecision('2026-08-02T13:25:41.542+08:00')).toBe('2026-08-02T13:25:41+08:00');
    expect(secondPrecision('2026-08-02T13:25:41+08:00')).toBe('2026-08-02T13:25:41+08:00');
  });
});
