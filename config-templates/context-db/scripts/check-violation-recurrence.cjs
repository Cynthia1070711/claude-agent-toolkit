#!/usr/bin/env node
'use strict';

/**
 * V2-07-FIX Layer 2 + L3d — Rule Violation Recurrence Check + auto-write block-list
 *
 * Purpose:
 *   每天/每 session 跑一次,從 context_entries WHERE category='rule_violation' 計算
 *   3d / 7d window 違規累積,自動 write/refresh `.claude/violation-block-list.json`。
 *
 *   PreToolUse hook (`.claude/hooks/pre-tool-violation-gate.js`) 讀此 block-list
 *   攔截對應 scope 的 Edit/Write tool call,實現 SonarQube Quality Gate Progressive
 *   風格的「規則漸進嚴格化」。
 *
 * Thresholds (CEO 2026-05-07 雙決策):
 *   - WARN: 3 days, ≥3 occurrences (banner only)
 *   - BLOCK: 7 days, ≥5 occurrences (auto-write block-list, PreToolUse 攔截)
 *
 * Module exports:
 *   - aggregateAndClassify(db, opts) → { warn[], block[] }
 *   - formatBanner(result) → markdown string (for pre-prompt-rag.js Layer 11)
 *   - writeBlockList(blockRules) → updates .claude/violation-block-list.json
 *
 * CLI:
 *   node .context-db/scripts/check-violation-recurrence.cjs        # markdown report + auto-write
 *   node .context-db/scripts/check-violation-recurrence.cjs --json # JSON output
 *   node .context-db/scripts/check-violation-recurrence.cjs --dry  # no block-list write
 *
 * Exit code: 0 healthy / 1 warn / 2 block
 *
 * Memory id=3964 (CEO 雙決策 - PreToolUse 立即啟用 + 3/7d 自動升級)
 */

const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..', '..');
const dbPath = path.join(projectRoot, '.context-db', 'phycool.db');
const blockListPath = path.join(projectRoot, '.claude', 'violation-block-list.json');

const THRESHOLDS = Object.freeze({
  WARN_DAYS: 3,
  WARN_COUNT: 3,
  BLOCK_DAYS: 7,
  BLOCK_COUNT: 5,
});

// Known rule → scope_globs + exit_message mapping
// Avoid wildcard `**/*` (over-block); add new rules here as observed
const SCOPE_MAP = Object.freeze({
  'memory/feedback_cr_must_try_fix_before_defer.md': {
    globs: [
      'docs/implementation-artifacts/reviews/**/*.md',
      'docs/tracking/active/**.track.md',
    ],
    message: 'CR phase 7d 累積違反 try-fix 規則 ≥5 次。請先 spike 1 test (file:line evidence) 寫 attempted_fix_diff,再 commit DEFERRED。',
  },
  '.claude/rules/skill-sync-gate.md': {
    globs: [
      '.claude/skills/**/SKILL.md',
      '.claude/skills/**/references/*.md',
    ],
    message: 'Skill 變更需走 Skill(saas-to-skill) Mode B 字面調用,不可直 Edit。skill-tool-invocation-mandatory.md v1.1.0 強制。',
  },
  '.claude/rules/skill-tool-invocation-mandatory.md': {
    globs: [
      '.claude/skills/**/SKILL.md',
      '.claude/skills/**/references/*.md',
    ],
    message: 'Skill tool 字面調用強制 — Edit/Write SKILL.md 必先 Skill(saas-to-skill) tool。',
  },
  '.claude/rules/depth-gate-warn-mandatory-resolution.md': {
    globs: [
      'docs/tracking/active/**.track.md',
      'docs/implementation-artifacts/reviews/**/*.md',
    ],
    message: 'Depth Gate WARN 等同 BLOCK。需 --accept-warn "具體理由" 或修補 WARN 條目,不可投機通過。',
  },
  '.claude/rules/tasks-backfill.md': {
    globs: [
      'docs/implementation-artifacts/stories/**/*.md',
      'docs/tracking/active/**.track.md',
    ],
    message: 'tasks-backfill-verify 必獨立 CR 階段執行,每 task 必附 file:line 證據。',
  },
  '.claude/rules/db-first-no-md-mirror.md': {
    globs: [
      'docs/implementation-artifacts/stories/**/*.md',
    ],
    message: 'DB-first Story 禁止產生 .md 鏡像檔。Story 結構化資料寫 DB,source_file=context-db://stories/{id}。',
  },
  '.claude/rules/cr-debt-doc-audit.md': {
    globs: [
      'docs/implementation-artifacts/reviews/**/*.md',
    ],
    message: 'CR 階段必走 Phase A-D 流程,不可跳過 Boy Scout / Glob 驗證。',
  },
  '.claude/rules/constitutional-standard.md': {
    // F5.3 review fix(2026-05-08): 縮窄 scope,避免 docs/tracking/ markdown 過殺
    // 只攔截 src/ 業務邏輯與 implementation-artifacts(stories / reviews / specs)
    globs: [
      'src/**/*.cs',
      'src/**/*.ts',
      'src/**/*.tsx',
      'docs/implementation-artifacts/**/*.md',
      'docs/technical-decisions/*.md',
    ],
    message: 'Constitutional Standard 違反 — Anti-Speculation / Code Verification / Backend Contract / Depth-First Verification / External Source Citation / Karpathy Surgical Changes / Bilingual Doc / Audit Anti-Patterns。',
  },
  '.claude/rules/context-memory.md': {
    globs: [
      '.context-db/scripts/*.js',
      '.context-db/scripts/*.cjs',
    ],
    message: 'Context Memory DB query 違反 — DB Schema-First Mandate (PRAGMA-first / Cheatsheet 對照 / file:line evidence)。',
  },
  '.claude/rules/subagent-blocked-tools.md': {
    globs: [],  // 無 file scope (sub-agent context),不適合 PreToolUse 攔截
    message: 'Sub-agent 不可寫 memory / 不可調用 mcp__phycool-context write tools。',
  },
});

// ── Aggregation logic ──────────────────────────────────────────────

function aggregate(db, days) {
  const rows = db.prepare(`
    SELECT content, timestamp
    FROM context_entries
    WHERE category='rule_violation'
      AND timestamp > datetime('now', '+8 hours', '-${days} days')
  `).all();

  const ruleCount = {};
  for (const r of rows) {
    let m;
    try { m = JSON.parse(r.content); } catch { continue; }
    const rule = m && m.violated_rule_path ? m.violated_rule_path : 'unknown';
    ruleCount[rule] = (ruleCount[rule] || 0) + 1;
  }
  return ruleCount;
}

/**
 * @param {object} db - better-sqlite3 instance (readonly OK)
 * @param {object} [opts]
 * @returns {{ warn: Array, block: Array, generated_at: string }}
 */
function aggregateAndClassify(db, opts = {}) {
  const t = Object.assign({}, THRESHOLDS, opts.thresholds || {});

  const count3d = aggregate(db, t.WARN_DAYS);
  const count7d = aggregate(db, t.BLOCK_DAYS);

  const result = { warn: [], block: [], generated_at: nowTaiwanIso() };

  // BLOCK: 7d ≥ BLOCK_COUNT
  for (const [rule, c] of Object.entries(count7d)) {
    if (c >= t.BLOCK_COUNT) {
      result.block.push({
        rule,
        count_7d: c,
        count_3d: count3d[rule] || 0,
      });
    }
  }

  // WARN: 3d ≥ WARN_COUNT but not in BLOCK
  const blockedRules = new Set(result.block.map(b => b.rule));
  for (const [rule, c] of Object.entries(count3d)) {
    if (c >= t.WARN_COUNT && !blockedRules.has(rule)) {
      result.warn.push({ rule, count_3d: c });
    }
  }

  // Sort
  result.block.sort((a, b) => b.count_7d - a.count_7d);
  result.warn.sort((a, b) => b.count_3d - a.count_3d);

  return result;
}

// ── Formatters ──────────────────────────────────────────────────────

function nowTaiwanIso() {
  // Use Asia/Taipei timezone consistently (Constitutional §Timestamp Mandate)
  return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function basenameRule(rulePath) {
  return rulePath.replace(/.*[/\\]/, '').replace(/\.md$/, '');
}

/**
 * Banner for pre-prompt-rag.js Layer 11.5 (V2-07-FIX 階梯)
 * Token budget < 400 (cap with VIOLATION_TOKEN_HARD_CAP).
 * @param {ReturnType<typeof aggregateAndClassify>} result
 * @param {object} [opts] - { compact: boolean }
 * @returns {string}
 */
function formatBanner(result, opts = {}) {
  if (!result || (!result.warn.length && !result.block.length)) return '';

  const compact = opts.compact === true;
  const lines = [];
  lines.push('## ⚠ V2-07-FIX 違規累積階梯(3/7d)\n');

  if (result.block.length) {
    lines.push(`🔴 **BLOCK** — ${result.block.length} 個 rule 7d 累積 ≥${THRESHOLDS.BLOCK_COUNT} 次(已自動加入 \`violation-block-list.json\`,PreToolUse 攔截中):`);
    const showCount = compact ? 1 : Math.min(3, result.block.length);
    for (const r of result.block.slice(0, showCount)) {
      lines.push(`- ❌ \`${basenameRule(r.rule)}\` 3d=${r.count_3d}, 7d=${r.count_7d}`);
    }
  }

  if (result.warn.length && !compact) {
    lines.push('');
    lines.push(`🟡 **WARN** — ${result.warn.length} 個 rule 3d 累積 ≥${THRESHOLDS.WARN_COUNT} 次(留意趨勢,7d 達 ${THRESHOLDS.BLOCK_COUNT} 次將自動 BLOCK):`);
    const showCount = Math.min(3, result.warn.length);
    for (const r of result.warn.slice(0, showCount)) {
      lines.push(`- 🟡 \`${basenameRule(r.rule)}\` 3d=${r.count_3d}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── Block list writer (L3d) ─────────────────────────────────────────

function inferScopeFromRule(rulePath) {
  if (SCOPE_MAP[rulePath]) return SCOPE_MAP[rulePath];
  // F5.3 review fix(2026-05-08): unknown rule = alert-only 模式
  // 空 globs → pre-tool-violation-gate.js matchesScope 短路 return false → PreToolUse 不攔截
  // 避免未知 rule fallback wildcard `**/*` 觸發 wholesale BLOCK 風險
  // 仍記入 block-list 讓使用者於下次 violation-block-list.json review 時手動 Edit 加入精確 scope
  return {
    globs: [],
    message: `[alert-only] 規則違反累積 ≥${THRESHOLDS.BLOCK_COUNT} 次,但 SCOPE_MAP 未定義此 rule。請於 .context-db/scripts/check-violation-recurrence.cjs 加入精確 scope_globs;此 rule 暫不啟用 PreToolUse 攔截。Rule: ${rulePath}`,
  };
}

/**
 * Write `.claude/violation-block-list.json` based on classified result
 * - Preserves `blocked_since` from existing entries (don't reset on each run)
 * - Removes rules no longer in BLOCK (auto_remove_when_below_threshold)
 * @param {Array} blockRules - result.block from aggregateAndClassify
 * @returns {{ added: number, removed: number, total: number }}
 */
function writeBlockList(blockRules) {
  let existing = { blocked_rules: [] };
  if (fs.existsSync(blockListPath)) {
    try {
      const raw = fs.readFileSync(blockListPath, 'utf8');
      const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
      existing = JSON.parse(trimmed) || { blocked_rules: [] };
    } catch { /* fall through with empty */ }
  }
  const existingMap = new Map(
    (existing.blocked_rules || []).map(e => [e.rule_path, e])
  );

  const newBlockedRules = [];
  for (const b of blockRules) {
    const scope = inferScopeFromRule(b.rule);
    const prior = existingMap.get(b.rule);
    newBlockedRules.push({
      rule_path: b.rule,
      current_count_3d: b.count_3d,
      current_count_7d: b.count_7d,
      blocked_since: prior ? prior.blocked_since : nowTaiwanIso(),
      scope_globs: scope.globs,
      exit_message: scope.message,
    });
  }

  const previousCount = (existing.blocked_rules || []).length;
  const newCount = newBlockedRules.length;
  const added = newBlockedRules.filter(r => !existingMap.has(r.rule_path)).length;
  const removed = (existing.blocked_rules || []).filter(
    e => !newBlockedRules.some(n => n.rule_path === e.rule_path)
  ).length;

  const next = {
    $schema: 'https://phycool.local/schema/violation-block-list-v1.0.0.json',
    version: '1.0.0',
    auto_generated: true,
    auto_generator: '.context-db/scripts/check-violation-recurrence.cjs',
    last_updated: nowTaiwanIso(),
    policy: {
      warn_window_days: THRESHOLDS.WARN_DAYS,
      warn_count_threshold: THRESHOLDS.WARN_COUNT,
      block_window_days: THRESHOLDS.BLOCK_DAYS,
      block_count_threshold: THRESHOLDS.BLOCK_COUNT,
      auto_remove_when_below_threshold: true,
    },
    blocked_rules: newBlockedRules,
    warned_rules: [],
  };

  fs.writeFileSync(blockListPath, JSON.stringify(next, null, 2), 'utf8');
  return { added, removed, total: newCount, previous: previousCount };
}

// ── CLI ────────────────────────────────────────────────────────────

function main() {
  const args = new Set(process.argv.slice(2));
  const isJson = args.has('--json');
  const isDry = args.has('--dry');

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    process.stderr.write('[error] better-sqlite3 not available — exit 0 fail-open\n');
    process.exit(0);
  }

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`[error] DB not found: ${dbPath}\n`);
    process.exit(2);
  }

  const db = new Database(dbPath, { readonly: true });
  const result = aggregateAndClassify(db);
  db.close();

  // Determine exit code
  const exitCode = result.block.length > 0 ? 2 : (result.warn.length > 0 ? 1 : 0);

  // Auto-write block-list (unless --dry)
  let writeStats = null;
  if (!isDry) {
    try {
      writeStats = writeBlockList(result.block);
    } catch (e) {
      process.stderr.write(`[warn] block-list write failed: ${e.message}\n`);
    }
  }

  if (isJson) {
    console.log(JSON.stringify({
      generated_at: result.generated_at,
      thresholds: THRESHOLDS,
      counts: { warn: result.warn.length, block: result.block.length },
      result,
      block_list_write: writeStats,
      exit_code: exitCode,
    }, null, 2));
  } else {
    console.log('# Rule Violation Recurrence Report (3/7d)');
    console.log(`Generated: ${result.generated_at}`);
    console.log(`Thresholds: WARN=${THRESHOLDS.WARN_COUNT}/${THRESHOLDS.WARN_DAYS}d, BLOCK=${THRESHOLDS.BLOCK_COUNT}/${THRESHOLDS.BLOCK_DAYS}d`);
    console.log(`Total: BLOCK ${result.block.length} / WARN ${result.warn.length}`);
    if (writeStats) {
      console.log(`block-list: +${writeStats.added} -${writeStats.removed} = ${writeStats.total} (was ${writeStats.previous})`);
    } else if (isDry) {
      console.log('block-list: (dry mode, not written)');
    }
    console.log();
    if (result.block.length || result.warn.length) {
      console.log('| Rule | 3d | 7d | Tier |');
      console.log('|------|---:|---:|:----:|');
      for (const r of result.block) console.log(`| ${r.rule} | ${r.count_3d} | ${r.count_7d} | 🔴 BLOCK |`);
      for (const r of result.warn) console.log(`| ${r.rule} | ${r.count_3d} | - | 🟡 WARN |`);
    } else {
      console.log('✅ No rules above threshold.');
    }
  }

  process.exit(exitCode);
}

module.exports = {
  THRESHOLDS,
  SCOPE_MAP,
  aggregate,
  aggregateAndClassify,
  formatBanner,
  inferScopeFromRule,
  writeBlockList,
};

if (require.main === module) {
  main();
}
