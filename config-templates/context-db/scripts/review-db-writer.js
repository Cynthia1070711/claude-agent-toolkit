// ============================================================
// PCPT Review Analyst — DB 讀寫工具
// 用途：審查計畫寫入 / 審查報告回填 / 審查發現寫入 / 查詢
// ============================================================
// 用法：
//   node .context-db/scripts/review-db-writer.js --write-plan '{...}'
//   node .context-db/scripts/review-db-writer.js --read-plan <plan_id>
//   node .context-db/scripts/review-db-writer.js --write-report '{...}'
//   node .context-db/scripts/review-db-writer.js --write-finding '{...}'
//   node .context-db/scripts/review-db-writer.js --update-report <report_id> '{...}'
//   node .context-db/scripts/review-db-writer.js --update-finding <finding_id> '{...}'
//   node .context-db/scripts/review-db-writer.js --query-reports [--plan <plan_id>] [--module <code>] [--engine <engine>] [--status <status>]
//   node .context-db/scripts/review-db-writer.js --query-findings [--report <report_id>] [--severity <P0-P4>] [--fix-status <status>]
//   node .context-db/scripts/review-db-writer.js --stats [--plan <plan_id>]
//   node .context-db/scripts/review-db-writer.js --cross-compare <plan_id>
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

function parseJsonArg(arg) {
  if (arg.startsWith('{') || arg.startsWith('[')) return JSON.parse(arg);
  if (fs.existsSync(arg)) return JSON.parse(fs.readFileSync(arg, 'utf-8'));
  throw new Error(`無法解析 JSON: ${arg}`);
}

function nowTs() {
  // 使用台灣時間 (UTC+8) 而非 UTC
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace('T', ' ').split('.')[0];
}

// ──── 寫入審查計畫 ────
function writePlan(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO review_plans
    (plan_id, plan_date, status, total_modules, total_groups,
     modules_json, groups_json, risk_matrix_json, engine_assignment_json,
     created_by, updated_at)
    VALUES (@plan_id, @plan_date, @status, @total_modules, @total_groups,
     @modules_json, @groups_json, @risk_matrix_json, @engine_assignment_json,
     @created_by, @_nowTs)
  `);
  stmt.run({
    plan_id: data.plan_id,
    plan_date: data.plan_date || nowTs().split(' ')[0],
    status: data.status || 'active',
    total_modules: data.total_modules || 0,
    total_groups: data.total_groups || 0,
    modules_json: JSON.stringify(data.modules || []),
    groups_json: JSON.stringify(data.groups || []),
    risk_matrix_json: JSON.stringify(data.risk_matrix || []),
    engine_assignment_json: JSON.stringify(data.engine_assignment || []),
    created_by: data.created_by || 'CC-OPUS',
    _nowTs: nowTs(),
  });
  db.close();
  console.log(`✅ Plan 寫入成功: ${data.plan_id}`);
}

// ──── 讀取審查計畫（子視窗用） ────
function readPlan(planId) {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM review_plans WHERE plan_id = ?').get(planId);
  db.close();
  if (!plan) { console.error(`❌ Plan not found: ${planId}`); process.exit(1); }
  // 還原 JSON 欄位並移除原始字串（避免 PowerShell 5.1 解析巨型 JSON 失敗）
  plan.modules = JSON.parse(plan.modules_json || '[]');
  plan.groups = JSON.parse(plan.groups_json || '[]');
  plan.risk_matrix = JSON.parse(plan.risk_matrix_json || '[]');
  plan.engine_assignment = JSON.parse(plan.engine_assignment_json || '[]');
  delete plan.modules_json;
  delete plan.groups_json;
  delete plan.risk_matrix_json;
  delete plan.engine_assignment_json;
  console.log(JSON.stringify(plan, null, 2));
}

// ──── 寫入審查報告 ────
function writeReport(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO review_reports
    (report_id, plan_id, module_code, review_mode, engine, status,
     score_functional, score_data_consistency, score_authorization,
     score_billing, score_error_recovery, score_security,
     score_observability, score_uiux, score_total,
     bugs_p0, bugs_p1, bugs_p2, bugs_p3, bugs_p4, bugs_total,
     lifecycle_pass, lifecycle_warn, lifecycle_fail, lifecycle_skip,
     started_at, completed_at, report_path, created_at, updated_at)
    VALUES (@report_id, @plan_id, @module_code, @review_mode, @engine, @status,
     @score_functional, @score_data_consistency, @score_authorization,
     @score_billing, @score_error_recovery, @score_security,
     @score_observability, @score_uiux, @score_total,
     @bugs_p0, @bugs_p1, @bugs_p2, @bugs_p3, @bugs_p4, @bugs_total,
     @lifecycle_pass, @lifecycle_warn, @lifecycle_fail, @lifecycle_skip,
     @started_at, @completed_at, @report_path, @_nowTs, @_nowTs)
  `);
  stmt.run({
    report_id: data.report_id,
    plan_id: data.plan_id || null,
    module_code: data.module_code,
    review_mode: data.review_mode,
    engine: data.engine,
    status: data.status || 'completed',
    score_functional: data.score_functional || null,
    score_data_consistency: data.score_data_consistency || null,
    score_authorization: data.score_authorization || null,
    score_billing: data.score_billing || null,
    score_error_recovery: data.score_error_recovery || null,
    score_security: data.score_security || null,
    score_observability: data.score_observability || null,
    score_uiux: data.score_uiux || null,
    score_total: data.score_total || null,
    bugs_p0: data.bugs_p0 || 0,
    bugs_p1: data.bugs_p1 || 0,
    bugs_p2: data.bugs_p2 || 0,
    bugs_p3: data.bugs_p3 || 0,
    bugs_p4: data.bugs_p4 || 0,
    bugs_total: data.bugs_total || 0,
    lifecycle_pass: data.lifecycle_pass || 0,
    lifecycle_warn: data.lifecycle_warn || 0,
    lifecycle_fail: data.lifecycle_fail || 0,
    lifecycle_skip: data.lifecycle_skip || 0,
    started_at: data.started_at || null,
    completed_at: data.completed_at || nowTs(),
    report_path: data.report_path || null,
    _nowTs: nowTs(),
  });
  db.close();
  console.log(`✅ Report 寫入成功: ${data.report_id}`);
}

// ──── 寫入審查發現 ────
function writeFinding(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO review_findings
    (finding_id, report_id, module_code, severity, bug_type, dimension,
     title, description, file_path, line_number,
     root_cause, fix_suggestion, affected_files, regression_risk, suggested_story,
     engine, cross_confirmed, cross_engines,
     repro_steps, expected_result, actual_result,
     screenshot_before, screenshot_after, console_errors, network_issues,
     created_at, updated_at)
    VALUES (@finding_id, @report_id, @module_code, @severity, @bug_type, @dimension,
     @title, @description, @file_path, @line_number,
     @root_cause, @fix_suggestion, @affected_files, @regression_risk, @suggested_story,
     @engine, @cross_confirmed, @cross_engines,
     @repro_steps, @expected_result, @actual_result,
     @screenshot_before, @screenshot_after, @console_errors, @network_issues,
     @_nowTs, @_nowTs)
  `);
  stmt.run({
    finding_id: data.finding_id,
    report_id: data.report_id,
    module_code: data.module_code,
    severity: data.severity,
    bug_type: data.bug_type,
    dimension: data.dimension || null,
    title: data.title,
    description: data.description || null,
    file_path: data.file_path || null,
    line_number: data.line_number || null,
    root_cause: data.root_cause || null,
    fix_suggestion: data.fix_suggestion || null,
    affected_files: data.affected_files ? JSON.stringify(data.affected_files) : null,
    regression_risk: data.regression_risk || null,
    suggested_story: data.suggested_story || null,
    engine: data.engine,
    cross_confirmed: data.cross_confirmed || 0,
    cross_engines: data.cross_engines ? JSON.stringify(data.cross_engines) : null,
    repro_steps: data.repro_steps || null,
    expected_result: data.expected_result || null,
    actual_result: data.actual_result || null,
    screenshot_before: data.screenshot_before || null,
    screenshot_after: data.screenshot_after || null,
    console_errors: data.console_errors || null,
    network_issues: data.network_issues || null,
    _nowTs: nowTs(),
  });
  db.close();
  console.log(`✅ Finding 寫入成功: ${data.finding_id}`);
}

// ──── 更新報告（部分欄位） ────
function updateReport(reportId, updates) {
  const db = getDb();
  const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  updates.updated_at = nowTs();
  updates.report_id = reportId;
  const stmt = db.prepare(`UPDATE review_reports SET ${fields}, updated_at = @updated_at WHERE report_id = @report_id`);
  const result = stmt.run(updates);
  db.close();
  console.log(`✅ Report 更新成功: ${reportId} (${result.changes} rows)`);
}

// ──── 更新發現修復狀態 ────
function updateFinding(findingId, updates) {
  const db = getDb();
  const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  updates.updated_at = nowTs();
  updates.finding_id = findingId;
  const stmt = db.prepare(`UPDATE review_findings SET ${fields}, updated_at = @updated_at WHERE finding_id = @finding_id`);
  const result = stmt.run(updates);
  db.close();
  console.log(`✅ Finding 更新成功: ${findingId} (${result.changes} rows)`);
}

// ──── 查詢報告 ────
function queryReports(filters) {
  const db = getDb();
  let sql = 'SELECT * FROM review_reports WHERE 1=1';
  const params = {};
  if (filters.plan) { sql += ' AND plan_id = @plan'; params.plan = filters.plan; }
  if (filters.module) { sql += ' AND module_code = @module'; params.module = filters.module; }
  if (filters.engine) { sql += ' AND engine = @engine'; params.engine = filters.engine; }
  if (filters.status) { sql += ' AND status = @status'; params.status = filters.status; }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(params);
  db.close();
  console.log(JSON.stringify(rows, null, 2));
}

// ──── 查詢發現 ────
function queryFindings(filters) {
  const db = getDb();
  let sql = 'SELECT * FROM review_findings WHERE 1=1';
  const params = {};
  if (filters.report) { sql += ' AND report_id = @report'; params.report = filters.report; }
  if (filters.severity) { sql += ' AND severity = @severity'; params.severity = filters.severity; }
  if (filters['fix-status']) { sql += ' AND fix_status = @fix_status'; params.fix_status = filters['fix-status']; }
  if (filters.module) { sql += ' AND module_code = @module'; params.module = filters.module; }
  sql += ` ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END`;
  const rows = db.prepare(sql).all(params);
  db.close();
  console.log(JSON.stringify(rows, null, 2));
}

// ──── 統計 ────
function stats(planId) {
  const db = getDb();
  let planFilter = planId ? `AND plan_id = '${planId}'` : '';

  const reportStats = db.prepare(`
    SELECT
      COUNT(*) as total_reports,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      ROUND(AVG(score_total), 1) as avg_score,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter}) AND f.severity = 'P0') as total_p0,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter}) AND f.severity = 'P1') as total_p1,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter}) AND f.severity = 'P2') as total_p2,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter}) AND f.severity = 'P3') as total_p3,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter}) AND f.severity = 'P4') as total_p4,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter})) as total_bugs
    FROM review_reports WHERE 1=1 ${planFilter}
  `).get();

  const findingStats = db.prepare(`
    SELECT
      fix_status,
      COUNT(*) as count
    FROM review_findings
    ${planId ? `WHERE report_id IN (SELECT report_id FROM review_reports WHERE plan_id = '${planId}')` : ''}
    GROUP BY fix_status
  `).all();

  const moduleProgress = db.prepare(`
    SELECT
      module_code,
      GROUP_CONCAT(DISTINCT engine) as engines,
      GROUP_CONCAT(DISTINCT review_mode) as modes,
      COUNT(*) as report_count,
      (SELECT COUNT(*) FROM review_findings f WHERE f.module_code = r.module_code AND f.report_id IN (SELECT report_id FROM review_reports WHERE 1=1 ${planFilter})) as bugs,
      ROUND(AVG(score_total), 1) as avg_score
    FROM review_reports r WHERE r.status = 'completed' ${planFilter}
    GROUP BY module_code
    ORDER BY module_code
  `).all();

  db.close();
  console.log(JSON.stringify({ reportStats, findingStats, moduleProgress }, null, 2));
}

// ──── 多引擎交叉比對 ────
function crossCompare(planId) {
  const db = getDb();
  // 取得同一 plan 下所有 findings，按 file_path + line_number 或 title 匹配
  const findings = db.prepare(`
    SELECT f.*, r.review_mode
    FROM review_findings f
    JOIN review_reports r ON f.report_id = r.report_id
    WHERE r.plan_id = ?
    ORDER BY f.module_code, f.file_path, f.title
  `).all(planId);

  // 依 module + file_path + 相似 title 分組
  const groups = {};
  for (const f of findings) {
    const key = `${f.module_code}::${f.file_path || 'N/A'}::${f.title.substring(0, 50)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ finding_id: f.finding_id, engine: f.engine, severity: f.severity, title: f.title });
  }

  const crossResults = [];
  for (const [key, items] of Object.entries(groups)) {
    const engines = [...new Set(items.map(i => i.engine))];
    crossResults.push({
      key,
      engines,
      engine_count: engines.length,
      consensus: engines.length > 1,
      findings: items,
    });
  }

  // 更新 cross_confirmed 欄位
  for (const group of crossResults) {
    if (group.consensus) {
      for (const item of group.findings) {
        db.prepare(`UPDATE review_findings SET cross_confirmed = 1, cross_engines = ? WHERE finding_id = ?`)
          .run(JSON.stringify(group.engines), item.finding_id);
      }
    }
  }

  db.close();

  const summary = {
    total_unique_issues: crossResults.length,
    consensus_issues: crossResults.filter(g => g.consensus).length,
    single_engine_only: crossResults.filter(g => !g.consensus).length,
    by_engine: {},
  };

  for (const f of findings) {
    summary.by_engine[f.engine] = (summary.by_engine[f.engine] || 0) + 1;
  }

  console.log(JSON.stringify({ summary, crossResults }, null, 2));
}

// ──── CLI 路由 ────
const args = process.argv.slice(2);
const cmd = args[0];

try {
  switch (cmd) {
    case '--write-plan':    writePlan(parseJsonArg(args[1])); break;
    case '--read-plan':     readPlan(args[1]); break;
    case '--write-report':  writeReport(parseJsonArg(args[1])); break;
    case '--write-finding': writeFinding(parseJsonArg(args[1])); break;
    case '--update-report': updateReport(args[1], parseJsonArg(args[2])); break;
    case '--update-finding': updateFinding(args[1], parseJsonArg(args[2])); break;
    case '--query-reports': {
      const filters = {};
      for (let i = 1; i < args.length; i += 2) filters[args[i].replace('--', '')] = args[i + 1];
      queryReports(filters); break;
    }
    case '--query-findings': {
      const filters = {};
      for (let i = 1; i < args.length; i += 2) filters[args[i].replace('--', '')] = args[i + 1];
      queryFindings(filters); break;
    }
    case '--stats':   stats(args.includes('--plan') ? args[args.indexOf('--plan') + 1] : null); break;
    case '--cross-compare': crossCompare(args[1]); break;
    default:
      console.log(`用法:
  --write-plan <json>        寫入審查計畫
  --read-plan <plan_id>      讀取審查計畫（子視窗用）
  --write-report <json>      寫入審查報告
  --write-finding <json>     寫入審查發現
  --update-report <id> <json> 更新報告（人工審查/修復進度）
  --update-finding <id> <json> 更新發現修復狀態
  --query-reports [filters]  查詢報告
  --query-findings [filters] 查詢發現
  --stats [--plan <id>]      統計摘要
  --cross-compare <plan_id>  多引擎交叉比對`);
  }
} catch (e) {
  console.error(`❌ 錯誤: ${e.message}`);
  process.exit(1);
}
