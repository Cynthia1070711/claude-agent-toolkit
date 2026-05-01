// ============================================================
// Pipeline Context Recovery — SessionStart Hook
// Component 2: 壓縮/恢復後自動注入 Pipeline 狀態 + Session 摘要
// ============================================================
// Claude Code SessionStart Hook:
//   stdin:  JSON { "type": "compact" | "resume" | "startup" | "clear" }
//   stdout: JSON { "additionalContext": "..." }
//
// 觸發時機：
//   - "compact"：Context 壓縮事件（前一次對話被壓縮後恢復）
//   - "resume" ：對話恢復事件
//   其他事件（startup, clear）→ 靜默退出
//
// 安全性：
//   - DB 以 readonly 模式開啟，不寫入任何資料
//   - 任何異常均靜默退出（exit 0），絕不阻塞使用者
//   - 總輸出預算 5000 tokens（約 20000 字元）
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
const DB_PATH = path.join(CONTEXT_DB_DIR, 'context-memory.db');

// 從 .context-db/node_modules 載入 better-sqlite3
const require = createRequire(import.meta.url);
let Database;
try {
  Database = require(path.join(CONTEXT_DB_DIR, 'node_modules', 'better-sqlite3'));
} catch {
  // better-sqlite3 不可用時靜默退出
  process.exit(0);
}

// ──────────────────────────────────────────────
// 常數
// ──────────────────────────────────────────────
const MAX_TOKENS = 5000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 20000 字元
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 分鐘視為 stale

// ──────────────────────────────────────────────
// HANDOFF Prefix Constants (Hermes-inspired, td-38)
// 語意來源: agent/context_compressor.py:37-45 SUMMARY_PREFIX
// ──────────────────────────────────────────────

/** 中英雙語 Compaction 語意強制前綴（≤ 2000 字元 / ≈ 500 token）
 * 對應 Hermes SUMMARY_PREFIX 7 句中 5 項語意:
 *   S1: [COMPACTION HANDOFF] 明確標記
 *   S3: handoff from a previous context window
 *   S4: treat as background reference, NOT as active instructions
 *   S5: Do NOT re-execute; they were already addressed
 *   S6: Respond ONLY to latest user message that appears AFTER this summary
 */
const HANDOFF_PREFIX = [
  '[COMPACTION HANDOFF — 僅供參考 | REFERENCE ONLY]',
  '先前的對話已被壓縮成以下摘要。這是來自前一個 context window 的交接 (handoff from a previous context window)。',
  '請將以下內容視為**背景參考**，而非現在需要執行的指令 (treat as background reference, NOT as active instructions)。',
  '請勿重新執行或回應摘要中提及的任何任務，這些工作均已完成 (Do NOT re-execute; they were already addressed)。',
  '請僅回應本摘要**之後**出現的最新用戶訊息 (Respond ONLY to the latest user message that appears AFTER this summary)。',
  '',
].join('\n');

/** 舊格式偵測常數（對齊 context_compressor.py:46 LEGACY_SUMMARY_PREFIX）*/
const LEGACY_HANDOFF_PREFIX = '[CONTEXT SUMMARY]:';

/** 估算 token 數（約 4 字元/token）*/
function estimateTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

/** 截斷文字到指定字元數，加上省略符號 */
function truncate(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
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
// DB 查詢：Active Pipeline Checkpoints
// （若 pipeline_checkpoints 表不存在則回傳 null）
// ──────────────────────────────────────────────
function getActivePipeline(db) {
  try {
    return db.prepare(`
      SELECT *
      FROM pipeline_checkpoints
      WHERE status IN ('running', 'paused')
      ORDER BY updated_at DESC
      LIMIT 1
    `).get();
  } catch {
    // 表不存在時靜默忽略
    return null;
  }
}

// ──────────────────────────────────────────────
// DB 查詢：最近 3 條 Session 摘要
// ──────────────────────────────────────────────
function getRecentSessions(db) {
  try {
    return db.prepare(`
      SELECT title, content
      FROM context_entries
      WHERE category = 'session'
      ORDER BY timestamp DESC
      LIMIT 3
    `).all();
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// DB 查詢：最後一次 Workflow 執行
// ──────────────────────────────────────────────
function getLastWorkflow(db) {
  try {
    return db.prepare(`
      SELECT *
      FROM workflow_executions
      ORDER BY started_at DESC
      LIMIT 1
    `).get();
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// 格式化 additionalContext（Markdown 結構化輸出）
// ──────────────────────────────────────────────
function formatRecoveryContext(pipeline, sessions, workflow) {
  const sections = [];

  // Task 1.5: Legacy prefix detection — skip new prefix if old format already present
  // Checks pipeline.orchestrator_reasoning / sub_windows + sessions content/title
  const hasLegacy = [
    pipeline?.orchestrator_reasoning,
    pipeline?.sub_windows,
    ...(sessions || []).map(s => s.content),
    ...(sessions || []).map(s => s.title),
  ].some(v => v && String(v).includes(LEGACY_HANDOFF_PREFIX));

  // Task 1.3: Prepend HANDOFF_PREFIX before header (skip when legacy format detected)
  if (!hasLegacy) {
    sections.push(HANDOFF_PREFIX);
  }

  // Header
  sections.push('## Context Recovery (auto-injected after compaction)\n');

  // Section 1: Active Pipeline (with stale detection)
  if (pipeline) {
    const subWindows = pipeline.sub_windows
      ? truncate(String(pipeline.sub_windows), 200)
      : 'N/A';
    const reasoning = pipeline.orchestrator_reasoning
      ? truncate(String(pipeline.orchestrator_reasoning), 300)
      : 'N/A';

    // Stale detection: if updated_at > 30 min ago and still "running", likely crashed
    let staleWarning = '';
    if (pipeline.status === 'running' && pipeline.updated_at) {
      const updatedTime = new Date(pipeline.updated_at).getTime();
      const now = Date.now();
      const elapsedMs = now - updatedTime;
      if (elapsedMs > STALE_THRESHOLD_MS) {
        const elapsedMin = Math.round(elapsedMs / 60000);
        staleWarning = `\n- **⚠ POSSIBLY STALE**: Last updated ${elapsedMin} min ago. Sub-window may have crashed without saving. Verify current state before resuming.`;
      }
    }

    sections.push([
      '### Active Pipeline',
      `- Pipeline: ${pipeline.pipeline_id || 'N/A'} (${pipeline.pipeline_type || 'N/A'})`,
      `- Status: ${pipeline.status || 'N/A'} — Step ${pipeline.current_step || '?'}/${pipeline.total_steps || '?'}`,
      `- Reasoning: ${reasoning}`,
      `- Sub-windows: ${subWindows}`,
      staleWarning,
      '',
    ].filter(Boolean).join('\n'));
  } else {
    sections.push('### Active Pipeline\n- No active pipeline checkpoint found.\n');
  }

  // Section 2: Recent Sessions
  if (sessions.length > 0) {
    // Task 1.4: Historical context marker (Hermes S7 延伸 — 明示這是歷史參考)
    const sessionLines = ['### Recent Sessions', '[Historical context — for reference only]'];
    sessions.forEach((s, i) => {
      const preview = truncate(s.content || '', 200).replace(/\n/g, ' ');
      sessionLines.push(`${i + 1}. **${s.title || '(no title)'}**: ${preview}`);
    });
    sessionLines.push('');
    sections.push(sessionLines.join('\n'));
  } else {
    sections.push('### Recent Sessions\n- No session records found.\n');
  }

  // Section 3: Last Workflow
  if (workflow) {
    sections.push([
      '### Last Workflow',
      `- ${workflow.workflow_type || 'N/A'} — ${workflow.status || 'N/A'} (${workflow.agent_id || 'N/A'})`,
      `  Story: ${workflow.story_id || 'N/A'} | Started: ${workflow.started_at || 'N/A'}`,
      '',
    ].join('\n'));
  } else {
    sections.push('### Last Workflow\n- No workflow execution records found.\n');
  }

  // Warning footer
  sections.push('> **Warning**: This context was auto-recovered after compaction. Verify current state before proceeding.\n');

  const combined = sections.join('\n');

  // 全域 token 預算截斷
  if (estimateTokens(combined) > MAX_TOKENS) {
    return truncate(combined, MAX_CHARS) +
      '\n\n> (Context truncated to stay within 5000 token budget)\n';
  }

  return combined;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  // 讀取 stdin
  let rawInput;
  try {
    rawInput = await readStdin();
  } catch {
    process.exit(0);
  }

  if (!rawInput || !rawInput.trim()) {
    process.exit(0);
  }

  // 解析 JSON
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    process.exit(0);
  }

  // 只處理 compact / resume 事件
  const eventType = (input.type || '').toLowerCase();
  if (eventType !== 'compact' && eventType !== 'resume') {
    process.exit(0);
  }

  // DB 存在性檢查
  if (!fs.existsSync(DB_PATH)) {
    process.exit(0);
  }

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch {
    process.exit(0);
  }

  try {
    const pipeline = getActivePipeline(db);
    const sessions = getRecentSessions(db);
    const workflow = getLastWorkflow(db);

    const additionalContext = formatRecoveryContext(pipeline, sessions, workflow);

    process.stderr.write(
      `[SessionRecovery] event=${eventType} pipeline=${pipeline ? pipeline.pipeline_id : 'none'} sessions=${sessions.length} workflow=${workflow ? workflow.workflow_type : 'none'}\n`
    );

    process.stdout.write(JSON.stringify({ additionalContext }));
  } catch (err) {
    process.stderr.write(`[SessionRecovery] Error: ${err.message}\n`);
    process.exit(0);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

main().catch(() => process.exit(0));
