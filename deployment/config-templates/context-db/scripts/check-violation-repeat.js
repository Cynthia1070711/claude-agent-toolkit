#!/usr/bin/env node
// ============================================================
// check-violation-repeat.js — L5 Exit-gate Self-audit for
// dev-story / code-review workflow archive
//
// Story: td-rule-violation-workflow-postcheck (epic-ctr)
//
// Purpose: Before a workflow archives a Story (status → review/done),
// scan the session's actions against the 30d hot violation rules.
// If any hot-rule keyword pattern is triggered, BLOCK the archive
// and output log-rule-violation.js commands the agent must run.
//
// Design:
//   - Keyword SSoT at `.context-db/scripts/_ref/violation-keyword-map.json`
//     (37 keywords across 9 rules, mirrors detect-rule-violation-core.cjs).
//   - Hot rules filter: query-violations.js computeStats top 5 for `--phase`.
//   - Actions file JSON schema:
//     { assistant_messages: string[], tool_calls: any[], file_changes: any[] }
//   - Exit code 0 = PASS, 1 = BLOCK.
// ============================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { queryRows, computeStats } from './query-violations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CATEGORY = 'rule_violation';
export const DEFAULT_KEYWORD_MAP_PATH = path.join(__dirname, '_ref', 'violation-keyword-map.json');
export const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'context-memory.db');
export const DEFAULT_SINCE_DAYS = 30;
export const DEFAULT_TOP_N = 5;
export const MAX_CONTEXT_CHARS = 160;
export const VALID_PHASES = new Set(['create-story', 'dev-story', 'code-review', 'party-mode', 'other']);

/**
 * Noise-message patterns — Known deterministic outputs from other workflow steps
 * that can incidentally contain rule basenames without representing a violation.
 *
 * Dogfood test (2026-04-21 td-rule-violation-workflow-postcheck Story §L5 Self-audit)
 * confirmed that the Entry Gate's acknowledgement line (`✅ Pre-check passed: rule1.md,
 * rule2.md, ... internalized`) from `step-00-violation-precheck.md` **always** contains
 * rule basenames, which the fallback basename-token matcher would trigger as a
 * systematic false positive.
 *
 * For messages matching any NOISE pattern, the scanner skips **fallback-only** findings
 * (sev='low', kind='string' — the signature of buildFallbackPatterns output). Explicit
 * keyword map entries at other severities still match, preserving true-violation signal.
 */
export const NOISE_MESSAGE_PATTERNS = [
  /^\s*✅\s*Pre-check passed:/i,
];

const USAGE = `
Usage: node check-violation-repeat.js [options]
  --phase <phase>          (required) workflow phase: create-story|dev-story|code-review|party-mode|other
  --session-id <id>        (required) current session id (for suggested_log_commands)
  --actions-file <path>    (required) JSON file with session actions to scan
  [--keyword-map <path>]   (optional) keyword map JSON path (default: _ref/violation-keyword-map.json)
  [--since-days N]         (optional) hot-rules lookback window, default 30
  [--top-n N]              (optional) hot-rules top N filter, default 5
  [--all-rules]            (optional) bypass hot-rules filter, scan ALL rules in map
  [--db <path>]            (optional) sqlite db path
  [--format json|table]    (optional) output format, default json

Actions file JSON schema:
{
  "assistant_messages": ["raw assistant text 1", "..."],
  "tool_calls":         [{ "name": "Edit", "input": {...} }, ...],
  "file_changes":       ["path/to/file1.ts", "..."]
}

Exit codes:
  0 — PASS (no findings)
  1 — BLOCK (≥ 1 finding — see JSON .findings)

Example:
  node check-violation-repeat.js --phase code-review --session-id abc123 --actions-file /tmp/actions.json
`.trim();

// ── Argument Parsing ────────────────────────────────────────────

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function validateArgs(args) {
  const errors = [];
  for (const k of ['phase', 'session-id', 'actions-file']) {
    if (args[k] === undefined || args[k] === true || String(args[k]).trim() === '') {
      errors.push(`missing required --${k}`);
    }
  }
  if (args.phase && args.phase !== true && !VALID_PHASES.has(String(args.phase).trim())) {
    errors.push(`--phase must be one of: ${[...VALID_PHASES].join('|')}`);
  }
  return errors;
}

// ── Keyword Map Loader ──────────────────────────────────────────

/**
 * Load keyword map JSON + compile regex patterns.
 * @param {string} filePath
 * @returns {{ version:string, rules: Object<string, Array<{kw,sev,kind,flags?}>> }}
 */
export function loadKeywordMap(filePath = DEFAULT_KEYWORD_MAP_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`keyword map not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`keyword map JSON parse error: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.rules || typeof parsed.rules !== 'object') {
    throw new Error(`keyword map schema invalid: expected {version, rules: {...}}`);
  }
  return parsed;
}

/**
 * Flatten rule→keywords map into a pattern array with compiled regex.
 * @param {Object} map - loaded keyword map
 * @returns {Array<{rule:string, kw:string|RegExp, sev:string, kind:string, raw:string}>}
 */
export function flattenKeywordMap(map) {
  const out = [];
  if (!map || !map.rules) return out;
  for (const [rule, entries] of Object.entries(map.rules)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e || typeof e !== 'object' || typeof e.kw !== 'string') continue;
      const sev = e.sev || 'medium';
      const kind = e.kind === 'regex' ? 'regex' : 'string';
      const raw = e.kw;
      let compiled;
      if (kind === 'regex') {
        try {
          compiled = new RegExp(e.kw, e.flags || 'i');
        } catch (err) {
          // skip invalid regex silently — log to stderr for diagnostic
          process.stderr.write(`[check-violation-repeat] skip invalid regex '${e.kw}' (flags=${e.flags}): ${err.message}\n`);
          continue;
        }
      } else {
        compiled = e.kw;
      }
      out.push({ rule, kw: compiled, sev, kind, raw });
    }
  }
  return out;
}

/**
 * Fallback: for rules in hot list but missing from keyword map, generate
 * basename token(s) as low-severity keywords.
 * @param {string[]} hotRulePaths
 * @param {Object} keywordMap
 * @returns {Array<{rule,kw,sev,kind,raw}>}
 */
export function buildFallbackPatterns(hotRulePaths, keywordMap) {
  const out = [];
  const mappedRules = new Set(Object.keys((keywordMap && keywordMap.rules) || {}));
  for (const rulePath of hotRulePaths) {
    if (mappedRules.has(rulePath)) continue;
    const baseName = path.basename(rulePath, path.extname(rulePath));
    // sanitize: tokens must be 3+ chars and alphanumeric
    const token = baseName
      .replace(/^feedback_/, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    if (token.length < 3) continue;
    out.push({ rule: rulePath, kw: token, sev: 'low', kind: 'string', raw: token });
  }
  return out;
}

// ── Hot Rules Query ─────────────────────────────────────────────

/**
 * Compute top-N hot rules for a phase from last N days.
 * @param {Database.Database} db
 * @param {string} phase
 * @param {number} sinceDays
 * @param {number} topN
 * @returns {Array<{rule,count,last_timestamp}>}
 */
export function getHotRules(db, phase, sinceDays = DEFAULT_SINCE_DAYS, topN = DEFAULT_TOP_N) {
  const sinceMs = Date.now() - sinceDays * 86400000 + 8 * 3600000;
  const since60dISO = new Date(sinceMs - 30 * 86400000).toISOString().slice(0, 10);
  const since30dISO = new Date(sinceMs).toISOString().slice(0, 10);
  const rows = queryRows(db, { sinceISO: since60dISO, phase, limit: 10000 });
  const stats = computeStats(rows, { since60dISO, since30dISO });
  return stats.by_rule.slice(0, topN);
}

// ── Session Actions Scanner ─────────────────────────────────────

/**
 * Scan session actions against compiled patterns. Reports ALL matches
 * (not deduplicated by keyword — same keyword in 2 scopes = 2 findings).
 *
 * @param {Object} actions - { assistant_messages, tool_calls, file_changes }
 * @param {Array} patterns - flattened keyword map entries
 * @returns {Array<{rule,keyword,severity,scope,context}>}
 */
export function scanSessionActions(actions, patterns) {
  const findings = [];
  if (!actions || typeof actions !== 'object') return findings;
  if (!Array.isArray(patterns) || patterns.length === 0) return findings;

  const messages = Array.isArray(actions.assistant_messages) ? actions.assistant_messages : [];
  const toolCalls = Array.isArray(actions.tool_calls) ? actions.tool_calls : [];
  const fileChanges = Array.isArray(actions.file_changes) ? actions.file_changes : [];

  for (let i = 0; i < messages.length; i++) {
    const text = String(messages[i] || '');
    if (!text) continue;
    const noise = isNoiseMessage(text);
    for (const p of patterns) {
      // Skip fallback-only (sev=low, kind=string) matches on noise messages to avoid
      // systematic false-positive from Entry Gate acknowledgement lists etc.
      if (noise && p.sev === 'low' && p.kind === 'string') continue;
      if (matchPattern(text, p)) {
        findings.push(buildFinding(p, `assistant_message[${i}]`, text));
      }
    }
  }

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    const serialized = safeStringify(tc);
    if (!serialized) continue;
    for (const p of patterns) {
      if (matchPattern(serialized, p)) {
        findings.push(buildFinding(p, `tool_call[${i}]`, serialized, tc?.name));
      }
    }
  }

  for (let i = 0; i < fileChanges.length; i++) {
    const fc = fileChanges[i];
    const serialized = typeof fc === 'string' ? fc : safeStringify(fc);
    if (!serialized) continue;
    for (const p of patterns) {
      if (matchPattern(serialized, p)) {
        findings.push(buildFinding(p, `file_change[${i}]`, serialized));
      }
    }
  }

  return findings;
}

/**
 * Returns true if the given text matches any NOISE_MESSAGE_PATTERNS entry.
 * Used by scanSessionActions to suppress fallback-only findings from known
 * deterministic outputs that happen to contain rule basenames.
 */
export function isNoiseMessage(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return NOISE_MESSAGE_PATTERNS.some(p => p.test(s));
}

function matchPattern(text, pattern) {
  if (!text || !pattern) return false;
  if (pattern.kind === 'regex') {
    try {
      return pattern.kw.test(text);
    } catch {
      return false;
    }
  }
  // string: case-insensitive substring match
  if (typeof pattern.kw === 'string') {
    return text.toLowerCase().indexOf(pattern.kw.toLowerCase()) !== -1;
  }
  return false;
}

function buildFinding(pattern, scope, text, extra) {
  const clipped = String(text).replace(/\s+/g, ' ').slice(0, MAX_CONTEXT_CHARS);
  return {
    rule: pattern.rule,
    keyword: pattern.raw,
    severity: pattern.sev,
    scope: extra ? `${scope} (${extra})` : scope,
    context: clipped,
  };
}

function safeStringify(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ── Suggested Commands Builder ──────────────────────────────────

/**
 * Build CLI-ready log-rule-violation.js commands for each finding.
 * @param {Array} findings
 * @param {{ sessionId:string, phase:string }} ctx
 * @returns {string[]}
 */
export function buildSuggestedCommands(findings, { sessionId, phase } = {}) {
  if (!Array.isArray(findings) || findings.length === 0) return [];
  const phaseStr = VALID_PHASES.has(phase) ? phase : 'other';
  const sid = sessionId ? String(sessionId).slice(0, 64) : 'unknown';
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    // dedup by rule+severity (same rule reported once even if multiple keywords hit)
    const key = `${f.rule}|${f.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kw = sanitizeShellSingleQuote(f.keyword);
    const cmd = [
      'node .context-db/scripts/log-rule-violation.js',
      `--rule '${sanitizeShellSingleQuote(f.rule)}'`,
      '--loaded true',
      '--cli-enforced false',
      `--phase ${phaseStr}`,
      `--severity ${f.severity}`,
      `--summary 'L5 postcheck caught: keyword ${kw} at ${f.scope} — replace this placeholder with your one-line reflection'`,
      `--session ${sid}`,
    ].join(' ');
    out.push(cmd);
  }
  return out;
}

/**
 * Sanitize ASCII single-quote (U+0027) → Unicode RIGHT SINGLE QUOTATION MARK (U+2019).
 *
 * This is NOT POSIX shell escape (which would be `'\''`). It is a **sanitization**
 * that guarantees the resulting command string contains no unbalanced `'` characters,
 * so copy-paste execution works across shells (bash / pwsh / zsh / fish).
 *
 * Trade-off: A `'` inside the rule/keyword payload is visually preserved as `’`
 * (curly right single-quote), which is a semantic change. Given:
 *   - Current keyword map (2026-04-21) contains NO `'` in any keyword or rule path
 *   - Suggested commands are for agent human-copy workflow (not programmatic piping)
 * this is acceptable.
 *
 * If future keyword map adds rules/keywords containing `'`, switch to POSIX escape
 * (`'` → `'\''`) here and update tests. See also the test case in
 * `check-violation-repeat.test.js` ("escapes single-quotes in rule/keyword to prevent shell break")
 * which LOCKS current behaviour — update both in lockstep.
 */
function sanitizeShellSingleQuote(s) {
  return String(s || '').replace(/'/g, '’');
}

// ── Main Entry ──────────────────────────────────────────────────

export function runCheck(argv, io = {}) {
  const stdout = io.stdout || (s => process.stdout.write(s));
  const stderr = io.stderr || (s => process.stderr.write(s));
  const dbFactory = io.dbFactory || (p => new Database(p, { readonly: true }));

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    stdout(USAGE + '\n');
    return { code: 0 };
  }

  const args = parseArgs(argv);
  const errors = validateArgs(args);
  if (errors.length) {
    stderr('Error: ' + errors.join('; ') + '\n\n' + USAGE + '\n');
    return { code: 1 };
  }

  const phase = String(args.phase).trim();
  const sessionId = String(args['session-id']).trim();
  const actionsFile = path.resolve(String(args['actions-file']));
  const mapPath = args['keyword-map'] && args['keyword-map'] !== true
    ? path.resolve(String(args['keyword-map']))
    : DEFAULT_KEYWORD_MAP_PATH;
  const sinceDays = args['since-days'] && args['since-days'] !== true
    ? parseInt(args['since-days'], 10) || DEFAULT_SINCE_DAYS
    : DEFAULT_SINCE_DAYS;
  const topN = args['top-n'] && args['top-n'] !== true
    ? parseInt(args['top-n'], 10) || DEFAULT_TOP_N
    : DEFAULT_TOP_N;
  const allRules = args['all-rules'] === true;
  const dbPath = args.db && args.db !== true ? path.resolve(String(args.db)) : DEFAULT_DB_PATH;
  const format = args.format && args.format !== true ? String(args.format) : 'json';

  // Load actions
  if (!fs.existsSync(actionsFile)) {
    stderr(`Error: actions-file not found: ${actionsFile}\n`);
    return { code: 1 };
  }
  let actions;
  try {
    actions = JSON.parse(fs.readFileSync(actionsFile, 'utf8'));
  } catch (err) {
    stderr(`Error: actions-file JSON parse error: ${err.message}\n`);
    return { code: 1 };
  }
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    stderr(`Error: actions-file must be an object { assistant_messages, tool_calls, file_changes }\n`);
    return { code: 1 };
  }

  // Load keyword map
  let keywordMap;
  try {
    keywordMap = loadKeywordMap(mapPath);
  } catch (err) {
    stderr(`Error: ${err.message}\n`);
    return { code: 1 };
  }

  // Build patterns
  let patterns = flattenKeywordMap(keywordMap);

  // Apply hot-rules filter (unless --all-rules)
  // FAIL-OPEN: if DB query fails at runtime, emit stderr warning and treat as 0 hot rules
  // (pattern set becomes empty → status:PASS). Telemetry infra unavailability must not block
  // workflow archive. Step-09 §8.5 / Step-06 §7.7 fail-open semantics require this.
  let hotRules = [];
  if (!allRules) {
    if (!fs.existsSync(dbPath)) {
      stderr(`Error: DB not found: ${dbPath}\n`);
      return { code: 1 };
    }
    let db;
    try {
      db = dbFactory(dbPath);
      hotRules = getHotRules(db, phase, sinceDays, topN);
    } catch (err) {
      stderr(`[check-violation-repeat] hot-rules query failed, falling back to empty set: ${err.message}\n`);
      hotRules = [];
    } finally {
      try { db && db.close(); } catch { /* noop */ }
    }
    const hotRulePaths = new Set(hotRules.map(r => r.rule));
    const fallback = buildFallbackPatterns([...hotRulePaths], keywordMap);
    patterns = patterns.filter(p => hotRulePaths.has(p.rule)).concat(fallback);
  }

  // Scan
  const findings = scanSessionActions(actions, patterns);
  const suggested_log_commands = buildSuggestedCommands(findings, { sessionId, phase });
  const status = findings.length === 0 ? 'PASS' : 'BLOCK';
  const result = {
    status,
    phase,
    session_id: sessionId,
    hot_rules: hotRules,
    keyword_map_version: keywordMap.version || 'unknown',
    patterns_scanned: patterns.length,
    findings,
    suggested_log_commands,
  };

  if (format === 'table') {
    stdout(renderTable(result) + '\n');
  } else {
    stdout(JSON.stringify(result, null, 2) + '\n');
  }

  return { code: findings.length === 0 ? 0 : 1, result };
}

function renderTable(result) {
  const lines = [];
  lines.push(`┌─ L5 Exit-gate Self-audit ─────────────────────`);
  lines.push(`│  Status:  ${result.status}`);
  lines.push(`│  Phase:   ${result.phase}`);
  lines.push(`│  Session: ${result.session_id}`);
  lines.push(`│  Map ver: ${result.keyword_map_version}`);
  lines.push(`│  Patterns scanned: ${result.patterns_scanned}`);
  lines.push(`│  Findings: ${result.findings.length}`);
  lines.push(`└───────────────────────────────────────────────`);
  if (result.hot_rules && result.hot_rules.length) {
    lines.push('\nHot rules (30d):');
    for (const r of result.hot_rules) {
      lines.push(`  ${String(r.count).padStart(3)}x  ${r.rule}  (last: ${r.last_timestamp})`);
    }
  }
  if (result.findings.length) {
    lines.push('\nFindings:');
    for (const f of result.findings) {
      lines.push(`  [${f.severity}] ${f.rule} — ${f.keyword} @ ${f.scope}`);
      lines.push(`    ${f.context}`);
    }
    lines.push('\nSuggested log commands:');
    for (const c of result.suggested_log_commands) {
      lines.push(`  ${c}`);
    }
  }
  return lines.join('\n');
}

// ── CLI Entry Point ─────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    const { code } = runCheck(process.argv.slice(2));
    process.exit(code);
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n${err.stack || ''}\n`);
    process.exit(1);
  }
}
