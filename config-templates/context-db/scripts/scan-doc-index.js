// ============================================================
// PCPT Context Memory DB — 文檔索引 ETL 腳本
// CMI-2 Phase 1: 掃描規劃文檔目錄 → doc_index 表
// ============================================================
// 執行方式:
//   node .context-db/scripts/scan-doc-index.js           (incremental)
//   node .context-db/scripts/scan-doc-index.js --full    (全量重建)
//   node .context-db/scripts/scan-doc-index.js --incremental
// 冪等設計: INSERT OR REPLACE（path 為 UNIQUE KEY）
// Layer C 排除: README.md / index.md / session-snapshot.md / 開發前討論紀錄/
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ──────────────────────────────────────────────
// 掃描目標定義
// ──────────────────────────────────────────────
const SCAN_TARGETS = [
  {
    dir: 'docs/project-planning-artifacts/functional-specs/PCPT-MVP',
    doc_type: 'spec',
  },
  {
    dir: 'docs/project-planning-artifacts/architecture',
    doc_type: 'architecture',
  },
  {
    dir: 'docs/project-planning-artifacts/reference',
    doc_type: 'reference',
  },
  {
    dir: 'docs/tracking/active',
    doc_type: 'tracking',
  },
];

// ──────────────────────────────────────────────
// Layer C 文檔排除規則
//   - README.md / index.md：導航/索引文件，非內容文檔
//   - session-snapshot.md：自動生成的快照，非規劃文件
//   - 開發前討論紀錄/：原始歷史討論紀錄（Layer C raw notes）
// ──────────────────────────────────────────────
const LAYER_C_BASENAME = new Set(['readme.md', 'index.md', 'session-snapshot.md']);
const LAYER_C_PATH_FRAGMENT = '開發前討論紀錄';

function isLayerC(relPath, basename) {
  if (LAYER_C_BASENAME.has(basename.toLowerCase())) return true;
  if (relPath.includes(LAYER_C_PATH_FRAGMENT)) return true;
  return false;
}

// ──────────────────────────────────────────────
// 標題萃取：優先 H1，降級至檔名
// ──────────────────────────────────────────────
function extractTitle(content, filename) {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // 從檔名移除副檔名和前置數字（如 "1.pcpt-..." → "PCPT..."）
  return path.basename(filename, '.md')
    .replace(/^\d+\./, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

// ──────────────────────────────────────────────
// Tags 萃取：從檔名 + 內容前 500 字元比對關鍵字
// ──────────────────────────────────────────────
const DOMAIN_KEYWORDS = [
  // 技術
  'PDF', 'OAuth', 'JWT', 'API', 'ECPay', 'SignalR', 'i18n', 'SEO', 'CSV',
  'Webhook', 'RBAC', 'QuestPDF', 'Fabric', 'Zustand', 'reCAPTCHA', 'HMAC',
  'hreflang', 'JSON-LD', 'Azure', 'SignalR', 'SQL',
  // 功能模組（中文）
  '會員', '管理', '金流', '報表', '字型', '訂閱', '序號', '公告', '審核',
  '財務', '會計', '語系', '定價', '帳號', '權限', '分割', '表格', '畫布',
  '編輯器', '商務', '批次', '字串', '資料', '支付', '退款', '發票',
  // 系統識別字
  'Dashboard', 'Admin', 'BackOffice', 'PCPT', 'PCPT',
];

function extractTags(content, filename, docType) {
  const sample = (filename + ' ' + content.slice(0, 500)).toLowerCase();
  const tags = new Set([docType]);

  for (const kw of DOMAIN_KEYWORDS) {
    if (sample.includes(kw.toLowerCase())) {
      tags.add(kw);
    }
  }

  // 從 tracking 檔名萃取 story prefix（如 qgr, trs, cmi, td, opt）
  const prefixMatch = path.basename(filename).match(/^([a-z]+)-\d/);
  if (prefixMatch) tags.add(prefixMatch[1]);

  return JSON.stringify([...tags]);
}

// ──────────────────────────────────────────────
// 遞迴掃描目錄，回傳文件記錄陣列
// ──────────────────────────────────────────────
function scanDir(absDir, docType) {
  const results = [];

  if (!fs.existsSync(absDir)) {
    console.warn(`  [WARN] 目錄不存在，跳過: ${absDir}`);
    return results;
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(absDir, entry.name);
    // 統一使用正斜線作為相對路徑分隔符
    const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, docType));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (isLayerC(relPath, entry.name)) {
        console.log(`  [Layer C 排除] ${relPath}`);
        continue;
      }

      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const title = extractTitle(content, entry.name);
      const tags = extractTags(content, entry.name, docType);

      results.push({
        doc_type: docType,
        title,
        path: relPath,
        tags,
        last_updated: stat.mtime.toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function scanDocIndex() {
  const args = process.argv.slice(2);
  const mode = args.includes('--full') ? 'full' : 'incremental';

  console.log('');
  console.log('============================================================');
  console.log(' PCPT doc_index ETL — CMI-2 Phase 1');
  console.log('============================================================');
  console.log(`  模式  : ${mode}`);
  console.log(`  DB    : ${DB_PATH}`);
  console.log(`  ROOT  : ${PROJECT_ROOT}`);
  console.log('');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`DB 不存在，請先執行 init-db.js: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // full 模式：清空後重建
  if (mode === 'full') {
    const before = db.prepare('SELECT COUNT(*) as n FROM doc_index').get().n;
    db.exec('DELETE FROM doc_index');
    console.log(`[0] Full 模式：已清空 doc_index (原有 ${before} 筆)`);
    console.log('');
  }

  // 掃描所有目標目錄
  const allDocs = [];
  for (const target of SCAN_TARGETS) {
    const absDir = path.join(PROJECT_ROOT, target.dir);
    console.log(`[掃描] doc_type=${target.doc_type}`);
    console.log(`       ${target.dir}`);
    const docs = scanDir(absDir, target.doc_type);
    console.log(`       → 有效文檔: ${docs.length} 筆`);
    console.log('');
    allDocs.push(...docs);
  }

  console.log(`[彙總] 全部掃描完成，共 ${allDocs.length} 筆待匯入`);
  console.log('');

  // 預備 statement（在 transaction 外 prepare，效能最佳）
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO doc_index
      (doc_type, title, path, tags, last_updated, created_at)
    VALUES
      (@doc_type, @title, @path, @tags, @last_updated, @created_at)
  `);

  const getExisting = db.prepare(
    'SELECT last_updated FROM doc_index WHERE path = ?'
  );

  let insertCount = 0;
  let skipCount = 0;

  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      if (mode === 'incremental') {
        const existing = getExisting.get(doc.path);
        // mtime 未變化 → 跳過（避免無意義更新）
        if (existing && existing.last_updated === doc.last_updated) {
          skipCount++;
          continue;
        }
      }
      upsert.run(doc);
      insertCount++;
    }
  });

  console.log('[寫入] INSERT OR REPLACE → doc_index...');
  insertMany(allDocs);

  // 統計報表
  const total = db.prepare('SELECT COUNT(*) as n FROM doc_index').get().n;
  const byType = db.prepare(
    'SELECT doc_type, COUNT(*) as n FROM doc_index GROUP BY doc_type ORDER BY n DESC'
  ).all();

  console.log('');
  console.log('============================================================');
  console.log(' ETL 完成');
  console.log('============================================================');
  console.log(`  新增/更新 : ${insertCount} 筆`);
  if (mode === 'incremental') {
    console.log(`  跳過(未變): ${skipCount} 筆`);
  }
  console.log(`  doc_index 總計: ${total} 筆`);
  console.log('');
  console.log('  類型分佈:');
  for (const g of byType) {
    console.log(`    ${g.doc_type.padEnd(14)} : ${g.n} 筆`);
  }
  console.log('');

  db.close();
}

try {
  scanDocIndex();
} catch (err) {
  console.error('');
  console.error('[ERROR] ETL 失敗:', err.message);
  process.exit(1);
}
