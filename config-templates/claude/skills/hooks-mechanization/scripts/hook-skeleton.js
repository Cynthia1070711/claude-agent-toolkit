#!/usr/bin/env node
/**
 * Hook Skeleton — Node.js (Windows 11 + PowerShell compatible)
 *
 * Copy this file as your starting point. Replace three sections:
 *   1) STDIN PARSE   — extract fields you need
 *   2) DECISION      — your check logic
 *   3) OUTPUT        — pick ONE of the three modes
 *
 * Important rules:
 *   - Use `console.error()` for debug messages (stderr), NEVER `console.log` (pollutes JSON stdout).
 *   - Pick exactly ONE output mode below — do not mix `exit 2` with JSON.
 *   - Always exit explicitly with `process.exit(0)` or `process.exit(2)`.
 *   - Wrap I/O in try/catch — a thrown error is non-blocking and confusing.
 */

(async () => {
  // ─────────────────────────────────────────────────────────
  // 1) STDIN PARSE
  // ─────────────────────────────────────────────────────────
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    // Hook failures should not block work; log and exit cleanly.
    console.error(`[hook-skeleton] stdin JSON parse failed: ${e.message}`);
    process.exit(0);
  }

  const eventName = data.hook_event_name || 'unknown';
  const sessionId = data.session_id || 'no-session';
  const toolName = data.tool_name || '';
  const toolInput = data.tool_input || {};
  const cwd = data.cwd || process.cwd();

  // Stop-hook infinite-loop guard. ALWAYS keep this if event is Stop/SubagentStop.
  if ((eventName === 'Stop' || eventName === 'SubagentStop') && data.stop_hook_active) {
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────
  // 2) DECISION — your logic here
  // ─────────────────────────────────────────────────────────
  let shouldBlock = false;
  let blockReason = '';
  let contextToInject = '';

  // Example: detect risky bash command
  if (eventName === 'PreToolUse' && toolName === 'Bash') {
    const cmd = toolInput.command || '';
    if (/rm\s+-rf\s+\//.test(cmd)) {
      shouldBlock = true;
      blockReason = 'rm -rf / blocked by skeleton hook';
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3) OUTPUT — pick ONE mode
  // ─────────────────────────────────────────────────────────

  // ── Mode A: BLOCK (exit 2, stderr message)
  if (shouldBlock) {
    process.stderr.write(blockReason + '\n');
    process.exit(2);
  }

  // ── Mode B: INJECT CONTEXT (exit 0, JSON stdout)
  if (contextToInject) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: contextToInject  // write as factual statement, not command
      }
    }));
    process.exit(0);
  }

  // ── Mode C: SILENT PASS (exit 0, no output)
  process.exit(0);
})().catch(err => {
  console.error(`[hook-skeleton] unhandled error: ${err.message}`);
  process.exit(0);  // never block by accident
});