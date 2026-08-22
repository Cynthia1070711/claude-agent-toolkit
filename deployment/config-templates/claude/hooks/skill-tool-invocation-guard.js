#!/usr/bin/env node
/**
 * skill-tool-invocation-guard.js — PreToolUse hook (matcher: Edit|Write)
 *
 * v2.0.0 (2026-05-17) — State Persistence 主驗證 + Transcript multi-pattern 備援
 *
 * 修補背景(使用者第一性原理分析):
 *   v1 用字面 narrative pattern `/Skill\(skill="..."/` 掃描 transcript,但 JSONL tool_use 結構為
 *   `{"name":"Skill","input":{"skill":"saas-to-skill"...}}` — pattern 永不 match。
 *   200KB sliding window 過小 / 5 min TTL 過短 雙重缺陷複合放大誤擋率。
 *
 * 方案一修補(State Persistence):
 *   1. PRIMARY: 讀 `.claude/audit/skill-invocation-state.json` (skill-invocation-state-tracker 寫入)
 *      授權狀態脫離 volatile transcript 窗口影響
 *   2. FALLBACK: transcript JSONL 多 pattern (narrative + tool_use 正反序) + 1MB tail + 15min TTL
 *
 * v2.1.0 (2026-07-27) — Session 綁定 + 錯誤訊息澄清
 *
 * 修補背景(2026-07-27 party-to-pipeline 薄手子視窗閘門實查):
 *   Gap A — 跨視窗漏授權:v2 的 checkStateFile 只驗 TTL,`sessionId` 欄位有寫入卻從未比對。
 *     狀態檔為專案全域,任一視窗(主視窗或別的子視窗)15 分鐘內調用過 saas-to-skill/skill-builder,
 *     其他視窗即可直接 Edit SKILL.md 而完全不調用 → 閘門對「非本 session」過鬆。
 *     修法:state entry 的 sessionId 與 hook stdin 的 session_id 兩者皆存在且不同時,不採信該筆。
 *     兩者任一缺失(legacy 無 sessionId 的舊 entry / stdin 無 session_id)→ fail-open 採信,
 *     不在無法舉證的情況下收緊(對齊本檔既有 fail-open 精神)。
 *
 *   Gap B — 刻意不修:使用者手打 `/skill-builder` 產生的是 command 訊息而非 Skill tool_use,
 *     PostToolUse:Skill 不觸發 → 狀態檔不寫;transcript 兩個 pattern 也都不匹配 → 仍會 BLOCK。
 *     這是**正確行為**:skill-tool-invocation-mandatory.md F1 要求的是「Agent 字面調用 Skill tool」,
 *     使用者代為載入不等於 Agent 走過 SOP。若改為採信 transcript 內的 `<command-name>` 字樣,
 *     等於重新打開 v1 已封閉的自我授權漏洞(assistant 輸出也落在同一份 transcript)。
 *     故本版只在 stderr 訊息中澄清,不放寬判定。
 *
 * PhyCool skill-tool-invocation-mandatory.md F1 SUPREME enforcement (hard-block).
 *
 * Detects Edit/Write tool calls on .claude/skills/**\/SKILL.md or
 * .claude/skills/**\/references/*.md. If no recent (< 15 min) Skill(saas-to-skill|skill-builder)
 * invocation → exit 2.
 *
 * Bootstrap Exemption (對齊 skill-tool-invocation-mandatory v1.2.0 §Bootstrap Exemption):
 *   if file_path matches .claude/skills/{name}/SKILL.md AND the skill's frontmatter contains
 *   `bootstrap-exempt: true` (e.g., pipeline-subwindow) → allow (avoid self-bootstrap deadlock).
 *
 * Behavior: hard-block on miss, fail-open on any error.
 *
 * Bypass: PHYCOOL_SKILL_TOOL_BYPASS=1 ENV var (emergency).
 *
 * Registration:
 *   "PreToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/skill-tool-invocation-guard.js",
 *       "timeout": 3000
 *     }]
 *   }]
 *
 * 2026-05-16 v1.0 deployed for PhyCool env-optimization P0-1.
 * 2026-05-17 v2.0 deployed: state persistence + pattern hardening + window expansion.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STDIN_TIMEOUT_MS = 1500;
const MAX_STDIN_BYTES = 256 * 1024;
const TRANSCRIPT_GREP_TTL_MS = 15 * 60 * 1000;  // 15 min (was 5 min)
const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;      // 1 MB (was 200KB)

const SKILL_MD_PATTERN = /\.claude[\\/]skills[\\/][^\\/]+[\\/]SKILL\.md$/;
const SKILL_REFS_PATTERN = /\.claude[\\/]skills[\\/][^\\/]+[\\/]references[\\/].+\.md$/;

// v2 多 pattern(narrative legacy + JSONL tool_use 主用)
// transcript JSONL 中 tool_use 實際結構為 {"name":"Skill","input":{"skill":"saas-to-skill",...}}
// 不是字面 Skill(skill="...")。多 pattern 涵蓋兩種格式。
const SKILL_TOOL_INVOKE_PATTERNS = [
  /Skill\(skill="(?:saas-to-skill|skill-builder)"/,                                       // narrative (legacy fallback)
  /"name"\s*:\s*"Skill"[\s\S]{0,500}?"skill"\s*:\s*"(?:saas-to-skill|skill-builder)"/,    // JSONL tool_use (primary)
  /"skill"\s*:\s*"(?:saas-to-skill|skill-builder)"[\s\S]{0,500}?"name"\s*:\s*"Skill"/      // JSONL reverse order
];

const STATE_FILE_REL = path.join('.claude', 'audit', 'skill-invocation-state.json');
const SUPPORTED_SKILLS = ['saas-to-skill', 'skill-builder'];

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

function checkBootstrapExempt(filePath) {
  const skillMatch = filePath.match(/\.claude[\\/]skills[\\/]([^\\/]+)[\\/]SKILL\.md$/);
  if (!skillMatch) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return false;
    return /^bootstrap-exempt\s*:\s*true\s*$/m.test(fmMatch[1]);
  } catch {
    return false;
  }
}

/**
 * v2 PRIMARY 驗證 — 讀 state file (脫離 transcript window 限制)
 * v2.1 (2026-07-27): 加 session 綁定 — entry.sessionId 與本次 hook 的 session_id
 *   兩者皆存在且不同 → 視為他 session 的授權,不採信(Gap A)。
 *   任一缺失 → fail-open 採信(不在無法舉證時收緊)。
 * @param {string} projectDir
 * @param {string|null} currentSessionId - hook stdin 的 session_id
 * @returns {{skill,invokedAt,elapsedSec}|null} 命中的授權;另回傳 rejected 供 stderr 診斷
 */
function checkStateFile(projectDir, currentSessionId) {
  const stateFile = path.join(projectDir, STATE_FILE_REL);
  const rejected = [];
  try {
    if (!fs.existsSync(stateFile)) return { hit: null, rejected };
    const raw = fs.readFileSync(stateFile, 'utf8');
    const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const state = JSON.parse(trimmed);
    if (typeof state !== 'object' || state === null) return { hit: null, rejected };

    let latest = null;
    for (const skill of SUPPORTED_SKILLS) {
      const entry = state[skill];
      if (!entry || typeof entry.invokedAt !== 'number') continue;
      const elapsedMs = Date.now() - entry.invokedAt;
      const ttlMs = (entry.ttl || 900) * 1000;
      if (!(elapsedMs >= 0 && elapsedMs < ttlMs)) continue;

      // v2.1 session 綁定:只在「兩邊都有 sessionId 且不同」時拒絕
      if (currentSessionId && entry.sessionId && entry.sessionId !== currentSessionId) {
        rejected.push({ skill, otherSession: String(entry.sessionId).slice(0, 8) });
        continue;
      }
      if (!latest || entry.invokedAt > latest.invokedAt) {
        latest = { skill, invokedAt: entry.invokedAt, elapsedSec: elapsedMs / 1000 };
      }
    }
    return { hit: latest, rejected };
  } catch {
    return { hit: null, rejected };
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

/**
 * v2 FALLBACK — transcript 多 pattern scan
 */
function findLastSkillInvocationTs(transcriptText) {
  if (!transcriptText) return null;
  let lastIdx = -1;
  for (const pattern of SKILL_TOOL_INVOKE_PATTERNS) {
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
  if (process.env.PHYCOOL_SKILL_TOOL_BYPASS === '1') process.exit(0);

  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const data = parseJsonSafe(raw) || {};

  if (data.hook_event_name !== 'PreToolUse') process.exit(0);
  if (!['Edit', 'Write'].includes(data.tool_name)) process.exit(0);

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  const isSkillMd = SKILL_MD_PATTERN.test(filePath);
  const isSkillRef = SKILL_REFS_PATTERN.test(filePath);
  if (!isSkillMd && !isSkillRef) process.exit(0);

  if (isSkillMd && checkBootstrapExempt(filePath)) process.exit(0);

  // v2 PRIMARY: state file check (v2.1: session-bound — 見檔頭 Gap A)
  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  const { hit: stateHit, rejected: stateRejected } = checkStateFile(projectDir, data.session_id || null);
  if (stateHit) process.exit(0);

  // v2 FALLBACK: transcript multi-pattern grep
  const transcriptPath = data.transcript_path;
  let lastInvokeTs = null;
  if (transcriptPath) {
    const transcriptText = readTranscriptTail(transcriptPath);
    lastInvokeTs = findLastSkillInvocationTs(transcriptText);
  }
  const now = Date.now();
  const isRecent = lastInvokeTs && (now - lastInvokeTs.getTime()) < TRANSCRIPT_GREP_TTL_MS;

  if (!isRecent) {
    const rejectedNote = (stateRejected && stateRejected.length)
      ? '  (v2.1 session-bound: ' +
        stateRejected.map(r => r.skill + ' 的授權屬 session ' + r.otherSession + '...').join(', ') +
        ', 非本 session, 不採信)\n'
      : '';
    process.stderr.write(
      '\n[skill-tool-invocation-guard v2.1] BLOCK: Edit/Write SKILL.md requires Skill tool invocation\n\n' +
      'File: ' + filePath + '\n' +
      'Session: ' + (data.session_id ? String(data.session_id).slice(0, 8) + '...' : '(unknown)') + '\n' +
      'State file (PRIMARY): MISS (' + STATE_FILE_REL + ' missing, expired, or bound to another session)\n' +
      rejectedNote +
      'Transcript grep (FALLBACK): ' +
      (lastInvokeTs ? lastInvokeTs.toISOString() : 'NONE in last 1MB transcript (multi-pattern)') + '\n' +
      'TTL window: ' + (TRANSCRIPT_GREP_TTL_MS / 1000) + 's\n\n' +
      'Required per .claude/rules/skill-tool-invocation-mandatory.md F1 SUPREME:\n' +
      '  - Update existing phycool-* SaaS Skill -> Skill(skill="saas-to-skill") Mode B\n' +
      '  - Create new SaaS Skill -> Skill(skill="saas-to-skill") Mode A\n' +
      '  - Create/update Workflow/Utility Skill -> Skill(skill="skill-builder")\n\n' +
      'NOTE (v2.1): 使用者手打的 /skill-builder 或 /saas-to-skill slash command **不算**授權 --\n' +
      '  那是 command 訊息不是 Skill tool_use, PostToolUse:Skill 不觸發, 狀態檔不會寫入.\n' +
      '  F1 要求的是 Agent 自己發出 Skill tool call, 請直接發出該 tool call 後重試本次 Edit.\n' +
      '  (此為刻意設計, 非缺陷: 採信 transcript 內的字面文字會重開 v1 的自我授權漏洞)\n\n' +
      'Bootstrap Exemption: add `bootstrap-exempt: true` to frontmatter if skill regulates pipeline itself.\n' +
      'Emergency bypass: PHYCOOL_SKILL_TOOL_BYPASS=1\n'
    );
    process.exit(2);
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write('[skill-tool-invocation-guard v2] hook error: ' + err.message + '\n');
  process.exit(0);
});
