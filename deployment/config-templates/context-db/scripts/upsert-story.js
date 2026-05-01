// ============================================================
// PCPT Context Memory DB — 單一 Story 寫入工具
// [Intentional: IDD-STR-003] DB-first Story 寫入工具主入口 - 繞過 create-story workflow
// 用途：直接將 Story 寫入 DB（DB-first 模式）
// See: docs/technical-decisions/ADR-IDD-STR-003-db-first-story-繞過-create-story-checklist-epic-mqv.md
// ============================================================
// 使用方式:
// [Intentional: IDD-STR-003] 檔案輸入模式 - 成熟 Epic 批次產生 Story
//   node .context-db/scripts/upsert-story.js <json-file>
// [Intentional: IDD-STR-003] inline mode - Pipeline 自動化使用
//   node .context-db/scripts/upsert-story.js --inline '<json>'
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { syncEmbedding, buildInputText } from './embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function getTaiwanTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

// --quiet 模式：抑制 console.warn 輸出（供 pipeline 呼叫，避免 stderr 觸發 PowerShell 錯誤）
let quietMode = false;

// Known DB columns — mergeStory 欄位白名單驗證（防止 MCP _preview 後綴等拼寫錯誤靜默失敗）
const KNOWN_COLUMNS = new Set([
  'story_id', 'epic_id', 'domain', 'title', 'status', 'priority', 'complexity',
  'story_type', 'dependencies', 'tags', 'file_list', 'dev_agent', 'review_agent',
  'source_file', 'created_at', 'user_story', 'background', 'acceptance_criteria',
  'tasks', 'affected_files', 'cr_score', 'test_count', 'discovery_source', 'updated_at',
  'dev_notes', 'required_skills',
  'implementation_approach', 'risk_assessment', 'testing_strategy',
  'rollback_plan', 'monitoring_plan', 'definition_of_done',
  'cr_issues_total', 'cr_issues_fixed', 'cr_issues_deferred', 'cr_summary',
  'started_at', 'completed_at', 'review_completed_at', 'execution_log',
  'sdd_spec', 'create_agent', 'create_started_at', 'create_completed_at',
  'pipeline_notes', 'review_started_at'
]);

/**
 * Fix-10: 自動 merge 防護 — 當 Story 已存在時自動切換為 merge 模式
 * 防止 INSERT OR REPLACE 覆寫既有資料（如 AC/tasks 被清空）
 * 只有新建 Story（DB 中不存在）才走完整 INSERT。
 * 若需強制完整覆寫，使用 --force-replace flag。
 */
let forceReplace = false;
let _skipAutoMerge = false; // 內部 flag: mergeStory 回調 upsertStory 時跳過檢查

async function upsertStory(data) {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Fix-10: 自動 merge 防護（mergeStory 內部回調時跳過）
  if (!forceReplace && !_skipAutoMerge && data.story_id) {
    const existing = db.prepare('SELECT story_id FROM stories WHERE story_id = ?').get(data.story_id);
    if (existing) {
      // MEDIUM-4 fix: 複用同一個 DB 連線進行 merge（避免 3 次開關）
      if (!quietMode) {
        console.log(`🛡️  Story ${data.story_id} 已存在，自動切換為 merge 模式（防止覆寫）`);
      }
      await mergeStory(data.story_id, data, db);
      return;
    }
  }

  await _doUpsert(db, data);
}

/** 內部寫入邏輯（不管理 DB 生命週期） */
async function _doUpsert(db, data) {
  const now = getTaiwanTimestamp();

  // ★ PROTECTED FIELD: pipeline_notes — INSERT OR REPLACE 會刪除舊行，
  // 需從現有記錄保留此欄位（除非 data 中明確提供新值）
  if (!('pipeline_notes' in data) && data.story_id) {
    try {
      const existing = db.prepare('SELECT pipeline_notes FROM stories WHERE story_id = ?').get(data.story_id);
      if (existing && existing.pipeline_notes) {
        data.pipeline_notes = existing.pipeline_notes;
      }
    } catch { /* 新 Story，無需保留 */ }
  }

  // 序列化 JSON 欄位
  const jsonFields = [
    'acceptance_criteria', 'tasks', 'affected_files', 'file_list',
    'risk_assessment', 'definition_of_done', 'execution_log',
  ];
  for (const f of jsonFields) {
    if (data[f] && typeof data[f] === 'object') {
      data[f] = JSON.stringify(data[f]);
    }
  }

  db.prepare(`
    INSERT OR REPLACE INTO stories
      (story_id, epic_id, domain, title, status, priority, complexity,
       story_type, dependencies, tags, file_list, dev_agent, review_agent,
       source_file, created_at, user_story, background, acceptance_criteria,
       tasks, affected_files, cr_score, test_count, discovery_source, updated_at,
       dev_notes, required_skills,
       implementation_approach, risk_assessment, testing_strategy,
       rollback_plan, monitoring_plan, definition_of_done,
       cr_issues_total, cr_issues_fixed, cr_issues_deferred, cr_summary,
       started_at, completed_at, review_completed_at, execution_log,
       sdd_spec, create_agent, create_started_at, create_completed_at,
       pipeline_notes, review_started_at)
    VALUES
      (@story_id, @epic_id, @domain, @title, @status, @priority, @complexity,
       @story_type, @dependencies, @tags, @file_list, @dev_agent, @review_agent,
       @source_file, @created_at, @user_story, @background, @acceptance_criteria,
       @tasks, @affected_files, @cr_score, @test_count, @discovery_source, @updated_at,
       @dev_notes, @required_skills,
       @implementation_approach, @risk_assessment, @testing_strategy,
       @rollback_plan, @monitoring_plan, @definition_of_done,
       @cr_issues_total, @cr_issues_fixed, @cr_issues_deferred, @cr_summary,
       @started_at, @completed_at, @review_completed_at, @execution_log,
       @sdd_spec, @create_agent, @create_started_at, @create_completed_at,
       @pipeline_notes, @review_started_at)
  `).run({
    story_id: data.story_id,
    epic_id: data.epic_id || 'epic-mqv',
    domain: data.domain || 'system',
    title: data.title,
    status: data.status || 'backlog',
    priority: data.priority || null,
    complexity: data.complexity || null,
    story_type: data.story_type || null,
    dependencies: data.dependencies || null,
    tags: data.tags || null,
    file_list: data.file_list || null,
    dev_agent: data.dev_agent || null,
    review_agent: data.review_agent || null,
    source_file: data.source_file || `context-db://stories/${data.story_id}`,
    created_at: data.created_at || now.split('T')[0],
    user_story: data.user_story || null,
    background: data.background || null,
    acceptance_criteria: data.acceptance_criteria || null,
    tasks: data.tasks || null,
    affected_files: data.affected_files || null,
    cr_score: data.cr_score ?? null,
    test_count: data.test_count ?? null,
    discovery_source: data.discovery_source || null,
    updated_at: now,
    dev_notes: data.dev_notes || null,
    required_skills: data.required_skills || null,
    // --- v2 擴充欄位 ---
    implementation_approach: data.implementation_approach || null,
    risk_assessment: data.risk_assessment || null,
    testing_strategy: data.testing_strategy || null,
    rollback_plan: data.rollback_plan || null,
    monitoring_plan: data.monitoring_plan || null,
    definition_of_done: data.definition_of_done || null,
    cr_issues_total: data.cr_issues_total ?? null,
    cr_issues_fixed: data.cr_issues_fixed ?? null,
    cr_issues_deferred: data.cr_issues_deferred ?? null,
    cr_summary: data.cr_summary || null,
    started_at: data.started_at || null,
    completed_at: data.completed_at || null,
    review_completed_at: data.review_completed_at || null,
    execution_log: data.execution_log || null,
    sdd_spec: data.sdd_spec || null,
    create_agent: data.create_agent || null,
    create_started_at: data.create_started_at || null,
    create_completed_at: data.create_completed_at || null,
    pipeline_notes: data.pipeline_notes || null,
    review_started_at: data.review_started_at || null,
  });

  // CMI-10: 同步生成 Story Embedding
  try {
    const embText = buildInputText('stories', { title: data.title, tags: data.tags || '', dev_notes: data.dev_notes || '' });
    // upsert-story 是 CLI 同步呼叫，用 await 確保寫入完成
    await syncEmbedding(db, 'stories', data.story_id, embText);
  } catch (err) {
    if (!quietMode) console.warn(`⚠️  Story embedding sync 失敗（不影響寫入）: ${err.message}`);
  }

  db.close();

  // SDD+ATDD 格式警告（不阻擋寫入，僅提醒）
  const ac = data.acceptance_criteria || '';
  const hasBR = /\[Verifies:\s*BR-/i.test(ac);
  const hasATDD = /Given\b.*When\b.*Then\b/is.test(ac);
  const complexity = (data.complexity || '').toUpperCase();
  const needsSpec = ['M', 'L', 'XL'].includes(complexity);

  if (!quietMode) {
    if (!hasBR) {
      console.warn(`⚠️  AC 缺少 [Verifies: BR-XXX] 映射（Story: ${data.story_id}）`);
    }
    if (!hasATDD) {
      console.warn(`⚠️  AC 未使用 ATDD 格式 Given/When/Then（Story: ${data.story_id}）`);
    }
    if (needsSpec && !data.sdd_spec) {
      console.warn(`⚠️  ${complexity} 複雜度 Story 建議先產出 SDD Spec（Story: ${data.story_id}）`);
    }
  }

  console.log(`✅ Story ${data.story_id} 已寫入 DB`);
}

/**
 * Fix-8: --merge 模式 — 僅更新指定欄位，保留其他既有資料
 * 用途：workflow 完成後部分更新（如 create-story 補全 AC/Tasks，code-review 更新 cr_score）
 */
async function mergeStory(storyId, updates, existingDb = null) {
  // MEDIUM-4 fix: 複用傳入的 DB 連線，避免重複開關
  const db = existingDb || new Database(DB_PATH);
  if (!existingDb) db.pragma('journal_mode = WAL');

  // 讀取現有資料
  const existing = db.prepare('SELECT * FROM stories WHERE story_id = ?').get(storyId);
  if (!existing) {
    if (!existingDb) db.close();
    console.error(`❌ Story ${storyId} 不存在，無法 merge。請先用完整 upsert 建立。`);
    process.exit(1);
  }

  // 欄位白名單驗證 — 防止 MCP _preview 後綴等拼寫錯誤靜默失敗
  const unknownKeys = Object.keys(updates).filter(k => !KNOWN_COLUMNS.has(k));
  if (unknownKeys.length > 0) {
    console.error(`⚠️  Unknown columns in merge: [${unknownKeys.join(', ')}] — these will be IGNORED.`);
    console.error(`   Did you mean: ${unknownKeys.map(k => {
      const candidates = [...KNOWN_COLUMNS].filter(c => c.includes(k.replace(/_preview$/, '')) || k.includes(c));
      return candidates.length ? `${k} → ${candidates[0]}?` : k;
    }).join(', ')}`);
    // Remove unknown keys to prevent silent data loss
    for (const k of unknownKeys) delete updates[k];
    if (Object.keys(updates).filter(k => k !== 'story_id').length === 0) {
      console.error(`❌ No valid columns to merge after removing unknown keys. Aborting.`);
      if (!existingDb) db.close();
      process.exit(1);
    }
  }

  // 合併：updates 覆蓋 existing
  const merged = { ...existing, ...updates, story_id: storyId };

  // [Layer 1] Lifecycle auto-status-promotion
  // See: .claude/rules/story-lifecycle-invariants.md
  // 當 lifecycle trigger 欄位寫入但 status 未明確指定時,自動推進 status
  // 原則: 只推進不倒退 / 明確設定優先 / stderr log 可稽核
  if (!('status' in updates)) {
    const AUTO_PROMOTE_RULES = [
      { trigger: 'create_completed_at', from: ['backlog'],                               to: 'ready-for-dev' },
      { trigger: 'completed_at',        from: ['backlog', 'ready-for-dev', 'in-progress'], to: 'review' },
      { trigger: 'review_completed_at', from: ['review'],                                to: 'done' },
    ];
    for (const rule of AUTO_PROMOTE_RULES) {
      if (updates[rule.trigger] && rule.from.includes(existing.status)) {
        merged.status = rule.to;
        if (!quietMode) {
          console.log(`🔁 Auto-promoted status: ${existing.status} → ${rule.to} (${rule.trigger} detected, I1/I2/I3/I4 enforcement)`);
        }
        break; // 單一 merge 只觸發一次推進
      }
    }
  }

  // [Layer 1 §2] Implicit timestamp backfill for I8/I9 (v2.0.0 added 2026-04-21)
  // See: .claude/rules/story-lifecycle-invariants.md §Auto-Promotion Rules §v2.0.0 Implicit Timestamp Backfill
  // 當寫入 review_completed_at 但 review_started_at NULL 時,同值回填(保守 fallback)
  // 保證 Manual workflow(非 pipeline)跳過 step-01 §1b 時 I8/I9 不變量不破損
  if (updates.review_completed_at && !existing.review_started_at && !('review_started_at' in updates)) {
    merged.review_started_at = updates.review_completed_at;
    if (!quietMode) {
      console.log(`🔁 Auto-backfilled review_started_at = review_completed_at (I8/I9 enforcement, manual workflow fallback)`);
    }
  }

  // 直接用 _doUpsert 寫回（複用同一個 DB 連線）
  await _doUpsert(db, merged);
  console.log(`🔀 Story ${storyId} 已 merge 更新 (${Object.keys(updates).length} 個欄位)`);
}

// CLI 入口
const rawArgs = process.argv.slice(2);
// Flag 解析
if (rawArgs.includes('--quiet')) {
  quietMode = true;
}
if (rawArgs.includes('--force-replace')) {
  forceReplace = true;
}
const args = rawArgs.filter(a => !['--quiet', '--force-replace'].includes(a));
if (args.length === 0) {
  console.log('Usage:');
  // [Intentional: IDD-STR-003] CLI 完整 upsert 模式 - DB-first Story 寫入
  console.log('  node upsert-story.js <json-file>              # 完整 upsert');
  // [Intentional: IDD-STR-003] CLI inline JSON - Pipeline 整合
  console.log('  node upsert-story.js --inline \'<json>\'        # 完整 upsert (inline JSON)');
  console.log('  node upsert-story.js --merge <story-id> <json-file>   # 部分更新');
  console.log('  node upsert-story.js --merge <story-id> --inline \'<json>\'  # 部分更新 (inline)');
  process.exit(1);
}

// Fix-11: Strip BOM — PowerShell Out-File -Encoding UTF8 寫出 BOM 導致 JSON.parse 失敗
function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

(async () => {
  if (args[0] === '--merge') {
    const storyId = args[1];
    let updates;
    if (args[2] === '--inline') {
      updates = JSON.parse(args[3]);
    } else {
      const filePath = path.resolve(args[2]);
      updates = readJsonFile(filePath);
    }
    await mergeStory(storyId, updates);
  } else {
    let data;
    if (args[0] === '--inline') {
      data = JSON.parse(args[1]);
    } else {
      const filePath = path.resolve(args[0]);
      data = readJsonFile(filePath);
    }
    await upsertStory(data);
  }
})().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
