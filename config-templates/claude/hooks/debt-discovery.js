#!/usr/bin/env node
/**
 * debt-discovery.js — Stop Hook
 * 自動掃描 git diff HEAD 中新增的 TODO/FIXME/HACK/XXX 註解，
 * 計算 Priority Score 並寫入 tech_debt_items 表。
 *
 * Story: dla-02-dev-story-debt-discovery
 * BR-DD-HOOK: Silent failure (exit 0)
 * BR-DD-FAST-EXIT: Empty diff → exit < 50ms
 * BR-DD-SCAN: Regex 掃描 +行
 * BR-DD-DEDUP: SHA256 debt_id 去重
 * BR-DD-IDD-SKIP: [Intentional:] 排除
 */

'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── 常數 ────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '..', '..', '.context-db', 'context-memory.db');
const SQLITE_MODULE_PATH = path.join(__dirname, '..', '..', '.context-db', 'node_modules', 'better-sqlite3');

/** 支援的 annotation 關鍵字 */
const KEYWORDS = ['TODO', 'FIXME', 'HACK', 'XXX'];

/** keyword → severity mapping (BR-DD-SCORE) */
const SEVERITY_MAP = {
  TODO: 'low',
  FIXME: 'medium',
  XXX: 'medium',
  HACK: 'high',
};

/** keyword → priority_score mapping (BR-DD-SCORE) */
const SCORE_MAP = {
  TODO: 1.0,
  FIXME: 2.0,
  XXX: 2.0,
  HACK: 5.0,
};

/** 最大 annotation 文字長度 */
const MAX_TEXT_LENGTH = 200;

// ── 輔助函數（export 供測試） ────────────────────────────────────────────────

/**
 * 判斷是否應快速退出（無 git 變更）
 * @param {string} nameOnlyOutput - git diff --name-only HEAD 的輸出
 * @returns {boolean}
 */
function shouldFastExit(nameOnlyOutput) {
  return !nameOnlyOutput || nameOnlyOutput.trim().length === 0;
}

/**
 * 解析 unified diff 輸出，提取新增的 annotation
 * @param {string} diffText - git diff HEAD --unified=0 的輸出
 * @returns {Array<{file: string, keyword: string, text: string}>}
 */
function parseDiff(diffText) {
  if (!diffText) return [];

  const results = [];
  let currentFile = null;
  let currentLineNum = null;

  // 建立 keyword regex: 匹配 +行中的 TODO/FIXME/HACK/XXX（word boundary）
  const keywordPattern = new RegExp(
    `\\b(${KEYWORDS.join('|')})\\b[\\s:]+(.+)`,
    'i'
  );
  const filePattern = /^diff --git a\/(.+?) b\//;
  const iddPattern = /\[Intentional:/;
  const hunkPattern = /^@@ -\d+(?:,\d+)? \+(\d+)/;

  const lines = diffText.split('\n');

  for (const line of lines) {
    // 提取檔案路徑 (BR-DD-FILE-EXTRACT)
    const fileMatch = line.match(filePattern);
    if (fileMatch) {
      currentFile = fileMatch[1];
      currentLineNum = null;
      continue;
    }

    // Track line numbers from hunk headers
    const hunkMatch = line.match(hunkPattern);
    if (hunkMatch) {
      currentLineNum = parseInt(hunkMatch[1], 10);
      continue;
    }

    // 只處理新增行（+ 開頭，非 +++ header）
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    // 排除 [Intentional:] 標記行 (BR-DD-IDD-SKIP)
    if (iddPattern.test(line)) {
      if (currentLineNum !== null) currentLineNum++;
      continue;
    }

    // 匹配 annotation 關鍵字 (BR-DD-SCAN)
    const kwMatch = line.match(keywordPattern);
    if (kwMatch && currentFile) {
      // 從 regex capture group 直接取得匹配的 keyword
      const matchedKeyword = kwMatch[1].toUpperCase();

      let text = kwMatch[2].trim();
      // 截斷超長文字 (boundary: > 200 chars)
      if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH);
      }

      results.push({
        file: currentFile,
        keyword: matchedKeyword,
        text,
        lineNum: currentLineNum || null,
      });
    }
    if (currentLineNum !== null) currentLineNum++;
  }

  return results;
}

/**
 * 計算 Priority Score (BR-DD-SCORE)
 * @param {string} keyword - TODO/FIXME/XXX/HACK
 * @returns {number}
 */
function calcPriorityScore(keyword) {
  return SCORE_MAP[keyword] || 1.0;
}

/**
 * 映射 keyword → severity (AC-3)
 * @param {string} keyword
 * @returns {string}
 */
function mapSeverity(keyword) {
  return SEVERITY_MAP[keyword] || 'low';
}

/**
 * 產生 deterministic debt_id (BR-DD-DEDUP)
 * @param {string} filePath
 * @param {string} annotationText
 * @returns {string} TD-AUTO-{hash6}
 */
function generateDebtId(filePath, annotationText) {
  const hash = crypto
    .createHash('sha256')
    .update(`${filePath}:${annotationText}`)
    .digest('hex')
    .substring(0, 6);
  return `TD-AUTO-${hash}`;
}

/**
 * 取得目前 active story ID (BR-DD-STORY-ID)
 * @returns {string}
 */
function getActiveStoryId() {
  // 優先讀 env var（pipeline 設定）
  const envStoryId = process.env.CLAUDE_STORY_ID;
  if (envStoryId && envStoryId.trim()) return envStoryId.trim();

  // Fallback: 掃描 tracking file 找 in-progress story
  try {
    const trackingDir = path.join(__dirname, '..', '..', 'docs', 'tracking', 'active');
    if (!fs.existsSync(trackingDir)) return 'unknown-manual';

    const files = fs.readdirSync(trackingDir).filter(f => f.endsWith('.track.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(trackingDir, f), 'utf8');
      if (content.includes('in-progress')) {
        // 從檔名提取 story_id (去掉 .track.md)
        return f.replace('.track.md', '');
      }
    }
  } catch {
    // silent
  }

  return 'unknown-manual';
}

/**
 * 取得 Taiwan UTC+8 timestamp
 * @returns {string} ISO 8601 format
 */
function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

/**
 * 批次寫入 debt 到 DB (BR-DD-UPSERT)
 * @param {Array<{file: string, keyword: string, text: string}>} annotations
 * @param {string} storyId
 */
function upsertDebts(annotations, storyId) {
  if (!annotations.length) return;

  let Database;
  try {
    Database = require(SQLITE_MODULE_PATH);
  } catch {
    // better-sqlite3 不可用 → silent exit
    return;
  }

  let db;
  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    const now = getTaiwanTimestamp();

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO tech_debt_items
        (debt_id, story_id, category, severity, dimension, title, description,
         affected_files, status, priority_score, created_at, updated_at)
      VALUES
        (@debt_id, @story_id, @category, @severity, @dimension, @title, @description,
         @affected_files, @status, @priority_score, @created_at, @updated_at)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(item);
      }
    });

    const rows = annotations.map(a => ({
      debt_id: generateDebtId(a.file, a.text),
      story_id: storyId,
      category: 'deferred',
      severity: mapSeverity(a.keyword),
      dimension: 'code-annotation',
      title: `[Auto] ${a.keyword}: ${a.text}`.substring(0, 200),
      description: `Auto-discovered in ${a.file}${a.lineNum ? ':L' + a.lineNum : ''} by debt-discovery hook`,
      affected_files: a.file,
      status: 'open',
      priority_score: calcPriorityScore(a.keyword),
      created_at: now,
      updated_at: now,
    }));

    insertMany(rows);
  } catch {
    // DB 錯誤 → silent (BR-DD-HOOK)
  } finally {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
  }
}

// ── 主要邏輯 ─────────────────────────────────────────────────────────────────

function main() {
  // 1. Fast exit: 無 git 變更 (BR-DD-FAST-EXIT)
  let nameOnly;
  try {
    nameOnly = execSync('git diff --name-only HEAD', { encoding: 'utf8', timeout: 1500 });
  } catch {
    process.exit(0);
  }

  if (shouldFastExit(nameOnly)) {
    process.exit(0);
  }

  // 2. 取得完整 diff (BR-DD-SCAN)
  let diffText;
  try {
    diffText = execSync('git diff HEAD --unified=0', { encoding: 'utf8', timeout: 1500 });
  } catch {
    process.exit(0);
  }

  // 3. 解析 annotations
  const annotations = parseDiff(diffText);
  if (!annotations.length) {
    process.exit(0);
  }

  // 4. 取得 active story ID
  const storyId = getActiveStoryId();

  // 5. 寫入 DB
  upsertDebts(annotations, storyId);

  process.exit(0);
}

// ── exports（供測試） ────────────────────────────────────────────────────────

module.exports = {
  parseDiff,
  calcPriorityScore,
  mapSeverity,
  generateDebtId,
  shouldFastExit,
  getActiveStoryId,
  getTaiwanTimestamp,
  upsertDebts,
  KEYWORDS,
  SEVERITY_MAP,
  SCORE_MAP,
  MAX_TEXT_LENGTH,
};

// ── 入口（作為腳本執行時） ────────────────────────────────────────────────────

if (require.main === module) {
  try {
    main();
  } catch {
    process.exit(0);
  }
}
