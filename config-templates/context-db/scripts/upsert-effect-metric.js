// ============================================================
// upsert-effect-metric.js — 技能效果量測 CLI 工具
// ecc-emergence-ui-v2 AC8: effect_metrics 表
// cmd: record / get-latest
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const LEDGER_PATH = path.join(__dirname, '..', 'ledger.jsonl');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function appendLedger(table, operation, data) {
  try {
    const entry = JSON.stringify({ ts: getTaiwanTimestamp(), table, op: operation, data });
    fs.appendFileSync(LEDGER_PATH, entry + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[upsert-effect-metric] ledger append error: ${err.message}\n`);
  }
}

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

// ── cmdRecord — 記錄效果量測 ─────────────────────────────────
function cmdRecord(args) {
  const { skill_id, before_freq, after_freq, sample_window_days } = args;
  if (!skill_id) { console.error('ERROR: --skill-id 必填'); process.exit(1); }
  const bf = Number(before_freq ?? 0);
  const af = Number(after_freq ?? 0);
  const improvement_pct = bf === 0 ? 0 : Math.round((bf - af) / bf * 100);
  const db = getDb();
  const now = getTaiwanTimestamp();
  const windowDays = Number(sample_window_days ?? 7);
  const result = db.prepare(
    'INSERT INTO effect_metrics (skill_id, before_freq, after_freq, improvement_pct, measured_at, sample_window_days) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(Number(skill_id), bf, af, improvement_pct, now, windowDays);
  appendLedger('effect_metrics', 'record', { id: result.lastInsertRowid, skill_id: Number(skill_id), before_freq: bf, after_freq: af, improvement_pct, measured_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: result.lastInsertRowid, skill_id: Number(skill_id), improvement_pct }));
}

// ── cmdGetLatest — 取最新量測 ────────────────────────────────
function cmdGetLatest(args) {
  const { skill_id } = args;
  if (!skill_id) { console.error('ERROR: --skill-id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM effect_metrics WHERE skill_id = ? ORDER BY measured_at DESC LIMIT 1'
  ).get(Number(skill_id));
  db.close();
  console.log(JSON.stringify({ ok: true, metric: row ?? null }));
}

// ── CLI arg parser ──────────────────────────────────────────
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      result[key] = val;
    } else if (!result._cmd) {
      result._cmd = arg;
    }
  }
  return result;
}

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMainModule) {
  const rawArgs = process.argv.slice(2);
  const inlineIdx = rawArgs.indexOf('--inline');
  if (inlineIdx !== -1) {
    const payload = JSON.parse(rawArgs[inlineIdx + 1] || '{}');
    const { cmd, ...rest } = payload;
    switch (cmd) {
      case 'record':     cmdRecord(rest);    break;
      case 'get-latest': cmdGetLatest(rest); break;
      default: console.error(`ERROR: 未知 cmd: ${cmd}`); process.exit(1);
    }
  } else {
    const parsed = parseArgs(rawArgs);
    switch (parsed._cmd) {
      case 'record':     cmdRecord(parsed);    break;
      case 'get-latest': cmdGetLatest(parsed); break;
      default:
        console.log(`upsert-effect-metric.js — 技能效果量測 CLI\n  record --skill-id N --before-freq N --after-freq N [--sample-window-days 7]\n  get-latest --skill-id N`);
        process.exit(0);
    }
  }
}
