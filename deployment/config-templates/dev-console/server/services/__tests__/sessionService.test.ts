// ============================================================
// sessionService.test.ts — Session Service 單元測試
// DVS-06 AC-8: 6 cases
// 測試：合併查詢、日期篩選、Agent 篩選、標籤篩選、分頁、空結果
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── DB 初始化 ─────────────────────────────────────────────────

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('busy_timeout = 5000');

  conn.exec(`
    CREATE TABLE IF NOT EXISTS context_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT,
      agent_id      TEXT NOT NULL,
      timestamp     TEXT NOT NULL,
      category      TEXT NOT NULL,
      tags          TEXT,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL,
      related_files TEXT,
      story_id      TEXT,
      epic_id       TEXT
    );

    CREATE TABLE IF NOT EXISTS conversation_sessions (
      session_id    TEXT PRIMARY KEY,
      project_path  TEXT,
      started_at    TEXT,
      ended_at      TEXT,
      end_reason    TEXT,
      agent_id      TEXT,
      git_branch    TEXT,
      first_prompt  TEXT,
      summary       TEXT,
      topics        TEXT,
      total_turns   INTEGER,
      user_turns    INTEGER,
      files_modified TEXT,
      stories_touched TEXT,
      transcript_path TEXT
    );
  `);

  return conn;
}

// ── Mock 設定 ─────────────────────────────────────────────────

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

vi.mock('../../config.js', () => ({
  config: { dbPath: '', port: 3001, allowedOrigin: 'http://localhost:5174', projectRoot: '' },
}));

import * as db from '../../db.js';

// ── 測試 ─────────────────────────────────────────────────────

describe('sessionService — getSessionTimeline', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-session-svc-'));
    tmpDbPath = path.join(tmpDir, 'session.db');
    conn = initTestDb(tmpDbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);

    // 插入 context_entries (category='session')
    conn.prepare(`
      INSERT INTO context_entries (agent_id, timestamp, category, tags, title, content, related_files)
      VALUES (?, ?, 'session', ?, ?, ?, ?)
    `).run('CC-OPUS', '2026-03-08T10:00:00Z', '["session","backend"]', 'Session A', '內容 A', '["file1.ts"]');

    conn.prepare(`
      INSERT INTO context_entries (agent_id, timestamp, category, tags, title, content)
      VALUES (?, ?, 'session', ?, ?, ?)
    `).run('CC-SONNET', '2026-03-07T09:00:00Z', '["session"]', 'Session B', '內容 B');

    // 插入 conversation_sessions
    conn.prepare(`
      INSERT INTO conversation_sessions (session_id, started_at, agent_id, first_prompt, summary, topics)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('conv-001', '2026-03-06T08:00:00Z', 'CC-HAIKU', 'First prompt', 'Summary of session', '["debug"]');
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('合併查詢 — 回傳 context + conversation 記錄', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({});
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    const sources = result.items.map(i => i.source);
    expect(sources).toContain('context');
    expect(sources).toContain('conversation');
  });

  it('日期篩選 — startDate/endDate 限制查詢範圍', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({
      startDate: '2026-03-08',
      endDate: '2026-03-08',
    });
    expect(result.items.every(i => i.timestamp >= '2026-03-08')).toBe(true);
  });

  it('Agent 篩選 — 只回傳指定 Agent 的記錄', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({ agent: 'CC-OPUS' });
    const contextItems = result.items.filter(i => i.source === 'context');
    expect(contextItems.every(i => i.agent === 'CC-OPUS')).toBe(true);
  });

  it('標籤篩選 — 包含指定標籤', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({ tags: 'backend' });
    expect(result.items.some(i => i.tags?.includes('backend'))).toBe(true);
  });

  it('分頁 — 回傳正確 page/pageSize/total', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({ page: 1, pageSize: 2 });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.items.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('空結果 — 不存在 Agent 回傳空列表', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({ agent: 'NON-EXISTENT-AGENT-XYZ' });
    const contextItems = result.items.filter(i => i.source === 'context');
    expect(contextItems).toHaveLength(0);
  });
});

describe('sessionService — related_files 欄位（DVC-09-M5）', () => {
  let tmpDir: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-session-rf-'));
    const dbPath = path.join(tmpDir, 'rf.db');
    conn = initTestDb(dbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);

    conn.prepare(`
      INSERT INTO context_entries (agent_id, timestamp, category, title, content, related_files)
      VALUES ('CC-OPUS', '2026-03-08T10:00:00Z', 'session', 'RF Test', '內容', '["a.ts","b.ts"]')
    `).run();
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('related_files 欄位應包含在回應中（DVC-09-M5 修復驗證）', async () => {
    const { getSessionTimeline } = await import('../sessionService.js');
    const result = getSessionTimeline({});
    const item = result.items.find(i => i.source === 'context');
    expect(item).toBeDefined();
    expect(item?.related_files).toBeTruthy();
    expect(item?.related_files).toContain('a.ts');
  });
});
