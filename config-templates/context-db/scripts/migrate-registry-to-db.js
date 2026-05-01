// ============================================================
// 遷移腳本：registry.yaml → tech_debt_items DB 表
// 一次性執行，將 registry.yaml + registry-archive.yaml 匯入 DB
// ============================================================
// Usage: node .context-db/scripts/migrate-registry-to-db.js
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function mapStatus(entry) {
  if (entry.status === 'resolved') return 'fixed';
  if (entry.status === 'wont_fix' || entry.classification === 'wont_fix') return 'wont-fix';
  return 'open';
}

function mapCategory(entry) {
  if (entry.classification === 'wont_fix') return 'wont_fix';
  if (entry.classification === 'deferred') return 'deferred';
  if (entry.status === 'resolved') return 'deferred'; // was deferred, now fixed
  return 'deferred';
}

function migrateFile(filePath, db, stmt, counters) {
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  跳過（不存在）: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parse(content);

  if (!data?.entries || !Array.isArray(data.entries)) {
    console.log(`⏭️  跳過（無 entries）: ${filePath}`);
    return;
  }

  for (const entry of data.entries) {
    if (!entry.id || !entry.source_story) continue;

    const debtId = `TD-${entry.id}`;
    const status = mapStatus(entry);
    const category = mapCategory(entry);

    try {
      stmt.run({
        debt_id: debtId,
        story_id: entry.source_story,
        category: category,
        severity: (entry.severity || 'medium').toLowerCase(),
        dimension: entry.dimension || null,
        title: entry.summary || entry.id,
        description: null,
        affected_files: null,
        fix_guidance: null,
        root_cause: null,
        target_story: entry.target_story || null,
        status: status,
        wont_fix_reason: entry.wont_fix_reason || null,
        source_review_date: entry.source_review_date || null,
        created_at: entry.source_review_date || getTaiwanTimestamp().split('T')[0],
        resolved_at: entry.resolved_date || null,
        resolved_by: entry.resolved_by || null,
        resolved_in_story: entry.resolved_in_story || null,
      });
      counters[status] = (counters[status] || 0) + 1;
      counters.total++;
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        counters.skipped++;
      } else {
        console.error(`❌ 寫入失敗 ${debtId}: ${err.message}`);
        counters.errors++;
      }
    }
  }
}

// Main
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const stmt = db.prepare(`
  INSERT OR IGNORE INTO tech_debt_items
    (debt_id, story_id, category, severity, dimension, title, description,
     affected_files, fix_guidance, root_cause, target_story, status,
     wont_fix_reason, source_review_date, created_at, resolved_at,
     resolved_by, resolved_in_story)
  VALUES
    (@debt_id, @story_id, @category, @severity, @dimension, @title, @description,
     @affected_files, @fix_guidance, @root_cause, @target_story, @status,
     @wont_fix_reason, @source_review_date, @created_at, @resolved_at,
     @resolved_by, @resolved_in_story)
`);

const counters = { total: 0, open: 0, fixed: 0, 'wont-fix': 0, skipped: 0, errors: 0 };

const registryPath = path.join(PROJECT_ROOT, 'docs/implementation-artifacts/tech-debt/registry.yaml');
const archivePath = path.join(PROJECT_ROOT, 'docs/implementation-artifacts/tech-debt/registry-archive.yaml');

console.log('🔄 開始遷移 registry.yaml → tech_debt_items DB...\n');

migrateFile(registryPath, db, stmt, counters);
migrateFile(archivePath, db, stmt, counters);

db.close();

console.log('\n📊 遷移完成：');
console.log(`   Total: ${counters.total}`);
console.log(`   Open: ${counters.open || 0}`);
console.log(`   Fixed: ${counters.fixed || 0}`);
console.log(`   Won't Fix: ${counters['wont-fix'] || 0}`);
console.log(`   Skipped (duplicate): ${counters.skipped}`);
console.log(`   Errors: ${counters.errors}`);
