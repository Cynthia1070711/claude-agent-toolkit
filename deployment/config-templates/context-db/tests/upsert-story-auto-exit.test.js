// upsert-story-auto-exit.test.js — tdb-1-track-plan-roadmap
// track_plan auto-exit（掛在 _doUpsert，經 mergeStory 驗證）四情境含降級。
// 走隔離 temp DB(never touches .context-db/phycool.db)。每次呼叫 mergeStory 後 DB 連線會被
// _doUpsert 內部關閉（既有行為，見 upsert-story.js:_doUpsert 尾端 db.close()），故每個動作前
// 皆重新 new Database(dbPath) 取得新連線（不可跨呼叫複用同一 handle）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeStory, getTaiwanTimestamp } from '../scripts/upsert-story.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACK_PLAN_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-track-plan-table.sql'),
  'utf8',
);

const STORIES_SCHEMA = `
  CREATE TABLE stories (
    story_id TEXT PRIMARY KEY, epic_id TEXT, domain TEXT, title TEXT, status TEXT,
    priority TEXT, complexity TEXT, story_type TEXT, dependencies TEXT, tags TEXT,
    file_list TEXT, dev_agent TEXT, review_agent TEXT, source_file TEXT, created_at TEXT,
    user_story TEXT, background TEXT, acceptance_criteria TEXT, tasks TEXT, affected_files TEXT,
    cr_score INTEGER, test_count INTEGER, discovery_source TEXT, updated_at TEXT,
    dev_notes TEXT, required_skills TEXT, implementation_approach TEXT, risk_assessment TEXT,
    testing_strategy TEXT, rollback_plan TEXT, monitoring_plan TEXT, definition_of_done TEXT,
    cr_issues_total INTEGER, cr_issues_fixed INTEGER, cr_issues_deferred INTEGER, cr_summary TEXT,
    started_at TEXT, completed_at TEXT, review_completed_at TEXT, execution_log TEXT,
    sdd_spec TEXT, create_agent TEXT, create_started_at TEXT, create_completed_at TEXT,
    pipeline_notes TEXT, review_started_at TEXT, task_track TEXT
  );
`;

function makeDb({ withTrackPlan = true } = {}) {
  const dbPath = path.join(os.tmpdir(), `tdb1-autoexit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  const db = new Database(dbPath);
  db.exec(STORIES_SCHEMA);
  if (withTrackPlan) db.exec(TRACK_PLAN_SQL);
  db.close();
  return dbPath;
}

function insertStory(dbPath, storyId, status) {
  const db = new Database(dbPath);
  db.prepare('INSERT INTO stories (story_id, title, status, updated_at) VALUES (?,?,?,?)')
    .run(storyId, `Test ${storyId}`, status, getTaiwanTimestamp());
  db.close();
}

function insertTrackPlanRow(dbPath, storyId, lane, seq) {
  const db = new Database(dbPath);
  db.prepare(
    "INSERT INTO track_plan (story_id, lane, seq, plan_state, updated_at, updated_by) VALUES (?, ?, ?, 'queued', ?, 'seed')",
  ).run(storyId, lane, seq, getTaiwanTimestamp());
  db.close();
}

function readTrackPlan(dbPath, storyId) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM track_plan WHERE story_id = ?').get(storyId);
  db.close();
  return row;
}

function readStory(dbPath, storyId) {
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT status FROM stories WHERE story_id = ?').get(storyId);
  db.close();
  return row;
}

function countTrackPlan(dbPath, storyId) {
  const db = new Database(dbPath, { readonly: true });
  const c = db.prepare('SELECT COUNT(*) c FROM track_plan WHERE story_id = ?').get(storyId).c;
  db.close();
  return c;
}

let dbPath;

afterEach(() => {
  if (!dbPath) return;
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
  dbPath = undefined;
});

describe('BR-015/BR-017: status=done 觸發 auto-exit（冪等）', () => {
  beforeEach(() => {
    dbPath = makeDb();
    insertStory(dbPath, 't1', 'review');
    insertTrackPlanRow(dbPath, 't1', 'manual', 1);
  });

  it('BR015_UpsertStoryToDone_SetsPlanStateDoneExited', async () => {
    const db = new Database(dbPath);
    await mergeStory('t1', { status: 'done' }, db);

    const row = readTrackPlan(dbPath, 't1');
    expect(row.plan_state).toBe('done-exited');
    expect(row.seq).toBeNull();
  });

  it('BR017_UpsertStoryToDoneTwice_UpdatedAtUnchanged', async () => {
    let db = new Database(dbPath);
    await mergeStory('t1', { status: 'done' }, db);
    const first = readTrackPlan(dbPath, 't1').updated_at;

    db = new Database(dbPath);
    await mergeStory('t1', { status: 'done' }, db);
    const second = readTrackPlan(dbPath, 't1').updated_at;

    expect(second).toBe(first);
  });
});

describe('BR-016: 未排程卡不憑空 INSERT', () => {
  it('BR016_UpsertStoryToDone_WhenNoTrackPlanRow_NoInsert', async () => {
    dbPath = makeDb();
    insertStory(dbPath, 't2-no-plan', 'review');
    const db = new Database(dbPath);
    await mergeStory('t2-no-plan', { status: 'done' }, db);

    expect(countTrackPlan(dbPath, 't2-no-plan')).toBe(0);
    expect(readStory(dbPath, 't2-no-plan').status).toBe('done');
  });
});

describe('BR-018: auto-promotion 與 auto-exit 並存', () => {
  it('BR018_ReviewCompletedAtTriggersPromotion_ThenAutoExit: 不帶 status，review_completed_at 觸發 promotion→done，auto-exit 看到最終 status', async () => {
    dbPath = makeDb();
    insertStory(dbPath, 't3', 'review');
    insertTrackPlanRow(dbPath, 't3', 'manual', 2);

    const db = new Database(dbPath);
    await mergeStory('t3', {
      review_completed_at: '2026-07-28T10:00:00+08:00',
      review_agent: 'CC-OPUS',
    }, db);

    expect(readStory(dbPath, 't3').status).toBe('done');
    expect(readTrackPlan(dbPath, 't3').plan_state).toBe('done-exited');
  });
});

describe('BR-019: track_plan 表不存在時降級', () => {
  it('BR019_UpsertStory_WhenTrackPlanTableMissing_StillWritesStory: exit 正常、Story 仍寫入、不拋例外', async () => {
    dbPath = makeDb({ withTrackPlan: false });
    insertStory(dbPath, 't4', 'review');

    const db = new Database(dbPath);
    let threw = false;
    try {
      await mergeStory('t4', { status: 'done' }, db);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(readStory(dbPath, 't4').status).toBe('done');
  });
});

describe('回歸：不相關欄位更新不觸碰已 done-exited 的 track_plan 列', () => {
  it('non-terminal 欄位 merge 後 track_plan 列仍存在且維持 done-exited（track_plan 無 FK CASCADE 保護驗證）', async () => {
    dbPath = makeDb();
    insertStory(dbPath, 't5', 'review');
    insertTrackPlanRow(dbPath, 't5', 'manual', 3);

    let db = new Database(dbPath);
    await mergeStory('t5', { status: 'done' }, db);
    expect(readTrackPlan(dbPath, 't5').plan_state).toBe('done-exited');

    db = new Database(dbPath);
    await mergeStory('t5', { dev_notes: 'unrelated update' }, db);
    const row = readTrackPlan(dbPath, 't5');
    expect(row).toBeDefined();
    expect(row.plan_state).toBe('done-exited');
  });
});
