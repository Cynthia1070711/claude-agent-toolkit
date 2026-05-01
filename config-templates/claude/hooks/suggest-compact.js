#!/usr/bin/env node
/**
 * suggest-compact.js — Stop Hook
 * 自動 Context Compaction 提醒
 *
 * 每次 Stop hook 觸發時遞增回應輪次計數器（存於 OS temp file），
 * 達閾值（預設 40，可由 COMPACT_THRESHOLD 環境變數覆蓋）自動 stderr 提醒
 * 使用者執行 /compact，避免 pipeline 長 phase 中 context overflow。
 *
 * Story: ecc-04-suggest-compact-hook
 * BR-001: fd-based atomic counter (open a+ → read → ftruncate → write)
 * BR-002: stderr 告警於 count === threshold
 * BR-003: 超出閾值後每 25 輪再次提醒
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 常數 ────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 40;
const REPEAT_INTERVAL = 25;

// ── 輔助函數（可 export 供測試） ─────────────────────────────────────────────

/**
 * 解析 COMPACT_THRESHOLD 環境變數，回傳有效閾值
 * @param {string|undefined} envVal
 * @param {number} defaultVal
 * @returns {number}
 */
function parseThreshold(envVal, defaultVal) {
  if (!envVal) return defaultVal;
  const raw = parseInt(envVal, 10);
  return Number.isFinite(raw) && raw > 0 && raw <= 10000 ? raw : defaultVal;
}

/**
 * 取得 session 識別字串（供 temp file 命名）
 * @param {string|undefined} sessionEnvVar
 * @returns {string}
 */
function getSessionId(sessionEnvVar) {
  const raw = (sessionEnvVar || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
  return raw || 'default';
}

/**
 * 以 fd-based 原子操作讀取並遞增計數器（BR-001）
 * open(r+/w+) → read → ftruncate → write at 0，降低 race-condition 風險。
 * 注意：Windows 不支援 ftruncate on a+ mode，改用 r+（已存在）或 w+（新建）。
 *
 * @param {string} counterFile - 計數器 temp 檔案路徑
 * @returns {{ count: number, error: Error|null }}
 */
function incrementCounter(counterFile) {
  let count = 1;
  let fd;

  try {
    // r+ 開啟已存在的檔案（read+write）；若不存在則 w+ 建立（跨平台 ftruncate 相容）
    try {
      fd = fs.openSync(counterFile, 'r+');
    } catch {
      fd = fs.openSync(counterFile, 'w+');
    }

    const buf = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, buf, 0, 64, 0);

    if (bytesRead > 0) {
      const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
      // 限制上限防止 corrupt 數值溢位
      count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
        ? parsed + 1
        : 1;
    }

    // ftruncate + 從 position 0 寫入（確保舊內容被完整覆蓋）
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, String(count), 0);
  } catch (err) {
    // Fallback: best-effort write（不阻塞 hook）
    try {
      fs.writeFileSync(counterFile, String(count), 'utf8');
    } catch { /* truly silent */ }
    return { count, error: err };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }

  return { count, error: null };
}

/**
 * 判斷是否需要輸出告警（BR-002, BR-003）
 * @param {number} count - 當前計數
 * @param {number} threshold - 告警閾值
 * @returns {{ atThreshold: boolean, atInterval: boolean }}
 */
function shouldWarn(count, threshold) {
  return {
    atThreshold: count === threshold,
    atInterval: count > threshold && (count - threshold) % REPEAT_INTERVAL === 0,
  };
}

// ── 主要邏輯 ─────────────────────────────────────────────────────────────────

function main() {
  const sessionId = getSessionId(process.env.CLAUDE_SESSION_ID);
  const counterFile = path.join(os.tmpdir(), `pcpt-turn-count-${sessionId}`);
  const threshold = parseThreshold(process.env.COMPACT_THRESHOLD, DEFAULT_THRESHOLD);

  const { count } = incrementCounter(counterFile);
  const { atThreshold, atInterval } = shouldWarn(count, threshold);

  if (atThreshold) {
    process.stderr.write(
      `[suggest-compact] ⚠ ${threshold} 個回應輪次已完成 — ` +
      `建議執行 /compact 整理 context，避免 pipeline 長 phase 中途 overflow\n`
    );
  } else if (atInterval) {
    process.stderr.write(
      `[suggest-compact] ⚠ ${count} 個回應輪次 — ` +
      `context 可能已膨脹，建議在進入新 phase 前執行 /compact\n`
    );
  }

  process.exit(0);
}

// ── exports（供測試） ────────────────────────────────────────────────────────

module.exports = {
  parseThreshold,
  getSessionId,
  incrementCounter,
  shouldWarn,
  DEFAULT_THRESHOLD,
  REPEAT_INTERVAL,
};

// ── 入口（作為腳本執行時） ────────────────────────────────────────────────────

if (require.main === module) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
