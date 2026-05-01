#!/usr/bin/env node
// ============================================================
// query-preprune.js — CLI for querying compaction_preprune records
// Story: td-37-tool-output-preprune
// ============================================================
// Usage:
//   node .context-db/scripts/query-preprune.js                    # 近 7 天全部
//   node .context-db/scripts/query-preprune.js --session <id>     # 按 session 過濾
//   node .context-db/scripts/query-preprune.js --tool Read        # 按 tool 名稱過濾
//   node .context-db/scripts/query-preprune.js --since 1d         # 近 N 天 (1d/7d/14d)
//   node .context-db/scripts/query-preprune.js --limit 20         # 限制筆數
// ============================================================

import { fileURLToPath } from 'url';
import path from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function parseArgs(argv) {
  const args = { since: '7d', limit: 60, session: null, tool: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--session' && argv[i + 1]) { args.session = argv[++i]; }
    else if (argv[i] === '--tool' && argv[i + 1]) { args.tool = argv[++i]; }
    else if (argv[i] === '--since' && argv[i + 1]) { args.since = argv[++i]; }
    else if (argv[i] === '--limit' && argv[i + 1]) { args.limit = parseInt(argv[++i], 10) || 60; }
  }
  return args;
}

function parseSince(since) {
  const match = since.match(/^(\d+)d$/);
  if (!match) return 7;
  return parseInt(match[1], 10) || 7;
}

function main() {
  const args = parseArgs(process.argv);
  const days = parseSince(args.since);

  const db = new Database(DB_PATH, { readonly: true });

  // Compute cutoff in Taiwan time (UTC+8) — consistent format with DB stored timestamps
  const cutoff = new Date(Date.now() - days * 86400000)
    .toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
  let sql = `SELECT id, session_id, timestamp, title, tags, LENGTH(content) as content_len
             FROM context_entries
             WHERE category = 'compaction_preprune'
               AND timestamp > ?`;
  const params = [cutoff];

  if (args.session) {
    sql += ` AND session_id = ?`;
    params.push(args.session);
  }
  if (args.tool) {
    sql += ` AND tags LIKE ?`;
    params.push(`%tool=${args.tool}%`);
  }

  sql += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(args.limit);

  const rows = db.prepare(sql).all(...params);
  db.close();

  if (rows.length === 0) {
    console.log(`No compaction_preprune records found (since ${days}d)`);
    return;
  }

  console.log(`## Compaction Preprune Records (since ${days}d, ${rows.length} found)\n`);
  console.log('| # | Timestamp | Tool | Title | Size |');
  console.log('|:-:|-----------|------|-------|-----:|');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const toolMatch = (r.tags || '').match(/tool=(\w+)/);
    const tool = toolMatch ? toolMatch[1] : '?';
    const title = (r.title || '').slice(0, 60);
    const sizeKB = (r.content_len / 1024).toFixed(1);
    console.log(`| ${i + 1} | ${r.timestamp || '?'} | ${tool} | ${title} | ${sizeKB}KB |`);
  }

  console.log(`\nTotal: ${rows.length} records`);
}

main();
