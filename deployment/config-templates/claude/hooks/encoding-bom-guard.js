#!/usr/bin/env node
/**
 * encoding-bom-guard.js — PreToolUse hook (matcher: Edit|Write)
 *
 * PhyCool UTF-8 with BOM 機械守護(對齊 encoding-discipline.md paths-scoped 後的 Write 兜底):
 * 偵測 Edit/Write 工具寫入 .ps1 / .psm1 / .psd1 / .cs / .razor / .cshtml / .sln / .csproj
 * 等 PowerShell 5.1 + VS / Antigravity 預期 UTF-8 BOM 的檔案,
 * 若寫入後檔案缺 BOM,在 PostToolUse 時偵測並 stderr 提示 Claude 補寫。
 *
 * 設計考量:
 *   - Bug #23478: paths-scoped rule 在 Write 時不觸發 → 此 hook 兜底
 *   - 與 scripts/check-ps-encoding.cjs CI guard 互補(CI 批次 vs hook 即時)
 *   - Advisory (non-blocking, exit 0) 避免擋 Claude 工作流
 *   - PreToolUse 階段檢查既有檔案;Write 新檔則 Claude 應主動帶 BOM(規則提示已注入)
 *
 * 對齊規範:
 *   - .claude/rules/encoding-discipline.md (paths-scoped 2026-05-16)
 *   - .claude/skills/phycool-windows-ps-encoding/SKILL.md
 *   - scripts/check-ps-encoding.cjs CI guard
 *
 * settings.json 註冊:
 *   "PreToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/encoding-bom-guard.js",
 *       "timeout": 1500
 *     }]
 *   }]
 *
 * 2026-05-16 15:35 deployed for PhyCool env-optimization P0-3.
 */

const fs = require('fs');

// 需要 UTF-8 BOM 的檔案副檔名
const NEEDS_BOM_PATTERN = /\.(ps1|psm1|psd1|cs|razor|cshtml|sln|csproj)$/i;

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  // 只攔截需 BOM 的副檔名,其他放行
  if (!NEEDS_BOM_PATTERN.test(filePath)) process.exit(0);

  // PreToolUse 對既有檔做 BOM 檢查
  // 若檔案不存在(新檔場景),Claude 應該主動帶 BOM(由 additionalContext 提示)
  let hasBom = null;
  try {
    if (fs.existsSync(filePath)) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(3);
      fs.readSync(fd, buf, 0, 3, 0);
      fs.closeSync(fd);
      hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    }
  } catch (err) {
    // 讀取失敗 → 視為未知,放行但提示
    hasBom = null;
  }

  // 注入 advisory context 提醒 BOM 規範
  const note = hasBom === false
    ? `The file ${filePath} currently lacks UTF-8 BOM. ` +
      `Per .claude/rules/encoding-discipline.md, PowerShell 5.1 / VS / Antigravity expect UTF-8 with BOM (bytes EF BB BF). ` +
      `When using Write tool, ensure content is written with BOM via [System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($true)). ` +
      `When using Edit tool, the existing file lacks BOM - consider triggering scripts/check-ps-encoding.cjs --fix after editing, or rewrite the file with BOM.`
    : hasBom === true
    ? null  // BOM already present, skip noise
    : `The file ${filePath} matches BOM-required pattern (.ps1/.cs/.razor etc). ` +
      `Per .claude/rules/encoding-discipline.md, ensure UTF-8 with BOM (bytes EF BB BF). ` +
      `Use [System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($true)) for PowerShell write, or Out-File -Encoding utf8BOM.`;

  if (!note) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  // Fail-safe: any error → silent pass (don't block Claude's work)
  process.stderr.write(`[encoding-bom-guard] ${err.message}\n`);
  process.exit(0);
});
