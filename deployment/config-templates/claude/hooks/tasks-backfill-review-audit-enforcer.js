#!/usr/bin/env node
/**
 * tasks-backfill-review-audit-enforcer.js — PreToolUse hook (matcher: Bash)
 *
 * PhyCool tasks-backfill-verify v2.0.0 §Two-Stage SOP enforcement (hard-block).
 *
 * Detects `upsert-story.js --inline ... status=done` (review phase finalization).
 * Validates tasks payload contains review markers per v2.0.0 SOP:
 *   - ✅✅ double-check + [R-verified @ ts] annotation, OR
 *   - ❌ reject marker (CR finding)
 * If markers absent → exit 2 (BLOCK) + stderr.
 *
 * Background: 2026-05-16 user incident — review agent saw existing dev ✅
 * and skipped file:line audit, equivalent to review failing its purpose.
 * Stop-hook D22 fix protects ACK validation; this hook catches BEFORE write.
 *
 * Alignment:
 *   - tasks-backfill-verify SKILL v2.0.0 §Two-Stage SOP F1/F2
 *   - stop-report.ps1 D22 fix (review strict marker check)
 *
 * Behavior: hard-block on detection, fail-open on any error.
 *
 * Bypass: PHYCOOL_BACKFILL_BYPASS=1 ENV var (emergency only).
 *
 * Registration in settings.json:
 *   "PreToolUse": [{
 *     "matcher": "Bash",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/tasks-backfill-review-audit-enforcer.js",
 *       "timeout": 3000
 *     }]
 *   }]
 *
 * 2026-05-16 deployed for PhyCool env-optimization P0-5.
 */
'use strict';

const STDIN_TIMEOUT_MS = 1500;
const MAX_STDIN_BYTES = 256 * 1024;

// Detect upsert-story.js status=done writes (review phase final)
const UPSERT_STATUS_DONE_PATTERN = /upsert-story\.(?:c?js|mjs)[\s\S]+?(?:"status"\s*:\s*"done"|--status\s+done)/;
const CHECK_EMOJI = '✅';                  // ✅
const DOUBLE_CHECK = CHECK_EMOJI + CHECK_EMOJI; // ✅✅
const REJECT_EMOJI = '❌';                  // ❌
const R_VERIFIED_PATTERN = /\[R-verified @ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    let bytes = 0;
    const timer = setTimeout(() => {
      try { process.stdin.removeAllListeners(); process.stdin.pause(); } catch {}
      resolve(data);
    }, STDIN_TIMEOUT_MS);
    try { process.stdin.setEncoding('utf8'); } catch {}
    process.stdin.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes < MAX_STDIN_BYTES) data += chunk;
    });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  try { return JSON.parse(trimmed); } catch { return null; }
}

(async () => {
  // Emergency bypass
  if (process.env.PHYCOOL_BACKFILL_BYPASS === '1') process.exit(0);

  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const data = parseJsonSafe(raw) || {};

  // Only PreToolUse Bash
  if (data.hook_event_name !== 'PreToolUse') process.exit(0);
  if (data.tool_name !== 'Bash') process.exit(0);

  const command = (data.tool_input?.command || '').trim();
  if (!command) process.exit(0);

  // Trigger: upsert-story.js with status=done
  if (!UPSERT_STATUS_DONE_PATTERN.test(command)) process.exit(0);

  // Extract --inline JSON payload
  const inlineMatch = command.match(/--inline\s+'([\s\S]*?)'(?:\s|$)/) ||
                      command.match(/--inline\s+"([\s\S]*?)"(?:\s|$)/);
  if (!inlineMatch) {
    // No inline payload to inspect (e.g., status update only); fail-open
    // stop-report.ps1 D22 fix will catch via ACK validation
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(inlineMatch[1]);
  } catch {
    process.exit(0); // Malformed JSON; let upsert-story.js validate
  }

  const tasks = payload.tasks;
  if (!tasks || typeof tasks !== 'string') {
    // tasks not in this upsert; metadata-only update, allow
    process.exit(0);
  }

  // Check v2.0.0 review markers
  const hasDoubleCheck = tasks.indexOf(DOUBLE_CHECK) !== -1;
  const hasReviewVerified = R_VERIFIED_PATTERN.test(tasks);
  const hasReject = tasks.indexOf(REJECT_EMOJI) !== -1;

  // Valid if (double-check + [R-verified]) OR (reject finding)
  const reviewMarkersValid = (hasDoubleCheck && hasReviewVerified) || hasReject;

  if (!reviewMarkersValid) {
    process.stderr.write(
      '\n[tasks-backfill-review-audit-enforcer] BLOCK: review tasks missing required marker\n\n' +
      'Per tasks-backfill-verify SKILL v2.0.0 §Two-Stage SOP F1/F2, review-phase tasks must contain:\n' +
      '  (a) Double-check marker + R-verified annotation, e.g.:\n' +
      '      - ' + DOUBLE_CHECK + ' **1.1** desc (file:line) [R-verified @ 2026-05-16T22:00:00+08:00]\n' +
      '  OR (b) Reject marker + CR finding, e.g.:\n' +
      '      - ' + REJECT_EMOJI + ' **1.1** desc (expected X actual Y)\n\n' +
      'Detected: double_check=' + hasDoubleCheck +
      ' | r_verified=' + hasReviewVerified +
      ' | reject=' + hasReject + '\n\n' +
      'STOP. Re-invoke Skill(skill="tasks-backfill-verify") and run Step 7 review audit.\n' +
      'Emergency bypass: PHYCOOL_BACKFILL_BYPASS=1\n'
    );
    process.exit(2);
  }

  process.exit(0);
})().catch(err => {
  // Fail-open: any unexpected error → silent pass (never break workflow)
  process.stderr.write('[tasks-backfill-review-audit-enforcer] hook error: ' + err.message + '\n');
  process.exit(0);
});
