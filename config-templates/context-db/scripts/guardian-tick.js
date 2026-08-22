// ============================================================
// PhyCool Context Memory DB — 集中式無狀態守護單一 tick
// [whp-7-guardian-daemon] 只回報、只提醒,絕不 kill、絕不關窗、絕不派發
// (使用者硬裁定 ③,見 SSoT §26)。全檔零行程終止原語、零檔案刪除原語。
//
// 純函式設計(BR-G03 節錄自 SDD Spec §4.3):mirrors the shape whp-3 left behind
// (reap({dbPath,dryRun,probeFn}) + judgeLiveness(row,liveProcMap)) — 每個外部依賴皆可
// 注入(dbPath/mode/dryRun/now/probeFn/mtimeFn/config),故全部 26 條 BR 皆可用 seed 列
// + 假 proc map + 假 mtime function 驗證,不需 spawn 任何真實 worker。
//
// 4-Tuple 判活邏輯與 phase→suffix 對照、批次探測皆 import 自 reap-worker-runs.js,
// 禁重寫(SSoT E31:守護與 reaper 用同一份判準)。
// ============================================================
// 使用方式:
//   node .context-db/scripts/guardian-tick.js --fast [--dry-run] [--json]
//   node .context-db/scripts/guardian-tick.js --slow [--dry-run] [--json]
// Exit codes: 0=tick 完成(含 probe_unavailable=true) / 1=WHP7-E01(DB 開不起來,未寫入任何東西)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaiwanTimestamp } from './timezone.js';
import {
  judgeLiveness,
  probeLiveProcesses,
  NON_TERMINAL_LIFECYCLES,
} from './reap-worker-runs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json');

// SDD Spec §4.4 — 9 鍵由本卡新增(guardianDispatchGraceSec / guardianScopeMaxFiles 非 SSoT §22.8
// 原列鍵,明文記錄非靜默 hardcode)。dispatchConfirmSec / reviewReminderMin 非本卡所屬,repo 內
// 目前無任何權威來源(T1.1 已 grep 全 repo 確認),此處僅為 guardian-tick.js 內部 fallback,
// 一旦上游(whp-1/whp-10)補上權威值即應被 config 檔實際值取代。
export const DEFAULT_CONFIG = {
  guardianFastTickSec: 30,
  guardianSlowTickSec: 600,
  guardianIdleExitMin: 60,
  guardianDispatchGraceSec: 120,
  guardianScopeMaxFiles: 2000,
  stallFirstCheckMin: 30,
  stallRecheckMin: 10,
  stallRoundsToFlag: 2,
  ackCheckIntervalMin: 10,
  dispatchConfirmSec: 30,
  reviewReminderMin: 30,
};

const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git', 'obj', 'bin', 'dist', '.vs', '.next', 'logs']);

/** 帶 WHP7-Exx 代碼的錯誤 — 拋出而非直接 process.exit,CLI 層與測試各自決定如何處理。*/
export class WhpGuardianError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseTwTimestamp(iso) {
  return Date.parse(iso);
}

/** 唯讀 mtime — 只呼叫 fs.statSync(metadata),絕不讀檔案內容(BR-G24)。*/
function defaultMtimeFn(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

/** 控制平面根解析 — JS 版 Get-ProjectRoot(shared-utils.ps1:56-67),供 BR-G22 eligibility 判斷。*/
export function resolveControlPlaneRoot() {
  const envRoot = process.env.PIPELINE_CONTROL_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, '.claude'))) {
    return path.resolve(envRoot);
  }
  let dir = __dirname;
  while (dir && dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Cannot locate project root (.claude not found)');
}

// ---------- BR-G23/BR-G24: 指紋範圍走訪(唯讀,只取 mtime) ----------

function isInside(childAbs, parentAbs) {
  const rel = path.relative(parentAbs, childAbs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 路徑相等判定 —— 必須 case-insensitive(CR F6)。理由與 judgeLiveness 的 tuple 3+4 逐字相同
 * (`reap-worker-runs.js:80-84`,whp-3 CR F2 修正):Windows 路徑本身大小寫不敏感。
 * 🔴 若此處用 case-sensitive 比對,一個僅大小寫不同(或經 env 覆寫而寫法不同)的 repo-root
 * `work_root` 會被 BR-G22 誤判為 worktree-local 而整棵被走訪 —— 正是 BR-G22 存在要防的
 * G17 跨軌污染(所有 run 共用同一 scope,停滯永遠測不出來)。
 * 同檔 isInside() 走 path.relative(),在 win32 上本來就是 case-insensitive;不對齊此處
 * 等於同一份 scope 判斷內部並存兩套大小寫語意。
 */
function isSamePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/**
 * files_modified 單筆條目路徑 confinement(BR-G24)—— DB 來源視為不可信輸入。
 * 相對路徑相對 work_root(worker 產出報告慣例)解析,work_root 缺時退回 ipc_dir。
 * confinement 邊界為「原始 work_root 值」(不論 BR-G22 是否判定其可被遞迴走訪)+ ipc_dir ——
 * BR-G22 的 eligible 判斷只影響「是否額外遞迴掃描 work_root 子樹」這個獨立開銷疑慮,不影響
 * files_modified 這份逐筆具名、天然 per-run 的清單能否被個別 stat(見 dev_notes / AC7 G17
 * 隔離測試 — 若嚴格要求 work_root 通過 BR-G22 才能當 confinement 邊界,非 worktree 模式下
 * files_modified 將永遠被拒絕,與 §4.3.2「files_modified 一律納入、為最高訊號來源」矛盾)。
 */
function resolveFilesModifiedEntry(entry, workRootRaw, ipcDir) {
  if (typeof entry !== 'string' || entry.length === 0) return null;
  const base = workRootRaw || ipcDir;
  if (!base) return null;
  const resolved = path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(base, entry);
  const confinedToWorkRoot = workRootRaw ? isInside(resolved, path.resolve(workRootRaw)) : false;
  const confinedToIpcDir = ipcDir ? isInside(resolved, path.resolve(ipcDir)) : false;
  if (!confinedToWorkRoot && !confinedToIpcDir) return null;
  return resolved;
}

/** 目錄子樹走訪(唯讀,只列目錄結構,不讀檔案內容)—— 略過排除目錄名。*/
function* walkDirFiles(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return; // 不可讀 — BC-11:不視為不活躍,單純無法貢獻訊號
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      yield* walkDirFiles(path.join(root, entry.name));
    } else if (entry.isFile()) {
      yield path.join(root, entry.name);
    }
  }
}

/**
 * 存在性判準(§4.3.1 無狀態解法):∃ p ∈ scope : (now - mtime(p)) < stallRecheckMs,首個命中即
 * 提早退出。走訪順序 = orderedFilePaths(files_modified,已 confinement 過)→ dirRootsInOrder
 * (ipc_dir 一律列首、worktree-local work_root 殿後)—— BR-G23 降序信號順序,防 cap 截斷反轉判定。
 */
function checkScopeActive({ orderedFilePaths, dirRootsInOrder, nowMs, stallRecheckMs, maxFiles, mtimeFn }) {
  let statCount = 0;

  for (const p of orderedFilePaths) {
    if (statCount >= maxFiles) return { active: false, truncated: true, statCount };
    statCount++;
    const mt = mtimeFn(p);
    if (mt != null && (nowMs - mt) < stallRecheckMs) {
      return { active: true, truncated: false, statCount };
    }
  }

  for (const root of dirRootsInOrder) {
    for (const filePath of walkDirFiles(root)) {
      if (statCount >= maxFiles) return { active: false, truncated: true, statCount };
      statCount++;
      const mt = mtimeFn(filePath);
      if (mt != null && (nowMs - mt) < stallRecheckMs) {
        return { active: true, truncated: false, statCount };
      }
    }
  }

  return { active: false, truncated: false, statCount };
}

// ---------- Loop A(快 tick — 視窗存活偵測,BR-G03~G08) ----------

function markAbandoned(db, row, now, dryRun, report) {
  if (dryRun) {
    report.abandoned++;
    return true;
  }
  const info = db.prepare(`
    UPDATE worker_runs
    SET lifecycle = 'abandoned',
        abandoned_at_stage = @observed,
        close_source = 'Unknown',
        requires_attention = 1,
        closed_detected_at = @now,
        window_vanished_at = COALESCE(window_vanished_at, @now),
        updated_at = @now
    WHERE run_id = @run_id AND lifecycle = @observed
  `).run({ run_id: row.run_id, observed: row.lifecycle, now });
  if (info.changes === 0) {
    report.skipped_cas_lost++;
    return false;
  }
  report.abandoned++;
  return true;
}

function selectNonTerminalCandidates(db) {
  const placeholders = NON_TERMINAL_LIFECYCLES.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM worker_runs WHERE lifecycle IN (${placeholders})`).all(...NON_TERMINAL_LIFECYCLES);
}

// 🔴 candidates 必須由呼叫端在呼叫 probeFn() 之前先 SELECT 好並傳入(逐字對齊 reap-worker-runs.js
// reap() 的既有順序:先讀快照,才探測存活)。若在此函式內部才查詢,probeFn 造成的任何 DB side
// effect(BR-G06 CAS 測試即刻意如此模擬中控搶先推進 lifecycle)會在 SELECT 時就已經生效,
// CAS 的 observed 值就不再是「探測當下」的快照,CAS 競態偵測會失去意義。
function runLoopA(db, cfg, nowMs, now, dryRun, candidates, liveProcMap, report) {
  report.scanned = candidates.length;

  if (liveProcMap == null) {
    return; // BR-G19 fail-open: probe 不可用,loop A 全體跳過,不視為死亡
  }

  for (const row of candidates) {
    if (row.run_mode === 'inline') {
      report.skipped_inline++; // BR-G07:僅跳過存活判定,B/D 迴圈仍納入
      continue;
    }

    if (row.lifecycle === 'dispatching' && (row.wrapper_pid == null || row.wrapper_pid <= 0)) {
      // BR-G08:dispatching 幽靈不進 4-Tuple,改年齡規則(對齊 TD-WHP3-REAPER-DISPATCH-RACE)
      const startedMs = parseTwTimestamp(row.started_at);
      const graceMs = (cfg.dispatchConfirmSec + cfg.guardianDispatchGraceSec) * 1000;
      if (nowMs - startedMs > graceMs) {
        markAbandoned(db, row, now, dryRun, report);
      } else {
        report.skipped_dispatch_grace++;
      }
      continue;
    }

    const verdict = judgeLiveness(row, liveProcMap);
    if (verdict.alive) {
      report.alive++;
      continue;
    }
    markAbandoned(db, row, now, dryRun, report);
  }
}

// ---------- Loop B(快 tick — 首次通知,BR-G09) ----------

function runLoopB(db, now, dryRun, report) {
  const candidates = db.prepare(`
    SELECT run_id, lifecycle FROM worker_runs WHERE lifecycle = 'reported' AND ack_at IS NULL AND notify_count = 0
  `).all();
  for (const row of candidates) {
    if (dryRun) {
      report.notified_first++;
      continue;
    }
    const info = db.prepare(`
      UPDATE worker_runs SET notify_count = 1, last_notified_at = @now, updated_at = @now
      WHERE run_id = @run_id AND lifecycle = @observed AND notify_count = 0
    `).run({ run_id: row.run_id, observed: row.lifecycle, now });
    if (info.changes > 0) report.notified_first++;
  }
}

// ---------- Loop C(慢 tick — 30/10/10 停滯偵測,BR-G12~G16 + G22~G25) ----------

function writeStallReset(db, row, now, dryRun) {
  if (dryRun) return true;
  const info = db.prepare(`
    UPDATE worker_runs SET stall_rounds = 0, health_flag = NULL, updated_at = @now
    WHERE run_id = @run_id AND lifecycle = @observed
  `).run({ run_id: row.run_id, observed: row.lifecycle, now });
  return info.changes > 0;
}

function writeStallIncrement(db, row, now, dryRun, newStallRounds, shouldFlag) {
  if (dryRun) return true;
  const sql = shouldFlag
    ? `UPDATE worker_runs SET stall_rounds = @sr, health_flag = 'stalled-suspect', requires_attention = 1, updated_at = @now
       WHERE run_id = @run_id AND lifecycle = @observed`
    : `UPDATE worker_runs SET stall_rounds = @sr, updated_at = @now
       WHERE run_id = @run_id AND lifecycle = @observed`;
  const info = db.prepare(sql).run({ run_id: row.run_id, observed: row.lifecycle, sr: newStallRounds, now });
  return info.changes > 0;
}

function runLoopC(db, cfg, nowMs, now, dryRun, mtimeFn, report) {
  const placeholders = NON_TERMINAL_LIFECYCLES.map(() => '?').join(',');
  const candidates = db.prepare(`SELECT * FROM worker_runs WHERE lifecycle IN (${placeholders})`).all(...NON_TERMINAL_LIFECYCLES);

  for (const row of candidates) {
    let filesModified = [];
    try {
      filesModified = row.files_modified ? JSON.parse(row.files_modified) : [];
      if (!Array.isArray(filesModified)) filesModified = [];
    } catch {
      filesModified = [];
    }

    const workRootRaw = row.work_root || null;
    const controlPlaneRoot = cfg.controlPlaneRoot || null;
    // 缺 controlPlaneRoot 時安全方向 = 視為不 eligible(不遞迴走訪),對齊「無法判定就不擴大掃描面」
    const workRootEligible = workRootRaw != null && controlPlaneRoot != null
      && !isSamePath(workRootRaw, controlPlaneRoot);
    if (workRootRaw != null && !workRootEligible) {
      report.scope_work_root_excluded++;
    }

    // BR-G13:判準鍵在「BR-G22 排除後的有效 scope」,非欄位 NULL-ness
    const hasScope = filesModified.length > 0 || workRootEligible;
    if (!hasScope) {
      report.skipped_no_scope++;
      continue;
    }

    // BR-G14:T0+30/+10 首檢閘門(存在性判準零快照,用既有 started_at 相減)
    const startedMs = parseTwTimestamp(row.started_at);
    const firstCheckGateMs = (cfg.stallFirstCheckMin + cfg.stallRecheckMin) * 60000;
    if (nowMs - startedMs < firstCheckGateMs) {
      continue; // 尚未到首檢時間,本輪不動作
    }

    // BR-G24:files_modified 逐筆 confinement,越界者跳過並計數,絕不 stat
    const orderedFilePaths = [];
    for (const entry of filesModified) {
      const resolved = resolveFilesModifiedEntry(entry, workRootRaw, row.ipc_dir);
      if (resolved == null) {
        report.scope_rejected_paths++;
      } else {
        orderedFilePaths.push(resolved);
      }
    }

    // BR-G23:降序信號順序 — files_modified(上方已收集)→ ipc_dir → worktree-local work_root
    const dirRootsInOrder = [];
    if (row.ipc_dir) dirRootsInOrder.push(row.ipc_dir);
    if (workRootEligible) dirRootsInOrder.push(workRootRaw);

    const { active, truncated } = checkScopeActive({
      orderedFilePaths,
      dirRootsInOrder,
      nowMs,
      stallRecheckMs: cfg.stallRecheckMin * 60000,
      maxFiles: cfg.guardianScopeMaxFiles,
      mtimeFn,
    });
    if (truncated) report.scope_truncated = true;

    if (active) {
      // BR-G15 reset + BR-G25:只清 health_flag,requires_attention 留給中控清
      if (writeStallReset(db, row, now, dryRun)) report.stall_reset++;
    } else {
      const newStallRounds = (row.stall_rounds || 0) + 1;
      const shouldFlag = newStallRounds >= cfg.stallRoundsToFlag; // BR-G16,lifecycle 不動
      if (writeStallIncrement(db, row, now, dryRun, newStallRounds, shouldFlag)) {
        report.stall_incremented++;
        if (shouldFlag) report.stall_flagged++;
      }
    }
  }
}

// ---------- Loop D(慢 tick — 逾期催辦,BR-G10~G11) ----------

function runLoopD(db, cfg, nowMs, now, dryRun, report) {
  const candidates = db.prepare(`
    SELECT run_id, lifecycle, last_notified_at FROM worker_runs
    WHERE lifecycle = 'reported' AND ack_at IS NULL AND last_notified_at IS NOT NULL
  `).all();
  const intervalMs = cfg.ackCheckIntervalMin * 60000;
  for (const row of candidates) {
    const lastNotifiedMs = parseTwTimestamp(row.last_notified_at);
    if (nowMs - lastNotifiedMs < intervalMs) continue;
    if (dryRun) {
      report.notified_escalated++;
      continue;
    }
    const info = db.prepare(`
      UPDATE worker_runs SET notify_count = notify_count + 1, last_notified_at = @now, updated_at = @now
      WHERE run_id = @run_id AND lifecycle = @observed AND last_notified_at = @observedNotifiedAt
    `).run({ run_id: row.run_id, observed: row.lifecycle, observedNotifiedAt: row.last_notified_at, now });
    if (info.changes > 0) report.notified_escalated++;
  }
}

// ---------- Loop E(慢 tick — 待審逾期,BC-09:報告專用不寫 DB) ----------

function runLoopE(db, cfg, nowMs, report) {
  const rows = db.prepare(`
    SELECT updated_at FROM worker_runs WHERE lifecycle IN ('awaiting-review', 'approved')
  `).all();
  const thresholdMs = cfg.reviewReminderMin * 60000;
  for (const row of rows) {
    const updatedMs = parseTwTimestamp(row.updated_at);
    if (nowMs - updatedMs > thresholdMs) {
      report.awaiting_review_overdue++;
    }
  }
}

// ---------- guardian_heartbeat(每輪快 tick,BR-G17~G20) ----------

function writeHeartbeat(db, cfg, nowMs, now, dryRun, report, lastError) {
  if (dryRun) return;

  const existing = db.prepare('SELECT started_at FROM guardian_heartbeat WHERE id = 1').get();
  const startedAt = existing && existing.started_at ? existing.started_at : now;

  // 無狀態閒置判定(BR-G20):優先以 worker_runs 全表最新 updated_at 為錨(純由 DB 內容重新
  // 推導,不依賴本守護實例自身存活時長)。🔴 BC-12 指出「worker_runs 全空是今日實際狀態」
  // (whp-4 尚未落地);此時沒有任何 updated_at 可比較,不可將「無歷史活動」直接視為「已閒置」
  // 否則守護會在第一輪 tick 就永遠閒置退出、完全無法常駐。BC-12 原文「idle timer 啟動」
  // 語意為「開始倒數」而非「立即視為已逾期」,故退回 guardian_heartbeat.started_at
  // (DB 持久化、跨守護重啟不變,見上方 startedAt 的 COALESCE 語意)作為次要錨點 ——
  // 首輪 tick 時 startedAt===now(elapsed=0,不判閒置),之後隨真實時間流逝正確倒數。
  const lastActivityRow = db.prepare('SELECT MAX(updated_at) as t FROM worker_runs').get();
  const lastActivityMs = lastActivityRow && lastActivityRow.t ? parseTwTimestamp(lastActivityRow.t) : null;
  const idleAnchorMs = lastActivityMs != null ? lastActivityMs : parseTwTimestamp(startedAt);
  const idleMs = cfg.guardianIdleExitMin * 60000;
  const trulyIdle = (nowMs - idleAnchorMs) >= idleMs;
  const idleExit = report.scanned === 0 && trulyIdle;
  report.idle_exit = idleExit;

  const pidToWrite = idleExit ? null : (cfg.guardianPid ?? null);
  const host = os.hostname();

  db.prepare(`
    INSERT INTO guardian_heartbeat (id, guardian_pid, host, started_at, last_beat_at, fast_tick_sec, slow_tick_sec, watched_runs, last_error, updated_at)
    VALUES (1, @pid, @host, @startedAt, @now, @fast, @slow, @watched, @lastError, @now)
    ON CONFLICT(id) DO UPDATE SET
      guardian_pid = excluded.guardian_pid,
      host = excluded.host,
      last_beat_at = excluded.last_beat_at,
      fast_tick_sec = excluded.fast_tick_sec,
      slow_tick_sec = excluded.slow_tick_sec,
      watched_runs = excluded.watched_runs,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run({
    pid: pidToWrite,
    host,
    startedAt,
    now,
    fast: cfg.guardianFastTickSec,
    slow: cfg.guardianSlowTickSec,
    watched: report.scanned,
    lastError: lastError || null,
  });
}

// ---------- 核心 tick 純函式 ----------

function emptyReport(mode, dryRun, now) {
  return {
    mode,
    scanned: 0,
    alive: 0,
    abandoned: 0,
    notified_first: 0,
    notified_escalated: 0,
    stall_incremented: 0,
    stall_reset: 0,
    stall_flagged: 0,
    awaiting_review_overdue: 0,
    skipped_inline: 0,
    skipped_dispatch_grace: 0,
    skipped_no_scope: 0,
    skipped_cas_lost: 0,
    scope_work_root_excluded: 0,
    scope_rejected_paths: 0,
    scope_truncated: false,
    probe_unavailable: false,
    idle_exit: false,
    dry_run: dryRun,
    generated_at: now,
  };
}

/**
 * 一輪 tick(SDD Spec §4.3)。純函式 —— 全部外部依賴皆可注入,不呼叫 process.exit。
 * @param {{dbPath?: string, mode?: 'fast'|'slow', dryRun?: boolean, now?: string,
 *          probeFn?: () => Map<number,string>, mtimeFn?: (path:string) => number|null,
 *          config?: object}} [opts]
 */
export function guardianTick(opts = {}) {
  const {
    dbPath = DB_PATH,
    mode = 'fast',
    dryRun = false,
    now = getTaiwanTimestamp(),
    probeFn = probeLiveProcesses,
    mtimeFn = defaultMtimeFn,
    config = {},
  } = opts;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nowMs = parseTwTimestamp(now);

  let db;
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  } catch (err) {
    throw new WhpGuardianError('WHP7-E01', err.message);
  }

  const report = emptyReport(mode, dryRun, now);
  let lastError = null;

  try {
    if (mode === 'fast') {
      // 🔴 先 SELECT 快照,才呼叫 probeFn()(逐字對齊 reap-worker-runs.js reap() 既有順序)——
      // CAS 的 observed 值必須是「探測當下已讀到的快照」,若探測在 SELECT 之前執行,任何探測
      // 造成的 DB 側寫(如中控搶先推進 lifecycle)會在 SELECT 時就已生效,CAS 競態偵測會失效。
      const candidates = selectNonTerminalCandidates(db);
      let liveProcMap = null;
      try {
        liveProcMap = probeFn();
      } catch (err) {
        // BR-G19 fail-open:探測不可用永不等同「已死」
        report.probe_unavailable = true;
        lastError = `probe unavailable: ${err.message}`;
      }
      // 🔴 loop B 必須先於 loop A(CR F4)。loop A 會把「已 reported 但視窗已消失」的列就地
      // 推進為 abandoned,而 loop B 的候選查詢鍵在 lifecycle='reported' —— 若 A 先跑,BR-G09
      // 要求的首次通知計數對這類列**永遠不觸發**(notify_count 恆 0 / last_notified_at 恆 NULL),
      // whp-8 的催辦階梯就再也接不到這筆未簽收的回報,正是本卡要堵的「回報有沒有人收」黑洞
      // (§1.1 失效面 2)。B 先跑不影響 A:loop B 只寫 notify_count / last_notified_at,不動
      // lifecycle,故 A 的 CAS(條件為探測前快照讀到的 lifecycle)仍然成立。
      runLoopB(db, now, dryRun, report);
      runLoopA(db, cfg, nowMs, now, dryRun, candidates, liveProcMap, report);
    } else if (mode === 'slow') {
      runLoopC(db, cfg, nowMs, now, dryRun, mtimeFn, report);
      runLoopD(db, cfg, nowMs, now, dryRun, report);
      runLoopE(db, cfg, nowMs, report);
    }
  } catch (err) {
    // BR-G19 fail-open:任一步驟拋錯,已完成的其餘步驟寫入保留,不整輪回滾,不非零 exit
    lastError = err.message;
  }

  if (mode === 'fast') {
    try {
      writeHeartbeat(db, cfg, nowMs, now, dryRun, report, lastError);
    } catch (err) {
      lastError = lastError || err.message;
      report.probe_unavailable = report.probe_unavailable || false;
    }
  } else if (lastError && !dryRun) {
    // 🔴 BR-G19 明文要求把錯誤訊息「record into guardian_heartbeat.last_error」,但心跳 upsert
    // 只在快 tick 執行(BR-G17)。慢 tick 專屬的錯誤(scope walk EPERM / stall UPDATE 逾時
    // busy_timeout)因此原本兩個 accountability surface 都看不到 —— DB 沒寫、PS log 那行還印
    // "slow tick ok"(§6 明訂這兩者就是問責面)。此處補一筆**窄幅** UPDATE(只碰 last_error /
    // updated_at,絕不覆寫 last_beat_at / watched_runs,否則會偽造出一次不存在的心跳)。
    // 本身亦 fail-open:寫不進去就算了,絕不讓記錄錯誤這件事本身變成新的失敗來源。
    try {
      db.prepare('UPDATE guardian_heartbeat SET last_error = @e, updated_at = @now WHERE id = 1')
        .run({ e: lastError, now });
    } catch { /* fail-open — 心跳列可能尚不存在(獨立跑 --slow),不視為錯誤 */ }
  }
  if (lastError) report.last_error = lastError;

  db.close();
  return report;
}

// ---------- CLI 入口(僅在直接執行時跑,匯入供測試時不觸發) ----------

export function printUsage() {
  console.log('Usage:');
  console.log('  node guardian-tick.js --fast [--dry-run] [--json]   # 快 tick(視窗存活 + 首次通知)');
  console.log('  node guardian-tick.js --slow [--dry-run] [--json]   # 慢 tick(30/10/10 + 催辦 + 待審)');
  console.log('  node guardian-tick.js --status [--json]             # 唯讀心跳查詢(BR-G26,不取鎖,零寫入)');
}

/**
 * BR-G26 唯讀查詢 —— 與 guardianTick() 完全獨立的路徑,零寫入、不取任何鎖,無論當下是否有
 * 守護在跑皆安全呼叫。`pipeline-guardian.ps1` 的 `-Status` 旗標透過 CLI 呼叫本分支達成。
 *
 * 🔴 匯出且 dbPath 可注入(CR F2):原設計刻意不匯出,結果 BR-G26 成為 26 條 BR 中唯一
 * **零自動化覆蓋**的一條(cliMain 硬編 DB_PATH,測試無從注入)。而本函式恰好帶一個測試才擋得住
 * 的陷阱 —— 兩個回傳分支的**欄位形狀必須完全一致**,否則 PowerShell `Set-StrictMode -Version
 * Latest` 下存取 ConvertFrom-Json 物件不存在的屬性會直接拋錯,把 `-Status` 從「印出狀態」
 * 變成「噴例外」。匯出讓該不變量可被機械鎖住。
 */
export function runStatusQuery(dbPath = DB_PATH) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const hb = db.prepare('SELECT * FROM guardian_heartbeat WHERE id = 1').get();
    if (!hb) {
      // 欄位形狀必與下方非空分支一致(即使值皆為 null)—— PowerShell Set-StrictMode 下
      // 存取 ConvertFrom-Json 物件不存在的屬性會拋錯,故兩分支的回傳物件必同構。
      return { guardian_pid: '(none)', host: null, freshness_sec: null, watched_runs: null, last_error: null };
    }
    const freshnessSec = hb.last_beat_at ? (Date.now() - parseTwTimestamp(hb.last_beat_at)) / 1000 : null;
    return {
      guardian_pid: hb.guardian_pid ?? '(none)',
      host: hb.host,
      freshness_sec: freshnessSec,
      watched_runs: hb.watched_runs,
      last_error: hb.last_error,
    };
  } finally {
    db.close();
  }
}

/** configPath 可注入(CR F2)—— 讓 WHP7-E04(config 讀不到 / 格式壞)分支可被測試覆蓋。 */
export function loadFileConfig(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8').replace(/^﻿/, '');
  const parsed = JSON.parse(raw);
  return (parsed.workerProtocol) || {};
}

function printHumanReport(report) {
  console.log(`Mode: ${report.mode} | Scanned: ${report.scanned} | Alive: ${report.alive} | Abandoned: ${report.abandoned}`);
  console.log(`Notify — first: ${report.notified_first} | escalated: ${report.notified_escalated}`);
  console.log(`Stall — incremented: ${report.stall_incremented} | reset: ${report.stall_reset} | flagged: ${report.stall_flagged}`);
  console.log(`Skipped — inline: ${report.skipped_inline} | dispatch_grace: ${report.skipped_dispatch_grace} | no_scope: ${report.skipped_no_scope} | cas_lost: ${report.skipped_cas_lost}`);
  console.log(`Scope — work_root_excluded: ${report.scope_work_root_excluded} | rejected_paths: ${report.scope_rejected_paths} | truncated: ${report.scope_truncated}`);
  console.log(`Review overdue (report-only): ${report.awaiting_review_overdue}`);
  console.log(`Probe: ${report.probe_unavailable ? 'UNAVAILABLE (fail-open)' : 'ok'}${report.dry_run ? ' | DRY-RUN (nothing written)' : ''}${report.idle_exit ? ' | IDLE-EXIT recommended' : ''}`);
}

export function cliMain(rawArgs) {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printUsage();
    return 0;
  }

  if (rawArgs.includes('--status')) {
    try {
      const status = runStatusQuery(DB_PATH);
      if (rawArgs.includes('--json')) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(`guardian_pid: ${status.guardian_pid}`);
        console.log(`host: ${status.host ?? '(none)'}`);
        console.log(`freshness_sec: ${status.freshness_sec ?? '(none)'}`);
        console.log(`watched_runs: ${status.watched_runs ?? '(none)'}`);
        console.log(`last_error: ${status.last_error ?? '(none)'}`);
      }
      return 0;
    } catch (err) {
      console.error(`❌ WHP7-E01: ${err.message}`);
      return 1;
    }
  }

  const dryRun = rawArgs.includes('--dry-run');
  const json = rawArgs.includes('--json');
  const mode = rawArgs.includes('--slow') ? 'slow' : 'fast';

  let fileCfg = {};
  let configErrorMsg = null;
  try {
    fileCfg = loadFileConfig();
  } catch (err) {
    // WHP7-E04:config 不可讀/壞掉 → 回退預設值,記 last_error,繼續跑(非致命)
    configErrorMsg = err.message;
  }

  const cfg = { ...DEFAULT_CONFIG, ...fileCfg };
  try {
    cfg.controlPlaneRoot = resolveControlPlaneRoot();
  } catch {
    cfg.controlPlaneRoot = null;
  }
  cfg.guardianPid = process.env.PIPELINE_GUARDIAN_PID ? Number(process.env.PIPELINE_GUARDIAN_PID) : process.pid;

  try {
    const report = guardianTick({ dbPath: DB_PATH, mode, dryRun, config: cfg });
    if (configErrorMsg) {
      report.last_error = report.last_error ? `${report.last_error}; WHP7-E04: ${configErrorMsg}` : `WHP7-E04: ${configErrorMsg}`;
    }
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    return 0;
  } catch (err) {
    const code = err instanceof WhpGuardianError ? err.code : 'WHP7-E01';
    console.error(`❌ ${code}: ${err.message}`);
    return 1;
  }
}

// Guard: 只在「本檔就是 node 的執行入口」時跑 CLI(同目錄既有 idiom,防 import 副作用)。
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  process.exit(cliMain(process.argv.slice(2)));
}
