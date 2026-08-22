#!/usr/bin/env node
/**
 * api-runtime-verification-guard.js -- PostToolUse hook (matcher: Edit|Write)
 *
 * BMAD 盲點防治配套 (advisory only, no block).
 *
 * 偵測 backend auth/policy/cookie/route 機制改動 (.cs),注入 additionalContext
 * 陳述句提醒 CR 階段需 runtime integration test (CustomWebApplicationFactory
 * 實打 HTTP 斷言 status),而非只 reflection 驗 attribute 字串。
 *
 * 兜底 Bug #23478: paths rule (.claude/rules/testing.md 的 Runtime Behavior
 * Verification 節) 在 Write 工具不載入,本 hook 於 PostToolUse 補提醒。
 *
 * Background: 2026-06-13 admin client API 全壞 3 個月 (cookie path /mgmt 不
 * cover /api/v1/mgmt = 401 + AdminPermission_None policy 回 null = 500);
 * DashboardControllerRbacTests 只 reflection 驗 attr.Policy 通過,runtime
 * 從未實打 endpoint,所以漏網。
 *
 * Behavior: advisory only -- never blocks, never throws. fail-open.
 *
 * Registration in settings.json:
 *   "PostToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/api-runtime-verification-guard.js",
 *       "timeout": 3000
 *     }]
 *   }]
 */

// 路徑訊號: backend auth/policy/cookie 基礎建設檔
const PATH_HINTS = [
  'Areas/Admin/Controllers/',
  '/Authorization/',
  'Filters/AdminPermission',
  'BackOfficeServiceExtensions',
  'AdminRouteConstants',
];

// 內容訊號: auth/policy/cookie 機制改動關鍵字 (高訊號,刻意排除裸 [Authorize( 避免噪音)
const CONTENT_HINTS = [
  'IAuthorizationPolicyProvider',
  'AddPolicy(',
  'CookieOptions',
  'AddAuthentication',
  'AddJwtBearer',
  'CookiePath',
  '[AdminPermission(',
];

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch {
    // Malformed input -- silent pass
    process.exit(0);
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  // 限 .cs production 檔,排除測試檔 (測試檔本身是寫測試處,提醒無意義)
  if (!filePath.endsWith('.cs')) process.exit(0);
  if (/\/tests?\//i.test(filePath) || /\.tests?\./i.test(filePath) || filePath.includes('.Tests')) {
    process.exit(0);
  }

  const content = data.tool_input?.content || data.tool_input?.new_string || '';
  const pathHit = PATH_HINTS.some(h => filePath.includes(h));
  const contentHit = CONTENT_HINTS.some(k => content.includes(k));
  if (!pathHit && !contentHit) process.exit(0);

  // 陳述句 (非命令句,避免觸發 prompt-injection 防禦被 surface 給使用者)
  const note = `檔案 ${filePath} 涉及 authorization / policy / cookie / route 機制改動。` +
    `依 .claude/rules/testing.md 的 Runtime Behavior Verification 節,此類設定的正確性只在 runtime 顯現` +
    `(policy 能否解析、cookie 是否送達、HTTP status code),reflection 驗 attribute 字串(如 attr.Policy == "X")只測宣告非行為。` +
    `CR 階段的 runtime 驗證規範見 _bmad/bmm/workflows/4-implementation/code-review/steps/step-06-report-archive.md Gate 8 API 腿與 step-05b API/Auth 行為驗證獨立性段: ` +
    `需 runtime integration test(CustomWebApplicationFactory + HttpClient 實打 HTTP 斷言 status,範式 JwtOnTokenValidatedIntegrationTests / SubscriptionRouteTests),或 server 在跑時 curl/Chrome MCP 實打 endpoint。` +
    `2026-06-13 admin 後台 client API 全壞 3 個月即此盲點漏網(RC-A cookie path 401 + RC-B AdminPermission_None policy 500)。`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[api-runtime-verification-guard] ${err.message}\n`);
  process.exit(0);
});
