// ============================================================
// Phase 4: Incremental Embedding — Stop Hook
// Processes embedding_queue, re-embeds modified symbols
// ============================================================
// Trigger: Stop hook (after each Claude response)
// Safety: write connection, silent failure, batch limit
// Budget: max 20 symbols per invocation (< 5000ms on CPU)
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
  process.exit(0);
}

const MAX_SYMBOLS_PER_RUN = 20;

async function main() {
  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Check if embedding_queue table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='embedding_queue'"
    ).get();
    if (!tableExists) process.exit(0);

    // Fetch unprocessed queue entries
    const queue = db.prepare(
      'SELECT id, file_path FROM embedding_queue WHERE processed = 0 ORDER BY queued_at LIMIT 50'
    ).all();
    if (queue.length === 0) process.exit(0);

    // Normalize paths for matching — strip project root to get relative paths
    // embedding_queue stores absolute paths (C:/Users/.../src/...),
    // symbol_index stores relative paths (src/Platform/...)
    const projectRoot = path.resolve(__dirname, '..', '..').replace(/\\/g, '/') + '/';
    const filePaths = queue.map(q => {
      const normalized = q.file_path.replace(/\\/g, '/');
      return normalized.startsWith(projectRoot)
        ? normalized.slice(projectRoot.length)
        : normalized;
    });

    // Find symbols in those files
    const placeholders = filePaths.map(() => '?').join(',');
    const symbols = db.prepare(`
      SELECT id, symbol_name, full_name, signature, code_snippet
      FROM symbol_index
      WHERE REPLACE(file_path, '\\', '/') IN (${placeholders})
      ORDER BY id
      LIMIT ?
    `).all(...filePaths, MAX_SYMBOLS_PER_RUN);

    if (symbols.length === 0) {
      // No symbols found — mark queue as processed
      const markStmt = db.prepare('UPDATE embedding_queue SET processed = 1 WHERE id = ?');
      const tx = db.transaction(() => { for (const q of queue) markStmt.run(q.id); });
      tx();
      process.exit(0);
    }

    // Lazy-load embedding tools (ONNX model ~30ms warm, ~3s cold)
    const { generateEmbeddings, MODEL_NAME, DIMENSIONS } = await import('./local-embedder.js');
    const { serializeVector } = await import('./generate-embeddings.js');

    // Build input texts
    const inputs = symbols.map(s => {
      const text = [s.signature || '', s.code_snippet || ''].join('\n').trim();
      return text.slice(0, 32000); // ~8000 tokens max
    });

    // Generate embeddings
    const embeddings = await generateEmbeddings(inputs);
    if (!embeddings || embeddings.length !== symbols.length) {
      process.exit(0);
    }

    // Write to DB in transaction
    const now = getTaiwanTimestamp();
    const upsertStmt = db.prepare(`
      INSERT OR REPLACE INTO symbol_embeddings
        (symbol_id, embedding, model, dimensions, token_count, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const markStmt = db.prepare('UPDATE embedding_queue SET processed = 1 WHERE id = ?');

    const tx = db.transaction(() => {
      for (let i = 0; i < symbols.length; i++) {
        const vec = embeddings[i];
        if (!vec || vec.length !== DIMENSIONS) continue;
        const buf = serializeVector(vec);
        const tokenCount = Math.ceil(inputs[i].length * 0.25);
        upsertStmt.run(symbols[i].id, buf, MODEL_NAME, DIMENSIONS, tokenCount, now);
      }
      for (const q of queue) markStmt.run(q.id);
    });
    tx();

  } catch {
    // Silent failure — never block session end
  } finally {
    if (db) db.close();
  }
}

main();
