// ============================================================
// [ccb-4-ctrl-notify-knock] controller window registry —— 綁定 / 心跳 / 軌別解析 / 2-Tuple 判活
//
// 為什麼這張表是結構必需而非錦上添花(BR-001 前提):
//   `Stop` 與 `PostToolUse` 的 stdin **沒有 `prompt` 欄位**(官方 schema,SDD Spec §9 V3/V4),
//   而 `ctrl-channel-inject.js` 四條軌別解析路徑中,優先序 2/3 讀 prompt 文字、優先序 4 掃
//   `conversation_turns`(已被實證會被 worker 子視窗與別視窗的宣告污染 —— 2026-08-02 中控
//   BMAD升級軌視窗持續被注入「主視窗手動軌 未讀 1 則」)。沒有 registry,新增的兩個掛點在
//   結構上無從得知自己是哪一軌。顯式綁定是修法,推斷才是缺陷。
//
// 🔴 為什麼是 .cjs(具名偏離 Story T1.6 的 `.js`):
//   三個消費端(`.claude/hooks/ctrl-channel-{inject,probe,stop-check}.js`)是 CommonJS,而本目錄
//   `package.json` 宣告 "type":"module"。寫成 `.js` 會讓 hook 的 `require()` 拋
//   "module is not defined in ES module scope" —— whp-8 踩過、且隔離單元測試測不出來,只有
//   端到端 spawn 才捕捉得到。同一理由見 `ctrl-unread-sql.cjs` 與 `knock-worker-ops.js:27-30`。
//   ESM 側(`knock-controller-ops.js`)以 createRequire 取用,方向與 whp-12 一致。
//
// 🔴 為什麼判活不複用 `reap-worker-runs.js` 的 `judgeLiveness()`:
//   那是 4-Tuple,其 Tuple 3/4 檢查 CommandLine 內是否含 `ipc_dir` 與 `worker-{suffix}.ps1`
//   —— 兩者都是 worker 專屬 token,中控視窗根本不存在。本檔改存綁定當下的 `console_cmdline`,
//   判活時比對「命令列是否仍是我們登記的那一條」:同一個防 PID 重用的目的,換一個對中控成立的判準。
//   形狀刻意與 judgeLiveness 同構(純函式 + 注入 procMap),故測試可用同一種 stub 範式。
// ============================================================
'use strict';

const { execFileSync } = require('child_process');

// timezone.js 是 ESM(本目錄 package.json 宣告 "type":"module"),而本檔是 CJS。
// Node 22.12+ 的 require(esm) 對「無 top-level await 的模組」是穩定路徑,實測 Node v24.12.0 可用
// (2026-08-03)。刻意走這條而非複製一份時間戳實作 —— 那會讓 constitutional §Timestamp Mandate
// 的 SSoT 從一份變兩份,而該 Mandate 的既有事故(.context-db scripts 三種競食格式)正是這樣來的。
const { getTaiwanTimestamp } = require('./timezone.js');

// ---------------------------------------------------------------------------
// canonical 軌別清單(自 ccb-2 `ctrl-channel-inject.js` 上移,BR-037 / CCB4-E01 兩個消費端)
// ---------------------------------------------------------------------------

/** 出現在 from_track 但**不是**真軌別的值。'unspecified' 是 ccb-1 匯入器對「寄件者無法判定」
 *  的佔位符(33 列,live 2026-08-01)。把它當 canonical 是實際有害的:它是普通英文字,任何
 *  提到它的 prompt 都會解析到它 —— 而清單依長度排序時,它的 11 字元又蓋過每一個真軌名(3-9 字元)。
 *  實證:prompt "Type is unspecified" 曾注入「[聊天室] unspecified 未讀 2 則」而非呼叫端自己的軌。 */
const SENTINEL_TRACKS = new Set(['unspecified']);

/**
 * canonical 軌別 = DISTINCT from_track 減去 sentinel,**絕不**與 to_tracks 聯集:
 * to_tracks 帶有一個已記錄的錯字(「BMAD升級軌中控」,msg_id 1119/1120/1121/1126,live 2026-08-01)
 * 而 from_track 從未出現過該值。聯集會靜默地把 BR-003 存在的理由(軌名雙生混淆)重新放行。
 * 依長度由長到短排序,使未來若有一個 canonical 值恰為另一個的前綴,不會靠迭代順序的運氣取勝。
 */
function loadCanonicalTracks(db) {
  return db.prepare('SELECT DISTINCT from_track FROM ctrl_messages').all()
    .map((r) => r.from_track)
    .filter((t) => t && !SENTINEL_TRACKS.has(t))
    .sort((a, b) => b.length - a.length);
}

/**
 * 短命可寫連線。三個 hook 掛點的讀取路徑一律走 `_lib.openContextDb()`(readonly),
 * 只有真的要寫 registry 的那一刻才開這條 —— 對齊 whp-11 CR 對 D2 的同一項修正
 * (「poll readonly + 另開 writable」),也讓 BR-018「非輸出 turn 不開可寫連線」
 * 成為呼叫端可直接滿足的形狀。
 * @returns {import('better-sqlite3').Database|null} 開啟失敗回 null(呼叫端一律 fail-open)
 */
function openWritable(dbPath) {
  if (!dbPath) return null;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    return db;
  } catch {
    return null;
  }
}

/** 祖先鏈走訪的深度上限。實測(2026-08-03)hook 進程到 claude.exe 為 1-2 層,
 *  由 PowerShell tool spawn 的 node 為 2 層,再往上是 terminal / IDE / explorer。
 *  10 層是防迴圈的護欄,不是對真實深度的預期。 */
const MAX_ANCESTOR_DEPTH = 10;

/** 承載中控 console 的行程名。實測 2026-08-03:`claude.exe`(原生 binary,
 *  cmd = `"C:\\Users\\...\\claude.exe" --dangerously-skip-permissions --chrome`)。
 *  若未來 CLI 改以 `node claude.js` 啟動,此判準會回 null —— 那是**可接受的降級**:
 *  BR-004 明訂解析失敗時 console_pid 維持 NULL 且綁定仍成功,該視窗只是不可敲門(BR-005),
 *  三個 hook 掛點完全不受影響。刻意不放寬成「Name=node.exe 且 cmd 含 claude」,因為那會
 *  命中 hook 自己這個 node 進程(其命令列必然含 `.claude/hooks/...`)。 */
function isClaudeConsole(proc) {
  return String(proc && proc.Name || '').toLowerCase() === 'claude.exe';
}

const PS_ANCESTOR_PROBE =
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 2';

/**
 * 一次查全系統行程,於記憶體走祖先鏈找出承載本 console 的 claude 行程(BR-004)。
 *
 * 為何是一次全掃而非逐層單筆查詢:走鏈需要 3-5 層,逐層 spawn 是 3-5 次 PowerShell 冷啟動;
 * 一次全掃實測 580ms / 413 行程(2026-08-03)。且此探測依 BR-041 每個 session 至多跑一次
 * (已有 registry 列即不再探測)。
 *
 * 為何不複用 `reap-worker-runs.js` 的 `probeLiveProcesses()`:它回傳 `Map<pid, cmdLine>`,
 * **形狀本身丟棄了 ParentProcessId** —— 走鏈拿不到 parent。要它可用就得改回傳形狀,而該函式
 * 有 4 個既有消費端(reaper / guardian-tick / knock-worker-ops / close-worker-ops)。
 * 故走 Story T3.3 明列的備案:本檔內建獨立探測,對 epic-whp 檔案零改動。
 *
 * @returns {{pid:number, cmdline:string}|null} 找不到 / 探測失敗皆回 null(BR-004 fail-soft)
 * @throws 不拋 —— 探測失敗一律回 null,綁定仍須成功
 */
function probeAncestorConsole(opts = {}) {
  const { startPid = process.ppid, execFn = execFileSync, matchFn = isClaudeConsole } = opts;
  let list;
  try {
    const out = execFn('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_ANCESTOR_PROBE], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 32 * 1024 * 1024,
    });
    const parsed = JSON.parse(out);
    list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch {
    return null;
  }

  const byPid = new Map();
  for (const p of list) if (p && p.ProcessId != null) byPid.set(Number(p.ProcessId), p);

  let cur = Number(startPid);
  const seen = new Set();
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    if (!cur || seen.has(cur)) break;      // ppid 自我指向 / 成環 → 停
    seen.add(cur);
    const p = byPid.get(cur);
    if (!p) break;
    if (matchFn(p)) return { pid: cur, cmdline: String(p.CommandLine || '') };
    cur = Number(p.ParentProcessId || 0);
  }
  return null;
}

/**
 * 綁定 / 心跳(BR-001 / BR-002 / BR-003 / BR-004 / BR-041)。
 *
 * 已有列 → 只 UPDATE track + last_seen_at,**且不觸發祖先鏈探測**(BR-041:每 session 至多一次)。
 * 無列   → 探測後 INSERT。探測失敗時 console_pid 維持 NULL 而綁定仍成功(BR-004)。
 * bound_at 在任何情況下都不被改寫(BR-003)。
 *
 * @param {import('better-sqlite3').Database} db 可寫連線
 * @returns {{inserted:boolean, probed:boolean, consolePid:number|null}}
 */
function bindWindow(db, args) {
  const { sessionId, track, now, probeFn = probeAncestorConsole } = args;
  if (!sessionId || !track || !now) throw new Error('bindWindow 需要 sessionId / track / now');

  const existing = db.prepare('SELECT session_id FROM controller_windows WHERE session_id = ?').get(sessionId);
  if (existing) {
    db.prepare('UPDATE controller_windows SET track = @track, last_seen_at = @now WHERE session_id = @sessionId')
      .run({ track, now, sessionId });
    return { inserted: false, probed: false, consolePid: null };
  }

  let console_pid = null;
  let console_cmdline = null;
  const hit = probeFn();
  if (hit) { console_pid = hit.pid; console_cmdline = hit.cmdline; }

  db.prepare(`
    INSERT INTO controller_windows (session_id, track, console_pid, console_cmdline, bound_at, last_seen_at)
    VALUES (@sessionId, @track, @console_pid, @console_cmdline, @now, @now)
    ON CONFLICT(session_id) DO UPDATE SET track = excluded.track, last_seen_at = excluded.last_seen_at
  `).run({ sessionId, track, console_pid, console_cmdline, now });

  return { inserted: true, probed: true, consolePid: console_pid };
}

/**
 * 依 session 解析軌別(BR-008 / BR-036)。查無列回 null —— 呼叫端據此靜默退出,
 * 不臆測、不建列、不注入(使用者明定的硬邊界:未綁定視窗零通知)。
 */
function resolveTrackBySession(db, sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT track FROM controller_windows WHERE session_id = ?').get(sessionId);
  return row ? row.track : null;
}

/** 取整列(掛點需要 last_probe_* / last_stop_block_* 等狀態欄)。查無回 undefined。 */
function getWindow(db, sessionId) {
  return db.prepare('SELECT * FROM controller_windows WHERE session_id = ?').get(sessionId);
}

/**
 * 敲門目標選取:同一軌可能有多個 session 列(舊視窗未老化 / 兩視窗同時宣告同軌),
 * 取 `last_seen_at` 最新的那一列(SDD Spec §5「兩視窗同軌」邊界 + §3.3 索引的用途)。
 * @returns {{row:object|undefined, ambiguous:boolean}} ambiguous = 該軌有 >1 列,供稽核行具名
 */
function findKnockTarget(db, track) {
  const rows = db.prepare(
    'SELECT * FROM controller_windows WHERE track = ? ORDER BY last_seen_at DESC'
  ).all(track);
  return { row: rows[0], ambiguous: rows.length > 1 };
}

/**
 * 2-Tuple 判活(BR-005 / BR-006)。純函式 —— procMap 由呼叫端注入,形狀與
 * `reap-worker-runs.js` 的 `probeLiveProcesses()` 回傳值相同(`Map<pid, cmdLine>`),
 * 故 knock 路徑可直接餵它,不需第二份探測。
 *
 * Tuple 1: console_pid 出現在活行程 map
 * Tuple 2: 該行程當下 CommandLine 與登記的 console_cmdline case-insensitive **相等**
 *          (worker 那邊用 includes 是因為要在長命令列裡找 token;此處存的就是完整命令列)
 *
 * @returns {{alive:boolean, reason?:string, code?:string}}
 */
function judgeWindowLiveness(row, procMap) {
  if (!row) return { alive: false, reason: 'no-bound-window', code: 'CCB4-E02' };
  const pid = row.console_pid;
  if (!pid || pid <= 0) {
    return { alive: false, reason: 'console_pid IS NULL — 該視窗綁定時未解析出 console PID,不可敲門', code: 'CCB4-E03' };
  }
  const cmdline = procMap.get(Number(pid));
  if (cmdline === undefined) {
    return { alive: false, reason: 'window-gone', code: 'CCB4-E04' };
  }
  if (String(cmdline).toLowerCase() !== String(row.console_cmdline || '').toLowerCase()) {
    return { alive: false, reason: 'pid-reused', code: 'CCB4-E04' };
  }
  return { alive: true };
}

module.exports = {
  MAX_ANCESTOR_DEPTH,
  SENTINEL_TRACKS,
  loadCanonicalTracks,
  getTaiwanTimestamp,
  openWritable,
  isClaudeConsole,
  probeAncestorConsole,
  bindWindow,
  resolveTrackBySession,
  getWindow,
  findKnockTarget,
  judgeWindowLiveness,
};
