// ============================================================
// memoryDashboardService.test.ts — Story td-devconsole-godnode-and-mem-dashboard
// BR-MEM-001 ~ 004: 4 SQL aggregations
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');

  conn.exec(`
    CREATE TABLE context_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      category TEXT,
      title TEXT
    );

    CREATE TABLE tech_debt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT,
      status TEXT
    );

    CREATE TABLE intentional_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idd_type TEXT,
      status TEXT
    );

    CREATE TABLE stories (
      story_id TEXT PRIMARY KEY,
      status TEXT
    );
  `);

  // Seed: context_entries 含 5 categories × 2 days
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const insertCtx = conn.prepare('INSERT INTO context_entries (timestamp, category, title) VALUES (?, ?, ?)');
  ['decision', 'pattern', 'debug', 'audit', 'session'].forEach((cat, i) => {
    insertCtx.run(`${today}T10:00:00+08:00`, cat, `t${i}`);
    insertCtx.run(`${yesterday}T10:00:00+08:00`, cat, `t${i}-y`);
  });

  // tech_debt_items: 大小寫混雜 + 多 status
  const insertDebt = conn.prepare('INSERT INTO tech_debt_items (severity, status) VALUES (?, ?)');
  insertDebt.run('LOW', 'ACCEPTED');
  insertDebt.run('low', 'accepted');
  insertDebt.run('high', 'fixed');
  insertDebt.run('HIGH', 'fixed');
  insertDebt.run('medium', 'open');
  insertDebt.run('medium', 'wont-fix');

  // intentional_decisions: COM/STR/REG/USR 各狀態
  const insertIdd = conn.prepare('INSERT INTO intentional_decisions (idd_type, status) VALUES (?, ?)');
  insertIdd.run('COM', 'active');
  insertIdd.run('COM', 'active');
  insertIdd.run('STR', 'active');
  insertIdd.run('REG', 'retired');
  insertIdd.run('USR', 'active');

  // stories: 5 stages + others
  const insertStory = conn.prepare('INSERT INTO stories (story_id, status) VALUES (?, ?)');
  ['s1', 's2'].forEach(id => insertStory.run(id, 'backlog'));
  insertStory.run('s3', 'ready-for-dev');
  insertStory.run('s4', 'in-progress');
  ['s5', 's6', 's7'].forEach(id => insertStory.run(id, 'done'));
  insertStory.run('s8', 'cancelled'); // 進 other
  insertStory.run('s9', 'split');     // 進 other

  return conn;
}

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

vi.mock('../../config.js', () => ({
  config: { dbPath: '', port: 3001, allowedOrigin: '', projectRoot: '' },
}));

import * as db from '../../db.js';
import {
  getDailyContextTrend,
  getDebtSeverityMatrix,
  getIddSubtypes,
  getStoryFunnel,
} from '../memoryDashboardService.js';

describe('memoryDashboardService', () => {
  let tmpDir: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-mem-dash-'));
    conn = initTestDb(path.join(tmpDir, 'mem.db'));
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getDailyContextTrend (BR-MEM-001)', () => {
    it('returns categories distinct sorted', () => {
      const r = getDailyContextTrend(30);
      expect(r.categories).toEqual(['audit', 'debug', 'decision', 'pattern', 'session']);
      expect(r.days).toBe(30);
      expect(r.data.length).toBeGreaterThan(0);
    });

    it('clamps days to [1, 365]', () => {
      const big = getDailyContextTrend(999);
      expect(big.days).toBe(365);
      const neg = getDailyContextTrend(-5);
      expect(neg.days).toBe(1); // Math.max(1, -5) = 1
      const undef = getDailyContextTrend();
      expect(undef.days).toBe(30); // default 30
    });

    it('returns empty when DB null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const r = getDailyContextTrend();
      expect(r.data).toEqual([]);
    });
  });

  describe('getDebtSeverityMatrix (BR-MEM-002)', () => {
    it('normalizes severity/status with LOWER', () => {
      const r = getDebtSeverityMatrix();
      // 大小寫合併: LOW + low = low; HIGH + high = high; ACCEPTED + accepted = accepted
      const lowAccepted = r.data.find(d => d.severity === 'low' && d.status === 'accepted');
      expect(lowAccepted?.cnt).toBe(2);
      const highFixed = r.data.find(d => d.severity === 'high' && d.status === 'fixed');
      expect(highFixed?.cnt).toBe(2);
    });

    it('exposes severities + statuses sorted distinct', () => {
      const r = getDebtSeverityMatrix();
      expect(r.severities).toContain('low');
      expect(r.severities).toContain('high');
      expect(r.severities).toContain('medium');
      expect(r.statuses).toContain('accepted');
      expect(r.statuses).toContain('fixed');
      expect(r.statuses).toContain('open');
      expect(r.statuses).toContain('wont-fix');
    });

    it('returns empty when DB null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const r = getDebtSeverityMatrix();
      expect(r.data).toEqual([]);
    });
  });

  describe('getIddSubtypes (BR-MEM-003)', () => {
    it('groups by idd_type + status, types fixed COM/STR/REG/USR', () => {
      const r = getIddSubtypes();
      expect(r.types).toEqual(['COM', 'STR', 'REG', 'USR']);
      const comActive = r.data.find(d => d.idd_type === 'COM' && d.status === 'active');
      expect(comActive?.cnt).toBe(2);
      const regRetired = r.data.find(d => d.idd_type === 'REG' && d.status === 'retired');
      expect(regRetired?.cnt).toBe(1);
    });

    it('returns empty data when DB null', () => {
      vi.mocked(db.getDb).mockReturnValueOnce(null);
      const r = getIddSubtypes();
      expect(r.data).toEqual([]);
    });
  });

  describe('getStoryFunnel (BR-MEM-004)', () => {
    it('returns 5 stages in fixed order', () => {
      const r = getStoryFunnel();
      expect(r.stages).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']);
      expect(r.data.map(d => d.status)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']);
    });

    it('aggregates non-stage status into other_count', () => {
      const r = getStoryFunnel();
      // cancelled (1) + split (1) = 2
      expect(r.other_count).toBe(2);
    });

    it('counts each stage correctly', () => {
      const r = getStoryFunnel();
      const map = new Map(r.data.map(d => [d.status, d.cnt]));
      expect(map.get('backlog')).toBe(2);
      expect(map.get('ready-for-dev')).toBe(1);
      expect(map.get('in-progress')).toBe(1);
      expect(map.get('review')).toBe(0);
      expect(map.get('done')).toBe(3);
    });
  });
});
