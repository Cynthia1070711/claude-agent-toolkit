// ============================================================
// [tdb-1-track-plan-roadmap] track_plan 中控寫入 CLI —— 建卡 / 重排 / 暫停 / 解鎖
// 語意對齊 upsert-story.js:--inline(完整 upsert,建卡)/ --merge <story-id> --inline(部分更新)。
// 欄位白名單 + enum 前置攔截(不倚賴 SQLite CHECK 錯誤訊息),updated_at 自動填 getTaiwanTimestamp(),
// updated_by 取環境變數 PHYCOOL_CONTROLLER_TRACK(未設時退回 'unknown-controller')。
//
// 用法:
//   node .context-db/scripts/upsert-track-plan.js --inline '<json>'                    # 建卡(story_id+lane 必填)
//   node .context-db/scripts/upsert-track-plan.js --merge <story-id> --inline '<json>'  # 重排/暫停/解鎖(部分更新)
//   ... --db <path>                                                                     # 測試用隔離 DB
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'phycool.db');

const KNOWN_FIELDS = new Set(['story_id', 'lane', 'seq', 'plan_state', 'pause_reason', 'unlock_note']);
const LANE_VALUES = ['manual', 'dispatch', 'reconcile'];
const PLAN_STATE_VALUES = ['queued', 'paused', 'unlocked', 'done-exited'];

function openDb(dbPath) {
  const db = new Database(dbPath || DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

function getUpdatedBy() {
  return process.env.PHYCOOL_CONTROLLER_TRACK || 'unknown-controller';
}

/**
 * 前置攔截 —— 回傳錯誤訊息陣列(空陣列 = 驗證通過)。列出合法值,不倚賴 SQLite CHECK 錯誤訊息。
 * @param {object} data
 * @param {{requireLane: boolean}} opts
 */
function validateFields(data, opts = {}) {
  const errors = [];
  const unknown = Object.keys(data).filter(k => !KNOWN_FIELDS.has(k));
  if (unknown.length > 0) {
    errors.push(`未知欄位: [${unknown.join(', ')}]。合法欄位: [${[...KNOWN_FIELDS].join(', ')}]`);
  }
  if (!data.story_id) {
    errors.push('story_id 為必填欄位');
  }
  if (opts.requireLane && !data.lane) {
    errors.push('建卡模式必填 lane（合法值: manual|dispatch|reconcile）');
  }
  if ('lane' in data && !LANE_VALUES.includes(data.lane)) {
    errors.push(`lane 值不合法: "${data.lane}"。合法值: manual|dispatch|reconcile`);
  }
  if ('plan_state' in data && !PLAN_STATE_VALUES.includes(data.plan_state)) {
    errors.push(`plan_state 值不合法: "${data.plan_state}"。合法值: ${PLAN_STATE_VALUES.join('|')}`);
  }
  return errors;
}

/** --inline（無 --merge）—— 建卡：完整 upsert，story_id + lane 必填。 */
function upsertTrackPlan(dbPath, data) {
  const errors = validateFields(data, { requireLane: true });
  if (errors.length > 0) return { ok: false, errors };

  const db = openDb(dbPath);
  try {
    // [tdb-1 CR F2] 參照完整性應用層檢查 —— track_plan 刻意不宣告 DDL FK
    // （better-sqlite3 預設 PRAGMA foreign_keys=1，配上 upsert-story.js 的 INSERT OR REPLACE
    //   會讓 ON DELETE CASCADE 在任何無關欄位更新時靜默清空子表，見 init-db.js track_plan 區塊註解）。
    // 該註解明列補償控制為「migrate-track-plan.js FK 完整性中止 + upsert-track-plan.js 寫入前
    // story 存在性檢查」，但本函式原先缺後者 —— 打錯 story_id 會建出孤兒列，而孤兒列在
    // /roadmap 完全隱形（roadmapService 兩支查詢皆 JOIN stories），中控以為已排程卻查無此卡。
    const story = db.prepare('SELECT 1 FROM stories WHERE story_id = ?').get(data.story_id);
    if (!story) {
      return { ok: false, errors: [`stories 表無此 story_id: ${data.story_id}（track_plan 無 DDL FK，參照完整性由本檢查把關；請先確認 story_id 拼寫或先建 Story）`] };
    }

    const now = getTaiwanTimestamp();
    db.prepare(`
      INSERT INTO track_plan (story_id, lane, seq, plan_state, pause_reason, unlock_note, updated_at, updated_by)
      VALUES (@story_id, @lane, @seq, @plan_state, @pause_reason, @unlock_note, @updated_at, @updated_by)
      ON CONFLICT(story_id) DO UPDATE SET
        lane=excluded.lane, seq=excluded.seq, plan_state=excluded.plan_state,
        pause_reason=excluded.pause_reason, unlock_note=excluded.unlock_note,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by
    `).run({
      story_id: data.story_id,
      lane: data.lane,
      seq: data.seq ?? null,
      plan_state: data.plan_state || 'queued',
      pause_reason: data.pause_reason ?? null,
      unlock_note: data.unlock_note ?? null,
      updated_at: now,
      updated_by: getUpdatedBy(),
    });
    return { ok: true };
  } finally {
    db.close();
  }
}

/** --merge <story-id> --inline —— 重排 / 暫停 / 解鎖：部分更新既有列，欄位未提供者沿用現值。 */
function mergeTrackPlan(dbPath, storyId, updates) {
  const errors = validateFields({ ...updates, story_id: storyId }, { requireLane: false });
  if (errors.length > 0) return { ok: false, errors };

  const db = openDb(dbPath);
  try {
    const existing = db.prepare('SELECT * FROM track_plan WHERE story_id = ?').get(storyId);
    if (!existing) {
      return { ok: false, errors: [`track_plan 無此 story_id 列: ${storyId}（請先用 --inline 建卡）`] };
    }
    const merged = { ...existing, ...updates };
    db.prepare(`
      UPDATE track_plan SET lane=@lane, seq=@seq, plan_state=@plan_state,
        pause_reason=@pause_reason, unlock_note=@unlock_note, updated_at=@updated_at, updated_by=@updated_by
      WHERE story_id=@story_id
    `).run({
      story_id: storyId,
      lane: merged.lane,
      seq: merged.seq ?? null,
      plan_state: merged.plan_state,
      pause_reason: merged.pause_reason ?? null,
      unlock_note: merged.unlock_note ?? null,
      updated_at: getTaiwanTimestamp(),
      updated_by: getUpdatedBy(),
    });
    return { ok: true };
  } finally {
    db.close();
  }
}

// ============================================================
// CLI 入口
// ============================================================

function usage() {
  console.log('Usage:');
  console.log("  node upsert-track-plan.js --inline '<json>'                    # 建卡（story_id+lane 必填）");
  console.log("  node upsert-track-plan.js --merge <story-id> --inline '<json>'  # 重排/暫停/解鎖（部分更新）");
  console.log('  ... --db <path>                                                 # 測試用隔離 DB');
}

/** [tdb-1 CR F9] JSON 解析錯誤轉可讀訊息 —— 原先裸 JSON.parse 會噴 SyntaxError stack。 */
function parseInlineJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ --inline JSON 解析失敗: ${err.message}`);
    console.error(`   收到的字串: ${raw}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rawArgs = process.argv.slice(2);
  const dbIdx = rawArgs.indexOf('--db');
  // [tdb-1 CR F6] --db 為最後一個參數時 rawArgs[dbIdx+1] 為 undefined，會靜默回退 DEFAULT_DB_PATH
  // 而改寫生產 phycool.db —— 破壞 BR-006「僅 temp DB 有列」的隔離保證。缺值一律中止。
  if (dbIdx >= 0 && !rawArgs[dbIdx + 1]) {
    console.error('❌ --db 缺少路徑參數（避免靜默回退寫入生產 phycool.db）');
    usage();
    process.exit(1);
  }
  const dbPath = dbIdx >= 0 ? rawArgs[dbIdx + 1] : undefined;
  const args = dbIdx >= 0 ? [...rawArgs.slice(0, dbIdx), ...rawArgs.slice(dbIdx + 2)] : rawArgs;

  let result;
  let reportedId;
  if (args[0] === '--merge') {
    const storyId = args[1];
    if (!storyId || args[2] !== '--inline' || !args[3]) {
      usage();
      process.exit(1);
    }
    reportedId = storyId;
    result = mergeTrackPlan(dbPath, storyId, parseInlineJson(args[3]));
  } else if (args[0] === '--inline' && args[1]) {
    const data = parseInlineJson(args[1]);
    reportedId = data.story_id;
    result = upsertTrackPlan(dbPath, data);
  } else {
    usage();
    process.exit(1);
  }

  if (!result.ok) {
    console.error('❌ upsert-track-plan 失敗:');
    for (const e of result.errors) console.error(`   - ${e}`);
    process.exit(1);
  }
  console.log(`✅ track_plan ${reportedId} 已寫入`);
}

export { upsertTrackPlan, mergeTrackPlan, validateFields, LANE_VALUES, PLAN_STATE_VALUES, KNOWN_FIELDS };
