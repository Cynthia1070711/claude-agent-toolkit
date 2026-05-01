// ============================================================
// log-workflow.js 單元測試 (DVC-16 AC-5)
// 使用 Node.js 內建 test runner (node:test)
// 暫存 SQLite DB + init schema 確保 FTS5 Trigger 可用
// ============================================================
// 執行方式: node --test .context-db/scripts/log-workflow.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { logWorkflowToDb, logWorkflow, inferEpicId } from './log-workflow.js';

// ──────────────────────────────────────────────
// 暫存 DB 工廠
// ──────────────────────────────────────────────

function createTempDb() {
  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, `lw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 建立 context_entries + FTS5 虛擬表 + Trigger（與 init-db.js 相同）
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT,
      agent_id        TEXT NOT NULL,
      timestamp       TEXT NOT NULL,
      category        TEXT NOT NULL,
      tags            TEXT,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      related_files   TEXT,
      story_id        TEXT,
      epic_id         TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
      title, content, tags,
      content=context_entries,
      content_rowid=id,
      tokenize='trigram'
    );

    CREATE TRIGGER IF NOT EXISTS context_ai AFTER INSERT ON context_entries BEGIN
      INSERT INTO context_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  db.close();
  return dbPath;
}

function deleteTempDb(dbPath) {
  try {
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch { /* ignore */ }
}

function readEntries(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT * FROM context_entries ORDER BY id').all();
  } finally {
    db.close();
  }
}

// ──────────────────────────────────────────────
// TC-4: inferEpicId 推導邏輯（不需要 DB）
// ──────────────────────────────────────────────

test('TC-4: epic_id 從 story_id 前綴正確推導', () => {
  assert.equal(inferEpicId('qgr-a2'), 'epic-qgr');
  assert.equal(inferEpicId('qgr-ba-12'), 'epic-qgr');
  assert.equal(inferEpicId('dvc-16'), 'epic-dvc');
  assert.equal(inferEpicId('td-20'), 'epic-td');
  assert.equal(inferEpicId('trs-35'), 'epic-trs');
  assert.equal(inferEpicId('fra-1'), 'epic-qgr');
  assert.equal(inferEpicId('cmi-4'), 'epic-cmi');
  assert.equal(inferEpicId('mqv-1'), 'epic-mqv');
  assert.equal(inferEpicId('cat-1'), 'epic-cat');
  // 通用規則
  assert.equal(inferEpicId('xxx-99'), 'epic-xxx');
  // null/empty
  assert.equal(inferEpicId(null), 'epic-unknown');
  assert.equal(inferEpicId(''), 'epic-unknown');
});

// ──────────────────────────────────────────────
// TC-1: stage=create, status=success
// ──────────────────────────────────────────────

test('TC-1: 正確寫入 context_entries（stage=create, status=success）', () => {
  const dbPath = createTempDb();
  try {
    const result = logWorkflowToDb({
      storyId: 'qgr-a2',
      stage: 'create',
      status: 'success',
      error: null,
      agentId: 'pipeline',
    }, dbPath);

    assert.equal(result, true, 'logWorkflowToDb 應回傳 true');

    const entries = readEntries(dbPath);
    assert.equal(entries.length, 1, '應有 1 筆記錄');

    const entry = entries[0];
    assert.equal(entry.category, 'session', 'category 應為 session');
    assert.equal(entry.story_id, 'qgr-a2', 'story_id 應匹配');
    assert.equal(entry.epic_id, 'epic-qgr', 'epic_id 應匹配');
    assert.ok(entry.title.includes('create'), `title 應包含 stage: ${entry.title}`);
    assert.ok(entry.title.includes('success'), `title 應包含 status: ${entry.title}`);
    assert.ok(entry.content.includes('qgr-a2'), `content 應包含 story_id`);

    const tags = JSON.parse(entry.tags);
    assert.ok(Array.isArray(tags), 'tags 應為 JSON array');
    assert.ok(tags.includes('pipeline'), 'tags 應包含 pipeline');
    assert.ok(tags.includes('create'), 'tags 應包含 stage');
    assert.ok(tags.includes('success'), 'tags 應包含 status');
  } finally {
    deleteTempDb(dbPath);
  }
});

// ──────────────────────────────────────────────
// TC-2: stage=dev, status=failure, error msg
// ──────────────────────────────────────────────

test('TC-2: 正確寫入 context_entries（stage=dev, status=failure, error msg）', () => {
  const dbPath = createTempDb();
  try {
    const result = logWorkflowToDb({
      storyId: 'dvc-16',
      stage: 'dev',
      status: 'failure',
      error: 'Build 失敗: CS0001 型別找不到',
      agentId: 'CC-SONNET',
    }, dbPath);

    assert.equal(result, true);

    const entries = readEntries(dbPath);
    assert.equal(entries.length, 1);

    const entry = entries[0];
    assert.equal(entry.story_id, 'dvc-16');
    assert.equal(entry.epic_id, 'epic-dvc');
    assert.ok(entry.title.includes('failure'), `title 應包含 failure: ${entry.title}`);
    assert.ok(entry.content.includes('Build 失敗'), `content 應包含 error msg`);
    assert.equal(entry.agent_id, 'CC-SONNET', 'agent_id 應為 CC-SONNET');
  } finally {
    deleteTempDb(dbPath);
  }
});

// ──────────────────────────────────────────────
// TC-3: stage=review, status=skipped
// ──────────────────────────────────────────────

test('TC-3: 正確寫入 context_entries（stage=review, status=skipped）', () => {
  const dbPath = createTempDb();
  try {
    const result = logWorkflowToDb({
      storyId: 'td-20',
      stage: 'review',
      status: 'skipped',
      error: null,
      agentId: 'pipeline',
    }, dbPath);

    assert.equal(result, true);

    const entries = readEntries(dbPath);
    assert.equal(entries.length, 1);

    const entry = entries[0];
    assert.equal(entry.story_id, 'td-20');
    assert.equal(entry.epic_id, 'epic-td');
    assert.ok(entry.title.includes('skipped'), `title 應包含 skipped: ${entry.title}`);
    assert.ok(entry.tags.includes('skipped'), 'tags 應包含 skipped');
  } finally {
    deleteTempDb(dbPath);
  }
});

// ──────────────────────────────────────────────
// TC-5: 時間戳為 UTC+8 格式
// ──────────────────────────────────────────────

test('TC-5: 時間戳為 UTC+8 格式', () => {
  const dbPath = createTempDb();
  try {
    logWorkflowToDb({
      storyId: 'dvc-16',
      stage: 'dev',
      status: 'success',
      error: null,
      agentId: 'pipeline',
    }, dbPath);

    const entries = readEntries(dbPath);
    assert.equal(entries.length, 1);

    const ts = entries[0].timestamp;
    // 格式: 2026-03-07T19:40:00.000+08:00
    assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/, `時間戳格式不符: ${ts}`);
  } finally {
    deleteTempDb(dbPath);
  }
});

// ──────────────────────────────────────────────
// TC-6: DB 不存在時靜默退出（回傳 false）
// ──────────────────────────────────────────────

test('TC-6: DB 不存在時靜默退出（回傳 false）', () => {
  const nonExistPath = path.join(os.tmpdir(), `non-exist-db-${Date.now()}.db`);

  let result;
  assert.doesNotThrow(() => {
    result = logWorkflowToDb({
      storyId: 'dvc-16',
      stage: 'dev',
      status: 'success',
      error: null,
      agentId: 'pipeline',
    }, nonExistPath);
  }, 'DB 不存在時不應拋出例外');

  assert.equal(result, false, 'DB 不存在時應回傳 false');
});

// ──────────────────────────────────────────────
// TC-7: 無效參數時靜默退出（回傳 false）
// ──────────────────────────────────────────────

test('TC-7: 無效參數時靜默退出（回傳 false）', () => {
  // 缺少 storyId
  let result = logWorkflow({ storyId: null, stage: 'dev', status: 'success', error: null, agentId: 'pipeline' });
  assert.equal(result, false, '缺少 storyId 應回傳 false');

  // 缺少 stage
  result = logWorkflow({ storyId: 'dvc-16', stage: null, status: 'success', error: null, agentId: 'pipeline' });
  assert.equal(result, false, '缺少 stage 應回傳 false');

  // 缺少 status
  result = logWorkflow({ storyId: 'dvc-16', stage: 'dev', status: null, error: null, agentId: 'pipeline' });
  assert.equal(result, false, '缺少 status 應回傳 false');

  // 無效 stage 值
  result = logWorkflow({ storyId: 'dvc-16', stage: 'invalid-stage', status: 'success', error: null, agentId: 'pipeline' });
  assert.equal(result, false, '無效 stage 值應回傳 false');

  // 無效 status 值
  result = logWorkflow({ storyId: 'dvc-16', stage: 'dev', status: 'invalid-status', error: null, agentId: 'pipeline' });
  assert.equal(result, false, '無效 status 值應回傳 false');
});
