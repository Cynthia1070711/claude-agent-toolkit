#!/usr/bin/env node
// ============================================================
// ECC L2 instinct consolidator — MVP prototype (Gemini API / Ollama dual-engine)
// ============================================================
// 目的: 驗證「動態湧現」可行性 — pattern_observations → LLM consolidate → instinct
// 借鑑: ECC-main skills/continuous-learning-v2/agents/observer.md(consolidator 範式)
// adapt: PhyCool 既有 observe-pattern.js 的 pattern_observations(真實資料 · 不重造輪子)
// 引擎決策歷程(2026-05-24 使用者裁決):
//   claude -p headless 配額問題 → 本地 Ollama(GT710 2GB 無法 offload · 100% CPU · R1/qwen34b 實測空輸出不可靠)
//   → Gemini REST API(免費額度 + 品質佳 + 繞 claude 配額 + responseMimeType 強制 JSON · observations 非業務敏感外送可接受)
// SECURITY: API key 一律讀 process.env.GEMINI_API_KEYS(逗號分隔多 key)/ GEMINI_API_KEY · 絕不寫入本檔/版控
// 用法: node .context-db/scripts/ecc-consolidate-mvp.cjs [--engine gemini|ollama] [--model <name>] [--verify] [--auto-write] [--dry-run]
//   預設 engine=gemini · model 鏈 = gemini-3.1-flash-lite → gemma-4-31b-it → gemma-4-26b-a4b-it
//   韌性: key×model 巢狀 fallback(key 外層 model 內層) → 全雲端耗盡轉 Ollama 保底 → 全失敗寫 ecc-alert.json 報警
// 註: ecc-09 consolidator 探索性 prototype · 正式化走 create-story depth-gate + hooks-mechanization
// ============================================================
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'phycool.db');
const argv = process.argv;
const dryRun = argv.includes('--dry-run');
const engineArg = argv.indexOf('--engine');
const ENGINE = engineArg > -1 ? argv[engineArg + 1] : 'gemini';
const modelArg = argv.indexOf('--model');
// model fallback 鏈(2026-05-25 使用者裁決 · /v1beta/models 親驗 model id 全部存在):
//   每 key 內層依序試 MODEL_CHAIN 全 model(RPD per-project-per-model 獨立 · 換 model = 換獨立額度池):
//   gemini-3.1-flash-lite(500 RPD · JSON 極佳) → gemma-4-31b-it(1.5K RPD · TPM 無限) → gemma-4-26b-a4b-it(1.5K RPD)
const MODEL_CHAIN = modelArg > -1 ? [argv[modelArg + 1]]
  : (ENGINE === 'ollama' ? ['erwan2/DeepSeek-R1-Distill-Qwen-7B:latest']
    : ['gemini-3.1-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it']);
const MODEL = MODEL_CHAIN[0]; // 主 model(log / dry-run 顯示用)
const OLLAMA_FALLBACK_MODEL = 'erwan2/DeepSeek-R1-Distill-Qwen-7B:latest'; // 全雲端耗盡 → 本地保底

let Database;
try { Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3')); }
catch { console.error('better-sqlite3 not found'); process.exit(1); }

// ── 1. 讀真實 observations(adapt observe-pattern.js 的 pattern_observations)──────
const db = new Database(DB_PATH, { readonly: true });
const byDomainTool = db.prepare(`
  SELECT domain, tool_name, COUNT(*) AS file_count, SUM(occurrences) AS total_edits
  FROM pattern_observations WHERE occurrences >= 20
  GROUP BY domain, tool_name ORDER BY total_edits DESC LIMIT 12
`).all();
const skillHot = db.prepare(`
  SELECT file_path, occurrences FROM pattern_observations
  WHERE domain = 'skill' AND occurrences >= 50 ORDER BY occurrences DESC LIMIT 8
`).all().map(r => ({ file: r.file_path.replace(/.*PhyCool-PCPT-MVP\(Antigravity\)[\\/]/, ''), edits: r.occurrences }));
// ecc-09 capture 整合並行: 同時讀 observations_queue per-event raw(序列/因果 pattern · 隨開發累積生效)
let perEvent = [];
try {
  perEvent = db.prepare(
    "SELECT tool_name, file_path, pattern_type, context_jsonb, created_at FROM observations_queue WHERE processed = 0 ORDER BY id DESC LIMIT 40"
  ).all().map(r => {
    let result = 'unknown';
    try { result = (JSON.parse(r.context_jsonb || '{}').result_signal) || 'unknown'; } catch { /* ignore */ }
    return { tool: r.tool_name, domain: r.pattern_type, result, file: (r.file_path || '').replace(/.*PhyCool-PCPT-MVP\(Antigravity\)[\\/]/, ''), at: r.created_at };
  });
} catch { /* observations_queue 未 migrate — silent */ }
// F6 去重(2026-05-26): 查現有 approved instinct → prompt 指示 LLM 避免重複蒸餾(防 emergence-gate 自動運轉持續累加重複 · 根因 UNIQUE(trigger,scope) 措辭異沒擋)
let existingInstincts = [];
try {
  existingInstincts = db.prepare(
    // 含 decay 的(軟刪重複)— 去重指示應涵蓋所有曾蒸餾過的, 防 LLM 重蒸餾出已 decay 的相似 pattern
    // (不過濾 decay_at: 修正原 datetime('now') 空格格式 vs decay_at ISO 字串比較異常)
    "SELECT trigger, action FROM instincts WHERE verifier_status = 'approved' ORDER BY adoption_score DESC, confidence DESC LIMIT 40"
  ).all();
} catch { /* instincts 表未 migrate — silent */ }
db.close();

// ── 2. ECC observer.md 範式 prompt ──────────────────────────────────────────────
const systemPrompt = [
  'You are the ECC observer agent: a background analyzer that distills development observations into L2 "instincts"',
  '(atomic, trigger-based behavioral rules), per the everything-claude-code continuous-learning-v2 observer methodology.',
  'Pattern types: (1) repeated workflows, (2) tool preferences, (3) file-cluster conventions, (4) domain editing norms.',
  'Confidence calibration by frequency: 1-2->0.3, 3-5->0.5, 6-10->0.7, 11+->0.85.',
  'Be CONSERVATIVE (only clear patterns), SPECIFIC (narrow triggers). Default scope=project; global only for universal security/workflow/git.',
  'Output a JSON object: {"instincts":[{"trigger":"when ...","action":"...","confidence":0.x,"domain":"...","scope":"project|global","evidence":"observed N edits across M files"}]}. 1 to 3 instincts.'
].join('\n');
const userPrompt = [
  'PhyCool aggregated observations (source: observe-pattern.js, 4166 real edit records).',
  'PhyCool = zh-TW SaaS for batch label/card printing. SUPREME rules: editing .claude/skills/*/SKILL.md must go through saas-to-skill/skill-builder SOP; execution-tree docs follow <=100-line SOP; sprint-status.yaml updated after each dev-story/code-review.',
  '', 'By domain + tool:', JSON.stringify(byDomainTool, null, 1),
  '', 'Top skill-domain files (high edit frequency):', JSON.stringify(skillHot, null, 1),
  '', (perEvent.length >= 5
    ? 'Recent per-event sequence (detect correction / error-resolution / tool-sequence patterns):\n' + JSON.stringify(perEvent, null, 1)
    : '(per-event observations 累積中: 目前 ' + perEvent.length + ' 筆 · 達 5 筆閾值後啟用序列/因果 pattern 偵測)'),
  '', (existingInstincts.length > 0
    ? 'EXISTING approved instincts (F6 去重 · DO NOT re-distill these or near-duplicates — propose ONLY genuinely NEW patterns not covered below):\n' + JSON.stringify(existingInstincts, null, 1)
    : ''),
  '', 'Distill 1-3 high-value, non-obvious instincts that are NOT already covered by the existing list above (avoid near-duplicates). Return the JSON object only.'
].join('\n');

if (dryRun) { console.log('engine=' + ENGINE + ' model=' + MODEL + '\n\n=== SYSTEM ===\n' + systemPrompt + '\n\n=== USER ===\n' + userPrompt); process.exit(0); }

// ── 3a. Gemini REST API(預設 · HTTPS · responseMimeType 強制 JSON · key 讀 env)────
function getGeminiKeys() {
  const multi = process.env.GEMINI_API_KEYS; // 多 key 逗號分隔(輪替)優先
  if (multi) return multi.split(',').map(s => s.trim()).filter(Boolean);
  const single = process.env.GEMINI_API_KEY;
  return single ? [single] : [];
}
// 智能 429: 解析 RetryInfo.retryDelay(秒)— 短延遲=RPM 短期 / 長延遲(或 daily QuotaFailure)=RPD 長期
//   來源爬文: Google Cloud Blog "handle 429 resource exhaustion" + gemini-cli #9248 fallback 準則
function parseRetryInfo(errObj) {
  try {
    for (const d of (errObj && errObj.details) || []) {
      if (String(d['@type'] || '').includes('RetryInfo') && d.retryDelay) {
        return parseInt(String(d.retryDelay).replace(/[^0-9]/g, ''), 10) || 0;
      }
    }
  } catch { /* ignore */ }
  return 0;
}
// key×model 巢狀 fallback 鏈(key 外層 model 內層 · 2026-05-25 使用者裁決):
//   每 key 依序試 MODEL_CHAIN 全 model(換 model = 換獨立 RPD 池 · per-project 也有效)→ 該 key 全 model 耗盡 → 換 key
//   全 key×model 耗盡 → 回 {exhausted:true}(呼叫端轉 Ollama 保底 + 報警)· 非配額錯誤(400 等)直接回
async function callGeminiChain(system, prompt, _callOnce, _keys, _chain) {
  const keys = _keys || getGeminiKeys();
  if (keys.length === 0) throw new Error('no GEMINI_API_KEY(S) env set (security: 不寫檔案,須設環境變數)');
  const callOnce = _callOnce || callGeminiOnce; // 依賴注入(測試可 mock)· 預設真實 HTTPS call
  const chain = _chain || MODEL_CHAIN;
  let lastResp, lastErr, maxRetrySec = 0;
  for (let ki = 0; ki < keys.length; ki++) {
    for (let mi = 0; mi < chain.length; mi++) {
      const model = chain[mi];
      try {
        const resp = await callOnce(model, system, prompt, keys[ki]);
        if (resp.error) {
          lastResp = resp; const code = resp.error.code || 0;
          if ([429, 403, 500, 503].includes(code)) {
            const sec = parseRetryInfo(resp.error); if (sec > maxRetrySec) maxRetrySec = sec;
            console.error('[fallback] key#' + (ki + 1) + ' model=' + model + ' err=' + code + (sec ? ' retryDelay=' + sec + 's' : '') + ' → 下一個');
            continue; // 下一個 model(內層)· model 跑完換 key(外層)
          }
          return { resp, model, keyIdx: ki }; // 非配額錯誤直接回(不 fallback)
        }
        if (ki > 0 || mi > 0) console.error('[fallback] 成功 key#' + (ki + 1) + ' model=' + model);
        return { resp, model, keyIdx: ki };
      } catch (e) { lastErr = e; console.error('[fallback] key#' + (ki + 1) + ' model=' + model + ' 例外=' + e.message); continue; }
    }
  }
  return { resp: lastResp, error: lastErr, exhausted: true, maxRetrySec }; // 全 key×model 耗盡
}
function callGeminiOnce(model, system, prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/' + model + ':generateContent?key=' + apiKey,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Gemini resp parse: ' + data.slice(0, 300))); } });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('Gemini timeout 90s')));
    req.write(body); req.end();
  });
}

// ── 3b. Ollama 本地(fallback · GT710 CPU)────────────────────────────────────────
function callOllama(model, system, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, system, prompt, stream: false, format: 'json', options: { temperature: 0.3, num_ctx: 8192 } });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Ollama parse: ' + data.slice(0, 300))); } });
    });
    req.on('error', reject); req.setTimeout(180000, () => req.destroy(new Error('Ollama timeout')));
    req.write(body); req.end();
  });
}

// ── 3c. 報警狀態(全 key×model + Ollama 耗盡寫 · 任一成功清除 · SessionStart 報警 hook 讀此檔擴散)──
const ALERT_PATH = path.join(__dirname, '..', 'ecc-state', 'ecc-alert.json');
function nowTW() { return new Date(Date.now() + 288e5).toISOString().replace('Z', '+08:00'); } // UTC+8
function writeAlert(reason, detail, retrySec) {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(ALERT_PATH, 'utf8')); } catch { /* 首次 */ }
  const failCount = (prev.fail_count || 0) + 1;
  try {
    fs.mkdirSync(path.dirname(ALERT_PATH), { recursive: true });
    fs.writeFileSync(ALERT_PATH, JSON.stringify({
      reason, detail, fail_count: failCount,
      severity: failCount >= 3 ? 'high' : 'medium',
      models_tried: MODEL_CHAIN,
      retry_after_sec: retrySec || null,
      exhausted_at: nowTW(),
      reported: false   // SessionStart 報警 hook 擴散(stderr+注入+中控端+記憶庫)後標 true 去重
    }, null, 2), 'utf8');
  } catch (e) { console.error('[writeAlert] ' + e.message); }
}
function clearAlert() { try { fs.unlinkSync(ALERT_PATH); } catch { /* 無 alert = 正常 */ } }

// ── 運轉紀錄(observability · 2026-05-26 補「emergence-gate 產 N instinct 無痕」缺口)──
// emergence-gate spawn consolidator 為 detached fire-and-forget(stdio ignore + unref)→ gate 無法知產出數。
// consolidator 是唯一知 candidates/approved/written 的點 → append-only 記每次運轉,使自動湧現可稽核
// (與 ecc-state/emergence-gate-state.json last_run_at 時間戳對應, 即可回答「該次 gate 產幾個 instinct」)。
const RUNLOG_PATH = path.join(__dirname, '..', 'ecc-state', 'consolidate-runs.jsonl');
function writeRunLog(summary) {
  try {
    fs.mkdirSync(path.dirname(RUNLOG_PATH), { recursive: true });
    fs.appendFileSync(RUNLOG_PATH, JSON.stringify({ ts: nowTW(), ...summary }) + '\n', 'utf8');
  } catch (e) { console.error('[writeRunLog] ' + e.message); } // 不阻塞迴路
}

// ── ecc D5 採納分數軌道 helpers (ADR-ECC-LEARNING-001 v1.4.0) ──
// F2 mapping DRY (2026-05-26): 抽共用 ecc-domain-mapping.cjs (JS SSoT) — observe-pattern.js + 本檔 + migration CASE 三處對齊
const { domainToProjectType: eccProjectType, domainToBusiness: eccBusiness } = require('./ecc-domain-mapping.cjs');
// adoption_score: scope 預設底分(global5/project3/session1) + verifier 跨情境適用性微調 ±2 → clamp(0,5)
// 對齊 ADR-ECC-LEARNING-001 v1.4.0 §adoption_score 評分法(F1 full ±2 · 2026-05-26 升級取代舊 approved+1 簡化)
// universality: 'universal'(普世 timestamp/encoding/git +2) | 'domain-specific'(軌道無關 0) | 'context-specific'(高度情境專屬 -2)
function eccAdoptionScore(scope, universality) {
  const base = scope === 'global' ? 5 : scope === 'project' ? 3 : 1;
  const adj = universality === 'universal' ? 2 : universality === 'context-specific' ? -2 : 0;
  return Math.max(0, Math.min(5, base + adj));
}

if (require.main === module) (async () => {
  console.error('[ecc-consolidate-mvp] engine=' + ENGINE + ' model 鏈=' + MODEL_CHAIN.join(' → '));
  const t0 = Date.now();
  let rawText, usedModel = MODEL;
  try {
    if (ENGINE === 'gemini') {
      const r = await callGeminiChain(systemPrompt, userPrompt);
      if (r.exhausted) {
        // 全雲端 key×model 耗盡 → Ollama 本地保底(GT710 2GB CPU · 已知不可靠 · 仍嘗試)
        console.error('[fallback] 全雲端 key×model 耗盡 → 嘗試 Ollama 本地保底');
        try {
          const oResp = await callOllama(OLLAMA_FALLBACK_MODEL, systemPrompt, userPrompt);
          rawText = (oResp.response || '').replace(/<think>[\s\S]*?<\/think>/g, '');
          if (!rawText.trim()) throw new Error('Ollama 空輸出(GT710 2GB CPU 已知不可靠)');
          usedModel = 'ollama:' + OLLAMA_FALLBACK_MODEL;
        } catch (oe) {
          writeAlert('quota_exhausted', '全雲端 key×model(' + MODEL_CHAIN.join('/') + ')耗盡 + Ollama 保底失敗: ' + oe.message, r.maxRetrySec);
          console.error('[ALERT] 湧現迴路因配額耗盡停擺 → 已寫 ecc-alert.json(SessionStart 報警 hook 將擴散)'); process.exit(1);
        }
      } else if (r.resp && r.resp.error) {
        console.error('Gemini API error(非配額 · 不 fallback): ' + JSON.stringify(r.resp.error).slice(0, 400)); process.exit(1);
      } else {
        rawText = r.resp.candidates && r.resp.candidates[0] && r.resp.candidates[0].content && r.resp.candidates[0].content.parts[0].text || '';
        usedModel = r.model;
      }
    } else {
      const resp = await callOllama(MODEL, systemPrompt, userPrompt);
      rawText = (resp.response || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    }
  } catch (e) { console.error(ENGINE + ' call failed: ' + e.message); process.exit(1); }
  const latencyMs = Date.now() - t0;

  let out = rawText.replace(/```(?:json)?/g, '').trim();
  const m = out.match(/\{[\s\S]*\}/); if (m) out = m[0];
  let parsed;
  try { parsed = JSON.parse(out); }
  catch (e) { console.error('JSON parse failed: ' + e.message + '\n--- RAW (first 2000) ---\n' + rawText.slice(0, 2000)); process.exit(1); }
  const instincts = Array.isArray(parsed) ? parsed : (parsed.instincts || []);
  if (instincts.length === 0) console.error('[debug] 0 instincts. Raw:\n' + rawText.slice(0, 2000));
  clearAlert(); // consolidate 成功 = 湧現迴路恢復 → 清除既有報警(自癒 · self-healing)
  console.log('[ecc-consolidate-mvp] engine=' + ENGINE + ' model=' + usedModel + ' latency=' + latencyMs + 'ms · ' + instincts.length + ' instinct(s):');
  console.log(JSON.stringify(instincts, null, 2));

  // ── verify: 獨立 LLM verifier(ECC "The implementer is an LLM. Verify independently")──
  // 用獨立 call + verifier 角色 prompt 驗證 consolidate 產出,非作者自評(Homunculus 分離)
  let vApproved = 0, vRejected = 0, vWritten = 0; // observability counters(2026-05-26 · 補產出計數無痕缺口)
  if (argv.includes('--verify') && instincts.length > 0) {
    console.error('[ecc-consolidate-mvp] running INDEPENDENT verifier (' + ENGINE + ')...');
    // 範式校正(2026-05-24): verifier 判準改為「合理性/可操作/不矛盾」而非「對應既有 rule」—
    // 靜態合規判準(must match existing rules)會扼殺動態湧現的價值(新經驗本就不在既有 rule)
    const vSys = 'You are an INDEPENDENT instinct verifier (you did NOT author these candidates). An instinct is a LEARNED behavioral rule that may capture NEW experience not yet in any existing rule — that novelty is its value, not a defect. Judge each strictly on: (a) actionable, (b) specific (narrow trigger), (c) internally non-contradictory, (d) plausible per software-engineering best practices, (e) not contradicting known PhyCool facts, (f) NOT a baseline agent capability — REJECT if the action merely restates an Opus-4.8-class agent built-in tool behavior or error-recovery (e.g. "switch to Write when Edit fails" / "Read before Edit" / "retry on error" / "pause between edits") AND its evidence is only self-recovery ("error followed by success") rather than a user correction; such innate competence adds no learning value because the agent already does it natively. Do NOT reject merely because it is absent from existing rules — novel valid experience (a domain/business convention, or a user-corrected pattern) SHOULD be approved even if novel (confidence already reflects evidence strength). Criterion (f) is deliberately NARROWER than "must match existing rules": it rejects ONLY the agent-innate-competence class (built-in tool/error-recovery behaviour evidenced by self-recovery), never a genuine domain/business/user-corrected learning. ALSO judge each instinct cross-context "universality": "universal" = applies everywhere regardless of project/business (e.g. timestamp / encoding / git discipline); "context-specific" = highly tied to one business or a single file-pattern; "domain-specific" = everything in between. Output ONLY JSON {"verdicts":[{"index":0,"status":"approved","universality":"universal","reason":"..."}]} (status: approved | rejected; universality: universal | domain-specific | context-specific).';
    const vUser = 'Known PhyCool facts (for contradiction-check ONLY, NOT a whitelist to match against): zh-TW SaaS for batch label/card printing; SKILL.md edits go through saas-to-skill/skill-builder SOP; execution-tree docs <=100 lines; sprint-status.yaml updated after dev-story/code-review; .NET backend + React frontend.\n\nCandidate instincts:\n' + JSON.stringify(instincts.map((x, i) => ({ index: i, trigger: x.trigger, action: x.action, confidence: x.confidence })), null, 1) + '\n\nReturn the verdicts JSON object only.';
    try {
      let vResp;
      if (ENGINE === 'gemini') { const vr = await callGeminiChain(vSys, vUser); vResp = (vr.exhausted ? (vr.resp || {}) : vr.resp) || {}; }
      else { vResp = await callOllama(MODEL, vSys, vUser); }
      let vText = ENGINE === 'gemini'
        ? (vResp.candidates && vResp.candidates[0] && vResp.candidates[0].content.parts[0].text || '')
        : (vResp.response || '').replace(/<think>[\s\S]*?<\/think>/g, '');
      vText = vText.replace(/```(?:json)?/g, '').trim(); const vm = vText.match(/\{[\s\S]*\}/); if (vm) vText = vm[0];
      const verdicts = (JSON.parse(vText).verdicts) || [];
      vApproved = verdicts.filter(v => v.status === 'approved').length;
      vRejected = verdicts.filter(v => v.status === 'rejected').length;
      console.log('\n[verifier · INDEPENDENT ' + ENGINE + '] verdicts:');
      console.log(JSON.stringify(verdicts, null, 2));

      // ── auto-write(ecc-09 自動化迴路): verify approved → 寫 instincts(via upsert-instinct.js · 對齊 mcp-payload dual-write 不繞 MCP)+ mark observations processed ──
      if (argv.includes('--auto-write')) {
        const { spawnSync } = require('child_process');
        let written = 0;
        instincts.forEach((inst, i) => {
          const v = verdicts.find(x => x.index === i);
          if (v && v.status === 'approved') {
            const scopeVal = inst.scope || 'project';
            const domainVal = inst.domain || '';
            const payload = JSON.stringify({ cmd: 'add', trigger: inst.trigger, action: inst.action, confidence: inst.confidence, scope: scopeVal, domain: domainVal, source: 'ecc-consolidate-mvp auto-write', verifier_status: 'approved', verifier_reason: (v.reason || '').slice(0, 200), evidence_jsonb: JSON.stringify([inst.evidence || '']), project_type: eccProjectType(domainVal), business: eccBusiness(domainVal), adoption_score: eccAdoptionScore(scopeVal, v.universality || 'domain-specific') });
            const r = spawnSync(process.execPath, [path.join(__dirname, 'upsert-instinct.js'), '--inline', payload], { encoding: 'utf8' });
            if (r.status === 0) written++; else console.error('[auto-write] upsert fail: ' + ((r.stderr || '') + (r.stdout || '')).slice(0, 200));
          }
        });
        try { const wdb = new Database(DB_PATH); wdb.prepare('UPDATE observations_queue SET processed = 1 WHERE processed = 0').run(); wdb.close(); } catch { /* silent */ }
        vWritten = written;
        console.log('\n[auto-write] 寫入 ' + written + ' approved instincts(upsert-instinct.js dual-write)+ observations marked processed');
      }
    } catch (e) { console.error('verifier failed: ' + e.message); }
  }
  // observability: 記本次運轉(候選/核可/駁回/寫入)→ consolidate-runs.jsonl(自動湧現可稽核 · 補§8.6「產 N 無痕」)
  writeRunLog({ mode: argv.includes('--auto-write') ? 'auto-write' : (argv.includes('--verify') ? 'verify-only' : 'consolidate-only'),
    engine: ENGINE, model: usedModel, latency_ms: latencyMs, candidates: instincts.length, approved: vApproved, rejected: vRejected, written: vWritten });
})();

// ── testability export(上方 IIFE 僅 require.main 時跑 · require 時只取函式供測試 mock)──
module.exports = { callGeminiChain, parseRetryInfo, eccProjectType, eccBusiness, eccAdoptionScore };
