#!/usr/bin/env node
// ============================================================
// query-violations.js — CLI stats over context_entries.category='rule_violation'
// Spec: ctr-p2-violation-tracker AC5, Task 3.1-3.5
// ============================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export const CATEGORY = 'rule_violation';
export const BASELINE_30D = 8;          // MEMORY.md Core Rules 2026-04 前半 baseline
export const YELLOW_MULTIPLIER = 1.2;   // AC5: > baseline * 1.2 → RED

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'context-memory.db');

const USAGE = `
Usage: node query-violations.js [options]
  [--since YYYY-MM-DD]   (optional) custom start date; default = 60d ago
  [--since-days N]       (optional) shorthand: N days ago; mutually exclusive with --since
  [--phase <phase>]      (optional) filter by workflow_phase
  [--rule <path>]        (optional) filter by violated_rule_path
  [--limit N]            (optional) timeline limit, default 20
  [--format json|table]  (optional) output format, default table
  [--db <path>]          (optional) sqlite db path
`.trim();

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function classifyStatus(count30d, baseline = BASELINE_30D, mult = YELLOW_MULTIPLIER) {
  if (count30d <= baseline) return 'GREEN';
  if (count30d <= baseline * mult) return 'YELLOW';
  return 'RED';
}

function daysAgoISO(days, now = new Date()) {
  // Taiwan-local date (UTC+8) — align with tools/dev-console ruleViolationService.ts:80
  const taiwanMs = now.getTime() - days * 86400000 + 8 * 3600000;
  return new Date(taiwanMs).toISOString().slice(0, 10);
}

function parseContent(content) {
  try { return JSON.parse(content); } catch { return {}; }
}

export function computeStats(rows, { since60dISO, since30dISO, baseline = BASELINE_30D } = {}) {
  const total_60d = rows.filter(r => r.timestamp >= since60dISO).length;
  const total_30d_rolling = rows.filter(r => r.timestamp >= since30dISO).length;
  const baseline_compare_pct = baseline > 0
    ? Math.round(((total_30d_rolling - baseline) / baseline) * 100)
    : 0;

  const byRule = new Map();
  const byPhase = new Map();
  for (const r of rows) {
    if (r.timestamp < since60dISO) continue;
    const meta = parseContent(r.content);
    const rule = meta.violated_rule_path || r.related_files || '(unknown)';
    const phase = meta.workflow_phase || '(unknown)';
    const rEntry = byRule.get(rule) || { rule, count: 0, last_timestamp: '' };
    rEntry.count += 1;
    if (r.timestamp > rEntry.last_timestamp) rEntry.last_timestamp = r.timestamp;
    byRule.set(rule, rEntry);
    byPhase.set(phase, (byPhase.get(phase) || 0) + 1);
  }
  const by_rule = [...byRule.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const by_phase = [...byPhase.entries()].map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total_60d,
    total_30d_rolling,
    baseline,
    baseline_compare_pct,
    status: classifyStatus(total_30d_rolling, baseline),
    by_rule,
    by_phase,
  };
}

export function queryRows(db, { sinceISO, phase, rule, limit = 1000 } = {}) {
  const conds = [`category = ?`];
  const params = [CATEGORY];
  if (sinceISO) { conds.push(`timestamp >= ?`); params.push(sinceISO); }
  if (rule) { conds.push(`related_files = ?`); params.push(rule); }
  const sql = `SELECT id, agent_id, timestamp, title, content, tags, related_files
               FROM context_entries WHERE ${conds.join(' AND ')}
               ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  if (!phase) return rows;
  return rows.filter(r => (parseContent(r.content).workflow_phase || '') === phase);
}

function renderTable(stats, timeline) {
  const lines = [];
  lines.push(`┌─ Rule Violation Stats ──────────────────────────`);
  lines.push(`│  total (60d): ${stats.total_60d}`);
  lines.push(`│  rolling 30d: ${stats.total_30d_rolling}  (baseline ${stats.baseline})`);
  lines.push(`│  vs baseline: ${stats.baseline_compare_pct >= 0 ? '+' : ''}${stats.baseline_compare_pct}%`);
  lines.push(`│  status:      ${stats.status}`);
  lines.push(`└─────────────────────────────────────────────────`);
  if (stats.by_rule.length) {
    lines.push('\nTop rules:');
    for (const r of stats.by_rule) lines.push(`  ${String(r.count).padStart(3)}x  ${r.rule}  (last: ${r.last_timestamp})`);
  }
  if (stats.by_phase.length) {
    lines.push('\nBy phase:');
    for (const p of stats.by_phase) lines.push(`  ${String(p.count).padStart(3)}x  ${p.phase}`);
  }
  if (timeline?.length) {
    lines.push(`\nRecent ${timeline.length} (timeline):`);
    for (const r of timeline) {
      const meta = parseContent(r.content);
      lines.push(`  ${r.timestamp}  [${meta.severity || '?'}] ${meta.workflow_phase || '?'} — ${meta.incident_summary || r.title}`);
    }
  }
  return lines.join('\n');
}

export function runQuery(argv, io = {}) {
  const stdout = io.stdout || (s => process.stdout.write(s));
  const stderr = io.stderr || (s => process.stderr.write(s));
  const dbFactory = io.dbFactory || (p => new Database(p, { readonly: true }));

  if (argv.includes('--help') || argv.includes('-h')) {
    stdout(USAGE + '\n');
    return { code: 0 };
  }
  const args = parseArgs(argv);
  const explicitSince = args.since && args.since !== true ? String(args.since).trim() : null;
  const sinceDaysRaw = args['since-days'] && args['since-days'] !== true ? String(args['since-days']) : null;
  if (explicitSince && sinceDaysRaw) {
    stderr(`Error: --since and --since-days are mutually exclusive\n`);
    return { code: 1 };
  }
  let sinceISO;
  if (explicitSince) {
    sinceISO = explicitSince;
  } else if (sinceDaysRaw) {
    const days = parseInt(sinceDaysRaw, 10);
    if (!Number.isFinite(days) || days <= 0) {
      stderr(`Error: --since-days must be a positive integer (got '${sinceDaysRaw}')\n`);
      return { code: 1 };
    }
    sinceISO = daysAgoISO(days);
  } else {
    sinceISO = daysAgoISO(60);
  }
  const since30dISO = daysAgoISO(30);
  const phase = args.phase && args.phase !== true ? String(args.phase) : null;
  const rule = args.rule && args.rule !== true ? String(args.rule) : null;
  const limit = args.limit && args.limit !== true ? parseInt(args.limit, 10) || 20 : 20;
  const format = args.format && args.format !== true ? String(args.format) : 'table';

  const dbPath = args.db && args.db !== true ? path.resolve(String(args.db)) : DEFAULT_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    stderr(`Error: DB not found: ${dbPath}\n`);
    return { code: 1 };
  }

  const db = dbFactory(dbPath);
  try {
    const allRows = queryRows(db, { sinceISO, phase, rule, limit: 10000 });
    const stats = computeStats(allRows, { since60dISO: sinceISO, since30dISO });
    const timeline = allRows.slice(0, limit);
    if (format === 'json') {
      stdout(JSON.stringify({ stats, timeline }, null, 2) + '\n');
    } else {
      stdout(renderTable(stats, timeline) + '\n');
    }
    return { code: 0, stats, timeline };
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    const { code } = runQuery(process.argv.slice(2));
    process.exit(code);
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  }
}
