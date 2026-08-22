#!/usr/bin/env node
/**
 * crlf-normalize-guard.js — PreToolUse hook (matcher: Edit|Write)
 *
 * PhyCool CRLF + BOM Normalize Discipline 機械守護 (advisory):
 * 偵測 Edit/Write 工具寫入批次腳本 (.cjs/.js/.mjs/.ts/.ps1/.sh) 時,
 * content 是否包含 line-splitting pattern 但缺乏 CRLF/BOM normalize,
 * 注入 additionalContext 提示工程師加入 normalize 步驟。
 *
 * 對齊:
 *   - .claude/rules/crlf-normalize-discipline.md v1.0.0
 *   - .claude/rules/encoding-discipline.md (.ps1/.cs/.razor 必 BOM,與本 hook 互補)
 *
 * 觸發背景:
 *   - 2026-05-16 P2-Wave-2/3: scripts/temp/wave-2-3-cores.cjs 未 normalize CRLF
 *     → 14 SKILLs frontmatter 被誤判為空 → 完整 frontmatter 全部遺失
 *   - 2026-05-16 P3: 3 SKILLs (admin-module/rbac/auth-identity) BOM 干擾 audit + SKILL loader
 *
 * 行為設計:
 *   - Advisory only (exit 0)
 *   - 偵測 Node/PowerShell/Bash 線索
 *   - 不阻擋工作流
 *
 * 2026-05-16 deployed for PhyCool env-optimization P3-C.
 */

const path = require('path');

const SCRIPT_PATTERN = /\.(cjs|js|mjs|ts|ps1|sh|psm1)$/i;
const TARGET_DIRS = [
  /scripts[\\\/]/,
  /\.claude[\\\/]hooks[\\\/]/,
  /\.claude[\\\/]skills[\\\/].+[\\\/]scripts[\\\/]/,
  /\.context-db[\\\/]scripts[\\\/]/,
];

function isTargetFile(filePath) {
  if (!SCRIPT_PATTERN.test(filePath)) return false;
  return TARGET_DIRS.some(re => re.test(filePath));
}

function detectIssues(content, filePath) {
  if (!content || typeof content !== 'string') return [];
  const issues = [];

  if (/\.(cjs|js|mjs|ts)$/i.test(filePath)) {
    const hasReadFileSync = /readFileSync\s*\(/.test(content);
    const hasSplitNewline = /\.split\s*\(\s*['"`]\\n['"`]/.test(content);
    const hasCrlfNormalize = /\.replace\s*\(\s*\/\\r\\n\/g/.test(content);
    const hasBomStrip = /\.replace\s*\(\s*\/\^\\uFEFF\//.test(content) ||
                        /buf\[0\]\s*===\s*0xEF/.test(content);
    const hasStrictEquals = /lines\[0\]\s*===\s*['"`]---['"`]/.test(content);

    if (hasReadFileSync && hasSplitNewline && !hasCrlfNormalize) {
      issues.push('Node.js readFileSync + split(\'\\n\') 但缺 .replace(/\\r\\n/g, \'\\n\') CRLF normalize');
    }
    if (hasStrictEquals && !hasBomStrip) {
      issues.push('Node.js strict equality (lines[0] === \'---\') 但缺 BOM strip (.replace(/^\\uFEFF/, \'\'))');
    }
  }

  if (/\.(ps1|psm1)$/i.test(filePath)) {
    const hasGetContent = /Get-Content/.test(content);
    const hasCrlfReplace = /Replace\s*\(\s*["'`]`r`n["'`]/.test(content) ||
                           /-replace\s+["'`]\\r\\n["'`]/.test(content);
    const hasStrictEquals = /-eq\s+["'`]---["'`]/.test(content);

    if (hasGetContent && hasStrictEquals && !hasCrlfReplace) {
      issues.push('PowerShell Get-Content + strict equality (-eq "---") 但缺 .Replace("`r`n", "`n") CRLF normalize');
    }
  }

  if (/\.sh$/i.test(filePath)) {
    const hasReadLoop = /while\s+IFS=.*read/.test(content) || /\$\(cat\s/.test(content);
    const hasCrlfStrip = /tr\s+-d\s+['"`]\\r['"`]/.test(content) || /sed.*s\/\\r\$\/\//.test(content);

    if (hasReadLoop && !hasCrlfStrip) {
      issues.push('Bash 讀檔 loop 但缺 tr -d \'\\r\' 或 sed s/\\r$// CRLF strip');
    }
  }

  return issues;
}

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
  if (!isTargetFile(filePath)) process.exit(0);

  const content = data.tool_input?.content || data.tool_input?.new_string || '';
  if (!content) process.exit(0);

  const issues = detectIssues(content, filePath);
  if (issues.length === 0) process.exit(0);

  const issueList = issues.map(i => `  - ${i}`).join('\n');
  const note = `The file ${filePath} appears to be a batch script processing other files. Detected potential CRLF/BOM normalize gap(s):\n${issueList}\n` +
    `Per .claude/rules/crlf-normalize-discipline.md, batch scripts processing files MUST normalize line endings + BOM before strict equality. ` +
    `Node.js: \`const content = fs.readFileSync(p, 'utf8').replace(/^\\uFEFF/, '').replace(/\\r\\n/g, '\\n');\`. ` +
    `PowerShell: \`(Get-Content $p -Raw).Replace("\\\`r\\\`n", "\\\`n").TrimStart([char]0xFEFF)\`. ` +
    `Reference incidents: 2026-05-16 P2-Wave-2/3 (14 SKILLs frontmatter loss via CRLF) + P3 (3 SKILLs BOM false positive). [Advisory non-blocking]`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[crlf-normalize-guard] ${err.message}\n`);
  process.exit(0);
});
