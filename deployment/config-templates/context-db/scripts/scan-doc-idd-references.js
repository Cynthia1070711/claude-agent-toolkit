// ============================================================
// PCPT Context Memory DB — Documentation IDD Reference Scanner
// DLA-09: 掃描 docs/ + system-platform references + rules 中的 IDD 引用
// BR-SCAN-DOCS + BR-SCAN-SP: 偵測文件層 IDD 引用 + system-platform 章節分析
// ============================================================
// 使用方式:
//   node .context-db/scripts/scan-doc-idd-references.js
//   node .context-db/scripts/scan-doc-idd-references.js --output json
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Directories to scan
const SCAN_TARGETS = [
  { dir: path.join(PROJECT_ROOT, 'docs'), label: 'docs', exts: ['.md'] },
  {
    dir: path.join(PROJECT_ROOT, '.claude', 'skills', 'pcpt-system-platform', 'references'),
    label: 'system-platform',
    exts: ['.md'],
  },
  { dir: path.join(PROJECT_ROOT, '.claude', 'rules'), label: 'rules', exts: ['.md'] },
];

// Patterns to detect IDD references in documentation
const DOC_PATTERNS = [
  { name: 'idd_id',                regex: /\bIDD-[A-Z]+-\d+\b/g },
  { name: 'intentional_bracket',   regex: /\[Intentional[:\s]/g },
  { name: 'intentional_decisions', regex: /\bintentional_decisions\b/g },
];

// Section headers that indicate an IDD-dedicated section
const IDD_SECTION_PATTERNS = [
  /^#+\s+Intentional\s+Decision/i,
  /^#+\s+IDD[^a-z]/i,
  /^#+\s+\[Intentional/i,
  /^#+.*故意.*決策/i,
];

function extractIddIds(text) {
  const ids = new Set();
  const regex = /\bIDD-[A-Z]+-\d+\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    ids.add(match[0]);
  }
  return [...ids];
}

function hasIddSection(content) {
  const lines = content.split('\n');
  return lines.some(line => IDD_SECTION_PATTERNS.some(p => p.test(line)));
}

function scanDocFile(filePath, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];
  const seenLines = new Set();

  for (const { name: patternName, regex } of DOC_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      const found = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        found.push(match[0]);
      }
      if (found.length > 0 && !seenLines.has(i)) {
        seenLines.add(i);
        const idd_ids = extractIddIds(line);
        matches.push({
          file: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
          line: i + 1,
          pattern: patternName,
          context: line.trim().substring(0, 200),
          idd_id_if_any: idd_ids.length > 0 ? idd_ids[0] : null,
          idd_ids: idd_ids,
          label,
        });
      }
    }
  }

  return {
    file: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
    label,
    has_idd_section: hasIddSection(content),
    match_count: matches.length,
    idd_ids_found: [...new Set(matches.flatMap(m => m.idd_ids))],
    matches,
  };
}

function walkDir(dirPath, exts, label) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  function recurse(currentPath) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git'].includes(entry.name)) continue;
        recurse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) {
          results.push({ path: fullPath, label });
        }
      }
    }
  }

  recurse(dirPath);
  return results;
}

function getActiveIddPlatformModules(db) {
  try {
    const rows = db.prepare(
      "SELECT idd_id, platform_modules FROM intentional_decisions WHERE status = 'active' AND platform_modules IS NOT NULL"
    ).all();
    const result = {};
    for (const row of rows) {
      try {
        const modules = JSON.parse(row.platform_modules);
        for (const mod of modules) {
          if (!result[mod]) result[mod] = [];
          result[mod].push(row.idd_id);
        }
      } catch { /* ignore parse error */ }
    }
    return result;
  } catch {
    return {};
  }
}

function analyzeSystemPlatformCoverage(fileResults, moduleIddMap) {
  // Group system-platform files by module directory
  const spFiles = fileResults.filter(f => f.label === 'system-platform');
  const moduleReport = {};

  for (const [module, idd_ids] of Object.entries(moduleIddMap)) {
    const relatedFiles = spFiles.filter(f =>
      f.file.toLowerCase().includes(module.toLowerCase())
    );
    const hasAnyIddSection = relatedFiles.some(f => f.has_idd_section);
    const foundIddRefs = new Set(relatedFiles.flatMap(f => f.idd_ids_found));
    const missingIds = idd_ids.filter(id => !foundIddRefs.has(id));

    moduleReport[module] = {
      module,
      related_idds: idd_ids,
      files_checked: relatedFiles.map(f => f.file),
      has_idd_section: hasAnyIddSection,
      idd_refs_found: [...foundIddRefs],
      missing_idd_refs: missingIds,
    };
  }

  return moduleReport;
}

function main() {
  const outputJson = process.argv.includes('--output') &&
    process.argv[process.argv.indexOf('--output') + 1] === 'json';

  // Load DB for system-platform coverage analysis
  let db = null;
  let moduleIddMap = {};
  if (fs.existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true });
    moduleIddMap = getActiveIddPlatformModules(db);
  }

  if (!outputJson) {
    console.log(`\n🔍 Scanning documentation for IDD references...\n`);
  }

  // Collect all files to scan
  const allFiles = [];
  for (const { dir, label, exts } of SCAN_TARGETS) {
    const files = walkDir(dir, exts, label);
    allFiles.push(...files);
  }

  if (!outputJson) {
    console.log(`  Found ${allFiles.length} markdown files to scan\n`);
  }

  const fileResults = [];
  let totalMatches = 0;

  for (const { path: filePath, label } of allFiles) {
    try {
      const result = scanDocFile(filePath, label);
      fileResults.push(result);
      totalMatches += result.match_count;

      if (!outputJson && result.match_count > 0) {
        console.log(`  📄 ${result.file} [${label}]: ${result.match_count} reference(s)`);
        if (result.idd_ids_found.length > 0) {
          console.log(`     IDD IDs: ${result.idd_ids_found.join(', ')}`);
        }
        if (result.has_idd_section) {
          console.log(`     ✅ Has dedicated IDD section`);
        }
      }
    } catch (err) {
      if (!outputJson) {
        console.warn(`  ⚠️  Could not read: ${path.relative(PROJECT_ROOT, filePath)} — ${err.message}`);
      }
    }
  }

  // System-Platform Coverage Analysis (BR-SCAN-SP)
  const spCoverageReport = analyzeSystemPlatformCoverage(fileResults, moduleIddMap);

  if (db) db.close();

  const allMatches = fileResults.flatMap(f => f.matches);
  const summary = {
    docs_scanned: allFiles.length,
    docs_with_references: fileResults.filter(f => f.match_count > 0).length,
    total_matches: totalMatches,
    unique_idd_refs: [...new Set(allMatches.flatMap(m => m.idd_ids))],
    system_platform_coverage: Object.values(spCoverageReport),
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify({
      file_results: fileResults,
      all_matches: allMatches,
      system_platform_coverage: spCoverageReport,
      summary,
    }, null, 2));
  } else {
    console.log(`\n✅ Scanned ${summary.docs_scanned} docs, found ${summary.total_matches} IDD references`);

    if (summary.unique_idd_refs.length > 0) {
      console.log(`\n📋 IDD IDs referenced in docs: ${summary.unique_idd_refs.join(', ')}`);
    }

    // System-platform coverage report (AC-5)
    if (Object.keys(spCoverageReport).length > 0) {
      console.log('\n📊 System-Platform IDD Coverage Report:');
      for (const report of Object.values(spCoverageReport)) {
        const icon = report.has_idd_section ? '✅' : '⚠️ ';
        console.log(`  ${icon} Module ${report.module}:`);
        console.log(`     Active IDDs: ${report.related_idds.join(', ')}`);
        console.log(`     Has IDD section: ${report.has_idd_section}`);
        if (report.missing_idd_refs.length > 0) {
          console.log(`     ❌ Missing refs: ${report.missing_idd_refs.join(', ')}`);
        }
      }
    } else if (Object.keys(moduleIddMap).length === 0) {
      console.log('\nℹ️  No active IDDs with platform_modules in DB (expected — IDD records not yet created)');
    }
  }

  return {
    file_results: fileResults,
    all_matches: allMatches,
    system_platform_coverage: spCoverageReport,
    summary,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { main as scanDocIddReferences, extractIddIds, hasIddSection, scanDocFile, DOC_PATTERNS, IDD_SECTION_PATTERNS };
