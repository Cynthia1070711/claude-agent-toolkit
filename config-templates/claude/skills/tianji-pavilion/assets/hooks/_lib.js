/**
 * Shared utilities for Tianji-Pavilion baseline-guard hooks.
 *
 * Conventions:
 *   - Hooks read JSON from stdin (Claude Code hook protocol).
 *   - Exit 0  = pass (silent or with additionalContext via stdout JSON).
 *   - Exit 2  = block (stderr message visible to Claude).
 *   - Exit 1  = internal error (stderr); does NOT block tool execution.
 *   - DB unavailable → graceful exit 0 with stderr warning. Hook never
 *     bricks the user's workflow because of an infrastructure issue.
 *
 * Why this matters: PhyCool Windows 11 zh-TW. UTF-8 stdout/stderr is the
 * default for Node ≥ 18, but file paths may contain non-ASCII chars, so
 * we never assume CP950 fallback works.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// PhyCool patch (2026-05-18): align to project SSoT — main DB is `phycool.db`
// per `.context-db/scripts/init-db.js:21` DB_PATH + `.context-db/server.js:33`
// (MCP `phycool-context` operates here). Original `context.db` default would
// write to an orphan DB invisible to all `mcp__phycool-context__*` tools.
const CONTEXT_DB_RELATIVE = '.context-db/phycool.db';

/**
 * Resolve the .context-db path relative to the project directory.
 * The project dir resolves to CLAUDE_PROJECT_DIR when set, else process.cwd(),
 * so an unset env var no longer short-circuits to null (2026-08-02).
 * Returns null when the resolved DB file is absent.
 */
function resolveDbPath() {
  // PhyCool patch (2026-05-18): fall back to process.cwd() when
  // CLAUDE_PROJECT_DIR is unset. Settings.json uses `cd "<abs>" && node ...`
  // convention because project path contains parens; cwd is project root.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!projectDir) return null;
  const dbPath = path.join(projectDir, CONTEXT_DB_RELATIVE);
  if (!fs.existsSync(dbPath)) return null;
  return dbPath;
}

/**
 * Open .context-db read-only. Returns null on any failure (graceful skip).
 * The hook should treat null as "DB unavailable, skip enforcement".
 */
function openContextDb() {
  const dbPath = resolveDbPath();
  if (!dbPath) return null;
  try {
    // Lazy require — better-sqlite3 may not be installed in every env.
    const Database = require('better-sqlite3');
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    process.stderr.write(
      `[tianji-hook] better-sqlite3 unavailable or DB corrupt: ${err.message}\n`
    );
    return null;
  }
}

/**
 * Read stdin fully as JSON. Returns {} on parse error.
 */
function readHookInput() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Extract external_id from a `git worktree add` command.
 * Matches branch names like `pilot/<external_id>` or `pilot-<external_id>`.
 * Returns null if no match.
 *
 * Examples:
 *   "git worktree add ../pilot-foo -b pilot/foo-bar"  -> "foo-bar"
 *   "git worktree add ../wt -b pilot/awesome-rules"    -> "awesome-rules"
 *   "git worktree add ../wt -b feature/x"              -> null (not a pilot)
 */
function parseExternalIdFromCommand(command) {
  if (!command || typeof command !== 'string') return null;
  // Look for `-b pilot/<id>` or `-B pilot/<id>`.
  const m = command.match(/-[bB]\s+pilot\/([A-Za-z0-9._-]+)/);
  if (m) return m[1];
  // Fallback: any `pilot/<id>` token in the command.
  const m2 = command.match(/\bpilot\/([A-Za-z0-9._-]+)\b/);
  if (m2) return m2[1];
  return null;
}

/**
 * Check whether the current command is a `git worktree add`.
 * Returns true even with prefix flags like `cd ... &&`.
 */
function isGitWorktreeAdd(command) {
  if (!command || typeof command !== 'string') return false;
  return /\bgit\s+worktree\s+add\b/.test(command);
}

/**
 * Emit hookSpecificOutput.additionalContext to stdout (advisory message).
 * Used by SessionStart, UserPromptSubmit, PostToolUse hooks.
 *
 * 2026-07-29 (bwu-6, mirrors live .claude/hooks/_lib.js bwu-5 CR /
 * TD-HOOK-LIB-EVENT-NAME-ENV-MISSING fix): callers now pass their registered event
 * name explicitly. There is no CLAUDE_HOOK_EVENT_NAME in the official hook
 * environment, so the previous env read always fell through to the literal
 * 'unknown'. The env fallback is kept so any un-migrated caller keeps its old
 * behaviour rather than emitting `undefined`.
 */
function emitAdditionalContext(text, eventName) {
  if (!text) return;
  const payload = {
    hookSpecificOutput: {
      hookEventName: eventName || process.env.CLAUDE_HOOK_EVENT_NAME || 'unknown',
      additionalContext: text,
    },
  };
  process.stdout.write(JSON.stringify(payload));
}

/**
 * Block tool execution with a diagnostic stderr message.
 * Exit code 2 is the documented Claude Code "block" signal.
 */
function block(reason) {
  process.stderr.write(`[tianji] BLOCKED: ${reason}\n`);
  process.exit(2);
}

/**
 * Gracefully skip enforcement (DB unavailable, parse error, etc.).
 * Exit 0 with stderr note so the user can audit but workflow continues.
 */
function softSkip(reason) {
  process.stderr.write(`[tianji] skipped (${reason})\n`);
  process.exit(0);
}

/**
 * Format a date N days from today in YYYY-MM-DD.
 */
function daysFromNow(n) {
  // TZ FIX 2026-05-29: 台灣日界(原 UTC 日界 → cooldown 截止日早 1 天);同步 deployed .claude/hooks/_lib.js
  const d = new Date(Date.now() + n * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute days between two ISO date strings (a - b in days).
 * Returns null if either input is falsy or unparseable.
 */
function daysBetween(aIso, bIso) {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (a - b) / 86400000;
}

module.exports = {
  openContextDb,
  resolveDbPath,
  readHookInput,
  parseExternalIdFromCommand,
  isGitWorktreeAdd,
  emitAdditionalContext,
  block,
  softSkip,
  daysFromNow,
  daysBetween,
};
