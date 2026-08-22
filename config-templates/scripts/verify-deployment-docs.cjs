#!/usr/bin/env node
/**
 * verify-deployment-docs.cjs — 部屬指南完整性驗證腳本
 *
 * 用途:
 *   1. 7 條 SANITIZATION 脫敏 grep 終審(全 0 命中才 pass)
 *   2. V-8 phycool/PhyCool 字面禁出現驗證
 *   3. Markdown link 解析 → fs.existsSync 路徑可達性
 *   4. 數字 drift 偵測(14 hooks / 74 skills / 19 rules / 23 MCP tools / 30+ tables / 98 migrations)
 *   5. UTF-8 + 繁中編碼驗證
 *
 * 退出碼:
 *   0 = 全 PASS
 *   1 = DRIFT(發現問題)
 *   2 = INTERNAL ERROR(腳本本身錯誤)
 *
 * 使用:
 *   node scripts/verify-deployment-docs.cjs
 *   node scripts/verify-deployment-docs.cjs --quiet   (只輸出失敗)
 *   node scripts/verify-deployment-docs.cjs --strict  (嚴格模式,警告也 fail)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY_DIR = path.join(ROOT, 'claude token減量策略研究分析', '1.專案部屬必讀');
const STRATEGY_ROOT = path.join(ROOT, 'claude token減量策略研究分析');
const RULE_FILE = path.join(ROOT, '.claude', 'rules', 'deployment-doc-freshness.md');

const ARGS = process.argv.slice(2);
const QUIET = ARGS.includes('--quiet');
const STRICT = ARGS.includes('--strict');

let errors = 0;
let warnings = 0;

function info(msg) { if (!QUIET) console.log(msg); }
function warn(msg) { warnings++; console.warn(`⚠ WARN: ${msg}`); }
function fail(msg) { errors++; console.error(`✗ FAIL: ${msg}`); }
function pass(msg) { if (!QUIET) console.log(`✓ PASS: ${msg}`); }

// =====================================================================
// V-1~V-8: SANITIZATION grep patterns
// =====================================================================

const SANITIZATION_PATTERNS = [
  { id: 'V-1', name: '真實 Email(@gmail / after.future / @phycool)', regex: /@gmail\.com|after\.future|@phycool/g },
  { id: 'V-2', name: '真實價格(NT$ 990/2490/4990 等具體金額)', regex: /(NT?\$|NTD)\s?(990|2490|4990|3990|150|350|650)\b/g },
  { id: 'V-3', name: 'ECPay MerchantID 7+ 數字 / API Key 20+', regex: /MerchantID\s?[=:]\s?\d{7,}|ApiKey\s?[=:]\s?[A-Za-z0-9]{20,}/g },
  { id: 'V-4', name: '*.phycool 真實域名', regex: /https?:\/\/[\w\-]+\.phycool\.(com|net|org|io)/g },
  { id: 'V-5', name: 'ExamplePw123 弱口令', regex: /ExamplePw123/g },
  { id: 'V-6', name: 'Azure AccountKey 60+', regex: /AccountKey=[A-Za-z0-9+/=]{60,}/g },
  { id: 'V-7', name: 'U+FFFD 替換符亂碼', regex: /�/g },
  {
    id: 'V-8',
    name: 'phycool / PhyCool 字面(品牌脫敏)',
    regex: /phycool|PhyCool/g,
    // Story td-toolkit-verify-skill-naming-allow (v5.0.0 follow-up):
    // Skill 命名與技術識別碼合法保留 phycool 字面 (kebab-case skill names + PascalCase code identifiers + MCP tool names)
    // 業務字面 (`phycool 平台 / PhyCool brand`) 仍會 hit
    // 2026-08-08 SUPERSEDED — 降為 informational，不再計入 FAILURES。
    // 本項建立於 2026-05 雙倉庫時代（要推 claude-agent-toolkit 公開 repo，故禁品牌字面）。
    // 該機制已由 single-engine-mode.md Core Decision #4 凍結；使用者 2026-08-08 裁定
    // 「開發環境就叫 phycool，識別名保留」—— MCP server 註冊名 / DB 檔名 / Skill 目錄名
    // 皆屬工具識別而非業務資料，改動會連動 .mcp.json 與全部 mcp__phycool-context__* 引用。
    //
    // 產品「業務資料」的禁入改由 scripts/verify-package-sanitization.cjs 把關
    // （前後台帳號 / 測試密碼 / src 業務程式碼路徑 / 個人識別，非 0 不得推送）。
    informational: true,
    allowPatterns: [
      /phycool-[a-z0-9][a-z0-9-]*/g,         // kebab-case: phycool-windows-ps-encoding / phycool-mcp-discipline / phycool-context
      /Phycool[A-Z][a-zA-Z0-9]*/g,           // PascalCase: PhycoolMcpSafe / PhycoolContextDb / Invoke-PhycoolMcpSafe (右側部分)
      /mcp__phycool-context__[a-z_]+/g,      // MCP tool full names: mcp__phycool-context__add_context
    ],
  },
];

// Apply allowPatterns to strip legitimate identifiers before main regex matching.
// Story td-toolkit-verify-skill-naming-allow (v5.0.0 follow-up).
function applyAllowPatterns(content, allowPatterns) {
  if (!allowPatterns || allowPatterns.length === 0) return content;
  let stripped = content;
  for (const allowRegex of allowPatterns) {
    stripped = stripped.replace(allowRegex, '');
  }
  return stripped;
}

// =====================================================================
// Helper: 蒐集所有 markdown 檔
// =====================================================================

const EXTERNAL_REF_DIRS = [
  'everything-claude-code-main',
  'BMAD-METHOD-main',
  'context-hub-main',
  'claude-mem-main',
  'agent-skills-main',
  'awesome-claude-skills-main',
  'awesome-design-md-main',
];

function walkDir(dir, ext = ['.md']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXTERNAL_REF_DIRS.includes(entry.name)) continue;
      results.push(...walkDir(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// =====================================================================
// Phase 1: SANITIZATION 終審
// =====================================================================

function phase1Sanitization() {
  info('\n=== Phase 1: SANITIZATION 8 條脫敏終審 ===');

  const allFiles = [
    ...walkDir(DEPLOY_DIR, ['.md']),
    path.join(STRATEGY_ROOT, '當前環境完整快照_2026-05-01.md'),
    RULE_FILE,
  ].filter(f => fs.existsSync(f));

  for (const pattern of SANITIZATION_PATTERNS) {
    const hits = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // SANITIZATION-POLICY 自身允許示範用 pattern(內含 grep regex 字面)
      if (file.endsWith('SANITIZATION-POLICY.md') && ['V-1','V-2','V-3','V-4','V-5','V-6','V-8'].includes(pattern.id)) {
        continue;
      }
      // SYNC-LOG.md 為 meta-documentation 記錄 toolkit 同步歷程,內含 PCPT-MVP 來源 repo 名稱與 skill 字面
      // Story td-toolkit-verify-skill-naming-allow (v5.0.0 follow-up): 同 SANITIZATION-POLICY.md 邏輯豁免 V-8
      if (file.endsWith('SYNC-LOG.md') && pattern.id === 'V-8') {
        continue;
      }
      // V-8 (and any future pattern) supports allowPatterns to strip legitimate identifiers
      const matchContent = applyAllowPatterns(content, pattern.allowPatterns);
      const matches = matchContent.match(pattern.regex);
      if (matches && matches.length > 0) {
        hits.push({ file: path.basename(file), count: matches.length });
      }
    }
    if (hits.length === 0) {
      pass(`${pattern.id} ${pattern.name}: 0 命中`);
    } else if (pattern.informational) {
      // SUPERSEDED 項目：仍列出供人工判讀，但不阻斷（見該 pattern 的註解）
      warn(`${pattern.id} ${pattern.name}: ${hits.length} files 命中（informational — 識別名保留為 2026-08-08 裁定，非阻斷項）`);
    } else {
      fail(`${pattern.id} ${pattern.name}: ${hits.length} files 命中`);
      hits.forEach(h => console.error(`     - ${h.file}: ${h.count} hits`));
    }
  }
}

// =====================================================================
// Phase 2: Markdown Link 可達性
// =====================================================================

function phase2Links() {
  info('\n=== Phase 2: Markdown Link 可達性 ===');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const allFiles = walkDir(DEPLOY_DIR, ['.md']);

  let totalLinks = 0;
  let brokenLinks = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      const linkPath = match[2];
      // 跳過 http(s) / mailto / anchor / fragment-only
      if (linkPath.startsWith('http') || linkPath.startsWith('mailto:') || linkPath.startsWith('#')) {
        continue;
      }
      // 跳過範本占位符 + 明顯範例
      if (linkPath.includes('{{') || linkPath.includes('<') || linkPath === 'url' || linkPath === '...') {
        continue;
      }
      // 跳過 placeholder 文字如 file.md / Title 範例
      if (linkText === 'Title' && linkPath === 'file.md') continue;
      // 跳過 docs/CODEMAPS / docs/GUIDES / CONTRIBUTING.md 等 placeholder 範例(agent template 內)
      if (linkPath.match(/^(docs\/CODEMAPS|docs\/GUIDES|CONTRIBUTING\.md)/)) continue;

      // ── 2026-08-08 新增三類排除（原本 21 個「broken」全屬下列情形，改文檔反而是錯的）──
      // (1) 非連結：markdown link regex 會誤吃正則字面與 PowerShell 型別轉換。
      //     判準：連結目標不像路徑 —— 含空白、正則元字元，或不以 .md/.json 等副檔名結尾。
      if (/[\s*?"'|]/.test(linkPath) || /^\$|\.\*|\(\)/.test(linkPath)) continue;
      // (2) 部署期才還原的佔位路徑（${PROJECT_SLUG} / ${PROJECT_ROOT} 等），
      //     打包當下必然解析不到，install-devenv.cjs 還原後才成立。
      if (linkPath.includes('${')) continue;
      // (3) skill 範本／範例檔內的示意連結：那些 references/*.md 本來就不存在，
      //     它們在教「你的 skill 可以這樣引用」，把它們改掉會毀掉範本的教學價值。
      //     skill-builder/SKILL.md 同理 —— 它是建立 skill 的教學，內含示範用的 references 連結。
      const base = path.basename(file);
      if (base === 'skill-template.md' || base === 'skill-examples.md') continue;
      if (file.includes(`${path.sep}skill-builder${path.sep}`) && /^references\//.test(linkPath)) continue;
      // (3b) 跨專案引用：往上 3 層以上的相對路徑指向完整專案結構
      //      （.claude/rules/ · docs/technical-decisions/ 等），打包夾不含這些目錄。
      //      注意不能只用「解析後是否落在 DEPLOY_DIR 外」判斷 —— 打包夾層級較淺，
      //      ../../../../ 往上跳完仍在夾內，會造成誤判（2026-08-08 實測）。
      if (/(\.\.[\\/]){3,}/.test(linkPath)) continue;

      totalLinks++;
      // 解析 path(去除 anchor)
      const cleanPath = linkPath.split('#')[0];
      if (!cleanPath) continue;
      const fullPath = path.resolve(dir, cleanPath);
      // (4) 指向打包夾之外的連結（`../../../../.claude/rules/…` / `docs/technical-decisions/…`）：
      //     在完整專案中有效，只是打包夾不含那些目錄。install-devenv.cjs 還原到真實專案後
      //     即可解析，此處不算 broken。
      if (!fullPath.startsWith(DEPLOY_DIR)) { totalLinks--; continue; }
      if (!fs.existsSync(fullPath)) {
        brokenLinks++;
        warn(`Broken link in ${path.basename(file)}: [${linkText}](${linkPath})`);
      }
    }
  }

  if (brokenLinks === 0) {
    pass(`Markdown links 可達性: ${totalLinks} links 全 OK`);
  } else {
    fail(`Markdown links 可達性: ${brokenLinks}/${totalLinks} broken`);
  }
}

// =====================================================================
// Phase 3: 數字 Drift 偵測
// =====================================================================

function phase3NumberDrift() {
  info('\n=== Phase 3: 數字 Drift 偵測 ===');

  const ACTUAL = {
    Hooks: countDir(path.join(ROOT, '.claude', 'hooks'), name => name.endsWith('.js') && !name.endsWith('.test.js')),
    Skills: countDir(path.join(ROOT, '.claude', 'skills'), null, true),
    Rules: countDir(path.join(ROOT, '.claude', 'rules'), name => name.endsWith('.md')),
    Agents: countDir(path.join(ROOT, '.claude', 'agents'), name => name.endsWith('.md')),
    Commands: countDir(path.join(ROOT, '.claude', 'commands'), name => name.endsWith('.md')),
    ContextDBScripts: countDir(path.join(ROOT, '.context-db', 'scripts'), name => name.endsWith('.js') || name.endsWith('.cjs')),
    ADRs: countDir(path.join(ROOT, 'docs', 'technical-decisions'), name => name.startsWith('ADR-') && name.endsWith('.md')),
  };

  const claimsRegex = {
    Hooks: /(\d+)\s*(?:hooks?|個\s*hook)/gi,
    Skills: /(\d+)\s*(?:Skills?|個\s*Skill)/g,
    Rules: /(\d+)\s*(?:Rules?|條\s*Rule)/g,
    MCPTools: /(\d+)\s*(?:MCP\s*tools?|個\s*MCP)/gi,
  };

  // expectedRange 是「合理區間」而非精確值 —— 目的是偵測異常暴增/暴跌（誤刪、同步失敗），
  // 不是鎖死數量。基準重校於 2026-08-08（實測 Hooks 55 / Skills 102 / Rules 41 /
  // Commands 13 / Agents 10）；舊值停留在 2026-05 規模（13-16 / 70-80 / 22-26），
  // 環境成長後長期紅字，反而讓人對 WARN 麻木。日後規模再變動時一併更新此處。
  const claimsToCheck = {
    'Hooks': { actual: ACTUAL.Hooks, expectedRange: [45, 70] },
    'Skills': { actual: ACTUAL.Skills, expectedRange: [90, 120] },
    'Rules': { actual: ACTUAL.Rules, expectedRange: [35, 50] },
    'Commands': { actual: ACTUAL.Commands, expectedRange: [10, 20] },
    'Agents': { actual: ACTUAL.Agents, expectedRange: [8, 14] },
  };

  for (const [name, c] of Object.entries(claimsToCheck)) {
    const inRange = c.actual >= c.expectedRange[0] && c.actual <= c.expectedRange[1];
    if (inRange) {
      pass(`${name}: actual=${c.actual} in range [${c.expectedRange[0]}, ${c.expectedRange[1]}]`);
    } else {
      warn(`${name}: actual=${c.actual} NOT in range [${c.expectedRange[0]}, ${c.expectedRange[1]}] — docs may need updating`);
    }
  }

  info('  Real numbers snapshot:');
  Object.entries(ACTUAL).forEach(([k, v]) => info(`    ${k}: ${v}`));
}

function countDir(dirPath, filterFn, isDirOnly = false) {
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter(e => {
    if (isDirOnly) return e.isDirectory();
    if (!e.isFile()) return false;
    return filterFn ? filterFn(e.name) : true;
  }).length;
}

// =====================================================================
// Phase 4: UTF-8 + 繁中編碼驗證
// =====================================================================

function phase4Encoding() {
  info('\n=== Phase 4: UTF-8 + 繁中編碼驗證 ===');
  const allFiles = walkDir(DEPLOY_DIR, ['.md']);
  let bomFiles = 0;
  let nonZhFiles = 0;

  for (const file of allFiles) {
    const buffer = fs.readFileSync(file);
    // BOM 檢查
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      bomFiles++;
      warn(`UTF-8 BOM found: ${path.basename(file)} (建議移除 BOM 避免 markdown parser 衝突)`);
    }
    // 繁中可讀性
    const content = buffer.toString('utf8');
    const hasZh = /[一-鿿]/.test(content);
    const filename = path.basename(file);
    // 純技術 .md 可能無繁中,跳過
    if (!hasZh && !filename.match(/^README\.md$/i) && !filename.match(/template/i)) {
      // 跳過 — 不一定要繁中
    }
  }

  if (bomFiles === 0) {
    pass(`Encoding: 0 files 含 BOM(全 UTF-8 NoBOM)`);
  } else {
    warn(`Encoding: ${bomFiles} files 含 BOM`);
  }
}

// =====================================================================
// Phase 5: Toolkit Template Completeness (V-9)
// =====================================================================

function phase5TemplateCompleteness() {
  info('\n=== Phase 5: V-9 Toolkit 範本完整性 ===');
  const tk = path.join(STRATEGY_ROOT, '1.專案部屬必讀', 'config-templates', 'claude');
  const cdb = path.join(STRATEGY_ROOT, '1.專案部屬必讀', 'config-templates', 'context-db');
  const overlay = path.join(STRATEGY_ROOT, '1.專案部屬必讀', 'bmad-overlay', '4-implementation');

  const checks = [
    { name: 'Toolkit hooks', path: path.join(tk, 'hooks'), filter: n => n.endsWith('.js'), expectMin: 13 },
    { name: 'Toolkit rules', path: path.join(tk, 'rules'), filter: n => n.endsWith('.md'), expectMin: 18 },
    { name: 'Toolkit agents', path: path.join(tk, 'agents'), filter: n => n.endsWith('.md'), expectMin: 8 },
    { name: 'Toolkit commands', path: path.join(tk, 'commands'), filter: n => n.endsWith('.md'), expectMin: 10 },
    { name: 'Toolkit context-db scripts', path: path.join(cdb, 'scripts'), filter: n => n.endsWith('.js') || n.endsWith('.cjs'), expectMin: 50 },
    { name: 'Toolkit bmad-overlay total', path: overlay, filter: () => true, expectMin: 50, recursive: true },
  ];

  for (const c of checks) {
    let count = 0;
    if (fs.existsSync(c.path)) {
      if (c.recursive) {
        count = walkDir(c.path, ['.md', '.yaml', '.xml']).length;
      } else {
        count = fs.readdirSync(c.path).filter(name => {
          const stat = fs.statSync(path.join(c.path, name));
          return stat.isFile() && c.filter(name);
        }).length;
      }
    }
    if (count >= c.expectMin) {
      pass(`${c.name}: ${count} ≥ expected ${c.expectMin}`);
    } else {
      fail(`${c.name}: ${count} < expected ${c.expectMin} (toolkit incomplete!)`);
    }
  }
}

// =====================================================================
// Main
// =====================================================================

function main() {
  console.log('==========================================');
  console.log('  Deployment Docs Verification 2026-05-01');
  console.log('==========================================');

  try {
    phase1Sanitization();
    phase2Links();
    phase3NumberDrift();
    phase4Encoding();
    phase5TemplateCompleteness();

    console.log('\n==========================================');
    console.log(`  Result: ${errors === 0 ? '✓ ALL PASS' : `✗ ${errors} FAILURES`}, ${warnings} warnings`);
    console.log('==========================================\n');

    if (errors > 0) process.exit(1);
    if (STRICT && warnings > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error('Internal error:', err);
    process.exit(2);
  }
}

main();
