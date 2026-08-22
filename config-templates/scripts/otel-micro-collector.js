#!/usr/bin/env node
/**
 * otel-micro-collector.js — wfq-08 Micro OTLP HTTP Collector
 *
 * 接收 Claude CLI OTLP HTTP/JSON 數據，寫入 JSON Lines 檔案供 Pipeline watchdog 讀取。
 * 完全繞過 stdout，解決 Bug #17 (isatty 衝突) 根本矛盾。
 *
 * Usage:
 *   node scripts/otel-micro-collector.js <jsonlOutputPath> <portFilePath> [--port FIXED_PORT]
 *
 * Options:
 *   --port FIXED_PORT  Use a fixed port instead of random (for main-window persistent mode)
 *
 * Endpoints:
 *   POST /v1/logs    — OTLP LogsExportRequest (api_request events)
 *   POST /v1/metrics — OTLP MetricsExportRequest (token.usage metrics)
 *   GET  /health     — 健康檢查
 *   POST /shutdown   — 優雅關閉
 *
 * BR-001: 動態 port (49152–65535) + port file 寫入機制
 * BR-002: OTLP JSON 解析 → JSON Lines 輸出
 * BR-003: 只提取 api_request 事件的 4 token 欄位
 * BR-005: 只綁定 127.0.0.1 (安全性)
 *
 * ── 2026-04-14 Rotation SSoT 機制 ──
 * Main-window 模式（FIXED_PORT 指定時）：
 *   - 每次寫入前檢查 UTC+8 當日，跨日自動 rotate 到 main-otel-{today}.jsonl
 *   - 發佈 logs/main-otel-info.json（PoT）: {port, jsonl, pid, startedAt, currentDay, updatedAt}
 *   - Aggregate 只讀 info.json 拿 active jsonl，不再推算日期
 * Per-session 模式（random port）：行為不變（session 結束即終止，無需 rotation）
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── CLI Arguments ──
const jsonlOutputPath = process.argv[2];
const portFilePath    = process.argv[3];

if (!jsonlOutputPath || !portFilePath) {
  process.stderr.write('Usage: node otel-micro-collector.js <jsonlPath> <portFilePath> [--port N]\n');
  process.exit(1);
}

// Optional: --port flag for fixed port mode (main-window persistent collector)
const portFlagIdx = process.argv.indexOf('--port');
const FIXED_PORT = portFlagIdx !== -1 && portFlagIdx + 1 < process.argv.length
  ? parseInt(process.argv[portFlagIdx + 1], 10)
  : 0;

// Ensure output directory exists
const outputDir = path.dirname(jsonlOutputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ── Rotation state (main-window mode only) ──
// Main-window 模式（FIXED_PORT 指定）時啟用每日 rotation。
// Per-session 模式（random port）保持單檔寫入不變。
const ROTATION_ENABLED = FIXED_PORT > 0;
const infoJsonPath = path.join(outputDir, 'main-otel-info.json');
let currentJsonlPath = jsonlOutputPath;
let currentDay = rotationEnabled_todayStr();

// TZ FIX (2026-05-29 · CRITICAL): 原雙重 +8h offset(+16h)→ 日界跳隔日。改 Intl 台灣牆鐘(對齊 otel-session-aggregate / timezone.js)
function rotationEnabled_todayStr() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
}

function computeJsonlPathForDay(day) {
  // main-otel-{YYYY-MM-DD}.jsonl in outputDir — always absolute for cross-cwd safety
  return path.resolve(outputDir, `main-otel-${day}.jsonl`);
}

function writeInfoJsonAtomic(port) {
  if (!ROTATION_ENABLED) return;
  try {
    const info = {
      port,
      jsonl: currentJsonlPath,
      pid: process.pid,
      startedAt: startedAtIso,
      currentDay,
      updatedAt: new Date().toISOString(),
    };
    const tmpPath = infoJsonPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(info, null, 2), 'utf8');
    fs.renameSync(tmpPath, infoJsonPath);
  } catch (err) {
    process.stderr.write(`[otel-collector] info.json write error: ${err.message}\n`);
  }
}

function rotateIfNeeded(activePort) {
  if (!ROTATION_ENABLED) return;
  const today = rotationEnabled_todayStr();
  if (today === currentDay) return;
  // Cross-day: switch to new file, publish new PoT
  const oldJsonl = currentJsonlPath;
  currentDay = today;
  currentJsonlPath = computeJsonlPathForDay(today);
  writeInfoJsonAtomic(activePort);
  process.stderr.write(
    `[otel-collector] Rotated jsonl: ${path.basename(oldJsonl)} → ${path.basename(currentJsonlPath)}\n`
  );
}

const startedAtIso = new Date().toISOString();
// Initial currentJsonlPath: main-window mode uses today-based name; per-session keeps provided path
if (ROTATION_ENABLED) {
  currentJsonlPath = computeJsonlPathForDay(currentDay);
}

// ── Port Selection ──
const PORT_MIN = 49152;
const PORT_MAX = 65535;
const MAX_PORT_RETRIES = 10;

function randomPort() {
  return Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1)) + PORT_MIN;
}

// ── OTLP Attribute extraction ──
function attrValue(attr) {
  const v = attr.value;
  if (!v) return undefined;
  if (v.intValue  !== undefined) return parseInt(v.intValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  return undefined;
}

function attrsToMap(attributes) {
  const map = {};
  for (const a of (attributes || [])) {
    map[a.key] = attrValue(a);
  }
  return map;
}

// ── JSONL Writer (append-only, UTF-8) ──
function appendJsonl(record) {
  try {
    // Lazy daily rotation check (main-window mode only — zero-cost in per-session mode)
    rotateIfNeeded(ACTIVE_PORT);
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(currentJsonlPath, line, { encoding: 'utf8' });
  } catch (err) {
    process.stderr.write(`[otel-collector] JSONL write error: ${err.message}\n`);
  }
}

// ACTIVE_PORT 將在 startWithRetry listen callback 中賦值
let ACTIVE_PORT = 0;

// ── OTLP /v1/logs Parser (BR-002) ──
function parseAndWriteLogs(body) {
  const nowTs = new Date().toISOString();
  for (const rl of (body.resourceLogs || [])) {
    for (const sl of (rl.scopeLogs || [])) {
      for (const lr of (sl.logRecords || [])) {
        const attrs = attrsToMap(lr.attributes);
        const eventName = attrs['event.name'] || (lr.body && lr.body.stringValue) || '';

        // Only extract api_request events (BR-003)
        if (eventName !== 'api_request') continue;

        appendJsonl({
          ts:                     nowTs,
          type:                   'api_request',
          input_tokens:           Number(attrs.input_tokens            || 0),
          output_tokens:          Number(attrs.output_tokens           || 0),
          cache_read_tokens:      Number(attrs.cache_read_tokens       || 0),
          cache_creation_tokens:  Number(attrs.cache_creation_tokens   || 0),
          cost_usd:               Number(attrs.cost_usd                || 0),
          model:                  String(attrs.model                   || ''),
        });
      }
    }
  }
}

// ── OTLP /v1/metrics Parser (BR-002) ──
function parseAndWriteMetrics(body) {
  const nowTs = new Date().toISOString();
  for (const rm of (body.resourceMetrics || [])) {
    for (const sm of (rm.scopeMetrics || [])) {
      for (const m of (sm.metrics || [])) {
        if (m.name !== 'claude_code.token.usage') continue;
        for (const dp of ((m.sum && m.sum.dataPoints) || [])) {
          const attrs = attrsToMap(dp.attributes);
          appendJsonl({
            ts:         nowTs,
            type:       'token_metric',
            token_type: String(attrs.type  || ''),
            value:      parseInt(dp.asInt  || 0, 10),
            model:      String(attrs.model || ''),
          });
        }
      }
    }
  }
}

// ── Body Reader ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── HTTP Request Handler ──
function handleRequest(req, res) {
  const url    = req.url;
  const method = req.method;

  // GET /health (BR-001)
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // POST /shutdown (BR-001)
  if (method === 'POST' && url === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    // Graceful shutdown
    setImmediate(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000);  // force exit fallback
    });
    return;
  }

  // POST /v1/logs (BR-002)
  if (method === 'POST' && url === '/v1/logs') {
    readBody(req).then(raw => {
      try {
        const body = JSON.parse(raw);
        parseAndWriteLogs(body);
        // OTLP standard success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"invalid JSON"}');
      }
    }).catch(() => {
      res.writeHead(400);
      res.end('{}');
    });
    return;
  }

  // POST /v1/metrics (BR-002)
  if (method === 'POST' && url === '/v1/metrics') {
    readBody(req).then(raw => {
      try {
        const body = JSON.parse(raw);
        parseAndWriteMetrics(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"invalid JSON"}');
      }
    }).catch(() => {
      res.writeHead(400);
      res.end('{}');
    });
    return;
  }

  // Fallback — accept all other OTLP paths silently (Claude CLI may send /v1/traces etc.)
  if (method === 'POST') {
    readBody(req).then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    }).catch(() => {
      res.writeHead(200);
      res.end('{}');
    });
    return;
  }

  res.writeHead(404);
  res.end('{}');
}

// ── Server Creation with Port Retry (BR-001 T1.6) ──
const server = http.createServer(handleRequest);

// SIGTERM handler — graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
});

function startWithRetry(attemptsLeft) {
  if (attemptsLeft <= 0) {
    process.stderr.write('[otel-collector] FATAL: No available port after max retries\n');
    process.exit(1);
  }

  const port = FIXED_PORT || randomPort();
  server.listen(port, '127.0.0.1', () => {
    // Write port file for parent process (BR-001)
    try {
      fs.writeFileSync(portFilePath, String(port), { encoding: 'utf8' });
    } catch (err) {
      process.stderr.write(`[otel-collector] Port file write error: ${err.message}\n`);
    }
    // Publish SSoT info.json (main-window mode only)
    ACTIVE_PORT = port;
    writeInfoJsonAtomic(port);
    // Ready signal on stderr (won't interfere with TUI — BR-005)
    process.stderr.write(`[otel-collector] Listening on 127.0.0.1:${port}${ROTATION_ENABLED ? ' (rotation: on, jsonl=' + path.basename(currentJsonlPath) + ')' : ''}\n`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      // Port conflict — retry with a different port
      server.removeAllListeners('error');
      startWithRetry(attemptsLeft - 1);
    } else {
      process.stderr.write(`[otel-collector] Server error: ${err.message}\n`);
      process.exit(1);
    }
  });
}

startWithRetry(MAX_PORT_RETRIES);
