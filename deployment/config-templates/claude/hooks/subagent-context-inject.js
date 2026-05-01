#!/usr/bin/env node
/**
 * subagent-context-inject.js — SubagentStart Hook
 *
 * Injects PCPT pipeline context into subagents:
 * 1. Reads pipeline-signal.json (if exists) → Story ID + phase
 * 2. Reads agent-memory/{type}.jsonl (last 5 lines)
 * 3. Queries Context DB for recent sessions
 * 4. Outputs additionalContext JSON → stdout
 *
 * Spec: cci-02 BR-003
 * Design: fail-open (any error → exit 0 without blocking)
 *
 * Input (stdin): SubagentStart JSON
 *   { tool_use_id, tool_name, tool_input: { description, prompt, subagent_type } }
 *
 * Output (stdout): JSON
 *   { hookSpecificOutput: { additionalContext: "..." } }
 *   OR empty (when no pipeline context available)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Paths (relative to project root)
const projectRoot     = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(__dirname, '..', '..');
const PIPELINE_SIGNAL = path.join(projectRoot, '.claude', 'pipeline-signal.json');
const AGENT_MEMORY_DIR = path.join(projectRoot, '.claude', 'agent-memory');
const DB_PATH          = path.join(projectRoot, '.context-db', 'context-memory.db');

// Blocked Tools Notice — dynamically loads FULL rule content (SSoT preserved in rule file)
// Source: Hermes delegate_tool.py:31-38 DELEGATE_BLOCKED_TOOLS + :52-53 MAX_DEPTH
// Story: td-39-subagent-blocked-tools (initial 4-line) + td-token-decrease-paths-rollout (升級為動態全文注入)
//
// Why upgrade: 原 4 行 Notice 子代理拿到內容不足以 self-check 3-Tier Boundary;
// 改為動態 readFileSync 完整 .md 全文(扣除 frontmatter),子代理可看 A1-A3/Q1-Q3/N1-N6 完整矩陣 + Self-Check 3 題
// Trade-off: 注入量從 ~99 token → ~3K token,但子代理 context 較小可承受;主視窗透過 paths frontmatter 條件載入 rule 不再 always-on
const BLOCKED_TOOLS_FALLBACK = [
  '=== Subagent Safety Notice ===',
  'BLOCKED: Agent(recursive) / AskUserQuestion / MEMORY write / claude-max send / script exec / ECPay Live API',
  'LIMITS: MAX_DEPTH=2 (no grandchild) | MAX_CONCURRENT=3',
  'See .claude/rules/subagent-blocked-tools.md for details.',
].join('\n');

function loadBlockedToolsContent() {
  try {
    const rulePath = path.join(projectRoot, '.claude', 'rules', 'subagent-blocked-tools.md');
    if (fs.existsSync(rulePath)) {
      const raw = fs.readFileSync(rulePath, 'utf8');
      // 移除 frontmatter (paths block) 取主體
      const body = raw.replace(/^---\n[\s\S]*?\n---\n+/, '');
      return `=== Subagent Safety Rule (full content from .claude/rules/subagent-blocked-tools.md) ===\n\n${body}`;
    }
  } catch (_) {
    // Fall through to fallback
  }
  return BLOCKED_TOOLS_FALLBACK;
}

const BLOCKED_TOOLS_NOTICE = loadBlockedToolsContent();

// Timeout guard: exit 0 after 2.5s to never block Claude
setTimeout(() => process.exit(0), 2500);

main().catch(() => process.exit(0));

async function main() {
  // 1. Parse stdin input
  let agentType = 'unknown';
  try {
    const raw = await readStdin();
    if (raw && raw.trim()) {
      const input = JSON.parse(raw);
      agentType = input?.tool_input?.subagent_type || 'unknown';
    }
  } catch (_) {
    // stdin parse failure → graceful skip
  }

  // 2. Read pipeline-signal.json
  let pipelineCtx = null;
  try {
    if (fs.existsSync(PIPELINE_SIGNAL)) {
      const raw = fs.readFileSync(PIPELINE_SIGNAL, 'utf8');
      pipelineCtx = JSON.parse(raw);
    }
  } catch (_) {
    // Signal file not parseable → skip (non-pipeline mode)
  }

  // If no pipeline context → still inject BLOCKED_TOOLS_NOTICE for safety
  // (CR td-39 fix: safety notice must be always-on, not pipeline-gated)
  if (!pipelineCtx) {
    const output = {
      hookSpecificOutput: {
        additionalContext: BLOCKED_TOOLS_NOTICE
      }
    };
    process.stdout.write(JSON.stringify(output) + '\n');
    process.exit(0);
  }

  const storyId = pipelineCtx.story_id || '';
  const phase   = pipelineCtx.phase   || '';

  // 3. Read agent-memory/{type}.jsonl (last 5 lines)
  let memoryLines = [];
  try {
    const memFile = path.join(AGENT_MEMORY_DIR, `${agentType}.jsonl`);
    if (fs.existsSync(memFile)) {
      const content = fs.readFileSync(memFile, 'utf8').trim();
      if (content) {
        const lines = content.split('\n').filter(l => l.trim());
        // Take last 5 lines (tail)
        memoryLines = lines.slice(-5).map(l => {
          try { return JSON.parse(l); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }
  } catch (_) {
    memoryLines = [];
  }

  // 4. Query Context DB for recent sessions (best-effort)
  let recentSessions = [];
  try {
    if (fs.existsSync(DB_PATH)) {
      // Use better-sqlite3 (synchronous, available in .context-db/node_modules)
      const betterSqlitePath = path.join(
        projectRoot, '.context-db', 'node_modules', 'better-sqlite3'
      );
      if (fs.existsSync(betterSqlitePath)) {
        const Database = require(betterSqlitePath);
        const db = new Database(DB_PATH, { readonly: true });
        const rows = db.prepare(
          `SELECT title, content FROM context_entries
           WHERE category = 'session'
           ORDER BY created_at DESC LIMIT 3`
        ).all();
        db.close();
        recentSessions = rows.map(r => `${r.title}: ${(r.content || '').slice(0, 120)}`);
      }
    }
  } catch (_) {
    recentSessions = [];
  }

  // 5. Assemble additionalContext
  const parts = [];
  parts.push(`=== Pipeline Context ===`);
  parts.push(`Story: ${storyId} | Phase: ${phase}`);

  if (pipelineCtx.decisions && pipelineCtx.decisions.length > 0) {
    parts.push(`\nKey Decisions:`);
    pipelineCtx.decisions.forEach(d => parts.push(`  - ${d}`));
  }

  // Blocked Tools Notice (td-39: Hermes DELEGATE_BLOCKED_TOOLS transplant)
  parts.push(`\n${BLOCKED_TOOLS_NOTICE}`);

  if (memoryLines.length > 0) {
    parts.push(`\n=== ${agentType} Agent Memory (last ${memoryLines.length}) ===`);
    memoryLines.forEach(m => {
      parts.push(`[${m.ts || ''}] ${m.story || ''}: ${m.summary || ''}`);
      if (m.findings && m.findings.length > 0) {
        m.findings.slice(0, 3).forEach(f => parts.push(`  • ${f}`));
      }
    });
  }

  if (recentSessions.length > 0) {
    parts.push(`\n=== Recent Sessions ===`);
    recentSessions.forEach(s => parts.push(`  ${s}`));
  }

  const additionalContext = parts.join('\n');

  // 6. Output JSON to stdout
  const output = {
    hookSpecificOutput: {
      additionalContext
    }
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

/**
 * Read all stdin content asynchronously
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
    // If stdin not connected (e.g., no pipe), resolve empty after 200ms
    setTimeout(() => resolve(''), 200);
  });
}
