#!/usr/bin/env node
// ============================================================
// PreCompact Hook: Tool Output Pre-Prune (Hermes Transplant)
// Story: td-37-tool-output-preprune
// Source: hermes-agent-main/agent/context_compressor.py:63-465
// ============================================================
// Pass 1: Dedup identical tool results (full md5 hash)
// Pass 2: Summarize long tool_use_result (>2000 chars) to 1-line
// Side-effect: Write original content to context_entries (14-day retention)
//
// stdin:  JSON { session_id, messages[] } (PreCompact hook protocol)
// stdout: (quiet — stdout 非空會被 Claude Code 當 additionalContext 注入)
// stderr: [preprune] diagnostic log
// ============================================================

'use strict';

const crypto = require('crypto');
const path = require('path');

// ── Constants (aligned with Hermes context_compressor.py:48-60) ─────────

const CONTENT_THRESHOLD = 2000;       // Hermes :439 — summarize if > this
const DEDUP_MIN_CHARS = 200;          // Hermes :414 — skip dedup for tiny results
const CONTENT_MAX_BYTES = 32 * 1024;  // PCPT DB cap per entry
const DB_PATH = path.join(__dirname, '../../.context-db/context-memory.db');
const DUPLICATE_PLACEHOLDER = '[Duplicate tool output \u2014 same content as a more recent call]';

// ── Tool Name Mapping: Claude Code → Hermes nomenclature ────────────────

const TOOL_NAME_MAP = {
  'Bash':        'terminal',
  'Read':        'read_file',
  'Write':       'write_file',
  'Edit':        'patch',
  'Agent':       'delegate_task',
  'TaskCreate':  'todo',
  'TaskUpdate':  'todo',
  'TaskList':    'todo',
  'TaskGet':     'todo',
  'TaskStop':    'todo',
  'TaskOutput':  'todo',
  'Skill':       'skill_view',
  'WebSearch':   'web_search',
  'WebFetch':    'web_extract',
  'ToolSearch':  'skills_list',
  'NotebookEdit': 'patch',
};

function mapToolName(name) {
  if (TOOL_NAME_MAP[name]) return TOOL_NAME_MAP[name];
  if (/^mcp__pcpt-context__/.test(name)) return 'memory';
  if (/^mcp__chrome-devtools__/.test(name)) {
    const action = name.replace('mcp__chrome-devtools__', '');
    if (action === 'take_snapshot' || action === 'take_screenshot') return 'browser_snapshot';
    if (action === 'navigate_page' || action === 'new_page') return 'browser_navigate';
    if (action === 'evaluate_script') return 'browser_vision';
    if (action === 'click') return 'browser_click';
    if (action === 'type_text' || action === 'fill') return 'browser_type';
    return 'browser_' + action;
  }
  return name; // fallback: use original name
}

// ── summarizeToolResult (aligned with Hermes :63-182) ───────────────────

function summarizeToolResult(toolName, args, content) {
  const mapped = mapToolName(toolName);
  const contentLen = (content || '').length;
  const lineCount = content ? content.split('\n').length : 0;

  let a;
  try { a = typeof args === 'string' ? JSON.parse(args) : (args || {}); }
  catch { a = {}; }

  // terminal (Bash)
  if (mapped === 'terminal') {
    let cmd = a.command || '';
    if (cmd.length > 80) cmd = cmd.slice(0, 77) + '...';
    const exitMatch = (content || '').match(/"?exit_code"?\s*[:=]\s*(-?\d+)/);
    const exitCode = exitMatch ? exitMatch[1] : '?';
    return `[terminal] ran \`${cmd}\` -> exit ${exitCode}, ${lineCount} lines output`;
  }

  // read_file (Read)
  if (mapped === 'read_file') {
    const filePath = a.file_path || a.path || '?';
    const offset = a.offset || 1;
    return `[read_file] read ${filePath} from line ${offset} (${contentLen.toLocaleString()} chars)`;
  }

  // write_file (Write)
  if (mapped === 'write_file') {
    const filePath = a.file_path || a.path || '?';
    const writtenLines = a.content ? a.content.split('\n').length : '?';
    return `[write_file] wrote to ${filePath} (${writtenLines} lines)`;
  }

  // search_files — content (Grep)
  if (toolName === 'Grep') {
    const pattern = a.pattern || '?';
    const searchPath = a.path || '.';
    const countMatch = (content || '').match(/(\d+)\s*match/i);
    const count = countMatch ? countMatch[1] : '?';
    return `[search_files] content search for '${pattern}' in ${searchPath} -> ${count} matches`;
  }

  // search_files — files (Glob)
  if (toolName === 'Glob') {
    const pattern = a.pattern || '?';
    const searchPath = a.path || '.';
    const countMatch = (content || '').match(/(\d+)\s*(?:file|match|result)/i);
    const count = countMatch ? countMatch[1] : '?';
    return `[search_files] files search for '${pattern}' in ${searchPath} -> ${count} matches`;
  }

  // patch (Edit)
  if (mapped === 'patch') {
    const filePath = a.file_path || a.path || '?';
    const mode = a.replace_all ? 'replace_all' : 'replace';
    return `[patch] ${mode} in ${filePath} (${contentLen.toLocaleString()} chars result)`;
  }

  // delegate_task (Agent)
  if (mapped === 'delegate_task') {
    let desc = a.description || a.prompt || '';
    if (desc.length > 60) desc = desc.slice(0, 57) + '...';
    return `[delegate_task] '${desc}' (${contentLen.toLocaleString()} chars result)`;
  }

  // todo (TaskCreate/Update/List/Get/Stop/Output)
  if (mapped === 'todo') {
    return '[todo] updated task list';
  }

  // skill_view (Skill)
  if (mapped === 'skill_view') {
    const name = a.skill || a.name || '?';
    return `[skill_view] name=${name} (${contentLen.toLocaleString()} chars)`;
  }

  // skills_list (ToolSearch)
  if (mapped === 'skills_list') {
    const query = a.query || '?';
    return `[skills_list] query='${query}' (${contentLen.toLocaleString()} chars)`;
  }

  // web_search (WebSearch)
  if (mapped === 'web_search') {
    const query = a.query || '?';
    return `[web_search] query='${query}' (${contentLen.toLocaleString()} chars result)`;
  }

  // web_extract (WebFetch)
  if (mapped === 'web_extract') {
    const url = a.url || '?';
    return `[web_extract] ${url} (${contentLen.toLocaleString()} chars)`;
  }

  // memory (mcp__pcpt-context__*)
  if (mapped === 'memory') {
    const action = toolName.replace('mcp__pcpt-context__', '');
    if (action.startsWith('search_')) return `[memory] search on ${a.category || a.query || '*'}`;
    if (action.startsWith('add_')) return `[memory] add on ${a.category || '?'}`;
    if (action === 'trace_context') return `[memory] trace on ${a.target || '?'}`;
    return `[memory] ${action} (${contentLen.toLocaleString()} chars)`;
  }

  // browser_* (mcp__chrome-devtools__*)
  if (mapped.startsWith('browser_')) {
    const url = a.url || '';
    const ref = a.ref || a.uid || '';
    const detail = url ? ` ${url}` : (ref ? ` ref=${ref}` : '');
    return `[${mapped}]${detail} (${contentLen.toLocaleString()} chars)`;
  }

  // Generic fallback (Hermes :177-182)
  let firstArg = '';
  const entries = Object.entries(a).slice(0, 2);
  for (const [k, v] of entries) {
    const sv = String(v).slice(0, 40);
    firstArg += ` ${k}=${sv}`;
  }
  return `[${mapped}]${firstArg} (${contentLen.toLocaleString()} chars result)`;
}

// ── Message Helpers ─────────────────────────────────────────────────────

function isToolResult(msg) {
  if (!msg || !msg.content) return false;
  if (typeof msg.content === 'string') return false;
  if (!Array.isArray(msg.content)) return false;
  return msg.content.some(b => b.type === 'tool_result');
}

function extractToolResultBlocks(msg) {
  if (!msg || !Array.isArray(msg.content)) return [];
  return msg.content.filter(b => b.type === 'tool_result');
}

function getToolResultContent(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return '';
}

function buildToolUseIndex(messages) {
  const index = new Map();
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        index.set(block.id, { name: block.name || 'unknown', input: block.input || {} });
      }
    }
  }
  return index;
}

// ── Pass 1: Dedup (Hermes :402-422, full md5 instead of slice(0,12)) ────

function dedupByHash(messages) {
  const seen = new Map();
  let count = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isToolResult(msg)) continue;
    const blocks = extractToolResultBlocks(msg);
    for (const block of blocks) {
      const content = getToolResultContent(block);
      if (content.length < DEDUP_MIN_CHARS) continue;
      if (typeof content !== 'string') continue;
      const h = crypto.createHash('md5').update(content).digest('hex');
      if (seen.has(h)) {
        block.content = DUPLICATE_PLACEHOLDER;
        count++;
      } else {
        seen.set(h, i);
      }
    }
  }
  return count;
}

// ── Pass 2: Summarize (Hermes :424-444) ─────────────────────────────────

function summarizePass(messages, toolIndex) {
  const summaries = [];
  let count = 0;

  for (const msg of messages) {
    if (!isToolResult(msg)) continue;
    const blocks = extractToolResultBlocks(msg);
    for (const block of blocks) {
      const content = getToolResultContent(block);
      if (content.length <= CONTENT_THRESHOLD) continue;
      if (content === DUPLICATE_PLACEHOLDER) continue;
      if (content.startsWith('[Duplicate tool output')) continue;

      const toolUseId = block.tool_use_id || '';
      const info = toolIndex.get(toolUseId) || { name: 'unknown', input: {} };
      const summary = summarizeToolResult(info.name, info.input, content);

      summaries.push({
        toolName: info.name,
        toolUseId,
        summary,
        originalContent: content,
        originalLength: content.length,
      });

      block.content = summary;
      count++;
    }
  }
  return { count, summaries };
}

// ── DB Write (context_entries category=compaction_preprune) ──────────────

function writeToDb(summaries, sessionId, options = {}) {
  let db;
  let written = 0;
  const maxRetries = 3;
  const backoff = [100, 200, 400];
  const injectedDb = !!options.db;

  if (options.db) {
    db = options.db;
  } else {
    let Database;
    try {
      Database = require(path.join(__dirname, '../../.context-db/node_modules/better-sqlite3'));
    } catch {
      process.stderr.write('[preprune] warn=better-sqlite3 not found, skipping DB write\n');
      return 0;
    }
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
    } catch (err) {
      process.stderr.write(`[preprune] warn=db_open_failed err=${err.message}\n`);
      return 0;
    }
  }

  const nowTs = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
  const stmt = db.prepare(
    `INSERT INTO context_entries (session_id, agent_id, timestamp, category, title, content, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const s of summaries) {
    const storedContent = s.originalContent.length > CONTENT_MAX_BYTES
      ? s.originalContent.slice(0, CONTENT_MAX_BYTES) + `\n[...truncated ${s.originalContent.length - CONTENT_MAX_BYTES} chars]`
      : s.originalContent;
    const title = s.summary.slice(0, 200);
    const tags = JSON.stringify([`tool=${s.toolName}`, `session=${sessionId}`, 'preprune']);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        stmt.run(sessionId, 'preprune-hook', nowTs, 'compaction_preprune', title, storedContent, tags);
        written++;
        break;
      } catch (err) {
        if (attempt < maxRetries && /SQLITE_BUSY/.test(err.message)) {
          const ms = backoff[attempt] || 400;
          const start = Date.now();
          while (Date.now() - start < ms) { /* busy wait */ }
        } else {
          process.stderr.write(`[preprune] warn=db_write_failed tool=${s.toolName} err=${err.message}\n`);
          break;
        }
      }
    }
  }

  if (!injectedDb) {
    try { db.close(); } catch { /* ignore */ }
  }
  return written;
}

// ── Build Digest Lines (for snapshot enhancement) ───────────────────────

function buildDigestLines(summaries, maxLines) {
  const lines = [];
  const limit = Math.min(summaries.length, maxLines || 60);
  for (let i = 0; i < limit; i++) {
    lines.push(`- ${summaries[i].summary}`);
  }
  return lines;
}

// ── Main ────────────────────────────────────────────────────────────────

function processMessages(messages, sessionId) {
  if (!messages || messages.length === 0) {
    return { dedupCount: 0, summaryCount: 0, dbWritten: 0, digestLines: [] };
  }

  const toolIndex = buildToolUseIndex(messages);
  const dedupCount = dedupByHash(messages);
  const { count: summaryCount, summaries } = summarizePass(messages, toolIndex);
  const dbWritten = writeToDb(summaries, sessionId || 'unknown-session');
  const digestLines = buildDigestLines(summaries, 60);

  return { dedupCount, summaryCount, dbWritten, digestLines };
}

function main() {
  const start = Date.now();
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(input);
      const sessionId = payload.session_id || 'unknown-session';
      const messages = payload.messages || payload.conversation?.messages || [];

      const result = processMessages(messages, sessionId);

      // Write digest to snapshot file (append mode)
      if (result.digestLines.length > 0) {
        try {
          const fs = require('fs');
          const snapshotPath = path.join(__dirname, '../../docs/tracking/active/session-snapshot.md');
          if (fs.existsSync(snapshotPath)) {
            const digestSection = '\n\n## Recent Tool Call Digest\n\n' + result.digestLines.join('\n') + '\n';
            fs.appendFileSync(snapshotPath, digestSection, 'utf8');
          }
        } catch (err) {
          process.stderr.write(`[preprune] warn=snapshot_append_failed err=${err.message}\n`);
        }
      }

      const durationMs = Date.now() - start;
      process.stderr.write(
        `[preprune] dedup=${result.dedupCount} summary=${result.summaryCount} ` +
        `db_written=${result.dbWritten} digest_lines=${result.digestLines.length} ` +
        `duration_ms=${durationMs}\n`
      );
    } catch (err) {
      process.stderr.write(`[preprune] error=${err.message}\n`);
    }
    process.exit(0);
  });
}

// ── Exports (for testing) ───────────────────────────────────────────────

module.exports = {
  summarizeToolResult,
  mapToolName,
  isToolResult,
  extractToolResultBlocks,
  getToolResultContent,
  buildToolUseIndex,
  dedupByHash,
  summarizePass,
  writeToDb,
  buildDigestLines,
  processMessages,
  CONTENT_THRESHOLD,
  DEDUP_MIN_CHARS,
  CONTENT_MAX_BYTES,
  DUPLICATE_PLACEHOLDER,
  TOOL_NAME_MAP,
};

// ── Entry Point ─────────────────────────────────────────────────────────

if (require.main === module) {
  main();
}
