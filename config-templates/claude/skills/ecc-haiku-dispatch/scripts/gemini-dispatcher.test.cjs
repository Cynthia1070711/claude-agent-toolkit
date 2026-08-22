'use strict';
// ============================================================
// gemini-dispatcher.cjs 單元測試 (DI mock · 免真實 Gemini API)
// ============================================================
// 對齊 ADR-ECC-LEARNING-001 v1.8.0 §D2 amendment (Gemini-backed dispatch)。
// 範式: 對齊 ecc-consolidate-mvp.test.cjs (node:test runner · DI mock callGeminiChain)。
// 執行: node --test .claude/skills/ecc-haiku-dispatch/scripts/gemini-dispatcher.test.cjs
// ============================================================
const { test } = require('node:test');
const assert = require('node:assert');
const { dispatch, callGeminiChain, buildContractSpec, VALID_INSTINCTS, VALID_STATUSES } = require('./gemini-dispatcher.cjs');

// ── mock chain implementations (依賴注入 · 免真實 HTTPS) ──
function mockChainSuccess() {
  const out = { status: 'success', result: { action_taken: 'mock applied rule', side_effects: ['.context-db/ecc-state/x-state.json'] }, state_diff: { state_file: '.context-db/ecc-state/x-state.json', before: {}, after: { last_dispatch: '2026-05-26T00:00:00+08:00' } }, timestamp: '2026-05-26T00:00:00+08:00', evidence: { rule_applied: 'r', evidence_paths: ['ref'] } };
  return Promise.resolve({ resp: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }, model: 'gemini-3.1-flash-lite' });
}
function mockChainExhausted() { return Promise.resolve({ resp: null, exhausted: true }); }
function mockChainMissingFields() {
  // LLM 只回 status + result · 漏 state_diff/evidence/timestamp → dispatch 應補全契約欄位
  return Promise.resolve({ resp: { candidates: [{ content: { parts: [{ text: JSON.stringify({ status: 'success', result: { action_taken: 'x', side_effects: [] } }) }] } }] }, model: 'm' });
}
function mockChainMarkdownWrapped() {
  // Gemini 偶爾包 ```json ... ``` 即使 prompt 禁 → dispatch 應 strip
  return Promise.resolve({ resp: { candidates: [{ content: { parts: [{ text: '```json\n{"status":"partial","result":{"action_taken":"y","side_effects":[]}}\n```' }] } }] }, model: 'm' });
}

test('dispatch: valid instinct + success → 契約完整 (status/result/state_diff/evidence/timestamp)', async () => {
  const r = await dispatch('skill_invocation', { trigger_context: 'edit SKILL.md', rule_reference: 'skill-tool-invocation-mandatory v1.2.0' }, mockChainSuccess);
  assert.strictEqual(r.output.status, 'success');
  assert.ok(r.output.result && r.output.result.action_taken);
  assert.ok(r.output.state_diff && r.output.state_diff.state_file);
  assert.ok(r.output.evidence && r.output.evidence.rule_applied);
  assert.ok(r.output.timestamp);
  assert.ok(typeof r.latencyMs === 'number');
});

test('dispatch: invalid instinct → throw', async () => {
  await assert.rejects(() => dispatch('not_an_instinct', { trigger_context: 'x', rule_reference: 'r' }, mockChainSuccess), /invalid instinct/);
});

test('dispatch: 全 key×model 耗盡 → failure 契約 + exhausted evidence', async () => {
  const r = await dispatch('cross_ref', { trigger_context: 'x', rule_reference: 'cross-ref-discipline v1.0.0' }, mockChainExhausted);
  assert.strictEqual(r.output.status, 'failure');
  assert.ok(r.output.evidence.evidence_paths.some(p => /exhausted/.test(p)));
});

test('dispatch: LLM 漏欄 → 契約欄位自動補全', async () => {
  const r = await dispatch('depth_first', { trigger_context: 'x', rule_reference: 'constitutional-depth-first' }, mockChainMissingFields);
  assert.ok(r.output.state_diff && r.output.state_diff.state_file, 'state_diff 應補全');
  assert.strictEqual(r.output.evidence.rule_applied, 'constitutional-depth-first', 'evidence 應補 rule');
  assert.ok(r.output.timestamp, 'timestamp 應補全');
});

test('dispatch: markdown ```json wrapper 應 strip 後 parse', async () => {
  const r = await dispatch('mcp_payload', { trigger_context: 'x', rule_reference: 'mcp-payload-discipline v1.0.0' }, mockChainMarkdownWrapped);
  assert.strictEqual(r.output.status, 'partial');
});

test('buildContractSpec: state_file kebab-case + rule 注入', () => {
  const spec = buildContractSpec('.context-db/ecc-state/skill-invocation-state.json', 'skill-tool-invocation-mandatory v1.2.0');
  assert.ok(spec.includes('skill-invocation-state.json'));
  assert.ok(spec.includes('skill-tool-invocation-mandatory v1.2.0'));
  assert.ok(spec.includes('JSON only'));
});

test('callGeminiChain: no key → throw', async () => {
  await assert.rejects(() => callGeminiChain('s', 'p', null, []), /no GEMINI/);
});

test('callGeminiChain: key×model fallback (429 → 下一個成功)', async () => {
  let calls = 0;
  const once = () => { calls++; if (calls === 1) return Promise.resolve({ error: { code: 429 } }); return Promise.resolve({ candidates: [{ content: { parts: [{ text: '{"status":"success"}' }] } }] }); };
  const r = await callGeminiChain('s', 'p', once, ['k1']);
  assert.ok(calls >= 2, 'should fallback to next model after 429');
  assert.ok(r.resp && r.resp.candidates);
});

test('VALID_INSTINCTS = 10 · VALID_STATUSES = 3', () => {
  assert.strictEqual(VALID_INSTINCTS.length, 10);
  assert.deepStrictEqual(VALID_STATUSES, ['success', 'failure', 'partial']);
});
