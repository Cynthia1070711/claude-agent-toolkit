#!/usr/bin/env node
/**
 * Template E — Async background log
 *
 * Use for non-blocking tasks: telemetry, log shipping, cache warm-up, embeddings.
 * The "async": true flag (Jan 2026) lets the hook run without blocking Claude.
 *
 * settings.json registration:
 *   "PostToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/template-e-async-log.js",
 *       "timeout": 10000,
 *       "async": true
 *     }]
 *   }]
 *
 * Key constraints for async hooks:
 *   - Cannot block (exit 2 is ignored — Claude has already moved on)
 *   - Cannot return additionalContext (it would arrive after Claude already responded)
 *   - Use for side-effects only (write to disk, POST to telemetry, etc.)
 */

const fs = require('fs');
const path = require('path');

(async () => {
  let raw = '';
  for await (const c of process.stdin) raw += c;

  let data;
  try { data = JSON.parse(raw); } catch { process.exit(0); }

  const logDir = path.resolve('.claude/audit');
  fs.mkdirSync(logDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(logDir, `tools-${today}.jsonl`);

  // Strip large fields to keep log compact
  const entry = {
    ts: new Date().toISOString(),
    session_id: data.session_id,
    event: data.hook_event_name,
    tool: data.tool_name,
    file_path: data.tool_input?.file_path || null,
    // Truncate command to avoid log bloat
    command_preview: data.tool_input?.command
      ? data.tool_input.command.slice(0, 200)
      : null,
  };

  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    process.stderr.write(`[async-log] write failed: ${e.message}\n`);
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write(`[async-log] ${err.message}\n`);
  process.exit(0);
});