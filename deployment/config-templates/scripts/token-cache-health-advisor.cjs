#!/usr/bin/env node
/**
 * token-cache-health-advisor.cjs — Tianji-Pavilion PILOT MVE (read-only advisory)
 *
 * 「Token 快取健康小工具」: 衡量送給 AI 的 *prompt token 快取*(Anthropic prompt caching,
 *  即 cache_read_input_tokens / cache_creation_input_tokens),**不是記憶體 / RAM 快取**。
 *
 * 來源蒸餾(idea-level, 非 code 移植):
 *   - DeepSeek-Reasonix internal/agent/cache_shape.go (PrefixShape + CompareShape 分段 hash 歸因)
 *   - headroom PrefixCacheTracker (讀 cache_read/creation tokens 算 cache 效率)
 *   對齊 ECC / claw-code「取神捨形、走 PhyCool 自有 Node pipeline」前例。
 *
 * 用途(診斷半邊 — Tianji P0 GO-feasible):
 *   把 PhyCool「已被動採集但只做 cost 帳」的 OTel cache token,升級為「token 快取健康診斷」,
 *   並用 PrefixShape-lite 偵測 always-on 可控內容(CLAUDE.md / 核心 rule / MEMORY.md)的跨次漂移,
 *   歸因「哪段穩定前綴 churn 了 → 可能毀 prompt cache」。
 *
 * 證據基礎(2026-06-04 實測):
 *   logs/main-otel-{day}.jsonl 的 api_request 事件含真值 cache_read_tokens / cache_creation_tokens
 *   (本 session Opus 4.8 實測 cache_read_tokens=242521)。可靠來源是 api_request 事件,
 *   *非* token_metric 事件(後者實測 cacheRead value=0)。
 *
 * 唯讀紀律: 只讀 OTel JSONL + always-on 檔案;只寫自己的狀態檔 logs/token-cache-health-state.json。
 *   不改 pre-prompt-rag.js、不註冊 hook、不接入任何 pipeline。blast radius = 0。
 *   Kill switch: 刪除本檔 + logs/token-cache-health-state.json 即完全還原。
 *
 * 誠實天花板(Anti-Speculation): 本工具診斷「PhyCool 自己可控的注入/always-on 部分」,
 *   *不* 控制 Claude Code CLI 內部 prompt cache breakpoint。prefix 穩定 ≠ 保證 provider cache 命中。
 *   禁用「應提升 ~X% 命中率」式表述;成功標準 = 可量測的 cache_read 比率觀察。
 *
 * Usage:
 *   node scripts/token-cache-health-advisor.cjs [--window N] [--json] [--add-file <path>]
 *     --window N    : 最近 N 筆 api_request 作滑動窗(預設 50)
 *     --json        : 機器可讀輸出
 *     --add-file P  : 額外納入 PrefixShape-lite 的檔案(可重複),例如 global MEMORY.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const logDir = path.join(projectRoot, 'logs');
const infoJsonPath = path.join(logDir, 'main-otel-info.json');
const configPath = path.join(projectRoot, 'scripts', 'pipeline-config.json');
const statePath = path.join(logDir, 'token-cache-health-state.json');

// ── CLI args ──
const argv = process.argv.slice(2);
const WINDOW = (() => {
  const i = argv.indexOf('--window');
  return i !== -1 && argv[i + 1] ? Math.max(1, parseInt(argv[i + 1], 10) || 50) : 50;
})();
const JSON_OUT = argv.includes('--json');
const EXTRA_FILES = argv.reduce((acc, a, i) => {
  if (a === '--add-file' && argv[i + 1]) acc.push(argv[i + 1]);
  return acc;
}, []);

// ── 台灣牆鐘時間戳(對齊 .context-db/scripts/timezone.js / otel-session-aggregate 範式)──
function taiwanNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

// ── CRLF + BOM normalize(對齊 crlf-normalize-discipline.md)──
function readNorm(p) {
  return fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function shortHash(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

// ── 解析 OTel JSONL 的 active 檔(複用 otel-session-aggregate.js PoT + glob fallback pattern)──
function resolveActiveJsonl() {
  // Priority 1: info.json 的 active jsonl (collector SSoT)
  if (fs.existsSync(infoJsonPath)) {
    try {
      const info = JSON.parse(readNorm(infoJsonPath));
      if (info.jsonl && fs.existsSync(info.jsonl)) {
        return { jsonl: path.resolve(info.jsonl), source: 'main-otel-info.json (PoT)', info };
      }
    } catch (_) { /* corrupt → glob fallback */ }
  }
  // Priority 2: glob 取最新 main-otel-YYYY-MM-DD.jsonl
  try {
    const files = fs.readdirSync(logDir)
      .filter((f) => /^main-otel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort();
    if (files.length) {
      return { jsonl: path.join(logDir, files[files.length - 1]), source: 'glob newest', info: null };
    }
  } catch (_) { /* logDir unreadable */ }
  return { jsonl: null, source: 'none', info: null };
}

// ── 讀 api_request 事件(只取 api_request,非 token_metric — 後者 cache 值不可靠)──
function readApiRequests(jsonlPath) {
  if (!jsonlPath || !fs.existsSync(jsonlPath)) return [];
  const out = [];
  let raw = '';
  try { raw = fs.readFileSync(jsonlPath, 'utf8'); } catch (_) { return []; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r.type === 'api_request') out.push(r);
    } catch (_) { /* skip malformed */ }
  }
  return out;
}

function modelKey(raw) {
  if (!raw) return null;
  const m = String(raw).toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('fable')) return 'fable';
  return null;
}

function loadPricing() {
  try { return JSON.parse(readNorm(configPath)).modelPricing || null; }
  catch (_) { return null; }
}

// ── token 快取效率聚合 ──
function analyzeCache(entries, pricing) {
  const sum = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0 };
  const perModel = {};
  let savedUsd = 0;   // cache_read 相對未快取省下的 input 成本
  let premiumUsd = 0; // cache_creation 相對未快取多繳的寫入成本

  for (const e of entries) {
    const input = e.input_tokens || 0;
    const output = e.output_tokens || 0;
    const cr = e.cache_read_tokens || 0;
    const cc = e.cache_creation_tokens || 0;
    sum.input += input; sum.output += output; sum.cacheRead += cr; sum.cacheCreate += cc;
    sum.cost += e.cost_usd || 0;

    const k = modelKey(e.model) || 'other';
    if (!perModel[k]) perModel[k] = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, n: 0 };
    perModel[k].input += input; perModel[k].output += output;
    perModel[k].cacheRead += cr; perModel[k].cacheCreate += cc; perModel[k].n += 1;

    if (pricing && k !== 'other' && pricing[k]) {
      const p = pricing[k];
      // 省下 = cache_read 以 (input - cache_read) 單價差計;多繳 = cache_creation 以 (cache_create - input) 差計
      if (typeof p.input === 'number' && typeof p.cache_read === 'number') {
        savedUsd += cr / 1e6 * (p.input - p.cache_read);
      }
      if (typeof p.input === 'number' && typeof p.cache_create === 'number') {
        premiumUsd += cc / 1e6 * (p.cache_create - p.input);
      }
    }
  }

  const promptTotal = sum.input + sum.cacheRead + sum.cacheCreate; // prompt 側(不含 output)
  const cacheReadRatio = promptTotal > 0 ? sum.cacheRead / promptTotal : 0;
  const cacheCreateRatio = promptTotal > 0 ? sum.cacheCreate / promptTotal : 0;
  const uncachedRatio = promptTotal > 0 ? sum.input / promptTotal : 0;

  return {
    sum, perModel, promptTotal, cacheReadRatio, cacheCreateRatio, uncachedRatio,
    savedUsd: Math.round(savedUsd * 1e4) / 1e4,
    premiumUsd: Math.round(premiumUsd * 1e4) / 1e4,
    netSavedUsd: Math.round((savedUsd - premiumUsd) * 1e4) / 1e4,
  };
}

// 啟發式健康標籤(明示為啟發式,非精確 SLA)
function healthLabel(ratio) {
  if (ratio >= 0.7) return '🟢 良好';
  if (ratio >= 0.4) return '🟡 中等';
  return '🔴 偏低(prefix 可能頻繁失效)';
}

// ── PrefixShape-lite: hash always-on 可控檔案,跨次比對歸因漂移 ──
function defaultPrefixFiles() {
  return [
    'CLAUDE.md',
    'CLAUDE.local.md',
    path.join('.claude', 'rules', 'constitutional-standard.md'),
  ];
}

function computePrefixShape() {
  const rels = defaultPrefixFiles();
  const files = {};
  for (const rel of rels) {
    const abs = path.join(projectRoot, rel);
    try {
      files[rel] = fs.existsSync(abs) ? shortHash(readNorm(abs)) : null;
    } catch (_) { files[rel] = null; }
  }
  for (const extra of EXTRA_FILES) {
    try {
      files[extra] = fs.existsSync(extra) ? shortHash(readNorm(extra)) : null;
    } catch (_) { files[extra] = null; }
  }
  const combined = shortHash(Object.entries(files).map(([k, v]) => `${k}:${v}`).join('|'));
  return { files, combined };
}

function loadPrevState() {
  try { return JSON.parse(readNorm(statePath)); } catch (_) { return null; }
}

function diffPrefix(prev, cur) {
  if (!prev || !prev.prefixShape) return { firstRun: true, changed: [] };
  const changed = [];
  const prevF = prev.prefixShape.files || {};
  for (const [k, v] of Object.entries(cur.files)) {
    if (k in prevF && prevF[k] !== v) changed.push({ file: k, from: prevF[k], to: v });
  }
  return { firstRun: false, changed, combinedChanged: prev.prefixShape.combined !== cur.combined };
}

// ── main(全程 fail-safe,任何錯誤皆友善退出,絕不 throw)──
function main() {
  const pricing = loadPricing();
  const active = resolveActiveJsonl();
  const all = readApiRequests(active.jsonl);
  const windowed = all.slice(-WINDOW);
  const cacheAll = analyzeCache(all, pricing);
  const cacheWin = analyzeCache(windowed, pricing);

  const curShape = computePrefixShape();
  const prevState = loadPrevState();
  const drift = diffPrefix(prevState, curShape);

  // 寫自己的狀態檔(唯一的寫入,UTF-8 No-BOM)
  try {
    fs.writeFileSync(statePath, JSON.stringify({
      generatedAt: taiwanNow(), window: WINDOW, prefixShape: curShape,
      lastCacheReadRatioWindow: Math.round(cacheWin.cacheReadRatio * 1e4) / 1e4,
    }, null, 2), 'utf8');
  } catch (_) { /* 狀態檔寫失敗不影響報告 */ }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      generatedAt: taiwanNow(), source: active.source, jsonl: active.jsonl,
      apiRequestCount: all.length, window: WINDOW,
      cacheWindow: cacheWin, cacheToday: cacheAll, prefixShape: curShape, drift,
    }, null, 2) + '\n');
    return;
  }

  const L = [];
  L.push('═══════════════════════════════════════════════════════════════');
  L.push(' Token 快取健康診斷 — Tianji PILOT MVE (唯讀)');
  L.push(' (衡量送給 AI 的 prompt token 快取 cache_read/creation,非記憶體快取)');
  L.push(` 產生時間: ${taiwanNow()}`);
  L.push('═══════════════════════════════════════════════════════════════');

  if (!active.jsonl || all.length === 0) {
    L.push('');
    L.push(' ⚠ 找不到 OTel api_request 資料。');
    L.push(`   來源探查: ${active.source}${active.jsonl ? ' → ' + active.jsonl : ''}`);
    L.push('   確認 main-window OTel collector 是否運行(scripts/start-main-otel.ps1)。');
    process.stdout.write(L.join('\n') + '\n');
    return;
  }

  const fmtPct = (r) => (r * 100).toFixed(1) + '%';
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));

  L.push('');
  L.push(`§1. Token 快取效率診斷  (來源: ${active.source})`);
  L.push(`    JSONL: ${path.basename(active.jsonl)}  ·  總 api_request: ${all.length}  ·  滑動窗: 最近 ${WINDOW} 筆`);
  L.push('');
  L.push(`    ── 最近 ${WINDOW} 筆窗 ──`);
  L.push(`    cache_read 比率 : ${fmtPct(cacheWin.cacheReadRatio)}   ${healthLabel(cacheWin.cacheReadRatio)}`);
  L.push(`    cache_write 比率: ${fmtPct(cacheWin.cacheCreateRatio)}   (1.25x 寫入)`);
  L.push(`    未快取 input    : ${fmtPct(cacheWin.uncachedRatio)}   (1.0x 全價)`);
  L.push(`    prompt 側 token : ${fmtK(cacheWin.promptTotal)}  (input ${fmtK(cacheWin.sum.input)} + read ${fmtK(cacheWin.sum.cacheRead)} + write ${fmtK(cacheWin.sum.cacheCreate)})`);
  if (pricing) {
    L.push(`    cache 省下      : ~$${cacheWin.savedUsd}   寫入多繳: ~$${cacheWin.premiumUsd}   淨省: ~$${cacheWin.netSavedUsd}  (窗內)`);
  } else {
    L.push('    (pipeline-config.json modelPricing 不可讀,略過成本估算)');
  }
  L.push('');
  L.push(`    ── 當前 JSONL 全量(${all.length} 筆)──`);
  L.push(`    cache_read 比率 : ${fmtPct(cacheAll.cacheReadRatio)}   ${healthLabel(cacheAll.cacheReadRatio)}`);
  const models = Object.keys(cacheAll.perModel).filter((k) => k !== 'other' || cacheAll.perModel[k].n);
  for (const k of models) {
    const m = cacheAll.perModel[k];
    const pt = m.input + m.cacheRead + m.cacheCreate;
    const rr = pt > 0 ? m.cacheRead / pt : 0;
    L.push(`      · ${k.padEnd(7)}: ${m.n} req  cache_read ${fmtPct(rr)}  (read ${fmtK(m.cacheRead)} / write ${fmtK(m.cacheCreate)})`);
  }

  L.push('');
  L.push('§2. Always-on Prefix 漂移歸因 (PrefixShape-lite)');
  L.push(`    combined fingerprint: ${curShape.combined}`);
  for (const [f, h] of Object.entries(curShape.files)) {
    L.push(`      · ${h || '(缺檔)'}  ${f}`);
  }
  if (drift.firstRun) {
    L.push('    (首次執行 — 已建立 baseline,下次執行可比對漂移)');
  } else if (drift.changed.length === 0) {
    L.push('    ✅ 上次執行以來 always-on 可控前綴 byte-stable(無漂移)');
  } else {
    L.push(`    ⚠ 偵測到 ${drift.changed.length} 個 always-on 段落自上次執行後 churn(可能毀 prompt cache 前綴):`);
    for (const c of drift.changed) L.push(`      · ${c.file}: ${c.from} → ${c.to}`);
  }

  L.push('');
  L.push('§3. 誠實天花板 (Anti-Speculation)');
  L.push('    本工具診斷 PhyCool「自己可控」的注入/always-on 部分;不控制 Claude Code CLI');
  L.push('    內部 prompt cache breakpoint。prefix byte-stable ≠ 保證 provider cache 命中。');
  L.push('    成功標準 = 持續觀察 cache_read 比率趨勢,非單次預估命中率。');
  L.push('');
  L.push('───────────────────────────────────────────────────────────────');
  L.push(' Tianji PILOT artifact · 唯讀 · 未接入任何 hook/pipeline');
  L.push(' Kill switch: 刪除 scripts/token-cache-health-advisor.cjs + logs/token-cache-health-state.json');
  L.push(' 重跑: node scripts/token-cache-health-advisor.cjs [--window N] [--json] [--add-file <path>]');
  L.push('───────────────────────────────────────────────────────────────');

  process.stdout.write(L.join('\n') + '\n');
}

try { main(); } catch (err) {
  // fail-safe: 絕不 throw,友善退出
  process.stdout.write(`[token-cache-health-advisor] 非預期錯誤(已 fail-safe 退出): ${err && err.message}\n`);
  process.exit(0);
}
