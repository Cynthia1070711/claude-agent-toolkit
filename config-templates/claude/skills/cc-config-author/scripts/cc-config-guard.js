#!/usr/bin/env node
/**
 * cc-config-guard.js — PostToolUse hook
 *
 * 當 Claude 寫入或編輯任何 .claude/ 配置檔時,自動注入 additionalContext
 * 提醒 Claude 載入 cc-config-author skill 確認規範。
 *
 * 配套規避 Bug #23478:paths-scoped rules 在 Write 時不觸發。此 hook
 * 走 PostToolUse 兜底,確保任何配置變更都會觸發稽核提醒。
 *
 * 註冊方式(.claude/settings.json):
 *   "PostToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/cc-config-guard.js\"",
 *       "timeout": 3000
 *     }]
 *   }]
 *
 * 注意:additionalContext 寫陳述句而非命令句,避免被 prompt-injection 防禦
 * 機制 surface 給使用者。
 */

const path = require('path');

// 觸發路徑模式 — 命中任一即注入提醒
const TRIGGER_PATTERNS = [
  /\.claude[\\\/]rules[\\\/].+\.md$/,
  /\.claude[\\\/]skills[\\\/].+[\\\/]SKILL\.md$/,
  /\.claude[\\\/]commands[\\\/].+\.md$/,
  /\.claude[\\\/]agents[\\\/].+\.md$/,
  /\.claude[\\\/]settings(\.local)?\.json$/,
  /^CLAUDE\.md$/,
  /^CLAUDE\.local\.md$/,
  /[\\\/]CLAUDE\.md$/,           // subdirectory CLAUDE.md
  /[\\\/]CLAUDE\.local\.md$/,
  /^\.mcp\.json$/,
  /[\\\/]\.mcp\.json$/,
];

function getContextNote(filePath) {
  // 依檔案類型給針對性的提醒(陳述句格式)
  if (/[\\\/]rules[\\\/].+\.md$/.test(filePath)) {
    return `The file ${filePath} is a .claude/rules entry. ` +
      `Per the 2026 Apr Claude Code spec, rule files without paths frontmatter are always-on context. ` +
      `cc-config-author skill provides the rules-directory-spec reference for paths syntax, ` +
      `Bug #23478 (paths not triggered on Write), and token budget guidance (60 lines soft / 100 hard for always-on).`;
  }

  if (/[\\\/]SKILL\.md$/.test(filePath)) {
    return `The file ${filePath} is a SKILL.md. ` +
      `Per the 2026 Apr spec: name field must be kebab-case ≤64 chars and not a reserved word (claude, anthropic, system). ` +
      `description must be ≤1024 chars in third-person with explicit trigger phrases. SKILL.md body should stay under 500 lines via progressive disclosure. ` +
      `cc-config-author skill provides the skills-frontmatter-spec reference covering all 15 frontmatter fields.`;
  }

  if (/[\\\/]commands[\\\/].+\.md$/.test(filePath)) {
    return `The file ${filePath} is a slash command. ` +
      `Per the 2026 Apr spec: description in frontmatter shows in /help. ` +
      `Available substitutions: $ARGUMENTS for full string, $1/$2 for positional args, !\`cmd\` for inline bash, @path for file inclusion. ` +
      `cc-config-author skill provides the commands-spec reference.`;
  }

  if (/[\\\/]agents[\\\/].+\.md$/.test(filePath)) {
    return `The file ${filePath} is a subagent definition. ` +
      `Per the 2026 Apr spec: required fields are name and description. Subagents do NOT inherit parent skills — declare needed skills in the skills: frontmatter. ` +
      `Optional fields: tools, model, effort, permissionMode, isolation, maxTurns. ` +
      `cc-config-author skill provides the subagents-spec reference.`;
  }

  if (/settings(\.local)?\.json$/.test(filePath)) {
    return `The file ${filePath} is the Claude Code settings file. ` +
      `Hook changes do NOT hot-apply — session must be restarted (/clear or relaunch CLI). ` +
      `Opus 4.7 deprecated MAX_THINKING_TOKENS (use /effort xhigh instead). ` +
      `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: scale to the model's context window — on 1M-context models (Opus 4.8 / Sonnet 5 / Fable 5) keep it high (95 = CLI native default) so the large window is actually used and lossy compactions stay rare; lower it only for small-window models where lost-in-the-middle bites sooner. ` +
      `cc-config-author skill provides the settings-json-spec reference.`;
  }

  if (/CLAUDE(\.local)?\.md$/.test(filePath)) {
    return `The file ${filePath} is a Claude memory file loaded into every session. ` +
      `Per the 2026 Apr spec: keep under 120 lines soft / 200 hard. Beyond 200 lines, instruction adherence measurably drops. ` +
      `Move detailed content to docs/ and reference with @docs/foo.md. Move conditional content to .claude/rules/ with paths frontmatter or .claude/skills/. ` +
      `cc-config-author skill provides the claude-md-spec reference.`;
  }

  if (/\.mcp\.json$/.test(filePath)) {
    return `The file ${filePath} is the MCP server configuration. ` +
      `MCP server changes require session restart. Per 2026 Apr spec, OAuth-compliant MCP servers (RFC 9728) auto-handle auth — no apiKeyHelper needed. ` +
      `cc-config-author skill covers MCP configuration patterns.`;
  }

  return `The file ${filePath} is a Claude Code configuration file. ` +
    `cc-config-author skill provides the relevant spec references and known-bugs warnings.`;
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

  const matches = TRIGGER_PATTERNS.some(re => re.test(filePath));
  if (!matches) process.exit(0);

  const note = getContextNote(filePath);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[cc-config-guard] ${err.message}\n`);
  process.exit(0);
});