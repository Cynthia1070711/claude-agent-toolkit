#!/usr/bin/env node
/**
 * otel-session-aggregate.js — SessionEnd Hook
 *
 * 讀取 OTel Micro Collector 的 JSONL 輸出，聚合 token 並回寫 workflow_executions。
 *
 * 雙模式：
 *   1. Per-Session 模式（OTEL_SESSION_JSONL env 存在）：
 *      → 讀取該 session 專屬 JSONL（完整歸屬，多視窗安全）
 *      → 聚合後 shutdown 該 session 的 collector
 *   2. Shared 模式（fallback）：
 *      → Glob-resilient: 掃描所有 main-otel-*.jsonl + marker 續讀
 *        優先讀 main-otel-info.json 的 PoT (collector 發佈的 active jsonl)
 *        + glob 所有 main-otel-{YYYY-MM-DD}.jsonl 作為安全網
 *      → Marker 以絕對路徑為 key，跨檔冪等（零重複、零遺失）
 *
 * Pipeline 記錄（agent_id IS NULL）絕不觸碰。
 *
 * Hook: SessionEnd (timeout: 5000ms)
 *
 * ── 2026-04-14 Rotation SSoT 機制 ──
 * 舊版推算 today 單檔的做法已廢棄 — 跨日時會 return 導致 token 遺失。
 * 新機制: 優先讀 collector 發佈的 info.json (SSoT)，glob 所有 jsonl 作為零遺失安全網。
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const http = require('http');

// ── Paths ──
const projectRoot = path.resolve(__dirname, '..');
const dbPath      = path.join(projectRoot, '.context-db', 'phycool.db');
const nodeModDir  = path.join(projectRoot, '.context-db', 'node_modules');
const configPath  = path.join(projectRoot, 'scripts', 'pipeline-config.json');
const logDir      = path.join(projectRoot, 'logs');
const markerPath  = path.join(logDir, 'main-otel-marker.json');
const infoJsonPath = path.join(logDir, 'main-otel-info.json');

// ── Per-Session env vars (set by start-main-otel.ps1) ──
const sessionJsonlPath = process.env.OTEL_SESSION_JSONL || '';
const sessionPort      = parseInt(process.env.OTEL_SESSION_PORT || '0', 10);

// ── Taiwan Timestamp ──
// TZ FIX (2026-05-29 · CRITICAL): 原 (offset - getTimezoneOffset()) 在台灣主機 getTimezoneOffset()=-480
//   → (480-(-480))=+16h 雙重 offset → started_at/completed_at 超前牆鐘 8h(workflow_executions 未來時間戳真兇)。
//   改用 Intl 台灣牆鐘(對齊 .context-db/scripts/timezone.js getTaiwanTimestamp SSoT 範式)。
function nowTs() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function todayStr() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
}

// ── Model key for pricing lookup ──
function getModelKey(rawModel) {
  if (!rawModel) return null;
  const m = rawModel.toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('fable'))  return 'fable';
  return null;
}

// ── Cost calculation (reuse pipeline-config.json pricing) ──
function calculateCost(inputT, outputT, cacheReadT, cacheCreateT, rawModel) {
  let pricing;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const key = getModelKey(rawModel);
    pricing = key ? cfg.modelPricing[key] : null;
  } catch (_) { pricing = null; }

  if (!pricing) return 0;
  const cost = (inputT       / 1_000_000 * pricing.input)
             + (outputT      / 1_000_000 * pricing.output)
             + (cacheCreateT / 1_000_000 * pricing.cache_create)
             + (cacheReadT   / 1_000_000 * pricing.cache_read);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ── Read all api_request entries from JSONL file ──
function readApiEntries(filePath, fromByte = 0) {
  if (!fs.existsSync(filePath)) return { entries: [], newOffset: 0 };
  const stat = fs.statSync(filePath);
  if (stat.size <= fromByte) return { entries: [], newOffset: fromByte };

  const buf = Buffer.alloc(stat.size - fromByte);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, buf.length, fromByte);
  fs.closeSync(fd);

  const entries = [];
  for (const line of buf.toString('utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record.type === 'api_request') entries.push(record);
    } catch (_) { }
  }
  return { entries, newOffset: stat.size };
}

// ── Marker (shared mode only) ──
function readMarker() {
  try { return JSON.parse(fs.readFileSync(markerPath, 'utf8')); }
  catch (_) { return {}; }
}
function writeMarker(marker) {
  try { fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf8'); }
  catch (_) { }
}

// ── Resolve all candidate jsonls (shared mode) ──
// Priority 1: info.json.jsonl (collector's currently active file, SSoT)
// Priority 2: glob main-otel-{YYYY-MM-DD}.jsonl in logDir (zero-loss safety net)
// Dedup: Set-based, returns array of absolute paths
function getSharedJsonlCandidates() {
  const results = new Set();

  // Priority 1: info.json
  if (fs.existsSync(infoJsonPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
      if (info.jsonl && fs.existsSync(info.jsonl)) {
        results.add(path.resolve(info.jsonl));
      }
    } catch (_) { /* corrupt info.json — fall through to glob */ }
  }

  // Priority 2: glob main-otel-{YYYY-MM-DD}.jsonl
  try {
    const files = fs.readdirSync(logDir);
    for (const f of files) {
      if (/^main-otel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) {
        results.add(path.resolve(path.join(logDir, f)));
      }
    }
  } catch (_) { /* logDir unreadable — return what we have */ }

  return [...results];
}

// ── Aggregate entries into token totals ──
function aggregateEntries(entries) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, model: '' };
  for (const e of entries) {
    totals.input      += e.input_tokens            || 0;
    totals.output     += e.output_tokens           || 0;
    totals.cacheRead  += e.cache_read_tokens       || 0;
    totals.cacheCreate += e.cache_creation_tokens   || 0;
    totals.cost       += e.cost_usd                || 0;
    if (!totals.model && e.model) totals.model = e.model;
  }
  return totals;
}

// ── Open DB ──
function openDb() {
  const Database = require(path.join(nodeModDir, 'better-sqlite3'));
  return new Database(dbPath);
}

// ── Shutdown collector (fire-and-forget) ──
function shutdownCollector(port) {
  if (!port) return;
  const req = http.request({
    hostname: '127.0.0.1', port, path: '/shutdown', method: 'POST', timeout: 2000
  });
  req.on('error', () => { }); // ignore errors
  req.end();
}

// ── Update zero-token workflow records with aggregated data ──
function updateRecords(db, entries) {
  const today = todayStr();

  // Find today's zero-token records from main window (agent_id NOT NULL)
  const zeroRecords = db.prepare(`
    SELECT id, workflow_type, story_id, agent_id, started_at, duration_ms, model
    FROM workflow_executions
    WHERE substr(started_at, 1, 10) = ?
      AND agent_id IS NOT NULL
      AND input_tokens = 0
      AND output_tokens = 0
    ORDER BY id ASC
  `).all(today);

  if (zeroRecords.length === 0) {
    // No matching records — create interactive-session with all tokens
    const totals = aggregateEntries(entries);
    if (totals.input === 0 && totals.output === 0) return 0;

    const computedCost = calculateCost(
      totals.input, totals.output, totals.cacheRead, totals.cacheCreate, totals.model
    );
    const now = nowTs();
    db.prepare(`
      INSERT INTO workflow_executions
        (workflow_type, story_id, agent_id, status, started_at, completed_at,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         cost_usd, model, duration_ms)
      VALUES ('interactive-session', NULL, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      process.env.CLAUDE_AGENT_ID || 'CC-OPUS',
      now, now,
      totals.input, totals.output, totals.cacheRead, totals.cacheCreate,
      computedCost > 0 ? computedCost : totals.cost,
      totals.model
    );
    return 1;
  }

  // Build time ranges and assign entries
  const ranges = zeroRecords.map(r => {
    const endMs = new Date(r.started_at).getTime();
    const durationMs = r.duration_ms || 600000;
    return {
      ...r,
      startMs: endMs - durationMs,
      endMs,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0 },
      detectedModel: r.model || '',
      count: 0,
    };
  });

  const unmatched = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, count: 0, model: '' };

  for (const entry of entries) {
    const entryMs = new Date(entry.ts).getTime();
    let matched = false;

    for (let i = ranges.length - 1; i >= 0; i--) {
      if (entryMs >= ranges[i].startMs && entryMs <= ranges[i].endMs) {
        ranges[i].tokens.input      += entry.input_tokens           || 0;
        ranges[i].tokens.output     += entry.output_tokens          || 0;
        ranges[i].tokens.cacheRead  += entry.cache_read_tokens      || 0;
        ranges[i].tokens.cacheCreate += entry.cache_creation_tokens  || 0;
        ranges[i].tokens.cost       += entry.cost_usd               || 0;
        ranges[i].count++;
        if (!ranges[i].detectedModel && entry.model) ranges[i].detectedModel = entry.model;
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmatched.input      += entry.input_tokens           || 0;
      unmatched.output     += entry.output_tokens          || 0;
      unmatched.cacheRead  += entry.cache_read_tokens      || 0;
      unmatched.cacheCreate += entry.cache_creation_tokens  || 0;
      unmatched.cost       += entry.cost_usd               || 0;
      unmatched.count++;
      if (!unmatched.model && entry.model) unmatched.model = entry.model;
    }
  }

  // UPDATE matched records
  const updateStmt = db.prepare(`
    UPDATE workflow_executions
    SET input_tokens = ?, output_tokens = ?,
        cache_read_tokens = ?, cache_creation_tokens = ?,
        cost_usd = ?, model = COALESCE(NULLIF(?, ''), model)
    WHERE id = ?
  `);

  let updated = 0;
  for (const r of ranges) {
    if (r.count === 0) continue;
    const cc = calculateCost(
      r.tokens.input, r.tokens.output, r.tokens.cacheRead, r.tokens.cacheCreate, r.detectedModel
    );
    updateStmt.run(
      r.tokens.input, r.tokens.output, r.tokens.cacheRead, r.tokens.cacheCreate,
      cc > 0 ? cc : r.tokens.cost, r.detectedModel, r.id
    );
    updated++;
  }

  // Unmatched → interactive-session
  if (unmatched.count > 0 && (unmatched.input > 0 || unmatched.output > 0)) {
    const cc = calculateCost(
      unmatched.input, unmatched.output, unmatched.cacheRead, unmatched.cacheCreate, unmatched.model
    );
    const now = nowTs();
    db.prepare(`
      INSERT INTO workflow_executions
        (workflow_type, story_id, agent_id, status, started_at, completed_at,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         cost_usd, model, duration_ms)
      VALUES ('interactive-session', NULL, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      process.env.CLAUDE_AGENT_ID || 'CC-OPUS', now, now,
      unmatched.input, unmatched.output, unmatched.cacheRead, unmatched.cacheCreate,
      cc > 0 ? cc : unmatched.cost, unmatched.model
    );
    updated++;
  }

  return updated;
}

// ── Main ──
function main() {
  let entries = [];
  let isPerSession = false;

  if (sessionJsonlPath && fs.existsSync(sessionJsonlPath)) {
    // ── Per-Session Mode ──
    isPerSession = true;
    const result = readApiEntries(sessionJsonlPath, 0);
    entries = result.entries;
  } else {
    // ── Shared Mode (glob-resilient, zero-loss) ──
    // 1) Resolve all candidate jsonls (info.json PoT + glob safety net)
    // 2) For each file: marker offset → read new entries → update marker
    // 3) Atomic-ish: read all first, write marker once at end
    const candidates = getSharedJsonlCandidates();
    if (candidates.length === 0) return;

    const marker = readMarker();
    const perFileStats = [];
    for (const jsonl of candidates) {
      const fromByte = marker[jsonl] || 0;
      const result = readApiEntries(jsonl, fromByte);
      if (result.entries.length > 0) {
        entries.push(...result.entries);
      }
      marker[jsonl] = result.newOffset;
      perFileStats.push({ file: path.basename(jsonl), entries: result.entries.length });
    }
    writeMarker(marker);

    // Diagnostic: which files contributed
    const contributing = perFileStats.filter(s => s.entries > 0);
    if (contributing.length > 0) {
      process.stderr.write(
        `[otel-aggregate] shared scan: ${contributing.length}/${candidates.length} files with new data ` +
        `(${contributing.map(s => `${s.file}:${s.entries}`).join(', ')})\n`
      );
    }
  }

  if (entries.length === 0) {
    if (isPerSession) shutdownCollector(sessionPort);
    return;
  }

  let db;
  try { db = openDb(); }
  catch (err) {
    process.stderr.write(`[otel-aggregate] Cannot open DB: ${err.message}\n`);
    if (isPerSession) shutdownCollector(sessionPort);
    return;
  }

  try {
    const updated = updateRecords(db, entries);
    const totalIn  = entries.reduce((s, e) => s + (e.input_tokens || 0), 0);
    const totalOut = entries.reduce((s, e) => s + (e.output_tokens || 0), 0);
    const mode = isPerSession ? 'per-session' : 'shared';
    process.stderr.write(
      `[otel-aggregate] ${mode}: ${entries.length} entries → ${updated} DB records ` +
      `(${totalIn} in / ${totalOut} out)\n`
    );
  } catch (err) {
    process.stderr.write(`[otel-aggregate] ERROR: ${err.message}\n`);
  } finally {
    try { db.close(); } catch (_) { }
  }

  // Per-session cleanup: shutdown dedicated collector
  if (isPerSession) {
    shutdownCollector(sessionPort);
  }
}

main();
