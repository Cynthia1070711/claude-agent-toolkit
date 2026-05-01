// ============================================================
// PCPT Context Memory DB — Pipeline 階段記錄腳本
// DVC-16: story-pipeline.ps1 各階段完成後呼叫，寫入 context_entries
// ============================================================
// 執行方式:
//   node .context-db/scripts/log-workflow.js \
//     --story-id dvc-16 \
//     --stage dev \
//     --status success \
//     [--error "error message"] \
//     [--agent-id CC-SONNET]
//
// 零 Token：純 Node.js 腳本，不使用 Claude API
// 異常安全：所有錯誤靜默退出（exit 0），不阻塞 pipeline
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

// ──────────────────────────────────────────────
// CLI 參數解析
// ──────────────────────────────────────────────

/**
 * @returns {{ storyId: string|null, stage: string|null, status: string|null, error: string|null, agentId: string }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    storyId: null,
    stage: null,
    status: null,
    error: null,
    agentId: process.env.CLAUDE_AGENT_ID || 'pipeline',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--story-id':
        result.storyId = args[++i] ?? null;
        break;
      case '--stage':
        result.stage = args[++i] ?? null;
        break;
      case '--status':
        result.status = args[++i] ?? null;
        break;
      case '--error':
        result.error = args[++i] ?? null;
        break;
      case '--agent-id':
        result.agentId = args[++i] ?? result.agentId;
        break;
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// story_id → epic_id 推導（複用 sync-from-yaml.js 邏輯）
// ──────────────────────────────────────────────

export function inferEpicId(storyId) {
  if (!storyId) return 'epic-unknown';

  if (storyId.startsWith('qgr-')) return 'epic-qgr';
  if (storyId.startsWith('td-')) return 'epic-td';
  if (storyId.startsWith('trs-')) return 'epic-trs';
  if (storyId.startsWith('fra-')) return 'epic-qgr';
  if (storyId.startsWith('uds-')) return 'epic-uds';
  if (storyId.startsWith('opt-')) return 'epic-opt';
  if (storyId.startsWith('dvc-')) return 'epic-dvc';
  if (storyId.startsWith('cmi-')) return 'epic-cmi';
  if (storyId.startsWith('mqv-')) return 'epic-mqv';
  if (storyId.startsWith('cat-')) return 'epic-cat';

  // 通用規則：取第一段作為 epic prefix
  const prefix = storyId.split('-')[0];
  return prefix ? `epic-${prefix}` : 'epic-unknown';
}

// ──────────────────────────────────────────────
// 寫入 context_entries
// ──────────────────────────────────────────────

/**
 * 核心邏輯：寫入 context_entries 至指定 DB 路徑
 * @param {{ storyId: string, stage: string, status: string, error: string|null, agentId: string }} params
 * @param {string} dbPath - DB 檔案路徑（預設用 DB_PATH 常數）
 * @returns {boolean}
 */
export async function logWorkflowToDb(params, dbPath) {
  const { storyId, stage, status, error, agentId } = params;

  // 驗證必要參數
  if (!storyId || !stage || !status) {
    process.stderr.write('[log-workflow] 缺少必要參數 (--story-id, --stage, --status)，跳過\n');
    return false;
  }

  // 驗證 stage 值
  const validStages = ['create', 'dev', 'review'];
  if (!validStages.includes(stage)) {
    process.stderr.write(`[log-workflow] 無效的 stage "${stage}"（允許: ${validStages.join(', ')}），跳過\n`);
    return false;
  }

  // 驗證 status 值
  const validStatuses = ['success', 'failure', 'skipped'];
  if (!validStatuses.includes(status)) {
    process.stderr.write(`[log-workflow] 無效的 status "${status}"（允許: ${validStatuses.join(', ')}），跳過\n`);
    return false;
  }

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`[log-workflow] DB not found at ${dbPath}，跳過\n`);
    return false;
  }

  const timestamp = getTaiwanTimestamp();
  const epicId = inferEpicId(storyId);
  const title = `Pipeline ${stage}: ${storyId} — ${status}`;

  // 組裝 content 摘要
  const contentParts = [
    `Story: ${storyId}`,
    `Epic: ${epicId}`,
    `階段: ${stage}`,
    `狀態: ${status}`,
    `時間: ${timestamp}`,
  ];
  if (error) {
    contentParts.push(`錯誤: ${error}`);
  }
  const content = contentParts.join('\n');

  const tagsArr = ['pipeline', stage, storyId, status];
  const tagsJson = JSON.stringify(tagsArr);

  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  let embeddingPromise = null;
  try {
    db.prepare(`
      INSERT INTO context_entries
        (agent_id, timestamp, category, title, content, story_id, epic_id, tags)
      VALUES
        (@agentId, @timestamp, 'session', @title, @content, @storyId, @epicId, @tags)
    `).run({
      agentId,
      timestamp,
      title,
      content,
      storyId,
      epicId: epicId,
      tags: tagsJson,
    });

    // CMI-10: embedding sync（CRITICAL-3 fix: 收集 Promise，finally 前 await）
    const lastId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    embeddingPromise = syncEmbedding(db, 'context', lastId, buildInputText('context', { title, content }))
      .catch(err => process.stderr.write(`[log-workflow] embedding sync error: ${err.message}\n`));

    process.stderr.write(`[log-workflow] 已記錄: ${title}\n`);
    return true;
  } catch (err) {
    process.stderr.write(`[log-workflow] DB 寫入錯誤: ${err.message}\n`);
    return false;
  } finally {
    // CRITICAL-3 fix: 等待 embedding 完成後再關閉 DB
    if (embeddingPromise) await embeddingPromise.catch(() => {});
    try { db.close(); } catch { /* ignore */ }
  }
}

/**
 * 使用預設 DB_PATH 的公開介面（向後相容）
 * @param {{ storyId: string, stage: string, status: string, error: string|null, agentId: string }} params
 * @returns {boolean}
 */
export async function logWorkflow(params) {
  return logWorkflowToDb(params, DB_PATH);
}

// ──────────────────────────────────────────────
// 主程式（直接執行時觸發）
// ──────────────────────────────────────────────

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  try {
    const args = parseArgs(process.argv);
    await logWorkflow(args);
  } catch (err) {
    process.stderr.write(`[log-workflow] 未預期錯誤: ${err.message}\n`);
  }
  // 無論如何，以 exit 0 結束（不阻塞 pipeline）
  process.exit(0);
}
