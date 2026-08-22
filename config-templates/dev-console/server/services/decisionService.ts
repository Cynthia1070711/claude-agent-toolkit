// ============================================================
// decisionService.ts — 技術決策查詢服務
// DVS-07 AC-1: 合併查詢 context_entries + tech_entries (category='decision')
// 查詢使用 getDb() singleton；FTS5 安全化使用 sanitizeFtsQuery()
// ============================================================
import { getDb } from '../db.js';
import { sanitizeFtsQuery } from './ftsHelper.js';

export type DecisionSource = 'context' | 'tech';

export interface DecisionEntry {
  id: number;
  source: DecisionSource;
  title: string;
  content: string;
  timestamp: string;
  tags: string | null;
  story_id: string | null;
  epic_id: string | null;
}

export interface DecisionListResult {
  items: DecisionEntry[];
  total: number;
  page: number;
}

/** 從 context_entries 取得 decision 記錄 */
function queryContextDecisions(
  db: ReturnType<typeof getDb>,
  search: string | null,
  limit: number,
  offset: number,
): DecisionEntry[] {
  if (!db) return [];

  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return [];
    const sql = `
      SELECT ce.id, 'context' AS source, ce.title,
             ce.content, ce.timestamp, ce.tags, ce.story_id, ce.epic_id
      FROM context_entries ce
      JOIN context_fts f ON ce.rowid = f.rowid
      WHERE context_fts MATCH ? AND ce.category = 'decision'
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;
    return db.prepare(sql).all(ftsQuery, limit, offset) as DecisionEntry[];
  }

  const sql = `
    SELECT id, 'context' AS source, title, content, timestamp, tags, story_id, epic_id
    FROM context_entries
    WHERE category = 'decision'
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(limit, offset) as DecisionEntry[];
}

/** 從 tech_entries 取得 decision 記錄，並合併 problem + solution 為 content */
function queryTechDecisions(
  db: ReturnType<typeof getDb>,
  search: string | null,
  limit: number,
  offset: number,
): DecisionEntry[] {
  if (!db) return [];

  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return [];
    const sql = `
      SELECT te.id, 'tech' AS source, te.title,
             COALESCE(te.solution, te.problem, te.outcome, '') AS content,
             te.created_at AS timestamp, te.tags,
             NULL AS story_id, NULL AS epic_id
      FROM tech_entries te
      JOIN tech_fts f ON te.rowid = f.rowid
      WHERE tech_fts MATCH ? AND te.category = 'decision'
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;
    return db.prepare(sql).all(ftsQuery, limit, offset) as DecisionEntry[];
  }

  const sql = `
    SELECT id, 'tech' AS source, title,
           COALESCE(solution, problem, outcome, '') AS content,
           created_at AS timestamp, tags,
           NULL AS story_id, NULL AS epic_id
    FROM tech_entries
    WHERE category = 'decision'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(limit, offset) as DecisionEntry[];
}

/** 計算 context_entries decision 總數 */
function countContextDecisions(db: ReturnType<typeof getDb>, search: string | null): number {
  if (!db) return 0;
  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return 0;
    const sql = `
      SELECT COUNT(*) AS cnt
      FROM context_entries ce JOIN context_fts f ON ce.rowid = f.rowid
      WHERE context_fts MATCH ? AND ce.category = 'decision'
    `;
    return (db.prepare(sql).get(ftsQuery) as { cnt: number }).cnt;
  }
  return (
    db.prepare(`SELECT COUNT(*) AS cnt FROM context_entries WHERE category = 'decision'`).get() as {
      cnt: number;
    }
  ).cnt;
}

/** 計算 tech_entries decision 總數 */
function countTechDecisions(db: ReturnType<typeof getDb>, search: string | null): number {
  if (!db) return 0;
  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return 0;
    const sql = `
      SELECT COUNT(*) AS cnt
      FROM tech_entries te JOIN tech_fts f ON te.rowid = f.rowid
      WHERE tech_fts MATCH ? AND te.category = 'decision'
    `;
    return (db.prepare(sql).get(ftsQuery) as { cnt: number }).cnt;
  }
  return (
    db.prepare(`SELECT COUNT(*) AS cnt FROM tech_entries WHERE category = 'decision'`).get() as {
      cnt: number;
    }
  ).cnt;
}

export function listDecisions(options: {
  search?: string;
  source?: 'context' | 'tech' | 'all';
  page?: number;
  pageSize?: number;
}): DecisionListResult {
  const db = getDb();
  const { search = '', source = 'all', page = 1, pageSize = 20 } = options;
  const safePage = Math.max(page, 1);
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const searchValue = search.trim() || null;

  const offset = (safePage - 1) * safePageSize;

  let items: DecisionEntry[] = [];
  let total = 0;

  if (source === 'context') {
    total = countContextDecisions(db, searchValue);
    items = queryContextDecisions(db, searchValue, safePageSize, offset);
  } else if (source === 'tech') {
    total = countTechDecisions(db, searchValue);
    items = queryTechDecisions(db, searchValue, safePageSize, offset);
  } else {
    // 'all': 合併兩個來源，按時間倒序排列（先各自查詢再合併）
    const ctxTotal = countContextDecisions(db, searchValue);
    const techTotal = countTechDecisions(db, searchValue);
    total = ctxTotal + techTotal;

    // 合併查詢（取足量後排序分頁）
    const ctxItems = queryContextDecisions(db, searchValue, safePageSize + offset, 0);
    const techItems = queryTechDecisions(db, searchValue, safePageSize + offset, 0);
    const combined = [...ctxItems, ...techItems].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    items = combined.slice(offset, offset + safePageSize);
  }

  return { items, total, page: safePage };
}
