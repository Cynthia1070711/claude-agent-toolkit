#!/usr/bin/env node
/**
 * verify-package-sanitization.cjs — 開源打包夾的業務內容禁入驗證（機械閘門）
 *
 * 版本: 1.0.0
 * 建立日期: 2026-08-08 10:44:00
 *
 * 為什麼需要這支:
 *   sync-config-templates.cjs 的通用化與禁入守衛是「打包當下」的防線，
 *   但打包夾可能被人工編輯、從別處複製檔案、或規則有漏網。
 *   本腳本對**打包結果本身**做獨立複驗 —— 推送開源前必須跑，非 0 即不得推送。
 *
 * 用法:
 *   node scripts/verify-package-sanitization.cjs          # 驗證，有命中則 exit 1
 *   node scripts/verify-package-sanitization.cjs --list   # 列出每一處命中的檔案與行號
 *
 * 判準與 sync-config-templates.cjs 的 FORBIDDEN_PATTERNS 同源，
 * 但刻意獨立實作：同一份程式碼自己驗自己，等於沒驗。
 */

const fs = require('fs');
const path = require('path');

const LIST = process.argv.includes('--list');
const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'claude token減量策略研究分析', '1.專案部屬必讀');

// 禁入：產品業務資訊。命中即為洩漏。
const FORBIDDEN = [
  ['前台方案帳號', /\bA[1-5]@gmail\.com\b/g],
  ['後台管理帳號', /[\w.\-]+@phycool\.(local|com)\b/g],
  ['測試密碼', /\bAfter1229\b/g],
  ['維運者 Email', /after\.future1229@gmail\.com/gi],
  ['Git 帳號', /\bCynthia1070711\b/g],
  ['src 業務程式碼路徑', /src[\\/]PhyCool\.Platform/g],
  ['絕對路徑（未脫敏）', /C:[\\/]+Users[\\/]+Alan/gi],
  // Claude 專案目錄雜湊名：內含使用者名稱與完整路徑，但不含 '${USER_HOME}' 字面，
  // 上一條規則抓不到（2026-08-08 實測 4 檔漏網才補上）
  ['專案雜湊路徑（含使用者名）', /C--Users-Alan[\w-]*/g],
  ['API Key / PAT', /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|pat_[A-Za-z0-9]{20,})\b/g],
];

// 已知非殘留：secret detector 自己的偵測正則。以「檔名 + 類別」精準豁免，
// 不用整檔豁免 —— 否則這些檔日後真的夾帶帳號也不會被抓到。
const EXEMPT = [
  { file: 'cross-ref-precheck.js', cats: ['API Key / PAT'] },
  { file: 'pre-commit-quality.js', cats: ['API Key / PAT'] },
  { file: 'verify-deployment-docs.cjs', cats: ['API Key / PAT'] },
  { file: 'sanitize-tool-verify.cjs', cats: ['API Key / PAT'] },
  { file: 'verify-package-sanitization.cjs', cats: FORBIDDEN.map(f => f[0]) },  // 本檔自身
  { file: 'sync-config-templates.cjs', cats: FORBIDDEN.map(f => f[0]) },        // 通用化規則本體
];

function exempt(base, cat) {
  return EXEMPT.some(e => e.file === base && e.cats.includes(cat));
}

const hits = [];
let scanned = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === 'node_modules' || f === 'dist' || f === '.vite' || f === '.git') continue;
      walk(p);
      continue;
    }
    if (/\.(png|jpg|jpeg|gif|zip|db|ico|woff2?)$/i.test(f)) continue;
    let text;
    // CRLF + BOM normalize：行號定位靠 split('\n')，CRLF 檔會讓每行尾帶 \r
    // （對齊 .claude/rules/crlf-normalize-discipline.md）
    try { text = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'); } catch { continue; }
    scanned++;
    const rel = p.replace(PKG + path.sep, '');
    for (const [cat, re] of FORBIDDEN) {
      if (exempt(f, cat)) continue;
      re.lastIndex = 0;
      const m = text.match(re);
      if (!m) continue;
      const lines = [];
      if (LIST) {
        text.split('\n').forEach((ln, i) => {
          re.lastIndex = 0;
          if (re.test(ln)) lines.push(i + 1);
        });
      }
      hits.push({ rel, cat, count: m.length, lines });
    }
  }
}

if (!fs.existsSync(PKG)) {
  console.error('✗ 找不到打包夾: ' + PKG);
  process.exit(1);
}

walk(PKG);

console.log('verify-package-sanitization');
console.log('  掃描目標: ' + PKG);
console.log('  掃描檔數: ' + scanned + '\n');

if (!hits.length) {
  console.log('✅ 通過 — 打包夾無任何產品業務資訊殘留');
  console.log('   （已檢核 ' + FORBIDDEN.length + ' 類：前台/後台帳號 · 測試密碼 · 個人識別 · src 業務路徑 · 絕對路徑 · 憑證）');
  process.exit(0);
}

const byCat = new Map();
for (const h of hits) {
  if (!byCat.has(h.cat)) byCat.set(h.cat, []);
  byCat.get(h.cat).push(h);
}
console.log('❌ 未通過 — 發現 ' + hits.reduce((a, h) => a + h.count, 0) + ' 處殘留 / ' + new Set(hits.map(h => h.rel)).size + ' 檔\n');
for (const [cat, list] of [...byCat].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`【${cat}】 ${list.reduce((a, h) => a + h.count, 0)} 處 / ${list.length} 檔`);
  for (const h of list.sort((a, b) => b.count - a.count)) {
    console.log(`   ${String(h.count).padStart(4)}  ${h.rel}` + (h.lines.length ? `  (L${h.lines.join(', L')})` : ''));
  }
  console.log('');
}
console.log('處置：改 scripts/sync-config-templates.cjs 的 GENERALIZE / FILE_DENY / SKILL_ALLOWLIST，');
console.log('      重跑 --apply 後再驗一次。不要手改打包夾，下次同步會被覆蓋。');
process.exit(1);
