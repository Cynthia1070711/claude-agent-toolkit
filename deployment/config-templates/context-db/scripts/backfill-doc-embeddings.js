#!/usr/bin/env node
// ============================================================
// backfill-doc-embeddings.js — P1-A: 補 document_chunks 缺向量的 doc embedding
// ------------------------------------------------------------
// 對既有 document_chunks 中「無對應 document_embeddings」的 chunks 補 embed
// (非 re-import — backfill-embeddings.js 只支援 5 表不含 doc;import-documents.js
//  是從 doc 檔 re-import 重新 chunk,本 script 只對既有 chunk 補向量)。
//
// 釐清(2026-05-26):document_embeddings.chunk_id 100% 命中 document_chunks.id
//   (FK 同源),54847 chunks 真缺向量(coverage 19%)。
//
// 重用 import-documents.js 範式:generateEmbeddings + serializeVector(Float32→BLOB)
//   + INSERT OR REPLACE document_embeddings(7 欄)。
//
// 用法:
//   node backfill-doc-embeddings.js --dry-run          # 只報缺向量數,不寫
//   node backfill-doc-embeddings.js --limit 200        # 單次補 200(小批試跑/避免並行資源衝突)
//   node backfill-doc-embeddings.js                    # 全部補(⚠ 54K embed 耗時 + 並行 ECC CPU 資源,啟動前宜協調)
//
// Idempotent:NOT IN 排除已 embed → 可中斷後續跑補剩餘。
// Spec: 改善計畫-專家深度分析.md §5 P1-A (G3) · Memory id=4398
// ============================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { generateEmbeddings, MODEL_NAME, DIMENSIONS } from './local-embedder.js';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const BATCH_SIZE = 20;

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = null, dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') limit = parseInt(args[++i], 10) || null;
    if (args[i] === '--dry-run') dryRun = true;
  }
  return { limit, dryRun };
}

// Float32Array → BLOB (與 import-documents.js serializeVector / generate-embeddings.js 一致)
function serializeVector(float32Array) {
  return Buffer.from(float32Array.buffer);
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const totalMissing = db.prepare(
    `SELECT COUNT(*) c FROM document_chunks WHERE id NOT IN (SELECT chunk_id FROM document_embeddings)`
  ).get().c;

  let sql = `SELECT id, content, token_count FROM document_chunks
             WHERE id NOT IN (SELECT chunk_id FROM document_embeddings)
             ORDER BY id`;
  if (limit) sql += ` LIMIT ${limit}`;
  const pending = db.prepare(sql).all();

  console.log(`缺向量 chunks 總計: ${totalMissing} | 本次處理: ${pending.length}${limit ? ` (--limit ${limit})` : ''} | model: ${MODEL_NAME}`);
  if (pending.length === 0) { console.log('✅ 無缺向量 chunk'); db.close(); return; }
  if (dryRun) { console.log('--dry-run: 不寫入(僅報告)'); db.close(); return; }

  const stmtInsert = db.prepare(
    `INSERT OR REPLACE INTO document_embeddings (chunk_id, embedding, model, dimensions, token_count, batch_id, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const now = getTaiwanTimestamp();
  let done = 0, fail = 0;
  const totalBatches = Math.ceil(pending.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = pending.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchId = `p1a-doc-${Date.now()}-${b}`;
    try {
      const embeddings = await generateEmbeddings(batch.map(c => c.content));
      const tx = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const fa = embeddings[j];
          if (!fa || fa.length !== DIMENSIONS) {
            process.stderr.write(`\n  ⚠️ chunk_id ${batch[j].id}: 維度異常 (${fa?.length} != ${DIMENSIONS})\n`);
            fail++;
            continue;
          }
          stmtInsert.run(batch[j].id, serializeVector(fa), MODEL_NAME, DIMENSIONS, batch[j].token_count, batchId, now);
          done++;
        }
      });
      tx();
      if ((b + 1) % 10 === 0 || b === totalBatches - 1) {
        process.stdout.write(`  batch ${b + 1}/${totalBatches} | done=${done} fail=${fail}\r`);
      }
    } catch (e) {
      fail += batch.length;
      process.stderr.write(`\n  batch ${b} error: ${e.message}\n`);
    }
  }

  const cov = db.prepare(`SELECT COUNT(DISTINCT chunk_id) c FROM document_embeddings`).get().c;
  const tc = db.prepare(`SELECT COUNT(*) c FROM document_chunks`).get().c;
  console.log(`\n✅ embed done=${done} fail=${fail} | 剩餘缺向量=${totalMissing - done}`);
  console.log(`coverage: ${cov}/${tc} (${(cov / tc * 100).toFixed(1)}%)`);
  db.close();
}

main().catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });
