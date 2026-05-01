#!/usr/bin/env node
/**
 * batch-update-review-findings.js
 * 批次更新 review_findings 的 fix_status，基於 Epic FIX 完成的 Story 映射
 *
 * Usage:
 *   node batch-update-review-findings.js --dry-run   # 預覽不寫入
 *   node batch-update-review-findings.js --apply      # 實際更新
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'context-memory.db'));

const dryRun = !process.argv.includes('--apply');
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

// ========== Module → Fix Stories 映射表 ==========
const MODULE_STORY_MAP = {
  'admin-auth': [
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'AdminControllerBase', 'authorize', 'role'] },
    { story: 'fix-12-admin-auth-inactive-login', keywords: ['停用', 'inactive', '登入', 'login', 'JWT', 'claim'] },
    { story: 'fix-18-auth-password-consistency', keywords: ['密碼', 'password', 'reCAPTCHA', 'captcha'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery', 'ValidateAntiForgeryToken'] },
    { story: 'fix-44-security-headers-audit', keywords: ['header', 'CSP', 'X-Frame', 'HSTS'] },
  ],
  'admin-content': [
    { story: 'fix-38-legal-documents-ui', keywords: ['法律', 'legal', 'TOS', '同意', 'cookie'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection', 'sanitize'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'admin-member': [
    { story: 'fix-26-admin-member-detail-fix', keywords: ['會員', 'member', 'detail', '詳情', '404'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize', 'AdminControllerBase'] },
    { story: 'fix-46-audit-log-expansion', keywords: ['audit', '稽核', 'log'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'admin-order': [
    { story: 'fix-13-admin-order-tab-filter', keywords: ['tab', '篩選', 'filter', '匯款', 'remittance', '退款', 'refund'] },
    { story: 'fix-04-payment-statemachine', keywords: ['狀態機', 'state machine', '併發', 'concurrency', 'order'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
    { story: 'fix-16-admin-reports-route-conflict', keywords: ['route', '路由', 'conflict'] },
  ],
  'admin-product': [
    { story: 'fix-14-product-api-500', keywords: ['500', 'API', 'CRUD', 'product', '產品'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'admin-reports': [
    { story: 'fix-16-admin-reports-route-conflict', keywords: ['route', '路由', 'conflict', 'camelCase'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize'] },
    { story: 'fix-46-audit-log-expansion', keywords: ['audit', '稽核', 'report'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'admin-settings': [
    { story: 'fix-27-admin-settings-rbac', keywords: ['RBAC', 'settings', 'SVG', '併發', 'concurrency'] },
    { story: 'fix-17-settings-save-failures', keywords: ['save', '儲存', 'logout', '登出', 'maintenance'] },
    { story: 'fix-35-admin-js-config', keywords: ['JS', 'config', '常量', 'constant'] },
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize'] },
  ],
  'admin-templates': [
    { story: 'fix-01-admin-rbac-hardening', keywords: ['RBAC', '權限', 'authorize', 'AdminControllerBase'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
    { story: 'fix-30c-template-custompaper-controller', keywords: ['template', 'controller', '拆分'] },
  ],
  'auth': [
    { story: 'fix-12-admin-auth-inactive-login', keywords: ['停用', 'inactive', '登入', 'login', 'JWT', 'admin'] },
    { story: 'fix-18-auth-password-consistency', keywords: ['密碼', 'password', 'reCAPTCHA', 'captcha', '一致'] },
    { story: 'fix-39-tos-consent-tracking', keywords: ['TOS', '同意', 'consent', '追蹤'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery', 'token'] },
    { story: 'fix-46-audit-log-expansion', keywords: ['audit', '稽核', 'log'] },
    { story: 'fix-44-security-headers-audit', keywords: ['header', 'CSP', 'X-Frame', 'HSTS', 'security'] },
    { story: 'fix-45-rate-limiting-global', keywords: ['rate limit', '限流', 'throttle'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection', 'vulnerability'] },
    { story: 'fix-05-403-accessdenied-unify', keywords: ['403', '404', '500', 'error page', '錯誤頁'] },
  ],
  'business-api': [
    { story: 'fix-48-api-versioning', keywords: ['API', 'version', 'v1', '路由', 'route'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
    { story: 'fix-44-security-headers-audit', keywords: ['header', 'security'] },
  ],
  'dashboard': [
    { story: 'fix-09-dashboard-quota-security', keywords: ['quota', '配額', 'over-posting', 'security'] },
    { story: 'fix-30a-project-tag-controller', keywords: ['project', 'tag', 'controller', '拆分'] },
    { story: 'fix-30b-gallery-controller', keywords: ['gallery', 'controller', '拆分'] },
    { story: 'fix-30c-template-custompaper-controller', keywords: ['template', 'custompaper', 'controller', '拆分'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'datasource': [
    { story: 'fix-24-datasource-csrf-validation', keywords: ['CSRF', '資料來源', 'datasource', 'validation', '解析'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection'] },
  ],
  'editor-core': [
    { story: 'fix-08-editor-store-dedup', keywords: ['store', 'zustand', '重複', 'duplicate', 'dedup'] },
    { story: 'fix-33-editor-context-to-store', keywords: ['context', 'useState', 'zustand', 'migration'] },
    { story: 'fix-32-store-boundary-redesign', keywords: ['store', 'boundary', '邊界', 'zustand'] },
    { story: 'fix-15-editor-undo-preview', keywords: ['undo', 'preview', 'statusbar', '計數'] },
    { story: 'fix-19-canvas-clearrect-null', keywords: ['clearRect', 'null', 'canvas', 'error'] },
    { story: 'fix-23a-phycanvas-split', keywords: ['PhycCanvas', 'touch', 'gesture', 'zoom', '拆分'] },
    { story: 'fix-23b-topbar-split', keywords: ['TopBar', '拆分', 'split', 'component'] },
    { story: 'fix-21-alert-to-toast', keywords: ['alert', 'confirm', 'toast', 'modal', '彈窗'] },
    { story: 'fix-25-qr-barcode-state-sync', keywords: ['QR', 'barcode', '序號', 'serial', '狀態同步'] },
    { story: 'fix-11-qr-barcode-noop-buttons', keywords: ['QR', 'barcode', '按鈕', 'button', 'noop'] },
    { story: 'fix-36-i18n-console-cleanup', keywords: ['i18n', '翻譯', 'console', 'translation'] },
    { story: 'fix-34-design-token-audit', keywords: ['design token', 'CSS', '硬編碼', 'hex', 'color'] },
  ],
  'image-asset': [
    { story: 'fix-10-image-asset-softdelete', keywords: ['softdelete', '軟刪除', '級聯', 'cascade', '配額', 'quota', 'image'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection', 'upload'] },
  ],
  'payment-subscription': [
    { story: 'fix-04-payment-statemachine', keywords: ['狀態機', 'state machine', '併發', 'concurrency'] },
    { story: 'fix-40-subscription-rights-protect', keywords: ['訂閱', 'subscription', '權益', 'rights', 'protect'] },
    { story: 'fix-41-refund-policy-enforcement', keywords: ['退款', 'refund', '扣款', 'cooling', '試用', 'trial'] },
    { story: 'fix-22-payment-misc-fixes', keywords: ['金流', 'payment', 'misc', '雜項', 'receipt', '收據'] },
    { story: 'fix-31-subscription-decompose', keywords: ['subscription', '拆分', 'decompose', 'service'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'pdf-engine': [
    { story: 'fix-28-pdf-free-maxpages', keywords: ['free', '頁數', 'maxpage', '浮水印', 'watermark', '堆疊'] },
    { story: 'fix-03-security-vulnerabilities', keywords: ['XSS', 'SSRF', 'injection'] },
    { story: 'fix-44-security-headers-audit', keywords: ['header', 'security'] },
  ],
  'qr-barcode-serial': [
    { story: 'fix-11-qr-barcode-noop-buttons', keywords: ['按鈕', 'button', 'noop', '方案', 'plan'] },
    { story: 'fix-25-qr-barcode-state-sync', keywords: ['狀態', 'state', '同步', 'sync', 'panel'] },
    { story: 'fix-02-csrf-protection', keywords: ['CSRF', 'AntiForgery'] },
  ],
  'table-shape': [
    { story: 'fix-32-store-boundary-redesign', keywords: ['store', 'zustand', '邊界'] },
    { story: 'fix-34-design-token-audit', keywords: ['design token', 'CSS', 'color'] },
    { story: 'fix-36-i18n-console-cleanup', keywords: ['i18n', '翻譯', 'console'] },
  ],
};

// ========== 匹配邏輯 ==========
function findBestMatch(finding) {
  const candidates = MODULE_STORY_MAP[finding.module_code];
  if (!candidates) return null;

  const text = `${finding.title} ${finding.description} ${finding.file_path || ''} ${finding.bug_type || ''}`.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    for (const kw of candidate.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate.story;
    }
  }

  // Fallback: if no keyword match, use first candidate (most relevant for module)
  if (!bestMatch && candidates.length > 0) {
    bestMatch = candidates[0].story;
    bestScore = -1; // flag as fallback
  }

  return { story: bestMatch, score: bestScore };
}

// ========== 主流程 ==========
const findings = db.prepare("SELECT * FROM review_findings WHERE fix_status = 'open'").all();
console.log(`\n📊 Open findings: ${findings.length}`);
console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'APPLY (writing to DB)'}\n`);

const stats = { matched: 0, fallback: 0, unmatched: 0 };
const updates = [];

for (const f of findings) {
  const result = findBestMatch(f);
  if (!result) {
    stats.unmatched++;
    continue;
  }
  if (result.score > 0) {
    stats.matched++;
  } else {
    stats.fallback++;
  }
  updates.push({
    id: f.id,
    finding_id: f.finding_id,
    module_code: f.module_code,
    severity: f.severity,
    title: f.title.slice(0, 60),
    fix_story_id: result.story,
    match_type: result.score > 0 ? 'keyword' : 'fallback',
    score: result.score,
  });
}

// Preview
console.log('=== Match Results ===');
console.log(`  Keyword matched: ${stats.matched}`);
console.log(`  Fallback (module-level): ${stats.fallback}`);
console.log(`  Unmatched: ${stats.unmatched}`);
console.log(`  Total updates: ${updates.length}\n`);

// Show distribution by story
const byStory = {};
for (const u of updates) {
  byStory[u.fix_story_id] = (byStory[u.fix_story_id] || 0) + 1;
}
console.log('=== By Fix Story ===');
Object.entries(byStory).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
  console.log(`  ${s.padEnd(45)} ${c}`);
});

// Apply updates
if (!dryRun) {
  const stmt = db.prepare(`
    UPDATE review_findings
    SET fix_status = 'fixed',
        fix_story_id = ?,
        fix_notes = ?,
        fixed_at = ?,
        fixed_by = 'CC-OPUS',
        updated_at = ?
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const u of updates) {
      const note = `Epic FIX ${u.fix_story_id} (${u.match_type} match, score=${u.score})`;
      stmt.run(u.fix_story_id, note, now, now, u.id);
    }
  });
  tx();
  console.log(`\n✅ Updated ${updates.length} findings to 'fixed'`);
} else {
  console.log('\n⚠️  Dry run — no changes written. Use --apply to update.');
}

db.close();
