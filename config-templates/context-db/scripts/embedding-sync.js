// ============================================================
// PCPT Context Memory DB — Embedding 同步共用模組
// CMI-10: 全表向量化 — 統一所有寫入入口的 Embedding 生成
// ============================================================
// 用途：所有寫入入口（MCP Tool / Hook / CLI 腳本）呼叫此模組
//       同步或非同步生成 Embedding 並寫入對應 xxx_embeddings 表
//
// API:
//   syncEmbedding(db, tableName, entryId, text)   → 單筆同步
//   syncEmbeddingBatch(db, tableName, entries[])   → 批次同步
//   buildInputText(tableName, row)                 → 組合 Embedding 輸入文字
//
// 支援表: context, tech, stories, conversations, debt
// ============================================================

import { generateEmbedding, generateEmbeddings, MODEL_NAME, DIMENSIONS } from './local-embedder.js';

// ── 表別設定 ──────────────────────────────────────────────────

const TABLE_CONFIG = {
  context: {
    embeddingTable: 'context_embeddings',
    fkColumn: 'entry_id',
    sourceTable: 'context_entries',
    sourceId: 'id',
  },
  tech: {
    embeddingTable: 'tech_embeddings',
    fkColumn: 'entry_id',
    sourceTable: 'tech_entries',
    sourceId: 'id',
  },
  stories: {
    embeddingTable: 'stories_embeddings',
    fkColumn: 'story_id',
    sourceTable: 'stories',
    sourceId: 'story_id',
  },
  conversations: {
    embeddingTable: 'conversation_embeddings',
    fkColumn: 'session_id',
    sourceTable: 'conversation_sessions',
    sourceId: 'session_id',
  },
  debt: {
    embeddingTable: 'debt_embeddings',
    fkColumn: 'item_id',
    sourceTable: 'tech_debt_items',
    sourceId: 'id',
  },
};

// ── Float32Array → Buffer 序列化 ─────────────────────────────

function serializeVector(float32Array) {
  return Buffer.from(float32Array.buffer, float32Array.byteOffset, float32Array.byteLength);
}

// ── Token 估算 ───────────────────────────────────────────────

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ── buildInputText: 依表組合 Embedding 輸入文字 ──────────────

/**
 * 依表名從 row 組合 Embedding 輸入文字。
 * @param {string} tableName - 表名 (context|tech|stories|conversations|debt)
 * @param {object} row - DB 查詢結果
 * @returns {string} 輸入文字（截斷至 32000 字元）
 */
export function buildInputText(tableName, row) {
  let text = '';

  switch (tableName) {
    case 'context':
      text = [row.title, row.content].filter(Boolean).join('\n');
      break;
    case 'tech':
      text = [row.title, row.problem, row.solution].filter(Boolean).join('\n');
      break;
    case 'stories':
      text = [row.title, row.tags, row.dev_notes].filter(Boolean).join('\n');
      break;
    case 'conversations':
      text = [row.first_prompt, row.summary, row.topics].filter(Boolean).join('\n');
      break;
    case 'debt':
      text = [row.title, row.description, row.fix_guidance].filter(Boolean).join('\n');
      break;
    default:
      throw new Error(`Unknown table: ${tableName}`);
  }

  // 截斷至 2048 字元（all-MiniLM-L6-v2 max_seq_length=256 tokens ≈ 1024 字元，2× 餘裕）
  return text.length > 2048 ? text.slice(0, 2048) : text;
}

// ── syncEmbedding: 單筆同步 ─────────────────────────────────

/**
 * 為單筆記錄生成 Embedding 並寫入對應 xxx_embeddings 表。
 * @param {object} db - better-sqlite3 DB 實例
 * @param {string} tableName - 表名 (context|tech|stories|conversations|debt)
 * @param {number} entryId - 來源表的 ID/rowid
 * @param {string} text - Embedding 輸入文字（已組合好的）
 */
export async function syncEmbedding(db, tableName, entryId, text) {
  const config = TABLE_CONFIG[tableName];
  if (!config) throw new Error(`Unknown table: ${tableName}`);

  if (!text || text.trim().length === 0) return;

  const vec = await generateEmbedding(text.trim());
  if (!vec || vec.length !== DIMENSIONS) {
    throw new Error(`Embedding 維度異常: ${vec?.length} !== ${DIMENSIONS}`);
  }

  const buffer = serializeVector(vec);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO ${config.embeddingTable}
      (${config.fkColumn}, embedding, model, dimensions, token_count, generated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entryId, buffer, MODEL_NAME, DIMENSIONS, estimateTokens(text), now);
}

// ── syncEmbeddingBatch: 批次同步 ────────────────────────────

/**
 * 批次生成 Embedding 並寫入。
 * @param {object} db - better-sqlite3 DB 實例
 * @param {string} tableName - 表名
 * @param {Array<{id: number|string, text: string}>} entries - [{id, text}, ...]
 * @param {number} [batchSize=20] - 每批大小
 * @returns {Promise<{success: number, fail: number}>} 統計
 */
export async function syncEmbeddingBatch(db, tableName, entries, batchSize = 20) {
  const config = TABLE_CONFIG[tableName];
  if (!config) throw new Error(`Unknown table: ${tableName}`);

  let success = 0;
  let fail = 0;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ${config.embeddingTable}
      (${config.fkColumn}, embedding, model, dimensions, token_count, generated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const texts = batch.map(e => e.text.trim()).filter(Boolean);

    if (texts.length === 0) continue;

    try {
      const embeddings = await generateEmbeddings(texts);
      const now = new Date().toISOString();

      const insertBatch = db.transaction(() => {
        let textIdx = 0;
        for (const entry of batch) {
          if (!entry.text.trim()) { fail++; continue; }
          const vec = embeddings[textIdx++];
          if (!vec || vec.length !== DIMENSIONS) { fail++; continue; }
          insertStmt.run(
            entry.id,
            serializeVector(vec),
            MODEL_NAME,
            DIMENSIONS,
            estimateTokens(entry.text),
            now,
          );
          success++;
        }
      });
      insertBatch();
    } catch (err) {
      fail += batch.length;
      process.stderr.write(`[embedding-sync] Batch error: ${err.message}\n`);
    }
  }

  return { success, fail };
}

// ── 匯出設定供外部使用 ──────────────────────────────────────

export { TABLE_CONFIG, DIMENSIONS, MODEL_NAME };
