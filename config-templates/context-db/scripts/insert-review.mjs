import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const reportPath = process.argv[2];
const findingsPath = process.argv[3];


const r = JSON.parse(readFileSync(reportPath, 'utf-8'));
const nowTs = () => {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace('T', ' ').split('.')[0];
};
db.prepare(`
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
`).run({
  report_id: r.report_id, plan_id: r.plan_id || null,
  module_code: r.module_code, review_mode: r.review_mode, engine: r.engine,
  status: r.status || 'completed',
  score_functional: r.score_functional ?? null, score_data_consistency: r.score_data_consistency ?? null,
  score_authorization: r.score_authorization ?? null, score_billing: r.score_billing ?? null,
  score_error_recovery: r.score_error_recovery ?? null, score_security: r.score_security ?? null,
  score_observability: r.score_observability ?? null, score_uiux: r.score_uiux ?? null,
  score_total: r.score_total ?? null,
  bugs_p0: r.bugs_p0 || 0, bugs_p1: r.bugs_p1 || 0, bugs_p2: r.bugs_p2 || 0,
  bugs_p3: r.bugs_p3 || 0, bugs_p4: r.bugs_p4 || 0, bugs_total: r.bugs_total || 0,
  lifecycle_pass: r.lifecycle_pass || 0, lifecycle_warn: r.lifecycle_warn || 0,
  lifecycle_fail: r.lifecycle_fail || 0, lifecycle_skip: r.lifecycle_skip || 0,
  started_at: r.started_at || null, completed_at: r.completed_at || nowTs(),
  report_path: r.report_path || null,
  _nowTs: nowTs(),
});
console.log(`✅ Report: ${r.report_id}`);

const findings = JSON.parse(readFileSync(findingsPath, 'utf-8'));
const findingStmt = db.prepare(`
  INSERT OR REPLACE INTO review_findings
  (finding_id, report_id, module_code, severity, bug_type, dimension,
   title, description, file_path, line_number,
   root_cause, fix_suggestion, affected_files, regression_risk, suggested_story,
   engine, cross_confirmed, cross_engines,
   repro_steps, expected_result, actual_result,
   screenshot_before, screenshot_after, console_errors, network_issues, created_at, updated_at)
  VALUES (@finding_id, @report_id, @module_code, @severity, @bug_type, @dimension,
   @title, @description, @file_path, @line_number,
   @root_cause, @fix_suggestion, @affected_files, @regression_risk, @suggested_story,
   @engine, @cross_confirmed, @cross_engines,
   @repro_steps, @expected_result, @actual_result,
   @screenshot_before, @screenshot_after, @console_errors, @network_issues, @_nowTs, @_nowTs)
`);

for (const f of findings) {
  findingStmt.run({
    finding_id: f.finding_id, report_id: f.report_id, module_code: f.module_code, severity: f.severity, bug_type: f.bug_type, dimension: f.dimension || null, title: f.title, description: f.description || null, file_path: f.file_path || null, line_number: f.line_number || null, root_cause: f.root_cause || null, fix_suggestion: f.fix_suggestion || null, affected_files: f.affected_files ? JSON.stringify(f.affected_files) : null, regression_risk: f.regression_risk || null, suggested_story: f.suggested_story || null, engine: f.engine, cross_confirmed: f.cross_confirmed || 0, cross_engines: f.cross_engines ? JSON.stringify(f.cross_engines) : null, repro_steps: f.repro_steps || null, expected_result: f.expected_result || null, actual_result: f.actual_result || null, screenshot_before: f.screenshot_before || null, screenshot_after: f.screenshot_after || null, console_errors: f.console_errors || null, network_issues: f.network_issues || null, _nowTs: nowTs(),
  });
  console.log(`✅ Finding: ${f.finding_id}`);
}
db.close();
console.log('Done!');
