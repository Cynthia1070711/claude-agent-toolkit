// ============================================================
// PCPT Context Memory DB — CR Report 全量 ETL 匯入
// CMI-2 AC-4: 解析 CR Markdown → cr_reports 表
// ============================================================
// 執行方式: node .context-db/scripts/import-cr-reports.js [--full|--incremental]
// 零 Token：純 Node.js 腳本，不使用 Claude API
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
// story_id / round 推斷
// ──────────────────────────────────────────────

/** 從檔名推斷 story_id（fallback） */
function storyIdFromFilename(filename) {
  const base = filename.replace(/\.md$/, '')
    .replace(/-code-review-r\d+-report$/i, '')
    .replace(/-code-review-report$/i, '')
    .replace(/-code-review-output$/i, '')
    .replace(/-re-review-report$/i, '')
    .replace(/-final-code-review-report$/i, '')
    .replace(/-review-report$/i, '')
    .replace(/-review$/i, '');

  // qgr-a2, qgr-ba-12, qgr-a10-4
  const qgrM = base.match(/^(qgr-[a-z]{1,2}\d*(?:-\d+)*)/i);
  if (qgrM) return qgrM[1].toLowerCase();

  // cmi-1, trs-35, opt-001, td-32, uds-1, pi-1, bf-3, rwd-1, ds-1, ux-5
  const alphaM = base.match(/^([a-z]{1,5}-\d+(?:-\d+)*)/i);
  if (alphaM) {
    const id = alphaM[1].toLowerCase();
    if (!id.startsWith('epic-')) return id;
  }

  // 1-1, 5-9, 7-3  (purely numeric epics)
  const numM = base.match(/^(\d+-\d+)/);
  if (numM) return numM[1];

  // epic-4-batch, epic-1-4
  const epicM = base.match(/^(epic-[\w-]+)/i);
  if (epicM) return epicM[1].toLowerCase();

  return base;
}

/** 從報告內容推斷 story_id（優先） */
function storyIdFromContent(content) {
  // **Story ID**: 5-9-admin-dashboard
  let m = content.match(/\*\*Story\s*ID\*\*\s*[:：]\s*([\w-]+)/i);
  if (m) return m[1].trim();

  // H1: # Code Review Report: QGR-A2 xxx
  m = content.match(/^#[^\n]*?\b(QGR-[\w-]+)/im);
  if (m) return m[1].toLowerCase();

  // H1: # Code Review Report: Story 5.9 or Story 5.3
  m = content.match(/^#[^\n]*?Story\s+(\d+)[.\-](\d+)/im);
  if (m) return `${m[1]}-${m[2]}`;

  // H1: # Code Review Report: DS-1 xxx
  m = content.match(/^#[^\n]*?\b([A-Z]{1,5}-\d+(?:-\d+)*)\b/im);
  if (m) {
    const id = m[1].toLowerCase();
    if (!id.startsWith('epic-')) return id;
  }

  // H1: # Code Review Report: 7-3-seo-code-injection
  m = content.match(/^#\s*Code Review Report\s*[:：]\s*([\w-]+)/im);
  if (m && !/^story$/i.test(m[1])) return m[1].toLowerCase();

  // Story link: **Story:** [text](path/1-1-xxx.md)
  m = content.match(/\*\*Story\s*[:：]\*\*\s*\[.*?\]\([^)]*\/([\w-]+)\.md\)/i);
  if (m) {
    const linkId = m[1];
    const sm = linkId.match(/^(\d+-\d+)|^(qgr-[\w-]+)|^([a-z]{1,5}-\d+)/i);
    if (sm) return (sm[1] || sm[2] || sm[3]).toLowerCase();
  }

  return null;
}

function inferFromFilename(filename) {
  const base = filename.replace(/\.md$/, '');
  let round = 'R1';
  if (base.match(/-r(\d+)-report$/i) || base.match(/-code-review-r(\d+)/i)) {
    const m = base.match(/-r(\d+)/i);
    if (m) round = `R${m[1]}`;
  } else if (base.includes('re-review') || base.includes('2nd')) {
    round = 'R2';
  } else if (base.includes('final')) {
    round = 'R3';
  }
  return { storyId: storyIdFromFilename(filename), round };
}

// ──────────────────────────────────────────────
// 解析 CR 報告 Markdown
// ──────────────────────────────────────────────
function parseCrReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);
  const { storyId: filenameStoryId, round: filenameRound } = inferFromFilename(filename);

  // 優先從內容萃取 story_id，其次 fallback 到檔名
  const storyId = storyIdFromContent(content) || filenameStoryId;

  // Round：先從內容判斷，再用檔名
  let round = filenameRound;
  if (/Re-run|重跑|本次重跑/i.test(content)) round = 'R2';
  else if (/第二次|第二輪/.test(content)) round = 'R2';

  // SaaS Score — 多種格式（v2 header / table / v1 任意位置）
  let saasScore = null;
  const scorePatterns = [
    /\*\*SaaS\s*(?:Readiness\s*)?Score\*\*\s*[:：]\s*(\d+)\/\d+/i,    // v2 header inline
    /SaaS\s*Readiness[^\n|]*[\(（](\d+)\/\d+/i,                       // table gate
    /SaaS\s*Readiness\s*Score[^\n|]*\|\s*(\d+)\/\d+/i,               // summary table
    /SaaS.*?Score.*?[:：]\s*(\d+)\s*\/\s*100/i,
    /\*\*SaaS.*?Score\*\*[:：]\s*(\d+)/i,
    /→\s*(\d+)\/100/,
  ];
  for (const pattern of scorePatterns) {
    const m = content.match(pattern);
    if (m) { saasScore = parseInt(m[1]); break; }
  }

  // Review Date (多種格式)
  let reviewDate = null;
  const datePatterns = [
    /\*\*Review\s+Date\*\*\s*[:：]\s*([\d]{4}-[\d]{2}-[\d]{2})/i,
    /\*\*Date\*\*\s*[:：]\s*([\d]{4}-[\d]{2}-[\d]{2})/i,
    /\*\*審查時間\*\*\s*[:：]\s*([\d]{4}-[\d]{2}-[\d]{2})/,
    /\*\*審查日期\*\*\s*[:：]\s*([\d]{4}-[\d]{2}-[\d]{2})/,
    /審查[時日][間期]\s*\|\s*([\d]{4}-[\d]{2}-[\d]{2})/,
    /Review Date[:：]?\s*([\d-]+)/i,
  ];
  for (const pattern of datePatterns) {
    const m = content.match(pattern);
    if (m) { reviewDate = m[1].trim().slice(0, 10); break; }
  }
  // 在前 400 字元內找任意日期
  if (!reviewDate) {
    const anyDate = content.slice(0, 400).match(/([\d]{4}-[\d]{2}-[\d]{2})/);
    if (anyDate) reviewDate = anyDate[1];
  }
  if (!reviewDate) reviewDate = new Date().toISOString().slice(0, 10);

  // Reviewer (多種格式)
  let reviewer = null;
  const reviewerPatterns = [
    /\*\*Reviewer\*\*\s*[:：]\s*([^\n|*]+)/i,
    /\*\*審查者\*\*\s*[:：]\s*([^\n|*]+)/,
    /\*\*審查模型\*\*\s*[:：]\s*([^\n|*]+)/,
    /審查者\s*\|\s*([^\n|]+)/,
    /Reviewer\s*[:：]\s*([^\n|]+)/i,
  ];
  for (const p of reviewerPatterns) {
    const m = content.match(p);
    if (m) { reviewer = m[1].trim(); break; }
  }

  // Issues 統計 — 從摘要表格萃取
  let issuesTotal = 0, issuesFixed = 0, issuesDeferred = 0, issuesWontfix = 0;

  // v2 格式：| 發現/修復/延後 | 3 / 3 / 0 |
  const summaryMatch = content.match(/發現\/修復\/延後\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  if (summaryMatch) {
    issuesTotal = parseInt(summaryMatch[1]);
    issuesFixed = parseInt(summaryMatch[2]);
    issuesDeferred = parseInt(summaryMatch[3]);
  } else {
    // v1 格式：| **合計** | **8** | **8** | **0** |
    const totalRow = content.match(/\*\*合計\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/);
    if (totalRow) {
      issuesTotal = parseInt(totalRow[1]);
      issuesFixed = parseInt(totalRow[2]);
      issuesDeferred = parseInt(totalRow[3]);
    } else {
      // 嘗試其他格式：直接計數 Issue 標題
      const issueHeaders = content.match(/###\s*\[(?:CRITICAL|HIGH|MEDIUM|LOW)\]/gi);
      if (issueHeaders) issuesTotal = issueHeaders.length;
      const fixedCount = (content.match(/✅\s*Fix/gi) || []).length;
      issuesFixed = fixedCount;
      issuesDeferred = issuesTotal - issuesFixed;
    }
  }

  // WON'T FIX 計數
  const wontfixMatches = content.match(/WON'?T\s*FIX/gi);
  if (wontfixMatches) issuesWontfix = wontfixMatches.length;

  // Deferred targets
  let deferredTargets = null;
  const deferredMatches = content.match(/延後目標\s*Story\s*\|\s*(.+?)\s*\|/i)
    || content.match(/target.*?story.*?\|\s*(.+?)\s*\|/i);
  if (deferredMatches && deferredMatches[1] !== '無' && deferredMatches[1] !== '—') {
    deferredTargets = deferredMatches[1].trim();
  }

  // Tags：epic + dimensions + reviewer type + quality
  const tags = new Set();
  const epicMatch = filePath.replace(/\\/g, '/').match(/reviews\/(epic-[\w-]+)\//);
  if (epicMatch) tags.add(epicMatch[1]);
  for (const dim of ['ErrorHandling','TestCoverage','Security','Observability','Scalability','DataConsistency','CodeQuality','Documentation']) {
    if (content.includes(dim)) tags.add(dim.toLowerCase());
  }
  if (/claude/i.test(content)) tags.add('claude');
  if (/gemini/i.test(content)) tags.add('gemini');
  if (saasScore !== null && saasScore >= 90) tags.add('high-quality');
  if (round !== 'R1') tags.add('re-review');

  return {
    story_id: storyId,
    round,
    saas_score: saasScore,
    issues_total: issuesTotal,
    issues_fixed: issuesFixed,
    issues_deferred: issuesDeferred,
    issues_wontfix: issuesWontfix,
    deferred_targets: deferredTargets,
    reviewer,
    review_date: reviewDate,
    tags: tags.size > 0 ? [...tags].join(',') : null,
    source_file: path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/'),
    created_at: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function importCrReports() {
  const mode = process.argv.includes('--full') ? 'full' : 'incremental';
  console.log(`📋 CR Report ETL 匯入開始 (模式: ${mode})`);
  console.log(`   DB: ${DB_PATH}`);
  console.log('');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  if (mode === 'full') {
    db.exec('DELETE FROM cr_reports');
    console.log('[0] 全量模式：已清空 cr_reports 表');
  }

  // 掃描所有 epic review 目錄
  let epicDirs = [];
  if (fs.existsSync(REVIEWS_BASE)) {
    epicDirs = fs.readdirSync(REVIEWS_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('epic-'))
      .map(d => d.name);
  }

  console.log(`[1] 發現 ${epicDirs.length} 個 Epic Review 目錄`);

  // 也檢查根目錄下的 review 文件（早期格式）
  const rootReviews = fs.existsSync(REVIEWS_BASE)
    ? fs.readdirSync(REVIEWS_BASE).filter(f => f.endsWith('.md') && !f.startsWith('README'))
    : [];

  const insert = db.prepare(`
    INSERT INTO cr_reports
      (story_id, round, saas_score, issues_total, issues_fixed,
       issues_deferred, issues_wontfix, deferred_targets, reviewer,
       review_date, tags, source_file, created_at)
    VALUES
      (@story_id, @round, @saas_score, @issues_total, @issues_fixed,
       @issues_deferred, @issues_wontfix, @deferred_targets, @reviewer,
       @review_date, @tags, @source_file, @created_at)
  `);

  let totalImported = 0;
  let totalErrors = 0;

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  for (const epicDir of epicDirs) {
    const epicPath = path.join(REVIEWS_BASE, epicDir);
    const files = fs.readdirSync(epicPath)
      .filter(f => f.endsWith('.md') && !f.startsWith('README'));

    const reports = [];
    for (const file of files) {
      try {
        const report = parseCrReport(path.join(epicPath, file));
        reports.push(report);
      } catch (err) {
        console.error(`   ⚠️ 解析錯誤 ${epicDir}/${file}: ${err.message}`);
        totalErrors++;
      }
    }

    if (reports.length > 0) {
      insertMany(reports);
      totalImported += reports.length;
      console.log(`   ${epicDir}: ${reports.length} 份 CR 報告匯入`);
    }
  }

  // 根目錄 review 文件
  if (rootReviews.length > 0) {
    const reports = [];
    for (const file of rootReviews) {
      try {
        const report = parseCrReport(path.join(REVIEWS_BASE, file));
        reports.push(report);
      } catch (err) {
        console.error(`   ⚠️ 解析錯誤 reviews/${file}: ${err.message}`);
        totalErrors++;
      }
    }
    if (reports.length > 0) {
      insertMany(reports);
      totalImported += reports.length;
      console.log(`   reviews/: ${reports.length} 份 CR 報告匯入`);
    }
  }

  // 統計
  const total = db.prepare('SELECT COUNT(*) as count FROM cr_reports').get();
  const scoreStats = db.prepare(
    'SELECT MIN(saas_score) as min_score, MAX(saas_score) as max_score, ROUND(AVG(saas_score),1) as avg_score FROM cr_reports WHERE saas_score IS NOT NULL'
  ).get();

  console.log('');
  console.log('✅ CR Report ETL 完成');
  console.log(`   匯入: ${totalImported} 份 | 錯誤: ${totalErrors}`);
  console.log(`   cr_reports 表總計: ${total.count} 筆`);
  if (scoreStats.avg_score) {
    console.log(`   SaaS Score 範圍: ${scoreStats.min_score}~${scoreStats.max_score} (平均: ${scoreStats.avg_score})`);
  }

  db.close();
}

try {
  importCrReports();
} catch (err) {
  console.error('❌ CR Report ETL 失敗:', err.message);
  process.exit(1);
}
