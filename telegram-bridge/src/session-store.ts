// ============================================================
// Session Store — SQLite 會話持久化
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import type { Session, Bookmark, TokenUsage } from './types';

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(__dirname, '..', 'bridge.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  /** 資料庫 schema 初始化/遷移 */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        working_directory TEXT NOT NULL,
        model TEXT DEFAULT 'sonnet',
        claude_session_id TEXT,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        turn_count INTEGER DEFAULT 0,
        avg_response_ms REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        last_active_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(chat_id, name)
      );
    `);
  }

  // --- 會話管理 ---

  /** 取得或建立會話 */
  getOrCreateSession(chatId: number, workingDir: string, model: string): Session {
    const existing = this.db.prepare(
      'SELECT * FROM sessions WHERE chat_id = ? ORDER BY last_active_at DESC LIMIT 1'
    ).get(chatId) as Record<string, unknown> | undefined;

    if (existing) {
      return this.rowToSession(existing);
    }

    const id = `session_${chatId}_${Date.now()}`;
    this.db.prepare(
      'INSERT INTO sessions (id, chat_id, working_directory, model) VALUES (?, ?, ?, ?)'
    ).run(id, chatId, workingDir, model);

    return this.getSessionById(id)!;
  }

  /** 以 ID 取得會話 */
  getSessionById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToSession(row) : null;
  }

  /** 以 chatId 取得最新會話 */
  getActiveSession(chatId: number): Session | null {
    const row = this.db.prepare(
      'SELECT * FROM sessions WHERE chat_id = ? ORDER BY last_active_at DESC LIMIT 1'
    ).get(chatId) as Record<string, unknown> | undefined;
    return row ? this.rowToSession(row) : null;
  }

  /** 建立新會話（結束舊的） */
  createNewSession(chatId: number, workingDir: string, model: string): Session {
    const id = `session_${chatId}_${Date.now()}`;
    this.db.prepare(
      'INSERT INTO sessions (id, chat_id, working_directory, model) VALUES (?, ?, ?, ?)'
    ).run(id, chatId, workingDir, model);
    return this.getSessionById(id)!;
  }

  /** 更新 Claude session ID */
  updateClaudeSessionId(sessionId: string, claudeSessionId: string): void {
    this.db.prepare(
      'UPDATE sessions SET claude_session_id = ?, last_active_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).run(claudeSessionId, sessionId);
  }

  /** 更新模型 */
  updateModel(sessionId: string, model: string): void {
    this.db.prepare(
      'UPDATE sessions SET model = ?, last_active_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).run(model, sessionId);
  }

  /** 更新工作目錄 */
  updateWorkingDirectory(sessionId: string, dir: string): void {
    this.db.prepare(
      'UPDATE sessions SET working_directory = ?, last_active_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).run(dir, sessionId);
  }

  /** 更新 token 用量與回應統計 */
  updateUsage(sessionId: string, usage: TokenUsage, durationMs: number): void {
    const session = this.getSessionById(sessionId);
    if (!session) return;

    const newTurnCount = session.turnCount + 1;
    const totalMs = session.avgResponseMs * session.turnCount + durationMs;
    const newAvgMs = totalMs / newTurnCount;

    this.db.prepare(`
      UPDATE sessions SET
        total_input_tokens = total_input_tokens + ?,
        total_output_tokens = total_output_tokens + ?,
        turn_count = ?,
        avg_response_ms = ?,
        last_active_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      usage.input_tokens,
      usage.output_tokens,
      newTurnCount,
      newAvgMs,
      sessionId
    );
  }

  // --- 書籤管理 ---

  /** 新增書籤 */
  addBookmark(chatId: number, name: string, bookmarkPath: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO bookmarks (chat_id, name, path) VALUES (?, ?, ?)'
    ).run(chatId, name, bookmarkPath);
  }

  /** 刪除書籤 */
  removeBookmark(chatId: number, name: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM bookmarks WHERE chat_id = ? AND name = ?'
    ).run(chatId, name);
    return result.changes > 0;
  }

  /** 列出所有書籤 */
  getBookmarks(chatId: number): Bookmark[] {
    const rows = this.db.prepare(
      'SELECT * FROM bookmarks WHERE chat_id = ? ORDER BY name'
    ).all(chatId) as Record<string, unknown>[];
    return rows.map(this.rowToBookmark);
  }

  /** 以名稱取得書籤路徑 */
  getBookmarkPath(chatId: number, name: string): string | null {
    const row = this.db.prepare(
      'SELECT path FROM bookmarks WHERE chat_id = ? AND name = ?'
    ).get(chatId, name) as { path: string } | undefined;
    return row?.path || null;
  }

  // --- 內部工具 ---

  private rowToSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      chatId: row.chat_id as number,
      workingDirectory: row.working_directory as string,
      model: row.model as string,
      claudeSessionId: row.claude_session_id as string | undefined,
      totalInputTokens: row.total_input_tokens as number,
      totalOutputTokens: row.total_output_tokens as number,
      turnCount: row.turn_count as number,
      avgResponseMs: row.avg_response_ms as number,
      createdAt: row.created_at as string,
      lastActiveAt: row.last_active_at as string,
    };
  }

  private rowToBookmark(row: Record<string, unknown>): Bookmark {
    return {
      id: row.id as number,
      chatId: row.chat_id as number,
      name: row.name as string,
      path: row.path as string,
      createdAt: row.created_at as string,
    };
  }

  /** 關閉資料庫連線 */
  close(): void {
    this.db.close();
  }
}
