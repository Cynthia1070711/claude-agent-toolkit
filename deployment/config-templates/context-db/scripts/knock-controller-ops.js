// ============================================================
// [ccb-4-ctrl-notify-knock] 中控域敲門決策層
//
// 分層同 knock-worker-ops.js 的 DD-1:凡「判活 / 查詢 / 文字組裝 / 寫入」一律在 Node 側,
// knock-controller.ps1 只做「只有 PowerShell 能做的事」—— 呼叫敲門原語、轉述結果。
//
// 🔴 零第二套實作:
//   probeLiveProcesses                     <- reap-worker-runs.js(唯一的行程探測)
//   judgeWindowLiveness / findKnockTarget  <- ctrl-window-ops.cjs(中控域 2-Tuple)
//   countUnread                            <- ctrl-unread-sql.cjs(BR-009 未讀述詞定義站點)
//   注入本體                                <- console-knock.ps1(whp-12,逐字不改,BR-028)
//
// 🔴 為什麼敲門文字是純 ASCII 且不含軌名(BR-029):
//   `console-knock.ps1` 在任何 Win32 呼叫之前就拒絕任何碼位 < 0x20 或 > 0x7E 的字元,
//   而全部 6 個 canonical 軌名皆為 CJK。收件視窗本來就知道自己是哪一軌 —— 省略軌名不損資訊。
//
// 🔴 本檔與 knock-controller.ps1 對「終止行程 / 關閉視窗 / console 控制事件 / 視窗焦點」
//   四類操作零命中(含註解),BR-035 有靜態斷言把關。敲門是純加法通知:它不移除任何東西,
//   也不關閉任何東西。關窗是另一條路徑的職責,那條路徑有它自己的五項前置與 CAS 終態把關,
//   敲門不該成為繞過它們的後門。故此處一律以描述性措辭指涉,不寫出那些 API 的字面名稱
//   —— 否則靜態守護就得為註解開例外,「零命中」也就不再是零命中(whp-12 的同一個教訓)。
// ============================================================
// 使用方式:
//   node knock-controller-ops.js --track <軌名> [--db <path>]          # 決策(零副作用)
//   node knock-controller-ops.js --stamp <軌名> [--db <path>]          # 注入成功後標記
// Exit codes: 0=決策完成(含合法 no-op) / 1=注入失敗(由 .ps1 回報) / 2=前置未過或探測不可用
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { probeLiveProcesses } from './reap-worker-runs.js';

const require = createRequire(import.meta.url);
const { countUnread } = require('./ctrl-unread-sql.cjs');
const windowOps = require('./ctrl-window-ops.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH     = path.join(__dirname, '..', 'phycool.db');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json');
const AUDIT_LOG   = path.join(__dirname, '..', '..', 'logs', 'ctrl-channel-knock.log');

const DEFAULT_MIN_INTERVAL_SEC = 60;

/**
 * BR-040 的速率上界與 kill switch 都讀 `ctrlChannel`。
 * 嚴格型別(對齊 whp-12 CR F2 對 resolveKnockEnabled 的同一項修正):`"false"` / `0` / `"off"`
 * 這類打錯的值不得靜默落在「開」。方向仍維持預設開 —— 讀不到設定不該讓一個已驗證的通道失效
 * —— 但改為可被察覺:`invalid` 旗標由呼叫端送進輸出。
 */
export function resolveKnockConfig(configPath) {
  const out = { enabled: true, minIntervalSec: DEFAULT_MIN_INTERVAL_SEC, invalid: false };
  try {
    const raw = fs.readFileSync(configPath || CONFIG_PATH, 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    const c = cfg && cfg.ctrlChannel ? cfg.ctrlChannel : {};
    if (c.knockEnabled !== undefined && c.knockEnabled !== null) {
      if (typeof c.knockEnabled !== 'boolean') out.invalid = true;
      else out.enabled = c.knockEnabled;
    }
    if (typeof c.knockMinIntervalSec === 'number' && Number.isFinite(c.knockMinIntervalSec) && c.knockMinIntervalSec >= 0) {
      out.minIntervalSec = c.knockMinIntervalSec;
    }
  } catch {
    /* 讀不到設定 → 全用預設值 */
  }
  return out;
}

/**
 * BR-029 / BR-030:純 ASCII、含未讀數、含 `read_ctrl_messages` 字面、無軌名、無留言內容。
 * 內容只有「有幾則、去哪讀」—— 與 whp-11 D2 / whp-8 L2 digest 同一條「只敲門不推內容」紀律。
 */
export function buildKnockText(unread) {
  return `[ctrl-channel] ${unread} unread message(s) -- run read_ctrl_messages to read and sign off`;
}

/**
 * BR-032:判活不符時留下恰一行稽核。副作用而非分支 —— 不新增 exit code,自身出錯即吞掉。
 * 欄位順序把 reason 放最後:它允許含 '|',放最後才不會讓以分隔符為單位的解析出現歧義。
 */
export function writeAuditLine(entry, logPath) {
  const p = logPath || AUDIT_LOG;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = windowOps.getTaiwanTimestamp();
    const safe = String(entry.reason || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    fs.appendFileSync(p, `${ts} | track=${entry.track} | pid=${entry.pid == null ? '-' : entry.pid} | ${entry.code} | ${safe}\n`, 'utf8');
  } catch {
    /* 稽核寫入失敗不得改變敲門結果 */
  }
}

/** ISO 偏移量字串經 Date.parse 可正確比較。無法解析視為「從未敲過」,讓壞掉的時間戳自癒。 */
function intervalElapsed(lastKnockAt, minIntervalSec, nowMs) {
  if (!lastKnockAt) return true;
  const t = Date.parse(lastKnockAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t >= minIntervalSec * 1000;
}

/**
 * 決策:要不要敲、敲哪個 console、敲什麼。零副作用(不寫 DB、不碰目標行程)。
 *
 * 檢查順序刻意由便宜到昂貴:行程探測(實測 ~580ms / 413 行程)排在 kill switch、canonical
 * 驗證、綁定查詢、速率上界、未讀計數全部通過之後 —— 沒事要敲時,連探測都不必付。
 *
 * @returns {{ok:boolean, knocked:false, code:string|null, reason:string, exit:number,
 *            track:string|null, targetPid:number|null, sessionId:string|null, text:string|null,
 *            unread:number, ambiguous:boolean, configWarning:string|null}}
 */
export function decideKnock(track, opts = {}) {
  const { dbPath, configPath, probeFn = probeLiveProcesses, nowMs = Date.now(), logPath } = opts;
  const cfg = resolveKnockConfig(configPath);
  const base = {
    ok: false, knocked: false, code: null, reason: '', exit: 0,
    track: track || null, targetPid: null, sessionId: null, text: null, unread: 0, ambiguous: false,
    configWarning: cfg.invalid
      ? 'ctrlChannel.knockEnabled 非 boolean,已視為 true —— kill switch 未生效,請改寫成 true/false'
      : null,
  };

  // kill switch:真 no-op —— 零 DB 讀、零注入(AC4 明列)
  if (!cfg.enabled) return { ...base, reason: 'disabled', exit: 0 };

  if (!track || !String(track).trim()) {
    return { ...base, code: 'CCB4-E01', reason: '缺少 -Track 或為空字串', exit: 2 };
  }

  // BR-034 前半 —— fail-OPEN:DB 讀不到就不敲。不敲門本身無害,不該讓 DB 小故障變成阻斷。
  let db;
  try {
    db = new Database(dbPath || DB_PATH, { readonly: true });
    db.pragma('busy_timeout = 5000');
  } catch (e) {
    return { ...base, code: 'CCB4-E06', reason: `db-unavailable: ${e.message}`, exit: 0 };
  }

  try {
    let canonical;
    try {
      canonical = windowOps.loadCanonicalTracks(db);
    } catch (e) {
      return { ...base, code: 'CCB4-E06', reason: `db-unavailable: ${e.message}`, exit: 0 };
    }
    // BR-037 的同一條紀律用在這裡:只認 DB 真的知道的軌名。
    if (!canonical.includes(track)) {
      return { ...base, code: 'CCB4-E01', reason: `'${track}' 不在 canonical 軌別清單`, exit: 2 };
    }

    const { row, ambiguous } = windowOps.findKnockTarget(db, track);
    if (!row) {
      // 合法 no-op:該軌沒有已綁定的視窗。未綁定視窗零通知是使用者明定的硬邊界。
      return { ...base, code: 'CCB4-E02', reason: 'no-bound-window', exit: 0, ambiguous };
    }

    if (!row.console_pid || row.console_pid <= 0) {
      return {
        ...base, code: 'CCB4-E03', exit: 2, ambiguous,
        reason: 'console_pid IS NULL — 該視窗綁定時未解析出 console PID,不可敲門',
      };
    }

    // BR-040:速率上界。第二次呼叫落在區間內即 no-op,使敲門無法被迴圈灌爆一個 console。
    if (!intervalElapsed(row.last_knock_at, cfg.minIntervalSec, nowMs)) {
      return {
        ...base, exit: 0, ambiguous, targetPid: Number(row.console_pid),
        reason: `rate-limited: 距上次敲門未滿 ${cfg.minIntervalSec}s`,
      };
    }

    const { total } = countUnread(db, track);
    // BR-031:零未讀是合法 no-op —— 中控可以投機敲門,那不是錯誤。
    if (total === 0) {
      return { ...base, exit: 0, ambiguous, targetPid: Number(row.console_pid), reason: 'no-unread' };
    }

    // BR-034 後半 —— fail-CLOSED:探測不可用時絕不注入。對一個沒驗過的 PID 送按鍵,
    // 等於對陌生人的 console 打字。與 close-worker.ps1 的 WHP6-E07 同一個道理。
    let liveProcMap;
    try {
      liveProcMap = probeFn();
    } catch (e) {
      return { ...base, code: 'CCB4-E05', reason: `probe-unavailable: ${e.message}`, exit: 2, ambiguous };
    }

    // BR-006:2-Tuple 判活一律走 ctrl-window-ops,本檔不得有第二套 PID/CommandLine 比對。
    const verdict = windowOps.judgeWindowLiveness(row, liveProcMap);
    if (!verdict.alive) {
      const out = {
        ...base, code: verdict.code || 'CCB4-E04', reason: verdict.reason, exit: 2,
        ambiguous, targetPid: Number(row.console_pid),
      };
      // BR-032:恰一行稽核,含 target PID 與原因碼。不注入任何 console。
      writeAuditLine({ track, pid: out.targetPid, code: out.code, reason: out.reason }, logPath);
      return out;
    }

    return {
      ...base, ok: true, exit: 0, reason: 'ready', ambiguous,
      targetPid: Number(row.console_pid),
      // 蓋章要蓋回**這一列**,不是「蓋章當下 last_seen_at 最新的那一列」。同軌多視窗時
      // 兩者可能不同(本次審查當下 BMAD升級軌 就有兩個已綁定視窗),期間任一視窗送出 prompt
      // 更新 last_seen_at 就會換人領先 —— 敲 A 卻蓋 B:A 的速率上界失效可被連續敲,
      // B 的敲門預算被平白吃掉。故把身分一路帶到 stamp,不讓它重算。
      sessionId: row.session_id,
      text: buildKnockText(total),
      unread: total,
    };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

/**
 * BR-033:注入成功之後才蓋章。先蓋再注入的話,一次失敗就永久吃掉該次敲門預算
 * (速率上界會從此把它擋在區間內)。反向風險(蓋章前中斷 → 可能多敲一次)已評估可接受:
 * 代價只是收件視窗多收到一行 ASCII。
 * 獨立開一條可寫連線 —— decideKnock 那條是 readonly(對齊 whp-11 CR 對 D2 的同一項修正)。
 */
export function stampAfterKnock(track, opts = {}) {
  const { dbPath, sessionId = null, now = windowOps.getTaiwanTimestamp() } = opts;
  let db;
  try {
    db = new Database(dbPath || DB_PATH);
    db.pragma('busy_timeout = 5000');
  } catch (e) {
    return { ok: false, changes: 0, error: `db-unavailable: ${e.message}` };
  }
  try {
    // 首選:蓋回 decideKnock 實際選中的那一列(呼叫端一路帶過來的 session_id)。
    // fallback:未帶 session_id 時才重算「last_seen_at 最新」—— 保留給直接呼叫本函式的
    // 情境,但它有 TOCTOU:決策與蓋章之間若有他視窗心跳,領先者會換人。帶 sessionId 是正解。
    const info = sessionId
      ? db.prepare(
          `UPDATE controller_windows SET last_knock_at = @now
            WHERE session_id = @sessionId AND track = @track`
        ).run({ now, sessionId, track })
      : db.prepare(
          `UPDATE controller_windows SET last_knock_at = @now
            WHERE session_id = (
              SELECT session_id FROM controller_windows WHERE track = @track
               ORDER BY last_seen_at DESC LIMIT 1
            )`
        ).run({ now, track });
    return { ok: info.changes > 0, changes: info.changes, error: null };
  } catch (e) {
    return { ok: false, changes: 0, error: e.message };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// ---------- CLI ----------

export function parseArgs(argv) {
  const out = { track: null, stampTrack: null, stampSession: null, dbPath: null, configPath: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--track') out.track = argv[++i];
    else if (a === '--stamp') out.stampTrack = argv[++i];
    else if (a === '--stamp-session') out.stampSession = argv[++i];
    else if (a === '--db') out.dbPath = argv[++i];
    else if (a === '--config') out.configPath = argv[++i];
    else { out.error = `未知參數: ${a}`; return out; }
  }
  if (!out.track && !out.stampTrack) out.error = '需指定 --track(決策)或 --stamp(標記)';
  return out;
}

export function cliMain(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    console.log(JSON.stringify({ ok: false, code: 'CCB4-E01', reason: args.error, exit: 2 }));
    return 2;
  }

  if (args.stampTrack) {
    const res = stampAfterKnock(args.stampTrack, { dbPath: args.dbPath, sessionId: args.stampSession });
    console.log(JSON.stringify({ ok: res.ok, changes: res.changes, error: res.error || null }));
    return 0;   // 蓋章失敗不改變「已送達」這個事實,故不以 exit code 表達
  }

  const d = decideKnock(args.track, { dbPath: args.dbPath, configPath: args.configPath });
  // PowerShell 端跑 Set-StrictMode:每個它會讀的 key 都必須恆存在,否則 $result.xxx 會拋
  // "property cannot be found"(close-worker-ops.js / knock-worker-ops.js 同一個教訓)。
  console.log(JSON.stringify({
    ok: false, knocked: false, code: null, reason: '', exit: 0,
    track: null, targetPid: null, sessionId: null, text: null, unread: 0, ambiguous: false, configWarning: null,
    ...d,
  }));
  return d.exit;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(cliMain(process.argv.slice(2)));
}
