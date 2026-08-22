// ============================================================
// sessionService.ts — Session 時間軸 DB 查詢服務層
// DVS-06 AC-1: 合併 context_entries(category='session') + conversation_sessions
// DVC-09-M5 技術債修復：related_files 欄位包含在 SessionTimelineItemDto
// better-sqlite3 同步 API（非 async）
// ============================================================
import { getDb } from '../db.js';

// ── 型別定義 ──────────────────────────────────────────────────

export interface SessionTimelineItemDto {
  id: string;
  source: 'context' | 'conversation';
  title: string;
  content: string;
  summary: string | null;
  agent: string | null;
  tags: string | null;
  related_files: string | null;           // DVC-09-M5 修復
  timestamp: string;
  created_at: string;
}

export interface SessionQueryParams {
  startDate?: string;
  endDate?: string;
  agent?: string;
  tags?: string;
  page?: number;
  pageSize?: number;
}

export interface SessionTimelineResponse {
  items: SessionTimelineItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionFiltersResponse {
  agents: string[];
  tags: string[];
}

// ── 輔助：截取摘要 ────────────────────────────────────────────

function makeSummary(content: string | null, maxLen = 200): string | null {
  if (!content) return null;
  return content.length <= maxLen ? content : content.slice(0, maxLen) + '…';
}

// ── 主要查詢：合併兩表 ────────────────────────────────────────

export function getSessionTimeline(params: SessionQueryParams): SessionTimelineResponse {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

  if (!db) {
    return { items: [], total: 0, page, pageSize };
  }

  // ── 從 context_entries (category='session') 取得記錄 ──
  const ctxParams: unknown[] = ['session'];
  let ctxWhere = 'WHERE category = ?';

  if (params.startDate) {
    ctxWhere += ' AND timestamp >= ?';
    ctxParams.push(params.startDate);
  }
  if (params.endDate) {
    ctxWhere += ' AND timestamp <= ?';
    ctxParams.push(params.endDate + 'T23:59:59.999+08:00');
  }
  if (params.agent) {
    ctxWhere += ' AND agent_id = ?';
    ctxParams.push(params.agent);
  }
  if (params.tags) {
    // tags 標籤包含篩選（多選 AND 邏輯 + LIKE escape）
    const tagList = params.tags.split(',').map(t => t.trim()).filter(Boolean);
    for (const tag of tagList) {
      const escaped = tag.replace(/%/g, '\\%').replace(/_/g, '\\_');
      ctxWhere += " AND tags LIKE ? ESCAPE '\\'";
      ctxParams.push(`%${escaped}%`);
    }
  }

  const ctxRows = db
    .prepare(
      `SELECT
         CAST(id AS TEXT) AS id,
         'context'        AS source,
         title,
         content,
         agent_id,
         tags,
         related_files,
         timestamp,
         timestamp        AS created_at
       FROM context_entries
       ${ctxWhere}`,
    )
    .all(...ctxParams) as Array<{
    id: string;
    source: 'context';
    title: string;
    content: string;
    agent_id: string;
    tags: string | null;
    related_files: string | null;
    timestamp: string;
    created_at: string;
  }>;

  // ── 從 conversation_sessions 取得記錄 ──
  let convRows: Array<{
    id: string;
    source: 'conversation';
    title: string;
    content: string;
    agent_id: string | null;
    tags: string | null;
    related_files: string | null;
    timestamp: string;
    created_at: string;
  }> = [];

  try {
    const convParams: unknown[] = [];
    let convWhere = 'WHERE 1=1';

    if (params.startDate) {
      convWhere += ' AND started_at >= ?';
      convParams.push(params.startDate);
    }
    if (params.endDate) {
      convWhere += ' AND started_at <= ?';
      convParams.push(params.endDate + 'T23:59:59.999+08:00');
    }
    if (params.agent) {
      convWhere += ' AND agent_id = ?';
      convParams.push(params.agent);
    }

    convRows = db
      .prepare(
        `SELECT
           session_id         AS id,
           'conversation'     AS source,
           COALESCE(first_prompt, session_id) AS title,
           COALESCE(summary, first_prompt, '') AS content,
           agent_id,
           topics             AS tags,
           files_modified     AS related_files,
           started_at         AS timestamp,
           started_at         AS created_at
         FROM conversation_sessions
         ${convWhere}`,
      )
      .all(...convParams) as typeof convRows;
  } catch {
    // conversation_sessions 可能不存在或欄位不符，忽略
    convRows = [];
  }

  // ── 合併並排序 ──
  const allItems: SessionTimelineItemDto[] = [
    ...ctxRows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      content: r.content,
      summary: makeSummary(r.content),
      agent: r.agent_id || null,
      tags: r.tags,
      related_files: r.related_files,
      timestamp: r.timestamp,
      created_at: r.created_at,
    })),
    ...convRows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title || r.id,
      content: r.content,
      summary: makeSummary(r.content),
      agent: r.agent_id || null,
      tags: r.tags,
      related_files: r.related_files,
      timestamp: r.timestamp,
      created_at: r.created_at,
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = allItems.length;
  const offset = (page - 1) * pageSize;
  const items = allItems.slice(offset, offset + pageSize);

  return { items, total, page, pageSize };
}

// ── 取得可用 Agent 列表 ──────────────────────────────────────

export function getAvailableAgents(): string[] {
  const db = getDb();
  if (!db) return [];

  const agents = new Set<string>();

  try {
    const ctxAgents = db
      .prepare(
        `SELECT DISTINCT agent_id FROM context_entries WHERE category = 'session' AND agent_id IS NOT NULL ORDER BY agent_id`,
      )
      .all() as Array<{ agent_id: string }>;
    ctxAgents.forEach((r) => agents.add(r.agent_id));
  } catch { /* ignore */ }

  try {
    const convAgents = db
      .prepare(
        `SELECT DISTINCT agent_id FROM conversation_sessions WHERE agent_id IS NOT NULL ORDER BY agent_id`,
      )
      .all() as Array<{ agent_id: string }>;
    convAgents.forEach((r) => r.agent_id && agents.add(r.agent_id));
  } catch { /* ignore */ }

  return [...agents].sort();
}

// ── 取得可用標籤列表 ─────────────────────────────────────────

export function getAvailableTags(): string[] {
  const db = getDb();
  if (!db) return [];

  const tagSet = new Set<string>();

  try {
    const rows = db
      .prepare(
        `SELECT tags FROM context_entries WHERE category = 'session' AND tags IS NOT NULL`,
      )
      .all() as Array<{ tags: string }>;

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.tags);
      } catch {
        parsed = row.tags.split(',');
      }
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (typeof t === 'string' && t.trim()) tagSet.add(t.trim());
        }
      }
    }
  } catch { /* ignore */ }

  return [...tagSet].sort();
}
