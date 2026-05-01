// ============================================================
// PCPT Context Memory DB — Debt Layer 5: Alan Edge Review
// DLA-08 Task 3 / AC-3 (BR-L5-01~03)
// ============================================================
// Usage:
//   node .context-db/scripts/debt-layer5-alan-review.js --layer4-report <path>
//   node .context-db/scripts/debt-layer5-alan-review.js --layer4-report <path> --layer3-report <path>
//   node .context-db/scripts/debt-layer5-alan-review.js --apply-file <decisions.json>
//   node .context-db/scripts/debt-layer5-alan-review.js --apply-file <decisions.json> --execute
// ============================================================
// Contracts:
//   BR-L5-01: Merges layer4 output + any layer3 quickFix candidates into a
//             single markdown for Alan's batch approval
//   BR-L5-02: Every entry carries a copy-paste upsert-debt.js --resolve command
//   BR-L5-03: --apply-file mode consumes Alan's decisions.json and applies via
//             child_process (soft-delete only — never DELETE FROM)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import {
  DB_PATH,
  REPORTS_DIR,
  getTaiwanTimestamp,
  reportTimestamp,
} from './_migrations/tech-debt-schema.js';
import { createBackup } from './debt-layer-rollback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORY_ID = 'dla-08-current-debt-migration';
const DEFAULT_REPORT_PATH = path.join(
  __dirname, '..', '..', 'docs', 'implementation-artifacts', 'reports', 'epic-dla', 'dla-08-alan-review.md'
);

function readJsonUtf8(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Generate one-liner apply command (BR-L5-02) ──
function buildApplyCommand(debtId, resolution, story = STORY_ID) {
  // Only FIXED uses --resolve; DEFERRED/WONT_FIX need upsert to update status+target_story
  if (resolution === 'FIXED') {
    return `node .context-db/scripts/upsert-debt.js --resolve ${debtId} --by CC-OPUS --in ${story}`;
  }
  // For other states use --inline upsert (preserves soft-delete semantics)
  const inline = {
    debt_id: debtId,
    story_id: story,
    status: resolution === 'DEFERRED' ? 'open' : (resolution === 'WONT_FIX' ? 'wont-fix' : 'open'),
    target_story: resolution === 'DEFERRED' ? '<set-target-story>' : null,
    wont_fix_reason: resolution === 'WONT_FIX' ? '<reason>' : null,
    resolved_in_story: STORY_ID,
  };
  return `node .context-db/scripts/upsert-debt.js --inline '${JSON.stringify(inline)}'`;
}

// ── BR-L5-01: compose markdown (繁體中文,給 Alan 人工 review) ──
function buildMarkdown({ layer4, layer3, openRows }) {
  const lines = [];
  const ts = getTaiwanTimestamp();

  lines.push(`# DLA-08 Alan 人工審查 — 技術債分類決策`);
  lines.push('');
  lines.push(`> 產出時間: ${ts}`);
  lines.push(`> 來源 Story: \`${STORY_ID}\``);
  lines.push(`> Layer 4 輸入: \`${layer4?.metadata?.input_file ?? '(n/a)'}\``);
  lines.push(`> 模式: ${layer4?.metadata?.mode ?? 'n/a'} (${layer4?.metadata?.model ?? 'mock'})`);
  lines.push('');
  lines.push('## 總覽');
  lines.push('');
  lines.push(`- DB 目前 open debts 總數: **${openRows.length}**`);
  lines.push(`- Layer 3 Quick-Fix 候選: **${layer3?.candidates?.quickFix?.length ?? 0}**`);
  lines.push(`- Layer 4 Semantic 分類總數: **${layer4?.metadata?.semantic_total ?? 0}**`);
  lines.push(`  - 建議 FIXED (已修/可歸檔): ${layer4?.groups?.fixed_suggested?.length ?? 0}`);
  lines.push(`  - 建議 DEFERRED (有效債,路由 target_story): ${layer4?.groups?.deferred_suggested?.length ?? 0}`);
  lines.push(`  - 建議 WON'T FIX (過期/pre-existing/超出範圍): ${layer4?.groups?.wontfix_suggested?.length ?? 0}`);
  lines.push(`  - 建議 IDD 候選 (COM/STR/REG/USR 決策): ${layer4?.groups?.idd_candidate?.length ?? 0}`);
  lines.push('');
  lines.push('## 審查流程');
  lines.push('');
  lines.push('1. 逐條檢視下方四個章節 (IDD / FIXED / DEFERRED / WONT_FIX),在 `[ ]` 處勾選:');
  lines.push('   - ✅ 同意建議');
  lines.push('   - ❌ 拒絕建議 (說明理由)');
  lines.push('   - ✏ 修改建議 (改動 decision / target_story / reason)');
  lines.push('2. 同意的項目可直接複製其下方的「一鍵指令」到 shell 執行');
  lines.push('3. 或批次處理:編輯下方格式的 `decisions.json`,執行:');
  lines.push('   ```bash');
  lines.push('   node .context-db/scripts/debt-layer5-alan-review.js --apply-file decisions.json --execute');
  lines.push('   ```');
  lines.push('4. 重跑 `debt-layer3-quickfix.js` 確認 open 數量下降');
  lines.push('');
  lines.push('**decisions.json 格式:**');
  lines.push('```json');
  lines.push('[');
  lines.push('  { "debt_id": "TD-xxx", "decision": "FIXED|DEFERRED|WONT_FIX", "target_story": "...", "reason": "...", "by": "Alan" }');
  lines.push(']');
  lines.push('```');
  lines.push('');

  // DB lookup map
  const byDebtId = new Map();
  for (const r of openRows) byDebtId.set(r.debt_id, r);

  const sections = [
    { key: 'idd_candidate',      title: '1. IDD 候選 (商業/策略/法規/使用者 刻意決策 — 應走 intentional_decisions)' },
    { key: 'fixed_suggested',    title: '2. 建議 FIXED (已在 commit history 修好或過期,直接歸檔)' },
    { key: 'deferred_suggested', title: '3. 建議 DEFERRED (有效債,保持 open 並寫入 target_story)' },
    { key: 'wontfix_suggested',  title: '4. 建議 WON\'T FIX (pre-existing / 超出範圍 / 第三方)' },
  ];

  for (const section of sections) {
    const items = layer4?.groups?.[section.key] ?? [];
    lines.push(`## ${section.title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('_(無)_');
      lines.push('');
      continue;
    }
    lines.push(`**筆數:** ${items.length}`);
    lines.push('');
    // Sort by priority_score desc (high priority first for easier review)
    const sortedItems = items.slice().sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    for (const it of sortedItems) {
      const dbRow = byDebtId.get(it.debt_id);
      const title = dbRow?.title ?? '(資料庫查無此筆)';
      const sev = dbRow?.severity ?? '?';
      const cat = dbRow?.category ?? '?';
      const score = it.priority_score != null ? it.priority_score : '-';
      const conf = it.confidence != null ? `(信心 ${(it.confidence * 100).toFixed(0)}%)` : '';
      const cmd = buildApplyCommand(it.debt_id, it.suggested_resolution);
      lines.push(`### [ ] ${it.debt_id} — ${title}`);
      lines.push('');
      lines.push(`- **Priority Score:** ${score} ${conf}  ` +
        (it.severity_weight != null ? `(sw=${it.severity_weight} × bi=${it.business_impact} ÷ fc=${it.fix_cost})` : ''));
      lines.push(`- **嚴重度:** ${sev}  **分類:** ${cat} → ${it.suggested_category ?? '-'}  **目前狀態:** ${dbRow?.status ?? 'open'}`);
      lines.push(`- **建議動作:** ${it.suggested_resolution}`);
      lines.push(`- **理由:** ${it.reason ?? '-'}`);
      if (it.target_story) lines.push(`- **目標 Story:** \`${it.target_story}\``);
      lines.push('');
      lines.push('一鍵指令:');
      lines.push('```bash');
      lines.push(cmd);
      lines.push('```');
      lines.push('');
    }
  }

  // Quick-Fix section
  if (layer3?.candidates?.quickFix?.length) {
    lines.push('## 5. Layer 3 Quick-Fix 候選 (低嚴重度單檔 TD/CQD — 預設批次 WON\'T FIX 安全)');
    lines.push('');
    lines.push(`**筆數:** ${layer3.candidates.quickFix.length}`);
    lines.push('');
    lines.push('以下項目均為低嚴重度單檔 TD/CQD 債,建議一律標 **WON\'T FIX**(pre-existing 美容性除錯)。若其中有你認為應該修的,請個別移出到 FIXED 區。');
    lines.push('');
    lines.push('```bash');
    lines.push('# 批次 wont-fix 指令範本 — 複製後依實際決策刪除不處理的行:');
    for (const qf of layer3.candidates.quickFix) {
      lines.push(`# ${qf.debt_id} :: ${qf.title}`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## 備註');
  lines.push('');
  lines.push('- 本報告由 `debt-layer5-alan-review.js` 產出,讀取 Layer 3 quick-fix 清單 + Layer 4 subagent triage JSON。');
  lines.push('- 若 Layer 4 是 mock 模式,上方分類**只是啟發式預估**,不代表真正 subagent 判斷。正式決策前請實跑 Haiku subagent (移除 `-MockMode` flag)。');
  lines.push('- 所有 apply 動作均走 soft-delete(UPDATE status),絕不 `DELETE FROM`。');
  lines.push('- Rollback 入口: `node .context-db/scripts/debt-layer-rollback.js --from <backup-file>`');

  return lines.join('\n');
}

// ── BR-L5-03: apply Alan's decisions.json ──
function applyDecisions(decisionsFile, execute) {
  const decisions = readJsonUtf8(decisionsFile);
  if (!Array.isArray(decisions)) {
    throw new Error('E-DLA-L5-01: apply-file must be a JSON array of decisions');
  }

  // Validate schema + dedupe (BR-L5-03 edge case: duplicate debt_id → last wins + warn)
  const seen = new Map();
  for (const d of decisions) {
    if (!d.debt_id || !d.decision) {
      throw new Error('E-DLA-L5-01: each decision must have debt_id + decision');
    }
    if (seen.has(d.debt_id)) {
      console.warn(`⚠ duplicate debt_id ${d.debt_id} — later entry overwrites earlier`);
    }
    seen.set(d.debt_id, d);
  }

  const unique = Array.from(seen.values());
  const summary = { FIXED: 0, DEFERRED: 0, WONT_FIX: 0, SKIPPED: 0 };

  if (!execute) {
    console.log(`[dry-run] would apply ${unique.length} decisions:`);
    for (const d of unique) {
      summary[d.decision] = (summary[d.decision] ?? 0) + 1;
      console.log(`  - ${d.debt_id} -> ${d.decision}${d.target_story ? ' (target: ' + d.target_story + ')' : ''}`);
    }
    return { mode: 'dry-run', count: unique.length, summary };
  }

  // BR-RB-01: auto-backup before destructive write (CR fix dla-08 F-03)
  let backup = null;
  try {
    backup = createBackup('dla08-layer5-apply');
    console.log(`✅ pre-apply backup: ${backup.path} (${(backup.size_bytes / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`❌ Backup failed, aborting Layer 5 apply: ${err.message}`);
    throw new Error(`E-DLA-L5-BACKUP: pre-apply backup failed — ${err.message}`);
  }

  const db = new Database(DB_PATH);
  const applied = [];
  try {
    // BR-L5-03 atomicity: wrap all UPDATEs in single transaction so partial failure rolls back (CR fix dla-08 F-02)
    const fixedStmt = db.prepare(
      `UPDATE tech_debt_items SET status='fixed', resolved_at=?, resolved_by=?, resolved_in_story=? WHERE id=?`,
    );
    const deferredStmt = db.prepare(
      `UPDATE tech_debt_items SET target_story=?, resolved_in_story=? WHERE id=?`,
    );
    const wontFixStmt = db.prepare(
      `UPDATE tech_debt_items SET status='wont-fix', wont_fix_reason=?, resolved_at=?, resolved_by=?, resolved_in_story=? WHERE id=?`,
    );
    const lookupStmt = db.prepare('SELECT id, status FROM tech_debt_items WHERE debt_id = ?');

    const tx = db.transaction(items => {
      for (const d of items) {
        const row = lookupStmt.get(d.debt_id);
        if (!row) {
          console.warn(`⚠ debt_id ${d.debt_id} not found — skipped`);
          summary.SKIPPED += 1;
          continue;
        }
        const now = getTaiwanTimestamp();
        if (d.decision === 'FIXED') {
          fixedStmt.run(now, d.by ?? 'CC-OPUS', STORY_ID, row.id);
        } else if (d.decision === 'DEFERRED') {
          deferredStmt.run(d.target_story ?? null, STORY_ID, row.id);
        } else if (d.decision === 'WONT_FIX') {
          wontFixStmt.run(d.reason ?? 'Layer 5 Alan review', now, d.by ?? 'CC-OPUS', STORY_ID, row.id);
        } else {
          console.warn(`⚠ unknown decision "${d.decision}" for ${d.debt_id} — skipped`);
          summary.SKIPPED += 1;
          continue;
        }
        summary[d.decision] = (summary[d.decision] ?? 0) + 1;
        applied.push(d.debt_id);
      }
    });
    tx(unique);
  } finally {
    db.close();
  }

  return { mode: 'execute', count: applied.length, summary, applied, backup_path: backup?.path ?? null };
}

// ── Load open debts from DB for cross-ref ──
/* v8 ignore start — internal CLI-only functions, not exported */
function loadOpenDebts() {
  const db = new Database(DB_PATH);
  try {
    return db.prepare(
      `SELECT id, debt_id, title, category, severity, status, target_story
       FROM tech_debt_items
       WHERE status = 'open'`
    ).all();
  } finally {
    db.close();
  }
}

// ── Main ──
function main() {
  const args = process.argv.slice(2);
  const idxL4 = args.indexOf('--layer4-report');
  const idxL3 = args.indexOf('--layer3-report');
  const idxApply = args.indexOf('--apply-file');
  const execute = args.includes('--execute');
  const outputIdx = args.indexOf('--output');

  if (idxApply >= 0) {
    const applyFile = args[idxApply + 1];
    if (!applyFile) {
      console.error('Usage: --apply-file <decisions.json> [--execute]');
      process.exit(1);
    }
    try {
      const result = applyDecisions(applyFile, execute);
      console.log(`✅ ${result.mode}: ${result.count} decisions processed`);
      console.log(`   summary: ${JSON.stringify(result.summary)}`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  if (idxL4 < 0) {
    console.error('Usage:');
    console.error('  node debt-layer5-alan-review.js --layer4-report <path> [--layer3-report <path>] [--output <md>]');
    console.error('  node debt-layer5-alan-review.js --apply-file <decisions.json> [--execute]');
    process.exit(1);
  }

  const layer4Path = args[idxL4 + 1];
  const layer3Path = idxL3 >= 0 ? args[idxL3 + 1] : null;
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : DEFAULT_REPORT_PATH;

  const layer4 = readJsonUtf8(layer4Path);
  const layer3 = layer3Path ? readJsonUtf8(layer3Path) : null;
  const openRows = loadOpenDebts();

  const md = buildMarkdown({ layer4, layer3, openRows });

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, md, 'utf8');

  // Also emit a JSON sidecar for programmatic review
  const sidecarPath = outputPath.replace(/\.md$/, '.json');
  fs.writeFileSync(sidecarPath, JSON.stringify({
    metadata: {
      story_id: STORY_ID,
      generated_at: getTaiwanTimestamp(),
      layer4_source: layer4Path,
      layer3_source: layer3Path,
      total_open: openRows.length,
    },
    layer4_summary: layer4?.metadata,
    layer3_summary: layer3?.metadata,
  }, null, 2), 'utf8');

  console.log(`✅ Layer 5 review generated`);
  console.log(`   markdown: ${outputPath}`);
  console.log(`   json:     ${sidecarPath}`);
  console.log(`   open debts: ${openRows.length}`);
  console.log(`   layer4 classified: ${layer4?.metadata?.classified ?? 0}`);
}

/* v8 ignore start — CLI entry, tested via manual integration */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) main();
/* v8 ignore stop */

export { buildMarkdown, applyDecisions, buildApplyCommand };
