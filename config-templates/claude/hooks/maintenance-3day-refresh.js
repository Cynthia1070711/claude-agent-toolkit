#!/usr/bin/env node
// ============================================================
// PhyCool Search Infrastructure 3-Day Auto-Refresh — SessionStart Hook
// ============================================================
// Trigger:    SessionStart (startup|resume)
// Behavior:   If `.context-db/.last-maintenance-refresh.json` last_run > 3 days
//             AND env PHYCOOL_MAINTENANCE_AUTO_REFRESH !== 'false',
//             spawn detached background process running
//             `node .context-db/scripts/maintenance-refresh.cjs --stale-only`.
//             Fire-and-forget: hook exits within ~100ms, refresh runs in bg.
//
// Aligned:    `.claude/hooks/SessionStart.js` (god_nodes pattern) — same
//             stale-check + spawn detached + fail-open pattern.
//
// Env opt-out: PHYCOOL_MAINTENANCE_AUTO_REFRESH=false  (default: enabled)
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Hook protocol: read stdin (we don't actually need the payload for SessionStart
// but consume it to avoid stdin-blocked subprocess).
process.stdin.resume();
process.stdin.on('data', () => {});

// Fail-open wrapper — never break session start.
try {
  // Env opt-out (default: enabled)
  if (process.env.PHYCOOL_MAINTENANCE_AUTO_REFRESH === 'false') {
    process.exit(0);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const stateFile = path.join(projectRoot, '.context-db', '.last-maintenance-refresh.json');
  const scriptPath = path.join(projectRoot, '.context-db', 'scripts', 'maintenance-refresh.cjs');

  if (!fs.existsSync(scriptPath)) {
    // Maintenance script not deployed yet — skip silently.
    process.exit(0);
  }

  const STALE_DAYS = 3;
  const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

  let isStale = true;
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (state.last_run) {
        const lastMs = new Date(state.last_run.replace(' ', 'T')).getTime();
        isStale = (Date.now() - lastMs) > STALE_MS;
      }
    } catch {
      // Corrupt state file — treat as stale.
      isStale = true;
    }
  }

  if (!isStale) {
    process.exit(0);
  }

  // Fire-and-forget detached spawn — hook returns immediately, refresh runs in bg.
  process.stderr.write('[maintenance-3day] state stale > 3d, spawning background refresh\n');
  const child = spawn(process.execPath, [scriptPath, '--stale-only'], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  process.exit(0);
} catch (err) {
  // Fail-open: log to stderr but never block session.
  process.stderr.write(`[maintenance-3day] error (non-fatal): ${err.message}\n`);
  process.exit(0);
}
