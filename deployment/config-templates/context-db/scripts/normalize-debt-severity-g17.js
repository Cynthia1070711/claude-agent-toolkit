#!/usr/bin/env node
// ============================================================
// normalize-debt-severity-g17.js — one-shot G17 remediation
// ------------------------------------------------------------
// Normalize tech_debt_items.severity to the canonical lowercase
// 5-level set per phycool-debt-registry (critical/high/medium/low/info).
//
//   1. Case drift  : LOWER(severity) for LOW/MEDIUM/HIGH rows (zero spec).
//   2. id=708 'P2' : priority mis-filed as severity → 'medium'. Evidence:
//      identical act()-warnings test debt id=715 = 'MEDIUM', same
//      category=test-quality. (NOT speculation — same-class precedent.)
//   3. id=713 'info': KEPT. 'info' is a valid debt-registry severity
//      (5-level: critical/high/medium/low/info), already lowercase.
//
// Idempotent: rows already canonical-lowercase are untouched.
// Ledger: each change appended to .context-db/ledger.jsonl.
// Spec: 改善計畫-專家深度分析.md §5 P1-E / README §4.1 (G17)
// ============================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const LEDGER_PATH = path.join(__dirname, '..', 'ledger.jsonl');
const CANONICAL = new Set(['critical', 'high', 'medium', 'low', 'info']);

function ledger(entry) {
  try { fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8'); }
  catch (e) { process.stderr.write(`[normalize-g17] ledger fail: ${e.message}\n`); }
}

const db = new Database(DB_PATH);
const ts = getTaiwanTimestamp();
let caseFixed = 0, p2Fixed = 0;

// 1. Case drift → lowercase (only when the lowercased form is canonical)
const drift = db.prepare('SELECT id, severity FROM tech_debt_items WHERE severity <> LOWER(severity)').all();
const updCase = db.prepare('UPDATE tech_debt_items SET severity = LOWER(severity) WHERE id = ?');
for (const r of drift) {
  const lower = String(r.severity).toLowerCase();
  if (CANONICAL.has(lower)) {
    updCase.run(r.id);
    ledger({ ts, table: 'tech_debt_items', op: 'UPDATE', reason: 'G17-severity-lowercase', data: { id: r.id, from: r.severity, to: lower } });
    caseFixed++;
  } else {
    console.log(`SKIP id=${r.id} — lowercase '${lower}' not canonical, needs manual review`);
  }
}

// 2. id=708 'P2' (priority mis-filed) → 'medium' (evidence: same-class id=715)
const r708 = db.prepare('SELECT severity, category FROM tech_debt_items WHERE id = 708').get();
if (r708 && r708.severity === 'P2') {
  db.prepare("UPDATE tech_debt_items SET severity = 'medium' WHERE id = 708").run();
  ledger({ ts, table: 'tech_debt_items', op: 'UPDATE', reason: 'G17-P2-priority-misfiled', data: { id: 708, from: 'P2', to: 'medium', evidence: 'same act()-warnings test-quality debt as id=715(MEDIUM)' } });
  console.log("✅ id=708 'P2' → 'medium' (對齊同類 act() warnings test debt id=715)");
  p2Fixed++;
}

// 3. id=713 'info' intentionally kept (valid debt-registry 5-level severity)

console.log(`\ncase-lowercase fixed: ${caseFixed} | P2 fixed: ${p2Fixed} | info(id=713) kept as valid`);

// verify
const dist = db.prepare('SELECT severity, COUNT(*) c FROM tech_debt_items GROUP BY severity ORDER BY c DESC').all();
const nonCanon = dist.filter(d => !CANONICAL.has(d.severity));
console.log('=== severity 分布(後) ===');
dist.forEach(d => console.log(`  '${d.severity}': ${d.c}`));
console.log(nonCanon.length === 0 ? '✅ 全 canonical lowercase 5-level' : `⚠ 仍有非 canonical: ${JSON.stringify(nonCanon)}`);
db.close();
