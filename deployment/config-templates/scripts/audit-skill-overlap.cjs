#!/usr/bin/env node
/**
 * audit-skill-overlap.cjs
 *
 * 對 .claude/skills/**\/SKILL.md 偵測重疊 / retire 候選:
 *   Phase 1: 90 天 0 觸發偵測(從 retrieval_observations 表,若可用)
 *   Phase 2: triggers Jaccard 重疊度(對齊 skill-creation-discipline.md §3 Q3)
 *   Phase 3: description 主題 keyword overlap(對齊 §3 Q1)
 *
 * 觸發: ADR-GOVERNANCE-001 + skill-creation-discipline.md(SUPREME)
 *
 * 用法:
 *   node scripts/audit-skill-overlap.cjs                     # advisory 預設
 *   node scripts/audit-skill-overlap.cjs --json              # 機器可讀
 *   node scripts/audit-skill-overlap.cjs --md > report.md    # 人類可讀
 *   node scripts/audit-skill-overlap.cjs --check-new <name> --description "<desc>" --triggers "t1,t2,t3"
 *                                                            # 新建檢核(對齊 §3 3 題)
 *   node scripts/audit-skill-overlap.cjs --strict            # 任一重疊 ≥ 50% → exit 1
 *   node scripts/audit-skill-overlap.cjs --skip-phase1       # 跳過 90d 0 觸發(若 DB 不可用)
 *
 * Exit codes:
 *   0 = no major overlaps / advisory mode
 *   1 = strict mode + Jaccard ≥ 50% pair found
 *   2 = parse / IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude/skills');
const PHYCOOL_DB = path.join(REPO_ROOT, '.context-db/phycool.db');

const STOPWORDS = new Set([
  'a','an','the','of','to','in','for','on','at','by','from','with','and','or','not','is','are',
  '的','是','在','和','或','與','對','於','本','此','該','並','即','可','需','若','如','時','上','下',
  'use','when','phycool','skill','this','that','tool','function','feature',
]);

const JACCARD_HIGH = 0.50;   // 整併候選
const JACCARD_WARN = 0.30;   // Warn(需理由)
const KEYWORD_OVERLAP_HIGH = 0.70;  // description 主題
const RETIRE_DAYS = 90;

// ─────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    json: false,
    md: false,
    strict: false,
    skipPhase1: false,
    checkNew: null,
    description: '',
    triggers: '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--md') args.md = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--skip-phase1') args.skipPhase1 = true;
    else if (a === '--check-new') args.checkNew = argv[++i];
    else if (a === '--description') args.description = argv[++i];
    else if (a === '--triggers') args.triggers = argv[++i];
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Skill metadata extraction
// ─────────────────────────────────────────────────────────────

/**
 * Parse SKILL.md frontmatter(yaml-ish)+ extract triggers + description
 * Returns { name, description, triggers[] }
 */
function parseSkill(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  let content;
  try {
    content = fs.readFileSync(skillFile, 'utf-8');
  } catch (e) {
    return null;
  }
  // Normalize BOM + CRLF before any `$`-anchored / line-wise matching.
  // JS `.` never matches `\r`, and `$` without /m never matches before `\r`, so the
  // `description: >` block-start regex below fails on every CRLF SKILL.md — those skills
  // silently parse to an empty description and are then skipped by checkNew()/phase3.
  // 對齊 .claude/rules/crlf-normalize-discipline.md §3.1。
  content = content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  // Match yaml frontmatter --- ... ---
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return { name: path.basename(skillDir), description: '', triggers: [] };
  const yaml = fm[1];
  // name
  const nameMatch = yaml.match(/^\s*name:\s*([^\n]+)/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(skillDir);
  // description (single-line or multi-line yaml > block) — line-by-line parse
  let description = '';
  const yamlLines = yaml.split('\n');
  let inBlock = false;
  const blockLines = [];
  for (const ln of yamlLines) {
    if (!inBlock) {
      // Multi-line block start: `description: >` or `description: |`
      const blockStart = ln.match(/^\s*description:\s*[>|](.*)$/);
      if (blockStart) {
        inBlock = true;
        if (blockStart[1].trim()) blockLines.push(blockStart[1].trim());
        continue;
      }
      // Single-line: `description: text`
      const single = ln.match(/^\s*description:\s*(.+)$/);
      if (single && !single[1].trim().match(/^[>|]$/)) {
        description = single[1].trim();
        break;
      }
    } else {
      // In block: indented line continues, empty line continues, non-indented ends
      if (/^\s+\S/.test(ln)) {
        blockLines.push(ln.trim());
      } else if (ln.trim() === '') {
        continue;
      } else {
        break;
      }
    }
  }
  if (inBlock && blockLines.length > 0) description = blockLines.join(' ');
  // triggers (list under triggers:)
  const triggers = [];
  const trigBlock = yaml.match(/^\s*triggers:\s*\n((?:\s*-\s*[^\n]+\n?)+)/m);
  if (trigBlock) {
    const lines = trigBlock[1].split('\n');
    for (const ln of lines) {
      const m = ln.match(/^\s*-\s*(.+)$/);
      if (m) triggers.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  return { name, description, triggers };
}

function loadAllSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const skills = [];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const parsed = parseSkill(path.join(SKILLS_DIR, e.name));
      if (parsed) {
        parsed.dir = path.join(SKILLS_DIR, e.name);
        parsed.isPhycool = e.name.startsWith('phycool-');
        skills.push(parsed);
      }
    }
  }
  return skills;
}

// ─────────────────────────────────────────────────────────────
// Jaccard + keyword overlap helpers
// ─────────────────────────────────────────────────────────────

function jaccard(setA, setB) {
  const a = new Set(setA.map(s => s.toLowerCase().trim()));
  const b = new Set(setB.map(s => s.toLowerCase().trim()));
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(text) {
  return (text || '').toLowerCase().split(/[\s,/.;()[\]{}<>!?:'"`-]+/).filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function keywordOverlap(descA, descB) {
  const tokA = new Set(tokenize(descA));
  const tokB = new Set(tokenize(descB));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let inter = 0;
  for (const x of tokA) if (tokB.has(x)) inter++;
  return inter / Math.min(tokA.size, tokB.size);
}

// ─────────────────────────────────────────────────────────────
// Phase 1: 90 天 0 觸發偵測(retrieval_observations)
// ─────────────────────────────────────────────────────────────

function phase1RetireCheck(skills) {
  const result = { available: false, retire_candidates: [], note: '' };
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    result.note = 'better-sqlite3 not loadable; phase1 skipped';
    return result;
  }
  if (!fs.existsSync(PHYCOOL_DB)) {
    result.note = `DB not found at ${PHYCOOL_DB}; phase1 skipped`;
    return result;
  }
  let db;
  try {
    db = new Database(PHYCOOL_DB, { readonly: true });
    // Check table exists
    const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='retrieval_observations'`).get();
    if (!tableExists) {
      result.note = 'retrieval_observations table not found; phase1 skipped';
      db.close();
      return result;
    }
    // Detect column for skill identifier(may be 'skill_name' or 'tags' or other)
    const cols = db.prepare(`PRAGMA table_info(retrieval_observations)`).all().map(c => c.name);
    const hasSkillName = cols.includes('skill_name');
    const hasTags = cols.includes('tags');
    const hasObservedAt = cols.includes('observed_at');
    const hasCreatedAt = cols.includes('created_at');
    const tsCol = hasObservedAt ? 'observed_at' : (hasCreatedAt ? 'created_at' : null);
    if (!tsCol) {
      result.note = 'retrieval_observations has no timestamp column; phase1 skipped';
      db.close();
      return result;
    }
    if (hasSkillName) {
      const stmt = db.prepare(`SELECT skill_name, MAX(${tsCol}) as last_ts FROM retrieval_observations GROUP BY skill_name`);
      const rows = stmt.all();
      const seen = new Set(rows.map(r => r.skill_name));
      // For skills with no entries
      for (const s of skills) {
        if (!seen.has(s.name)) {
          result.retire_candidates.push({ name: s.name, reason: 'no observation in retrieval_observations', last_triggered: null });
        }
      }
      // For skills with stale entries (>90d)
      const cutoff = Date.now() - RETIRE_DAYS * 24 * 60 * 60 * 1000;
      for (const r of rows) {
        const ts = new Date(r.last_ts).getTime();
        if (!isNaN(ts) && ts < cutoff) {
          if (!result.retire_candidates.find(c => c.name === r.skill_name)) {
            result.retire_candidates.push({ name: r.skill_name, reason: `last triggered > ${RETIRE_DAYS}d ago`, last_triggered: r.last_ts });
          }
        }
      }
    } else {
      result.note = 'retrieval_observations has no skill_name column(may use tags-based tracking); phase1 best-effort skipped';
    }
    result.available = true;
    db.close();
  } catch (e) {
    result.note = `phase1 error: ${e.message}`;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Phase 2: triggers Jaccard
// ─────────────────────────────────────────────────────────────

function phase2TriggersJaccard(skills) {
  const pairs = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i];
      const b = skills[j];
      if (a.triggers.length === 0 || b.triggers.length === 0) continue;
      const score = jaccard(a.triggers, b.triggers);
      if (score >= JACCARD_WARN) {
        pairs.push({
          a: a.name,
          b: b.name,
          jaccard: +score.toFixed(3),
          severity: score >= JACCARD_HIGH ? 'merge_candidate' : 'warn',
          a_triggers_count: a.triggers.length,
          b_triggers_count: b.triggers.length,
        });
      }
    }
  }
  pairs.sort((x, y) => y.jaccard - x.jaccard);
  return pairs;
}

// ─────────────────────────────────────────────────────────────
// Phase 3: description keyword overlap
// ─────────────────────────────────────────────────────────────

function phase3DescriptionOverlap(skills) {
  const pairs = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i];
      const b = skills[j];
      if (!a.description || !b.description) continue;
      const score = keywordOverlap(a.description, b.description);
      if (score >= KEYWORD_OVERLAP_HIGH) {
        pairs.push({
          a: a.name,
          b: b.name,
          keyword_overlap: +score.toFixed(3),
          severity: 'merge_candidate',
        });
      }
    }
  }
  pairs.sort((x, y) => y.keyword_overlap - x.keyword_overlap);
  return pairs;
}

// ─────────────────────────────────────────────────────────────
// New skill creation check(對齊 skill-creation-discipline.md §3)
// ─────────────────────────────────────────────────────────────

function checkNew(name, description, triggersStr, skills) {
  const triggers = (triggersStr || '').split(',').map(s => s.trim()).filter(s => s.length > 0);
  const checks = {
    name,
    description,
    triggers,
    q1_existing_similar: [],
    q2_can_inline: false,
    q3_triggers_overlap: [],
    pass: true,
    issues: [],
  };
  // Q1: existing similar topic(description keyword overlap ≥ 70%)
  for (const s of skills) {
    if (s.description) {
      const ko = keywordOverlap(description, s.description);
      if (ko >= KEYWORD_OVERLAP_HIGH) {
        checks.q1_existing_similar.push({ name: s.name, keyword_overlap: +ko.toFixed(3) });
      }
    }
  }
  if (checks.q1_existing_similar.length > 0) {
    checks.q2_can_inline = true;
    checks.issues.push('Q1 FAIL: existing skill with similar description detected. Consider adding section to existing skill.');
    checks.pass = false;
  }
  // Q3: triggers Jaccard
  if (triggers.length > 0) {
    for (const s of skills) {
      if (s.triggers.length > 0) {
        const j = jaccard(triggers, s.triggers);
        if (j >= JACCARD_WARN) {
          checks.q3_triggers_overlap.push({ name: s.name, jaccard: +j.toFixed(3), severity: j >= JACCARD_HIGH ? 'block' : 'warn' });
        }
      }
    }
    const blocked = checks.q3_triggers_overlap.filter(o => o.severity === 'block');
    if (blocked.length > 0) {
      checks.issues.push(`Q3 FAIL: triggers Jaccard ≥ ${JACCARD_HIGH} with: ${blocked.map(b => b.name).join(', ')}`);
      checks.pass = false;
    }
  }
  return checks;
}

// ─────────────────────────────────────────────────────────────
// Main audit
// ─────────────────────────────────────────────────────────────

function audit(args) {
  const skills = loadAllSkills();
  const phycoolCount = skills.filter(s => s.isPhycool).length;
  const generalCount = skills.length - phycoolCount;
  const result = {
    timestamp: new Date().toISOString(),
    skill_count: { total: skills.length, phycool: phycoolCount, general: generalCount },
    cap: { phycool_max: 100, general_max: 60, total_max: 160 },
    cap_status: {
      phycool: phycoolCount > 100 ? 'OVER' : (phycoolCount >= 95 ? 'NEAR_LIMIT' : 'OK'),
      general: generalCount > 60 ? 'OVER' : (generalCount >= 56 ? 'NEAR_LIMIT' : 'OK'),
      total: skills.length > 160 ? 'OVER' : (skills.length >= 152 ? 'NEAR_LIMIT' : 'OK'),
    },
    phase1: { skipped: args.skipPhase1, retire_candidates: [] },
    phase2: { triggers_overlap_pairs: [] },
    phase3: { description_overlap_pairs: [] },
    new_check: null,
  };

  if (args.checkNew) {
    result.new_check = checkNew(args.checkNew, args.description, args.triggers, skills);
  } else {
    if (!args.skipPhase1) {
      result.phase1 = phase1RetireCheck(skills);
    }
    result.phase2.triggers_overlap_pairs = phase2TriggersJaccard(skills);
    result.phase3.description_overlap_pairs = phase3DescriptionOverlap(skills);
  }

  let exitCode = 0;
  if (args.strict) {
    if (result.new_check && !result.new_check.pass) exitCode = 1;
    else if (result.phase2.triggers_overlap_pairs.some(p => p.severity === 'merge_candidate')) exitCode = 1;
    else if (result.cap_status.phycool === 'OVER' || result.cap_status.general === 'OVER' || result.cap_status.total === 'OVER') exitCode = 1;
  }
  return { result, exitCode };
}

// ─────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────

function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

function renderMarkdown(result) {
  const lines = [];
  lines.push(`# Skill Overlap Audit Report`);
  lines.push('');
  lines.push(`> Generated: ${result.timestamp}`);
  lines.push(`> Cap: phycool ≤ ${result.cap.phycool_max} / general ≤ ${result.cap.general_max} / total ≤ ${result.cap.total_max}`);
  lines.push('');
  lines.push(`## Skill Count`);
  lines.push('');
  lines.push(`- **Total**: ${result.skill_count.total} (cap status: ${result.cap_status.total})`);
  lines.push(`- **phycool-***: ${result.skill_count.phycool} (cap status: ${result.cap_status.phycool})`);
  lines.push(`- **general**: ${result.skill_count.general} (cap status: ${result.cap_status.general})`);
  lines.push('');
  if (result.new_check) {
    lines.push(`## New Skill Check: ${result.new_check.name}`);
    lines.push('');
    lines.push(`Pass: ${result.new_check.pass ? '✅ YES' : '🔴 NO'}`);
    if (result.new_check.issues.length > 0) {
      lines.push('');
      lines.push('### Issues');
      for (const iss of result.new_check.issues) lines.push(`- ${iss}`);
    }
    if (result.new_check.q1_existing_similar.length > 0) {
      lines.push('');
      lines.push('### Q1 Existing Similar (description overlap ≥ 0.70)');
      for (const c of result.new_check.q1_existing_similar) {
        lines.push(`- ${c.name} (keyword_overlap=${c.keyword_overlap})`);
      }
    }
    if (result.new_check.q3_triggers_overlap.length > 0) {
      lines.push('');
      lines.push('### Q3 Triggers Overlap');
      for (const o of result.new_check.q3_triggers_overlap) {
        lines.push(`- ${o.name} (jaccard=${o.jaccard}, severity=${o.severity})`);
      }
    }
  } else {
    lines.push(`## Phase 1: 90d Zero-Triggered Retire Candidates`);
    lines.push('');
    if (result.phase1.skipped) {
      lines.push('_(skipped via --skip-phase1)_');
    } else if (!result.phase1.available) {
      lines.push(`_(unavailable: ${result.phase1.note})_`);
    } else if (result.phase1.retire_candidates.length === 0) {
      lines.push('_None_');
    } else {
      lines.push(`| skill | reason | last_triggered |`);
      lines.push(`|:---|:---|:---|`);
      for (const c of result.phase1.retire_candidates) {
        lines.push(`| ${c.name} | ${c.reason} | ${c.last_triggered || '-'} |`);
      }
    }
    lines.push('');
    lines.push(`## Phase 2: Triggers Jaccard Overlap (≥ ${JACCARD_WARN})`);
    lines.push('');
    if (result.phase2.triggers_overlap_pairs.length === 0) {
      lines.push('_None_');
    } else {
      lines.push(`| skill_a | skill_b | jaccard | severity |`);
      lines.push(`|:---|:---|:---:|:---:|`);
      for (const p of result.phase2.triggers_overlap_pairs) {
        const flag = p.severity === 'merge_candidate' ? '🔴 merge' : '🟡 warn';
        lines.push(`| ${p.a} | ${p.b} | ${p.jaccard} | ${flag} |`);
      }
    }
    lines.push('');
    lines.push(`## Phase 3: Description Keyword Overlap (≥ ${KEYWORD_OVERLAP_HIGH})`);
    lines.push('');
    if (result.phase3.description_overlap_pairs.length === 0) {
      lines.push('_None_');
    } else {
      lines.push(`| skill_a | skill_b | keyword_overlap |`);
      lines.push(`|:---|:---|:---:|`);
      for (const p of result.phase3.description_overlap_pairs) {
        lines.push(`| ${p.a} | ${p.b} | ${p.keyword_overlap} |`);
      }
    }
  }
  return lines.join('\n');
}

function renderConsole(result) {
  const lines = [];
  lines.push(`[skill-audit] ${result.timestamp}`);
  lines.push(`[skill-audit] count: total=${result.skill_count.total}(${result.cap_status.total}) phycool=${result.skill_count.phycool}(${result.cap_status.phycool}) general=${result.skill_count.general}(${result.cap_status.general})`);
  if (result.new_check) {
    lines.push(`\n=== New Skill Check: ${result.new_check.name} ===`);
    lines.push(`Pass: ${result.new_check.pass ? 'YES' : 'NO'}`);
    for (const iss of result.new_check.issues) lines.push(`  ${iss}`);
  } else {
    if (!result.phase1.skipped && result.phase1.available) {
      lines.push(`\n=== Phase 1: Retire Candidates (${result.phase1.retire_candidates.length}) ===`);
      for (const c of result.phase1.retire_candidates.slice(0, 10)) {
        lines.push(`  ${c.name.padEnd(40)} ${c.reason}`);
      }
    }
    lines.push(`\n=== Phase 2: Triggers Jaccard (≥${JACCARD_WARN}) — ${result.phase2.triggers_overlap_pairs.length} pairs ===`);
    for (const p of result.phase2.triggers_overlap_pairs.slice(0, 15)) {
      lines.push(`  ${p.a.padEnd(35)} ↔ ${p.b.padEnd(35)} jaccard=${p.jaccard} ${p.severity}`);
    }
    lines.push(`\n=== Phase 3: Description Overlap (≥${KEYWORD_OVERLAP_HIGH}) — ${result.phase3.description_overlap_pairs.length} pairs ===`);
    for (const p of result.phase3.description_overlap_pairs.slice(0, 15)) {
      lines.push(`  ${p.a.padEnd(35)} ↔ ${p.b.padEnd(35)} keyword_overlap=${p.keyword_overlap}`);
    }
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

function main(argv) {
  const args = parseArgs(argv);
  const { result, exitCode } = audit(args);
  let output;
  if (args.json) output = renderJson(result);
  else if (args.md) output = renderMarkdown(result);
  else output = renderConsole(result);
  console.log(output);
  return exitCode;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  parseArgs,
  parseSkill,
  loadAllSkills,
  jaccard,
  tokenize,
  keywordOverlap,
  phase1RetireCheck,
  phase2TriggersJaccard,
  phase3DescriptionOverlap,
  checkNew,
  audit,
  renderJson,
  renderMarkdown,
  STOPWORDS,
  JACCARD_HIGH,
  JACCARD_WARN,
  KEYWORD_OVERLAP_HIGH,
  RETIRE_DAYS,
};
