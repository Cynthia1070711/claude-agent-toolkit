#!/usr/bin/env node
/**
 * PreToolUse Hook: Config Protection
 * Story: ecc-02-config-protection-hook
 *
 * 攔截 Edit/Write 操作，保護關鍵配置檔不被 Agent 意外修改。
 *
 * 保護策略：
 *   - PROTECTED_PREFIXES: 路徑前綴匹配（settings.json, pipeline scripts）
 *   - PROTECTED_BASENAMES: basename 精確匹配（appsettings.json）
 *   - PROTECTED_PATTERNS: basename regex 匹配（eslint.config.*, .prettierrc*, *.csproj）
 *
 * 排除路徑：node_modules / bin / obj（避免誤攔第三方套件）
 *
 * Override: 環境變數 PCPT_CONFIG_OVERRIDE=1 可暫時允許修改
 *
 * Exit codes: 0 = 允許, 2 = 阻擋
 * 所有 catch block 均 exit 0（非阻擋，保持 fail-open）
 *
 * 歷史事故: 2026-03-30 Pipeline 9 bugs — settings.json + pipeline script 被意外修改
 */
'use strict';

const path = require('path');

const MAX_STDIN = 512 * 1024; // 512KB

/**
 * 路徑前綴保護（normalize to forward slash，不分大小寫）
 * 格式：相對於 project root 的前綴字串
 */
const PROTECTED_PREFIXES = [
  '.claude/settings.json',
  'scripts/story-pipeline'
];

/**
 * Basename 精確保護（大小寫敏感）
 */
const PROTECTED_BASENAMES = new Set([
  'appsettings.json'
]);

/**
 * Basename regex 保護（eslint.config.*, .prettierrc*, *.csproj）
 */
const PROTECTED_PATTERNS = [
  /^eslint\.config\./,
  /^\.prettierrc/,
  /\.csproj$/
];

/**
 * 排除路徑 regex：含 node_modules / /bin/ / /obj/ 的路徑一律排除
 */
const EXCLUDED_PATH_RE = /node_modules|[/\\]bin[/\\]|[/\\]obj[/\\]/;

/**
 * 正規化路徑為 forward-slash 並轉小寫（用於前綴比對）
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * 判斷是否為受保護的配置檔
 * @param {string} filePath - tool_input.file_path
 * @returns {{ protected: boolean, reason: string }}
 */
function checkProtected(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { protected: false, reason: '' };
  }

  const normalized = normalizePath(filePath);
  const basename = path.basename(filePath);

  // 排除路徑（node_modules / bin / obj）
  if (EXCLUDED_PATH_RE.test(normalized)) {
    return { protected: false, reason: '' };
  }

  // 路徑前綴匹配（大小寫不敏感）
  const normalizedLower = normalized.toLowerCase();
  for (const prefix of PROTECTED_PREFIXES) {
    if (normalizedLower.includes(prefix.toLowerCase())) {
      return { protected: true, reason: `prefix match: ${prefix}` };
    }
  }

  // Basename 精確匹配
  if (PROTECTED_BASENAMES.has(basename)) {
    return { protected: true, reason: `basename match: ${basename}` };
  }

  // Basename regex 匹配
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(basename)) {
      return { protected: true, reason: `pattern match: ${pattern.source}` };
    }
  }

  return { protected: false, reason: '' };
}

/**
 * Core logic — exported for testing
 * @param {string} rawInput - stdin JSON string
 * @param {object} env - process.env（injectable for testing）
 * @returns {{ output: string, exitCode: number }}
 */
function evaluate(rawInput, env) {
  env = env || process.env;

  try {
    if (!rawInput || rawInput.trim() === '') {
      return { output: rawInput || '', exitCode: 0 };
    }

    let input;
    try {
      input = JSON.parse(rawInput);
    } catch {
      // 非 JSON → exit 0（非阻擋）
      return { output: rawInput, exitCode: 0 };
    }

    const filePath = input.tool_input?.file_path;

    // 無 file_path 欄位（如 Bash 命令）→ pass-through
    if (!filePath) {
      return { output: rawInput, exitCode: 0 };
    }

    const check = checkProtected(filePath);

    if (!check.protected) {
      return { output: rawInput, exitCode: 0 };
    }

    // Override 機制：PCPT_CONFIG_OVERRIDE=1 允許修改
    if (env.PCPT_CONFIG_OVERRIDE === '1') {
      process.stderr.write(
        `[config-protection] OVERRIDE: Allowing modification of protected file: ${filePath}\n`
      );
      return { output: rawInput, exitCode: 0 };
    }

    // 阻擋操作
    const filename = path.basename(filePath);
    process.stderr.write(
      `[config-protection] BLOCKED: Modifying ${filename} is not allowed.\n` +
      `  File: ${filePath}\n` +
      `  Reason: ${check.reason}\n` +
      `  To override: set PCPT_CONFIG_OVERRIDE=1 (temporary, session-only)\n`
    );
    return { output: rawInput, exitCode: 2 };
  } catch {
    // Non-blocking on any error
    return { output: rawInput || '', exitCode: 0 };
  }
}

// ── stdin entry point ──────────────────────────────────────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    const result = evaluate(data);
    process.stdout.write(result.output);
    process.exit(result.exitCode);
  });
}

module.exports = { evaluate, checkProtected, normalizePath };
