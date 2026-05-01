#!/usr/bin/env node
// ============================================================
// backtest-rule-violation-detector.js — AC-4 quantitative verification
// ============================================================
// 對 detect-rule-violation-core 在歷史資料上回測 precision/recall:
//   - Recall: 已知 rule_violation records 是否被 detector 在 summary/title
//     文字中偵測到(self-verification,確認 keyword coverage)
//   - Precision (proxy): detector 在 30d session content 命中的 session,
//     是否有 ±72h 內的 rule_violation 記錄(weak proxy — ground truth 本身
//     under-reported,所以 precision 下限 ≈ 真實 precision 的下界)
//
// Story: td-rule-violation-auto-detect-hook AC-4
// Usage:
//   node backtest-rule-violation-detector.js --days 30 \
//     [--min-precision 0.8] [--min-recall 0.6] \
//     [--window-hours 72] [--output <md_path>] [--strict]
// ============================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCRIPT_DIR = __dirname;
const CORE_PATH = path.join(SCRIPT_DIR, 'detect-rule-violation-core.cjs');
const SQLITE_MODULE = path.join(SCRIPT_DIR, '..', 'node_modules', 'better-sqlite3');
const DEFAULT_DB_PATH = path.join(SCRIPT_DIR, '..', 'context-memory.db');

function parseArgs(argv) {
  const a = { days: 30, 'window-hours': 72, 'min-precision': 0.8, 'min-recall': 0.6, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || (typeof next === 'string' && next.startsWith('--'))) {
      a[key] = true;
    } else {
      a[key] = next;
      i++;
    }
  }
  if (typeof a.days === 'string') a.days = parseInt(a.days, 10) || 30;
  if (typeof a['window-hours'] === 'string') a['window-hours'] = parseInt(a['window-hours'], 10) || 72;
  if (typeof a['min-precision'] === 'string') a['min-precision'] = parseFloat(a['min-precision']);
  if (typeof a['min-recall'] === 'string') a['min-recall'] = parseFloat(a['min-recall']);
  return a;
}

function toMs(ts) {
  if (!ts) return NaN;
  const d = new Date(ts);
  const n = d.getTime();
  return Number.isFinite(n) ? n : NaN;
}

function loadDb(dbPath) {
  try {
    const Database = require(SQLITE_MODULE);
    return new Database(dbPath, { readonly: true });
  } catch (err) {
    return { error: err.message };
  }
}

function fetchRows(db, sql, params = []) {
  try {
    return { rows: db.prepare(sql).all(...params) };
  } catch (err) {
    return { error: err.message };
  }
}

function runBacktest(argv, io = {}) {
  const args = parseArgs(argv);
  const core = io.core || require(CORE_PATH);
  const dbPath = args.db || DEFAULT_DB_PATH;
  const out = io.stdout || (s => process.stdout.write(s));
  const err = io.stderr || (s => process.stderr.write(s));
  const nowMs = io.now || Date.now();
  const sinceMs = nowMs - args.days * 24 * 3600 * 1000;

  if (!fs.existsSync(dbPath)) {
    err(`[backtest] DB not found: ${dbPath}\n`);
    return { code: 1, reason: 'db_missing' };
  }

  const db = io.db || loadDb(dbPath);
  if (db.error) {
    err(`[backtest] failed to open DB: ${db.error}\n`);
    return { code: 1, reason: 'db_open_failed', detail: db.error };
  }

  const violQ = fetchRows(
    db,
    `SELECT id, timestamp, title, content FROM context_entries
     WHERE category = 'rule_violation'
     ORDER BY timestamp DESC`
  );
  if (violQ.error) {
    try { db.close(); } catch { /* ignore */ }
    err(`[backtest] violation query failed: ${violQ.error}\n`);
    return { code: 1, reason: 'viol_query_failed' };
  }
  const violations = (violQ.rows || []).map(r => {
    let parsed = null;
    try { parsed = JSON.parse(r.content || '{}'); } catch { parsed = {}; }
    const summary = (parsed && parsed.incident_summary) || '';
    return {
      id: r.id,
      timestamp: r.timestamp,
      ts_ms: toMs(r.timestamp),
      title: r.title || '',
      summary,
      full_text: `${r.title || ''}\n${summary}`,
    };
  });

  const sessionQ = fetchRows(
    db,
    `SELECT id, timestamp, title, content FROM context_entries
     WHERE category = 'session' AND timestamp >= ?
     ORDER BY timestamp DESC`,
    [new Date(sinceMs).toISOString()]
  );
  if (sessionQ.error) {
    try { db.close(); } catch { /* ignore */ }
    err(`[backtest] session query failed: ${sessionQ.error}\n`);
    return { code: 1, reason: 'session_query_failed' };
  }
  const sessions = sessionQ.rows || [];

  try { db.close(); } catch { /* ignore */ }

  // ── Recall: self-verification over all rule_violation records ──
  let recallTP = 0;
  const recallDetails = [];
  for (const v of violations) {
    const hits = core.detectViolations(v.full_text);
    const matched = hits.length > 0;
    if (matched) recallTP++;
    recallDetails.push({
      id: v.id,
      title: v.title.slice(0, 80),
      matched,
      top_keyword: matched
        ? (typeof hits[0].kw === 'string' ? hits[0].kw : hits[0].kw.source)
        : null,
    });
  }
  const recall = violations.length === 0 ? null : recallTP / violations.length;

  // ── Precision proxy: session hits cross-referenced with ±window violations ──
  const windowMs = args['window-hours'] * 3600 * 1000;
  let sessionHits = 0;
  let sessionHitsWithMatch = 0;
  const hitDetails = [];
  for (const s of sessions) {
    const textContent = s.content || '';
    const scanText = `${s.title || ''}\n${textContent}`;
    const hits = core.detectViolations(scanText);
    if (hits.length === 0) continue;
    sessionHits++;
    const sessionMs = toMs(s.timestamp);
    const hasMatchingViolation = violations.some(v =>
      Number.isFinite(v.ts_ms) && Number.isFinite(sessionMs)
      && Math.abs(v.ts_ms - sessionMs) <= windowMs
    );
    if (hasMatchingViolation) sessionHitsWithMatch++;
    hitDetails.push({
      session_id: s.id,
      timestamp: s.timestamp,
      title: (s.title || '').slice(0, 80),
      top_keyword: typeof hits[0].kw === 'string' ? hits[0].kw : hits[0].kw.source,
      matched_violation: hasMatchingViolation,
    });
  }
  const precision = sessionHits === 0 ? null : sessionHitsWithMatch / sessionHits;

  const report = {
    generated_at: new Date(nowMs).toISOString(),
    window_days: args.days,
    violation_records: violations.length,
    sessions_scanned: sessions.length,
    sessions_with_keyword_hit: sessionHits,
    sessions_with_keyword_and_violation_within_window: sessionHitsWithMatch,
    window_hours: args['window-hours'],
    recall_over_known_violations: recall,
    precision_proxy: precision,
    thresholds: {
      min_precision: args['min-precision'],
      min_recall: args['min-recall'],
    },
    recall_pass: recall === null ? null : recall >= args['min-recall'],
    precision_pass: precision === null ? null : precision >= args['min-precision'],
    notes: [
      'Recall is computed over known rule_violation records (ground truth incident_summary self-verification).',
      'Precision is a weak proxy because ground truth (manual log_rule_violation hits) is under-reported — a session hit without a nearby violation record may reflect under-logging, not a false positive.',
      'Goal: use this tool as a monitoring aid for Phase 3 uplift assessment, not as a strict PASS/FAIL gate.',
    ],
  };

  const md = formatMarkdown(report, recallDetails, hitDetails);
  if (args.output) {
    try {
      fs.mkdirSync(path.dirname(args.output), { recursive: true });
      fs.writeFileSync(args.output, md, 'utf8');
    } catch (e) {
      err(`[backtest] failed to write output: ${e.message}\n`);
    }
  }
  out(md);
  out('\n\n' + summaryLine(report) + '\n');

  const strictMode = args.strict === true;
  const thresholdsMet = (report.recall_pass !== false) && (report.precision_pass !== false);
  const code = strictMode && !thresholdsMet ? 1 : 0;
  return { code, report };
}

function summaryLine(r) {
  const rec = r.recall_over_known_violations;
  const pre = r.precision_proxy;
  const fmt = x => x === null ? 'n/a' : (x * 100).toFixed(1) + '%';
  return `[backtest] recall=${fmt(rec)} (≥ ${(r.thresholds.min_recall * 100).toFixed(0)}%), precision_proxy=${fmt(pre)} (≥ ${(r.thresholds.min_precision * 100).toFixed(0)}%)`;
}

function formatMarkdown(report, recallDetails, hitDetails) {
  const lines = [];
  lines.push(`# Rule Violation Detector Backtest Report`);
  lines.push('');
  lines.push(`- Generated: ${report.generated_at}`);
  lines.push(`- Window: last ${report.window_days} days (violation cross-reference ±${report.window_hours}h)`);
  lines.push(`- Sessions scanned: ${report.sessions_scanned}`);
  lines.push(`- Violation records: ${report.violation_records}`);
  lines.push('');
  lines.push(`## Metrics`);
  lines.push('');
  lines.push(`| Metric | Value | Threshold | Pass |`);
  lines.push(`|--------|-------|-----------|------|`);
  const pct = x => x === null ? 'n/a' : (x * 100).toFixed(1) + '%';
  const pass = b => b === null ? '—' : (b ? '✅' : '❌');
  lines.push(`| Recall (over known violations) | ${pct(report.recall_over_known_violations)} | ≥ ${(report.thresholds.min_recall * 100).toFixed(0)}% | ${pass(report.recall_pass)} |`);
  lines.push(`| Precision proxy (session ±${report.window_hours}h) | ${pct(report.precision_proxy)} | ≥ ${(report.thresholds.min_precision * 100).toFixed(0)}% | ${pass(report.precision_pass)} |`);
  lines.push('');
  lines.push(`## Notes`);
  for (const n of report.notes) lines.push(`- ${n}`);
  lines.push('');
  if (recallDetails.length > 0) {
    lines.push(`## Recall Per-Record (first 20)`);
    lines.push('');
    lines.push(`| id | matched | top_keyword | title |`);
    lines.push(`|----|---------|-------------|-------|`);
    for (const d of recallDetails.slice(0, 20)) {
      lines.push(`| ${d.id} | ${d.matched ? '✅' : '❌'} | ${d.top_keyword || '—'} | ${d.title.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  if (hitDetails.length > 0) {
    lines.push(`## Session Hits Per-Record (first 20)`);
    lines.push('');
    lines.push(`| session_id | ts | keyword | match | title |`);
    lines.push(`|------------|----|---------|-------|-------|`);
    for (const h of hitDetails.slice(0, 20)) {
      lines.push(`| ${h.session_id} | ${h.timestamp} | ${h.top_keyword} | ${h.matched_violation ? '✅' : '❌'} | ${h.title.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { parseArgs, runBacktest, formatMarkdown, summaryLine };

if (require.main === module) {
  try {
    const { code } = runBacktest(process.argv.slice(2));
    process.exit(code);
  } catch (e) {
    process.stderr.write(`Fatal: ${e.message}\n`);
    process.exit(1);
  }
}
