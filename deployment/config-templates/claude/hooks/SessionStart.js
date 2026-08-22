#!/usr/bin/env node
// ============================================================
// god_nodes Auto-Refresh — SessionStart Hook
// Story: td-god-nodes-table-rebuild T4.4
//
// Trigger: SessionStart (all events)
// Behavior: If PHYCOOL_GODNODE_AUTO_REFRESH=true AND god_nodes.MAX(computed_at) > 7 days,
//           spawn background recompute (non-blocking).
//
// To register in settings.json (SessionStart array):
//   {
//     "hooks": [{ "type": "command",
//       "command": "cd \"${PROJECT_ROOT}\" && node .claude/hooks/SessionStart.js",
//       "timeout": 3000 }]
//   }
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTEXT_DB_DIR = path.join(PROJECT_ROOT, '.context-db');
const DB_PATH = path.join(CONTEXT_DB_DIR, 'phycool.db');
const COMPUTE_SCRIPT = path.join(CONTEXT_DB_DIR, 'scripts', 'compute-centrality.cjs');

const require = createRequire(import.meta.url);

// Only run if auto-refresh is enabled
const AUTO_REFRESH = process.env.PHYCOOL_GODNODE_AUTO_REFRESH === 'true';

if (!AUTO_REFRESH) {
  process.exit(0);
}

let Database;
try {
  Database = require(path.join(CONTEXT_DB_DIR, 'node_modules', 'better-sqlite3'));
} catch {
  process.exit(0);
}

try {
  if (!fs.existsSync(DB_PATH)) process.exit(0);

  const db = new Database(DB_PATH, { readonly: true });
  let isStale = false;

  try {
    const row = db.prepare(`SELECT MAX(computed_at) AS ts FROM god_nodes`).get();
    if (!row || !row.ts) {
      // No data at all → stale
      isStale = true;
    } else {
      // Preserve +08:00 offset (don't replace with 'Z') so Taiwan time is parsed correctly.
      const tsMs = new Date(row.ts.replace(' ', 'T')).getTime();
      isStale = (Date.now() - tsMs) > 7 * 24 * 60 * 60 * 1000;
    }
  } catch { /* god_nodes table might not exist */ }

  db.close();

  if (isStale && fs.existsSync(COMPUTE_SCRIPT)) {
    process.stderr.write('[SessionStart] god_nodes stale — spawning background recompute\n');
    const child = spawn(process.execPath, [COMPUTE_SCRIPT, '--force'], {
      detached: true,
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
    });
    child.unref();
  }
} catch {
  // Silent — never block session start
}

process.exit(0);
