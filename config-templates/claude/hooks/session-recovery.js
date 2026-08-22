#!/usr/bin/env node
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
//   - 總輸出預算 9,500 字元（對官方 10,000 字元硬界留 500 字元安全邊際）
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
const DB_PATH = path.join(CONTEXT_DB_DIR, 'phycool.db');

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
// 注入預算 — 以「字元」為單位（bwu-14，對齊 pre-prompt-rag.js DEFAULT_MAX_INJECT_CHARS 同值同名）
// 官方契約：hook 輸出字串（additionalContext / plain stdout）上限為 10,000 字元。
// [Source: https://code.claude.com/docs/en/hooks | Fetched 2026-08-04]
// 對 10,000 官方硬界留 500 字元安全邊際，其中須容納 JSON 包裝與換行轉義開銷
// （create 階段實測：additionalContext 1,548 字元 → stdout 全長 1,594 字元，差 46）。
const DEFAULT_MAX_INJECT_CHARS = 9500;
// 下界 —— 截斷註記本身約 60 字元，上限若低於它，下方 notice-aware 的預扣就會變成負數，
// 而 truncate() 的 slice(0, 負數) 是「從尾端裁掉 n 個字元」而非「取前 n 個字元」，
// 使截斷後的輸出反而比不截斷更長（CR F2 實測：cap=50 → 1,925 字元 > 未截斷的 1,873）。
// 200 為「足以容納註記且仍留有可觀察內容」的最小值，非任意取值。
const MIN_MAX_INJECT_CHARS = 200;
// env 覆寫僅供測試專用（截斷分支結構性不可觸發，見 create 階段實測）；
// 夾在 [MIN_MAX_INJECT_CHARS, 10000]（上界為官方硬界）。
// 對齊 pre-prompt-rag.js PHYCOOL_RAG_MAX_INJECT_CHARS 同型 IIFE pattern。
const MAX_INJECT_CHARS = (() => {
  const raw = parseInt(process.env.PHYCOOL_SESSION_RECOVERY_MAX_INJECT_CHARS || '', 10);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(Math.max(raw, MIN_MAX_INJECT_CHARS), 10000)
    : DEFAULT_MAX_INJECT_CHARS;
})();
// 截斷註記本身佔用的字元數須於截斷時預先扣除，否則含註記的完整輸出會反過來
// 超過 MAX_INJECT_CHARS 自身（bwu-11 TD-BWU11-FORMATTER-NOTICE-BUDGET-OVERSHOOT 同型缺陷）。
const TRUNCATE_NOTICE = `\n\n> (Context truncated to stay within ${MAX_INJECT_CHARS} character budget)\n`;
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

/**
 * 估算 token 數（約 4 字元/token）。
 * bwu-14 起**僅供 stderr 觀測日誌**，不再參與任何預算判定 —— 注入預算改以字元為單位，
 * 與官方 10,000 字元上限同量綱（對齊 pre-prompt-rag.js estimateTokens 同型註解，bwu-11）。
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
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

  // 全域字元預算截斷（bwu-14：字元制，notice-aware —— 截斷時已預扣 TRUNCATE_NOTICE 長度，
  // 故含註記的完整回傳值恆 ≤ MAX_INJECT_CHARS）
  if (combined.length > MAX_INJECT_CHARS) {
    return truncate(combined, MAX_INJECT_CHARS - TRUNCATE_NOTICE.length) + TRUNCATE_NOTICE;
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
      `[SessionRecovery] event=${eventType} pipeline=${pipeline ? pipeline.pipeline_id : 'none'} sessions=${sessions.length} workflow=${workflow ? workflow.workflow_type : 'none'} chars=${additionalContext.length} tokens~=${estimateTokens(additionalContext)}\n`
    );

    // 官方 SessionStart JSON 契約:additionalContext 巢狀於 hookSpecificOutput
    // (比照 bmad-slash-story-inject.js 等已正確包裝的 hook 範式;原裸 top-level
    // 形式僅因 SessionStart 對 stdout 的例外容忍而未曾功能性失敗)。
    // [TD-SESSION-RECOVERY-OUTPUT-NOT-HOOKSPECIFICOUTPUT-WRAPPED 修復 2026-08-04]
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    }));
  } catch (err) {
    process.stderr.write(`[SessionRecovery] Error: ${err.message}\n`);
    process.exit(0);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

main().catch(() => process.exit(0));
