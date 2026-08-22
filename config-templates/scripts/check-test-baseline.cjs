#!/usr/bin/env node
/**
 * scripts/check-test-baseline.cjs — 測試紅燈基線機械對照
 *
 * 觸發背景: bwu-12-test-baseline-red-reckoning — 既有測試紅燈被四張卡各自造冊卻彼此看不見,
 * 且核心數字(「40 個紅燈」)本身是量測方式(repo-root 形式繞過套件自帶 vitest.config)的產物,
 * 不是紅燈數量。本腳本把「這條紅燈是否已處理」從口述變成可執行判定 —— 對每個 suite 執行釘死
 * 的合法入口,與 docs/implementation-artifacts/test-baseline/{suite}.json 的失敗案例集合做雙向
 * diff(new / resolved),讓後續任一卡的 CR 可用一行指令取代「既有紅、非本卡引入」的口述宣稱。
 *
 * 釘死入口(唯一合法量測方式,理由見兩份 artefact 的 invalid_invocation_note):
 *   - cd .context-db && npx vitest run
 *   - cd tools/dev-console && npx vitest run
 *
 * Usage:
 *   node scripts/check-test-baseline.cjs                # 兩個 suite 皆跑
 *   node scripts/check-test-baseline.cjs --suite <name>  # 只跑一個(context-db | dev-console)
 *
 * Exit codes:
 *   0 = 兩個(或指定的)suite 皆與 artefact 完全相符(new: 0, resolved: 0)
 *   1 = 找到差異(new 和/或 resolved 非空)—— 需要人工判斷:new 必須修,resolved 必須更新 artefact
 *   2 = 前置條件不可信(scripts/pipeline-config.json 於工作樹為 dirty)或基礎設施問題(baseline
 *       artefact 缺失 / suite 啟動失敗)—— 這兩類都不得被誤讀為「乾淨結果」
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const GUARD_REL = 'scripts/pipeline-config.json';

/**
 * 合成案例名,代表「整個測試檔失敗但貢獻 0 個 failed assertion」的 suite-level 失敗
 * (vitest 的 `No test suite found in file` / import 期拋錯 / 檔內 top-level `process.exit`)。
 * [bwu-12 CR F1] 這類失敗使 `npx vitest run` exit 1、JSON `success:false`、`numFailedTestSuites>0`,
 * 但 `numFailedTests` 為 0 且該檔 `assertionResults` 為空陣列 —— 只比對案例集合的 diff 對它結構上全盲。
 * 這正是本腳本存在理由的同型缺陷再上一層:「未被收集的測試比看得見的失敗更糟」。故一律轉為合成案例,
 * 使其與一般紅燈在 diff 中同等參與。
 */
const SUITE_LEVEL_CASE = '<suite-level failure: file failed to load or collect>';

const SUITES = [
  {
    name: 'context-db',
    cwd: path.join(REPO_ROOT, '.context-db'),
    artefactPath: path.join(REPO_ROOT, 'docs/implementation-artifacts/test-baseline/context-db.json'),
  },
  {
    name: 'dev-console',
    cwd: path.join(REPO_ROOT, 'tools/dev-console'),
    artefactPath: path.join(REPO_ROOT, 'docs/implementation-artifacts/test-baseline/dev-console.json'),
  },
];

// ============================================================
// Pure functions (exported — scripts/check-test-baseline.test.cjs 直接餵合成資料驗證,
// 不需真的跑 vitest)
// ============================================================

function caseKey(c) {
  return `${c.file}::${c.case}`;
}

/**
 * baselineCases / liveCases: Array<{file, case}>
 * 回傳 { new: string[], resolved: string[] }(元素為 "file::case" key,BR-004)
 */
function diffFailures(baselineCases, liveCases) {
  const baselineKeys = new Set(baselineCases.map(caseKey));
  const liveKeys = new Set(liveCases.map(caseKey));
  const newItems = liveCases.filter((c) => !baselineKeys.has(caseKey(c))).map(caseKey);
  const resolvedItems = baselineCases.filter((c) => !liveKeys.has(caseKey(c))).map(caseKey);
  return { new: newItems, resolved: resolvedItems };
}

/**
 * reportJson: 已 JSON.parse 過的 vitest --reporter=json 輸出物件
 * suiteCwd: suite 根目錄絕對路徑(用於把 testResults[].name 的絕對路徑轉為 suite-relative)
 * 拋錯: reportJson 不含 numTotalTests(視為畸形報告,呼叫端應歸類為 suite 啟動失敗)
 */
function extractFailures(reportJson, suiteCwd) {
  if (!reportJson || typeof reportJson.numTotalTests !== 'number') {
    throw new Error('malformed vitest JSON report (missing numTotalTests)');
  }
  const failures = [];
  for (const r of reportJson.testResults || []) {
    const relFile = path.relative(suiteCwd, r.name).split(path.sep).join('/');
    let caseLevelFailures = 0;
    for (const a of r.assertionResults || []) {
      if (a.status === 'failed') {
        failures.push({ file: relFile, case: a.title });
        caseLevelFailures += 1;
      }
    }
    // [bwu-12 CR F1] 見 SUITE_LEVEL_CASE 註解:檔案級失敗但零 failed assertion 者必須被看見。
    if (r.status === 'failed' && caseLevelFailures === 0) {
      failures.push({ file: relFile, case: SUITE_LEVEL_CASE });
    }
  }
  return {
    total: reportJson.numTotalTests,
    passed: reportJson.numPassedTests,
    failed: reportJson.numFailedTests,
    failedSuites: reportJson.numFailedTestSuites || 0,
    failures,
  };
}

/** diff 輸出對兩個方向各自說明應採取的動作(BR-016)—— 純列差異不說明動作,agent 仍會退回口述。 */
function formatDiffOutput(suiteName, diff) {
  const lines = [];
  lines.push(`[${suiteName}] new: ${diff.new.length}, resolved: ${diff.resolved.length}`);
  if (diff.new.length > 0) {
    lines.push('  new ⇒ 本次變更引入,必須修:');
    for (const k of diff.new) lines.push(`    - ${k}`);
  }
  if (diff.resolved.length > 0) {
    lines.push('  resolved ⇒ 造冊已過期,必須更新 artefact:');
    for (const k of diff.resolved) lines.push(`    - ${k}`);
  }
  return lines.join('\n');
}

// ============================================================
// I/O-touching functions
// ============================================================

/** scripts/pipeline-config.json 工作樹 dirty 時(smoke-test.ps1 已知干擾)不得回報乾淨結果(BR-016)。 */
function isPipelineConfigClean() {
  const r = spawnSync('git', ['status', '--porcelain', '--', GUARD_REL], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0 && r.error) {
    // git 不可達屬基礎設施問題而非本檔案的真實 dirty 狀態,fail-open 並記警告,不誤擋。
    process.stderr.write(`[check-test-baseline] warn: git status check failed (${r.error.message}), assuming clean\n`);
    return true;
  }
  return (r.stdout || '').trim() === '';
}

/**
 * 回傳已解析的 baseline 物件;檔案不存在回 null(呼叫端轉 exit 2)。
 * [bwu-12 CR F6] JSON 毀損一律 throw 具名錯誤,由呼叫端歸類為 exit 2 —— 原先未 guard 的
 * `JSON.parse` 會讓毀損 artefact 以未捕捉例外結束(exit 1),而 exit 1 在本腳本的契約裡意思是
 * 「有差異」,等同把基礎設施故障讀成量測結果。對齊 SDD §4 exit code 表與 §5「missing/malformed → 2」。
 */
function loadBaseline(artefactPath) {
  if (!fs.existsSync(artefactPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(artefactPath, 'utf8'));
  } catch (e) {
    throw new Error(`baseline artefact is malformed JSON at ${artefactPath}: ${e.message}`);
  }
}

/** 對單一 suite 執行釘死指令並解析結果;啟動失敗(非「有測試失敗」)一律 throw。 */
function runSuiteLive(suite) {
  const tmpFile = path.join(
    os.tmpdir(),
    `check-test-baseline-${suite.name}-${process.pid}-${Date.now()}.json`,
  );
  spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${tmpFile}`], {
    cwd: suite.cwd,
    encoding: 'utf8',
    shell: true,
    // vitest 對「有測試失敗」也會回非 0 exit code,這是預期行為,不視為啟動失敗——
    // 啟動失敗的判準是「JSON 報告根本沒寫出來」(見下方 existsSync 檢查)。
  });
  if (!fs.existsSync(tmpFile)) {
    throw new Error(`suite '${suite.name}' failed to launch — no JSON report produced at ${tmpFile}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(tmpFile, 'utf8');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
  }
  let reportJson;
  try {
    reportJson = JSON.parse(raw);
  } catch (e) {
    throw new Error(`suite '${suite.name}' produced non-JSON report: ${e.message}`);
  }
  return extractFailures(reportJson, suite.cwd);
}

// ============================================================
// CLI
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const suiteFlagIdx = args.indexOf('--suite');
  const suiteFilter = suiteFlagIdx >= 0 ? args[suiteFlagIdx + 1] : null;

  // [bwu-12 CR L1] `--suite` 後缺值時,原邏輯得到 undefined 而使 filter 靜默失效並跑完兩個 suite,
  // 呼叫者拿到的是「比預期更廣」的結果卻無任何提示。缺值視為用法錯誤,與未知 suite 名同等處理。
  if (suiteFlagIdx >= 0 && !suiteFilter) {
    console.error(
      `[check-test-baseline] --suite requires a value (known: ${SUITES.map((s) => s.name).join(', ')})`,
    );
    process.exit(2);
  }

  // 前置條件自我防護必須是第一件事 —— 在檢查 artefact 是否存在、在跑任何 suite 之前,
  // 否則後續呼叫者不會記得「smoke-test.ps1 並行會誤紅」這條警示。
  if (!isPipelineConfigClean()) {
    console.log(
      `[check-test-baseline] BLOCKED: ${GUARD_REL} 於工作樹為 dirty(已知 smoke-test.ps1 Group 13/15 並行干擾特徵)。` +
      '無法在此檔案半寫狀態下回報可信 diff —— 請先確認無並行 smoke-test.ps1 執行,或待其完成後重跑。',
    );
    process.exit(2);
  }

  const suites = SUITES.filter((s) => !suiteFilter || s.name === suiteFilter);
  if (suites.length === 0) {
    console.error(
      `[check-test-baseline] unknown --suite '${suiteFilter}' (known: ${SUITES.map((s) => s.name).join(', ')})`,
    );
    process.exit(2);
  }

  let worstExit = 0;
  for (const suite of suites) {
    let baseline;
    try {
      baseline = loadBaseline(suite.artefactPath);
    } catch (e) {
      console.log(`[${suite.name}] BLOCKED: ${e.message} —— 基準毀損不等於沒有紅燈,不得回報 exit 0。`);
      worstExit = Math.max(worstExit, 2);
      continue;
    }
    if (baseline === null) {
      console.log(
        `[${suite.name}] BLOCKED: baseline artefact missing at ${path.relative(REPO_ROOT, suite.artefactPath)}` +
        ' —— 缺基準不等於沒有紅燈,不得回報 exit 0。',
      );
      worstExit = Math.max(worstExit, 2);
      continue;
    }
    let live;
    try {
      live = runSuiteLive(suite);
    } catch (e) {
      console.log(`[${suite.name}] BLOCKED: ${e.message}`);
      worstExit = Math.max(worstExit, 2);
      continue;
    }
    const diff = diffFailures(baseline.cases || [], live.failures);
    console.log(formatDiffOutput(suite.name, diff));
    if (diff.new.length > 0 || diff.resolved.length > 0) {
      worstExit = Math.max(worstExit, 1);
    }
    // [bwu-12 CR F1] 收集規模回退偵測。artefact 的 total 是造冊當下該 suite 被收集到的測試數;
    // 若本次收集數「少於」該值,代表有測試不再被收集(glob 改動 / config 未生效 / 檔案被移除)——
    // 而未被收集的測試不會出現在任何失敗集合裡,只比對失敗集合對此完全看不見。成長(新增測試)
    // 屬正常演進,不視為差異。
    if (typeof baseline.total === 'number' && live.total < baseline.total) {
      console.log(
        `  ⚠ 收集規模回退 ⇒ 造冊 total ${baseline.total},本次只收集到 ${live.total}` +
        ':少收的測試不會出現在失敗集合中,請確認是刻意刪除測試(⇒ 更新 artefact)還是收集設定失效(⇒ 必須修)。',
      );
      worstExit = Math.max(worstExit, 1);
    }
  }
  process.exit(worstExit);
}

if (require.main === module) {
  main();
}

module.exports = {
  diffFailures,
  extractFailures,
  formatDiffOutput,
  caseKey,
  isPipelineConfigClean,
  loadBaseline,
  runSuiteLive,
  SUITES,
  GUARD_REL,
  SUITE_LEVEL_CASE,
};
