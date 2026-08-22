#!/usr/bin/env node
/**
 * instructions-loaded-logger.js — InstructionsLoaded hook (2026 Apr event)
 *
 * PhyCool advisory observability hook: records the always-on rules / CLAUDE.md
 * files actually loaded by Claude Code at session start / path-glob-match /
 * nested-traversal. This is the canonical truth for "what's really in context"
 * (vs. what audit-config.js statically infers from paths frontmatter).
 *
 * Output:
 *   .claude/audit/instructions-loaded.log (append-only, line-format)
 *
 * Usage:
 *   - audit-config.js can read this log to cross-check theoretical vs actual
 *     always-on rules count
 *   - User can grep log to debug "why is my paths-scoped rule not loading?"
 *   - Sessions accumulate over time, providing usage telemetry
 *
 * Non-blocking advisory: exit 0 always. Never throws to Claude.
 *
 * Registered in settings.json:
 *   "InstructionsLoaded": [{
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/instructions-loaded-logger.js",
 *       "timeout": 2000
 *     }]
 *   }]
 *
 * 2026-05-16 deployed for PhyCool env-optimization Phase 2.4.
 */

const fs = require('fs');
const path = require('path');

function taiwanTimestamp() {
  // Taiwan UTC+8 timestamp per .claude/rules/constitutional-standard.md §Timestamp Mandate
  return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' });
}

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Malformed input — silent pass (advisory hook, never throws)
    process.exit(0);
  }

  try {
    const auditDir = path.resolve('.claude/audit');
    fs.mkdirSync(auditDir, { recursive: true });

    const timestamp = taiwanTimestamp();
    const sessionId = (data.session_id || 'unknown').slice(0, 8);
    const loadReason = data.load_reason || 'unknown';
    const files = Array.isArray(data.instruction_files) ? data.instruction_files : [];

    const header = `${timestamp} | session=${sessionId} | reason=${loadReason} | count=${files.length}`;
    const body = files.length > 0
      ? files.map(f => `  - ${f}`).join('\n')
      : '  (no files)';
    const entry = `${header}\n${body}\n---\n`;

    const logFile = path.join(auditDir, 'instructions-loaded.log');
    fs.appendFileSync(logFile, entry, 'utf8');

    // Rotate log if > 1 MB (keep recent observations only)
    const stat = fs.statSync(logFile);
    if (stat.size > 1024 * 1024) {
      const archived = path.join(auditDir, `instructions-loaded.${Date.now()}.log`);
      fs.renameSync(logFile, archived);
    }
  } catch (err) {
    process.stderr.write(`[instructions-loaded-logger] ${err.message}\n`);
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write(`[instructions-loaded-logger] fatal: ${err.message}\n`);
  process.exit(0);
});
