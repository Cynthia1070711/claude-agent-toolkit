// ============================================================
// PCPT Context Memory DB — Generic SQL Migration Applier
// DLA-08 Task 5 / AC-5 supporting infrastructure
// ============================================================
// 使用方式:
//   node .context-db/scripts/apply-migration.js <migration.sql>
//   node .context-db/scripts/apply-migration.js <migration.sql> --no-backup
//   node .context-db/scripts/apply-migration.js --dry-run <migration.sql>
// ============================================================
// 契約:
//   - 預設執行前自動備份 (BR-RB-01),可用 --no-backup 關閉
//   - 全檔案以 db.exec() 執行 (SQLite 支援多語句),包在 transaction 中
//   - 路徑解析: 若非絕對路徑,先嘗試 .context-db/migrations/<name>
//   - 冪等性由 SQL 檔案自身負責 (ADD COLUMN / CREATE INDEX IF NOT EXISTS 等)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB_PATH, getTaiwanTimestamp } from './_migrations/tech-debt-schema.js';
import { createBackup } from './debt-layer-rollback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveMigrationPath(arg) {
  if (path.isAbsolute(arg)) return arg;
  if (fs.existsSync(arg)) return path.resolve(arg);
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const candidate = path.join(migrationsDir, arg);
  if (fs.existsSync(candidate)) return candidate;
  return arg;
}

function applyMigration(migrationFile, { dryRun = false, skipBackup = false } = {}) {
  const resolved = resolveMigrationPath(migrationFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Migration file not found: ${migrationFile} (resolved: ${resolved})`);
  }

  const sql = fs.readFileSync(resolved, 'utf8');
  const statementsCount = sql.split(/;\s*$/gm).filter(s => s.trim() && !s.trim().startsWith('--')).length;

  if (dryRun) {
    return {
      mode: 'dry-run',
      file: resolved,
      size_bytes: sql.length,
      statement_count_estimate: statementsCount,
      at: getTaiwanTimestamp(),
    };
  }

  let backup = null;
  if (!skipBackup) {
    backup = createBackup('premigration');
  }

  const db = new Database(DB_PATH);
  try {
    db.exec('BEGIN');
    db.exec(sql);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    db.close();
    const e = new Error(`Migration failed: ${err.message}`);
    e.cause = err;
    e.backup = backup;
    throw e;
  }
  db.close();

  return {
    mode: 'execute',
    file: resolved,
    backup_path: backup ? backup.path : null,
    applied_at: getTaiwanTimestamp(),
  };
}

/* v8 ignore start — CLI entry, tested via manual integration */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipBackup = args.includes('--no-backup');
  const fileArg = args.find(a => !a.startsWith('--'));

  if (!fileArg) {
    console.error('Usage: node apply-migration.js <migration.sql> [--dry-run] [--no-backup]');
    process.exit(1);
  }

  try {
    const result = applyMigration(fileArg, { dryRun, skipBackup });
    if (dryRun) {
      console.log(`[dry-run] would apply: ${result.file}`);
      console.log(`   size: ${result.size_bytes} bytes, ~${result.statement_count_estimate} statements`);
    } else {
      console.log(`✅ Migration applied: ${path.basename(result.file)}`);
      if (result.backup_path) console.log(`   backup: ${result.backup_path}`);
      console.log(`   at: ${result.applied_at}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    if (err.backup?.path) console.error(`   backup retained at: ${err.backup.path}`);
    process.exit(2);
  }
}

export { applyMigration, resolveMigrationPath };
