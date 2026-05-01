// ============================================================
// PCPT Context Memory DB — CR Issue 全量 ETL 匯入
// CMI-2 AC-5: 解析 CR Markdown → cr_issues 表
// ============================================================
// 執行方式: node .context-db/scripts/import-cr-issues.js [--full|--incremental]
// 零 Token：純 Node.js 腳本，不使用 Claude API
// 依賴：須先執行 import-cr-reports.js（需要 cr_report_id FK）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const REVIEWS_BASE = path.join(__dirname, '..', '..', 'docs', 'implementation-artifacts', 'reviews');

// ──────────────────────────────────────────────
// 從檔名推斷 story_id（同 import-cr-reports.js 邏輯）
// ──────────────────────────────────────────────
function storyIdFromFilename(filename) {
  return filename.replace(/\.md$/, '')
    .replace(/-code-review-r\d+-report$/i, '')
    .replace(/-code-review-report$/i, '')
    .replace(/-re-review-report$/i, '')
    .replace(/-final-code-review-report$/i, '')
    .replace(/-code-review-report-2nd$/i, '')
    .replace(/-review-report$/i, '');
}

// ──────────────────────────────────────────────
// 解析 Issue（支援 v1 和 v2 格式）
// ──────────────────────────────────────────────
function parseCrIssues(filePath, reportIdMap) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);
  const storyId = storyIdFromFilename(filename);

  // 查找對應的 cr_report_id
  const sourceFile = path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');
  const crReportId = reportIdMap.get(sourceFile) || null;

  const issues = [];

  // ── v2 格式：### [SEVERITY][Dimension] CODE: summary ──
  const v2Pattern = /###\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*\[([^\]]+)\]\s*(\w+)[:：]\s*(.+)/g;
  let match;
  while ((match = v2Pattern.exec(content)) !== null) {
    const severity = match[1];
    const dimension = match[2];
    const issueCode = match[3];
    const summary = match[4].trim();

    // 從 issue 區塊萃取 resolution 和 file_path
    const blockStart = match.index;
    const nextIssue = content.indexOf('\n### ', blockStart + 1);
    const block = content.substring(blockStart, nextIssue > 0 ? nextIssue : blockStart + 2000);

    const resolution = extractResolution(block);
    const affectedFile = extractFilePath(block);
    const targetStory = extractTargetStory(block);

    issues.push({
      cr_report_id: crReportId,
      story_id: storyId,
      issue_code: issueCode,
      severity,
      dimension,
      summary,
      resolution,
      target_story: targetStory,
      file_path: affectedFile,
      created_at: new Date().toISOString(),
    });
  }

  // ── v1 格式：#### H1: summary（在 ### 高優先問題 等區塊下）──
  if (issues.length === 0) {
    const v1Pattern = /####\s*([A-Z]\d+)[:：]\s*(.+)/g;
    while ((match = v1Pattern.exec(content)) !== null) {
      const issueCode = match[1];
      const summary = match[2].trim();

      // 從區塊上下文推斷 severity
      const beforeMatch = content.substring(Math.max(0, match.index - 500), match.index);
      let severity = 'MEDIUM';
      if (beforeMatch.match(/嚴重.*?CRITICAL/i) || beforeMatch.match(/### (?:嚴重|Critical)/i)) severity = 'CRITICAL';
      else if (beforeMatch.match(/高.*?HIGH/i) || beforeMatch.match(/### (?:高|High)/i)) severity = 'HIGH';
      else if (beforeMatch.match(/低.*?LOW/i) || beforeMatch.match(/### (?:低|Low)/i)) severity = 'LOW';
      else if (beforeMatch.match(/中.*?MEDIUM/i) || beforeMatch.match(/### (?:中|Medium)/i)) severity = 'MEDIUM';

      // 從 code 首字母推斷 severity
      if (issueCode.startsWith('C')) severity = 'CRITICAL';
      else if (issueCode.startsWith('H')) severity = 'HIGH';
      else if (issueCode.startsWith('M')) severity = 'MEDIUM';
      else if (issueCode.startsWith('L')) severity = 'LOW';

      const blockStart = match.index;
      const nextIssue = content.indexOf('\n####', blockStart + 1);
      const nextSection = content.indexOf('\n### ', blockStart + 1);
      const blockEnd = Math.min(
        nextIssue > 0 ? nextIssue : Infinity,
        nextSection > 0 ? nextSection : Infinity,
        blockStart + 2000
      );
      const block = content.substring(blockStart, blockEnd);

      const resolution = extractResolution(block);
      const dimension = extractDimension(block);
      const affectedFile = extractFilePath(block);
      const targetStory = extractTargetStory(block);

      issues.push({
        cr_report_id: crReportId,
        story_id: storyId,
        issue_code: issueCode,
        severity,
        dimension,
        summary,
        resolution,
        target_story: targetStory,
        file_path: affectedFile,
        created_at: new Date().toISOString(),
      });
    }
  }

  // ── 補充：SaaS 維度分析表格格式 ──
  if (issues.length === 0) {
    const tablePattern = /\|\s*(\w+)\s*\|\s*(.+?)\s*\|\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*\|\s*(.+?)\s*\|/g;
    while ((match = tablePattern.exec(content)) !== null) {
      const dimension = match[1];
      const summary = match[2].trim();
      const severity = match[3];
      const statusText = match[4].trim();

      if (summary === '—' || summary.includes('無問題')) continue;

      const resolution = statusText.includes('Fixed') ? 'FIXED'
        : statusText.includes('Pass') ? 'PASS'
        : statusText.includes('Deferred') ? 'DEFERRED'
        : 'UNKNOWN';

      issues.push({
        cr_report_id: crReportId,
        story_id: storyId,
        issue_code: `${severity.charAt(0)}${issues.length + 1}`,
        severity,
        dimension,
        summary,
        resolution,
        target_story: null,
        file_path: null,
        created_at: new Date().toISOString(),
      });
    }
  }

  return issues;
}

function extractResolution(block) {
  if (block.match(/✅\s*Fix/i) || block.match(/已修復/)) return 'FIXED';
  if (block.match(/DEFERRED/i) || block.match(/延後/)) return 'DEFERRED';
  if (block.match(/WON'?T\s*FIX/i)) return 'WONT_FIX';
  if (block.match(/處理結果.*?已修復/)) return 'FIXED';
  if (block.match(/處理.*?FIXED/i)) return 'FIXED';
  return 'UNKNOWN'; // 無法判斷時標記為 UNKNOWN，避免虛增 FIXED 數量
}

function extractDimension(block) {
  const m = block.match(/維度[:：]\s*(\w+)/);
  return m ? m[1] : null;
}

function extractFilePath(block) {
  const m = block.match(/(?:檔案|影響檔案|file)[:：]?\s*`([^`]+)`/i)
    || block.match(/\*\*檔案[:：]?\*\*\s*`([^`]+)`/i);
  return m ? m[1] : null;
}

function extractTargetStory(block) {
  const m = block.match(/(?:延後目標|target.*?story)[:：]?\s*(\S+)/i);
  if (m && m[1] !== '無' && m[1] !== '—') return m[1];
  return null;
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function importCrIssues() {
  const mode = process.argv.includes('--full') ? 'full' : 'incremental';
  console.log(`🔍 CR Issue ETL 匯入開始 (模式: ${mode})`);
  console.log(`   DB: ${DB_PATH}`);
  console.log('');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  if (mode === 'full') {
    db.exec('DELETE FROM cr_issues');
    console.log('[0] 全量模式：已清空 cr_issues 表');
  }

  // 建立 source_file → cr_report_id 映射
  const reportIdMap = new Map();
  const reports = db.prepare('SELECT id, source_file FROM cr_reports').all();
  for (const r of reports) {
    reportIdMap.set(r.source_file, r.id);
  }
  console.log(`[1] 載入 ${reportIdMap.size} 份 CR Report 的 ID 映射`);

  // 掃描所有 CR 文件
  let epicDirs = [];
  if (fs.existsSync(REVIEWS_BASE)) {
    epicDirs = fs.readdirSync(REVIEWS_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('epic-'))
      .map(d => d.name);
  }

  const insert = db.prepare(`
    INSERT INTO cr_issues
      (cr_report_id, story_id, issue_code, severity, dimension,
       summary, resolution, target_story, file_path, created_at)
    VALUES
      (@cr_report_id, @story_id, @issue_code, @severity, @dimension,
       @summary, @resolution, @target_story, @file_path, @created_at)
  `);

  let totalImported = 0;
  let totalErrors = 0;
  const severityCounts = {};

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  for (const epicDir of epicDirs) {
    const epicPath = path.join(REVIEWS_BASE, epicDir);
    const files = fs.readdirSync(epicPath)
      .filter(f => f.endsWith('.md') && !f.startsWith('README'));

    let epicIssueCount = 0;
    for (const file of files) {
      try {
        const issues = parseCrIssues(path.join(epicPath, file), reportIdMap);
        if (issues.length > 0) {
          insertMany(issues);
          totalImported += issues.length;
          epicIssueCount += issues.length;
          for (const issue of issues) {
            severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
          }
        }
      } catch (err) {
        console.error(`   ⚠️ 解析錯誤 ${epicDir}/${file}: ${err.message}`);
        totalErrors++;
      }
    }
    if (epicIssueCount > 0) {
      console.log(`   ${epicDir}: ${epicIssueCount} 筆 Issue 匯入`);
    }
  }

  // 掃描 root-level review 檔案（不在 epic-* 子目錄內的 CR 報告）
  if (fs.existsSync(REVIEWS_BASE)) {
    const rootFiles = fs.readdirSync(REVIEWS_BASE)
      .filter(f => f.endsWith('.md') && !f.startsWith('README'));
    let rootIssueCount = 0;
    for (const file of rootFiles) {
      const fullPath = path.join(REVIEWS_BASE, file);
      if (!fs.statSync(fullPath).isFile()) continue;
      try {
        const issues = parseCrIssues(fullPath, reportIdMap);
        if (issues.length > 0) {
          insertMany(issues);
          totalImported += issues.length;
          rootIssueCount += issues.length;
          for (const issue of issues) {
            severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
          }
        }
      } catch (err) {
        console.error(`   ⚠️ 解析錯誤 (root) ${file}: ${err.message}`);
        totalErrors++;
      }
    }
    if (rootIssueCount > 0) {
      console.log(`   (root): ${rootIssueCount} 筆 Issue 匯入`);
    }
  }

  // 統計
  const total = db.prepare('SELECT COUNT(*) as count FROM cr_issues').get();
  const resolutionGroups = db.prepare(
    'SELECT resolution, COUNT(*) as count FROM cr_issues GROUP BY resolution ORDER BY count DESC'
  ).all();

  console.log('');
  console.log('✅ CR Issue ETL 完成');
  console.log(`   匯入: ${totalImported} 筆 | 錯誤: ${totalErrors}`);
  console.log(`   cr_issues 表總計: ${total.count} 筆`);
  console.log('   嚴重度分佈:');
  for (const [sev, count] of Object.entries(severityCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${sev}: ${count}`);
  }
  console.log('   處理狀態分佈:');
  for (const g of resolutionGroups) {
    console.log(`     ${g.resolution}: ${g.count}`);
  }

  db.close();
}

try {
  importCrIssues();
} catch (err) {
  console.error('❌ CR Issue ETL 失敗:', err.message);
  process.exit(1);
}
