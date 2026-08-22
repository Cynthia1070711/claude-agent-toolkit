// ============================================================
// DevConsole SQLite 連線層 — better-sqlite3 singleton
// AC-3: WAL 模式 + busy_timeout 5000ms（與 MCP Server 並發安全）
// ============================================================
import Database from 'better-sqlite3';
import fs from 'fs';
import { config } from './config.js';

export interface DbStats {
  connected: boolean;
  path: string;
  sizeBytes: number;
  tableCount: number;
}

let db: Database.Database | null = null;

/**
 * 純工廠函式 — 建立 WAL + busy_timeout 設定好的 DB 連線。
 * 供測試直接使用（可傳入任意 dbPath），或 getDb() singleton 內部呼叫。
 * 若 DB 不存在或連線失敗回傳 null（不 crash server）。
 */
export function createDbConnection(dbPath: string): Database.Database | null {
  if (!fs.existsSync(dbPath)) {
    console.error(
      `[DevConsole DB] 錯誤: DB 不存在 — ${dbPath}\n` +
        `  請確認 .context-db/phycool.db 已初始化，或設定 MEMORY_DB_PATH 環境變數。`,
    );
    return null;
  }
  try {
    const conn = new Database(dbPath, { readonly: false });
    // WAL 模式：避免與 MCP Server 並發寫入衝突
    conn.pragma('journal_mode = WAL');
    // busy_timeout：等待鎖最多 5 秒再拋錯
    conn.pragma('busy_timeout = 5000');
    return conn;
  } catch (err) {
    console.error(`[DevConsole DB] 連線失敗: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Lazy singleton — 第一次呼叫時建立連線，後續重用同一實例。
 * 若 DB 不存在或連線失敗，回傳 null（不 crash server）。
 */
export function getDb(): Database.Database | null {
  if (db) return db;
  db = createDbConnection(config.dbPath);
  return db;
}

/**
 * 重置 singleton（供測試使用，避免跨測試汙染）。
 * 會關閉現有連線。
 */
export function resetDb(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
}

/**
 * 取得 DB 統計資訊，供 /api/health 使用。
 * 接受可選的 dbPath 參數（供測試注入），省略時使用 config.dbPath。
 */
export function getDbStats(dbPath?: string): DbStats {
  const resolvedPath = dbPath ?? config.dbPath;
  const instance = dbPath ? createDbConnection(dbPath) : getDb();

  if (!instance) {
    return {
      connected: false,
      path: resolvedPath,
      sizeBytes: 0,
      tableCount: 0,
    };
  }

  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(resolvedPath).size;
  } catch {
    // 忽略 stat 錯誤，DB 仍可用
  }

  let tableCount = 0;
  try {
    const row = instance
      .prepare(
        `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )
      .get() as { cnt: number };
    tableCount = row.cnt;
  } catch {
    // 忽略查詢錯誤
  }

  // 若透過 dbPath 注入的 createDbConnection，使用完畢後關閉
  if (dbPath) instance.close();

  return {
    connected: true,
    path: resolvedPath,
    sizeBytes,
    tableCount,
  };
}
