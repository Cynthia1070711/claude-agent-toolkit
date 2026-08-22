#!/usr/bin/env node
/**
 * install-devenv.cjs — 把開源打包範本還原到「任意路徑的新專案」
 *
 * 版本: 1.0.0
 * 建立日期: 2026-08-08 10:31:00
 *
 * 為什麼需要這支:
 *   sync-config-templates.cjs 打包時把絕對路徑等抽換成 ${PROJECT_ROOT} 佔位，
 *   若無反向還原，異機拿到的 settings.json 會是字面的 cd "${PROJECT_ROOT}" ——
 *   67 個 hook 掛載點全數失效。脫敏必須是雙向的才成立。
 *
 * 使用者的專案路徑與名稱人人不同，本腳本不假設任何一種，全部由參數指定。
 *
 * 用法:
 *   # 1. 先預覽（預設 dry-run，不寫任何檔）
 *   node scripts/install-devenv.cjs --project-root "D:/Work/my-project"
 *
 *   # 2. 確認無誤後實際安裝
 *   node scripts/install-devenv.cjs --project-root "D:/Work/my-project" --apply
 *
 *   # 3. 完整參數
 *   node scripts/install-devenv.cjs \
 *     --project-root "D:/Work/my-project" \
 *     --project-name "my-project" \
 *     --user-home "C:/Users/YourName" \
 *     --email "you@example.com" \
 *     --git-user "your-github-id" \
 *     --test-password "YourTestPw123" \
 *     --test-account-domain "example.com" \
 *     --apply
 *
 *   # 只想知道這包需要哪些值 → 不帶任何參數跑一次，會列出全部佔位與缺漏
 *
 * 安裝後仍需人工完成（本腳本不碰）:
 *   - .mcp.json（含 API key，請複製 .claude/mcp_config.example.json 後自行填）
 *   - BMAD 本體安裝（之後才套 bmad-overlay/）
 *   - 依賴安裝與建索引，見 09-打包與部署.md §10
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 參數解析 ────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');   // 覆蓋目標端已存在且內容不同的檔

// 打包夾根（本檔位於 <打包夾>/scripts/ 或專案 scripts/，兩種都要能定位）
const HERE = path.resolve(__dirname);
const DOCROOT = fs.existsSync(path.join(HERE, '..', 'config-templates'))
  ? path.resolve(HERE, '..')                                                   // <打包夾>/scripts/
  : path.resolve(HERE, '..', 'claude token減量策略研究分析', '1.專案部屬必讀'); // 專案 scripts/
const TPL = path.join(DOCROOT, 'config-templates');

const projectRoot = path.resolve(arg('project-root', process.cwd()));
// 路徑一律以正斜線寫回：settings.json 的 hook 指令是 JSON 字串，反斜線需轉義；
// 正斜線在 Windows 的 cmd / PowerShell / Node 皆可用，是唯一不必分情況處理的形式。
const projectRootFwd = projectRoot.replace(/\\/g, '/');

// 佔位只有路徑類 —— 帳號 / 密碼 / Email / 業務資料一律不進打包（不是脫敏成佔位），
// 所以還原端也不需要對應參數。詳 09-打包與部署 §9.4。
const VALUES = {
  PROJECT_ROOT: projectRootFwd,
  PROJECT_NAME: arg('project-name', path.basename(projectRoot)),
  USER_HOME: arg('user-home', os.homedir()).replace(/\\/g, '/'),
  // Claude Code 的專案目錄雜湊名（~/.claude/projects/<slug>）：
  // 由專案絕對路徑把非英數字元逐一換成 '-' 推導。
  // 例：C:\Users\Me\Work\my-app(v2) → C--Users-Me-Work-my-app-v2-
  // log-session.js / import-conversations.js 以此定位原生 transcript，填錯會讀不到對話。
  PROJECT_SLUG: projectRoot.replace(/[^a-zA-Z0-9]/g, '-'),
};

// ── 還原對照：範本位置 → 目標位置 ────────────────────────────────
// rename 為 null 表示保留原檔名
const MAP = [
  { src: 'claude/rules',     dst: '.claude/rules' },
  { src: 'claude/agents',    dst: '.claude/agents' },
  { src: 'claude/commands',  dst: '.claude/commands' },
  { src: 'claude/hooks',     dst: '.claude/hooks' },
  { src: 'claude/skills',    dst: '.claude/skills' },
  { src: 'context-db',       dst: '.context-db' },
  { src: 'dev-console',      dst: 'tools/dev-console' },
  { src: 'party-to-pipeline/scripts', dst: '.claude/skills/party-to-pipeline/scripts' },
  { src: 'scripts',          dst: 'scripts' },
];
// 單檔且需改名的（.template 後綴拆除）
const SINGLES = [
  { src: 'claude/settings.json.template',       dst: '.claude/settings.json' },
  { src: 'claude/settings.local.json.template', dst: '.claude/settings.local.json' },
  { src: 'claude/CLAUDE.md.template',           dst: 'CLAUDE.md' },
  { src: 'claude/CLAUDE.local.md.template',     dst: 'CLAUDE.local.md' },
  { src: 'claude/MEMORY.md.template',           dst: '.claude/MEMORY.md' },
  { src: 'claude/claudeignore.template',        dst: '.claudeignore' },
  { src: 'context-db/mcp.json.template',        dst: '.claude/mcp_config.example.json' },
];

// ── 佔位還原 ────────────────────────────────────────────────────
// 只還原 sync-config-templates.cjs 的 SANITIZE 產生過的佔位（封閉白名單）。
// 不可用「所有大寫 ${VAR}」的寬鬆比對：範本裡大量存在 JS template literal 與
// PowerShell 的一般變數插值（${PORT} / ${TABLE} / ${RUN_ID} …），若使用者剛好
// 給了同名參數就會被改寫，直接破壞腳本。（2026-08-08 首測實際誤判 23 個變數）
const KNOWN_PLACEHOLDERS = new Set(Object.keys(VALUES));
const PLACEHOLDER_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
const seenPlaceholders = new Map();   // name -> 出現次數

function restore(text, rel) {
  return text.replace(PLACEHOLDER_RE, (whole, name) => {
    if (!KNOWN_PLACEHOLDERS.has(name)) return whole;   // 非本包佔位，原樣不動
    seenPlaceholders.set(name, (seenPlaceholders.get(name) || 0) + 1);
    const v = VALUES[name];
    return (v === null || v === undefined) ? whole : v;   // 沒給值就原樣保留，不亂猜
  });
}

const stats = { written: 0, skipped: 0, conflicts: 0, dirs: 0 };
const conflictList = [];

function writeOne(srcPath, dstPath, rel) {
  let text;
  try { text = fs.readFileSync(srcPath, 'utf8'); } catch { return; }
  const out = restore(text, rel);

  if (fs.existsSync(dstPath)) {
    const cur = fs.readFileSync(dstPath, 'utf8');
    if (cur === out) { stats.skipped++; return; }
    if (!FORCE) { stats.conflicts++; conflictList.push(rel); return; }
  }
  stats.written++;
  if (APPLY) {
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.writeFileSync(dstPath, out, 'utf8');
  }
}

function walkCopy(srcDir, dstDir, rel) {
  if (!fs.existsSync(srcDir)) return;
  stats.dirs++;
  for (const f of fs.readdirSync(srcDir)) {
    const sp = path.join(srcDir, f);
    const dp = path.join(dstDir, f);
    if (fs.statSync(sp).isDirectory()) { walkCopy(sp, dp, rel + '/' + f); continue; }
    writeOne(sp, dp, rel + '/' + f);
  }
}

// ── 主流程 ──────────────────────────────────────────────────────
console.log('install-devenv ' + (APPLY ? '[APPLY]' : '[DRY-RUN]') + (FORCE ? ' [FORCE]' : ''));
console.log('  範本來源: ' + TPL);
console.log('  安裝目標: ' + projectRoot);
console.log('  專案名稱: ' + VALUES.PROJECT_NAME);

if (!fs.existsSync(TPL)) {
  console.error('\n✗ 找不到 config-templates/，請確認本腳本位於打包夾的 scripts/ 之下。');
  process.exit(1);
}
if (projectRoot === path.resolve(DOCROOT, '..', '..')) {
  console.error('\n✗ 安裝目標等於本專案自身，會覆蓋現有設定。請用 --project-root 指定別的路徑。');
  process.exit(1);
}

for (const m of MAP) walkCopy(path.join(TPL, m.src), path.join(projectRoot, m.dst), m.src);
for (const s of SINGLES) {
  const sp = path.join(TPL, s.src);
  if (fs.existsSync(sp)) writeOne(sp, path.join(projectRoot, s.dst), s.src + ' → ' + s.dst);
}

// BMAD 覆蓋層：只在使用者已裝好 BMAD 時才套
const bmadSrc = path.join(DOCROOT, 'bmad-overlay/4-implementation');
const bmadDst = path.join(projectRoot, '_bmad/bmm/workflows/4-implementation');
if (fs.existsSync(bmadSrc)) {
  if (fs.existsSync(path.join(projectRoot, '_bmad'))) {
    walkCopy(bmadSrc, bmadDst, 'bmad-overlay');
  } else {
    console.log('\n⚠ 未偵測到 _bmad/ — 跳過 BMAD 覆蓋層。請先安裝 BMAD 本體，再重跑本腳本套用覆蓋。');
  }
}

// ── 佔位檢核 ────────────────────────────────────────────────────
console.log('\n───────── 佔位還原 ─────────');
const missing = [];
for (const [name, n] of [...seenPlaceholders].sort((a, b) => b[1] - a[1])) {
  const v = VALUES[name];
  if (v === null || v === undefined) { missing.push(name); console.log(`  ✗ \${${name}}  ${n} 處 — 未提供值，原樣保留`); }
  else console.log(`  ✓ \${${name}}  ${n} 處 → ${v}`);
}
if (!seenPlaceholders.size) console.log('  （範本中未出現任何 ${VAR} 佔位）');

console.log('\n───────── 統計 ─────────');
console.log('  寫入   ' + stats.written);
console.log('  相同   ' + stats.skipped + '（內容一致，跳過）');
console.log('  衝突   ' + stats.conflicts + (stats.conflicts && !FORCE ? '（目標已存在且內容不同，加 --force 覆蓋）' : ''));

if (conflictList.length) {
  console.log('\n衝突檔（前 20）:');
  for (const f of conflictList.slice(0, 20)) console.log('  ! ' + f);
  if (conflictList.length > 20) console.log('  ... 另 ' + (conflictList.length - 20) + ' 檔');
}

if (missing.length) {
  console.log('\n⚠ 下列佔位沒有對應參數，安裝後仍是字面 ${VAR}，請補參數重跑:');
  const flagOf = { USER_EMAIL: '--email', GIT_USER: '--git-user', TEST_PASSWORD: '--test-password' };
  for (const m of missing) {
    const flag = flagOf[m]
      || (m.startsWith('TEST_ACCOUNT_') ? '--test-account-domain' : null)
      || (m.startsWith('ADMIN_') ? '--admin-domain' : null)
      || '--' + m.toLowerCase().replace(/_/g, '-');
    console.log(`  ${m}  →  ${flag}`);
  }
}

console.log('\n後續步驟（本腳本不代勞，見 09-打包與部署.md §10）:');
console.log('  1. cd .context-db && pnpm install；cd tools/dev-console && npm install');
console.log('  2. node .context-db/scripts/init-db.js  然後逐一套 migrations/*.sql');
console.log('  3. 複製 .claude/mcp_config.example.json → .mcp.json 並填入自己的 API key');
console.log('  4. npx codegraph init -i；npx gitnexus analyze');
console.log('  5. node scripts/verify-deployment-docs.cjs 驗證');

if (!APPLY) console.log('\n（dry-run，未寫入。確認上列無誤後加 --apply 實際安裝）');
