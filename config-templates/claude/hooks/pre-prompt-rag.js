#!/usr/bin/env node
// ============================================================
// PhyCool Code RAG Phase 3 — UserPromptSubmit Hook
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
const DB_PATH = path.join(CONTEXT_DB_DIR, 'phycool.db');

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
const IDD_INJECT = process.env.PHYCOOL_IDD_INJECT !== 'false';  // DLA-07: IDD Layer 10 feature flag
const isPipeline = !!process.env.PIPELINE_PHASE;

// ──────────────────────────────────────────────
// 注入預算 — 一律以「字元」為單位（bwu-11）
// ──────────────────────────────────────────────
// 官方契約：hook 的輸出字串（additionalContext / systemMessage / plain stdout）上限為
// 10,000 **字元**，超出者會被 CLI 存檔並改以 preview + 檔案路徑取代。該限制作用於
// 「每一個輸出字串」，而非同一事件所有 hook 的合計。
// [Source: https://code.claude.com/docs/en/hooks | Fetched 2026-08-02]
//
// 修前本檔全部預算以 token 計（MAX_TOKENS = 10000 搭配 estimateTokens = length/4），換算後
// 實際放行約 40,000 字元 = 官方上限的 4 倍；且該常數只被 iddBudget / instinctBudget 兩處
// 消費，從未用於 combinedContext 的全域封頂 —— 上限根本沒有被把關過。同事件另四支 hook
// （bmad-slash-story-inject 2600 / ctrl-channel-inject 800 / worker-notify-inject 800）
// 皆已採字元制，本檔為唯一未對齊者。
//
// 分層預算驗算（violation 以其 banner ×1.2 的上界 780 計；godNodes 為固定 advisory 模板，
// 實測約 118 字元，僅列入驗算不施加截斷）：
//   2400 + 780 + 550 + 1400 + 450 + 300 + 400 + 750 + 1450 + 650 + 150 = 9280
//   9280 ≤ MAX_INJECT_CHARS(9500)，留 220 字元緩衝吸收各 formatter 截斷註記的溢出。
const DEFAULT_MAX_INJECT_CHARS = 9500;  // 對 10,000 官方硬界留 500 字元安全邊際
const MAX_INJECT_CHARS = (() => {       // env 覆寫供調校與 e2e 強制降級測試使用；上界夾 10,000（官方 per-string 硬界）
  const raw = parseInt(process.env.PHYCOOL_RAG_MAX_INJECT_CHARS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10000) : DEFAULT_MAX_INJECT_CHARS;
})();
const DEGRADE_NOTICE_RESERVE = 600;   // 降級告警的字元上界（最多列 7 層 + 各層自取管道，靜態推算 ≈560）
const SESSION_CHARS = 2400;     // Layer 1 Session 記憶
const CODE_RAG_CHARS = 1450;    // Layer 4 Code RAG
const DOC_RAG_CHARS = 650;      // Layer 5 Document RAG
const LSP_DIAG_CHARS = 750;     // Layer 9 LSP 診斷
const IDD_CHARS = 1400;         // Layer 10 Intentional Decisions
const VIOLATION_CHAR_HARD_CAP = 650;   // Layer 11 cascade 觸發閾值 5→3→1（banner 另允 ×1.2）
// bwu-14: Layer 12 預算 + entry 格式 + 起算基準收斂至單一定義站點（兩側 require 同一份，
// 取代原各自宣告的 450/1200 常數，見 .context-db/scripts/inject-budget.cjs 檔頭說明）
// CR F4: 跨目錄 require 比照本檔 better-sqlite3 的既有防護（檔頭「任何異常均靜默退出，
// 絕不阻塞使用者提問」）。共用模組不可用時僅讓 Layer 12 降級停用 —— 0 會使
// injectInstinctsLayer12 首行的 `maxChars <= 0` 守衛即刻 return，其餘 11 層不受影響。
let INSTINCT_CHARS = 0, INSTINCT_HEADER = '', formatInstinctEntry = () => '';
try {
  ({ INSTINCT_CHARS, INSTINCT_HEADER, formatInstinctEntry } = require(
    path.join(CONTEXT_DB_DIR, 'scripts', 'inject-budget.cjs')
  ));
} catch { /* 共用模組不可用 → Layer 12 靜默停用，不影響其餘層 */ }
const TASK_AWARE_CHARS = 550;   // Layer 3 任務感知（bwu-11 新增，修前無預算）
const PIPELINE_CHARS = 300;     // Layer 7 Pipeline State（bwu-11 新增，修前無預算）
const SKILL_REC_CHARS = 400;    // Layer 8 Skill 推薦（bwu-11 新增，修前無預算）

const LSP_TIMEOUT_MS = 3000;    // 每個編譯指令超時 (ms)
const LSP_ENABLED = process.env.PHYCOOL_LSP_DIAG !== 'false';  // LSP 診斷開關（BR-007）
const VIOLATION_INJECT = process.env.PHYCOOL_VIOLATION_INJECT_ENABLED !== 'false';  // Layer 11 Rule Violation 注入開關
const INSTINCT_INJECT = process.env.PHYCOOL_INSTINCT_INJECT !== 'false';  // Layer 12 ECC Instinct 注入開關
// 2026-05-26 使用者裁定: 湧現迴路內容黃色顯示開關 — 預設 ON · flag 檔 .claude/ecc-instinct-display.flag(內容 'off'=關)即時生效不需重啟(每次 invocation 為新 process · live 讀)· env PHYCOOL_INSTINCT_SHOW_CONTENT '0'/'false' 關、'1'/'true' 強開 · toggle 由 scripts/toggle-instinct-display.cjs 控制
const INSTINCT_SHOW_CONTENT = (() => {
  try {
    const e = process.env.PHYCOOL_INSTINCT_SHOW_CONTENT;
    if (e === '0' || e === 'false') return false;
    if (e === '1' || e === 'true') return true;
    const fp = require('path').join(__dirname, '..', 'ecc-instinct-display.flag');
    const fsm = require('fs');
    if (fsm.existsSync(fp)) return fsm.readFileSync(fp, 'utf8').trim().toLowerCase() !== 'off';
    return true; // 預設 ON(使用者裁定 2026-05-26)
  } catch { return true; }
})();
const MIN_QUERY_LENGTH = 3;
const TOP_N = 5;

// ── Prompt Intent Detection（ctr-p2-hook-intent — Phase 2 Token Reduction）──
// Feature flag: 預設 false（灰度上線,使用者手動 opt-in）
// BR-CTR-P2-6: main() 每次 invocation 直接讀 process.env（L920），無 module-level cache
// Env vars: PHYCOOL_PROMPT_INTENT_ENABLED / PHYCOOL_PROMPT_INTENT_KEYWORDS
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

// S_final 融合權重（CC-Agent 報告 §21.6 + ADR-GOVERNANCE-001 v1.0 加 DELTA）
const ALPHA = 0.6;  // 向量相似度
const BETA = 0.2;   // 依賴圖相似度
const GAMMA = 0.2;  // FTS5 文字相似度
const DELTA = 0.05; // ★ NEW(2026-05-02): centrality_score 微幅加權,漸進不破壞既有 0.6/0.2/0.2 主軸
                    // 對齊 ADR-GOVERNANCE-001 Layer 3 + 補全計畫.md §6.4
                    // Kill switch: retrieval_observations 命中率退化 ≥ 5% → 設 DELTA=0 即可回退

// G14 P2 RepoMap v2: δ·centrality 項可升級為 Personalized PageRank(任務符號 personalization)
// ENV flag 預設關 → 行為不變(仍靜態 centrality);PHYCOOL_PPR_ENABLED=true 啟用 PPR reranking
// fail-safe: PPR 失敗 fallback 靜態 centrality。注入量不增(留 CODE_RAG_CHARS 內 rerank)。改善計畫 §6.7
const PPR_ENABLED = process.env.PHYCOOL_PPR_ENABLED === 'true';
let _repomapPpr = null;  // lazy require(只 PPR_ENABLED + intent=code 時載入)
function getRepomapPpr() {
  if (_repomapPpr === null) {
    try { _repomapPpr = require(require('path').join(__dirname, '..', '..', '.context-db', 'scripts', 'repomap-ppr.cjs')); }
    catch (e) { _repomapPpr = false; process.stderr.write(`[RAG] repomap-ppr load fail: ${e.message}\n`); }
  }
  return _repomapPpr;
}

// Graph 關係類型權重（Phase 4: 量化 graph score 取代二值 0/0.5）
// ★ SSoT: 此處改 → 必同步 .context-db/scripts/compute-centrality.cjs RELATION_WEIGHTS
const RELATION_WEIGHTS = {
  inherits: 1.0,
  implements: 0.9,
  calls: 0.7,
  uses_inferred: 0.4,
};

/**
 * 估算 token 數（約 4 字元/token）。
 * bwu-11 起**僅供 stderr 觀測日誌**，不再參與任何預算判定 —— 所有注入預算改以字元為單位，
 * 與官方 10,000 字元上限同量綱。混用是修前「上限從未被把關」的根因。
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * 超過字元上限時截斷，並在尾端附上具名註記（保留 markdown 區塊分隔）。
 * 供修前完全無預算的三層（task-aware / pipeline / skill）使用。
 * @param {string} text
 * @param {number} maxChars
 * @param {string} label - 註記中顯示的層名
 * @returns {string}
 */
function capChars(text, maxChars, label) {
  if (!text || text.length <= maxChars) return text || '';
  const notice = `\n> ⚠ ${label} 截斷（上限 ${maxChars} 字元）\n\n---\n\n`;
  const room = Math.max(0, maxChars - notice.length);
  return text.slice(0, room) + notice;
}

// ──────────────────────────────────────────────
// bwu-11: 分層降級（全域字元封頂的安全網）
// ──────────────────────────────────────────────
// 組裝順序（saliency：近況 → 違規警告 → 當下任務 → 故意設計 → ...）
const LAYER_ORDER = [
  'session', 'violation', 'task', 'idd', 'instinct',
  'pipeline', 'skill', 'lsp', 'code', 'doc', 'godNodes',
];

// 丟棄優先序 —— 判準為「Claude 能否自行重新取得」。可自取回者先丟。
//   doc/code：Claude 可自行 Grep/Read/codegraph；lsp：可自行跑 dotnet build / tsc
//   instinct：明示「供參考」；session：最肥但屬歷史脈絡；skill/pipeline：體積小丟棄效益低故排後
// 不在此清單者為必留層（violation / task / idd / godNodes）—— 皆為 Claude 無法自行得知的
// DB 內部狀態、紀律歷史或故意設計禁令，其中 idd 含 CRITICAL 等級禁令。
const LAYER_DROP_ORDER = ['doc', 'code', 'lsp', 'instinct', 'session', 'skill', 'pipeline'];

// 各可丟層的自取管道。降級時把「內容」換成「指標」—— 這是 pointer-over-payload 手法
// 唯一成立的位置：一個層之所以進得了丟棄候選，前提就是它可被自行取回。
// 必留層沒有對應條目，因為它們的價值正在於「Claude 不會想到要去查」。
const LAYER_RECOVERY = {
  doc: 'search_documents / Grep',
  code: 'codegraph_context / Grep',
  lsp: 'dotnet build / npx tsc --noEmit',
  instinct: 'search_instincts',
  session: 'search_context({category:"session"})',
  skill: '.claude/skills/skills_list.md',
  pipeline: 'search_worker_runs',
};

/**
 * 依價值優先序丟棄可自取回的層，直到總長度符合字元上限。
 * 純函式：不讀 DB、不寫檔、不依賴模組外可變狀態，可獨立測試。
 * 必留層永不進入丟棄候選；若必留層合計仍超過上限，如實回傳並標記 overflow（由呼叫端告警）。
 * @param {Record<string,string>} layers - layer 名稱 → 內容字串
 * @param {number} maxChars
 * @returns {{ text: string, dropped: Array<{layer: string, chars: number}>, chars: number, overflow: boolean }}
 */
function degradeInjectionLayers(layers, maxChars) {
  const src = layers || {};
  const assemble = (skip) =>
    LAYER_ORDER.filter(n => !skip.has(n)).map(n => src[n] || '').join('');

  const skip = new Set();
  let text = assemble(skip);
  if (text.length <= maxChars) {
    return { text, dropped: [], chars: text.length, overflow: false };
  }

  const dropped = [];
  for (const name of LAYER_DROP_ORDER) {
    const chars = (src[name] || '').length;
    if (chars === 0) continue;  // 空層丟了不會變短，不計入 dropped 以免告警出現雜訊
    skip.add(name);
    dropped.push({ layer: name, chars });
    text = assemble(skip);
    if (text.length <= maxChars) break;
  }
  return { text, dropped, chars: text.length, overflow: text.length > maxChars };
}

/**
 * 產生降級告警文字（三管道共用同一句，確保 Claude / 使用者 / debug log 看到的一致）。
 * @param {{dropped: Array<{layer:string,chars:number}>, chars: number, overflow: boolean}} result
 * @param {number} maxChars
 * @returns {string} 未降級時回傳空字串
 */
function formatDegradeNotice(result, maxChars) {
  if (!result || (result.dropped.length === 0 && !result.overflow)) return '';
  const parts = [];
  if (result.dropped.length > 0) {
    const detail = result.dropped.map(d => `${d.layer}(${d.chars})`).join('/');
    const total = result.dropped.reduce((sum, d) => sum + d.chars, 0);
    parts.push(`已丟棄 ${detail} 共 ${total} 字元以符合 ${maxChars} 上限`);
  }
  if (result.overflow) {
    parts.push(`必留層合計 ${result.chars} 字元仍超過上限，已全數保留`);
  }
  let notice = `> ⚠ RAG 注入降級：${parts.join('；')}\n`;
  // 被丟的層附上自取管道 —— 陳述句形式（命令句會觸發 prompt-injection 防禦被 surface 給使用者）
  const hints = result.dropped
    .filter(d => LAYER_RECOVERY[d.layer])
    .map(d => `${d.layer} → ${LAYER_RECOVERY[d.layer]}`);
  if (hints.length > 0) notice += `> 上列各層的自取管道：${hints.join('；')}\n`;
  return notice + '\n';
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
           si.start_line, si.end_line, si.centrality_score,
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
        centrality_score: row.centrality_score || 0,  // ADR-GOVERNANCE-001 Layer 3
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
           start_line, end_line, centrality_score,
           SUBSTR(code_snippet, 1, 1000) AS code_snippet
    FROM symbol_index
    WHERE symbol_name LIKE ? OR full_name LIKE ?
    ORDER BY symbol_name
    LIMIT ?
  `).all(kw, kw, limit).map(r => ({
    ...r,
    vec_score: 0,
    fts_score: 1.0,
    centrality_score: r.centrality_score || 0,  // ADR-GOVERNANCE-001 Layer 3
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
           si.centrality_score,
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
          centrality_score: dep.centrality_score || 0,  // ADR-GOVERNANCE-001 Layer 3
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
          centrality_score: dep.centrality_score || 0,  // ADR-GOVERNANCE-001 Layer 3
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
// S_final = α·vec + β·graph + γ·fts + δ·centrality(ADR-GOVERNANCE-001 Layer 3)
// ──────────────────────────────────────────────
function calculateSfinal(symbols, pprScores = null) {
  const maxVec = Math.max(...symbols.map(s => s.vec_score || 0), 0.001);
  const maxCentrality = Math.max(...symbols.map(s => s.centrality_score || 0), 0.001);

  return symbols.map(sym => {
    const vecNorm  = (sym.vec_score || 0) / maxVec;
    const graphNorm = sym.graph_score || (sym.is_dependency ? 0.5 : 0);
    const ftsNorm  = sym.fts_score || 0;
    // G14 P2: 有 pprScores(已 0~1 normalized)用 Personalized PageRank,否則靜態 centrality(fail-safe 向後相容)
    const structNorm = pprScores
      ? (pprScores.get(sym.full_name) || 0)
      : (sym.centrality_score || 0) / maxCentrality;  // 0~1 normalize
    const s_final  = ALPHA * vecNorm + BETA * graphNorm + GAMMA * ftsNorm + DELTA * structNorm;
    return { ...sym, s_final };
  }).sort((a, b) => b.s_final - a.s_final);
}

// ──────────────────────────────────────────────
// Context 格式化（Token 上限截斷）
// ──────────────────────────────────────────────
function formatContext(symbols, maxChars) {
  const parts = [];
  const header = '## 自動注入的程式碼上下文（Code RAG Phase 3）\n\n';
  let charCount = header.length;

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

    if (charCount + entry.length > maxChars) {
      const dropped = totalSymbols - parts.length;
      parts.push(`\n> ⚠ Code RAG 截斷：顯示 ${parts.length}/${totalSymbols} 個符號（預算 ${maxChars} 字元），${dropped} 個被省略\n`);
      break;
    }
    parts.push(entry);
    charCount += entry.length;
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

function formatSessionContext(sessions, userQuestions, maxChars) {
  if (sessions.length === 0 && userQuestions.length === 0) return '';
  const header = '## 最近工作階段摘要（Context Memory 自動注入）\n\n';
  let charCount = header.length;
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
    if (charCount + qBlock.length <= maxChars) {
      parts.push(qBlock);
      charCount += qBlock.length;
    }
  }

  const totalSessions = sessions.length;
  let shown = 0;  // bwu-11: 原以 parts.length 當已顯示筆數，但 parts[0] 可能是問題摘要區塊 → 少算一筆
  for (const s of sessions) {
    const time = s.timestamp ? s.timestamp.slice(0, 19).replace('T', ' ') : '';
    const entry = `### ${s.title}\n- 時間: ${time}\n- Agent: ${s.agent_id}\n- ${s.content}\n`;
    if (charCount + entry.length > maxChars) {
      // bwu-11: 單筆 session 動輒數千字元，整筆丟棄會讓本層在字元預算下恆為空 ——
      // 「上次做了什麼」的近況脈絡整層消失。改為截斷該筆內容後仍納入。
      const room = maxChars - charCount;
      const partialNotice = '…（本筆截斷）\n';
      if (room >= 200 + partialNotice.length) {  // 殘段太短沒有閱讀價值，不如直接標省略
        parts.push(entry.slice(0, room - partialNotice.length) + partialNotice);
        charCount += room;
        shown++;
      }
      parts.push(`\n> ⚠ Session 截斷：顯示 ${shown}/${totalSessions} 條（預算 ${maxChars} 字元）\n`);
      break;
    }
    parts.push(entry);
    charCount += entry.length;
    shown++;
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
    // TZ FIX 2026-05-29: 台灣日界(原 UTC 日界 vs context_entries +08:00 戳 → 違規熱區 30d 窗口邊界偏移 1 天)
    const cutoff = new Date(Date.now() - days * 86400000 + 8 * 3600000);
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
        AND json_valid(content) = 1   -- G19 fix: skip malformed-JSON rows (manual add_context markdown) so json_extract below won't throw → Layer 11 不再靜默回空
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
// 2026-07-29 (bwu-5 CR): 補 bwu|whp|tdb|ccb|ctr 五軌前綴 —— 補前實測對此五軌全數回 null
// (`td` 存在但 `\btd-` 對不上 `tdb-`)。長期解方是改採 bmad-slash-story-inject.js 的
// 「DB 存在性即白名單」掃描,徹底消除本白名單的維護成本(見 TD-RAG-LAYER3-...)。
const STORY_ID_REGEX = /\b(mqv|dvc|dvs|cmi|qgr|tdb|td|bwu|whp|ccb|ctr|bf|cat|opt|arch|ux|adm|admin|sec|perf|ci|test|doc|mem|api|seo|i18n|pmt|sub|lic|ann|rem|inv|leg|mnt|brn|sig|pdf|biz|flt|prg|zus|typ|dat|edt|err|rtg|auth|dev|bg|float|fix\d*|rev\d*|fra|ds|rwd|uds|pi|module|stub|epic)-(?=[\w-]*\d)[\w-]+/gi;

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
    // Verified PRAGMA 2026-07-28: stories PK = story_id (TEXT), 47 cols, no `id` column.
    // 2026-07-29 (bwu-5 CR / TD-RAG-LAYER3-STORIES-ID-COLUMN-MISSING): 原查 `id` 恆 throw
    // 被 catch 吞 → Layer 3 永遠回空。catch 改為具名 stderr 告警,維持 fail-open 但不再靜默。
    return db.prepare(`
      SELECT story_id, title, status, complexity, epic_id, dev_agent, review_agent
      FROM stories
      WHERE story_id IN (${placeholders})
      LIMIT ?
    `).all(...storyIds, limit);
  } catch (err) {
    process.stderr.write(`[RAG] Layer 3 story progress query failed: ${err.message}\n`);
    return [];
  }
}

function formatTaskAwareContext(debt, decisions, stories, maxChars) {
  const parts = [];

  if (stories.length > 0) {
    parts.push('### Story 進度（自動偵測）');
    for (const s of stories) {
      parts.push(`- **${s.story_id}** [${s.status}] ${s.title} (${s.complexity || '?'}, Epic: ${s.epic_id || '?'})`);
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
  const out = '## 任務相關上下文（Context Memory 自動偵測注入）\n\n' + parts.join('\n') + '\n---\n\n';
  // bwu-11: 本層修前完全無預算參數 —— 同時偵測到多個 Story ID 時 debt/decisions/stories
  // 各取 3 筆滿載可無上限膨脹。加具名字元上限自行截斷，不依賴全域降級兜底。
  return capChars(out, maxChars, '任務相關上下文');
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

function formatDocumentContext(docChunks, maxChars) {
  if (!docChunks || docChunks.length === 0) return '';
  const header = '## 相關專案文檔（Document RAG — CMI-5 自動注入）\n\n';
  let charCount = header.length;
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

    if (charCount + entry.length > maxChars) {
      const dropped = docChunks.length - parts.length;
      parts.push(`\n> ⚠ Document RAG 截斷：顯示 ${parts.length}/${docChunks.length} 個文檔片段，${dropped} 個被省略（預算 ${maxChars} 字元）\n`);
      break;
    }
    parts.push(entry);
    charCount += entry.length;
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
  const cwd = path.join(projectRoot, 'src/YourApp/Web');

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
  const cwd = path.join(projectRoot, 'src/YourApp/Web/ClientApp');

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
function formatLspContext(diagnostics, maxChars) {
  if (!diagnostics || diagnostics.length === 0) return '';

  const header = '## 編譯錯誤診斷（LSP Layer 9 自動注入）\n\n';
  let charCount = header.length;
  const parts = [];

  for (let i = 0; i < diagnostics.length; i++) {
    const d = diagnostics[i];
    const entry = `[${d.lang}] ${d.file}:${d.line} ${d.code} — ${d.message}\n`;
    if (charCount + entry.length > maxChars) {
      parts.push(`\n⚠ LSP 診斷截斷：顯示 ${i}/${diagnostics.length} 條\n`);
      break;
    }
    parts.push(entry);
    charCount += entry.length;
  }

  if (parts.length === 0) return '';
  return header + parts.join('') + '\n---\n\n';
}

/** 主協調函數：擷取 C# + TS 診斷並格式化（BR-002, BR-004, BR-007） */
function getLspDiagnostics(projectRoot, maxChars) {
  if (!LSP_ENABLED) return '';  // BR-007

  try {
    const csErrors = getCSharpDiagnostics(projectRoot);
    const tsErrors = getTsDiagnostics(projectRoot);
    const allDiagnostics = [...csErrors, ...tsErrors];

    if (allDiagnostics.length > 0) {
      process.stderr.write(`[RAG] LSP diagnostics: ${csErrors.length} C# errors + ${tsErrors.length} TS errors\n`);
    }

    return formatLspContext(allDiagnostics, maxChars);
  } catch (err) {
    process.stderr.write(`[RAG] LSP diagnostics error: ${err.message}\n`);
    return '';
  }
}

// ──────────────────────────────────────────────
// DLA-07: Layer 10 — Intentional Decisions 注入
// 注入 active IDD（critical 優先），防止 AI 違反故意設計
// ──────────────────────────────────────────────
function injectIntentionalDecisionsV13(db, userPrompt, fileHints, maxChars) {
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
    let used = output.length;

    for (const r of rows) {
      let forbidden = [];
      try { forbidden = JSON.parse(r.forbidden_changes || '[]'); } catch { /* ignore */ }
      const skills = (() => { try { return JSON.parse(r.related_skills || '[]'); } catch { return []; } })();

      const entry = `- **${r.idd_id}** (${r.idd_type})${r.criticality === 'critical' ? ' ⚠️ CRITICAL' : ''}: ${r.title}\n`
        + `  - Decision: ${r.decision}\n`
        + (forbidden.length ? `  - ❌ Forbidden: ${forbidden.join(' / ')}\n` : '')
        + (skills.length ? `  - Related Skills: ${skills.join(', ')}\n` : '')
        + `  - See: ${r.adr_path}\n`;

      if (used + entry.length > maxChars) break;
      output += entry;
      used += entry.length;
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
 * 優先讀 PHYCOOL_PROMPT_INTENT_KEYWORDS env var（JSON array）；
 * parse 失敗 → fallback DEFAULT_CODE_KEYWORDS + stderr 警告。
 * @returns {string[]}
 */
function loadIntentKeywords() {
  const raw = process.env.PHYCOOL_PROMPT_INTENT_KEYWORDS;
  if (!raw) return DEFAULT_CODE_KEYWORDS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(k => typeof k === 'string')) {
      if (parsed.length === 0) {
        process.stderr.write('[RAG] PHYCOOL_PROMPT_INTENT_KEYWORDS is empty array — all prompts will be treated as discussion\n');
      }
      return parsed;
    }
    process.stderr.write('[RAG] PHYCOOL_PROMPT_INTENT_KEYWORDS invalid array — fallback default\n');
    return DEFAULT_CODE_KEYWORDS;
  } catch {
    process.stderr.write('[RAG] PHYCOOL_PROMPT_INTENT_KEYWORDS JSON parse failed — fallback default\n');
    return DEFAULT_CODE_KEYWORDS;
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// ECC D5: Layer 12 — Instinct 注入（動態湧現 · 採納分數過濾 · ADR-ECC-LEARNING-001 v1.4.0）
// approved instinct 依 adoption_score + 視窗 project_type 採納階梯過濾後注入。
// 階梯: score>=4 全視窗 / score=3 同 project_type / score 1-2 同 project_type / source_session 一律。
// 窗格 project_type: env PHYCOOL_PROJECT_TYPE → session observations_queue dominant → null(皆無只注入 score>=4 安全)。
// ──────────────────────────────────────────────
function injectInstinctsLayer12(db, sessionId, maxChars) {
  if (!INSTINCT_INJECT || maxChars <= 0) return '';
  try {
    const tableExists = db.prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='instincts'"
    ).get().c;
    if (!tableExists) return '';

    // 窗格 project_type: env 優先 → session observations dominant → null
    let pt = process.env.PHYCOOL_PROJECT_TYPE;
    if (!['pcpt-business', 'env-tooling', 'workflow'].includes(pt)) pt = null;
    if (!pt && sessionId) {
      try {
        const r = db.prepare(
          "SELECT project_type FROM observations_queue WHERE session_id = ? AND project_type IS NOT NULL GROUP BY project_type ORDER BY COUNT(*) DESC LIMIT 1"
        ).get(sessionId);
        if (r && r.project_type) pt = r.project_type;
      } catch { /* observations_queue 可能無 project_type 欄(pre-D5)— silent */ }
    }

    const nowTs = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
    // pt=null 時 project_type=? 比對為 NULL(不匹配)→ 只剩 score>=4 + source_session 安全 fallback
    const rows = db.prepare(`
      SELECT trigger, action, adoption_score
      FROM instincts
      WHERE verifier_status = 'approved' AND (decay_at IS NULL OR decay_at > ?)
        AND ( adoption_score >= 4
           OR (adoption_score = 3 AND project_type = ?)
           OR (adoption_score BETWEEN 1 AND 2 AND project_type = ?)
           OR source_session_id = ? )
      ORDER BY adoption_score DESC, confidence DESC LIMIT 8
    `).all(nowTs, pt, pt, sessionId || '');
    if (!rows.length) return '';

    let output = INSTINCT_HEADER;
    let used = output.length;
    for (const r of rows) {
      const entry = formatInstinctEntry(r);
      if (used + entry.length > maxChars) break;
      output += entry;
      used += entry.length;
    }
    return output;
  } catch { return ''; }  // fail-open — 絕不阻塞提問
}

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
    const intentEnabled = process.env.PHYCOOL_PROMPT_INTENT_ENABLED === 'true';
    const intent = intentEnabled
      ? (detectCodeIntent(userPrompt, loadIntentKeywords()) ? 'code' : 'discussion')
      : 'code';  // flag=false → baseline 全量注入

    // ── Session 記憶注入（CMI-1 AC-2 + CMI-5 對話問題摘要）──
    let sessions = [];
    let sessionContext = '';
    if (!isPipeline) {
      sessions = getRecentSessions(db);
      const userQuestions = getRecentUserQuestions(db);
      sessionContext = formatSessionContext(sessions, userQuestions, SESSION_CHARS);
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
        // G14 P2: PPR_ENABLED 時用 Personalized PageRank(seeds=vec 命中符號)取代靜態 centrality
        // fail-safe: 任何失敗 fallback null → calculateSfinal 用靜態 centrality。注入量不增(只 rerank,formatContext 仍 CODE_RAG_CHARS)
        let pprScores = null;
        if (PPR_ENABLED) {
          const mod = getRepomapPpr();
          if (mod) {
            try {
              const deps = db.prepare(`SELECT source_symbol, target_symbol, relation_type FROM symbol_dependencies`).all();
              const symbolMeta = mod.buildSymbolMeta(db);
              const seeds = topSymbols.map(s => s.full_name).filter(Boolean);
              pprScores = mod.computePersonalizedPageRank(deps, seeds, symbolMeta);
            } catch (e) {
              process.stderr.write(`[RAG] PPR compute fail (fallback centrality): ${e.message}\n`);
              pprScores = null;
            }
          }
        }
        const scored = calculateSfinal(expanded, pprScores);
        codeContext = formatContext(scored, CODE_RAG_CHARS);
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
        taskContext = formatTaskAwareContext(debt, decisions, stories, TASK_AWARE_CHARS);
      } catch (taskErr) {
        process.stderr.write(`[RAG] Task-aware query skipped: ${taskErr.message}\n`);
      }
    }

    // ── Document RAG 注入（CMI-5 新增，FTS5-only 保持低延遲）──
    let docContext = '';
    let docChunkCount = 0;
    try {
      const docChunks = searchDocumentsByFts(db, userPrompt, 6);
      docContext = formatDocumentContext(docChunks, DOC_RAG_CHARS);
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
          // bwu-11: 本層修前為直接字串組裝且無任何上限，加具名字元上限自行截斷
          pipelineContext = capChars(
            `## Active Pipeline（自動偵測）\n\n` +
            `- **${activePipeline.pipeline_id}** (${activePipeline.pipeline_type}) — ${activePipeline.status} Step ${activePipeline.current_step}/${activePipeline.total_steps}${stale}\n` +
            `- Last updated: ${elapsed} min ago\n` +
            (stale ? `- 子視窗可能已 crash，請先確認狀態再繼續\n` : '') +
            `\n---\n\n`,
            PIPELINE_CHARS, 'Active Pipeline');
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
            // bwu-11: 本層修前為直接字串組裝且無任何上限，加具名字元上限自行截斷
            skillContext = capChars(
              `## 推薦 Skill（自動關鍵字匹配）\n\n` +
              `以下 Skill 與本次提問相關，建議先 Read SKILL.md 再開始工作：\n` +
              uniqueSkills.map(s => `- \`/phycool-${s}\` → \`.claude/skills/${s}/SKILL.md\``).join('\n') +
              `\n\n---\n\n`,
              SKILL_REC_CHARS, '推薦 Skill');
          }
        }
      } catch { /* skill matching is best-effort */ }
    }

    // ── Layer 10: IDD 注入（DLA-07）——intent=code 時執行（BR-CTR-P2-1）──
    // bwu-11: 原 CR-H1 的「動態扣減剩餘 budget」已移除，改用靜態字元預算。
    // 理由：分層預算總和已 ≤ MAX_INJECT_CHARS（見檔頭驗算），動態扣減不再必要；且 IDD 是
    // AC2 的必留層（含 CRITICAL 等級禁令），動態扣減會在前面幾層吃緊時把它靜默壓成 0 —— 那
    // 正是本卡要根除的「最高價值脈絡無聲消失」。超額改由全域降級安全網處理，且 IDD 不在
    // 丟棄候選內。
    let iddContext = '';
    let iddCount = 0;
    if (intent === 'code') {
      try {
        // Extract file hints from prompt (patterns like src/..., .ts, .tsx, .cs)
        const fileHints = userPrompt.match(/[\w/.]+\.(tsx?|cs|js|ts)/g) || [];
        iddContext = injectIntentionalDecisionsV13(db, userPrompt, fileHints, IDD_CHARS);
        if (iddContext) {
          const iddMatches = iddContext.match(/IDD-[A-Z]+-\d+/g);
          iddCount = iddMatches ? new Set(iddMatches).size : 0;
        }
      } catch { /* silent — 絕不阻塞提問 */ }
    }

    // ── Layer 12: ECC Instinct 注入（動態湧現 · 採納分數過濾 · ADR D5）——intent=code 時執行 ──
    let instinctContext = '';
    let instinctCount = 0;
    if (intent === 'code') {
      try {
        // bwu-11: 同 Layer 10，動態扣減改為靜態字元預算（總和已 ≤ MAX_INJECT_CHARS）
        instinctContext = injectInstinctsLayer12(db, sessionId, INSTINCT_CHARS);
        if (instinctContext) instinctCount = (instinctContext.match(/^- \(score/gm) || []).length;
        // 2026-05-26 湧現迴路顯示移至輸出處 systemMessage(見 main 末 ragOut)— exit-0 的 stderr 不顯示給使用者(claude-code-guide 權威確認),改用 UserPromptSubmit JSON systemMessage 欄位
      } catch { /* silent — 絕不阻塞提問 */ }
    }

    // ── Layer 9: LSP 診斷注入（ecc-06）——intent=code 時執行（BR-CTR-P2-1）──
    let lspContext = '';
    let lspDiagCount = 0;
    if (intent === 'code') {
      try {
        lspContext = getLspDiagnostics(PROJECT_ROOT, LSP_DIAG_CHARS);
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
        // 字元 budget cascade（AC-5 / DoD）：5→3→1（bwu-11: 原以 token 計，改字元同量綱）
        if (violationContext.length > VIOLATION_CHAR_HARD_CAP) {
          violations = getRecentHotViolations(db, { topN: 3 });
          violationContext = formatViolationLayer(violations);
          if (violationContext.length > VIOLATION_CHAR_HARD_CAP) {
            violations = getRecentHotViolations(db, { topN: 1 });
            violationContext = formatViolationLayer(violations);
          }
        }
        violationCount = violations.length;

        // V2-07-FIX 階梯 banner(3d ≥3 WARN / 7d ≥5 BLOCK)
        try {
          const { aggregateAndClassify, formatBanner } = require('../../.context-db/scripts/check-violation-recurrence.cjs');
          const recurrence = aggregateAndClassify(db);
          const banner = formatBanner(recurrence);
          // Append within budget cap (×1.2 因 banner 視為 Layer 11 延伸,但仍封頂)
          if (banner && (violationContext + banner).length <= VIOLATION_CHAR_HARD_CAP * 1.2) {
            violationContext += banner;
          } else if (banner) {
            const compactBanner = formatBanner(recurrence, { compact: true });
            if ((violationContext + compactBanner).length <= VIOLATION_CHAR_HARD_CAP * 1.2) {
              violationContext += compactBanner;
            }
          }
        } catch { /* silent — banner is enhancement, not critical */ }
      } catch (err) {
        process.stderr.write(`[RAG] Violation layer skipped: ${err.message}\n`);
      }
    }

    // ── god_nodes staleness advisory (td-god-nodes-table-rebuild T4.2, observability only) ──
    let godNodesStalenessNote = '';
    try {
      const latestGn = db.prepare(`SELECT MAX(computed_at) AS ts FROM god_nodes`).get();
      if (latestGn && latestGn.ts) {
        // Preserve +08:00 offset (don't replace with 'Z') so Taiwan time is parsed correctly.
        const gnTsMs = new Date(latestGn.ts.replace(' ', 'T')).getTime();
        if ((Date.now() - gnTsMs) > 7 * 24 * 60 * 60 * 1000) {
          godNodesStalenessNote = `\n⚠ god_nodes data may be stale (last computed ${latestGn.ts.slice(0, 10)}). Run: node .context-db/scripts/compute-centrality.cjs --force\n`;
        }
      }
    } catch { /* silent — advisory only, must not block prompt */ }

    // ── 合併輸出：全域字元封頂 + 分層降級（bwu-11）──
    // 修前此處是 11 個變數直接串接後零長度檢查即輸出；逾 10,000 字元時 CLI 會把整份存檔並
    // 換成 preview + 檔案路徑 —— 最高價值的紀律警示與故意設計禁令可能就躺在沒人會開的檔案裡。
    const layers = {
      session: sessionContext, violation: violationContext, task: taskContext,
      idd: iddContext, instinct: instinctContext, pipeline: pipelineContext,
      skill: skillContext, lsp: lspContext, code: codeContext,
      doc: docContext, godNodes: godNodesStalenessNote,
    };
    let degraded = degradeInjectionLayers(layers, MAX_INJECT_CHARS);
    if (!degraded.text) return;

    let degradeNotice = '';
    if (degraded.dropped.length > 0 || degraded.overflow) {
      // 告警行本身也佔額度 → 以扣除保留額後的上限重跑，確保加註後總長仍 ≤ MAX_INJECT_CHARS
      degraded = degradeInjectionLayers(layers, MAX_INJECT_CHARS - DEGRADE_NOTICE_RESERVE);
      degradeNotice = formatDegradeNotice(degraded, MAX_INJECT_CHARS);
      if (degradeNotice.length > DEGRADE_NOTICE_RESERVE) {
        degradeNotice = degradeNotice.slice(0, DEGRADE_NOTICE_RESERVE - 1) + '\n';
      }
    }
    // AC3 管道 (a)：告警置頂，讓 Claude 自己知道收到的是降級版
    const combinedContext = degradeNotice + degraded.text;

    const totalChars = combinedContext.length;
    const intentTag = ` intent=${intentEnabled ? intent : 'off'}`;
    const taskItems = taskContext ? ' + task-aware' : '';
    const violationTag = violationContext ? ` + ${violationCount} violations` : '';
    const iddTag = iddContext ? ` + ${iddCount} idd` : '';
    const instinctTag = instinctContext ? ` + ${instinctCount} instincts` : '';
    const pipelineTag = pipelineContext ? ' + pipeline' : '';
    const skillTag = skillContext ? ' + skills' : '';
    const lspTag = lspContext ? ` + ${lspDiagCount} lsp-diag` : '';
    process.stderr.write(`[RAG] Injected:${intentTag} ${sessions.length} sessions${violationTag}${taskItems}${iddTag}${instinctTag}${pipelineTag}${skillTag}${lspTag} + ${symbolCount} symbols + ${docChunkCount} doc chunks (${totalChars}/${MAX_INJECT_CHARS} chars, ${estimateTokens(combinedContext)} est. tokens)\n`);
    // AC3 管道 (c)：stderr —— exit 0 時只進 debug log，供 `claude --debug` 診斷用
    if (degradeNotice) {
      const droppedTag = degraded.dropped.map(d => `${d.layer}(${d.chars})`).join('/') || 'none';
      process.stderr.write(`[RAG] Degraded: dropped=${droppedTag} → ${totalChars}/${MAX_INJECT_CHARS} chars${degraded.overflow ? ' (protected layers alone exceed cap)' : ''}\n`);
    }
    // BR-CTR-P2-1: intent=discussion 時標註 skip 的層
    if (intentEnabled && intent === 'discussion') {
      process.stderr.write(`[RAG] intent=discussion — skip code/lsp/idd\n`);
    }
    // 2026-05-26 湧現迴路顯示給使用者: INSTINCT_SHOW_CONTENT 開啟時用 systemMessage(UserPromptSubmit 唯一對使用者顯示的欄位 · claude-code-guide 權威確認)。emoji 🧠 取代黃色(Claude Code strip ANSI,顏色機制上不支援)
    // 2026-07-29 (bwu-5 CR / TD-RAG-USERPROMPT-INJECT-FORMAT-INVALID): UserPromptSubmit
    // 的 additionalContext 必須巢狀於 hookSpecificOutput,裸 top-level 形式會被 CLI 靜默丟棄
    // (實證:同一 turn 內裸形式的 10609 bytes 全數未達 context,巢狀形式的 bmad-slash-story-inject
    // 輸出則完整送達)。systemMessage 為所有 hook 通用的頂層欄位,維持原位不動。
    const ragOut = {
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: combinedContext },
    };
    // bwu-11: systemMessage 由「直接賦值」改為「多來源附加合併」。修前 ECC instinct 是唯一
    // 寫入者，降級告警若沿用直接賦值會吃掉 instinct 顯示。兩者皆須出現。
    // instinct 這段刻意仍以 instinctContext 為據 —— 即使該層已被降級丟出 additionalContext，
    // systemMessage 是使用者顯示管道、不佔注入額度，沒有理由連帶消失。
    const systemMessages = [];
    if (INSTINCT_SHOW_CONTENT && instinctContext) {
      const instLines = instinctContext.split('\n').filter((l) => l.startsWith('- (score')).join('\n');
      if (instLines) systemMessages.push('🧠 ECC 湧現迴路注入（' + instinctCount + ' 條機器直覺 · 供參考）:\n' + instLines);
    }
    // AC3 管道 (b)：systemMessage 是 UserPromptSubmit 唯一對使用者可見的欄位（tech_entries id=1295）
    if (degradeNotice) systemMessages.push(degradeNotice.replace(/^>\s*/gm, '').trim());
    if (systemMessages.length > 0) ragOut.systemMessage = systemMessages.join('\n\n');
    process.stdout.write(JSON.stringify(ragOut));
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
