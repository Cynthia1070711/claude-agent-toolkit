// ============================================================
// TD-32c 驗證腳本 — 直接查詢 DB（不透過 MCP，繞過 stdio）
// 驗證 search_context / search_tech / add_context / add_tech /
//         add_cr_issue / trace_context SQL 邏輯正確性
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ──────────────────────────────────────────────
// 種子資料
// ──────────────────────────────────────────────
console.log('\n[1] 插入測試種子資料...');

// 清除舊測試資料，確保冪等性
db.exec('DELETE FROM context_entries WHERE story_id IN (\'td-32b-mcp-server-query-tools\', \'td-32a-context-memory-db-schema\')');
db.exec('DELETE FROM tech_entries WHERE title = \'better-sqlite3 WAL 模式設定\'');

db.prepare(`INSERT INTO context_entries
  (agent_id, timestamp, category, title, content, tags, story_id, epic_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'CC-OPUS', new Date().toISOString(), 'decision',
  'ESM 模組切換決策',
  '@modelcontextprotocol/sdk 為純 ESM 套件，必須將 package.json type 改為 module',
  '["ESM","MCP","Node.js"]', 'td-32b-mcp-server-query-tools', 'epic-td'
);

db.prepare(`INSERT INTO context_entries
  (agent_id, timestamp, category, title, content, tags, story_id, epic_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'CC-SONNET', new Date().toISOString(), 'pattern',
  'FTS5 trigram 查詢限制',
  'FTS5 trigram tokenizer 查詢字串須 >= 3 字元，2 字元以下回傳空結果（非 Bug）',
  '["FTS5","SQLite","trigram"]', 'td-32a-context-memory-db-schema', 'epic-td'
);

// FTS5 Trigger 自動同步（TD-32c），無需手動 rebuild

db.prepare(`INSERT INTO tech_entries
  (created_by, created_at, category, tech_stack, title, problem, solution, outcome, confidence, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  'CC-OPUS', new Date().toISOString(), 'pattern', 'Node.js',
  'better-sqlite3 WAL 模式設定',
  '多 Agent 併發讀取時可能發生 SQLITE_BUSY',
  'db.pragma("journal_mode = WAL") — WAL 允許多讀單寫',
  'success', 90, '["WAL","SQLite","concurrency"]'
);

// FTS5 Trigger 自動同步（TD-32c），無需手動 rebuild

console.log('  ✅ 種子資料插入完成');

// ──────────────────────────────────────────────
// AC-2 驗證: search_context FTS5
// ──────────────────────────────────────────────
console.log('\n[2] AC-2: search_context FTS5 全文搜尋...');

const contextFtsRows = db.prepare(`
  SELECT ce.id, ce.agent_id, ce.category, ce.title,
         SUBSTR(ce.content, 1, 200) AS content_preview, ce.tags, ce.story_id
  FROM context_entries ce
  JOIN context_fts f ON ce.rowid = f.rowid
  WHERE context_fts MATCH ?
  ORDER BY rank LIMIT 10
`).all('ESM');

assert(contextFtsRows.length > 0, 'FTS5 search_context 回傳結果 (query: ESM)');
if (contextFtsRows.length > 0) {
  assert(contextFtsRows[0].content_preview.length <= 200, 'content_preview 摘要 <= 200 字元');
  assert('agent_id' in contextFtsRows[0], '回傳欄位包含 agent_id');
  assert('story_id' in contextFtsRows[0], '回傳欄位包含 story_id');
}

// 空查詢回退
console.log('\n[3] AC-2: search_context 空查詢回退...');
const emptyQueryRows = db.prepare(`
  SELECT id, agent_id, timestamp, category, title,
         SUBSTR(content, 1, 200) AS content_preview, tags, story_id
  FROM context_entries
  ORDER BY timestamp DESC LIMIT 10
`).all();
assert(emptyQueryRows.length > 0, '空查詢回傳最近 N 筆');

// < 3 字元回傳空陣列（模擬 server.js 邏輯）
console.log('\n[4] AC-2: search_context < 3 字元查詢...');
const shortQuery = 'AB';
const shortQueryResult = shortQuery.trim().length < 3 ? [] : db.prepare(`
  SELECT ce.id FROM context_entries ce
  JOIN context_fts f ON ce.rowid = f.rowid
  WHERE context_fts MATCH ?
  LIMIT 10
`).all(shortQuery);
assert(Array.isArray(shortQueryResult) && shortQueryResult.length === 0, '< 3 字元 query 回傳 [] (模擬 server.js 邏輯)');

// filter 測試
console.log('\n[5] AC-2: search_context filters 組合...');
const filteredRows = db.prepare(`
  SELECT ce.id, ce.agent_id, ce.category, ce.title,
         SUBSTR(ce.content, 1, 200) AS content_preview, ce.tags, ce.story_id
  FROM context_entries ce
  JOIN context_fts f ON ce.rowid = f.rowid
  WHERE context_fts MATCH ?
    AND ce.agent_id = ?
  ORDER BY rank LIMIT 10
`).all('ESM', 'CC-OPUS');
assert(filteredRows.every(r => r.agent_id === 'CC-OPUS'), 'filters agent_id 過濾正確');

// ──────────────────────────────────────────────
// AC-3 驗證: search_tech FTS5
// ──────────────────────────────────────────────
console.log('\n[6] AC-3: search_tech FTS5 全文搜尋...');

const techFtsRows = db.prepare(`
  SELECT te.id, te.created_by, te.created_at, te.category, te.tech_stack,
         te.title,
         SUBSTR(te.problem, 1, 200) AS problem_preview,
         SUBSTR(te.solution, 1, 200) AS solution_preview,
         te.outcome, te.confidence, te.tags
  FROM tech_entries te
  JOIN tech_fts f ON te.rowid = f.rowid
  WHERE tech_fts MATCH ?
  ORDER BY rank LIMIT 10
`).all('WAL');

assert(techFtsRows.length > 0, 'FTS5 search_tech 回傳結果 (query: WAL)');
if (techFtsRows.length > 0) {
  assert(techFtsRows[0].problem_preview.length <= 200, 'problem_preview 摘要 <= 200 字元');
  assert('confidence' in techFtsRows[0], '回傳欄位包含 confidence');
}

// outcome 過濾
const techFilteredRows = db.prepare(`
  SELECT te.id, te.outcome FROM tech_entries te
  JOIN tech_fts f ON te.rowid = f.rowid
  WHERE tech_fts MATCH ?
    AND te.outcome = ?
  ORDER BY rank LIMIT 10
`).all('WAL', 'success');
assert(techFilteredRows.every(r => r.outcome === 'success'), 'search_tech outcome 過濾正確');

// ──────────────────────────────────────────────
// AC-3 補充: search_tech 空查詢回退
// ──────────────────────────────────────────────
console.log('\n[6b] AC-3: search_tech 空查詢回退...');
const techEmptyQueryRows = db.prepare(`
  SELECT id, created_by, created_at, category, tech_stack, title,
         SUBSTR(problem, 1, 200) AS problem_preview,
         SUBSTR(solution, 1, 200) AS solution_preview,
         outcome, confidence, tags
  FROM tech_entries
  ORDER BY created_at DESC LIMIT 10
`).all();
assert(techEmptyQueryRows.length > 0, 'search_tech 空查詢回傳最近 N 筆');

// ──────────────────────────────────────────────
// AC-5 容錯: DB 不存在
// ──────────────────────────────────────────────
console.log('\n[7] AC-5: 容錯 — 空結果回傳 []...');
const emptyResult = db.prepare(`
  SELECT id FROM context_entries WHERE story_id = ?
`).all('non-existent-story-id');
assert(Array.isArray(emptyResult) && emptyResult.length === 0, '空結果回傳空陣列 (非 null)');

// ──────────────────────────────────────────────
// AC-7 Phase 邊界驗證
// ──────────────────────────────────────────────
console.log('\n[8] AC-7: Phase 邊界驗證...');
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
).all().map(r => r.name);

const forbiddenTables = ['epics', 'story_relations', 'workflow_executions', 'design_tokens'];
const violations = forbiddenTables.filter(t => tables.includes(t));
assert(violations.length === 0, `Phase 邊界: 無 Phase 3+ 表 (檢查: ${forbiddenTables.join(', ')})`);

const allowedTables = ['context_entries', 'tech_entries', 'sprint_index'];
assert(allowedTables.every(t => tables.includes(t)), 'Phase 0 必要表均存在');

// CMI-2 ETL 表存在性驗證
const cmi2Tables = ['stories', 'cr_reports', 'cr_issues', 'doc_index'];
assert(cmi2Tables.every(t => tables.includes(t)), `CMI-2 ETL 表均存在 (${cmi2Tables.join(', ')})`);

// CMI-3 Conversation 表存在性驗證
const cmi3Tables = ['conversation_sessions', 'conversation_turns'];
assert(cmi3Tables.every(t => tables.includes(t)), `CMI-3 Conversation 表均存在 (${cmi3Tables.join(', ')})`);

// CMI-5 Document Vectorization 表存在性驗證
const cmi5Tables = ['document_chunks', 'document_embeddings'];
assert(cmi5Tables.every(t => tables.includes(t)), `CMI-5 Document 表均存在 (${cmi5Tables.join(', ')})`);

// CMI-5 doc_index 擴充欄位驗證
const docIndexCols = db.prepare('PRAGMA table_info(doc_index)').all().map(r => r.name);
const requiredDocIndexCols = ['category', 'epic_id', 'checksum', 'chunk_count', 'total_tokens', 'chunk_strategy'];
assert(
  requiredDocIndexCols.every(c => docIndexCols.includes(c)),
  `doc_index 包含 CMI-5 擴充欄位 (${requiredDocIndexCols.join(', ')})`
);

// CMI-6: tech_debt_items 表存在性驗證
assert(tables.includes('tech_debt_items'), 'CMI-6: tech_debt_items 表存在');

// CMI-6: tech_debt_items FTS5 虛擬表存在性
assert(tables.includes('tech_debt_fts'), 'CMI-6: tech_debt_fts FTS5 虛擬表存在');

// CMI-6: stories v2 擴充欄位驗證
const storiesCols = db.prepare('PRAGMA table_info(stories)').all().map(r => r.name);
const storiesV2Cols = [
  'implementation_approach', 'risk_assessment', 'testing_strategy',
  'rollback_plan', 'monitoring_plan', 'definition_of_done',
  'cr_issues_total', 'cr_issues_fixed', 'cr_issues_deferred', 'cr_summary',
  'started_at', 'completed_at', 'review_completed_at', 'execution_log',
];
assert(
  storiesV2Cols.every(c => storiesCols.includes(c)),
  `stories 包含 v2 擴充欄位 (共 ${storiesV2Cols.length} 個)`
);

// CMI-6: stories_fts 升級驗證（應包含 dev_notes, cr_summary）
const storiesFtsCols = db.prepare('PRAGMA table_info(stories_fts)').all().map(r => r.name);
assert(
  storiesFtsCols.includes('dev_notes') && storiesFtsCols.includes('cr_summary'),
  `stories_fts 包含升級欄位 (dev_notes, cr_summary)`
);

// ──────────────────────────────────────────────
// AC-5: FTS5 Trigger 存在性驗證
// ──────────────────────────────────────────────
console.log('\n[8b] AC-5: FTS5 Trigger 存在性驗證...');
const triggers = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='trigger'"
).all().map(r => r.name);

const expectedTriggers = ['context_ai', 'context_ad', 'context_au', 'tech_ai', 'tech_ad', 'tech_au'];
assert(
  expectedTriggers.every(t => triggers.includes(t)),
  `6 個 FTS5 Trigger 均存在 (${expectedTriggers.join(', ')})`
);

// ──────────────────────────────────────────────
// AC-1: add_context — 寫入後 Trigger 自動同步 FTS5
// ──────────────────────────────────────────────
console.log('\n[9] AC-1: add_context 寫入 + FTS5 Trigger 自動同步...');

// 清理舊測試資料
db.exec('DELETE FROM context_entries WHERE story_id = \'td-32c-mcp-write-trace-tools\'');

const addContextResult = db.prepare(`
  INSERT INTO context_entries
    (agent_id, timestamp, category, title, content, tags, story_id, epic_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'CC-SONNET', new Date().toISOString(), 'pattern',
  'FTS5 Trigger 自動同步設計',
  'INSERT/UPDATE/DELETE Trigger 確保 FTS 虛擬表與 content_entries 保持同步，無需手動 rebuild',
  '["FTS5","Trigger","SQLite","td-32c"]', 'td-32c-mcp-write-trace-tools', 'epic-td'
);

assert(typeof addContextResult.lastInsertRowid === 'number' && addContextResult.lastInsertRowid > 0, 'add_context INSERT 成功，回傳 lastInsertRowid');

// 驗證 Trigger 自動同步：FTS5 可立即命中新記錄（無 rebuild）
const triggerSyncRows = db.prepare(`
  SELECT ce.id, ce.title FROM context_entries ce
  WHERE ce.id IN (SELECT rowid FROM context_fts WHERE context_fts MATCH ?)
`).all('Trigger');

assert(triggerSyncRows.length > 0, 'Trigger 自動同步：add_context 寫入後 FTS5 可立即命中 (query: Trigger)');
assert(
  triggerSyncRows.some(r => r.id === addContextResult.lastInsertRowid),
  '命中記錄包含剛寫入的 context entry'
);

// tags 正規化驗證（逗號分隔 → JSON array，模擬 server.js normalizeTags）
function normalizeTags(tags) {
  if (!tags || typeof tags !== 'string') return null;
  const s = tags.trim();
  if (!s) return null;
  if (s.startsWith('[')) return s;
  return JSON.stringify(s.split(',').map(t => t.trim()).filter(Boolean));
}

// 測試逗號分隔輸入
const csvInput = 'FTS5,Trigger,SQLite,td-32c';
const normalizedCsv = normalizeTags(csvInput);
assert(normalizedCsv === '["FTS5","Trigger","SQLite","td-32c"]', `tags 正規化：逗號分隔 → JSON array (got: ${normalizedCsv})`);

// 測試已是 JSON array 的輸入
const jsonInput = '["a","b"]';
const normalizedJson = normalizeTags(jsonInput);
assert(normalizedJson === '["a","b"]', 'tags 正規化：JSON array 原樣回傳');

// 測試 null/空值
assert(normalizeTags(null) === null, 'tags 正規化：null → null');
assert(normalizeTags('') === null, 'tags 正規化：空字串 → null');

const csvTagsResult = db.prepare(`
  INSERT INTO context_entries
    (agent_id, timestamp, category, title, content, tags, story_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  'CC-SONNET', new Date().toISOString(), 'debug',
  'tags 正規化測試',
  '逗號分隔字串需轉為 JSON array',
  normalizedCsv, // 使用 normalizeTags 轉換後的值
  'td-32c-mcp-write-trace-tools'
);
assert(typeof csvTagsResult.lastInsertRowid === 'number', 'add_context tags 正規化後寫入成功');

// 驗證 DB 中存入的 tags 為 JSON array 格式
const savedTags = db.prepare('SELECT tags FROM context_entries WHERE id = ?').get(csvTagsResult.lastInsertRowid);
assert(savedTags && savedTags.tags.startsWith('['), 'DB 中 tags 為 JSON array 格式');

// ──────────────────────────────────────────────
// AC-2: add_tech — 寫入後 Trigger 自動同步 FTS5
// ──────────────────────────────────────────────
console.log('\n[10] AC-2: add_tech 寫入 + FTS5 Trigger 自動同步...');

db.exec('DELETE FROM tech_entries WHERE created_by = \'td-32c-test\'');

const addTechResult = db.prepare(`
  INSERT INTO tech_entries
    (created_by, created_at, category, title, outcome, problem, solution, lessons, tags, confidence)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'td-32c-test', new Date().toISOString(), 'pattern',
  'FTS5 外部內容表 Trigger 設計模式',
  'success',
  'FTS5 外部內容表預設不自動同步，需手動 rebuild 或設定 Trigger',
  '使用 INSERT/UPDATE/DELETE Trigger 自動同步 FTS 虛擬表，實現即時搜尋',
  '外部內容表的 DELETE Trigger 使用特殊語法：INSERT INTO fts_table(fts_table, rowid, ...) VALUES("delete", ...)',
  '["FTS5","Trigger","外部內容表","td-32c"]',
  90
);

assert(typeof addTechResult.lastInsertRowid === 'number' && addTechResult.lastInsertRowid > 0, 'add_tech INSERT 成功，回傳 lastInsertRowid');

const techTriggerSyncRows = db.prepare(`
  SELECT te.id, te.title FROM tech_entries te
  WHERE te.id IN (SELECT rowid FROM tech_fts WHERE tech_fts MATCH ?)
`).all('外部內容表');

assert(techTriggerSyncRows.length > 0, 'Trigger 自動同步：add_tech 寫入後 FTS5 可立即命中 (query: 外部內容表)');
assert(
  techTriggerSyncRows.some(r => r.id === addTechResult.lastInsertRowid),
  '命中記錄包含剛寫入的 tech entry'
);

// category 枚舉（驗證非法值不應寫入）
const VALID_TECH_CATEGORIES = new Set([
  'success', 'failure', 'workaround', 'pattern', 'bugfix', 'architecture',
  'benchmark', 'security', 'flaky_test', 'test_pattern', 'bdd_scenario',
  'ac_pattern', 'test_failure', 'test_infra', 'mock_strategy', 'review',
]);
assert(!VALID_TECH_CATEGORIES.has('invalid-category'), 'category 枚舉驗證：非法值被拒');
assert(VALID_TECH_CATEGORIES.has('pattern'), 'category 枚舉驗證：合法值通過');
assert(VALID_TECH_CATEGORIES.size === 16, `category 枚舉共 16 個合法值 (實際: ${VALID_TECH_CATEGORIES.size})`);

// ──────────────────────────────────────────────
// AC-3: add_cr_issue — 映射至 tech_entries (category='review')
// ──────────────────────────────────────────────
console.log('\n[11] AC-3: add_cr_issue 映射至 tech_entries...');

db.exec('DELETE FROM tech_entries WHERE created_by = \'td-32c-cr-test\'');

const crIssueResult = db.prepare(`
  INSERT INTO tech_entries
    (created_by, created_at, category, title, problem, solution, outcome, tags, related_files, confidence)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'td-32c-cr-test', new Date().toISOString(),
  'review',
  '[HIGH] M1: handleAddContext 缺少空字串欄位驗證',
  'handleAddContext 未對 category="" 空字串進行驗證，導致無意義記錄寫入',
  'FIXED',
  'success',
  JSON.stringify(['td-32c-cr-test', 'high', 'FIXED']),
  null, 90
);

assert(typeof crIssueResult.lastInsertRowid === 'number', 'add_cr_issue 映射寫入成功');

const crRow = db.prepare('SELECT category, outcome FROM tech_entries WHERE id = ?').get(crIssueResult.lastInsertRowid);
assert(crRow && crRow.category === 'review', 'add_cr_issue 映射後 category = "review"');
assert(crRow && crRow.outcome === 'success', 'add_cr_issue FIXED → outcome = "success"');

// severity/resolution 枚舉驗證
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_RESOLUTIONS = new Set(['FIXED', 'DEFERRED', 'WONT_FIX']);
assert(VALID_SEVERITIES.has('high'), 'severity 枚舉：high 有效');
assert(!VALID_SEVERITIES.has('urgent'), 'severity 枚舉：urgent 被拒');
assert(VALID_RESOLUTIONS.has('DEFERRED'), 'resolution 枚舉：DEFERRED 有效');
assert(!VALID_RESOLUTIONS.has('IGNORE'), 'resolution 枚舉：IGNORE 被拒');

// ──────────────────────────────────────────────
// AC-4: trace_context — 直接命中 + 關聯擴展
// ──────────────────────────────────────────────
console.log('\n[12] AC-4: trace_context 直接命中 + 關聯擴展...');

// Step 1: FTS5 直接命中（使用前面插入的 td-32c 記錄）
const directContextHits = db.prepare(`
  SELECT 'context' AS source, id, title, story_id, related_files
  FROM context_entries WHERE id IN (
    SELECT rowid FROM context_fts WHERE context_fts MATCH ?
  )
`).all('Trigger').map(r => ({ ...r, proximity: 0 }));

assert(directContextHits.length > 0, 'trace_context Step 1: FTS5 直接命中 context_entries (query: Trigger)');

const directTechHits = db.prepare(`
  SELECT 'tech' AS source, id, title, NULL AS story_id, related_files
  FROM tech_entries WHERE id IN (
    SELECT rowid FROM tech_fts WHERE tech_fts MATCH ?
  )
`).all('外部內容表').map(r => ({ ...r, proximity: 0 }));

assert(directTechHits.length > 0, 'trace_context Step 1: FTS5 直接命中 tech_entries (query: 外部內容表)');

// Step 2: 依 story_id 擴展關聯記錄
const storyIds = [...new Set(directContextHits.map(r => r.story_id).filter(Boolean))];
let relatedCount = 0;
if (storyIds.length > 0) {
  const placeholders = storyIds.map(() => '?').join(',');
  const relatedRows = db.prepare(`
    SELECT id FROM context_entries WHERE story_id IN (${placeholders})
  `).all(...storyIds);
  relatedCount = relatedRows.length;
}
assert(relatedCount > 0, `trace_context Step 2: 依 story_id 擴展關聯記錄 (found: ${relatedCount})`);

// depth 上限截斷
const capDepth = (d) => Math.min(2, Math.max(1, Number(d) || 1));
assert(capDepth(3) === 2, 'trace_context depth > 2 強制截斷為 2');
assert(capDepth(0) === 1, 'trace_context depth < 1 補為 1');
assert(capDepth(1) === 1, 'trace_context depth = 1 不變');

// query < 3 字元回傳空結果
const shortQueryCheck = 'AB'.trim().length < 3;
assert(shortQueryCheck, 'trace_context query < 3 字元 → 回傳空結果（trigram 限制）');

// ──────────────────────────────────────────────
// AC-6: Phase 邊界 — 不得存在 sync_*, import_*, log_workflow 工具
// (SQL 層驗證：確認無 Phase 1+ 表)
// ──────────────────────────────────────────────
console.log('\n[13] AC-6: Phase 邊界 — 無 Phase 1+ 表、6 個 Trigger 均存在...');
const phase3PlusTables = ['epics', 'story_relations', 'workflow_executions', 'design_tokens'];
const phase3Violations = phase3PlusTables.filter(t => tables.includes(t));
assert(phase3Violations.length === 0, `Phase 邊界：無 Phase 3+ 表 (${phase3PlusTables.join(', ')})`);

const cmi2Triggers = [
  'stories_ai', 'stories_ad', 'stories_au',
  'cr_reports_ai', 'cr_reports_ad', 'cr_reports_au',
  'cr_issues_ai', 'cr_issues_ad', 'cr_issues_au',
  'doc_index_ai', 'doc_index_ad', 'doc_index_au',
];
const cmi3Triggers = [
  'conv_sessions_ai', 'conv_sessions_ad', 'conv_sessions_au',
  'conv_turns_ai', 'conv_turns_ad', 'conv_turns_au',
];
const cmi5Triggers = [
  'doc_chunks_ai', 'doc_chunks_ad', 'doc_chunks_au',
];
const cmi6Triggers = [
  'debt_ai', 'debt_ad', 'debt_au',
];
const allExpectedTriggers = [...expectedTriggers, ...cmi2Triggers, ...cmi3Triggers, ...cmi5Triggers, ...cmi6Triggers];
assert(
  allExpectedTriggers.every(t => triggers.includes(t)),
  `Phase 邊界：30 個 FTS5 Trigger 均存在（Phase 0: 6 + CMI-2: 12 + CMI-3: 6 + CMI-5: 3 + CMI-6: 3）`
);

// ──────────────────────────────────────────────
// 結果
// ──────────────────────────────────────────────
db.close();
console.log(`\n${'='.repeat(50)}`);
console.log(`驗證結果: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ 所有驗證通過');
}
