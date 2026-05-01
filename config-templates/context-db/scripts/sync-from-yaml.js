// ============================================================
// PCPT Context Memory DB — Sprint YAML 同步腳本
// TD-32d AC-2: 解析 sprint-status.yaml → sprint_index 表
// ============================================================
// 執行方式: node .context-db/scripts/sync-from-yaml.js
// 零 Token：純 Node.js 腳本，不使用 Claude API
// 冪等設計: INSERT OR REPLACE（story_id 為 PRIMARY KEY）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const YAML_PATH = path.join(__dirname, '..', '..', 'docs', 'implementation-artifacts', 'sprint-status.yaml');

// ──────────────────────────────────────────────
// 簡易 YAML 解析器（僅解析 development_status 區塊）
// 不使用第三方 YAML 套件，保持零依賴
// ──────────────────────────────────────────────
function parseSprintStatusYaml(content) {
  const lines = content.split('\n');
  const stories = [];

  let inDevStatus = false;
  const epicPattern = /^  (epic-\w+):\s*([\w-]+)/;
  const storyPattern = /^  ([\w-]+-[\w-]+):\s*([\w-]+)/;
  const commentPattern = /^  #/;

  for (const line of lines) {
    if (line.trim() === 'development_status:') {
      inDevStatus = true;
      continue;
    }

    if (!inDevStatus) continue;

    // 停止解析（遇到下一個頂層 key）
    if (line.match(/^\w/) && !line.match(/^  /)) {
      inDevStatus = false;
      continue;
    }

    // 跳過空行和純註解行
    if (!line.trim() || commentPattern.test(line)) continue;

    // 解析 epic 狀態（過濾掉，不插入 sprint_index）
    if (epicPattern.test(line)) {
      continue; // epic 行跳過
    }

    // 解析 story 行：key: status  # comment
    const storyMatch = line.match(/^  ([\w-]+):\s*([\w-]+)(.*)/);
    if (!storyMatch) continue;

    const storyId = storyMatch[1];
    const status = storyMatch[2];
    const comment = storyMatch[3] || '';

    // 過濾掉 epic 開頭的 key
    if (storyId.startsWith('epic-')) continue;

    // 從 story_id 推導 epic_id
    let epicId = 'epic-unknown';
    if (storyId.startsWith('qgr-')) epicId = 'epic-qgr';
    else if (storyId.startsWith('td-')) epicId = 'epic-td';
    else if (storyId.startsWith('trs-')) epicId = 'epic-trs';
    else if (storyId.startsWith('fra-')) epicId = 'epic-qgr';
    else if (storyId.startsWith('uds-')) epicId = 'epic-uds';
    else if (storyId.startsWith('opt-')) epicId = 'epic-opt';

    // 從行內註解萃取 priority（找 P0/P1/P2/P3）
    const priorityMatch = comment.match(/P([0-3])/);
    const priority = priorityMatch ? `P${priorityMatch[1]}` : null;

    // 從行內註解萃取 agent 資訊（找 dev:, assigned:）
    const agentMatch = comment.match(/dev:\s*([\w-]+)/);
    const assignedAgent = agentMatch ? agentMatch[1] : null;

    // 簡易標題生成：story_id 轉為可讀格式
    const title = storyId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    stories.push({
      story_id: storyId,
      epic_id: epicId,
      title,
      status,
      priority,
      assigned_agent: assignedAgent,
      last_updated: new Date().toISOString(),
    });
  }

  return stories;
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function syncFromYaml() {
  console.log('🔄 Sprint YAML → sprint_index 同步開始');
  console.log(`   YAML: ${YAML_PATH}`);
  console.log(`   DB:   ${DB_PATH}`);
  console.log('');

  // 檢查 YAML 存在
  if (!fs.existsSync(YAML_PATH)) {
    throw new Error(`sprint-status.yaml 不存在: ${YAML_PATH}`);
  }

  const content = fs.readFileSync(YAML_PATH, 'utf-8');
  const stories = parseSprintStatusYaml(content);

  console.log(`[1] 解析完成：${stories.length} 個 Story 記錄`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // 插入/更新 sprint_index（INSERT OR REPLACE）
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO sprint_index
      (story_id, epic_id, title, status, priority, assigned_agent, last_updated)
    VALUES
      (@story_id, @epic_id, @title, @status, @priority, @assigned_agent, @last_updated)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      upsert.run(row);
    }
  });

  console.log('[2] 寫入 sprint_index...');
  insertMany(stories);

  // 統計
  const total = db.prepare('SELECT COUNT(*) as count FROM sprint_index').get();
  const statusGroups = db.prepare(
    'SELECT status, COUNT(*) as count FROM sprint_index GROUP BY status ORDER BY count DESC'
  ).all();

  console.log('');
  console.log('✅ 同步完成');
  console.log(`   sprint_index 總計: ${total.count} 筆`);
  console.log('   狀態分佈:');
  for (const g of statusGroups) {
    console.log(`     ${g.status}: ${g.count} 筆`);
  }

  db.close();
}

try {
  syncFromYaml();
} catch (err) {
  console.error('❌ YAML 同步失敗:', err.message);
  process.exit(1);
}
