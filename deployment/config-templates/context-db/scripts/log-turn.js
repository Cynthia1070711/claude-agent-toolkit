// ============================================================
// PCPT Context Memory DB — 即時輪次記錄腳本
// CMI-3 AC-3: 輕量化 Hook 腳本，記錄 user/assistant turn
// ============================================================
// 執行方式: node .context-db/scripts/log-turn.js --role user|assistant
// 從 stdin 讀取 Hook 事件資料
// 目標延遲: < 50ms（user turn），< 100ms（assistant turn）
// 降級策略: DB 不存在 → 靜默退出 (exit 0)
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

const CONTENT_MAX_CHARS = 10000;
const PREVIEW_MAX_CHARS = 300;

// ──────────────────────────────────────────────
// stdin 讀取（async + 超時保護，重用 log-session.js pattern）
// ──────────────────────────────────────────────
function readStdinAsync(timeoutMs = 1000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve({}); return; }
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve({});
    }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try { resolve(data.trim() ? JSON.parse(data.trim()) : {}); }
      catch { resolve({}); }
    });
    process.stdin.on('error', () => { clearTimeout(timer); resolve({}); });
    process.stdin.resume();
  });
}

/** 估算 token 數（4 字元/token）*/
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/** 截斷文字 */
function truncate(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// ──────────────────────────────────────────────
// 主函式
// ──────────────────────────────────────────────
async function logTurn() {
  // 降級策略：DB 不存在 → 靜默退出
  if (!fs.existsSync(DB_PATH)) {
    process.stderr.write('[log-turn] DB not found, skipping.\n');
    return;
  }

  // 解析 CLI 參數取得 role
  const args = process.argv.slice(2);
  const roleArg = args.find(a => a === '--role');
  const roleIdx = args.indexOf('--role');
  const role = roleIdx >= 0 && args[roleIdx + 1] ? args[roleIdx + 1] : null;

  // 讀取 stdin
  const hookInput = await readStdinAsync(1000);

  // 從 stdin 提取必要欄位
  const sessionId = hookInput.session_id || hookInput.sessionId || null;
  if (!sessionId) {
    process.stderr.write('[log-turn] No session_id in stdin, skipping.\n');
    return;
  }

  // 根據 role 決定記錄哪個欄位的內容
  let content = '';
  let effectiveRole = role;

  if (!effectiveRole) {
    // 自動推斷：有 prompt → user，有 last_assistant_message → assistant
    if (hookInput.prompt) {
      effectiveRole = 'user';
      content = hookInput.prompt;
    } else if (hookInput.last_assistant_message) {
      effectiveRole = 'assistant';
      content = hookInput.last_assistant_message;
    } else {
      process.stderr.write('[log-turn] Cannot determine role, skipping.\n');
      return;
    }
  } else {
    content = effectiveRole === 'user'
      ? (hookInput.prompt || '')
      : (hookInput.last_assistant_message || '');
  }

  if (!content || !content.trim()) {
    process.stderr.write(`[log-turn] Empty content for ${effectiveRole}, skipping.\n`);
    return;
  }

  const truncatedContent = truncate(content, CONTENT_MAX_CHARS);
  const preview = truncate(content, PREVIEW_MAX_CHARS);
  const timestamp = getTaiwanTimestamp();
  const tokenEstimate = estimateTokens(truncatedContent);

  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // UPSERT conversation_sessions（session 不存在時建立）
    const existingSession = db.prepare(
      'SELECT session_id FROM conversation_sessions WHERE session_id = ?'
    ).get(sessionId);

    if (!existingSession) {
      db.prepare(`
        INSERT OR IGNORE INTO conversation_sessions
          (session_id, started_at, first_prompt)
        VALUES (?, ?, ?)
      `).run(
        sessionId,
        timestamp,
        effectiveRole === 'user' ? truncate(content, 500) : null
      );
      process.stderr.write(`[log-turn] Created new session: ${sessionId}\n`);
    }

    // 計算 turn_index（目前此 session 已有多少 turns）
    const countRow = db.prepare(
      'SELECT COUNT(*) AS cnt FROM conversation_turns WHERE session_id = ?'
    ).get(sessionId);
    const turnIndex = countRow ? countRow.cnt : 0;

    // INSERT turn
    db.prepare(`
      INSERT INTO conversation_turns
        (session_id, turn_index, role, content, content_preview,
         timestamp, token_estimate, tools_used, files_touched)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, turnIndex, effectiveRole,
      truncatedContent, preview,
      timestamp, tokenEstimate,
      null, null  // tools_used / files_touched 由 Stop Hook 事後處理
    );

    // 更新 session 輪次計數
    if (effectiveRole === 'user') {
      db.prepare(`
        UPDATE conversation_sessions
        SET total_turns = total_turns + 1,
            user_turns = user_turns + 1
        WHERE session_id = ?
      `).run(sessionId);
    } else {
      db.prepare(`
        UPDATE conversation_sessions
        SET total_turns = total_turns + 1
        WHERE session_id = ?
      `).run(sessionId);
    }

    process.stderr.write(`[log-turn] Logged ${effectiveRole} turn (idx=${turnIndex}) for session ${sessionId.slice(0, 8)}...\n`);

  } catch (err) {
    process.stderr.write(`[log-turn] Error: ${err.message}\n`);
  } finally {
    try { if (db) db.close(); } catch { /* ignore */ }
  }
}

// 僅在直接執行時觸發
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  logTurn().catch(() => {});
}

export { logTurn };
