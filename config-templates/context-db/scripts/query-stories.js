#!/usr/bin/env node
// ============================================================
// PCPT Context Memory DB — Story 查詢工具
// 用途：免 Token 直接查詢記憶庫中的 Story 資料
// ============================================================
// 使用方式:
//   node .context-db/scripts/query-stories.js                     # 列出所有 Story
//   node .context-db/scripts/query-stories.js --epic epic-mqv     # 按 Epic 篩選
//   node .context-db/scripts/query-stories.js --status done       # 按狀態篩選
//   node .context-db/scripts/query-stories.js --status backlog --status ready-for-dev  # 多狀態
//   node .context-db/scripts/query-stories.js --id mqv-2          # 查看單一 Story 詳情
//   node .context-db/scripts/query-stories.js --search "GlobalNav" # FTS 全文搜尋
//   node .context-db/scripts/query-stories.js --domain admin      # 按 Domain 篩選
//   node .context-db/scripts/query-stories.js --summary           # 統計摘要
//   node .context-db/scripts/query-stories.js --format json       # JSON 輸出
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

// ──────────────────────────────────────────────
// CLI 參數解析
// ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    epic: null,
    status: [],
    id: null,
    search: null,
    domain: null,
    summary: false,
    format: 'table',  // table | json | markdown
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--epic':     opts.epic = args[++i]; break;
      case '--status':   opts.status.push(args[++i]); break;
      case '--id':       opts.id = args[++i]; break;
      case '--search':   opts.search = args[++i]; break;
      case '--domain':   opts.domain = args[++i]; break;
      case '--summary':  opts.summary = true; break;
      case '--format':   opts.format = args[++i]; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
PCPT Story 查詢工具

用法:
  node .context-db/scripts/query-stories.js [OPTIONS]

選項:
  --epic <epic_id>     按 Epic 篩選 (e.g., epic-mqv)
  --status <status>    按狀態篩選 (可多次使用)
  --id <story_id>      查看單一 Story 完整詳情
  --search <keyword>   FTS 全文搜尋 (>= 3 字元)
  --domain <domain>    按 Domain 篩選
  --summary            顯示統計摘要
  --format <fmt>       輸出格式: table(預設) | json | markdown
  -h, --help           顯示此說明
`);
}

// ──────────────────────────────────────────────
// 格式化輸出
// ──────────────────────────────────────────────
function statusIcon(status) {
  const icons = {
    'done': '[DONE]',
    'in-progress': '[DEV]',
    'review': '[CR]',
    'ready-for-dev': '[RDY]',
    'backlog': '[BKL]',
    'blocked': '[BLK]',
    'cancelled': '[CXL]',
  };
  return icons[status] || `[${status}]`;
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log('(無結果)');
    return;
  }

  // 計算欄寬
  const cols = {
    story_id: Math.max(10, ...rows.map(r => (r.story_id || '').length)),
    title: Math.min(40, Math.max(8, ...rows.map(r => (r.title || '').length))),
    status: 14,
    priority: 4,
    complexity: 4,
    epic_id: Math.max(8, ...rows.map(r => (r.epic_id || '').length)),
  };

  const header = [
    'Story ID'.padEnd(cols.story_id),
    'Title'.padEnd(cols.title),
    'Status'.padEnd(cols.status),
    'Pri'.padEnd(cols.priority),
    'Cpx'.padEnd(cols.complexity),
    'Epic'.padEnd(cols.epic_id),
  ].join(' | ');

  const sep = '-'.repeat(header.length);

  console.log(header);
  console.log(sep);

  for (const r of rows) {
    const line = [
      (r.story_id || '').padEnd(cols.story_id),
      (r.title || '').slice(0, cols.title).padEnd(cols.title),
      statusIcon(r.status).padEnd(cols.status),
      (r.priority || '-').padEnd(cols.priority),
      (r.complexity || '-').padEnd(cols.complexity),
      (r.epic_id || '').padEnd(cols.epic_id),
    ].join(' | ');
    console.log(line);
  }

  console.log(sep);
  console.log(`共 ${rows.length} 筆`);
}

function printDetail(row) {
  if (!row) {
    console.log('Story 不存在');
    return;
  }

  console.log('='.repeat(60));
  console.log(`Story: ${row.story_id}`);
  console.log(`Title: ${row.title}`);
  console.log('='.repeat(60));
  console.log(`Epic:        ${row.epic_id}`);
  console.log(`Domain:      ${row.domain}`);
  console.log(`Status:      ${row.status}`);
  console.log(`Priority:    ${row.priority || '-'}`);
  console.log(`Complexity:  ${row.complexity || '-'}`);
  console.log(`Type:        ${row.story_type || '-'}`);
  console.log(`Dev Agent:   ${row.dev_agent || '-'}`);
  console.log(`Review Agent:${row.review_agent || '-'}`);
  console.log(`CR Score:    ${row.cr_score || '-'}`);
  console.log(`Tests:       ${row.test_count || '-'}`);
  console.log(`Source:      ${row.source_file}`);
  console.log(`Created:     ${row.created_at}`);
  console.log(`Updated:     ${row.updated_at || '-'}`);
  console.log(`Discovery:   ${row.discovery_source || '-'}`);

  if (row.dependencies) {
    console.log(`Dependencies:${row.dependencies}`);
  }
  if (row.tags) {
    console.log(`Tags:        ${row.tags}`);
  }

  if (row.user_story) {
    console.log('\n--- User Story ---');
    console.log(row.user_story);
  }

  if (row.background) {
    console.log('\n--- Background ---');
    console.log(row.background);
  }

  if (row.acceptance_criteria) {
    console.log('\n--- Acceptance Criteria ---');
    try {
      const acs = JSON.parse(row.acceptance_criteria);
      for (const ac of acs) {
        console.log(`  ${ac.id}: ${ac.title}`);
        if (ac.given) console.log(`    Given: ${ac.given}`);
        if (ac.when)  console.log(`    When:  ${ac.when}`);
        if (ac.then)  console.log(`    Then:  ${ac.then}`);
      }
    } catch {
      console.log(row.acceptance_criteria);
    }
  }

  if (row.tasks) {
    console.log('\n--- Tasks ---');
    try {
      const tasks = JSON.parse(row.tasks);
      for (const t of tasks) {
        console.log(`  ${t.id}: ${t.description}`);
        if (t.subtasks) {
          for (const st of t.subtasks) {
            console.log(`    - ${st}`);
          }
        }
      }
    } catch {
      console.log(row.tasks);
    }
  }

  if (row.affected_files) {
    console.log('\n--- Affected Files ---');
    try {
      const files = JSON.parse(row.affected_files);
      for (const f of files) {
        console.log(`  ${f.change_type || 'modify'}: ${f.file}`);
      }
    } catch {
      console.log(row.affected_files);
    }
  }

  console.log('='.repeat(60));
}

function printSummary(db) {
  console.log('='.repeat(50));
  console.log('PCPT Story 統計摘要');
  console.log('='.repeat(50));

  const total = db.prepare('SELECT COUNT(*) AS c FROM stories').get().c;
  console.log(`\n總計: ${total} 筆 Story\n`);

  // 狀態分佈
  console.log('--- 狀態分佈 ---');
  const statuses = db.prepare(
    'SELECT status, COUNT(*) AS c FROM stories GROUP BY status ORDER BY c DESC'
  ).all();
  for (const s of statuses) {
    const bar = '#'.repeat(Math.min(40, Math.round(s.c / total * 40)));
    console.log(`  ${statusIcon(s.status).padEnd(14)} ${String(s.c).padStart(4)} ${bar}`);
  }

  // Epic 分佈
  console.log('\n--- Epic 分佈 ---');
  const epics = db.prepare(
    "SELECT epic_id, COUNT(*) AS c, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done FROM stories GROUP BY epic_id ORDER BY c DESC"
  ).all();
  for (const e of epics) {
    console.log(`  ${e.epic_id.padEnd(16)} ${String(e.c).padStart(4)} total, ${String(e.done).padStart(4)} done (${Math.round(e.done/e.c*100)}%)`);
  }

  // Domain 分佈
  console.log('\n--- Domain 分佈 ---');
  const domains = db.prepare(
    'SELECT domain, COUNT(*) AS c FROM stories GROUP BY domain ORDER BY c DESC LIMIT 15'
  ).all();
  for (const d of domains) {
    console.log(`  ${d.domain.padEnd(20)} ${String(d.c).padStart(4)}`);
  }

  console.log('='.repeat(50));
}

function printMarkdown(rows) {
  if (rows.length === 0) {
    console.log('(無結果)');
    return;
  }

  console.log('| Story ID | Title | Status | Priority | Complexity | Epic |');
  console.log('|----------|-------|--------|----------|------------|------|');
  for (const r of rows) {
    console.log(`| ${r.story_id} | ${r.title} | ${r.status} | ${r.priority || '-'} | ${r.complexity || '-'} | ${r.epic_id} |`);
  }
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  const opts = parseArgs();
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');

  // 統計摘要模式
  if (opts.summary) {
    printSummary(db);
    db.close();
    return;
  }

  // 單一 Story 詳情
  if (opts.id) {
    const row = db.prepare('SELECT * FROM stories WHERE story_id = ?').get(opts.id);
    if (opts.format === 'json') {
      console.log(JSON.stringify(row, null, 2));
    } else {
      printDetail(row);
    }
    db.close();
    return;
  }

  // FTS 搜尋
  if (opts.search) {
    if (opts.search.length < 3) {
      console.error('FTS 搜尋需要至少 3 個字元 (trigram tokenizer 限制)');
      db.close();
      process.exit(1);
    }

    const rows = db.prepare(`
      SELECT s.* FROM stories s
      JOIN stories_fts f ON s.rowid = f.rowid
      WHERE stories_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(opts.search);

    if (opts.format === 'json') {
      console.log(JSON.stringify(rows, null, 2));
    } else if (opts.format === 'markdown') {
      printMarkdown(rows);
    } else {
      console.log(`搜尋: "${opts.search}" (${rows.length} 筆結果)\n`);
      printTable(rows);
    }
    db.close();
    return;
  }

  // 條件查詢
  let sql = 'SELECT * FROM stories WHERE 1=1';
  const params = [];

  if (opts.epic) {
    sql += ' AND epic_id = ?';
    params.push(opts.epic);
  }

  if (opts.status.length > 0) {
    sql += ` AND status IN (${opts.status.map(() => '?').join(',')})`;
    params.push(...opts.status);
  }

  if (opts.domain) {
    sql += ' AND domain = ?';
    params.push(opts.domain);
  }

  sql += ' ORDER BY epic_id, story_id';

  const rows = db.prepare(sql).all(...params);

  if (opts.format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
  } else if (opts.format === 'markdown') {
    printMarkdown(rows);
  } else {
    printTable(rows);
  }

  db.close();
}

main();
