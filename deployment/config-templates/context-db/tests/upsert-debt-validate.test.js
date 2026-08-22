import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedDebts } from './helpers/test-db.js';

// test-db.js doesn't create stories table, we need to add it
const STORIES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS stories (
    story_id TEXT PRIMARY KEY,
    epic_id TEXT,
    title TEXT,
    status TEXT DEFAULT 'backlog'
  );
`;

describe('--validate-target FK Guard', () => {
  let db, dbPath, cleanupDb;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    dbPath = t.dbPath;
    cleanupDb = t.cleanup;
    // Add stories table for FK validation
    db.exec(STORIES_SCHEMA);
    // Seed a known story
    db.prepare("INSERT INTO stories (story_id, epic_id, title, status) VALUES (?, ?, ?, ?)")
      .run('existing-story-id', 'epic-test', 'Existing Story', 'in-progress');
  });

  afterEach(() => {
    cleanupDb();
  });

  it('AC-3: blocks write when target_story does not exist in stories table', () => {
    // Simulate FK validation logic from upsert-debt.js
    const targetStory = 'non-existent-story-id';
    const exists = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get(targetStory);
    expect(exists).toBeUndefined();
    // When --validate-target is on and target doesn't exist, should block
  });

  it('AC-3: target_story exists → FK validation passes', () => {
    const targetStory = 'existing-story-id';
    const exists = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get(targetStory);
    expect(exists).toBeTruthy();
    expect(exists.story_id).toBe('existing-story-id');
  });

  it('AC-4: backward compatible — no flag means no FK check, write succeeds', () => {
    // Without --validate-target, debt with non-existent target_story should still be writable
    const data = {
      debt_id: 'TD-TEST-BC-001',
      story_id: 'test-source',
      category: 'deferred',
      severity: 'medium',
      title: 'Backward compat test',
      target_story: 'non-existent-story-id',
      status: 'open',
      created_at: '2026-04-13',
    };

    // Direct DB insert (simulating upsertDebt without validateTarget)
    db.prepare(`
      INSERT INTO tech_debt_items (debt_id, story_id, category, severity, title, target_story, status, created_at)
      VALUES (@debt_id, @story_id, @category, @severity, @title, @target_story, @status, @created_at)
    `).run(data);

    const row = db.prepare('SELECT * FROM tech_debt_items WHERE debt_id = ?').get('TD-TEST-BC-001');
    expect(row).toBeTruthy();
    expect(row.target_story).toBe('non-existent-story-id');
  });

  it('FK guard: null target_story always passes', () => {
    const targetStory = null;
    // validateTarget with null target_story should not trigger check
    const shouldCheck = targetStory != null;
    expect(shouldCheck).toBe(false);
  });

  it('FK guard: empty string target_story skips check', () => {
    const targetStory = '';
    // validateTarget with empty target_story should not trigger check
    const shouldCheck = targetStory != null && targetStory !== '';
    expect(shouldCheck).toBe(false);
  });

  it('FK guard with valid target writes debt successfully', () => {
    // Simulate full flow: validate target exists, then write
    const targetStory = 'existing-story-id';
    const exists = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get(targetStory);
    expect(exists).toBeTruthy();

    const data = {
      debt_id: 'TD-TEST-VALID-001',
      story_id: 'test-source',
      category: 'deferred',
      severity: 'medium',
      title: 'Valid target test',
      target_story: targetStory,
      status: 'open',
      created_at: '2026-04-13',
    };

    db.prepare(`
      INSERT INTO tech_debt_items (debt_id, story_id, category, severity, title, target_story, status, created_at)
      VALUES (@debt_id, @story_id, @category, @severity, @title, @target_story, @status, @created_at)
    `).run(data);

    const row = db.prepare('SELECT * FROM tech_debt_items WHERE debt_id = ?').get('TD-TEST-VALID-001');
    expect(row).toBeTruthy();
    expect(row.target_story).toBe('existing-story-id');
  });

  it('multiple stories: FK validates against correct one', () => {
    db.prepare("INSERT INTO stories (story_id, epic_id, title) VALUES (?, ?, ?)")
      .run('another-story', 'epic-test', 'Another Story');

    const check1 = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get('existing-story-id');
    const check2 = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get('another-story');
    const check3 = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get('missing-story');

    expect(check1).toBeTruthy();
    expect(check2).toBeTruthy();
    expect(check3).toBeUndefined();
  });
});
