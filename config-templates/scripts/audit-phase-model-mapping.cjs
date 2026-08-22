#!/usr/bin/env node
/**
 * audit-phase-model-mapping.cjs
 *
 * Validates scripts/pipeline-config.json phaseModelMapping SSoT (BR-MR-08).
 * Checks:
 *   - All 5 required phases present (create-story/dev-story/code-review/dev-story-fix-Rn/subagent)
 *   - Each phase has model_id + effort + model_alias + reasoning + estimated_cost_usd (4 complexity)
 *   - model_id contains [1m] suffix (Haiku exempt: claude-haiku-4-5-20251001)
 *   - model_purity_enforcement has match_mode='full_model_id' + strict_effort=true
 *   - Aligned with pipeline-config.json current state
 *
 * Usage:
 *   node scripts/audit-phase-model-mapping.cjs            # advisory
 *   node scripts/audit-phase-model-mapping.cjs --md > report.md  # human readable
 *   node scripts/audit-phase-model-mapping.cjs --json     # machine readable
 *   node scripts/audit-phase-model-mapping.cjs --strict   # exit 1 if any violation
 *
 * Exit codes:
 *   0 = all checks pass / advisory mode
 *   1 = strict mode + violation found
 *   2 = parse / IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'scripts/pipeline-config.json');

const REQUIRED_PHASES = ['create-story', 'dev-story', 'code-review', 'dev-story-fix-Rn', 'subagent'];
const REQUIRED_COMPLEXITY = ['S', 'M', 'L', 'XL'];
const HAIKU_EXEMPT_MODEL = 'claude-haiku-4-5-20251001';
const MODEL_1M_SUFFIX_RE = /\[1m\]$/;

// ─────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { json: false, md: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--md') args.md = true;
    else if (argv[i] === '--strict') args.strict = true;
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Validation logic
// ─────────────────────────────────────────────────────────────

function validatePhaseMapping(mapping) {
  const issues = [];
  const passed = [];

  // Check all 5 required phases
  for (const phase of REQUIRED_PHASES) {
    const entry = mapping[phase];
    if (!entry) {
      issues.push({ phase, field: 'phase', msg: `Missing phase: ${phase}` });
      continue;
    }

    // model_id required
    if (!entry.model_id) {
      issues.push({ phase, field: 'model_id', msg: `${phase}: missing model_id` });
    } else {
      // [1m] suffix required (except Haiku)
      const isHaiku = entry.model_id === HAIKU_EXEMPT_MODEL;
      if (!isHaiku && !MODEL_1M_SUFFIX_RE.test(entry.model_id)) {
        issues.push({ phase, field: 'model_id', msg: `${phase}: model_id "${entry.model_id}" missing [1m] suffix (Haiku exempt)` });
      } else {
        passed.push({ phase, field: 'model_id', value: entry.model_id });
      }
    }

    // effort required (max | default)
    if (!entry.effort) {
      issues.push({ phase, field: 'effort', msg: `${phase}: missing effort` });
    } else if (!['max', 'default'].includes(entry.effort)) {
      issues.push({ phase, field: 'effort', msg: `${phase}: effort must be 'max' or 'default', got '${entry.effort}'` });
    } else {
      passed.push({ phase, field: 'effort', value: entry.effort });
    }

    // model_alias required
    if (!entry.model_alias) {
      issues.push({ phase, field: 'model_alias', msg: `${phase}: missing model_alias` });
    } else {
      passed.push({ phase, field: 'model_alias', value: entry.model_alias });
    }

    // reasoning required
    if (!entry.reasoning) {
      issues.push({ phase, field: 'reasoning', msg: `${phase}: missing reasoning` });
    } else {
      passed.push({ phase, field: 'reasoning', value: entry.reasoning.slice(0, 40) + '...' });
    }

    // estimated_cost_usd with 4 complexity tiers
    if (!entry.estimated_cost_usd) {
      issues.push({ phase, field: 'estimated_cost_usd', msg: `${phase}: missing estimated_cost_usd` });
    } else {
      for (const c of REQUIRED_COMPLEXITY) {
        if (typeof entry.estimated_cost_usd[c] !== 'number' || entry.estimated_cost_usd[c] <= 0) {
          issues.push({ phase, field: `estimated_cost_usd.${c}`, msg: `${phase}: estimated_cost_usd.${c} must be number > 0` });
        } else {
          passed.push({ phase, field: `cost_${c}`, value: `$${entry.estimated_cost_usd[c]}` });
        }
      }
    }
  }

  return { issues, passed };
}

function validateModelPurity(enforcement) {
  const issues = [];
  const passed = [];

  if (!enforcement) {
    issues.push({ field: 'model_purity_enforcement', msg: 'model_purity_enforcement section missing' });
    return { issues, passed };
  }

  if (enforcement.match_mode !== 'full_model_id') {
    issues.push({ field: 'match_mode', msg: `model_purity_enforcement.match_mode must be 'full_model_id', got '${enforcement.match_mode}'` });
  } else {
    passed.push({ field: 'match_mode', value: enforcement.match_mode });
  }

  if (enforcement.strict_effort !== true) {
    issues.push({ field: 'strict_effort', msg: `model_purity_enforcement.strict_effort must be true, got '${enforcement.strict_effort}'` });
  } else {
    passed.push({ field: 'strict_effort', value: String(enforcement.strict_effort) });
  }

  if (enforcement.allowFallback !== false) {
    issues.push({ field: 'allowFallback', msg: `model_purity_enforcement.allowFallback must be false (backward compat)` });
  } else {
    passed.push({ field: 'allowFallback', value: String(enforcement.allowFallback) });
  }

  if (!Array.isArray(enforcement.exempt_models) || !enforcement.exempt_models.includes(HAIKU_EXEMPT_MODEL)) {
    issues.push({ field: 'exempt_models', msg: `model_purity_enforcement.exempt_models must include '${HAIKU_EXEMPT_MODEL}'` });
  } else {
    passed.push({ field: 'exempt_models', value: enforcement.exempt_models.join(', ') });
  }

  return { issues, passed };
}

// ─────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────

function formatMd(cfg, mappingResult, purityResult, passed) {
  const ts = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
  const lines = [
    `# Pipeline Phase Model Mapping Audit — ${ts}`,
    '',
    '## phaseModelMapping (5 phases)',
    '',
    '| Phase | model_id | effort | S cost | M cost | L cost | XL cost |',
    '|:---:|:---|:---:|:---:|:---:|:---:|:---:|',
  ];

  for (const phase of REQUIRED_PHASES) {
    const e = cfg.phaseModelMapping?.[phase] || {};
    const cu = e.estimated_cost_usd || {};
    lines.push(`| \`${phase}\` | \`${e.model_id || 'MISSING'}\` | ${e.effort || 'MISSING'} | $${cu.S || '?'} | $${cu.M || '?'} | $${cu.L || '?'} | $${cu.XL || '?'} |`);
  }

  lines.push('', '## model_purity_enforcement', '');
  const mp = cfg.model_purity_enforcement || {};
  lines.push(`| match_mode | strict_effort | allowFallback | exempt_models |`);
  lines.push(`|:---|:---:|:---:|:---|`);
  lines.push(`| ${mp.match_mode || 'MISSING'} | ${mp.strict_effort} | ${mp.allowFallback} | ${(mp.exempt_models || []).join(', ')} |`);

  const totalIssues = mappingResult.issues.length + purityResult.issues.length;
  lines.push('', `## Audit Result: **${passed ? '✅ PASS' : '❌ FAIL'}** (${totalIssues} issue${totalIssues !== 1 ? 's' : ''})`);

  if (totalIssues > 0) {
    lines.push('', '### Issues');
    [...mappingResult.issues, ...purityResult.issues].forEach(i => lines.push(`- ❌ ${i.msg}`));
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`[audit-phase-model-mapping] Failed to read ${CONFIG_PATH}: ${e.message}`);
    process.exit(2);
  }

  if (!cfg.phaseModelMapping) {
    console.error('[audit-phase-model-mapping] phaseModelMapping section missing from pipeline-config.json');
    process.exit(args.strict ? 1 : 0);
  }

  const mappingResult = validatePhaseMapping(cfg.phaseModelMapping);
  const purityResult = validateModelPurity(cfg.model_purity_enforcement);

  const totalIssues = mappingResult.issues.length + purityResult.issues.length;
  const passed = totalIssues === 0;

  if (args.md) {
    console.log(formatMd(cfg, mappingResult, purityResult, passed));
    process.exit(args.strict && !passed ? 1 : 0);
  }

  if (args.json) {
    console.log(JSON.stringify({
      passed,
      total_issues: totalIssues,
      phase_mapping_issues: mappingResult.issues,
      purity_issues: purityResult.issues,
      phases: REQUIRED_PHASES.map(p => ({
        phase: p,
        ...cfg.phaseModelMapping[p]
      })),
      model_purity_enforcement: cfg.model_purity_enforcement
    }, null, 2));
    process.exit(args.strict && !passed ? 1 : 0);
  }

  // Default text output
  if (passed) {
    console.log(`✅ audit-phase-model-mapping PASS — 5 phases × 4 complexity complete, match_mode=full_model_id, strict_effort=true`);
    REQUIRED_PHASES.forEach(p => {
      const e = cfg.phaseModelMapping[p];
      console.log(`  ${p}: ${e.model_id} (effort=${e.effort})`);
    });
  } else {
    console.log(`❌ audit-phase-model-mapping FAIL — ${totalIssues} issue${totalIssues !== 1 ? 's' : ''}`);
    [...mappingResult.issues, ...purityResult.issues].forEach(i => console.log(`  ❌ ${i.msg}`));
  }

  process.exit(args.strict && !passed ? 1 : 0);
}

module.exports = { validatePhaseMapping, validateModelPurity, REQUIRED_PHASES, REQUIRED_COMPLEXITY, HAIKU_EXEMPT_MODEL };

if (require.main === module) {
  main();
}
