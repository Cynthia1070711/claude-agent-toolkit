// ============================================================
// Context Memory DB — MCP Server (通用版)
// 適用於任何使用 BMAD Method 的專案
// ============================================================
// 執行方式: node .context-db/server.js
// 傳輸模式: stdio (Claude Code 自動管理生命週期)
// Tools: 6 個 (search_context, search_tech, add_context, add_tech, add_cr_issue, trace_context)
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'context-memory.db');

// ── DB 連接（單例）──
let db = null;

function getDb() {
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `DB not found at ${DB_PATH}. Run: node .context-db/scripts/init-db.js`
      );
    }
    db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// ── MCP Server ──
const server = new Server(
  { name: 'context-memory', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// ── Tool 清單 ──
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_context',
      description: 'Search AI Agent context memory. Supports FTS5 full-text search with multi-condition filters.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (FTS5, >= 3 chars; empty returns recent N)' },
          filters: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              category: { type: 'string', description: 'decision | pattern | debug | lesson | warning' },
              story_id: { type: 'string' },
              epic_id: { type: 'string' },
              limit: { type: 'number', description: 'Max results (default 10)' },
            },
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_tech',
      description: 'Search technical knowledge base. Supports FTS5 with category/tech_stack/outcome filters.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (FTS5, >= 3 chars)' },
          category: { type: 'string' },
          tech_stack: { type: 'string' },
          outcome: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
    {
      name: 'add_context',
      description: 'Write AI Agent context memory. Call after workflow completion to record decisions, patterns, debug findings.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id:      { type: 'string' },
          category:      { type: 'string', description: 'decision | pattern | debug | architecture' },
          title:         { type: 'string', description: 'Short title (< 100 chars)' },
          content:       { type: 'string', description: 'Detailed content' },
          tags:          { type: 'string', description: 'JSON array or comma-separated' },
          story_id:      { type: 'string' },
          epic_id:       { type: 'string' },
          related_files: { type: 'string', description: 'Comma-separated file paths' },
          session_id:    { type: 'string' },
        },
        required: ['agent_id', 'category', 'title', 'content'],
      },
    },
    {
      name: 'add_tech',
      description: 'Write technical knowledge entry. Record success patterns, failure lessons, bug fixes, architecture decisions.',
      inputSchema: {
        type: 'object',
        properties: {
          created_by:    { type: 'string' },
          category:      { type: 'string', description: 'success | failure | workaround | pattern | bugfix | architecture | benchmark | security | test_pattern | review' },
          title:         { type: 'string' },
          outcome:       { type: 'string', description: 'success | partial | failed' },
          problem:       { type: 'string' },
          solution:      { type: 'string' },
          lessons:       { type: 'string' },
          tech_stack:    { type: 'string' },
          tags:          { type: 'string' },
          code_snippets: { type: 'string' },
          related_files: { type: 'string' },
          references:    { type: 'string' },
          confidence:    { type: 'number', description: '0-100 (default 80)' },
        },
        required: ['created_by', 'category', 'title', 'outcome'],
      },
    },
    {
      name: 'add_cr_issue',
      description: 'Write Code Review issue. Maps to tech_entries (category=review) for knowledge preservation.',
      inputSchema: {
        type: 'object',
        properties: {
          story_id:       { type: 'string' },
          issue_code:     { type: 'string', description: 'e.g., M1, H2' },
          severity:       { type: 'string', description: 'critical | high | medium | low' },
          description:    { type: 'string' },
          resolution:     { type: 'string', description: 'FIXED | DEFERRED | WONT_FIX' },
          category:       { type: 'string' },
          target_story:   { type: 'string' },
          self_check_q1:  { type: 'string' },
          self_check_q2:  { type: 'string' },
          self_check_q3:  { type: 'string' },
          self_check_q4:  { type: 'string' },
          self_check_q5:  { type: 'string' },
        },
        required: ['story_id', 'issue_code', 'severity', 'description', 'resolution'],
      },
    },
    {
      name: 'trace_context',
      description: 'Trace related context. FTS5 initial hit then expand via story_id + related_files (graph trace).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (FTS5, >= 3 chars)' },
          depth: { type: 'number', description: 'Expansion depth (1 or 2, default 1)' },
        },
        required: ['query'],
      },
    },
  ],
}));

// ── tags 正規化 ──
function normalizeTags(tags) {
  if (!tags || typeof tags !== 'string') return null;
  const s = tags.trim();
  if (!s) return null;
  if (s.startsWith('[')) return s;
  return JSON.stringify(s.split(',').map(t => t.trim()).filter(Boolean));
}

// ── Tool 呼叫處理 ──
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'search_context': return handleSearchContext(args);
      case 'search_tech':    return handleSearchTech(args);
      case 'add_context':    return handleAddContext(args);
      case 'add_tech':       return handleAddTech(args);
      case 'add_cr_issue':   return handleAddCrIssue(args);
      case 'trace_context':  return handleTraceContext(args);
      default:
        return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Tool error: ${err.message}` }] };
  }
});

// ── search_context ──
function handleSearchContext(args) {
  const { query = '', filters = {} } = args;
  const { agent_id, category, story_id, epic_id, limit = 10 } = filters;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);
  const database = getDb();

  if (!query || query.trim() === '') {
    const params = [];
    let sql = `SELECT id, agent_id, timestamp, category, title, SUBSTR(content, 1, 200) AS content_preview, tags, story_id FROM context_entries WHERE 1=1`;
    if (agent_id) { sql += ' AND agent_id = ?'; params.push(agent_id); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (story_id) { sql += ' AND story_id = ?'; params.push(story_id); }
    if (epic_id)  { sql += ' AND epic_id = ?';  params.push(epic_id); }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(safeLimit);
    return { content: [{ type: 'text', text: JSON.stringify(database.prepare(sql).all(...params)) }] };
  }

  if (query.trim().length < 3) {
    return { content: [{ type: 'text', text: JSON.stringify([]) }] };
  }

  const params = [query.trim()];
  let sql = `SELECT ce.id, ce.agent_id, ce.timestamp, ce.category, ce.title, SUBSTR(ce.content, 1, 200) AS content_preview, ce.tags, ce.story_id FROM context_entries ce JOIN context_fts f ON ce.rowid = f.rowid WHERE context_fts MATCH ?`;
  if (agent_id) { sql += ' AND ce.agent_id = ?'; params.push(agent_id); }
  if (category) { sql += ' AND ce.category = ?'; params.push(category); }
  if (story_id) { sql += ' AND ce.story_id = ?'; params.push(story_id); }
  if (epic_id)  { sql += ' AND ce.epic_id = ?';  params.push(epic_id); }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(safeLimit);
  return { content: [{ type: 'text', text: JSON.stringify(database.prepare(sql).all(...params)) }] };
}

// ── search_tech ──
function handleSearchTech(args) {
  const { query = '', category, tech_stack, outcome, limit = 10 } = args;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);
  const database = getDb();

  if (!query || query.trim() === '') {
    const params = [];
    let sql = `SELECT id, created_by, created_at, category, tech_stack, title, SUBSTR(problem, 1, 200) AS problem_preview, SUBSTR(solution, 1, 200) AS solution_preview, outcome, confidence, tags FROM tech_entries WHERE 1=1`;
    if (category)   { sql += ' AND category = ?';   params.push(category); }
    if (tech_stack) { sql += ' AND tech_stack = ?'; params.push(tech_stack); }
    if (outcome)    { sql += ' AND outcome = ?';    params.push(outcome); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(safeLimit);
    return { content: [{ type: 'text', text: JSON.stringify(database.prepare(sql).all(...params)) }] };
  }

  if (query.trim().length < 3) {
    return { content: [{ type: 'text', text: JSON.stringify([]) }] };
  }

  const params = [query.trim()];
  let sql = `SELECT te.id, te.created_by, te.created_at, te.category, te.tech_stack, te.title, SUBSTR(te.problem, 1, 200) AS problem_preview, SUBSTR(te.solution, 1, 200) AS solution_preview, te.outcome, te.confidence, te.tags FROM tech_entries te JOIN tech_fts f ON te.rowid = f.rowid WHERE tech_fts MATCH ?`;
  if (category)   { sql += ' AND te.category = ?';   params.push(category); }
  if (tech_stack) { sql += ' AND te.tech_stack = ?'; params.push(tech_stack); }
  if (outcome)    { sql += ' AND te.outcome = ?';    params.push(outcome); }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(safeLimit);
  return { content: [{ type: 'text', text: JSON.stringify(database.prepare(sql).all(...params)) }] };
}

// ── add_context ──
function handleAddContext(args) {
  const { agent_id, category, title, content, tags, story_id, epic_id, related_files, session_id } = args;
  if (!agent_id?.trim() || !category?.trim() || !title?.trim() || !content?.trim()) {
    return { isError: true, content: [{ type: 'text', text: 'Missing required: agent_id, category, title, content' }] };
  }
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO context_entries (agent_id, timestamp, category, title, content, tags, story_id, epic_id, related_files, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agent_id.trim(), new Date().toISOString(), category.trim(), title.trim(), content.trim(), normalizeTags(tags), story_id || null, epic_id || null, related_files || null, session_id || null);
  return { content: [{ type: 'text', text: JSON.stringify({ id: result.lastInsertRowid, message: `add_context OK (id=${result.lastInsertRowid})` }) }] };
}

// ── add_tech ──
const VALID_TECH_CATEGORIES = new Set([
  'success', 'failure', 'workaround', 'pattern', 'bugfix', 'architecture',
  'benchmark', 'security', 'flaky_test', 'test_pattern', 'bdd_scenario',
  'ac_pattern', 'test_failure', 'test_infra', 'mock_strategy', 'review',
]);

function handleAddTech(args) {
  const { created_by, category, title, outcome, problem, solution, lessons, tech_stack, tags, code_snippets, related_files, references, confidence = 80 } = args;
  if (!created_by?.trim() || !category?.trim() || !title?.trim() || !outcome?.trim()) {
    return { isError: true, content: [{ type: 'text', text: 'Missing required: created_by, category, title, outcome' }] };
  }
  if (!VALID_TECH_CATEGORIES.has(category.trim())) {
    return { isError: true, content: [{ type: 'text', text: `Invalid category "${category}". Allowed: ${[...VALID_TECH_CATEGORIES].join(', ')}` }] };
  }
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO tech_entries (created_by, created_at, category, title, outcome, problem, solution, lessons, tech_stack, tags, code_snippets, related_files, "references", confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(created_by.trim(), new Date().toISOString(), category.trim(), title.trim(), outcome.trim(), problem || null, solution || null, lessons || null, tech_stack || null, normalizeTags(tags), code_snippets || null, related_files || null, references || null, Math.min(100, Math.max(0, Number(confidence) || 80)));
  return { content: [{ type: 'text', text: JSON.stringify({ id: result.lastInsertRowid, message: `add_tech OK (id=${result.lastInsertRowid})` }) }] };
}

// ── add_cr_issue ──
function handleAddCrIssue(args) {
  const { story_id, issue_code, severity, description, resolution, target_story, self_check_q1, self_check_q2, self_check_q3, self_check_q4, self_check_q5 } = args;
  if (!story_id || !issue_code || !severity || !description || !resolution) {
    return { isError: true, content: [{ type: 'text', text: 'Missing required: story_id, issue_code, severity, description, resolution' }] };
  }
  const database = getDb();
  const selfCheckNotes = [self_check_q1, self_check_q2, self_check_q3, self_check_q4, self_check_q5].filter(Boolean).map((v, i) => `Q${i + 1}: ${v}`).join(' | ');
  const confidenceMap = { critical: 100, high: 90, medium: 80, low: 75 };
  const result = database.prepare(`
    INSERT INTO tech_entries (created_by, created_at, category, title, problem, solution, outcome, tags, related_files, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(story_id, new Date().toISOString(), 'review', `[${severity.toUpperCase()}] ${issue_code}: ${description.substring(0, 80)}`, description, `${resolution}${target_story ? ` -> ${target_story}` : ''}${selfCheckNotes ? ` | ${selfCheckNotes}` : ''}`, resolution === 'FIXED' ? 'success' : 'partial', JSON.stringify([story_id, severity, resolution]), null, confidenceMap[severity] || 80);
  return { content: [{ type: 'text', text: JSON.stringify({ id: result.lastInsertRowid, message: `add_cr_issue OK (id=${result.lastInsertRowid}, resolution=${resolution})` }) }] };
}

// ── trace_context ──
function handleTraceContext(args) {
  const { query, depth = 1 } = args;
  if (!query || query.trim().length < 3) {
    return { content: [{ type: 'text', text: JSON.stringify({ direct: [], related: [] }) }] };
  }
  const safeDepth = Math.min(2, Math.max(1, Number(depth) || 1));
  const database = getDb();
  const q = query.trim();

  const directContext = database.prepare(`SELECT 'context' AS source, id, title, story_id, related_files FROM context_entries WHERE rowid IN (SELECT rowid FROM context_fts WHERE context_fts MATCH ?)`).all(q).map(r => ({ ...r, proximity: 0 }));
  const directTech = database.prepare(`SELECT 'tech' AS source, id, title, NULL AS story_id, related_files FROM tech_entries WHERE rowid IN (SELECT rowid FROM tech_fts WHERE tech_fts MATCH ?)`).all(q).map(r => ({ ...r, proximity: 0 }));
  const directHits = [...directContext, ...directTech];

  const seenKeys = new Set(directHits.map(r => `${r.source}:${r.id}`));
  const relatedHits = [];

  if (safeDepth >= 1 && directHits.length > 0) {
    const storyIds = [...new Set(directHits.map(r => r.story_id).filter(Boolean))];
    if (storyIds.length > 0) {
      const placeholders = storyIds.map(() => '?').join(',');
      const rows = database.prepare(`SELECT 'context' AS source, id, title, story_id, related_files FROM context_entries WHERE story_id IN (${placeholders})`).all(...storyIds);
      for (const r of rows) {
        const key = `context:${r.id}`;
        if (!seenKeys.has(key)) { seenKeys.add(key); relatedHits.push({ ...r, proximity: 1 }); }
      }
    }
  }

  return { content: [{ type: 'text', text: JSON.stringify({ direct: directHits, related: relatedHits, depth: safeDepth, total: directHits.length + relatedHits.length }) }] };
}

// ── 啟動 ──
async function main() {
  try {
    getDb();
    process.stderr.write('[context-memory] DB connected: ' + DB_PATH + '\n');
  } catch (err) {
    process.stderr.write('[context-memory] WARNING: ' + err.message + '\n');
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[context-memory] MCP Server ready (stdio)\n');

  const shutdown = () => { if (db) db.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write('[context-memory] Fatal: ' + err.message + '\n');
  process.exit(1);
});
