#!/usr/bin/env node
// pipeline-heartbeat.js — Stop hook: 寫入 heartbeat 供 watchdog 偵測配額卡死
// 僅在 pipeline 模式啟動（PIPELINE_SIGNAL_FILE 環境變數存在時）
//
// Spec: wfq-03 BR-001
// 寫入格式:
//   {ISO8601_timestamp}
//   {story_id}
//   {phase}
//   {loop_count}

'use strict';

const fs = require('fs');
const path = require('path');

// 僅在 pipeline 模式執行
const signalFile = process.env.PIPELINE_SIGNAL_FILE;
if (!signalFile) {
  process.exit(0); // 非 pipeline 模式 — 跳過
}

const storyId = process.env.PIPELINE_STORY_ID || 'unknown';
const phase   = process.env.PIPELINE_PHASE    || 'unknown';

// 取得專案根目錄（hook 位於 .claude/hooks/，往上兩層）
const projectRoot = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(__dirname, '..', '..');

const logsDir      = path.join(projectRoot, 'logs');
const heartbeatFile = path.join(logsDir, `heartbeat-${storyId}-${phase}.txt`);

// 讀取現有 loop_count（單調遞增追蹤）
let loopCount = 0;
try {
  if (fs.existsSync(heartbeatFile)) {
    const lines = fs.readFileSync(heartbeatFile, 'utf8').trim().split('\n');
    if (lines.length >= 4) {
      loopCount = parseInt(lines[3], 10) || 0;
    }
  }
} catch (_) { /* ignore */ }
loopCount++;

// Taiwan time (UTC+8) — 符合 Constitutional Standard
const now        = new Date();
const tsTaiwan   = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  .toISOString()
  .replace('Z', '+08:00');

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const content = `${tsTaiwan}\n${storyId}\n${phase}\n${loopCount}`;
  fs.writeFileSync(heartbeatFile, content, 'utf8');
} catch (err) {
  // heartbeat 寫入失敗不應影響 pipeline — 靜默失敗
  process.stderr.write(`[pipeline-heartbeat] Write failed: ${err.message}\n`);
}

process.exit(0);
