#!/usr/bin/env node
/**
 * sync-config-templates.cjs — 從專案實際配置同步至開源打包範本
 *
 * 版本: 2.0.0
 * 建立日期: 2026-08-07 16:43:30
 * 更新日期: 2026-08-08 10:24:00
 *
 * 問題背景:
 *   config-templates/ 原為 2026-05-09 手工快照，實測正確率:
 *     rules   3/41 內容相同（8 個過時含 3 條已 retired、16 個缺漏、22 個漂移）
 *     agents  0/10 內容相同
 *     commands 4/13 內容相同
 *   手工維護 58+ 個鏡像檔不可持續，改由本腳本從 .claude/ 實際配置生成。
 *
 * v2.0.0 變更（2026-08-08 打包完整性稽核）:
 *   1. 本檔由 1.專案部屬必讀/scripts/ 移至專案 scripts/ — 文檔宣稱路徑即實際路徑，
 *      且異機還原後可繼續再生成範本（原位置在打包夾內，還原後無來源可同步）
 *   2. + settings.json → settings.json.template（含 67 個 hook 掛載點）
 *      原範本僅 301 bytes 的 permissions.deny，56 個 hook 檔全打包但無一會被觸發
 *   3. + root-scripts 白名單（otel / pipeline / file-lock / 品質守衛 / 稽核 / 部署驗證）
 *      settings.json 與 rules 直接引用這些腳本，缺了即斷鏈
 *   4. + db-tests（5 個 workflow 契約測試，機械守衛）
 *   5. + gitnexus 子技能組（6 個，分級 🟢）
 *   6. 脫敏加測試帳號規則；business-data 排除清單；prune 盲區修正
 *
 * 用法:
 *   node scripts/sync-config-templates.cjs            # dry-run，只報告不寫入
 *   node scripts/sync-config-templates.cjs --apply    # 實際寫入
 *   node scripts/sync-config-templates.cjs --apply --no-prune   # 不刪除目標端多餘檔
 *
 * 脫敏: 絕對路徑 / 使用者名稱 / Email / 測試密碼 / 測試帳號 / Git 帳號 → ${VAR} 佔位
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const PRUNE = !process.argv.includes('--no-prune');

const ROOT = path.resolve(__dirname, '..');                       // 專案根（本檔位於 scripts/）
const DOCROOT = path.join(ROOT, 'claude token減量策略研究分析', '1.專案部屬必讀');
const TPL = path.join(DOCROOT, 'config-templates');               // 範本根

// ── 脫敏規則（順序有意義：長字串先replace）──────────────────────
// 用 [\\/]+ 而非單一字元類別：路徑在 JS/JSON 字面值中會寫成雙反斜線轉義形式，
// 單字元類別匹配不到，會造成漏網（2026-08-07 首跑實測 3 檔殘留）。
//
// 註記：本檔會脫敏自己。下列 regex 字面之所以不會被自我替換，是因為 \b 前綴或
// [\\/]+ 字元類讓字面本身不符合 pattern。撰寫新規則時若在註解中直接寫出敏感字串，
// 該註解會在打包版中被替換掉而失真 —— 註解一律用佔位描述，不寫真實值。
const SANITIZE = [
  [/C:[\\/]+Users[\\/]+Alan[\\/]+Desktop[\\/]+Projects[\\/]+PhyCool-PCPT-MVP\(Antigravity\)/gi, '${PROJECT_ROOT}'],
  // Claude Code 的專案目錄雜湊名（~/.claude/projects/<slug>）—— 由專案絕對路徑把
  // 非英數字元逐一換成 '-' 推導而來，因此內含使用者名稱與完整路徑。
  // 必須在 ${USER_HOME} 規則之前處理：它不含 '${USER_HOME}' 的字面形式，
  // 後者的規則抓不到（2026-08-08 實測 4 檔漏網，其中 log-session.js /
  // import-conversations.js 是把它硬編碼成常數 —— 異機不換就會讀錯目錄）。
  [/${PROJECT_SLUG}/g, '${PROJECT_SLUG}'],
  [/C:[\\/]+Users[\\/]+Alan/gi, '${USER_HOME}'],
  [/after\.future1229@gmail\.com/gi, '${USER_EMAIL}'],
  [/\bAfter1229\b/g, '${TEST_PASSWORD}'],
  [/\bCynthia1070711\b/g, '${GIT_USER}'],
];

// ── 業務內容通用化（2026-08-08 使用者裁定）──────────────────────
// 前台方案帳號、後台 RBAC 角色帳號、測試密碼、src/ 業務程式碼路徑
// **不做佔位脫敏**（佔位= 還原時填回，等於保留了業務結構），
// 改為就地代換成通用假值 —— 開源包裡看不到任何產品資訊，也不需要還原端填值。
//
// 為何不直接整檔排除：被命中的多數是機制核心（pre-prompt-rag.js / 憲政 rules /
// 品質守衛腳本），它們只是「舉例時用了真實路徑或帳號」。丟掉機制去換乾淨並不划算；
// 內容主體即業務資訊的檔案另由 FILE_DENY 與 Skill 白名單排除。
const GENERALIZE = [
  [/src[\\/]PhyCool\.Platform[\\/]PhyCool\.Web/g, 'src/YourApp/Web'],
  [/src[\\/]PhyCool\.Platform/g, 'src/YourApp'],
  [/\bA([1-5])@gmail\.com\b/g, (_m, n) => `user${n}@example.com`],
  [/\bafter@phycool\.local\b/gi, 'owner@example.local'],
  [/\b(super|finance|operator|support)@phycool\.local\b/gi, (_m, r) => `${r.toLowerCase()}@example.local`],
  [/\badmin-test-(super|cs|finance|operator)@phycool\.com\b/gi, (_m, r) => `admin-${r.toLowerCase()}@example.com`],
  [/\bAfter1229\b/g, 'ExamplePw123'],
  [/after\.future1229@gmail\.com/gi, 'dev@example.com'],
  [/\bCynthia1070711\b/g, 'your-git-user'],
];

// 內容主體即產品業務資訊 —— 通用化後仍是產品規格，整檔不打包
const FILE_DENY = new Set([
  'canvas-layout-invariants.md',   // 04 章自標「🔴 業務專屬：Canvas 佈局不變量」
]);

// 通用化後仍命中即為漏網，視為 BUG 擋下（最後防線，正常應為 0 檔）
const FORBIDDEN_PATTERNS = [
  ['前台方案帳號', /\bA[1-5]@gmail\.com\b/],
  ['後台管理帳號', /[\w.\-]+@phycool\.(local|com)\b/],
  ['測試密碼', /\bAfter1229\b/],
  ['維運者 Email', /after\.future1229@gmail\.com/i],
  ['Git 帳號', /\bCynthia1070711\b/],
  ['src 業務程式碼路徑', /src[\\/]PhyCool\.Platform/],
];

// ── 通用 Skill 白名單（🟢 可直接開源 + 🟡 可轉通用）───────────────
// 依 00-開發環境架構清單.md §5.1 分級；業務專屬 phycool-* 與 generated/ 不納入
// 使用者裁定 2026-08-08：phycool 識別名（MCP server 名 / DB 檔名 / skill 目錄名）保留，
// 只清業務資料 —— 識別名改動會連動 .mcp.json 註冊與全部 mcp__phycool-context__* 引用。
const SKILL_ALLOWLIST = [
  // 工作流方法論
  'multi-track-orchestration', 'party-to-pipeline', 'pipeline-subwindow', 'pipeline-window-control',
  'receiving-code-review', 'smart-review-fix', 'tasks-backfill-verify', 'bug-fix-verification',
  'story-status-emoji', 'sdd-spec-generator', 'report-paradigm', 'module-conformance-loop',
  'full-module-qa-loop', 'edge-case-hunter',
  // 開發紀律
  'constitutional-standard', 'systematic-debugging', 'verification-before-completion',
  'tdd-workflow', 'security-review', 'claude-token-decrease', 'tianji-pavilion',
  // 環境建構工具
  'skill-builder', 'saas-to-skill', 'cc-config-author', 'hooks-mechanization', 'claude-tools',
  'save-to-memory', 'branch-merge', 'worktree-manager', 'start-servers', 'autorun-e2e',
  // 外部蒸餾
  'ui-ux-pro-max', 'office-tools', 'cloud-backend-patterns', 'chrome-connect-real-browser',
  'ecc-instincts', 'ecc-haiku-dispatch',
  // GitNexus 子技能組（6 個：exploring / impact-analysis / debugging / refactoring / pr-review / cli / guide）
  // 目錄本身即容器，copyTree 遞迴涵蓋全部子技能
  'gitnexus',
  // 可轉通用的基礎設施類 phycool-*
  'phycool-context-memory', 'phycool-debt-registry', 'phycool-intentional-decisions',
  'phycool-retrieval-refresh', 'phycool-ctrl-channel', 'phycool-create-story-depth-gate',
  'phycool-doc-sync', 'phycool-mcp-discipline',
  'phycool-windows-ps-encoding', 'phycool-error-handling', 'phycool-otel-micro-collector',
];

// 2026-08-08 使用者裁定移出白名單 —— 這些 Skill 的內容主體即產品業務資訊，
// 逐檔清理後不會剩下可用的方法論，整個排除比殘缺打包誠實：
//   phycool-chrome-mcp-login-sop  SKILL.md 主體就是前後台帳號矩陣與登入 SOP（42 處）
//   phycool-review-analyst        e2e 模式與帳號矩陣散佈 10 檔（68 處）
//   phycool-testing-patterns      fixture 與 CI 帳號綁定專案結構（52 處）
//   phycool-e2e-playwright        頁面/帳號/流程全綁產品（31 處）
//   phycool-integration-testing   SKILL.md 23 處 src/ 業務程式碼路徑
// 若日後要開源測試方法論，應另寫不含產品資訊的通用版，而非從這些檔清理。

// ── 專案根 scripts/ 白名單（機制本體，非業務）────────────────────
// 判準：被 settings.json / rules / 部署文檔直接引用，或為環境機制的一部分。
// 業務腳本（check-admin-css / check-csp-* / generate_icons / eft-* / edf-* …）一律不納入。
const ROOT_SCRIPT_ALLOWLIST = new Set([
  // OTel 可觀測性（settings.json SessionStart/SessionEnd 直接引用）
  'otel-micro-collector.js', 'otel-auto-start.js', 'otel-session-aggregate.js', 'start-main-otel.ps1',
  // Pipeline（statusLine 設定 + phaseModelMapping SSoT + 配額/復原/計量）
  'pipeline-statusline.cjs', 'pipeline-config.json', 'pipeline-quota-check.js',
  'pipeline-recovery.js', 'pipeline-log-tokens.js', 'record-phase-timestamp.js',
  // 檔案鎖並行控制（settings.json PreToolUse/PostToolUse 直接引用）
  'file-lock-check.ps1', 'file-lock-acquire.ps1', 'file-lock-release.ps1',
  // 品質守衛（traditional-chinese-discipline 等 rule 明文要求）
  'check-traditional-chinese.cjs', 'check-tc-exemptions.json', 'check-ps-encoding.cjs',
  'check-test-baseline.cjs', 'check-frozen-refs.cjs', 'check-hygiene.ps1',
  // 稽核工具
  'audit-capability-reachability.cjs', 'audit-skill-overlap.cjs',
  'audit-phase-model-mapping.cjs', 'audit-model-string-drift.cjs',
  // 部署與驗證（09-打包與部署 §10 還原步驟 8 直接引用）
  'verify-deployment-docs.cjs', 'deploy-context-db.ps1', 'sanitize-tool-verify.cjs',
  'verify-package-sanitization.cjs',   // 開源推送前的業務內容禁入閘門
  // 環境維運（install-devenv 是 sync 的反向還原，缺它則 ${PROJECT_ROOT} 佔位無法復原）
  // 2026-08-08 移除 pre-compact-snapshot.ps1：settings.json 零引用（PreCompact 實際掛
  // precompact-tool-preprune.js + log-session.js），且它讀取 sprint-status.yaml（2026-07-28 已凍結，
  // 狀態改存 DB）—— 僵屍腳本不進開源包。
  'sync-config-templates.cjs', 'install-devenv.cjs',
  'token-cache-health-advisor.cjs', 'context-mode-analysis.cjs', 'generate-db-schema-doc.cjs',
  'pack-portable-skills.ps1',
  // 批次與 Epic 編排
  'batch-audit.ps1', 'batch-runner.ps1', 'epic-auto-pilot.ps1', 'story-pipeline.ps1',
  'sync-epic-readme.ps1',
]);

// ── .context-db/scripts 業務資料排除清單 ─────────────────────────
// 這些不是機制，是 PhyCool 專案的實際歷史內容或一次性維運腳本。
// 2026-08-08 實測密度：seed-data 90 處 / memory-to-idd-migration 68 處 PhyCool 業務字樣。
const DB_SCRIPT_DENY = new Set([
  'seed-data.js',                 // 「從專案真實歷史萃取」的 context_entries/tech_entries 種子
  'memory-to-idd-migration.js',   // 專案 memory → IDD 遷移，內含實際 IDD 決策內容
  'update-edf14-tasks.js',        // 一次性 Story 任務更新
  'debt-layer5-alan-review.js',   // 檔名即含維運者姓名
  'group-findings-to-stories.js', // 專案 CR findings 對 Story 的實際對應
]);

// ── 同步任務 ────────────────────────────────────────────────────
const TASKS = [
  { label: 'rules',    src: '.claude/rules',    dst: 'claude/rules',    filter: f => f.endsWith('.md') },
  { label: 'agents',   src: '.claude/agents',   dst: 'claude/agents',   filter: f => f.endsWith('.md') },
  { label: 'commands', src: '.claude/commands', dst: 'claude/commands', filter: f => f.endsWith('.md') },
  {
    label: 'hooks', src: '.claude/hooks', dst: 'claude/hooks',
    filter: f => (f.endsWith('.js') || f.endsWith('.cjs')) && !f.includes('.test.'),
  },
  // ★ settings.json —— 67 個 hook 掛載點的唯一定義處。
  // 缺這一份，56 個 hook 檔到了異機一個都不會被觸發（12 層 RAG 注入 / 對話寫入 DB /
  // 違規偵測 / ECC 湧現 / 20 個 PreToolUse 守衛全部沉默）。
  // 內含 67 行絕對路徑，由 SANITIZE 轉為 ${PROJECT_ROOT}，還原時需替換。
  {
    label: 'claude-settings', src: '.claude', dst: 'claude',
    filter: f => f === 'settings.json',
    rename: f => f + '.template',
  },
  {
    label: 'db-scripts', src: '.context-db/scripts', dst: 'context-db/scripts',
    filter: f => (f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs'))
      && !f.includes('.test.') && !f.startsWith('_') && !f.startsWith('tmp-') && !f.startsWith('r5-')
      && !f.startsWith('r6-') && !f.startsWith('edf') && !DB_SCRIPT_DENY.has(f)
      // backfill-doc-embeddings 是檢索重建鏈路第 5 步的正式腳本，不是一次性回填
      && (!f.startsWith('backfill-') || f === 'backfill-doc-embeddings.js'),
    // prune 用寬鬆條件：來源端被 filter 濾掉的檔（r5-/r6-/backfill-…）若已存在於目標端，
    // 嚴格 filter 會讓它在 prune 掃描時同樣被濾掉而永遠清不掉。
    // （2026-08-08 實測 r6-deep-enrichment.js 殘留含 2 處測試密碼，即此盲區）
    pruneFilter: f => /\.(js|cjs|mjs)$/.test(f),
  },
  { label: 'db-migrations', src: '.context-db/migrations', dst: 'context-db/migrations', filter: f => f.endsWith('.sql') },
  // Workflow Contract 測試（bwu3/bwu7/bwu13 + workflow-precheck + workflow-invoked-detect）
  // 05-工作流 §6.2.7 列為機械守衛，§6.5 驗證指令直接引用。
  // debt-layer5.test.js 排除：其受測對象 debt-layer5-alan-review.js 在 DB_SCRIPT_DENY 內，
  // 打包後 require 不到會直接紅燈（測試與受測對象必須同進同出）。
  {
    label: 'db-tests', src: '.context-db/tests', dst: 'context-db/tests',
    filter: f => (f.endsWith('.test.js') || f.endsWith('.test.cjs')) && f !== 'debt-layer5.test.js',
    pruneFilter: f => /\.test\.(js|cjs)$/.test(f),
  },
  {
    label: 'pipeline-scripts', src: '.claude/skills/party-to-pipeline/scripts',
    dst: 'party-to-pipeline/scripts',
    // .json 納入：workers-mcp.json 是子視窗的 MCP 設定，缺了 worker 起不了 MCP
    filter: f => f.endsWith('.ps1') || f.endsWith('.md') || f.endsWith('.json'),
  },
  // 專案根 scripts/ — 白名單機制腳本
  // pruneFilter 用寬鬆條件：白名單移除某檔後，嚴格 filter 會讓它在 prune 掃描時同樣被濾掉，
  // 目標端的舊副本便永遠清不掉（與 db-scripts 同型盲區，2026-08-08 移除拆分工具時再次踩到）
  {
    label: 'root-scripts', src: 'scripts', dst: 'scripts',
    filter: f => ROOT_SCRIPT_ALLOWLIST.has(f),
    pruneFilter: f => /\.(cjs|js|ps1|json|mjs)$/.test(f),
  },
  // MCP server 本體（36 tools）
  { label: 'db-server', src: '.context-db', dst: 'context-db', filter: f => f === 'server.js' || f === 'package.json' || f === 'vitest.config.js' },
];

// DevConsole Web UI（22 頁面 / 25 API route）— 遞迴，排除 node_modules / dist
const DEVCONSOLE = {
  src: 'tools/dev-console',
  dst: 'dev-console',
  skipDirs: new Set(['node_modules', 'dist', '.vite']),
  // .env.example 納入：異機部署需要它才知道該設哪些環境變數
  fileOk: f => (/\.(ts|tsx|css|json|html)$/.test(f) || f === '.env.example') && f !== 'package-lock.json',
};

// ── 工具函式 ────────────────────────────────────────────────────
function sanitize(text) {
  let out = text;
  for (const [re, rep] of SANITIZE) out = out.replace(re, rep);
  return out;
}

function listFiles(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => {
    const p = path.join(dir, f);
    return fs.statSync(p).isFile() && filter(f);
  });
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const stats = { added: 0, updated: 0, same: 0, pruned: 0, sanitized: 0, blocked: 0, generalized: 0, bomStripped: 0 };
const log = [];
const blockedFiles = [];   // 含禁入業務內容而未打包的檔

// 內容守衛：任一 FORBIDDEN_PATTERNS 命中即不打包。
// 用內容判定而非檔名黑名單 —— 黑名單會隨檔案新增而漏，內容判定不會。
// 機制核心檔若被擋，代表該檔真的引用了業務內容，應清理其引用而非放行。
function forbiddenHit(text) {
  for (const [name, re] of FORBIDDEN_PATTERNS) if (re.test(text)) return name;
  return null;
}

function syncFile(srcPath, dstPath, rel) {
  const raw = fs.readFileSync(srcPath, 'utf8');

  // 1. 整檔禁入（內容主體即產品業務資訊）
  // 2. 業務內容通用化 → 3. 路徑脫敏 → 4. 最後防線：仍命中即為漏網，擋下
  const base = path.basename(srcPath);
  let hit = FILE_DENY.has(base) ? '業務專屬檔' : null;
  let clean = raw;
  if (!hit) {
    let generalized = raw;
    for (const [re, rep] of GENERALIZE) generalized = generalized.replace(re, rep);
    if (generalized !== raw) stats.generalized++;
    clean = sanitize(generalized);
    if (clean !== generalized) stats.sanitized++;
    // .md/.json/.yaml 剝除 UTF-8 BOM（對齊 crlf-normalize-discipline.md §8.2：
    // 這幾類為 No-BOM 標準，BOM 會讓 markdown parser 與 frontmatter 偵測誤判）。
    // .ps1/.cs 反之必須保留 BOM（PowerShell 5.1 無 BOM 讀繁中會亂碼），故不納入。
    if (/\.(md|json|ya?ml)$/i.test(srcPath) && clean.charCodeAt(0) === 0xFEFF) {
      clean = clean.slice(1);
      stats.bomStripped++;
    }
    hit = forbiddenHit(clean);
  }
  if (hit) {
    stats.blocked++;
    blockedFiles.push([rel, hit]);
    // 目標端若有舊版殘留，一併清掉（先前版本可能已打包過）
    if (APPLY && fs.existsSync(dstPath)) fs.unlinkSync(dstPath);
    return;
  }

  const exists = fs.existsSync(dstPath);
  const old = exists ? fs.readFileSync(dstPath, 'utf8') : null;

  if (!exists) {
    stats.added++;
    log.push('  + ' + rel);
    if (APPLY) { ensureDir(path.dirname(dstPath)); fs.writeFileSync(dstPath, clean, 'utf8'); }
  } else if (old !== clean) {
    stats.updated++;
    log.push('  ~ ' + rel);
    if (APPLY) fs.writeFileSync(dstPath, clean, 'utf8');
  } else {
    stats.same++;
  }
}

// ── 主流程 ──────────────────────────────────────────────────────
console.log('sync-config-templates ' + (APPLY ? '[APPLY]' : '[DRY-RUN]') + (PRUNE ? ' [PRUNE]' : ''));
console.log('  來源: ' + ROOT);
console.log('  目標: ' + TPL);

for (const t of TASKS) {
  const srcDir = path.join(ROOT, t.src);
  const dstDir = path.join(TPL, t.dst);
  const srcFiles = listFiles(srcDir, t.filter);
  const nameOf = t.rename || (f => f);

  log.push('\n[' + t.label + '] ' + t.src + ' -> ' + t.dst + '  (' + srcFiles.length + ' 檔)');

  for (const f of srcFiles) syncFile(path.join(srcDir, f), path.join(dstDir, nameOf(f)), t.label + '/' + nameOf(f));

  if (PRUNE && fs.existsSync(dstDir)) {
    const keep = new Set(srcFiles.map(nameOf));
    for (const f of listFiles(dstDir, t.pruneFilter || t.filter)) {
      if (!keep.has(f)) {
        stats.pruned++;
        log.push('  - ' + t.label + '/' + f + '   ← 專案已無此檔或不在白名單（過時鏡像）');
        if (APPLY) fs.unlinkSync(path.join(dstDir, f));
      }
    }
  }
}

// ── Skills（白名單，含子目錄遞迴）────────────────────────────────
const skillSrcRoot = path.join(ROOT, '.claude/skills');
const skillDstRoot = path.join(TPL, 'claude/skills');
log.push('\n[skills] 白名單 ' + SKILL_ALLOWLIST.length + ' 個');

function copyTree(src, dst, rel) {
  for (const f of fs.readdirSync(src)) {
    const sp = path.join(src, f);
    const dp = path.join(dst, f);
    if (fs.statSync(sp).isDirectory()) { copyTree(sp, dp, rel + '/' + f); continue; }
    if (/\.(png|jpg|jpeg|gif|zip|db)$/i.test(f)) continue;   // 二進位不脫敏、不打包
    syncFile(sp, dp, rel + '/' + f);
  }
}

let skillMissing = [];
for (const s of SKILL_ALLOWLIST) {
  const sp = path.join(skillSrcRoot, s);
  if (!fs.existsSync(sp)) { skillMissing.push(s); continue; }
  copyTree(sp, path.join(skillDstRoot, s), 'skills/' + s);
}

// Skill 目錄 prune 只報告不自動刪：fs.rmSync({recursive:true}) 在本環境（Windows + Node）
// 對已同步過的深層目錄會觸發 0xC0000409 STATUS_STACK_BUFFER_OVERRUN 讓行程直接崩潰
// （2026-08-07 實測，exit -1073740791，統計輸出全遺失）。Skill 退役頻率極低，
// 由人工刪除即可，不值得為此讓整支腳本承擔崩潰風險。
if (PRUNE && fs.existsSync(skillDstRoot)) {
  const allow = new Set(SKILL_ALLOWLIST);
  for (const d of fs.readdirSync(skillDstRoot)) {
    // 只檢查目錄 —— skills/ 下也放人工維護的說明檔（如 _EXCLUDED-SKILLS.md），
    // 它們不是 Skill，不該被當成「不在白名單的 Skill 目錄」報告
    if (!fs.statSync(path.join(skillDstRoot, d)).isDirectory()) continue;
    if (!allow.has(d)) {
      stats.pruned++;
      log.push('  - skills/' + d + '   ← 不在白名單，請手動刪除（業務專屬或已 RETIRED）');
    }
  }
}

// ── DevConsole Web UI ───────────────────────────────────────────
const dcSrc = path.join(ROOT, DEVCONSOLE.src);
const dcDst = path.join(TPL, DEVCONSOLE.dst);
let dcCount = 0;

function copyDevConsole(src, dst, rel) {
  for (const f of fs.readdirSync(src)) {
    const sp = path.join(src, f);
    if (fs.statSync(sp).isDirectory()) {
      if (DEVCONSOLE.skipDirs.has(f)) continue;
      copyDevConsole(sp, path.join(dst, f), rel + '/' + f);
      continue;
    }
    if (!DEVCONSOLE.fileOk(f)) continue;
    dcCount++;
    syncFile(sp, path.join(dst, f), 'dev-console' + rel + '/' + f);
  }
}

if (fs.existsSync(dcSrc)) {
  const before = log.length;
  copyDevConsole(dcSrc, dcDst, '');
  log.splice(before, 0, '\n[dev-console] ' + DEVCONSOLE.src + ' -> ' + DEVCONSOLE.dst + '  (' + dcCount + ' 檔)');
}

// ── BMAD 客製化覆蓋層 ───────────────────────────────────────────
// 實際 _bmad/bmm/workflows/4-implementation 是本專案改寫過的 workflow（DB-first Story /
// Depth Gate / tasks-backfill 等客製），使用者裝完官方 BMAD 後要用這批覆蓋。
// 注意 dst 基底是 DOCROOT 不是 TPL —— bmad-overlay/ 位於 1.專案部屬必讀/ 下，
// 與 config-templates/ 平級（2026-08-07 首版誤用 TPL，導致寫進 config-templates/bmad-overlay/
// 新位置、既有 bmad-overlay/ 一個字沒更新，複驗 60 檔仍漂移才發現）。
const bmadSrc = path.join(ROOT, '_bmad/bmm/workflows/4-implementation');
const bmadDst = path.join(DOCROOT, 'bmad-overlay/4-implementation');
if (fs.existsSync(bmadSrc)) {
  const before = log.length;
  const n0 = stats.added + stats.updated + stats.same;
  copyTree(bmadSrc, bmadDst, 'bmad-overlay');
  const n = stats.added + stats.updated + stats.same - n0;
  log.splice(before, 0, '\n[bmad-overlay] _bmad/bmm/workflows/4-implementation -> bmad-overlay/4-implementation  (' + n + ' 檔)');
}

console.log(log.join('\n'));

if (skillMissing.length) {
  console.log('\n⚠ 白名單中找不到的 Skill（可能已更名或退役）: ' + skillMissing.join(', '));
}

if (blockedFiles.length) {
  console.log('\n───────── 業務內容禁入（未打包）─────────');
  const byCat = new Map();
  for (const [rel, cat] of blockedFiles) {
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(rel);
  }
  for (const [cat, files] of [...byCat].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  【${cat}】 ${files.length} 檔`);
    for (const f of files) console.log('    ⛔ ' + f);
  }
  console.log('\n  ↑ 機制核心檔若出現在此，代表它引用了業務內容 —— 請清理該引用後重跑，');
  console.log('    不要放行，否則開源包會帶出產品資訊。');
}

console.log('\n───────── 統計 ─────────');
console.log('  新增   ' + stats.added);
console.log('  更新   ' + stats.updated);
console.log('  相同   ' + stats.same);
console.log('  刪除   ' + stats.pruned + (PRUNE ? '' : '（--no-prune 未執行）'));
console.log('  通用化 ' + stats.generalized + ' 檔的業務引用（帳號/密碼/src 路徑）已代換為 example 通用值');
console.log('  禁入   ' + stats.blocked + ' 檔（業務專屬或通用化後仍殘留）已排除');
console.log('  脫敏   ' + stats.sanitized + ' 檔含專案路徑，已替換為 ${PROJECT_ROOT}/${USER_HOME}');
if (!APPLY) console.log('\n（dry-run，未寫入。加 --apply 實際執行）');
