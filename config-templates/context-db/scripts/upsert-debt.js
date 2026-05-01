// ============================================================
// PCPT Context Memory DB — 技術債寫入工具
// 用途：寫入/更新 tech_debt_items（取代 registry.yaml + .debt.md）
// ============================================================
// 使用方式:
//   node .context-db/scripts/upsert-debt.js <json-file>
//   node .context-db/scripts/upsert-debt.js --inline '<json>'
//   node .context-db/scripts/upsert-debt.js --resolve <debt-id> --by <agent> --in <story-id>
//   node .context-db/scripts/upsert-debt.js --query --story <story-id>
//   node .context-db/scripts/upsert-debt.js --query --target <story-id>
//   node .context-db/scripts/upsert-debt.js --query --status open
//   node .context-db/scripts/upsert-debt.js --stats [--epic <epic-id>]
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { syncEmbedding, buildInputText } from './embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.PCPT_DB_PATH || path.join(__dirname, '..', 'context-memory.db');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

async function upsertDebt(data, { validateTarget = false } = {}) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // FK Guard: --validate-target 時檢查 target_story 是否存在於 stories 表
  if (validateTarget && data.target_story) {
    const exists = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get(data.target_story);
    if (!exists) {
      db.close();
      console.error(`❌ target_story '${data.target_story}' 不存在於 stories 表`);
      process.exit(1);
    }
  }

  const now = getTaiwanTimestamp();

  // 序列化 JSON 欄位
  if (data.affected_files && typeof data.affected_files === 'object') {
    data.affected_files = JSON.stringify(data.affected_files);
  }

  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO tech_debt_items
      (debt_id, story_id, category, severity, dimension, title, description,
       affected_files, fix_guidance, root_cause, target_story, status,
       wont_fix_reason, source_review_date, priority_score, created_at,
       resolved_at, resolved_by, resolved_in_story)
    VALUES
      (@debt_id, @story_id, @category, @severity, @dimension, @title, @description,
       @affected_files, @fix_guidance, @root_cause, @target_story, @status,
       @wont_fix_reason, @source_review_date, @priority_score, @created_at,
       @resolved_at, @resolved_by, @resolved_in_story)
  `).run({
    debt_id: data.debt_id,
    story_id: data.story_id,
    category: data.category || 'deferred',
    severity: data.severity || 'medium',
    dimension: data.dimension || null,
    title: data.title,
    description: data.description || null,
    affected_files: data.affected_files || null,
    fix_guidance: data.fix_guidance || null,
    root_cause: data.root_cause || null,
    target_story: data.target_story || null,
    status: data.status || 'open',
    wont_fix_reason: data.wont_fix_reason || null,
    source_review_date: data.source_review_date || null,
    priority_score: data.priority_score != null ? Number(data.priority_score) : null,
    created_at: data.created_at || now.split('T')[0],
    resolved_at: data.resolved_at || null,
    resolved_by: data.resolved_by || null,
    resolved_in_story: data.resolved_in_story || null,
  });

  // CMI-10: 同步生成 Debt Embedding（CRITICAL-2 fix: 使用 INTEGER id，非 TEXT debt_id）
  try {
    const itemId = insertResult.lastInsertRowid;
    const embText = buildInputText('debt', { title: data.title, description: data.description || '', fix_guidance: data.fix_guidance || '' });
    await syncEmbedding(db, 'debt', itemId, embText);
  } catch (err) {
    console.warn(`⚠️  Debt embedding sync 失敗（不影響寫入）: ${err.message}`);
  }

  db.close();
  console.log(`✅ Debt ${data.debt_id} 已寫入 DB (source: ${data.story_id}, status: ${data.status || 'open'})`);
}

function resolveDebt(debtId, resolvedBy, resolvedInStory) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const now = getTaiwanTimestamp();
  const result = db.prepare(`
    UPDATE tech_debt_items
    SET status = 'fixed', resolved_at = ?, resolved_by = ?, resolved_in_story = ?
    WHERE debt_id = ? AND status != 'fixed'
  `).run(now, resolvedBy, resolvedInStory, debtId);

  db.close();

  if (result.changes > 0) {
    console.log(`✅ Debt ${debtId} 已標記 fixed (by: ${resolvedBy}, in: ${resolvedInStory})`);
  } else {
    console.warn(`⚠️ Debt ${debtId} 未更新（不存在或已 fixed）`);
  }
}

function queryDebts(filters) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  let sql = 'SELECT * FROM tech_debt_items WHERE 1=1';
  const params = {};

  if (filters.story) {
    sql += ' AND story_id = @story';
    params.story = filters.story;
  }
  if (filters.target) {
    sql += ' AND target_story = @target';
    params.target = filters.target;
  }
  if (filters.status) {
    sql += ' AND status = @status';
    params.status = filters.status;
  }
  if (filters.severity) {
    sql += ' AND severity = @severity';
    params.severity = filters.severity;
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(params);
  db.close();

  console.log(JSON.stringify(rows, null, 2));
  console.log(`\n共 ${rows.length} 筆`);
}

function showStats(epicId) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  let where = '';
  const params = {};
  if (epicId) {
    where = " WHERE story_id IN (SELECT story_id FROM stories WHERE epic_id = @epicId)";
    params.epicId = epicId;
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items${where}`).get(params).c;
  const open = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items${where} ${where ? 'AND' : 'WHERE'} status = 'open'`).get(params).c;
  const fixed = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items${where} ${where ? 'AND' : 'WHERE'} status = 'fixed'`).get(params).c;
  const wontfix = db.prepare(`SELECT COUNT(*) as c FROM tech_debt_items${where} ${where ? 'AND' : 'WHERE'} status = 'wont-fix'`).get(params).c;

  const bySeverity = db.prepare(`
    SELECT severity, COUNT(*) as c FROM tech_debt_items${where} ${where ? 'AND' : 'WHERE'} status = 'open'
    GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END
  `).all(params);

  console.log(`📊 Tech Debt 統計${epicId ? ` (Epic: ${epicId})` : ' (全域)'}:`);
  console.log(`   Total: ${total} | Open: ${open} | Fixed: ${fixed} | Won't Fix: ${wontfix}`);
  if (bySeverity.length > 0) {
    console.log(`   Open by severity: ${bySeverity.map(r => `${r.severity}=${r.c}`).join(', ')}`);
  }

  db.close();
}

// Export for testing
export { upsertDebt, resolveDebt, queryDebts, showStats, DB_PATH };

// Guard: only run CLI when executed directly (not when imported by vitest)
if (process.env.VITEST) {
  // Skip CLI execution during tests
} else {

// CLI 入口
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage:');
  console.log("  node upsert-debt.js <json-file>                           # 寫入/更新");
  console.log("  node upsert-debt.js --inline '<json>'                     # 寫入 (inline)");
  console.log("  node upsert-debt.js --resolve <debt-id> --by <agent> --in <story>  # 標記修復");
  console.log("  node upsert-debt.js --query --story <id>                  # 查詢來源 Story");
  console.log("  node upsert-debt.js --query --target <id>                 # 查詢目標 Story");
  console.log("  node upsert-debt.js --query --status open                 # 查詢狀態");
  console.log("  node upsert-debt.js --stats [--epic <epic-id>]            # 統計報告");
  process.exit(1);
}

(async () => {
  if (args[0] === '--resolve') {
    const debtId = args[1];
    const byIdx = args.indexOf('--by');
    const inIdx = args.indexOf('--in');
    const resolvedBy = byIdx >= 0 ? args[byIdx + 1] : 'unknown';
    const resolvedIn = inIdx >= 0 ? args[inIdx + 1] : 'unknown';
    resolveDebt(debtId, resolvedBy, resolvedIn);
  } else if (args[0] === '--query') {
    const filters = {};
    for (let i = 1; i < args.length; i += 2) {
      const key = args[i].replace('--', '');
      filters[key] = args[i + 1];
    }
    queryDebts(filters);
  } else if (args[0] === '--stats') {
    const epicIdx = args.indexOf('--epic');
    const epicId = epicIdx >= 0 ? args[epicIdx + 1] : null;
    showStats(epicId);
  } else {
    const validateTarget = args.includes('--validate-target');
    const filteredArgs = args.filter(a => a !== '--validate-target');
    let data;
    if (filteredArgs[0] === '--inline') {
      data = JSON.parse(filteredArgs[1]);
    } else {
      const filePath = path.resolve(filteredArgs[0]);
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    await upsertDebt(data, { validateTarget });
  }
})().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});

} // end VITEST guard
