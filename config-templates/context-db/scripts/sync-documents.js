#!/usr/bin/env node
// ============================================================
// sync-documents.js — 文檔增量同步腳本（CMI-5, BR-007~BR-011）
// ============================================================
// 功能：
//   1. 掃描專案文檔目錄，比對 MD5 checksum
//   2. 新增/修改的文檔：重新解析分段 + 更新 document_chunks
//   3. 刪除的文檔：標記 chunks 為 is_stale=1
//   4. 重建 Embedding（本地 ONNX 推理，無需 API Key）
//
// 執行方式:
//   node .context-db/scripts/sync-documents.js
//   node .context-db/scripts/sync-documents.js --dry-run
//   node .context-db/scripts/sync-documents.js --category stories
//   node .context-db/scripts/sync-documents.js --rebuild-stale  # 清除舊 stale chunks
//
// Pipeline 觸發時機（BR-007）:
//   Story Pipeline 完成後 → node .context-db/scripts/sync-documents.js
// ============================================================

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync } from 'fs';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// ──────────────────────────────────────────────
// CLI Flags
// ──────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REBUILD_STALE = args.includes('--rebuild-stale');
const CATEGORY_FILTER = (() => {
  const idx = args.indexOf('--category');
  return idx !== -1 ? args[idx + 1] : null;
})();
const PATH_FILTER = (() => {
  const idx = args.indexOf('--path');
  return idx !== -1 ? args[idx + 1] : null;
})();

if (DRY_RUN) console.log('[sync-documents] DRY-RUN 模式（不寫入 DB）');
if (REBUILD_STALE) console.log('[sync-documents] --rebuild-stale 模式（將清除所有 stale chunks）');

// ──────────────────────────────────────────────
// 掃描目錄定義（與 import-documents.js 一致）
// ──────────────────────────────────────────────
const SCAN_DIRS = [
  { dir: 'docs',                                category: null },  // category 由路徑推斷
  { dir: '_bmad',                               category: 'bmad' },
  { dir: '.claude/skills',                      category: 'skill' },
  { dir: '平台UIUX排版範例',                    category: 'ux-spec' },
  { dir: 'claude token減量策略研究分析',         category: 'analysis' },
];

// 排除規則（BR-002）
const EXCLUDE_PATTERNS = [
  /docs[/\\]tracking[/\\]/,
  /sprint-status\.yaml$/,
  /node_modules[/\\]/,
  /\.git[/\\]/,
];

// BR-014: .agent/skills/ 去重（僅索引 .claude/skills/）
const DEDUP_SKIP_DIRS = [
  '.agent/skills',
  '.gemini/skills',
];

// ──────────────────────────────────────────────
// Category 路徑推斷（與 import-documents.js 一致）
// ──────────────────────────────────────────────
function inferCategory(relFilePath) {
  const p = relFilePath.replace(/\\/g, '/');
  if (p.startsWith('docs/implementation-artifacts/stories/'))     return 'story';
  if (p.startsWith('docs/implementation-artifacts/specs/'))       return 'spec';
  if (p.startsWith('docs/implementation-artifacts/reviews/'))     return 'review';
  if (p.startsWith('docs/technical-decisions/'))                  return 'adr';
  if (p.startsWith('docs/project-planning-artifacts/architecture/')) return 'architecture';
  if (p.startsWith('docs/project-planning-artifacts/functional-specs/')) return 'functional-spec';
  if (p.startsWith('docs/project-planning-artifacts/technical-specs/')) return 'tech-spec';
  if (p.startsWith('docs/knowledge-base/'))                       return 'knowledge-base';
  if (p.startsWith('.claude/skills/') || p.startsWith('_bmad/')) return 'skill';
  if (p.startsWith('平台UIUX排版範例/'))                          return 'ux-spec';
  if (p.startsWith('claude token減量策略研究分析/'))              return 'analysis';
  if (p.startsWith('docs/implementation-artifacts/'))             return 'general';
  if (p.startsWith('docs/'))                                      return 'general';
  return 'general';
}

function inferEpicId(relFilePath) {
  const m = relFilePath.replace(/\\/g, '/').match(/epic-([a-z0-9-]+)/i);
  return m ? `epic-${m[1].toLowerCase()}` : null;
}

// ──────────────────────────────────────────────
// MD5 checksum
// ──────────────────────────────────────────────
function md5(text) {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

// ──────────────────────────────────────────────
// Token 估算
// ──────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ──────────────────────────────────────────────
// Title 提取（H1 或 filename）
// ──────────────────────────────────────────────
function extractTitle(content, filePath) {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return path.basename(filePath, '.md');
}

// ──────────────────────────────────────────────
// 分段策略（與 import-documents.js 一致）
// ──────────────────────────────────────────────
function chunkDocument(content, title, strategy) {
  if (strategy === 'whole') {
    return [{ heading_path: title, content: content.trim(), chunk_index: 0 }];
  }

  const splitByH = (level) => {
    const pattern = level === 2
      ? /^##\s+(.+)$/gm
      : /^###\s+(.+)$/gm;
    const matches = [...content.matchAll(pattern)];
    if (matches.length === 0) return null;

    const chunks = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
      const heading = matches[i][1].trim();
      const sectionContent = content.slice(start, end).trim();
      if (sectionContent.length > 20) {
        chunks.push({ heading_path: `${title} > ${heading}`, content: sectionContent, chunk_index: i });
      }
    }
    return chunks.length > 0 ? chunks : null;
  };

  if (strategy === 'h2') {
    const chunks = splitByH(2);
    if (!chunks) return [{ heading_path: title, content: content.trim(), chunk_index: 0 }];

    // H2 段落過長時用 H3 fallback（BR-005）
    const result = [];
    for (const chunk of chunks) {
      if (estimateTokens(chunk.content) > 2000) {
        const h3Chunks = splitByH(3);
        if (h3Chunks) {
          result.push(...h3Chunks);
        } else {
          result.push(chunk);
        }
      } else {
        result.push(chunk);
      }
    }
    return result;
  }

  return [{ heading_path: title, content: content.trim(), chunk_index: 0 }];
}

function selectStrategy(tokenCount) {
  if (tokenCount <= 1500) return 'whole';
  return 'h2';
}

// ──────────────────────────────────────────────
// 遞迴掃描 Markdown 檔案
// ──────────────────────────────────────────────
function scanDirectory(dirPath) {
  const files = [];
  if (!existsSync(dirPath)) return files;

  function walk(currentPath) {
    let entries;
    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');

      if (EXCLUDE_PATTERNS.some(p => p.test(relPath))) continue;
      if (DEDUP_SKIP_DIRS.some(d => relPath.startsWith(d))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({ fullPath, relPath });
      }
    }
  }

  walk(dirPath);
  return files;
}

// ──────────────────────────────────────────────
// 從 DB 取得現有文檔狀態（file_path → {id, checksum}）
// ──────────────────────────────────────────────
function getExistingDocIndex(db) {
  const rows = db.prepare(`
    SELECT id, path, checksum, chunk_count
    FROM doc_index
    WHERE 1=1
  `).all();
  const map = new Map();
  for (const row of rows) {
    map.set(row.path, row);
  }
  return map;
}

// ──────────────────────────────────────────────
// 更新單個文檔（刪除舊 chunks + 重新插入）
// ──────────────────────────────────────────────
function upsertDocument(db, relPath, content, title) {
  const tokens = estimateTokens(content);
  const strategy = selectStrategy(tokens);
  const checksum = md5(content);
  const category = inferCategory(relPath);
  const epicId = inferEpicId(relPath);

  if (CATEGORY_FILTER && category !== CATEGORY_FILTER) return null;

  const chunks = chunkDocument(content, title, strategy);

  const docRow = db.prepare(`
    SELECT id, checksum FROM doc_index WHERE path = ?
  `).get(relPath);

  if (docRow && docRow.checksum === checksum) {
    return { status: 'unchanged', file_path: relPath };
  }

  if (DRY_RUN) {
    return {
      status: docRow ? 'modified' : 'new',
      file_path: relPath,
      chunks: chunks.length,
    };
  }

  // Upsert doc_index
  if (docRow) {
    // 標記舊 chunks 為 stale（BR-010）
    db.prepare(`
      UPDATE document_chunks SET is_stale = 1 WHERE doc_id = ?
    `).run(docRow.id);

    // 更新 doc_index
    db.prepare(`
      UPDATE doc_index
      SET title = ?, category = ?, epic_id = ?, checksum = ?,
          chunk_count = ?, total_tokens = ?, chunk_strategy = ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, category, epicId, checksum, chunks.length, tokens, strategy, docRow.id);

    // 插入新 chunks
    const now = new Date().toISOString();
    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (doc_id, chunk_index, heading_path, content, token_count, checksum, is_stale, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    for (const chunk of chunks) {
      const chunkTokens = estimateTokens(chunk.content);
      const chunkChecksum = md5(chunk.content);
      insertChunk.run(docRow.id, chunk.chunk_index, chunk.heading_path, chunk.content, chunkTokens, chunkChecksum, now);
    }

    return { status: 'modified', file_path: relPath, chunks: chunks.length };
  } else {
    // 新增 doc_index
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO doc_index
        (doc_type, title, path, tags, last_updated, created_at, category, epic_id, checksum, chunk_count, total_tokens, chunk_strategy)
      VALUES ('markdown', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, relPath, now, now, category, epicId, checksum, chunks.length, tokens, strategy);

    const docId = result.lastInsertRowid;

    // 插入 chunks
    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (doc_id, chunk_index, heading_path, content, token_count, checksum, is_stale, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    for (const chunk of chunks) {
      const chunkTokens = estimateTokens(chunk.content);
      const chunkChecksum = md5(chunk.content);
      insertChunk.run(docId, chunk.chunk_index, chunk.heading_path, chunk.content, chunkTokens, chunkChecksum, now);
    }

    return { status: 'new', file_path: relPath, chunks: chunks.length };
  }
}

// ──────────────────────────────────────────────
// 刪除已移除文檔（CASCADE 自動刪除 chunks + embeddings，Spec §4.3 Step 5）
// ──────────────────────────────────────────────
function removeDeletedDocuments(db, existingMap, foundPaths) {
  const foundSet = new Set(foundPaths);
  let deletedCount = 0;

  for (const [filePath, docRow] of existingMap) {
    if (!foundSet.has(filePath)) {
      if (!DRY_RUN) {
        db.prepare('DELETE FROM doc_index WHERE id = ?').run(docRow.id);
      }
      console.log(`  [DELETED] ${filePath}`);
      deletedCount++;
    }
  }
  return deletedCount;
}

// ──────────────────────────────────────────────
// 清除所有 stale chunks（--rebuild-stale 選項）
// ──────────────────────────────────────────────
function purgeStaleChunks(db) {
  if (DRY_RUN) {
    const count = db.prepare(
      'SELECT COUNT(*) AS cnt FROM document_chunks WHERE is_stale = 1'
    ).get();
    console.log(`[sync-documents] Dry-run: 將刪除 ${count.cnt} 個 stale chunks`);
    return count.cnt;
  }

  // 先刪除 stale chunks 的 embeddings
  db.exec(`
    DELETE FROM document_embeddings
    WHERE chunk_id IN (SELECT id FROM document_chunks WHERE is_stale = 1)
  `);

  // 再刪除 stale chunks
  const result = db.prepare(
    'DELETE FROM document_chunks WHERE is_stale = 1'
  ).run();

  console.log(`[sync-documents] 已清除 ${result.changes} 個 stale chunks`);
  return result.changes;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`[sync-documents] DB 不存在: ${DB_PATH}`);
    console.error('請先執行: node .context-db/scripts/init-db.js');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: DRY_RUN });
  if (!DRY_RUN) db.pragma('journal_mode = WAL');

  const stats = { new: 0, modified: 0, unchanged: 0, deleted: 0, errors: 0 };

  // --rebuild-stale 先清除
  if (REBUILD_STALE && !DRY_RUN) {
    purgeStaleChunks(db);
  }

  // 取得現有 doc_index
  const existingMap = getExistingDocIndex(db);
  const foundPaths = [];

  // 掃描所有目錄
  const targetDirs = PATH_FILTER
    ? [{ dir: PATH_FILTER, category: CATEGORY_FILTER }]
    : SCAN_DIRS;

  for (const { dir } of targetDirs) {
    const fullDir = path.join(PROJECT_ROOT, dir);
    if (!existsSync(fullDir)) continue;

    console.log(`[sync-documents] 掃描: ${dir}`);
    const files = scanDirectory(fullDir);

    for (const { fullPath, relPath } of files) {
      foundPaths.push(relPath);

      let content;
      try {
        content = readFileSync(fullPath, 'utf8');
      } catch {
        stats.errors++;
        continue;
      }

      const title = extractTitle(content, relPath);

      try {
        const result = upsertDocument(db, relPath, content, title);
        if (result) {
          const s = result.status;
          stats[s] = (stats[s] || 0) + 1;
          if (s !== 'unchanged') {
            console.log(`  [${s.toUpperCase()}] ${relPath} (${result.chunks} chunks)`);
          }
        }
      } catch (err) {
        stats.errors++;
        console.error(`  [ERROR] ${relPath}: ${err.message}`);
      }
    }
  }

  // 刪除已移除文檔（CASCADE 刪除 chunks + embeddings）
  stats.deleted = removeDeletedDocuments(db, existingMap, foundPaths);

  // 輸出統計
  console.log('\n[sync-documents] 同步完成:');
  console.log(`  新增: ${stats.new} 個文檔`);
  console.log(`  修改: ${stats.modified} 個文檔`);
  console.log(`  未變: ${stats.unchanged} 個文檔`);
  console.log(`  刪除: ${stats.deleted} 個文檔`);
  console.log(`  錯誤: ${stats.errors} 個`);

  if (!DRY_RUN) {
    // 統計 stale chunks 數量
    const staleCount = db.prepare(
      'SELECT COUNT(*) AS cnt FROM document_chunks WHERE is_stale = 1'
    ).get();
    if (staleCount.cnt > 0) {
      console.log(`\n[sync-documents] 注意: 有 ${staleCount.cnt} 個 stale chunks，`);
      console.log('執行 --rebuild-stale 清除，或下次全量 import 時自動替換。');
    }

    // 如果有新增/修改，提示重建 Embedding
    if (stats.new + stats.modified > 0) {
      console.log('\n[sync-documents] 提示: 新增/修改文檔已索引，建議重建 Embedding:');
      console.log('  node .context-db/scripts/import-documents.js');
    }
  }

  if (!DRY_RUN) {
    try { db.close(); } catch { /* ignore */ }
  }
}

main().catch(err => {
  console.error(`[sync-documents] 致命錯誤: ${err.message}`);
  process.exit(1);
});
