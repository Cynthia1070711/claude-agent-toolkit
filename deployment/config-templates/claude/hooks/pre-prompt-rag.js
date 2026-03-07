// ============================================================
// MyProject Code RAG Phase 3 — UserPromptSubmit Hook
// TD-35: Hook 動態注入 + 依賴圖展開
// ============================================================
// Claude Code UserPromptSubmit Hook:
//   stdin:  JSON { "prompt": "user query text", ... }
//   stdout: JSON { "additionalContext": "formatted context" }
//
// 安全性：
//   - OpenAI API Key 僅從 process.env.OPENAI_API_KEY 讀取，禁止硬編碼
//   - DB 以 readonly 模式開啟，不寫入任何資料
//   - 任何異常均靜默退出，絕不阻塞使用者提問
// ============================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 路徑解析（專案根目錄在 .claude/hooks/ 兩層上）
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTEXT_DB_DIR = path.join(PROJECT_ROOT, '.context-db');
const DB_PATH = path.join(CONTEXT_DB_DIR, 'myproject.db');

// 從 .context-db/node_modules 載入 better-sqlite3（跨目錄的 native addon）
const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(CONTEXT_DB_DIR, 'node_modules', 'better-sqlite3'));
} catch {
  // better-sqlite3 不可用時靜默退出
  process.exit(0);
}

// ──────────────────────────────────────────────
// 設定常數
// ──────────────────────────────────────────────
const ENABLED = process.env.PHYCOOL_RAG_HOOK !== 'false';
const MAX_TOKENS = 10000;
const MIN_QUERY_LENGTH = 10;
const TOP_N = 5;
const OPENAI_EMB_MODEL = 'text-embedding-3-small';

// S_final 融合權重（CC-Agent 報告 §21.6）
const ALPHA = 0.6;  // 向量相似度
const BETA = 0.2;   // 依賴圖相似度
const GAMMA = 0.2;  // FTS5 文字相似度

// ──────────────────────────────────────────────
// 向量工具（複用 generate-embeddings.js 的算法）
// ──────────────────────────────────────────────

/** Cosine similarity between two Float32Arrays */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** BLOB Buffer → Float32Array */
function deserializeVector(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/** 估算 token 數（約 4 字元/token）*/
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// ──────────────────────────────────────────────
// stdin 讀取
// ──────────────────────────────────────────────
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ──────────────────────────────────────────────
// OpenAI Embedding API（使用 Node.js 內建 fetch，無外部依賴）
// ──────────────────────────────────────────────
async function getEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_EMB_MODEL,
      input: [text],
      encoding_format: 'float',
    }),
    signal: AbortSignal.timeout(3000),  // 3 秒 API timeout（需留 2 秒給 DB 查詢）
  });

  if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
  const data = await response.json();
  return new Float32Array(data.data[0].embedding);
}

// ──────────────────────────────────────────────
// 語意搜尋（symbol_embeddings cosine similarity）
// ──────────────────────────────────────────────
function searchSymbolsByVector(db, queryVec, limit) {
  const rows = db.prepare(`
    SELECT se.symbol_id, se.embedding,
           si.symbol_name, si.full_name, si.file_path, si.symbol_type,
           si.start_line, si.end_line,
           SUBSTR(si.code_snippet, 1, 1000) AS code_snippet
    FROM symbol_embeddings se
    JOIN symbol_index si ON se.symbol_id = si.id
  `).all();

  const scored = [];
  for (const row of rows) {
    const symbolVec = deserializeVector(row.embedding);
    const score = cosineSimilarity(queryVec, symbolVec);
    if (score > 0.1) {
      scored.push({
        symbol_id: row.symbol_id,
        symbol_name: row.symbol_name,
        full_name: row.full_name,
        file_path: row.file_path,
        symbol_type: row.symbol_type,
        start_line: row.start_line,
        end_line: row.end_line,
        code_snippet: row.code_snippet,
        vec_score: score,
        fts_score: 0,
        is_dependency: false,
        relation_type: null,
      });
    }
  }

  scored.sort((a, b) => b.vec_score - a.vec_score);
  return scored.slice(0, limit);
}

// ──────────────────────────────────────────────
// FTS5 降級搜尋（LIKE fallback，無 symbol_fts 虛擬表）
// ──────────────────────────────────────────────
function searchFtsLikeFallback(db, query, limit) {
  const kw = `%${query.replace(/[%_]/g, '').trim()}%`;
  return db.prepare(`
    SELECT id AS symbol_id, symbol_name, full_name, file_path, symbol_type,
           start_line, end_line,
           SUBSTR(code_snippet, 1, 1000) AS code_snippet
    FROM symbol_index
    WHERE symbol_name LIKE ? OR full_name LIKE ?
    ORDER BY symbol_name
    LIMIT ?
  `).all(kw, kw, limit).map(r => ({
    ...r,
    vec_score: 0,
    fts_score: 1.0,
    is_dependency: false,
    relation_type: null,
  }));
}

// ──────────────────────────────────────────────
// 依賴展開（1 層，relation_type: calls/inherits/implements/uses_inferred）
// ──────────────────────────────────────────────
function expandDependencies(db, symbols) {
  const seenIds = new Set(symbols.map(s => s.symbol_id));
  const expanded = [...symbols];

  for (const sym of symbols) {
    let deps;
    try {
      deps = db.prepare(`
        SELECT d.relation_type,
               si.id AS symbol_id, si.symbol_name, si.full_name,
               si.file_path, si.symbol_type, si.start_line, si.end_line,
               SUBSTR(si.code_snippet, 1, 500) AS code_snippet
        FROM symbol_dependencies d
        JOIN symbol_index si ON si.full_name = d.target_symbol
        WHERE d.source_symbol = ?
          AND d.relation_type IN ('calls', 'inherits', 'implements', 'uses_inferred')
        LIMIT 10
      `).all(sym.full_name);
    } catch {
      continue;
    }

    for (const dep of deps) {
      if (!seenIds.has(dep.symbol_id)) {
        seenIds.add(dep.symbol_id);
        expanded.push({
          ...dep,
          vec_score: 0,
          fts_score: 0,
          is_dependency: true,
        });
      }
    }
  }

  return expanded;
}

// ──────────────────────────────────────────────
// S_final 融合分數計算
// S_final = α·vec + β·graph + γ·fts
// ──────────────────────────────────────────────
function calculateSfinal(symbols) {
  const maxVec = Math.max(...symbols.map(s => s.vec_score || 0), 0.001);

  return symbols.map(sym => {
    const vecNorm  = (sym.vec_score || 0) / maxVec;
    const graphNorm = sym.is_dependency ? 0.5 : 0;
    const ftsNorm  = sym.fts_score || 0;
    const s_final  = ALPHA * vecNorm + BETA * graphNorm + GAMMA * ftsNorm;
    return { ...sym, s_final };
  }).sort((a, b) => b.s_final - a.s_final);
}

// ──────────────────────────────────────────────
// Context 格式化（Token 上限截斷）
// ──────────────────────────────────────────────
function formatContext(symbols, maxTokens) {
  const parts = [];
  const header = '## 自動注入的程式碼上下文（Code RAG Phase 3）\n\n';
  let tokenCount = estimateTokens(header);

  for (const sym of symbols) {
    const lines = sym.start_line && sym.end_line
      ? `:${sym.start_line}-${sym.end_line}`
      : '';
    const depTag = sym.is_dependency
      ? `\n**關係**: ${sym.relation_type} (依賴展開)` : '';
    const entry = [
      `### ${sym.symbol_name} (${sym.symbol_type})`,
      `**檔案**: \`${sym.file_path}${lines}\``,
      `**分數**: ${(sym.s_final || 0).toFixed(3)}${depTag}`,
      `\`\`\`${sym.file_path?.endsWith('.ts') || sym.file_path?.endsWith('.tsx') ? 'typescript' : 'csharp'}`,
      sym.code_snippet || '',
      '```',
      '',
    ].join('\n');

    const entryTokens = estimateTokens(entry);
    if (tokenCount + entryTokens > maxTokens) break;
    parts.push(entry);
    tokenCount += entryTokens;
  }

  if (parts.length === 0) return '';
  return header + parts.join('\n');
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  if (!ENABLED) return;

  // 讀取 stdin
  let rawInput;
  try {
    rawInput = await readStdin();
  } catch {
    return;
  }
  if (!rawInput || !rawInput.trim()) return;

  // 解析 JSON
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    return;
  }

  const userPrompt = (input.prompt || '').trim();
  if (userPrompt.length < MIN_QUERY_LENGTH) return;

  // DB 存在性檢查
  if (!fs.existsSync(DB_PATH)) return;

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch {
    return;
  }

  try {
    let topSymbols = [];

    // 嘗試向量搜尋（主要路徑）
    try {
      const queryVec = await getEmbedding(userPrompt);
      topSymbols = searchSymbolsByVector(db, queryVec, TOP_N);
    } catch (embErr) {
      // Embedding API 不可用 → FTS5 LIKE 降級
      process.stderr.write(`[RAG] Embedding fallback: ${embErr.message}\n`);
      topSymbols = searchFtsLikeFallback(db, userPrompt, TOP_N);
    }

    if (topSymbols.length === 0) return;

    // 依賴展開（1 層）
    const expanded = expandDependencies(db, topSymbols);

    // S_final 融合分數
    const scored = calculateSfinal(expanded);

    // Token 截斷 + 格式化
    const context = formatContext(scored, MAX_TOKENS);

    if (!context) return;

    // 輸出 additionalContext
    process.stderr.write(`[RAG] Injected ${scored.length} symbols (${estimateTokens(context)} est. tokens)\n`);
    process.stdout.write(JSON.stringify({ additionalContext: context }));
  } catch (err) {
    // 任何未預期異常：靜默退出，絕不阻塞提問
    process.stderr.write(`[RAG] Error: ${err.message}\n`);
    return;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// 執行（頂層 await 須等待 main()）
main().catch(() => {});
