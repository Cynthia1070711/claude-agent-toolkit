#!/usr/bin/env node
/**
 * Template C — SessionStart context injection
 *
 * Use to give Claude project state at session start: git branch, recent commits,
 * active feature flags, open issues. Reduces the need to re-explain context.
 *
 * settings.json registration:
 *   "SessionStart": [{
 *     "matcher": "startup|resume",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/template-c-session-start-inject.js",
 *       "timeout": 5000
 *     }]
 *   }]
 *
 * IMPORTANT: keep total injected text under ~2000 chars to avoid bloating every
 * session. Use docs/ or skills for larger context.
 */

const { execSync } = require('child_process');

function safeExec(cmd, fallback = '') {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

(async () => {
  // Drain stdin (required even if not used)
  let raw = '';
  for await (const c of process.stdin) raw += c;

  const branch = safeExec('git branch --show-current', 'unknown');
  const lastCommit = safeExec('git log -1 --format="%h %s"', '');
  const dirty = safeExec('git status --porcelain', '');
  const dirtyCount = dirty ? dirty.split('\n').length : 0;

  const lines = [];
  lines.push(`Git branch: ${branch}`);
  if (lastCommit) lines.push(`Last commit: ${lastCommit}`);
  lines.push(`Uncommitted files: ${dirtyCount}`);

  // Active feature flag check (example — adapt to PhyCool's actual flag file)
  try {
    const fs = require('fs');
    if (fs.existsSync('.claude/feature-flags.json')) {
      const flags = JSON.parse(fs.readFileSync('.claude/feature-flags.json', 'utf8'));
      const active = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k);
      if (active.length) lines.push(`Active feature flags: ${active.join(', ')}`);
    }
  } catch {}

  // Write as factual statements (not commands) — see SKILL.md rule
  const context = lines.join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[session-start-inject] ${err.message}\n`);
  process.exit(0);
});