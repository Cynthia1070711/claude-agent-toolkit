// ============================================================
// Pipeline Context Recovery System — Component 3
// Context Budget Monitor
// ============================================================
// Usage: node context-budget-monitor.js [--model opus|sonnet|haiku]
//        [--session-file <path>]
// Output (stdout): { "usage_pct": 0.75, "warning": false,
//                    "tokens_used": 150000, "limit": 200000 }
// Exit codes: 0=ok, 1=warning (>80%), 2=critical (>95%)
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  // DB not available — output neutral result and exit
  process.stdout.write(JSON.stringify({ usage_pct: 0, warning: false, tokens_used: 0, limit: 200000, error: 'db_unavailable' }));
  process.exit(0);
}

// Model token limits (context window size)
const MODEL_LIMITS = {
  opus: 1000000,
  sonnet: 200000,
  haiku: 200000,
};

const WARNING_THRESHOLD = 0.80;  // 80% → WARNING
const CRITICAL_THRESHOLD = 0.95; // 95% → CRITICAL

function parseArgs(argv) {
  const args = { model: 'sonnet', sessionFile: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) {
      args.model = argv[i + 1].toLowerCase();
      i++;
    } else if (argv[i] === '--session-file' && argv[i + 1]) {
      args.sessionFile = argv[i + 1];
      i++;
    }
  }
  return args;
}

/**
 * Detect the current session ID from the most recent session record
 * in the context_entries table (category = 'session').
 */
function detectCurrentSessionId(db) {
  try {
    const row = db.prepare(`
      SELECT id FROM context_entries
      WHERE category = 'session'
      ORDER BY created_at DESC
      LIMIT 1
    `).get();
    return row ? row.id : null;
  } catch {
    return null;
  }
}

/**
 * Estimate token usage for the current session.
 * Strategy:
 *   1. Sum token_estimate from conversation_turns for the latest session_id
 *   2. If conversation_turns table does not exist, fall back to
 *      counting recent context_entries rows × avg token estimate
 */
function estimateTokenUsage(db, sessionId) {
  // Primary: conversation_turns table (log-turn.js inserts here)
  try {
    const hasTable = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='conversation_turns'
    `).get();

    if (hasTable) {
      // Try to sum token estimates for the current session
      const sumRow = db.prepare(`
        SELECT COALESCE(SUM(token_estimate), 0) AS total,
               COUNT(*) AS turn_count
        FROM conversation_turns
        WHERE session_id = ?
      `).get(sessionId);

      if (sumRow && sumRow.total > 0) {
        return { tokens: sumRow.total, turns: sumRow.turn_count, source: 'conversation_turns' };
      }

      // session_id may not match — try latest N turns regardless
      const latestRow = db.prepare(`
        SELECT COALESCE(SUM(token_estimate), 0) AS total,
               COUNT(*) AS turn_count
        FROM (
          SELECT token_estimate FROM conversation_turns
          ORDER BY id DESC
          LIMIT 200
        )
      `).get();

      if (latestRow && latestRow.total > 0) {
        return { tokens: latestRow.total, turns: latestRow.turn_count, source: 'conversation_turns_latest' };
      }
    }
  } catch {
    // Fall through to heuristic
  }

  // Fallback heuristic: count recent context_entries rows
  // Average token density per entry ≈ 800 tokens (conservative estimate)
  try {
    const countRow = db.prepare(`
      SELECT COUNT(*) AS cnt FROM context_entries
      WHERE datetime(created_at) >= datetime('now', '-2 hours')
    `).get();
    const estimated = (countRow?.cnt ?? 0) * 800;
    return { tokens: estimated, turns: countRow?.cnt ?? 0, source: 'heuristic_context_entries' };
  } catch {
    return { tokens: 0, turns: 0, source: 'fallback_zero' };
  }
}

/**
 * Trigger a checkpoint save if an active pipeline exists.
 * Non-blocking: uses spawnSync with a short timeout.
 */
function triggerCheckpointSave(repoRoot) {
  const checkpointScript = path.join(repoRoot, '.context-db', 'scripts', 'pipeline-checkpoint.js');
  try {
    // Check script exists before calling
    const fs = require('fs');
    if (!fs.existsSync(checkpointScript)) {
      return { triggered: false, reason: 'pipeline-checkpoint.js not found' };
    }
    const result = spawnSync(
      process.execPath,
      [checkpointScript, '--save', '--reason', 'context-budget-warning'],
      { cwd: repoRoot, timeout: 3000, encoding: 'utf8' }
    );
    return {
      triggered: true,
      exit_code: result.status,
      stdout: (result.stdout || '').trim().slice(0, 200),
    };
  } catch (err) {
    return { triggered: false, reason: err.message };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const modelKey = Object.prototype.hasOwnProperty.call(MODEL_LIMITS, args.model)
    ? args.model
    : 'sonnet';
  const limit = MODEL_LIMITS[modelKey];
  const repoRoot = path.join(__dirname, '..', '..');

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');

    const sessionId = detectCurrentSessionId(db);
    const usage = estimateTokenUsage(db, sessionId);
    const usagePct = limit > 0 ? usage.tokens / limit : 0;

    const isWarning = usagePct >= WARNING_THRESHOLD;
    const isCritical = usagePct >= CRITICAL_THRESHOLD;

    const result = {
      usage_pct: Math.round(usagePct * 10000) / 10000,
      warning: isWarning,
      critical: isCritical,
      tokens_used: usage.tokens,
      limit,
      model: modelKey,
      turns: usage.turns,
      source: usage.source,
      session_id: sessionId,
    };

    if (isCritical) {
      process.stderr.write(
        `[context-budget-monitor] CRITICAL: Context at ${(usagePct * 100).toFixed(1)}% of ${modelKey} limit (${usage.tokens.toLocaleString()} / ${limit.toLocaleString()} tokens). Saving checkpoint...\n`
      );
      result.checkpoint = triggerCheckpointSave(repoRoot);
    } else if (isWarning) {
      process.stderr.write(
        `[context-budget-monitor] WARNING: Context at ${(usagePct * 100).toFixed(1)}% of ${modelKey} limit (${usage.tokens.toLocaleString()} / ${limit.toLocaleString()} tokens). Consider saving checkpoint.\n`
      );
      result.checkpoint = triggerCheckpointSave(repoRoot);
    }

    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(isCritical ? 2 : isWarning ? 1 : 0);
  } catch (err) {
    // Silent failure — never block user
    process.stdout.write(JSON.stringify({
      usage_pct: 0,
      warning: false,
      critical: false,
      tokens_used: 0,
      limit,
      model: modelKey,
      error: err.message,
    }) + '\n');
    process.exit(0);
  } finally {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
  }
}

main();
