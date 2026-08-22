// ============================================================
// PhyCool Context Memory DB — worker_runs 通用 upsert 工具
// [whp-3-db-schema-registry] worker_runs 同時有三個並行寫入者(Stop hook 心跳 /
// 守護健康旗標 / 中控 ack 與裁決),merge 模式必須是「欄位範圍 UPDATE」,絕不可
// 照抄 upsert-story.js 的 read-modify-write + 整列取代式覆寫 —— 那會讓後寫者
// 用自己讀到的舊快照把另外兩者剛寫入的欄位靜默蓋回去(BR-009)。這是本檔唯一
// 刻意偏離 upsert-story.js 範式之處,請勿「順手統一」回去。
//
// 不接 embedding-sync.js:worker_runs 是運行狀態列,不是可檢索知識,與
// upsert-story.js 的 CMI-10 embedding 同步刻意不同。
// ============================================================
// 使用方式:
//   node .context-db/scripts/upsert-worker-run.js <json-file>                        # 完整 upsert
//   node .context-db/scripts/upsert-worker-run.js --inline '<json>'                  # 完整 upsert(inline)
//   node .context-db/scripts/upsert-worker-run.js --merge <run_id> <json-file>       # 部分更新(欄位範圍 UPDATE)
//   node .context-db/scripts/upsert-worker-run.js --merge <run_id> --inline '<json>' # 部分更新(inline)
// Flags: --quiet(抑制非錯誤 stdout)· --force-replace(繞過自動 merge 防護,完整覆寫既有列)
//
// Exit codes: 0=成功(含 merge 命中 0 列) / 1=WHP3-E01~E06(見 SDD Spec §4.1)
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

// worker_runs 39 欄(DDL 欄位順序)— 單一來源,KNOWN_COLUMNS 白名單由此派生,
// 供本檔 INSERT/UPDATE 欄位清單與測試 / 下游 whp-4 / whp-5 複用,避免兩處手key 漂移。
const ALL_ROW_COLUMNS = [
  'run_id', 'session_id', 'resumed_from_run_id', 'story_id', 'phase', 'attempt',
  'controller_track', 'run_mode', 'wrapper_pid', 'claude_pid', 'cmd_line',
  'window_title', 'ipc_dir', 'model_id', 'effort', 'work_root', 'baseline_commit',
  'lifecycle', 'close_source', 'last_status', 'evidence_incomplete', 'turn_count',
  'files_modified', 'health_flag', 'stall_rounds', 'reported_at', 'ack_at', 'ack_by',
  'notify_count', 'last_notified_at', 'window_vanished_at', 'abandoned_at_stage',
  'requires_attention', 'guardian_exit_reason', 'started_at', 'last_turn_at',
  'closed_at', 'closed_detected_at', 'updated_at',
];
export const KNOWN_COLUMNS = new Set(ALL_ROW_COLUMNS);

// 八態生命週期(SSoT §19)
export const LIFECYCLES = new Set([
  'dispatching', 'running', 'reported', 'awaiting-review', 'revising',
  'approved', 'closed', 'failed', 'abandoned',
]);

// 九分類關窗來源(SSoT §19)
export const CLOSE_SOURCES = new Set([
  'ControllerAfterHandshake', 'ControllerForce', 'UserClosed', 'ExternalKill',
  'PowerFailure', 'DispatchFailed', 'StartupFailed', 'Unknown',
]);

const REQUIRED_FULL_FIELDS = ['run_id', 'session_id', 'story_id', 'phase', 'ipc_dir'];

/** 帶 WHP3-Exx 代碼的錯誤 — 拋出而非直接 process.exit,CLI 層與測試各自決定如何處理。*/
export class WhpCliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new WhpCliError(code, message);
}

/** 欄位白名單清理(BR-010)— 未知 key 印出並丟棄,回傳新物件(不修改輸入)。*/
function stripUnknownColumns(payload) {
  const cleaned = { ...payload };
  const unknownKeys = Object.keys(cleaned).filter(k => !KNOWN_COLUMNS.has(k));
  if (unknownKeys.length > 0) {
    console.error(`⚠️  Unknown columns: [${unknownKeys.join(', ')}] — these will be IGNORED.`);
    for (const k of unknownKeys) delete cleaned[k];
  }
  return cleaned;
}

/** enum 驗證(BR-011/BR-012)— 呼叫前不得已寫入任何東西。*/
function validateEnums(payload) {
  if ('lifecycle' in payload && payload.lifecycle != null && !LIFECYCLES.has(payload.lifecycle)) {
    fail('WHP3-E02', `Illegal lifecycle value: "${payload.lifecycle}". Legal values: ${[...LIFECYCLES].join(', ')}`);
  }
  if ('close_source' in payload && payload.close_source != null && !CLOSE_SOURCES.has(payload.close_source)) {
    fail('WHP3-E03', `Illegal close_source value: "${payload.close_source}". Legal values: ${[...CLOSE_SOURCES].join(', ')}`);
  }
}

/** object/array 值自動 JSON.stringify(未來 files_modified 等結構化欄位安全網)。*/
function scalarize(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
}

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return db;
}

// ---------- 完整 upsert ----------

/**
 * @param {object} rawData
 * @param {{dbPath?: string, quiet?: boolean, forceReplace?: boolean}} [opts]
 */
// [2026-07-29] attempt 未顯式指定時自算:同 (story_id, phase) 既有最大值 +1。
// dispatch-general 原硬編 -Attempt 1 → 重派(斷電/失敗後二次派發)必撞 ux_worker_runs_key
// UNIQUE 索引而 Register abort(BC-03);自算後重派天然遞增。顯式傳入仍優先(測試/救援可控)。
function nextAttempt(db, storyId, phase) {
  const r = db.prepare('SELECT COALESCE(MAX(attempt), 0) + 1 AS next FROM worker_runs WHERE story_id = ? AND phase = ?').get(storyId, phase);
  return r ? r.next : 1;
}

export function fullUpsert(rawData, opts = {}) {
  const { dbPath = DB_PATH, quiet = false, forceReplace = false } = opts;
  const cleaned = stripUnknownColumns(rawData);
  validateEnums(cleaned);

  const db = openDb(dbPath);
  const existing = cleaned.run_id
    ? db.prepare('SELECT run_id FROM worker_runs WHERE run_id = ?').get(cleaned.run_id)
    : null;

  if (existing && !forceReplace) {
    db.close();
    if (!quiet) {
      console.log(`🛡️  worker_runs ${cleaned.run_id} 已存在,自動切換為 merge 模式(防止覆寫)`);
    }
    return mergeRun(cleaned.run_id, cleaned, { dbPath, quiet });
  }

  // BR-013: 必填欄位檢查 — 在開啟寫入交易之前(existing 查詢屬讀取,不算違反此序)
  const missing = REQUIRED_FULL_FIELDS.filter(f => !cleaned[f]);
  if (missing.length > 0) {
    db.close();
    fail('WHP3-E01', `Missing required field(s): ${missing.join(', ')}`);
  }

  const now = getTaiwanTimestamp();
  const row = {
    run_id: cleaned.run_id,
    session_id: cleaned.session_id,
    resumed_from_run_id: cleaned.resumed_from_run_id ?? null,
    story_id: cleaned.story_id,
    phase: cleaned.phase,
    attempt: cleaned.attempt ?? nextAttempt(db, cleaned.story_id, cleaned.phase),
    controller_track: cleaned.controller_track ?? 'unspecified',
    run_mode: cleaned.run_mode ?? 'window',
    wrapper_pid: cleaned.wrapper_pid ?? null,
    claude_pid: cleaned.claude_pid ?? null,
    cmd_line: cleaned.cmd_line ?? null,
    window_title: cleaned.window_title ?? null,
    ipc_dir: cleaned.ipc_dir,
    model_id: cleaned.model_id ?? null,
    effort: cleaned.effort ?? null,
    work_root: cleaned.work_root ?? null,
    baseline_commit: cleaned.baseline_commit ?? null,
    lifecycle: cleaned.lifecycle ?? 'dispatching',
    close_source: cleaned.close_source ?? null,
    last_status: cleaned.last_status ?? null,
    evidence_incomplete: cleaned.evidence_incomplete ?? 0,
    turn_count: cleaned.turn_count ?? 0,
    files_modified: scalarize(cleaned.files_modified ?? null),
    health_flag: cleaned.health_flag ?? null,
    stall_rounds: cleaned.stall_rounds ?? 0,
    reported_at: cleaned.reported_at ?? null,
    ack_at: cleaned.ack_at ?? null,
    ack_by: cleaned.ack_by ?? null,
    notify_count: cleaned.notify_count ?? 0,
    last_notified_at: cleaned.last_notified_at ?? null,
    window_vanished_at: cleaned.window_vanished_at ?? null,
    abandoned_at_stage: cleaned.abandoned_at_stage ?? null,
    requires_attention: cleaned.requires_attention ?? 0,
    guardian_exit_reason: cleaned.guardian_exit_reason ?? null,
    started_at: cleaned.started_at ?? now,
    last_turn_at: cleaned.last_turn_at ?? null,
    closed_at: cleaned.closed_at ?? null,
    closed_detected_at: cleaned.closed_detected_at ?? null,
    updated_at: cleaned.updated_at ?? now,
  };

  // 注意:全檔刻意不使用 SQL 整列取代式覆寫語法(對齊 AC6 逐字驗證)—— 全新列走純 INSERT;
  // --force-replace 對既有列走全欄位 UPDATE 達成同等「完整覆寫」語意,而非 upsert-story.js
  // 慣用的整列取代寫法(該寫法對 worker_runs 這種多寫入者的表風險更高,見檔頭說明)。
  if (existing) {
    // force-replace 分支:existing && forceReplace 才會走到這裡(見上方 118 行判斷)
    const setClause = ALL_ROW_COLUMNS.filter(c => c !== 'run_id').map(c => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE worker_runs SET ${setClause} WHERE run_id = @run_id`).run(row);
  } else {
    const colList = ALL_ROW_COLUMNS.join(', ');
    const paramList = ALL_ROW_COLUMNS.map(c => `@${c}`).join(', ');
    db.prepare(`INSERT INTO worker_runs (${colList}) VALUES (${paramList})`).run(row);
  }

  db.close();
  if (!quiet) console.log(`✅ worker_runs ${row.run_id} 已寫入 DB`);
  return row;
}

// ---------- 部分更新(欄位範圍 UPDATE,BR-009 核心) ----------

/**
 * @param {string} runId
 * @param {object} rawUpdates
 * @param {{dbPath?: string, quiet?: boolean}} [opts]
 */
export function mergeRun(runId, rawUpdates, opts = {}) {
  const { dbPath = DB_PATH, quiet = false } = opts;
  const cleaned = stripUnknownColumns(rawUpdates);
  // run_id 是 WHERE 鍵;updated_at 由本函式統一寫入(見下方 setClauses 尾端),不接受呼叫端
  // 覆寫 —— 否則 SET 子句會出現重複的 `updated_at = @updated_at`(SQLite 容忍且後者勝出,
  // 但 PostgreSQL / MySQL 會直接報 multiple assignments to same column),且會靜默推翻
  // 「merge 一律刷新 updated_at」這個由測試把關的不變量。
  const setCols = Object.keys(cleaned).filter(k => k !== 'run_id' && k !== 'updated_at');

  // BR-010: 清理後 0 有效欄位 → E04(在觸碰 DB 之前判定)
  if (setCols.length === 0) {
    fail('WHP3-E04', 'No valid columns to merge after removing unknown/managed keys (run_id and updated_at are managed by this tool).');
  }

  validateEnums(cleaned);

  const db = openDb(dbPath);
  const existing = db.prepare('SELECT run_id FROM worker_runs WHERE run_id = ?').get(runId);
  if (!existing) {
    db.close();
    fail('WHP3-E05', `run_id "${runId}" does not exist. Use full upsert to create it first.`);
  }

  const now = getTaiwanTimestamp();
  const setClauses = setCols.map(k => `${k} = @${k}`).join(', ');
  const params = { run_id: runId, updated_at: now };
  for (const k of setCols) params[k] = scalarize(cleaned[k]);

  const info = db.prepare(
    `UPDATE worker_runs SET ${setClauses}, updated_at = @updated_at WHERE run_id = @run_id`
  ).run(params);

  db.close();
  if (!quiet) {
    console.log(`🔀 worker_runs ${runId} 已 merge 更新(${setCols.length} 個欄位,changes=${info.changes})`);
  }
  return info;
}

// ---------- CLI 入口(僅在直接執行時跑,匯入供測試時不觸發) ----------

export function printUsage() {
  console.log('Usage:');
  console.log('  node upsert-worker-run.js <json-file>                        # 完整 upsert');
  console.log("  node upsert-worker-run.js --inline '<json>'                  # 完整 upsert(inline)");
  console.log('  node upsert-worker-run.js --merge <run_id> <json-file>       # 部分更新(欄位範圍 UPDATE)');
  console.log("  node upsert-worker-run.js --merge <run_id> --inline '<json>' # 部分更新(inline)");
  console.log('Flags: --quiet(抑制非錯誤 stdout)· --force-replace(完整覆寫既有列)');
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

export function cliMain(rawArgs) {
  const quiet = rawArgs.includes('--quiet');
  const forceReplace = rawArgs.includes('--force-replace');
  const args = rawArgs.filter(a => !['--quiet', '--force-replace'].includes(a));

  // --help / -h 必須在「零參數才印 usage」判斷之前攔截,避免被當成檔案路徑
  // (既有坑:upsert-story.js 無此攔截,--help 會被 path.resolve 後嘗試當 JSON 檔讀取而 ENOENT)
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return 0;
  }
  if (args.length === 0) {
    printUsage();
    return 1;
  }

  try {
    if (args[0] === '--merge') {
      const runId = args[1];
      let updates;
      if (args[2] === '--inline') {
        updates = JSON.parse(args[3]);
      } else {
        updates = readJsonFile(path.resolve(args[2]));
      }
      mergeRun(runId, updates, { quiet });
    } else {
      let data;
      if (args[0] === '--inline') {
        data = JSON.parse(args[1]);
      } else {
        data = readJsonFile(path.resolve(args[0]));
      }
      fullUpsert(data, { quiet, forceReplace });
    }
    return 0;
  } catch (err) {
    const code = err instanceof WhpCliError ? err.code : 'WHP3-E06';
    console.error(`❌ ${code}: ${err.message}`);
    return 1;
  }
}

// Guard: 只在「本檔就是 node 的執行入口」時跑 CLI。
// 🔴 不可改回 `!process.env.VITEST` —— 那個判準只有 vitest 會設,任何其他 Node process
// (含下游 whp-4 / whp-5 依檔頭第 33 行明示的方式 import KNOWN_COLUMNS / fullUpsert)
// 一 import 本模組就會執行 CLI 副作用並 process.exit,把 importing process 直接殺掉。
// 對齊同目錄 log-session.js:446 / log-turn.js:186 / log-workflow.js:199 的既有 idiom。
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  process.exit(cliMain(process.argv.slice(2)));
}
