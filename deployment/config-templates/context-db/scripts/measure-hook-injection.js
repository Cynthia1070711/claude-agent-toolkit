#!/usr/bin/env node
// ============================================================
// AC5 Hook Injection Metric Aggregator
// ctr-p2-hook-intent — Party Mode avg token 驗證
// ============================================================
// Usage:
//   node .context-db/scripts/measure-hook-injection.js --from-file <stderr-log>
//   node .context-db/scripts/measure-hook-injection.js --n 30
//
// Parses [RAG] Injected: ... (NNN est. tokens) lines from stderr log,
// computes avg / median / p90 est. tokens + intent distribution.
// ============================================================

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { n: 30, fromFile: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--n' && args[i + 1]) opts.n = parseInt(args[i + 1], 10);
    if (args[i] === '--from-file' && args[i + 1]) opts.fromFile = args[i + 1];
  }
  return opts;
}

function parseStderrLog(content) {
  const lines = content.split('\n');
  const entries = [];
  const tokenRe = /\[RAG\] Injected:.*\((\d+)\s*est\.\s*tokens\)/;
  const intentRe = /intent=(\w+)/;

  for (const line of lines) {
    const tokenMatch = tokenRe.exec(line);
    if (tokenMatch) {
      const tokens = parseInt(tokenMatch[1], 10);
      const intentMatch = intentRe.exec(line);
      const intent = intentMatch ? intentMatch[1] : 'unknown';
      entries.push({ tokens, intent });
    }
  }
  return entries;
}

function computeStats(entries, n) {
  const subset = entries.slice(-n);
  if (subset.length === 0) {
    console.log('No [RAG] Injected entries found.');
    process.exit(1);
  }

  const tokens = subset.map(e => e.tokens);
  tokens.sort((a, b) => a - b);

  const avg = Math.round(tokens.reduce((s, t) => s + t, 0) / tokens.length);
  const median = tokens[Math.floor(tokens.length / 2)];
  const p90idx = Math.floor(tokens.length * 0.9);
  const p90 = tokens[Math.min(p90idx, tokens.length - 1)];

  // Intent distribution
  const intentCounts = {};
  for (const e of subset) {
    intentCounts[e.intent] = (intentCounts[e.intent] || 0) + 1;
  }
  const intentDist = Object.entries(intentCounts)
    .map(([k, v]) => `${k}: ${v} (${Math.round(v / subset.length * 100)}%)`)
    .join(', ');

  console.log(`\n📊 Hook Injection Metrics (last ${subset.length} entries)`);
  console.log(`────────────────────────────────────`);
  console.log(`  avg tokens:    ${avg}`);
  console.log(`  median tokens: ${median}`);
  console.log(`  p90 tokens:    ${p90}`);
  console.log(`  intent dist:   ${intentDist}`);
  console.log(`────────────────────────────────────`);

  const target = 4000;
  const pass = avg <= target;
  console.log(`  AC5 target:    ≤ ${target}`);
  console.log(`  AC5 result:    ${pass ? '✅ PASS' : '❌ FAIL'} (avg=${avg})`);
  console.log('');

  return { avg, median, p90, intentDist, pass, count: subset.length };
}

// Main
const opts = parseArgs();

if (opts.fromFile) {
  if (!fs.existsSync(opts.fromFile)) {
    console.error(`File not found: ${opts.fromFile}`);
    process.exit(1);
  }
  const content = fs.readFileSync(opts.fromFile, 'utf-8');
  const entries = parseStderrLog(content);
  computeStats(entries, opts.n);
} else {
  console.log('Usage: node measure-hook-injection.js --from-file <stderr-log> [--n 30]');
  console.log('');
  console.log('Collect stderr log from a Claude Code session:');
  console.log('  claude 2>stderr.log');
  console.log('  node measure-hook-injection.js --from-file stderr.log --n 30');
  process.exit(0);
}
