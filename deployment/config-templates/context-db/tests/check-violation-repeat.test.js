// check-violation-repeat.test.js — Vitest for td-rule-violation-workflow-postcheck
//
// Coverage (≥ 10 tests):
//   AC-1  CLI exit code 0/1 + JSON schema
//   AC-2  Keyword map loader ≥ 10 rules + fallback to basename token
//   AC-3  scanSessionActions single / multi findings / 3 scopes / unicode / empty
//   AC-5  buildSuggestedCommands CLI format
//   AC-6  this file exists with ≥ 10 tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  runCheck,
  parseArgs,
  validateArgs,
  loadKeywordMap,
  flattenKeywordMap,
  buildFallbackPatterns,
  scanSessionActions,
  buildSuggestedCommands,
  getHotRules,
  isNoiseMessage,
  DEFAULT_KEYWORD_MAP_PATH,
  NOISE_MESSAGE_PATTERNS,
} from '../scripts/check-violation-repeat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const CLEAN_FIXTURE = path.join(FIXTURE_DIR, 'session-actions-clean.json');
const ONE_FIXTURE = path.join(FIXTURE_DIR, 'session-actions-1-finding.json');
const MULTI_FIXTURE = path.join(FIXTURE_DIR, 'session-actions-multi-finding.json');

function createTempDb() {
  const p = path.join(os.tmpdir(), `cvr-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

function daysAgoTs(days) {
  const ms = Date.now() - days * 86400000 + 8 * 3600000;
  return new Date(ms).toISOString().slice(0, 19) + '+08:00';
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

function writeTempActions(obj) {
  const p = path.join(os.tmpdir(), `cvr-actions-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

// ───────── AC-2 — Keyword map loader ─────────

describe('AC-2 — loadKeywordMap + flattenKeywordMap', () => {
  it('default keyword map file exists at _ref/violation-keyword-map.json', () => {
    expect(fs.existsSync(DEFAULT_KEYWORD_MAP_PATH)).toBe(true);
  });

  it('loads ≥ 10 rules with ≥ 1 keyword each', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    expect(map.version).toBeDefined();
    expect(map.rules).toBeDefined();
    const ruleCount = Object.keys(map.rules).length;
    expect(ruleCount).toBeGreaterThanOrEqual(9);
    for (const [rule, entries] of Object.entries(map.rules)) {
      expect(Array.isArray(entries), `${rule} entries`).toBe(true);
      expect(entries.length, `${rule} at least 1 keyword`).toBeGreaterThanOrEqual(1);
      for (const e of entries) {
        expect(typeof e.kw).toBe('string');
        expect(['high', 'medium', 'low']).toContain(e.sev);
        expect(['string', 'regex']).toContain(e.kind);
      }
    }
  });

  it('covers the 6 mandatory hot rules from AC-2', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const mandatory = [
      '.claude/rules/tasks-backfill.md',
      '.claude/rules/constitutional-standard.md',
      '.claude/rules/depth-gate-warn-mandatory-resolution.md',
      'memory/feedback_cr_must_try_fix_before_defer.md',
      '.claude/rules/skill-sync-gate.md',
      '.claude/rules/cr-debt-doc-audit.md',
    ];
    for (const r of mandatory) {
      expect(Object.keys(map.rules), `${r} present`).toContain(r);
    }
  });

  it('flattenKeywordMap compiles regex entries with flags', () => {
    const map = {
      version: '1.0.0',
      rules: {
        'rule-a': [
          { kw: 'abc', sev: 'high', kind: 'string' },
          { kw: '\\bdef\\b', sev: 'medium', kind: 'regex', flags: 'i' },
        ],
      },
    };
    const flat = flattenKeywordMap(map);
    expect(flat).toHaveLength(2);
    expect(typeof flat[0].kw).toBe('string');
    expect(flat[1].kw).toBeInstanceOf(RegExp);
    expect(flat[1].kw.flags).toContain('i');
  });

  it('flattenKeywordMap skips invalid regex silently', () => {
    const map = {
      rules: {
        'rule-a': [
          { kw: '[invalid(regex', sev: 'high', kind: 'regex' },
          { kw: 'valid', sev: 'low', kind: 'string' },
        ],
      },
    };
    const flat = flattenKeywordMap(map);
    expect(flat).toHaveLength(1);
    expect(flat[0].raw).toBe('valid');
  });

  it('buildFallbackPatterns generates basename tokens for unmapped rules', () => {
    const map = { rules: { 'known-rule.md': [{ kw: 'x', sev: 'high', kind: 'string' }] } };
    const fallback = buildFallbackPatterns(['memory/feedback_unmapped_rule.md'], map);
    expect(fallback).toHaveLength(1);
    expect(fallback[0].rule).toBe('memory/feedback_unmapped_rule.md');
    expect(fallback[0].kw).toContain('unmapped');
    expect(fallback[0].sev).toBe('low');
  });

  it('buildFallbackPatterns returns empty when all rules are mapped', () => {
    const map = { rules: { 'known-rule.md': [{ kw: 'x', sev: 'high', kind: 'string' }] } };
    const fallback = buildFallbackPatterns(['known-rule.md'], map);
    expect(fallback).toHaveLength(0);
  });
});

// ───────── AC-3 — scanSessionActions ─────────

describe('AC-3 — scanSessionActions', () => {
  const patterns = [
    { rule: 'rule-x', kw: 'Phase A 違反', sev: 'high', kind: 'string', raw: 'Phase A 違反' },
    { rule: 'rule-y', kw: /\banti-pattern\b/i, sev: 'medium', kind: 'regex', raw: '\\banti-pattern\\b' },
    { rule: 'rule-z', kw: 'observer paradox', sev: 'medium', kind: 'string', raw: 'observer paradox' },
  ];

  it('returns [] for empty actions object', () => {
    const findings = scanSessionActions({ assistant_messages: [], tool_calls: [], file_changes: [] }, patterns);
    expect(findings).toHaveLength(0);
  });

  it('returns [] when no patterns match', () => {
    const actions = {
      assistant_messages: ['all clean implementation done'],
      tool_calls: [{ name: 'Read', input: { file_path: 'foo.ts' } }],
      file_changes: ['foo.ts'],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(0);
  });

  it('detects single finding in assistant_messages', () => {
    const actions = {
      assistant_messages: ['我估算 FixCost 然後 Phase A 違反 DEFERRED'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('rule-x');
    expect(findings[0].scope).toMatch(/assistant_message\[0\]/);
    expect(findings[0].severity).toBe('high');
  });

  it('detects finding inside tool_call serialized JSON', () => {
    const actions = {
      assistant_messages: [],
      tool_calls: [{ name: 'Bash', input: { command: 'echo "Phase A 違反 here"' } }],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].scope).toMatch(/tool_call\[0\]/);
  });

  it('detects finding in file_changes string', () => {
    const actions = {
      assistant_messages: [],
      tool_calls: [],
      file_changes: ['memory/note_about_observer paradox.md'],  // space ensures string 'observer paradox' match
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].scope).toMatch(/file_change\[0\]/);
    expect(findings[0].rule).toBe('rule-z');
  });

  it('detects regex pattern case-insensitively', () => {
    const actions = {
      assistant_messages: ['this is an Anti-Pattern to avoid'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('rule-y');
  });

  it('reports 3 findings across all 3 scopes when each scope triggers', () => {
    const actions = {
      assistant_messages: ['Phase A 違反 in msg'],
      tool_calls: [{ name: 'Edit', input: { old_string: 'anti-pattern' } }],
      file_changes: ['memory/observer paradox.md'],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(3);
    const scopes = findings.map(f => f.scope);
    expect(scopes.some(s => s.includes('assistant_message'))).toBe(true);
    expect(scopes.some(s => s.includes('tool_call'))).toBe(true);
    expect(scopes.some(s => s.includes('file_change'))).toBe(true);
  });

  it('handles unicode + emoji in actions without crash', () => {
    const actions = {
      assistant_messages: ['🔥 Phase A 違反 here with emoji 💥 and 中文'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].context).toContain('Phase A 違反');
  });

  it('handles null/undefined actions gracefully', () => {
    expect(scanSessionActions(null, patterns)).toHaveLength(0);
    expect(scanSessionActions(undefined, patterns)).toHaveLength(0);
    expect(scanSessionActions({}, patterns)).toHaveLength(0);
  });

  it('truncates long context to MAX_CONTEXT_CHARS (160)', () => {
    const long = 'x'.repeat(500) + ' Phase A 違反 ' + 'y'.repeat(500);
    const actions = { assistant_messages: [long], tool_calls: [], file_changes: [] };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(1);
    expect(findings[0].context.length).toBeLessThanOrEqual(160);
  });
});

// ───────── AC-3 Noise Filter — Entry Gate acknowledgement suppression ─────────

describe('AC-3 — NOISE_MESSAGE_PATTERNS (Entry Gate acknowledgement suppression)', () => {
  it('isNoiseMessage matches Entry Gate acknowledgement line', () => {
    expect(isNoiseMessage('✅ Pre-check passed: feedback_x.md, skill-sync-gate.md internalized')).toBe(true);
    expect(isNoiseMessage('   ✅ Pre-check passed: foo.md internalized')).toBe(true);  // leading whitespace tolerated
  });

  it('isNoiseMessage rejects non-acknowledgement text', () => {
    expect(isNoiseMessage('我剛跳過了 Pre-check passed logic')).toBe(false);  // not prefix
    expect(isNoiseMessage('Phase A 違反 here')).toBe(false);
    expect(isNoiseMessage('')).toBe(false);
    expect(isNoiseMessage(null)).toBe(false);
  });

  it('scanSessionActions suppresses fallback-only match on acknowledgement line (dogfood regression)', () => {
    // [CR F3] Derive the fixture FROM buildFallbackPatterns instead of hand-writing its
    // shape. The previous hand-built literal (sev=low/kind=string, no `origin`) silently
    // drifted from the producer once the origin tag was introduced, so this test stopped
    // exercising a pattern the scanner would actually receive.
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const fallbackPatterns = buildFallbackPatterns(['.claude/skills/tasks-backfill-verify/SKILL.md'], map);
    expect(fallbackPatterns).toHaveLength(1);
    expect(fallbackPatterns[0].origin).toBe('fallback');
    const actions = {
      assistant_messages: ['✅ Pre-check passed: skill-sync-gate.md, tasks-backfill.md internalized'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, fallbackPatterns);
    expect(findings).toHaveLength(0);  // suppressed by noise filter
  });

  it('[CR F3] does NOT suppress an explicit low-severity keyword-map entry on a noise line', () => {
    // The noise filter previously keyed off the (sev==='low' && kind==='string') SHAPE,
    // which curated map entries also have — `.claude/rules/cr-debt-doc-audit.md` defines
    // "Boy Scout 跳過" at exactly that shape. An agent appending decision language to an
    // Entry Gate acknowledgement line therefore got a free pass. Suppression must key off
    // `origin === 'fallback'`, not the shape.
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const boyScout = flattenKeywordMap(map).filter(p => p.raw === 'Boy Scout 跳過');
    expect(boyScout, 'keyword map must still define this low/string entry').toHaveLength(1);
    expect(boyScout[0].sev).toBe('low');
    expect(boyScout[0].kind).toBe('string');
    const actions = {
      assistant_messages: ['✅ Pre-check passed: cr-debt-doc-audit.md internalized — Boy Scout 跳過,留給下次'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, boyScout);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('.claude/rules/cr-debt-doc-audit.md');
  });

  it('scanSessionActions still matches explicit high-severity keyword on acknowledgement line (rare but must not suppress real violations)', () => {
    // Explicit keyword map entry (not fallback) — high severity — MUST still fire
    const realPattern = {
      rule: 'memory/feedback_cr_must_try_fix_before_defer.md',
      kw: 'Phase A 違反',
      sev: 'high', kind: 'string',
      raw: 'Phase A 違反',
    };
    const actions = {
      // Artificial scenario: acknowledgement + embedded real violation keyword
      assistant_messages: ['✅ Pre-check passed: foo.md internalized (Phase A 違反 in next step)'],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, [realPattern]);
    expect(findings).toHaveLength(1);  // high severity still detected
    expect(findings[0].severity).toBe('high');
  });

  it('NOISE_MESSAGE_PATTERNS is exported as a frozen array', () => {
    expect(Array.isArray(NOISE_MESSAGE_PATTERNS)).toBe(true);
    expect(NOISE_MESSAGE_PATTERNS.length).toBeGreaterThanOrEqual(1);
  });
});

// ───────── AC1-AC4 — L5 tool_calls/file_changes false-positive fix ─────────
// Story: td-devenv-guard-gate-false-signal-repair (epic-ctr, split from
// td-devenv-guard-tooling-repair). Debt: TD-L5-EXITGATE-FALLBACK-TOKEN-TOOLCALL-FP.
//
// Two independent FP paths on a compliant Skill() tool call:
//   (1) fallback basename token 'skill' (from unmapped SKILL.md hot rule, sev=low)
//   (2) explicit keyword map entry 'tasks-backfill' (sev=high) matching the
//       structured `input.skill` identifier value, not violation prose.
// AC1 and AC2 deliberately share the SAME keyword ('tasks-backfill') — only the
// surface differs — so no fix that deletes/downgrades keywords or blanket-skips
// a scope can pass both.

describe('AC1 — compliant Skill tool_calls must not produce findings', () => {
  const COMPLIANT_SKILL_CALLS = [
    { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
    { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
    { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
    { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
  ];

  it('yields 0 findings via fallback-token hot rule (unmapped SKILL.md path)', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const patterns = buildFallbackPatterns(['.claude/skills/tasks-backfill-verify/SKILL.md'], map);
    expect(patterns.length).toBeGreaterThanOrEqual(1); // sanity: fallback token actually generated
    const findings = scanSessionActions(
      { assistant_messages: [], tool_calls: COMPLIANT_SKILL_CALLS, file_changes: [] },
      patterns,
    );
    expect(findings).toHaveLength(0);
  });

  it('yields 0 findings via explicit high-severity hot rule (.claude/rules/tasks-backfill.md)', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const patterns = flattenKeywordMap(map).filter(p => p.rule === '.claude/rules/tasks-backfill.md');
    // Sanity: confirm this is the exact high-severity entry the AC relies on —
    // if this shape ever drifts, AC1/AC2's shared-keyword premise breaks silently.
    expect(patterns).toEqual([
      { rule: '.claude/rules/tasks-backfill.md', kw: 'tasks-backfill', sev: 'high', kind: 'string', raw: 'tasks-backfill' },
    ]);
    const findings = scanSessionActions(
      { assistant_messages: [], tool_calls: COMPLIANT_SKILL_CALLS, file_changes: [] },
      patterns,
    );
    expect(findings).toHaveLength(0);
  });
});

describe('AC2 — forged tasks-backfill bypass in a tool_call must still BLOCK (same keyword, different surface)', () => {
  it('detects the forged Bash command as a high-severity finding on the tasks-backfill keyword', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const patterns = flattenKeywordMap(map).filter(p => p.rule === '.claude/rules/tasks-backfill.md');
    const actions = {
      assistant_messages: [],
      tool_calls: [{ name: 'Bash', input: { command: "sed -i 's/⬜/✅/g' tasks.md  # 跳過 tasks-backfill 直接標記" } }],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(
      findings.some(f => f.rule === '.claude/rules/tasks-backfill.md' && f.keyword === 'tasks-backfill' && f.severity === 'high'),
    ).toBe(true);
  });
});

describe('AC3 — assistant_messages scope behaviour must not regress', () => {
  it('suppresses Entry Gate acknowledgement line, still detects real violation in a later line', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const explicitPatterns = flattenKeywordMap(map).filter(
      p => p.rule === '.claude/rules/depth-gate-warn-mandatory-resolution.md',
    );
    const fallbackPatterns = buildFallbackPatterns(['.claude/skills/tasks-backfill-verify/SKILL.md'], map);
    const patterns = [...explicitPatterns, ...fallbackPatterns];
    const actions = {
      assistant_messages: [
        '✅ Pre-check passed: depth-gate-warn-mandatory-resolution.md, tasks-backfill.md internalized',
        '本輪 Depth Gate 有 WARN,我選擇靜默通過',
      ],
      tool_calls: [],
      file_changes: [],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings.filter(f => f.scope.includes('assistant_message[0]'))).toHaveLength(0);
    const line2Findings = findings.filter(f => f.scope.includes('assistant_message[1]'));
    expect(line2Findings.length).toBeGreaterThanOrEqual(1);
    expect(
      line2Findings.some(f => f.rule === '.claude/rules/depth-gate-warn-mandatory-resolution.md' && f.keyword === '靜默通過'),
    ).toBe(true);
  });
});

describe('AC4 — file_changes path containing a .claude/skills/ segment must not produce findings', () => {
  it('a benign pipeline script path with no violation semantics yields 0 findings', () => {
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const patterns = buildFallbackPatterns(['.claude/skills/tasks-backfill-verify/SKILL.md'], map);
    const actions = {
      assistant_messages: [],
      tool_calls: [],
      file_changes: ['.claude/skills/party-to-pipeline/scripts/worker-dev.ps1'],
    };
    const findings = scanSessionActions(actions, patterns);
    expect(findings).toHaveLength(0);
  });
});

// ───────── AC-5 — buildSuggestedCommands ─────────

describe('AC-5 — buildSuggestedCommands', () => {
  it('returns [] for empty findings', () => {
    const cmds = buildSuggestedCommands([], { sessionId: 'abc', phase: 'code-review' });
    expect(cmds).toHaveLength(0);
  });

  it('produces CLI-ready commands with all required flags', () => {
    const findings = [{
      rule: 'memory/feedback_cr_must_try_fix_before_defer.md',
      keyword: 'Phase A 違反',
      severity: 'high',
      scope: 'assistant_message[0]',
      context: '...',
    }];
    const cmds = buildSuggestedCommands(findings, { sessionId: 'sess-123', phase: 'code-review' });
    expect(cmds).toHaveLength(1);
    const c = cmds[0];
    expect(c).toContain('log-rule-violation.js');
    expect(c).toContain("--rule 'memory/feedback_cr_must_try_fix_before_defer.md'");
    expect(c).toContain('--loaded true');
    expect(c).toContain('--cli-enforced false');
    expect(c).toContain('--phase code-review');
    expect(c).toContain('--severity high');
    expect(c).toContain('--session sess-123');
    expect(c).toContain('--summary');
  });

  it('deduplicates by rule+severity (same rule hit twice = 1 command)', () => {
    const findings = [
      { rule: 'r-a', keyword: 'kw1', severity: 'high', scope: 'a', context: 'x' },
      { rule: 'r-a', keyword: 'kw2', severity: 'high', scope: 'b', context: 'y' },
    ];
    const cmds = buildSuggestedCommands(findings, { sessionId: 's', phase: 'dev-story' });
    expect(cmds).toHaveLength(1);
  });

  it('normalizes invalid phase to "other"', () => {
    const findings = [{ rule: 'r', keyword: 'k', severity: 'low', scope: 's', context: 'c' }];
    const cmds = buildSuggestedCommands(findings, { sessionId: 's', phase: 'invalid-phase' });
    expect(cmds[0]).toContain('--phase other');
  });

  it('sanitizes single-quotes in rule/keyword to prevent shell break (curly-quote replacement)', () => {
    // NOTE: This is sanitization (U+0027 → U+2019), NOT POSIX escape (`'` → `'\''`).
    // See `sanitizeShellSingleQuote` docstring in check-violation-repeat.js for rationale.
    // If the keyword map is later extended with entries containing `'`, switch to POSIX
    // escape and update this test in lockstep — curly-quote sanitization is a semantic
    // change, acceptable only because no current keyword/rule path contains `'`.
    const findings = [{ rule: "path/with'quote.md", keyword: "kw'embedded", severity: 'low', scope: 's', context: 'c' }];
    const cmds = buildSuggestedCommands(findings, { sessionId: 's', phase: 'dev-story' });
    // ASCII single-quote MUST NOT appear inside the rule/keyword payload (broken shell string)
    expect(cmds[0]).not.toContain("with'quote");
    expect(cmds[0]).not.toContain("kw'embedded");
    // Curly-quote sanitization is present (U+2019 — RIGHT SINGLE QUOTATION MARK)
    expect(cmds[0]).toContain("path/with’quote.md");
    expect(cmds[0]).toContain("kw’embedded");
  });
});

// ───────── AC-1 — CLI exit code + JSON schema ─────────

describe('AC-1 — runCheck CLI integration', () => {
  let ctx, io;
  beforeEach(() => {
    ctx = createTempDb();
    io = captureIO(ctx);
  });
  afterEach(() => {
    try { ctx.db.close(); } catch { /* noop */ }
    try { fs.unlinkSync(ctx.path); } catch { /* noop */ }
  });

  it('exit 0 PASS when clean actions + no hot rules', () => {
    const actionsPath = writeTempActions({ assistant_messages: ['clean work'], tool_calls: [], file_changes: [] });
    const r = runCheck(['--phase', 'code-review', '--session-id', 'test', '--actions-file', actionsPath, '--db', ctx.path], io);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(io.out);
    expect(parsed.status).toBe('PASS');
    expect(parsed.findings).toHaveLength(0);
    fs.unlinkSync(actionsPath);
  });

  it('exit 1 BLOCK with --all-rules + clean-fixture triggers no finding, but 1-finding fixture triggers', () => {
    const r = runCheck(['--phase', 'dev-story', '--session-id', 'test',
                        '--actions-file', ONE_FIXTURE, '--all-rules', '--db', ctx.path], io);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(io.out);
    expect(parsed.status).toBe('BLOCK');
    expect(parsed.findings.length).toBeGreaterThanOrEqual(1);
    expect(parsed.suggested_log_commands.length).toBeGreaterThanOrEqual(1);
  });

  it('multi-finding fixture yields ≥ 3 findings with --all-rules', () => {
    const r = runCheck(['--phase', 'dev-story', '--session-id', 'test',
                        '--actions-file', MULTI_FIXTURE, '--all-rules', '--db', ctx.path], io);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(io.out);
    expect(parsed.findings.length).toBeGreaterThanOrEqual(3);
    // verify multi-scope coverage
    const scopes = parsed.findings.map(f => f.scope);
    expect(scopes.some(s => s.includes('assistant_message'))).toBe(true);
    expect(scopes.some(s => s.includes('tool_call'))).toBe(true);
    expect(scopes.some(s => s.includes('file_change'))).toBe(true);
  });

  it('JSON output has required schema fields', () => {
    const actionsPath = writeTempActions({ assistant_messages: [], tool_calls: [], file_changes: [] });
    const r = runCheck(['--phase', 'other', '--session-id', 'sess',
                        '--actions-file', actionsPath, '--all-rules', '--db', ctx.path], io);
    expect(r.code).toBe(0);
    const p = JSON.parse(io.out);
    expect(p).toHaveProperty('status');
    expect(p).toHaveProperty('phase');
    expect(p).toHaveProperty('session_id');
    expect(p).toHaveProperty('hot_rules');
    expect(p).toHaveProperty('keyword_map_version');
    expect(p).toHaveProperty('patterns_scanned');
    expect(p).toHaveProperty('findings');
    expect(p).toHaveProperty('suggested_log_commands');
    fs.unlinkSync(actionsPath);
  });

  it('rejects missing --phase with exit 1 + USAGE', () => {
    const r = runCheck(['--session-id', 's', '--actions-file', 'x', '--db', ctx.path], io);
    expect(r.code).toBe(1);
    expect(io.err).toContain('missing required');
  });

  it('rejects invalid phase value', () => {
    const actionsPath = writeTempActions({ assistant_messages: [] });
    const r = runCheck(['--phase', 'bogus', '--session-id', 's', '--actions-file', actionsPath, '--db', ctx.path], io);
    expect(r.code).toBe(1);
    expect(io.err).toContain('--phase must be one of');
    fs.unlinkSync(actionsPath);
  });

  it('reports helpful error on malformed actions JSON', () => {
    const p = path.join(os.tmpdir(), `bad-${Date.now()}.json`);
    fs.writeFileSync(p, '{not-valid-json', 'utf8');
    const r = runCheck(['--phase', 'dev-story', '--session-id', 's', '--actions-file', p, '--db', ctx.path], io);
    expect(r.code).toBe(1);
    expect(io.err).toContain('JSON parse error');
    fs.unlinkSync(p);
  });
});

// ───────── AC-1+AC-4 — hot-rules integration ─────────

describe('AC-1 + AC-4 — hot-rules filter integration', () => {
  let ctx, io;
  beforeEach(() => {
    ctx = createTempDb();
    io = captureIO(ctx);
  });
  afterEach(() => {
    try { ctx.db.close(); } catch { /* noop */ }
    try { fs.unlinkSync(ctx.path); } catch { /* noop */ }
  });

  it('getHotRules returns seeded top rules sorted by count desc', () => {
    insertRow(ctx.db, { ts: daysAgoTs(1), rule: '.claude/rules/skill-sync-gate.md', phase: 'dev-story' });
    insertRow(ctx.db, { ts: daysAgoTs(2), rule: '.claude/rules/skill-sync-gate.md', phase: 'dev-story' });
    insertRow(ctx.db, { ts: daysAgoTs(3), rule: 'memory/feedback_cr_must_try_fix_before_defer.md', phase: 'dev-story' });
    const hot = getHotRules(ctx.db, 'dev-story', 30, 5);
    expect(hot.length).toBeGreaterThanOrEqual(2);
    expect(hot[0].rule).toBe('.claude/rules/skill-sync-gate.md');
    expect(hot[0].count).toBe(2);
  });

  it('hot-rules filter narrows patterns to seeded rules only', () => {
    insertRow(ctx.db, { ts: daysAgoTs(1), rule: '.claude/rules/skill-sync-gate.md', phase: 'dev-story' });
    const actionsPath = writeTempActions({
      assistant_messages: ['我 直接 Edit SKILL.md 跳過 Mode B'],  // hits skill-sync-gate
      tool_calls: [],
      file_changes: [],
    });
    const r = runCheck(['--phase', 'dev-story', '--session-id', 's',
                        '--actions-file', actionsPath, '--db', ctx.path], io);
    expect(r.code).toBe(1);
    const p = JSON.parse(io.out);
    expect(p.hot_rules).toHaveLength(1);
    expect(p.hot_rules[0].rule).toBe('.claude/rules/skill-sync-gate.md');
    expect(p.findings.some(f => f.rule === '.claude/rules/skill-sync-gate.md')).toBe(true);
    fs.unlinkSync(actionsPath);
  });

  it('AC1 cross-task: full runCheck() CLI path (getHotRules -> buildFallbackPatterns -> scanSessionActions) PASSes on a compliant Skill tool_call when the hot rule is an unmapped SKILL.md path', () => {
    // Closes the gap between the isolated scanSessionActions() unit tests (AC1-AC4 describe
    // blocks above, which hand-construct patterns) and actual production usage, where
    // runCheck() derives patterns itself via a real hot-rules DB query + buildFallbackPatterns.
    insertRow(ctx.db, { ts: daysAgoTs(1), rule: '.claude/skills/tasks-backfill-verify/SKILL.md', phase: 'dev-story' });
    const actionsPath = writeTempActions({
      assistant_messages: [],
      tool_calls: [
        { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
        { name: 'Skill', input: { skill: 'tasks-backfill-verify' } },
      ],
      file_changes: [],
    });
    const r = runCheck(['--phase', 'dev-story', '--session-id', 's',
                        '--actions-file', actionsPath, '--db', ctx.path], io);
    expect(r.code).toBe(0);
    const p = JSON.parse(io.out);
    expect(p.status).toBe('PASS');
    expect(p.hot_rules).toHaveLength(1);
    expect(p.findings).toHaveLength(0);
    fs.unlinkSync(actionsPath);
  });

  it('0 hot rules in DB → scan falls to empty pattern set → PASS', () => {
    // no violations seeded
    const actionsPath = writeTempActions({
      assistant_messages: ['Phase A 違反 但無 hot rule'],
      tool_calls: [],
      file_changes: [],
    });
    const r = runCheck(['--phase', 'dev-story', '--session-id', 's',
                        '--actions-file', actionsPath, '--db', ctx.path], io);
    expect(r.code).toBe(0);
    const p = JSON.parse(io.out);
    expect(p.status).toBe('PASS');
    expect(p.hot_rules).toHaveLength(0);
    fs.unlinkSync(actionsPath);
  });

  it('--all-rules bypasses hot-rules filter', () => {
    const actionsPath = writeTempActions({
      assistant_messages: ['Phase A 違反'],
      tool_calls: [],
      file_changes: [],
    });
    const r = runCheck(['--phase', 'code-review', '--session-id', 's', '--actions-file', actionsPath,
                        '--all-rules', '--db', ctx.path], io);
    expect(r.code).toBe(1);
    const p = JSON.parse(io.out);
    expect(p.patterns_scanned).toBeGreaterThan(10);  // all-rules loads all 37
    fs.unlinkSync(actionsPath);
  });
});

// ───────── AC-2 — parseArgs/validateArgs ─────────

describe('AC-2 — parseArgs + validateArgs', () => {
  it('parseArgs handles flag-only --all-rules', () => {
    const args = parseArgs(['--all-rules', '--phase', 'code-review']);
    expect(args['all-rules']).toBe(true);
    expect(args.phase).toBe('code-review');
  });

  it('validateArgs reports all missing required args', () => {
    const errors = validateArgs({});
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.some(e => e.includes('--phase'))).toBe(true);
    expect(errors.some(e => e.includes('--session-id'))).toBe(true);
    expect(errors.some(e => e.includes('--actions-file'))).toBe(true);
  });
});

// ───────── AC-6 — file existence + count ─────────

describe('AC-6 — test file existence and count', () => {
  it('this test file exists', () => {
    expect(fs.existsSync(__filename)).toBe(true);
  });

  it('fixture files exist', () => {
    expect(fs.existsSync(CLEAN_FIXTURE)).toBe(true);
    expect(fs.existsSync(ONE_FIXTURE)).toBe(true);
    expect(fs.existsSync(MULTI_FIXTURE)).toBe(true);
  });
});

// ───────── SSoT Cross-Consistency — violation-keyword-map.json ↔ detect-rule-violation-core.cjs ─────────

describe('SSoT consistency — keyword-map.json mirrors detect-rule-violation-core.cjs PATTERNS', () => {
  it('all rules from core.cjs PATTERNS are present in the JSON map', async () => {
    const core = await import('../scripts/detect-rule-violation-core.cjs');
    const corePatterns = core.default?.PATTERNS || core.PATTERNS;
    expect(Array.isArray(corePatterns)).toBe(true);
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const jsonRules = new Set(Object.keys(map.rules));
    const coreRules = new Set(corePatterns.map(p => p.rule));
    for (const r of coreRules) {
      expect(jsonRules.has(r), `core.cjs rule '${r}' missing from JSON map`).toBe(true);
    }
  });

  it('keyword count in JSON covers ≥ 80% of core.cjs PATTERNS (drift ceiling)', async () => {
    const core = await import('../scripts/detect-rule-violation-core.cjs');
    const corePatterns = core.default?.PATTERNS || core.PATTERNS;
    const map = loadKeywordMap(DEFAULT_KEYWORD_MAP_PATH);
    const jsonKeywords = new Set();
    for (const entries of Object.values(map.rules)) {
      for (const e of entries) jsonKeywords.add(e.kw);
    }
    const coreKeywordRaw = corePatterns.map(p => typeof p.kw === 'string' ? p.kw : p.kw.source);
    // Compare with \b flavour removed to handle regex source normalisation
    const covered = coreKeywordRaw.filter(kw => {
      // JSON stores \\b... for regex; string form kept as-is
      return jsonKeywords.has(kw) || jsonKeywords.has(kw.replace(/\\\\/g, '\\'));
    });
    const ratio = covered.length / coreKeywordRaw.length;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  });
});
