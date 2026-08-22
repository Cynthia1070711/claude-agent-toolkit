// ============================================================
// memoryService.ts — Memory DB 查詢服務層
// AC-1~5: 搜尋、瀏覽、統計、CRUD（context_entries + tech_entries）
// 查詢用 singleton ReadOnly getDb()；CRUD 用 createDbConnection()
// ============================================================
import Database from 'better-sqlite3';
import fs from 'fs';
import { config } from '../config.js';
import { getDb, createDbConnection } from '../db.js';
import { sanitizeFtsQuery } from './ftsHelper.js';

// ── 型別定義（與前端 types/memory.ts 同構） ──────────────────

export interface ContextEntry {
  id: number;
  session_id: string | null;
  agent_id: string;
  timestamp: string;
  category: string;
  tags: string | null;
  title: string;
  content: string;
  related_files: string | null;
  story_id: string | null;
  epic_id: string | null;
}

export interface TechEntry {
  id: number;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  category: string;
  tech_stack: string | null;
  tags: string | null;
  title: string;
  problem: string | null;
  solution: string | null;
  outcome: string;
  lessons: string | null;
  code_snippets: string | null;
  related_files: string | null;
  references: string | null;
  confidence: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
}

export interface BrowseResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemoryStats {
  contextEntries: number;
  techEntries: number;
  stories: number;
  conversations: number;
  dbSizeBytes: number;
  lastModified: string | null;
}

export interface CrudResponse {
  success: boolean;
  id?: number;
}

// ── 搜尋（FTS5） ──────────────────────────────────────────────

export function searchContext(
  query: string,
  category?: string,
  limit = 20,
): SearchResult<ContextEntry> {
  const db = getDb();
  if (!db) return { items: [], total: 0 };

  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return { items: [], total: 0 };

  const safeLimit = Math.min(limit, 100);
  const params: unknown[] = [ftsQuery];
  let sql = `
    SELECT ce.*
    FROM context_entries ce
    JOIN context_fts f ON ce.rowid = f.rowid
    WHERE context_fts MATCH ?
  `;
  if (category) {
    sql += ' AND ce.category = ?';
    params.push(category);
  }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(safeLimit);

  const items = db.prepare(sql).all(...params) as ContextEntry[];

  // 取得不受 LIMIT 限制的真正匹配數
  const countParams: unknown[] = [ftsQuery];
  let countSql = `SELECT COUNT(*) as cnt FROM context_entries ce JOIN context_fts f ON ce.rowid = f.rowid WHERE context_fts MATCH ?`;
  if (category) {
    countSql += ' AND ce.category = ?';
    countParams.push(category);
  }
  const total = (db.prepare(countSql).get(...countParams) as { cnt: number }).cnt;

  return { items, total };
}

export function searchTech(
  query: string,
  category?: string,
  limit = 20,
): SearchResult<TechEntry> {
  const db = getDb();
  if (!db) return { items: [], total: 0 };

  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return { items: [], total: 0 };

  const safeLimit = Math.min(limit, 100);
  const params: unknown[] = [ftsQuery];
  let sql = `
    SELECT te.*
    FROM tech_entries te
    JOIN tech_fts f ON te.rowid = f.rowid
    WHERE tech_fts MATCH ?
  `;
  if (category) {
    sql += ' AND te.category = ?';
    params.push(category);
  }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(safeLimit);

  const items = db.prepare(sql).all(...params) as TechEntry[];

  // 取得不受 LIMIT 限制的真正匹配數
  const countParams: unknown[] = [ftsQuery];
  let countSql = `SELECT COUNT(*) as cnt FROM tech_entries te JOIN tech_fts f ON te.rowid = f.rowid WHERE tech_fts MATCH ?`;
  if (category) {
    countSql += ' AND te.category = ?';
    countParams.push(category);
  }
  const total = (db.prepare(countSql).get(...countParams) as { cnt: number }).cnt;

  return { items, total };
}

// ── 瀏覽（分頁） ─────────────────────────────────────────────

export function browseContext(
  category?: string,
  page = 1,
  pageSize = 20,
): BrowseResult<ContextEntry> {
  const db = getDb();
  if (!db) return { items: [], total: 0, page, pageSize };

  const safePageSize = Math.min(pageSize, 100);
  const offset = (Math.max(page, 1) - 1) * safePageSize;

  const params: unknown[] = [];
  let whereSql = category ? 'WHERE category = ?' : '';
  if (category) params.push(category);

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM context_entries ${whereSql}`)
    .get(...params) as { cnt: number };
  const total = countRow.cnt;

  const itemParams = [...params, safePageSize, offset];
  const items = db
    .prepare(
      `SELECT * FROM context_entries ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    )
    .all(...itemParams) as ContextEntry[];

  return { items, total, page, pageSize: safePageSize };
}

export function browseTech(
  category?: string,
  page = 1,
  pageSize = 20,
): BrowseResult<TechEntry> {
  const db = getDb();
  if (!db) return { items: [], total: 0, page, pageSize };

  const safePageSize = Math.min(pageSize, 100);
  const offset = (Math.max(page, 1) - 1) * safePageSize;

  const params: unknown[] = [];
  let whereSql = category ? 'WHERE category = ?' : '';
  if (category) params.push(category);

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM tech_entries ${whereSql}`)
    .get(...params) as { cnt: number };
  const total = countRow.cnt;

  const itemParams = [...params, safePageSize, offset];
  const items = db
    .prepare(
      `SELECT * FROM tech_entries ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...itemParams) as TechEntry[];

  return { items, total, page, pageSize: safePageSize };
}

// ── 統計 ──────────────────────────────────────────────────────

export function getStats(): MemoryStats {
  const db = getDb();
  if (!db) {
    return {
      contextEntries: 0,
      techEntries: 0,
      stories: 0,
      conversations: 0,
      dbSizeBytes: 0,
      lastModified: null,
    };
  }

  const contextCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM context_entries').get() as { cnt: number }
  ).cnt;
  const techCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM tech_entries').get() as { cnt: number }
  ).cnt;

  let storiesCount = 0;
  try {
    storiesCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM stories').get() as { cnt: number }
    ).cnt;
  } catch { /* table may not exist */ }

  let conversationsCount = 0;
  try {
    conversationsCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM conversation_sessions').get() as { cnt: number }
    ).cnt;
  } catch { /* table may not exist */ }

  let dbSizeBytes = 0;
  let lastModified: string | null = null;
  try {
    const stat = fs.statSync(config.dbPath);
    dbSizeBytes = stat.size;
    lastModified = stat.mtime.toISOString();
  } catch { /* ignore */ }

  return {
    contextEntries: contextCount,
    techEntries: techCount,
    stories: storiesCount,
    conversations: conversationsCount,
    dbSizeBytes,
    lastModified,
  };
}

// ── 單筆查詢 ─────────────────────────────────────────────────

export function getContextById(id: number): ContextEntry | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM context_entries WHERE id = ?').get(id);
  return (row as ContextEntry) ?? null;
}

export function getTechById(id: number): TechEntry | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM tech_entries WHERE id = ?').get(id);
  return (row as TechEntry) ?? null;
}

// ── CRUD — ReadWrite 獨立連線 ─────────────────────────────────

function getRwDb(): Database.Database {
  const conn = createDbConnection(config.dbPath);
  if (!conn) throw new Error('無法建立 ReadWrite 連線，DB 可能不存在');
  return conn;
}

export function createContext(data: Partial<ContextEntry>): CrudResponse {
  const conn = getRwDb();
  try {
    const result = conn
      .prepare(
        `INSERT INTO context_entries
           (session_id, agent_id, timestamp, category, tags, title, content, related_files, story_id, epic_id)
         VALUES
           (@session_id, @agent_id, @timestamp, @category, @tags, @title, @content, @related_files, @story_id, @epic_id)`,
      )
      .run({
        session_id: data.session_id ?? null,
        agent_id: data.agent_id ?? 'DevConsole',
        timestamp: data.timestamp ?? new Date().toISOString(),
        category: data.category ?? 'general',
        tags: data.tags ?? null,
        title: data.title ?? '',
        content: data.content ?? '',
        related_files: data.related_files ?? null,
        story_id: data.story_id ?? null,
        epic_id: data.epic_id ?? null,
      });
    return { success: true, id: Number(result.lastInsertRowid) };
  } finally {
    conn.close();
  }
}

export function updateContext(id: number, data: Partial<ContextEntry>): CrudResponse {
  const conn = getRwDb();
  try {
    const existing = conn
      .prepare('SELECT * FROM context_entries WHERE id = ?')
      .get(id) as ContextEntry | undefined;
    if (!existing) return { success: false };

    const result = conn
      .prepare(
        `UPDATE context_entries SET
           category = @category,
           tags = @tags,
           title = @title,
           content = @content,
           related_files = @related_files,
           story_id = @story_id,
           epic_id = @epic_id
         WHERE id = @id`,
      )
      .run({
        id,
        category: data.category ?? existing.category,
        tags: 'tags' in data ? data.tags : existing.tags,
        title: data.title ?? existing.title,
        content: data.content ?? existing.content,
        related_files: 'related_files' in data ? data.related_files : existing.related_files,
        story_id: 'story_id' in data ? data.story_id : existing.story_id,
        epic_id: 'epic_id' in data ? data.epic_id : existing.epic_id,
      });
    return { success: result.changes > 0 };
  } finally {
    conn.close();
  }
}

export function deleteContext(id: number): CrudResponse {
  const conn = getRwDb();
  try {
    const result = conn.prepare('DELETE FROM context_entries WHERE id = ?').run(id);
    return { success: result.changes > 0 };
  } finally {
    conn.close();
  }
}

export function createTech(data: Partial<TechEntry>): CrudResponse {
  const conn = getRwDb();
  try {
    const now = new Date().toISOString();
    const result = conn
      .prepare(
        `INSERT INTO tech_entries
           (created_by, created_at, updated_at, category, tech_stack, tags, title,
            problem, solution, outcome, lessons, code_snippets, related_files, "references", confidence)
         VALUES
           (@created_by, @created_at, @updated_at, @category, @tech_stack, @tags, @title,
            @problem, @solution, @outcome, @lessons, @code_snippets, @related_files, @references, @confidence)`,
      )
      .run({
        created_by: data.created_by ?? 'DevConsole',
        created_at: data.created_at ?? now,
        updated_at: data.updated_at ?? null,
        category: data.category ?? 'general',
        tech_stack: data.tech_stack ?? null,
        tags: data.tags ?? null,
        title: data.title ?? '',
        problem: data.problem ?? null,
        solution: data.solution ?? null,
        outcome: data.outcome ?? '',
        lessons: data.lessons ?? null,
        code_snippets: data.code_snippets ?? null,
        related_files: data.related_files ?? null,
        references: data.references ?? null,
        confidence: data.confidence ?? 80,
      });
    return { success: true, id: Number(result.lastInsertRowid) };
  } finally {
    conn.close();
  }
}

export function updateTech(id: number, data: Partial<TechEntry>): CrudResponse {
  const conn = getRwDb();
  try {
    const existing = conn
      .prepare('SELECT * FROM tech_entries WHERE id = ?')
      .get(id) as TechEntry | undefined;
    if (!existing) return { success: false };

    const result = conn
      .prepare(
        `UPDATE tech_entries SET
           updated_at = @updated_at,
           category = @category,
           tags = @tags,
           title = @title,
           problem = @problem,
           solution = @solution,
           outcome = @outcome,
           lessons = @lessons
         WHERE id = @id`,
      )
      .run({
        id,
        updated_at: new Date().toISOString(),
        category: data.category ?? existing.category,
        tags: 'tags' in data ? data.tags : existing.tags,
        title: data.title ?? existing.title,
        problem: 'problem' in data ? data.problem : existing.problem,
        solution: 'solution' in data ? data.solution : existing.solution,
        outcome: data.outcome ?? existing.outcome,
        lessons: 'lessons' in data ? data.lessons : existing.lessons,
      });
    return { success: result.changes > 0 };
  } finally {
    conn.close();
  }
}

export function deleteTech(id: number): CrudResponse {
  const conn = getRwDb();
  try {
    const result = conn.prepare('DELETE FROM tech_entries WHERE id = ?').run(id);
    return { success: result.changes > 0 };
  } finally {
    conn.close();
  }
}

// ── 匯出（批量查詢，上限 10,000 筆）─────────────────────────

export const EXPORT_MAX_LIMIT = 10_000;

export function exportContext(category?: string, limit = EXPORT_MAX_LIMIT): ContextEntry[] {
  const db = getDb();
  if (!db) return [];

  // 允許 EXPORT_MAX_LIMIT + 1（供路由偵測超限用）
  const safeLimit = Math.min(limit, EXPORT_MAX_LIMIT + 1);
  const params: unknown[] = [];
  const whereSql = category ? 'WHERE category = ?' : '';
  if (category) params.push(category);

  return db
    .prepare(`SELECT * FROM context_entries ${whereSql} ORDER BY timestamp DESC LIMIT ?`)
    .all(...params, safeLimit) as ContextEntry[];
}

export function exportTech(category?: string, limit = EXPORT_MAX_LIMIT): TechEntry[] {
  const db = getDb();
  if (!db) return [];

  // 允許 EXPORT_MAX_LIMIT + 1（供路由偵測超限用）
  const safeLimit = Math.min(limit, EXPORT_MAX_LIMIT + 1);
  const params: unknown[] = [];
  const whereSql = category ? 'WHERE category = ?' : '';
  if (category) params.push(category);

  return db
    .prepare(`SELECT * FROM tech_entries ${whereSql} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, safeLimit) as TechEntry[];
}
