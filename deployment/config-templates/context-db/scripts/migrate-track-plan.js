// ============================================================
// [tdb-1-track-plan-roadmap] One-shot idempotent migration — 30 列常數表(五軌 stories)
// → track_plan(lane / seq / plan_state)。
//
// 用法:
//   node .context-db/scripts/migrate-track-plan.js --report
//   node .context-db/scripts/migrate-track-plan.js --report --db <path>   (測試用隔離 DB)
//
// 設計依據:SDD Spec §2(docs/implementation-artifacts/specs/epic-tdb/tdb-1-track-plan-roadmap-spec.md)。
// 全程單一 transaction,`ON CONFLICT(story_id) DO NOTHING` 為冪等鍵 —— 中控事後以
// upsert-track-plan.js 重排的結果(seq/lane 手改)不被重跑抹掉。lane/seq 來源刻意不解析
// 即將凍結的推進地圖 .md,改用內嵌常數表(對齊 2026-07-28 09:11 版本三章節,見 §1)。
// plan_state 由「本次執行當下」的 stories.status 即時判定(非常數表欄位)——
// 終態 status(見 TERMINAL_STATUSES)一律 done-exited + seq=NULL,其餘 queued + 常數表 seq。
// FK 完整性採全有全無:常數表任一 story_id 不存在於 stories → 不執行任何寫入(abort)。
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'phycool.db');

// ============================================================
// §1 30 列常數表(story_id / lane / seq)—— 逐字對齊
// docs/tracking/active/多軌推進地圖-bwu-whp-tddevenv.md(2026-07-28 09:11 版)三章節。
// seq 沿用地圖全域連續編號(手動軌 1-9 / dispatch 軌 10-13 / 收口 14-17)。
// done 卡(18-30)seq 標 null 僅供閱讀對照 —— 執行時 plan_state 由 live status 判定,
// 終態一律覆寫 seq=NULL,此欄位值不影響邏輯。done 卡 lane 依歷史執行載體歸類
// (whp/ccb/td-devenv 十一張皆 dispatch 子視窗產出;bwu-1/bwu-2 為手動軌基礎交付) ——
// done-exited 卡不入 /roadmap lane 分組渲染,此欄位僅供 schema NOT NULL 完整性與稽核可讀性。
// ============================================================

const SOURCE_ROWS = [
  // 手動軌(manual)— 待推 9
  { story_id: 'bwu-3-dev-consume-review-audit', lane: 'manual', seq: 1 },
  { story_id: 'bwu-5-manual-window-inject-hook', lane: 'manual', seq: 2 },
  { story_id: 'whp-4-write-path-wiring', lane: 'manual', seq: 3 },
  { story_id: 'whp-2-no-autoclose-liveness', lane: 'manual', seq: 4 },
  { story_id: 'ccb-2-unread-inject-hook', lane: 'manual', seq: 5 },
  { story_id: 'whp-6-directive-delivery-and-close', lane: 'manual', seq: 6 },
  { story_id: 'whp-8-report-ack-notify', lane: 'manual', seq: 7 },
  { story_id: 'whp-11-d2-inline-revise', lane: 'manual', seq: 8 },
  { story_id: 'tdb-4-snapshot-retire', lane: 'manual', seq: 9 },
  // dispatch 軌(中控派發)— 待推 4
  { story_id: 'tdb-3-sop-skill', lane: 'dispatch', seq: 10 },
  { story_id: 'tdb-1-track-plan-roadmap', lane: 'dispatch', seq: 11 },
  { story_id: 'tdb-2-sprint-status-freeze-refs', lane: 'dispatch', seq: 12 },
  { story_id: 'bwu-4-p1-distill-and-coverage', lane: 'dispatch', seq: 13 },
  // 收口(reconcile)— 待推 4
  { story_id: 'whp-worker-handshake-protocol', lane: 'reconcile', seq: 14 },
  { story_id: 'bwu-bmad-spec-closure-upgrade', lane: 'reconcile', seq: 15 },
  { story_id: 'ccb-controller-chat-board', lane: 'reconcile', seq: 16 },
  { story_id: 'tdb-controller-track-db', lane: 'reconcile', seq: 17 },
  // done(13)— seq 執行時一律覆寫 NULL,lane 依歷史執行載體歸類(見上方註解)
  { story_id: 'bwu-1-inject-and-drift-repair', lane: 'manual', seq: null },
  { story_id: 'bwu-2-create-testspec-production', lane: 'manual', seq: null },
  { story_id: 'whp-1-poc-resume-and-closeevent', lane: 'dispatch', seq: null },
  { story_id: 'whp-3-db-schema-registry', lane: 'dispatch', seq: null },
  { story_id: 'whp-5-message-bus-mcp', lane: 'dispatch', seq: null },
  { story_id: 'whp-7-guardian-daemon', lane: 'dispatch', seq: null },
  { story_id: 'whp-9-devconsole-api', lane: 'dispatch', seq: null },
  { story_id: 'whp-10-devconsole-ui', lane: 'dispatch', seq: null },
  { story_id: 'ccb-1-db-mcp-import', lane: 'dispatch', seq: null },
  { story_id: 'ccb-3-devconsole-channel-page', lane: 'dispatch', seq: null },
  { story_id: 'td-devenv-guard-tooling-repair', lane: 'dispatch', seq: null },
  { story_id: 'td-devenv-guard-psenc-doc-convergence', lane: 'dispatch', seq: null },
  { story_id: 'td-devenv-guard-gate-false-signal-repair', lane: 'dispatch', seq: null },
];

// 終態 status 集合 —— 對齊 roadmapService 渲染母體退出條件,顯式含 skipped/deleted
// (CANCELLED_STATUSES 前端常數僅 4 值,不含此二值,見 dev_notes 陷阱 #3)。
const TERMINAL_STATUSES = new Set(['done', 'cancelled', 'cancelled-merged', 'superseded', 'split', 'skipped', 'deleted']);

function openDb(dbPath) {
  const db = new Database(dbPath || DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * @param {string} [dbPath]
 * @param {{rows?: Array}} [opts] — opts.rows overrides SOURCE_ROWS(tests inject fixture rows,e.g. FK-missing case)。
 * @returns {{aborted:boolean, missingIds?:string[], inserted:number, unchanged:number, mismatch:Array, rows:Array}}
 */
function runMigrate(dbPath, opts = {}) {
  const sourceRows = opts.rows || SOURCE_ROWS;
  const db = openDb(dbPath);
  try {
    const ids = sourceRows.map(r => r.story_id);
    const placeholders = ids.map(() => '?').join(',');
    const statusRows = db.prepare(`SELECT story_id, status FROM stories WHERE story_id IN (${placeholders})`).all(...ids);
    const statusMap = new Map(statusRows.map(r => [r.story_id, r.status]));

    const missingIds = ids.filter(id => !statusMap.has(id));
    if (missingIds.length > 0) {
      return { aborted: true, missingIds, inserted: 0, unchanged: 0, mismatch: [], rows: [] };
    }

    let inserted = 0;
    const now = getTaiwanTimestamp();

    const txn = db.transaction(() => {
      const insRow = db.prepare(`
        INSERT INTO track_plan (story_id, lane, seq, plan_state, pause_reason, unlock_note, updated_at, updated_by)
        VALUES (@story_id, @lane, @seq, @plan_state, NULL, NULL, @updated_at, @updated_by)
        ON CONFLICT(story_id) DO NOTHING
      `);
      for (const row of sourceRows) {
        const status = statusMap.get(row.story_id);
        const isTerminal = TERMINAL_STATUSES.has(status);
        const info = insRow.run({
          story_id: row.story_id,
          lane: row.lane,
          seq: isTerminal ? null : row.seq,
          plan_state: isTerminal ? 'done-exited' : 'queued',
          updated_at: now,
          updated_by: 'migrate-track-plan',
        });
        if (info.changes > 0) inserted++;
      }
    });
    txn.immediate();

    const finalRows = db.prepare(`SELECT story_id, lane, seq, plan_state, updated_at FROM track_plan WHERE story_id IN (${placeholders})`).all(...ids);
    const finalMap = new Map(finalRows.map(r => [r.story_id, r]));
    const mismatch = [];
    for (const row of sourceRows) {
      const final = finalMap.get(row.story_id);
      if (final && final.lane !== row.lane) {
        mismatch.push({ story_id: row.story_id, expected_lane: row.lane, actual_lane: final.lane });
      }
    }

    return {
      aborted: false,
      inserted,
      unchanged: sourceRows.length - inserted,
      mismatch,
      rows: sourceRows.map(r => ({ story_id: r.story_id, ...finalMap.get(r.story_id) })),
    };
  } finally {
    db.close();
  }
}

function printReport(result) {
  if (result.aborted) {
    console.error('❌ migrate-track-plan 中止 —— 常數表以下 story_id 不存在於 stories 表:');
    for (const id of result.missingIds) console.error(`   - ${id}`);
    console.error('transaction 未執行,track_plan 零列變動。');
    return;
  }
  console.log('=== migrate-track-plan 對帳報告 ===');
  console.log('story_id                                          | lane      | seq  | plan_state');
  for (const r of result.rows) {
    console.log(`${r.story_id.padEnd(50)} | ${(r.lane || '').padEnd(9)} | ${String(r.seq ?? '-').padStart(4)} | ${r.plan_state}`);
  }
  console.log('---');
  console.log(`inserted=${result.inserted} unchanged=${result.unchanged} mismatch=${JSON.stringify(result.mismatch)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const wantsReport = args.includes('--report');
  const dbIdx = args.indexOf('--db');
  // [tdb-1 CR F6] --db 為最後一個參數時 args[dbIdx+1] 為 undefined，openDb() 會靜默回退
  // DEFAULT_DB_PATH 而寫入生產 phycool.db —— 破壞 BR-006「僅 temp DB 有列，預設 phycool.db
  // 列數不變」的隔離保證（測試情境下尤其危險：一個打錯的參數就污染真實排程資料）。缺值一律中止。
  if (dbIdx >= 0 && !args[dbIdx + 1]) {
    console.error('❌ --db 缺少路徑參數（避免靜默回退寫入生產 phycool.db）');
    process.exit(1);
  }
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;

  try {
    const result = runMigrate(dbPath);
    if (wantsReport) printReport(result);
    process.exit(result.aborted ? 1 : 0);
  } catch (err) {
    console.error(`❌ migrate-track-plan 失敗: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  }
}

export { runMigrate, SOURCE_ROWS, TERMINAL_STATUSES };
