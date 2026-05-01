// ============================================================
// PCPT Context Memory DB — Session 自動記錄腳本
// CMI-1: Stop / SessionEnd / PreCompact Hook 觸發，寫入 session 摘要至 DB
// ============================================================
// 執行方式: node .context-db/scripts/log-session.js
// 零 Token：純 Node.js 腳本，不使用 Claude API
// 觸發時機:
//   - Stop Hook: 每次 Claude 回應完成後（settings.json）
//   - SessionEnd Hook: 對話結束時（settings.json）
//   - PreCompact Hook: context compaction 前（settings.local.json）
// 策略:
//   - Stop: 2 分鐘防重複，UPDATE 最近的 auto 記錄（不新增）
//   - SessionEnd: 無條件寫入（最後一次機會，跳過防重複）
//   - PreCompact: 與 Stop 共用防重複邏輯
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';
import { syncEmbedding, buildInputText } from './embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const YAML_PATH = path.join(PROJECT_ROOT, 'docs', 'implementation-artifacts', 'sprint-status.yaml');
const TRACKING_DIR = path.join(PROJECT_ROOT, 'docs', 'tracking', 'active');

// CMI-3: sessions-index.json 路徑（用於 SessionEnd sync summary）
const CLAUDE_PROJECTS_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude', 'projects'
);
const PROJECT_FOLDER = 'C--Users-Alan-Desktop-Projects-pcpt-PCPT-MVP-Antigravity-';
const SESSIONS_INDEX_PATH = path.join(CLAUDE_PROJECTS_DIR, PROJECT_FOLDER, 'sessions-index.json');

const DEDUP_MINUTES = 2;
const CONTENT_MAX_CHARS = 10000;
const PREVIEW_MAX_CHARS = 300;

// ──────────────────────────────────────────────
// 從 stdin 讀取 Hook 事件（async + 超時保護）
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

// ──────────────────────────────────────────────
// 從 sprint-status.yaml 提取 in-progress / review Story
// ──────────────────────────────────────────────
function getActiveStories() {
  try {
    if (!fs.existsSync(YAML_PATH)) return [];
    const content = fs.readFileSync(YAML_PATH, 'utf8');
    const matches = content.matchAll(/^\s+([\w-]+):\s*(in-progress|review)/gm);
    return Array.from(matches, m => ({ id: m[1], status: m[2] }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// 從 tracking files 提取最新 log entry
// ──────────────────────────────────────────────
function getRecentTrackingLogs(limit = 5) {
  try {
    if (!fs.existsSync(TRACKING_DIR)) return [];
    const files = fs.readdirSync(TRACKING_DIR)
      .filter(f => f.endsWith('.track.md'))
      .slice(0, limit);

    const logs = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(TRACKING_DIR, file), 'utf8');
      const logLines = content.split('\n').filter(l => l.startsWith('- ['));
      if (logLines.length > 0) {
        const lastLog = logLines[logLines.length - 1];
        logs.push({ file: file.replace('.track.md', ''), log: lastLog.trim() });
      }
    }
    return logs;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// CMI-5: 從 assistant message 提取結構化摘要
// 零 Token — 純 regex，不使用 LLM
// ──────────────────────────────────────────────
function extractFromMessage(message) {
  if (!message) return {};

  // 1. 關聯 Story ID（mqv-3, dvc-05, cmi-1, qgr-a2, td-32a, qgr-ba-12 等）
  // lookahead 確保 prefix 後至少包含一個數字，排除 cmi-summary 等純字母後綴
  const storyIds = [...new Set(
    (message.match(/\b(mqv|dvc|cmi|qgr|td|bf|cat|fra|trs|opt|arch|uds)-(?=[\w-]*\d)[\w-]+/gi) || [])
      .map(s => s.toLowerCase())
  )];

  // 2. 檔案操作
  const filesCreated = [...new Set(
    (message.match(/(?:建立|新增|Created).*?[`"]([^`"]+\.\w+)[`"]/g) || [])
      .map(m => { const f = m.match(/[`"]([^`"]+\.\w+)[`"]/); return f ? f[1] : null; })
      .filter(Boolean)
  )];
  const filesModified = [...new Set(
    (message.match(/(?:修改|更新|updated|Edit).*?[`"]([^`"]+\.\w+)[`"]/g) || [])
      .map(m => { const f = m.match(/[`"]([^`"]+\.\w+)[`"]/); return f ? f[1] : null; })
      .filter(Boolean)
  )];

  // 3. 關鍵動作（取唯一值）
  const actionMatches = message.match(/已(?:建立|修改|刪除|修復|完成|更新|寫入|新增|移除|啟用|停用|合併|部署|歸檔)/g) || [];
  const actions = [...new Set(actionMatches)];

  // 4. 記憶庫操作
  const dbOps = [];
  if (/add_context|寫入記憶庫|寫入.*?DB/i.test(message)) dbOps.push('記憶庫寫入');
  if (/upsert-story/i.test(message)) dbOps.push('Story DB 寫入');
  if (/search_context|search_tech/i.test(message)) dbOps.push('記憶庫查詢');

  // 5. 錯誤/修復摘要
  const hasFix = /修復|fix|解決|根因|root cause/i.test(message);

  return { storyIds, filesCreated, filesModified, actions, dbOps, hasFix };
}

// ──────────────────────────────────────────────
// 組合 session 摘要內容
// CMI-5 增強：整合 YAML 狀態 + assistant message 結構化提取
// ──────────────────────────────────────────────
function buildSessionContent(hookEvent, lastAssistantMessage) {
  const activeStories = getActiveStories();
  const trackingLogs = getRecentTrackingLogs();
  const extracted = extractFromMessage(lastAssistantMessage);
  const parts = [];

  if (hookEvent === 'SessionEnd') {
    parts.push('[SessionEnd] 對話結束，最終快照');
  }

  // YAML 狀態
  if (activeStories.length > 0) {
    parts.push('進行中 Story: ' + activeStories.map(s => `${s.id}(${s.status})`).join(', '));
  } else {
    parts.push('無進行中 Story（所有任務已完成）');
  }

  // CMI-5: 從 assistant message 提取的結構化摘要
  if (extracted.storyIds && extracted.storyIds.length > 0) {
    parts.push('本次涉及: ' + extracted.storyIds.join(', '));
  }
  if (extracted.actions && extracted.actions.length > 0) {
    parts.push('動作: ' + extracted.actions.join(', '));
  }
  if (extracted.filesCreated && extracted.filesCreated.length > 0) {
    parts.push('建立檔案: ' + extracted.filesCreated.slice(0, 5).join(', '));
  }
  if (extracted.filesModified && extracted.filesModified.length > 0) {
    parts.push('修改檔案: ' + extracted.filesModified.slice(0, 5).join(', '));
  }
  if (extracted.dbOps && extracted.dbOps.length > 0) {
    parts.push('DB 操作: ' + extracted.dbOps.join(', '));
  }
  if (extracted.hasFix) {
    parts.push('含錯誤修復');
  }

  // Tracking files
  if (trackingLogs.length > 0) {
    parts.push('最近追蹤:');
    for (const t of trackingLogs) {
      parts.push(`  ${t.file}: ${t.log}`);
    }
  }

  return parts.join('\n');
}

// ──────────────────────────────────────────────
// CMI-3: 從 sessions-index.json 同步最新 summary
// ──────────────────────────────────────────────
function syncSummaryFromIndex(sessionId) {
  try {
    if (!fs.existsSync(SESSIONS_INDEX_PATH)) return null;
    const raw = fs.readFileSync(SESSIONS_INDEX_PATH, 'utf8');
    const data = JSON.parse(raw);
    const entry = (data.entries || []).find(e => e.sessionId === sessionId);
    return entry ? (entry.summary || null) : null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// CMI-3: 記錄 assistant turn 至 conversation_turns
// ──────────────────────────────────────────────
function logAssistantTurn(db, sessionId, lastAssistantMessage) {
  if (!sessionId || !lastAssistantMessage) return;

  try {
    const truncated = lastAssistantMessage.length > CONTENT_MAX_CHARS
      ? lastAssistantMessage.slice(0, CONTENT_MAX_CHARS)
      : lastAssistantMessage;
    const preview = lastAssistantMessage.length > PREVIEW_MAX_CHARS
      ? lastAssistantMessage.slice(0, PREVIEW_MAX_CHARS)
      : lastAssistantMessage;
    const timestamp = getTaiwanTimestamp();
    const tokenEstimate = Math.ceil(truncated.length / 4);

    // UPSERT session（若尚未建立）
    db.prepare(`
      INSERT OR IGNORE INTO conversation_sessions
        (session_id, started_at)
      VALUES (?, ?)
    `).run(sessionId, timestamp);

    // 取得 turn_index
    const countRow = db.prepare(
      'SELECT COUNT(*) AS cnt FROM conversation_turns WHERE session_id = ?'
    ).get(sessionId);
    const turnIndex = countRow ? countRow.cnt : 0;

    // INSERT assistant turn
    db.prepare(`
      INSERT INTO conversation_turns
        (session_id, turn_index, role, content, content_preview,
         timestamp, token_estimate, tools_used, files_touched)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, turnIndex,
      truncated, preview,
      timestamp, tokenEstimate,
      null, null
    );

    // UPDATE session total_turns + ended_at
    db.prepare(`
      UPDATE conversation_sessions
      SET total_turns = total_turns + 1,
          ended_at = ?
      WHERE session_id = ?
    `).run(timestamp, sessionId);

    process.stderr.write(`[log-session] Assistant turn logged (idx=${turnIndex}) for session ${sessionId.slice(0, 8)}...\n`);
  } catch (err) {
    process.stderr.write(`[log-session] logAssistantTurn error: ${err.message}\n`);
  }
}

// ──────────────────────────────────────────────
// CMI-5: SessionEnd 彙總 — 從 conversation_turns 聚合整個對話
// ──────────────────────────────────────────────
function buildSessionEndSummary(db, sessionId) {
  const turns = db.prepare(`
    SELECT role, content_preview
    FROM conversation_turns
    WHERE session_id = ?
    ORDER BY turn_index
  `).all(sessionId);

  if (turns.length === 0) return null;

  // 提取使用者問題摘要（每個 user turn 前 100 字）
  const questions = turns
    .filter(t => t.role === 'user')
    .map(t => (t.content_preview || '').slice(0, 100).trim())
    .filter(Boolean);

  // 從所有 assistant turns 提取結構化資訊並合併
  const allStoryIds = new Set();
  const allActions = new Set();
  const allCreated = new Set();
  const allModified = new Set();
  const allDbOps = new Set();
  let hasFix = false;

  for (const t of turns.filter(t => t.role === 'assistant')) {
    const ext = extractFromMessage(t.content_preview);
    (ext.storyIds || []).forEach(s => allStoryIds.add(s));
    (ext.actions || []).forEach(a => allActions.add(a));
    (ext.filesCreated || []).forEach(f => allCreated.add(f));
    (ext.filesModified || []).forEach(f => allModified.add(f));
    (ext.dbOps || []).forEach(o => allDbOps.add(o));
    if (ext.hasFix) hasFix = true;
  }

  const parts = [];
  parts.push(`[對話彙總] 共 ${turns.length} 輪 (${questions.length} 問 / ${turns.length - questions.length} 答)`);

  if (questions.length > 0) {
    parts.push('使用者問題:');
    questions.slice(0, 10).forEach((q, i) => parts.push(`  ${i + 1}. ${q}`));
  }

  if (allStoryIds.size > 0) parts.push('涉及 Story: ' + [...allStoryIds].join(', '));
  if (allActions.size > 0) parts.push('執行動作: ' + [...allActions].join(', '));
  if (allCreated.size > 0) parts.push('建立檔案: ' + [...allCreated].slice(0, 8).join(', '));
  if (allModified.size > 0) parts.push('修改檔案: ' + [...allModified].slice(0, 8).join(', '));
  if (allDbOps.size > 0) parts.push('DB 操作: ' + [...allDbOps].join(', '));
  if (hasFix) parts.push('含錯誤修復');

  return parts.join('\n');
}

// ──────────────────────────────────────────────
// 主函式
// ──────────────────────────────────────────────
async function writeSessionToDB() {
  if (!fs.existsSync(DB_PATH)) {
    process.stderr.write('[log-session] DB not found, skipping.\n');
    return;
  }

  // 讀取 Hook stdin 判斷事件類型（async + 1 秒超時保護）
  const hookInput = await readStdinAsync(1000);
  const hookEvent = hookInput.hook_event_name || 'unknown';
  const isSessionEnd = hookEvent === 'SessionEnd';
  const sessionId = hookInput.session_id || hookInput.sessionId || null;

  const db = new Database(DB_PATH);
  let embeddingPromise = null;

  try {
    const timestamp = getTaiwanTimestamp();
    const agentId = process.env.CLAUDE_AGENT_ID || 'CC-OPUS';
    const lastMsg = hookInput.last_assistant_message || '';
    const content = buildSessionContent(hookEvent, lastMsg);

    // CMI-3 Stop: 記錄 assistant turn
    if (hookEvent === 'Stop' && sessionId && hookInput.last_assistant_message) {
      logAssistantTurn(db, sessionId, hookInput.last_assistant_message);
    }

    // CMI-3 SessionEnd: UPDATE session ended_at + end_reason + sync summary
    if (isSessionEnd && sessionId) {
      const summary = syncSummaryFromIndex(sessionId);
      db.prepare(`
        UPDATE conversation_sessions
        SET ended_at = ?,
            end_reason = ?,
            summary = COALESCE(?, summary)
        WHERE session_id = ?
      `).run(timestamp, hookInput.reason || 'session_end', summary, sessionId);
      process.stderr.write(`[log-session] SessionEnd: updated conversation_sessions for ${sessionId.slice(0, 8)}...\n`);
    }

    // SessionEnd: 無條件寫入 context_entries（最後一次機會）
    // CMI-5 增強：從 conversation_turns 彙總整個對話的結構化摘要
    if (isSessionEnd) {
      let enrichedContent = content;
      if (sessionId) {
        try {
          const turnsSummary = buildSessionEndSummary(db, sessionId);
          if (turnsSummary) {
            enrichedContent = turnsSummary + '\n---\n' + content;
          }
        } catch (err) {
          process.stderr.write(`[log-session] SessionEnd summary error: ${err.message}\n`);
        }
      }
      const title = `Session 結束快照: ${timestamp.slice(0, 10)} ${timestamp.slice(11, 19)}`;
      const tagsJson = JSON.stringify(['session', 'auto', 'session-end']);
      const seResult = db.prepare(`
        INSERT INTO context_entries (agent_id, timestamp, category, title, content, tags)
        VALUES (?, ?, 'session', ?, ?, ?)
      `).run(agentId, timestamp, title, enrichedContent, tagsJson);
      // CMI-10: embedding sync（CRITICAL-3 fix: 收集 Promise，finally 前 await）
      embeddingPromise = syncEmbedding(db, 'context', seResult.lastInsertRowid, buildInputText('context', { title, content: enrichedContent }))
        .catch(err => process.stderr.write(`[log-session] embedding sync error: ${err.message}\n`));
      process.stderr.write(`[log-session] SessionEnd snapshot written (enriched).\n`);
      return;
    }

    // Stop / PreCompact: 2 分鐘內若已有記錄，UPDATE 而非 INSERT
    const cutoff = new Date(Date.now() - DEDUP_MINUTES * 60 * 1000).toISOString();
    const recent = db.prepare(`
      SELECT id FROM context_entries
      WHERE category = 'session'
        AND tags LIKE '%auto%'
        AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(cutoff);

    if (recent) {
      // UPDATE 既有記錄（保持最新狀態）
      const title = `Session 自動快照: ${timestamp.slice(0, 10)} ${timestamp.slice(11, 19)}`;
      db.prepare(`
        UPDATE context_entries SET timestamp = ?, title = ?, content = ? WHERE id = ?
      `).run(timestamp, title, content, recent.id);
      // CMI-10: embedding sync（CRITICAL-3 fix: 收集 Promise）
      embeddingPromise = syncEmbedding(db, 'context', recent.id, buildInputText('context', { title, content }))
        .catch(err => process.stderr.write(`[log-session] embedding sync error: ${err.message}\n`));
      process.stderr.write(`[log-session] Updated existing snapshot (id=${recent.id}).\n`);
      return;
    }

    // 無近期記錄，新建
    const title = `Session 自動快照: ${timestamp.slice(0, 10)} ${timestamp.slice(11, 19)}`;
    const tagsJson = JSON.stringify(['session', 'auto', hookEvent.toLowerCase()]);
    const newResult = db.prepare(`
      INSERT INTO context_entries (agent_id, timestamp, category, title, content, tags)
      VALUES (?, ?, 'session', ?, ?, ?)
    `).run(agentId, timestamp, title, content, tagsJson);
    // CMI-10: embedding sync（CRITICAL-3 fix: 收集 Promise）
    embeddingPromise = syncEmbedding(db, 'context', newResult.lastInsertRowid, buildInputText('context', { title, content }))
      .catch(err => process.stderr.write(`[log-session] embedding sync error: ${err.message}\n`));
    process.stderr.write(`[log-session] Session snapshot written to DB.\n`);
  } catch (err) {
    process.stderr.write(`[log-session] Error: ${err.message}\n`);
  } finally {
    // CRITICAL-3 fix: 等待 embedding 完成後再關閉 DB
    if (embeddingPromise) await embeddingPromise.catch(() => {});
    try { db.close(); } catch { /* ignore */ }
  }
}

// 測試用匯出（node:test 可直接 import）
export { getActiveStories, getRecentTrackingLogs, buildSessionContent, extractFromMessage, buildSessionEndSummary };

// 僅在直接執行時觸發（被 import 時跳過）
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  writeSessionToDB().catch(() => {});
}
