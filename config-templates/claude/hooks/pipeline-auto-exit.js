#!/usr/bin/env node
/**
 * Pipeline Auto-Exit Hook (Stop event)
 *
 * Flow:
 * 1. Sub-window Claude completes task → DB status changes to target
 * 2. Stop hook fires → checks DB status against phase target
 * 3. If status matches target → write signal file (L1)
 * 4. Watchdog detects signal → graceful close → window closes
 *
 * Only acts when PIPELINE_SIGNAL_FILE env var is set (pipeline mode).
 * Only writes signal when task is TRULY complete (DB verified).
 *
 * FIX 2026-03-29: Removed tasks backfill gate from code-review phase.
 * Tasks backfill is a post-pipeline concern (G3 gate in srf-story-pipeline.ps1),
 * NOT an auto-exit gate. The previous check caused code-review windows to never
 * receive L1 signal, forcing fallback to L2/L3 watchdog which race-conditions
 * the status back to 'review'.
 */

const fs = require('fs');
const path = require('path');

const signalFile = process.env.PIPELINE_SIGNAL_FILE;
const storyId = process.env.PIPELINE_STORY_ID;
const pipelinePhase = process.env.PIPELINE_PHASE || '';

if (!signalFile || !storyId) {
  // Not in pipeline mode
  process.exit(0);
}

// Already signaled? Skip.
if (fs.existsSync(signalFile)) {
  process.exit(0);
}

try {
  // Check DB for task completion
  const dbPath = path.resolve(__dirname, '../../.context-db/context-memory.db');
  if (!fs.existsSync(dbPath)) {
    process.exit(0);
  }

  const Database = require(path.resolve(__dirname, '../../.context-db/node_modules/better-sqlite3'));
  const db = new Database(dbPath, { readonly: true });

  const row = db.prepare(
    "SELECT status, tasks FROM stories WHERE story_id = ?"
  ).get(storyId);
  db.close();

  if (!row) {
    process.exit(0);
  }

  // Phase-aware completion check:
  // Each pipeline phase has a different target status
  // Single Source of Truth: scripts/pipeline-config.json (BR-01)
  const configPath = path.resolve(__dirname, '../../scripts/pipeline-config.json');
  const phaseTargetStatus = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8')).phaseTargetStatus
    : {};

  const targets = phaseTargetStatus[pipelinePhase];
  let isPhaseComplete = false;

  if (targets) {
    // Phase-aware mode: check if status matches the phase's target
    isPhaseComplete = targets.includes(row.status);

    // FIX 2026-03-30: Re-add tasks backfill gate for code-review phase ONLY.
    // Previous removal (2026-03-29) was because Test-TasksBackfill reverted done→review.
    // That revert bug is now fixed (changed to WARNING). Safe to re-add here.
    // Without this gate: auto-exit fires on status=done BEFORE sub-window runs
    // /tasks-backfill-verify → tasks never get ✅ → G3 reports NEEDS_BACKFILL.
    if (isPhaseComplete && pipelinePhase.startsWith('code-review') && row.tasks) {
      const hasBackfill = row.tasks.includes('✅');
      if (!hasBackfill) {
        isPhaseComplete = false; // Hold window open until backfill completes
      }
    }
  } else {
    // Fallback (legacy): signal on done status only
    isPhaseComplete = row.status === 'done';
  }

  // FILE-BASED DETECTION: Fallback when DB status check is insufficient
  // Handles cases where Claude writes artifacts but doesn't update DB to target status
  if (!isPhaseComplete) {
    const projectRoot = path.resolve(__dirname, '../..');
    const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

    // (A) Review tasks (rev1-*): check if report file exists on disk
    if (storyId.startsWith('rev1-')) {
      const moduleMatch = storyId.match(/^rev1-(.+)-(e2e|code|security|nfr)(?:-cc)?$/);
      if (moduleMatch) {
        const moduleCode = moduleMatch[1];
        const mode = moduleMatch[2];
        const reportSubDir = mode === 'e2e' ? 'e2e' : mode;
        const reportDir = path.join(projectRoot, 'docs/implementation-artifacts/reports/review', reportSubDir);
        if (fs.existsSync(reportDir)) {
          const files = fs.readdirSync(reportDir);
          const match = files.find(f => f.includes(dateStr) && f.includes(moduleCode));
          if (match) {
            isPhaseComplete = true;
          }
        }
      }
    }

    // (B) Code-review phase (any story): check if CR report exists in epic dir
    if (!isPhaseComplete && pipelinePhase.startsWith('code-review')) {
      const epicMatch = storyId.match(/^(fix\d+|[a-z]+-[a-z]+)/);
      if (epicMatch) {
        const epicDir = path.join(projectRoot, 'docs/implementation-artifacts/reviews', `epic-${epicMatch[1].split('-')[0]}`);
        if (fs.existsSync(epicDir)) {
          const files = fs.readdirSync(epicDir);
          const match = files.find(f => f.includes(storyId) && f.includes('code-review'));
          if (match) {
            isPhaseComplete = true;
          }
        }
      }
    }

    // (C) Dev-story phase: check if tracking file was updated recently (dev-story writes to .track.md)
    if (!isPhaseComplete && pipelinePhase.startsWith('dev-story')) {
      const trackFile = path.join(projectRoot, 'docs/tracking/active', `${storyId}.track.md`);
      if (fs.existsSync(trackFile)) {
        const stat = fs.statSync(trackFile);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 120000) { // 2 分鐘內有更新 = 剛完成
          isPhaseComplete = true;
        }
      }
    }

    // (D) Create-story phase: check if tasks field is non-empty (create-story enriches it)
    if (!isPhaseComplete && pipelinePhase === 'create-story' && row) {
      if (row.status === 'ready-for-dev' || (row.tasks && row.tasks.length > 20)) {
        isPhaseComplete = true;
      }
    }

    // (E) Dev-story fallback: direct DB status check when tracking file doesn't exist
    // FIX 2026-03-30: Fallback (C) only works if tracking file exists.
    // If tracking file is missing (Phase 3 skipped), dev-story windows hang forever.
    // This fallback checks DB status directly — if status is 'review', dev-story is done.
    if (!isPhaseComplete && pipelinePhase.startsWith('dev-story') && row) {
      if (row.status === 'review') {
        isPhaseComplete = true;
      }
    }
  }

  // Diagnostic logging (always, not just on signal)
  const logFile = path.join(path.dirname(signalFile), 'pipeline-auto-exit.log');
  const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' });

  if (isPhaseComplete) {
    // Phase complete — write signal (L1)
    fs.writeFileSync(signalFile, `DONE\n${storyId}\n${row ? row.status : 'report-detected'}\n${new Date().toISOString()}\n`, 'utf8');
    fs.appendFileSync(logFile, `[${ts}] SIGNAL: ${storyId} phase=${pipelinePhase} status=${row ? row.status : 'report-detected'}\n`, 'utf8');
  } else {
    // Log why not complete (diagnostic — only when DB status is close to target)
    if (targets && row) {
      const isTargetStatus = targets.includes(row.status);
      if (isTargetStatus) {
        // Status matches but something else blocked — log for diagnosis
        fs.appendFileSync(logFile, `[${ts}] BLOCKED: ${storyId} phase=${pipelinePhase} status=${row.status} (target matched but fallback checks failed)\n`, 'utf8');
      }
    }
  }

} catch (err) {
  // Log failure for debugging (non-blocking)
  try {
    const logFile = path.join(path.dirname(signalFile), 'pipeline-auto-exit.log');
    const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' });
    fs.appendFileSync(logFile, `[${ts}] ERROR: ${storyId} phase=${pipelinePhase} err=${err.message}\n`, 'utf8');
  } catch (_) { /* truly silent */ }
  process.exit(0);
}
