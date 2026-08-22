#!/usr/bin/env node
/**
 * pre-edit-impact-advisor.js - PreToolUse hook (matcher: Edit|Write)
 *
 * 機械化 G1: 「改 src/** code symbol 前無 impact 評估」的治理黑洞。
 * gitnexus-discipline.md / CLAUDE.md GitNexus 規範「改 symbol 前必跑 impact」,
 * 但實測無任何 hook 在 src/** 程式碼編輯時提示(cross-ref-precheck 只管 .claude/**)。
 * 本 hook 補此缺口。對齊改善計畫 P0-B (2026-05-25)。
 *
 * 領域劃清: cross-ref-precheck.js 管 .claude/** 配置跨引用;本 hook 管 src/** code symbol impact。
 *
 * 行為:
 *   - 偵測 Edit/Write 既有 src code 檔(.cs/.tsx/.ts 非 test)
 *   - transcript 近期已有 gitnexus impact / codegraph_context 呼叫 -> 抑制(已遵守紀律)
 *   - per-session per-file dedup -> 同檔同 session 不重複提示
 *   - 高 blast-radius 領域(payment/auth/subscription 等) -> 強化措辭
 *   - advisory only (exit 0 always),fail-open
 *   - additionalContext 為陳述句(非命令句,避免觸發 prompt-injection 防禦)
 *
 * 對齊: hooks-creation-discipline.md SUPREME (走 Skill hooks-mechanization 7-step) +
 *       crlf-normalize-discipline (BOM strip) + cross-ref-precheck.js proven skeleton
 *
 * 2026-05-25 建立 (改善計畫 P0-B / G1)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const STDIN_TIMEOUT_MS = 1500;

// src 程式碼檔(.cs/.tsx/.ts);排除測試檔
const CODE_PATH = /(?:^|[\\/])src[\\/].+\.(cs|tsx|ts)$/i;
const TEST_PATH = /(\.test\.|\.spec\.|[\\/]__tests__[\\/]|[\\/]Tests[\\/]|\.Tests[\\/]|Tests\.cs$|Test\.cs$)/i;

// 高 blast-radius 領域(失敗成本最高,對齊業界 "strictest where cost highest")
const SENSITIVE = /(Payment|Subscription|ECPay|Webhook|Order|Refund|Auth|Identity|Security|Quota|License|Invoice|Remittance)/i;

// transcript 近期已有結構分析呼叫 -> 抑制(已遵守紀律,不再提示)
const RECENT_IMPACT = /(mcp__gitnexus__impact|mcp__gitnexus__context|codegraph_context|codegraph_callers|codegraph_callees)/;

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    const timer = setTimeout(() => { try { process.stdin.pause(); } catch { /* ignore */ } resolve(data); }, STDIN_TIMEOUT_MS);
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

function parseJson(raw) {
  if (!raw) return null;
  const t = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  try { return JSON.parse(t); } catch { return null; }
}

// transcript 末段掃描是否近期已有 impact / codegraph 呼叫
function recentlyAnalyzed(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
    const raw = fs.readFileSync(transcriptPath, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n');
    const tail = lines.slice(-120).join('\n');
    return RECENT_IMPACT.test(tail);
  } catch { return false; }
}

// per-session per-file dedup(避免同檔同 session 重複提示)
function alreadyAdvised(projectDir, sessionId, filePath) {
  try {
    const dir = path.join(projectDir, '.context-db', 'ecc-state');
    const f = path.join(dir, 'impact-advisor-seen.json');
    let state = {};
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      state = parseJson(raw) || {};
    } else {
      fs.mkdirSync(dir, { recursive: true });
    }
    const key = sessionId || 'no-session';
    const seen = Array.isArray(state[key]) ? state[key] : [];
    if (seen.includes(filePath)) return true;
    seen.push(filePath);
    state[key] = seen.slice(-200);
    const keys = Object.keys(state);
    if (keys.length > 5) { for (const k of keys.slice(0, keys.length - 5)) delete state[k]; }
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, f);
    return false;
  } catch { return false; } // fail-open: 不確定就提示
}

(async () => {
  const data = parseJson(await readStdin());
  if (!data) process.exit(0);
  if (data.tool_name !== 'Edit' && data.tool_name !== 'Write') process.exit(0);

  const filePath = String((data.tool_input && data.tool_input.file_path) || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  // 只攔 src code 檔,排除 test
  if (!CODE_PATH.test(filePath) || TEST_PATH.test(filePath)) process.exit(0);

  // 只對既有檔(修改既有 symbol);新檔無 callers 無 impact
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  let exists = false;
  try { exists = fs.existsSync(abs); } catch { exists = false; }
  if (!exists) process.exit(0);

  // 近期已做結構分析 -> 抑制
  if (recentlyAnalyzed(data.transcript_path)) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd();
  if (alreadyAdvised(projectDir, data.session_id, filePath)) process.exit(0);

  const isFrontend = /\.(tsx|ts)$/i.test(filePath);
  const isSensitive = SENSITIVE.test(filePath);
  const tool = isFrontend
    ? 'codegraph_context / codegraph_callers (the frontend symbol layer; phycool search_symbols is C#-only and does not index frontend)'
    : 'codegraph_context plus mcp__gitnexus__impact (upstream)';

  let note;
  if (isSensitive) {
    note = `The file ${filePath} is existing source in a high-blast-radius domain (payment / auth / subscription / order). ` +
      `Per CLAUDE.md GitNexus discipline, modifying a shared symbol here without first assessing its callers and blast radius carries regression risk to critical flows. ` +
      `Available before this change: ${tool} returns callers and a risk level (LOW/MEDIUM/HIGH/CRITICAL); mcp__gitnexus__detect_changes can confirm the change scope before commit.`;
  } else {
    note = `The file ${filePath} is existing source code. ` +
      `Structural impact tools are available before modifying a shared symbol: ${tool}. ` +
      `Assessing callers and blast radius first reduces regression risk (gitnexus-discipline).`;
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  try { process.stderr.write(`[pre-edit-impact-advisor] ${err.message}\n`); } catch { /* ignore */ }
  process.exit(0); // fail-open
});
