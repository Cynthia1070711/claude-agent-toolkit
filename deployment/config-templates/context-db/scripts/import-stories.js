// ============================================================
// PCPT Context Memory DB — Story ETL 腳本
// CMI-2 Phase 1: 解析 docs/implementation-artifacts/stories/epic-*/*.md
//               萃取 metadata 寫入 stories 表
// ============================================================
// 執行方式:
//   node .context-db/scripts/import-stories.js            (incremental，僅新增)
//   node .context-db/scripts/import-stories.js --full     (全量重建)
//   node .context-db/scripts/import-stories.js --incremental
// 冪等設計: INSERT OR REPLACE（story_id PRIMARY KEY）
// 容錯設計: 早期 Story 缺少標準表頭時降級解析
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH    = path.join(__dirname, '..', 'context-memory.db');
const STORIES_BASE = path.join(__dirname, '..', '..', 'docs', 'implementation-artifacts', 'stories');
// 相對路徑前綴（用於 source_file 欄位）
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ──────────────────────────────────────────────
// 工具函式
// ──────────────────────────────────────────────

/** 取得相對於專案根目錄的路徑（存入 source_file）*/
function relPath(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

/** 解析 CLI 模式：--full | --incremental（預設 incremental）*/
function parseMode() {
  const args = process.argv.slice(2);
  if (args.includes('--full')) return 'full';
  return 'incremental';
}

// ──────────────────────────────────────────────
// Domain 推斷規則
// ba- → business-api | fra- → bugfix | p0- → infra
// m[0-9] → member | a[0-9] → admin | e[0-9] → editor
// d[0-9] → pdf | s[0-9] → system | t[0-9] → test
// fallback → epic_id 去除 epic- 前綴
// ──────────────────────────────────────────────
function inferDomain(storyId, epicId) {
  if (!storyId) return epicId.replace(/^epic-/, '');

  // 移除已知 epic 前綴（qgr-, td-, trs-, uds-, opt-）
  let sub = storyId;
  const epicPrefixRe = /^(?:qgr|td|trs|uds|opt)-(.+)/;
  const pm = sub.match(epicPrefixRe);
  if (pm) sub = pm[1];

  if (sub.startsWith('ba-'))  return 'business-api';
  if (sub.startsWith('fra-')) return 'bugfix';
  if (sub.startsWith('p0-'))  return 'infra';
  if (/^m\d/.test(sub))       return 'member';
  if (/^a\d/.test(sub))       return 'admin';
  if (/^e\d/.test(sub))       return 'editor';
  if (/^d\d/.test(sub))       return 'pdf';
  if (/^s\d/.test(sub))       return 'system';
  if (/^t\d/.test(sub))       return 'test';

  return epicId.replace(/^epic-/, '');
}

/** 正規化狀態字串（清理 emoji / markdown / backtick / 附加說明） */
function normalizeStatus(raw) {
  if (!raw) return 'unknown';

  let s = raw
    // 移除 emoji（含 variation selectors）
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    // 移除 markdown bold/italic
    .replace(/\*+/g, '')
    // 移除 backtick
    .replace(/`/g, '')
    // 移除括號說明（含中文括號）
    .replace(/[（(【\[].+/g, '')
    // 移除破折號後的說明（保留第一個詞）
    .replace(/\s*—.+/g, '')
    .trim()
    .toLowerCase();

  // 取第一個有意義的 token（遇到 phase / + / ， 截斷）
  s = s.split(/\s*(?:phase|,|，|\+)\s*/)[0].trim();
  // 再次清理殘餘特殊符號
  s = s.replace(/[^a-z0-9\u4e00-\u9fff\u3400-\u4dbf-]/g, '').trim();
  // 空白轉 dash
  s = s.replace(/\s+/g, '-');

  if (!s) return 'unknown';

  // 語意對應
  if (s === 'done' || s === '完成') return 'done';
  if (s === 'archived' || s === '已拆分') return 'archived';
  if (s === 'superseded' || s === '被取代') return 'superseded';
  if (s.includes('review'))               return 'review';
  if (s.includes('progress'))             return 'in-progress';
  if (s.startsWith('ready'))              return s.includes('dev') ? 'ready-for-dev' : 'ready';
  if (s === 'backlog')                    return 'backlog';
  if (s.includes('block'))               return 'blocked';
  if (s.includes('cancel'))              return 'cancelled';
  if (s === 'split')                      return 'split';
  return s;
}

// ──────────────────────────────────────────────
// 標題提取：從 H1 取出中文 / 英文說明部分
// ──────────────────────────────────────────────
function extractTitle(content) {
  const m = content.match(/^#\s+(.+)/m);
  if (!m) return 'Untitled';

  let title = m[1]
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // 移除 emoji
    .trim();

  // 取冒號後的說明（Story 1.1: <title>）
  const colonIdx = title.indexOf(':');
  if (colonIdx > 0 && colonIdx < title.length - 2) {
    const after = title.slice(colonIdx + 1).trim();
    if (after.length > 3) return after;
  }
  return title;
}

// ──────────────────────────────────────────────
// Tags 萃取：從 Background + Acceptance Criteria 區段
// ──────────────────────────────────────────────
function extractTags(content) {
  const tags = new Set();

  // 找 Background 和 AC 區段文字
  const bgMatch  = content.match(/## Background\s+([\s\S]*?)(?=^##|\z)/m);
  const acMatch  = content.match(/## Acceptance Criteria\s+([\s\S]*?)(?=^##|\z)/m);
  const target   = [bgMatch?.[1] ?? '', acMatch?.[1] ?? ''].join('\n');

  // 1. Backtick 技術詞彙（方法名、類別名、檔名）
  for (const [, term] of target.matchAll(/`([^`\n]{2,60})`/g)) {
    const t = term.trim();
    // 排除含空格的長語句
    if (t && !t.includes('  ') && t.length <= 60) tags.add(t);
  }

  // 2. 明確 PascalCase 技術詞彙（Service / Controller / Dto 結尾）
  const classRe = /\b([A-Z][a-zA-Z]{3,}(?:Service|Controller|Handler|Repository|ViewModel|Dto|Helper|Manager|Store|Hook|Component|Test)s?)\b/g;
  for (const [, cls] of target.matchAll(classRe)) {
    tags.add(cls);
  }

  // 3. AC 標題關鍵字（### AC-N: <keyword>）
  for (const [, label] of content.matchAll(/###\s+AC[-\d]+[:：]\s*(.+)/g)) {
    const words = label.trim().slice(0, 30);
    if (words.length > 3) tags.add(words);
  }

  return [...tags].slice(0, 25).join(',');
}

// ──────────────────────────────────────────────
// File List 萃取：從 Tasks 區段找檔案引用
// ──────────────────────────────────────────────
function extractFileList(content) {
  const files = new Set();

  // 只在 Tasks 區段之後掃描
  const taskIdx = content.search(/^## Tasks/m);
  const taskText = taskIdx >= 0 ? content.slice(taskIdx) : content;

  // Backtick 內含副檔名的詞彙
  const extRe = /`([^`\n]*?\.(cs|cshtml|tsx|ts|js|css|razor|json|xml|html|yaml|md))[^`\n]*?`/gi;
  for (const [, fname] of taskText.matchAll(extRe)) {
    // 移除 method call 括號及後方參數
    const cleaned = fname.split('(')[0].trim();
    if (cleaned.length > 3) files.add(cleaned);
  }

  // 明確路徑（含 / 分隔符）
  const pathRe = /`([A-Za-z][A-Za-z0-9_./-]+\/[A-Za-z0-9_.-]+\.[a-z]{2,6})`/g;
  for (const [, fpath] of taskText.matchAll(pathRe)) {
    files.add(fpath);
  }

  const result = [...files].slice(0, 30);
  return result.length > 0 ? JSON.stringify(result) : null;
}

// ──────────────────────────────────────────────
// 格式偵測：是否為新格式（含 metadata 表格）
// ──────────────────────────────────────────────
function isNewFormat(content) {
  return /\|\s*\*{0,2}Story ID\*{0,2}\s*\|/.test(content);
}

// ──────────────────────────────────────────────
// 新格式解析（metadata 表格）
// ──────────────────────────────────────────────
function parseNewFormat(content, filePath, epicId) {
  // 從 Markdown 表格萃取欄位值
  const tableVal = (label) => {
    // 相容 **label** 和 label（有無 bold 符號）
    const re = new RegExp(`\\|\\s*\\*{0,2}${label}\\*{0,2}\\s*\\|\\s*([^|\r\n]+?)\\s*\\|`);
    const m  = content.match(re);
    return m ? m[1].trim() : null;
  };

  const storyId    = tableVal('Story ID') || path.basename(filePath, '.md');
  const status     = tableVal('狀態') || tableVal('Status') || 'unknown';
  const priority   = tableVal('優先級') || null;
  const complexity = tableVal('複雜度') || null;
  const storyType  = tableVal('類型') || tableVal('Type') || null;
  const deps       = tableVal('依賴') || null;
  const createdAt  = tableVal('建立日期') || tableVal('Create日期') || new Date().toISOString().split('T')[0];
  const devAgent   = tableVal('DEV Agent') || null;
  const reviewAgent = tableVal('Review Agent') || null;

  return {
    story_id:     storyId,
    epic_id:      epicId,
    domain:       inferDomain(storyId, epicId),
    title:        extractTitle(content),
    status:       normalizeStatus(status),
    priority,
    complexity,
    story_type:   storyType,
    dependencies: deps,
    tags:         extractTags(content),
    file_list:    extractFileList(content),
    dev_agent:    devAgent,
    review_agent: reviewAgent,
    source_file:  relPath(filePath),
    created_at:   createdAt,
  };
}

// ──────────────────────────────────────────────
// 舊格式解析（bold fields 或極簡 header）
// ──────────────────────────────────────────────
function parseOldFormat(content, filePath, epicId) {
  // 抓 **Label:** value 或 **Label:** **value**
  const boldField = (label) => {
    const re = new RegExp(`\\*{1,2}${label}[:：]\\*{0,2}\\s*\\*{0,2}([^*\n]+?)\\*{0,2}\\s*$`, 'm');
    const m  = content.match(re);
    return m ? m[1].trim() : null;
  };

  // 抓 Label: value（無 bold）
  const plainField = (label) => {
    const re = new RegExp(`^${label}[:：]\\s*([^\n]+)`, 'm');
    const m  = content.match(re);
    return m ? m[1].trim() : null;
  };

  // story_id: 優先 Story Key（slug 格式），次選 filename
  let storyId = boldField('Story Key');
  if (!storyId) {
    // Story ID 若為 X.Y 格式則直接用 filename
    const rawId = boldField('Story ID') || boldField('Story');
    if (rawId && !/^\d+\.\d+/.test(rawId)) {
      storyId = rawId.toLowerCase().replace(/\s+/g, '-');
    } else {
      storyId = path.basename(filePath, '.md');
    }
  }

  const status   = boldField('Status') || plainField('Status') || 'unknown';
  const priority = boldField('優先級') || boldField('Priority') || null;

  return {
    story_id:     storyId,
    epic_id:      epicId,
    domain:       inferDomain(storyId, epicId),
    title:        extractTitle(content),
    status:       normalizeStatus(status),
    priority,
    complexity:   null,
    story_type:   null,
    dependencies: boldField('依賴') || boldField('Dependencies') || null,
    tags:         extractTags(content),
    file_list:    extractFileList(content),
    dev_agent:    null,
    review_agent: null,
    source_file:  relPath(filePath),
    created_at:   new Date().toISOString().split('T')[0],
  };
}

// ──────────────────────────────────────────────
// 單一 Story 檔案解析入口
// ──────────────────────────────────────────────
function parseStoryFile(filePath, epicId) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 跳過無 H1 的空文件
  if (!/^#\s+/m.test(content)) return null;

  try {
    if (isNewFormat(content)) {
      return parseNewFormat(content, filePath, epicId);
    }
    return parseOldFormat(content, filePath, epicId);
  } catch (err) {
    console.warn(`  ⚠ 解析失敗 [${path.basename(filePath)}]: ${err.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────
// 應略過的非 Story 文件名模式
// ──────────────────────────────────────────────
const SKIP_PATTERNS = [
  /^README/i,
  /EPIC-.*推進/,
  /推進樹狀圖/,
  /^index/i,
];

function isSkippable(filename) {
  return SKIP_PATTERNS.some(re => re.test(filename));
}

// ──────────────────────────────────────────────
// 掃描所有 epic-* 資料夾下的 Story 文件
// ──────────────────────────────────────────────
function scanStoryFiles() {
  if (!fs.existsSync(STORIES_BASE)) {
    throw new Error(`stories 目錄不存在: ${STORIES_BASE}`);
  }

  const entries = [];
  const epicDirs = fs.readdirSync(STORIES_BASE)
    .filter(d => d.startsWith('epic-') && fs.statSync(path.join(STORIES_BASE, d)).isDirectory())
    .sort();

  for (const epicDir of epicDirs) {
    const dirPath = path.join(STORIES_BASE, epicDir);
    const mdFiles = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md') && !isSkippable(f))
      .sort();

    for (const fname of mdFiles) {
      entries.push({
        filePath: path.join(dirPath, fname),
        epicId:   epicDir,
      });
    }
  }

  return entries;
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function importStories() {
  const mode = parseMode();
  console.log(`📚 Story ETL 匯入開始 [模式: ${mode}]`);
  console.log(`   來源目錄: ${STORIES_BASE}`);
  console.log(`   DB:       ${DB_PATH}`);
  console.log('');

  // 確認 DB 存在
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`DB 不存在，請先執行 node .context-db/scripts/init-db.js\nDB 路徑: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // 確認 stories 表存在
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='stories'"
  ).get();
  if (!tableExists) {
    db.close();
    throw new Error('stories 表不存在，請先執行 node .context-db/scripts/init-db.js');
  }

  // --full 模式：清空 stories 表（FTS trigger 會自動同步）
  if (mode === 'full') {
    console.log('[0] Full 模式：清空 stories 表...');
    db.prepare('DELETE FROM stories').run();
  }

  // 取得已存在的 source_file 集合（incremental 用）
  const existingFiles = new Set(
    db.prepare('SELECT source_file FROM stories').all().map(r => r.source_file)
  );

  // 掃描所有 Story 文件
  const fileEntries = scanStoryFiles();
  console.log(`[1] 掃描完成：找到 ${fileEntries.length} 個 Story 文件`);

  // 解析 + 篩選
  const rows = [];
  const skippedCount = { existing: 0, parse_fail: 0, skip_file: 0 };

  for (const { filePath, epicId } of fileEntries) {
    const srcRel = relPath(filePath);

    // incremental 模式：跳過已存在的
    if (mode === 'incremental' && existingFiles.has(srcRel)) {
      skippedCount.existing++;
      continue;
    }

    const row = parseStoryFile(filePath, epicId);
    if (!row) {
      skippedCount.parse_fail++;
      continue;
    }

    rows.push(row);
  }

  console.log(`[2] 解析完成：${rows.length} 筆待寫入`);
  if (skippedCount.existing > 0)   console.log(`    已略過（已存在）: ${skippedCount.existing} 筆`);
  if (skippedCount.parse_fail > 0) console.log(`    解析失敗: ${skippedCount.parse_fail} 筆`);

  // 寫入 DB
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO stories
      (story_id, epic_id, domain, title, status, priority, complexity,
       story_type, dependencies, tags, file_list, dev_agent, review_agent,
       source_file, created_at)
    VALUES
      (@story_id, @epic_id, @domain, @title, @status, @priority, @complexity,
       @story_type, @dependencies, @tags, @file_list, @dev_agent, @review_agent,
       @source_file, @created_at)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      upsert.run(row);
    }
  });

  console.log('[3] 寫入 stories...');
  insertMany(rows);

  // ── 統計報告 ──
  const total = db.prepare('SELECT COUNT(*) AS count FROM stories').get().count;

  const statusGroups = db.prepare(
    'SELECT status, COUNT(*) AS count FROM stories GROUP BY status ORDER BY count DESC'
  ).all();

  const domainGroups = db.prepare(
    'SELECT domain, COUNT(*) AS count FROM stories GROUP BY domain ORDER BY count DESC'
  ).all();

  const epicGroups = db.prepare(
    'SELECT epic_id, COUNT(*) AS count FROM stories GROUP BY epic_id ORDER BY count DESC LIMIT 10'
  ).all();

  console.log('');
  console.log('✅ 匯入完成');
  console.log(`   stories 總計: ${total} 筆（本次寫入 ${rows.length} 筆）`);

  console.log('');
  console.log('   狀態分佈:');
  for (const g of statusGroups) {
    console.log(`     ${g.status.padEnd(20)}: ${g.count} 筆`);
  }

  console.log('');
  console.log('   Domain 分佈:');
  for (const g of domainGroups) {
    console.log(`     ${g.domain.padEnd(20)}: ${g.count} 筆`);
  }

  console.log('');
  console.log('   Epic 分佈 (top 10):');
  for (const g of epicGroups) {
    console.log(`     ${g.epic_id.padEnd(20)}: ${g.count} 筆`);
  }

  db.close();
}

try {
  importStories();
} catch (err) {
  console.error('❌ Story 匯入失敗:', err.message);
  process.exit(1);
}
