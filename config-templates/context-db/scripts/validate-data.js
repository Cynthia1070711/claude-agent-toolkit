// ============================================================
// validate-data.js — Weekly DB consistency check
// §8 Layer 3: Git vs DB record count comparison
// Usage: node .context-db/scripts/validate-data.js
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  console.error('better-sqlite3 not available');
  process.exit(1);
}

function countFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { recursive: true });
  return entries.filter(f => pattern.test(f)).length;
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const now = getTaiwanTimestamp();
  const issues = [];

  console.log(`\n=== PCPT Context Memory DB Validation ===`);
  console.log(`Timestamp: ${now}\n`);

  // 1. Core table row counts
  const tables = [
    'context_entries', 'tech_entries', 'stories', 'cr_reports', 'cr_issues',
    'tech_debt_items', 'conversation_sessions', 'conversation_turns',
    'symbol_index', 'symbol_embeddings', 'doc_index', 'document_chunks',
    'document_embeddings', 'glossary', 'workflow_executions', 'benchmarks',
    'test_journeys', 'test_traceability', 'pattern_observations', 'embedding_queue',
  ];

  console.log('── Table Row Counts ──');
  for (const t of tables) {
    try {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get();
      console.log(`  ${t}: ${n}`);
    } catch (e) {
      console.log(`  ${t}: ERROR (${e.message})`);
      issues.push({ table: t, issue: 'table missing or inaccessible' });
    }
  }

  // 2. Embedding coverage check
  console.log('\n── Embedding Coverage ──');
  const symbolTotal = db.prepare('SELECT COUNT(*) as n FROM symbol_index').get().n;
  const symbolEmbed = db.prepare('SELECT COUNT(*) as n FROM symbol_embeddings WHERE embedding IS NOT NULL').get().n;
  const coverage = symbolTotal > 0 ? ((symbolEmbed / symbolTotal) * 100).toFixed(1) : '0';
  console.log(`  symbol_index: ${symbolTotal} | symbol_embeddings: ${symbolEmbed} | coverage: ${coverage}%`);
  if (symbolTotal > symbolEmbed) {
    issues.push({ table: 'symbol_embeddings', issue: `${symbolTotal - symbolEmbed} symbols without embeddings` });
  }

  const docTotal = db.prepare('SELECT COUNT(*) as n FROM document_chunks').get().n;
  const docEmbed = db.prepare('SELECT COUNT(*) as n FROM document_embeddings WHERE embedding IS NOT NULL').get().n;
  const docCov = docTotal > 0 ? ((docEmbed / docTotal) * 100).toFixed(1) : '0';
  console.log(`  document_chunks: ${docTotal} | document_embeddings: ${docEmbed} | coverage: ${docCov}%`);

  // 3. FTS5 sync check (compare base table vs FTS rowcount)
  console.log('\n── FTS5 Sync Check ──');
  const ftsChecks = [
    ['context_entries', 'context_fts'],
    ['tech_entries', 'tech_fts'],
    ['stories', 'stories_fts'],
    ['tech_debt_items', 'tech_debt_fts'],
  ];
  for (const [base, fts] of ftsChecks) {
    try {
      const baseCount = db.prepare(`SELECT COUNT(*) as n FROM ${base}`).get().n;
      const ftsCount = db.prepare(`SELECT COUNT(*) as n FROM ${fts}`).get().n;
      const match = baseCount === ftsCount ? 'OK' : `MISMATCH (base=${baseCount}, fts=${ftsCount})`;
      console.log(`  ${base} ↔ ${fts}: ${match}`);
      if (baseCount !== ftsCount) {
        issues.push({ table: fts, issue: `FTS5 out of sync: base=${baseCount}, fts=${ftsCount}` });
      }
    } catch (e) {
      console.log(`  ${base} ↔ ${fts}: ERROR`);
    }
  }

  // 4. Story file vs DB check
  console.log('\n── Story File vs DB ──');
  const storyDir = path.join(PROJECT_ROOT, 'docs', 'implementation-artifacts', 'stories');
  const storyFiles = countFiles(storyDir, /\.md$/);
  const dbStories = db.prepare('SELECT COUNT(*) as n FROM stories').get().n;
  console.log(`  Story .md files: ${storyFiles} | DB stories: ${dbStories}`);

  // 5. Stale embedding queue
  const queuePending = db.prepare('SELECT COUNT(*) as n FROM embedding_queue WHERE processed = 0').get().n;
  console.log(`\n── Embedding Queue ──`);
  console.log(`  Pending: ${queuePending}`);
  if (queuePending > 50) {
    issues.push({ table: 'embedding_queue', issue: `${queuePending} pending items (>50 threshold)` });
  }

  // Summary
  console.log(`\n=== Validation Complete ===`);
  if (issues.length === 0) {
    console.log('✅ All checks passed');
  } else {
    console.log(`⚠️ ${issues.length} issue(s) found:`);
    issues.forEach((iss, i) => console.log(`  ${i + 1}. [${iss.table}] ${iss.issue}`));
  }

  db.close();
}

main().catch(err => {
  console.error('Validation failed:', err.message);
  process.exit(1);
});
