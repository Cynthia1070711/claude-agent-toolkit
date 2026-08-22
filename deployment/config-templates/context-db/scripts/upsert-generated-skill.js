// ============================================================
// upsert-generated-skill.js — 技能池 CLI 工具
// ecc-emergence-ui-v2 AC6: generated_skills 表 CRUD
// cmd: add / pause / delete / list
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
    process.stderr.write(`[upsert-generated-skill] ledger append error: ${err.message}\n`);
  }
}

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

// ── cmdAdd — 新增技能記錄 ────────────────────────────────────
function cmdAdd(args) {
  const { instinct_cluster_id, skill_path } = args;
  if (!instinct_cluster_id?.trim()) { console.error('ERROR: --instinct-cluster-id 必填'); process.exit(1); }
  if (!skill_path?.trim()) { console.error('ERROR: --skill-path 必填'); process.exit(1); }
  const db = getDb();
  const now = getTaiwanTimestamp();
  const result = db.prepare(
    'INSERT OR IGNORE INTO generated_skills (instinct_cluster_id, skill_path, status, generated_at) VALUES (?, ?, \'active\', ?)'
  ).run(instinct_cluster_id.trim(), skill_path.trim(), now);
  const id = result.lastInsertRowid;
  appendLedger('generated_skills', 'add', { id, instinct_cluster_id: instinct_cluster_id.trim(), skill_path: skill_path.trim(), generated_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id, skill_path: skill_path.trim(), status: 'active' }));
}

// ── cmdPause — 停用技能 ──────────────────────────────────────
function cmdPause(args) {
  const { id } = args;
  if (!id) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, status FROM generated_skills WHERE id = ?').get(Number(id));
  if (!row) { console.error(`ERROR: generated_skill id=${id} 不存在`); process.exit(1); }
  const now = getTaiwanTimestamp();
  db.prepare("UPDATE generated_skills SET status = 'paused', paused_at = ? WHERE id = ?").run(now, Number(id));
  appendLedger('generated_skills', 'pause', { id: Number(id), paused_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: Number(id), status: 'paused' }));
}

// ── cmdDelete — 刪除技能 (soft delete) ──────────────────────
function cmdDelete(args) {
  const { id } = args;
  if (!id) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, instinct_cluster_id FROM generated_skills WHERE id = ?').get(Number(id));
  if (!row) { console.error(`ERROR: generated_skill id=${id} 不存在`); process.exit(1); }
  const now = getTaiwanTimestamp();
  db.prepare("UPDATE generated_skills SET status = 'deleted', deleted_at = ? WHERE id = ?").run(now, Number(id));
  appendLedger('generated_skills', 'delete', { id: Number(id), deleted_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: Number(id), status: 'deleted' }));
}

// ── cmdList — 列出技能 ──────────────────────────────────────
function cmdList(args) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT gs.*, em.improvement_pct, em.before_freq, em.after_freq FROM generated_skills gs LEFT JOIN effect_metrics em ON em.skill_id = gs.id AND em.measured_at = (SELECT MAX(measured_at) FROM effect_metrics WHERE skill_id = gs.id) WHERE gs.status != 'deleted' ORDER BY gs.status, gs.generated_at DESC"
  ).all();
  db.close();
  console.log(JSON.stringify({ ok: true, skills: rows, total: rows.length }));
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
      case 'add':    cmdAdd(rest);    break;
      case 'pause':  cmdPause(rest);  break;
      case 'delete': cmdDelete(rest); break;
      case 'list':   cmdList(rest);   break;
      default: console.error(`ERROR: 未知 cmd: ${cmd}`); process.exit(1);
    }
  } else {
    const parsed = parseArgs(rawArgs);
    switch (parsed._cmd) {
      case 'add':    cmdAdd(parsed);    break;
      case 'pause':  cmdPause(parsed);  break;
      case 'delete': cmdDelete(parsed); break;
      case 'list':   cmdList(parsed);   break;
      default:
        console.log(`upsert-generated-skill.js — 技能池 CLI\n  add --instinct-cluster-id X --skill-path Y\n  pause --id N\n  delete --id N\n  list`);
        process.exit(0);
    }
  }
}
