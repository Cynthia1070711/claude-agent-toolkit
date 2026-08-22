// ============================================================
// [whp-6-directive-delivery-and-close] D1 開場注入讀取器
//
// 讀本 run 待送的 controller-to-worker 指示(worker_messages),依 seq 排序印到
// stdout 供 4 支 worker-*.ps1 在 `& claude` 前併入 $userTask。讀取即在同一交易內
// 標 delivered/D1(除非 --no-mark),不影響其他列。四種異常一律 fail-open(exit 0 +
// 空 stdout),僅引數無法解析回 exit 3(BR-004)。診斷訊息一律走 stderr,stdout 只
// 承載給 worker 讀的內容(BR-005)。
//
// `--consume <ids>` 子模式(CAS,冪等):worker agent 執行完指示後呼叫,標記
// consumed_at,不重覆消費(BR-006)。DD-2(Spec §7):不新增第五個 MCP tool,
// 走 CLI 子模式。
// ============================================================
// 使用方式:
//   node read-worker-directives.js --run-id <run_id> [--no-mark] [--db <path>]
//   node read-worker-directives.js --consume <msg_id[,msg_id...]> [--db <path>]
// Exit codes: 0=正常(含 fail-open 四種異常) / 3=參數無法解析
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'phycool.db');

const BANNER_OPEN = '========== 中控指示(D1 開場注入 · 必讀後執行)==========';
const BANNER_CLOSE = '========== 中控指示結束 · 讀畢後先執行指示,再繼續原任務 ==========';

function openDb(dbPath) {
  const db = new Database(dbPath || DB_PATH, { fileMustExist: true });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** BR-001/BR-002: 讀本 run 待送 controller-to-worker 指示,同一交易內標 delivered/D1。*/
export function readDirectives(runId, opts = {}) {
  const { dbPath, noMark = false } = opts;
  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();
    const txn = db.transaction(() => {
      const rows = db.prepare(
        `SELECT msg_id, seq, msg_type, body FROM worker_messages
         WHERE run_id=@run_id AND direction='controller-to-worker' AND state='pending'
         ORDER BY seq ASC`
      ).all({ run_id: runId });
      if (rows.length > 0 && !noMark) {
        const mark = db.prepare(
          `UPDATE worker_messages SET state='delivered', delivered_via='D1', delivered_at=@now WHERE msg_id=@id`
        );
        for (const r of rows) mark.run({ id: r.msg_id, now });
      }
      return rows;
    });
    return { rows: txn.immediate() };
  } finally {
    db.close();
  }
}

/**
 * BR-005: banner + 逐則 [中控指示 seq=N type=T msg_id=M] + body 逐字 + 結尾 banner。
 * msg_id 必須出現在標籤行 —— protocol-template.md 的四步行為約定第 4 步要求 worker 執行完指示後
 * 呼叫 `--consume {msg_id}`,而 `--consume` 的 CAS 只吃 msg_id(seq 是 run 內序號,非主鍵)。
 * 標籤行若不印 msg_id,worker 結構上無從取得該值,consume 半場即不可達(CR 2026-08-01 修復)。
 */
export function formatDirectiveBlock(rows) {
  const lines = [BANNER_OPEN];
  for (const r of rows) {
    lines.push('');
    lines.push(`[中控指示 seq=${r.seq} type=${r.msg_type} msg_id=${r.msg_id}]`);
    lines.push(r.body);
  }
  lines.push('');
  lines.push(BANNER_CLOSE);
  return lines.join('\n');
}

/** BR-006: --consume 子模式,CAS WHERE msg_id=? AND state='delivered',冪等。*/
export function consumeMessages(ids, opts = {}) {
  const { dbPath } = opts;
  const db = openDb(dbPath);
  try {
    const now = getTaiwanTimestamp();
    const stmt = db.prepare(
      `UPDATE worker_messages SET state='consumed', consumed_at=@now WHERE msg_id=@id AND state='delivered'`
    );
    // 多 id 包在單一交易內:任一 id 觸發 DB 錯誤時整批回滾,不留下「前幾筆已 consumed、
    // 回報 JSON 卻遺失」的中間態(cliMain 的 catch 只印 stderr 且回 exit 0,worker 無從得知
    // 哪幾筆成功)。CR 2026-08-01 修復。
    const txn = db.transaction((idList) => {
      const applied = [];
      const skipped = [];
      for (const id of idList) {
        const info = stmt.run({ id, now });
        if (info.changes > 0) applied.push(id);
        else skipped.push(id);
      }
      return { applied, skipped };
    });
    return txn.immediate(ids);
  } finally {
    db.close();
  }
}

// ---------- CLI 入口 ----------

export function parseArgs(argv) {
  const out = { runId: null, noMark: false, dbPath: null, consume: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run-id') {
      const v = argv[++i];
      if (v === undefined) { out.error = '缺少 --run-id 的值'; return out; }
      out.runId = v;
    } else if (a === '--no-mark') {
      out.noMark = true;
    } else if (a === '--db') {
      const v = argv[++i];
      if (v === undefined) { out.error = '缺少 --db 的值'; return out; }
      out.dbPath = v;
    } else if (a === '--consume') {
      const v = argv[++i];
      if (v === undefined) { out.error = '缺少 --consume 的值'; return out; }
      out.consume = v.split(',').map(s => s.trim()).filter(Boolean).map(Number);
    } else {
      out.error = `未知參數: ${a}`;
      return out;
    }
  }
  return out;
}

export function cliMain(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`[read-worker-directives] 參數錯誤: ${args.error}`);
    return 3;
  }

  if (args.consume) {
    try {
      const result = consumeMessages(args.consume, { dbPath: args.dbPath });
      console.log(JSON.stringify(result));
      return 0;
    } catch (err) {
      console.error(`[read-worker-directives] --consume 失敗: ${err.message}`);
      return 0;
    }
  }

  // BR-004: 未帶 --run-id 亦視為 fail-open 異常之一,非引數解析失敗。
  if (!args.runId) {
    console.error('[read-worker-directives] 未帶 --run-id,略過(fail-open)');
    return 0;
  }

  try {
    const { rows } = readDirectives(args.runId, { dbPath: args.dbPath, noMark: args.noMark });
    if (rows.length === 0) {
      console.error(`[read-worker-directives] run_id=${args.runId} 無待送指示(fail-open)`);
      return 0;
    }
    console.log(formatDirectiveBlock(rows));
    return 0;
  } catch (err) {
    // BR-004: DB 不存在 / 表不存在等任何讀取異常一律 fail-open,worker 照跑原任務。
    console.error(`[read-worker-directives] 讀取失敗,fail-open: ${err.message}`);
    return 0;
  }
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  process.exit(cliMain(process.argv.slice(2)));
}
