// ============================================================
// PCPT Context Memory DB — uses 依賴推斷腳本
// TD-34 AC-5: TD-33-D1 技術債修復
// ============================================================
// 執行方式: node scripts/infer-uses-deps.js
//
// 策略: Embedding Cosine Similarity 啟發式方法
//   - 若兩個 Symbol 的 Cosine Similarity > 0.85
//   - 且不在同一個 class（parent_symbol 不同）
//   - 推斷為 uses 關係，標記 relation_type = 'uses_inferred'
//
// 去重: 排除已存在的 calls/inherits/implements/uses 依賴
// 注意: 此為啟發式方法，可能有假陽性
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { cosineSimilarity, deserializeVector } from './generate-embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// Cosine Similarity 門檻（> 0.85 才推斷為 uses 關係）
const SIMILARITY_THRESHOLD = 0.85;

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ── 確認 symbol_embeddings 資料存在 ──
  const embCount = db.prepare('SELECT COUNT(*) AS cnt FROM symbol_embeddings').get();
  if (!embCount || embCount.cnt === 0) {
    console.error('❌ symbol_embeddings 為空，請先執行 node scripts/generate-embeddings.js --full');
    db.close();
    process.exit(1);
  }
  console.log(`✅ symbol_embeddings: ${embCount.cnt} 條記錄`);

  // ── 載入全部非 method Symbol 的 embedding ──
  // (method 通常屬於 class，不做 class-level uses 推斷)
  const rows = db.prepare(`
    SELECT se.symbol_id, se.embedding,
           si.symbol_name, si.full_name, si.symbol_type,
           si.parent_symbol, si.namespace, si.file_path
    FROM symbol_embeddings se
    JOIN symbol_index si ON se.symbol_id = si.id
    WHERE si.symbol_type IN ('class', 'interface', 'enum')
    ORDER BY se.symbol_id
  `).all();

  console.log(`🔍 載入 ${rows.length} 個非 method Symbol 進行 Cosine Similarity 計算`);

  if (rows.length === 0) {
    console.log('✅ 無 class/interface/enum Symbol，跳過。');
    db.close();
    return;
  }

  // ── 反序列化向量 ──
  const symbols = rows.map(r => ({
    ...r,
    vec: deserializeVector(r.embedding),
  }));

  // ── 載入現有 depends 避免重複 ──
  const existingDeps = new Set(
    db.prepare(`
      SELECT source_symbol || '||' || target_symbol AS key
      FROM symbol_dependencies
      WHERE relation_type IN ('calls', 'inherits', 'implements', 'uses', 'uses_inferred')
    `).all().map(r => r.key)
  );
  console.log(`📋 現有依賴關係: ${existingDeps.size} 條（用於去重）`);

  // ── insert statement ──
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO symbol_dependencies (source_symbol, target_symbol, relation_type, source_file, target_file)
    VALUES (?, ?, 'uses_inferred', ?, ?)
  `);

  let inferredCount = 0;
  let skippedSameClass = 0;
  let skippedExisting = 0;
  let skippedBelowThreshold = 0;

  // ── O(n²) 成對計算（5294 symbols 約 14M 對，class 只有數百個故可接受）──
  console.log(`\n⚡ 開始計算成對 Cosine Similarity（門檻: ${SIMILARITY_THRESHOLD}）...\n`);

  const insertBatch = db.transaction((pairs) => {
    for (const pair of pairs) {
      insertStmt.run(pair.source, pair.target, pair.sourceFile, pair.targetFile);
      inferredCount++;
    }
  });

  const pendingPairs = [];
  const BATCH_SIZE = 500;

  for (let i = 0; i < symbols.length; i++) {
    const a = symbols[i];

    for (let j = i + 1; j < symbols.length; j++) {
      const b = symbols[j];

      // 去重 1: 同一個 parent_symbol（即同一 class 的成員）
      if (a.parent_symbol && b.parent_symbol && a.parent_symbol === b.parent_symbol) {
        skippedSameClass++;
        continue;
      }

      // 去重 2: 已有精確 AST 依賴
      const keyAB = `${a.full_name}||${b.full_name}`;
      const keyBA = `${b.full_name}||${a.full_name}`;
      if (existingDeps.has(keyAB) || existingDeps.has(keyBA)) {
        skippedExisting++;
        continue;
      }

      // 計算相似度
      const score = cosineSimilarity(a.vec, b.vec);
      if (score <= SIMILARITY_THRESHOLD) {
        skippedBelowThreshold++;
        continue;
      }

      // 推斷為 uses_inferred（雙向均加入，source = 較小 id 的）
      pendingPairs.push({
        source: a.full_name,
        target: b.full_name,
        sourceFile: a.file_path,
        targetFile: b.file_path,
      });

      // 批次寫入
      if (pendingPairs.length >= BATCH_SIZE) {
        insertBatch(pendingPairs.splice(0, BATCH_SIZE));
        process.stdout.write(`  已推斷: ${inferredCount}\r`);
      }
    }

    if (i % 50 === 0) {
      process.stdout.write(`  進度: ${i + 1}/${symbols.length} Symbol 掃描完成\r`);
    }
  }

  // 寫入剩餘
  if (pendingPairs.length > 0) {
    insertBatch(pendingPairs);
  }

  db.close();

  console.log('\n' + '─'.repeat(50));
  console.log('📊 uses_inferred 推斷統計:');
  console.log(`   新增 uses_inferred 依賴: ${inferredCount} 條`);
  console.log(`   跳過（同 class）: ${skippedSameClass} 對`);
  console.log(`   跳過（已有精確依賴）: ${skippedExisting} 對`);
  console.log(`   跳過（相似度 <= ${SIMILARITY_THRESHOLD}）: ${skippedBelowThreshold} 對`);
  console.log('─'.repeat(50));
  console.log(`\n✅ uses 依賴推斷完成！relation_type='uses_inferred' 已寫入 symbol_dependencies`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
