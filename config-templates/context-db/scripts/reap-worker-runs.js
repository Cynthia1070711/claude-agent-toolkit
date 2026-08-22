// ============================================================
// PhyCool Context Memory DB — worker_runs 殭屍對帳工具
// [whp-3-db-schema-registry] 本工具只標記不殺,kill 與關窗永遠是人的決策
// (使用者硬裁定 ③,見 SSoT §26 G22/G23)。全檔零 kill 原語。
//
// 4-Tuple 判活邏輯逐字複用 shared-utils.ps1:431-458 Stop-WorkerSafe 的判準
// (wrapper_pid > 0 / 進程存在 / cmdline 含 ipc_dir / cmdline 含 worker-{suffix}.ps1),
// 不自創新判準。批次探測(單次 execFileSync)而非逐列查詢 —— 50 列逐列約 18.5s,
// 批次僅 320ms(BR-023),且命令字串為常數,不把任何 DB 欄位值插入 PowerShell 命令
// (防指令注入面)。
// ============================================================
// 使用方式:
//   node .context-db/scripts/reap-worker-runs.js              # 掃描 + 標記(預設)
//   node .context-db/scripts/reap-worker-runs.js --dry-run    # 掃描 + 報告,不寫入
//   node .context-db/scripts/reap-worker-runs.js --json       # 機器可讀報告
// Exit codes: 0=掃描完成(含 probe_unavailable=true) / 1=WHP3-E07(DB 開不起來,未寫入任何東西)
// ============================================================

import Database from 'better-sqlite3';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { getTaiwanTimestamp } from './timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'scripts', 'pipeline-config.json');

// BR-014: 6 個非終態 lifecycle — 三個終態(closed/failed/abandoned)完全不碰,
// 甚至不進入 SELECT 候選集合(byte-identical 自然成立,不需事後比對)。
export const NON_TERMINAL_LIFECYCLES = [
  'dispatching', 'running', 'reported', 'awaiting-review', 'revising', 'approved',
];
export const TERMINAL_LIFECYCLES = ['closed', 'failed', 'abandoned'];

// SDD Spec §4.3 phase → script-suffix 對照(擴充 Stop-WorkerSafe 原本只認三個 BMAD phase 的 switch)
export function phaseToSuffix(phase) {
  if (phase === 'create-story') return 'create';
  if (phase === 'dev-story' || phase === 'dev-story-complex' || /^dev-story-fix-R/.test(phase)) return 'dev';
  if (phase === 'code-review' || /^code-review-R/.test(phase)) return 'review';
  if (phase === 'general') return 'general';
  return phase;
}

// 常數命令字串(禁止把任何 DB 欄位值插進來) — 一次取回全部 powershell.exe 的 ProcessId+CommandLine
//
// ⚠ 宿主耦合:這裡的 `Name='powershell.exe'` 比原判準(shared-utils.ps1:433 只用 ProcessId 查、
// 不過濾 Name)窄,前提是 `.claude/rules/encoding-discipline.md` §2 的生產宿主契約 ——
// party-to-pipeline 鎖定 Windows PowerShell 5.1、禁 `Start-Process pwsh`。若哪天宿主改成
// `pwsh.exe`(須先重跑 whp-1 R2),所有 run 都會 tuple 2 失敗被全庫誤標 abandoned;
// 屆時本行必須跟著改,別只改 worker 腳本。
const PS_PROBE_COMMAND =
  "@(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress";

/** 單次批次探測(BR-023)。失敗時拋出,由呼叫端決定 fail-open(BR-021)。*/
export function probeLiveProcesses() {
  const stdout = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_PROBE_COMMAND], {
    encoding: 'utf8',
    timeout: 10000,
  });
  const parsed = JSON.parse(stdout);
  const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  const map = new Map();
  for (const p of list) {
    if (p && p.ProcessId != null) map.set(Number(p.ProcessId), p.CommandLine || '');
  }
  return map;
}

/** 4-Tuple 判活(BR-016)。回傳 {alive: bool, reason?: string}。比對全在 JS 端完成。*/
export function judgeLiveness(row, liveProcMap) {
  const pid = row.wrapper_pid;
  if (!pid || pid <= 0) {
    return { alive: false, reason: 'not-registered' }; // Tuple 1 fail
  }
  const cmdLine = liveProcMap.get(Number(pid));
  if (cmdLine === undefined) {
    return { alive: false, reason: 'window-gone' }; // Tuple 2 fail
  }
  // Tuple 3+4 一律 case-insensitive 比對:原判準 shared-utils.ps1:440 / :455 用 PowerShell
  // `-notmatch`,其預設即 case-insensitive(要 case-sensitive 得寫 `-cnotmatch`),且 Windows
  // 路徑本身大小寫不敏感。若此處用 case-sensitive,ipc_dir 與 cmdline 僅大小寫不同
  // (例如 `${USER_HOME}\...` vs `${USER_HOME}\...`)就會誤判 pid-reused,把活著的 worker
  // 標成 abandoned —— 失敗方向剛好是最危險的那一邊。
  const haystack = cmdLine.toLowerCase();
  if (!row.ipc_dir || !haystack.includes(String(row.ipc_dir).toLowerCase())) {
    return { alive: false, reason: 'pid-reused' }; // Tuple 3 fail
  }
  const suffix = phaseToSuffix(row.phase);
  if (!haystack.includes(`worker-${suffix}.ps1`.toLowerCase())) {
    return { alive: false, reason: 'cmdline-mismatch' }; // Tuple 4 fail
  }
  return { alive: true };
}

/** 帶 WHP3-Exx 代碼的錯誤 — 拋出而非直接 process.exit。*/
export class WhpCliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// BR-129:與 guardian-tick.js:65-67 parseTwTimestamp 逐字同構。本檔不能 import 該函式 ——
// guardian-tick.js 反向 import 本檔的 judgeLiveness/probeLiveProcesses/NON_TERMINAL_LIFECYCLES
// (SSoT E31),若本檔再 import 回 guardian-tick.js 會形成循環依賴。純 1 行公式,異動需兩處同步。
function parseTwTimestamp(iso) {
  return Date.parse(iso);
}

// BR-129:fallback 值與 guardian-tick.js:45/51 DEFAULT_CONFIG 的同名兩鍵一致。純記憶體常數,
// 不做檔案讀取 —— reap() 本身須維持純函式(見下方 reap() 的既有 DI 設計:dbPath/dryRun/probeFn
// 皆可注入,不做檔案 I/O),檔案讀取只在 loadDispatchGraceConfig()/cliMain() 這一層發生。
// CR ruling (whp-4 code-review, 2026-07-29): AC12 additionally asks for zero grace-second literals
// in this file. That cannot hold at the same time as the sentence above — a fallback whose values
// must equal guardian-tick.js's DEFAULT_CONFIG has to state those values. The grep assertion is the
// one that gives: this line is the single deliberate literal, the computation itself reads config
// (see reap()), and reap-worker-runs.test.js has a case pinning this default's behaviour.
const DEFAULT_DISPATCH_GRACE_CFG = { dispatchConfirmSec: 30, guardianDispatchGraceSec: 120 };

/** 讀 scripts/pipeline-config.json 的 workerProtocol —— 與 guardian-tick.js:614-618
 * loadFileConfig() 讀同一份檔案同一個 key(BR-129「兩處讀同一組 config key」)。只在
 * cliMain() 呼叫,reap() 核心邏輯不觸碰檔案系統。configPath 可注入(比照 guardian-tick.js
 * loadFileConfig 的 CR F2 慣例,供測試覆蓋讀取失敗分支)。*/
export function loadDispatchGraceConfig(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8').replace(/^﻿/, '');
  const parsed = JSON.parse(raw);
  return parsed.workerProtocol || {};
}

/** CAS abandon 寫入 —— 共用於既有 4-Tuple 判死路徑與 BR-129 新增的 dispatch-grace 路徑,
 * 避免同一段 UPDATE 語句在檔案內出現兩份而彼此漂移。UPDATE 語句本身逐字對齊
 * guardian-tick.js:188-198 markAbandoned()。*/
function markRowAbandoned(db, row, now, dryRun, report, reason) {
  if (dryRun) {
    report.reaped++;
    report.runs.push({
      run_id: row.run_id, story_id: row.story_id, phase: row.phase,
      from: row.lifecycle, to: 'abandoned', reason,
    });
    return;
  }
  // BR-019: CAS — UPDATE 帶 AND lifecycle=<觀察值>,changes===0 記入 skipped_cas_lost
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
  } else {
    report.reaped++;
    report.runs.push({
      run_id: row.run_id, story_id: row.story_id, phase: row.phase,
      from: row.lifecycle, to: 'abandoned', reason,
    });
  }
}

/**
 * 核心對帳邏輯 — 純函式(不呼叫 process.exit / console),回傳 report 物件供 CLI 層或測試各自處理。
 * @param {{dbPath?: string, dryRun?: boolean, probeFn?: () => Map<number,string>, now?: string, config?: object}} [opts]
 */
export function reap(opts = {}) {
  const {
    dbPath = DB_PATH,
    dryRun = false,
    probeFn = probeLiveProcesses,
    now = getTaiwanTimestamp(),
    config = {},
  } = opts;
  const cfg = { ...DEFAULT_DISPATCH_GRACE_CFG, ...config };
  const nowMs = parseTwTimestamp(now);

  let db;
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  } catch (err) {
    throw new WhpCliError('WHP3-E07', err.message);
  }

  let candidates;
  let terminalCount;
  try {
    const placeholders = NON_TERMINAL_LIFECYCLES.map(() => '?').join(',');
    candidates = db.prepare(`SELECT * FROM worker_runs WHERE lifecycle IN (${placeholders})`).all(...NON_TERMINAL_LIFECYCLES);
    const tPlaceholders = TERMINAL_LIFECYCLES.map(() => '?').join(',');
    terminalCount = db.prepare(`SELECT count(*) c FROM worker_runs WHERE lifecycle IN (${tPlaceholders})`).get(...TERMINAL_LIFECYCLES).c;
  } catch (err) {
    db.close();
    throw new WhpCliError('WHP3-E07', err.message);
  }

  const report = {
    scanned: candidates.length,
    alive: 0,
    reaped: 0,
    skipped_inline: 0,
    skipped_cas_lost: 0,
    skipped_dispatch_grace: 0,
    skipped_terminal: terminalCount,
    probe_unavailable: false,
    dry_run: dryRun,
    runs: [],
    generated_at: getTaiwanTimestamp(),
  };

  // BR-015: run_mode='inline' 於 liveness 之前先行跳過(無視窗可消失,SSoT G26)
  const inlineRows = candidates.filter(r => r.run_mode === 'inline');
  report.skipped_inline = inlineRows.length;
  const toJudge = candidates.filter(r => r.run_mode !== 'inline');

  let liveProcMap = null;
  if (toJudge.length > 0) {
    try {
      liveProcMap = probeFn();
    } catch (err) {
      // BR-021: fail-open — 探測失敗絕不等同「已死」,mark 0 rows,exit 0
      report.probe_unavailable = true;
    }
  }

  if (liveProcMap) {
    for (const row of toJudge) {
      if (row.lifecycle === 'dispatching' && (row.wrapper_pid == null || row.wrapper_pid <= 0)) {
        // BR-129:逐字同構 guardian-tick.js:229-237(BR-G08)—— dispatching 幽靈(尚無
        // wrapper_pid)不進 4-Tuple 判活(judgeLiveness 本身不動),改年齡規則:超過
        // (dispatchConfirmSec + guardianDispatchGraceSec) 秒才視為放棄。對齊
        // TD-WHP3-REAPER-DISPATCH-RACE-NO-GRACE-WINDOW debt。
        const startedMs = parseTwTimestamp(row.started_at);
        const graceMs = (cfg.dispatchConfirmSec + cfg.guardianDispatchGraceSec) * 1000;
        if (nowMs - startedMs > graceMs) {
          markRowAbandoned(db, row, now, dryRun, report, 'dispatch-grace-expired');
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
      markRowAbandoned(db, row, now, dryRun, report, verdict.reason);
    }
  }

  db.close();
  return report;
}

// ---------- CLI 入口(僅在直接執行時跑,匯入供測試時不觸發) ----------

function parseArgs(raw) {
  return {
    dryRun: raw.includes('--dry-run'),
    json: raw.includes('--json'),
    help: raw.includes('--help') || raw.includes('-h'),
  };
}

export function printUsage() {
  console.log('Usage:');
  console.log('  node reap-worker-runs.js              # 掃描 + 標記(預設,實際套用)');
  console.log('  node reap-worker-runs.js --dry-run    # 掃描 + 報告,不寫入');
  console.log('  node reap-worker-runs.js --json       # 機器可讀報告');
}

function printHumanReport(report, dryRun) {
  console.log(`Scanned: ${report.scanned} | Alive: ${report.alive} | Reaped${dryRun ? ' (would)' : ''}: ${report.reaped}`);
  console.log(`Skipped — inline: ${report.skipped_inline} | dispatch_grace: ${report.skipped_dispatch_grace} | cas_lost: ${report.skipped_cas_lost} | terminal(not scanned): ${report.skipped_terminal}`);
  console.log(`Probe: ${report.probe_unavailable ? 'UNAVAILABLE (fail-open, 0 rows modified)' : 'ok'}${dryRun ? ' | DRY-RUN (nothing written)' : ''}`);
  for (const r of report.runs) {
    console.log(`  - ${r.run_id} (${r.story_id}/${r.phase}) ${r.from} → ${r.to} [${r.reason}]`);
  }
}

export function cliMain(rawArgs) {
  const opts = parseArgs(rawArgs);
  if (opts.help) {
    printUsage();
    return 0;
  }

  let fileCfg = {};
  try {
    fileCfg = loadDispatchGraceConfig();
  } catch (err) {
    // fail-open:config 讀不到就退回 DEFAULT_DISPATCH_GRACE_CFG,不影響既有 4-Tuple 對帳
    // (同 BR-021 探測失敗 fail-open 精神,不因 grace-window config 缺失而擋住既有掃描)。
  }

  try {
    const report = reap({ dryRun: opts.dryRun, config: fileCfg });
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report, opts.dryRun);
    }
    return 0;
  } catch (err) {
    const code = err instanceof WhpCliError ? err.code : 'WHP3-E07';
    console.error(`❌ ${code}: ${err.message}`);
    return 1;
  }
}

// Guard: 只在「本檔就是 node 的執行入口」時跑 CLI。
// 🔴 不可改回 `!process.env.VITEST` —— 那個判準只有 vitest 會設,任何其他 Node process
// 一 import 本模組(下游 whp-7 守護要複用 judgeLiveness / phaseToSuffix)就會**實際對 live
// phycool.db 跑完一輪對帳並寫入 abandoned 標記**,是靜默的破壞性副作用。
// 對齊同目錄 log-session.js:446 / log-turn.js:186 / log-workflow.js:199 的既有 idiom。
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  process.exit(cliMain(process.argv.slice(2)));
}
