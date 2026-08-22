// ============================================================
// documentService.ts — 文檔瀏覽 + Hybrid Fusion 搜尋服務
// P1: 文檔目錄瀏覽、語意搜尋、Embedding 統計
// ============================================================
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';
import { config } from '../config.js';
import { sanitizeFtsQuery, isShortQuery, escapeLikeQuery } from './ftsHelper.js';

// ── 型別定義 ──

export interface DocIndexEntry {
  id: number;
  title: string;
  path: string;
  category: string | null;
  epic_id: string | null;
  chunk_count: number;
  total_tokens: number;
  last_updated: string;
}

export interface DocumentChunk {
  id: number;
  heading_path: string;
  content: string;
  token_count: number;
  score?: number;
}

export interface DocumentSearchResult {
  items: DocumentChunk[];
  total: number;
  query: string;
}

export interface DocumentBrowseResult {
  items: DocIndexEntry[];
  total: number;
  page: number;
  pageSize: number;
  categories: { category: string; count: number }[];
}

export interface EmbeddingStats {
  symbolEmbeddings: number;
  symbolIndex: number;
  documentEmbeddings: number;
  documentChunks: number;
  docIndex: number;
  modelName: string;
  dimensions: number;
  totalTextBytes: number;
  avgChunkLen: number;
  maxChunkLen: number;
  categoryCounts: { category: string; count: number }[];
}

// ── 文檔列表（分頁 + 篩選）──

export function browseDocuments(
  category?: string,
  epicId?: string,
  page = 1,
  pageSize = 20,
): DocumentBrowseResult {
  const db = getDb();
  if (!db) return { items: [], total: 0, page, pageSize, categories: [] };

  const safePageSize = Math.min(pageSize, 100);
  const offset = (Math.max(page, 1) - 1) * safePageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (epicId) {
    conditions.push('epic_id = ?');
    params.push(epicId);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM doc_index ${whereSql}`).get(...params) as { cnt: number }
  ).cnt;

  const items = db
    .prepare(
      `SELECT id, title, path, category, epic_id, chunk_count, total_tokens, last_updated
       FROM doc_index ${whereSql}
       ORDER BY last_updated DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, safePageSize, offset) as DocIndexEntry[];

  // 分類統計（不受篩選影響）
  const categories = db
    .prepare(
      `SELECT category, COUNT(*) as count FROM doc_index
       WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC`,
    )
    .all() as { category: string; count: number }[];

  return { items, total, page, pageSize: safePageSize, categories };
}

// ── 文檔搜尋（FTS5 on document_chunks）──

export function searchDocuments(
  query: string,
  category?: string,
  limit = 10,
): DocumentSearchResult {
  const db = getDb();
  if (!db) return { items: [], total: 0, query };

  const safeLimit = Math.min(limit, 50);
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return { items: [], total: 0, query };

  let items: DocumentChunk[];

  const ftsQuery = sanitizeFtsQuery(trimmedQuery);
  if (ftsQuery) {
    // FTS5 trigram 搜尋（>= 3 字元）
    const conditions: string[] = ['document_chunks_fts MATCH ?'];
    const params: unknown[] = [ftsQuery];

    if (category) {
      conditions.push('di.category = ?');
      params.push(category);
    }

    items = db
      .prepare(
        `SELECT dc.id, dc.heading_path, dc.content, dc.token_count,
                rank AS score
         FROM document_chunks dc
         JOIN document_chunks_fts f ON dc.rowid = f.rowid
         JOIN doc_index di ON dc.doc_id = di.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...params, safeLimit) as DocumentChunk[];
  } else if (isShortQuery(trimmedQuery)) {
    // LIKE fallback（2 字元短查詢，如「雙面」「列印」）
    const likePattern = `%${escapeLikeQuery(trimmedQuery)}%`;
    const conditions: string[] = ['dc.content LIKE ? ESCAPE \'\\\''];
    const params: unknown[] = [likePattern];

    if (category) {
      conditions.push('di.category = ?');
      params.push(category);
    }

    items = db
      .prepare(
        `SELECT dc.id, dc.heading_path, dc.content, dc.token_count,
                0 AS score
         FROM document_chunks dc
         JOIN doc_index di ON dc.doc_id = di.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY dc.id
         LIMIT ?`,
      )
      .all(...params, safeLimit) as DocumentChunk[];
  } else {
    return { items: [], total: 0, query };
  }

  // 截斷 content 至前 500 字（搜尋結果預覽）
  for (const item of items) {
    if (item.content.length > 500) {
      item.content = item.content.slice(0, 500) + '…';
    }
  }

  return { items, total: items.length, query };
}

// ── 單一文檔完整內容（讀取原始 .md 檔案）──

export function getDocumentContent(docId: number): {
  doc: DocIndexEntry | null;
  content: string | null;
  error?: string;
} {
  const db = getDb();
  if (!db) return { doc: null, content: null, error: 'DB 未連線' };

  const doc = db
    .prepare('SELECT id, title, path, category, epic_id, chunk_count, total_tokens, last_updated FROM doc_index WHERE id = ?')
    .get(docId) as DocIndexEntry | undefined;

  if (!doc) return { doc: null, content: null, error: '文檔不存在' };

  // 從 doc_index.path（相對路徑）讀取原始檔案
  const absPath = path.resolve(config.projectRoot, doc.path);

  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    return { doc, content };
  } catch {
    return { doc, content: null, error: `檔案讀取失敗: ${doc.path}` };
  }
}

// ── 相關文檔查詢（Story/Epic 關聯 + 關鍵字搜尋）──

export function getRelatedDocuments(
  storyId?: string,
  epicId?: string,
  keywords?: string,
  limit = 10,
): DocIndexEntry[] {
  const db = getDb();
  if (!db) return [];

  const safeLimit = Math.min(limit, 30);

  // 策略 1: 透過 epic_id 精確比對
  if (epicId) {
    const epicDocs = db
      .prepare(
        `SELECT id, title, path, category, epic_id, chunk_count, total_tokens, last_updated
         FROM doc_index WHERE epic_id = ? ORDER BY last_updated DESC LIMIT ?`,
      )
      .all(epicId, safeLimit) as DocIndexEntry[];
    if (epicDocs.length > 0) return epicDocs;
  }

  // 策略 2: 從 storyId 提取關鍵字做 FTS5 搜尋
  if (storyId || keywords) {
    const searchTerms = keywords || (storyId ?? '').replace(/[-_]/g, ' ');
    const ftsQuery = sanitizeFtsQuery(searchTerms);
    if (ftsQuery) {
      try {
        return db
          .prepare(
            `SELECT DISTINCT di.id, di.title, di.path, di.category, di.epic_id,
                    di.chunk_count, di.total_tokens, di.last_updated
             FROM document_chunks dc
             JOIN document_chunks_fts f ON dc.rowid = f.rowid
             JOIN doc_index di ON dc.doc_id = di.id
             WHERE document_chunks_fts MATCH ?
             ORDER BY rank LIMIT ?`,
          )
          .all(ftsQuery, safeLimit) as DocIndexEntry[];
      } catch {
        return [];
      }
    }
  }

  return [];
}

// ── 分類群組統計（聚合 DB categories 為 UI 群組）──

export function getCategoryGroupStats(): { category: string; count: number }[] {
  const db = getDb();
  if (!db) return [];

  return db
    .prepare(
      `SELECT category, COUNT(*) as count FROM doc_index
       WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC`,
    )
    .all() as { category: string; count: number }[];
}

// ── Embedding 統計 ──

export function getEmbeddingStats(): EmbeddingStats {
  const db = getDb();
  const empty: EmbeddingStats = {
    symbolEmbeddings: 0,
    symbolIndex: 0,
    documentEmbeddings: 0,
    documentChunks: 0,
    docIndex: 0,
    modelName: 'N/A',
    dimensions: 0,
    totalTextBytes: 0,
    avgChunkLen: 0,
    maxChunkLen: 0,
    categoryCounts: [],
  };

  if (!db) return empty;

  try {
    const symbolEmb = (db.prepare('SELECT COUNT(*) as cnt FROM symbol_embeddings').get() as { cnt: number }).cnt;
    const symbolIdx = (db.prepare('SELECT COUNT(*) as cnt FROM symbol_index').get() as { cnt: number }).cnt;
    const docEmb = (db.prepare('SELECT COUNT(*) as cnt FROM document_embeddings').get() as { cnt: number }).cnt;
    const chunks = (db.prepare('SELECT COUNT(*) as cnt FROM document_chunks').get() as { cnt: number }).cnt;
    const docs = (db.prepare('SELECT COUNT(*) as cnt FROM doc_index').get() as { cnt: number }).cnt;

    const textStats = db.prepare(
      'SELECT SUM(LENGTH(content)) as total, AVG(LENGTH(content)) as avg, MAX(LENGTH(content)) as max FROM document_chunks',
    ).get() as { total: number; avg: number; max: number };

    // 模型資訊（從第一筆 embedding 取得）
    let modelName = 'N/A';
    let dimensions = 0;
    try {
      const row = db.prepare('SELECT model, dimensions FROM document_embeddings LIMIT 1').get() as { model: string; dimensions: number } | undefined;
      if (row) {
        modelName = row.model;
        dimensions = row.dimensions;
      }
    } catch { /* table may not exist */ }

    const categoryCounts = db
      .prepare('SELECT category, COUNT(*) as count FROM doc_index WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC')
      .all() as { category: string; count: number }[];

    return {
      symbolEmbeddings: symbolEmb,
      symbolIndex: symbolIdx,
      documentEmbeddings: docEmb,
      documentChunks: chunks,
      docIndex: docs,
      modelName,
      dimensions,
      totalTextBytes: textStats.total ?? 0,
      avgChunkLen: Math.round(textStats.avg ?? 0),
      maxChunkLen: textStats.max ?? 0,
      categoryCounts,
    };
  } catch {
    return empty;
  }
}
