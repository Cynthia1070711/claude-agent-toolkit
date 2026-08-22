#!/usr/bin/env node
/**
 * init-ecc-state.cjs - Initialize .context-db/ecc-state/ runtime directory
 *
 * 對齊 ecc-10 Phase 2.1b 分項 2+3 (per .claude/skills/ecc-haiku-dispatch/SKILL.md §Phase 2.1 Plan)
 *
 * Outputs (runtime data · .gitignored):
 *   .context-db/ecc-state/
 *     ├── skill-invocation-state.json
 *     ├── hook-dispatch-state.json
 *     ├── cross-ref-state.json
 *     ├── depth-first-state.json
 *     ├── governance-state.json
 *     ├── parallel-isolation-state.json
 *     ├── capability-integration-state.json
 *     ├── pipeline-handshake-state.json
 *     ├── mcp-payload-state.json
 *     ├── encoding-discipline-state.json
 *     └── dispatch_log.json (append-only · D4 evaluation 統計)
 *
 * Idempotent: skip existing (use --force to overwrite)
 *
 * Run:
 *   node .context-db/scripts/init-ecc-state.cjs           # idempotent
 *   node .context-db/scripts/init-ecc-state.cjs --force   # overwrite all
 *
 * Source-of-truth for 10 instinct list:
 *   .claude/skills/ecc-haiku-dispatch/scripts/IInstinctDispatcher.psm1 $Script:VALID_INSTINCTS
 *   .claude/skills/ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json definitions.InstinctName.enum
 */
'use strict';
const fs = require('fs');
const path = require('path');

const VALID_INSTINCTS = [
  'skill_invocation', 'hook_dispatch', 'cross_ref', 'depth_first',
  'governance', 'parallel_isolation', 'capability_integration',
  'pipeline_handshake', 'mcp_payload', 'encoding_discipline'
];

const INSTINCT_SUPREME_MAP = {
  'skill_invocation':       'skill-tool-invocation-mandatory v1.2.0',
  'hook_dispatch':          'hooks-creation-discipline',
  'cross_ref':              'cross-ref-discipline v1.0.0',
  'depth_first':            'constitutional-depth-first',
  'governance':             'skill-idd-sync-gate + skill-sync-gate',
  'parallel_isolation':     'parallel-batch-conflict-isolation v1.0.0',
  'capability_integration': 'capability-integration-mandate v1.0.0',
  'pipeline_handshake':     'pipeline-handshake-protocol v1.0.0',
  'mcp_payload':            'mcp-payload-discipline v1.0.0',
  'encoding_discipline':    'encoding-discipline v1.0.0'
};

const ECC_STATE_DIR = path.join(__dirname, '..', 'ecc-state');
const FORCE = process.argv.includes('--force');

function nowTaiwan() {
  // 對齊 constitutional-standard §Timestamp Mandate UTC+8
  const sv = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' });
  return sv.replace(' ', 'T') + '+08:00';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  + Created: ${path.relative(process.cwd(), dir)}/`);
    return true;
  }
  console.log(`  . Exists:  ${path.relative(process.cwd(), dir)}/`);
  return false;
}

function writeFileIfMissing(filePath, content, label) {
  const rel = path.relative(process.cwd(), filePath);
  if (fs.existsSync(filePath) && !FORCE) {
    console.log(`  . Skip:    ${rel}`);
    return false;
  }
  // UTF-8 No-BOM (對齊 phycool-windows-ps-encoding §3.2 + crlf-normalize-discipline §3.1)
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  console.log(`  + ${label}: ${rel}`);
  return true;
}

function buildInstinctStateTemplate(instinctName) {
  return {
    schema_version: '1.0.0',
    instinct_name: instinctName,
    rule_applied: INSTINCT_SUPREME_MAP[instinctName],
    initialized_at: nowTaiwan(),
    last_dispatch: null,
    dispatch_count: 0,
    success_count: 0,
    failure_count: 0,
    partial_count: 0,
    history: []
  };
}

function buildDispatchLogSkeleton() {
  return {
    schema_version: '1.0.0',
    initialized_at: nowTaiwan(),
    description: 'Append-only dispatch log for Stage β D4 evaluation (success_rate / latency / token_cost)',
    entries: []
  };
}

function main() {
  console.log('▶ ecc-10 Phase 2.1b · init-ecc-state.cjs');
  console.log(`  Mode: ${FORCE ? 'FORCE overwrite' : 'idempotent skip existing'}`);
  console.log('');

  // Step 1: ensure directory
  ensureDir(ECC_STATE_DIR);

  let created = 0;
  let skipped = 0;

  // Step 2: 10 instinct state file templates (kebab-case · 對齊 PSM1 Get-StateFilePath)
  for (const instinct of VALID_INSTINCTS) {
    const kebab = instinct.replace(/_/g, '-');
    const filePath = path.join(ECC_STATE_DIR, `${kebab}-state.json`);
    const template = buildInstinctStateTemplate(instinct);
    const ok = writeFileIfMissing(filePath, JSON.stringify(template, null, 2) + '\n', 'State template');
    if (ok) created++; else skipped++;
  }

  // Step 3: dispatch_log.json append-only log skeleton
  const logPath = path.join(ECC_STATE_DIR, 'dispatch_log.json');
  const ok = writeFileIfMissing(logPath, JSON.stringify(buildDispatchLogSkeleton(), null, 2) + '\n', 'Log skeleton');
  if (ok) created++; else skipped++;

  console.log('');
  console.log(`▶ Summary: ${created} created, ${skipped} skipped (total ${created + skipped} files)`);

  process.exit(0);
}

main();
