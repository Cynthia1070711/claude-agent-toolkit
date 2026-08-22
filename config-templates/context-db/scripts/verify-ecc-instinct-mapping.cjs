#!/usr/bin/env node
/**
 * verify-ecc-instinct-mapping.cjs - 3-source round-trip verify 10 instinct × INSTINCT_SUPREME_MAP
 *
 * 對齊 ecc-10 Phase 2.1b 分項 6 (per .claude/skills/ecc-haiku-dispatch/SKILL.md §Phase 2.1 Plan)
 *
 * Cross-source alignment check:
 *   Source A: JSON schema InstinctName enum
 *     (.claude/skills/ecc-haiku-dispatch/contracts/instinct-dispatch.schema.json)
 *   Source B: PSM1 VALID_INSTINCTS + INSTINCT_SUPREME_MAP
 *     (.claude/skills/ecc-haiku-dispatch/scripts/IInstinctDispatcher.psm1)
 *   Source C: State files
 *     (.context-db/ecc-state/*-state.json · init-ecc-state.cjs 產生)
 *
 * Drift detection:
 *   - Schema InstinctName enum ↔ PSM1 VALID_INSTINCTS (must equal · size 10)
 *   - PSM1 VALID_INSTINCTS ↔ PSM1 INSTINCT_SUPREME_MAP keys (must equal · 1-to-1)
 *   - PSM1 VALID_INSTINCTS ↔ State files (informational · 若 state 未 init 印 hint)
 *
 * Exit: 0 = aligned, 1 = drift detected
 *
 * Run:
 *   node .context-db/scripts/verify-ecc-instinct-mapping.cjs
 *   node .context-db/scripts/verify-ecc-instinct-mapping.cjs --json   # JSON output
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCHEMA = path.join(REPO_ROOT, '.claude', 'skills', 'ecc-haiku-dispatch', 'contracts', 'instinct-dispatch.schema.json');
const PSM1 = path.join(REPO_ROOT, '.claude', 'skills', 'ecc-haiku-dispatch', 'scripts', 'IInstinctDispatcher.psm1');
const STATE_DIR = path.join(REPO_ROOT, '.context-db', 'ecc-state');

const JSON_OUT = process.argv.includes('--json');

function normalizeCRLF(s) {
  // 對齊 crlf-normalize-discipline §3.1
  return s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function readSchemaInstincts() {
  const raw = normalizeCRLF(fs.readFileSync(SCHEMA, 'utf8'));
  const obj = JSON.parse(raw);
  const enumList = obj.definitions && obj.definitions.InstinctName && obj.definitions.InstinctName.enum;
  if (!Array.isArray(enumList)) throw new Error('Schema InstinctName.enum not found or not array');
  return new Set(enumList);
}

function readPsmInstincts() {
  const content = normalizeCRLF(fs.readFileSync(PSM1, 'utf8'));
  const m = content.match(/\$Script:VALID_INSTINCTS\s*=\s*@\(([\s\S]*?)\)/);
  if (!m) throw new Error('VALID_INSTINCTS not found in PSM1');
  const list = m[1]
    .split(/[,\n]/)
    .map(s => s.trim().replace(/^['"]|['"]$/g, '').replace(/['"]/g, ''))
    .filter(s => s.length > 0 && /^[a-z_]+$/.test(s));
  return new Set(list);
}

function readPsmSupremeMap() {
  const content = normalizeCRLF(fs.readFileSync(PSM1, 'utf8'));
  const m = content.match(/\$Script:INSTINCT_SUPREME_MAP\s*=\s*@\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('INSTINCT_SUPREME_MAP not found in PSM1');
  const map = {};
  m[1].split('\n').forEach(line => {
    const e = line.match(/^\s*'([^']+)'\s*=\s*'([^']+)'/);
    if (e) map[e[1]] = e[2];
  });
  return map;
}

function readStateFileInstincts() {
  if (!fs.existsSync(STATE_DIR)) return new Set();
  const files = fs.readdirSync(STATE_DIR).filter(f => /-state\.json$/.test(f));
  return new Set(files.map(f => f.replace(/-state\.json$/, '').replace(/-/g, '_')));
}

function diff(a, b) {
  return {
    onlyA: [...a].filter(x => !b.has(x)),
    onlyB: [...b].filter(x => !a.has(x))
  };
}

function main() {
  const result = {
    timestamp: new Date().toISOString(),
    sources: {},
    checks: [],
    drift: false
  };

  try {
    const schema = readSchemaInstincts();
    const psm = readPsmInstincts();
    const psmMap = readPsmSupremeMap();
    const stateFiles = readStateFileInstincts();

    result.sources = {
      schema: { count: schema.size, items: [...schema].sort() },
      psm_valid: { count: psm.size, items: [...psm].sort() },
      psm_map: { count: Object.keys(psmMap).length, mapping: psmMap },
      state_files: { count: stateFiles.size, items: [...stateFiles].sort() }
    };

    if (!JSON_OUT) {
      console.log('▶ ecc-10 Phase 2.1b · verify-ecc-instinct-mapping.cjs');
      console.log('');
      console.log(`  Source A (Schema InstinctName.enum): ${schema.size} instincts`);
      console.log(`  Source B (PSM1 VALID_INSTINCTS):     ${psm.size} instincts`);
      console.log(`  Source B (PSM1 SUPREME MAP keys):    ${Object.keys(psmMap).length} mappings`);
      console.log(`  Source C (State files):              ${stateFiles.size} files ${stateFiles.size === 0 ? '(run init-ecc-state.cjs to populate)' : ''}`);
      console.log('');
    }

    // Check 1: Schema ↔ PSM1 VALID_INSTINCTS
    const d1 = diff(schema, psm);
    const c1 = { name: 'Schema ↔ PSM1 VALID', aligned: d1.onlyA.length === 0 && d1.onlyB.length === 0, diff: d1 };
    result.checks.push(c1);
    if (!c1.aligned) result.drift = true;
    if (!JSON_OUT) {
      if (c1.aligned) console.log(`  [PASS] Check 1 — Schema ↔ PSM1 VALID (${schema.size} instincts)`);
      else console.error(`  [FAIL] Check 1 — Schema vs PSM1 VALID drift: only Schema=[${d1.onlyA.join(',')}] only PSM=[${d1.onlyB.join(',')}]`);
    }

    // Check 2: PSM1 VALID ↔ MAP keys
    const mapKeys = new Set(Object.keys(psmMap));
    const d2 = diff(psm, mapKeys);
    const c2 = { name: 'PSM1 VALID ↔ MAP keys', aligned: d2.onlyA.length === 0 && d2.onlyB.length === 0, diff: d2 };
    result.checks.push(c2);
    if (!c2.aligned) result.drift = true;
    if (!JSON_OUT) {
      if (c2.aligned) console.log(`  [PASS] Check 2 — PSM1 VALID ↔ MAP (${psm.size} instincts 1-to-1)`);
      else console.error(`  [FAIL] Check 2 — VALID vs MAP drift: only VALID=[${d2.onlyA.join(',')}] only MAP=[${d2.onlyB.join(',')}]`);
    }

    // Check 3: PSM1 VALID ↔ State files (informational if state not init)
    if (stateFiles.size > 0) {
      const d3 = diff(psm, stateFiles);
      const c3 = { name: 'PSM1 VALID ↔ State files', aligned: d3.onlyA.length === 0 && d3.onlyB.length === 0, diff: d3 };
      result.checks.push(c3);
      if (!c3.aligned) result.drift = true;
      if (!JSON_OUT) {
        if (c3.aligned) console.log(`  [PASS] Check 3 — PSM1 VALID ↔ State files (${psm.size} instincts)`);
        else console.error(`  [FAIL] Check 3 — VALID vs State drift: only VALID=[${d3.onlyA.join(',')}] only State=[${d3.onlyB.join(',')}]`);
      }
    } else if (!JSON_OUT) {
      console.log(`  [INFO] Check 3 — State files not initialized (run: node .context-db/scripts/init-ecc-state.cjs)`);
    }

    if (!JSON_OUT) {
      console.log('');
      console.log('▶ INSTINCT_SUPREME_MAP table (10 mappings):');
      const maxNameLen = Math.max(...Object.keys(psmMap).map(k => k.length));
      for (const [instinct, rule] of Object.entries(psmMap)) {
        console.log(`  ${instinct.padEnd(maxNameLen + 2)} → ${rule}`);
      }
      console.log('');
      console.log(`▶ Result: ${result.drift ? 'DRIFT DETECTED (exit 1)' : 'ALL ALIGNED (exit 0)'}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(result.drift ? 1 : 0);
  } catch (err) {
    if (JSON_OUT) {
      console.log(JSON.stringify({ error: err.message, drift: true }, null, 2));
    } else {
      console.error(`[ERROR] ${err.message}`);
    }
    process.exit(2);
  }
}

main();
