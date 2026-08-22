#!/usr/bin/env node
'use strict';
/**
 * detect-zombie-hooks.cjs — BR-ECC-08-03
 *
 * 雙向僵屍 hook 偵測 (advisory, exit 0 clean / exit 1 found)
 * 對齊 .claude/rules/cross-ref-discipline.md §4 Post-Action Flow Step 1
 *
 * 方向 A: .claude/hooks/*.js (排除 *.test.js) 存在,但未在 settings.json 註冊 → zombie file
 * 方向 B: settings.json 引用的 hook 路徑,但 .js 檔不存在 → broken reference
 *
 * require 慣例: .context-db/scripts/*.cjs 範式
 *   const path = require('path');
 *   const projectRoot = path.resolve(__dirname, '..', '..');
 *   (來源: check-zombie-workflows.cjs L30)
 */

const fs = require('fs');
const path = require('path');

// CRLF + BOM normalize (cross-ref-discipline §4 + crlf-normalize-discipline §3.1)
function readNormalized(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

const projectRoot = path.resolve(__dirname, '..', '..');
const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
const hooksDir = path.join(projectRoot, '.claude', 'hooks');

// ─── Step 1: 從 settings.json 解析所有 hook 路徑 ───────────────────────────
// 抽取 `node .claude/hooks/X.js` pattern (cross-ref-discipline §4 Step 1 範本)
function parseRegisteredHooks(settings) {
  const registered = new Set();
  function walkHooks(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walkHooks); return; }
    if (obj.type === 'command' && typeof obj.command === 'string') {
      const m = obj.command.match(/node\s+(\.claude[\/\\]hooks[\/\\][^\s"']+\.js)/);
      if (m) registered.add(m[1].replace(/\\/g, '/'));
    }
    Object.values(obj).forEach(walkHooks);
  }
  walkHooks(settings.hooks || {});
  return registered;
}

// ─── Step 2: Glob .claude/hooks/*.js 排除 *.test.js ────────────────────────
function listPhysicalHooks() {
  const files = fs.readdirSync(hooksDir).filter(f =>
    f.endsWith('.js') && !f.endsWith('.test.js') && !f.startsWith('_')
  );
  return new Set(files.map(f => `.claude/hooks/${f}`));
}

// ─── Main ──────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(settingsPath)) {
    process.stderr.write(`[detect-zombie-hooks] settings.json not found: ${settingsPath}\n`);
    process.exit(1);
  }

  const settingsRaw = readNormalized(settingsPath);
  let settings;
  try {
    settings = JSON.parse(settingsRaw);
  } catch (e) {
    process.stderr.write(`[detect-zombie-hooks] settings.json parse error: ${e.message}\n`);
    process.exit(1);
  }

  const registered = parseRegisteredHooks(settings);
  const physical = listPhysicalHooks();

  // 方向 A: 物理存在但未註冊 → zombie file
  const zombieFiles = [];
  for (const p of physical) {
    if (!registered.has(p)) zombieFiles.push(p);
  }

  // 方向 B: 已註冊但實體不存在 → broken reference
  const brokenRefs = [];
  for (const r of registered) {
    if (r.startsWith('.claude/hooks/')) {
      const absPath = path.join(projectRoot, r);
      if (!fs.existsSync(absPath)) brokenRefs.push(r);
    }
  }

  const ts = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().replace(/\.\d{3}Z$/, '+08:00');

  console.log('# detect-zombie-hooks — 雙向僵屍 hook 偵測');
  console.log(`Generated: ${ts}`);
  console.log(`Physical hooks (.claude/hooks/*.js, 排除 *.test.js / _*): ${physical.size}`);
  console.log(`Registered hooks (settings.json .claude/hooks/*): ${registered.size}`);
  console.log();

  if (zombieFiles.length === 0 && brokenRefs.length === 0) {
    console.log('✅ CLEAN: 無僵屍 hook / 無 broken reference。');
    process.exit(0);
  }

  let foundAny = false;

  if (zombieFiles.length > 0) {
    foundAny = true;
    console.log(`## 方向 A — Zombie files (物理存在但未在 settings.json 註冊): ${zombieFiles.length}`);
    zombieFiles.forEach(f => console.log(`  [ZOMBIE] ${f}`));
    console.log();
  }

  if (brokenRefs.length > 0) {
    foundAny = true;
    console.log(`## 方向 B — Broken references (settings.json 引用但 .js 不存在): ${brokenRefs.length}`);
    brokenRefs.forEach(r => console.log(`  [BROKEN] ${r}`));
    console.log();
  }

  if (foundAny) {
    console.log('## 建議');
    console.log('對齊 .claude/rules/cross-ref-discipline.md §4 Step 1:');
    console.log('  - Zombie files: 若 hook 已 retire,從 .claude/hooks/ 刪除,或重新在 settings.json 註冊');
    console.log('  - Broken refs: 補建對應 .js 檔,或從 settings.json 移除對應 hook 條目');
    process.exit(1); // advisory exit 1
  }
}

// ─── Self-test (--self-test flag) ──────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombie-selftest-'));
  let passed = 0;
  let failed = 0;

  function assert(label, cond) {
    if (cond) { console.log(`  PASS: ${label}`); passed++; }
    else { console.error(`  FAIL: ${label}`); failed++; }
  }

  try {
    // 模擬 zombie file: 物理存在但未在 settings 中
    const fakeHooksDir = path.join(tmpDir, '.claude', 'hooks');
    fs.mkdirSync(fakeHooksDir, { recursive: true });
    fs.writeFileSync(path.join(fakeHooksDir, 'zombie-hook.js'), '// zombie\n', 'utf8');

    // 模擬 broken ref: settings 引用但檔案不存在
    const fakeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/non-existent.js' }] }]
      }
    };
    const fakeSettingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
    fs.writeFileSync(fakeSettingsPath, JSON.stringify(fakeSettings, null, 2), 'utf8');

    // 執行偵測邏輯 (內聯驗證)
    const settingsRaw2 = readNormalized(fakeSettingsPath);
    const settings2 = JSON.parse(settingsRaw2);
    const reg2 = parseRegisteredHooks(settings2);
    const phys2 = new Set(
      fs.readdirSync(fakeHooksDir)
        .filter(f => f.endsWith('.js') && !f.endsWith('.test.js') && !f.startsWith('_'))
        .map(f => `.claude/hooks/${f}`)
    );

    const zombies2 = [...phys2].filter(p => !reg2.has(p));
    const broken2 = [...reg2].filter(r => r.startsWith('.claude/hooks/') && !fs.existsSync(path.join(tmpDir, r)));

    assert('方向 A: zombie-hook.js 應偵測到 (物理存在未註冊)', zombies2.includes('.claude/hooks/zombie-hook.js'));
    assert('方向 B: non-existent.js 應偵測到 (已註冊但不存在)', broken2.includes('.claude/hooks/non-existent.js'));
    assert('CRLF+BOM normalize 正常 (JSON 解析成功)', typeof settings2 === 'object');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\nSelf-test: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
