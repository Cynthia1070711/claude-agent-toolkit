// ============================================================
// PCPT Context Memory DB — Conversation 歷史匯入腳本
// CMI-3 AC-2: 直接掃描 JSONL transcript 檔案匯入對話記錄
// ============================================================
// 執行方式:
//   node .context-db/scripts/import-conversations.js            (incremental)
//   node .context-db/scripts/import-conversations.js --full     (全量清除重建)
//   node .context-db/scripts/import-conversations.js --incremental
// 策略:
//   直接掃描專案目錄下所有 .jsonl 檔案（不依賴 sessions-index.json）
//   JSONL 檔名 = 內部 sessionId（驗證一致）
// 冪等設計:
//   sessions: INSERT OR REPLACE（PK = session_id）
//   turns:    DELETE + INSERT（按 session_id 批次清除後重建）
// 效能目標: 735 JSONL / 800MB，5 分鐘內完成
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { syncEmbedding, buildInputText } from './embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// Claude Code 專案目錄（直接掃描 JSONL 檔案）
const CLAUDE_PROJECTS_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude', 'projects'
);
const PROJECT_FOLDER = 'C--Users-Alan-Desktop-Projects-pcpt-PCPT-MVP-Antigravity-';
const TRANSCRIPTS_DIR = path.join(CLAUDE_PROJECTS_DIR, PROJECT_FOLDER);

// sessions-index.json 作為可選的 summary 補充來源
const SESSIONS_INDEX_PATH = path.join(TRANSCRIPTS_DIR, 'sessions-index.json');

// 隱私過濾：不儲存含此關鍵字的內容
const PRIVACY_BLOCKED_PATTERNS = [
  'appsettings', '.env', 'secrets', 'password', 'api_key', 'apikey',
  'connectionstring', 'ConnectionStrings',
];

// content 截斷上限
const CONTENT_MAX_CHARS = 10000;
const PREVIEW_MAX_CHARS = 300;

// 記錄 file_path 的工具白名單
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']);

// ──────────────────────────────────────────────
// 工具函式
// ──────────────────────────────────────────────

function parseMode() {
  const args = process.argv.slice(2);
  if (args.includes('--full')) return 'full';
  return 'incremental';
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function isPrivateSensitive(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PRIVACY_BLOCKED_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function extractAssistantText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n')
    .trim();
}

function extractToolsUsed(content) {
  if (!Array.isArray(content)) return null;
  const tools = content
    .filter(block => block.type === 'tool_use' && block.name)
    .map(block => block.name);
  return tools.length > 0 ? JSON.stringify([...new Set(tools)]) : null;
}

function extractFilesTouched(content) {
  if (!Array.isArray(content)) return null;
  const files = [];
  for (const block of content) {
    if (block.type === 'tool_use' && FILE_TOOLS.has(block.name) && block.input) {
      const fp = block.input.file_path || block.input.path || block.input.pattern;
      if (fp && typeof fp === 'string') files.push(fp);
    }
  }
  return files.length > 0 ? JSON.stringify([...new Set(files)]) : null;
}

function truncate(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// ──────────────────────────────────────────────
// sessions-index.json 補充資料載入（可選）
// ──────────────────────────────────────────────
function loadSessionsIndex() {
  try {
    if (!fs.existsSync(SESSIONS_INDEX_PATH)) return new Map();
    const raw = fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8');
    const data = JSON.parse(raw);
    const entries = data.entries || [];
    const map = new Map();
    for (const e of entries) {
      if (e.sessionId) map.set(e.sessionId, e);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ──────────────────────────────────────────────
// JSONL 串流解析器（AC-2）
// 同時提取 session 元資料 + turns
// readline 逐行讀取，避免大檔案 OOM
// ──────────────────────────────────────────────
async function parseJsonlFile(jsonlPath) {
  const turns = [];
  const meta = {
    sessionId: null,
    gitBranch: null,
    cwd: null,
    firstPromptTs: null,
    lastTs: null,
    firstUserText: null,
  };
  let turnIndex = 0;

  if (!fs.existsSync(jsonlPath)) return { meta, turns };

  const fileStream = fs.createReadStream(jsonlPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }

    // 跳過 meta 記錄（queue-operation 等）
    if (record.type === 'queue-operation' || record.isMeta) continue;

    // 提取 session 元資料（從第一筆含 sessionId 的記錄）
    if (!meta.sessionId && record.sessionId) {
      meta.sessionId = record.sessionId;
      meta.gitBranch = record.gitBranch || null;
      meta.cwd = record.cwd || null;
    }

    // 追蹤最後時間戳
    if (record.timestamp) meta.lastTs = record.timestamp;

    if (record.type === 'user') {
      const msgContent = record.message?.content;
      let text = '';
      if (typeof msgContent === 'string') {
        text = msgContent;
      } else if (Array.isArray(msgContent)) {
        text = msgContent
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('\n')
          .trim();
      }
      if (!text) continue;

      // 記錄第一個 user 提示（session 元資料）
      if (!meta.firstPromptTs) {
        meta.firstPromptTs = record.timestamp || null;
        meta.firstUserText = truncate(text, 500);
      }

      const truncated = truncate(text, CONTENT_MAX_CHARS);
      turns.push({
        turn_index: turnIndex++,
        role: 'user',
        content: truncated,
        content_preview: truncate(text, PREVIEW_MAX_CHARS),
        timestamp: record.timestamp || new Date().toISOString(),
        token_estimate: estimateTokens(truncated),
        tools_used: null,
        files_touched: null,
      });

    } else if (record.type === 'assistant') {
      const msgContent = record.message?.content;
      const text = extractAssistantText(msgContent);
      if (!text) continue;

      if (isPrivateSensitive(text)) continue;

      const truncated = truncate(text, CONTENT_MAX_CHARS);
      const toolsUsed = extractToolsUsed(msgContent);
      const filesTouched = extractFilesTouched(msgContent);

      turns.push({
        turn_index: turnIndex++,
        role: 'assistant',
        content: truncated,
        content_preview: truncate(text, PREVIEW_MAX_CHARS),
        timestamp: record.timestamp || new Date().toISOString(),
        token_estimate: estimateTokens(truncated),
        tools_used: toolsUsed,
        files_touched: filesTouched,
      });
    }
  }

  return { meta, turns };
}

// ──────────────────────────────────────────────
// incremental 模式：取已處理 session IDs
// ──────────────────────────────────────────────
function getProcessedSessionIds(db) {
  try {
    const rows = db.prepare('SELECT session_id FROM conversation_sessions').all();
    return new Set(rows.map(r => r.session_id));
  } catch {
    return new Set();
  }
}

// ──────────────────────────────────────────────
// 主函式
// ──────────────────────────────────────────────
async function main() {
  const mode = parseMode();
  console.log(`\n📂 PCPT Conversation Import (mode: ${mode})`);
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   Scan dir: ${TRANSCRIPTS_DIR}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ DB not found. Run: node .context-db/scripts/init-db.js');
    process.exit(1);
  }
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    console.error(`❌ Transcripts dir not found: ${TRANSCRIPTS_DIR}`);
    process.exit(1);
  }

  // 掃描所有 JSONL 檔案
  const allFiles = fs.readdirSync(TRANSCRIPTS_DIR);
  const jsonlFiles = allFiles
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ filename: f, fullPath: path.join(TRANSCRIPTS_DIR, f) }));

  console.log(`   Found ${jsonlFiles.length} JSONL files`);

  // 載入 sessions-index.json 作為補充 summary 來源
  const sessionsIndex = loadSessionsIndex();
  console.log(`   Sessions-index supplementary entries: ${sessionsIndex.size}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  if (mode === 'full') {
    console.log('   ⚠️  Full mode: clearing existing conversation data...');
    db.exec('DELETE FROM conversation_turns');
    db.exec('DELETE FROM conversation_sessions');
  }

  const processedIds = mode === 'incremental' ? getProcessedSessionIds(db) : new Set();

  const upsertSession = db.prepare(`
    INSERT OR REPLACE INTO conversation_sessions
      (session_id, project_path, started_at, ended_at, agent_id, git_branch,
       first_prompt, summary, total_turns, transcript_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteTurns = db.prepare('DELETE FROM conversation_turns WHERE session_id = ?');

  const insertTurn = db.prepare(`
    INSERT INTO conversation_turns
      (session_id, turn_index, role, content, content_preview,
       timestamp, token_estimate, tools_used, files_touched)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let sessionsImported = 0;
  let sessionsSkipped = 0;
  let turnsImported = 0;
  let embeddingsQueued = 0;
  let embeddingsFailed = 0;
  let errorCount = 0;
  const embeddingPromises = [];
  const startTime = Date.now();

  for (const { filename, fullPath } of jsonlFiles) {
    // sessionId = filename without .jsonl extension
    const sessionId = filename.replace('.jsonl', '');

    // incremental: 跳過已存在的 session
    if (processedIds.has(sessionId)) {
      sessionsSkipped++;
      continue;
    }

    try {
      const { meta, turns } = await parseJsonlFile(fullPath);

      // 若 JSONL 內部 sessionId 存在且與檔名不符，優先使用內部值
      const effectiveSessionId = meta.sessionId || sessionId;

      // incremental 補漏：若內部 sessionId 已在 DB 中，跳過
      if (meta.sessionId && meta.sessionId !== sessionId && processedIds.has(meta.sessionId)) {
        sessionsSkipped++;
        continue;
      }

      // 補充 sessions-index.json 的 summary（若有）
      const indexEntry = sessionsIndex.get(effectiveSessionId) || null;
      const summary = indexEntry?.summary
        ? truncate(indexEntry.summary, 2000)
        : null;

      // 寫入 session 元資料
      upsertSession.run(
        effectiveSessionId,
        meta.cwd || null,
        meta.firstPromptTs || new Date().toISOString(),
        meta.lastTs || null,
        null,
        meta.gitBranch || null,
        meta.firstUserText || null,
        summary,
        turns.length,
        fullPath
      );

      // 清除舊 turns + 批次寫入
      deleteTurns.run(effectiveSessionId);

      const insertMany = db.transaction((sessionTurns) => {
        for (const t of sessionTurns) {
          insertTurn.run(
            effectiveSessionId,
            t.turn_index,
            t.role,
            t.content,
            t.content_preview,
            t.timestamp,
            t.token_estimate,
            t.tools_used,
            t.files_touched
          );
        }
      });
      insertMany(turns);
      turnsImported += turns.length;

      // CMI-10: embedding sync（收集 Promise，db.close 前統一 await）
      const embText = buildInputText('conversations', {
        first_prompt: meta.firstUserText || '',
        summary: summary || '',
        topics: '',
      });
      if (embText.length > 0) {
        embeddingPromises.push(
          syncEmbedding(db, 'conversations', effectiveSessionId, embText)
            .then(() => { embeddingsQueued++; })
            .catch(() => { embeddingsFailed++; })
        );
      }

      sessionsImported++;

      if (sessionsImported % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   Progress: ${sessionsImported} sessions, ${turnsImported} turns (${elapsed}s)`);
      }

    } catch (err) {
      errorCount++;
      process.stderr.write(`   ⚠️  Error: ${filename}: ${err.message}\n`);
      if (errorCount > 20) {
        console.error('   ❌ Too many errors, aborting.');
        break;
      }
    }
  }

  // 等待所有 embedding Promise 完成後再關閉 DB（CRITICAL-1 fix）
  if (embeddingPromises.length > 0) {
    console.log(`   ⏳ 等待 ${embeddingPromises.length} 個 embedding 寫入完成...`);
    await Promise.allSettled(embeddingPromises);
  }

  db.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Import complete in ${elapsed}s`);
  console.log(`   Sessions imported: ${sessionsImported}`);
  console.log(`   Sessions skipped (incremental): ${sessionsSkipped}`);
  console.log(`   Turns imported: ${turnsImported}`);
  if (errorCount > 0) {
    console.log(`   ⚠️  Errors: ${errorCount}`);
  }
  console.log(`   Embeddings: queued=${embeddingsQueued}, failed=${embeddingsFailed}`);
  if (embeddingsFailed > 0) {
    console.log(`   💡 可用 backfill-embeddings.js --incremental --table conversations 補全`);
  }
}

main().catch((err) => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
