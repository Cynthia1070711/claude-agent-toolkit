// workflow-precheck.test.js — Vitest for td-rule-violation-workflow-precheck Story
//
// Coverage: AC-1 (CLI JSON parse) / AC-2 (step-00 instruction structure) /
//           AC-3 (0-violations short-circuit) / AC-4 (phase filter isolation) /
//           AC-5 (this file's existence + ≥6 tests).
//
// Reuses computeStats / queryRows / runQuery / parseArgs from query-violations.js
// (no new wrapper script — Story dev_notes flagged precheck-violations.js as OPTIONAL).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runQuery, computeStats, queryRows, parseArgs } from '../scripts/query-violations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEV_STEP_PATH = path.join(REPO_ROOT, '_bmad', 'bmm', 'workflows', '4-implementation',
                                 'dev-story', 'steps', 'step-00-violation-precheck.md');
const CR_STEP_PATH = path.join(REPO_ROOT, '_bmad', 'bmm', 'workflows', '4-implementation',
                                'code-review', 'steps', 'step-00-violation-precheck.md');

// ───────── Test fixtures ─────────

function createTempDb() {
  const p = path.join(os.tmpdir(), `wp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

function insertRow(db, { ts, rule, phase, severity = 'medium', summary = 'fixture' }) {
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

function captureIO(ctx) {
  let outBuf = '';
  let errBuf = '';
  return {
    stdout: s => { outBuf += s; },
    stderr: s => { errBuf += s; },
    dbFactory: () => ctx.db,
    get out() { return outBuf; },
    get err() { return errBuf; },
  };
}

// Today − N days, formatted YYYY-MM-DDTHH:mm:ss+08:00 (matches taiwanNow output)
function daysAgoTs(days) {
  const ms = Date.now() - days * 86400000 + 8 * 3600000;
  return new Date(ms).toISOString().slice(0, 19) + '+08:00';
}

// ───────── AC-1 — CLI JSON output schema ─────────

describe('AC-1 — CLI returns valid JSON schema with stats.by_rule[]', () => {
  let ctx, io;
  beforeEach(() => {
    ctx = createTempDb();
    io = captureIO(ctx);
    // 3 code-review violations (1 unique rule shared, 1 unique each)
    insertRow(ctx.db, { ts: daysAgoTs(2), rule: 'memory/feedback_a.md', phase: 'code-review' });
    insertRow(ctx.db, { ts: daysAgoTs(5), rule: 'memory/feedback_a.md', phase: 'code-review' });
    insertRow(ctx.db, { ts: daysAgoTs(7), rule: '.claude/rules/skill-sync-gate.md', phase: 'code-review' });
  });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('returns parseable JSON with stats.by_rule sorted desc by count', () => {
    const r = runQuery(['--db', ctx.path, '--phase', 'code-review',
                        '--since-days', '30', '--format', 'json', '--limit', '3'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.by_rule).toBeInstanceOf(Array);
    expect(parsed.stats.by_rule.length).toBeGreaterThanOrEqual(2);
    expect(parsed.stats.by_rule[0].count).toBe(2);
    expect(parsed.stats.by_rule[0].rule).toBe('memory/feedback_a.md');
    expect(parsed.stats.by_rule[1].count).toBe(1);
  });

  it('respects --limit on timeline (not stats.by_rule which uses internal slice 10)', () => {
    const r = runQuery(['--db', ctx.path, '--phase', 'code-review',
                        '--since-days', '30', '--format', 'json', '--limit', '2'], io);
    expect(r.code).toBe(0);
    expect(r.timeline.length).toBe(2);
  });
});

// ───────── AC-2 — step-00 instruction template structural integrity ─────────

describe('AC-2 — step-00-violation-precheck.md instruction structure', () => {
  it('dev-story step file exists and contains all required markers', () => {
    expect(fs.existsSync(DEV_STEP_PATH)).toBe(true);
    const md = fs.readFileSync(DEV_STEP_PATH, 'utf8');
    // Frontmatter
    expect(md).toMatch(/^---/);
    expect(md).toMatch(/name:\s*['"]?step-00-violation-precheck/);
    expect(md).toMatch(/nextStepFile:.*step-00-db-first-query\.md/);
    // CLI invocation with phase + since-days
    expect(md).toMatch(/query-violations\.js.*--phase dev-story.*--since-days 30.*--format json.*--limit 3/);
    // Mandatory Read block
    expect(md).toMatch(/Mandatory Read/);
    expect(md).toMatch(/MUST.*Read/);
    // 0-violations short-circuit
    expect(md).toMatch(/no dev-story violations in 30d rolling window/);
    // Acknowledgement marker
    expect(md).toMatch(/✅ Pre-check passed:/);
    // Fail-open mode
    expect(md).toMatch(/[Ff]ail-open/);
  });

  it('code-review step file exists and contains all required markers', () => {
    expect(fs.existsSync(CR_STEP_PATH)).toBe(true);
    const md = fs.readFileSync(CR_STEP_PATH, 'utf8');
    expect(md).toMatch(/name:\s*['"]?step-00-violation-precheck/);
    // code-review chains step-00 → step-00b (DB-first query) → step-01, mirroring
    // the dev-story branch asserted above. This expectation lagged behind the
    // insertion of step-00b-db-first-query.md and had been red ever since.
    expect(md).toMatch(/nextStepFile:.*step-00b-db-first-query\.md/);
    expect(md).toMatch(/query-violations\.js.*--phase code-review.*--since-days 30.*--format json.*--limit 3/);
    expect(md).toMatch(/Mandatory Read/);
    expect(md).toMatch(/MUST.*Read/);
    expect(md).toMatch(/no code-review violations in 30d rolling window/);
    expect(md).toMatch(/✅ Pre-check passed:/);
  });

  it('both step files declare Workflow Entry Gate role and reference the L1-L5 architecture', () => {
    const devMd = fs.readFileSync(DEV_STEP_PATH, 'utf8');
    const crMd = fs.readFileSync(CR_STEP_PATH, 'utf8');
    // Avoids "L1 Pre-gate" (would conflict with established L1 Observer Stop hook naming)
    expect(devMd).toMatch(/Workflow Entry Gate/);
    expect(crMd).toMatch(/Workflow Entry Gate/);
    expect(devMd).not.toMatch(/L1 Pre-gate/);
    expect(crMd).not.toMatch(/L1 Pre-gate/);
    // Both must cite the L1 Observer / L4 Consumer existing chain for context
    expect(devMd).toMatch(/L1 Observer/);
    expect(crMd).toMatch(/L1 Observer/);
    expect(devMd).toMatch(/L4 Consumer/);
    expect(crMd).toMatch(/L4 Consumer/);
    expect(devMd).toMatch(/reference_rule_violation_tracker/);
    expect(crMd).toMatch(/reference_rule_violation_tracker/);
  });
});

// ───────── AC-3 — 0-violations short-circuit ─────────

describe('AC-3 — 0 violations branch (short-circuit, no Read mandate)', () => {
  let ctx, io;
  beforeEach(() => { ctx = createTempDb(); io = captureIO(ctx); });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('empty DB returns total_30d_rolling=0 and empty by_rule', () => {
    const r = runQuery(['--db', ctx.path, '--phase', 'dev-story',
                        '--since-days', '30', '--format', 'json', '--limit', '3'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats.total_30d_rolling).toBe(0);
    expect(parsed.stats.by_rule).toEqual([]);
    expect(parsed.stats.status).toBe('GREEN');
  });

  it('only ancient (>30d) violations also yield total_30d_rolling=0 even if total_60d > 0', () => {
    // One row 45 days ago — outside 30d rolling window but inside 60d default
    insertRow(ctx.db, { ts: daysAgoTs(45), rule: 'memory/old.md', phase: 'dev-story' });
    const r = runQuery(['--db', ctx.path, '--phase', 'dev-story',
                        '--since-days', '60', '--format', 'json', '--limit', '3'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats.total_60d).toBe(1);
    expect(parsed.stats.total_30d_rolling).toBe(0);
    // by_rule still includes ancient row because it iterates >= sinceISO (60d here)
    expect(parsed.stats.by_rule.length).toBe(1);
  });
});

// ───────── AC-4 — Phase filter isolation ─────────

describe('AC-4 — --phase filter isolates by workflow_phase', () => {
  let ctx, io;
  beforeEach(() => {
    ctx = createTempDb();
    io = captureIO(ctx);
    insertRow(ctx.db, { ts: daysAgoTs(1), rule: 'memory/dev.md', phase: 'dev-story' });
    insertRow(ctx.db, { ts: daysAgoTs(2), rule: 'memory/cr.md',  phase: 'code-review' });
    insertRow(ctx.db, { ts: daysAgoTs(3), rule: 'memory/cs.md',  phase: 'create-story' });
  });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('--phase dev-story includes only dev-story rows', () => {
    const r = runQuery(['--db', ctx.path, '--phase', 'dev-story',
                        '--since-days', '30', '--format', 'json'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats.by_rule.map(x => x.rule)).toEqual(['memory/dev.md']);
    expect(parsed.stats.by_phase.length).toBe(1);
    expect(parsed.stats.by_phase[0].phase).toBe('dev-story');
  });

  it('--phase code-review includes only code-review rows (excludes dev/create)', () => {
    const r = runQuery(['--db', ctx.path, '--phase', 'code-review',
                        '--since-days', '30', '--format', 'json'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats.by_rule.map(x => x.rule)).toEqual(['memory/cr.md']);
  });
});

// ───────── --since-days behaviour (new flag for step-00 invocation) ─────────

describe('--since-days flag — step-00 invocation contract', () => {
  let ctx, io;
  beforeEach(() => { ctx = createTempDb(); io = captureIO(ctx); });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('parseArgs captures --since-days as raw string value', () => {
    const a = parseArgs(['--since-days', '30', '--phase', 'code-review']);
    expect(a['since-days']).toBe('30');
    expect(a.phase).toBe('code-review');
  });

  it('rejects --since-days with --since (mutually exclusive) → exit 1', () => {
    const r = runQuery(['--db', ctx.path, '--since-days', '30', '--since', '2026-04-01'], io);
    expect(r.code).toBe(1);
    expect(io.err).toMatch(/mutually exclusive/);
  });

  it('rejects non-positive integer → exit 1 with diagnostic', () => {
    const r = runQuery(['--db', ctx.path, '--since-days', 'abc'], io);
    expect(r.code).toBe(1);
    expect(io.err).toMatch(/positive integer/);
  });

  it('rejects --since-days 0 → exit 1', () => {
    const r = runQuery(['--db', ctx.path, '--since-days', '0'], io);
    expect(r.code).toBe(1);
    expect(io.err).toMatch(/positive integer/);
  });

  it('--since-days 30 picks up rows ≤30d but excludes ≥35d (within sinceISO window)', () => {
    insertRow(ctx.db, { ts: daysAgoTs(2), rule: 'memory/recent.md', phase: 'code-review' });
    insertRow(ctx.db, { ts: daysAgoTs(35), rule: 'memory/old.md', phase: 'code-review' });
    const r = runQuery(['--db', ctx.path, '--phase', 'code-review',
                        '--since-days', '30', '--format', 'json'], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.stats.by_rule.map(x => x.rule)).toEqual(['memory/recent.md']);
    expect(parsed.timeline.length).toBe(1);
  });
});

// ───────── Resilience: malformed JSON / missing DB ─────────

describe('Resilience — malformed JSON content + DB not found', () => {
  it('row with malformed content JSON does not throw — falls back to empty meta', () => {
    const ctx = createTempDb();
    try {
      ctx.db.prepare(`INSERT INTO context_entries (agent_id, timestamp, category, title, content, related_files)
                      VALUES ('CC-TEST', ?, 'rule_violation', 't', '{ malformed json', 'memory/x.md')`)
        .run(daysAgoTs(1));
      const io = captureIO(ctx);
      const r = runQuery(['--db', ctx.path, '--format', 'json', '--since-days', '30'], io);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(io.out);
      // Content unparseable → meta={} → workflow_phase defaults to '(unknown)'
      expect(parsed.stats.by_phase[0].phase).toBe('(unknown)');
      // related_files used as rule fallback
      expect(parsed.stats.by_rule[0].rule).toBe('memory/x.md');
    } finally {
      try { ctx.db.close(); } catch {}
      try { fs.unlinkSync(ctx.path); } catch {}
    }
  });

  it('DB path missing → exit 1 with stderr "DB not found"', () => {
    let outBuf = '';
    let errBuf = '';
    const io = {
      stdout: s => { outBuf += s; },
      stderr: s => { errBuf += s; },
    };
    const r = runQuery(['--db', '/nonexistent/wp-precheck-missing.db',
                        '--phase', 'dev-story', '--since-days', '30'], io);
    expect(r.code).toBe(1);
    expect(errBuf).toMatch(/DB not found/);
  });
});

// ───────── computeStats unit (regression for shared helper) ─────────

describe('computeStats — direct unit (zero rows + by_rule slice cap)', () => {
  it('zero rows produce safe defaults (no NaN, no throws)', () => {
    const s = computeStats([], { since60dISO: '2026-01-01', since30dISO: '2026-04-01' });
    expect(s.total_30d_rolling).toBe(0);
    expect(s.by_rule).toEqual([]);
    expect(s.by_phase).toEqual([]);
    expect(Number.isFinite(s.baseline_compare_pct)).toBe(true);
  });

  it('by_rule capped at 10 entries even with 15 unique rules', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      timestamp: '2026-04-15',
      content: JSON.stringify({ violated_rule_path: `memory/r${i}.md`, workflow_phase: 'p' }),
      related_files: `memory/r${i}.md`,
    }));
    const s = computeStats(rows, { since60dISO: '2026-01-01', since30dISO: '2026-04-01' });
    expect(s.by_rule.length).toBe(10); // hardcoded slice(0,10) in computeStats
  });
});

// ───────── queryRows phase filter (DB integration regression guard) ─────────

describe('queryRows — phase filter via post-filter on JSON content', () => {
  let ctx;
  beforeEach(() => { ctx = createTempDb(); });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('post-filter excludes wrong-phase rows even when SQL would return them', () => {
    insertRow(ctx.db, { ts: daysAgoTs(1), rule: 'r1', phase: 'dev-story' });
    insertRow(ctx.db, { ts: daysAgoTs(2), rule: 'r2', phase: 'code-review' });
    insertRow(ctx.db, { ts: daysAgoTs(3), rule: 'r3', phase: 'create-story' });
    const sinceISO = daysAgoTs(30).slice(0, 10);
    const cr = queryRows(ctx.db, { sinceISO, phase: 'code-review' });
    const dev = queryRows(ctx.db, { sinceISO, phase: 'dev-story' });
    expect(cr.length).toBe(1);
    expect(dev.length).toBe(1);
    expect(JSON.parse(cr[0].content).workflow_phase).toBe('code-review');
    expect(JSON.parse(dev[0].content).workflow_phase).toBe('dev-story');
  });
});
