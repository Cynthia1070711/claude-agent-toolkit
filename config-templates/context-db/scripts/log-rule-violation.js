#!/usr/bin/env node
// ============================================================
// log-rule-violation.js — CLI helper to record rule violation
// Category: context_entries.category = 'rule_violation'
// Spec: ctr-p2-violation-tracker AC2/AC6, Task 2.1-2.9
// ============================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getTaiwanTimestamp } from './timezone.js';
import { syncEmbedding, buildInputText } from './embedding-sync.js';

export const CATEGORY = 'rule_violation';
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_PHASES = new Set(['create-story', 'dev-story', 'code-review', 'party-mode', 'other']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTEXT_DB_DIR = path.resolve(__dirname, '..');
const DEFAULT_DB_PATH = path.join(CONTEXT_DB_DIR, 'context-memory.db');
const LEDGER_PATH = path.join(CONTEXT_DB_DIR, 'ledger.jsonl');

const USAGE = `
Usage: node log-rule-violation.js \\
  --rule <path>            (required) violated rule file path, e.g., memory/feedback_xxx.md
  --loaded <true|false>    (required) was the rule loaded in context at violation time
  --cli-enforced <true|false> (required) was CLI-level enforcement active
  --phase <phase>          (required) workflow phase: create-story|dev-story|code-review|party-mode|other
  --severity <sev>         (required) critical|high|medium|low
  --summary <text>         (required) one-line incident summary
  [--agent <id>]           (optional) agent id, default CC-OPUS
  [--story <story_id>]     (optional) related story_id
  [--epic <epic_id>]       (optional) related epic_id
  [--tags <csv>]           (optional) extra tags (comma-separated), appended to default
  [--db <path>]            (optional) sqlite db path, default .context-db/context-memory.db
`.trim();

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function toBool(v, field) {
  if (v === true) return true;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new Error(`--${field} must be true|false (got: ${v})`);
}

export function validateArgs(args) {
  const errors = [];
  const required = ['rule', 'loaded', 'cli-enforced', 'phase', 'severity', 'summary'];
  for (const k of required) {
    if (args[k] === undefined || args[k] === true || String(args[k]).trim() === '') {
      errors.push(`missing required --${k}`);
    }
  }
  if (args.severity && !VALID_SEVERITIES.has(String(args.severity).toLowerCase())) {
    errors.push(`--severity must be one of: ${[...VALID_SEVERITIES].join('|')}`);
  }
  if (args.phase && args.phase !== true && !VALID_PHASES.has(String(args.phase).trim())) {
    errors.push(`--phase must be one of: ${[...VALID_PHASES].join('|')}`);
  }
  return errors;
}

export function buildRecord(args, { agentFallback = 'CC-OPUS', timestampFn = getTaiwanTimestamp } = {}) {
  const rule = String(args.rule).trim();
  const loaded = toBool(args.loaded, 'loaded');
  const cliEnforced = toBool(args['cli-enforced'], 'cli-enforced');
  const phase = String(args.phase).trim();
  const severity = String(args.severity).trim().toLowerCase();
  const summary = String(args.summary).trim();
  const agent = (args.agent && String(args.agent).trim())
    || (process.env.CLAUDE_AGENT_ID && String(process.env.CLAUDE_AGENT_ID).trim())
    || agentFallback;
  const ruleBase = path.basename(rule, path.extname(rule));

  const metadata = {
    violated_rule_path: rule,
    rule_loaded_at_time: loaded,
    cli_enforcement: cliEnforced,
    workflow_phase: phase,
    severity,
    incident_summary: summary,
  };

  const defaultTags = ['rule_violation', ruleBase, phase, severity];
  const extraTags = args.tags
    ? String(args.tags).split(',').map(t => t.trim()).filter(Boolean)
    : [];
  const tags = JSON.stringify([...defaultTags, ...extraTags]);

  return {
    agent_id: agent,
    timestamp: timestampFn(),
    category: CATEGORY,
    title: `[rule_violation] ${ruleBase} @ ${phase} (${severity})`,
    content: JSON.stringify(metadata),
    tags,
    related_files: rule,
    story_id: args.story ? String(args.story).trim() : null,
    epic_id: args.epic ? String(args.epic).trim() : null,
  };
}

function appendLedger(entry) {
  try {
    const line = JSON.stringify({
      ts: getTaiwanTimestamp(),
      table: 'context_entries',
      op: 'INSERT',
      data: entry,
    });
    fs.appendFileSync(LEDGER_PATH, line + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[log-rule-violation] ledger append failed: ${err.message}\n`);
  }
}

export function insertViolation(db, record) {
  const result = db.prepare(`
    INSERT INTO context_entries
      (agent_id, timestamp, category, title, content, tags, related_files, story_id, epic_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.agent_id,
    record.timestamp,
    record.category,
    record.title,
    record.content,
    record.tags,
    record.related_files,
    record.story_id,
    record.epic_id,
  );
  return Number(result.lastInsertRowid);
}

export function runLog(argv, io = {}) {
  const stdout = io.stdout || (s => process.stdout.write(s));
  const stderr = io.stderr || (s => process.stderr.write(s));
  const dbFactory = io.dbFactory || (p => new Database(p));
  const ledgerFn = io.appendLedger || appendLedger;
  const embFn = io.syncEmbedding || syncEmbedding;

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    stdout(USAGE + '\n');
    return { code: 0 };
  }

  const args = parseArgs(argv);
  const errors = validateArgs(args);
  if (errors.length) {
    stderr('Error: ' + errors.join('; ') + '\n\n' + USAGE + '\n');
    return { code: 1 };
  }

  const dbPath = args.db ? path.resolve(String(args.db)) : DEFAULT_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    stderr(`Error: DB not found: ${dbPath}\n`);
    return { code: 1 };
  }

  let record;
  try {
    record = buildRecord(args);
  } catch (err) {
    stderr(`Error: ${err.message}\n`);
    return { code: 1 };
  }

  const db = dbFactory(dbPath);
  let id;
  try {
    id = insertViolation(db, record);
    ledgerFn({
      id,
      agent_id: record.agent_id,
      category: record.category,
      title: record.title,
      timestamp: record.timestamp,
    });
    const embText = buildInputText('context', { title: record.title, content: record.content });
    const p = embFn(db, 'context', id, embText);
    if (p && typeof p.catch === 'function') {
      p.catch(err => stderr(`[log-rule-violation] embedding sync error (id=${id}): ${err.message}\n`));
    }
  } catch (err) {
    stderr(`Error: INSERT failed: ${err.message}\n`);
    db.close();
    return { code: 1 };
  }

  const meta = JSON.parse(record.content);
  stdout(
    `✅ rule_violation 記錄成功 (id=${id})\n` +
    `   rule:         ${meta.violated_rule_path}\n` +
    `   phase:        ${meta.workflow_phase}\n` +
    `   severity:     ${meta.severity}\n` +
    `   loaded:       ${meta.rule_loaded_at_time} / cli-enforced: ${meta.cli_enforcement}\n` +
    `   agent:        ${record.agent_id}\n`
  );
  stdout(JSON.stringify({ id, message: `✅ rule_violation 記錄成功 (id=${id})` }) + '\n');

  db.close();
  return { code: 0, id };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    const { code } = runLog(process.argv.slice(2));
    process.exit(code);
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  }
}
