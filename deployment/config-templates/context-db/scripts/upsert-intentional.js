// ============================================================
// PCPT Context Memory DB — IDD 寫入/查詢工具
// DLA-07: Intentional Decision Debt (IDD) CLI 管理工具
// Framework v1.3: 管理「故意不修」決策 (IDD-COM/STR/REG/USR)
// ============================================================
// 使用方式:
//   node .context-db/scripts/upsert-intentional.js --inline '<json>'
//   node .context-db/scripts/upsert-intentional.js --query --id IDD-COM-001
//   node .context-db/scripts/upsert-intentional.js --query --file ImagePanel.tsx
//   node .context-db/scripts/upsert-intentional.js --query --skill pcpt-editor-arch
//   node .context-db/scripts/upsert-intentional.js --query --module Editor
//   node .context-db/scripts/upsert-intentional.js --verify [--scope all|changed|file --file <path>]
//   node .context-db/scripts/upsert-intentional.js --retire IDD-COM-001
//   node .context-db/scripts/upsert-intentional.js --supersede IDD-COM-001 --by IDD-COM-005
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.PCPT_DB_PATH || path.join(__dirname, '..', 'context-memory.db');
const PROJECT_ROOT = process.env.PCPT_PROJECT_ROOT || path.join(__dirname, '..', '..');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--inline') { result.inline = args[++i]; }
    else if (arg === '--query') { result.query = true; }
    else if (arg === '--id') { result.id = args[++i]; }
    else if (arg === '--file') { result.file = args[++i]; }
    else if (arg === '--skill') { result.skill = args[++i]; }
    else if (arg === '--module') { result.module = args[++i]; }
    else if (arg === '--verify') { result.verify = true; }
    else if (arg === '--scope') { result.scope = args[++i]; }
    else if (arg === '--retire') { result.retire = args[++i]; }
    else if (arg === '--supersede') { result.supersede = args[++i]; }
    else if (arg === '--by') { result.by = args[++i]; }
  }
  return result;
}

function validateJsonField(val, fieldName) {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { JSON.parse(val); return val; }
    catch { throw new Error(`IDD_005: ${fieldName} 必須為合法 JSON array 字串`); }
  }
  return JSON.stringify(val);
}

// ── Main ──────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Verify DB exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ DB 不存在: ${DB_PATH}`);
    console.error('   請先執行: node .context-db/scripts/init-db.js');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // ── --inline: 新增/更新 IDD ──────────────────
    if (args.inline != null) {
      let data;
      try { data = JSON.parse(args.inline); }
      catch (e) { console.error('❌ --inline JSON 解析失敗:', e.message); process.exit(1); }

      // Validation
      const required = ['idd_id', 'idd_type', 'title', 'context', 'decision', 'reason', 'adr_path', 'signoff_by', 'signoff_date'];
      for (const field of required) {
        if (!data[field]) {
          console.error(`❌ IDD_002: 缺少必填欄位: ${field}`);
          process.exit(1);
        }
      }
      if (!['COM', 'STR', 'REG', 'USR'].includes(data.idd_type)) {
        console.error(`❌ IDD_001: idd_type 必須為 COM/STR/REG/USR，收到: ${data.idd_type}`);
        process.exit(1);
      }
      if (data.adr_path && !fs.existsSync(path.join(PROJECT_ROOT, data.adr_path))) {
        console.warn(`⚠️  IDD_003: ADR 文件不存在: ${data.adr_path}（繼續寫入，請盡快建立 ADR）`);
      }

      const now = getTaiwanTimestamp();
      const jsonFields = ['code_locations', 'forbidden_changes', 'related_skills', 'related_docs', 'platform_modules', 'related_files', 'tags'];
      for (const field of jsonFields) {
        data[field] = validateJsonField(data[field], field);
      }

      db.prepare(`
        INSERT INTO intentional_decisions (
          idd_id, idd_type, title, context, decision, reason,
          code_locations, adr_path, memory_file_path, signoff_by, signoff_date,
          re_evaluation_trigger, re_evaluation_date, forbidden_changes,
          criticality, status, superseded_by, related_skills, related_docs,
          platform_modules, related_files, tags, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(idd_id) DO UPDATE SET
          title=excluded.title, context=excluded.context, decision=excluded.decision,
          reason=excluded.reason, code_locations=excluded.code_locations,
          adr_path=excluded.adr_path, memory_file_path=excluded.memory_file_path,
          signoff_by=excluded.signoff_by, signoff_date=excluded.signoff_date,
          re_evaluation_trigger=excluded.re_evaluation_trigger,
          re_evaluation_date=excluded.re_evaluation_date,
          forbidden_changes=excluded.forbidden_changes, criticality=excluded.criticality,
          related_skills=excluded.related_skills, related_docs=excluded.related_docs,
          platform_modules=excluded.platform_modules, related_files=excluded.related_files,
          tags=excluded.tags, updated_at=excluded.updated_at
      `).run(
        data.idd_id, data.idd_type, data.title, data.context,
        data.decision, data.reason,
        data.code_locations || null, data.adr_path, data.memory_file_path || null,
        data.signoff_by, data.signoff_date,
        data.re_evaluation_trigger || null, data.re_evaluation_date || null,
        data.forbidden_changes || null,
        data.criticality || 'normal', data.status || 'active',
        data.superseded_by || null, data.related_skills || null, data.related_docs || null,
        data.platform_modules || null, data.related_files || null,
        data.tags || null, data.created_at || now, now,
      );

      console.log(`✅ IDD ${data.idd_id} 已寫入 DB`);
      console.log(`   Type: ${data.idd_type} | Criticality: ${data.criticality || 'normal'} | ADR: ${data.adr_path}`);

    // ── --query: 查詢 ──────────────────────────
    } else if (args.query) {
      if (args.id) {
        // Single IDD query
        const row = db.prepare('SELECT * FROM intentional_decisions WHERE idd_id = ?').get(args.id);
        if (!row) {
          console.log(`⚠️  找不到 IDD: ${args.id}`);
        } else {
          console.log(JSON.stringify(row, null, 2));
        }
      } else if (args.file) {
        // File-based reverse query
        const rows = db.prepare(`
          SELECT idd_id, idd_type, title, criticality, status, forbidden_changes
          FROM intentional_decisions
          WHERE status='active' AND related_files LIKE ?
          ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        `).all(`%${args.file}%`);
        if (rows.length === 0) {
          console.log(`ℹ️  ${args.file} 無相關 active IDD`);
        } else {
          console.log(`📋 ${args.file} 相關 IDD (${rows.length} 筆):`);
          for (const r of rows) {
            const forbidden = r.forbidden_changes ? JSON.parse(r.forbidden_changes) : [];
            console.log(`  - ${r.idd_id} (${r.idd_type}/${r.criticality}): ${r.title}`);
            if (forbidden.length) console.log(`    ❌ Forbidden: ${forbidden.join(' | ')}`);
          }
        }
      } else if (args.skill) {
        // Skill-based reverse query
        const rows = db.prepare(`
          SELECT idd_id, idd_type, title, criticality, status
          FROM intentional_decisions
          WHERE status='active' AND related_skills LIKE ?
          ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        `).all(`%${args.skill}%`);
        if (rows.length === 0) {
          console.log(`ℹ️  ${args.skill} 無相關 active IDD`);
        } else {
          console.log(`📋 ${args.skill} 相關 IDD (${rows.length} 筆):`);
          for (const r of rows) {
            console.log(`  - ${r.idd_id} (${r.idd_type}/${r.criticality}): ${r.title}`);
          }
        }
      } else if (args.module) {
        // Module-based reverse query
        const rows = db.prepare(`
          SELECT idd_id, idd_type, title, criticality, status
          FROM intentional_decisions
          WHERE status='active' AND platform_modules LIKE ?
          ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
        `).all(`%${args.module}%`);
        if (rows.length === 0) {
          console.log(`ℹ️  Module ${args.module} 無相關 active IDD`);
        } else {
          console.log(`📋 Module ${args.module} 相關 IDD (${rows.length} 筆):`);
          for (const r of rows) {
            console.log(`  - ${r.idd_id} (${r.idd_type}/${r.criticality}): ${r.title}`);
          }
        }
      } else {
        // List all active IDDs
        const rows = db.prepare(`
          SELECT idd_id, idd_type, title, criticality, status, updated_at
          FROM intentional_decisions
          WHERE status='active'
          ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC
        `).all();
        console.log(`📋 All active IDDs (${rows.length} 筆):`);
        for (const r of rows) {
          console.log(`  - ${r.idd_id} (${r.idd_type}/${r.criticality}): ${r.title}`);
        }
      }

    // ── --verify: 驗證 ADR 存在性 + code 標註 ──
    } else if (args.verify) {
      const scope = args.scope || 'all';
      const rows = db.prepare("SELECT idd_id, adr_path, code_locations, status FROM intentional_decisions WHERE status='active'").all();

      let validCount = 0;
      let missingAdr = 0;
      let orphanedIdd = 0;

      console.log(`\n🔍 Verifying ${rows.length} active IDDs (scope: ${scope})...\n`);

      for (const r of rows) {
        if (!r.adr_path) {
          console.log(`  ❌ ${r.idd_id}: adr_path 為空`);
          missingAdr++;
          continue;
        }
        const adrFull = path.join(PROJECT_ROOT, r.adr_path);
        if (!fs.existsSync(adrFull)) {
          console.log(`  ❌ ${r.idd_id}: ADR 不存在 — ${r.adr_path}`);
          missingAdr++;
          continue;
        }

        if (r.code_locations) {
          try {
            const locs = JSON.parse(r.code_locations);
            const allExist = locs.every(l => l.file && fs.existsSync(path.join(PROJECT_ROOT, l.file)));
            if (!allExist) {
              console.log(`  ⚠️  ${r.idd_id}: code_locations 有過時路徑`);
              orphanedIdd++;
            } else {
              validCount++;
            }
          } catch { orphanedIdd++; }
        } else {
          validCount++;
        }
      }

      const issueCount = missingAdr + orphanedIdd;
      console.log(`\n📊 Verification Result:`);
      console.log(`  valid: ${validCount}, missing_adr: ${missingAdr}, orphaned_idd: ${orphanedIdd}`);
      console.log(issueCount === 0 ? '\n✅ All IDDs verified successfully' : `\n⚠️  ${issueCount} issue(s) found — please review above`);

    // ── --retire: Retire IDD ────────────────────
    } else if (args.retire) {
      const idd_id = args.retire;
      const existing = db.prepare('SELECT idd_id, status FROM intentional_decisions WHERE idd_id=?').get(idd_id);
      if (!existing) {
        console.error(`❌ 找不到 IDD: ${idd_id}`);
        process.exit(1);
      }
      if (existing.status === 'retired') {
        console.log(`ℹ️  ${idd_id} 已是 retired 狀態，無需重複操作`);
      } else {
        const now = getTaiwanTimestamp();
        db.prepare("UPDATE intentional_decisions SET status='retired', updated_at=? WHERE idd_id=?").run(now, idd_id);
        console.log(`✅ IDD ${idd_id} 已標記為 retired (${now})`);
        console.log('   注意: ADR 文件請加上 "[RETIRED]" 前綴，並更新 related_skills SKILL.md');
      }

    // ── --supersede: Supersede IDD ──────────────
    } else if (args.supersede && args.by) {
      const oldId = args.supersede;
      const newId = args.by;
      const existing = db.prepare('SELECT idd_id, status FROM intentional_decisions WHERE idd_id=?').get(oldId);
      if (!existing) {
        console.error(`❌ 找不到 IDD: ${oldId}`);
        process.exit(1);
      }
      const newExists = db.prepare('SELECT idd_id FROM intentional_decisions WHERE idd_id=?').get(newId);
      if (!newExists) {
        console.error(`❌ 新 IDD ${newId} 不存在，請先建立再執行 supersede`);
        process.exit(1);
      }
      const now = getTaiwanTimestamp();
      db.prepare("UPDATE intentional_decisions SET status='superseded', superseded_by=?, updated_at=? WHERE idd_id=?").run(newId, now, oldId);
      console.log(`✅ IDD ${oldId} 已標記為 superseded by ${newId} (${now})`);
      console.log('   注意: 請更新 code 中的 [Intentional: IDD-XXX] 標註，以及舊 ADR 文件');

    } else {
      console.log(`
IDD 寫入/查詢工具 (DLA-07 Framework v1.3)

用法:
  node .context-db/scripts/upsert-intentional.js --inline '<json>'          新增/更新 IDD
  node .context-db/scripts/upsert-intentional.js --query --id IDD-COM-001   查詢單筆
  node .context-db/scripts/upsert-intentional.js --query --file <path>      依檔案反查
  node .context-db/scripts/upsert-intentional.js --query --skill <name>     依 Skill 反查
  node .context-db/scripts/upsert-intentional.js --query --module <name>    依 Module 反查
  node .context-db/scripts/upsert-intentional.js --verify                   驗證所有 IDD
  node .context-db/scripts/upsert-intentional.js --retire IDD-COM-001       Retire IDD
  node .context-db/scripts/upsert-intentional.js --supersede <old> --by <new>  Supersede
      `);
    }
  } finally {
    db.close();
  }
}

// Export for testing
export { parseArgs, validateJsonField, main, DB_PATH, PROJECT_ROOT };

// Guard: only run main() when executed directly (not when imported by vitest)
const isDirectRun = !process.env.VITEST;
if (isDirectRun) {
  main().catch(err => {
    console.error('❌ upsert-intentional 執行失敗:', err.message);
    process.exit(1);
  });
}
