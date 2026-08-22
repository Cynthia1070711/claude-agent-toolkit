#!/usr/bin/env node
/**
 * detect-rule-violation-hint.js — Stop Hook (Phase 3: L1 Observer) — THIN SHIM
 *
 * v2.0.0 (2026-04-21 Round-5 rescue): Wrapper reduced to minimal shim.
 * All runtime logic (readStdinAsync, writeAndExit, runMain) lives in
 * `.context-db/scripts/detect-rule-violation-core.cjs` for vitest coverage.
 *
 * This file's only responsibilities:
 *   1. Locate + require the core module (fail-open if missing)
 *   2. Invoke core.runMain() when executed directly (never when imported)
 *
 * Story: td-rule-violation-auto-detect-hook (epic-ctr)
 *   TD-CTR-RVH-002 resolved 2026-04-21 Round-5 — wrapper coverage via core extraction
 */

'use strict';

const path = require('node:path');

const CORE_PATH = path.resolve(__dirname, '..', '..', '.context-db', 'scripts', 'detect-rule-violation-core.cjs');

let core;
try {
  core = require(CORE_PATH);
} catch {
  // Core unavailable → silent exit, never break Stop chain
  process.exit(0);
}

if (require.main === module) {
  core.runMain().catch(() => process.exit(0));
}

module.exports = core;
