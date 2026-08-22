#!/usr/bin/env node
// audit-model-string-drift.cjs
//
// Read-only advisory scanner for party-to-pipeline's own docs: finds raw
// Claude model-version strings (e.g. "claude-opus-5[1m]", "Opus 4.8") inside
// SKILL.md + references/*.md, OUTSIDE each file's own Version History
// section, and reports them for human review against the canonical values
// in scripts/pipeline-config.json.
//
// Always exits 0 -- this is advisory, not a commit gate. The schema-level
// commit gate for pipeline-config.json itself is audit-phase-model-mapping.cjs;
// this script is deliberately kept separate so a new advisory finding here
// can never turn into a blocked commit.
//
// Party Mode idempotency ruling (2026-07-25, party-to-pipeline v5.10.0):
// this script only reads and prints -- it never writes -- so it is
// trivially idempotent (running it twice produces identical output and
// zero side effects). Auto-rewrite is explicitly out of scope; see
// SKILL.md Version History v5.10.0 entry.

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', '.claude', 'skills', 'party-to-pipeline');
const CONFIG_PATH = path.join(__dirname, 'pipeline-config.json');

// Tolerates "## Version History", "## 11. Version History", "## §12 Version History".
const VERSION_HISTORY_HEADING_RE = /^#{1,6}\s*(§?\d+\.?\s*)?Version History\s*$/i;

// Raw model_id form: claude-opus-5[1m], claude-sonnet-4-6[1m], claude-haiku-4-5-20251001, ...
const RAW_MODEL_ID_RE = /claude-(opus|sonnet|haiku|fable)-[\w.-]+(\[1m\])?/gi;
// Bare prose tier+version form: "Opus 5", "Sonnet 4.6", "Opus 4.8", ...
const PROSE_TIER_VERSION_RE = /\b(Opus|Sonnet|Haiku|Fable)\s+\d+(\.\d+)?\b/g;

function normalize(raw) {
  return raw
    .toLowerCase()
    .replace(/^claude-/, '')
    .replace(/\[1m\]$/, '')
    .replace(/\s+/g, '-')
    .replace(/\./g, '-');
}

function loadKnownValues() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const known = new Map(); // normalized string -> { source, legacy }

  for (const [phase, entry] of Object.entries(cfg.phaseModelMapping || {})) {
    if (phase.startsWith('_') || !entry || !entry.model_id) continue;
    known.set(normalize(entry.model_id), { source: `phaseModelMapping.${phase}`, legacy: false });
  }

  const presets = (cfg.generalTask || {}).presets || {};
  for (const [name, entry] of Object.entries(presets)) {
    if (!entry || !entry.model_id) continue;
    const isLegacy = /LEGACY/i.test(entry._comment || '');
    known.set(normalize(name), { source: `generalTask.presets.${name}`, legacy: isLegacy });
    const byId = normalize(entry.model_id);
    if (!known.has(byId)) known.set(byId, { source: `generalTask.presets.${name}`, legacy: isLegacy });
  }

  return known;
}

function findVersionHistoryStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (VERSION_HISTORY_HEADING_RE.test(lines[i].trim())) return i;
  }
  return -1;
}

function scanFile(filePath, known) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  const vhStart = findVersionHistoryStart(lines);
  const hits = [];

  lines.forEach((line, idx) => {
    if (vhStart !== -1 && idx >= vhStart) return; // inside Version History -- historical record, skip

    for (const re of [RAW_MODEL_ID_RE, PROSE_TIER_VERSION_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const norm = normalize(m[0]);
        const knownEntry = known.get(norm);
        hits.push({
          line: idx + 1,
          matched: m[0],
          status: knownEntry
            ? (knownEntry.legacy ? `legacy (intentional) -- ${knownEntry.source}` : `current -- ${knownEntry.source}`)
            : 'NOT FOUND in pipeline-config.json -- review needed',
          context: line.trim().slice(0, 140),
        });
      }
    }
  });

  return hits;
}

function main() {
  const known = loadKnownValues();
  const targets = [path.join(SKILL_DIR, 'SKILL.md')];
  const refDir = path.join(SKILL_DIR, 'references');
  for (const f of fs.readdirSync(refDir)) {
    if (f.endsWith('.md')) targets.push(path.join(refDir, f));
  }

  let totalHits = 0;
  let unknownHits = 0;

  console.log('audit-model-string-drift -- advisory, read-only, always exits 0\n');

  for (const file of targets) {
    const hits = scanFile(file, known);
    if (hits.length === 0) continue;
    totalHits += hits.length;
    const rel = path.relative(process.cwd(), file);
    console.log(`\n${rel}`);
    for (const h of hits) {
      const isUnknown = h.status.startsWith('NOT FOUND');
      if (isUnknown) unknownHits++;
      console.log(`  ${isUnknown ? '⚠' : '·'} L${h.line}: "${h.matched}" -> ${h.status}`);
      console.log(`      ${h.context}`);
    }
  }

  console.log(`\n${totalHits} raw model-version mention(s) found outside Version History sections.`);
  console.log(`${unknownHits} not resolvable against pipeline-config.json -- review these first.`);
  console.log('Advisory only. Historical/defect-record prose (dated incident observations, etc.)');
  console.log('can legitimately match here -- use judgment before editing; never rewrite Version History rows.');

  process.exit(0);
}

main();
