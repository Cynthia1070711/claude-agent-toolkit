#!/usr/bin/env node
'use strict';
// ============================================================
// gemini-dispatcher.cjs — ECC L2 atomic instinct dispatch (Gemini-backed)
// ============================================================
// 對齊 ADR-ECC-LEARNING-001 v1.8.0 §D2 amendment:獨立 Haiku Agent → 獨立便宜模型
//   dispatch(Gemini-backed)。保留 D2 intent(獨立 agent + 便宜模型 + off-Opus 不污染
//   主視窗 token),僅換底層引擎 Haiku→Gemini。
// 觸發背景:claude -p headless 新政策另計配額(2026-05-24 對話 turn 31779 + party-to-pipeline
//   02-principles.md:149「no -p」)+ GT710 本地 LLM 不可靠 → dispatch 改用軌道 α 湧現迴路
//   已實證的 Gemini REST 範式(responseMimeType JSON)。
// 配額隔離:讀 GEMINI_DISPATCH_API_KEYS(獨立 env · 與湧現 GEMINI_API_KEYS 分開;最好獨立
//   Google project → 獨立 RPD 池不競爭)。fallback 至 GEMINI_API_KEYS。
// SECURITY:key 一律讀 process.env,絕不寫檔/版控。
// 契約:輸出對齊 IInstinctDispatcher InstinctDispatchOutput(status/result/state_diff/
//   timestamp/evidence)— 與 haiku-dispatcher.ps1 output 同格式(psm1 Invoke-GeminiDispatch 共用讀取)。
// 用法:node gemini-dispatcher.cjs --instinct <name> --payload-file <p> [--output-file <p>]
// 測試:dispatch() / callGeminiChain() 皆支援依賴注入(_chainImpl / _once / _keys)免真實 API
// ============================================================
const fs = require('fs');
const https = require('https');
const path = require('path');

// model fallback 鏈(對齊 ecc-consolidate-mvp.cjs · 換 model = 換獨立 RPD 池)
const MODEL_CHAIN = ['gemini-3.1-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it'];
const VALID_INSTINCTS = ['skill_invocation', 'hook_dispatch', 'cross_ref', 'depth_first', 'governance', 'parallel_isolation', 'capability_integration', 'pipeline_handshake', 'mcp_payload', 'encoding_discipline'];
const VALID_STATUSES = ['success', 'failure', 'partial'];

function nowTW() { return new Date(Date.now() + 288e5).toISOString().replace('Z', '+08:00'); } // UTC+8
function getKeys() {
  // dispatch 專用 key 優先(隔離湧現配額)· fallback 湧現 key(同 project 仍可跑,僅共用池)
  const multi = process.env.GEMINI_DISPATCH_API_KEYS || process.env.GEMINI_API_KEYS;
  return multi ? multi.split(',').map(s => s.trim()).filter(Boolean) : [];
}
function argOf(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }

function buildContractSpec(stateFile, rule) {
  return [
    'You are ECC L2 atomic instinct dispatcher (independent cheap-model agent · Gemini-backed).',
    'Return ONLY valid JSON matching InstinctDispatchOutput schema:',
    '{"status":"success|failure|partial",',
    ' "result":{"action_taken":"<short description>","side_effects":["' + stateFile + '"]},',
    ' "state_diff":{"state_file":"' + stateFile + '","before":{},"after":{"last_dispatch":"<ISO8601 UTC+8>"}},',
    ' "timestamp":"<ISO8601 UTC+8>",',
    ' "evidence":{"rule_applied":"' + rule + '","evidence_paths":["<refs>"]}}',
    'NO markdown wrapper. NO commentary. JSON only.'
  ].join('\n');
}

function callGeminiOnce(model, system, prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/' + model + ':generateContent?key=' + apiKey,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Gemini resp parse: ' + d.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('Gemini timeout 90s')));
    req.write(body); req.end();
  });
}

// key×model 巢狀 fallback(key 外層 model 內層 · 對齊 ecc-consolidate-mvp callGeminiChain)
// 依賴注入:_once(測試 mock callGeminiOnce)· _keys(測試指定 key)
async function callGeminiChain(system, prompt, _once, _keys) {
  const keys = _keys || getKeys();
  if (keys.length === 0) throw new Error('no GEMINI_DISPATCH_API_KEYS / GEMINI_API_KEYS env set (security: 不寫檔,須設環境變數)');
  const once = _once || callGeminiOnce;
  let lastResp;
  for (const key of keys) {
    for (const model of MODEL_CHAIN) {
      try {
        const resp = await once(model, system, prompt, key);
        if (resp && resp.error) {
          lastResp = resp; const code = resp.error.code || 0;
          if ([429, 403, 500, 503].includes(code)) continue; // 配額/暫時錯誤 → 下一 model/key
          return { resp, model };                            // 非配額錯誤直接回
        }
        return { resp, model };
      } catch (e) { lastResp = { error: { message: e.message } }; continue; }
    }
  }
  return { resp: lastResp, exhausted: true }; // 全 key×model 耗盡
}

function failureOutput(stateFile, rule, reason) {
  return {
    status: 'failure',
    result: { action_taken: 'gemini dispatch failure: ' + reason, side_effects: [stateFile] },
    state_diff: { state_file: stateFile, before: {}, after: { last_failure: nowTW() } },
    timestamp: nowTW(),
    evidence: { rule_applied: rule, evidence_paths: ['mode:gemini-failure', String(reason).slice(0, 160)] }
  };
}

// 核心 dispatch · _chainImpl 依賴注入(測試免真實 API)
async function dispatch(instinct, payload, _chainImpl) {
  if (!VALID_INSTINCTS.includes(instinct)) throw new Error('invalid instinct: ' + instinct + ' (valid: ' + VALID_INSTINCTS.join(',') + ')');
  const stateFile = '.context-db/ecc-state/' + instinct.replace(/_/g, '-') + '-state.json';
  const rule = (payload && payload.rule_reference) || 'unknown-rule';
  const system = buildContractSpec(stateFile, rule);
  const user = [
    'Dispatch L2 atomic instinct: ' + instinct,
    'Trigger context: ' + ((payload && payload.trigger_context) || ''),
    'Rule reference: ' + rule,
    'File path: ' + ((payload && payload.file_path) || 'n/a'),
    'Apply dispatch logic per the rule_reference (see SUPREME rule docs). Return InstinctDispatchOutput JSON.'
  ].join('\n');
  const chain = _chainImpl || callGeminiChain;
  const t0 = Date.now();
  const r = await chain(system, user);
  const latencyMs = Date.now() - t0;
  // token_cost instrument: 從 usageMetadata.totalTokenCount 擷取 (ADR-ECC-LEARNING-001 v1.8.0 §D4 amendment)
  const tokenCount = (r && r.resp && r.resp.usageMetadata && r.resp.usageMetadata.totalTokenCount) || null;

  if (!r || r.exhausted || !r.resp || r.resp.error) {
    const reason = (r && r.exhausted) ? 'all keys/models exhausted' : 'gemini error: ' + JSON.stringify((r && r.resp && r.resp.error) || {}).slice(0, 160);
    return { output: failureOutput(stateFile, rule, reason), latencyMs, model: (r && r.model) || null, tokenCount: null };
  }
  let text = (r.resp.candidates && r.resp.candidates[0] && r.resp.candidates[0].content && r.resp.candidates[0].content.parts[0].text) || '';
  text = text.replace(/```(?:json)?/g, '').trim();
  const m = text.match(/\{[\s\S]*\}/); if (m) text = m[0];
  let out;
  try { out = JSON.parse(text); } catch (e) { return { output: failureOutput(stateFile, rule, 'JSON parse: ' + e.message), latencyMs, model: r.model, tokenCount: null }; }
  // 契約欄位補全(LLM 可能漏欄 · 確保 InstinctDispatchOutput 完整)
  out.status = VALID_STATUSES.includes(out.status) ? out.status : 'partial';
  out.timestamp = out.timestamp || nowTW();
  if (!out.result) out.result = { action_taken: '(no action_taken)', side_effects: [stateFile] };
  if (!out.state_diff) out.state_diff = { state_file: stateFile, before: {}, after: { last_dispatch: out.timestamp } };
  if (!out.evidence) out.evidence = { rule_applied: rule, evidence_paths: [] };
  return { output: out, latencyMs, model: r.model, tokenCount };
}

// ── CLI(require.main 才執行 · require 時只取函式供測試)──
if (require.main === module) (async () => {
  const instinct = argOf('--instinct');
  const payloadFile = argOf('--payload-file');
  const outputFile = argOf('--output-file') || '.context-db/ecc-state/dispatch-output.json';
  if (!instinct || !payloadFile) { console.error('usage: node gemini-dispatcher.cjs --instinct <name> --payload-file <p> [--output-file <p>]'); process.exit(3); }
  let payload = {};
  try { const raw = fs.readFileSync(payloadFile, 'utf8').replace(/^﻿/, ''); const obj = JSON.parse(raw); payload = obj.payload || obj; }
  catch (e) { console.error('payload read: ' + e.message); process.exit(3); }
  let res;
  try { res = await dispatch(instinct, payload); } catch (e) { console.error('dispatch: ' + e.message); process.exit(3); }
  const dir = path.dirname(outputFile);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify({ ...res.output, _token_count: (res.tokenCount ?? null) }, null, 2), 'utf8');
  console.log('[gemini-dispatcher] instinct=' + instinct + ' status=' + res.output.status + ' model=' + (res.model || 'n/a') + ' latency=' + res.latencyMs + 'ms tokens=' + (res.tokenCount ?? 'n/a') + ' → ' + outputFile);
  process.exit(res.output.status === 'success' ? 0 : res.output.status === 'partial' ? 1 : 2);
})();

module.exports = { dispatch, callGeminiChain, callGeminiOnce, buildContractSpec, getKeys, failureOutput, VALID_INSTINCTS, VALID_STATUSES, MODEL_CHAIN };
