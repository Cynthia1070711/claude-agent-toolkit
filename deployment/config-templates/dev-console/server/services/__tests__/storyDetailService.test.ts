// ============================================================
// storyDetailService.test.ts — Story Detail Service 單元測試
// DVS-06 AC-8: 3 cases
// 測試：正常讀取、路徑遍歷防護、檔案不存在
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── DB + 暫存目錄初始化 ────────────────────────────────────────

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      story_id    TEXT PRIMARY KEY,
      epic_id     TEXT,
      title       TEXT,
      status      TEXT,
      priority    TEXT,
      complexity  TEXT,
      source_file TEXT,
      created_at  TEXT,
      updated_at  TEXT,
      domain      TEXT,
      story_type  TEXT,
      dependencies TEXT,
      tags        TEXT,
      file_list   TEXT,
      dev_agent   TEXT,
      review_agent TEXT,
      user_story  TEXT,
      background  TEXT,
      acceptance_criteria TEXT,
      tasks       TEXT,
      affected_files TEXT,
      cr_score    INTEGER,
      test_count  INTEGER,
      discovery_source TEXT
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
  config: {
    dbPath: '',
    port: 3001,
    allowedOrigin: 'http://localhost:5174',
    projectRoot: '',      // 動態設定於 beforeEach
  },
}));

import * as db from '../../db.js';
import { config } from '../../config.js';

// ── 測試 ─────────────────────────────────────────────────────

describe('storyDetailService — getStoryContent', () => {
  let tmpDir: string;
  let conn: Database.Database;
  let mdFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-story-svc-'));
    const dbPath = path.join(tmpDir, 'story.db');
    conn = initTestDb(dbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);

    // 設定 projectRoot 為暫存目錄（路徑防護用）
    (config as { projectRoot: string }).projectRoot = tmpDir;

    // 建立暫存 .md 檔案
    mdFile = path.join(tmpDir, 'test-story.md');
    fs.writeFileSync(mdFile, '# Test Story\n\nThis is the content.', 'utf-8');

    // 插入測試 Story
    conn.prepare(`
      INSERT INTO stories (story_id, epic_id, title, status, priority, complexity, source_file)
      VALUES ('dvs-test-1', 'epic-dvc', 'Test Story', 'ready-for-dev', 'P0', 'S', ?)
    `).run(mdFile);

    // 插入 Story 但 source_file 為 null
    conn.prepare(`
      INSERT INTO stories (story_id, epic_id, title, status)
      VALUES ('dvs-no-file', 'epic-dvc', 'No File Story', 'backlog')
    `).run();
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常讀取 — 回傳 content + story 後設資料', async () => {
    const { getStoryContent } = await import('../storyDetailService.js');
    const result = getStoryContent('dvs-test-1');
    expect(result.story).not.toBeNull();
    expect(result.story?.story_id).toBe('dvs-test-1');
    expect(result.content).toContain('Test Story');
    expect(result.error).toBeUndefined();
  });

  it('路徑遍歷防護 — source_file 在 PROJECT_ROOT 外回傳 PATH_TRAVERSAL_BLOCKED', async () => {
    const { getStoryContent } = await import('../storyDetailService.js');
    // 更新 story 指向 PROJECT_ROOT 外部路徑
    conn.prepare(`UPDATE stories SET source_file = ? WHERE story_id = ?`)
      .run('C:/Windows/System32/kernel32.dll', 'dvs-test-1');
    const result = getStoryContent('dvs-test-1');
    expect(result.error).toBe('PATH_TRAVERSAL_BLOCKED');
    expect(result.content).toBeNull();
  });

  it('檔案不存在 — 回傳 FILE_NOT_FOUND 且 content=null', async () => {
    const { getStoryContent } = await import('../storyDetailService.js');
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.md');
    conn.prepare(`UPDATE stories SET source_file = ? WHERE story_id = ?`)
      .run(nonExistentPath, 'dvs-test-1');
    const result = getStoryContent('dvs-test-1');
    expect(result.error).toBe('FILE_NOT_FOUND');
    expect(result.content).toBeNull();
    expect(result.story).not.toBeNull();  // story 仍有資料
  });
});
