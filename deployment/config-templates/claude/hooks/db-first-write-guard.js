#!/usr/bin/env node
/**
 * db-first-write-guard.js — PostToolUse hook (matcher: Edit|Write)
 *
 * PhyCool db-first-no-md-mirror policy enforcement (advisory only, no block).
 *
 * Detects Write/Edit operations on docs/implementation-artifacts/stories/**\/*.md
 * and injects additionalContext reminding Claude that Story structured data
 * should live in Context Memory DB (stories table via upsert-story.js), not as
 * .md mirror files.
 *
 * Background: 2026-04-14 incident — Claude generated .md mirror of Story
 * data despite DB being SSoT, causing dual-source drift. Policy documented
 * in .claude/rules/db-first-no-md-mirror.md (2026-05-16 compressed).
 *
 * Behavior: advisory only — never blocks, never throws. If DB or filesystem
 * unavailable, silent pass-through.
 *
 * Registration in settings.json:
 *   "PostToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/db-first-write-guard.js",
 *       "timeout": 3000
 *     }]
 *   }]
 */

const path = require('path');

// Trigger pattern: docs/.../stories/.../filename.md (excluding README/index)
const STORY_MD_PATTERN = /docs[\\/]implementation-artifacts[\\/]stories[\\/].+\.md$/i;

// Skip filenames (intentional non-Story docs)
const SKIP_FILENAMES = new Set([
  'readme.md',
  'index.md',
  'epic.md',
  'epic-overview.md',
  'epic-summary.md',
]);

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Malformed input — silent pass
    process.exit(0);
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  // Only fire on Story .md pattern
  if (!STORY_MD_PATTERN.test(filePath)) process.exit(0);

  // Skip intentional non-Story docs
  const filename = path.basename(filePath).toLowerCase();
  if (SKIP_FILENAMES.has(filename)) process.exit(0);

  // Extract story_id from filename (basename without extension)
  const storyId = path.basename(filename, '.md');

  // Advisory injection (declarative, not imperative — avoid prompt injection defense)
  const note = `The file ${filePath} appears to be a Story spec .md file. ` +
    `Per .claude/rules/db-first-no-md-mirror.md (2026-04-14 incident), Story structured data (AC / Tasks / Dev Notes / status) lives in Context Memory DB stories table, accessed via upsert-story.js with source_file=context-db://stories/${storyId}. ` +
    `Generating .md mirror files for Story specs is FORBIDDEN since DB is SSoT and DevConsole at tools/dev-console provides query UI. ` +
    `If this write is intentional non-Story documentation (e.g., spec / runbook / ADR — not Story spec mirror), this advisory can be ignored. ` +
    `Otherwise: use 'node .context-db/scripts/upsert-story.js --story-id ${storyId} --status backlog' to write to DB.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[db-first-write-guard] ${err.message}\n`);
  process.exit(0);
});
