// detect-rule-violation-hint.test.js — td-rule-violation-auto-detect-hook Task 6
// AC-6: ≥10 tests + ≥80% line coverage on .claude/hooks/detect-rule-violation-hint.js
//
// Covers:
//   - ENV flag gating (AC-2)
//   - Keyword detection, 中英 patterns (AC-1)
//   - readLastAssistantMessages transcript parsing
//   - Throttle state save/load/expiry (AC-3)
//   - buildSystemMessage format validity (AC-1 output)
//   - evaluate() end-to-end integration

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import core from '../scripts/detect-rule-violation-core.cjs';
const {
  ENV_FLAG,
  DEBUG_FLAG,
  PATTERNS,
  VALID_PHASES,
  LOOKBACK_MESSAGES,
  THROTTLE_TTL_MS,
  MAX_STDIN_BYTES,
  HOOK_TIMEOUT_MS,
  STDIN_TIMEOUT_MS,
  isEnabled,
  parseStdin,
  safeSessionId,
  extractText,
  readLastAssistantMessages,
  patternKey,
  patternMatches,
  detectViolations,
  inferPhase,
  throttlePath,
  loadThrottleState,
  saveThrottleState,
  buildSystemMessage,
  pickTopHit,
  evaluate,
  readStdinAsync,
  writeAndExit,
  runMain,
} = core;

// ── Helper: mock stdin EventEmitter for readStdinAsync tests ──
function mockStdin({ chunks = [], error = false, endAfterChunks = true, isTTY = false } = {}) {
  const ee = new EventEmitter();
  ee.isTTY = isTTY;
  ee.setEncoding = () => {};
  ee.removeAllListeners = () => {};
  ee.pause = () => {};
  setImmediate(() => {
    for (const c of chunks) ee.emit('data', c);
    if (error) ee.emit('error', new Error('mock'));
    if (endAfterChunks && !error) ee.emit('end');
  });
  return ee;
}

// ── shared tmp helpers ──

const tmpFiles = [];

function tempFile(ext = '.jsonl', content = '') {
  const p = path.join(os.tmpdir(), `rvh-test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

// ── ENV flag ──

describe('isEnabled', () => {
  it('returns false when env unset', () => {
    expect(isEnabled({})).toBe(false);
  });
  it('returns false when env=false (default disabled)', () => {
    expect(isEnabled({ [ENV_FLAG]: 'false' })).toBe(false);
  });
  it('returns true only when env=true literal', () => {
    expect(isEnabled({ [ENV_FLAG]: 'true' })).toBe(true);
    expect(isEnabled({ [ENV_FLAG]: '1' })).toBe(false);
    expect(isEnabled({ [ENV_FLAG]: 'TRUE' })).toBe(false);
  });
});

// ── parseStdin ──

describe('parseStdin', () => {
  it('returns {} on empty input', () => {
    expect(parseStdin('')).toEqual({});
    expect(parseStdin(null)).toEqual({});
    expect(parseStdin(undefined)).toEqual({});
  });
  it('returns {} on malformed JSON', () => {
    expect(parseStdin('{ not json')).toEqual({});
    expect(parseStdin('null')).toEqual({});
    expect(parseStdin('"string"')).toEqual({});
  });
  it('parses well-formed Stop event payload', () => {
    const input = { session_id: 'abc', transcript_path: '/t.jsonl', hook_event_name: 'Stop' };
    expect(parseStdin(JSON.stringify(input))).toEqual(input);
  });
});

// ── safeSessionId ──

describe('safeSessionId', () => {
  it('strips non-alphanumeric chars', () => {
    expect(safeSessionId('abc/\\123:?')).toBe('abc123');
  });
  it('falls back to "default" when empty', () => {
    expect(safeSessionId('')).toBe('default');
    expect(safeSessionId(null)).toBe('default');
  });
});

// ── extractText ──

describe('extractText', () => {
  it('extracts from string directly', () => {
    expect(extractText('plain')).toBe('plain');
  });
  it('joins multiple text blocks', () => {
    const blocks = [
      { type: 'text', text: 'line1' },
      { type: 'tool_use', name: 'Read' },
      { type: 'text', text: 'line2' },
    ];
    expect(extractText(blocks)).toBe('line1\nline2');
  });
  it('returns empty for unknown shapes', () => {
    expect(extractText(null)).toBe('');
    expect(extractText(42)).toBe('');
  });
});

// ── detectViolations ──

describe('detectViolations', () => {
  it('matches Chinese high-severity phrase: Phase A 違反', () => {
    const hits = detectViolations('剛才 Phase A 違反 cr rule');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sev).toBe('high');
    expect(hits[0].rule).toMatch(/feedback_cr_must_try_fix_before_defer/);
  });
  it('matches R2 rescue / R3 rescue as high', () => {
    expect(detectViolations('R2 rescue 修正後').length).toBeGreaterThan(0);
    expect(detectViolations('完成 R3 rescue 補救').length).toBeGreaterThan(0);
  });
  it('matches English violated (word boundary)', () => {
    const hits = detectViolations('I violated the constraint');
    expect(hits.some(h => h.sev === 'high')).toBe(true);
  });
  it('matches folklore as medium', () => {
    const hits = detectViolations('pure folklore reference here');
    expect(hits.some(h => h.sev === 'medium')).toBe(true);
  });
  it('returns empty for innocent text', () => {
    expect(detectViolations('完成正常的任務 report 沒有問題')).toEqual([]);
  });
  it('dedupes multiple occurrences of same keyword', () => {
    const hits = detectViolations('folklore folklore folklore');
    expect(hits.length).toBe(1);
  });
  it('handles non-string input gracefully', () => {
    expect(detectViolations(null)).toEqual([]);
    expect(detectViolations(42)).toEqual([]);
  });
  it('has at least 25 patterns (design target)', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(25);
  });
  it('truncates scan text to last MAX_SCAN_CHARS (8000) — late keyword wins', () => {
    const padding = 'x'.repeat(9500);
    const late = padding + ' Phase A 違反 incident description tail';
    const hits = detectViolations(late);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sev).toBe('high');
  });
  it('drops early keyword beyond MAX_SCAN_CHARS window (text.slice(-8000))', () => {
    const early = 'Phase A 違反 early content ' + 'x'.repeat(9000);
    const hits = detectViolations(early);
    // keyword in first chars but text >> 8000 → truncated tail has no keyword → empty hits
    expect(hits).toEqual([]);
  });
  it('all patterns have required fields', () => {
    for (const p of PATTERNS) {
      expect(p.kw).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(p.sev);
      expect(typeof p.rule).toBe('string');
      expect(p.rule.length).toBeGreaterThan(0);
    }
  });
});

// ── inferPhase ──

describe('inferPhase', () => {
  it('prefers code-review over dev-story when both present', () => {
    expect(inferPhase('dev-story step then code-review findings')).toBe('code-review');
  });
  it('falls back to other when no phase mentioned', () => {
    expect(inferPhase('nothing special here')).toBe('other');
  });
  it('handles non-string safely', () => {
    expect(inferPhase(null)).toBe('other');
  });
});

// ── readLastAssistantMessages ──

describe('readLastAssistantMessages', () => {
  it('returns [] for nonexistent path', () => {
    expect(readLastAssistantMessages('/no/such/path.jsonl')).toEqual([]);
  });
  it('returns [] for empty input', () => {
    expect(readLastAssistantMessages('')).toEqual([]);
    expect(readLastAssistantMessages(null)).toEqual([]);
  });
  it('extracts last N assistant messages (type=assistant with message.content blocks)', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'first' }] } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'second' }] } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'third' }] } }),
    ];
    const p = tempFile('.jsonl', lines.join('\n'));
    const res = readLastAssistantMessages(p, 2);
    expect(res).toEqual(['second', 'third']);
  });
  it('skips malformed JSON lines and returns valid entries', () => {
    const lines = [
      'not json',
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
      '{ broken',
    ];
    const p = tempFile('.jsonl', lines.join('\n'));
    expect(readLastAssistantMessages(p, LOOKBACK_MESSAGES)).toEqual(['ok']);
  });
});

// ── throttle ──

describe('throttle state', () => {
  it('loadThrottleState returns {} when file missing', () => {
    const state = loadThrottleState('nonexistent-session-id');
    expect(state).toEqual({});
  });
  it('save then load round-trips keys', () => {
    const sid = `sess-${Date.now()}`;
    saveThrottleState(sid, { 'key-a': Date.now() });
    const state = loadThrottleState(sid);
    expect(state['key-a']).toBeTypeOf('number');
    tmpFiles.push(throttlePath(sid));
  });
  it('drops entries older than TTL', () => {
    const sid = `sess-expired-${Date.now()}`;
    const longAgo = Date.now() - (THROTTLE_TTL_MS + 1000);
    saveThrottleState(sid, { 'key-old': longAgo, 'key-new': Date.now() });
    const state = loadThrottleState(sid);
    expect(state['key-old']).toBeUndefined();
    expect(state['key-new']).toBeTypeOf('number');
    tmpFiles.push(throttlePath(sid));
  });
  it('returns {} on corrupt JSON file', () => {
    const sid = `sess-corrupt-${Date.now()}`;
    fs.writeFileSync(throttlePath(sid), '{ corrupt', 'utf8');
    tmpFiles.push(throttlePath(sid));
    expect(loadThrottleState(sid)).toEqual({});
  });
});

// ── buildSystemMessage ──

describe('buildSystemMessage', () => {
  it('contains log-rule-violation CLI with required flags', () => {
    const hit = { kw: 'Phase A 違反', sev: 'high', rule: 'memory/feedback_cr_must_try_fix_before_defer.md' };
    const msg = buildSystemMessage(hit, 'code-review', 'CR Phase A 偏差');
    expect(msg).toContain('node .context-db/scripts/log-rule-violation.js');
    expect(msg).toContain("--rule 'memory/feedback_cr_must_try_fix_before_defer.md'");
    expect(msg).toContain('--loaded true');
    expect(msg).toContain('--cli-enforced false');
    expect(msg).toContain('--phase code-review');
    expect(msg).toContain('--severity high');
    expect(msg).toContain('--summary');
  });
  it('coerces invalid phase to "other"', () => {
    const hit = { kw: /\bviolated\b/i, sev: 'high', rule: '.claude/rules/constitutional-standard.md' };
    const msg = buildSystemMessage(hit, 'made-up-phase', 'x');
    expect(msg).toContain('--phase other');
  });
  it('escapes single quote and clamps summary length', () => {
    const long = "'".repeat(10) + 'x'.repeat(500);
    const msg = buildSystemMessage({ kw: 'folklore', sev: 'medium', rule: 'r.md' }, 'dev-story', long);
    expect(msg.includes("'x")).toBe(false);
    // final --summary 'xxx...' should be ≤ ~200 chars; ensure not a full 500 char dump
    const m = msg.match(/--summary '([^']*)'/);
    expect(m).toBeTruthy();
    expect(m[1].length).toBeLessThanOrEqual(160);
  });
});

// ── pickTopHit ──

describe('pickTopHit', () => {
  it('returns null for empty hits', () => {
    expect(pickTopHit([])).toBeNull();
  });
  it('prefers high severity over medium', () => {
    const hits = [
      { kw: 'a', sev: 'low', rule: 'r' },
      { kw: 'b', sev: 'high', rule: 'r' },
      { kw: 'c', sev: 'medium', rule: 'r' },
    ];
    expect(pickTopHit(hits).sev).toBe('high');
  });
});

// ── evaluate (end-to-end) ──

describe('evaluate', () => {
  const makeTranscript = (texts) => {
    const lines = texts.map(t =>
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } })
    );
    return tempFile('.jsonl', lines.join('\n'));
  };

  it('returns empty stdout when env flag disabled', () => {
    const p = makeTranscript(['I violated the constraint']);
    const res = evaluate({ input: { transcript_path: p, session_id: 's-off' }, env: {} });
    expect(res.stdoutJson).toBe('');
    expect(res.exitCode).toBe(0);
  });
  it('returns empty stdout when env=true but no transcript', () => {
    const res = evaluate({ input: { session_id: 's-empty' }, env: { [ENV_FLAG]: 'true' } });
    expect(res.stdoutJson).toBe('');
  });
  it('emits systemMessage on keyword hit when enabled', () => {
    const p = makeTranscript(['code-review 完成,Phase A 違反 但仍標 FIXED']);
    const res = evaluate({
      input: { transcript_path: p, session_id: 's-hit-' + Date.now() },
      env: { [ENV_FLAG]: 'true' },
    });
    expect(res.stdoutJson).not.toBe('');
    const payload = JSON.parse(res.stdoutJson);
    // [bwu-12] Stop hook emits top-level systemMessage by design (detect-rule-violation-core.cjs:384-386,
    // TD-2 fix 2026-05-11 — Anthropic CLI requires hookEventName for hookSpecificOutput, avoided for Stop
    // hook). bwu-5 CR C1's nested additionalContext requirement applies to UserPromptSubmit, not this hook.
    expect(payload.systemMessage).toContain('log-rule-violation.js');
    expect(payload.systemMessage).toContain('--phase code-review');
    expect(payload.systemMessage).toContain('--severity high');
    tmpFiles.push(throttlePath('s-hit-' + Date.now()));
  });
  it('throttles same keyword within session (2nd call yields empty)', () => {
    const sid = 's-throttle-' + Date.now();
    const p1 = makeTranscript(['R2 rescue 初次']);
    const first = evaluate({ input: { transcript_path: p1, session_id: sid }, env: { [ENV_FLAG]: 'true' } });
    expect(first.stdoutJson).not.toBe('');
    const p2 = makeTranscript(['R2 rescue 第二次']);
    const second = evaluate({ input: { transcript_path: p2, session_id: sid }, env: { [ENV_FLAG]: 'true' } });
    expect(second.stdoutJson).toBe('');
    tmpFiles.push(throttlePath(sid));
  });
  it('does NOT throttle different keyword within same session', () => {
    const sid = 's-varied-' + Date.now();
    const p1 = makeTranscript(['I violated the rule']);
    const p2 = makeTranscript(['pure folklore']);
    const r1 = evaluate({ input: { transcript_path: p1, session_id: sid }, env: { [ENV_FLAG]: 'true' } });
    const r2 = evaluate({ input: { transcript_path: p2, session_id: sid }, env: { [ENV_FLAG]: 'true' } });
    expect(r1.stdoutJson).not.toBe('');
    expect(r2.stdoutJson).not.toBe('');
    tmpFiles.push(throttlePath(sid));
  });
  it('is silent when last messages contain no violation keywords', () => {
    const p = makeTranscript(['完成 Story 並通過 CR', '三引擎 md5 identical 同步完成']);
    const res = evaluate({
      input: { transcript_path: p, session_id: 's-clean-' + Date.now() },
      env: { [ENV_FLAG]: 'true' },
    });
    expect(res.stdoutJson).toBe('');
  });
});

// ── Hook runtime layer (Round-5 2026-04-21) ──

describe('hook constants exposed from core', () => {
  it('exposes MAX_STDIN_BYTES = 32KB', () => {
    expect(MAX_STDIN_BYTES).toBe(32 * 1024);
  });
  it('exposes HOOK_TIMEOUT_MS < settings.json timeout (2500)', () => {
    expect(HOOK_TIMEOUT_MS).toBe(2000);
    expect(HOOK_TIMEOUT_MS).toBeLessThan(2500);
  });
  it('exposes STDIN_TIMEOUT_MS = 1000', () => {
    expect(STDIN_TIMEOUT_MS).toBe(1000);
  });
  it('DEBUG_FLAG matches env var name', () => {
    expect(DEBUG_FLAG).toBe('PHYCOOL_RULE_VIOLATION_HINT_DEBUG');
  });
});

describe('readStdinAsync', () => {
  it('returns empty when stdin.isTTY is true (no piped input)', async () => {
    const stdin = mockStdin({ isTTY: true });
    const res = await readStdinAsync({ stdin });
    expect(res).toBe('');
  });
  it('concatenates multiple data chunks until end', async () => {
    const stdin = mockStdin({ chunks: ['{"a":', '1}'] });
    const res = await readStdinAsync({ stdin });
    expect(res).toBe('{"a":1}');
  });
  it('resolves empty on stdin error', async () => {
    const stdin = mockStdin({ error: true, chunks: [] });
    const res = await readStdinAsync({ stdin });
    expect(res).toBe('');
  });
  it('resolves data so-far when stdin timeout fires before end', async () => {
    const ee = new EventEmitter();
    ee.isTTY = false;
    ee.setEncoding = () => {};
    ee.removeAllListeners = () => {};
    ee.pause = () => {};
    setImmediate(() => {
      ee.emit('data', 'partial');
      // NOTE: no end, no error → timer fires
    });
    const res = await readStdinAsync({ stdin: ee, timeoutMs: 30 });
    expect(res).toBe('partial');
  });
  it('caps data at maxBytes boundary (extra chunks dropped)', async () => {
    const stdin = mockStdin({ chunks: ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(10)] });
    const res = await readStdinAsync({ stdin, maxBytes: 15 });
    // first chunk accepted, second chunk (10 bytes) would push to 20 > 15 so dropped
    expect(res.length).toBeLessThanOrEqual(10);
  });
});

describe('writeAndExit', () => {
  it('calls writeSync on fd=1 when json non-empty then exit(0)', () => {
    const calls = { write: [], exit: [] };
    writeAndExit('{"x":1}', {
      writeSync: (fd, str) => calls.write.push({ fd, str }),
      exit: (code) => calls.exit.push(code),
    });
    expect(calls.write).toEqual([{ fd: 1, str: '{"x":1}\n' }]);
    expect(calls.exit).toEqual([0]);
  });
  it('skips writeSync when json empty, still exits 0', () => {
    const calls = { write: [], exit: [] };
    writeAndExit('', {
      writeSync: (fd, str) => calls.write.push({ fd, str }),
      exit: (code) => calls.exit.push(code),
    });
    expect(calls.write).toEqual([]);
    expect(calls.exit).toEqual([0]);
  });
  it('swallows writeSync errors silently (fail-open)', () => {
    const calls = { exit: [] };
    writeAndExit('{"x":1}', {
      writeSync: () => { throw new Error('EPIPE'); },
      exit: (code) => calls.exit.push(code),
    });
    expect(calls.exit).toEqual([0]);
  });
});

describe('runMain (hook pipeline end-to-end via deps)', () => {
  it('silent path: env disabled → writeStdout called with empty payload', async () => {
    const calls = { stdout: [], stderr: [], exit: [] };
    await runMain({
      readStdin: async () => '{"session_id":"x","transcript_path":"/nope"}',
      env: {},
      exit: (c) => calls.exit.push(c),
      writeStdout: (p) => calls.stdout.push(p),
      writeStderr: (m) => calls.stderr.push(m),
      timeoutMs: 200,
    });
    expect(calls.stdout).toEqual(['']);
  });
  it('debug stderr fires when DEBUG_FLAG=true (silent evaluate path)', async () => {
    const calls = { stdout: [], stderr: [] };
    await runMain({
      readStdin: async () => '{"session_id":"x"}',
      env: { [DEBUG_FLAG]: 'true' },
      exit: () => {},
      writeStdout: (p) => calls.stdout.push(p),
      writeStderr: (m) => calls.stderr.push(m),
      timeoutMs: 200,
    });
    expect(calls.stderr.some(m => m.includes('[rvh] stdin='))).toBe(true);
    expect(calls.stderr.some(m => m.includes('[rvh] debug='))).toBe(true);
  });
  it('fail-open: readStdin throws → payload empty + writeStdout still called', async () => {
    const calls = { stdout: [], stderr: [] };
    await runMain({
      readStdin: async () => { throw new Error('stdin broke'); },
      env: { [DEBUG_FLAG]: 'true' },
      exit: () => {},
      writeStdout: (p) => calls.stdout.push(p),
      writeStderr: (m) => calls.stderr.push(m),
      timeoutMs: 200,
    });
    expect(calls.stdout).toEqual(['']);
    expect(calls.stderr.some(m => m.includes('[rvh] error=stdin broke'))).toBe(true);
  });
  it('hit path: env enabled + transcript with keyword → emits systemMessage JSON', async () => {
    const lines = [
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'code-review 完成,Phase A 違反 but still FIXED' }] } }),
    ];
    const p = path.join(os.tmpdir(), `runmain-hit-${Date.now()}.jsonl`);
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
    const calls = { stdout: [] };
    try {
      await runMain({
        readStdin: async () => JSON.stringify({ session_id: 's-runmain-' + Date.now(), transcript_path: p }),
        env: { [ENV_FLAG]: 'true' },
        exit: () => {},
        writeStdout: (payload) => calls.stdout.push(payload),
        writeStderr: () => {},
        timeoutMs: 300,
      });
      expect(calls.stdout.length).toBe(1);
      // [bwu-12] top-level systemMessage shape (see evaluate() test above for full rationale).
      // [bwu-12 CR F5] Parse and assert the SHAPE, not a substring. A raw
      // `toContain('systemMessage')` also holds for the nested `{hookSpecificOutput:{systemMessage}}`
      // form this assertion exists to rule out — it is strictly weaker than the
      // `toContain('hookSpecificOutput')` it replaced and could not fail on a regression.
      const runMainPayload = JSON.parse(calls.stdout[0]);
      expect(runMainPayload.systemMessage).toContain('log-rule-violation.js');
      expect(runMainPayload.hookSpecificOutput).toBeUndefined();
    } finally {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });
  it('clears killer timer in finally (normal completion)', async () => {
    let cleared = false;
    await runMain({
      readStdin: async () => '',
      env: {},
      exit: () => {},
      writeStdout: () => {},
      writeStderr: () => {},
      setTimeout: (fn) => ({ _fake: true }),
      clearTimeout: (t) => { if (t && t._fake) cleared = true; },
      timeoutMs: 500,
    });
    expect(cleared).toBe(true);
  });
});
