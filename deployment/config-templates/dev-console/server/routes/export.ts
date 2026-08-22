// ============================================================
// export.ts — 記憶庫資料匯出路由
// AC-1: GET /api/memory/export?type=context|tech&format=json&category={cat}
// AC-2: GET /api/memory/export?type=context|tech&format=csv&category={cat}
// ============================================================
import { Router, type Request, type Response } from 'express';
import { exportContext, exportTech, EXPORT_MAX_LIMIT } from '../services/memoryService.js';
import type { ContextEntry, TechEntry } from '../services/memoryService.js';

const router = Router();

// ── CSV 跳脫（RFC 4180）──────────────────────────────────────

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // 若含逗號、雙引號或換行，用雙引號包圍，引號內引號用 "" 跳脫
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

// ── Context CSV 欄位 ──────────────────────────────────────────

const CONTEXT_HEADERS = [
  'id', 'session_id', 'agent_id', 'timestamp', 'category',
  'tags', 'title', 'content', 'related_files', 'story_id', 'epic_id',
];

function contextToCsvRow(entry: ContextEntry): string {
  return buildCsvRow([
    entry.id, entry.session_id, entry.agent_id, entry.timestamp, entry.category,
    entry.tags, entry.title, entry.content, entry.related_files, entry.story_id, entry.epic_id,
  ]);
}

// ── Tech CSV 欄位 ─────────────────────────────────────────────

const TECH_HEADERS = [
  'id', 'created_by', 'created_at', 'updated_at', 'category',
  'tech_stack', 'tags', 'title', 'problem', 'solution',
  'outcome', 'lessons', 'code_snippets', 'related_files', 'references', 'confidence',
];

function techToCsvRow(entry: TechEntry): string {
  return buildCsvRow([
    entry.id, entry.created_by, entry.created_at, entry.updated_at, entry.category,
    entry.tech_stack, entry.tags, entry.title, entry.problem, entry.solution,
    entry.outcome, entry.lessons, entry.code_snippets, entry.related_files,
    entry.references, entry.confidence,
  ]);
}

// ── 日期格式（YYYYMMDD）─────────────────────────────────────

function yyyymmdd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ── GET /export ───────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const type = req.query['type'] as string;
  const format = req.query['format'] as string;
  const category = req.query['category'] as string | undefined;

  // 參數驗證
  if (type !== 'context' && type !== 'tech') {
    res.status(400).json({ error: 'type 參數必須為 context 或 tech' });
    return;
  }
  if (format !== 'json' && format !== 'csv') {
    res.status(400).json({ error: 'format 參數必須為 json 或 csv' });
    return;
  }

  // 匯出資料（多取 1 筆以偵測是否超過上限）
  const data = type === 'context'
    ? exportContext(category || undefined, EXPORT_MAX_LIMIT + 1)
    : exportTech(category || undefined, EXPORT_MAX_LIMIT + 1);

  // 超過上限檢查：AC 允許最多 10,000 筆，超過才回傳 400
  if (data.length > EXPORT_MAX_LIMIT) {
    res.status(400).json({
      error: `匯出筆數超過上限 ${EXPORT_MAX_LIMIT.toLocaleString()} 筆，請加上 category 篩選後重試`,
    });
    return;
  }

  const exportedAt = new Date().toISOString();
  const categoryLabel = category || 'all';

  // ── JSON 格式 ──
  if (format === 'json') {
    const filename = `devconsole-${type}-${categoryLabel}-${yyyymmdd()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json({
      metadata: {
        exported_at: exportedAt,
        record_count: data.length,
        type,
        category_filter: category || null,
        format_version: '1.0',
      },
      data,
    });
    return;
  }

  // ── CSV 格式（UTF-8 BOM + RFC 4180）──
  const filename = `devconsole-${type}-${categoryLabel}-${yyyymmdd()}.csv`;
  const headers = type === 'context' ? CONTEXT_HEADERS : TECH_HEADERS;

  const rows: string[] = [headers.join(',')];
  if (type === 'context') {
    (data as ContextEntry[]).forEach((entry) => rows.push(contextToCsvRow(entry)));
  } else {
    (data as TechEntry[]).forEach((entry) => rows.push(techToCsvRow(entry)));
  }

  // BOM (\uFEFF) + 行資料，\r\n 符合 RFC 4180
  const csvContent = '\uFEFF' + rows.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

export default router;
