#!/usr/bin/env node
/*
 * pipeline-statusline.cjs — Claude Code statusLine for party-to-pipeline 子視窗.
 *
 * 目的: worker 子視窗常駐顯示「任務身分」一行(不隨對話捲動消失),讓使用者一眼分辨
 *       哪個視窗對應哪個任務 -> 避免誤關。對齊使用者裁定 (2026-06-26):
 *           {PHASE} | {story_id} | {model} | effort={effort}
 *
 * 主視窗(非 worker): 委派回使用者全域 statusLine(~/.claude/settings.json),
 *       原樣保留既有 context 用量進度條等功能 -> 不覆蓋使用者個人設定。
 *
 * 機制: Claude Code 每輪渲染呼叫本命令,stdin 餵 session JSON(含 model),
 *       stdout 第一行 = 狀態列。worker-*.ps1 啟動 claude 前已注入 ENV:
 *         PHYCOOL_ORCHESTRATOR_MODE=1 / PIPELINE_PHASE / PIPELINE_STORY_ID /
 *         CLAUDE_CODE_EFFORT_LEVEL (+ 可選 PIPELINE_MODEL)
 *       claude 繼承這些 ENV,本腳本(由 claude spawn)亦繼承 -> 可讀。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let stdinModel = '';
  try {
    const j = JSON.parse(input || '{}');
    if (j && j.model) stdinModel = j.model.id || j.model.display_name || '';
  } catch (_) { /* stdin 非 JSON 時靜默 */ }

  const isWorker = process.env.PHYCOOL_ORCHESTRATOR_MODE === '1' && !!process.env.PIPELINE_STORY_ID;

  if (isWorker) {
    // worker 子視窗: 任務身分
    const phase = String(process.env.PIPELINE_PHASE || '').toUpperCase();
    const story = process.env.PIPELINE_STORY_ID || '';
    const model = process.env.PIPELINE_MODEL || stdinModel || '';
    const effort = process.env.CLAUDE_CODE_EFFORT_LEVEL || '';
    const parts = [phase, story, model].filter(Boolean);
    if (effort) parts.push('effort=' + effort);
    process.stdout.write('▶ ' + parts.join(' | '));
  } else {
    // 主視窗: 委派回全域 statusLine(保留使用者既有 context 進度條等),失敗則退回最小顯示
    const delegated = delegateToGlobalStatusLine(input);
    process.stdout.write(delegated !== null ? delegated : (stdinModel ? ('◆ ' + stdinModel) : ''));
  }
});

/**
 * 讀全域 ~/.claude/settings.json 的 statusLine.command,以本次 stdin JSON 餵入執行,
 * 回傳其 stdout(= 使用者既有 context 進度條輸出)。任何失敗回 null(交由呼叫端退回最小顯示)。
 */
function delegateToGlobalStatusLine(stdinJson) {
  try {
    const gsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
    const cmd = gs && gs.statusLine && gs.statusLine.command;
    if (!cmd || typeof cmd !== 'string') return null;
    const out = execSync(cmd, { input: stdinJson, encoding: 'utf8', timeout: 5000 });
    return (out || '').replace(/\r?\n+$/, '');
  } catch (_) {
    return null;
  }
}
