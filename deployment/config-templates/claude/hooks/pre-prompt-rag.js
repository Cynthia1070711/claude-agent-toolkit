// ============================================================
// PCPT Code RAG Phase 3 — UserPromptSubmit Hook
// TD-35: Hook 動態注入 + 依賴圖展開
// ============================================================
// Claude Code UserPromptSubmit Hook:
//   stdin:  JSON { "prompt": "user query text", ... }
//   stdout: JSON { "additionalContext": "formatted context" }
//
// 安全性：
//   - 使用本地 ONNX 推理（Xenova/all-MiniLM-L6-v2），無需 API Key
//   - DB 以 readonly 模式開啟，不寫入任何資料
//   - 任何異常均靜默退出，絕不阻塞使用者提問
// ============================================================

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from '../../.context-db/scripts/timezone.js';
import { generateEmbedding } from '../../.context-db/scripts/local-embedder.js';
import { cosineSimilarity, deserializeVector } from '../../.context-db/scripts/generate-embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 路徑解析（專案根目錄在 .claude/hooks/ 兩層上）
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTEXT_DB_DIR = path.join(PROJECT_ROOT, '.context-db');
const DB_PATH = path.join(CONTEXT_DB_DIR, 'context-memory.db');

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
const ENABLED = process.env.PCPT_RAG_HOOK !== 'false';
const IDD_INJECT = process.env.PCPT_IDD_INJECT !== 'false';  // DLA-07: IDD Layer 10 feature flag
const isPipeline = !!process.env.PIPELINE_PHASE;
const MAX_TOKENS = 10000;
const SESSION_TOKENS = 2000;    // Session 記憶注入預算
const CODE_RAG_TOKENS = 3500;   // Code RAG 預算（ecc-06: 從 5000 降至 3500，分配 1500 給 LSP）
const DOC_RAG_TOKENS = 3000;    // Document RAG 預算（CMI-5 新增）
const LSP_DIAG_TOKENS = 1500;   // LSP 診斷預算（ecc-06 新增）
const IDD_TOKENS = 1500;        // IDD Layer 10 預算（DLA-07 新增）
const VIOLATION_TOKEN_HARD_CAP = 400;  // Layer 11 Rule Violation cascade 觸發閾值 5→3→1（td-rule-violation-rag-inject）
const LSP_TIMEOUT_MS = 3000;    // 每個編譯指令超時 (ms)
const LSP_ENABLED = process.env.PCPT_LSP_DIAG !== 'false';  // LSP 診斷開關（BR-007）
const VIOLATION_INJECT = process.env.PCPT_VIOLATION_INJECT_ENABLED !== 'false';  // Layer 11 Rule Violation 注入開關
const MIN_QUERY_LENGTH = 3;
const TOP_N = 5;

// ── Prompt Intent Detection（ctr-p2-hook-intent — Phase 2 Token Reduction）──
// Feature flag: 預設 false（灰度上線,使用者手動 opt-in）
// BR-CTR-P2-6: main() 每次 invocation 直接讀 process.env（L920），無 module-level cache
// Env vars: PCPT_PROMPT_INTENT_ENABLED / PCPT_PROMPT_INTENT_KEYWORDS
const DEFAULT_CODE_KEYWORDS = [
  // File path / extensions
  'src/', 'tests/', '.ts', '.tsx', '.cs', '.js', '.jsx', '.razor', '.cshtml',
  // Action verbs (en/zh)
  'fix', 'implement', 'refactor', 'migrate', 'debug', 'bug',
  '修正', '修復', '實作', '重構', '除錯',
  // Architecture nouns (en)
  'Migration', 'Controller', 'Service', 'Component', 'Repository',
  'Entity', 'Hook', 'Store',
];

// S_final 融合權重（CC-Agent 報告 §21.6）
const ALPHA = 0.6;  // 向量相似度
const BETA = 0.2;   // 依賴圖相似度
const GAMMA = 0.2;  // FTS5 文字相似度

// Graph 關係類型權重（Phase 4: 量化 graph score 取代二值 0/0.5）
const RELATION_WEIGHTS = {
  inherits: 1.0,
  implements: 0.9,
  calls: 0.7,
  uses_inferred: 0.4,
};

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
// 依賴展開（2 層，帶 relation_type 權重 Graph Score）
// Phase 4: 量化 graph score + 2-hop transitive expansion
// ──────────────────────────────────────────────
function expandDependencies(db, symbols) {
  const seenIds = new Set(symbols.map(s => s.symbol_id));
  const expanded = [...symbols];

  const depStmt = db.prepare(`
    SELECT d.relation_type,
           si.id AS symbol_id, si.symbol_name, si.full_name,
           si.file_path, si.symbol_type, si.start_line, si.end_line,
           SUBSTR(si.code_snippet, 1, 500) AS code_snippet
    FROM symbol_dependencies d
    JOIN symbol_index si ON si.full_name = d.target_symbol
    WHERE d.source_symbol = ?
      AND d.relation_type IN ('calls', 'inherits', 'implements', 'uses_inferred')
    LIMIT ?
  `);

  // Level 1: direct dependencies (full weight)
  const level1 = [];
  for (const sym of symbols) {
    let deps;
    try { deps = depStmt.all(sym.full_name, 10); } catch { continue; }
    for (const dep of deps) {
      if (!seenIds.has(dep.symbol_id)) {
        seenIds.add(dep.symbol_id);
        const entry = {
          ...dep,
          vec_score: 0,
          fts_score: 0,
          graph_score: RELATION_WEIGHTS[dep.relation_type] || 0.3,
          distance: 1,
          is_dependency: true,
        };
        expanded.push(entry);
        level1.push(entry);
      }
    }
  }

  // Level 2: transitive dependencies (halved weight, fewer per symbol)
  for (const l1 of level1) {
    let deps2;
    try { deps2 = depStmt.all(l1.full_name, 5); } catch { continue; }
    for (const dep of deps2) {
      if (!seenIds.has(dep.symbol_id)) {
        seenIds.add(dep.symbol_id);
        expanded.push({
          ...dep,
          vec_score: 0,
          fts_score: 0,
          graph_score: (RELATION_WEIGHTS[dep.relation_type] || 0.3) * 0.5,
          distance: 2,
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
    const graphNorm = sym.graph_score || (sym.is_dependency ? 0.5 : 0);
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

  let totalSymbols = symbols.length;
  for (const sym of symbols) {
    const lines = sym.start_line && sym.end_line
      ? `:${sym.start_line}-${sym.end_line}`
      : '';
    const depTag = sym.is_dependency
      ? `\n**關係**: ${sym.relation_type} (L${sym.distance || 1} graph=${(sym.graph_score || 0).toFixed(2)})` : '';
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
    if (tokenCount + entryTokens > maxTokens) {
      const dropped = totalSymbols - parts.length;
      parts.push(`\n> ⚠ Code RAG 截斷：顯示 ${parts.length}/${totalSymbols} 個符號（預算 ${maxTokens} tokens），${dropped} 個被省略\n`);
      break;
    }
    parts.push(entry);
    tokenCount += entryTokens;
  }

  if (parts.length === 0) return '';
  return header + parts.join('\n');
}

// ──────────────────────────────────────────────
// Session 記憶查詢（context_entries category='session'）
// CMI-1 AC-2: 注入最近 3 條 session 摘要
// ──────────────────────────────────────────────
function getRecentSessions(db, limit = 3) {
  try {
    return db.prepare(`
      SELECT title, content, timestamp, agent_id
      FROM context_entries
      WHERE category = 'session'
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// CMI-5: 最近對話問題摘要（從 conversation_turns 查詢）
// 讓新對話知道前次對話「問了什麼」
// ──────────────────────────────────────────────
function getRecentUserQuestions(db, limit = 5) {
  try {
    return db.prepare(`
      SELECT ct.content_preview, ct.timestamp, cs.session_id
      FROM conversation_turns ct
      JOIN conversation_sessions cs ON ct.session_id = cs.session_id
      WHERE ct.role = 'user'
      ORDER BY ct.timestamp DESC
      LIMIT ?
    `).all(limit);
  } catch {
    return [];
  }
}

function formatSessionContext(sessions, userQuestions, maxTokens) {
  if (sessions.length === 0 && userQuestions.length === 0) return '';
  const header = '## 最近工作階段摘要（Context Memory 自動注入）\n\n';
  let tokenCount = estimateTokens(header);
  const parts = [];

  // CMI-5: 最近使用者問題（讓新對話知道前次問了什麼）
  if (userQuestions.length > 0) {
    const qHeader = '### 最近對話問題\n';
    const qLines = userQuestions.map((q, i) => {
      const time = q.timestamp ? q.timestamp.slice(11, 19) : '';
      const preview = (q.content_preview || '').slice(0, 80).trim();
      return `${i + 1}. [${time}] ${preview}`;
    });
    const qBlock = qHeader + qLines.join('\n') + '\n\n';
    const qTokens = estimateTokens(qBlock);
    if (tokenCount + qTokens <= maxTokens) {
      parts.push(qBlock);
      tokenCount += qTokens;
    }
  }

  let totalSessions = sessions.length;
  for (const s of sessions) {
    const time = s.timestamp ? s.timestamp.slice(0, 19).replace('T', ' ') : '';
    const entry = `### ${s.title}\n- 時間: ${time}\n- Agent: ${s.agent_id}\n- ${s.content}\n`;
    const entryTokens = estimateTokens(entry);
    if (tokenCount + entryTokens > maxTokens) {
      const dropped = totalSessions - parts.length;
      parts.push(`\n> ⚠ Session 截斷：顯示 ${parts.length} 條，${dropped} 條被省略（預算 ${maxTokens} tokens）\n`);
      break;
    }
    parts.push(entry);
    tokenCount += entryTokens;
  }

  if (parts.length === 0) return '';
  return header + parts.join('\n') + '\n---\n\n';
}

// ──────────────────────────────────────────────
// Layer 11: Rule Violation Hot Zones（td-rule-violation-rag-inject）
// 從 context_entries category='rule_violation' 查最近 N 天違規熱區
// ──────────────────────────────────────────────
function humanizeTimeAgo(isoTs) {
  if (!isoTs) return '不明';
  try {
    const diffMs = Date.now() - new Date(isoTs).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 2) return '剛才';
    if (mins < 60) return `${mins} 分鐘前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小時前`;
    const days = Math.floor(hrs / 24);
    return `${days} 天前`;
  } catch {
    return '不明';
  }
}

function getRecentHotViolations(db, { days = 30, topN = 5 } = {}) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return db.prepare(`
      SELECT
        json_extract(content, '$.violated_rule_path') AS rule_path,
        json_extract(content, '$.workflow_phase')     AS phase,
        COUNT(*)                                      AS frequency,
        MAX(timestamp)                                AS last_at
      FROM context_entries
      WHERE category = 'rule_violation'
        AND timestamp >= ?
      GROUP BY
        json_extract(content, '$.violated_rule_path'),
        json_extract(content, '$.workflow_phase')
      ORDER BY frequency DESC, last_at DESC
      LIMIT ?
    `).all(cutoffStr, topN);
  } catch {
    return [];
  }
}

function formatViolationLayer(violations, { sessionRepeats = {} } = {}) {
  if (!violations || violations.length === 0) return '';
  const header = '## ⚠️ 最近 30 天違規熱區（Layer 11 自動注入）\n\n';
  const lines = violations.map(v => {
    const ruleName = (v.rule_path || '未知規則').replace(/.*[\\/]/, '').replace(/\.md$/, '');
    const phase = v.phase || '未知階段';
    const freq = v.frequency || 1;
    const ago = humanizeTimeAgo(v.last_at);
    const repeatCount = sessionRepeats[v.rule_path] || 0;
    const repeatTag = repeatCount > 0 ? ` 🔴 本 session ${repeatCount} 次` : '';
    return `- ❌ **${ruleName}** (${phase}) × ${freq} — 最後違規: ${ago}${repeatTag}`;
  });
  return header + lines.join('\n') + '\n\n> 以上規則在近期 CR/dev-story 被觸發，請特別留意。\n\n---\n\n';
}

// ──────────────────────────────────────────────
// 任務感知自動查詢：技術債 + 技術決策 + Story 進度
// 從 user prompt 偵測 Story ID / 模組關鍵字，自動注入相關上下文
// ──────────────────────────────────────────────
const STORY_ID_REGEX = /\b(mqv|dvc|dvs|cmi|qgr|td|bf|cat|opt|arch|ux|adm|admin|sec|perf|ci|test|doc|mem|api|seo|i18n|pmt|sub|lic|ann|rem|inv|leg|mnt|brn|sig|pdf|biz|flt|prg|zus|typ|dat|edt|err|rtg|auth|dev|bg|float|fix\d*|rev\d*|fra|ds|rwd|uds|pi|module|stub|epic)-(?=[\w-]*\d)[\w-]+/gi;

function extractStoryIds(prompt) {
  const matches = prompt.match(STORY_ID_REGEX);
  return matches ? [...new Set(matches.map(m => m.toLowerCase()))] : [];
}

function getRelevantTechDebt(db, storyIds, limit = 3) {
  if (!storyIds.length) return [];
  try {
    const placeholders = storyIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, title AS summary, severity, status, story_id, target_story
      FROM tech_debt_items
      WHERE status IN ('open', 'in-progress', 'deferred')
        AND (story_id IN (${placeholders}) OR target_story IN (${placeholders}))
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT ?
    `).all(...storyIds, ...storyIds, limit);
  } catch { return []; }
}

function getRelevantDecisions(db, prompt, limit = 3) {
  try {
    const trimmed = prompt.slice(0, 60).replace(/"/g, '""');
    if (trimmed.length < 3) return [];
    return db.prepare(`
      SELECT title, content, timestamp
      FROM context_entries
      WHERE category = 'decision'
        AND context_fts MATCH '"${trimmed}"'
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  } catch { return []; }
}

function getStoryProgress(db, storyIds, limit = 3) {
  if (!storyIds.length) return [];
  try {
    const placeholders = storyIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, title, status, complexity, epic_id, dev_agent, review_agent
      FROM stories
      WHERE id IN (${placeholders})
      LIMIT ?
    `).all(...storyIds, limit);
  } catch { return []; }
}

function formatTaskAwareContext(debt, decisions, stories) {
  const parts = [];

  if (stories.length > 0) {
    parts.push('### Story 進度（自動偵測）');
    for (const s of stories) {
      parts.push(`- **${s.id}** [${s.status}] ${s.title} (${s.complexity || '?'}, Epic: ${s.epic_id || '?'})`);
    }
    parts.push('');
  }

  if (debt.length > 0) {
    parts.push('### 相關技術債（自動偵測）');
    for (const d of debt) {
      parts.push(`- **${d.id}** [${d.severity}/${d.status}] ${d.summary}`);
    }
    parts.push('');
  }

  if (decisions.length > 0) {
    parts.push('### 相關技術決策（自動偵測）');
    for (const d of decisions) {
      const time = d.timestamp ? d.timestamp.slice(0, 10) : '';
      parts.push(`- [${time}] **${d.title}**: ${(d.content || '').slice(0, 150)}`);
    }
    parts.push('');
  }

  if (parts.length === 0) return '';
  return '## 任務相關上下文（Context Memory 自動偵測注入）\n\n' + parts.join('\n') + '\n---\n\n';
}

// ──────────────────────────────────────────────
// CMI-5: 文檔 FTS5 搜尋（Document RAG）
// 使用 FTS5-only（無 API 呼叫）保持 Hook 低延遲
// ──────────────────────────────────────────────
function searchDocumentsByFts(db, query, limit = 6) {
  // FTS5 trigram 要求 >= 3 字元
  const trimmed = (query || '').trim();
  if (trimmed.length < 3) return [];

  // 對長查詢取關鍵詞片段（避免 FTS5 複雜查詢失敗）
  const keyword = trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed;
  const escaped = keyword.replace(/"/g, '""');
  const ftsQuery = `"${escaped}"`;

  try {
    return db.prepare(`
      SELECT
        dc.id AS chunk_id,
        dc.heading_path,
        SUBSTR(dc.content, 1, 300) AS content_preview,
        di.path AS file_path,
        di.title AS doc_title,
        di.category AS doc_category,
        di.epic_id AS doc_epic_id,
        rank AS fts_rank
      FROM document_chunks dc
      JOIN document_chunks_fts fts ON dc.id = fts.rowid
      JOIN doc_index di ON dc.doc_id = di.id
      WHERE document_chunks_fts MATCH ?
        AND dc.is_stale = 0
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit);
  } catch {
    return [];
  }
}

function formatDocumentContext(docChunks, maxTokens) {
  if (!docChunks || docChunks.length === 0) return '';
  const header = '## 相關專案文檔（Document RAG — CMI-5 自動注入）\n\n';
  let tokenCount = estimateTokens(header);
  const parts = [];

  for (const chunk of docChunks) {
    const headingPart = chunk.heading_path ? ` > ${chunk.heading_path}` : '';
    const epicPart = chunk.doc_epic_id ? ` [${chunk.doc_epic_id}]` : '';
    const entry = [
      `### ${chunk.doc_title || chunk.file_path}${epicPart}${headingPart}`,
      `**檔案**: \`${chunk.file_path}\``,
      `**分類**: ${chunk.doc_category || 'other'}`,
      '',
      chunk.content_preview || '',
      '',
    ].join('\n');

    const entryTokens = estimateTokens(entry);
    if (tokenCount + entryTokens > maxTokens) {
      const dropped = docChunks.length - parts.length;
      parts.push(`\n> ⚠ Document RAG 截斷：顯示 ${parts.length}/${docChunks.length} 個文檔片段，${dropped} 個被省略（預算 ${maxTokens} tokens）\n`);
      break;
    }
    parts.push(entry);
    tokenCount += entryTokens;
  }

  if (parts.length === 0) return '';
  return header + parts.join('\n---\n\n') + '\n---\n\n';
}

// ──────────────────────────────────────────────
// Layer 9: LSP 診斷注入（ecc-06）
// 擷取 C# / TypeScript 編譯錯誤，注入為第 9 層 context
// ──────────────────────────────────────────────

// 解析正則（BR-006）
const CS_ERROR_RE = /^(.+?)\((\d+),\d+\):\s*error\s+(CS\d+):\s*(.+)$/;
const TS_ERROR_RE = /^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/;

/** 從 MSBuild 輸出解析 C# 錯誤（純函式，可測試） */
function parseCSharpErrors(output, projectRoot) {
  const diagnostics = [];
  const normalizedRoot = (projectRoot || '').replace(/\\/g, '/');
  for (const line of (output || '').split('\n')) {
    const match = CS_ERROR_RE.exec(line.trim());
    if (match) {
      const [, filePath, lineNum, code, message] = match;
      const normalizedPath = filePath.replace(/\\/g, '/');
      const relPath = normalizedPath.startsWith(normalizedRoot + '/')
        ? normalizedPath.slice(normalizedRoot.length + 1)
        : normalizedPath;
      // MSBuild 附加 [project.csproj] 後綴 → 去除以節省 token
      const cleanMsg = message.trim().replace(/\s*\[.*\.csproj\]$/, '');
      diagnostics.push({ lang: 'C#', file: relPath, line: parseInt(lineNum, 10), code, message: cleanMsg });
    }
  }
  return diagnostics;
}

/** 從 tsc 輸出解析 TypeScript 錯誤（純函式，可測試） */
function parseTsErrors(output, projectRoot) {
  const diagnostics = [];
  const normalizedRoot = (projectRoot || '').replace(/\\/g, '/');
  for (const line of (output || '').split('\n')) {
    const match = TS_ERROR_RE.exec(line.trim());
    if (match) {
      const [, filePath, lineNum, code, message] = match;
      const normalizedPath = filePath.replace(/\\/g, '/');
      const relPath = normalizedPath.startsWith(normalizedRoot + '/')
        ? normalizedPath.slice(normalizedRoot.length + 1)
        : normalizedPath;
      diagnostics.push({ lang: 'TS', file: relPath, line: parseInt(lineNum, 10), code, message: message.trim() });
    }
  }
  return diagnostics;
}

/** 執行 dotnet build 並回傳 DiagnosticEntry[]（BR-001, BR-003） */
function getCSharpDiagnostics(projectRoot) {
  const cwd = path.join(projectRoot, 'src/Platform/App.Web');

  // 檢查 .csproj 是否存在（BR-001）
  let csprojExists = false;
  try {
    csprojExists = fs.readdirSync(cwd).some(f => f.endsWith('.csproj'));
  } catch { /* 目錄不存在 */ }
  if (!csprojExists) return [];

  let output = '';
  try {
    output = execFileSync('dotnet', ['build', '--no-restore', '--nologo', '-v', 'q'], {
      cwd,
      timeout: LSP_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.killed) {
      process.stderr.write('[RAG] LSP csharp timeout (>3s), skipped\n');
      return [];
    }
    // 編譯失敗仍包含錯誤輸出
    output = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  return parseCSharpErrors(output, projectRoot);
}

/** 執行 npx tsc --noEmit 並回傳 DiagnosticEntry[]（BR-001, BR-003） */
function getTsDiagnostics(projectRoot) {
  const cwd = path.join(projectRoot, 'src/Platform/App.Web/ClientApp');

  // 檢查 tsconfig.json 是否存在（BR-001）
  if (!fs.existsSync(path.join(cwd, 'tsconfig.json'))) return [];

  // Windows: npx 是 .cmd 批次檔，execFileSync 無法直接執行
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  let output = '';
  try {
    output = execFileSync(npxCmd, ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd,
      timeout: LSP_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.killed) {
      process.stderr.write('[RAG] LSP typescript timeout (>3s), skipped\n');
      return [];
    }
    output = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  return parseTsErrors(output, projectRoot);
}

/** 將 DiagnosticEntry[] 格式化為 Markdown（BR-005, BR-006） */
function formatLspContext(diagnostics, maxTokens) {
  if (!diagnostics || diagnostics.length === 0) return '';

  const header = '## 編譯錯誤診斷（LSP Layer 9 自動注入）\n\n';
  let tokenCount = estimateTokens(header);
  const parts = [];

  for (let i = 0; i < diagnostics.length; i++) {
    const d = diagnostics[i];
    const entry = `[${d.lang}] ${d.file}:${d.line} ${d.code} — ${d.message}\n`;
    const entryTokens = estimateTokens(entry);
    if (tokenCount + entryTokens > maxTokens) {
      parts.push(`\n⚠ LSP 診斷截斷：顯示 ${i}/${diagnostics.length} 條\n`);
      break;
    }
    parts.push(entry);
    tokenCount += entryTokens;
  }

  if (parts.length === 0) return '';
  return header + parts.join('') + '\n---\n\n';
}

/** 主協調函數：擷取 C# + TS 診斷並格式化（BR-002, BR-004, BR-007） */
function getLspDiagnostics(projectRoot, maxTokens) {
  if (!LSP_ENABLED) return '';  // BR-007

  try {
    const csErrors = getCSharpDiagnostics(projectRoot);
    const tsErrors = getTsDiagnostics(projectRoot);
    const allDiagnostics = [...csErrors, ...tsErrors];

    if (allDiagnostics.length > 0) {
      process.stderr.write(`[RAG] LSP diagnostics: ${csErrors.length} C# errors + ${tsErrors.length} TS errors\n`);
    }

    return formatLspContext(allDiagnostics, maxTokens);
  } catch (err) {
    process.stderr.write(`[RAG] LSP diagnostics error: ${err.message}\n`);
    return '';
  }
}

// ──────────────────────────────────────────────
// DLA-07: Layer 10 — Intentional Decisions 注入
// 注入 active IDD（critical 優先），防止 AI 違反故意設計
// ──────────────────────────────────────────────
function injectIntentionalDecisionsV13(db, userPrompt, fileHints, budget) {
  if (!IDD_INJECT) return '';

  try {
    // Check table exists (not all DBs may have it yet)
    const tableExists = db.prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='intentional_decisions'"
    ).get().c;
    if (!tableExists) return '';

    const fileLike = fileHints && fileHints[0] ? `%${fileHints[0]}%` : '%';
    const keywords = userPrompt.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3).slice(0, 3).join(' OR ');
    const ftsQuery = keywords || null;

    let rows = [];
    if (ftsQuery) {
      try {
        rows = db.prepare(`
          SELECT id.idd_id, id.idd_type, id.title, id.decision, id.forbidden_changes,
                 id.criticality, id.adr_path, id.related_skills, id.platform_modules
          FROM intentional_decisions id
          JOIN intentional_decisions_fts f ON id.rowid = f.rowid
          WHERE intentional_decisions_fts MATCH ? AND id.status = 'active'
          ORDER BY CASE id.criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END LIMIT 5
        `).all(ftsQuery);
      } catch { /* FTS fallback */ }
    }

    // Always include critical IDDs regardless of FTS match
    const criticalRows = db.prepare(`
      SELECT idd_id, idd_type, title, decision, forbidden_changes,
             criticality, adr_path, related_skills, platform_modules
      FROM intentional_decisions
      WHERE status='active' AND criticality='critical'
      ORDER BY updated_at DESC LIMIT 3
    `).all();

    // Merge: FTS matches + critical (deduplicate)
    const seen = new Set(rows.map(r => r.idd_id));
    for (const r of criticalRows) {
      if (!seen.has(r.idd_id)) { rows.push(r); seen.add(r.idd_id); }
    }

    // File-hint based query
    if (fileHints && fileHints.length > 0) {
      try {
        const fileRows = db.prepare(`
          SELECT idd_id, idd_type, title, decision, forbidden_changes,
                 criticality, adr_path, related_skills, platform_modules
          FROM intentional_decisions
          WHERE status='active' AND related_files LIKE ?
          ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END LIMIT 3
        `).all(fileLike);
        for (const r of fileRows) {
          if (!seen.has(r.idd_id)) { rows.push(r); seen.add(r.idd_id); }
        }
      } catch { /* ignore */ }
    }

    if (!rows.length) return '';

    // Sort: critical first
    rows.sort((a, b) => {
      const order = { critical: 0, normal: 1, low: 2 };
      return (order[a.criticality] || 1) - (order[b.criticality] || 1);
    });

    let output = '## 🛡️ Intentional Decisions (故意設計，請勿違反)\n\n';
    let used = estimateTokens(output);
    const maxChars = budget * 4;

    for (const r of rows) {
      let forbidden = [];
      try { forbidden = JSON.parse(r.forbidden_changes || '[]'); } catch { /* ignore */ }
      const skills = (() => { try { return JSON.parse(r.related_skills || '[]'); } catch { return []; } })();

      const entry = `- **${r.idd_id}** (${r.idd_type})${r.criticality === 'critical' ? ' ⚠️ CRITICAL' : ''}: ${r.title}\n`
        + `  - Decision: ${r.decision}\n`
        + (forbidden.length ? `  - ❌ Forbidden: ${forbidden.join(' / ')}\n` : '')
        + (skills.length ? `  - Related Skills: ${skills.join(', ')}\n` : '')
        + `  - See: ${r.adr_path}\n`;

      const entryTokens = estimateTokens(entry);
      if (used + entryTokens > budget) break;
      output += entry;
      used += entryTokens;
    }

    return output + '\n---\n\n';
  } catch (err) {
    process.stderr.write(`[RAG] IDD injection skipped: ${err.message}\n`);
    return '';
  }
}

// ──────────────────────────────────────────────
// CMI-3: 內嵌 user turn 記錄（輕量，< 50ms）
// 在 session 注入邏輯後、Code RAG 前執行
// ──────────────────────────────────────────────
function logUserTurnInline(sessionId, prompt) {
  if (!sessionId || !prompt) return;

  // 使用 write-mode DB（獨立連線，即讀即關）
  let writeDb;
  try {
    writeDb = new Database(DB_PATH, { readonly: false });
    writeDb.pragma('journal_mode = WAL');

    const timestamp = getTaiwanTimestamp();
    const truncated = prompt.length > 10000 ? prompt.slice(0, 10000) : prompt;
    const preview = prompt.length > 300 ? prompt.slice(0, 300) : prompt;
    const tokenEstimate = Math.ceil(truncated.length / 4);

    // UPSERT session
    writeDb.prepare(`
      INSERT OR IGNORE INTO conversation_sessions
        (session_id, started_at, first_prompt)
      VALUES (?, ?, ?)
    `).run(sessionId, timestamp, truncated.slice(0, 500));

    // turn_index
    const countRow = writeDb.prepare(
      'SELECT COUNT(*) AS cnt FROM conversation_turns WHERE session_id = ?'
    ).get(sessionId);
    const turnIndex = countRow ? countRow.cnt : 0;

    // INSERT user turn
    writeDb.prepare(`
      INSERT INTO conversation_turns
        (session_id, turn_index, role, content, content_preview,
         timestamp, token_estimate, tools_used, files_touched)
      VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, turnIndex,
      truncated, preview,
      timestamp, tokenEstimate,
      null, null
    );

    // UPDATE session
    writeDb.prepare(`
      UPDATE conversation_sessions
      SET total_turns = total_turns + 1,
          user_turns = user_turns + 1
      WHERE session_id = ?
    `).run(sessionId);

    process.stderr.write(`[RAG] User turn logged (idx=${turnIndex}) for session ${sessionId.slice(0, 8)}...\n`);
  } catch (err) {
    // 靜默失敗，不阻塞提問
    process.stderr.write(`[RAG] logUserTurnInline error: ${err.message}\n`);
  } finally {
    try { if (writeDb) writeDb.close(); } catch { /* ignore */ }
  }
}

// ──────────────────────────────────────────────
// Prompt Intent Detection — Pure Functions
// BR-CTR-P2-1~3: keyword-based intent detection
// ──────────────────────────────────────────────

/**
 * 偵測 prompt 是否含 code intent keywords。
 * @param {string} prompt - 使用者 prompt
 * @param {string[]} [keywords] - 自訂 keyword list（未提供則用 DEFAULT_CODE_KEYWORDS）
 * @returns {boolean} true = code intent, false = discussion intent
 */
function detectCodeIntent(prompt, keywords) {
  if (!prompt || typeof prompt !== 'string') return false;
  const kws = Array.isArray(keywords) ? keywords : DEFAULT_CODE_KEYWORDS;
  const lowerPrompt = prompt.toLowerCase();
  return kws.some(kw => lowerPrompt.includes(kw.toLowerCase()));
}

/**
 * 載入 intent keyword list。
 * 優先讀 PCPT_PROMPT_INTENT_KEYWORDS env var（JSON array）；
 * parse 失敗 → fallback DEFAULT_CODE_KEYWORDS + stderr 警告。
 * @returns {string[]}
 */
function loadIntentKeywords() {
  const raw = process.env.PCPT_PROMPT_INTENT_KEYWORDS;
  if (!raw) return DEFAULT_CODE_KEYWORDS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(k => typeof k === 'string')) {
      if (parsed.length === 0) {
        process.stderr.write('[RAG] PCPT_PROMPT_INTENT_KEYWORDS is empty array — all prompts will be treated as discussion\n');
      }
      return parsed;
    }
    process.stderr.write('[RAG] PCPT_PROMPT_INTENT_KEYWORDS invalid array — fallback default\n');
    return DEFAULT_CODE_KEYWORDS;
  } catch {
    process.stderr.write('[RAG] PCPT_PROMPT_INTENT_KEYWORDS JSON parse failed — fallback default\n');
    return DEFAULT_CODE_KEYWORDS;
  }
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

  // CMI-3: 內嵌 user turn 記錄（在 readonly DB 查詢前執行，使用獨立連線）
  const sessionId = input.session_id || input.sessionId || null;
  if (sessionId) {
    logUserTurnInline(sessionId, userPrompt);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch {
    return;
  }

  try {
    // ── Pipeline 模式偵測日誌 ──
    if (isPipeline) {
      process.stderr.write(`[RAG] Pipeline mode (${process.env.PIPELINE_PHASE}) — skipping session+task+pipeline+skill layers\n`);
    }

    // ── Prompt Intent Detection（BR-CTR-P2-1~2）──
    // BR-CTR-P2-6: 每次 hook invocation 讀 env（process 級 const,各次獨立）
    const intentEnabled = process.env.PCPT_PROMPT_INTENT_ENABLED === 'true';
    const intent = intentEnabled
      ? (detectCodeIntent(userPrompt, loadIntentKeywords()) ? 'code' : 'discussion')
      : 'code';  // flag=false → baseline 全量注入

    // ── Session 記憶注入（CMI-1 AC-2 + CMI-5 對話問題摘要）──
    let sessions = [];
    let sessionContext = '';
    if (!isPipeline) {
      sessions = getRecentSessions(db);
      const userQuestions = getRecentUserQuestions(db);
      sessionContext = formatSessionContext(sessions, userQuestions, SESSION_TOKENS);
    }

    // ── Code RAG 注入（intent=code 時執行,discussion 時 skip — BR-CTR-P2-1）──
    let codeContext = '';
    let symbolCount = 0;

    if (intent === 'code') {
      let topSymbols = [];
      // 嘗試向量搜尋（本地 ONNX 推理主路徑）
      try {
        const queryVec = await generateEmbedding(userPrompt);
        topSymbols = searchSymbolsByVector(db, queryVec, TOP_N);
      } catch (embErr) {
        // 本地 ONNX 不可用 → FTS5 LIKE 降級
        process.stderr.write(`[RAG] Embedding fallback: ${embErr.message}\n`);
        topSymbols = searchFtsLikeFallback(db, userPrompt, TOP_N);
      }

      if (topSymbols.length > 0) {
        const expanded = expandDependencies(db, topSymbols);
        const scored = calculateSfinal(expanded);
        codeContext = formatContext(scored, CODE_RAG_TOKENS);
        symbolCount = scored.length;
      }
    }

    // ── 任務感知自動查詢（技術債 + 技術決策 + Story 進度）──
    let taskContext = '';
    if (!isPipeline) {
      try {
        const storyIds = extractStoryIds(userPrompt);
        const debt = getRelevantTechDebt(db, storyIds);
        const decisions = getRelevantDecisions(db, userPrompt);
        const stories = getStoryProgress(db, storyIds);
        taskContext = formatTaskAwareContext(debt, decisions, stories);
      } catch (taskErr) {
        process.stderr.write(`[RAG] Task-aware query skipped: ${taskErr.message}\n`);
      }
    }

    // ── Document RAG 注入（CMI-5 新增，FTS5-only 保持低延遲）──
    let docContext = '';
    let docChunkCount = 0;
    try {
      const docChunks = searchDocumentsByFts(db, userPrompt, 6);
      docContext = formatDocumentContext(docChunks, DOC_RAG_TOKENS);
      docChunkCount = docChunks.length;
    } catch (docErr) {
      process.stderr.write(`[RAG] Document RAG skipped: ${docErr.message}\n`);
    }

    // ── Layer 7: Pipeline State 注入（active pipeline checkpoint 警告）──
    let pipelineContext = '';
    if (!isPipeline) {
      try {
        const activePipeline = db.prepare(`
          SELECT pipeline_id, pipeline_type, status, current_step, total_steps, updated_at
          FROM pipeline_checkpoints
          WHERE status IN ('running', 'paused')
          ORDER BY updated_at DESC LIMIT 1
        `).get();
        if (activePipeline) {
          const elapsed = Math.round((Date.now() - new Date(activePipeline.updated_at).getTime()) / 60000);
          const stale = elapsed > 30 ? ' **⚠ POSSIBLY STALE**' : '';
          pipelineContext = `## Active Pipeline（自動偵測）\n\n` +
            `- **${activePipeline.pipeline_id}** (${activePipeline.pipeline_type}) — ${activePipeline.status} Step ${activePipeline.current_step}/${activePipeline.total_steps}${stale}\n` +
            `- Last updated: ${elapsed} min ago\n` +
            (stale ? `- 子視窗可能已 crash，請先確認狀態再繼續\n` : '') +
            `\n---\n\n`;
        }
      } catch { /* pipeline_checkpoints may not exist */ }
    }

    // ── Layer 8: Skill Recommendation（機械式關鍵字匹配）──
    let skillContext = '';
    if (!isPipeline) {
      try {
        const skillIndexPath = path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-keywords.json');
        if (fs.existsSync(skillIndexPath)) {
          const skillIndex = JSON.parse(fs.readFileSync(skillIndexPath, 'utf8'));
          const lowerPrompt = userPrompt.toLowerCase();
          const matched = [];
          for (const [skillName, keywords] of Object.entries(skillIndex)) {
            if (keywords.some(kw => lowerPrompt.includes(kw.toLowerCase()))) {
              matched.push(skillName);
            }
          }
          if (matched.length > 0) {
            const uniqueSkills = [...new Set(matched)].slice(0, 5);
            skillContext = `## 推薦 Skill（自動關鍵字匹配）\n\n` +
              `以下 Skill 與本次提問相關，建議先 Read SKILL.md 再開始工作：\n` +
              uniqueSkills.map(s => `- \`/pcpt-${s}\` → \`.claude/skills/${s}/SKILL.md\``).join('\n') +
              `\n\n---\n\n`;
          }
        }
      } catch { /* skill matching is best-effort */ }
    }

    // ── Layer 10: IDD 注入（DLA-07）——intent=code 時執行（BR-CTR-P2-1）──
    // CR-H1 fix: 動態計算剩餘 budget，避免所有層加總超過 MAX_TOKENS
    let iddContext = '';
    let iddCount = 0;
    if (intent === 'code') {
      try {
        const usedSoFar = estimateTokens(sessionContext + taskContext);
        const reservedForLater = CODE_RAG_TOKENS + DOC_RAG_TOKENS + LSP_DIAG_TOKENS;
        const iddBudget = Math.min(IDD_TOKENS, Math.max(0, MAX_TOKENS - usedSoFar - reservedForLater));
        // Extract file hints from prompt (patterns like src/..., .ts, .tsx, .cs)
        const fileHints = userPrompt.match(/[\w/.]+\.(tsx?|cs|js|ts)/g) || [];
        iddContext = injectIntentionalDecisionsV13(db, userPrompt, fileHints, iddBudget);
        if (iddContext) {
          const iddMatches = iddContext.match(/IDD-[A-Z]+-\d+/g);
          iddCount = iddMatches ? new Set(iddMatches).size : 0;
        }
      } catch { /* silent — 絕不阻塞提問 */ }
    }

    // ── Layer 9: LSP 診斷注入（ecc-06）——intent=code 時執行（BR-CTR-P2-1）──
    let lspContext = '';
    let lspDiagCount = 0;
    if (intent === 'code') {
      try {
        lspContext = getLspDiagnostics(PROJECT_ROOT, LSP_DIAG_TOKENS);
        if (lspContext) {
          const matches = lspContext.match(/\[(?:C#|TS)\]/g);
          lspDiagCount = matches ? matches.length : 0;
        }
      } catch { /* silent — 絕不阻塞提問 */ }
    }

    // ── Layer 11: Rule Violation Hot Zones（td-rule-violation-rag-inject）──
    // 位置：session 後、task-aware 前（saliency: 近況 → 違規警告 → 當下任務）
    // intent=discussion → skip（同 Code RAG/LSP/IDD，保持 discussion 模式輕量）
    let violationContext = '';
    let violationCount = 0;
    if (!isPipeline && VIOLATION_INJECT && intent !== 'discussion') {
      try {
        let violations = getRecentHotViolations(db);
        violationContext = formatViolationLayer(violations);
        // Token budget cascade（AC-5 / DoD）：5→3→1
        if (estimateTokens(violationContext) > VIOLATION_TOKEN_HARD_CAP) {
          violations = getRecentHotViolations(db, { topN: 3 });
          violationContext = formatViolationLayer(violations);
          if (estimateTokens(violationContext) > VIOLATION_TOKEN_HARD_CAP) {
            violations = getRecentHotViolations(db, { topN: 1 });
            violationContext = formatViolationLayer(violations);
          }
        }
        violationCount = violations.length;
      } catch (err) {
        process.stderr.write(`[RAG] Violation layer skipped: ${err.message}\n`);
      }
    }

    // ── 合併輸出（Session + Violations + Task-Aware + IDD + Pipeline + Skill + LSP + Code + Document）──
    const combinedContext = sessionContext + violationContext + taskContext + iddContext + pipelineContext + skillContext + lspContext + codeContext + docContext;
    if (!combinedContext) return;

    const totalTokens = estimateTokens(combinedContext);
    const intentTag = ` intent=${intentEnabled ? intent : 'off'}`;
    const taskItems = taskContext ? ' + task-aware' : '';
    const violationTag = violationContext ? ` + ${violationCount} violations` : '';
    const iddTag = iddContext ? ` + ${iddCount} idd` : '';
    const pipelineTag = pipelineContext ? ' + pipeline' : '';
    const skillTag = skillContext ? ' + skills' : '';
    const lspTag = lspContext ? ` + ${lspDiagCount} lsp-diag` : '';
    process.stderr.write(`[RAG] Injected:${intentTag} ${sessions.length} sessions${violationTag}${taskItems}${iddTag}${pipelineTag}${skillTag}${lspTag} + ${symbolCount} symbols + ${docChunkCount} doc chunks (${totalTokens} est. tokens)\n`);
    // BR-CTR-P2-1: intent=discussion 時標註 skip 的層
    if (intentEnabled && intent === 'discussion') {
      process.stderr.write(`[RAG] intent=discussion — skip code/lsp/idd\n`);
    }
    process.stdout.write(JSON.stringify({ additionalContext: combinedContext }));
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
