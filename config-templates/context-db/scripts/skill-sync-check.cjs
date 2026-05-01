#!/usr/bin/env node
/**
 * Skill Sync Check — Automated skill impact detection
 *
 * Given a story_id, checks if the story's file changes affect any PCPT skills.
 * Returns affected skills list with matched concepts.
 *
 * Usage:
 *   node skill-sync-check.js --story-id fix8-04-remittance-enum-migration
 *   node skill-sync-check.js --files "Models/Enums/RemittanceStatus.cs,Services/BackOffice/RemittanceReviewService.cs"
 *   node skill-sync-check.js --git-diff HEAD~1   # from git diff
 *
 * Output: JSON { affected: [...], status: "SYNC_NEEDED" | "SYNC_OK" }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const skillsDir = path.join(projectRoot, '.claude', 'skills');

// Change type patterns that trigger skill sync (from skill-sync-gate.md)
const TRIGGER_PATTERNS = [
  /Migrations\/.*\.cs$/,
  /Models\/.*\.cs$/,
  /Services\/.*Service\.cs$/,
  /Services\/.*Policy\.cs$/,
  /Convention.*\.cs$/,
  /Route.*\.cs$/,
  /Middleware\/.*\.cs$/,
  /Controllers\/.*\.cs$/,
  /components\/.*\.tsx$/,
  /stores\/.*\.ts$/,
  /Identity\//,
  /Auth/,
  /appsettings.*\.json$/,
  /\.csproj$/,
];

// Extract key concepts from file paths for grep matching
function extractConcepts(files) {
  const concepts = new Set();
  for (const f of files) {
    // Extract class/entity names from path
    const basename = path.basename(f, path.extname(f));

    // Skip test files for concept extraction
    if (f.includes('.Tests/') || f.includes('.test.')) continue;

    // Extract meaningful names
    if (basename.match(/^[A-Z]/)) {
      concepts.add(basename);
      // Also add partial matches for compound names (e.g., RemittanceStatus → Remittance)
      const parts = basename.match(/[A-Z][a-z]+/g);
      if (parts && parts.length >= 2) {
        concepts.add(parts.slice(0, 2).join(''));
      }
    }

    // Extract directory-level concepts
    const dirMatch = f.match(/Services\/(?:BackOffice|Business|Infrastructure)\/(\w+)/);
    if (dirMatch) concepts.add(dirMatch[1]);

    const modelMatch = f.match(/Models\/(?:Enums\/)?(\w+)/);
    if (modelMatch) concepts.add(modelMatch[1]);

    const mwMatch = f.match(/Middleware\/(\w+)/);
    if (mwMatch) concepts.add(mwMatch[1]);
  }
  return [...concepts].filter(c => c.length >= 4); // min 4 chars to avoid noise
}

// Check if files trigger skill sync
function shouldTriggerSync(files) {
  return files.some(f => TRIGGER_PATTERNS.some(p => p.test(f)));
}

// Grep a concept against all PCPT skills
function grepSkills(concept) {
  const hits = [];
  try {
    const skillDirs = fs.readdirSync(skillsDir).filter(d =>
      d.startsWith('pcpt-') && fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))
    );

    for (const dir of skillDirs) {
      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');

      // Case-insensitive search
      if (content.toLowerCase().includes(concept.toLowerCase())) {
        // Find the line number for context
        const lines = content.split('\n');
        const matchLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(concept.toLowerCase())) {
            matchLines.push(i + 1);
            if (matchLines.length >= 3) break; // max 3 line refs per skill
          }
        }
        hits.push({
          skill: dir,
          concept: concept,
          lines: matchLines,
        });
      }
    }
  } catch (err) {
    // Silent
  }
  return hits;
}

// Main
function main() {
  const args = process.argv.slice(2);
  let files = [];

  // Parse args
  if (args.includes('--story-id')) {
    const storyId = args[args.indexOf('--story-id') + 1];
    try {
      const Database = require(path.join(__dirname, '../node_modules/better-sqlite3'));
      const db = new Database(path.join(__dirname, '../context-memory.db'), { readonly: true });
      const row = db.prepare('SELECT file_list, affected_files FROM stories WHERE story_id = ?').get(storyId);
      db.close();
      if (row) {
        const raw = row.file_list || row.affected_files || '';
        files = raw.split(/[,\n]/).map(f => f.trim()).filter(Boolean);
      }
    } catch (err) {
      console.error(JSON.stringify({ error: `DB query failed: ${err.message}` }));
      process.exit(1);
    }
  } else if (args.includes('--files')) {
    const fileStr = args[args.indexOf('--files') + 1];
    files = fileStr.split(',').map(f => f.trim()).filter(Boolean);
  } else if (args.includes('--git-diff')) {
    const ref = args[args.indexOf('--git-diff') + 1] || 'HEAD~1';
    try {
      const output = execSync(`git diff --name-only ${ref} HEAD`, { cwd: projectRoot, encoding: 'utf8' });
      files = output.split('\n').map(f => f.trim()).filter(Boolean);
    } catch (err) {
      console.error(JSON.stringify({ error: `git diff failed: ${err.message}` }));
      process.exit(1);
    }
  } else {
    console.error(JSON.stringify({ error: 'Usage: --story-id ID | --files "a.cs,b.cs" | --git-diff REF' }));
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(JSON.stringify({ affected: [], status: 'SYNC_OK', reason: 'no files' }));
    return;
  }

  // Check if files trigger sync
  if (!shouldTriggerSync(files)) {
    console.log(JSON.stringify({ affected: [], status: 'SYNC_OK', reason: 'no trigger patterns matched' }));
    return;
  }

  // Extract concepts and grep skills
  const concepts = extractConcepts(files);
  const allHits = [];
  const seen = new Set();

  for (const concept of concepts) {
    const hits = grepSkills(concept);
    for (const hit of hits) {
      const key = `${hit.skill}:${hit.concept}`;
      if (!seen.has(key)) {
        seen.add(key);
        allHits.push(hit);
      }
    }
  }

  // Deduplicate by skill
  const bySkill = {};
  for (const hit of allHits) {
    if (!bySkill[hit.skill]) {
      bySkill[hit.skill] = { skill: hit.skill, concepts: [], lines: [] };
    }
    bySkill[hit.skill].concepts.push(hit.concept);
    bySkill[hit.skill].lines.push(...hit.lines);
  }

  const affected = Object.values(bySkill).map(s => ({
    ...s,
    lines: [...new Set(s.lines)].sort((a, b) => a - b).slice(0, 5),
    concepts: [...new Set(s.concepts)],
  }));

  const status = affected.length > 0 ? 'SYNC_NEEDED' : 'SYNC_OK';
  console.log(JSON.stringify({ affected, status, file_count: files.length, concept_count: concepts.length }, null, 2));
}

main();
