// ============================================================
// PCPT Context Memory DB — Embedding 生成腳本
// TD-34: Phase 2 — Symbol Embedding + Vector 儲存
// CMI-6: 替換 OpenAI API → 本地 ONNX 推理（Transformers.js）
// ============================================================
// 執行方式:
//   全量生成: node scripts/generate-embeddings.js --full
//   增量生成: node scripts/generate-embeddings.js --incremental
//
// 需求:
//   - symbol_index 表中須已有 Symbol 資料（TD-33 前置）
//   - symbol_embeddings 表須已存在（run init-db.js first）
//   - 無需任何 API Key（本地 ONNX 推理）
//
// 統計輸出: 數量 / 推理時間 / 成本（$0.00 local）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { generateEmbeddings, MODEL_NAME, DIMENSIONS } from './local-embedder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const BATCH_SIZE = 20;
const MAX_TOKENS_PER_INPUT = 8000;
// 平均每個字符約 0.25 tokens（英文程式碼，用於 DB token_count 欄位估算）
const CHARS_TO_TOKENS_RATIO = 0.25;

// ──────────────────────────────────────────────
// Cosine Similarity（純 JavaScript，零外部依賴）
// ──────────────────────────────────────────────
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error(`向量維度不符: ${vecA.length} vs ${vecB.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ──────────────────────────────────────────────
// Float32Array <-> Buffer 序列化
// ──────────────────────────────────────────────
export function serializeVector(float32Array) {
  return Buffer.from(float32Array.buffer);
}

export function deserializeVector(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

// ──────────────────────────────────────────────
// input text 建構（截斷至 MAX_TOKENS_PER_INPUT）
// ──────────────────────────────────────────────
function buildInputText(row) {
  const signature = row.signature || row.symbol_name || '';
  const snippet = row.code_snippet || '';
  const full = `${signature}\n${snippet}`;
  // 每個 token 約 4 個字符（保守截斷）
  const maxChars = MAX_TOKENS_PER_INPUT * 4;
  return full.length > maxChars ? full.slice(0, maxChars) : full;
}

// ──────────────────────────────────────────────
// 估算 token 數（快速近似）
// ──────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil(text.length * CHARS_TO_TOKENS_RATIO);
}

// ──────────────────────────────────────────────
// 主程序
// ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isIncremental = args.includes('--incremental');
  const isFull = args.includes('--full');

  if (!isIncremental && !isFull) {
    console.error('❌ 請指定模式: --full 或 --incremental');
    console.error('   --full        清空 symbol_embeddings 後全量重新生成');
    console.error('   --incremental 僅對無 embedding 的 Symbol 生成');
    process.exit(1);
  }

  // DB 連接
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}`);
    console.error('   請先執行: node scripts/init-db.js');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ── 全量模式：清空 symbol_embeddings ──
  if (isFull) {
    const deleted = db.prepare('DELETE FROM symbol_embeddings').run();
    console.log(`🗑️  全量模式：清除 ${deleted.changes} 條舊 embedding 記錄`);
  }

  // ── 查詢待處理的 Symbol ──
  let symbols;
  if (isIncremental) {
    // 增量：LEFT JOIN 找出無對應 embedding 的 Symbol
    symbols = db.prepare(`
      SELECT si.id, si.symbol_name, si.full_name, si.signature,
             SUBSTR(si.code_snippet, 1, 32000) AS code_snippet
      FROM symbol_index si
      LEFT JOIN symbol_embeddings se ON si.id = se.symbol_id
      WHERE se.symbol_id IS NULL
      ORDER BY si.id
    `).all();
    console.log(`🔍 增量模式：找到 ${symbols.length} 個無 embedding 的 Symbol`);
  } else {
    // 全量：所有 Symbol
    symbols = db.prepare(`
      SELECT id, symbol_name, full_name, signature,
             SUBSTR(code_snippet, 1, 32000) AS code_snippet
      FROM symbol_index
      ORDER BY id
    `).all();
    console.log(`🔍 全量模式：共 ${symbols.length} 個 Symbol`);
  }

  if (symbols.length === 0) {
    console.log('✅ 無需處理的 Symbol。');
    db.close();
    return;
  }

  // ── 準備寫入 statement ──
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO symbol_embeddings (symbol_id, embedding, model, dimensions, token_count, generated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // ── 統計變數 ──
  let successCount = 0;
  let failCount = 0;

  console.log(`\n⚡ 開始生成 Embedding（批次大小: ${BATCH_SIZE}，本地 ONNX 推理）\n`);
  console.log(`model: ${MODEL_NAME}`);

  // ── 批次處理 ──
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);

    process.stdout.write(`  批次 ${batchNum}/${totalBatches} (${batch.length} 個) ... `);

    // 建構 input texts
    const inputs = batch.map(row => buildInputText(row));

    try {
      // 本地 ONNX 批次推理（無 Rate Limiting，無 API 呼叫）
      const embeddings = await generateEmbeddings(inputs);

      // 寫入 DB
      const insertBatch = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const symbol = batch[j];
          const float32Array = embeddings[j];
          if (!float32Array || float32Array.length !== DIMENSIONS) {
            failCount++;
            process.stderr.write(`\n  ⚠️ Symbol ${symbol.id} (${symbol.symbol_name}): embedding 維度異常 (${float32Array?.length} != ${DIMENSIONS})\n`);
            continue;
          }

          const buffer = serializeVector(float32Array);
          const now = new Date().toISOString();

          insertStmt.run(
            symbol.id,
            buffer,
            MODEL_NAME,
            DIMENSIONS,
            estimateTokens(inputs[j]),
            now
          );
          successCount++;
        }
      });
      insertBatch();

      console.log(`✅`);
    } catch (err) {
      failCount += batch.length;
      console.log(`❌ 失敗: ${err.message}`);
      process.stderr.write(`[generate-embeddings] Batch ${batchNum} error: ${err.message}\n`);
    }
  }

  db.close();

  // ── 統計輸出 ──
  console.log('\n' + '─'.repeat(50));
  console.log('📊 生成統計:');
  console.log(`   成功: ${successCount} 個`);
  console.log(`   失敗: ${failCount} 個`);
  console.log(`   推理成本: $0.00 (local)`);
  console.log(`   model: ${MODEL_NAME}`);
  console.log('─'.repeat(50));

  if (failCount > 0) {
    console.log(`\n⚠️ ${failCount} 個 Symbol 生成失敗，可重新執行 --incremental 補全`);
    process.exit(1);
  }

  console.log('\n✅ Embedding 生成完成！');
}

// ESM entry-point guard: 僅在直接執行時啟動 main()，import 時不執行
const isMainModule = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
  });
}
