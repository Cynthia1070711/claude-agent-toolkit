// query-violations.js Vitest — ctr-p2-violation-tracker Task 7.2
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  parseArgs,
  classifyStatus,
  computeStats,
  queryRows,
  runQuery,
  BASELINE_30D,
} from '../scripts/query-violations.js';

function createTempDb() {
  const p = path.join(os.tmpdir(), `qv-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE context_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT, agent_id TEXT NOT NULL, timestamp TEXT NOT NULL,
      category TEXT NOT NULL, tags TEXT, title TEXT NOT NULL, content TEXT NOT NULL,
      related_files TEXT, story_id TEXT, epic_id TEXT
    );
  `);
  return { db, path: p };
}

function insertRow(db, { ts, rule, phase, severity, summary = 'x' }) {
  const content = JSON.stringify({
    violated_rule_path: rule,
    rule_loaded_at_time: true,
    cli_enforcement: false,
    workflow_phase: phase,
    severity,
    incident_summary: summary,
  });
  db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content, related_files)
              VALUES (?, ?, 'rule_violation', ?, ?, ?)`)
    .run('CC-TEST', ts, `[rule_violation] ${rule}`, content, rule);
}

describe('parseArgs', () => {
  it('parses --since, --phase, --limit', () => {
    const a = parseArgs(['--since', '2026-04-01', '--phase', 'dev-story', '--limit', '5']);
    expect(a.since).toBe('2026-04-01');
    expect(a.phase).toBe('dev-story');
    expect(a.limit).toBe('5');
  });
});

describe('classifyStatus — baseline 8, YELLOW_MULT 1.2', () => {
  it('GREEN when count <= baseline', () => {
    expect(classifyStatus(0)).toBe('GREEN');
    expect(classifyStatus(8)).toBe('GREEN');
  });

  it('YELLOW when baseline < count <= baseline*1.2 (i.e., 9 — 9.6)', () => {
    expect(classifyStatus(9)).toBe('YELLOW');
  });

  it('RED when count > baseline*1.2', () => {
    expect(classifyStatus(10)).toBe('RED');
    expect(classifyStatus(100)).toBe('RED');
  });

  it('boundary: baseline exactly 8 → GREEN', () => {
    expect(BASELINE_30D).toBe(8);
    expect(classifyStatus(BASELINE_30D)).toBe('GREEN');
  });
});

describe('computeStats', () => {
  const since60 = '2026-02-15';
  const since30 = '2026-03-17';

  it('empty rows → zero counts, status GREEN', () => {
    const s = computeStats([], { since60dISO: since60, since30dISO: since30 });
    expect(s.total_60d).toBe(0);
    expect(s.total_30d_rolling).toBe(0);
    expect(s.status).toBe('GREEN');
    expect(s.by_rule).toEqual([]);
    expect(s.by_phase).toEqual([]);
  });

  it('aggregates by rule and phase, sorted desc', () => {
    const rows = [
      { timestamp: '2026-04-01', content: JSON.stringify({ violated_rule_path: 'r1', workflow_phase: 'create-story' }), related_files: 'r1' },
      { timestamp: '2026-04-02', content: JSON.stringify({ violated_rule_path: 'r1', workflow_phase: 'dev-story' }), related_files: 'r1' },
      { timestamp: '2026-04-03', content: JSON.stringify({ violated_rule_path: 'r2', workflow_phase: 'create-story' }), related_files: 'r2' },
    ];
    const s = computeStats(rows, { since60dISO: since60, since30dISO: since30 });
    expect(s.total_60d).toBe(3);
    expect(s.by_rule[0].rule).toBe('r1');
    expect(s.by_rule[0].count).toBe(2);
    expect(s.by_phase[0].phase).toBe('create-story');
    expect(s.by_phase[0].count).toBe(2);
  });

  it('baseline_compare_pct reflects 30d rolling delta', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      timestamp: '2026-04-10',
      content: JSON.stringify({ violated_rule_path: 'r', workflow_phase: 'p' }),
      related_files: 'r',
    }));
    const s = computeStats(rows, { since60dISO: since60, since30dISO: since30 });
    expect(s.total_30d_rolling).toBe(10);
    expect(s.baseline_compare_pct).toBe(25); // (10-8)/8 = 25%
    expect(s.status).toBe('RED');
  });

  it('rows before since60d are excluded from by_rule/by_phase', () => {
    const rows = [
      { timestamp: '2025-01-01', content: JSON.stringify({ violated_rule_path: 'old', workflow_phase: 'p' }), related_files: 'old' },
      { timestamp: '2026-04-01', content: JSON.stringify({ violated_rule_path: 'new', workflow_phase: 'p' }), related_files: 'new' },
    ];
    const s = computeStats(rows, { since60dISO: since60, since30dISO: since30 });
    expect(s.by_rule.map(r => r.rule)).toEqual(['new']);
  });

  // [+CR H1] td-rule-violation-auto-detect-enable AC-4 — by_severity field required for Day-30 evaluation
  it('aggregates by_severity sorted desc (Day-30 evaluation Step 4 FP rate analysis input)', () => {
    const rows = [
      { timestamp: '2026-04-01', content: JSON.stringify({ violated_rule_path: 'r1', workflow_phase: 'p', severity: 'high' }), related_files: 'r1' },
      { timestamp: '2026-04-02', content: JSON.stringify({ violated_rule_path: 'r2', workflow_phase: 'p', severity: 'high' }), related_files: 'r2' },
      { timestamp: '2026-04-03', content: JSON.stringify({ violated_rule_path: 'r3', workflow_phase: 'p', severity: 'medium' }), related_files: 'r3' },
      { timestamp: '2026-04-04', content: JSON.stringify({ violated_rule_path: 'r4', workflow_phase: 'p' }), related_files: 'r4' },
    ];
    const s = computeStats(rows, { since60dISO: since60, since30dISO: since30 });
    expect(s.by_severity[0].severity).toBe('high');
    expect(s.by_severity[0].count).toBe(2);
    expect(s.by_severity[1].count).toBe(1); // medium or unknown tied
    expect(s.by_severity.length).toBe(3); // high, medium, (unknown)
  });
});

describe('queryRows (DB integration)', () => {
  let ctx;
  beforeEach(() => { ctx = createTempDb(); });
  afterEach(() => {
    ctx.db.close();
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('filters by category=rule_violation and timestamp', () => {
    insertRow(ctx.db, { ts: '2026-04-10T00:00:00+08:00', rule: 'memory/a.md', phase: 'create-story', severity: 'low' });
    insertRow(ctx.db, { ts: '2026-04-11T00:00:00+08:00', rule: 'memory/b.md', phase: 'dev-story', severity: 'high' });
    // Non-matching category
    ctx.db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content)
                    VALUES ('CC','2026-04-12','decision','t','{}')`).run();
    const rows = queryRows(ctx.db, { sinceISO: '2026-04-01' });
    expect(rows.length).toBe(2);
    expect(rows.every(r => r.title.includes('rule_violation'))).toBe(true);
  });

  it('filters by --rule (related_files exact match)', () => {
    insertRow(ctx.db, { ts: '2026-04-10T00:00:00+08:00', rule: 'memory/a.md', phase: 'p', severity: 'low' });
    insertRow(ctx.db, { ts: '2026-04-11T00:00:00+08:00', rule: 'memory/b.md', phase: 'p', severity: 'low' });
    const rows = queryRows(ctx.db, { sinceISO: '2026-04-01', rule: 'memory/a.md' });
    expect(rows.length).toBe(1);
    expect(rows[0].related_files).toBe('memory/a.md');
  });

  it('filters by --phase (JSON content.workflow_phase)', () => {
    insertRow(ctx.db, { ts: '2026-04-10T00:00:00+08:00', rule: 'memory/a.md', phase: 'create-story', severity: 'low' });
    insertRow(ctx.db, { ts: '2026-04-11T00:00:00+08:00', rule: 'memory/b.md', phase: 'dev-story', severity: 'low' });
    const rows = queryRows(ctx.db, { sinceISO: '2026-04-01', phase: 'dev-story' });
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].content).workflow_phase).toBe('dev-story');
  });
});

describe('runQuery (CLI entry)', () => {
  let ctx;
  let outBuf, errBuf;
  const io = () => {
    outBuf = ''; errBuf = '';
    return {
      stdout: s => { outBuf += s; },
      stderr: s => { errBuf += s; },
      dbFactory: () => ctx.db,
    };
  };

  beforeEach(() => {
    ctx = createTempDb();
    insertRow(ctx.db, { ts: new Date().toISOString().slice(0, 19) + '+08:00', rule: 'memory/live.md', phase: 'dev-story', severity: 'medium' });
  });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('--help prints usage and exits 0', () => {
    const r = runQuery(['--help'], io());
    expect(r.code).toBe(0);
    expect(outBuf).toMatch(/Usage:/);
  });

  it('table format emits KPI block', () => {
    const r = runQuery(['--db', ctx.path, '--format', 'table'], io());
    expect(r.code).toBe(0);
    expect(outBuf).toMatch(/Rule Violation Stats/);
    expect(outBuf).toMatch(/status:/);
    expect(outBuf).toMatch(/Top rules|By phase/);
  });

  it('json format outputs parseable JSON', () => {
    const r = runQuery(['--db', ctx.path, '--format', 'json'], io());
    expect(r.code).toBe(0);
    const parsed = JSON.parse(outBuf);
    expect(parsed.stats).toBeDefined();
    expect(parsed.timeline).toBeDefined();
    expect(r.stats.total_60d).toBeGreaterThanOrEqual(1);
  });

  it('respects --limit for timeline slicing', () => {
    // [bwu-12] seed timestamps must stay within the query's default 60-day rolling window
    // (query-violations.js:176 `daysAgoISO(60)`), not hardcoded absolute dates — a fixed
    // '2026-04-1X' seed ages out of that window as calendar time advances past +60d, making
    // the default-window query legitimately return fewer rows than seeded (root cause of the
    // 'expected 1 to be 2' failure: only the beforeEach row, whose ts is `new Date()`, survived
    // the filter). Anchor relative to now so the test stays valid regardless of when it runs.
    // [bwu-12 CR L3] `toISOString()` 給的是 UTC 牆鐘,直接接上 '+08:00' 會產出「數字是 UTC、標籤說
    // 是台北」的錯標時間戳(偏差 8 小時),違反 constitutional-standard §Timestamp Mandate 的
    // offset-aware 原則(有 offset 但值不對,比 naive 更難察覺)。先加 8 小時再格式化,使牆鐘與標籤一致。
    const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
    const taipeiIso = (ms) => `${new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
    const nowMs = Date.now();
    for (let i = 0; i < 5; i++) {
      insertRow(ctx.db, { ts: taipeiIso(nowMs - i * 86400000), rule: 'r', phase: 'p', severity: 'low' });
    }
    const r = runQuery(['--db', ctx.path, '--format', 'json', '--limit', '2'], io());
    expect(r.code).toBe(0);
    expect(r.timeline.length).toBe(2);
  });

  it('exits 1 when db path missing', () => {
    const r = runQuery(['--db', '/nonexistent/missing-path-qv.db'], io());
    expect(r.code).toBe(1);
    expect(errBuf).toMatch(/DB not found/);
  });
});
