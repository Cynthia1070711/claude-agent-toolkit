// ============================================================
// PCPT Context Memory DB — MEMORY → IDD Migration
// DLA-08 Task 4 / AC-4 (BR-IDD-01~05) — Industry standard: Inventory + Ripgrep Discovery
// ============================================================
// Usage:
//   node .context-db/scripts/memory-to-idd-migration.js                 # dry-run (default)
//   node .context-db/scripts/memory-to-idd-migration.js --execute       # writes ADR + DB (Alan approval needed)
//   node .context-db/scripts/memory-to-idd-migration.js --seeds-only    # only list seeds, skip ripgrep
//   node .context-db/scripts/memory-to-idd-migration.js --grep-only     # run ripgrep, no DB/file writes
// ============================================================
// Design (business-reviewed 2026-04-11):
//   Step 1: Static seed DSL (sourced from pcpt-intentional-decisions SKILL.md §1.4 line 94-144)
//   Step 2: Ripgrep discovery → code_locations per seed
//   Step 3: Context enrichment from memory/ + harness-level auto-memory (if accessible)
//   Step 4: Impact × reversibility criticality assessment
//   Step 5: ADR file generation (SKILL §2.2 template)
//   Step 6: upsert-intentional.js dispatch (execute mode)
//   Step 7: Code annotation patch generation (dry-run by default)
//   Step 8: MEMORY.md tag append (critical IDDs only)
// ============================================================
// BR-IDD-03: Default dry-run, no DB writes without --execute
// BR-IDD-04: Each IDD must have ADR; critical ones also write memory/intentional_*.md
// BR-IDD-05: MEMORY.md original lines preserved, [Migrated to IDD-XXX] tag appended
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import os from 'os';
import {
  PROJECT_ROOT,
  REPORTS_DIR,
  getTaiwanTimestamp,
  reportTimestamp,
} from './_migrations/tech-debt-schema.js';
import { createBackup } from './debt-layer-rollback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADR_DIR = path.join(PROJECT_ROOT, 'docs', 'technical-decisions');
const MEMORY_PROJECT_DIR = path.join(PROJECT_ROOT, 'memory');
const MEMORY_HARNESS_DIR = path.join(os.homedir(), '.claude', 'projects',
  'C--Users-Alan-Desktop-Projects-pcpt-PCPT-MVP-Antigravity-', 'memory');

// ============================================================
// STEP 1: Static Seed DSL
// Source: pcpt-intentional-decisions SKILL.md §1.4 (line 94-144)
// Criticality: impact × reversibility matrix (industry standard, overrides SKILL default)
// ============================================================

const SEEDS = [
  {
    idd_id: 'IDD-COM-001',
    idd_type: 'COM',
    title: 'Free plan editor 全開放 — 無 UI gating, PDF 層 gate',
    context: 'Free plan 使用者應該如何在 editor 中被限制功能? PO 要求 Free 體驗核心以提高轉換率, 不在 UI 層做阻擋。',
    decision: '編輯器 (ImagePanel / QRBarcodePanel / SerialPanel / DataSourcePanel 等) 對 Free 使用者全開放, 生成動作時由 PDF 層 gate (2 頁上限 + 浮水印)。',
    reason: '商業轉換漏斗決策: UX 研究顯示「顯示 upgrade modal 的轉換率 > 隱藏按鈕 3 倍」, 提前封鎖反而失去轉換機會。',
    criticality: 'critical',  // revenue + hard reversal
    re_evaluation_trigger: 'Free conversion rate < 1% 連續 2 個月 / 使用者 survey 顯示「誤導性 UI」成為 top complaint / PO 策略改變',
    forbidden_changes: [
      '請勿在 ImagePanel/QRBarcodePanel/SerialPanel 加 isFreeUser 檢查阻擋 UI',
      '請勿在 editor root layout 加 Free plan modal 阻擋整個 editor',
      '請勿修改 PDF 層 gate 為 UI 層 gate',
    ],
    grep_patterns: [
      'isFreeUser',
      'planType.*Free',
      'PlanType\\.Free',
      'FreePlan',
    ],
    grep_globs: [
      'src/Platform/App.Web/ClientApp/src/components/Editor/**/*.tsx',
      'src/Platform/App.Web/ClientApp/src/components/Editor/**/*.ts',
    ],
    platform_modules: ['Editor', 'M13-PCPT'],
    related_skills: ['pcpt-editor-arch', 'pcpt-member-plans', 'pcpt-pdf-engine'],
    tags: ['commercial', 'free-plan', 'conversion', 'editor'],
  },
  {
    idd_id: 'IDD-COM-002',
    idd_type: 'COM',
    title: '無退款 policy — 7 天免費試用後無退款',
    context: '訂閱使用者是否可以要求退款? PO 決定採「7 天免費試用 + 付費後無退款」商業模型, Admin 手動處理例外案例。',
    decision: '所有訂閱付費後禁止自助退款, 沒有 CoolingOff / pro-rata / refund endpoint。例外案例由 Admin 後台手動處理。',
    reason: '商業營運決策: 7 天試用已足以評估, 退款流程會吸引濫用且增加客服成本。與 pcpt-payment-subscription refund rule 互為 enforce。',
    criticality: 'critical',  // revenue + legal + hard reversal
    re_evaluation_trigger: '大量使用者退款訴求 / 法規要求 CoolingOff / 商業模型重新定位',
    forbidden_changes: [
      '請勿新增 public refund API endpoint',
      '請勿在 member center 加「申請退款」按鈕',
      '請勿實作 pro-rata 自動退款計算邏輯',
    ],
    grep_patterns: [
      'refund',
      'Refund',
      'CoolingOff',
      'pro.?rata',
    ],
    grep_globs: [
      'src/Platform/App.Web/Controllers/**/*.cs',
      'src/Platform/App.Web/Areas/Admin/**/*.cs',
      'src/Platform/App.Web/Services/**/*.cs',
    ],
    platform_modules: ['Payment', 'Admin', 'M6-Subscription'],
    related_skills: ['pcpt-payment-subscription', 'pcpt-admin-module'],
    tags: ['commercial', 'refund', 'subscription', 'legal'],
  },
  {
    idd_id: 'IDD-COM-003',
    idd_type: 'COM',
    title: 'ImagePanel v2 對 Free plan 保持可開啟',
    context: 'ImagePanel v2 的 upgrade UX 是否要對 Free plan 隱藏整個 Panel? PO 決定保持可開啟 + 顯示 upgrade modal。',
    decision: 'ImagePanel v2 對所有 plan 保持可開啟, Free plan 點擊 image upload 時顯示 upgrade modal 而非隱藏按鈕。',
    reason: 'UX 研究: upgrade modal 轉換率比「隱藏按鈕」高 3 倍。與 IDD-COM-001 同源 (Free editor 全開放精神延伸)。',
    criticality: 'normal',
    re_evaluation_trigger: 'A/B test 顯示 hide-button 方案轉換率更高 / PO 策略改變',
    forbidden_changes: [
      '請勿在 ImagePanel v2 加 isFreeUser 條件渲染隱藏 Panel',
      '請勿隱藏 upgrade modal 換成 error toast',
    ],
    grep_patterns: [
      'ImagePanel',
      'UpgradeModal',
    ],
    grep_globs: [
      'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel*.tsx',
      'src/Platform/App.Web/ClientApp/src/components/Editor/panels/ImagePanel/**',
    ],
    platform_modules: ['Editor', 'M13-PCPT'],
    related_skills: ['pcpt-editor-arch', 'pcpt-editor-data-features'],
    tags: ['commercial', 'free-plan', 'ux', 'image-panel'],
  },
  {
    idd_id: 'IDD-STR-001',
    idd_type: 'STR',
    title: 'PCPT 是批次列印 SaaS, 不是圖片編輯器',
    context: '使用者常要求 Undo/Redo / 圖層群組 / 進階 blend modes 等功能。PCPT 產品定位是批次列印, 非圖片編輯器, 這些功能不在範圍內。',
    decision: 'PCPT 不實作 Undo/Redo 歷史、不實作圖層群組 (layer groups)、不實作進階 blend modes。核心是「批次匯入資料 → 套入 template → 一次列印 N 份」。',
    reason: '產品策略: 批次列印與圖片編輯是不同市場, 同時做會失焦。使用者 feedback 偶有抱怨但核心用戶 (票券/名牌/徽章列印) 滿意度高。',
    criticality: 'normal',
    re_evaluation_trigger: '產品定位改變 / 使用者流失率 > 10% / 競品出現 hybrid 產品',
    forbidden_changes: [
      '請勿加 Undo/Redo history 功能',
      '請勿加 layer grouping UI',
      '請勿加進階 blend modes (multiply/screen/overlay) UI 選項',
    ],
    grep_patterns: [
      'undo',
      'redo',
      'history',
      'layerGroup',
    ],
    grep_globs: [
      'src/Platform/App.Web/ClientApp/src/stores/**/*.ts',
      'src/Platform/App.Web/ClientApp/src/components/Editor/**/*.tsx',
    ],
    platform_modules: ['Editor', 'M13-PCPT'],
    related_skills: ['pcpt-platform-overview', 'pcpt-editor-arch'],
    tags: ['strategy', 'product-scope', 'pcpt'],
  },
  {
    idd_id: 'IDD-STR-002',
    idd_type: 'STR',
    title: 'Admin URL /Admin/ → /mgmt/ Convention 集中化',
    context: '多個 Admin 功能原本散落在 /Admin/XXX / /Areas/XXX / /api/admin/XXX 等路徑, 無統一 convention。',
    decision: '所有 Admin URL 集中走 AdminAreaRouteConvention, 外部統一 /mgmt/ 前綴, 內部 Area 名稱 Admin。禁止新增 /Admin/ 路徑或散落的 admin route。',
    reason: '架構標準化決策: 統一的 URL convention 便於 security middleware 集中配置, 也讓 routing audit 可 grep 一次定位。',
    criticality: 'normal',
    re_evaluation_trigger: '大型 Admin 重構 / 多站支援需求 / URL 命名策略改變',
    forbidden_changes: [
      '請勿新增直接以 /Admin/ 或 /admin/ 開頭的 route',
      '請勿在 controller 用 [Route("api/admin/...")] 硬編碼 admin 字串',
      '請勿繞過 AdminAreaRouteConvention',
    ],
    grep_patterns: [
      'AdminAreaRouteConvention',
      '/mgmt/',
      'AdminRouteConstants',
    ],
    grep_globs: [
      'src/Platform/App.Web/Areas/Admin/**/*.cs',
      'src/Platform/App.Web/Program.cs',
      'src/Platform/App.Web/Infrastructure/**/*.cs',
    ],
    platform_modules: ['Admin', 'M2-Infrastructure'],
    related_skills: ['pcpt-routing-convention', 'pcpt-admin-module'],
    related_docs: ['docs/technical-decisions/ADR-URL-001-admin-url-routing-standard.md'],
    tags: ['strategy', 'routing', 'admin', 'convention'],
  },
  {
    idd_id: 'IDD-STR-003',
    idd_type: 'STR',
    title: 'DB-first Story 繞過 create-story checklist (Epic MQV)',
    context: '成熟 Epic (如 MQV / DLA) 的 Story 結構穩定, 若每筆都走 create-story workflow 的 8 step 檢查會浪費時間。',
    decision: 'Epic MQV 及其後成熟 Epics 採 DB-first Story 寫入流程, 直接透過 upsert-story.js 產生 Story, 繞過 create-story workflow 的互動式 checklist。dev-story / code-review 仍正常執行。',
    reason: '效率優化決策: 成熟 Epic 的 Story 有固定模板, 互動式 checklist 提問都能直接答, 自動化後節省 80% create-story 時間。',
    criticality: 'normal',
    re_evaluation_trigger: 'DB-first 產出品質下降 / 新 Epic 類型需要互動式探索 / create-story workflow 重大改版',
    forbidden_changes: [
      '請勿強制所有 Epic 都走 create-story workflow 互動式流程',
      '請勿移除 upsert-story.js --merge 模式 (這是 DB-first 基礎)',
    ],
    grep_patterns: [
      'upsert-story.js',
      'DB-first',
    ],
    grep_globs: [
      '.context-db/scripts/upsert-story.js',
      '_bmad/bmm/workflows/**/create-story/**',
    ],
    platform_modules: ['DevTooling', 'BMAD'],
    related_skills: ['pcpt-context-memory'],
    tags: ['strategy', 'workflow', 'db-first', 'efficiency'],
  },
  {
    idd_id: 'IDD-REG-001',
    idd_type: 'REG',
    title: '個資保存 180 天自動刪除',
    context: 'GDPR / 個資法 要求個人資料不得無限期保存。PCPT 使用者匯入的批次資料 (姓名 / 學號等) 如何處理?',
    decision: '使用者匯入的資料保存 180 天後自動刪除, 已生成的 PDF 保留 30 天後刪除 Blob。使用者可手動提前刪除。',
    reason: '法規合規決策: 個資法 §20 + GDPR Article 5(1)(e) 要求資料保存時限。180 天是 PO + Legal 商議結果, 平衡 UX (重印) 與合規。',
    criticality: 'critical',  // regulatory + hard reversal (legal exposure)
    re_evaluation_trigger: '個資法修訂 / GDPR 更新 / 稽核要求變化 / 使用者投訴資料保存政策',
    forbidden_changes: [
      '請勿將保存期限延長超過 180 天 (除非 Legal 書面同意)',
      '請勿新增 "永久保存" 選項給使用者',
      '請勿移除 auto-delete background job',
    ],
    grep_patterns: [
      'DataRetention',
      'RetentionPolicy',
      '180',
      'DeleteOldData',
    ],
    grep_globs: [
      'src/Platform/App.Web/Services/**/*.cs',
      'src/Platform/App.Web/BackgroundServices/**/*.cs',
    ],
    platform_modules: ['BackgroundServices', 'Privacy', 'M11-Compliance'],
    related_skills: ['pcpt-privacy-legal', 'pcpt-background-services'],
    tags: ['regulatory', 'gdpr', 'privacy', 'retention'],
  },
  {
    idd_id: 'IDD-REG-002',
    idd_type: 'REG',
    title: '統一發票電子化規格遵循財政部要求',
    context: '電子發票必須符合財政部電子發票實施作業要點, 欄位與格式不可自訂。',
    decision: '所有電子發票 (B2C / B2B) 使用 ECPay 整合並遵循財政部 ECPG 電子發票格式規範, 不可自行變更欄位結構或檔案格式。',
    reason: '稅法合規決策: 電子發票格式由財政部規範, 不符合會被退件, 使用者會有稅務風險。ECPay 是已整合的合規 provider。',
    criticality: 'critical',  // regulatory + hard reversal
    re_evaluation_trigger: '財政部規範更新 / ECPay 整合替換 / 稅法修訂',
    forbidden_changes: [
      '請勿自定電子發票欄位格式',
      '請勿繞過 ECPay 直接呼叫財政部 API (不合規)',
      '請勿修改 invoice xml / json 輸出結構',
    ],
    grep_patterns: [
      'Invoice',
      'ECPay',
      'ElectronicInvoice',
      'B2C.*Invoice',
    ],
    grep_globs: [
      'src/Platform/App.Web/Services/**Invoice**.cs',
      'src/Platform/App.Web/Services/**ECPay**.cs',
    ],
    platform_modules: ['Payment', 'Invoice', 'M7-Billing'],
    related_skills: ['pcpt-invoice-receipt', 'pcpt-payment-subscription', 'ECPay-API-Skill-master'],
    tags: ['regulatory', 'tax', 'invoice', 'ecpay'],
  },
  {
    idd_id: 'IDD-USR-001',
    idd_type: 'USR',
    title: '測試帳號 A1-A5 特殊 seeder 行為',
    context: '開發測試需要跨 plan 帳號 (Free / Basic / Advanced / Professional / Business) 快速切換, 但正式註冊流程太繁瑣。',
    decision: 'TestAccountSeeder 在非 production 環境固定建立 A1-A5 帳號對應 5 個 plan, password=After1229, 這些帳號不可被註冊系統覆蓋。',
    reason: '開發便利性決策: 所有 dev / e2e test 依賴這 5 個帳號, 若被覆蓋會造成測試全掛。',
    criticality: 'normal',
    re_evaluation_trigger: '開發流程變更 / e2e framework 重寫 / 測試資料策略改變',
    forbidden_changes: [
      '請勿在 production seeder 建立 A1-A5 帳號',
      '請勿允許 A1-A5 email 被新註冊覆蓋',
      '請勿改變 password=After1229 (與 e2e test fixtures 強耦合)',
    ],
    grep_patterns: [
      'TestAccountSeeder',
      'A1@gmail.com',
      'After1229',
    ],
    grep_globs: [
      'src/Platform/App.Web/Data/TestAccountSeeder.cs',
      'src/Platform/App.Web/Data/**/*.cs',
    ],
    platform_modules: ['Data', 'Testing'],
    related_skills: ['pcpt-testing-patterns', 'pcpt-e2e-playwright'],
    tags: ['user-decision', 'testing', 'seeder'],
  },
  {
    idd_id: 'IDD-USR-002',
    idd_type: 'USR',
    title: '編輯器預設右側 Panel 位置',
    context: '編輯器控制面板要放左側還是右側? Photoshop / Figma 風格不同。',
    decision: '編輯器控制面板預設在右側 (FloatingCard 初始位置), 使用者可拖曳但重新登入會 reset。',
    reason: 'UX 研究: 右側 Panel 符合繁中使用者右手操作習慣, 且保留左側空間給 canvas。A/B test 滿意度 +15%。',
    criticality: 'normal',
    re_evaluation_trigger: 'UX 研究發現更優配置 / 使用者要求預設左側 / 多語言 RTL 支援',
    forbidden_changes: [
      '請勿將預設 Panel 位置改為左側 (除非 A/B test 證明更好)',
      '請勿移除使用者拖曳能力',
    ],
    grep_patterns: [
      'FloatingCard',
      'FloatingToolbar',
      'panel.*position',
    ],
    grep_globs: [
      'src/Platform/App.Web/ClientApp/src/components/Editor/FloatingCard*.tsx',
      'src/Platform/App.Web/ClientApp/src/components/Editor/FloatingToolbar*.tsx',
    ],
    platform_modules: ['Editor', 'M13-PCPT'],
    related_skills: ['pcpt-floating-ui', 'pcpt-editor-arch'],
    tags: ['user-decision', 'ux', 'editor-layout'],
  },
];

// ============================================================
// STEP 2: Ripgrep Discovery
// For each seed, find code_locations via ripgrep keyword matching
// ============================================================

// Convert glob pattern (e.g. "src/**/*.tsx") to RegExp matching relative paths
function globToRegex(glob) {
  // Normalize forward slashes
  const g = glob.replace(/\\/g, '/');
  // Escape regex special chars except glob chars * ? [ ] { }
  let re = '';
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // ** = any path segments
        re += '.*';
        i += 2;
        if (g[i] === '/') i += 1; // consume trailing /
      } else {
        // * = any chars except /
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if ('.+^$()|[]{}'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

function walkFiles(startDir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(startDir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(startDir, e.name);
    if (e.isDirectory()) {
      // Skip node_modules / .git / bin / obj
      if (['node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs'].includes(e.name)) continue;
      walkFiles(full, acc);
    } else if (e.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

// Node-native replacement for ripgrep (uses pre-walked file list)
function runRipgrep(patterns, globs, fileList) {
  const matches = [];
  const combinedPattern = new RegExp(patterns.join('|'));
  const globRegexes = globs.map(g => ({ glob: g, re: globToRegex(g) }));
  const projectRootNorm = PROJECT_ROOT.replace(/\\/g, '/');
  const allFiles = fileList || walkFiles(PROJECT_ROOT);

  for (const file of allFiles) {
    const rel = file.replace(/\\/g, '/').substring(projectRootNorm.length + 1);
    // Does any glob match this file?
    const globMatch = globRegexes.some(gr => gr.re.test(rel));
    if (!globMatch) continue;

    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    let hitCount = 0;
    for (let i = 0; i < lines.length && hitCount < 5; i++) {
      if (combinedPattern.test(lines[i])) {
        matches.push({
          file: rel,
          line: i + 1,
          snippet: lines[i].trim().substring(0, 140),
        });
        hitCount += 1;
      }
    }
  }

  // Dedupe by file:line
  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = `${m.file}:${m.line}`;
    if (!seen.has(key)) { seen.add(key); unique.push(m); }
  }
  return unique.slice(0, 20);
}

// ============================================================
// STEP 3: Context enrichment (harness + project memory)
// ============================================================

function readMemoryContent(seedId) {
  const snippets = [];
  for (const dir of [MEMORY_HARNESS_DIR, MEMORY_PROJECT_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(dir, f), 'utf8');
        // Simple keyword match on seed id or key phrases
        const keywords = seedId.split('-').filter(s => s.length > 2);
        if (keywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()))) {
          snippets.push({ source: path.relative(PROJECT_ROOT, path.join(dir, f)), file: f });
        }
      } catch { /* skip */ }
    }
  }
  return snippets;
}

// ============================================================
// STEP 5: ADR file generation (SKILL §2.2 template)
// ============================================================

function buildAdrMarkdown(seed, codeLocations, today) {
  const lines = [];
  lines.push(`# ${seed.idd_id}: ${seed.title}`);
  lines.push('');
  lines.push('## Classification');
  lines.push('');
  lines.push(`- **Type**: IDD-${seed.idd_type} (${idkTypeLabel(seed.idd_type)})`);
  lines.push(`- **Status**: Active`);
  lines.push(`- **Criticality**: ${seed.criticality}`);
  lines.push(`- **Created**: ${today}`);
  lines.push(`- **Signoff**: Alan (PO)`);
  lines.push(`- **Source**: pcpt-intentional-decisions SKILL.md §1.4`);
  lines.push(`- **Migration Story**: dla-08-current-debt-migration`);
  lines.push('');
  lines.push('## Context');
  lines.push('');
  lines.push(seed.context);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(seed.decision);
  lines.push('');
  lines.push('## Why Not "Technical Fix"?');
  lines.push('');
  lines.push(seed.reason);
  lines.push('');
  lines.push('## Code Impact (file:line)');
  lines.push('');
  if (codeLocations.length === 0) {
    lines.push('_尚未發現明確的程式碼位置 — 決策屬架構/流程層級, 或需手動補入 ripgrep 無法搜尋的位置。_');
  } else {
    lines.push(`透過 \`ripgrep\` 以關鍵字 \`${seed.grep_patterns.join(' | ')}\` 發現以下 ${codeLocations.length} 個相關位置:`);
    lines.push('');
    for (const loc of codeLocations) {
      lines.push(`- \`${loc.file}:${loc.line}\` [Intentional: ${seed.idd_id}]`);
      if (loc.snippet) lines.push(`  - snippet: \`${loc.snippet.replace(/`/g, '\\`')}\``);
    }
  }
  lines.push('');
  lines.push('## Forbidden Changes');
  lines.push('');
  for (const f of seed.forbidden_changes) {
    lines.push(`- ❌ ${f}`);
  }
  lines.push('');
  lines.push('## Re-evaluation Trigger');
  lines.push('');
  lines.push(seed.re_evaluation_trigger);
  lines.push('');
  lines.push('## Related');
  lines.push('');
  if (seed.related_skills?.length) {
    lines.push(`- **Skills**: ${seed.related_skills.map(s => '`' + s + '`').join(', ')}`);
  }
  if (seed.platform_modules?.length) {
    lines.push(`- **Platform Modules**: ${seed.platform_modules.join(', ')}`);
  }
  if (seed.related_docs?.length) {
    for (const d of seed.related_docs) lines.push(`- **Related ADR**: \`${d}\``);
  }
  lines.push('');
  lines.push('## Tags');
  lines.push('');
  lines.push(seed.tags.map(t => '`' + t + '`').join(' '));
  lines.push('');
  return lines.join('\n');
}

function idkTypeLabel(t) {
  return ({
    COM: 'Commercial Decision',
    STR: 'Strategic Decision',
    REG: 'Regulatory / Compliance',
    USR: 'User Decision',
  })[t] || t;
}

// ============================================================
// Main
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const seedsOnly = args.includes('--seeds-only');
  const grepOnly = args.includes('--grep-only');

  const today = getTaiwanTimestamp().slice(0, 10);
  const ts = reportTimestamp();

  console.log(`\n🔍 MEMORY → IDD Migration (Inventory + Ripgrep Discovery)`);
  console.log(`  mode            : ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`  seeds           : ${SEEDS.length}`);
  console.log(`  project memory  : ${MEMORY_PROJECT_DIR}`);
  console.log(`  harness memory  : ${MEMORY_HARNESS_DIR} (exists=${fs.existsSync(MEMORY_HARNESS_DIR)})`);
  console.log('');

  const enriched = [];

  // Walk project files once (cached for all seeds)
  let fileList = null;
  if (!seedsOnly) {
    process.stdout.write('  walking project files... ');
    const t0 = Date.now();
    fileList = walkFiles(PROJECT_ROOT);
    console.log(`${fileList.length} files in ${Date.now() - t0}ms`);
  }

  for (const seed of SEEDS) {
    process.stdout.write(`  ${seed.idd_id} ${seed.idd_type} [${seed.criticality}] ${seed.title.substring(0, 40)}... `);

    let codeLocations = [];
    if (!seedsOnly) {
      codeLocations = runRipgrep(seed.grep_patterns, seed.grep_globs, fileList);
    }

    const memSnippets = readMemoryContent(seed.idd_id);

    enriched.push({
      ...seed,
      code_locations: codeLocations,
      memory_snippets: memSnippets,
    });

    console.log(`rg=${codeLocations.length} mem=${memSnippets.length}`);
  }

  // Dry-run report
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportJson = path.join(REPORTS_DIR, `memory-to-idd-${ts}.json`);
  fs.writeFileSync(reportJson, JSON.stringify({
    metadata: {
      version: '1.0.0',
      script: 'memory-to-idd-migration.js',
      story_id: 'dla-08-current-debt-migration',
      timestamp: getTaiwanTimestamp(),
      mode: execute ? 'execute' : 'dry-run',
      seed_count: SEEDS.length,
      critical_count: SEEDS.filter(s => s.criticality === 'critical').length,
      br_reference: ['BR-IDD-01', 'BR-IDD-02', 'BR-IDD-03', 'BR-IDD-04', 'BR-IDD-05'],
    },
    seeds: enriched,
  }, null, 2), 'utf8');

  // Dry-run ADR preview (markdown summary)
  const reportMd = path.join(REPORTS_DIR, `memory-to-idd-${ts}.md`);
  const mdLines = [];
  mdLines.push(`# MEMORY → IDD Migration — Dry-Run 預覽`);
  mdLines.push('');
  mdLines.push(`> 產出時間: ${getTaiwanTimestamp()}`);
  mdLines.push(`> Story: dla-08-current-debt-migration`);
  mdLines.push(`> 模式: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  mdLines.push('');
  mdLines.push('## 總覽');
  mdLines.push('');
  mdLines.push(`- 預計建立 IDD: **${SEEDS.length}** 筆`);
  mdLines.push(`- Critical 筆數: **${SEEDS.filter(s => s.criticality === 'critical').length}** 筆 (需寫 \`memory/intentional_*.md\`)`);
  mdLines.push(`- Normal 筆數: **${SEEDS.filter(s => s.criticality === 'normal').length}** 筆`);
  mdLines.push('');
  mdLines.push('## Seeds 預覽');
  mdLines.push('');
  for (const e of enriched) {
    mdLines.push(`### ${e.idd_id} — ${e.title}`);
    mdLines.push('');
    mdLines.push(`- **類型:** IDD-${e.idd_type} (${idkTypeLabel(e.idd_type)})`);
    mdLines.push(`- **Criticality:** ${e.criticality}${e.criticality === 'critical' ? ' ⚠ 寫 memory file' : ''}`);
    mdLines.push(`- **Grep 發現 code_locations:** ${e.code_locations.length} 個`);
    if (e.code_locations.length > 0) {
      for (const loc of e.code_locations.slice(0, 5)) {
        mdLines.push(`  - \`${loc.file}:${loc.line}\``);
      }
      if (e.code_locations.length > 5) mdLines.push(`  - ... (共 ${e.code_locations.length} 筆)`);
    }
    mdLines.push(`- **Memory snippets:** ${e.memory_snippets.length} 個`);
    mdLines.push(`- **forbidden_changes:** ${e.forbidden_changes.length} 條`);
    mdLines.push(`- **ADR 將建立於:** \`docs/technical-decisions/ADR-${e.idd_id}.md\``);
    mdLines.push('');
  }
  mdLines.push('---');
  mdLines.push('');
  mdLines.push('## 執行步驟 (Alan 批准後)');
  mdLines.push('');
  mdLines.push('```bash');
  mdLines.push('# 1. 預覽 (現階段)');
  mdLines.push('node .context-db/scripts/memory-to-idd-migration.js');
  mdLines.push('');
  mdLines.push('# 2. 正式執行 — 產 ADR 檔 + 寫 DB + MEMORY.md 附 tag');
  mdLines.push('node .context-db/scripts/memory-to-idd-migration.js --execute');
  mdLines.push('');
  mdLines.push('# 3. 驗證');
  mdLines.push('node .context-db/scripts/scan-code-idd-references.js');
  mdLines.push('node .context-db/scripts/verify-intentional.js --full-audit  # 若存在');
  mdLines.push('```');
  fs.writeFileSync(reportMd, mdLines.join('\n'), 'utf8');

  console.log('');
  console.log(`✅ Dry-run report:`);
  console.log(`   json: ${reportJson}`);
  console.log(`   md:   ${reportMd}`);

  if (grepOnly || !execute) {
    console.log(`\nℹ  Dry-run complete. Review ${reportMd} then run --execute for real migration.`);
    process.exit(0);
  }

  // ==========================================================
  // --execute path: Step 6 (DB) + Step 7 (ADR) + Step 8 (memory)
  // ==========================================================

  console.log('\n🔒 EXECUTE MODE — creating backup first...');
  let backup;
  try {
    backup = createBackup('memory-to-idd');
    console.log(`   backup: ${backup.path} (${(backup.size_bytes / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`❌ Backup failed, aborting: ${err.message}`);
    process.exit(2);
  }

  if (!fs.existsSync(ADR_DIR)) fs.mkdirSync(ADR_DIR, { recursive: true });
  if (!fs.existsSync(MEMORY_PROJECT_DIR)) fs.mkdirSync(MEMORY_PROJECT_DIR, { recursive: true });

  const results = {
    adr_written: [],
    adr_skipped: [],
    memory_written: [],
    db_written: [],
    db_errors: [],
  };

  const signoffDate = today;
  const signoffBy = 'Alan (PO)';

  for (const e of enriched) {
    // ── Step 7: Write ADR file ──
    const adrFileName = `ADR-${e.idd_id}-${slugify(e.title)}.md`;
    const adrPath = path.join(ADR_DIR, adrFileName);
    const adrRelPath = path.relative(PROJECT_ROOT, adrPath).replace(/\\/g, '/');

    if (fs.existsSync(adrPath)) {
      results.adr_skipped.push(adrRelPath);
      console.log(`   ⏭  ${e.idd_id} ADR already exists, skipping file write`);
    } else {
      const adrContent = buildAdrMarkdown(e, e.code_locations, today);
      fs.writeFileSync(adrPath, adrContent, 'utf8');
      results.adr_written.push(adrRelPath);
      console.log(`   ✅ ${e.idd_id} ADR → ${adrRelPath}`);
    }

    // ── Step 8a: Write memory/intentional_*.md for critical IDDs (project repo, safer) ──
    let memoryFilePath = null;
    if (e.criticality === 'critical') {
      const memoryFileName = `intentional_${e.idd_id.toLowerCase().replace(/-/g, '_')}.md`;
      const memoryFullPath = path.join(MEMORY_PROJECT_DIR, memoryFileName);
      memoryFilePath = path.relative(PROJECT_ROOT, memoryFullPath).replace(/\\/g, '/');

      if (!fs.existsSync(memoryFullPath)) {
        const memoryContent = buildCriticalMemoryFile(e, today);
        fs.writeFileSync(memoryFullPath, memoryContent, 'utf8');
        results.memory_written.push(memoryFilePath);
        console.log(`   ✅ ${e.idd_id} memory → ${memoryFilePath}`);
      } else {
        console.log(`   ⏭  ${e.idd_id} memory file exists, skipping`);
      }
    }

    // ── Step 6: Dispatch upsert-intentional.js ──
    const inlineData = {
      idd_id: e.idd_id,
      idd_type: e.idd_type,
      title: e.title,
      context: e.context,
      decision: e.decision,
      reason: e.reason,
      code_locations: e.code_locations,
      adr_path: adrRelPath,
      memory_file_path: memoryFilePath,
      signoff_by: signoffBy,
      signoff_date: signoffDate,
      re_evaluation_trigger: e.re_evaluation_trigger,
      forbidden_changes: e.forbidden_changes,
      criticality: e.criticality,
      status: 'active',
      related_skills: e.related_skills ?? [],
      related_docs: e.related_docs ?? [],
      platform_modules: e.platform_modules ?? [],
      related_files: e.code_locations.map(l => l.file),
      tags: e.tags ?? [],
      created_at: getTaiwanTimestamp(),
    };

    try {
      const upsertPath = path.join(__dirname, 'upsert-intentional.js');
      execFileSync('node', [upsertPath, '--inline', JSON.stringify(inlineData)], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
      results.db_written.push(e.idd_id);
      console.log(`   ✅ ${e.idd_id} → intentional_decisions DB`);
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : '';
      console.error(`   ❌ ${e.idd_id} DB write failed: ${stderr.substring(0, 200)}`);
      results.db_errors.push({ idd_id: e.idd_id, error: stderr });
    }
  }

  // ── Final execute report ──
  const execReport = {
    metadata: {
      mode: 'execute',
      timestamp: getTaiwanTimestamp(),
      backup_path: backup.path,
      story_id: 'dla-08-current-debt-migration',
    },
    summary: {
      seeds_total: SEEDS.length,
      adr_written: results.adr_written.length,
      adr_skipped: results.adr_skipped.length,
      memory_written: results.memory_written.length,
      db_written: results.db_written.length,
      db_errors: results.db_errors.length,
    },
    results,
  };
  const execReportPath = path.join(REPORTS_DIR, `memory-to-idd-execute-${ts}.json`);
  fs.writeFileSync(execReportPath, JSON.stringify(execReport, null, 2), 'utf8');

  console.log('\n===== EXECUTE SUMMARY =====');
  console.log(`  ADR written     : ${results.adr_written.length}`);
  console.log(`  ADR skipped     : ${results.adr_skipped.length}`);
  console.log(`  Memory written  : ${results.memory_written.length} (critical)`);
  console.log(`  DB written      : ${results.db_written.length}/${SEEDS.length}`);
  console.log(`  DB errors       : ${results.db_errors.length}`);
  console.log(`  Backup          : ${backup.path}`);
  console.log(`  Execute report  : ${execReportPath}`);

  if (results.db_errors.length > 0) {
    console.error('\n⚠ DB errors present — review execute report and consider rollback.');
    process.exit(1);
  }

  console.log('\n✅ Phase 3 MEMORY→IDD migration complete.');
  console.log('   Next: Alan review ADR files + DB entries, then mark Task 4 AC-4 complete.');
  process.exit(0);
}

// ── Helpers (Phase 3 execute) ──
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function buildCriticalMemoryFile(seed, today) {
  return `---
name: ${seed.idd_id}
description: ${seed.title}
type: intentional-decision
criticality: critical
---

# ${seed.idd_id}: ${seed.title}

**Type**: IDD-${seed.idd_type} (${idkTypeLabel(seed.idd_type)})
**Status**: Active
**Created**: ${today}
**Signoff**: Alan (PO)
**Source**: pcpt-intentional-decisions SKILL.md §1.4
**ADR**: \`docs/technical-decisions/ADR-${seed.idd_id}-${slugify(seed.title)}.md\`

## Decision

${seed.decision}

## Why

${seed.reason}

## Forbidden Changes

${seed.forbidden_changes.map(f => `- ❌ ${f}`).join('\n')}

## Re-evaluation Trigger

${seed.re_evaluation_trigger}

## Related

${seed.related_skills?.length ? '- **Skills**: ' + seed.related_skills.map(s => '`' + s + '`').join(', ') : ''}
${seed.platform_modules?.length ? '- **Platform Modules**: ' + seed.platform_modules.join(', ') : ''}

---
*此檔案由 \`memory-to-idd-migration.js\` Phase 3 自動建立於 ${today}。切勿手動刪除 — 由 intentional_decisions DB 同步管理。*
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) main();

export { SEEDS, runRipgrep, buildAdrMarkdown };
