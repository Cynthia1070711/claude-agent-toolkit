// ============================================================
// PCPT Context Memory DB — Code IDD Annotation Scanner
// DLA-09: 掃描 src/ 中的 [Intentional: IDD-XXX] 標註
// BR-SCAN-CODE: 偵測 valid vs orphaned annotations
// ============================================================
// 使用方式:
//   node .context-db/scripts/scan-code-idd-references.js
//   node .context-db/scripts/scan-code-idd-references.js --output json
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Directories to scan (source code + claude config)
const SCAN_DIRS = [
  { dir: path.join(PROJECT_ROOT, 'src'), exts: ['.cs', '.tsx', '.ts', '.js'] },
  { dir: path.join(PROJECT_ROOT, '.claude', 'rules'), exts: ['.md'] },
  { dir: path.join(PROJECT_ROOT, '.claude', 'hooks'), exts: ['.js', '.ts'] },
];

// Pattern: [Intentional: IDD-TYPE-NNN] or [Intentional:IDD-TYPE-NNN]
const ANNOTATION_REGEX = /\[Intentional:\s*(IDD-[A-Z]+-\d+)\]/g;

function getActiveIddIds(db) {
  try {
    const rows = db.prepare("SELECT idd_id FROM intentional_decisions WHERE status = 'active'").all();
    return new Set(rows.map(r => r.idd_id));
  } catch {
    // Table might not exist yet or no records
    return new Set();
  }
}

function scanFile(filePath, activeIddIds) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const annotations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    ANNOTATION_REGEX.lastIndex = 0;
    let match;
    while ((match = ANNOTATION_REGEX.exec(line)) !== null) {
      const idd_id = match[1];
      const relPath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
      annotations.push({
        file: relPath,
        line: i + 1,
        idd_id,
        snippet: line.trim().substring(0, 120),
        status: activeIddIds.has(idd_id) ? 'valid' : 'orphaned',
      });
    }
  }

  return annotations;
}

function walkDir(dirPath, exts) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;

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
        // Skip common non-source directories
        if (['node_modules', 'bin', 'obj', '.git', 'dist', 'build'].includes(entry.name)) continue;
        recurse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  recurse(dirPath);
  return files;
}

function main() {
  const outputJson = process.argv.includes('--output') &&
    process.argv[process.argv.indexOf('--output') + 1] === 'json';

  // Load DB for cross-referencing
  let db = null;
  let activeIddIds = new Set();
  if (fs.existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true });
    activeIddIds = getActiveIddIds(db);
  }

  if (!outputJson) {
    console.log(`\n🔍 Scanning source files for [Intentional: IDD-XXX] annotations...\n`);
    if (activeIddIds.size === 0) {
      console.log(`  ℹ️  No active IDD records in DB — all annotations will be marked orphaned\n`);
    } else {
      console.log(`  ✓ Loaded ${activeIddIds.size} active IDD(s) from DB\n`);
    }
  }

  const allAnnotations = [];
  let totalFilesScanned = 0;

  for (const { dir, exts } of SCAN_DIRS) {
    const files = walkDir(dir, exts);
    totalFilesScanned += files.length;

    for (const filePath of files) {
      try {
        const annotations = scanFile(filePath, activeIddIds);
        allAnnotations.push(...annotations);
      } catch (err) {
        if (!outputJson) {
          console.warn(`  ⚠️  Could not read: ${path.relative(PROJECT_ROOT, filePath)} — ${err.message}`);
        }
      }
    }
  }

  if (db) db.close();

  const validAnnotations = allAnnotations.filter(a => a.status === 'valid');
  const orphanedAnnotations = allAnnotations.filter(a => a.status === 'orphaned');

  const summary = {
    files_scanned: totalFilesScanned,
    annotations_found: allAnnotations.length,
    valid: validAnnotations.length,
    orphaned: orphanedAnnotations.length,
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify({
      valid_annotations: validAnnotations,
      orphaned_annotations: orphanedAnnotations,
      all_annotations: allAnnotations,
      summary,
    }, null, 2));
  } else {
    if (allAnnotations.length > 0) {
      console.log('  📋 Found annotations:');
      for (const a of allAnnotations) {
        const icon = a.status === 'valid' ? '✓' : '⚠️ ORPHANED';
        console.log(`     ${icon} ${a.file}:${a.line} → ${a.idd_id}`);
        if (a.status === 'orphaned') {
          console.log(`           snippet: ${a.snippet}`);
        }
      }
      console.log('');
    }

    console.log(`✅ Scanned ${summary.files_scanned} files, found ${summary.annotations_found} annotations, ${summary.orphaned} orphaned`);

    if (orphanedAnnotations.length > 0) {
      console.log(`\n⚠️  ${orphanedAnnotations.length} orphaned annotation(s) — code references IDD not in DB:`);
      for (const a of orphanedAnnotations) {
        console.log(`   - ${a.file}:${a.line} → ${a.idd_id} (not in intentional_decisions)`);
      }
    }
  }

  return {
    valid_annotations: validAnnotations,
    orphaned_annotations: orphanedAnnotations,
    all_annotations: allAnnotations,
    summary,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}

export { main as scanCodeIddReferences, getActiveIddIds, scanFile, walkDir, ANNOTATION_REGEX };
