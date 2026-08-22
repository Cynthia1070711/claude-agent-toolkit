// depth-gate-heuristics.js — bwu-8-gate-regex-and-audit-heuristics AC3/AC4
//
// D3 spec-ref harvesting and D1 skill classification, extracted out of
// run-depth-gate.js so both carry a regression test — same reason
// testing-strategy-structure.js was extracted for D7: run-depth-gate.js calls
// main() unconditionally at load time (no `isMain` guard, unlike
// test-spec-audit.js / upsert-story.js), so nothing inside it is importable.
//
// D3 (harvestSpecRefs): replaces a `docs/[\w\-./]+\.md` regex — which can never
// match a non-ASCII path (character class excludes Han script) and hard-codes a
// `docs/` prefix this project's actual SSoT paths don't share — with a harvest-
// then-verify design: collect path-shaped candidates from the text, let the
// filesystem be the judge. Precision comes from existence, not from guessing at
// a character class.
//
// D1 (classifySkillRefs / buildSkillReadReport): a required_skill is "modify"
// only when its own SKILL.md sits inside this story's file_list; every other
// required_skill is "consume" — full-repo measurement (2026-08-01): this cuts
// epic-drift WARNs from 2435 pairs to 250 (the other 2185 were consume-type
// skills the story never touches).

import fs from 'fs';
import path from 'path';

const normalizeEol = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n');
const stripBom = (s) => s.replace(/^﻿/, '');

// Backtick-delimited spans and bare whitespace-separated tokens are both
// harvested as candidates. Neither can backtrack: `[^`]+` forbids the backtick
// it stops at, `\S+` forbids the whitespace it stops at — nothing for either to
// retry once it fails to extend.
const BACKTICK_SPAN = /`([^`]+)`/g;
const WHITESPACE_TOKEN = /\S+/g;

// Four guards, run before any filesystem call so a pathological input never
// turns into thousands of stat()s: a leading `/` is an absolute path (this repo
// has none as valid spec references); a literal `\` is either a Windows-escaped
// fragment or a regex source snippet quoted in prose (`` `/docs\/` ``), neither
// a real path; fewer than two `/`-segments is a bare word ("docs", "A"), not a
// reference; and a `.`/`*`/`..` segment is a glob or relative-traversal
// fragment, not a citable path.
function isCandidatePath(token) {
  if (!token || token.startsWith('/') || token.includes('\\')) return false;
  const segments = token.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.length < 2) return false;
  if (segments.some((seg) => seg === '.' || seg === '*' || seg === '..')) return false;
  return true;
}

/**
 * @param {string|null|undefined} background
 * @param {string} projectRoot
 * @returns {string[]} candidate strings (as they appeared in background) that
 *   exist on disk under projectRoot, deduplicated. Backtick-delimited spans are
 *   emitted before bare whitespace tokens — each group in its own first-seen
 *   order, but a quoted path always outranks an unquoted one regardless of which
 *   appeared first in the text. D3 previews only `.slice(0, 3)`, so this ordering
 *   decides what gets shown: an explicitly quoted reference is the better pick.
 */
export function harvestSpecRefs(background, projectRoot) {
  const text = stripBom(normalizeEol(background));
  const candidates = new Set();
  for (const m of text.matchAll(BACKTICK_SPAN)) candidates.add(m[1].trim());
  for (const m of text.matchAll(WHITESPACE_TOKEN)) candidates.add(m[0]);

  const refs = [];
  for (const candidate of candidates) {
    if (!isCandidatePath(candidate)) continue;
    try {
      if (fs.existsSync(path.join(projectRoot, candidate))) refs.push(candidate);
    } catch (err) {
      // Kept so one malformed candidate can never abort the harvest of every
      // other candidate in the same background — but reported, not swallowed.
      // The original comment cited "an embedded NUL from a mangled paste"; that
      // input was measured (code-review 2026-08-01, alongside lone surrogates,
      // control characters and a 5k-char segment) and neither path.join nor
      // existsSync throws for any of them — they return false. So this branch is
      // currently unreachable, and a silent catch on an unreachable path is
      // exactly the shape this Story exists to remove: it would turn any future
      // reachability into a fail-silent gate, the same defect as the D7 `continue`.
      console.error(`⚠ harvestSpecRefs: unusable candidate skipped ${JSON.stringify(candidate)} — ${err.message}`);
    }
  }
  return refs;
}

// Accepts either JSON-array or comma-separated required_skills (both formats
// are live in phycool.db) — same parsing run-depth-gate.js's D1 always did.
function parseRequiredSkills(raw) {
  const trimmed = String(raw == null ? '' : raw).trim();
  if (!trimmed) return [];
  let skills;
  if (trimmed.startsWith('[')) {
    try {
      skills = JSON.parse(trimmed);
    } catch {
      skills = trimmed.split(',');
    }
  } else {
    skills = trimmed.split(',');
  }
  return skills.map((s) => String(s).replace(/["[\]]/g, '').trim()).filter(Boolean);
}

/**
 * @param {string|null|undefined} requiredSkills - story.required_skills raw field
 * @param {string|null|undefined} fileList - story.file_list raw field
 * @returns {Record<string, 'modify'|'consume'>}
 */
export function classifySkillRefs(requiredSkills, fileList) {
  const skills = parseRequiredSkills(requiredSkills);
  const fileListText = fileList == null ? '' : String(fileList);
  const classification = {};
  for (const skill of skills) {
    classification[skill] = fileListText.includes(`${skill}/SKILL.md`) ? 'modify' : 'consume';
  }
  return classification;
}

/**
 * D1's full per-skill loop (existence BLOCK, verified line, epic-drift WARN
 * gated on classification==='modify'). run-depth-gate.js's runD1() becomes a
 * thin caller of this so the whole gate — not just the classification step —
 * carries a test that doesn't need to spawn the CLI.
 *
 * @param {{required_skills?: string, file_list?: string, epic_id?: string}} story
 * @param {string} projectRoot
 * @returns {{status: 'PASS'|'WARN'|'BLOCK', warnings: string[], blocks: string[], lines: string[]}}
 */
export function buildSkillReadReport(story, projectRoot) {
  const result = { status: 'PASS', warnings: [], blocks: [], lines: [] };
  const skills = parseRequiredSkills(story.required_skills);
  if (skills.length === 0) {
    result.warnings.push('No required_skills declared — D1 vacuously passes');
    result.status = 'WARN';
    return result;
  }
  const classification = classifySkillRefs(story.required_skills, story.file_list);
  for (const skill of skills) {
    const skillFile = path.join(projectRoot, '.claude', 'skills', skill, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      result.blocks.push(`Skill ${skill} — SKILL.md NOT FOUND at ${path.relative(projectRoot, skillFile)}`);
      result.status = 'BLOCK';
      continue;
    }
    const content = fs.readFileSync(skillFile, 'utf-8');
    const versionMatch = content.match(/^version:\s*([\w.-]+)/m);
    const updatedMatch = content.match(/^updated:\s*([\w-]+)/m);
    const syncedEpicMatch = content.match(/^last[-_]synced[-_]epic:\s*([\w-]+)/m);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    const updated = updatedMatch ? updatedMatch[1] : 'unknown';
    const syncedEpic = syncedEpicMatch ? syncedEpicMatch[1] : 'unknown';
    result.lines.push(`- ✅ ${skill}@${version} verified (updated ${updated}, synced ${syncedEpic})`);
    const isModify = classification[skill] === 'modify';
    if (isModify && story.epic_id && syncedEpic !== 'unknown' && syncedEpic !== story.epic_id) {
      result.warnings.push(`Skill ${skill} last-synced-epic=${syncedEpic} ≠ Story epic=${story.epic_id} — may need sync`);
      if (result.status === 'PASS') result.status = 'WARN';
    }
  }
  return result;
}
