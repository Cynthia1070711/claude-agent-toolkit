// whp-3-db-schema-registry — AC4: upsert-worker-run.js merge 只動呼叫端給的欄位 + 輸入防護
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// dbPath 透過函式參數注入(非 process.env 計時陷阱),見 upsert-worker-run.js openDb(dbPath)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import {
  fullUpsert, mergeRun, cliMain, WhpCliError, KNOWN_COLUMNS, LIFECYCLES, CLOSE_SOURCES,
} from '../scripts/upsert-worker-run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);

let ctx;

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  ctx.cleanup();
});

function seedBase(overrides = {}) {
  return fullUpsert(
    { run_id: 'r-ac4', session_id: 's1', story_id: 'st1', phase: 'dev-story', ipc_dir: 'd1', ...overrides },
    { dbPath: ctx.dbPath, quiet: true }
  );
}

describe('constants exported for downstream reuse (T2.2)', () => {
  it('KNOWN_COLUMNS has exactly 39 entries', () => {
    expect(KNOWN_COLUMNS.size).toBe(39);
  });
  it('LIFECYCLES has exactly the 9 SSoT §19 values', () => {
    expect(LIFECYCLES.size).toBe(9);
    for (const v of ['dispatching', 'running', 'reported', 'awaiting-review', 'revising', 'approved', 'closed', 'failed', 'abandoned']) {
      expect(LIFECYCLES.has(v)).toBe(true);
    }
  });
  it('CLOSE_SOURCES has exactly the 8 SSoT §19 values', () => {
    expect(CLOSE_SOURCES.size).toBe(8);
    for (const v of ['ControllerAfterHandshake', 'ControllerForce', 'UserClosed', 'ExternalKill', 'PowerFailure', 'DispatchFailed', 'StartupFailed', 'Unknown']) {
      expect(CLOSE_SOURCES.has(v)).toBe(true);
    }
  });
});

describe('AC4 core: merge only touches caller-supplied columns (BR-009)', () => {
  it('two sequential disjoint merges both survive — neither clobbers the other', () => {
    seedBase();
    mergeRun('r-ac4', { health_flag: 'stalled-suspect' }, { dbPath: ctx.dbPath, quiet: true });
    mergeRun('r-ac4', { turn_count: 5 }, { dbPath: ctx.dbPath, quiet: true });

    const row = ctx.db.prepare('SELECT health_flag, turn_count FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.health_flag).toBe('stalled-suspect');
    expect(row.turn_count).toBe(5);
  });

  it('the merge path contains no full-row-replace SQL (only column-scoped UPDATE)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'upsert-worker-run.js'), 'utf8');
    expect(source).not.toMatch(/INSERT OR REPLACE/);
    // mergeRun's write statement must be a plain UPDATE keyed on run_id
    const mergeRunBody = source.slice(source.indexOf('export function mergeRun'), source.indexOf('// ---------- CLI'));
    expect(mergeRunBody).toMatch(/UPDATE worker_runs SET/);
    expect(mergeRunBody).not.toMatch(/INSERT/);
  });
});

describe('AC4 input guards', () => {
  it('full upsert missing session_id/phase/ipc_dir -> WHP3-E01 naming exactly those fields', () => {
    expect(() => fullUpsert({ run_id: 'x', story_id: 'y' }, { dbPath: ctx.dbPath, quiet: true }))
      .toThrowError(expect.objectContaining({ code: 'WHP3-E01' }));
    try {
      fullUpsert({ run_id: 'x', story_id: 'y' }, { dbPath: ctx.dbPath, quiet: true });
    } catch (err) {
      expect(err.message).toContain('session_id');
      expect(err.message).toContain('phase');
      expect(err.message).toContain('ipc_dir');
    }
    expect(ctx.db.prepare('SELECT count(*) c FROM worker_runs').get().c).toBe(0);
  });

  it('illegal lifecycle -> WHP3-E02 listing all 9 legal values, 0 rows written', () => {
    expect(() => seedBase({ lifecycle: 'zombie' }))
      .toThrowError(expect.objectContaining({ code: 'WHP3-E02' }));
    try {
      seedBase({ lifecycle: 'zombie' });
    } catch (err) {
      for (const v of LIFECYCLES) expect(err.message).toContain(v);
    }
    expect(ctx.db.prepare('SELECT count(*) c FROM worker_runs').get().c).toBe(0);
  });

  it('illegal close_source -> WHP3-E03 listing all 8 legal values, 0 rows written', () => {
    expect(() => seedBase({ close_source: 'Whatever' }))
      .toThrowError(expect.objectContaining({ code: 'WHP3-E03' }));
    try {
      seedBase({ close_source: 'Whatever' });
    } catch (err) {
      for (const v of CLOSE_SOURCES) expect(err.message).toContain(v);
    }
    expect(ctx.db.prepare('SELECT count(*) c FROM worker_runs').get().c).toBe(0);
  });

  it('merge with only an unknown key -> WHP3-E04, existing row left untouched', () => {
    seedBase();
    mergeRun('r-ac4', { health_flag: 'stalled-suspect' }, { dbPath: ctx.dbPath, quiet: true });

    expect(() => mergeRun('r-ac4', { lifecycle_preview: 'x' }, { dbPath: ctx.dbPath, quiet: true }))
      .toThrowError(expect.objectContaining({ code: 'WHP3-E04' }));

    const row = ctx.db.prepare('SELECT health_flag FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.health_flag).toBe('stalled-suspect'); // 未被覆蓋 / 未被清空
  });

  it('merge on a non-existent run_id -> WHP3-E05', () => {
    expect(() => mergeRun('does-not-exist', { health_flag: 'x' }, { dbPath: ctx.dbPath, quiet: true }))
      .toThrowError(expect.objectContaining({ code: 'WHP3-E05' }));
  });

  it('unknown columns on full upsert are dropped, not fatal, when required fields present', () => {
    fullUpsert({ run_id: 'r-x', session_id: 's', story_id: 'st', phase: 'dev-story', ipc_dir: 'd', bogus_field: 'nope' }, { dbPath: ctx.dbPath, quiet: true });
    const row = ctx.db.prepare('SELECT run_id FROM worker_runs WHERE run_id = ?').get('r-x');
    expect(row.run_id).toBe('r-x');
  });
});

describe('timestamps (BR-008)', () => {
  it('started_at / updated_at are offset-aware +08:00 when not supplied', () => {
    seedBase();
    const row = ctx.db.prepare('SELECT started_at, updated_at FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.started_at).toMatch(/\+08:00$/);
    expect(row.updated_at).toMatch(/\+08:00$/);
  });

  it('merge always refreshes updated_at to a fresh +08:00 timestamp', () => {
    seedBase();
    const before = ctx.db.prepare('SELECT updated_at FROM worker_runs WHERE run_id = ?').get('r-ac4').updated_at;
    mergeRun('r-ac4', { health_flag: 'stalled-suspect' }, { dbPath: ctx.dbPath, quiet: true });
    const after = ctx.db.prepare('SELECT updated_at, health_flag FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(after.updated_at).toMatch(/\+08:00$/);
    expect(after.health_flag).toBe('stalled-suspect');
  });

  // CR R1 F6 regression — setCols 若未排除 updated_at,SQL 會長出重複的
  // `SET updated_at = @updated_at, updated_at = @updated_at`(SQLite 容忍且呼叫端值勝出,
  // 其他 SQL 引擎直接報 multiple assignments),並靜默推翻上一條測試的「一律刷新」不變量。
  it('a caller-supplied updated_at is ignored — merge still stamps a fresh +08:00 value', () => {
    seedBase();
    mergeRun('r-ac4', { health_flag: 'x', updated_at: '1999-01-01T00:00:00+08:00' }, { dbPath: ctx.dbPath, quiet: true });
    const row = ctx.db.prepare('SELECT health_flag, updated_at FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.health_flag).toBe('x');
    expect(row.updated_at).not.toBe('1999-01-01T00:00:00+08:00');
    expect(row.updated_at).toMatch(/\+08:00$/);
  });

  it("no datetime('now') or bare toISOString() literal anywhere in the file", () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'upsert-worker-run.js'), 'utf8');
    expect(source).not.toMatch(/datetime\(['"]now['"]\)/);
    expect(source).not.toMatch(/\.toISOString\(\)/);
  });
});

describe('--force-replace escape hatch', () => {
  it('full row overwrite resets columns not present in the new payload', () => {
    seedBase();
    mergeRun('r-ac4', { health_flag: 'stalled-suspect', turn_count: 5 }, { dbPath: ctx.dbPath, quiet: true });

    fullUpsert(
      { run_id: 'r-ac4', session_id: 's1', story_id: 'st1', phase: 'dev-story', ipc_dir: 'd1' },
      { dbPath: ctx.dbPath, quiet: true, forceReplace: true }
    );

    const row = ctx.db.prepare('SELECT health_flag, turn_count FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.health_flag).toBeNull();
    expect(row.turn_count).toBe(0);
  });

  it('without --force-replace, re-upserting an existing run_id auto-switches to merge (no data loss)', () => {
    seedBase();
    mergeRun('r-ac4', { health_flag: 'stalled-suspect' }, { dbPath: ctx.dbPath, quiet: true });

    fullUpsert({ run_id: 'r-ac4', session_id: 's1', story_id: 'st1', phase: 'dev-story', ipc_dir: 'd1', turn_count: 9 }, { dbPath: ctx.dbPath, quiet: true });

    const row = ctx.db.prepare('SELECT health_flag, turn_count FROM worker_runs WHERE run_id = ?').get('r-ac4');
    expect(row.health_flag).toBe('stalled-suspect'); // auto-merge 防護:未被清空
    expect(row.turn_count).toBe(9);
  });
});

describe('CR R1 F1 regression: the module is import-safe as a library', () => {
  // 🔴 只有 child process 測得到。vitest 永遠不是 node 的執行入口,舊的
  // `!process.env.VITEST` 判準在測試程序內恆為 false —— 缺陷對測試隱形。
  // 實測 `node -e "import('./scripts/upsert-worker-run.js')"` 會印 usage 並 exit 1,
  // 把 importing process 直接殺掉;而檔頭第 33 行明示 KNOWN_COLUMNS 供 whp-4/whp-5 複用。
  it('importing from a plain Node process exports the API without executing the CLI', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', "import('./scripts/upsert-worker-run.js').then(m => console.log('IMPORTED:' + m.KNOWN_COLUMNS.size))"],
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
    );
    expect(out).toContain('IMPORTED:39');
    expect(out).not.toMatch(/Usage:/); // CLI usage 不得因 import 而被印出
  });
});

describe('AC6: CLI usage / --help behaviour (no ENOENT trap)', () => {
  it('--help prints usage and returns exit code 0', () => {
    const logs = [];
    const spy = (...args) => logs.push(args.join(' '));
    const orig = console.log;
    console.log = spy;
    let code;
    try {
      code = cliMain(['--help']);
    } finally {
      console.log = orig;
    }
    expect(code).toBe(0);
    expect(logs.join('\n')).toMatch(/Usage:/);
  });

  it('zero args prints usage and returns exit code 1', () => {
    const orig = console.log;
    console.log = () => {};
    let code;
    try {
      code = cliMain([]);
    } finally {
      console.log = orig;
    }
    expect(code).toBe(1);
  });
});

// 2026-07-29 redispatch fix — attempt 未顯式指定時自算 MAX(attempt)+1。
// 背景:dispatch-general 原硬編 -Attempt 1,同 (story, phase) 二次派發(斷電/失敗後重派)
// 於 Register 撞 ux_worker_runs_key UNIQUE 直接 abort(BC-03 錯誤路徑)。
describe('attempt auto-increment when not supplied (redispatch fix)', () => {
  it('first insert without attempt -> 1; second same (story, phase) -> 2, no unique collision', () => {
    fullUpsert({ run_id: 'r-at1', session_id: 's1', story_id: 'stA', phase: 'dev-story', ipc_dir: 'd1' }, { dbPath: ctx.dbPath, quiet: true });
    fullUpsert({ run_id: 'r-at2', session_id: 's2', story_id: 'stA', phase: 'dev-story', ipc_dir: 'd2' }, { dbPath: ctx.dbPath, quiet: true });
    const rows = ctx.db.prepare("SELECT attempt FROM worker_runs WHERE story_id = 'stA' AND phase = 'dev-story' ORDER BY attempt").all();
    expect(rows.map(r => r.attempt)).toEqual([1, 2]);
  });

  it('explicit attempt still wins (rescue / test path)', () => {
    fullUpsert({ run_id: 'r-at3', session_id: 's3', story_id: 'stB', phase: 'dev-story', ipc_dir: 'd3', attempt: 7 }, { dbPath: ctx.dbPath, quiet: true });
    const row = ctx.db.prepare("SELECT attempt FROM worker_runs WHERE run_id = 'r-at3'").get();
    expect(row.attempt).toBe(7);
  });

  it('different phase of the same story counts independently from 1', () => {
    fullUpsert({ run_id: 'r-at4', session_id: 's4', story_id: 'stA', phase: 'dev-story', ipc_dir: 'd4' }, { dbPath: ctx.dbPath, quiet: true });
    fullUpsert({ run_id: 'r-at5', session_id: 's5', story_id: 'stA', phase: 'code-review', ipc_dir: 'd5' }, { dbPath: ctx.dbPath, quiet: true });
    const cr = ctx.db.prepare("SELECT attempt FROM worker_runs WHERE run_id = 'r-at5'").get();
    expect(cr.attempt).toBe(1);
  });
});
