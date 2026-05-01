// ============================================================
// PCPT Context Memory DB — 文檔匯入腳本
// CMI-5: Markdown 解析 + 智慧分段 + Embedding 向量生成
// ============================================================
// 執行方式:
//   全量匯入: node .context-db/scripts/import-documents.js
//   乾跑驗證: node .context-db/scripts/import-documents.js --dry-run
//   分類過濾: node .context-db/scripts/import-documents.js --category skill
//   路徑過濾: node .context-db/scripts/import-documents.js --path .claude/skills
//
// 需求:
//   - context-memory.db 已執行 init-db.js（CMI-5 schema）
//   - 向量生成使用本地 ONNX 推理（Xenova/all-MiniLM-L6-v2），無需 API Key
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { generateEmbeddings, MODEL_NAME, DIMENSIONS } from './local-embedder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_PATH      = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ── Embedding 設定（CMI-6: 使用本地 ONNX 模型，MODEL_NAME/DIMENSIONS 從 local-embedder 取得）──
const BATCH_SIZE = 20;

// ── Token 估算（4 chars/token，與 pre-prompt-rag.js 一致）──
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ── MD5 checksum ──
function md5(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

// ── Float32Array 序列化（與 generate-embeddings.js 一致）──
function serializeVector(float32Array) {
  return Buffer.from(float32Array.buffer);
}

// ──────────────────────────────────────────────
// BR-012: Category 路徑映射規則
// ──────────────────────────────────────────────
function inferCategory(relFilePath) {
  const p = relFilePath.replace(/\\/g, '/');
  if (p.includes('functional-specs/'))                     return 'functional-spec';
  if (p.includes('technical-specs/'))                      return 'tech-spec';
  if (p.includes('project-planning-artifacts/architecture/')) return 'architecture';
  if (p.includes('technical-decisions/'))                  return 'adr';
  if (p.includes('implementation-artifacts/stories/'))     return 'story';
  if (p.includes('implementation-artifacts/reviews/'))     return 'review';
  if (p.includes('implementation-artifacts/specs/'))       return 'spec';
  if (p.includes('knowledge-base/'))                       return 'knowledge-base';
  if (p.startsWith('_bmad/'))                              return 'bmad';
  if (p.startsWith('.claude/skills/'))                     return 'skill';
  if (p.includes('claude token減量策略研究分析/'))             return 'analysis';
  if (p.includes('平台UIUX排版範例/'))                       return 'ux-spec';
  if (p.includes('docs/reference/') || p.includes('spec-templates/')) return 'reference';
  return 'general';
}

// ── Epic ID 推斷（從路徑）──
function inferEpicId(relFilePath) {
  const p = relFilePath.replace(/\\/g, '/');
  const m = p.match(/\/epic-([^/]+)\//);
  return m ? m[1] : null;
}

// ──────────────────────────────────────────────
// 掃描目錄：遞迴取得所有 .md 檔案絕對路徑
// ──────────────────────────────────────────────
function scanDirectory(dirAbsPath) {
  const results = [];
  if (!fs.existsSync(dirAbsPath)) return results;

  function walk(curr) {
    const entries = fs.readdirSync(curr, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  }
  walk(dirAbsPath);
  return results;
}

// ──────────────────────────────────────────────
// BR-002: 排除規則
// ──────────────────────────────────────────────
function isExcluded(absPath) {
  const rel = path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
  if (rel.startsWith('docs/tracking/'))    return true;
  if (rel.includes('sprint-status.yaml')) return true;
  return false;
}

// ──────────────────────────────────────────────
// BR-014: 去重 — .agent/skills/ vs .claude/skills/
// 僅索引 .claude/skills/ 版本；.agent/ 版本若內容相同則跳過
// ──────────────────────────────────────────────
function buildDedupeMap(allFiles) {
  // 以 .claude/skills/ 下的檔案 content hash 為基準
  const claudeSkillsHashes = new Map(); // hash → rel path
  for (const abs of allFiles) {
    const rel = path.relative(PROJECT_ROOT, abs).replace(/\\/g, '/');
    if (rel.startsWith('.claude/skills/')) {
      const content = fs.readFileSync(abs, 'utf8');
      claudeSkillsHashes.set(md5(content), rel);
    }
  }
  return claudeSkillsHashes;
}

// ──────────────────────────────────────────────
// Markdown 噪音清洗（P0 優化）
// ──────────────────────────────────────────────

/**
 * 清洗 Markdown 噪音：移除對語意搜尋無貢獻的格式標記
 * - 表格分隔線 |---|---|
 * - HTML 註解 <!-- ... -->
 * - 連續空行壓縮為單一空行
 * - Story boilerplate 表格欄位名（僅保留值）
 */
function cleanMarkdown(content) {
  let cleaned = content;

  // 移除 HTML 註解（含多行）
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 移除表格分隔線（如 |---|---|---| 或 |:---:|:---:|）
  cleaned = cleaned.replace(/^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)+\|?\s*$/gm, '');

  // 移除純裝飾分隔線（如 --- 或 ===）
  cleaned = cleaned.replace(/^[-=]{3,}\s*$/gm, '');

  // 壓縮連續空行為單一空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 移除每行尾端空白
  cleaned = cleaned.replace(/[ \t]+$/gm, '');

  return cleaned.trim();
}

// ──────────────────────────────────────────────
// 硬截斷：支援中文（CJK 無空格）的字元級分段
// ──────────────────────────────────────────────

/**
 * 將超長文字強制切割為 ≤ maxTokens 的段落
 * 優先在段落邊界（空行）切割，否則在句號/換行切割
 */
function hardSplitContent(text, maxTokens = 2000) {
  const chunks = [];
  // 先嘗試按段落（空行）分割
  const paragraphs = text.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // 若還有超長的 chunk，按字元切割
  const result = [];
  for (const chunk of chunks) {
    if (estimateTokens(chunk) <= maxTokens) {
      result.push(chunk);
    } else {
      // 字元級切割（支援中文）
      const maxChars = maxTokens * 4; // 4 chars/token 估算
      for (let i = 0; i < chunk.length; i += maxChars) {
        // 嘗試在句號或換行處切割，而非任意位置
        let end = Math.min(i + maxChars, chunk.length);
        if (end < chunk.length) {
          // 向前找最近的句號/換行/分號作為切割點
          const searchStart = Math.max(end - 200, i);
          const segment = chunk.slice(searchStart, end);
          const breakMatch = segment.match(/.*[。\n；;！？!?.]\s*/);
          if (breakMatch) {
            end = searchStart + breakMatch[0].length;
          }
        }
        const part = chunk.slice(i, end).trim();
        if (part) result.push(part);
        // 調整下一個起點避免重疊
        if (end > i + maxChars) break; // 安全閥
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// Markdown 解析 + 智慧分段
// BR-003, BR-004, BR-005
// ──────────────────────────────────────────────

/** 從 Markdown 第一行或 H1 標題取得文件標題 */
function extractTitle(content, relFilePath) {
  const m = content.match(/^#\s+(.+)/m);
  if (m) return m[1].trim();
  return path.basename(relFilePath, '.md');
}

/**
 * H2-based 分段：返回 [{heading, content}] 陣列
 * 第一個 chunk 包含 H2 之前的文字
 */
function splitByH2(content) {
  const sections = [];
  const lines = content.split('\n');
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current.lines.length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: line.replace(/^## /, '').trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.heading !== null) {
    sections.push(current);
  }
  return sections;
}

/**
 * H3-based 分段（H2 超過 2000 tokens 時降級）
 * 返回 [{heading, content}] 陣列
 */
function splitByH3(h2Heading, content) {
  const sections = [];
  const lines = content.split('\n');
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    if (/^### /.test(line)) {
      if (current.lines.length > 0 || current.heading !== null) {
        sections.push(current);
      }
      current = { heading: line.replace(/^### /, '').trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.heading !== null) {
    sections.push(current);
  }

  return sections.map(s => ({
    heading: s.heading,
    parentH2: h2Heading,
    content: s.lines.join('\n').trim(),
  }));
}

/**
 * 主分段函式 — 返回 chunk 陣列
 * 每個 chunk: { heading_path, content, token_count }
 *
 * P0 優化：
 *  1. 先執行 cleanMarkdown 移除噪音
 *  2. H3 級別也有 overflow 保護
 *  3. 硬截斷使用 hardSplitContent（支援中文）
 */
function chunkDocument(rawContent, title, strategy) {
  const content = cleanMarkdown(rawContent);
  const chunks = [];
  const totalTokens = estimateTokens(content);

  if (strategy === 'whole' || totalTokens <= 1500) {
    chunks.push({
      heading_path: title,
      content: content.trim(),
      token_count: estimateTokens(content.trim()),
    });
    return chunks;
  }

  // h2 策略：按 H2 標題分段
  const h2Sections = splitByH2(content);

  for (const section of h2Sections) {
    const sectionContent = section.lines.join('\n').trim();
    if (!sectionContent) continue;

    const h2Label = section.heading || '(前置內容)';
    const heading = section.heading ? `${title} > ${h2Label}` : title;
    const tokenCount = estimateTokens(sectionContent);

    if (tokenCount <= 2000) {
      chunks.push({ heading_path: heading, content: sectionContent, token_count: tokenCount });
    } else {
      // BR-004: H2 超過 2000 tokens → H3 降級分段
      const h3Sections = splitByH3(h2Label, sectionContent);

      if (h3Sections.length <= 1) {
        // 無 H3 → 硬截斷（支援中文的字元級分割）
        const parts = hardSplitContent(sectionContent, 2000);
        for (let pi = 0; pi < parts.length; pi++) {
          chunks.push({
            heading_path: parts.length > 1 ? `${heading} (part ${pi + 1})` : heading,
            content: parts[pi],
            token_count: estimateTokens(parts[pi]),
          });
        }
      } else {
        // H3 分段 + overflow 保護
        for (const h3 of h3Sections) {
          if (!h3.content) continue;
          const h3Heading = h3.heading
            ? `${title} > ${h2Label} > ${h3.heading}`
            : `${title} > ${h2Label}`;
          const h3Tokens = estimateTokens(h3.content);

          if (h3Tokens <= 2000) {
            chunks.push({
              heading_path: h3Heading,
              content: h3.content,
              token_count: h3Tokens,
            });
          } else {
            // H3 也超過上限 → 硬截斷
            const parts = hardSplitContent(h3.content, 2000);
            for (let pi = 0; pi < parts.length; pi++) {
              chunks.push({
                heading_path: parts.length > 1 ? `${h3Heading} (part ${pi + 1})` : h3Heading,
                content: parts[pi],
                token_count: estimateTokens(parts[pi]),
              });
            }
          }
        }
      }
    }
  }

  // 若無任何 chunk，fallback 為 whole
  if (chunks.length === 0) {
    chunks.push({
      heading_path: title,
      content: content.trim(),
      token_count: estimateTokens(content.trim()),
    });
  }

  return chunks;
}

// ──────────────────────────────────────────────
// (CMI-6) Embedding 生成現委派至 local-embedder.js
// generateEmbeddings(texts) 已從 local-embedder import
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 主程序
// ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isDryRun    = args.includes('--dry-run');
  const filterCat   = args.find((_, i) => args[i - 1] === '--category');
  const filterPath  = args.find((_, i) => args[i - 1] === '--path');

  // DB 連接
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}。請先執行: node scripts/init-db.js`);
    process.exit(1);
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ── 六個掃描目錄（BR-001）──
  const SCAN_DIRS = [
    path.join(PROJECT_ROOT, 'docs'),
    path.join(PROJECT_ROOT, '_bmad'),
    path.join(PROJECT_ROOT, '.claude', 'skills'),
    path.join(PROJECT_ROOT, '.agent', 'skills'),
    path.join(PROJECT_ROOT, '平台UIUX排版範例'),
    path.join(PROJECT_ROOT, 'claude token減量策略研究分析'),
  ];

  console.log('🔍 掃描文檔中...');
  let allFiles = [];
  for (const dir of SCAN_DIRS) {
    const files = scanDirectory(dir);
    allFiles.push(...files);
  }

  // 過濾 --path
  if (filterPath) {
    const filterAbs = path.resolve(PROJECT_ROOT, filterPath);
    allFiles = allFiles.filter(f => f.startsWith(filterAbs));
  }

  // 排除規則（BR-002）
  allFiles = allFiles.filter(f => !isExcluded(f));

  // BR-014 去重 map
  const claudeSkillsHashes = buildDedupeMap(allFiles);

  // 統計
  let totalDocs = 0, totalChunks = 0, totalEmbeddings = 0;
  let skipUnchanged = 0, skipDedupe = 0;

  // 準備 DB statements
  const stmtGetDoc = db.prepare('SELECT id, checksum FROM doc_index WHERE path = ?');
  const stmtInsertDoc = db.prepare(`
    INSERT INTO doc_index (doc_type, title, path, tags, last_updated, created_at, category, epic_id, checksum, chunk_count, total_tokens, chunk_strategy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      title=excluded.title, last_updated=excluded.last_updated, category=excluded.category,
      epic_id=excluded.epic_id, checksum=excluded.checksum, chunk_count=excluded.chunk_count,
      total_tokens=excluded.total_tokens, chunk_strategy=excluded.chunk_strategy
  `);
  const stmtMarkStale = db.prepare('UPDATE document_chunks SET is_stale=1 WHERE doc_id=?');
  const stmtInsertChunk = db.prepare(`
    INSERT INTO document_chunks (doc_id, chunk_index, heading_path, content, token_count, checksum, is_stale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(doc_id, chunk_index) DO UPDATE SET
      heading_path=excluded.heading_path, content=excluded.content,
      token_count=excluded.token_count, checksum=excluded.checksum,
      is_stale=0, updated_at=excluded.created_at
  `);
  const stmtGetDocId = db.prepare('SELECT id FROM doc_index WHERE path = ?');
  const stmtInsertEmbed = db.prepare(`
    INSERT OR REPLACE INTO document_embeddings (chunk_id, embedding, model, dimensions, token_count, batch_id, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtGetChunkId = db.prepare('SELECT id FROM document_chunks WHERE doc_id=? AND chunk_index=?');

  // pending embedding: 批次累積
  const pendingEmbedChunks = []; // { chunk_id, text }

  const now = new Date().toISOString();

  console.log(`📂 共找到 ${allFiles.length} 個 .md 檔案（過濾前）\n`);

  for (const absPath of allFiles) {
    const relPath = path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');

    // BR-014: .agent/skills/ 去重
    if (relPath.startsWith('.agent/skills/')) {
      const content = fs.readFileSync(absPath, 'utf8');
      if (claudeSkillsHashes.has(md5(content))) {
        skipDedupe++;
        continue; // 已有 .claude/skills/ 版本
      }
    }

    // 讀取文件內容
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      process.stderr.write(`[import-documents] 無法讀取: ${relPath}\n`);
      continue;
    }

    if (!content.trim()) {
      // 空文件跳過
      process.stderr.write(`[import-documents] 空文件，跳過: ${relPath}\n`);
      continue;
    }

    // Category 分類
    const category = inferCategory(relPath);
    if (filterCat && category !== filterCat) continue;

    const epicId = inferEpicId(relPath);
    const checksum = md5(content);
    const title = extractTitle(content, relPath);
    const totalDocTokens = estimateTokens(content);

    // BR-006: checksum 比對 — 未變更跳過
    const existingDoc = stmtGetDoc.get(relPath);
    if (existingDoc && existingDoc.checksum === checksum) {
      skipUnchanged++;
      continue;
    }

    // 決定分段策略（BR-003）
    const strategy = totalDocTokens <= 1500 ? 'whole' : 'h2';

    totalDocs++;

    if (isDryRun) {
      const chunks = chunkDocument(content, title, strategy);
      console.log(`  📄 ${relPath} [${category}] → ${chunks.length} chunks (${totalDocTokens} tokens, strategy: ${strategy})`);
      totalChunks += chunks.length;
      continue;
    }

    // 寫入 doc_index（upsert）
    stmtInsertDoc.run(
      'document', title, relPath, JSON.stringify([category]),
      now, now, category, epicId, checksum,
      0, totalDocTokens, strategy
    );

    const docRow = stmtGetDocId.get(relPath);
    const docId = docRow.id;

    // BR-007: re-index 時先 mark stale
    if (existingDoc) {
      stmtMarkStale.run(docId);
    }

    // 分段
    const chunks = chunkDocument(content, title, strategy);
    totalChunks += chunks.length;

    // 寫入 chunks
    const insertChunks = db.transaction(() => {
      for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx];
        stmtInsertChunk.run(
          docId, idx, chunk.heading_path, chunk.content,
          chunk.token_count, md5(chunk.content), now
        );
      }
    });
    insertChunks();

    // 更新 chunk_count
    db.prepare('UPDATE doc_index SET chunk_count=? WHERE id=?').run(chunks.length, docId);

    // 累積 embedding 任務（CMI-6: 本地模型永遠可用，無需 API Key 檢查）
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkRow = stmtGetChunkId.get(docId, idx);
      if (chunkRow) {
        pendingEmbedChunks.push({
          chunk_id: chunkRow.id,
          text: `${chunks[idx].heading_path}\n${chunks[idx].content}`.slice(0, 32000),
          token_count: chunks[idx].token_count,
        });
      }
    }
  }

  if (isDryRun) {
    console.log('\n📊 Dry-Run 摘要:');
    console.log(`   掃描文檔: ${allFiles.length}`);
    console.log(`   跳過去重 (.agent 重複): ${skipDedupe}`);
    console.log(`   跳過未變更: ${skipUnchanged}`);
    console.log(`   預計匯入文檔: ${totalDocs}`);
    console.log(`   預計 chunks: ${totalChunks}`);
    db.close();
    return;
  }

  console.log(`\n✅ 文檔匯入完成:`);
  console.log(`   匯入: ${totalDocs} 個文檔, ${totalChunks} 個 chunks`);
  console.log(`   跳過去重: ${skipDedupe}, 跳過未變更: ${skipUnchanged}`);

  // ── Embedding 批次生成（CMI-6: 本地 ONNX 推理）──
  if (pendingEmbedChunks.length > 0) {
    console.log(`\n⚡ 開始生成 Embedding（${pendingEmbedChunks.length} 個 chunks, 批次大小: ${BATCH_SIZE}，本地 ONNX）`);
    console.log(`   model: ${MODEL_NAME}`);

    for (let i = 0; i < pendingEmbedChunks.length; i += BATCH_SIZE) {
      const batch = pendingEmbedChunks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(pendingEmbedChunks.length / BATCH_SIZE);
      const batchId = `cmi6-${Date.now()}-${batchNum}`;

      process.stdout.write(`  批次 ${batchNum}/${totalBatches} (${batch.length} 個) ... `);

      try {
        // 本地 ONNX 批次推理（無 Rate Limiting，無 API 呼叫）
        const embeddings = await generateEmbeddings(batch.map(c => c.text));

        const insertEmbeds = db.transaction(() => {
          for (let j = 0; j < batch.length; j++) {
            const float32Array = embeddings[j];
            if (!float32Array || float32Array.length !== DIMENSIONS) {
              process.stderr.write(`\n  ⚠️ chunk_id ${batch[j].chunk_id}: embedding 維度異常 (${float32Array?.length} != ${DIMENSIONS})\n`);
              continue;
            }
            const buf = serializeVector(float32Array);
            stmtInsertEmbed.run(
              batch[j].chunk_id, buf, MODEL_NAME, DIMENSIONS,
              batch[j].token_count, batchId, now
            );
            totalEmbeddings++;
          }
        });
        insertEmbeds();

        console.log(`✅`);
      } catch (err) {
        console.log(`❌ 失敗: ${err.message}`);
        process.stderr.write(`[import-documents] Batch ${batchNum} fatal error: ${err.message}\n`);
      }
    }

    console.log('\n' + '─'.repeat(50));
    console.log('📊 Embedding 統計:');
    console.log(`   成功: ${totalEmbeddings} 個 embeddings`);
    console.log(`   推理成本: $0.00 (local)`);
    console.log(`   model: ${MODEL_NAME}`);
    console.log('─'.repeat(50));
  }

  db.close();
  console.log('\n✅ import-documents.js 完成！');
}

const isMainModule = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
  });
}
