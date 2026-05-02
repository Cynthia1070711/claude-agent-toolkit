#!/usr/bin/env node
/**
 * audit-capability-reachability.cjs (toolkit deployment template)
 *
 * 對 .context-db/server.js 中 MCP tools / .context-db/scripts/init-db.js schema /
 * .claude/hooks/pre-prompt-rag.js Layer,自動 grep 4 個 sub-system 整合度:
 *   - .claude/skills/**\/SKILL.md (skill_hits, weight 0.30)
 *   - _bmad/bmm/workflows/4-implementation/**\/*.md (bmad_hits, weight 0.40)
 *   - 1.專案部屬必讀/**.md (deploy_hits, weight 0.20)
 *   - .claude/hooks/*.js + scripts/*.{ps1,cjs,js} (infra_hits, weight 0.10)
 *
 * reachability_score = sum of weighted hits(0.0 ~ 1.0)
 *   - >= 0.5 PASS(至少 BMAD + 1 sub-system 整合)
 *   - <  0.5 LATENT(flagged)
 *
 * 觸發: Capability Integration ADR + capability-integration-mandate.md(SUPREME)
 *
 * 部署時調整:
 *   - REPO_ROOT 假設 audit script 位於 1.專案部屬必讀/scripts/,deployer project root 在兩層上
 *   - 若部署時 1.專案部屬必讀/ 目錄被 rename(如 deployment/ / docs/deploy/),
 *     相應調整下方 PATHS.deploy 路徑
 *
 * 用法:
 *   node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs            # advisory(預設)
 *   node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --json     # 機器可讀
 *   node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --md > report.md   # 人類可讀
 *   node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --strict   # 任一 latent → exit 1
 *   node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --tool search_god_nodes  # 單 capability
 *
 * Exit codes:
 *   0 = all reachable / advisory mode
 *   1 = strict mode + latent capability found
 *   2 = parse / IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 部署時 audit script 位於 1.專案部屬必讀/scripts/,REPO_ROOT 兩層上對齊 deployer project root
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PATHS = {
  server: path.join(REPO_ROOT, '.context-db/server.js'),
  initDb: path.join(REPO_ROOT, '.context-db/scripts/init-db.js'),
  preRag: path.join(REPO_ROOT, '.claude/hooks/pre-prompt-rag.js'),
  skills: path.join(REPO_ROOT, '.claude/skills'),
  bmad: path.join(REPO_ROOT, '_bmad/bmm/workflows/4-implementation'),
  // 部署時若 deploy docs 目錄被 rename,調整此 path
  deploy: path.join(REPO_ROOT, '1.專案部屬必讀'),
  hooks: path.join(REPO_ROOT, '.claude/hooks'),
  scripts: path.join(REPO_ROOT, 'scripts'),
};

const WEIGHTS = {
  skill: 0.30,
  bmad: 0.40,
  deploy: 0.20,
  infra: 0.10,
};

const PASS_THRESHOLD = 0.5;

// ─────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    json: false,
    md: false,
    strict: false,
    tool: null,
    skipSchema: false,
    skipLayer: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--md') args.md = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--tool') args.tool = argv[++i];
    else if (a === '--skip-schema') args.skipSchema = true;
    else if (a === '--skip-layer') args.skipLayer = true;
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Capability extraction
// ─────────────────────────────────────────────────────────────

/**
 * Extract MCP tool names from server.js tools[] array
 * Pattern: `name: 'xxx'` or `name: "xxx"`
 */
function extractMcpTools(content) {
  const re = /name:\s*['"]([a-z_][a-z0-9_]*)['"]/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    // Filter common false positives(only keep MCP tool patterns)
    if (m[1].length >= 4 && !['name', 'type', 'role'].includes(m[1])) {
      names.add(m[1]);
    }
  }
  return Array.from(names);
}

/**
 * Extract CREATE TABLE names from init-db.js
 */
function extractTables(content) {
  const re = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z_][a-z0-9_]*)/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(content)) !== null) {
    names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * Extract Layer N labels from pre-prompt-rag.js
 * Pattern: comments like "// Layer 10: Code RAG" or "Layer 11" mentions
 */
function extractLayers(content) {
  const re = /Layer\s+(\d{1,2})\s*[—:\-]?\s*([^\n]{0,60})/gi;
  const layers = new Map();
  let m;
  while ((m = re.exec(content)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 20 && !layers.has(n)) {
      layers.set(n, (m[2] || '').trim().substring(0, 40));
    }
  }
  return Array.from(layers.entries()).map(([n, label]) => `Layer ${n}: ${label}`.trim());
}

// ─────────────────────────────────────────────────────────────
// Hit counting via recursive grep(Node.js implementation, no external deps)
// ─────────────────────────────────────────────────────────────

/**
 * Recursively walk dir + count files matching pattern + containing keyword
 * Returns hit count(file count, not match count)
 */
function countFilesContaining(dir, keyword, extensions) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const stack = [dir];
  const exts = extensions.map(e => e.toLowerCase());
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        // Skip node_modules, .git, __pycache__, _archive
        if (['node_modules', '.git', '__pycache__', '_archive', 'dist', 'build', '.cache'].includes(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (exts.includes(ext)) {
          try {
            const content = fs.readFileSync(full, 'utf-8');
            if (content.includes(keyword)) count++;
          } catch (_) {
            // skip unreadable
          }
        }
      }
    }
  }
  return count;
}

function countHits(capability) {
  return {
    skill_hits: countFilesContaining(PATHS.skills, capability, ['.md']),
    bmad_hits: countFilesContaining(PATHS.bmad, capability, ['.md']),
    deploy_hits: countFilesContaining(PATHS.deploy, capability, ['.md']),
    infra_hits: countFilesContaining(PATHS.hooks, capability, ['.js']) +
                countFilesContaining(PATHS.scripts, capability, ['.ps1', '.cjs', '.js']),
  };
}

function calcReachability(hits) {
  return (
    (hits.skill_hits > 0 ? WEIGHTS.skill : 0) +
    (hits.bmad_hits > 0 ? WEIGHTS.bmad : 0) +
    (hits.deploy_hits > 0 ? WEIGHTS.deploy : 0) +
    (hits.infra_hits > 0 ? WEIGHTS.infra : 0)
  );
}

// ─────────────────────────────────────────────────────────────
// Main audit
// ─────────────────────────────────────────────────────────────

function audit(args) {
  const result = {
    timestamp: new Date().toISOString(),
    threshold: PASS_THRESHOLD,
    weights: WEIGHTS,
    capabilities: { mcp_tools: [], tables: [], layers: [] },
    summary: { total: 0, reachable: 0, latent: 0 },
  };

  // 1. MCP tools
  let serverContent = '';
  try {
    serverContent = fs.readFileSync(PATHS.server, 'utf-8');
  } catch (e) {
    console.error(`[audit] ERROR reading ${PATHS.server}: ${e.message}`);
    return { result, exitCode: 2 };
  }
  let mcpTools = extractMcpTools(serverContent);
  if (args.tool) mcpTools = mcpTools.filter(t => t === args.tool);

  for (const name of mcpTools) {
    const hits = countHits(name);
    const score = calcReachability(hits);
    const reachable = score >= PASS_THRESHOLD;
    result.capabilities.mcp_tools.push({ name, ...hits, reachability_score: +score.toFixed(2), reachable });
    result.summary.total++;
    if (reachable) result.summary.reachable++;
    else result.summary.latent++;
  }

  // 2. Tables(skip if --skip-schema)
  if (!args.skipSchema) {
    let initDbContent = '';
    try {
      initDbContent = fs.readFileSync(PATHS.initDb, 'utf-8');
    } catch (e) {
      console.error(`[audit] WARN reading ${PATHS.initDb}: ${e.message}(skipping schema)`);
    }
    if (initDbContent) {
      const tables = extractTables(initDbContent);
      for (const name of tables) {
        const hits = countHits(name);
        const score = calcReachability(hits);
        const reachable = score >= PASS_THRESHOLD;
        result.capabilities.tables.push({ name, ...hits, reachability_score: +score.toFixed(2), reachable });
        result.summary.total++;
        if (reachable) result.summary.reachable++;
        else result.summary.latent++;
      }
    }
  }

  // 3. Layers(skip if --skip-layer)
  if (!args.skipLayer) {
    let preRagContent = '';
    try {
      preRagContent = fs.readFileSync(PATHS.preRag, 'utf-8');
    } catch (e) {
      console.error(`[audit] WARN reading ${PATHS.preRag}: ${e.message}(skipping layers)`);
    }
    if (preRagContent) {
      const layers = extractLayers(preRagContent);
      for (const label of layers) {
        // For layers, search for "Layer N" pattern in consumers
        const layerNum = label.match(/Layer\s+(\d+)/);
        const searchKey = layerNum ? `Layer ${layerNum[1]}` : label;
        const hits = countHits(searchKey);
        const score = calcReachability(hits);
        const reachable = score >= PASS_THRESHOLD;
        result.capabilities.layers.push({ name: label, ...hits, reachability_score: +score.toFixed(2), reachable });
        result.summary.total++;
        if (reachable) result.summary.reachable++;
        else result.summary.latent++;
      }
    }
  }

  result.summary.reachable_pct = result.summary.total > 0
    ? +((result.summary.reachable / result.summary.total) * 100).toFixed(1)
    : 0;

  let exitCode = 0;
  if (args.strict && result.summary.latent > 0) exitCode = 1;
  return { result, exitCode };
}

// ─────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────

function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

function renderMarkdown(result) {
  const lines = [];
  lines.push(`# Capability Reachability Audit Report`);
  lines.push('');
  lines.push(`> Generated: ${result.timestamp}`);
  lines.push(`> Threshold: ≥ ${result.threshold} = reachable`);
  lines.push(`> Weights: skill=${result.weights.skill} / bmad=${result.weights.bmad} / deploy=${result.weights.deploy} / infra=${result.weights.infra}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- **Total capabilities**: ${result.summary.total}`);
  lines.push(`- **Reachable** (≥ ${result.threshold}): ${result.summary.reachable} (${result.summary.reachable_pct}%)`);
  lines.push(`- **Latent** (< ${result.threshold}): ${result.summary.latent}`);
  lines.push('');

  for (const [section, items] of [
    ['MCP Tools', result.capabilities.mcp_tools],
    ['Tables', result.capabilities.tables],
    ['Layers', result.capabilities.layers],
  ]) {
    if (items.length === 0) continue;
    lines.push(`## ${section}`);
    lines.push('');
    lines.push(`| name | skill | bmad | deploy | infra | score | status |`);
    lines.push(`|:---|:---:|:---:|:---:|:---:|:---:|:---:|`);
    for (const it of items) {
      const status = it.reachable ? '✅ reachable' : '🔴 LATENT';
      lines.push(`| ${it.name} | ${it.skill_hits} | ${it.bmad_hits} | ${it.deploy_hits} | ${it.infra_hits} | ${it.reachability_score} | ${status} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderConsole(result) {
  const lines = [];
  lines.push(`[audit] ${result.timestamp}`);
  lines.push(`[audit] threshold=${result.threshold} | weights=${JSON.stringify(result.weights)}`);
  lines.push(`[audit] total=${result.summary.total} reachable=${result.summary.reachable}(${result.summary.reachable_pct}%) latent=${result.summary.latent}`);
  for (const [section, items] of [
    ['MCP Tools', result.capabilities.mcp_tools],
    ['Tables', result.capabilities.tables],
    ['Layers', result.capabilities.layers],
  ]) {
    if (items.length === 0) continue;
    lines.push('');
    lines.push(`=== ${section} ===`);
    for (const it of items) {
      const flag = it.reachable ? 'OK   ' : 'LATENT';
      lines.push(`[${flag}] ${it.name.padEnd(36)} skill=${it.skill_hits} bmad=${it.bmad_hits} deploy=${it.deploy_hits} infra=${it.infra_hits} score=${it.reachability_score}`);
    }
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

function main(argv) {
  const args = parseArgs(argv);
  const { result, exitCode } = audit(args);
  let output;
  if (args.json) output = renderJson(result);
  else if (args.md) output = renderMarkdown(result);
  else output = renderConsole(result);
  console.log(output);
  return exitCode;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  parseArgs,
  extractMcpTools,
  extractTables,
  extractLayers,
  countFilesContaining,
  calcReachability,
  audit,
  renderJson,
  renderMarkdown,
  WEIGHTS,
  PASS_THRESHOLD,
};
