// ============================================================
// detect-rule-violation-core.js — Pure logic extracted from
// .claude/hooks/detect-rule-violation-hint.js
// ============================================================
// Kept inside .context-db/scripts/ so that vitest v8 coverage
// can instrument the code (coverage provider can't reach files
// outside the vitest cwd without major config surgery).
//
// Story: td-rule-violation-auto-detect-hook (epic-ctr) — L1 Observer
// ============================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ── 常數 ────────────────────────────────────────────────────────────────────

const ENV_FLAG = 'PCPT_RULE_VIOLATION_HINT_ENABLED';
const DEBUG_FLAG = 'PCPT_RULE_VIOLATION_HINT_DEBUG';
const LOOKBACK_MESSAGES = 3;
const MAX_SCAN_CHARS = 8000;
const THROTTLE_FILE_PREFIX = 'pcpt-rvh-throttle-';
const THROTTLE_TTL_MS = 1000 * 60 * 60 * 6;

// Hook runtime constants (Round-5 2026-04-21 moved from wrapper for testability)
const MAX_STDIN_BYTES = 32 * 1024;
const HOOK_TIMEOUT_MS = 2000;  // Internal killer < settings.json timeout (2500) leaves 500ms flush buffer
const STDIN_TIMEOUT_MS = 1000;

const VALID_PHASES = ['create-story', 'dev-story', 'code-review', 'party-mode', 'other'];
const PHASE_PRIORITY = ['code-review', 'dev-story', 'create-story', 'party-mode'];

/**
 * Keyword pattern library (25 patterns)
 * { kw: string|RegExp, sev: 'high'|'medium'|'low', rule: string }
 */
const PATTERNS = Object.freeze([
  // 中文 high severity
  { kw: 'Phase A 違反',          sev: 'high',   rule: 'memory/feedback_cr_must_try_fix_before_defer.md' },
  { kw: 'R2 rescue',             sev: 'high',   rule: 'memory/feedback_cr_must_try_fix_before_defer.md' },
  { kw: 'R3 rescue',             sev: 'high',   rule: 'memory/feedback_cr_must_try_fix_before_defer.md' },
  { kw: '未實際試修',            sev: 'high',   rule: 'memory/feedback_cr_must_try_fix_before_defer.md' },
  { kw: '投機通過',              sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: '跳過 Depth Gate',       sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: 'orphan WARN',           sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: '直接 Edit SKILL.md',    sev: 'high',   rule: '.claude/rules/skill-sync-gate.md' },
  { kw: 'sub-agent 寫 memory',   sev: 'high',   rule: '.claude/rules/subagent-blocked-tools.md' },
  // 中文 medium
  { kw: 'FixCost 估算',          sev: 'medium', rule: 'memory/feedback_cr_must_try_fix_before_defer.md' },
  { kw: '靜默通過',              sev: 'medium', rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: '繞過 SOP',              sev: 'medium', rule: '.claude/rules/skill-sync-gate.md' },
  { kw: '未 Glob 驗證',          sev: 'medium', rule: '.claude/rules/cr-debt-doc-audit.md' },
  // 中文 low
  { kw: 'Boy Scout 跳過',        sev: 'low',    rule: '.claude/rules/cr-debt-doc-audit.md' },
  // 英文 high
  { kw: /\bviolated\b/i,           sev: 'high',   rule: '.claude/rules/constitutional-standard.md' },
  { kw: /\bskipped depth gate\b/i, sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: /\bbypassed gate\b/i,      sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  // 英文 medium
  { kw: /\banti-pattern\b/i,       sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
  { kw: /\bignored warning\b/i,    sev: 'medium', rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: /\bfolklore\b/i,           sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
  { kw: /\bobserver paradox\b/i,   sev: 'medium', rule: '.claude/rules/context-memory.md' },
  { kw: /\battention dilution\b/i, sev: 'medium', rule: '.claude/rules/context-memory.md' },
  { kw: /\bcognitive dissonance\b/i, sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
  // 英文 low
  { kw: /\bstale debt\b/i,         sev: 'low',    rule: '.claude/rules/cr-debt-doc-audit.md' },
  { kw: /\bboy scout skipped\b/i,  sev: 'low',    rule: '.claude/rules/cr-debt-doc-audit.md' },
  // 常見具體違規描述(backtest gap fill — AC-4 recall ≥ 60%)
  { kw: 'tasks-backfill',          sev: 'high',   rule: '.claude/rules/tasks-backfill.md' },
  { kw: '未 accept-warn',          sev: 'high',   rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: '繞過 /saas-to-skill',     sev: 'high',   rule: '.claude/rules/skill-sync-gate.md' },
  { kw: '違反 Language Standard',  sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
  { kw: '.md 鏡像',                sev: 'medium', rule: '.claude/rules/db-first-no-md-mirror.md' },
  { kw: '繞過 SKILL.md',           sev: 'medium', rule: '.claude/rules/skill-sync-gate.md' },
  { kw: '未實證',                  sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
  { kw: 'WARN=BLOCK',              sev: 'medium', rule: '.claude/rules/depth-gate-warn-mandatory-resolution.md' },
  { kw: '跳過 Skill',              sev: 'medium', rule: '.claude/rules/skill-sync-gate.md' },
  { kw: 'Edit 3-engine SKILL',     sev: 'medium', rule: '.claude/rules/skill-sync-gate.md' },
  { kw: 'DB-first 未遵守',         sev: 'medium', rule: '.claude/rules/db-first-no-md-mirror.md' },
  { kw: '1+ 年前 folklore',        sev: 'medium', rule: '.claude/rules/constitutional-standard.md' },
]);

// ── 輔助函數 ─────────────────────────────────────────────────────────────

/**
 * Check env flag; default: disabled
 * @param {Object} env
 * @returns {boolean}
 */
function isEnabled(env) {
  return !!env && env[ENV_FLAG] === 'true';
}

/**
 * Parse stdin JSON safely; return {} on any error
 * @param {string} raw
 * @returns {Object}
 */
function parseStdin(raw) {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Sanitize session id for filesystem
 * @param {string} sessionId
 * @returns {string}
 */
function safeSessionId(sessionId) {
  const raw = String(sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
  return raw.slice(0, 64) || 'default';
}

/**
 * Extract plain text from transcript content array or string
 * @param {*} content
 * @returns {string}
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

/**
 * Read last N assistant messages from a transcript .jsonl file
 * @param {string} transcriptPath
 * @param {number} n
 * @returns {string[]}
 */
function readLastAssistantMessages(transcriptPath, n = LOOKBACK_MESSAGES) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return [];
  let content;
  try {
    if (!fs.existsSync(transcriptPath)) return [];
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return [];
  }
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    const isAssistant = entry.type === 'assistant'
      || (entry.message && entry.message.role === 'assistant');
    if (!isAssistant) continue;
    const msgContent = entry.message && entry.message.content !== undefined
      ? entry.message.content
      : entry.content;
    const text = extractText(msgContent);
    if (text) out.unshift(text);
  }
  return out;
}

/**
 * Normalize pattern keyword to a stable string for throttle hashing
 * @param {string|RegExp} kw
 * @returns {string}
 */
function patternKey(kw) {
  if (typeof kw === 'string') return kw.toLowerCase();
  if (kw instanceof RegExp) return `re:${kw.source.toLowerCase()}`;
  return String(kw);
}

/**
 * Test pattern membership
 * @param {string} text
 * @param {string|RegExp} kw
 * @returns {boolean}
 */
function patternMatches(text, kw) {
  if (!text || !kw) return false;
  if (typeof kw === 'string') return text.indexOf(kw) !== -1;
  if (kw instanceof RegExp) return kw.test(text);
  return false;
}

/**
 * Scan text for all matching patterns (deduplicated)
 * @param {string} text
 * @param {Array} patterns
 * @returns {Array<{kw, sev, rule, key}>}
 */
function detectViolations(text, patterns = PATTERNS) {
  if (!text || typeof text !== 'string') return [];
  const truncated = text.length > MAX_SCAN_CHARS ? text.slice(-MAX_SCAN_CHARS) : text;
  const hits = [];
  const seen = new Set();
  for (const pat of patterns) {
    if (!patternMatches(truncated, pat.kw)) continue;
    const key = patternKey(pat.kw);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ kw: pat.kw, sev: pat.sev, rule: pat.rule, key });
  }
  return hits;
}

/**
 * Infer workflow phase from text
 * @param {string} text
 * @returns {string}
 */
function inferPhase(text) {
  if (!text || typeof text !== 'string') return 'other';
  const lower = text.toLowerCase();
  for (const p of PHASE_PRIORITY) {
    if (lower.indexOf(p) !== -1) return p;
  }
  return 'other';
}

/**
 * Resolve throttle file path for a session
 * @param {string} sessionId
 * @returns {string}
 */
function throttlePath(sessionId) {
  return path.join(os.tmpdir(), `${THROTTLE_FILE_PREFIX}${safeSessionId(sessionId)}.json`);
}

/**
 * Load throttle state, dropping entries older than TTL
 * @param {string} sessionId
 * @param {number} nowMs
 * @returns {Object}
 */
function loadThrottleState(sessionId, nowMs = Date.now()) {
  const p = throttlePath(sessionId);
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const fresh = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && nowMs - v < THROTTLE_TTL_MS) fresh[k] = v;
    }
    return fresh;
  } catch {
    return {};
  }
}

/**
 * Save throttle state (best-effort)
 * @param {string} sessionId
 * @param {Object} state
 */
function saveThrottleState(sessionId, state) {
  const p = throttlePath(sessionId);
  try {
    fs.writeFileSync(p, JSON.stringify(state || {}), 'utf8');
  } catch {
    /* best-effort */
  }
}

/**
 * Pick the highest-severity hit
 * @param {Array} hits
 * @returns {Object|null}
 */
function pickTopHit(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const sevRank = { high: 3, medium: 2, low: 1 };
  let top = hits[0];
  for (const h of hits.slice(1)) {
    if ((sevRank[h.sev] || 0) > (sevRank[top.sev] || 0)) top = h;
  }
  return top;
}

/**
 * Build the systemMessage that prompts agent to run log-rule-violation.js CLI
 * @param {Object} hit
 * @param {string} phase
 * @param {string} summary
 * @returns {string}
 */
function buildSystemMessage(hit, phase, summary) {
  const phaseStr = VALID_PHASES.indexOf(phase) === -1 ? 'other' : phase;
  const kwDisplay = typeof hit.kw === 'string' ? hit.kw : hit.kw.source;
  const cleanSummary = (summary || `keyword '${kwDisplay}' detected in last assistant message`)
    .replace(/\r?\n/g, ' ')
    .replace(/'/g, '’')
    .slice(0, 160);
  const cmd = [
    'node .context-db/scripts/log-rule-violation.js',
    `--rule '${hit.rule}'`,
    '--loaded true',
    '--cli-enforced false',
    `--phase ${phaseStr}`,
    `--severity ${hit.sev}`,
    `--summary '${cleanSummary}'`,
  ].join(' ');
  return (
    `⚠️ 偵測到 rule violation hint(keyword: '${kwDisplay}', severity: ${hit.sev})。` +
    `若實際違規,請執行補登:\n${cmd}`
  );
}

/**
 * Core evaluation (pure) — returns stdout JSON + exit code
 * @param {Object} params
 * @param {Object} params.input - parsed stdin JSON
 * @param {Object} params.env  - environment variables
 * @param {Object} params.deps - overridable deps for testing
 * @returns {{ stdoutJson: string, exitCode: number, debug: Object }}
 */
function evaluate({ input = {}, env = {}, deps = {} } = {}) {
  const debug = { enabled: false, matched: null, throttled: false };

  if (!isEnabled(env)) {
    return { stdoutJson: '', exitCode: 0, debug };
  }
  debug.enabled = true;

  const transcriptPath = input.transcript_path || input.transcriptPath;
  const readerFn = deps.readLastAssistantMessages || readLastAssistantMessages;
  const texts = readerFn(transcriptPath, LOOKBACK_MESSAGES);
  if (!texts || texts.length === 0) {
    return { stdoutJson: '', exitCode: 0, debug };
  }

  const combined = texts.join('\n');
  const hits = detectViolations(combined, deps.patterns || PATTERNS);
  if (hits.length === 0) {
    return { stdoutJson: '', exitCode: 0, debug };
  }

  const sessionId = input.session_id || input.sessionId || 'default';
  const now = deps.now || Date.now();
  const loader = deps.loadThrottleState || loadThrottleState;
  const saver  = deps.saveThrottleState  || saveThrottleState;
  const state  = loader(sessionId, now);

  const unseen = hits.filter(h => !state[h.key]);
  if (unseen.length === 0) {
    debug.throttled = true;
    return { stdoutJson: '', exitCode: 0, debug };
  }

  const top = pickTopHit(unseen);
  const phase = inferPhase(combined);
  const latest = texts[texts.length - 1] || '';
  const summary = latest.replace(/\s+/g, ' ').slice(0, 160);
  const msg = buildSystemMessage(top, phase, summary);

  state[top.key] = now;
  saver(sessionId, state);

  debug.matched = {
    kw: typeof top.kw === 'string' ? top.kw : top.kw.source,
    sev: top.sev,
    phase,
  };

  const payload = { hookSpecificOutput: { systemMessage: msg } };
  return { stdoutJson: JSON.stringify(payload), exitCode: 0, debug };
}

// ── Hook runtime functions (Round-5 2026-04-21 moved from wrapper for vitest coverage) ──

/**
 * Read stdin with timeout + max-bytes guard (dep-injectable for tests)
 * @param {Object} deps - { stdin, setTimeout, clearTimeout, timeoutMs, maxBytes }
 * @returns {Promise<string>}
 */
function readStdinAsync(deps = {}) {
  const stdin = deps.stdin || process.stdin;
  const setTimeoutFn = deps.setTimeout || setTimeout;
  const clearTimeoutFn = deps.clearTimeout || clearTimeout;
  const timeoutMs = deps.timeoutMs !== undefined ? deps.timeoutMs : STDIN_TIMEOUT_MS;
  const maxBytes = deps.maxBytes !== undefined ? deps.maxBytes : MAX_STDIN_BYTES;

  return new Promise(resolve => {
    if (stdin.isTTY) { resolve(''); return; }
    let data = '';
    let bytes = 0;
    const timer = setTimeoutFn(() => {
      try { stdin.removeAllListeners(); } catch { /* ignore */ }
      try { stdin.pause(); } catch { /* ignore */ }
      resolve(data);
    }, timeoutMs);
    try { stdin.setEncoding('utf8'); } catch { /* ignore */ }
    stdin.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes < maxBytes) data += chunk;
    });
    stdin.on('end', () => { clearTimeoutFn(timer); resolve(data); });
    stdin.on('error', () => { clearTimeoutFn(timer); resolve(''); });
  });
}

/**
 * Write JSON payload to fd=1 (bypasses stdout async buffering) and exit
 * @param {string} json - Payload to write; empty string means silent exit
 * @param {Object} deps - { writeSync, exit } for testability
 */
function writeAndExit(json, deps = {}) {
  const writeSync = deps.writeSync || ((fd, str) => require('node:fs').writeSync(fd, str));
  const exit = deps.exit || process.exit;
  if (json) {
    try { writeSync(1, json + '\n'); } catch { /* ignore */ }
  }
  exit(0);
}

/**
 * Run the hook main pipeline (dep-injectable for tests)
 * @param {Object} deps - { readStdin, env, exit, writeStdout, writeStderr, setTimeout, clearTimeout, timeoutMs }
 * @returns {Promise<void>}
 */
async function runMain(deps = {}) {
  const readStdin = deps.readStdin || readStdinAsync;
  const env = deps.env || process.env;
  const exit = deps.exit || process.exit;
  const writeStdout = deps.writeStdout || ((json) => writeAndExit(json, { exit }));
  const writeStderr = deps.writeStderr || ((msg) => { try { require('node:fs').writeSync(2, msg); } catch { /* ignore */ } });
  const setTimeoutFn = deps.setTimeout || setTimeout;
  const clearTimeoutFn = deps.clearTimeout || clearTimeout;
  const timeoutMs = deps.timeoutMs !== undefined ? deps.timeoutMs : HOOK_TIMEOUT_MS;

  const killer = setTimeoutFn(() => exit(0), timeoutMs);
  let payload = '';
  try {
    const raw = await readStdin();
    if (env[DEBUG_FLAG] === 'true') {
      writeStderr(`[rvh] stdin=${raw.length}b env=${env[ENV_FLAG]}\n`);
    }
    const input = parseStdin(raw);
    const { stdoutJson, debug } = evaluate({ input, env });
    if (env[DEBUG_FLAG] === 'true') {
      writeStderr(`[rvh] debug=${JSON.stringify(debug)} json.len=${stdoutJson.length}\n`);
    }
    payload = stdoutJson;
  } catch (e) {
    if (env[DEBUG_FLAG] === 'true') {
      writeStderr(`[rvh] error=${e.message}\n`);
    }
    /* fail-open */
  } finally {
    clearTimeoutFn(killer);
    writeStdout(payload);
  }
}

module.exports = {
  ENV_FLAG,
  DEBUG_FLAG,
  PATTERNS,
  VALID_PHASES,
  LOOKBACK_MESSAGES,
  THROTTLE_TTL_MS,
  MAX_SCAN_CHARS,
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
  pickTopHit,
  buildSystemMessage,
  evaluate,
  readStdinAsync,
  writeAndExit,
  runMain,
};
