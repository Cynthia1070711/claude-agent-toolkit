// whp-6-directive-delivery-and-close — Phase 1 (BR-001~BR-007) behavioural tests for read-worker-directives.js
// 走隔離 temp DB(createTestDb + migration SQL exec),絕不連 phycool.db。
// Runner: vitest(對齊 .context-db/package.json "test": "vitest run" + 同目錄 reap-worker-runs.test.js /
// worker-protocol-ops.test.js 既有慣例 —— create-story 階段 testing_strategy 表面上寫「node --test」,
// 但 .context-db/tests/**/*.test.js 100% 為 vitest,無任一檔用 node:test;為與既有可執行慣例一致採 vitest,
// 案例名 / BR 對映 / 斷言內容逐字遵照該表,僅測試框架語法適配實際專案慣例(dev_notes 已記錄此判斷）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from './helpers/test-db.js';
import { readDirectives, formatDirectiveBlock, consumeMessages, cliMain } from '../scripts/read-worker-directives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-27-add-worker-protocol-tables.sql'),
  'utf8'
);

let ctx;
const T = '2026-01-01T00:00:00.000+08:00';

beforeEach(() => {
  ctx = createTestDb();
  ctx.db.exec(MIGRATION_SQL);
});

afterEach(() => {
  ctx.cleanup();
});

function seedRun(runId, overrides = {}) {
  const row = {
    run_id: runId, session_id: 's1', story_id: 'st1', phase: 'dev-story',
    ipc_dir: 'C:\\ipc\\st1', run_mode: 'window', lifecycle: 'running',
    started_at: T, updated_at: T, ...overrides,
  };
  ctx.db.prepare(`
    INSERT INTO worker_runs (run_id, session_id, story_id, phase, ipc_dir, run_mode, lifecycle, started_at, updated_at)
    VALUES (@run_id, @session_id, @story_id, @phase, @ipc_dir, @run_mode, @lifecycle, @started_at, @updated_at)
  `).run(row);
  return row;
}

function seedMessage(overrides = {}) {
  const row = {
    run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake',
    body: 'test body', author: 'CC-TEST', state: 'pending', created_at: T,
    delivered_via: null, delivered_at: null, consumed_at: null,
    ...overrides,
  };
  const info = ctx.db.prepare(`
    INSERT INTO worker_messages (run_id, seq, direction, msg_type, body, author, state, delivered_via, created_at, delivered_at, consumed_at)
    VALUES (@run_id, @seq, @direction, @msg_type, @body, @author, @state, @delivered_via, @created_at, @delivered_at, @consumed_at)
  `).run(row);
  return { ...row, msg_id: Number(info.lastInsertRowid) };
}

describe('read-worker-directives.js — Phase 1', () => {
  it('BR001_MixedDirectionAndState_ReturnsOnlyPendingC2WInSeqOrder', () => {
    seedRun('R');
    seedMessage({ run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake', body: 'do X', state: 'pending' });
    seedMessage({ run_id: 'R', seq: 2, direction: 'controller-to-worker', msg_type: 'probe', body: 'already sent', state: 'delivered' });
    seedMessage({ run_id: 'R', seq: 3, direction: 'controller-to-worker', msg_type: 'answer', body: 'do Y', state: 'pending' });
    seedMessage({ run_id: 'R', seq: 4, direction: 'worker-to-controller', msg_type: 'progress', body: 'status update', state: 'pending' });

    const { rows } = readDirectives('R', { dbPath: ctx.dbPath });
    expect(rows.map(r => r.seq)).toEqual([1, 3]);

    const block = formatDirectiveBlock(rows);
    const lines = block.split('\n');
    expect(lines[0]).toBe('========== 中控指示(D1 開場注入 · 必讀後執行)==========');
    const seq1Idx = lines.findIndex(l => l.includes('seq=1'));
    const seq3Idx = lines.findIndex(l => l.includes('seq=3'));
    expect(seq1Idx).toBeGreaterThan(-1);
    expect(seq3Idx).toBeGreaterThan(seq1Idx);
    expect(block).not.toContain('seq=2');
    expect(block).not.toContain('seq=4');
    expect(lines.some(l => l.startsWith('[INFO]') || l.startsWith('[WARN]'))).toBe(false);
  });

  it('BR002_ReadWithoutNoMark_MarksExactlySelectedRowsDeliveredD1', () => {
    seedRun('R');
    seedMessage({ run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake', body: 'a', state: 'pending' });
    seedMessage({
      run_id: 'R', seq: 2, direction: 'controller-to-worker', msg_type: 'probe', body: 'b',
      state: 'delivered', delivered_via: 'manual', delivered_at: '2026-07-30T10:00:00+08:00',
    });
    seedMessage({ run_id: 'R', seq: 3, direction: 'controller-to-worker', msg_type: 'answer', body: 'c', state: 'pending' });
    seedMessage({ run_id: 'R', seq: 4, direction: 'worker-to-controller', msg_type: 'progress', body: 'd', state: 'pending' });

    readDirectives('R', { dbPath: ctx.dbPath });

    const after = ctx.db.prepare(
      `SELECT seq, state, delivered_via, delivered_at FROM worker_messages WHERE run_id='R' ORDER BY seq`
    ).all();
    expect(after[0].state).toBe('delivered');
    expect(after[0].delivered_via).toBe('D1');
    expect(after[0].delivered_at).toMatch(/\+08:00$/);
    expect(after[1]).toEqual({ seq: 2, state: 'delivered', delivered_via: 'manual', delivered_at: '2026-07-30T10:00:00+08:00' });
    expect(after[2].state).toBe('delivered');
    expect(after[2].delivered_via).toBe('D1');
    expect(after[3]).toEqual({ seq: 4, state: 'pending', delivered_via: null, delivered_at: null });
  });

  it('BR003_NoMarkFlag_PerformsZeroWrites', () => {
    seedRun('R');
    seedMessage({ run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake', body: 'a', state: 'pending' });
    seedMessage({ run_id: 'R', seq: 2, direction: 'controller-to-worker', msg_type: 'probe', body: 'b', state: 'pending' });

    const before = ctx.db.prepare(`SELECT COUNT(*) n FROM worker_messages WHERE state='delivered'`).get().n;
    readDirectives('R', { dbPath: ctx.dbPath, noMark: true });
    const after = ctx.db.prepare(`SELECT COUNT(*) n FROM worker_messages WHERE state='delivered'`).get().n;
    expect(after).toBe(before);
  });

  it('BR004_UnknownRunOrMissingDb_ExitsZeroWithEmptyStdout', () => {
    seedRun('R');

    // (a) run-id 指向不存在的 run
    let logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cliMain(['--run-id', 'nonexistent', '--db', ctx.dbPath])).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore(); errSpy.mockRestore();

    // (b) 該 run 零 pending controller-to-worker
    seedMessage({ run_id: 'R', seq: 1, direction: 'worker-to-controller', msg_type: 'progress', body: 'x', state: 'pending' });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cliMain(['--run-id', 'R', '--db', ctx.dbPath])).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore(); errSpy.mockRestore();

    // (c) 完全不帶 --run-id
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cliMain(['--db', ctx.dbPath])).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore(); errSpy.mockRestore();

    // (d) DB 檔案被改名(路徑不存在)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cliMain(['--run-id', 'R', '--db', ctx.dbPath + '.renamed-away'])).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore(); errSpy.mockRestore();
  });

  it('BR005_OneDirective_StdoutIsPureG16BlockNoLogPrefix', () => {
    seedRun('R');
    seedMessage({ run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake', body: 'do the thing', state: 'pending' });
    const { rows } = readDirectives('R', { dbPath: ctx.dbPath });
    const block = formatDirectiveBlock(rows);
    const lines = block.split('\n');
    expect(lines[0]).toBe('========== 中控指示(D1 開場注入 · 必讀後執行)==========');
    expect(lines.some(l => l.includes('[INFO]') || l.includes('[WARN]'))).toBe(false);
  });

  it('BR006_ConsumeTwice_SecondCallReportsSkippedAndKeepsTimestamp', () => {
    seedRun('R');
    const msg = seedMessage({ run_id: 'R', seq: 1, state: 'delivered', delivered_via: 'D1', delivered_at: T });

    const first = consumeMessages([msg.msg_id], { dbPath: ctx.dbPath });
    expect(first).toEqual({ applied: [msg.msg_id], skipped: [] });
    const afterFirst = ctx.db.prepare('SELECT state, consumed_at FROM worker_messages WHERE msg_id=?').get(msg.msg_id);
    expect(afterFirst.state).toBe('consumed');
    expect(afterFirst.consumed_at).toBeTruthy();

    const second = consumeMessages([msg.msg_id], { dbPath: ctx.dbPath });
    expect(second).toEqual({ applied: [], skipped: [msg.msg_id] });
    const afterSecond = ctx.db.prepare('SELECT state, consumed_at FROM worker_messages WHERE msg_id=?').get(msg.msg_id);
    expect(afterSecond.consumed_at).toBe(afterFirst.consumed_at);

    // CLI-level shape per AC4: consecutive `--consume <id>` stdout JSON
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const msg2 = seedMessage({ run_id: 'R', seq: 2, state: 'delivered', delivered_via: 'D1', delivered_at: T });
    expect(cliMain(['--consume', String(msg2.msg_id), '--db', ctx.dbPath])).toBe(0);
    expect(cliMain(['--consume', String(msg2.msg_id), '--db', ctx.dbPath])).toBe(0);
    expect(logSpy.mock.calls[0][0]).toBe(JSON.stringify({ applied: [msg2.msg_id], skipped: [] }));
    expect(logSpy.mock.calls[1][0]).toBe(JSON.stringify({ applied: [], skipped: [msg2.msg_id] }));
    logSpy.mockRestore();
  });

  it('BR007_WrittenTimestamps_AreOffsetAwareTaiwan', () => {
    seedRun('R');
    seedMessage({ run_id: 'R', seq: 1, direction: 'controller-to-worker', msg_type: 'wake', body: 'a', state: 'pending' });
    readDirectives('R', { dbPath: ctx.dbPath });
    const after = ctx.db.prepare(`SELECT delivered_at FROM worker_messages WHERE run_id='R' AND seq=1`).get();
    expect(after.delivered_at).toMatch(/\+08:00$/);

    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'read-worker-directives.js'), 'utf8');
    expect(src).not.toMatch(/datetime\('now'/);
    expect(src).not.toMatch(/\.toISOString\(\)/);
  });
});
