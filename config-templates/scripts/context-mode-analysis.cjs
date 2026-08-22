#!/usr/bin/env node
/**
 * context-mode-analysis.cjs — 三執行模式 context 成本分開量測 (read-only, Tianji 證據工具)
 *
 * 按使用者釐清的三模式分開量(取代 large-output-frequency.cjs 池化單筆錯指標):
 *   ① party-to-pipeline    : 開新 Claude Code 視窗跑 BMAD(create/dev/review)。獨立 context,不聚合。
 *                            量 per-window「tool 輸入 token」(CCR 可壓)與「assistant 生成 token」(CCR 不可壓)分開。
 *                            冷啟動 always-on 固定成本不在 transcript(另由 claude-token-decrease 量),此處不重複。
 *   ② 本視窗 Task subagent : Agent/Task tool spawn,子代理「回傳」進本 orchestrator。量單筆回傳大小。
 *   ③ 本視窗 ultrawork workflow : Workflow tool 多 subagent,回傳「聚合」進同一 orchestrator。
 *                            量 per-run 聚合回傳量(workflow 子代理目錄各 agent 最終輸出加總)。★ 真痛點指標。
 *
 * 回傳大小量法(v2 精度修正): 取 agent「最後一個 assistant turn」所有 content block 實際大小
 *   (text 長度 + tool_use.input JSON 長度;StructuredOutput 的結構化回傳走 tool_use.input),
 *   比 usage.output_tokens 準(後者對結構化輸出低估)。token = 字串長度 / 4。
 *
 * schema(2026-06-05 實測): type:'user'→message.content[].tool_result.content(string);
 *   type:'assistant'→message.content[](text / tool_use.input)+ message.usage.output_tokens。
 *
 * 唯讀。Usage: node scripts/context-mode-analysis.cjs [--sessions N] [--json] [--dir <d>]
 *   --sessions N : 掃最近 N 個 main session(預設 0 = 全掃)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = '${USER_HOME}/.claude/projects/${PROJECT_SLUG}';
const argv = process.argv.slice(2);
const argVal = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const PROJECTS_DIR = argVal('--dir', DEFAULT_DIR);
const SESSIONS = parseInt(argVal('--sessions', '0'), 10);
const JSON_OUT = argv.includes('--json');

const tokEst = (s) => Math.round((typeof s === 'string' ? s.length : JSON.stringify(s || '').length) / 4);
const readNorm = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const PIPELINE_MARKERS = ['/bmad:', 'dev-story', 'create-story', 'code-review', 'PIPELINE_PHASE', 'story-pipeline', 'tasks-backfill', 'depth-gate', 'upsert-story'];

function dist(arr) {
  if (!arr.length) return { n: 0, sum: 0, mean: 0, max: 0, p50: 0, p90: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, sum, mean: Math.round(sum / s.length), max: s[s.length - 1], p50: at(0.5), p90: at(0.9) };
}

// 一個 assistant message 實際「吐出」的 content 大小(text + tool_use.input)
function emittedTokOfAssistant(msg) {
  if (!msg || !Array.isArray(msg.content)) return 0;
  let t = 0;
  for (const b of msg.content) {
    if (!b) continue;
    if (b.type === 'text') t += tokEst(b.text || '');
    else if (b.type === 'tool_use') t += tokEst(b.input || {});
    // thinking 不計(不進 orchestrator 回傳)
  }
  return t;
}

// 掃 main session:tool 輸入 token、assistant 生成 token(billed output_tokens)、pipeline-like
function scanMainSession(p) {
  let raw = ''; try { raw = readNorm(p); } catch (_) { return null; }
  let toolInTok = 0, toolInCount = 0, genTok = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    const msg = o.message;
    if (o.type === 'assistant' && msg && msg.usage && typeof msg.usage.output_tokens === 'number') genTok += msg.usage.output_tokens;
    else if (o.type === 'user' && msg && Array.isArray(msg.content)) for (const b of msg.content) if (b && b.type === 'tool_result') { toolInTok += tokEst(b.content); toolInCount++; }
  }
  const hits = PIPELINE_MARKERS.filter((m) => raw.includes(m)).length;
  return { toolInTok, toolInCount, genTok, isPipelineLike: hits >= 2 };
}

// 掃單一子代理 transcript:回傳大小(最後 assistant turn 的 emitted content)+ 內部 tool 輸入
function scanAgent(p) {
  let raw = ''; try { raw = readNorm(p); } catch (_) { return null; }
  let lastEmitted = 0, internalToolTok = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    const msg = o.message;
    if (o.type === 'assistant' && msg) { const e = emittedTokOfAssistant(msg); if (e > 0) lastEmitted = e; }
    else if (o.type === 'user' && msg && Array.isArray(msg.content)) for (const b of msg.content) if (b && b.type === 'tool_result') internalToolTok += tokEst(b.content);
  }
  return { returnTok: lastEmitted, internalToolTok };
}

function main() {
  let mains = [];
  try {
    mains = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.jsonl'))
      .map((f) => { const p = path.join(PROJECTS_DIR, f); return { p, sid: f.replace('.jsonl', ''), m: fs.statSync(p).mtimeMs }; })
      .sort((a, b) => b.m - a.m);
  } catch (_) { process.stdout.write('找不到 transcript dir\n'); return; }
  const picked = SESSIONS > 0 ? mains.slice(0, SESSIONS) : mains;

  // ① per-window：tool 輸入 vs 生成 分開
  const winToolIn = [], winGen = [];
  let pipelineCount = 0;
  for (const s of picked) {
    const r = scanMainSession(s.p); if (!r) continue;
    winToolIn.push(r.toolInTok); winGen.push(r.genTok);
    if (r.isPipelineLike) pipelineCount++;
  }

  // ② / ③
  const taskReturns = [], wfRuns = [];
  for (const s of picked) {
    const subDir = path.join(PROJECTS_DIR, s.sid, 'subagents');
    try {
      for (const f of fs.readdirSync(subDir)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) {
        const a = scanAgent(path.join(subDir, f)); if (a) taskReturns.push(a.returnTok);
      }
    } catch (_) { /* none */ }
    const wfDir = path.join(subDir, 'workflows');
    let wfNames = []; try { wfNames = fs.readdirSync(wfDir).filter((d) => d.startsWith('wf_')); } catch (_) { wfNames = []; }
    for (const wf of wfNames) {
      const runDir = path.join(wfDir, wf); const rets = [];
      try { for (const f of fs.readdirSync(runDir)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) { const a = scanAgent(path.join(runDir, f)); if (a) rets.push(a.returnTok); } } catch (_) { continue; }
      if (rets.length) wfRuns.push({ wf, agents: rets.length, aggregateTok: rets.reduce((x, y) => x + y, 0), maxAgentTok: Math.max(...rets) });
    }
  }

  const m1tool = dist(winToolIn), m1gen = dist(winGen), m2 = dist(taskReturns);
  const m3 = dist(wfRuns.map((r) => r.aggregateTok)), m3a = dist(wfRuns.map((r) => r.agents));
  const topWf = wfRuns.slice().sort((a, b) => b.aggregateTok - a.aggregateTok).slice(0, 6);

  if (JSON_OUT) { process.stdout.write(JSON.stringify({ scanned: { sessions: picked.length, pipelineLike: pipelineCount, taskSubagents: taskReturns.length, workflowRuns: wfRuns.length }, mode1_toolInput: m1tool, mode1_generation: m1gen, mode2_taskReturn: m2, mode3_aggregate: m3, mode3_agentsPerRun: m3a, topWorkflowRuns: topWf }, null, 2) + '\n'); return; }

  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n)));
  const L = [];
  L.push('═══════════════════════════════════════════════════════════════');
  L.push(' 三執行模式 context 成本量測 v2 — Tianji 證據工具 (唯讀)');
  L.push(` 掃描: ${picked.length} main session(${pipelineCount} pipeline-like)· ${taskReturns.length} Task 子代理 · ${wfRuns.length} workflow run`);
  L.push('═══════════════════════════════════════════════════════════════');
  L.push('');
  L.push('① party-to-pipeline(新視窗 BMAD)— per-window,tool 輸入 vs 生成 分開');
  L.push(`   tool 輸入(CCR 可壓): 中位 ${k(m1tool.p50)} · p90 ${k(m1tool.p90)} · 最大 ${k(m1tool.max)} /視窗`);
  L.push(`   assistant 生成(CCR 不可壓): 中位 ${k(m1gen.p50)} · p90 ${k(m1gen.p90)} · 最大 ${k(m1gen.max)} /視窗`);
  L.push(`   ※ 拓撲: 各視窗獨立 context 不聚合;此為整個 session 生命週期累積量(非峰值,有 autocompact)`);
  L.push(`   ※ 累積量大但 93-96% 走 cache read(便宜);CCR 非主槓桿(冷啟動歸 A~K / Read 不可控 / search 已 preview)`);
  L.push('');
  L.push('② 本視窗 Task subagent — 單筆回傳(進本 orchestrator)');
  L.push(`   ${m2.n} 筆: 中位 ${k(m2.p50)} · p90 ${k(m2.p90)} · 最大 ${k(m2.max)} · 總和 ${k(m2.sum)}`);
  L.push(`   ※ 單筆回傳進活躍 context → CCR 低-中(單筆中等,除非連續累積)`);
  L.push('');
  L.push('③ 本視窗 ultrawork workflow — per-run 聚合回傳(★ 真 CCR fit)');
  L.push(`   ${m3.n} run: 聚合 中位 ${k(m3.p50)} · p90 ${k(m3.p90)} · 最大 ${k(m3.max)};每 run agent 中位 ${m3a.p50}/最大 ${m3a.max}`);
  for (const r of topWf) L.push(`     · ${r.wf.slice(0, 16)} ${r.agents} agents → 聚合 ${k(r.aggregateTok)} (單 agent max ${k(r.maxAgentTok)})`);
  L.push(`   ※ N 筆同時聚合進同一活躍 orchestrator → CCR 真正 fit;workflow 撰寫約定(digest+handle)可解,我直接可控、零基建`);
  L.push('');
  L.push('───────────────────────────────────────────────────────────────');
  L.push(' 唯讀 · 重跑: node scripts/context-mode-analysis.cjs [--sessions N] [--json]');
  L.push('───────────────────────────────────────────────────────────────');
  process.stdout.write(L.join('\n') + '\n');
}

try { main(); } catch (err) { process.stdout.write(`[context-mode-analysis] fail-safe: ${err && err.message}\n`); process.exit(0); }
