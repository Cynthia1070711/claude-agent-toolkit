// ============================================================
// PhyCool Context Memory DB — Instinct 寫入/更新 CLI 工具
// ECC-07: ecc-instincts registry MCP tools 配套 CLI
// 用途: Pipeline / CLI 直接操作 instincts 表 (add / decay / promote)
// ============================================================
// 使用方式:
//   node .context-db/scripts/upsert-instinct.js add --trigger "..." --action "..." --confidence 0.8 --scope project
//   node .context-db/scripts/upsert-instinct.js decay --id inst_xxx --amount 0.1
//   node .context-db/scripts/upsert-instinct.js promote --id inst_xxx
//   node .context-db/scripts/upsert-instinct.js search --scope project --min-confidence 0.7
//   node .context-db/scripts/upsert-instinct.js --inline '{"cmd":"add","trigger":"...","action":"...","confidence":0.9,"scope":"project"}'
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const LEDGER_PATH = path.join(__dirname, '..', 'ledger.jsonl');

import fs from 'fs';

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function appendLedger(table, operation, data) {
  try {
    const entry = JSON.stringify({ ts: getTaiwanTimestamp(), table, op: operation, data });
    fs.appendFileSync(LEDGER_PATH, entry + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[upsert-instinct] ledger append error: ${err.message}\n`);
  }
}

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

// ── normRejectKey — canonical 正規化 (AC1 exact spec) ──
// 對 (trigger + '|' + action) lowercase + trim + collapse ws + 去標點(保留字母/數字/空白/分隔符)
export function normRejectKey(trigger, action) {
  return (trigger + '|' + action)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} |]/gu, '');
}

// ── cmd: add ──
function cmdAdd(args) {
  const { trigger, action, confidence, scope, domain, source, source_session_id, evidence_jsonb, verifier_status, verifier_reason, project_type, business, adoption_score } = args;

  if (!trigger?.trim()) { console.error('ERROR: --trigger 必填'); process.exit(1); }
  if (!action?.trim())  { console.error('ERROR: --action 必填');  process.exit(1); }
  if (confidence == null || isNaN(Number(confidence))) { console.error('ERROR: --confidence 必填 (0.0~1.0)'); process.exit(1); }
  const confNum = Number(confidence);
  if (confNum < 0 || confNum > 1) { console.error('ERROR: confidence 必須介於 0.0~1.0'); process.exit(1); }
  if (!scope?.trim()) { console.error('ERROR: --scope 必填'); process.exit(1); }
  if (!['session', 'pipeline-session', 'project', 'global'].includes(scope)) {
    console.error(`ERROR: scope 必須為 session/pipeline-session/project/global，收到: ${scope}`); process.exit(1);
  }
  if (verifier_status && !['approved', 'rejected', 'needs-more-evidence'].includes(verifier_status)) {
    console.error(`ERROR: verifier_status 必須為 approved/rejected/needs-more-evidence`); process.exit(1);
  }
  // ── ecc D5 採納分數欄位 (ADR-ECC-LEARNING-001 v1.4.0) ──
  let adoptionScore = 3; // 未傳 → 對齊 DB DEFAULT 3 (project 預設底分); consolidator 會明確傳入
  if (adoption_score != null && adoption_score !== true) {
    const n = Number(adoption_score);
    if (isNaN(n) || n < 0 || n > 5) { console.error('ERROR: adoption_score 必須介於 0~5'); process.exit(1); }
    adoptionScore = Math.round(n);
  }
  const projectTypeVal = (typeof project_type === 'string' && ['pcpt-business', 'env-tooling', 'workflow'].includes(project_type)) ? project_type : null;
  const businessVal = (typeof business === 'string' && business.trim()) ? business.trim() : null;

  const db = getDb();
  const now = getTaiwanTimestamp();

  // Search-first: check (trigger, scope) UNIQUE
  const existing = db.prepare('SELECT id FROM instincts WHERE trigger = ? AND scope = ?').get(trigger.trim(), scope.trim());
  const triggerSlug = trigger.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const scopeSlug = scope.trim().replace(/-/g, '_');
  const id = existing ? existing.id : `inst_${triggerSlug}_${scopeSlug}_${Date.now().toString(36)}`;
  const status = existing ? 'updated' : 'created';

  db.prepare(`
    INSERT INTO instincts (
      id, trigger, action, confidence, scope, domain, source, source_session_id,
      evidence_jsonb, verifier_status, verifier_reason, created_at, last_seen, decay_at,
      project_type, business, adoption_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(trigger, scope) DO UPDATE SET
      action            = excluded.action,
      confidence        = excluded.confidence,
      domain            = excluded.domain,
      source            = excluded.source,
      source_session_id = excluded.source_session_id,
      evidence_jsonb    = excluded.evidence_jsonb,
      verifier_status   = excluded.verifier_status,
      verifier_reason   = excluded.verifier_reason,
      last_seen         = excluded.last_seen,
      decay_at          = NULL,
      project_type      = excluded.project_type,
      business          = excluded.business,
      adoption_score    = excluded.adoption_score
  `).run(
    id, trigger.trim(), action.trim(), confNum, scope.trim(),
    domain || null, source || null, source_session_id || null,
    evidence_jsonb || null, verifier_status || null, verifier_reason || null,
    now, now,
    projectTypeVal, businessVal, adoptionScore,
  );

  appendLedger('instincts', status === 'created' ? 'add' : 'update', {
    id, trigger: trigger.trim(), scope: scope.trim(), confidence: confNum, domain: domain || null, created_at: now,
  });
  db.close();

  console.log(JSON.stringify({ id, status, trigger: trigger.trim(), scope: scope.trim(), confidence: confNum }));
}

// ── cmd: decay ──
function cmdDecay(args) {
  const { id, amount = 0.1 } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const decayAmount = Math.abs(Number(amount) || 0.1);

  const db = getDb();
  const row = db.prepare('SELECT id, confidence FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }

  const newConf = Math.max(0, row.confidence - decayAmount);
  const now = getTaiwanTimestamp();
  const decayAt = newConf < 0.3 ? now : null;

  if (decayAt) {
    db.prepare('UPDATE instincts SET confidence = ?, last_seen = ?, decay_at = ? WHERE id = ?').run(newConf, now, decayAt, id.trim());
  } else {
    db.prepare('UPDATE instincts SET confidence = ?, last_seen = ? WHERE id = ?').run(newConf, now, id.trim());
  }

  appendLedger('instincts', 'decay', { id: id.trim(), old_confidence: row.confidence, new_confidence: newConf, decay_amount: decayAmount, decay_at: decayAt, last_seen: now });
  db.close();

  console.log(JSON.stringify({ id: id.trim(), new_confidence: newConf, decay_at: decayAt }));
}

// ── cmd: promote ──
function cmdPromote(args) {
  const { id } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }

  const db = getDb();
  const row = db.prepare('SELECT id, trigger, scope, confidence, verifier_status FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }

  if (row.scope === 'global') {
    console.log(JSON.stringify({ ok: false, reason: 'Instinct 已是 global scope，無需晉升', id: id.trim() }));
    db.close(); return;
  }
  if (row.scope !== 'project') {
    console.log(JSON.stringify({ ok: false, reason: `promote 僅適用 scope=project 的 Instinct（目前 scope=${row.scope}）`, id: id.trim() }));
    db.close(); return;
  }
  if (row.confidence < 0.8) {
    console.log(JSON.stringify({ ok: false, reason: `confidence ${row.confidence} < 0.8，未達晉升門檻`, id: id.trim(), required_confidence: 0.8 }));
    db.close(); return;
  }
  if (row.verifier_status !== 'approved') {
    console.log(JSON.stringify({ ok: false, reason: `verifier_status="${row.verifier_status}"，promote 需 "approved"`, id: id.trim() }));
    db.close(); return;
  }

  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts SET scope = ?, last_seen = ? WHERE id = ?').run('global', now, id.trim());
  appendLedger('instincts', 'promote', { id: id.trim(), trigger: row.trigger, from_scope: 'project', to_scope: 'global', confidence: row.confidence, promoted_at: now });
  db.close();

  console.log(JSON.stringify({ ok: true, scope: 'global', id: id.trim(), trigger: row.trigger, confidence: row.confidence }));
}

// ── cmd: search ──
function cmdSearch(args) {
  const { query = '', scope, min_confidence, domain, verifier_status, limit = 20 } = args;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

  const db = getDb();
  const params = [];
  let sql = 'SELECT * FROM instincts WHERE 1=1';

  if (scope)           { sql += ' AND scope = ?';            params.push(scope); }
  if (min_confidence != null) { sql += ' AND confidence >= ?'; params.push(Number(min_confidence)); }
  if (domain)          { sql += ' AND domain = ?';           params.push(domain); }
  if (verifier_status) { sql += ' AND verifier_status = ?';  params.push(verifier_status); }
  if (query && query.trim() !== '') {
    sql += ' AND (trigger LIKE ? OR action LIKE ?)';
    params.push('%' + query.trim() + '%', '%' + query.trim() + '%');
  }

  sql += ' ORDER BY confidence DESC, last_seen DESC LIMIT ?';
  params.push(safeLimit);

  const rows = db.prepare(sql).all(...params);
  db.close();

  console.log(JSON.stringify({ items: rows, total: rows.length }));
}

// ── cmdNote — 寫入 user_note (AC5) ──────────────────────────────
function cmdNote(args) {
  const { id, user_note } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts SET user_note = ? WHERE id = ?').run(user_note ?? null, id.trim());
  appendLedger('instincts', 'note', { id: id.trim(), user_note: user_note ?? null, updated_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), user_note: user_note ?? null }));
}

// ── cmdStar — 寫入 user_star_rating 1-10 (AC6) ─────────────────
function cmdStar(args) {
  const { id, user_star_rating } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const rating = (user_star_rating !== undefined && user_star_rating !== null)
    ? Number(user_star_rating) : null;
  // CR F4 修復:加 Number.isInteger 檢查(原僅檢範圍,Number('5.5')=5.5 會繞過 → DB INTEGER 欄位存入非整數)
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    console.error('ERROR: --user-star-rating 必須為 1-10 整數'); process.exit(1);
  }
  const db = getDb();
  const row = db.prepare('SELECT id FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts SET user_star_rating = ? WHERE id = ?').run(rating, id.trim());
  appendLedger('instincts', 'star', { id: id.trim(), user_star_rating: rating, updated_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), user_star_rating: rating }));
}

// ── cmdLike — confidence boost (AC2) ────────────────────────────
const LIKE_DELTA = 0.05;
function cmdLike(args) {
  const { id } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, confidence FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const newConf = Math.min(1.0, row.confidence + LIKE_DELTA);
  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts SET confidence = ?, last_seen = ?, decay_at = NULL WHERE id = ?').run(newConf, now, id.trim());
  appendLedger('instincts', 'like', { id: id.trim(), old_confidence: row.confidence, new_confidence: newConf, last_seen: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), new_confidence: newConf }));
}

// ── cmdDislike — confidence 扣分 (ecc-emergence-ui-v2 AC4) ─────────────
const DISLIKE_DELTA = 0.05;
function cmdDislike(args) {
  const { id } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, confidence FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const newConf = Math.max(0.0, row.confidence - DISLIKE_DELTA);
  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts SET confidence = ?, last_seen = ? WHERE id = ?').run(newConf, now, id.trim());
  appendLedger('instincts', 'dislike', { id: id.trim(), old_confidence: row.confidence, new_confidence: newConf, last_seen: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), new_confidence: newConf }));
}

// ── cmdRestore — 還原否決 (ecc-emergence-ui-v2 AC5) ──────────────────────
function cmdRestore(args) {
  const { id } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, trigger, action FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const nk = normRejectKey(row.trigger, row.action);
  const now = getTaiwanTimestamp();
  db.prepare('UPDATE instincts_rejected SET restored_at = ? WHERE norm_key = ? AND restored_at IS NULL').run(now, nk);
  db.prepare("UPDATE instincts SET verifier_status = 'needs-more-evidence' WHERE id = ?").run(id.trim());
  appendLedger('instincts_rejected', 'restore', { instinct_id: id.trim(), norm_key: nk, restored_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), norm_key: nk, restored_at: now }));
}

// ── cmdReject — 否決寫 instincts_rejected + 更新 verifier_status (AC3) ──
function cmdReject(args) {
  const { id, reason } = args;
  if (!id?.trim()) { console.error('ERROR: --id 必填'); process.exit(1); }
  const db = getDb();
  const row = db.prepare('SELECT id, trigger, action FROM instincts WHERE id = ?').get(id.trim());
  if (!row) { console.error(`ERROR: Instinct id=${id} 不存在`); process.exit(1); }
  const nk = normRejectKey(row.trigger, row.action);
  const now = getTaiwanTimestamp();
  const existing = db.prepare('SELECT id FROM instincts_rejected WHERE norm_key = ?').get(nk);
  if (existing) {
    db.prepare('UPDATE instincts_rejected SET reject_count = reject_count + 1, rejected_at = ? WHERE norm_key = ?').run(now, nk);
  } else {
    db.prepare('INSERT INTO instincts_rejected (trigger, action, reject_reason, norm_key, reject_count, rejected_at) VALUES (?, ?, ?, ?, 1, ?)').run(row.trigger, row.action, reason ?? null, nk, now);
  }
  db.prepare("UPDATE instincts SET verifier_status = 'rejected' WHERE id = ?").run(id.trim());
  appendLedger('instincts_rejected', 'reject', { instinct_id: id.trim(), norm_key: nk, reason: reason ?? null, updated_at: now });
  db.close();
  console.log(JSON.stringify({ ok: true, id: id.trim(), norm_key: nk }));
}

// ── CLI arg parser (minimalist, no deps) ──
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      // 保留 snake_case：將 --verifier-status 轉為 verifier_status (非 camelCase)
      const key = arg.slice(2).replace(/-/g, '_');
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      result[key] = val;
    } else if (!result._cmd) {
      result._cmd = arg;
    }
  }
  return result;
}

// ── Main (CLI entry guard — 允許 normRejectKey 等函式 import 復用 · ECC governance follow-up) ──
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] || '').href;

if (isMainModule) {
const rawArgs = process.argv.slice(2);

// --inline mode: JSON payload with cmd field
const inlineIdx = rawArgs.indexOf('--inline');
if (inlineIdx !== -1) {
  const payload = JSON.parse(rawArgs[inlineIdx + 1] || '{}');
  const { cmd, ...rest } = payload;
  switch (cmd) {
    case 'add':     cmdAdd(rest);    break;
    case 'decay':   cmdDecay(rest);  break;
    case 'promote': cmdPromote(rest); break;
    case 'search':  cmdSearch(rest); break;
    case 'note':    cmdNote(rest);   break;
    case 'star':    cmdStar(rest);   break;
    case 'like':    cmdLike(rest);    break;
    case 'reject':  cmdReject(rest);  break;
    case 'dislike': cmdDislike(rest); break;
    case 'restore': cmdRestore(rest); break;
    default: console.error(`ERROR: 未知 cmd: ${cmd}`); process.exit(1);
  }
} else {
  const parsed = parseArgs(rawArgs);
  const cmd = parsed._cmd;
  switch (cmd) {
    case 'add':     cmdAdd(parsed);    break;
    case 'decay':   cmdDecay(parsed);  break;
    case 'promote': cmdPromote(parsed); break;
    case 'search':  cmdSearch(parsed); break;
    case 'note':    cmdNote(parsed);   break;
    case 'star':    cmdStar(parsed);   break;
    case 'like':    cmdLike(parsed);   break;
    case 'reject':  cmdReject(parsed); break;
    case 'dislike': cmdDislike(parsed); break;
    case 'restore': cmdRestore(parsed); break;
    default:
      console.log(`
upsert-instinct.js — PhyCool ECC Instinct CLI (ECC-07)

Commands:
  add     --trigger "..." --action "..." --confidence 0.8 --scope project [--domain ...] [--source ...] [--verifier-status approved]
  decay   --id inst_xxx [--amount 0.1]
  promote --id inst_xxx
  search  [--scope project] [--min-confidence 0.7] [--domain ...] [--verifier-status approved] [--query "keyword"] [--limit 20]
  --inline '{"cmd":"add","trigger":"...","action":"...","confidence":0.8,"scope":"project"}'
`);
      process.exit(0);
  }
}
} // end if (isMainModule) — CLI entry guard
