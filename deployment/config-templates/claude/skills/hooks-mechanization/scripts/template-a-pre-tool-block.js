#!/usr/bin/env node
/**
 * Template A — PreToolUse blocker
 *
 * Use when a rule says "never let Claude run X" or "X requires confirmation".
 * Exit 2 stops the tool from executing; stderr message is shown to Claude.
 *
 * settings.json registration:
 *   {
 *     "matcher": "Bash",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/template-a-pre-tool-block.js",
 *       "timeout": 5000
 *     }]
 *   }
 */

const DANGEROUS_PATTERNS = [
  { re: /\brm\s+-rf\s+\/(?!\w)/, msg: 'rm -rf / detected' },
  { re: /\bgit\s+push\s+--force(?!\-with\-lease)/, msg: 'git push --force without --force-with-lease' },
  { re: /\bdrop\s+(table|database)\b/i, msg: 'DROP TABLE/DATABASE detected' },
  { re: /\bcurl\s+.+\|\s*(sh|bash)\b/, msg: 'piping curl to shell' },
];

(async () => {
  let raw = '';
  for await (const c of process.stdin) raw += c;

  let data;
  try { data = JSON.parse(raw); } catch { process.exit(0); }

  if (data.hook_event_name !== 'PreToolUse' || data.tool_name !== 'Bash') {
    process.exit(0);
  }

  const cmd = (data.tool_input?.command || '').trim();
  if (!cmd) process.exit(0);

  for (const { re, msg } of DANGEROUS_PATTERNS) {
    if (re.test(cmd)) {
      // Option 1: hard block with stderr
      process.stderr.write(
        `[pre-tool-block] ${msg}\nCommand was: ${cmd}\n` +
        `If this is intentional, ask the user to run it themselves.\n`
      );
      process.exit(2);

      // Option 2 (alternative): soft block with permissionDecision "ask"
      // process.stdout.write(JSON.stringify({
      //   hookSpecificOutput: {
      //     hookEventName: 'PreToolUse',
      //     permissionDecision: 'ask',
      //     permissionDecisionReason: msg
      //   }
      // }));
      // process.exit(0);
    }
  }

  process.exit(0);
})().catch(err => {
  // Never block on hook error — log to stderr and pass
  process.stderr.write(`[pre-tool-block] hook error: ${err.message}\n`);
  process.exit(0);
});