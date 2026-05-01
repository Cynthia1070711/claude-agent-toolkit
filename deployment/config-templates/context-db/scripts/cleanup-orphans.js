// ============================================================
// cleanup-orphans.js — Monthly orphan record cleanup
// §8 Layer 3: Soft delete orphan records
// Usage: node .context-db/scripts/cleanup-orphans.js [--dry-run]
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
} catch {
  console.error('better-sqlite3 not available');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const now = getTaiwanTimestamp();
  let totalCleaned = 0;

  console.log(`\n=== PCPT Context Memory DB Cleanup ===`);
  console.log(`Timestamp: ${now}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // 1. Orphan symbol_embeddings (symbol_id not in symbol_index)
  const orphanEmbeddings = db.prepare(`
    SELECT COUNT(*) as n FROM symbol_embeddings
    WHERE symbol_id NOT IN (SELECT id FROM symbol_index)
  `).get().n;
  console.log(`Orphan symbol_embeddings: ${orphanEmbeddings}`);
  if (orphanEmbeddings > 0 && !DRY_RUN) {
    db.prepare('DELETE FROM symbol_embeddings WHERE symbol_id NOT IN (SELECT id FROM symbol_index)').run();
    totalCleaned += orphanEmbeddings;
  }

  // 2. Orphan document_embeddings (chunk_id not in document_chunks)
  const orphanDocEmbed = db.prepare(`
    SELECT COUNT(*) as n FROM document_embeddings
    WHERE chunk_id NOT IN (SELECT id FROM document_chunks)
  `).get().n;
  console.log(`Orphan document_embeddings: ${orphanDocEmbed}`);
  if (orphanDocEmbed > 0 && !DRY_RUN) {
    db.prepare('DELETE FROM document_embeddings WHERE chunk_id NOT IN (SELECT id FROM document_chunks)').run();
    totalCleaned += orphanDocEmbed;
  }

  // 3. Processed embedding_queue older than 7 days
  const oldQueue = db.prepare(`
    SELECT COUNT(*) as n FROM embedding_queue
    WHERE processed = 1 AND queued_at < datetime('now', '-7 days', '+8 hours')
  `).get().n;
  console.log(`Old processed embedding_queue (>7d): ${oldQueue}`);
  if (oldQueue > 0 && !DRY_RUN) {
    db.prepare("DELETE FROM embedding_queue WHERE processed = 1 AND queued_at < datetime('now', '-7 days', '+8 hours')").run();
    totalCleaned += oldQueue;
  }

  // 4. Stale document_chunks (is_stale = 1)
  const staleChunks = db.prepare(`
    SELECT COUNT(*) as n FROM document_chunks WHERE is_stale = 1
  `).get().n;
  console.log(`Stale document_chunks: ${staleChunks}`);
  if (staleChunks > 0 && !DRY_RUN) {
    // Delete embeddings first (FK), then chunks
    db.prepare('DELETE FROM document_embeddings WHERE chunk_id IN (SELECT id FROM document_chunks WHERE is_stale = 1)').run();
    db.prepare('DELETE FROM document_chunks WHERE is_stale = 1').run();
    totalCleaned += staleChunks;
  }

  // 5. Orphan cr_issues (cr_report_id not in cr_reports)
  const orphanCrIssues = db.prepare(`
    SELECT COUNT(*) as n FROM cr_issues
    WHERE cr_report_id NOT IN (SELECT id FROM cr_reports)
  `).get().n;
  console.log(`Orphan cr_issues: ${orphanCrIssues}`);
  if (orphanCrIssues > 0 && !DRY_RUN) {
    db.prepare('DELETE FROM cr_issues WHERE cr_report_id NOT IN (SELECT id FROM cr_reports)').run();
    totalCleaned += orphanCrIssues;
  }

  // Summary
  console.log(`\n=== Cleanup Complete ===`);
  if (DRY_RUN) {
    const total = orphanEmbeddings + orphanDocEmbed + oldQueue + staleChunks + orphanCrIssues;
    console.log(`🔍 DRY RUN: ${total} records would be cleaned`);
    console.log('Run without --dry-run to execute cleanup');
  } else {
    console.log(`🗑️ Cleaned ${totalCleaned} orphan records`);
  }

  db.close();
}

main().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
