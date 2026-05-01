// ============================================================
// PCPT Context Memory DB — Debt Layer Rollback
// DLA-08 Task 7 (BR-RB-01~03): backup + rollback infra
// ============================================================
// 使用方式:
//   node .context-db/scripts/debt-layer-rollback.js --backup           # 立即備份
//   node .context-db/scripts/debt-layer-rollback.js --from <backup>    # 從備份還原 tech_debt_items
//   node .context-db/scripts/debt-layer-rollback.js --list             # 列出所有備份
// ============================================================
// 契約 (BR-RB-01):
//   - 任何 layer script 的 --execute 模式呼叫前必須執行 createBackup()
//   - 當日已存在同名備份 → 加 -HHmm 後綴 (不覆蓋)
// 契約 (BR-RB-02):
//   - 所有還原走 soft-delete friendly (INSERT OR REPLACE),禁止 DROP TABLE
// 契約 (BR-RB-03):
//   - --from 後 tech_debt_items row count 必須等於備份檔當下
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB_PATH, BACKUPS_DIR, getTaiwanTimestamp } from './_migrations/tech-debt-schema.js';

const __filename = fileURLToPath(import.meta.url);

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function todayTaiwan() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHHmm() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── BR-RB-01: 自動備份 (daily + -HHmm suffix 防覆蓋) ──
export function createBackup(label = 'dla08') {
  ensureBackupsDir();
  const today = todayTaiwan();
  let filename = `context-memory.db.backup-${today}-${label}`;
  let target = path.join(BACKUPS_DIR, filename);

  if (fs.existsSync(target)) {
    filename = `context-memory.db.backup-${today}-${label}-${nowHHmm()}`;
    target = path.join(BACKUPS_DIR, filename);
  }

  fs.copyFileSync(DB_PATH, target);
  const stat = fs.statSync(target);
  return {
    path: target,
    filename,
    size_bytes: stat.size,
    created_at: getTaiwanTimestamp(),
  };
}

// ── BR-RB-03: 從備份檔還原 tech_debt_items (單表還原,ATTACH + INSERT OR REPLACE) ──
export function rollbackFromBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    const err = new Error(`E-DLA-RB-01: backup file not found: ${backupPath}`);
    err.code = 'E-DLA-RB-01';
    throw err;
  }

  const backupDb = new Database(backupPath, { readonly: true });
  let backupCount;
  let backupCols;
  try {
    backupCount = backupDb.prepare('SELECT COUNT(*) c FROM tech_debt_items').get().c;
    backupCols = backupDb.prepare('PRAGMA table_info(tech_debt_items)').all().map(c => c.name);
  } finally {
    backupDb.close();
  }

  const mainDb = new Database(DB_PATH);
  try {
    // Escape path for SQL string literal (SQLite doesn't support parameters in ATTACH)
    const sqlSafePath = backupPath.replace(/'/g, "''");
    mainDb.exec(`ATTACH DATABASE '${sqlSafePath}' AS backup_db`);

    const mainCols = mainDb.prepare('PRAGMA table_info(tech_debt_items)').all().map(c => c.name);
    const commonCols = backupCols.filter(c => mainCols.includes(c));
    const colList = commonCols.join(', ');

    const tx = mainDb.transaction(() => {
      // BR-RB-02: 不 DROP,只 DELETE + INSERT OR REPLACE (soft-delete friendly)
      // 為 idempotency: 刪除所有 current tech_debt_items 後從 backup 全量 INSERT
      // (tech_debt_items 有 id PK; 使用 INSERT OR REPLACE 保留 backup id)
      mainDb.prepare('DELETE FROM tech_debt_items').run();
      mainDb.exec(`INSERT OR REPLACE INTO tech_debt_items (${colList}) SELECT ${colList} FROM backup_db.tech_debt_items`);
    });
    tx();

    mainDb.exec('DETACH DATABASE backup_db');

    const restoredCount = mainDb.prepare('SELECT COUNT(*) c FROM tech_debt_items').get().c;
    if (restoredCount !== backupCount) {
      throw new Error(`E-DLA-RB-03: row count mismatch after restore (backup=${backupCount} restored=${restoredCount})`);
    }

    return {
      backup_path: backupPath,
      backup_count: backupCount,
      restored_count: restoredCount,
      restored_at: getTaiwanTimestamp(),
    };
  } finally {
    mainDb.close();
  }
}

// ── --list: 列出所有 dla08 相關備份 ──
export function listBackups() {
  ensureBackupsDir();
  const entries = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('context-memory.db.backup-'))
    .map(f => {
      const full = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(full);
      return { filename: f, path: full, size_bytes: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  return entries;
}

// ── CLI entry ──
/* v8 ignore start — CLI entry, tested via manual integration */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const items = listBackups();
    console.log(`Found ${items.length} backup(s) in ${BACKUPS_DIR}`);
    for (const i of items) {
      const kb = (i.size_bytes / 1024).toFixed(1);
      console.log(`  - ${i.filename}  ${kb} KB  ${i.mtime}`);
    }
    process.exit(0);
  }

  if (args.includes('--backup')) {
    const result = createBackup('dla08');
    console.log(`✅ Backup created: ${result.filename}`);
    console.log(`   path: ${result.path}`);
    console.log(`   size: ${(result.size_bytes / 1024).toFixed(1)} KB`);
    console.log(`   created_at: ${result.created_at}`);
    process.exit(0);
  }

  const fromIdx = args.indexOf('--from');
  if (fromIdx >= 0 && args[fromIdx + 1]) {
    const backupPath = path.resolve(args[fromIdx + 1]);
    try {
      const result = rollbackFromBackup(backupPath);
      console.log(`✅ Rollback complete`);
      console.log(`   backup: ${result.backup_path}`);
      console.log(`   rows restored: ${result.restored_count}`);
      console.log(`   at: ${result.restored_at}`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  console.error('Usage:');
  console.error('  node debt-layer-rollback.js --backup');
  console.error('  node debt-layer-rollback.js --from <backup-file>');
  console.error('  node debt-layer-rollback.js --list');
  process.exit(1);
}
