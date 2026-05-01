// ============================================================
// PCPT Context Memory DB — Embedding 遷移腳本
// CMI-6: 從 OpenAI text-embedding-3-small (1536D)
//        遷移至本地 ONNX Xenova/all-MiniLM-L6-v2 (384D)
// ============================================================
// 執行方式:
//   node scripts/migrate-embeddings.js
//
// 行為:
//   1. 清空 symbol_embeddings 表（舊 1536D 向量不相容）
//   2. 清空 document_embeddings 表（舊 1536D 向量不相容）
//   3. 呼叫 generate-embeddings.js --full 重建 symbol_embeddings
//   4. 清除 doc_index checksum 後呼叫 import-documents.js 重建 document_embeddings
//
// 注意:
//   - 遷移過程中 semantic_search 會降級至 LIKE 搜尋
//   - 遷移完成後語意搜尋恢復正常
//   - 無需任何 API Key（本地 ONNX 推理）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const SCRIPTS_DIR = __dirname;

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}`);
    console.error('   請先執行: node scripts/init-db.js');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ── Step 1: 統計現有資料 ──
  const symbolEmbCount = db.prepare('SELECT COUNT(*) as cnt FROM symbol_embeddings').get()?.cnt ?? 0;
  const docEmbCount = db.prepare("SELECT COUNT(*) as cnt FROM document_embeddings").get()?.cnt ?? 0;

  console.log('='.repeat(60));
  console.log('🔄 CMI-6 Embedding 遷移：OpenAI 1536D → 本地 ONNX 384D');
  console.log('='.repeat(60));
  console.log(`\n現有資料統計:`);
  console.log(`  symbol_embeddings: ${symbolEmbCount} 條`);
  console.log(`  document_embeddings: ${docEmbCount} 條`);

  // ── Step 2: 清空舊 Embedding（1536D 與 384D 不相容）──
  console.log('\n🗑️  清空舊 Embedding 資料...');
  const delSymbol = db.prepare('DELETE FROM symbol_embeddings').run();
  const delDoc = db.prepare('DELETE FROM document_embeddings').run();
  console.log(`  已清除 symbol_embeddings: ${delSymbol.changes} 條`);
  console.log(`  已清除 document_embeddings: ${delDoc.changes} 條`);

  db.close();

  // ── Step 3: 重建 Symbol Embeddings ──
  console.log('\n⚡ 重建 symbol_embeddings（本地 ONNX）...');
  const genEmbScript = path.join(SCRIPTS_DIR, 'generate-embeddings.js');
  try {
    execSync(`node "${genEmbScript}" --full`, {
      cwd: path.join(SCRIPTS_DIR, '..'),
      stdio: 'inherit',
    });
    console.log('✅ symbol_embeddings 重建完成');
  } catch (err) {
    console.error(`❌ symbol_embeddings 重建失敗: ${err.message}`);
    console.error('   可手動執行: node scripts/generate-embeddings.js --full');
  }

  // ── Step 4: 重建 Document Embeddings ──
  // 策略：先清除 doc_index 的 checksum（強制 import-documents.js 視為已修改），
  // 再重新執行 import 流程以重建 document_embeddings。
  const importDocScript = path.join(SCRIPTS_DIR, 'import-documents.js');
  if (fs.existsSync(importDocScript) && docEmbCount > 0) {
    console.log('\n⚡ 重建 document_embeddings（本地 ONNX）...');
    // 清除 doc_index checksum，強制 import-documents 重新處理所有文檔
    const resetDb = new Database(DB_PATH);
    resetDb.pragma('journal_mode = WAL');
    const resetCount = resetDb.prepare("UPDATE doc_index SET checksum = ''").run();
    resetDb.close();
    console.log(`   已重置 ${resetCount.changes} 筆 doc_index checksum`);

    try {
      execSync(`node "${importDocScript}"`, {
        cwd: path.join(SCRIPTS_DIR, '..'),
        stdio: 'inherit',
      });
      console.log('✅ document_embeddings 重建完成');
    } catch (err) {
      console.error(`❌ document_embeddings 重建失敗: ${err.message}`);
      console.error('   可手動執行: node scripts/import-documents.js');
    }
  } else if (docEmbCount === 0) {
    console.log('\n⏭️  document_embeddings 為空，跳過重建');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ CMI-6 遷移完成！');
  console.log('   新 Embedding 維度: 384D (Xenova/all-MiniLM-L6-v2)');
  console.log('   推理成本: $0.00 (local ONNX)');
  console.log('='.repeat(60));
}

// ESM entry-point guard
const isMainModule = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
  });
}
