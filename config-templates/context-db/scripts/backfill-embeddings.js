// ============================================================
// PCPT Context Memory DB — 全表 Embedding 批次回補腳本
// CMI-10: 對 5 張核心表批次生成 Embedding 向量
// ============================================================
// 執行方式:
//   全表全量: node scripts/backfill-embeddings.js --full
//   增量補全: node scripts/backfill-embeddings.js --incremental
//   指定表:   node scripts/backfill-embeddings.js --full --table context
//   多表:     node scripts/backfill-embeddings.js --full --table context,tech
//
// 支援表: context, tech, stories, conversations, debt
// 無需 API Key（本地 ONNX 推理，$0.00）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { buildInputText, syncEmbeddingBatch, TABLE_CONFIG, MODEL_NAME } from './embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const ALL_TABLES = Object.keys(TABLE_CONFIG);
const BATCH_SIZE = 20;

// ── CLI 參數解析 ─────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { mode: null, tables: ALL_TABLES };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--full') result.mode = 'full';
    if (args[i] === '--incremental') result.mode = 'incremental';
    if (args[i] === '--table' && args[i + 1]) {
      result.tables = args[++i].split(',').map(t => t.trim());
    }
  }

  return result;
}

// ── 查詢來源表資料 ───────────────────────────────────────────

function getSourceQuery(tableName) {
  switch (tableName) {
    case 'context':
      return 'SELECT id, title, content FROM context_entries ORDER BY id';
    case 'tech':
      return 'SELECT id, title, problem, solution FROM tech_entries ORDER BY id';
    case 'stories':
      return 'SELECT story_id, title, tags, dev_notes FROM stories ORDER BY story_id';
    case 'conversations':
      return 'SELECT session_id, first_prompt, summary, topics FROM conversation_sessions ORDER BY session_id';
    case 'debt':
      return 'SELECT id, title, description, fix_guidance FROM tech_debt_items ORDER BY id';
    default:
      throw new Error(`Unknown table: ${tableName}`);
  }
}

function getIdField(tableName) {
  if (tableName === 'stories') return 'story_id';
  if (tableName === 'conversations') return 'session_id';
  return 'id';
}

// ── 主程序 ───────────────────────────────────────────────────

async function main() {
  const { mode, tables } = parseArgs();

  if (!mode) {
    console.error('❌ 請指定模式: --full 或 --incremental');
    console.error('   --full           清空後全量重建');
    console.error('   --incremental    僅對無 embedding 的記錄生成');
    console.error('   --table <names>  指定表（逗號分隔，預設全部）');
    console.error(`   支援表: ${ALL_TABLES.join(', ')}`);
    process.exit(1);
  }

  // 驗證表名
  for (const t of tables) {
    if (!TABLE_CONFIG[t]) {
      console.error(`❌ 無效表名: ${t}。支援: ${ALL_TABLES.join(', ')}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  console.log('='.repeat(60));
  console.log(`⚡ CMI-10 全表 Embedding 回補（${mode} 模式）`);
  console.log(`   表: ${tables.join(', ')}`);
  console.log(`   model: ${MODEL_NAME}`);
  console.log('='.repeat(60));

  const stats = { totalSuccess: 0, totalFail: 0, totalSkipped: 0 };

  for (const tableName of tables) {
    const config = TABLE_CONFIG[tableName];
    console.log(`\n── ${tableName} (${ config.embeddingTable }) ──`);

    // 全量模式：清空
    if (mode === 'full') {
      const deleted = db.prepare(`DELETE FROM ${config.embeddingTable}`).run();
      console.log(`   🗑️  清除 ${deleted.changes} 條舊 embedding`);
    }

    // 查詢來源資料
    const sourceQuery = getSourceQuery(tableName);
    const idField = getIdField(tableName);
    let rows = db.prepare(sourceQuery).all();

    // 增量模式：過濾已有 embedding 的記錄
    if (mode === 'incremental') {
      const existingIds = new Set(
        db.prepare(`SELECT ${config.fkColumn} FROM ${config.embeddingTable}`)
          .all()
          .map(r => r[config.fkColumn])
      );
      const before = rows.length;
      rows = rows.filter(r => !existingIds.has(r[idField]));
      const skipped = before - rows.length;
      stats.totalSkipped += skipped;
      console.log(`   🔍 增量：${before} 條來源，${skipped} 條已有 embedding，${rows.length} 條待處理`);
    } else {
      console.log(`   🔍 全量：${rows.length} 條待處理`);
    }

    if (rows.length === 0) {
      console.log(`   ✅ 無需處理`);
      continue;
    }

    // 組合 entries
    const entries = rows.map(row => ({
      id: row[idField],
      text: buildInputText(tableName, row),
    })).filter(e => e.text.length > 0);

    console.log(`   ⚡ 開始生成（${entries.length} 條，批次 ${BATCH_SIZE}）...`);

    const result = await syncEmbeddingBatch(db, tableName, entries, BATCH_SIZE);
    stats.totalSuccess += result.success;
    stats.totalFail += result.fail;

    console.log(`   ✅ 成功: ${result.success} | ❌ 失敗: ${result.fail}`);
  }

  db.close();

  // 統計輸出
  console.log('\n' + '='.repeat(60));
  console.log('📊 回補統計:');
  console.log(`   成功: ${stats.totalSuccess}`);
  console.log(`   失敗: ${stats.totalFail}`);
  console.log(`   跳過（增量）: ${stats.totalSkipped}`);
  console.log(`   推理成本: $0.00 (local ONNX)`);
  console.log('='.repeat(60));

  if (stats.totalFail > 0) {
    console.log(`\n⚠️ ${stats.totalFail} 條失敗，可重新執行 --incremental 補全`);
    process.exit(1);
  }

  console.log('\n✅ 全表 Embedding 回補完成！');
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
