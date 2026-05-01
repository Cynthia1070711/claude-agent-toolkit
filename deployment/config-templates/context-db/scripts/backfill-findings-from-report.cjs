#!/usr/bin/env node
/**
 * backfill-findings-from-report.cjs
 * 從 Markdown 審查報告解析 Bug 區塊，回填至 review_findings 表
 *
 * Usage:
 *   # 單檔模式
 *   node backfill-findings-from-report.cjs <report.md> <report_id>
 *
 *   # 批次模式（自動掃描 + 映射）
 *   node backfill-findings-from-report.cjs --batch --dry-run
 *   node backfill-findings-from-report.cjs --batch --apply
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const REVIEW_DIR = path.join(__dirname, '..', '..', 'docs', 'implementation-artifacts', 'reports', 'review');

function nowTs() {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace('T', ' ').split('.')[0];
}

// ──── Markdown Bug 解析器 ────

function parseBugsFromMarkdown(content, reportId, moduleCode, engine) {
  const bugs = [];

  // 分割成 Bug 區塊：匹配 ### BUG-NNN / ### SEC-NN / ### BUG-GNNN / ### BUG-ANNN / ### P{0-4} ...
  const bugPattern = /^### +(BUG-[\w-]+|SEC-\d+|P[0-4] \w+):\s*(.+)$/gm;
  const matches = [];
  let m;
  while ((m = bugPattern.exec(content)) !== null) {
    matches.push({ index: m.index, id: m[1], title: m[2].trim(), fullMatch: m[0] });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const block = content.substring(start, end);

    const rawId = matches[i].id;
    const title = matches[i].title;

    // 生成唯一 finding_id：report_id + bug序號
    const seqNum = String(i + 1).padStart(3, '0');
    const findingId = `${reportId}-${rawId}`.replace(/\s+/g, '-');

    // 解析嚴重度
    const severityMatch = block.match(/\*\*嚴重度\*\*:\s*P([0-4])/);
    const severity = severityMatch ? `P${severityMatch[1]}` : 'P3';

    // 解析 Bug 類型
    const typeMatch = block.match(/\*\*類型\*\*:\s*(.+)/);
    const owaspMatch = block.match(/\*\*OWASP 類別\*\*:\s*(.+)/);
    const bugType = (typeMatch ? typeMatch[1].trim() : (owaspMatch ? owaspMatch[1].trim() : 'Unknown'));

    // 解析檔案位置（取第一個）
    const fileMatch = block.match(/\*\*檔案位置\*\*:?\s*\n?-?\s*`?([^`\n]+?)(?::(\d+))?`?\s*$/m)
      || block.match(/`([^`]+?\.(?:cs|ts|tsx|js|jsx|cshtml|json|css|md)):?(\d+)?`/);
    const filePath = fileMatch ? fileMatch[1].trim() : null;
    const lineNumber = fileMatch && fileMatch[2] ? parseInt(fileMatch[2]) : null;

    // 解析問題描述
    const description = extractSection(block, '問題描述');

    // 解析根因分析
    const rootCause = extractSection(block, '根因分析');

    // 解析修復建議
    const fixSuggestion = extractSection(block, '修復建議');

    // 解析迴歸風險
    const regressionMatch = block.match(/迴歸風險:\s*(.+)/);
    const regressionRisk = regressionMatch ? regressionMatch[1].trim() : null;

    // 解析建議 Story
    const storyMatch = block.match(/建議 Story:\s*(.+)/);
    const suggestedStory = storyMatch && !storyMatch[1].includes('N/A') ? storyMatch[1].trim() : null;

    // 解析重現步驟（E2E）
    const reproSteps = extractSection(block, '重現步驟');

    // 解析攻擊向量（Security）
    const attackMatch = block.match(/\*\*攻擊向量\*\*:\s*(.+)/);

    // 解析 SaaS 維度
    const dimensionMatch = block.match(/\*\*SaaS 維度\*\*:\s*(.+)/);
    const dimension = dimensionMatch ? dimensionMatch[1].trim() : null;

    // 解析影響檔案
    const affectedMatch = block.match(/影響檔案:\s*(.+)/);
    const affectedFiles = affectedMatch ? affectedMatch[1].trim() : null;

    bugs.push({
      finding_id: findingId,
      report_id: reportId,
      module_code: moduleCode,
      severity,
      bug_type: bugType,
      dimension,
      title,
      description: description || (attackMatch ? attackMatch[1].trim() : null),
      file_path: filePath,
      line_number: lineNumber,
      root_cause: rootCause,
      fix_suggestion: fixSuggestion,
      affected_files: affectedFiles,
      regression_risk: regressionRisk,
      suggested_story: suggestedStory,
      engine: engine || 'cc-opus',
      repro_steps: reproSteps,
    });
  }

  return bugs;
}

function extractSection(block, sectionName) {
  // 匹配 **sectionName**: 或 **sectionName**:\n 後的內容，直到下一個 ** 欄位或 ### 或 ---
  const pattern = new RegExp(
    `\\*\\*${sectionName}\\*\\*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\*\\*[^*]|\\n###|\\n---|$)`,
    'i'
  );
  const match = block.match(pattern);
  if (!match) return null;

  let text = match[1].trim();
  // 移除 markdown code block
  text = text.replace(/```[\s\S]*?```/g, '[code block]');
  // 截斷過長文字
  if (text.length > 2000) text = text.substring(0, 2000) + '...';
  return text || null;
}

// ──── Report ID ↔ 檔案路徑映射 ────

function buildReportFileMap() {
  const map = {};
  const subdirs = ['code', 'e2e', 'security'];

  for (const subdir of subdirs) {
    const dir = path.join(REVIEW_DIR, subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      // 從檔案內容讀取 Report ID
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ridMatch = content.match(/\*\*Report ID\*\*:\s*(REV-[\w-]+)/);
      if (ridMatch) {
        map[ridMatch[1]] = { path: fullPath, relPath: `docs/implementation-artifacts/reports/review/${subdir}/${file}` };
        continue;
      }

      // 嘗試從檔名推斷 report_id
      const inferredId = inferReportId(file, subdir);
      if (inferredId) {
        map[inferredId] = { path: fullPath, relPath: `docs/implementation-artifacts/reports/review/${subdir}/${file}` };
      }
    }
  }

  return map;
}

function inferReportId(filename, subdir) {
  // 2026-03-22-datasource-code-review-cc.md → REV-2026-03-22-datasource-code-cc-opus
  // 2026-03-15-admin-auth-code-review-gemini.md → REV-2026-03-15-admin-auth (gemini format)
  // 2026-03-15-auth-code-review-ag.md → REV-2026-03-15-auth-code-antigravity
  // 2026-03-22-auth-security-audit-cc.md → REV-2026-03-22-auth-security-cc-opus
  // 2026-03-15-admin-auth-e2e-review-cc.md → REV-2026-03-15-admin-auth-e2e-cc-opus

  const base = filename.replace('.md', '');
  const dateMatch = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)/);
  if (!dateMatch) return null;

  const date = dateMatch[1];
  let rest = dateMatch[2];

  if (rest.endsWith('-code-review-cc')) {
    const module = rest.replace('-code-review-cc', '');
    return `REV-${date}-${module}-code-cc-opus`;
  }
  if (rest.endsWith('-code-review-gemini')) {
    const module = rest.replace('-code-review-gemini', '');
    return `REV-${date}-${module}`;
  }
  if (rest.endsWith('-code-review-ag')) {
    const module = rest.replace('-code-review-ag', '');
    return `REV-${date}-${module}-code-antigravity`;
  }
  if (rest.endsWith('-security-audit-cc')) {
    const module = rest.replace('-security-audit-cc', '');
    return `REV-${date}-${module}-security-cc-opus`;
  }
  if (rest.endsWith('-e2e-review-cc')) {
    const module = rest.replace('-e2e-review-cc', '');
    return `REV-${date}-${module}-e2e-cc-opus`;
  }

  return null;
}

function inferEngine(reportId) {
  if (reportId.includes('antigravity')) return 'antigravity';
  if (reportId.includes('cc-opus') || reportId.includes('CC-OPUS')) return 'cc-opus';
  // Gemini reports: REV-2026-03-15-admin-auth (no engine suffix)
  return 'gemini';
}

function inferModuleCode(reportId) {
  // REV-2026-03-22-admin-auth-code-cc-opus → admin-auth
  // REV-2026-03-15-admin-auth → admin-auth
  const parts = reportId.replace(/^REV-\d{4}-\d{2}-\d{2}-/, '');
  // Remove mode and engine suffixes
  return parts
    .replace(/-(code|e2e|security|nfr)-(cc-opus|antigravity|gemini|CC-OPUS)$/, '')
    .replace(/-(code|e2e|security|nfr)$/, '');
}

// ──── DB 寫入 ────

function writeFindings(db, bugs, dryRun) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO review_findings
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
     @engine, 0, NULL,
     @repro_steps, NULL, NULL,
     NULL, NULL, NULL, NULL,
     @_nowTs, @_nowTs)
  `);

  let inserted = 0;
  const ts = nowTs();

  for (const bug of bugs) {
    if (dryRun) {
      console.log(`  [DRY] ${bug.finding_id} | ${bug.severity} | ${bug.title.substring(0, 60)}`);
      inserted++;
      continue;
    }
    const result = stmt.run({
      ...bug,
      _nowTs: ts,
    });
    if (result.changes > 0) {
      inserted++;
    }
  }

  return inserted;
}

// ──── 單檔模式 ────

function processSingleFile(reportPath, reportId) {
  if (!fs.existsSync(reportPath)) {
    console.error(`File not found: ${reportPath}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const content = fs.readFileSync(reportPath, 'utf-8');
  const engine = inferEngine(reportId);
  const moduleCode = inferModuleCode(reportId);

  const bugs = parseBugsFromMarkdown(content, reportId, moduleCode, engine);
  console.log(`Parsed ${bugs.length} bugs from ${path.basename(reportPath)}`);

  if (bugs.length > 0) {
    const inserted = writeFindings(db, bugs, false);
    console.log(`Inserted ${inserted} new findings (${bugs.length - inserted} already existed)`);

    // 同步 bugs_total/bugs_pN，確保 review_reports 與 review_findings 一致
    if (inserted > 0) {
      const syncResult = db.prepare(`
        UPDATE review_reports SET
          bugs_total = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id),
          bugs_p0 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P0'),
          bugs_p1 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P1'),
          bugs_p2 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P2'),
          bugs_p3 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P3'),
          bugs_p4 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P4'),
          updated_at = ?
        WHERE report_id = ?
      `).run(nowTs(), reportId);
      if (syncResult.changes > 0) console.log(`Synced bugs_total for ${reportId}`);
    }
  }

  // 更新 report_path
  const report = db.prepare('SELECT report_path FROM review_reports WHERE report_id = ?').get(reportId);
  if (report && !report.report_path) {
    const relPath = path.relative(
      path.join(__dirname, '..', '..'),
      reportPath
    ).replace(/\\/g, '/');
    db.prepare('UPDATE review_reports SET report_path = ?, updated_at = ? WHERE report_id = ?')
      .run(relPath, nowTs(), reportId);
    console.log(`Updated report_path: ${relPath}`);
  }

  db.close();
}

// ──── 批次模式 ────

function processBatch(dryRun) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // 取得所有有 Bug 但 findings 不足的報告
  const reports = db.prepare(`
    SELECT r.report_id, r.bugs_total, r.report_path, r.module_code, r.review_mode, r.engine,
      (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id) as actual_findings
    FROM review_reports r
    WHERE r.bugs_total > 0
    AND (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = r.report_id) < r.bugs_total
    ORDER BY r.created_at DESC
  `).all();

  console.log(`\n=== Batch Backfill ${dryRun ? '(DRY RUN)' : '(APPLY)'} ===`);
  console.log(`Reports needing backfill: ${reports.length}\n`);

  // 建立檔案映射
  const fileMap = buildReportFileMap();
  console.log(`File map entries: ${Object.keys(fileMap).length}\n`);

  let totalParsed = 0;
  let totalInserted = 0;
  let noFileCount = 0;
  let noBugsCount = 0;

  for (const report of reports) {
    const fileInfo = fileMap[report.report_id];
    let filePath = null;
    let relPath = null;

    if (fileInfo) {
      filePath = fileInfo.path;
      relPath = fileInfo.relPath;
    } else if (report.report_path) {
      filePath = path.join(__dirname, '..', '..', report.report_path);
      relPath = report.report_path;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      noFileCount++;
      if (!dryRun) {
        // 嘗試 glob fallback
        const guessedPath = guessFilePath(report);
        if (guessedPath) {
          filePath = guessedPath.full;
          relPath = guessedPath.rel;
        } else {
          continue;
        }
      } else {
        console.log(`  [SKIP] ${report.report_id} — no file found`);
        continue;
      }
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const bugs = parseBugsFromMarkdown(content, report.report_id, report.module_code, report.engine);

    if (bugs.length === 0) {
      noBugsCount++;
      continue;
    }

    console.log(`\n[${report.report_id}] parsed=${bugs.length} existing=${report.actual_findings} expected=${report.bugs_total}`);
    const inserted = writeFindings(db, bugs, dryRun);
    totalParsed += bugs.length;
    totalInserted += inserted;

    // 更新 report_path
    if (!dryRun && relPath && !report.report_path) {
      db.prepare('UPDATE review_reports SET report_path = ?, updated_at = ? WHERE report_id = ?')
        .run(relPath, nowTs(), report.report_id);
    }
  }

  // 回填後同步 bugs_total/bugs_pN，確保 review_reports 與 review_findings 一致
  if (!dryRun && totalInserted > 0) {
    const syncStmt = db.prepare(`
      UPDATE review_reports SET
        bugs_total = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id),
        bugs_p0 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P0'),
        bugs_p1 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P1'),
        bugs_p2 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P2'),
        bugs_p3 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P3'),
        bugs_p4 = (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id AND f.severity = 'P4'),
        updated_at = ?
      WHERE bugs_total != (SELECT COUNT(*) FROM review_findings f WHERE f.report_id = review_reports.report_id)
    `);
    const syncResult = syncStmt.run(nowTs());
    console.log(`\nSynced bugs_total for ${syncResult.changes} reports.`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Reports processed: ${reports.length - noFileCount - noBugsCount}`);
  console.log(`No file found: ${noFileCount}`);
  console.log(`No bugs parsed: ${noBugsCount}`);
  console.log(`Total bugs parsed: ${totalParsed}`);
  console.log(`Total inserted: ${totalInserted}`);
  if (dryRun) console.log(`\nUse --apply to write to DB.`);

  db.close();
}

function guessFilePath(report) {
  const { report_id, module_code, review_mode } = report;
  const dateMatch = report_id.match(/REV-(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const date = dateMatch[1];

  const suffixMap = {
    'code': { dir: 'code', patterns: [`${date}-${module_code}-code-review-cc.md`] },
    'security': { dir: 'security', patterns: [`${date}-${module_code}-security-audit-cc.md`] },
    'e2e': { dir: 'e2e', patterns: [`${date}-${module_code}-e2e-review-cc.md`] },
  };

  const config = suffixMap[review_mode];
  if (!config) return null;

  for (const pattern of config.patterns) {
    const full = path.join(REVIEW_DIR, config.dir, pattern);
    if (fs.existsSync(full)) {
      return { full, rel: `docs/implementation-artifacts/reports/review/${config.dir}/${pattern}` };
    }
  }

  // Glob fallback: search for any file matching module + date
  const dir = path.join(REVIEW_DIR, config.dir);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.includes(date) && f.includes(module_code) && f.endsWith('.md'));
  if (files.length > 0) {
    const file = files[0];
    return { full: path.join(dir, file), rel: `docs/implementation-artifacts/reports/review/${config.dir}/${file}` };
  }

  return null;
}

// ──── CLI ────

const args = process.argv.slice(2);

if (args.includes('--batch')) {
  const dryRun = !args.includes('--apply');
  processBatch(dryRun);
} else if (args.length >= 2) {
  const [reportPath, reportId] = args;
  processSingleFile(reportPath, reportId);
} else {
  console.log(`Usage:
  node backfill-findings-from-report.cjs <report.md> <report_id>    # 單檔
  node backfill-findings-from-report.cjs --batch --dry-run          # 批次預覽
  node backfill-findings-from-report.cjs --batch --apply            # 批次寫入`);
}
