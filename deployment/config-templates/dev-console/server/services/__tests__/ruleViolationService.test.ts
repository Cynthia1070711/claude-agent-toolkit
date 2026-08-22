// ============================================================
// ruleViolationService.test.ts — Service 層單元測試
// Story: ctr-p2-violation-tracker Task 7.3
// 策略:建立臨時 SQLite DB 注入 real better-sqlite3 + mock getDb()
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

vi.mock('../../db.js', () => ({
  getDb: vi.fn(),
  createDbConnection: vi.fn(),
  resetDb: vi.fn(),
}));

import * as dbModule from '../../db.js';
import {
  getStats,
  getRecent,
  classifyStatus,
  CATEGORY,
  BASELINE_30D,
} from '../ruleViolationService.js';

// ── Helpers ───────────────────────────────────────────────────

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.exec(`
    CREATE TABLE context_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      agent_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      related_files TEXT,
      story_id TEXT,
      epic_id TEXT
    );
  `);
  return conn;
}

function insertViolation(
  db: Database.Database,
  opts: { ts: string; rule: string; phase: string; severity?: string; summary?: string },
): void {
  const content = JSON.stringify({
    violated_rule_path: opts.rule,
    rule_loaded_at_time: true,
    cli_enforcement: false,
    workflow_phase: opts.phase,
    severity: opts.severity || 'low',
    incident_summary: opts.summary || 'test',
  });
  db.prepare(`
    INSERT INTO context_entries (agent_id, timestamp, category, title, content, related_files)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('CC-TEST', opts.ts, CATEGORY, `[rv] ${opts.rule}`, content, opts.rule);
}

// ISO 字串:N 天前(Taiwan zone)
function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000 + 8 * 3600000);
  return d.toISOString().replace('Z', '+08:00');
}

// ── Test suite ────────────────────────────────────────────────

describe('ruleViolationService', () => {
  let tmpPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `rvs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = initTestDb(tmpPath);
    vi.mocked(dbModule.getDb).mockReturnValue(db);
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    vi.clearAllMocks();
  });

  // ── classifyStatus pure function ────────────────────────────
  describe('classifyStatus', () => {
    it('returns GREEN at/below baseline', () => {
      expect(classifyStatus(0)).toBe('GREEN');
      expect(classifyStatus(BASELINE_30D)).toBe('GREEN');
    });

    it('returns YELLOW between baseline and baseline*1.2', () => {
      expect(classifyStatus(BASELINE_30D + 1)).toBe('YELLOW');
    });

    it('returns RED above baseline*1.2', () => {
      expect(classifyStatus(BASELINE_30D * 2)).toBe('RED');
    });
  });

  // ── getStats ────────────────────────────────────────────────
  describe('getStats', () => {
    it('returns empty stats when DB has no rule_violation rows', () => {
      const s = getStats();
      expect(s.total_60d).toBe(0);
      expect(s.total_30d_rolling).toBe(0);
      expect(s.status).toBe('GREEN');
      expect(s.by_rule).toEqual([]);
      expect(s.by_phase).toEqual([]);
    });

    it('returns emptyStats when getDb returns null', () => {
      vi.mocked(dbModule.getDb).mockReturnValue(null);
      const s = getStats();
      expect(s.total_60d).toBe(0);
      expect(s.baseline).toBe(BASELINE_30D);
      expect(s.status).toBe('GREEN');
    });

    it('counts only rows within 60d window', () => {
      insertViolation(db, { ts: daysAgo(90), rule: 'memory/old.md', phase: 'create-story' });
      insertViolation(db, { ts: daysAgo(30), rule: 'memory/mid.md', phase: 'dev-story' });
      insertViolation(db, { ts: daysAgo(5), rule: 'memory/new.md', phase: 'code-review' });
      const s = getStats();
      expect(s.total_60d).toBe(2);
      expect(s.by_rule.map(r => r.rule).sort()).toEqual(['memory/mid.md', 'memory/new.md']);
    });

    it('aggregates 30d rolling count (boundary: exactly at baseline = GREEN)', () => {
      for (let i = 0; i < BASELINE_30D; i++) {
        insertViolation(db, { ts: daysAgo(i), rule: 'memory/r.md', phase: 'create-story' });
      }
      const s = getStats();
      expect(s.total_30d_rolling).toBe(BASELINE_30D);
      expect(s.status).toBe('GREEN');
      expect(s.baseline_compare_pct).toBe(0);
    });

    it('flips to YELLOW when 30d rolling = baseline + 1', () => {
      for (let i = 0; i < BASELINE_30D + 1; i++) {
        insertViolation(db, { ts: daysAgo(i), rule: 'memory/r.md', phase: 'p' });
      }
      const s = getStats();
      expect(s.total_30d_rolling).toBe(BASELINE_30D + 1);
      expect(s.status).toBe('YELLOW');
    });

    it('flips to RED when 30d rolling > baseline * 1.2', () => {
      for (let i = 0; i < Math.ceil(BASELINE_30D * 1.2) + 1; i++) {
        insertViolation(db, { ts: daysAgo(i), rule: 'memory/r.md', phase: 'p' });
      }
      const s = getStats();
      expect(s.status).toBe('RED');
    });

    it('sorts by_rule DESC by count with last_timestamp', () => {
      insertViolation(db, { ts: daysAgo(10), rule: 'memory/a.md', phase: 'p' });
      insertViolation(db, { ts: daysAgo(5), rule: 'memory/a.md', phase: 'p' });
      insertViolation(db, { ts: daysAgo(3), rule: 'memory/b.md', phase: 'p' });
      const s = getStats();
      expect(s.by_rule[0].rule).toBe('memory/a.md');
      expect(s.by_rule[0].count).toBe(2);
      expect(s.by_rule[1].count).toBe(1);
      expect(s.by_rule[0].last_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('limits by_rule to top 10', () => {
      for (let i = 0; i < 15; i++) {
        insertViolation(db, { ts: daysAgo(i), rule: `memory/r${i}.md`, phase: 'p' });
      }
      const s = getStats();
      expect(s.by_rule.length).toBe(10);
    });

    it('aggregates by_phase DESC by count', () => {
      insertViolation(db, { ts: daysAgo(5), rule: 'a', phase: 'create-story' });
      insertViolation(db, { ts: daysAgo(4), rule: 'a', phase: 'create-story' });
      insertViolation(db, { ts: daysAgo(3), rule: 'a', phase: 'dev-story' });
      const s = getStats();
      expect(s.by_phase[0].phase).toBe('create-story');
      expect(s.by_phase[0].count).toBe(2);
    });

    it('ignores other categories (decision/debug) — filters by category=rule_violation', () => {
      insertViolation(db, { ts: daysAgo(5), rule: 'a', phase: 'p' });
      db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content)
                  VALUES ('CC', ?, 'decision', 't', '{}')`).run(daysAgo(5));
      const s = getStats();
      expect(s.total_60d).toBe(1);
    });

    it('handles malformed content JSON gracefully (falls back to related_files)', () => {
      db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content, related_files)
                  VALUES ('CC', ?, 'rule_violation', 't', 'NOT JSON', 'memory/x.md')`).run(daysAgo(5));
      const s = getStats();
      expect(s.total_60d).toBe(1);
      expect(s.by_rule[0].rule).toBe('memory/x.md');
      expect(s.by_phase[0].phase).toBe('(unknown)');
    });
  });

  // ── getRecent ───────────────────────────────────────────────
  describe('getRecent', () => {
    it('returns [] when DB not connected', () => {
      vi.mocked(dbModule.getDb).mockReturnValue(null);
      expect(getRecent()).toEqual([]);
    });

    it('returns rows sorted DESC by timestamp', () => {
      insertViolation(db, { ts: daysAgo(10), rule: 'a', phase: 'p' });
      insertViolation(db, { ts: daysAgo(2), rule: 'b', phase: 'p' });
      insertViolation(db, { ts: daysAgo(6), rule: 'c', phase: 'p' });
      const items = getRecent();
      expect(items.length).toBe(3);
      expect(items[0].related_files).toBe('b');
      expect(items[1].related_files).toBe('c');
      expect(items[2].related_files).toBe('a');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        insertViolation(db, { ts: daysAgo(i), rule: `r${i}`, phase: 'p' });
      }
      expect(getRecent(2).length).toBe(2);
    });

    it('clamps limit to [1, 200]', () => {
      insertViolation(db, { ts: daysAgo(1), rule: 'a', phase: 'p' });
      expect(getRecent(0).length).toBe(1);
      expect(getRecent(-5).length).toBe(1);
      expect(getRecent(999999).length).toBe(1);
    });

    it('parses metadata into entry.metadata when valid JSON', () => {
      insertViolation(db, {
        ts: daysAgo(1), rule: 'memory/depth.md', phase: 'create-story',
        severity: 'high', summary: 'Depth Gate WARN 投機通過',
      });
      const [entry] = getRecent();
      expect(entry.metadata).not.toBeNull();
      expect(entry.metadata!.violated_rule_path).toBe('memory/depth.md');
      expect(entry.metadata!.severity).toBe('high');
      expect(entry.metadata!.workflow_phase).toBe('create-story');
    });

    it('sets metadata to null when content is malformed', () => {
      db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content)
                  VALUES ('CC', ?, 'rule_violation', 't', 'INVALID JSON')`).run(daysAgo(1));
      const [entry] = getRecent();
      expect(entry.metadata).toBeNull();
    });
  });
});
