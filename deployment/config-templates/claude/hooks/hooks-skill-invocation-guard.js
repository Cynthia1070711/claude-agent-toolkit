#!/usr/bin/env node
/**
 * hooks-skill-invocation-guard.js — PreToolUse hook (matcher: Edit|Write)
 *
 * v2.0.0 (2026-05-17) — State Persistence 主驗證 + Transcript multi-pattern 備援
 *
 * 對齊 skill-tool-invocation-guard.js v2 同範式修補(方案一 State Persistence)。
 *
 * 修補背景: v1 用字面 narrative pattern `/Skill\(skill="hooks-mechanization"/` 掃描
 * transcript,但 JSONL tool_use 結構為 `{"name":"Skill","input":{"skill":"hooks-mechanization"...}}`
 * — pattern 永不 match。200KB / 5min 雙重缺陷誤擋。
 *
 * 修補:
 *   1. PRIMARY: 讀 `.claude/audit/skill-invocation-state.json` (skill-invocation-state-tracker 寫入)
 *   2. FALLBACK: transcript JSONL 多 pattern (narrative + tool_use 正反序) + 1MB tail + 15min TTL
 *
 * PhyCool hooks-creation-discipline.md SUPREME enforcement (hard-block).
 *
 * Detects Edit/Write tool calls on .claude/hooks/**\/*.js (excluding _test.js).
 *
 * Self-skip (prevent deadlock): if file_path matches this hook's own filename,
 * allow without checking (avoid hook-edits-self deadlock).
 *
 * Behavior: hard-block on miss, fail-open on any error.
 *
 * Bypass: PHYCOOL_HOOKS_BYPASS=1 ENV var (emergency).
 *
 * Registration:
 *   "PreToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/hooks-skill-invocation-guard.js",
 *       "timeout": 3000
 *     }]
 *   }]
 *
 * 2026-05-16 v1.0 deployed for PhyCool env-optimization P0-2.
 * 2026-05-17 v2.0 deployed: state persistence + pattern hardening + window expansion.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STDIN_TIMEOUT_MS = 1500;
const MAX_STDIN_BYTES = 256 * 1024;
const TRANSCRIPT_GREP_TTL_MS = 15 * 60 * 1000;  // 15 min (was 5 min)
const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;      // 1 MB (was 200KB)

const HOOKS_JS_PATTERN = /\.claude[\\/]hooks[\\/][^\\/]+\.js$/;
// 兼容兩種慣例:本 repo 用 `.test.js`(點),原僅寫 `_test.js`(底線)故該豁免自建立起從未命中。
const TEST_FILE_PATTERN = /(?:\.|_)test\.js$/;

// v2 多 pattern(narrative legacy + JSONL tool_use 主用)
const HOOKS_MECH_INVOKE_PATTERNS = [
  /Skill\(skill="hooks-mechanization"/,                                          // narrative (legacy fallback)
  /"name"\s*:\s*"Skill"[\s\S]{0,500}?"skill"\s*:\s*"hooks-mechanization"/,        // JSONL tool_use (primary)
  /"skill"\s*:\s*"hooks-mechanization"[\s\S]{0,500}?"name"\s*:\s*"Skill"/         // JSONL reverse order
];

const STATE_FILE_REL = path.join('.claude', 'audit', 'skill-invocation-state.json');
const SUPPORTED_SKILLS = ['hooks-mechanization'];

const SELF_BASENAME = path.basename(__filename);

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    let bytes = 0;
    const timer = setTimeout(() => {
      try { process.stdin.removeAllListeners(); process.stdin.pause(); } catch {}
      resolve(data);
    }, STDIN_TIMEOUT_MS);
    try { process.stdin.setEncoding('utf8'); } catch {}
    process.stdin.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes < MAX_STDIN_BYTES) data += chunk;
    });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  try { return JSON.parse(trimmed); } catch { return null; }
}

/**
 * v2 PRIMARY 驗證 — 讀 state file
 */
function checkStateFile(projectDir) {
  const stateFile = path.join(projectDir, STATE_FILE_REL);
  try {
    if (!fs.existsSync(stateFile)) return null;
    const raw = fs.readFileSync(stateFile, 'utf8');
    const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const state = JSON.parse(trimmed);
    if (typeof state !== 'object' || state === null) return null;

    let latest = null;
    for (const skill of SUPPORTED_SKILLS) {
      const entry = state[skill];
      if (!entry || typeof entry.invokedAt !== 'number') continue;
      const elapsedMs = Date.now() - entry.invokedAt;
      const ttlMs = (entry.ttl || 900) * 1000;
      if (elapsedMs >= 0 && elapsedMs < ttlMs) {
        if (!latest || entry.invokedAt > latest.invokedAt) {
          latest = { skill, invokedAt: entry.invokedAt, elapsedSec: elapsedMs / 1000 };
        }
      }
    }
    return latest;
  } catch {
    return null;
  }
}

function readTranscriptTail(transcriptPath) {
  try {
    if (!fs.existsSync(transcriptPath)) return '';
    const stat = fs.statSync(transcriptPath);
    if (stat.size === 0) return '';
    const start = Math.max(0, stat.size - TRANSCRIPT_TAIL_BYTES);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function findLastHooksMechTs(transcriptText) {
  if (!transcriptText) return null;
  let lastIdx = -1;
  for (const pattern of HOOKS_MECH_INVOKE_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let m;
    while ((m = re.exec(transcriptText)) !== null) {
      if (m.index > lastIdx) lastIdx = m.index;
    }
  }
  if (lastIdx < 0) return null;
  const lineStart = transcriptText.lastIndexOf('\n', lastIdx) + 1;
  let lineEnd = transcriptText.indexOf('\n', lastIdx);
  if (lineEnd === -1) lineEnd = transcriptText.length;
  const line = transcriptText.slice(lineStart, lineEnd);
  try {
    const obj = JSON.parse(line);
    const ts = obj.timestamp || obj.created_at || obj.time;
    if (ts) return new Date(ts);
  } catch {}
  return new Date();
}

(async () => {
  if (process.env.PHYCOOL_HOOKS_BYPASS === '1') process.exit(0);

  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const data = parseJsonSafe(raw) || {};

  if (data.hook_event_name !== 'PreToolUse') process.exit(0);
  if (!['Edit', 'Write'].includes(data.tool_name)) process.exit(0);

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  if (!HOOKS_JS_PATTERN.test(filePath)) process.exit(0);
  if (TEST_FILE_PATTERN.test(filePath)) process.exit(0);

  // Self-skip
  if (path.basename(filePath) === SELF_BASENAME) process.exit(0);

  // v2 PRIMARY: state file check
  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  const stateCheck = checkStateFile(projectDir);
  if (stateCheck) process.exit(0);

  // v2 FALLBACK: transcript multi-pattern grep
  const transcriptPath = data.transcript_path;
  let lastInvokeTs = null;
  if (transcriptPath) {
    const transcriptText = readTranscriptTail(transcriptPath);
    lastInvokeTs = findLastHooksMechTs(transcriptText);
  }
  const now = Date.now();
  const isRecent = lastInvokeTs && (now - lastInvokeTs.getTime()) < TRANSCRIPT_GREP_TTL_MS;

  if (!isRecent) {
    process.stderr.write(
      '\n[hooks-skill-invocation-guard v2] BLOCK: Edit/Write .claude/hooks/*.js requires Skill(hooks-mechanization)\n\n' +
      'File: ' + filePath + '\n' +
      'State file (PRIMARY): MISS (' + STATE_FILE_REL + ' missing or expired)\n' +
      'Transcript grep (FALLBACK): ' +
      (lastInvokeTs ? lastInvokeTs.toISOString() : 'NONE in last 1MB transcript (multi-pattern)') + '\n' +
      'TTL window: ' + (TRANSCRIPT_GREP_TTL_MS / 1000) + 's\n\n' +
      'Required per .claude/rules/hooks-creation-discipline.md SUPREME:\n' +
      '  Skill(skill="hooks-mechanization")\n\n' +
      'Reason: hooks-mechanization SKILL provides 7-step playbook + 21 event taxonomy +\n' +
      '  4 handler types + Windows 11 + PS 5.1 anti-patterns. Building hooks without\n' +
      '  consulting risks em-dash encoding / missing fail-open / unhandled BOM / etc.\n\n' +
      'Emergency bypass: PHYCOOL_HOOKS_BYPASS=1\n'
    );
    process.exit(2);
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write('[hooks-skill-invocation-guard v2] hook error: ' + err.message + '\n');
  process.exit(0);
});
