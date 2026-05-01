// ============================================================
// PCPT Context Memory DB — Skill IDD Reference Scanner
// DLA-09: 掃描 pcpt-* Skills 中的 IDD 引用
// BR-SCAN-SKILLS: 找出所有 [Intentional:], IDD-XXX, forbidden_changes 等引用
// ============================================================
// 使用方式:
//   node .context-db/scripts/scan-skill-idd-references.js
//   node .context-db/scripts/scan-skill-idd-references.js --output json
// ============================================================

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// IDD-related patterns to search for in SKILL.md files
const IDD_PATTERNS = [
  { name: 'intentional_annotation', regex: /\[Intentional(?::\s*IDD-[A-Z]+-\d+)?\]/g },
  { name: 'idd_id',                 regex: /\bIDD-[A-Z]+-\d+\b/g },
  { name: 'intentional_decisions',  regex: /intentional_decisions\b/g },
  { name: 'forbidden_changes',      regex: /forbidden_changes\b/g },
  { name: 'PCPT_idd_skill',      regex: /pcpt-intentional-decisions\b/g },
];

function getContextLines(lines, lineIndex, contextSize = 3) {
  const start = Math.max(0, lineIndex - contextSize);
  const end = Math.min(lines.length - 1, lineIndex + contextSize);
  return lines.slice(start, end + 1).join('\n');
}

function scanSkillFile(skillName, skillFilePath) {
  const content = fs.readFileSync(skillFilePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];
  const seenLines = new Set();

  for (const { name: patternName, regex } of IDD_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const found = [];
      let match;
      // Reset regex lastIndex for global patterns
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        found.push(match[0]);
      }
      if (found.length > 0 && !seenLines.has(i)) {
        seenLines.add(i);
        matches.push({
          line: i + 1,
          pattern: patternName,
          matched: [...new Set(found)],
          context: getContextLines(lines, i),
        });
      }
    }
  }

  return {
    skill_name: skillName,
    file_path: path.relative(PROJECT_ROOT, skillFilePath).replace(/\\/g, '/'),
    match_count: matches.length,
    matches,
  };
}

function discoverSkillFiles() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`❌ Skills directory not found: ${SKILLS_DIR}`);
    process.exit(2);
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skillFiles = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('pcpt-')) continue;
    const skillMd = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      skillFiles.push({ name: entry.name, path: skillMd });
    }
  }

  return skillFiles;
}

function main() {
  const outputJson = process.argv.includes('--output') &&
    process.argv[process.argv.indexOf('--output') + 1] === 'json';

  const skillFiles = discoverSkillFiles();

  if (!outputJson) {
    console.log(`\n🔍 Scanning ${skillFiles.length} pcpt-* Skills for IDD references...\n`);
  }

  const results = [];
  let totalMatches = 0;

  for (const { name, path: skillPath } of skillFiles) {
    const result = scanSkillFile(name, skillPath);
    results.push(result);
    totalMatches += result.match_count;

    if (!outputJson && result.match_count > 0) {
      console.log(`  📌 ${name}: ${result.match_count} reference(s)`);
      for (const m of result.matches) {
        console.log(`     L${m.line} [${m.pattern}]: ${m.matched.join(', ')}`);
      }
    } else if (!outputJson) {
      console.log(`  ○  ${name}: no IDD references`);
    }
  }

  const summary = {
    scanned: skillFiles.length,
    with_references: results.filter(r => r.match_count > 0).length,
    total_matches: totalMatches,
  };

  if (outputJson) {
    // Output pure JSON for use by build-idd-cross-reference.js
    process.stdout.write(JSON.stringify({ results, summary }, null, 2));
  } else {
    console.log(`\n✅ Scanned ${summary.scanned} skills, found ${summary.total_matches} IDD references across ${summary.with_references} skill files`);
  }

  return { results, summary };
}

// Allow importing as module or running directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { main as scanSkillIddReferences, getContextLines, scanSkillFile, IDD_PATTERNS };
