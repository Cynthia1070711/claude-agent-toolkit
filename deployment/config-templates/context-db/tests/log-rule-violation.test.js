// log-rule-violation.js Vitest — ctr-p2-violation-tracker Task 7.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  parseArgs,
  validateArgs,
  buildRecord,
  insertViolation,
  runLog,
  CATEGORY,
} from '../scripts/log-rule-violation.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS context_entries (
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
  CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
    title, content, tags, content=context_entries, content_rowid=id, tokenize='trigram'
  );
  CREATE TRIGGER IF NOT EXISTS context_ai AFTER INSERT ON context_entries BEGIN
    INSERT INTO context_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
  END;
`;

function createTempDb() {
  const p = path.join(os.tmpdir(), `lrv-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return { db, path: p };
}

describe('parseArgs', () => {
  it('parses --key value pairs', () => {
    const a = parseArgs(['--rule', 'memory/a.md', '--severity', 'high']);
    expect(a.rule).toBe('memory/a.md');
    expect(a.severity).toBe('high');
  });

  it('treats valueless flags as true', () => {
    const a = parseArgs(['--help']);
    expect(a.help).toBe(true);
  });

  it('stops consuming value if next token starts with --', () => {
    const a = parseArgs(['--rule', '--severity', 'low']);
    expect(a.rule).toBe(true);
    expect(a.severity).toBe('low');
  });
});

describe('validateArgs', () => {
  const base = {
    rule: 'memory/a.md', loaded: 'true', 'cli-enforced': 'false',
    phase: 'create-story', severity: 'high', summary: 'test',
  };

  it('returns [] when all required present', () => {
    expect(validateArgs(base)).toEqual([]);
  });

  it('reports each missing field', () => {
    const errors = validateArgs({ rule: 'x' });
    expect(errors.length).toBe(5);
    expect(errors.some(e => e.includes('loaded'))).toBe(true);
  });

  it('rejects invalid severity', () => {
    const errors = validateArgs({ ...base, severity: 'catastrophic' });
    expect(errors.some(e => e.includes('severity must be one of'))).toBe(true);
  });

  it('treats empty string and literal true as missing', () => {
    expect(validateArgs({ ...base, summary: '' }).some(e => e.includes('summary'))).toBe(true);
    expect(validateArgs({ ...base, rule: true }).some(e => e.includes('rule'))).toBe(true);
  });

  it('rejects invalid phase values (enum whitelist)', () => {
    const errors = validateArgs({ ...base, phase: 'code-reivew' });
    expect(errors.some(e => e.includes('phase must be one of'))).toBe(true);
  });

  it('accepts all 5 whitelisted phases', () => {
    for (const p of ['create-story', 'dev-story', 'code-review', 'party-mode', 'other']) {
      expect(validateArgs({ ...base, phase: p })).toEqual([]);
    }
  });
});

describe('buildRecord', () => {
  const args = {
    rule: 'memory/feedback_depth_gate_warn_not_optional.md',
    loaded: 'true', 'cli-enforced': 'false',
    phase: 'create-story', severity: 'HIGH',
    summary: 'Depth Gate WARN 投機通過',
  };

  it('content JSON contains all 6 required keys', () => {
    const r = buildRecord(args, { timestampFn: () => '2026-04-16T08:00:00.000+08:00' });
    const meta = JSON.parse(r.content);
    expect(Object.keys(meta).sort()).toEqual([
      'cli_enforcement', 'incident_summary', 'rule_loaded_at_time',
      'severity', 'violated_rule_path', 'workflow_phase',
    ]);
    expect(meta.rule_loaded_at_time).toBe(true);
    expect(meta.cli_enforcement).toBe(false);
    expect(meta.severity).toBe('high'); // normalized lowercase
  });

  it('timestamp matches UTC+8 ISO pattern', () => {
    const r = buildRecord(args);
    expect(r.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/);
  });

  it('tags is JSON array with 4 default entries', () => {
    const r = buildRecord(args);
    const t = JSON.parse(r.tags);
    expect(t).toEqual(['rule_violation', 'feedback_depth_gate_warn_not_optional', 'create-story', 'high']);
  });

  it('tags merges optional extra tags', () => {
    const r = buildRecord({ ...args, tags: 'extra-a, extra-b' });
    const t = JSON.parse(r.tags);
    expect(t).toContain('extra-a');
    expect(t).toContain('extra-b');
    expect(t[0]).toBe('rule_violation');
  });

  it('agent defaults to CC-OPUS when not supplied', () => {
    const r = buildRecord(args);
    expect(r.agent_id).toBe('CC-OPUS');
  });

  it('respects explicit --agent', () => {
    const r = buildRecord({ ...args, agent: 'CC-SONNET' });
    expect(r.agent_id).toBe('CC-SONNET');
  });

  it('reads CLAUDE_AGENT_ID env var when --agent not supplied', () => {
    const prev = process.env.CLAUDE_AGENT_ID;
    process.env.CLAUDE_AGENT_ID = 'CC-HAIKU';
    try {
      const r = buildRecord(args);
      expect(r.agent_id).toBe('CC-HAIKU');
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_AGENT_ID;
      else process.env.CLAUDE_AGENT_ID = prev;
    }
  });

  it('throws on invalid loaded bool', () => {
    expect(() => buildRecord({ ...args, loaded: 'maybe' })).toThrow(/loaded must be true\|false/);
  });

  it('related_files holds full rule path', () => {
    const r = buildRecord(args);
    expect(r.related_files).toBe(args.rule);
  });

  it('category is rule_violation constant', () => {
    expect(CATEGORY).toBe('rule_violation');
    expect(buildRecord(args).category).toBe('rule_violation');
  });
});

describe('insertViolation (DB integration)', () => {
  let ctx;
  beforeEach(() => { ctx = createTempDb(); });
  afterEach(() => {
    ctx.db.close();
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('inserts row and FTS trigger syncs', () => {
    const rec = buildRecord({
      rule: 'memory/x.md', loaded: 'true', 'cli-enforced': 'false',
      phase: 'dev-story', severity: 'medium', summary: 'smoke',
    });
    const id = insertViolation(ctx.db, rec);
    expect(id).toBeGreaterThan(0);
    const row = ctx.db.prepare('SELECT * FROM context_entries WHERE id=?').get(id);
    expect(row.category).toBe('rule_violation');
    expect(row.related_files).toBe('memory/x.md');
    const ftsCount = ctx.db.prepare("SELECT COUNT(*) c FROM context_fts WHERE context_fts MATCH 'rule_violation'").get().c;
    expect(ftsCount).toBe(1);
  });

  it('stores story_id and epic_id when present', () => {
    const rec = buildRecord({
      rule: 'memory/x.md', loaded: 'false', 'cli-enforced': 'true',
      phase: 'code-review', severity: 'low', summary: 'link',
      story: 'ctr-p2-violation-tracker', epic: 'epic-ctr',
    });
    const id = insertViolation(ctx.db, rec);
    const row = ctx.db.prepare('SELECT story_id, epic_id FROM context_entries WHERE id=?').get(id);
    expect(row.story_id).toBe('ctr-p2-violation-tracker');
    expect(row.epic_id).toBe('epic-ctr');
  });
});

describe('runLog (CLI entry)', () => {
  let ctx;
  let outBuf, errBuf;
  const io = () => {
    outBuf = ''; errBuf = '';
    return {
      stdout: s => { outBuf += s; },
      stderr: s => { errBuf += s; },
      dbFactory: () => ctx.db,
      appendLedger: () => {},
      syncEmbedding: () => null,
    };
  };

  beforeEach(() => { ctx = createTempDb(); });
  afterEach(() => {
    try { ctx.db.close(); } catch {}
    try { fs.unlinkSync(ctx.path); } catch {}
  });

  it('prints usage and exits 0 on --help', () => {
    const r = runLog(['--help'], io());
    expect(r.code).toBe(0);
    expect(outBuf).toMatch(/Usage:/);
  });

  it('prints usage and exits 0 on no args', () => {
    const r = runLog([], io());
    expect(r.code).toBe(0);
    expect(outBuf).toMatch(/Usage:/);
  });

  it('exits 1 on missing required params', () => {
    const r = runLog(['--rule', 'a'], io());
    expect(r.code).toBe(1);
    expect(errBuf).toMatch(/missing required/);
  });

  it('exits 1 on DB not found', () => {
    const r = runLog([
      '--rule', 'memory/a.md', '--loaded', 'true', '--cli-enforced', 'false',
      '--phase', 'dev-story', '--severity', 'low', '--summary', 's',
      '--db', '/nonexistent/missing-path.db',
    ], io());
    expect(r.code).toBe(1);
    expect(errBuf).toMatch(/DB not found/);
  });

  it('exits 1 on invalid --loaded value (buildRecord throws)', () => {
    const r = runLog([
      '--rule', 'memory/a.md', '--loaded', 'maybe', '--cli-enforced', 'false',
      '--phase', 'dev-story', '--severity', 'low', '--summary', 's',
      '--db', ctx.path,
    ], io());
    expect(r.code).toBe(1);
    expect(errBuf).toMatch(/loaded must be true\|false/);
  });

  it('happy path: inserts row, prints success, returns id', () => {
    const r = runLog([
      '--rule', 'memory/happy.md', '--loaded', 'true', '--cli-enforced', 'false',
      '--phase', 'create-story', '--severity', 'high', '--summary', 'happy',
      '--db', ctx.path,
    ], io());
    expect(r.code).toBe(0);
    expect(r.id).toBeGreaterThan(0);
    expect(outBuf).toMatch(/rule_violation 記錄成功/);
    expect(outBuf).toMatch(/happy\.md/);
  });

  it('surfaces embedding sync async error via stderr', async () => {
    const rejecting = () => Promise.reject(new Error('emb-fail'));
    const i = io();
    i.syncEmbedding = rejecting;
    const r = runLog([
      '--rule', 'memory/e.md', '--loaded', 'true', '--cli-enforced', 'false',
      '--phase', 'dev-story', '--severity', 'low', '--summary', 's',
      '--db', ctx.path,
    ], i);
    expect(r.code).toBe(0);
    await new Promise(resolve => setImmediate(resolve));
    expect(errBuf).toMatch(/embedding sync error/);
  });
});
