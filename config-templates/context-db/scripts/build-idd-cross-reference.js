// ============================================================
// PCPT Context Memory DB — IDD Cross-Reference Index Builder
// DLA-09: 整合三個 scanner 輸出，建立統一 JSON 索引
// BR-SCAN-INDEX: 合併 + DB enrichment + 寫入 idd-cross-reference.json
// ============================================================
// 使用方式:
//   node .context-db/scripts/build-idd-cross-reference.js
//   node .context-db/scripts/build-idd-cross-reference.js --dry-run  (不更新 DB)
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const OUTPUT_PATH = path.join(__dirname, '..', 'idd-cross-reference.json');
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SCRIPTS_DIR = __dirname;

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function runScanner(scriptName) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Scanner not found: ${scriptPath}`);
  }
  // Run scanner with --output json flag, capture stdout
  const output = execSync(
    `node "${scriptPath}" --output json`,
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large codebases
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  return JSON.parse(output);
}

function buildSkillsMap(scanResult) {
  const skillsMap = {};
  for (const skill of scanResult.results || []) {
    if (skill.match_count > 0) {
      skillsMap[skill.skill_name] = {
        file_path: skill.file_path,
        idd_refs: skill.matches.map(m => ({
          line: m.line,
          pattern: m.pattern,
          matched: m.matched,
          context: m.context,
        })),
      };
    }
  }
  return skillsMap;
}

function buildIddEnrichment(skillsMap, docResult, codeResult) {
  // Build per-IDD enrichment data from all three scan sources
  const enrichment = {};

  // From skills: which skills reference which IDDs
  for (const [skillName, skillData] of Object.entries(skillsMap)) {
    for (const ref of skillData.idd_refs) {
      for (const matched of ref.matched || []) {
        const idd_id_match = matched.match(/IDD-[A-Z]+-\d+/);
        if (!idd_id_match) continue;
        const idd_id = idd_id_match[0];
        if (!enrichment[idd_id]) enrichment[idd_id] = { related_skills: [], related_docs: [], platform_modules: [] };
        if (!enrichment[idd_id].related_skills.includes(skillName)) {
          enrichment[idd_id].related_skills.push(skillName);
        }
      }
    }
  }

  // From docs: which docs reference which IDDs
  for (const match of docResult.all_matches || []) {
    for (const idd_id of (match.idd_ids || [])) {
      if (!enrichment[idd_id]) enrichment[idd_id] = { related_skills: [], related_docs: [], platform_modules: [] };
      if (!enrichment[idd_id].related_docs.includes(match.file)) {
        enrichment[idd_id].related_docs.push(match.file);
      }
    }
  }

  // From system-platform coverage: module associations
  for (const coverage of Object.values(docResult.system_platform_coverage || {})) {
    for (const idd_id of (coverage.related_idds || [])) {
      if (!enrichment[idd_id]) enrichment[idd_id] = { related_skills: [], related_docs: [], platform_modules: [] };
      if (!enrichment[idd_id].platform_modules.includes(coverage.module)) {
        enrichment[idd_id].platform_modules.push(coverage.module);
      }
    }
  }

  return enrichment;
}

function updateDbFromEnrichment(db, enrichment, dryRun) {
  const results = [];
  const now = getTaiwanTimestamp();

  for (const [idd_id, data] of Object.entries(enrichment)) {
    // Only update if IDD exists in DB
    const existing = db.prepare('SELECT idd_id, related_skills, related_docs, platform_modules FROM intentional_decisions WHERE idd_id = ?').get(idd_id);
    if (!existing) continue;

    // Merge with existing values
    let mergedSkills = [];
    let mergedDocs = [];
    let mergedModules = [];

    try { mergedSkills = JSON.parse(existing.related_skills || '[]'); } catch { /* ignore */ }
    try { mergedDocs = JSON.parse(existing.related_docs || '[]'); } catch { /* ignore */ }
    try { mergedModules = JSON.parse(existing.platform_modules || '[]'); } catch { /* ignore */ }

    // Add new values without duplicates
    const newSkills = [...new Set([...mergedSkills, ...data.related_skills])];
    const newDocs = [...new Set([...mergedDocs, ...data.related_docs])];
    const newModules = [...new Set([...mergedModules, ...data.platform_modules])];

    const changed = JSON.stringify(newSkills) !== JSON.stringify(mergedSkills) ||
                    JSON.stringify(newDocs) !== JSON.stringify(mergedDocs) ||
                    JSON.stringify(newModules) !== JSON.stringify(mergedModules);

    if (changed && !dryRun) {
      db.prepare(`
        UPDATE intentional_decisions
        SET related_skills = ?, related_docs = ?, platform_modules = ?, updated_at = ?
        WHERE idd_id = ?
      `).run(
        JSON.stringify(newSkills),
        JSON.stringify(newDocs),
        JSON.stringify(newModules),
        now,
        idd_id,
      );
    }

    results.push({
      idd_id,
      updated: changed,
      dry_run: dryRun,
      skills_added: data.related_skills.filter(s => !mergedSkills.includes(s)),
      docs_added: data.related_docs.filter(d => !mergedDocs.includes(d)),
      modules_added: data.platform_modules.filter(m => !mergedModules.includes(m)),
    });
  }

  return results;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n🔧 Building IDD Cross-Reference Index...\n');
  if (dryRun) console.log('  (DRY RUN — DB will not be updated)\n');

  // ── Step 1: Run three scanners ─────────────────────────────
  console.log('  [1/4] Running Skill scanner...');
  let skillResult;
  try {
    skillResult = runScanner('scan-skill-idd-references.js');
    console.log(`        ✓ ${skillResult.summary.scanned} skills scanned, ${skillResult.summary.total_matches} matches`);
  } catch (err) {
    // exit 1 = partial failure (some files unreadable) — continue with empty result
    if (err.status === 1 && err.stdout) {
      try {
        skillResult = JSON.parse(err.stdout);
        console.warn(`  ⚠️  Skill scanner partial failure — continuing with partial results`);
      } catch { skillResult = { results: [], summary: { scanned: 0, total_matches: 0 } }; }
    } else {
      console.error(`  ❌ Skill scanner fatal error: ${err.message}`);
      process.exit(2);
    }
  }

  console.log('  [2/4] Running Code scanner...');
  let codeResult;
  try {
    codeResult = runScanner('scan-code-idd-references.js');
    console.log(`        ✓ ${codeResult.summary.files_scanned} files scanned, ${codeResult.summary.annotations_found} annotations, ${codeResult.summary.orphaned} orphaned`);
  } catch (err) {
    if (err.status === 1 && err.stdout) {
      try {
        codeResult = JSON.parse(err.stdout);
        console.warn(`  ⚠️  Code scanner partial failure — continuing with partial results`);
      } catch { codeResult = { valid_annotations: [], orphaned_annotations: [], all_annotations: [], summary: { files_scanned: 0, annotations_found: 0, orphaned: 0 } }; }
    } else {
      console.error(`  ❌ Code scanner fatal error: ${err.message}`);
      process.exit(2);
    }
  }

  console.log('  [3/4] Running Doc scanner...');
  let docResult;
  try {
    docResult = runScanner('scan-doc-idd-references.js');
    console.log(`        ✓ ${docResult.summary.docs_scanned} docs scanned, ${docResult.summary.total_matches} references`);
  } catch (err) {
    if (err.status === 1 && err.stdout) {
      try {
        docResult = JSON.parse(err.stdout);
        console.warn(`  ⚠️  Doc scanner partial failure — continuing with partial results`);
      } catch { docResult = { file_results: [], all_matches: [], system_platform_coverage: {}, summary: { docs_scanned: 0, total_matches: 0 } }; }
    } else {
      console.error(`  ❌ Doc scanner fatal error: ${err.message}`);
      process.exit(2);
    }
  }

  // ── Step 2: Build unified cross-reference structure ────────
  console.log('  [4/4] Building cross-reference index...');

  const skillsMap = buildSkillsMap(skillResult);
  const iddEnrichment = buildIddEnrichment(skillsMap, docResult, codeResult);

  const orphaned = {
    code: codeResult.orphaned_annotations || [],
    db: [], // orphaned DB records (IDD in DB but no code annotation) — populated below
  };

  // Find DB orphans: active IDDs with code_locations but no matching code annotation
  let dbEnrichmentResults = [];
  let db = null;

  if (fs.existsSync(DB_PATH)) {
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');

      // Get all active IDDs with code_locations specified
      const activeIdds = db.prepare(
        "SELECT idd_id FROM intentional_decisions WHERE status = 'active' AND code_locations IS NOT NULL"
      ).all();

      const annotatedIddIds = new Set(
        (codeResult.all_annotations || []).map(a => a.idd_id)
      );

      for (const { idd_id } of activeIdds) {
        if (!annotatedIddIds.has(idd_id)) {
          orphaned.db.push({
            idd_id,
            reason: 'IDD has code_locations in DB but no [Intentional:] annotation found in scanned source files',
          });
        }
      }

      // Update DB enrichment
      dbEnrichmentResults = updateDbFromEnrichment(db, iddEnrichment, dryRun);

      if (db) db.close();
      db = null;
    } catch (err) {
      if (db) { try { db.close(); } catch { /* ignore */ } }
      console.warn(`  ⚠️  DB enrichment skipped: ${err.message}`);
    }
  } else {
    console.log('  ℹ️  DB not found — skipping DB enrichment');
  }

  // ── Step 3: Write cross-reference JSON ────────────────────
  const index = {
    generated_at: getTaiwanTimestamp(),
    skills_map: skillsMap,
    code_annotations: codeResult.all_annotations || [],
    doc_references: docResult.all_matches || [],
    system_platform_coverage: docResult.system_platform_coverage || {},
    idd_enrichment: iddEnrichment,
    orphaned,
    db_enrichment_results: dbEnrichmentResults,
    summary: {
      skills_scanned: skillResult.summary.scanned,
      skills_with_idd_refs: Object.keys(skillsMap).length,
      code_files_scanned: codeResult.summary.files_scanned,
      code_annotations: codeResult.summary.annotations_found,
      orphaned_code_annotations: codeResult.summary.orphaned,
      docs_scanned: docResult.summary.docs_scanned,
      doc_idd_references: docResult.summary.total_matches,
      idd_enriched: dbEnrichmentResults.filter(r => r.updated).length,
      dry_run: dryRun,
    },
  };

  // Atomic write: write to temp file then rename (prevents corrupted reads on crash)
  const tmpPath = OUTPUT_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf8');
  fs.renameSync(tmpPath, OUTPUT_PATH);

  console.log('\n✅ Cross-reference index built successfully!');
  console.log(`   Output: ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Skills scanned: ${index.summary.skills_scanned} (${index.summary.skills_with_idd_refs} with IDD refs)`);
  console.log(`   Code files: ${index.summary.code_files_scanned} files, ${index.summary.code_annotations} annotations, ${index.summary.orphaned_code_annotations} orphaned`);
  console.log(`   Docs: ${index.summary.docs_scanned} scanned, ${index.summary.doc_idd_references} IDD references`);
  console.log(`   DB enriched: ${index.summary.idd_enriched} IDD record(s) updated${dryRun ? ' (dry-run)' : ''}`);

  if (orphaned.code.length > 0) {
    console.log(`\n⚠️  ${orphaned.code.length} orphaned code annotation(s) — see idd-cross-reference.json`);
  }
  if (orphaned.db.length > 0) {
    console.log(`\n⚠️  ${orphaned.db.length} orphaned DB record(s) — IDDs with code_locations but no code annotation`);
  }

  return index;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`❌ build-idd-cross-reference failed: ${err.message}`);
    process.exit(1);
  }
}

export { main as buildIddCrossReference, buildSkillsMap, buildIddEnrichment };
