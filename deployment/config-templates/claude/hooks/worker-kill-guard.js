#!/usr/bin/env node
// worker-kill-guard.js — PreToolUse(Bash|PowerShell)殺 worker 機械攔截
//
// 配套 .claude/rules/worker-lifecycle-judgment.md(SUPREME)的「核心機械觸發層」:
//   殺 worker 是 Bash/PowerShell 命令(非檔案編輯),rule 的 paths 不觸發 → 靠本 hook 在
//   殺 worker 命令時攔截,依 DB 實際 lifecycle 判定,而非 CPU/timeout 投機。
//
// v2(whp-6-directive-delivery-and-close Tasks 5.5-5.7):由純 advisory 升級為條件式
// hard-block —— 能從 DB 查得目標 run 的 lifecycle 時,running/revising(worker 仍在執行,
// 含收尾階段)一律 BLOCK(exit 2);approved 以外其餘 lifecycle 一律 allow(exit 0)。
// DB 不可用 / 無法從命令列解析出目標(PID 或 run_id)時,fail-open 退回 advisory-allow
// (exit 0 + additionalContext,即 v1 的原行為)—— 判斷不出來時絕不誤殺,只提示。
//
// 觸發事件: 2026-06-12 m0-11 create,中控用「CPU 低 + dispatch timeout」投機判 worker hung,
//   殺 2 次其實正常工作的 worker(PID 20852 未殺它 22:15 自己完成 status=completed)。
'use strict';

const path = require('path');

const STDIN_TIMEOUT_MS = 1000;
const MAX_STDIN_BYTES = 256 * 1024;
const BLOCKED_LIFECYCLES = new Set(['running', 'revising']);
const PID_PATTERN = /(?:-Id|-ProcessId|\/PID)\s+(\d+)/i;
const RUN_ID_PATTERN = /\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/;

// ── Stdin reader(timeout + max bytes) ───────────────────────────────────

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    let bytes = 0;
    const timer = setTimeout(() => {
      try { process.stdin.removeAllListeners(); process.stdin.pause(); } catch { /* ignore */ }
      resolve(data);
    }, STDIN_TIMEOUT_MS);
    try { process.stdin.setEncoding('utf8'); } catch { /* ignore */ }
    process.stdin.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes < MAX_STDIN_BYTES) data += chunk;
    });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

function parseJsonStripBom(raw) {
  if (!raw) return null;
  const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  try { return JSON.parse(trimmed); } catch { return null; }
}

// ── 偵測邏輯(exported for tests) ────────────────────────────────────────

// 排除「字串提到但非執行殺進程」的命令(false positive 修正)
// git commit/log message、echo、grep、node -e 測試等含關鍵字是「提到/搜尋/測試」非「執行」
function isMention(cmd) {
  const cmdTrim = cmd.trim();
  return /^(git|echo|grep|rg|cat|less|head|tail|printf|sed|awk|node)\b/i.test(cmdTrim)
    || /\bgit\s+(commit|log|show|diff)\b/i.test(cmd)
    || /<<\s*['"]?EOF/i.test(cmd);
}

// whp-6 起唯一 controller-authorized 關窗路徑 —— 呼叫本腳本一律 pass-through。這是本檔
// 「先於偵測」的顯式白名單(Task 5.7 回歸鎖):close-worker.ps1 內部才呼叫 taskkill,agent
// 命令列上原本就看不到該字面,isKillWorkerCommand 現在本就不會誤攔;本函式存在的目的是防
// 未來 isKillWorkerCommand 正則被放寬(如新增泛用 close/kill 動詞偵測)時,誤傷這條唯一合法
// 路徑 —— 對應回歸測試見 worker-kill-guard.test.js「close-worker.ps1 呼叫恆 allow」案例。
function isCloseWorkerScriptInvocation(cmd) {
  return /close-worker\.ps1/i.test(cmd);
}

// 複合命令切段(`&&` / `||` / `;`)。單獨 `|` 不切 —— PowerShell pipeline
// `Get-Process claude | Stop-Process` 整條仍應被視為一個殺命令。
function splitSegments(cmd) {
  return cmd.split(/&&|\|\||;/).map((s) => s.trim()).filter(Boolean);
}

// 逐段找出「該段自身是殺命令、且該段不是 mention」的第一段;找不到代表整條不是執行殺命令。
// 必須逐段判定:本專案 Bash 工具命令幾乎都是 `cd "<path>" && <verb> ...` 形式,而 isMention
// 只錨定字串開頭,整條命令的開頭是 `cd` 故永不命中 mention 清單 —— `cd x && grep "Stop-Process
// -Name claude" f` 這類純搜尋因此被判為殺命令並注入無關 advisory(CR 2026-08-01 於本次審查
// 執行 grep 時實測命中)。逐段後該段以 grep 開頭即正確歸為 mention。
function findExecutableKillSegment(cmd) {
  for (const seg of splitSegments(cmd)) {
    if (!isMention(seg) && isKillWorkerCommand(seg)) return seg;
  }
  return null;
}

// 偵測殺 worker 進程命令(命令主體執行,非字串提到)
function isKillWorkerCommand(cmd) {
  const isStopProcess = /Stop-Process/i.test(cmd);
  const isStopWorkerSafe = /Stop-WorkerSafe/i.test(cmd);
  const mentionsClaudeOrWorker = /claude|worker|-Name\s+claude|-Id\s+\d/i.test(cmd);
  const isTaskkill = /taskkill/i.test(cmd) && /claude|worker/i.test(cmd);
  return (isStopProcess && mentionsClaudeOrWorker) || isStopWorkerSafe || isTaskkill;
}

// 從命令列擷取可能的 wrapper_pid(-Id N / -ProcessId N / /PID N)或 run_id(UUID)。
// 兩者皆選填,任一擷取到即嘗試 DB 查詢;都擷取不到 → 呼叫端 fail-open advisory-allow。
function extractTarget(cmd) {
  const pidMatch = cmd.match(PID_PATTERN);
  const runIdMatch = cmd.match(RUN_ID_PATTERN);
  return {
    pid: pidMatch ? Number(pidMatch[1]) : null,
    runId: runIdMatch ? runIdMatch[1] : null,
  };
}

// lookupFn 由呼叫端注入(DI,mirrors close-worker-ops.js probeFn pattern)—— 測試傳入假
// 查詢函式,production 走 dbLookup()。回傳 { run_id, lifecycle } 或 null(查無此列)。
// lookupFn 拋錯(DB 不可用)一律視為「查不到」,fail-open advisory-allow,不使 hook 崩潰。
function decide(cmd, lookupFn) {
  if (!cmd || typeof cmd !== 'string') return { action: 'allow', reason: 'empty-command' };
  if (isMention(cmd)) return { action: 'allow', reason: 'mention-not-execution' };
  if (isCloseWorkerScriptInvocation(cmd)) return { action: 'allow', reason: 'close-worker-script-sanctioned-path' };
  const killSegment = findExecutableKillSegment(cmd);
  if (!killSegment) return { action: 'allow', reason: 'not-a-kill-command' };

  // 目標只從真正的殺命令那一段擷取 —— 從整條命令撈會把前段路徑 / 其他子命令裡的數字或 UUID
  // 誤當成目標(例:`cd /x/8b2b5e2e-... && Stop-Process -Name claude` 會撈到路徑裡的 UUID)。
  const { pid, runId } = extractTarget(killSegment);
  if (!pid && !runId) return { action: 'advisory-allow', reason: 'target-unresolvable' };

  let run;
  try {
    run = lookupFn({ pid, runId });
  } catch {
    return { action: 'advisory-allow', reason: 'db-unavailable' };
  }
  if (!run || !run.lifecycle) return { action: 'advisory-allow', reason: 'run-not-found' };

  if (BLOCKED_LIFECYCLES.has(run.lifecycle)) {
    return { action: 'block', reason: 'lifecycle-executing', lifecycle: run.lifecycle, runId: run.run_id };
  }
  return { action: 'allow', reason: 'lifecycle-not-executing', lifecycle: run.lifecycle, runId: run.run_id };
}

// ── Production DB lookup ─────────────────────────────────────────────────
// better-sqlite3 只裝在 .context-db/node_modules/,以絕對路徑直接 require 該模組檔案,
// 不依賴 cwd 的模組解析鏈(hook 進程的 cwd 由 harness 決定,不保證是 .context-db/)。
function dbLookup({ pid, runId }) {
  const modulePath = path.join(__dirname, '..', '..', '.context-db', 'node_modules', 'better-sqlite3');
  const dbPath = path.join(__dirname, '..', '..', '.context-db', 'phycool.db');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const Database = require(modulePath);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 2000 });
  try {
    if (runId) {
      return db.prepare('SELECT run_id, lifecycle FROM worker_runs WHERE run_id = ?').get(runId) || null;
    }
    return db
      .prepare('SELECT run_id, lifecycle FROM worker_runs WHERE wrapper_pid = ? ORDER BY started_at DESC LIMIT 1')
      .get(pid) || null;
  } finally {
    db.close();
  }
}

// ── 訊息組裝(additionalContext 為陳述句,非命令句 — 避免 prompt-injection 防禦)────

function buildAdvisory() {
  return [
    '[worker-lifecycle-judgment] 偵測到殺 worker 進程命令,但無法從 DB 判定目標 run 的 lifecycle(DB 不可用,或命令列無法解析出 PID/run_id)。party-to-pipeline 子視窗判別規範摘要:',
    '',
    'dispatch script 的 timeout 不等於 worker hung,也不等於 worker 死亡。worker(claude 互動視窗)是獨立進程,dispatch 薄手 timeout 只是「放棄等待」,worker 仍繼續跑。視窗永不自動關閉(2026-08-01 whp-2 起)——關窗只有兩條路:使用者手動關閉,或中控呼叫 close-worker.ps1(whp-6 起唯一 controller-authorized 程式化關窗途徑)。party-to-pipeline main-controlled-mode §10 D14 明文: claude hang detection 缺 progress signal(無可靠 CPU/timeout hang 信號);§11: worker timeout 但 DB done 是常態。',
    '',
    '殺 worker 前的 5 題判別(worker-lifecycle-judgment.md §5):',
    '1. DB updated_at 是否在 dispatch 啟動後更新?(有 = worker 在工作)',
    '2. IPC status-{phase}.json 是否出現?(有 = worker 已完成,改驗 DB 證據)',
    '3. dispatch timeout 是否只是放棄等待而非 worker 死?(PID 仍 ALIVE = 可續等)',
    '4. 是否看過子視窗實際輸出?(互動模式人可見,視窗永不自動關閉故隨時可看)',
    '5. 是否讀過 main-controlled-mode §4/§10/§11 的判別正解?',
    '',
    '2026-06-12 m0-11 事故參考: CPU 低是 claude 等 LLM API 的正常狀態(網路 I/O wait),非 hung 證據。當時據此投機殺了 2 次正常工作的 worker。',
  ].join('\n');
}

function buildBlockMessage(result) {
  return [
    `[worker-lifecycle-judgment] BLOCKED: run_id=${result.runId} 目前 lifecycle='${result.lifecycle}'(worker 仍在執行中),不得殺此進程。`,
    '',
    '對齊 .claude/rules/worker-lifecycle-judgment.md(SUPREME)「後台軌從不殺執行中 worker」鐵則:DB deliverable done 不等於 turn 結束,running/revising 一律代表 worker 仍在做事(含收尾階段)。',
    '',
    '正解:',
    '- 若懷疑停滯,查 worker_runs.health_flag / requires_attention 是否已被 pipeline-guardian.ps1 標記 stalled-suspect(30/10/10 探測結果),而非自行計時判殺。',
    '- 若目標 run 已進入 approved(gate 已核可,四前置皆過),改呼叫 .claude/skills/party-to-pipeline/scripts/close-worker.ps1(whp-6 起唯一 controller-authorized 關窗途徑)。',
    '- 緊急情況人工確認後可設環境變數 PHYCOOL_KILLGUARD_BYPASS=1 略過本次攔截(僅供緊急排障,勿常態使用)。',
  ].join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.PHYCOOL_KILLGUARD_BYPASS === '1') process.exit(0);

  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const input = parseJsonStripBom(raw) || {};

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) process.exit(0);

  const result = decide(cmd, dbLookup);

  if (result.action === 'block') {
    try { process.stderr.write(buildBlockMessage(result)); } catch { /* ignore */ }
    process.exit(2);
  }

  if (result.action === 'advisory-allow') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: buildAdvisory(),
      },
    }));
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch(() => process.exit(0)); // fail-open — hook 內部錯誤絕不阻擋工作流
} else {
  module.exports = {
    decide,
    isMention,
    isKillWorkerCommand,
    isCloseWorkerScriptInvocation,
    extractTarget,
    dbLookup,
    BLOCKED_LIFECYCLES,
  };
}
