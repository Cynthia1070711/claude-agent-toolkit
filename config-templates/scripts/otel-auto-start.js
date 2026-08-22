#!/usr/bin/env node
/**
 * otel-auto-start.js — SessionStart Hook
 *
 * Claude CLI 啟動時自動確保 OTel Micro Collector 在 port 49200 運行。
 * 若已運行則秒退；若未運行則 spawn 背景 collector 後退出。
 *
 * 配合 settings.local.json env block（OTEL_EXPORTER_OTLP_ENDPOINT=localhost:49200），
 * 實現零手動操作的 token 追蹤。
 *
 * 多視窗共享同一 collector：
 * - 所有 Claude 視窗發送 OTLP 至同一 port 49200
 * - SessionEnd hook (otel-session-aggregate.js) 以時間範圍匹配歸屬 token
 * - 精確需求可用 `. ./scripts/start-main-otel.ps1` per-session 模式
 *
 * Hook: SessionStart (all sessions, no matcher)
 * Timeout: 2000ms (must be fast)
 */
'use strict';

const http = require('http');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

const PORT = 49200;
const projectRoot = path.resolve(__dirname, '..');
const logDir = path.join(projectRoot, 'logs');
const collectorScript = path.join(projectRoot, 'scripts', 'otel-micro-collector.js');

// ── Health check: is collector already running? ──
function healthCheck() {
  return new Promise(resolve => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: '/health', method: 'GET', timeout: 800 },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve(data.trim() === 'OK'));
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ── Spawn collector as detached background process ──
function startCollector() {
  // Ensure logs dir
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Daily-rotating JSONL (TZ FIX 2026-05-29 · CRITICAL: 原雙重 +8h offset(+16h)→ Intl 台灣牆鐘,對齊 otel-micro-collector/timezone.js)
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
  const jsonlPath = path.join(logDir, `main-otel-${today}.jsonl`);
  const portFilePath = path.join(logDir, 'main-otel-port.txt');

  const child = spawn('node', [collectorScript, jsonlPath, portFilePath, '--port', String(PORT)], {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
  });
  child.unref(); // Don't wait for collector to exit

  process.stderr.write(`[otel-auto-start] Spawned collector on port ${PORT} (PID: ${child.pid})\n`);
}

// ── Main ──
async function main() {
  const running = await healthCheck();
  if (running) {
    // Already running — nothing to do
    return;
  }
  startCollector();
}

main().catch(() => {});
