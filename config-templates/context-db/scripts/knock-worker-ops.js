// ============================================================
// [whp-12-knock-console-inject] 慢環敲門 worker 域決策層
//
// 分層同 close-worker-ops.js 的 DD-1:凡「判活 / 查詢 / 文字組裝 / CAS 寫入」一律在 Node 側,
// knock-worker.ps1(PowerShell)只做「只有 PowerShell 能做的事」—— 呼叫敲門原語、轉述結果。
// 這一層一行 Win32、一行 kill 都沒有。
//
// 🔴 零第二套實作(BR-015 / BR-018 / BR-020):
//   judgeLiveness / probeLiveProcesses  <- reap-worker-runs.js(4-Tuple 判活的權威實作)
//   peekPending / stampKnocked / buildKnockDecision <- worker-directive-poll.cjs(D2 快環同一組)
// 敲門文字與 D2 逐字同源,收件端因此不需要第二套協議(protocol-template.md §D2 兩環通用)。
// ============================================================
// 使用方式:
//   node knock-worker-ops.js --run-id <uuid> [--db <path>]              # 決策(零副作用)
//   node knock-worker-ops.js --stamp <uuid> --msg-ids 41,42 [--db <path>]  # 注入成功後標記
// Exit codes: 0=決策完成(含合法 no-op) / 2=前置未過或判活探測不可用(fail-closed)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';
import { judgeLiveness, probeLiveProcesses } from './reap-worker-runs.js';

const require = createRequire(import.meta.url);
// worker-directive-poll.cjs 是 CommonJS(此目錄 package.json 宣告 "type":"module",故該檔用 .cjs)。
// 反過來寫會炸 —— whp-8 踩過同一個坑,且隔離單元測試測不出來,只有端到端 spawn 才捕捉得到。
const { peekPending, stampKnocked, buildKnockDecision } = require('./worker-directive-poll.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH     = path.join(__dirname, '..', 'phycool.db');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json');

/** 秒精度(whp-12 CR F3)。`worker_messages.knocked_at` 由兩環共寫:D2 快環經 stop-report.ps1 的
 *  `Get-Date -Format 'yyyy-MM-ddTHH:mm:ss+08:00'`(秒精度),慢環若直接用 getTaiwanTimestamp()
 *  會寫進毫秒版,同一欄位出現兩種形狀 —— 而 whp-11 的 T-WHP11-D2-16 正是以秒精度 regex 釘住該欄。
 *  兩者皆 offset-aware(constitutional §Timestamp Mandate 無虞),此處統一的是欄位內的精度一致性。 */
export function secondPrecision(ts) {
  return String(ts).replace(/\.\d+(?=[+-]\d{2}:\d{2}$)/, '');
}

/** BR-017:敲門的使用場景是 revise 迴圈 —— worker 已經回報過。這份白名單同時也是
 *  BR-006(mid-turn 注入)風險的正常路徑防線:`running` 不在其中,故正常呼叫不會打到執行中的 turn。 */
export const KNOCKABLE_LIFECYCLES = ['reported', 'awaiting-review', 'revising'];

function openDb(dbPath, readonly) {
  const db = new Database(dbPath || DB_PATH, readonly ? { readonly: true } : undefined);
  db.pragma('busy_timeout = 5000');
  if (!readonly) db.pragma('journal_mode = WAL');
  return db;
}

/** BR-022:kill switch。缺鍵預設 true —— PoC 已判定 viable(見 Story dev_notes 的 PoC 判定段),
 *  故預設值是「開」。config 讀不到時同樣回 true:讀不到設定不該讓一個已驗證的通道靜默失效。
 *
 *  🔴 嚴格 boolean(whp-12 CR F2)。原本寫 `v !== false`,於是 `"false"` / `0` / `"off"` 全都落在
 *  「開」—— 這個鍵存在的唯一目的就是緊急關閉,打錯型別卻靜默維持開啟是最不該有的失敗方向。
 *  方向仍維持「預設開」(不因一個打錯的值就關掉已驗證的通道,對齊 resolveGraceSec 的同一判斷),
 *  但改為**可被察覺**:回傳 shape 比照 resolveGraceSec 的 {value, clamped},由呼叫端把它送進輸出。
 *  @returns {{enabled: boolean, invalid: boolean}} invalid = 鍵存在但不是 boolean
 */
export function resolveKnockEnabled(configPath) {
  try {
    const raw = fs.readFileSync(configPath || CONFIG_PATH, 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    const v = cfg && cfg.workerProtocol ? cfg.workerProtocol.knockEnabled : undefined;
    if (v === undefined || v === null) return { enabled: true, invalid: false };
    if (typeof v !== 'boolean') return { enabled: true, invalid: true };
    return { enabled: v, invalid: false };
  } catch {
    return { enabled: true, invalid: false };
  }
}

/**
 * 決策:要不要敲、敲誰、敲什麼。零副作用(不寫 DB、不碰目標進程)。
 * @returns {{ok:boolean, knocked:false, code:string|null, reason:string, exit:number,
 *            targetPid:number|null, text:string|null, msgIds:number[]}}
 */
export function decideKnock(runId, opts = {}) {
  const { dbPath, configPath, probeFn = probeLiveProcesses } = opts;
  const knockCfg = resolveKnockEnabled(configPath);
  const configWarning = knockCfg.invalid
    ? 'workerProtocol.knockEnabled 非 boolean,已視為 true —— kill switch 未生效,請改寫成 true/false'
    : null;
  const base = {
    ok: false, knocked: false, code: null, reason: '', exit: 0,
    targetPid: null, text: null, msgIds: [], configWarning,
  };

  if (!knockCfg.enabled) {
    return { ...base, reason: 'disabled', exit: 0 };
  }

  // BR-023 前半 —— fail-OPEN:DB 讀不到就不敲。不敲門本身無害,不該讓 DB 小故障變成阻斷。
  let db;
  try {
    db = openDb(dbPath, true);
  } catch (e) {
    return { ...base, code: 'WHP12-E09', reason: `db-unavailable: ${e.message}`, exit: 0 };
  }

  try {
    let run;
    try {
      run = db.prepare('SELECT * FROM worker_runs WHERE run_id=?').get(runId);
    } catch (e) {
      return { ...base, code: 'WHP12-E09', reason: `db-unavailable: ${e.message}`, exit: 0 };
    }
    if (!run) {
      return { ...base, code: 'WHP12-E06', reason: 'run-not-found', exit: 2 };
    }

    // BR-023 後半 —— fail-CLOSED:判活探測不可用時絕不注入。對一個沒驗過的 PID 送按鍵,
    // 等於對陌生人的 console 打字;這與 close-worker.ps1 的 WHP6-E07 同一個道理。
    let liveProcMap;
    try {
      liveProcMap = probeFn();
    } catch (e) {
      return { ...base, code: 'WHP12-E08', reason: `probe-unavailable: ${e.message}`, exit: 2 };
    }

    // BR-015 / BR-016:判活一律走 judgeLiveness(),本檔不得有第二套 PID/CommandLine 比對
    const verdict = judgeLiveness(run, liveProcMap);
    if (!verdict.alive) {
      return { ...base, code: 'WHP12-E06', reason: verdict.reason, exit: 2 };
    }

    // BR-017:lifecycle 白名單
    if (!KNOCKABLE_LIFECYCLES.includes(run.lifecycle)) {
      return {
        ...base, code: 'WHP12-E07', exit: 2,
        reason: `lifecycle '${run.lifecycle}' not in [${KNOCKABLE_LIFECYCLES.join(',')}]`,
      };
    }

    // BR-018:與 D2 共用同一個查詢形狀(含 knocked_at IS NULL 迴圈上界),故兩環物理互斥
    const peek = peekPending(db, { runId });
    if (!peek.ok) {
      return { ...base, code: 'WHP12-E09', reason: `peek-failed: ${peek.error}`, exit: 0 };
    }
    // BR-019:零 pending 是合法 no-op —— 中控可以投機敲門,那不是錯誤
    if (peek.rows.length === 0) {
      return { ...base, reason: 'no-pending', exit: 0 };
    }

    // BR-020:文字逐字取自 buildKnockDecision,不自行格式化。一分歧,收件端就需要第二套協議。
    const decision = buildKnockDecision(peek.rows, runId);

    return {
      ok: true, knocked: false, code: null, reason: 'ready', exit: 0,
      targetPid: Number(run.wrapper_pid),   // AttachConsole 目標:與 judgeLiveness 驗的是同一個 PID
      text: decision.reason,
      msgIds: peek.rows.map((r) => r.msg_id),
      configWarning,
    };
  } finally {
    try { db.close(); } catch { }
  }
}

/**
 * BR-021:注入成功之後才標記。先 stamp 再注入的話,一次失敗就永久吃掉該指示的敲門預算
 * (peekPending 的 knocked_at IS NULL 會從此排除它)。反向風險(stamp 前 crash -> 重複敲一次)
 * 已評估可接受:代價只是 worker 多讀一次 DB。
 * 獨立開一條可寫連線 —— decideKnock 那條是 readonly(對齊 whp-11 CR 對 D2 的同一項修正)。
 */
export function stampAfterKnock(runId, msgIds, opts = {}) {
  const { dbPath, now = secondPrecision(getTaiwanTimestamp()) } = opts;
  let db;
  try {
    db = openDb(dbPath, false);
  } catch (e) {
    return { ok: false, changes: 0, error: `db-unavailable: ${e.message}` };
  }
  try {
    const res = stampKnocked(db, { msgIds, now });
    return { ok: res.ok, changes: res.changes, error: res.error };
  } finally {
    try { db.close(); } catch { }
  }
}

// ---------- CLI ----------

export function parseArgs(argv) {
  const out = { runId: null, stampRunId: null, msgIds: [], dbPath: null, configPath: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run-id') out.runId = argv[++i];
    else if (a === '--stamp') out.stampRunId = argv[++i];
    else if (a === '--msg-ids') {
      const raw = argv[++i] || '';
      out.msgIds = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    } else if (a === '--db') out.dbPath = argv[++i];
    else if (a === '--config') out.configPath = argv[++i];
    else { out.error = `未知參數: ${a}`; return out; }
  }
  if (!out.runId && !out.stampRunId) out.error = '需指定 --run-id(決策)或 --stamp(標記)';
  if (out.stampRunId && out.msgIds.length === 0) out.error = '--stamp 需搭配 --msg-ids';
  return out;
}

export function cliMain(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.log(JSON.stringify({ ok: false, code: 'WHP12-E10', reason: args.error, exit: 2 }));
    return 2;
  }

  if (args.stampRunId) {
    const res = stampAfterKnock(args.stampRunId, args.msgIds, { dbPath: args.dbPath });
    console.log(JSON.stringify({ ok: res.ok, changes: res.changes, error: res.error || null }));
    return 0;   // stamp 失敗不改變已送達的事實,故不以 exit code 表達(重複敲一次的代價是可接受的)
  }

  const d = decideKnock(args.runId, { dbPath: args.dbPath, configPath: args.configPath });
  // PowerShell 端跑 Set-StrictMode:每個它會讀的 key 都必須恆存在,否則 $result.xxx 會拋
  // "property cannot be found"(close-worker-ops.js 同一個教訓)。
  console.log(JSON.stringify({
    ok: false, knocked: false, code: null, reason: '', exit: 0,
    targetPid: null, text: null, msgIds: [], configWarning: null,
    ...d, run_id: args.runId,
  }));
  return d.exit;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(cliMain(process.argv.slice(2)));
}
