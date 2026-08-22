// upsert-track-plan.test.js — tdb-1-track-plan-roadmap（code-review 補件）
//
// 由來:dev-story 階段 `upsert-track-plan.js`（track_plan 的唯一人工寫入路徑,171 行）
// 完全沒有任何測試覆蓋,testing_strategy 具名的 BR022 / BR023 兩個案例未落地,
// 而 Task 3.6 卻標 ✅ 宣稱「roadmapService/CLI 單元測試涵蓋 enum 前置攔截 + offset-aware timestamp」
// （實測全 repo grep 對 upsertTrackPlan / mergeTrackPlan / validateFields 零命中）。
// 本檔補齊該兩個具名案例,並為 CR 修復的 F2（story 存在性檢查）加回歸鎖。
//
// 走隔離 temp DB（never touches .context-db/phycool.db）—— 範式對齊 migrate-track-plan.test.js。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  upsertTrackPlan, mergeTrackPlan, validateFields,
  LANE_VALUES, PLAN_STATE_VALUES,
} from '../scripts/upsert-track-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-track-plan-table.sql'),
  'utf8',
);

function makeDb() {
  const dbPath = path.join(os.tmpdir(), `tdb1-upsert-tp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  const db = new Database(dbPath);
  db.exec('CREATE TABLE stories (story_id TEXT PRIMARY KEY, status TEXT NOT NULL);');
  db.exec(UP_SQL);
  db.prepare("INSERT INTO stories (story_id, status) VALUES ('s-real', 'ready-for-dev')").run();
  db.prepare("INSERT INTO stories (story_id, status) VALUES ('s-real-2', 'ready-for-dev')").run();
  db.close();
  return dbPath;
}

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

function readRow(dbPath, storyId) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM track_plan WHERE story_id = ?').get(storyId);
  db.close();
  return row;
}

function countRows(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const c = db.prepare('SELECT COUNT(*) c FROM track_plan').get().c;
  db.close();
  return c;
}

let dbPath;
let savedTrack;

beforeEach(() => {
  dbPath = makeDb();
  savedTrack = process.env.PHYCOOL_CONTROLLER_TRACK;
});

afterEach(() => {
  cleanup(dbPath);
  if (savedTrack === undefined) delete process.env.PHYCOOL_CONTROLLER_TRACK;
  else process.env.PHYCOOL_CONTROLLER_TRACK = savedTrack;
});

describe('BR-022: enum / 欄位白名單前置攔截（不倚賴 SQLite CHECK 錯誤訊息）', () => {
  it('BR022_UpsertTrackPlan_WithInvalidLane_RejectsBeforeWrite: 非法 lane 被攔下、錯誤訊息列出合法值、表內零列', () => {
    const result = upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'bogus' });

    expect(result.ok).toBe(false);
    // 錯誤訊息必須列出三個合法值(對人可讀,而非讓 SQLite CHECK 拋不可讀訊息)
    const joined = result.errors.join(' ');
    for (const v of LANE_VALUES) expect(joined).toContain(v);
    // 前置攔截 = 根本沒開 DB 寫入
    expect(countRows(dbPath)).toBe(0);
  });

  it('BR022_UpsertTrackPlan_WithInvalidPlanState_RejectsBeforeWrite: 非法 plan_state 同樣前置攔截並列合法值', () => {
    const result = upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', plan_state: 'in-flight' });

    expect(result.ok).toBe(false);
    const joined = result.errors.join(' ');
    for (const v of PLAN_STATE_VALUES) expect(joined).toContain(v);
    expect(countRows(dbPath)).toBe(0);
  });

  it('BR022_UpsertTrackPlan_WithUnknownField_Rejects: 白名單外欄位被擋（防止拼錯欄位靜默無效）', () => {
    const result = upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', updated_by: '我要蓋掉' });

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('updated_by');
    expect(countRows(dbPath)).toBe(0);
  });

  it('validateFields 對合法 payload 回空陣列（正向對照,證明上述紅燈非恆真）', () => {
    expect(validateFields({ story_id: 's-real', lane: 'manual' }, { requireLane: true })).toEqual([]);
  });
});

describe('BR-023: offset-aware timestamp + updated_by 來源', () => {
  it('BR023_UpsertTrackPlan_WritesOffsetAwareTimestamp: updated_at 以 +08:00 結尾（非 naive、非 Z）', () => {
    process.env.PHYCOOL_CONTROLLER_TRACK = 'cr-test-track';
    const result = upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', seq: 3 });
    expect(result.ok).toBe(true);

    const row = readRow(dbPath, 's-real');
    expect(row.updated_at).toMatch(/\+08:00$/);
    expect(row.updated_at).not.toMatch(/Z$/);
    expect(row.updated_by).toBe('cr-test-track');
  });

  it('未設 PHYCOOL_CONTROLLER_TRACK 時 updated_by 退回 unknown-controller（不寫空字串）', () => {
    delete process.env.PHYCOOL_CONTROLLER_TRACK;
    upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'dispatch' });
    expect(readRow(dbPath, 's-real').updated_by).toBe('unknown-controller');
  });

  it('mergeTrackPlan 也寫 offset-aware updated_at', () => {
    upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', seq: 1 });
    const r = mergeTrackPlan(dbPath, 's-real', { plan_state: 'paused', pause_reason: '等待人工確認' });
    expect(r.ok).toBe(true);
    expect(readRow(dbPath, 's-real').updated_at).toMatch(/\+08:00$/);
  });
});

describe('CR-F2: 參照完整性應用層檢查（track_plan 刻意不宣告 DDL FK）', () => {
  it('F2_UpsertTrackPlan_WithUnknownStoryId_Rejects: stories 表不存在的 story_id 不得建出孤兒列', () => {
    const result = upsertTrackPlan(dbPath, { story_id: 's-typo-does-not-exist', lane: 'manual', seq: 1 });

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('s-typo-does-not-exist');
    expect(countRows(dbPath)).toBe(0);
  });

  it('F2_OrphanRow_WouldBeInvisibleInRoadmap: 佐證孤兒列為何危險 —— roadmapService 兩支查詢皆 JOIN stories 會濾掉它', () => {
    // 直接以 raw SQL 造一列孤兒（繞過 CLI，模擬修復前的行為）
    const db = new Database(dbPath);
    db.prepare(`INSERT INTO track_plan (story_id, lane, seq, plan_state, updated_at, updated_by)
                VALUES ('s-orphan','manual',1,'queued','2026-07-28T00:00:00+08:00','raw')`).run();
    // track_plan 有 1 列，但 JOIN stories 後為 0 —— 中控以為排程了，/roadmap 與 kpi.total 皆看不到
    expect(db.prepare('SELECT COUNT(*) c FROM track_plan').get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) c FROM track_plan tp JOIN stories s ON s.story_id = tp.story_id`).get().c).toBe(0);
    db.close();
  });

  it('story 存在時正常寫入（證明上述阻擋非一律拒絕）', () => {
    expect(upsertTrackPlan(dbPath, { story_id: 's-real-2', lane: 'reconcile' }).ok).toBe(true);
    expect(countRows(dbPath)).toBe(1);
  });
});

describe('mergeTrackPlan 部分更新語意', () => {
  it('未提供的欄位沿用現值（只改 plan_state 不應清空 seq / lane）', () => {
    upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', seq: 7, unlock_note: '原註記' });
    mergeTrackPlan(dbPath, 's-real', { plan_state: 'unlocked' });

    const row = readRow(dbPath, 's-real');
    expect(row.plan_state).toBe('unlocked');
    expect(row.seq).toBe(7);
    expect(row.lane).toBe('manual');
    expect(row.unlock_note).toBe('原註記');
  });

  it('對不存在的列 merge 回明確錯誤（引導改用 --inline 建卡），不靜默 no-op', () => {
    const r = mergeTrackPlan(dbPath, 's-real', { plan_state: 'paused' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('--inline');
  });
});

describe('DB 隔離：只寫入指定 dbPath', () => {
  it('寫入 A 庫不觸碰 B 庫（--db 注入的函式層保證）', () => {
    const otherPath = makeDb();
    try {
      upsertTrackPlan(dbPath, { story_id: 's-real', lane: 'manual', seq: 1 });
      expect(countRows(dbPath)).toBe(1);
      expect(countRows(otherPath)).toBe(0);
    } finally {
      cleanup(otherPath);
    }
  });
});
