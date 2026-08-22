#!/usr/bin/env node
/**
 * skill-invocation-state-tracker.js — PostToolUse hook (matcher: Skill)
 *
 * State Persistence writer — 寫端
 *
 * 設計目的: 解決 skill-tool-invocation-guard / hooks-skill-invocation-guard 的
 * False-Negative BLOCK 根因 — 既有 hook 用 transcript JSONL 200KB sliding window
 * + 字面 narrative pattern 掃描 marker,當大量 Read/Edit/system reminder 注入時
 * marker 被推出窗口 → 誤擋合法操作。
 *
 * 方案一(根治): 用 PostToolUse hook 偵測 Skill tool 調用,寫 state file
 * `.claude/audit/skill-invocation-state.json`。Guard hooks 讀此檔取代 transcript grep。
 * 授權狀態完全脫離 volatile transcript window 影響。
 *
 * 觸發背景: 2026-05-17 Editor Conformance Audit qrcode 模組討論期間,使用者多次
 * 觸發 false BLOCK 後第一性原理分析 + 方案一(State Persistence)指引建立。
 * 對齊 Skill(skill="hooks-mechanization") 7-step playbook + crlf-normalize-discipline。
 *
 * State file structure:
 *   {
 *     "saas-to-skill":       { "invokedAt": <ms epoch>, "ttl": 900, "pid": <pid>, "sessionId": "..." },
 *     "skill-builder":       { ... },
 *     "hooks-mechanization": { ... }
 *   }
 *
 * Registration (settings.json):
 *   "PostToolUse": [{
 *     "matcher": "Skill",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/skill-invocation-state-tracker.js",
 *       "timeout": 2000
 *     }]
 *   }]
 *
 * Behavior: fail-open on any error (advisory tracker, 不應阻擋工作流).
 *
 * 2026-05-17 deployed for PhyCool false-negative root-cause fix.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STDIN_TIMEOUT_MS = 1500;
const MAX_STDIN_BYTES = 256 * 1024;
const TTL_SEC = 900; // 15 min — 對齊 guard hooks TTL
const TRACKED_SKILLS = new Set(['saas-to-skill', 'skill-builder', 'hooks-mechanization']);

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

// ── ecc-07 skill_invocation permanent evidence (dual-layer) ──────────────────────
// ephemeral state (.claude/audit/) = enforcement (guard hook 讀)
// permanent evidence (.context-db/ecc-state/) = ADR-ECC-LEARNING-001 §D4 evaluation gate
// 對齊 IInstinctDispatcher contract schema (skill-invocation-state.json) + constitutional §Timestamp UTC+8

// UTC+8 timestamp (對齊 constitutional-standard §Timestamp Mandate · 禁 new Date().toISOString() UTC)
function nowTaiwanTs() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '') + '+08:00';
}

// atomic write (tempfile + rename · 對齊 mcp-payload-discipline §3 + BR-ECC-07-04) · No-BOM
function atomicWriteJson(filePath, obj) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ecc-07 BR-ECC-07-01/03/04: permanent evidence dual-write at skill_invocation observation
// isSubagent → skip (BR-ECC-07-03 · 對齊 subagent-blocked-tools N3: subagent 不寫 state/memory)
// Bootstrap Exemption (BR-ECC-07-02) 由既有 skill-tool-invocation-guard.js checkBootstrapExempt 涵蓋
function writePermanentEvidence(projectDir, skill, sessionId, isSubagent) {
  if (isSubagent) return; // BR-ECC-07-03 subagent ban
  const permFile = path.join(projectDir, '.context-db', 'ecc-state', 'skill-invocation-state.json');
  if (!fs.existsSync(permFile)) return; // init-ecc-state.cjs 預建 · 不存在則 fail-open skip
  let state;
  try {
    const raw = fs.readFileSync(permFile, 'utf8');
    state = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    if (typeof state !== 'object' || state === null) return;
  } catch { return; }
  const ts = nowTaiwanTs();
  state.last_dispatch = ts;
  state.dispatch_count = (state.dispatch_count || 0) + 1;
  state.success_count = (state.success_count || 0) + 1; // PostToolUse Skill = 調用成功觀測
  const entry = {
    timestamp: ts,
    status: 'success',
    action_taken: `skill_invocation observed: Skill(${skill}) invoked` + (sessionId ? ` · session=${sessionId}` : ''),
  };
  state.history = [].concat(Array.isArray(state.history) ? state.history : (state.history ? [state.history] : []), [entry]).slice(-50);
  try { atomicWriteJson(permFile, state); } catch (e) {
    process.stderr.write('[skill-invocation-state-tracker] permanent evidence write failed: ' + e.message + '\n');
  }
}

(async () => {
  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const data = parseJsonSafe(raw) || {};

  if (data.hook_event_name !== 'PostToolUse') process.exit(0);
  if (data.tool_name !== 'Skill') process.exit(0);

  const skill = data.tool_input?.skill;
  if (!skill || !TRACKED_SKILLS.has(skill)) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  const stateDir = path.join(projectDir, '.claude', 'audit');
  const stateFile = path.join(stateDir, 'skill-invocation-state.json');

  try {
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    let state = {};
    if (fs.existsSync(stateFile)) {
      try {
        const existing = fs.readFileSync(stateFile, 'utf8');
        const trimmed = existing.charCodeAt(0) === 0xFEFF ? existing.slice(1) : existing;
        state = JSON.parse(trimmed);
        if (typeof state !== 'object' || state === null) state = {};
      } catch {
        state = {};
      }
    }
    state[skill] = {
      invokedAt: Date.now(),
      ttl: TTL_SEC,
      pid: process.pid,
      sessionId: data.session_id || null,
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');

    // ecc-07 BR-ECC-07-01: permanent evidence dual-write (.context-db/ecc-state/skill-invocation-state.json)
    // isSubagent best-effort env marker (BR-ECC-07-03 主 ban 由 subagent-blocked-tools rule + subagent-context-inject.js SubagentStart hook 涵蓋)
    const isSubagent = !!(process.env.CLAUDE_SUBAGENT || process.env.CLAUDE_AGENT_NAME);
    writePermanentEvidence(projectDir, skill, data.session_id || null, isSubagent);
  } catch (e) {
    process.stderr.write('[skill-invocation-state-tracker] write failed: ' + e.message + '\n');
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write('[skill-invocation-state-tracker] hook error: ' + err.message + '\n');
  process.exit(0);
});
